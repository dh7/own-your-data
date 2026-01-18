/**
 * WhatsApp message collector - Long-running mode
 * Runs until Ctrl+C, saves raw API data and processes to MindCache inline.
 * READ-ONLY: Only fetches messages, never sends
 */

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, type WAMessage } from 'baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MindCache } from 'mindcache';
import { useSingleFileAuthState } from '../shared/auth-utils';
import { processRawMessage, type RawMessage, type ProcessedMessage } from './message-utils';

export interface CollectorOptions {
    sessionPath: string;
    rawDumpsDir: string;
    conversationsDir: string;
}

export interface CollectorStats {
    messageCount: number;
    dumpFiles: number;
    processedMessages: number;
    skippedDupes: number;
}

// In-memory deduplication
const seenMessageIds = new Set<string>();

// Accumulated messages per day for MindCache generation
type DayMessages = Map<string, ProcessedMessage[]>; // chatKey -> messages
const messagesByDay = new Map<string, DayMessages>(); // dateStr -> conversations

/**
 * Get file extension for media type
 */
function getMediaExtension(msg: WAMessage): string | null {
    const message = msg.message;
    if (!message) return null;

    if (message.imageMessage) return 'jpg';
    if (message.videoMessage) return 'mp4';
    if (message.audioMessage) return 'ogg';
    if (message.stickerMessage) return 'webp';
    if (message.documentMessage) {
        const fileName = message.documentMessage.fileName;
        if (fileName) {
            const parts = fileName.split('.');
            if (parts.length > 1) return parts.pop()!;
        }
        return 'bin';
    }
    return null;
}

/**
 * Download and save media from a message
 * Returns the relative path to the saved file, or null if no media
 */
async function downloadAndSaveMedia(
    msg: WAMessage,
    conversationsDir: string,
    dateStr: string
): Promise<string | null> {
    const ext = getMediaExtension(msg);
    if (!ext) return null;

    const msgId = msg.key?.id;
    if (!msgId) return null;

    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        if (!buffer) return null;

        // Create media directory for this date
        const mediaDir = path.join(conversationsDir, 'media', dateStr);
        await fs.mkdir(mediaDir, { recursive: true });

        // Generate filename with timestamp
        const timestamp = msg.messageTimestamp
            ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp))
            : Math.floor(Date.now() / 1000);
        const filename = `${timestamp}-${msgId}.${ext}`;
        const filepath = path.join(mediaDir, filename);

        await fs.writeFile(filepath, buffer as Buffer);
        console.log(`📷 Saved media: media/${dateStr}/${filename}`);

        // Return relative path from conversations folder
        return `./media/${dateStr}/${filename}`;
    } catch (error) {
        console.error(`⚠️ Failed to download media for ${msgId}:`, error);
        return null;
    }
}

/**
 * Save raw API data to file
 */
async function saveRawDump(
    rawDumpsDir: string,
    eventName: string,
    data: any
): Promise<{ filepath: string; messageCount: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dateStr = timestamp.split('T')[0];
    const dumpDir = path.join(rawDumpsDir, dateStr);
    await fs.mkdir(dumpDir, { recursive: true });

    const filename = `${timestamp}-${eventName}.json`;
    const filepath = path.join(dumpDir, filename);

    const messageCount = data.messages?.length || 0;

    const jsonData = JSON.stringify(
        data,
        (key, value) => {
            if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
                return `[Binary: ${value.length} bytes]`;
            }
            return value;
        },
        2
    );

    await fs.writeFile(filepath, jsonData);
    console.log(`💾 Raw dump: ${filename} (${messageCount} messages)`);
    return { filepath, messageCount };
}

/**
 * Update MindCache file for a specific day
 */
async function updateMindCacheForDay(conversationsDir: string, dateStr: string): Promise<void> {
    const dayMessages = messagesByDay.get(dateStr);
    if (!dayMessages || dayMessages.size === 0) return;

    const mindcache = new MindCache();

    for (const [chatKey, messages] of dayMessages) {
        if (messages.length === 0) continue;

        // Sort by timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);

        const displayName = messages[0].displayName;
        const lastTs = messages[messages.length - 1].timestamp;
        const conversationTag = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const contentTags = ['whatsapp', dateStr, conversationTag, `lastTs:${lastTs}`];

        let content = `# ${displayName} - ${dateStr}\n\n`;
        for (const msg of messages) {
            content += `*${msg.time}* **${msg.sender}**: ${msg.content}\n\n`;
        }

        mindcache.set_value(chatKey, content, {
            contentTags,
            zIndex: messages.length,
        });
    }

    await fs.mkdir(conversationsDir, { recursive: true });
    const localPath = path.join(conversationsDir, `whatsapp-${dateStr}.md`);
    await fs.writeFile(localPath, mindcache.toMarkdown(), 'utf-8');
    console.log(`📝 Updated: whatsapp-${dateStr}.md (${dayMessages.size} conversations)`);
}

/**
 * Process incoming messages: dedupe, add to accumulator, update MindCache
 */
async function processMessages(
    messages: WAMessage[],
    conversationsDir: string,
    stats: CollectorStats
): Promise<void> {
    const updatedDates = new Set<string>();

    for (const msg of messages) {
        const msgId = msg.key?.id;
        if (!msgId) continue;

        // Dedupe
        if (seenMessageIds.has(msgId)) {
            stats.skippedDupes++;
            continue;
        }
        seenMessageIds.add(msgId);

        // Get dateStr for media download path
        const timestamp = msg.messageTimestamp
            ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp))
            : Math.floor(Date.now() / 1000);
        const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];

        // Download media first (if any)
        const mediaPath = await downloadAndSaveMedia(msg, conversationsDir, dateStr);

        // Process the message with media path
        const processed = processRawMessage(msg as unknown as RawMessage, mediaPath || undefined);
        if (!processed) continue;

        stats.processedMessages++;

        // Add to accumulator
        if (!messagesByDay.has(processed.dateStr)) {
            messagesByDay.set(processed.dateStr, new Map());
        }
        const dayMessages = messagesByDay.get(processed.dateStr)!;
        if (!dayMessages.has(processed.chatKey)) {
            dayMessages.set(processed.chatKey, []);
        }
        dayMessages.get(processed.chatKey)!.push(processed);

        updatedDates.add(processed.dateStr);
    }

    // Update MindCache files for affected dates
    for (const dateStr of updatedDates) {
        await updateMindCacheForDay(conversationsDir, dateStr);
    }
}

/**
 * Collect raw messages from WhatsApp and save to disk
 * Runs until Ctrl+C or disconnect
 */
export async function collectRawMessages(
    options: CollectorOptions
): Promise<CollectorStats> {
    const { sessionPath, rawDumpsDir, conversationsDir } = options;

    console.log('🔄 Connecting to WhatsApp...');
    console.log('   Press Ctrl+C to stop collection.\n');

    // Ensure directories exist
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.mkdir(rawDumpsDir, { recursive: true });
    await fs.mkdir(conversationsDir, { recursive: true });

    // Load auth state
    const { state, saveCreds } = await useSingleFileAuthState(sessionPath);

    // Fetch latest version for stability
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📦 Using Baileys version: ${version.join('.')}`);

    const sock = makeWASocket({
        auth: state,
        version,
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    const stats: CollectorStats = {
        messageCount: 0,
        dumpFiles: 0,
        processedMessages: 0,
        skippedDupes: 0,
    };

    return new Promise((resolve, reject) => {
        let isShuttingDown = false;

        // Graceful shutdown handler
        const shutdown = async () => {
            if (isShuttingDown) return;
            isShuttingDown = true;
            console.log('\n🔌 Disconnecting...');
            sock.end(undefined);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Handle history sync
        sock.ev.on('messaging-history.set' as any, async (data: any) => {
            console.log(`📥 History: ${data.chats?.length || 0} chats, ${data.messages?.length || 0} messages`);
            const result = await saveRawDump(rawDumpsDir, 'history-set', data);
            stats.messageCount += result.messageCount;
            stats.dumpFiles++;

            if (data.messages?.length > 0) {
                await processMessages(data.messages, conversationsDir, stats);
            }
        });

        // Handle message upserts (main source of messages)
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            console.log(`📨 Upsert: ${messages.length} messages (type: ${type})`);
            const result = await saveRawDump(rawDumpsDir, `upsert-${type}`, { messages, type });
            stats.messageCount += result.messageCount;
            stats.dumpFiles++;

            await processMessages(messages, conversationsDir, stats);
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📱 QR Code required. Run "npm run config" to authenticate.');
                reject(new Error('QR code required - run npm run config'));
                return;
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('❌ Session logged out. Run "npm run config" to re-authenticate.');
                    reject(new Error('Session logged out'));
                    return;
                }

                // Any disconnect = stop (no auto-reconnect per user request)
                console.log('📴 Connection closed.');
                resolve(stats);
            }

            if (connection === 'open') {
                console.log('✅ Connected to WhatsApp');
                console.log('📥 Listening for messages... (Ctrl+C to stop)\n');
            }
        });
    });
}
