/**
 * Unified Data Collector - Human-like scheduling daemon
 * Run: npm run get_all
 * 
 * Runs forever, collecting data from Twitter/Instagram with human-like timing:
 * - More active during day, sleeps at night
 * - Random delays between runs to mimic human behavior
 * 
 * NOTE: WhatsApp should be run separately with `npm run whatsapp:get` 
 * as it's a real-time listener that stays connected.
 * 
 * Press Ctrl+C to stop.
 */

import { spawn, ChildProcess } from 'child_process';
import { loadConfig, SchedulerConfig, SchedulerConnectorConfig } from './config/config';

// ============ TYPES ============

interface ConnectorState {
    name: string;
    lastRun: Date | null;
    nextRun: Date | null;
    running: boolean;
    process: ChildProcess | null;
}

// ============ HUMAN-LIKE TIMING ============

/**
 * Get random variance in milliseconds
 */
function getRandomVariance(randomMinutes: number): number {
    const variance = randomMinutes * 60 * 1000;
    return Math.floor(Math.random() * variance * 2) - variance; // ±variance
}

/**
 * Check if we're in active hours
 */
function isActiveHours(config: SchedulerConfig): boolean {
    const now = new Date();
    const hour = now.getHours();

    if (config.activeHours.start < config.activeHours.end) {
        // Normal range (e.g., 7-23)
        return hour >= config.activeHours.start && hour < config.activeHours.end;
    } else {
        // Overnight range (e.g., 22-6)
        return hour >= config.activeHours.start || hour < config.activeHours.end;
    }
}

/**
 * Get milliseconds until active hours start
 */
function msUntilActiveHours(config: SchedulerConfig): number {
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = config.activeHours.start;

    let hoursUntil: number;
    if (currentHour < startHour) {
        hoursUntil = startHour - currentHour;
    } else {
        hoursUntil = 24 - currentHour + startHour;
    }

    // Add small random delay (0-30 min) to not start exactly on the hour
    const randomDelay = Math.floor(Math.random() * 30 * 60 * 1000);
    return hoursUntil * 60 * 60 * 1000 + randomDelay;
}

/**
 * Calculate next run time with human-like randomness
 */
function calculateNextRun(connectorConfig: SchedulerConnectorConfig): Date {
    const baseMs = connectorConfig.intervalHours * 60 * 60 * 1000;
    const variance = getRandomVariance(connectorConfig.randomMinutes);
    return new Date(Date.now() + baseMs + variance);
}

/**
 * Format time nicely
 */
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

// ============ CONNECTOR RUNNERS ============

/**
 * Run a connector command
 */
async function runConnector(name: string, command: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n🚀 Starting ${name}...`);

        const child = spawn('npm', ['run', command], {
            stdio: 'inherit',
            shell: true,
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
 * Run push to sync to GitHub
 */
async function runPush(): Promise<void> {
    console.log('\n📤 Pushing to GitHub...');
    await runConnector('Push', 'push');
}

// ============ MAIN DAEMON ============

// PID file for daemon status detection
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
    } catch {
        // File may not exist
    }
}

async function main() {
    console.log('🤖 Own Your Data - Unified Collector Daemon\n');
    console.log('   Twitter & Instagram with human-like timing');
    console.log('   (WhatsApp: run separately with npm run whatsapp:get)');
    console.log('   Press Ctrl+C to stop.\n');

    await writePidFile();

    const appConfig = await loadConfig();
    const config = appConfig.scheduler;

    if (!config) {
        console.log('⚠️ No scheduler config found. Using defaults.');
    }

    const scheduler: SchedulerConfig = config || {
        activeHours: { start: 7, end: 23 },
        twitter: { enabled: true, intervalHours: 6, randomMinutes: 30 },
        instagram: { enabled: true, intervalHours: 6, randomMinutes: 30 },
        push: { enabled: true, intervalHours: 1 },
    };

    console.log('📋 Configuration:');
    console.log(`   Active hours: ${scheduler.activeHours.start}:00 - ${scheduler.activeHours.end}:00`);
    console.log(`   Twitter: ${scheduler.twitter?.enabled ? `every ${scheduler.twitter.intervalHours}h (±${scheduler.twitter.randomMinutes}min)` : 'disabled'}`);
    console.log(`   Instagram: ${scheduler.instagram?.enabled ? `every ${scheduler.instagram.intervalHours}h (±${scheduler.instagram.randomMinutes}min)` : 'disabled'}`);
    console.log(`   Push: ${scheduler.push?.enabled ? `every ${scheduler.push.intervalHours}h` : 'disabled'}\n`);

    // State tracking for connectors
    const state: Record<string, ConnectorState> = {
        twitter: { name: 'Twitter', lastRun: null, nextRun: null, running: false, process: null },
        instagram: { name: 'Instagram', lastRun: null, nextRun: null, running: false, process: null },
    };

    // Push state tracking
    let lastPushTime: Date | null = null;
    let nextPushTime: Date | null = null;

    // Schedule next run for a connector
    const scheduleConnector = (id: string, connConfig: SchedulerConnectorConfig) => {
        if (!connConfig.enabled) return;

        const nextRun = calculateNextRun(connConfig);
        state[id].nextRun = nextRun;

        const msUntil = nextRun.getTime() - Date.now();
        console.log(`⏰ ${state[id].name} scheduled for ${formatTime(nextRun)} (in ${formatDuration(msUntil)})`);
    };

    // Run a connector and schedule next
    const runAndSchedule = async (id: string, command: string, connConfig: SchedulerConnectorConfig) => {
        if (state[id].running) {
            console.log(`⏩ ${state[id].name} already running, skipping`);
            return;
        }

        // Check if we're in active hours
        if (!isActiveHours(scheduler)) {
            const sleepMs = msUntilActiveHours(scheduler);
            console.log(`😴 Outside active hours. ${state[id].name} sleeping for ${formatDuration(sleepMs)}`);
            state[id].nextRun = new Date(Date.now() + sleepMs);
            return;
        }

        state[id].running = true;
        state[id].lastRun = new Date();

        await runConnector(state[id].name, command);

        state[id].running = false;

        // Schedule next run
        scheduleConnector(id, connConfig);
    };

    // Main loop interval (check every minute)
    const checkInterval = 60 * 1000;

    const mainLoop = async () => {
        // Check each connector
        for (const [id, connState] of Object.entries(state)) {
            const connConfig = scheduler[id as keyof typeof scheduler] as SchedulerConnectorConfig | undefined;

            if (!connConfig?.enabled) continue;

            // First run - schedule immediately or after active hours
            if (!connState.nextRun) {
                if (isActiveHours(scheduler)) {
                    // Run now with small random delay (0-5 min)
                    const delay = Math.floor(Math.random() * 5 * 60 * 1000);
                    connState.nextRun = new Date(Date.now() + delay);
                    console.log(`🎯 ${connState.name} first run in ${formatDuration(delay)}`);
                } else {
                    const sleepMs = msUntilActiveHours(scheduler);
                    connState.nextRun = new Date(Date.now() + sleepMs);
                    console.log(`😴 ${connState.name} waiting for active hours (${formatDuration(sleepMs)})`);
                }
                continue;
            }

            // Check if it's time to run
            if (Date.now() >= connState.nextRun.getTime()) {
                const command = id === 'twitter' ? 'twitter:get' : 'instagram:get';
                await runAndSchedule(id, command, connConfig);
            }
        }

        // Check if it's time to push
        if (scheduler.push?.enabled) {
            if (!nextPushTime) {
                // Schedule first push
                const pushIntervalMs = scheduler.push.intervalHours * 60 * 60 * 1000;
                nextPushTime = new Date(Date.now() + pushIntervalMs);
                console.log(`📤 Push scheduled for ${formatTime(nextPushTime)} (in ${formatDuration(pushIntervalMs)})`);
            } else if (Date.now() >= nextPushTime.getTime()) {
                // Time to push
                await runPush();
                lastPushTime = new Date();

                // Schedule next push
                const pushIntervalMs = scheduler.push.intervalHours * 60 * 60 * 1000;
                nextPushTime = new Date(Date.now() + pushIntervalMs);
                console.log(`📤 Next push at ${formatTime(nextPushTime)} (in ${formatDuration(pushIntervalMs)})`);
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
