/**
 * Scheduler daemon
 * Run: npm run scheduler
 *
 * Replaces get_all.ts with:
 * - central scheduler config (cadence + commands per plugin)
 * - optional plugin server auto-start
 */

import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../config/config';
import { discoverPlugins, DiscoveredPlugin } from '../plugins';
import { resolveSchedulerPluginConfig } from './config';

interface PluginRuntimeState {
    running: boolean;
    nextRun: Date | null;
    lastFixedKey?: string;
}

const PID_FILE = path.join(process.cwd(), 'logs', 'scheduler.pid');
const serviceProcesses = new Map<string, ChildProcess>();
const serviceCommandByPlugin = new Map<string, string>();
const schedulerState = new Map<string, PluginRuntimeState>();

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

async function runCommand(name: string, command: string): Promise<boolean> {
    if (!command || command.trim().length === 0) {
        return true;
    }

    return new Promise((resolve) => {
        console.log(`🚀 ${name}: ${command}`);
        const child = spawn(command, {
            cwd: process.cwd(),
            shell: true,
            stdio: 'inherit',
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(true);
                return;
            }
            console.error(`❌ ${name} failed with code ${code}`);
            resolve(false);
        });

        child.on('error', (error) => {
            console.error(`❌ ${name} error: ${error.message}`);
            resolve(false);
        });
    });
}

async function runPluginJob(plugin: DiscoveredPlugin): Promise<void> {
    const appConfig = await loadConfig();
    const schedule = resolveSchedulerPluginConfig(appConfig, plugin);
    const state = schedulerState.get(plugin.manifest.id) || { running: false, nextRun: null };
    if (state.running || !schedule.enabled || schedule.commands.length === 0) {
        return;
    }

    state.running = true;
    schedulerState.set(plugin.manifest.id, state);

    console.log(`\n📦 ${plugin.manifest.icon} ${plugin.manifest.name}: ${schedule.commands.join(' -> ')}`);
    for (const commandId of schedule.commands) {
        const command = plugin.manifest.commands[commandId];
        if (!command || command.trim().length === 0) {
            continue;
        }
        const success = await runCommand(`${plugin.manifest.id}:${commandId}`, command);
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

function ensurePluginServer(plugin: DiscoveredPlugin): void {
    const existing = serviceProcesses.get(plugin.manifest.id);
    if (existing) return;

    const command = plugin.manifest.commands.server;
    if (!command || command.trim().length === 0) return;

    console.log(`🧩 Starting server for ${plugin.manifest.name}: ${command}`);
    const child = spawn(command, {
        cwd: process.cwd(),
        shell: true,
        stdio: 'inherit',
    });

    serviceProcesses.set(plugin.manifest.id, child);
    serviceCommandByPlugin.set(plugin.manifest.id, command);

    child.on('exit', () => {
        serviceProcesses.delete(plugin.manifest.id);
        const restartCommand = serviceCommandByPlugin.get(plugin.manifest.id);
        if (!restartCommand) return;
        setTimeout(async () => {
            const appConfig = await loadConfig();
            const schedule = resolveSchedulerPluginConfig(appConfig, plugin);
            if (schedule.autoStartServer) {
                ensurePluginServer(plugin);
            }
        }, 5000);
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
    const appConfig = await loadConfig();

    for (const plugin of plugins) {
        const schedule = resolveSchedulerPluginConfig(appConfig, plugin);
        const state = schedulerState.get(plugin.manifest.id) || { running: false, nextRun: null };

        if (schedule.enabled && schedule.autoStartServer && plugin.manifest.commands.server) {
            ensurePluginServer(plugin);
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
