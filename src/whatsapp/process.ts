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

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths, getTodayString } from '../config/config';
import {
    type RawMessage,
    type ProcessedMessage,
    processRawMessage,
} from './message-utils';

const DAYS_TO_PROCESS = 7;

interface DumpFile {
    messages: RawMessage[];
    type: string;
}

interface ConversationEntry {
    displayName: string;
    messages: ProcessedMessage[];
}

// Messages grouped by date, then by conversation key
type DayConversations = Map<string, ConversationEntry>;
type AllDaysData = Map<string, DayConversations>;

/**
 * Get list of date strings for the last N days (including today)
 */
function getLastNDays(n: number): string[] {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

async function main() {
    // Load config
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const today = getTodayString();
    const targetDates = new Set(getLastNDays(DAYS_TO_PROCESS));

    console.log(`📂 Processing WhatsApp raw dumps`);
    console.log(`   Source: ${paths.whatsappRawDumps}`);
    console.log(`   Output: ${paths.conversations}`);
    console.log(`   Processing messages from last ${DAYS_TO_PROCESS} days: ${Array.from(targetDates).join(', ')}\n`);

    // Find all dump directories that exist
    let dumpDirs: string[] = [];
    try {
        const entries = await fs.readdir(paths.whatsappRawDumps, { withFileTypes: true });
        dumpDirs = entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()
            .reverse(); // Most recent first
    } catch {
        console.error(`❌ No raw dumps directory found at ${paths.whatsappRawDumps}`);
        console.log('Run "npm run whatsapp:get" first to collect messages.');
        process.exit(1);
    }

    if (dumpDirs.length === 0) {
        console.error(`❌ No raw dump folders found`);
        console.log('Run "npm run whatsapp:get" first to collect messages.');
        process.exit(1);
    }

    console.log(`📁 Found ${dumpDirs.length} dump folder(s): ${dumpDirs.join(', ')}\n`);

    // Global deduplication by message ID
    const seenMessageIds: Set<string> = new Set();

    // Messages grouped by date → conversation key → messages
    const allDays: AllDaysData = new Map();
    for (const dateStr of Array.from(targetDates)) {
        allDays.set(dateStr, new Map());
    }

    let totalMessages = 0;
    let skippedMessages = 0;
    let processedMessages = 0;

    // Process all dump directories
    for (const dumpDir of dumpDirs) {
        const dumpsPath = path.join(paths.whatsappRawDumps, dumpDir);

        let jsonFiles: string[];
        try {
            const files = await fs.readdir(dumpsPath);
            jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
        } catch {
            continue;
        }

        if (jsonFiles.length === 0) continue;

        console.log(`📁 ${dumpDir}: ${jsonFiles.length} dump file(s)`);

        for (const file of jsonFiles) {
            const filePath = path.join(dumpsPath, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const dump: DumpFile = JSON.parse(content);

            if (!dump.messages) continue;

            for (const msg of dump.messages) {
                totalMessages++;

                // Dedupe by message ID
                const msgId = msg.key?.id;
                if (msgId && seenMessageIds.has(msgId)) {
                    skippedMessages++;
                    continue;
                }
                if (msgId) seenMessageIds.add(msgId);

                // Process message using shared utility
                const processed = processRawMessage(msg);
                if (!processed) {
                    skippedMessages++;
                    continue;
                }

                // Only process messages within our target date range
                if (!targetDates.has(processed.dateStr)) {
                    skippedMessages++;
                    continue;
                }

                processedMessages++;

                const dayConversations = allDays.get(processed.dateStr)!;

                if (!dayConversations.has(processed.chatKey)) {
                    dayConversations.set(processed.chatKey, {
                        displayName: processed.displayName,
                        messages: [],
                    });
                }

                // Update display name if we get a better one from incoming message
                if (!processed.isFromMe && processed.displayName !== processed.chatKey) {
                    dayConversations.get(processed.chatKey)!.displayName = processed.displayName;
                }

                dayConversations.get(processed.chatKey)!.messages.push(processed);
            }
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total messages scanned: ${totalMessages}`);
    console.log(`   Skipped (dupes/empty/out of range): ${skippedMessages}`);
    console.log(`   Processed: ${processedMessages}`);

    // Save each day's data
    await fs.mkdir(paths.conversations, { recursive: true });
    let filesWritten = 0;

    for (const [dateStr, conversations] of Array.from(allDays)) {
        if (conversations.size === 0) continue;

        // Sort messages by timestamp within each conversation
        for (const conv of Array.from(conversations.values())) {
            conv.messages.sort((a, b) => a.timestamp - b.timestamp);
        }

        // Build MindCache
        const mindcache = new MindCache();

        for (const [key, conv] of Array.from(conversations)) {
            const messageCount = conv.messages.length;
            const lastTs = conv.messages[conv.messages.length - 1]?.timestamp || 0;
            const conversationTag = conv.displayName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const contentTags = ['whatsapp', dateStr, conversationTag, `lastTs:${lastTs}`];

            // Build conversation content
            let content = `# ${conv.displayName} - ${dateStr}\n\n`;
            for (const msg of conv.messages) {
                content += `*${msg.time}* **${msg.sender}**: ${msg.content}\n\n`;
            }

            mindcache.set_value(key, content, {
                contentTags,
                zIndex: messageCount,
            });
        }

        const localPath = path.join(paths.conversations, `whatsapp-${dateStr}.md`);
        await fs.writeFile(localPath, mindcache.toMarkdown(), 'utf-8');
        filesWritten++;

        const totalMsgs = Array.from(conversations.values()).reduce((sum, c) => sum + c.messages.length, 0);
        console.log(`\n📅 ${dateStr}: ${conversations.size} conversation(s), ${totalMsgs} message(s)`);
        for (const [key, conv] of Array.from(conversations)) {
            console.log(`   ${conv.displayName} (${key}): ${conv.messages.length} messages`);
        }
    }

    console.log(`\n✅ Saved ${filesWritten} file(s) to ${paths.conversations}`);
    console.log('💡 Run "npm run whatsapp:push" to sync to GitHub');
}

main().catch(console.error);
