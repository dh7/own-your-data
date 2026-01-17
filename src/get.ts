/**
 * GET script - Fetch WhatsApp messages and save raw dumps
 * Run: npm run get
 * 
 * This only collects raw API data. Use `npm run process` to generate output.
 * READ-ONLY: Only fetches messages, never sends
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from './config';
import { collectRawMessages } from './collector';

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
    // Load config
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    
    const logger = new Logger(paths.logs);

    logger.log(`🚀 WhatsApp Collector - Fetching messages`);
    logger.log(`📅 Date: ${getTodayString()}`);
    logger.log(`📂 Raw dumps: ${paths.rawDumps}`);

    try {
        // Collect raw messages (saves to raw-dumps folder)
        const stats = await collectRawMessages({
            sessionPath: paths.whatsappSession,
            rawDumpsDir: paths.rawDumps,
        });

        logger.log(`📊 Received ${stats.messageCount} messages in ${stats.dumpFiles} dump files`);
        logger.log('✨ Done! Run "npm run process" to generate output.');

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
