#!/usr/bin/env ts-node
/**
 * Scheduler Entry Point
 * 
 * PM2-style orchestrator that:
 * - Manages long-running servers (config, chrome-history, whatsapp)
 * - Runs scheduled tasks (get, process, push)
 * - Provides status API for monitoring
 * 
 * Usage: npm run start
 */

import { processManager } from './process-manager';
import { taskRunner } from './task-runner';
import { startStatusApi } from './status-api';
import { loadSchedulerConfig } from '../config/config';
import { discoverPlugins, getServerPlugins } from '../plugins/index';

const STATUS_API_PORT = 3455;

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🚀 SecondBrain Scheduler');
    console.log('═══════════════════════════════════════════════\n');

    // Load scheduler config
    const schedulerConfig = await loadSchedulerConfig();
    console.log('📋 Loaded scheduler config');

    // Discover plugins
    const plugins = await discoverPlugins();
    console.log(`📦 Discovered ${plugins.length} plugins\n`);

    // Start status API first
    await startStatusApi(STATUS_API_PORT);

    // Register servers from config
    console.log('\n📝 Registering servers...');
    
    // Always register config server
    if (schedulerConfig.servers.config) {
        processManager.register({
            name: 'config',
            script: 'config',
            restartOnCrash: schedulerConfig.servers.config.restartOnCrash ?? true,
        });
    }

    // Register plugin servers
    const serverPlugins = await getServerPlugins();
    for (const plugin of serverPlugins) {
        const serverConfig = schedulerConfig.servers[plugin.manifest.id];
        if (serverConfig) {
            processManager.register({
                name: plugin.manifest.id,
                script: `${plugin.manifest.id}:server`,
                restartOnCrash: serverConfig.restartOnCrash ?? true,
            });
        }
    }

    // Start servers that are configured to auto-start
    console.log('\n🚀 Starting auto-start servers...');
    for (const [name, config] of Object.entries(schedulerConfig.servers)) {
        if (config.autoStart) {
            await processManager.start(name);
        }
    }

    // Start task runner
    console.log('\n📅 Starting task runner...');
    await taskRunner.start();

    // Print status summary
    console.log('\n═══════════════════════════════════════════════');
    console.log('  ✅ Scheduler is running');
    console.log(`  📊 Status API: http://localhost:${STATUS_API_PORT}/status`);
    console.log('  ⏹️  Press Ctrl+C to stop');
    console.log('═══════════════════════════════════════════════\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n\n🛑 Shutting down...');
        taskRunner.stop();
        await processManager.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n\n🛑 Shutting down...');
        taskRunner.stop();
        await processManager.shutdown();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
