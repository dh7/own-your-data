/**
 * Instagram PUSH script - Sync posts to GitHub
 * Run: npm run instagram:push
 *
 * Reads processed data from connector_data and pushes to GitHub.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, loadPluginConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { InstagramPluginConfig, DEFAULT_CONFIG } from './config';

interface InstaPost {
    id: string;
    url: string;
    date: string | null;
    caption: string;
    imageUrl: string;
    user: {
        username: string;
        displayname?: string;
    };
    likes: number;
    comments: number;
}

/**
 * Convert a post to MindCache entry format
 */
function postToMindCacheEntry(post: InstaPost): string {
    const lines: string[] = [];

    if (post.imageUrl) {
        lines.push(`![Post Image](${post.imageUrl})`);
        lines.push('');
    }

    if (post.caption) {
        lines.push(post.caption);
        lines.push('');
    }

    if (post.date) {
        const date = new Date(post.date);
        lines.push(`📅 ${date.toLocaleString()}`);
    }

    const metrics: string[] = [];
    if (post.likes) metrics.push(`❤️ ${post.likes}`);
    if (post.comments) metrics.push(`💬 ${post.comments}`);

    if (metrics.length > 0) {
        lines.push(metrics.join(' | '));
    }

    lines.push('');
    lines.push(`🔗 [View on Instagram](${post.url})`);

    return lines.join('\n');
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = await loadPluginConfig<InstagramPluginConfig>('instagram');
    const instagramConfig = pluginConfig || DEFAULT_CONFIG;

    console.log(`📸 Instagram Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const accounts = instagramConfig.accounts || [];
    if (accounts.length === 0) {
        console.error('❌ No Instagram accounts configured.');
        process.exit(1);
    }

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const instaSyncPath = instagramConfig.githubPath || DEFAULT_CONFIG.githubPath;
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${instaSyncPath}`);
    console.log(`👥 Accounts: ${accounts.join(', ')}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    let totalSynced = 0;

    // Use raw dumps for push (they contain the full data)
    const rawDumpsDir = path.join(paths.rawDumps, 'instagram');

    for (const username of accounts) {
        const rawPath = path.join(rawDumpsDir, `${username}.json`);

        try {
            await fs.access(rawPath);
        } catch {
            console.log(`⚠️ No raw data for @${username}. Run "npm run instagram:get" first.`);
            continue;
        }

        console.log(`📄 Processing @${username}...`);

        try {
            const rawData = await fs.readFile(rawPath, 'utf-8');
            const posts: InstaPost[] = JSON.parse(rawData);

            if (posts.length === 0) {
                console.log(`   ⚠️ No posts found`);
                continue;
            }

            const mindcache = new MindCache();
            for (const post of posts) {
                if (post.id) {
                    mindcache.set(post.id, postToMindCacheEntry(post));
                }
            }

            const filePath = `${instaSyncPath}/instagram-${username}.md`;
            const sync = new MindCacheSync(gitStore, mindcache, {
                filePath,
                instanceName: 'Instagram Scraper',
            });

            await sync.save({ message: `Instagram @${username}: ${posts.length} posts` });
            console.log(`   ✅ Synced ${posts.length} posts to ${filePath}`);
            totalSynced += posts.length;
        } catch (error: any) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total posts synced: ${totalSynced}`);
    console.log('✨ Done!');
}

main().catch(console.error);
