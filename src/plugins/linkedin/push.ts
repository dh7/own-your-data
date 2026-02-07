/**
 * LinkedIn PUSH script - Sync contacts and messages to GitHub
 * Run: npm run linkedin:push
 */

import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { LinkedInPluginConfig, DEFAULT_CONFIG } from './config';
import { CONTACT_SCHEMA } from '../../shared/contact';
import { loadLinkedInContacts, loadLinkedInMessages } from './utils';
import * as path from 'path';

function buildConversationTranscript(title: string, msgs: any[]): string {
    const lines = [`# ${title}`, ''];
    msgs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const msg of msgs) {
        const dateStr = msg.date.replace(' UTC', '');
        let content = msg.content || '';
        content = content
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .trim();
        lines.push(`*${dateStr}* **${msg.from}**: ${content}`);
        lines.push('');
    }
    return lines.join('\n');
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.linkedin as LinkedInPluginConfig | undefined;
    const linkedinConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = linkedinConfig.folderName || 'linkedin';

    console.log(`📤 LinkedIn Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = linkedinConfig.githubPath || 'linkedin';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const rawDumpsDir = path.join(paths.rawDumps, folderName);

    // --- SYNC CONTACTS ---
    const contacts = await loadLinkedInContacts(rawDumpsDir, false);
    if (contacts.length > 0) {
        const contactCache = new MindCache();
        contactCache.registerType('Contact', CONTACT_SCHEMA);

        for (const contact of contacts) {
            if (!contact.name) continue;
            const key = `contact_linkedin_${contact.name.replace(/\s+/g, '_').replace(/[^\w]/g, '').toLowerCase()}`;
            contactCache.set(key, JSON.stringify(contact));
            contactCache.setType(key, 'Contact');
        }
        const targetFile = `${githubPath}/linkedin.md`;

        const syncContacts = new MindCacheSync(gitStore, contactCache, {
            filePath: targetFile,
            instanceName: 'LinkedIn Contacts',
        });

        try {
            await syncContacts.save({ message: `LinkedIn: ${contacts.length} contacts` });
            console.log(`   ✅ Synced ${contacts.length} contacts to ${targetFile}`);
        } catch (error: any) {
            console.error(`   ❌ Failed to sync contacts: ${error.message}`);
        }
    } else {
        console.log('   ⚠️ No contacts to sync.');
    }

    // --- SYNC MESSAGES ---
    const messages = await loadLinkedInMessages(rawDumpsDir);
    if (messages.length > 0) {
        const messageCache = new MindCache();

        // Group by conversation
        const conversations = new Map<string, any[]>();
        for (const msg of messages) {
            if (!msg.conversationId) continue;
            if (!conversations.has(msg.conversationId)) conversations.set(msg.conversationId, []);
            conversations.get(msg.conversationId)!.push(msg);
        }

        for (const [convId, msgs] of conversations) {
            const firstMsg = msgs[0];
            const title = firstMsg.conversationTitle || 'Conversation';
            const transcript = buildConversationTranscript(title, msgs);

            const key = `linkedin_conv_${convId.replace(/[^a-zA-Z0-9]/g, '_')}`;

            // Use set_value to store raw markdown content directly
            // @ts-ignore - set_value might not be in the definition if older version, but passing string usually works for text
            if (typeof messageCache.set_value === 'function') {
                messageCache.set_value(key, transcript, {
                    contentTags: ['linkedin', 'conversation', 'message'],
                    zIndex: 0
                });
            } else {
                // Fallback if set_value missing (older mindcache?)
                // Trying to trick it by registering a lax schema
                messageCache.registerType('text', '#Text\n* content: string');
                messageCache.set(key, JSON.stringify({ content: transcript }));
                messageCache.setType(key, 'text');
            }
        }

        const messagesFile = `${githubPath}/messages.md`;
        const syncMessages = new MindCacheSync(gitStore, messageCache, {
            filePath: messagesFile,
            instanceName: 'LinkedIn Messages',
        });

        try {
            await syncMessages.save({ message: `LinkedIn: ${conversations.size} conversations (${messages.length} messages)` });
            console.log(`   ✅ Synced ${conversations.size} conversations to ${messagesFile}`);
        } catch (error: any) {
            console.error(`   ❌ Failed to sync messages: ${error.message}`);
        }
    } else {
        console.log('   ⚠️ No messages to sync.');
    }

    console.log('✨ Done!');
}

main().catch(console.error);
