/**
 * Instagram PUSH script - Sync posts to GitHub
 * Run: npm run instagram:push
 *
 * Reads raw post JSON and pushes to GitHub as MindCache (one file per account).
 * File format: instagram-{username}.md
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../config/config';

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

    // Image
    if (post.imageUrl) {
        lines.push(`![Post Image](${post.imageUrl})`);
        lines.push('');
    }

    // Caption
    if (post.caption) {
        lines.push(post.caption);
        lines.push('');
    }

    // Metadata
    if (post.date) {
        const date = new Date(post.date);
        lines.push(`📅 ${date.toLocaleString()}`);
    }

    // Engagement
    const metrics: string[] = [];
    if (post.likes) metrics.push(`❤️ ${post.likes}`);
    if (post.comments) metrics.push(`💬 ${post.comments}`);

    if (metrics.length > 0) {
        lines.push(metrics.join(' | '));
    }

    // URL
    lines.push('');
    lines.push(`🔗 [View on Instagram](${post.url})`);

    return lines.join('\n');
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    console.log(`📸 Instagram Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    // Check config
    if (!config.instagram?.accounts || config.instagram.accounts.length === 0) {
        console.error('❌ No Instagram accounts configured.');
        process.exit(1);
    }

    // Load GitHub config
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const instaSyncPath = config.instagram?.githubPath || 'instagram';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${instaSyncPath}`);
    console.log(`👥 Accounts: ${config.instagram.accounts.join(', ')}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    let totalSynced = 0;

    for (const username of config.instagram.accounts) {
        const rawPath = path.join(paths.instagramRawDumps, `${username}.json`);

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

            // Create MindCache with posts keyed by ID
            const mindcache = new MindCache();
            for (const post of posts) {
                if (post.id) {
                    mindcache.set(post.id, postToMindCacheEntry(post));
                }
            }

            // Add last_scrape timestamp
            mindcache.set('last_scrape', new Date().toISOString());

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
