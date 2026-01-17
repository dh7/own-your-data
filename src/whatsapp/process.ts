/**
 * WhatsApp PROCESS script - Generate MindCache output from raw dumps
 * Run: npm run whatsapp:process
 * 
 * Reads all raw dumps for today and saves to local conversations folder.
 * Use `npm run whatsapp:push` to sync to GitHub.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths, getTodayString } from '../config/config';

interface MessageKey {
    remoteJid: string;
    remoteJidAlt?: string;
    fromMe: boolean;
    id: string;
    participant?: string;
}

interface RawMessage {
    key: MessageKey;
    messageTimestamp: number;
    pushName?: string;
    message?: {
        conversation?: string;
        extendedTextMessage?: { text?: string };
        imageMessage?: { caption?: string };
        videoMessage?: { caption?: string };
        reactionMessage?: { text?: string };
        documentMessage?: { fileName?: string };
        audioMessage?: object;
        stickerMessage?: object;
        pollCreationMessage?: { name?: string };
    };
}

interface DumpFile {
    messages: RawMessage[];
    type: string;
}

interface ConversationEntry {
    displayName: string;
    messages: Array<{
        timestamp: number;
        time: string;
        sender: string;
        content: string;
        isFromMe: boolean;
    }>;
}

/**
 * Sanitize JID to create a valid key
 */
function jidToKey(jid: string): string {
    const isGroup = jid.endsWith('@g.us');
    const id = jid.split('@')[0];
    return isGroup ? `group-${id}` : id;
}

/**
 * Extract text content from a message
 */
function getMessageText(message: RawMessage['message']): string {
    if (!message) return '';

    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return `[Image] ${message.imageMessage.caption}`;
    if (message.videoMessage?.caption) return `[Video] ${message.videoMessage.caption}`;
    if (message.documentMessage?.fileName) return `[Document] ${message.documentMessage.fileName}`;
    if (message.audioMessage) return '[Audio]';
    if (message.stickerMessage) return '[Sticker]';
    if (message.reactionMessage?.text) return `[Reaction: ${message.reactionMessage.text}]`;
    if (message.pollCreationMessage?.name) return `[Poll] ${message.pollCreationMessage.name}`;
    if (message.imageMessage) return '[Image]';
    if (message.videoMessage) return '[Video]';

    return '';
}

/**
 * Get the normalized JID (prefer phone number over LID)
 */
function getNormalizedJid(key: MessageKey): string | null {
    const rawJid = key.remoteJid;
    const altJid = key.remoteJidAlt;

    if (!rawJid) return null;

    // Groups: use as-is
    if (rawJid.endsWith('@g.us')) {
        return rawJid;
    }

    // Personal chats: prefer phone number JID over LID
    if (rawJid.endsWith('@lid') && altJid?.endsWith('@s.whatsapp.net')) {
        return altJid;
    }

    return rawJid;
}

async function main() {
    // Load config
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const today = getTodayString();

    console.log(`📂 Processing WhatsApp raw dumps for: ${today}`);
    console.log(`   Source: ${paths.whatsappRawDumps}/${today}`);
    console.log(`   Output: ${paths.conversations}`);

    const dumpsDir = path.join(paths.whatsappRawDumps, today);

    // Check if dumps exist
    try {
        await fs.access(dumpsDir);
    } catch {
        console.error(`❌ No raw dumps found for ${today}`);
        console.log('Run "npm run whatsapp:get" first to collect messages.');
        process.exit(1);
    }

    // Read all JSON files
    const files = await fs.readdir(dumpsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();

    console.log(`📄 Found ${jsonFiles.length} dump files\n`);

    // Process all messages into conversations
    const conversations: Map<string, ConversationEntry> = new Map();
    const seenMessageIds: Set<string> = new Set(); // Deduplication by message ID
    let totalMessages = 0;
    let skippedMessages = 0;

    for (const file of jsonFiles) {
        const filePath = path.join(dumpsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const dump: DumpFile = JSON.parse(content);

        console.log(`📥 ${file}: ${dump.messages?.length || 0} messages`);

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

            const jid = getNormalizedJid(msg.key);
            if (!jid) {
                skippedMessages++;
                continue;
            }

            const text = getMessageText(msg.message);
            if (!text) {
                skippedMessages++;
                continue;
            }

            const timestamp = msg.messageTimestamp * 1000;
            const msgDate = new Date(timestamp);
            
            // Filter to today only
            const msgDateStr = msgDate.toISOString().split('T')[0];
            if (msgDateStr !== today) {
                skippedMessages++;
                continue;
            }

            const time = msgDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });

            const isFromMe = msg.key.fromMe;
            const isGroup = jid.endsWith('@g.us');
            const senderName = isFromMe ? 'Me' : (msg.pushName || 'Unknown');

            const key = jidToKey(jid);

            if (!conversations.has(key)) {
                let displayName: string;
                if (isGroup) {
                    displayName = `Group ${jid.split('@')[0]}`;
                } else {
                    displayName = isFromMe ? jid.split('@')[0] : (msg.pushName || jid.split('@')[0]);
                }

                conversations.set(key, {
                    displayName,
                    messages: [],
                });
            }

            // Update display name if we get a better one from incoming message
            if (!isFromMe && msg.pushName && !isGroup) {
                conversations.get(key)!.displayName = msg.pushName;
            }

            conversations.get(key)!.messages.push({
                timestamp,
                time,
                sender: senderName,
                content: text,
                isFromMe,
            });
        }
    }

    // Sort messages by timestamp within each conversation
    for (const conv of conversations.values()) {
        conv.messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total messages: ${totalMessages}`);
    console.log(`   Skipped: ${skippedMessages}`);
    console.log(`   Conversations: ${conversations.size}`);

    // Build MindCache
    const mindcache = new MindCache();

    for (const [key, conv] of conversations) {
        const messageCount = conv.messages.length;
        const lastTs = conv.messages[conv.messages.length - 1]?.timestamp || 0;
        const conversationTag = conv.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const contentTags = ['whatsapp', today, conversationTag, `lastTs:${lastTs}`];

        // Build conversation content
        let content = `# ${conv.displayName} - ${today}\n\n`;
        for (const msg of conv.messages) {
            content += `*${msg.time}* **${msg.sender}**: ${msg.content}\n\n`;
        }

        mindcache.set_value(key, content, {
            contentTags,
            zIndex: messageCount,
        });
    }

    // Save locally
    await fs.mkdir(paths.conversations, { recursive: true });
    const localPath = path.join(paths.conversations, `whatsapp-${today}.md`);
    await fs.writeFile(localPath, mindcache.toMarkdown(), 'utf-8');
    console.log(`\n✅ Saved locally: ${localPath}`);
    console.log('💡 Run "npm run whatsapp:push" to sync to GitHub');

    // Print conversations
    console.log(`\n📝 Conversations:`);
    for (const [key, conv] of conversations) {
        console.log(`   ${conv.displayName} (${key}): ${conv.messages.length} messages`);
    }
}

main().catch(console.error);
