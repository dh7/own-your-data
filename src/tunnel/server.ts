/**
 * Standalone Tunnel Server
 * 
 * Run: npm run tunnel
 * 
 * Starts the Cloudflare tunnel and proxy server.
 * Managed by start.ts alongside config and scheduler.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { PROXY_PORT, startProxyServer } from './proxy';
import { loadTunnelConfig, TunnelConfigData } from './config';

const PID_FILE = path.join(process.cwd(), 'logs', 'tunnel.pid');

let cloudflaredProcess: ChildProcess | null = null;
let proxyServer: { server: ReturnType<ReturnType<typeof import('express')>['listen']>; port: number } | null = null;
let shuttingDown = false;

async function writePidFile(): Promise<void> {
    await fs.mkdir(path.dirname(PID_FILE), { recursive: true });
    await fs.writeFile(PID_FILE, String(process.pid), 'utf-8');
}

async function removePidFile(): Promise<void> {
    try {
        await fs.unlink(PID_FILE);
    } catch {
        // ignore
    }
}

async function startCloudflared(config: TunnelConfigData): Promise<void> {
    console.log(`☁️  Starting tunnel "${config.tunnelName}"...`);
    
    cloudflaredProcess = spawn('cloudflared', ['tunnel', 'run', '--token', config.tunnelToken], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    cloudflaredProcess.stdout?.on('data', (data: Buffer) => {
        console.log(`[cloudflared] ${data.toString().trim()}`);
    });

    cloudflaredProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        console.log(`[cloudflared] ${output}`);
        
        // Log when connection is established
        if (output.includes('Registered tunnel connection') || output.includes('Connection registered')) {
            console.log(`✅ Tunnel connected: https://${config.hostname}`);
        }
    });

    cloudflaredProcess.on('exit', (code, signal) => {
        console.log(`[cloudflared] exited (${signal || code})`);
        cloudflaredProcess = null;
        
        if (!shuttingDown) {
            console.log('🔄 Restarting cloudflared in 5s...');
            setTimeout(() => {
                if (!shuttingDown) {
                    startCloudflared(config).catch(console.error);
                }
            }, 5000);
        }
    });
}

async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    
    console.log('\n🛑 Stopping tunnel...');
    
    if (cloudflaredProcess && !cloudflaredProcess.killed) {
        cloudflaredProcess.kill('SIGTERM');
    }
    
    if (proxyServer) {
        proxyServer.server.close();
    }
    
    await removePidFile();
    
    setTimeout(() => process.exit(0), 500);
}

async function main(): Promise<void> {
    console.log('🌐 Own Your Data - Tunnel Server\n');
    
    // Check if tunnel is configured
    const config = await loadTunnelConfig();
    if (!config || !config.tunnelToken) {
        console.log('⚠️  Tunnel not configured. Configure it via the Config UI first.');
        console.log('   Run: npm run config');
        process.exit(0);
    }
    
    // Check if cloudflared is installed
    try {
        const { execSync } = await import('child_process');
        execSync('which cloudflared', { stdio: 'ignore' });
    } catch {
        console.error('❌ cloudflared is not installed.');
        console.error('   Install it via: brew install cloudflared (macOS)');
        process.exit(1);
    }
    
    await writePidFile();
    
    // Start proxy server
    console.log('🔀 Starting proxy server...');
    proxyServer = await startProxyServer();
    console.log(`   Proxy listening on port ${PROXY_PORT}`);
    
    // Start cloudflared
    await startCloudflared(config);
    
    // Handle signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

void main().catch(async (error) => {
    console.error('❌ Tunnel server failed:', error);
    await removePidFile();
    process.exit(1);
});
