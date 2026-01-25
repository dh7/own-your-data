/**
 * Unified Data Collector - Human-like scheduling daemon
 * Run: npm run get_all
 *
 * Runs forever, collecting data from all plugins with human-like timing:
 * - More active during day, sleeps at night
 * - Random delays between runs to mimic human behavior
 *
 * Each plugin's manifest defines which commands to run (get, process, push).
 * Press Ctrl+C to stop.
 */

import { spawn } from 'child_process';
import { loadConfig, getPluginConfig } from './config/config';
import { discoverPlugins, DiscoveredPlugin } from './plugins';
import { BasePluginConfig, PluginManifest } from './plugins/types';

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
        console.log(`\n🚀 Running: ${name}`);
        console.log(`   Command: ${command}`);

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

/**
 * Run all scheduled commands for a plugin based on its manifest.cmd field
 */
async function runPluginCommands(plugin: DiscoveredPlugin): Promise<boolean> {
    const { manifest } = plugin;
    const scheduledCmds = manifest.scheduler.cmd || [];

    console.log(`\n📦 ${manifest.icon} ${manifest.name} - Running scheduled commands: ${scheduledCmds.join(' → ')}`);

    for (const cmdName of scheduledCmds) {
        const command = manifest.commands[cmdName];
        if (!command) {
            console.log(`   ⚠️ Command '${cmdName}' not defined in manifest, skipping`);
            continue;
        }

        const success = await runCommand(`${manifest.name}:${cmdName}`, command);
        if (!success) {
            console.log(`   ⚠️ Command '${cmdName}' failed, stopping sequence for ${manifest.name}`);
            return false;
        }
    }

    return true;
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

    // Active scheduling hours
    const activeHoursStart = appConfig.daemon?.activeHours.start ?? 7;
    const activeHoursEnd = appConfig.daemon?.activeHours.end ?? 23;

    console.log('📋 Configuration:');
    console.log(`   Active hours: ${activeHoursStart}:00 - ${activeHoursEnd}:00`);

    // Discover all plugins
    const allPlugins = await discoverPlugins();

    if (allPlugins.length === 0) {
        console.log('⚠️ No plugins found.');
        await removePidFile();
        process.exit(0);
    }

    // Initialize state for each plugin
    const state: Record<string, PluginState> = {};

    for (const plugin of allPlugins) {
        const config = getPluginConfig(appConfig, plugin.manifest.id) as BasePluginConfig | undefined;
        const enabled = config?.enabled ?? true;
        const mode = plugin.manifest.scheduler.mode;
        const cmds = plugin.manifest.scheduler.cmd.join(', ');

        if (mode === 'interval') {
            const hours = config?.intervalHours || plugin.manifest.scheduler.defaultIntervalHours || 6;
            console.log(`   ${plugin.manifest.icon} ${plugin.manifest.name}: ${enabled ? `every ${hours}h [${cmds}]` : 'disabled'}`);
        } else {
            console.log(`   ${plugin.manifest.icon} ${plugin.manifest.name}: ${mode} mode [${cmds}] ${enabled ? '' : '(disabled)'}`);
        }

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
        const currentConfig = await loadConfig();
        const pluginConfig = getPluginConfig(currentConfig, id) as BasePluginConfig | undefined;

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

        // Run all commands defined in the manifest's scheduler.cmd array
        await runPluginCommands(plugin);

        state[id].running = false;

        // Schedule next run for interval-mode plugins
        if (plugin.manifest.scheduler.mode === 'interval') {
            const intervalHours = pluginConfig.intervalHours || plugin.manifest.scheduler.defaultIntervalHours || 6;
            const randomMinutes = pluginConfig.randomMinutes || plugin.manifest.scheduler.defaultRandomMinutes || 30;
            schedulePlugin(id, intervalHours, randomMinutes);
        }
    };

    // Check interval (every minute)
    const checkInterval = 60 * 1000;

    const mainLoop = async () => {
        const currentConfig = await loadConfig();

        for (const plugin of allPlugins) {
            const id = plugin.manifest.id;
            const pluginConfig = getPluginConfig(currentConfig, id) as BasePluginConfig | undefined;
            const mode = plugin.manifest.scheduler.mode;

            if (!pluginConfig?.enabled) continue;

            // For realtime mode plugins, check if we should run on a schedule anyway
            // (e.g., WhatsApp's push command should run periodically)
            if (mode === 'realtime') {
                // For realtime plugins, we'll run on a default 1-hour schedule
                // if they have commands to run
                if (plugin.manifest.scheduler.cmd.length > 0) {
                    if (!state[id].nextRun) {
                        const delay = Math.floor(Math.random() * 5 * 60 * 1000);
                        state[id].nextRun = new Date(Date.now() + delay);
                        console.log(`🎯 ${state[id].name} (realtime) first run in ${formatDuration(delay)}`);
                        continue;
                    }

                    if (Date.now() >= state[id].nextRun.getTime()) {
                        await runAndSchedule(plugin);
                        // Schedule next for 1 hour (realtime plugins still need periodic push)
                        schedulePlugin(id, 1, 15);
                    }
                }
                continue;
            }

            // For interval mode plugins
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
            }
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
