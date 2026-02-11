/**
 * WhatsApp GET script - Fetch messages and process inline
 * Run: npm run whatsapp:get
 *
 * Long-running collector that saves raw API data and processes to MindCache inline.
 * Press Ctrl+C to stop. Use `npm run whatsapp:push` to sync to GitHub.
 * READ-ONLY: Only fetches messages, never sends
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { collectRawMessages } from './collector';
import { initPluginLog } from '../../shared/plugin-logger';

/**
 * Logger that writes to both console and file
 */
class Logger {
    private logDir: string;
    private logPath: string = '';
    private logs: string[] = [];
    private startTime: Date;

    constructor(logDir: string) {
        this.logDir = logDir;
        this.startTime = new Date();
        const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
        this.logPath = path.join(logDir, `collect-${timestamp}.log`);
    }

    log(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}`;
        console.log(message);
        this.logs.push(line);
    }

    error(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ERROR: ${message}`;
        console.error(`❌ ${message}`);
        this.logs.push(line);
    }

    async save(): Promise<string> {
        await fs.mkdir(this.logDir, { recursive: true });
        const duration = (Date.now() - this.startTime.getTime()) / 1000;
        this.logs.push(`\n[${new Date().toISOString()}] Completed in ${duration.toFixed(1)}s`);
        await fs.writeFile(this.logPath, this.logs.join('\n'), 'utf-8');
        return this.logPath;
    }
}

async function main() {
    initPluginLog('whatsapp');
    // Load config
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const logger = new Logger(paths.whatsappLogs);

    logger.log(`🚀 WhatsApp Collector - Long-running mode`);
    logger.log(`📅 Started: ${getTodayString()}`);
    logger.log(`📂 Raw dumps: ${paths.whatsappRawDumps}`);
    logger.log(`📂 Conversations: ${paths.whatsappLocal}`);
    logger.log(`   Press Ctrl+C to stop.\n`);

    try {
        // Collect raw messages and process inline
        const stats = await collectRawMessages({
            sessionPath: paths.whatsappSession,
            rawDumpsDir: paths.whatsappRawDumps,
            conversationsDir: paths.whatsappLocal,
        });

        logger.log(`\n📊 Session Summary:`);
        logger.log(`   Raw messages received: ${stats.messageCount}`);
        logger.log(`   Dump files created: ${stats.dumpFiles}`);
        logger.log(`   Messages processed: ${stats.processedMessages}`);
        logger.log(`   Duplicates skipped: ${stats.skippedDupes}`);
        logger.log('✨ Done! Run "npm run whatsapp:push" to sync to GitHub.');

        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);

        process.exit(0);
    } catch (error) {
        logger.error(String(error));
        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);
        process.exit(1);
    }
}

main();

