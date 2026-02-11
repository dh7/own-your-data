/**
 * OpenAI PROCESS script - Generate MindCache markdown from ChatGPT export
 * Run: npm run openai:process
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { OpenAIPluginConfig, DEFAULT_CONFIG } from './config';
import { OpenAIExport, OpenAINode } from './types';
import { writeIfChanged } from '../../shared/write-if-changed';
import { initPluginLog } from '../../shared/plugin-logger';

// Helper to reconstruct conversation thread from leaf node
function recreateConversation(mapping: { [key: string]: OpenAINode }, leafId: string): OpenAINode[] {
    const thread: OpenAINode[] = [];
    let currentNodeId: string | null = leafId;

    while (currentNodeId) {
        const node: OpenAINode | undefined = mapping[currentNodeId];
        if (!node) break;

        // Only add nodes with messages (skip system root nodes often empty)
        if (node.message) {
            thread.unshift(node);
        }

        currentNodeId = node.parent;
    }
    return thread;
}

function formatMessageContent(content: any): string {
    if (!content) return '';
    if (content.content_type === 'text') {
        return content.parts?.join('') || '';
    }
    if (content.content_type === 'code') {
        return `\`\`\`${content.language || ''}\n${content.text || ''}\n\`\`\``;
    }
    // Handle multimodal/other types if needed
    if (content.parts) {
        return content.parts.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('');
    }
    return '';
}

async function main() {
    initPluginLog('openai');
    console.log('🤖 OpenAI Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.openai as OpenAIPluginConfig | undefined;
    const openaiConfig = pluginConfig || DEFAULT_CONFIG;

    const baseRawDir = path.join(paths.rawDumps, 'openAI');
    let targetFile = '';

    // Determine path
    if (openaiConfig.exportFolder) {
        // User pointed to specific file or folder
        let checkPath = path.join(baseRawDir, openaiConfig.exportFolder);
        if ((await fs.stat(checkPath).catch(() => null))?.isDirectory()) {
            checkPath = path.join(checkPath, 'conversations.json');
        }
        targetFile = checkPath;
    } else {
        // Auto-detect: find first folder with conversations.json
        try {
            const entries = await fs.readdir(baseRawDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const candidate = path.join(baseRawDir, entry.name, 'conversations.json');
                    try {
                        await fs.access(candidate);
                        targetFile = candidate;
                        console.log(`   Found export file: ${entry.name}/conversations.json`);
                        break;
                    } catch { }
                }
            }
        } catch (e) {
            console.log('   ⚠️ Could not read raw-dumps/openAI directory.');
        }
    }

    if (!targetFile) {
        console.log('   ⚠️ No conversations.json found. Please configure exportFolder or place file in raw-dumps/openAI/<folder>/');
        return;
    }

    console.log(`   Reading ${targetFile}...`);

    // Read JSON (stream or read all? exports can be huge. 
    // For Node.js fs.readFile limited to 2GB string. 
    // If >2GB, need streaming JSON parser. Assuming it fits for now.)
    let conversations: OpenAIExport[] = [];
    try {
        const rawData = await fs.readFile(targetFile, 'utf-8');
        conversations = JSON.parse(rawData);
    } catch (e: any) {
        console.error(`   ❌ Failed to parse JSON: ${e.message}`);
        return;
    }

    console.log(`   Processing ${conversations.length} conversations...`);

    const outputDir = path.join(paths.connectorData, 'openai');
    await fs.mkdir(outputDir, { recursive: true });

    // We will generate ONE huge markdown file? Or separate? 
    // Standard MindCache practice: one file per "source" usually, but 30k conversations might be big.
    // However, WhatsApp puts all messages in one file per day.
    // OpenAI export is all-time.
    // Let's stick effectively to one file: openai-conversations.md
    // OR we could split by month/year if needed.
    // Let's try one file first.

    const mindcache = new MindCache();

    for (const conv of conversations) {
        if (!conv.current_node) continue;

        // Reconstruct thread
        const thread = recreateConversation(conv.mapping, conv.current_node);
        if (thread.length === 0) continue;

        // Build Markdown content
        const title = conv.title || 'Untitled Conversation';
        const date = new Date(conv.create_time * 1000);
        const dateStr = date.toISOString().split('T')[0];

        // Unique Key: Use conversation ID
        // Note: OpenAI export doesn't explicitly give conversation ID in the root object in older exports?
        // Wait, the root array element IS the conversation object?
        // Let's check the type definition again. Yes, array of objects.
        // Does the object have an ID? The snippet showed: {"title": ..., "create_time": ..., "mapping": ...}
        // It should have "conversation_id" or "id".
        // Let's assume we can generate a key from create_time + title hash or assume an ID exists.
        // Typically it has `id` or `conversation_id`.
        // Let's look at the snippet again...
        // `[{"title": "Embed website with menu", "create_time": ...`
        // I don't see an ID in the head.
        // I'll fail-safe: use create_time and title to make a key.
        const convId = (conv as any).id || (conv as any).conversation_id || `conv_${date.getTime()}`;
        const key = `openai_${convId}`;

        const transcriptLines = [`# ${title}`, `Date: ${date.toLocaleString()}`, ''];

        for (const node of thread) {
            if (!node.message) continue;

            const text = formatMessageContent(node.message.content);
            // Skip empty messages (common with system start nodes or empty tool outputs)
            if (!text || !text.trim()) continue;

            const role = node.message.author.role.toUpperCase();

            transcriptLines.push(`**${role}**:`);
            transcriptLines.push(text);
            transcriptLines.push('');
        }

        // Store in MindCache
        mindcache.set_value(key, transcriptLines.join('\n'), {
            contentTags: ['openai', 'chatgpt', dateStr],
            zIndex: 0
        });
    }

    const mdPath = path.join(outputDir, 'openai-conversations.md');
    const written = await writeIfChanged(mdPath, mindcache.toMarkdown());

    if (written) {
        console.log(`   ✅ Generated ${path.basename(mdPath)} (${conversations.length} conversations)`);
    } else {
        console.log(`   ⏭️  Skipped ${path.basename(mdPath)} (no changes)`);
    }
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
