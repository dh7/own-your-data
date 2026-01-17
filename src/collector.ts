/**
 * WhatsApp message collector
 * Only saves raw API data to disk. Processing is done separately.
 * READ-ONLY: Only fetches messages, never sends
 */

import makeWASocket, { DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs/promises';
import { useSingleFileAuthState } from './auth-utils';

export interface CollectorOptions {
    sessionPath: string;
    rawDumpsDir: string;
}

export interface CollectorStats {
    messageCount: number;
    dumpFiles: number;
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

    // Count messages
    const messageCount = data.messages?.length || 0;

    // Convert to JSON, handling binary data
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
 * Collect raw messages from WhatsApp and save to disk
 * No processing - just saves raw API responses
 */
export async function collectRawMessages(
    options: CollectorOptions
): Promise<CollectorStats> {
    const { sessionPath, rawDumpsDir } = options;

    console.log('🔄 Connecting to WhatsApp...');

    // Ensure directories exist
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.mkdir(rawDumpsDir, { recursive: true });

    // Load auth state
    const { state, saveCreds } = await useSingleFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        syncFullHistory: false, // Quick mode - just get recent messages
    });

    sock.ev.on('creds.update', saveCreds);

    let totalMessages = 0;
    let dumpFiles = 0;

    return new Promise((resolve, reject) => {
        let connectionTimeout: NodeJS.Timeout;

        // Handle full history sync (if enabled)
        sock.ev.on('messaging.history-set' as any, async (data: any) => {
            console.log(`📥 History: ${data.chats?.length || 0} chats, ${data.messages?.length || 0} messages`);
            const result = await saveRawDump(rawDumpsDir, 'history-set', data);
            totalMessages += result.messageCount;
            dumpFiles++;
        });

        // Handle message upserts (main source of messages)
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            console.log(`📨 Upsert: ${messages.length} messages (type: ${type})`);
            const result = await saveRawDump(rawDumpsDir, `upsert-${type}`, { messages, type });
            totalMessages += result.messageCount;
            dumpFiles++;
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📱 QR Code required. Run "npm run config" to authenticate.');
                reject(new Error('QR code required - run npm run config'));
                return;
            }

            if (connection === 'close') {
                clearTimeout(connectionTimeout);
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('❌ Session logged out. Run "npm run config" to re-authenticate.');
                    reject(new Error('Session logged out'));
                    return;
                }

                resolve({ messageCount: totalMessages, dumpFiles });
            }

            if (connection === 'open') {
                console.log('✅ Connected to WhatsApp');
                console.log('📥 Waiting for messages...');

                // Wait for message sync, then disconnect
                connectionTimeout = setTimeout(() => {
                    console.log('🔌 Disconnecting...');
                    sock.end(undefined);
                }, 15000);
            }
        });
    });
}
