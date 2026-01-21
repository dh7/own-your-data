/**
 * WhatsApp message collector - Long-running mode
 * Runs until Ctrl+C, saves raw API data and processes to MindCache inline.
 * READ-ONLY: Only fetches messages, never sends
 */

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, type WAMessage } from 'baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs/promises';
import { useSingleFileAuthState } from '../shared/auth-utils';
import { getMediaExtension } from './message-utils';

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

/**
 * Download and save media from a message
 * Returns the relative path to the saved file, or null if no media
 */
async function downloadAndSaveMedia(
    msg: WAMessage,
    conversationsDir: string,
    dateStr: string
): Promise<string | null> {
    const ext = getMediaExtension((msg.message || undefined) as any);
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
 * Process incoming messages: dedupe, download media, then trigger reprocessing
 */
async function processMessages(
    messages: WAMessage[],
    conversationsDir: string,
    stats: CollectorStats
): Promise<void> {
    // 1. Download media for all messages first
    for (const msg of messages) {
        const msgId = msg.key?.id;
        if (!msgId) continue;

        // Dedupe check for downloading
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

        // Download media (ignoring return value as processor derives path)
        await downloadAndSaveMedia(msg, conversationsDir, dateStr);

        stats.processedMessages++;
    }

    // 2. Trigger reprocessing of the last 3 days from raw dumps
    // This ensures consistency by reconstructing from the source of truth (files)
    try {
        const config = await import('../config/config').then(m => m.loadConfig());
        const { processRawDumps } = await import('./processor');
        await processRawDumps(config, 3);
    } catch (e) {
        console.error('⚠️ Error during reprocessing:', e);
    }
}

/**
 * Collect raw messages from WhatsApp and save to disk
 * Runs until Ctrl+C or logout (auto-reconnects on temporary disconnects)
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

    const stats: CollectorStats = {
        messageCount: 0,
        dumpFiles: 0,
        processedMessages: 0,
        skippedDupes: 0,
    };

    let isShuttingDown = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    const createSocket = async (): Promise<CollectorStats> => {
        const sock = makeWASocket({
            auth: state,
            version,
            syncFullHistory: false,
        });

        sock.ev.on('creds.update', saveCreds);

        return new Promise((resolve, reject) => {
            // Graceful shutdown handler
            const shutdown = async () => {
                if (isShuttingDown) return;
                isShuttingDown = true;
                console.log('\n🔌 Disconnecting...');
                sock.end(undefined);
                resolve(stats);
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

                    if (isShuttingDown) {
                        resolve(stats);
                        return;
                    }

                    // Auto-reconnect on temporary disconnects
                    reconnectAttempts++;
                    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                        const delay = Math.min(reconnectAttempts * 2000, 30000); // Exponential backoff, max 30s
                        console.log(`📴 Connection closed. Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                        setTimeout(async () => {
                            try {
                                const result = await createSocket();
                                resolve(result);
                            } catch (e) {
                                reject(e);
                            }
                        }, delay);
                    } else {
                        console.error('❌ Max reconnect attempts reached. Stopping.');
                        resolve(stats);
                    }
                }

                if (connection === 'open') {
                    reconnectAttempts = 0; // Reset on successful connection
                    console.log('✅ Connected to WhatsApp');
                    console.log('📥 Listening for messages... (Ctrl+C to stop)\n');
                }
            });
        });
    };

    return createSocket();
}
