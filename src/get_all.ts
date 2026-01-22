/**
 * Unified Data Collector - Human-like scheduling daemon
 * Run: npm run get_all
 *
 * Runs forever, collecting data from all plugins with human-like timing:
 * - More active during day, sleeps at night
 * - Random delays between runs to mimic human behavior
 *
 * NOTE: Plugins with "realtime" mode (like WhatsApp) should be run separately.
 *
 * After collecting, automatically runs process_all and push_all.
 * Press Ctrl+C to stop.
 */

import { spawn, ChildProcess } from 'child_process';
import { loadConfig, getPluginConfig } from './config/config';
import { discoverPlugins, getIntervalPlugins, DiscoveredPlugin } from './plugins';
import { BasePluginConfig } from './plugins/types';

// ============ TYPES ============

interface PluginState {
    id: string;
    name: string;
    lastRun: Date | null;
    nextRun: Date | null;
    running: boolean;
}

// ============ HUMAN-LIKE TIMING ============

function getRandomVariance(randomMinutes: number): number {
    const variance = randomMinutes * 60 * 1000;
    return Math.floor(Math.random() * variance * 2) - variance;
}

function isActiveHours(start: number, end: number): boolean {
    const hour = new Date().getHours();

    if (start < end) {
        return hour >= start && hour < end;
    } else {
        return hour >= start || hour < end;
    }
}

function msUntilActiveHours(start: number): number {
    const now = new Date();
    const currentHour = now.getHours();

    let hoursUntil: number;
    if (currentHour < start) {
        hoursUntil = start - currentHour;
    } else {
        hoursUntil = 24 - currentHour + start;
    }

    const randomDelay = Math.floor(Math.random() * 30 * 60 * 1000);
    return hoursUntil * 60 * 60 * 1000 + randomDelay;
}

function calculateNextRun(intervalHours: number, randomMinutes: number): Date {
    const baseMs = intervalHours * 60 * 60 * 1000;
    const variance = getRandomVariance(randomMinutes);
    return new Date(Date.now() + baseMs + variance);
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

// ============ COMMAND RUNNERS ============

async function runCommand(name: string, command: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n🚀 Starting ${name}...`);

        const [cmd, ...args] = command.split(' ');
        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd(),
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${name} completed successfully`);
                resolve(true);
            } else {
                console.log(`❌ ${name} failed with code ${code}`);
                resolve(false);
            }
        });

        child.on('error', (err) => {
            console.error(`❌ ${name} error:`, err.message);
            resolve(false);
        });
    });
}

async function runProcessAll(): Promise<void> {
    console.log('\n📄 Running process_all...');
    await runCommand('Process All', 'npx ts-node src/process_all.ts');
}

async function runPushAll(): Promise<void> {
    console.log('\n📤 Running push_all...');
    await runCommand('Push All', 'npx ts-node src/push_all.ts');
}

// ============ MAIN DAEMON ============

const PID_FILE = './logs/get_all.pid';

async function writePidFile() {
    const fs = await import('fs/promises');
    await fs.mkdir('./logs', { recursive: true });
    await fs.writeFile(PID_FILE, String(process.pid));
}

async function removePidFile() {
    const fs = await import('fs/promises');
    try {
        await fs.unlink(PID_FILE);
    } catch { }
}

async function main() {
    console.log('🤖 Own Your Data - Unified Collector Daemon\n');
    console.log('   Uses plugin discovery for scheduling');
    console.log('   Press Ctrl+C to stop.\n');

    await writePidFile();

    const appConfig = await loadConfig();

    // Default active hours (can be made configurable later)
    const activeHoursStart = 7;
    const activeHoursEnd = 23;

    console.log('📋 Configuration:');
    console.log(`   Active hours: ${activeHoursStart}:00 - ${activeHoursEnd}:00`);

    // Discover interval-mode plugins
    const intervalPlugins = await getIntervalPlugins();

    if (intervalPlugins.length === 0) {
        console.log('⚠️ No interval-mode plugins found.');
        await removePidFile();
        process.exit(0);
    }

    // Initialize state for each plugin
    const state: Record<string, PluginState> = {};

    for (const plugin of intervalPlugins) {
        const config = getPluginConfig(appConfig, plugin.manifest.id) as BasePluginConfig | undefined;
        const enabled = config?.enabled ?? true;

        console.log(`   ${plugin.manifest.icon} ${plugin.manifest.name}: ${enabled ? `every ${config?.intervalHours || plugin.manifest.scheduler.defaultIntervalHours}h` : 'disabled'}`);

        state[plugin.manifest.id] = {
            id: plugin.manifest.id,
            name: plugin.manifest.name,
            lastRun: null,
            nextRun: null,
            running: false,
        };
    }

    console.log('');

    // Schedule next run for a plugin
    const schedulePlugin = (id: string, intervalHours: number, randomMinutes: number) => {
        const nextRun = calculateNextRun(intervalHours, randomMinutes);
        state[id].nextRun = nextRun;

        const msUntil = nextRun.getTime() - Date.now();
        console.log(`⏰ ${state[id].name} scheduled for ${formatTime(nextRun)} (in ${formatDuration(msUntil)})`);
    };

    // Run a plugin and schedule next
    const runAndSchedule = async (plugin: DiscoveredPlugin) => {
        const id = plugin.manifest.id;
        const pluginConfig = getPluginConfig(appConfig, id) as BasePluginConfig | undefined;

        if (!pluginConfig?.enabled) {
            return;
        }

        if (state[id].running) {
            console.log(`⏩ ${state[id].name} already running, skipping`);
            return;
        }

        // Check if we're in active hours
        if (!isActiveHours(activeHoursStart, activeHoursEnd)) {
            const sleepMs = msUntilActiveHours(activeHoursStart);
            console.log(`😴 Outside active hours. ${state[id].name} sleeping for ${formatDuration(sleepMs)}`);
            state[id].nextRun = new Date(Date.now() + sleepMs);
            return;
        }

        state[id].running = true;
        state[id].lastRun = new Date();

        await runCommand(state[id].name, plugin.manifest.commands.get);

        state[id].running = false;

        // Schedule next run
        const intervalHours = pluginConfig.intervalHours || plugin.manifest.scheduler.defaultIntervalHours || 6;
        const randomMinutes = pluginConfig.randomMinutes || plugin.manifest.scheduler.defaultRandomMinutes || 30;
        schedulePlugin(id, intervalHours, randomMinutes);
    };

    // Check interval (every minute)
    const checkInterval = 60 * 1000;

    // Track if any plugin just ran (for batching process/push)
    let anyPluginRan = false;

    const mainLoop = async () => {
        const currentConfig = await loadConfig();
        anyPluginRan = false;

        for (const plugin of intervalPlugins) {
            const id = plugin.manifest.id;
            const pluginConfig = getPluginConfig(currentConfig, id) as BasePluginConfig | undefined;

            if (!pluginConfig?.enabled) continue;

            // First run - schedule immediately or after active hours
            if (!state[id].nextRun) {
                if (isActiveHours(activeHoursStart, activeHoursEnd)) {
                    const delay = Math.floor(Math.random() * 5 * 60 * 1000);
                    state[id].nextRun = new Date(Date.now() + delay);
                    console.log(`🎯 ${state[id].name} first run in ${formatDuration(delay)}`);
                } else {
                    const sleepMs = msUntilActiveHours(activeHoursStart);
                    state[id].nextRun = new Date(Date.now() + sleepMs);
                    console.log(`😴 ${state[id].name} waiting for active hours (${formatDuration(sleepMs)})`);
                }
                continue;
            }

            // Check if it's time to run
            if (Date.now() >= state[id].nextRun.getTime()) {
                await runAndSchedule(plugin);
                anyPluginRan = true;
            }
        }

        // If any plugin ran, trigger process and push
        if (anyPluginRan) {
            await runProcessAll();
            await runPushAll();
        }
    };

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\n🔌 Shutting down...');
        await removePidFile();
        console.log('👋 Goodbye!');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Initial check
    await mainLoop();

    // Main loop
    setInterval(mainLoop, checkInterval);

    console.log('\n🎯 Daemon running. Press Ctrl+C to stop.\n');
}

main().catch(console.error);
