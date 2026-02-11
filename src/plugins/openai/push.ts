/**
 * OpenAI PUSH script - Sync conversations to GitHub
 * Run: npm run openai:push
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { OpenAIPluginConfig, DEFAULT_CONFIG } from './config';
import { initPluginLog } from '../../shared/plugin-logger';

async function main() {
    initPluginLog('openai');
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.openai as OpenAIPluginConfig | undefined;
    const openaiConfig = pluginConfig || DEFAULT_CONFIG;

    console.log(`🤖 OpenAI Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = openaiConfig.githubPath || 'openai';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const outputDir = path.join(paths.connectorData, 'openai');
    const mdPath = path.join(outputDir, 'openai-conversations.md');

    try {
        await fs.access(mdPath);
    } catch {
        console.log(`⚠️ No processed data found. Run "npm run openai:process" first.`);
        return;
    }

    // Load the processed markdown file directly?
    // MindCacheSync wants a MindCache object.
    // Ideally we should re-generate the object like other plugins do (reading raw source)
    // to benefit from parsing logic being the source of truth.
    // Reuse the process script logic?
    // For simplicity and robustness (avoiding copy-paste logic), let's import the processing/loading logic
    // OR just parse back the markdown if it was perfect MindCache markdown?
    // MindCache library has `fromMarkdown`.

    // Let's try loading the MD file back into MindCache!
    // This is valid if we trust the `process` step output.

    console.log(`   Loading data from ${mdPath}...`);
    const mdContent = await fs.readFile(mdPath, 'utf-8');
    const mindcache = new MindCache();

    // Naive reconstruct or use MindCache.fromMarkdown if available (it might not be in the version we use)
    // Actually, `MindCache` class structure usually has a way to hydrate.
    // If not, we have to copy-paste the extraction logic from process.ts.
    // Let's try to copy process logic for safety as `fromMarkdown` can be tricky with complex content.

    // ... Actually, importing `main` from process.ts runs it. Refactor `process.ts` to export `loadConversations`?
    // I'll copy the logic for now, it's safer than relying on hidden exports.
    // Wait, let's look at `process.ts` I just wrote. It finds the file.

    // RE-IMPLEMENTING LOADING logic for robustness:
    const baseRawDir = path.join(paths.rawDumps, 'openAI');
    let targetFile = '';

    if (openaiConfig.exportFolder) {
        let checkPath = path.join(baseRawDir, openaiConfig.exportFolder);
        if ((await fs.stat(checkPath).catch(() => null))?.isDirectory()) {
            checkPath = path.join(checkPath, 'conversations.json');
        }
        targetFile = checkPath;
    } else {
        try {
            const entries = await fs.readdir(baseRawDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const candidate = path.join(baseRawDir, entry.name, 'conversations.json');
                    try { await fs.access(candidate); targetFile = candidate; break; } catch { }
                }
            }
        } catch { }
    }

    if (!targetFile) {
        console.log('   ⚠️ Source file not found to sync.');
        return;
    }

    const { OpenAIExport, OpenAINode } = require('./types');

    // Helper helpers
    function recreateConversation(mapping: any, leafId: string) {
        const thread: any[] = [];
        let currentNodeId = leafId;
        while (currentNodeId) {
            const node = mapping[currentNodeId];
            if (!node) break;
            if (node.message) thread.unshift(node);
            currentNodeId = node.parent;
        }
        return thread;
    }

    function formatMessageContent(content: any) {
        if (!content) return '';
        if (content.content_type === 'text') return content.parts?.join('') || '';
        if (content.content_type === 'code') return `\`\`\`${content.language || ''}\n${content.text || ''}\n\`\`\``;
        if (content.parts) return content.parts.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('');
        return '';
    }

    const rawData = await fs.readFile(targetFile, 'utf-8');
    const conversations = JSON.parse(rawData);

    const syncCache = new MindCache();

    for (const conv of conversations) {
        if (!conv.current_node) continue;
        const thread = recreateConversation(conv.mapping, conv.current_node);
        if (thread.length === 0) continue;

        const title = conv.title || 'Untitled Conversation';
        const date = new Date(conv.create_time * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const convId = conv.id || conv.conversation_id || `conv_${date.getTime()}`;
        const key = `openai_${convId}`;

        const transcriptLines = [`# ${title}`, `Date: ${date.toLocaleString()}`, ''];
        for (const node of thread) {
            const text = formatMessageContent(node.message.content);
            if (!text || !text.trim()) continue;

            const role = node.message.author.role.toUpperCase();
            transcriptLines.push(`**${role}**:`);
            transcriptLines.push(text);
            transcriptLines.push('');
        }

        syncCache.set_value(key, transcriptLines.join('\n'), {
            contentTags: ['openai', 'chatgpt', dateStr],
            zIndex: 0
        });
    }

    const syncFile = `${githubPath}/conversations.md`;
    const sync = new MindCacheSync(gitStore, syncCache, {
        filePath: syncFile,
        instanceName: 'OpenAI Connector',
    });

    try {
        await sync.save({ message: `OpenAI: ${conversations.length} conversations` });
        console.log(`   ✅ Synced ${conversations.length} conversations to ${syncFile}`);
    } catch (error: any) {
        console.error(`   ❌ Failed to sync: ${error.message}`);
    }

    console.log('✨ Done!');
}

main().catch(console.error);
