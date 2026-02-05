/**
 * Scheduler daemon
 * Run: npm run scheduler
 *
 * Replaces get_all.ts with:
 * - central scheduler config (cadence + commands per plugin)
 * - optional plugin server auto-start
 */

import { ChildProcess, spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { discoverPlugins, DiscoveredPlugin } from '../plugins';
import { resolvePluginSchedule } from './config';
import {
    logSchedulerStart,
    logServerStart,
    logServerStop,
    logServerOutput,
    logCommandStart,
    logCommandEnd,
    logCommandOutput,
    logPluginJobStart,
    closeLogger,
} from './logger';

interface PluginRuntimeState {
    running: boolean;
    nextRun: Date | null;
    lastFixedKey?: string;
}

const PID_FILE = path.join(process.cwd(), 'logs', 'scheduler.pid');
const serviceProcesses = new Map<string, ChildProcess>();
const serviceCommandByPlugin = new Map<string, string>();
const schedulerState = new Map<string, PluginRuntimeState>();
const knownExternalPids = new Map<string, number>();
const serverStartTimes = new Map<string, number>();
const restartState = new Map<string, { failures: number; nextRetry: number; gaveUp: boolean }>();

const MAX_FAST_FAILURES = 5;
const FAST_CRASH_THRESHOLD_MS = 10_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isWithinHours(now: Date, startHour: number, endHour: number): boolean {
    const hour = now.getHours();
    if (startHour < endHour) {
        return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
}

function getNextWindowStart(now: Date, startHour: number): Date {
    const target = new Date(now);
    target.setMinutes(0, 0, 0);
    target.setHours(startHour);
    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }
    return target;
}

function getRandomJitterMs(jitterMinutes: number): number {
    const jitterMs = clamp(jitterMinutes, 0, 180) * 60_000;
    return Math.floor((Math.random() * 2 - 1) * jitterMs);
}

function calculateNextIntervalRun(now: Date, intervalHours: number, jitterMinutes: number, startHour: number, endHour: number): Date {
    if (!isWithinHours(now, startHour, endHour)) {
        return getNextWindowStart(now, startHour);
    }

    const baseMs = clamp(intervalHours, 1, 168) * 60 * 60 * 1000;
    const next = new Date(now.getTime() + baseMs + getRandomJitterMs(jitterMinutes));

    if (isWithinHours(next, startHour, endHour)) {
        return next;
    }

    return getNextWindowStart(next, startHour);
}

async function writePidFile(): Promise<void> {
    await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });
    await fs.writeFile(PID_FILE, String(process.pid), 'utf-8');
}

async function removePidFile(): Promise<void> {
    try {
        await fs.unlink(PID_FILE);
    } catch {
        // ignore
    }
}

async function runCommand(name: string, command: string, pluginId: string, commandId: string): Promise<boolean> {
    if (!command || command.trim().length === 0) {
        return true;
    }

    const startTime = Date.now();
    await logCommandStart(pluginId, commandId, command);

    return new Promise((resolve) => {
        console.log(`🚀 ${name}: ${command}`);
        const child = spawn(command, {
            cwd: process.cwd(),
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Capture stdout
        child.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            process.stdout.write(output); // Still show in console
            void logCommandOutput(pluginId, commandId, output, false);
        });

        // Capture stderr
        child.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            process.stderr.write(output); // Still show in console
            void logCommandOutput(pluginId, commandId, output, true);
        });

        child.on('close', async (code) => {
            const duration = Date.now() - startTime;
            if (code === 0) {
                await logCommandEnd(pluginId, commandId, true, duration);
                resolve(true);
                return;
            }
            console.error(`❌ ${name} failed with code ${code}`);
            await logCommandEnd(pluginId, commandId, false, duration);
            resolve(false);
        });

        child.on('error', async (error) => {
            const duration = Date.now() - startTime;
            console.error(`❌ ${name} error: ${error.message}`);
            await logCommandEnd(pluginId, commandId, false, duration);
            resolve(false);
        });
    });
}

async function runPluginJob(plugin: DiscoveredPlugin): Promise<void> {
    const schedule = await resolvePluginSchedule(plugin);
    const state = schedulerState.get(plugin.manifest.id) || { running: false, nextRun: null };
    if (state.running || !schedule.enabled || schedule.commands.length === 0) {
        return;
    }

    state.running = true;
    schedulerState.set(plugin.manifest.id, state);

    console.log(`\n📦 ${plugin.manifest.icon} ${plugin.manifest.name}: ${schedule.commands.join(' -> ')}`);
    await logPluginJobStart(plugin.manifest.name, schedule.commands);
    for (const commandId of schedule.commands) {
        const command = plugin.manifest.commands[commandId];
        if (!command || command.trim().length === 0) {
            continue;
        }
        const success = await runCommand(`${plugin.manifest.id}:${commandId}`, command, plugin.manifest.id, commandId);
        if (!success) break;
    }

    state.running = false;
    state.nextRun = calculateNextIntervalRun(
        new Date(),
        schedule.intervalHours,
        schedule.jitterMinutes,
        schedule.startHour,
        schedule.endHour
    );
    schedulerState.set(plugin.manifest.id, state);
}

const execAsync = promisify(exec);

/**
 * Check if a process matching the given command pattern is already running
 * Returns the PID if found, null otherwise
 */
async function checkExistingProcess(commandPattern: string): Promise<number | null> {
    try {
        // Extract a unique identifier from the command (e.g., filename or plugin path)
        // For "ts-node src/plugins/whatsapp/get.ts", use "whatsapp/get.ts"
        const match = commandPattern.match(/src\/plugins\/([^/]+\/[^/\s]+)/);
        const searchPattern = match ? match[1] : commandPattern;

        const { stdout } = await execAsync(`pgrep -f "${searchPattern}" | head -1`);
        const pid = parseInt(stdout.trim(), 10);
        if (pid && pid !== process.pid) {
            return pid;
        }
    } catch {
        // pgrep returns non-zero if no process found, that's expected
    }
    return null;
}

async function ensurePluginServer(plugin: DiscoveredPlugin): Promise<void> {
    const pluginId = plugin.manifest.id;
    const existing = serviceProcesses.get(pluginId);
    if (existing) return;

    const command = plugin.manifest.commands.server;
    if (!command || command.trim().length === 0) return;

    // Check if we already gave up on this server
    const rs = restartState.get(pluginId);
    if (rs?.gaveUp) return;

    // Check backoff timer
    if (rs && Date.now() < rs.nextRetry) return;

    // Check if a process is already running for this server command
    const existingPid = await checkExistingProcess(command);
    if (existingPid) {
        // Only log once per unique external PID
        if (knownExternalPids.get(pluginId) !== existingPid) {
            console.log(`ℹ️ ${plugin.manifest.name} server already running externally (PID ${existingPid})`);
            knownExternalPids.set(pluginId, existingPid);
        }
        return;
    }

    // External process gone — clear tracking
    knownExternalPids.delete(pluginId);

    console.log(`🧩 Starting server for ${plugin.manifest.name}: ${command}`);
    void logServerStart(pluginId, command);

    const startedAt = Date.now();
    serverStartTimes.set(pluginId, startedAt);

    const child = spawn(command, {
        cwd: process.cwd(),
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        process.stdout.write(output);
        void logServerOutput(pluginId, output, false);
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        process.stderr.write(output);
        void logServerOutput(pluginId, output, true);
    });

    serviceProcesses.set(pluginId, child);
    serviceCommandByPlugin.set(pluginId, command);

    child.on('exit', (code) => {
        void logServerStop(pluginId);
        serviceProcesses.delete(pluginId);

        const restartCommand = serviceCommandByPlugin.get(pluginId);
        if (!restartCommand) return;

        const uptime = Date.now() - (serverStartTimes.get(pluginId) || 0);
        const state = restartState.get(pluginId) || { failures: 0, nextRetry: 0, gaveUp: false };

        // Fast crash detection
        if (uptime < FAST_CRASH_THRESHOLD_MS) {
            state.failures++;
            if (state.failures >= MAX_FAST_FAILURES) {
                state.gaveUp = true;
                restartState.set(pluginId, state);
                console.error(`❌ ${plugin.manifest.name} server crashed ${state.failures} times quickly — giving up. Start it manually.`);
                return;
            }
            const delay = Math.min(5_000 * Math.pow(2, state.failures - 1), MAX_BACKOFF_MS);
            state.nextRetry = Date.now() + delay;
            restartState.set(pluginId, state);
        } else {
            // Server ran long enough, reset failure count
            state.failures = 0;
            state.nextRetry = 0;
            restartState.set(pluginId, state);
        }

        void (async () => {
            const schedule = await resolvePluginSchedule(plugin);

            if (schedule.autoStartServer && schedule.autoRestartServer) {
                const delay = Math.max(0, (state.nextRetry || 0) - Date.now());
                if (delay > 0) {
                    console.log(`🔄 Restarting ${plugin.manifest.name} server in ${Math.round(delay / 1000)}s (attempt ${state.failures}/${MAX_FAST_FAILURES})`);
                }
                setTimeout(() => ensurePluginServer(plugin), delay || 5000);
            } else if (schedule.autoStartServer && !schedule.autoRestartServer) {
                console.log(`⏸️ ${plugin.manifest.name} server stopped (auto-restart disabled)`);
            }
        })();
    });
}

function stopAllPluginServers(): void {
    for (const child of serviceProcesses.values()) {
        try {
            child.kill('SIGTERM');
        } catch {
            // ignore
        }
    }
    serviceProcesses.clear();
}

function parseFixedTimes(times: string[]): Set<string> {
    const normalized = times
        .map(time => time.trim())
        .filter(Boolean);
    return new Set(normalized);
}

async function tick(plugins: DiscoveredPlugin[]): Promise<void> {
    const now = new Date();

    for (const plugin of plugins) {
        const schedule = await resolvePluginSchedule(plugin);
        const state = schedulerState.get(plugin.manifest.id) || { running: false, nextRun: null };

        if (schedule.enabled && schedule.autoStartServer && plugin.manifest.commands.server) {
            await ensurePluginServer(plugin);
        }

        if (!schedule.enabled || schedule.commands.length === 0) {
            state.nextRun = null;
            schedulerState.set(plugin.manifest.id, state);
            continue;
        }

        if (schedule.cadence === 'fixed') {
            const fixedTimes = parseFixedTimes(schedule.fixedTimes);
            const currentKey = `${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`;
            if (fixedTimes.has(now.toTimeString().slice(0, 5)) && state.lastFixedKey !== currentKey) {
                state.lastFixedKey = currentKey;
                schedulerState.set(plugin.manifest.id, state);
                await runPluginJob(plugin);
                continue;
            }
            schedulerState.set(plugin.manifest.id, state);
            continue;
        }

        if (!state.nextRun) {
            state.nextRun = calculateNextIntervalRun(
                now,
                schedule.intervalHours,
                schedule.jitterMinutes,
                schedule.startHour,
                schedule.endHour
            );
            schedulerState.set(plugin.manifest.id, state);
        }

        if (state.nextRun && now >= state.nextRun) {
            await runPluginJob(plugin);
        }
    }
}

async function main(): Promise<void> {
    console.log('🤖 Own Your Data - Scheduler Daemon');
    await writePidFile();
    await logSchedulerStart();

    const plugins = await discoverPlugins();
    console.log(`📦 Loaded ${plugins.length} plugins for scheduling.`);

    const loop = async () => {
        try {
            await tick(plugins);
        } catch (error) {
            console.error('Scheduler tick failed:', error);
        } finally {
            setTimeout(loop, 30_000);
        }
    };
    loop();
}

async function cleanupAndExit(code: number): Promise<void> {
    stopAllPluginServers();
    await closeLogger();
    await removePidFile();
    process.exit(code);
}

process.on('SIGINT', () => {
    void cleanupAndExit(0);
});
process.on('SIGTERM', () => {
    void cleanupAndExit(0);
});
process.on('exit', () => {
    stopAllPluginServers();
});

void main().catch(async (error) => {
    console.error('Scheduler daemon failed:', error);
    await cleanupAndExit(1);
});
