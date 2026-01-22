/**
 * WhatsApp PROCESS script - Generate MindCache output from raw dumps
 * Run: npm run whatsapp:process
 *
 * Reads raw dumps from the last 7 days and generates per-day output files.
 * Messages are grouped by their actual timestamp date, not collection date.
 * Use `npm run whatsapp:push` to sync to GitHub.
 *
 * NOTE: This is primarily for reprocessing old dumps. The collector now
 * processes messages inline, so you typically don't need to run this
 * unless you want to regenerate files from raw dumps.
 */

/**
 * WhatsApp PROCESS script - Generate MindCache output from raw dumps
 * Run: npm run whatsapp:process
 *
 * Reads raw dumps from the last 7 days and generates per-day output files.
 * Messages are grouped by their actual timestamp date, not collection date.
 * Use `npm run whatsapp:push` to sync to GitHub.
 */

import { loadConfig } from '../../config/config';
import { processRawDumps } from './processor';

const DAYS_TO_PROCESS = 7;

async function main() {
    // Load config
    const config = await loadConfig();

    console.log(`🚀 WhatsApp Processor`);
    await processRawDumps(config, DAYS_TO_PROCESS);
}

main().catch(console.error);
