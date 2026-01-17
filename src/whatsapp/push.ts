/**
 * WhatsApp PUSH script - Sync conversations to GitHub
 * Run: npm run whatsapp:push
 * 
 * Reads the local whatsapp-YYYY-MM-DD.md and pushes to GitHub.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../config/config';

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const today = getTodayString();

    const localPath = path.join(paths.conversations, `whatsapp-${today}.md`);

    console.log(`📤 WhatsApp Push - Syncing to GitHub`);
    console.log(`📅 Date: ${today}`);
    console.log(`📂 Source: ${localPath}`);

    // Check if local file exists
    try {
        await fs.access(localPath);
    } catch {
        console.error(`❌ No local file found: ${localPath}`);
        console.log('Run "npm run whatsapp:process" first to generate output.');
        process.exit(1);
    }

    // Load GitHub config
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubConfig.path}`);

    try {
        // Read local file and parse into MindCache
        const content = await fs.readFile(localPath, 'utf-8');
        const mindcache = new MindCache();
        mindcache.fromMarkdown(content);

        // Sync to GitHub
        const gitStore = new GitStore({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            tokenProvider: async () => githubConfig.token,
        });

        const sync = new MindCacheSync(gitStore, mindcache, {
            filePath: `${githubConfig.path}/whatsapp-${today}.md`,
            instanceName: 'WhatsApp Collector',
        });

        const keys = mindcache.keys();
        await sync.save({ message: `WhatsApp ${today}: ${keys.length} conversations` });
        console.log('✅ Synced to GitHub');
    } catch (e: any) {
        console.error(`❌ GitHub sync failed: ${e.message}`);
        process.exit(1);
    }
}

main().catch(console.error);
