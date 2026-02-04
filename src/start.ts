/**
 * Unified launcher for local runtime services.
 *
 * Starts:
 * - config server (`npm run config`)
 * - scheduler daemon (`npm run scheduler`, if not already running)
 * - tunnel server (`npm run tunnel`, if configured)
 */

import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const CWD = process.cwd();
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SCHEDULER_PID_PATH = path.join(CWD, 'logs', 'scheduler.pid');
const TUNNEL_PID_PATH = path.join(CWD, 'logs', 'tunnel.pid');

let shuttingDown = false;
let configProcess: ChildProcess | null = null;
let schedulerProcess: ChildProcess | null = null;
let tunnelProcess: ChildProcess | null = null;
let schedulerStartedHere = false;
let tunnelStartedHere = false;

function spawnScript(script: string): ChildProcess {
    return spawn(NPM_CMD, ['run', script], {
        cwd: CWD,
        stdio: 'inherit',
    });
}

function terminateChild(child: ChildProcess | null): void {
    if (!child || child.killed || child.exitCode !== null) return;
    try {
        child.kill('SIGTERM');
    } catch {
        // ignore
    }
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function schedulerAlreadyRunning(): Promise<boolean> {
    try {
        const data = await fs.readFile(SCHEDULER_PID_PATH, 'utf-8');
        const pid = parseInt(data.trim(), 10);
        if (Number.isNaN(pid)) return false;
        return isPidAlive(pid);
    } catch {
        return false;
    }
}

async function tunnelAlreadyRunning(): Promise<boolean> {
    try {
        const data = await fs.readFile(TUNNEL_PID_PATH, 'utf-8');
        const pid = parseInt(data.trim(), 10);
        if (Number.isNaN(pid)) return false;
        return isPidAlive(pid);
    } catch {
        return false;
    }
}

async function isTunnelConfigured(): Promise<boolean> {
    try {
        const configPath = path.join(CWD, 'auth', 'tunnel-config.json');
        const data = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(data);
        const configured = Boolean(config.tunnelToken);
        if (!configured) {
            console.log('   (tunnel-config.json exists but no tunnelToken)');
        }
        return configured;
    } catch (e: any) {
        if (e.code !== 'ENOENT') {
            console.log(`   (tunnel config error: ${e.message})`);
        }
        return false;
    }
}

function startConfig(): void {
    console.log('🧩 Starting config server...');
    configProcess = spawnScript('config');

    configProcess.on('exit', (code, signal) => {
        if (shuttingDown) return;
        console.log(`⚠️ Config server exited (${signal || code}). Restarting in 1s...`);
        setTimeout(() => {
            if (!shuttingDown) startConfig();
        }, 1000);
    });
}

async function startScheduler(): Promise<void> {
    if (await schedulerAlreadyRunning()) {
        console.log('🤖 Scheduler already running (using existing process).');
        return;
    }

    console.log('🤖 Starting scheduler daemon...');
    schedulerProcess = spawnScript('scheduler');
    schedulerStartedHere = true;

    schedulerProcess.on('exit', (code, signal) => {
        schedulerProcess = null;
        if (shuttingDown) return;
        console.log(`ℹ️ Scheduler exited (${signal || code}).`);
    });
}

async function startTunnel(): Promise<void> {
    // Only start if configured
    if (!(await isTunnelConfigured())) {
        console.log('🌐 Tunnel not configured (skipping).');
        return;
    }
    
    if (await tunnelAlreadyRunning()) {
        console.log('🌐 Tunnel already running (using existing process).');
        return;
    }

    console.log('🌐 Starting tunnel server...');
    tunnelProcess = spawnScript('tunnel');
    tunnelStartedHere = true;

    tunnelProcess.on('exit', (code, signal) => {
        tunnelProcess = null;
        if (shuttingDown) return;
        console.log(`ℹ️ Tunnel exited (${signal || code}).`);
    });
}

function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n🛑 Stopping services...');

    terminateChild(configProcess);
    if (schedulerStartedHere) {
        terminateChild(schedulerProcess);
    }
    if (tunnelStartedHere) {
        terminateChild(tunnelProcess);
    }

    setTimeout(() => process.exit(0), 300);
}

async function main(): Promise<void> {
    console.log('🚀 Own Your Data start');
    startConfig();
    await startScheduler();
    await startTunnel();

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

void main().catch((error) => {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
});
