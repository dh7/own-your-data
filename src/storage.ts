/**
 * MindCache storage module
 * Handles saving conversations per day with JID-based keys
 */

import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { GitHubConfig } from './config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ConversationMessage {
    timestamp: Date;
    sender: string;
    content: string;
    isFromMe: boolean;
}

/**
 * Sanitize JID to create a valid key
 * e.g., "1234567890@s.whatsapp.net" -> "1234567890"
 * e.g., "1234567890-1234567890@g.us" -> "group-1234567890-1234567890"
 */
function jidToKey(jid: string): string {
    const isGroup = jid.endsWith('@g.us');
    const id = jid.split('@')[0];
    return isGroup ? `group-${id}` : id;
}

/**
 * Storage manager for WhatsApp conversations
 */
export class ConversationStorage {
    private mindcache: MindCache;
    private sync: MindCacheSync | null = null;
    private gitStore: GitStore | null = null;
    private githubConfig: GitHubConfig | null = null;
    private currentDate: string = '';
    // Map JID -> display name (cached from first seen)
    private conversationNames: Map<string, string> = new Map();

    constructor() {
        this.mindcache = new MindCache();
    }

    /**
     * Initialize GitStore sync for a specific date
     */
    async initSync(githubConfig: GitHubConfig, date: Date = new Date()): Promise<void> {
        this.githubConfig = githubConfig;
        this.currentDate = date.toISOString().split('T')[0];
        
        this.gitStore = new GitStore({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            tokenProvider: async () => githubConfig.token,
        });

        // File per day: whatsapp-2026-01-17.md
        this.sync = new MindCacheSync(this.gitStore, this.mindcache, {
            filePath: `${githubConfig.path}/whatsapp-${this.currentDate}.md`,
            instanceName: 'WhatsApp Collector',
        });
    }

    /**
     * Load existing data from GitStore
     */
    async load(): Promise<void> {
        if (this.sync) {
            try {
                await this.sync.load();
                console.log('✅ Loaded existing data from GitHub');
            } catch (error) {
                console.log('📝 No existing data found, starting fresh');
            }
        }
    }

    /**
     * Save to GitStore and local folder
     */
    async save(message?: string): Promise<void> {
        // Save to GitHub
        if (this.sync) {
            await this.sync.save({ message: message || `Update ${new Date().toISOString()}` });
            console.log('✅ Saved to GitHub');
        }
        
        // Save locally
        await this.saveLocal();
    }

    /**
     * Save conversations locally to conversations/ folder
     * Single file per day in MindCache format (same as GitHub)
     */
    async saveLocal(): Promise<void> {
        const conversationsDir = path.join(process.cwd(), 'conversations');
        await fs.mkdir(conversationsDir, { recursive: true });

        // Save single MindCache export file per day (includes everything: messages, timestamps, tags)
        const filePath = path.join(conversationsDir, `whatsapp-${this.currentDate}.md`);
        await fs.writeFile(filePath, this.toMarkdown(), 'utf-8');
        
        const keys = this.getKeys();
        console.log(`✅ Saved locally: ${filePath} (${keys.length} conversations)`);
    }

    /**
     * Get the last timestamp for a conversation (for incremental fetch)
     * Reads from the lastTs tag in the conversation entry
     * @param jid - The WhatsApp JID (e.g., "1234567890@s.whatsapp.net")
     */
    getLastTimestamp(jid: string): number {
        const key = jidToKey(jid);
        const tags = this.mindcache.getTags(key) || [];
        
        // Find lastTs tag (format: "lastTs:1234567890000")
        const lastTsTag = tags.find((t: string) => t.startsWith('lastTs:'));
        if (lastTsTag) {
            return parseInt(lastTsTag.split(':')[1], 10) || 0;
        }
        return 0;
    }

    /**
     * Set display name for a conversation (call once when first seen)
     */
    setConversationName(jid: string, displayName: string): void {
        if (!this.conversationNames.has(jid)) {
            this.conversationNames.set(jid, displayName);
        }
    }

    /**
     * Get display name for a conversation
     */
    getConversationName(jid: string): string {
        return this.conversationNames.get(jid) || jid.split('@')[0];
    }

    /**
     * Add messages to a conversation
     * @param jid - The WhatsApp JID (unique identifier for the chat)
     * @param displayName - Human-readable name for the conversation
     * @param newMessages - Messages to add
     */
    addMessages(
        jid: string,
        displayName: string,
        newMessages: ConversationMessage[]
    ): void {
        if (newMessages.length === 0) return;

        // Cache the display name
        this.setConversationName(jid, displayName);

        const key = jidToKey(jid);

        // Get existing content
        let existing = this.mindcache.get_value(key) || '';
        
        // Deduplicate: filter out messages that already exist in content
        // Check by timestamp pattern (e.g., "*17:25:07*") which is unique per message
        newMessages = newMessages.filter(msg => {
            const time = msg.timestamp.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            // If this exact time already exists in content, skip it
            return !existing.includes(`*${time}*`);
        });
        if (newMessages.length === 0) return;

        // Format and append new messages
        const formatted = newMessages
            .map((msg) => {
                const time = msg.timestamp.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });
                const sender = msg.isFromMe ? 'Me' : msg.sender;
                return `*${time}* **${sender}**: ${msg.content}`;
            })
            .join('\n\n');

        // If first messages for this conversation, add header
        if (!existing) {
            const header = `# ${displayName} - ${this.currentDate}\n\n`;
            existing = header;
        } else {
            // Ensure there's a newline before appending
            if (!existing.endsWith('\n\n')) {
                existing = existing.trimEnd() + '\n\n';
            }
        }

        // Count total messages (existing + new)
        const existingMsgCount = (existing.match(/^\*\d{2}:\d{2}:\d{2}\*/gm) || []).length;
        const totalMessages = existingMsgCount + newMessages.length;

        // Calculate last timestamp
        const lastTs = Math.max(...newMessages.map((m) => m.timestamp.getTime()));

        // Generate tags: whatsapp, date, conversation name, lastTs
        const conversationTag = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const contentTags = ['whatsapp', this.currentDate, conversationTag, `lastTs:${lastTs}`];

        // Append new messages with metadata (lastTs stored in tags)
        this.mindcache.set_value(key, existing + formatted + '\n\n', {
            contentTags,
            zIndex: totalMessages,
        });
    }

    /**
     * Get all stored conversation keys
     */
    getKeys(): string[] {
        return this.mindcache.keys();
    }

    /**
     * Export as markdown
     */
    toMarkdown(): string {
        return this.mindcache.toMarkdown();
    }
}
