/**
 * Shared message processing utilities for WhatsApp collector
 */

export interface MessageKey {
    remoteJid: string;
    remoteJidAlt?: string;
    fromMe: boolean;
    id: string;
    participant?: string;
}

export interface RawMessage {
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

export interface ProcessedMessage {
    id: string;
    timestamp: number;
    time: string;
    sender: string;
    content: string;
    isFromMe: boolean;
    chatJid: string;
    chatKey: string;
    displayName: string;
    dateStr: string;
}

/**
 * Extract text content from a message
 */
export function getMessageText(message: RawMessage['message']): string {
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
export function getNormalizedJid(key: MessageKey): string | null {
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

/**
 * Sanitize JID to create a valid storage key
 */
export function jidToKey(jid: string): string {
    const isGroup = jid.endsWith('@g.us');
    const id = jid.split('@')[0];
    return isGroup ? `group-${id}` : id;
}

/**
 * Get display name for a chat
 */
export function getDisplayName(jid: string, pushName: string | undefined, isFromMe: boolean): string {
    const isGroup = jid.endsWith('@g.us');
    if (isGroup) {
        return `Group ${jid.split('@')[0]}`;
    }
    return isFromMe ? jid.split('@')[0] : (pushName || jid.split('@')[0]);
}

/**
 * Process a raw message into a ProcessedMessage
 * Returns null if message should be skipped (no content, invalid JID, etc.)
 */
export function processRawMessage(msg: RawMessage): ProcessedMessage | null {
    const msgId = msg.key?.id;
    if (!msgId) return null;

    const jid = getNormalizedJid(msg.key);
    if (!jid) return null;

    const text = getMessageText(msg.message);
    if (!text) return null;

    const timestamp = msg.messageTimestamp * 1000;
    const msgDate = new Date(timestamp);
    const dateStr = msgDate.toISOString().split('T')[0];

    const time = msgDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const isFromMe = msg.key.fromMe;
    const senderName = isFromMe ? 'Me' : (msg.pushName || 'Unknown');

    return {
        id: msgId,
        timestamp,
        time,
        sender: senderName,
        content: text,
        isFromMe,
        chatJid: jid,
        chatKey: jidToKey(jid),
        displayName: getDisplayName(jid, msg.pushName, isFromMe),
        dateStr,
    };
}
