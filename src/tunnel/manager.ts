/**
 * Cloudflare Tunnel Manager
 * 
 * Manages the cloudflared process for creating quick and named tunnels.
 * Handles starting, stopping, and monitoring the tunnel.
 * 
 * The tunnel process runs independently (detached) so it survives config server restarts.
 * PID is stored in logs/tunnel.pid for management across restarts.
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PROXY_PORT, startProxyServer } from './proxy';
import {
    loadTunnelConfig,
    saveTunnelConfig,
    deleteTunnelConfig,
    loadCredentials,
    TunnelConfigData,
    CloudflareCredentials,
} from './config';

const execAsync = promisify(exec);

// PID file for tracking cloudflared process across restarts
const TUNNEL_PID_FILE = path.join(process.cwd(), 'logs', 'tunnel.pid');
const PROXY_PID_FILE = path.join(process.cwd(), 'logs', 'tunnel-proxy.pid');

// State (may be reconnected to existing process)
let cloudflaredProcess: ChildProcess | null = null;
let cloudflaredPid: number | null = null;
let proxyServer: { server: ReturnType<ReturnType<typeof import('express')>['listen']>; port: number } | null = null;
let currentTunnelUrl: string | null = null;

// ============ PID FILE HELPERS ============

async function writePidFile(filePath: string, pid: number): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(pid), 'utf-8');
}

async function readPidFile(filePath: string): Promise<number | null> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const pid = parseInt(content.trim(), 10);
        return isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

async function removePidFile(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch {
        // ignore
    }
}

async function isProcessRunning(pid: number): Promise<boolean> {
    try {
        process.kill(pid, 0); // Signal 0 tests if process exists
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if an existing tunnel process is running (from previous server instance)
 */
async function checkExistingTunnelProcess(): Promise<boolean> {
    const pid = await readPidFile(TUNNEL_PID_FILE);
    if (pid && await isProcessRunning(pid)) {
        cloudflaredPid = pid;
        // Try to get the URL from config
        const config = await loadTunnelConfig();
        if (config?.hostname) {
            currentTunnelUrl = `https://${config.hostname}`;
        }
        return true;
    }
    await removePidFile(TUNNEL_PID_FILE);
    return false;
}

export interface TunnelStatus {
    cloudflaredInstalled: boolean;
    credentialsConfigured: boolean;
    tunnelConfigured: boolean;
    tunnelRunning: boolean;
    proxyRunning: boolean;
    tunnelUrl: string | null;
    tunnelConfig: TunnelConfigData | null;
    proxyPort: number;
}

/**
 * Check if cloudflared is installed
 */
export async function checkCloudflared(): Promise<boolean> {
    try {
        await execAsync('which cloudflared');
        return true;
    } catch {
        return false;
    }
}

/**
 * Install cloudflared (macOS via Homebrew, Linux via apt or direct download)
 */
export async function installCloudflared(): Promise<{ success: boolean; message: string; output?: string }> {
    const platform = process.platform;

    try {
        let installCmd: string;

        if (platform === 'darwin') {
            installCmd = 'brew install cloudflared';
        } else if (platform === 'linux') {
            // Try apt first, fall back to direct download
            installCmd = `
                if command -v apt-get &> /dev/null; then
                    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb && sudo dpkg -i /tmp/cloudflared.deb
                else
                    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
                fi
            `;
        } else {
            return {
                success: false,
                message: 'Automatic installation not supported on this platform. Please install cloudflared manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/',
            };
        }

        const { stdout, stderr } = await execAsync(installCmd, {
            timeout: 300000,
            maxBuffer: 10 * 1024 * 1024,
        });

        return {
            success: true,
            message: 'Cloudflared installed successfully!',
            output: stdout + (stderr ? '\n' + stderr : ''),
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
            output: e.stdout || e.stderr || e.message,
        };
    }
}

/**
 * Check if tunnel is running (process ref or PID file)
 */
async function isTunnelRunning(): Promise<boolean> {
    // Check process reference
    if (cloudflaredProcess && !cloudflaredProcess.killed) {
        return true;
    }
    // Check stored PID
    if (cloudflaredPid && await isProcessRunning(cloudflaredPid)) {
        return true;
    }
    // Check PID file (for processes from previous server instance)
    const pid = await readPidFile(TUNNEL_PID_FILE);
    if (pid && await isProcessRunning(pid)) {
        cloudflaredPid = pid;
        return true;
    }
    return false;
}

/**
 * Get current tunnel status
 */
export function getTunnelStatus(): TunnelStatus {
    return {
        cloudflaredInstalled: false, // Will be checked async
        credentialsConfigured: false, // Will be checked async
        tunnelConfigured: false, // Will be checked async
        tunnelRunning: (cloudflaredProcess !== null && !cloudflaredProcess.killed) || cloudflaredPid !== null,
        proxyRunning: proxyServer !== null,
        tunnelUrl: currentTunnelUrl,
        tunnelConfig: null, // Will be loaded async
        proxyPort: PROXY_PORT,
    };
}

/**
 * Get current tunnel status with async checks
 */
export async function getTunnelStatusAsync(): Promise<TunnelStatus> {
    const [installed, credentials, tunnelConfig, tunnelRunning] = await Promise.all([
        checkCloudflared(),
        loadCredentials(),
        loadTunnelConfig(),
        isTunnelRunning(),
    ]);
    
    // Tunnel is configured if we have a tunnel token
    const tunnelConfigured = tunnelConfig !== null && !!tunnelConfig.tunnelToken;
    
    // Update currentTunnelUrl from config if tunnel is running
    if (tunnelRunning && tunnelConfig?.hostname && !currentTunnelUrl) {
        currentTunnelUrl = `https://${tunnelConfig.hostname}`;
    }
    
    return {
        cloudflaredInstalled: installed,
        credentialsConfigured: credentials !== null,
        tunnelConfigured,
        tunnelRunning,
        proxyRunning: proxyServer !== null,
        tunnelUrl: currentTunnelUrl,
        tunnelConfig,
        proxyPort: PROXY_PORT,
    };
}

/**
 * Start the tunnel (proxy + cloudflared)
 */
export async function startTunnel(): Promise<{ success: boolean; message: string; url?: string }> {
    // Check if already running
    if (cloudflaredProcess && !cloudflaredProcess.killed) {
        return {
            success: true,
            message: 'Tunnel already running',
            url: currentTunnelUrl || undefined,
        };
    }

    // Check if cloudflared is installed
    const installed = await checkCloudflared();
    if (!installed) {
        return {
            success: false,
            message: 'cloudflared is not installed. Please install it first.',
        };
    }

    try {
        // Start the proxy server first
        console.log('🔀 Starting tunnel proxy server...');
        proxyServer = await startProxyServer();

        // Start cloudflared quick tunnel
        console.log('☁️  Starting Cloudflare tunnel...');
        
        return new Promise((resolve) => {
            cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PROXY_PORT}`], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let tunnelUrl: string | null = null;
            let resolved = false;

            const handleOutput = (data: Buffer) => {
                const output = data.toString();
                console.log(`[cloudflared] ${output.trim()}`);

                // Look for the tunnel URL in the output
                // Format: "https://xxx-xxx-xxx.trycloudflare.com"
                const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (urlMatch && !resolved) {
                    tunnelUrl = urlMatch[0];
                    currentTunnelUrl = tunnelUrl;
                    resolved = true;
                    console.log(`\n🌐 Tunnel URL: ${tunnelUrl}\n`);
                    resolve({
                        success: true,
                        message: 'Tunnel started successfully',
                        url: tunnelUrl,
                    });
                }
            };

            cloudflaredProcess.stdout?.on('data', handleOutput);
            cloudflaredProcess.stderr?.on('data', handleOutput);

            cloudflaredProcess.on('error', (err) => {
                console.error('Cloudflared error:', err);
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        message: `Failed to start cloudflared: ${err.message}`,
                    });
                }
            });

            cloudflaredProcess.on('exit', (code) => {
                console.log(`Cloudflared exited with code ${code}`);
                cloudflaredProcess = null;
                currentTunnelUrl = null;
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        message: `Cloudflared exited with code ${code}`,
                    });
                }
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        message: 'Timeout waiting for tunnel URL. Check cloudflared logs.',
                    });
                }
            }, 30000);
        });
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Stop the tunnel
 */
export async function stopTunnel(): Promise<{ success: boolean; message: string }> {
    try {
        // Stop cloudflared - try process reference first, then PID file
        if (cloudflaredProcess && !cloudflaredProcess.killed) {
            cloudflaredProcess.kill('SIGTERM');
            cloudflaredProcess = null;
        } else if (cloudflaredPid) {
            // Kill by stored PID (process from previous server instance)
            try {
                process.kill(cloudflaredPid, 'SIGTERM');
            } catch {
                // Process might already be dead
            }
        } else {
            // Check PID file for orphaned process
            const pid = await readPidFile(TUNNEL_PID_FILE);
            if (pid && await isProcessRunning(pid)) {
                try {
                    process.kill(pid, 'SIGTERM');
                } catch {
                    // ignore
                }
            }
        }
        
        cloudflaredPid = null;
        await removePidFile(TUNNEL_PID_FILE);

        // Stop proxy server
        if (proxyServer) {
            proxyServer.server.close();
            proxyServer = null;
        }

        currentTunnelUrl = null;

        return {
            success: true,
            message: 'Tunnel stopped',
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Get the current tunnel URL
 */
export function getTunnelUrl(): string | null {
    return currentTunnelUrl;
}

// ============ TOKEN-BASED TUNNEL FUNCTIONS ============

/**
 * Start tunnel using a token (API-based setup)
 * This is the simplest way to run a permanent tunnel.
 * 
 * The cloudflared process runs detached so it survives config server restarts.
 */
export async function startTunnelWithToken(): Promise<{ success: boolean; message: string; url?: string }> {
    // Check if already running via process reference
    if (cloudflaredProcess && !cloudflaredProcess.killed) {
        return {
            success: true,
            message: 'Tunnel already running',
            url: currentTunnelUrl || undefined,
        };
    }
    
    // Check if an existing tunnel process is running (from previous server instance)
    if (await checkExistingTunnelProcess()) {
        return {
            success: true,
            message: 'Reconnected to existing tunnel process',
            url: currentTunnelUrl || undefined,
        };
    }

    const config = await loadTunnelConfig();
    if (!config || !config.tunnelToken) {
        return {
            success: false,
            message: 'No tunnel configured. Please set up your tunnel first.',
        };
    }

    const installed = await checkCloudflared();
    if (!installed) {
        return {
            success: false,
            message: 'cloudflared is not installed.',
        };
    }

    try {
        // Start the proxy server first
        console.log('🔀 Starting tunnel proxy server...');
        proxyServer = await startProxyServer();

        // Start cloudflared with token (detached so it survives server restart)
        console.log(`☁️  Starting tunnel "${config.tunnelName}"...`);
        
        return new Promise(async (resolve) => {
            cloudflaredProcess = spawn('cloudflared', ['tunnel', 'run', '--token', config.tunnelToken], {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true, // Run independently of parent process
            });
            
            // Save PID for management across restarts
            if (cloudflaredProcess.pid) {
                cloudflaredPid = cloudflaredProcess.pid;
                await writePidFile(TUNNEL_PID_FILE, cloudflaredProcess.pid);
            }
            
            // Unref so Node.js can exit even if cloudflared is running
            // (we'll manage it via PID file)
            cloudflaredProcess.unref();

            let resolved = false;

            const handleOutput = (data: Buffer) => {
                const output = data.toString();
                console.log(`[cloudflared] ${output.trim()}`);

                // Check for connection registration
                if ((output.includes('Registered tunnel connection') || 
                     output.includes('Connection registered') ||
                     output.includes('INF Tunnel')) && !resolved) {
                    currentTunnelUrl = `https://${config.hostname}`;
                    resolved = true;
                    console.log(`\n🌐 Tunnel URL: ${currentTunnelUrl}\n`);
                    resolve({
                        success: true,
                        message: 'Tunnel started successfully',
                        url: currentTunnelUrl,
                    });
                }
            };

            cloudflaredProcess.stdout?.on('data', handleOutput);
            cloudflaredProcess.stderr?.on('data', handleOutput);

            cloudflaredProcess.on('error', (err) => {
                console.error('Cloudflared error:', err);
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        message: `Failed to start cloudflared: ${err.message}`,
                    });
                }
            });

            cloudflaredProcess.on('exit', (code) => {
                console.log(`Cloudflared exited with code ${code}`);
                cloudflaredProcess = null;
                currentTunnelUrl = null;
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        message: `Cloudflared exited with code ${code}`,
                    });
                }
            });

            // Timeout after 30 seconds - assume success
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    currentTunnelUrl = `https://${config.hostname}`;
                    resolve({
                        success: true,
                        message: 'Tunnel started (connection pending)',
                        url: currentTunnelUrl,
                    });
                }
            }, 30000);
        });
    } catch (e: any) {
        return {
            success: false,
            message: e.message,
        };
    }
}

/**
 * Re-export config functions for convenience
 */
export { loadTunnelConfig, saveTunnelConfig, deleteTunnelConfig, TunnelConfigData, CloudflareCredentials };
