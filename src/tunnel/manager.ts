/**
 * Cloudflare Tunnel Manager
 * 
 * Manages the cloudflared process for creating quick and named tunnels.
 * Handles starting, stopping, and monitoring the tunnel.
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
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

// State
let cloudflaredProcess: ChildProcess | null = null;
let proxyServer: { server: ReturnType<ReturnType<typeof import('express')>['listen']>; port: number } | null = null;
let currentTunnelUrl: string | null = null;

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
 * Get current tunnel status
 */
export function getTunnelStatus(): TunnelStatus {
    return {
        cloudflaredInstalled: false, // Will be checked async
        credentialsConfigured: false, // Will be checked async
        tunnelConfigured: false, // Will be checked async
        tunnelRunning: cloudflaredProcess !== null && !cloudflaredProcess.killed,
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
    const [installed, credentials, tunnelConfig] = await Promise.all([
        checkCloudflared(),
        loadCredentials(),
        loadTunnelConfig(),
    ]);
    
    // Tunnel is configured if we have a tunnel token
    const tunnelConfigured = tunnelConfig !== null && !!tunnelConfig.tunnelToken;
    
    return {
        cloudflaredInstalled: installed,
        credentialsConfigured: credentials !== null,
        tunnelConfigured,
        tunnelRunning: cloudflaredProcess !== null && !cloudflaredProcess.killed,
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
        // Stop cloudflared
        if (cloudflaredProcess && !cloudflaredProcess.killed) {
            cloudflaredProcess.kill('SIGTERM');
            cloudflaredProcess = null;
        }

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
 */
export async function startTunnelWithToken(): Promise<{ success: boolean; message: string; url?: string }> {
    // Check if already running
    if (cloudflaredProcess && !cloudflaredProcess.killed) {
        return {
            success: true,
            message: 'Tunnel already running',
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

        // Start cloudflared with token
        console.log(`☁️  Starting tunnel "${config.tunnelName}"...`);
        
        return new Promise((resolve) => {
            cloudflaredProcess = spawn('cloudflared', ['tunnel', 'run', '--token', config.tunnelToken], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

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
