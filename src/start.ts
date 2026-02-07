/**
 * Unified launcher for local runtime services.
 *
 * Starts:
 * - config server (`npm run config`)
 * - scheduler daemon (`npm run scheduler`, if not already running)
 * - tunnel server (`npm run tunnel`, if configured)
 *
 * If services are already running, prompts the user to restart or keep them.
 */

import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

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

const MAX_CONFIG_RETRIES = 5;
const FAST_EXIT_MS = 5_000;
let configRestartCount = 0;
let configLastStart = 0;

// ============ HELPERS ============

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

function killPid(pid: number): void {
    try {
        process.kill(pid, 'SIGTERM');
    } catch {
        // ignore
    }
}

function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(1000);
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => { sock.destroy(); resolve(false); });
        sock.once('timeout', () => { sock.destroy(); resolve(false); });
        sock.connect(port, '127.0.0.1');
    });
}

async function readPidFile(pidPath: string): Promise<number | null> {
    try {
        const data = await fs.readFile(pidPath, 'utf-8');
        const pid = parseInt(data.trim(), 10);
        return Number.isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

async function ask(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

// ============ DETECT EXISTING SERVICES ============

interface ExistingServices {
    configRunning: boolean;
    schedulerRunning: boolean;
    schedulerPid: number | null;
    tunnelRunning: boolean;
    tunnelPid: number | null;
}

async function detectExisting(): Promise<ExistingServices> {
    const configRunning = await isPortInUse(3456);

    const schedulerPid = await readPidFile(SCHEDULER_PID_PATH);
    const schedulerRunning = schedulerPid !== null && isPidAlive(schedulerPid);

    const tunnelPid = await readPidFile(TUNNEL_PID_PATH);
    const tunnelRunning = tunnelPid !== null && isPidAlive(tunnelPid);

    return { configRunning, schedulerRunning, schedulerPid, tunnelRunning, tunnelPid };
}

// ============ SERVICE LAUNCHERS ============

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

function launchConfig(): void {
    console.log('🧩 Starting config server...');
    configLastStart = Date.now();
    configProcess = spawnScript('config');

    configProcess.on('exit', (code, signal) => {
        if (shuttingDown) return;

        const uptime = Date.now() - configLastStart;

        if (uptime > FAST_EXIT_MS) {
            configRestartCount = 0;
        } else {
            configRestartCount++;
        }

        if (configRestartCount >= MAX_CONFIG_RETRIES) {
            console.error(`❌ Config server crashed ${configRestartCount} times quickly — giving up. Check if port 3456 is in use.`);
            return;
        }

        const delay = uptime > FAST_EXIT_MS ? 1_000 : Math.min(1_000 * Math.pow(2, configRestartCount), 60_000);
        console.log(`⚠️ Config server exited (${signal || code}). Restarting in ${Math.round(delay / 1000)}s...`);
        setTimeout(() => {
            if (!shuttingDown) launchConfig();
        }, delay);
    });
}

function launchScheduler(): void {
    console.log('🤖 Starting scheduler daemon...');
    schedulerProcess = spawnScript('scheduler');
    schedulerStartedHere = true;

    schedulerProcess.on('exit', (code, signal) => {
        schedulerProcess = null;
        if (shuttingDown) return;
        console.log(`ℹ️ Scheduler exited (${signal || code}).`);
    });
}

async function launchTunnel(): Promise<void> {
    if (!(await isTunnelConfigured())) {
        console.log('🌐 Tunnel not configured (skipping).');
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

// ============ LIFECYCLE ============

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
    console.log('🚀 Own Your Data start\n');

    const existing = await detectExisting();
    const tunnelConfigured = await isTunnelConfigured();

    // ---- Phase 1: Ask all questions BEFORE spawning anything ----
    // (child processes with stdio: 'inherit' steal stdin)

    let restartConfig = !existing.configRunning; // true = start fresh
    let restartScheduler = !existing.schedulerRunning;
    let restartTunnel = !existing.tunnelRunning || !tunnelConfigured;

    if (existing.configRunning) {
        const a = await ask('🧩 Config server is already running on port 3456. Restart it? [y/N] ');
        restartConfig = a === 'y' || a === 'yes';
    }

    if (existing.schedulerRunning && existing.schedulerPid) {
        const a = await ask(`🤖 Scheduler is already running (PID ${existing.schedulerPid}). Restart it? [y/N] `);
        restartScheduler = a === 'y' || a === 'yes';
    }

    if (tunnelConfigured && existing.tunnelRunning && existing.tunnelPid) {
        const a = await ask(`🌐 Tunnel is already running (PID ${existing.tunnelPid}). Restart it? [y/N] `);
        restartTunnel = a === 'y' || a === 'yes';
    }

    // ---- Phase 2: Act on the answers ----

    // Config server
    if (existing.configRunning && restartConfig) {
        console.log('   Stopping config server...');
        await fetch('http://127.0.0.1:3456/shutdown', { method: 'POST' }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1500));
        launchConfig();
    } else if (!existing.configRunning) {
        launchConfig();
    } else {
        console.log('   Keeping existing config server.');
    }

    // Scheduler
    if (existing.schedulerRunning && existing.schedulerPid && restartScheduler) {
        console.log('   Stopping scheduler...');
        killPid(existing.schedulerPid);
        await new Promise(resolve => setTimeout(resolve, 1000));
        launchScheduler();
    } else if (!existing.schedulerRunning) {
        launchScheduler();
    } else {
        console.log('   Keeping existing scheduler.');
    }

    // Tunnel
    if (!tunnelConfigured) {
        console.log('🌐 Tunnel not configured (skipping).');
    } else if (existing.tunnelRunning && existing.tunnelPid && restartTunnel) {
        console.log('   Stopping tunnel...');
        killPid(existing.tunnelPid);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await launchTunnel();
    } else if (!existing.tunnelRunning) {
        await launchTunnel();
    } else {
        console.log('   Keeping existing tunnel.');
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

void main().catch((error) => {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
});
