/**
 * Shared WhatsApp Processor
 * Reconstructs conversation history from raw dumps.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { AppConfig, getResolvedPaths, getTodayString } from '../../config/config';
import {
    type RawMessage,
    type ProcessedMessage,
    processRawMessage,
} from './message-utils';

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

/**
 * Process raw dumps for the last N days and regenerate conversation files
 */
export async function processRawDumps(config: AppConfig, daysToLookBack: number): Promise<void> {
    const paths = getResolvedPaths(config);
    const targetDates = new Set(getLastNDays(daysToLookBack));

    console.log(`♻️  Processing raw dumps from last ${daysToLookBack} days: ${Array.from(targetDates).join(', ')}`);

    // Find all dump directories that exist
    let dumpDirs: string[] = [];
    try {
        const entries = await fs.readdir(paths.whatsappRawDumps, { withFileTypes: true });
        // Only look at folders that match our target dates to avoid scanning everything
        // But dumps are strictly YYYY-MM-DD
        dumpDirs = entries
            .filter((e) => e.isDirectory() && targetDates.has(e.name))
            .map((e) => e.name)
            .sort()
            .reverse();
    } catch {
        // No raw dumps yet
        return;
    }

    if (dumpDirs.length === 0) {
        console.log(`   No matching dump folders found.`);
        return;
    }

    // Global deduplication by message ID
    const seenMessageIds: Set<string> = new Set();

    // Messages grouped by date → conversation key → messages
    const allDays: AllDaysData = new Map();
    for (const dateStr of Array.from(targetDates)) {
        allDays.set(dateStr, new Map());
    }

    let processedCount = 0;

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

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(dumpsPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const dump: DumpFile = JSON.parse(content);

                if (!dump.messages) continue;

                for (const msg of dump.messages) {
                    // Dedupe by message ID
                    const msgId = msg.key?.id;
                    if (msgId && seenMessageIds.has(msgId)) {
                        continue;
                    }
                    if (msgId) seenMessageIds.add(msgId);

                    // Process message
                    const processed = processRawMessage(msg);
                    if (!processed) continue;

                    // Only process messages within our target date range
                    // (Should match unless dump contains old messages)
                    if (!targetDates.has(processed.dateStr)) continue;

                    processedCount++;

                    const dayConversations = allDays.get(processed.dateStr)!;

                    if (!dayConversations.has(processed.chatKey)) {
                        dayConversations.set(processed.chatKey, {
                            displayName: processed.displayName,
                            messages: [],
                        });
                    }

                    // Update display name if we get a better one
                    if (!processed.isFromMe && processed.displayName !== processed.chatKey) {
                        dayConversations.get(processed.chatKey)!.displayName = processed.displayName;
                    }

                    dayConversations.get(processed.chatKey)!.messages.push(processed);
                }
            } catch (e) {
                console.error(`   Error reading ${file}:`, e);
            }
        }
    }

    // Save each day's data
    await fs.mkdir(paths.whatsappLocal, { recursive: true });

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

        const localPath = path.join(paths.whatsappLocal, `whatsapp-${dateStr}.md`);
        await fs.writeFile(localPath, mindcache.toMarkdown(), 'utf-8');
    }

    console.log(`   ✅ Reconstructed headers for ${processedCount} messages across ${allDays.size} days.`);
}
