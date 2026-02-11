/**
 * LinkedIn PROCESS script - Generate MindCache markdown files
 * Run: npm run linkedin:process
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { LinkedInPluginConfig, DEFAULT_CONFIG } from './config';
import { Contact, CONTACT_SCHEMA } from '../../shared/contact';
import { LinkedinMessage, MESSAGE_SCHEMA } from './types';
import { loadLinkedInContacts, loadLinkedInMessages } from './utils';
import { writeIfChanged } from '../../shared/write-if-changed';

function generateContactMarkdown(contacts: Contact[], exportDate: string): string {
    const lines: string[] = [
        '# MindCache STM Export',
        '',
        `Export Date: ${exportDate}`,
        '',
        '---',
        '',
        '## Contact Schema',
        '',
        '```mindcache-schema',
        CONTACT_SCHEMA.trim(),
        '```',
        '',
        '## STM Entries',
        '',
    ];

    for (const contact of contacts) {
        if (!contact.name) continue;

        const keyName = `contact_linkedin_${contact.name.replace(/\s+/g, '_').replace(/[^\w]/g, '').toLowerCase()}`;

        lines.push(`### ${keyName}`);
        lines.push(`- **Type**: \`Contact\``);
        lines.push(`- **Tags**: \`linkedin\`, \`contact\``);
        lines.push(`- **Value**:`);
        lines.push('```json');
        lines.push(JSON.stringify(contact, null, 2));
        lines.push('```');
        lines.push('');
    }

    return lines.join('\n');
}

function generateMessageMarkdown(messages: LinkedinMessage[], exportDate: string): string {
    const lines: string[] = [
        '# MindCache STM Export - Messages',
        '',
        `Export Date: ${exportDate}`,
        '',
        '---',
        '',
        '## STM Entries',
        '',
    ];

    // Group by conversation
    const conversations = new Map<string, LinkedinMessage[]>();
    for (const msg of messages) {
        if (!msg.conversationId) continue;
        if (!conversations.has(msg.conversationId)) {
            conversations.set(msg.conversationId, []);
        }
        conversations.get(msg.conversationId)!.push(msg);
    }

    for (const [convId, msgs] of conversations) {
        // Sort by date
        msgs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const firstMsg = msgs[0];
        const title = firstMsg.conversationTitle || 'Conversation';

        // Create a readable key
        const keyName = `linkedin_conv_${convId.replace(/[^a-zA-Z0-9]/g, '_')}`;

        lines.push(`### ${keyName}`);
        lines.push(`- **Type**: \`text\``);
        lines.push(`- **Tags**: \`linkedin\`, \`conversation\``);
        lines.push(`- **Value**:`);
        lines.push('```markdown');
        lines.push(`# ${title}`);
        lines.push('');

        for (const msg of msgs) {
            const dateStr = msg.date.replace(' UTC', '');

            // Basic HTML stripping
            let content = msg.content || '';
            content = content
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<[^>]+>/g, '') // Remove remaining tags
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .trim();

            lines.push(`*${dateStr}* **${msg.from}**: ${content}`);
            lines.push('');
        }
        lines.push('```');
        lines.push('');
    }

    return lines.join('\n');
}

async function main() {
    console.log('💼 LinkedIn Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.linkedin as LinkedInPluginConfig | undefined;
    const linkedinConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = linkedinConfig.folderName || 'linkedin';

    const rawDumpsDir = path.join(paths.rawDumps, folderName);
    const outputDir = path.join(paths.connectorData, folderName);
    const today = getTodayString();

    await fs.mkdir(outputDir, { recursive: true });

    // 1. Process Contacts
    const contacts = await loadLinkedInContacts(rawDumpsDir);
    if (contacts.length > 0) {
        const contactMd = generateContactMarkdown(contacts, today);
        const contactPath = path.join(outputDir, 'linkedin-contacts.md');
        const written = await writeIfChanged(contactPath, contactMd);
        if (written) {
            console.log(`   ✅ Generated ${path.basename(contactPath)} (${contacts.length} contacts)`);
        } else {
            console.log(`   ⏭️  Skipped ${path.basename(contactPath)} (no changes)`);
        }
    } else {
        console.log('   ⚠️ No contacts found.');
    }

    // 2. Process Messages
    const messages = await loadLinkedInMessages(rawDumpsDir);
    if (messages.length > 0) {
        const messageMd = generateMessageMarkdown(messages, today);
        const messagePath = path.join(outputDir, 'linkedin-messages.md');
        const convCount = new Set(messages.map(m => m.conversationId)).size;
        const written = await writeIfChanged(messagePath, messageMd);
        if (written) {
            console.log(`   ✅ Generated ${path.basename(messagePath)} (${convCount} conversations, ${messages.length} messages)`);
        } else {
            console.log(`   ⏭️  Skipped ${path.basename(messagePath)} (no changes)`);
        }
    } else {
        console.log('   ⚠️ No messages found.');
    }

    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
