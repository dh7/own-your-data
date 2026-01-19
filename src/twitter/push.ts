/**
 * Twitter PUSH script - Sync tweets to GitHub
 * Run: npm run twitter:push
 *
 * Reads raw tweet JSON and pushes to GitHub as MindCache (one file per account).
 * File format: twitter-{username}.md
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../config/config';

interface Tweet {
    id: string;
    url?: string;
    text?: string;
    timestamp?: string;
    likes?: number;
    replies?: number;
    retweets?: number;
    quotes?: number;
    isRetweet?: boolean;
    isReply?: boolean;
    isQuote?: boolean;
    images?: string[];
    user?: {
        username?: string;
        userFullName?: string;
    };
}

/**
 * Convert a tweet to MindCache entry format
 */
function tweetToMindCacheEntry(tweet: Tweet): string {
    const lines: string[] = [];

    // Main text
    if (tweet.text) {
        lines.push(tweet.text);
    }

    lines.push('');

    // Metadata
    if (tweet.timestamp) {
        const date = new Date(tweet.timestamp);
        lines.push(`📅 ${date.toLocaleString()}`);
    }

    // Engagement metrics
    const metrics: string[] = [];
    if (tweet.likes) metrics.push(`❤️ ${tweet.likes}`);
    if (tweet.retweets) metrics.push(`🔁 ${tweet.retweets}`);
    if (tweet.replies) metrics.push(`💬 ${tweet.replies}`);
    if (tweet.quotes) metrics.push(`💭 ${tweet.quotes}`);
    if (metrics.length > 0) {
        lines.push(metrics.join(' | '));
    }

    // Tweet type
    const types: string[] = [];
    if (tweet.isRetweet) types.push('Retweet');
    if (tweet.isReply) types.push('Reply');
    if (tweet.isQuote) types.push('Quote');
    if (types.length > 0) {
        lines.push(`Type: ${types.join(', ')}`);
    }

    // URL
    if (tweet.url) {
        lines.push('');
        lines.push(`🔗 ${tweet.url}`);
    }

    // Images
    if (tweet.images && tweet.images.length > 0) {
        lines.push('');
        tweet.images.forEach((img, i) => {
            lines.push(`📷 Image ${i + 1}: ${img}`);
        });
    }

    return lines.join('\n');
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    console.log(`📤 Twitter Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    // Check config
    if (!config.twitter?.accounts || config.twitter.accounts.length === 0) {
        console.error('❌ No Twitter accounts configured.');
        process.exit(1);
    }

    // Load GitHub config
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubConfig.path}`);
    console.log(`👥 Accounts: ${config.twitter.accounts.join(', ')}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    let totalSynced = 0;

    for (const username of config.twitter.accounts) {
        const rawPath = path.join(paths.twitterRawDumps, `${username}.json`);

        try {
            await fs.access(rawPath);
        } catch {
            console.log(`⚠️ No raw data for @${username}. Run "npm run twitter:get" first.`);
            continue;
        }

        console.log(`📄 Processing @${username}...`);

        try {
            const rawData = await fs.readFile(rawPath, 'utf-8');
            const tweets: Tweet[] = JSON.parse(rawData);

            if (tweets.length === 0) {
                console.log(`   ⚠️ No tweets found`);
                continue;
            }

            // Create MindCache with tweets keyed by ID
            const mindcache = new MindCache();
            for (const tweet of tweets) {
                if (tweet.id) {
                    mindcache.set(tweet.id, tweetToMindCacheEntry(tweet));
                }
            }

            const filePath = `${githubConfig.path}/twitter-${username}.md`;
            const sync = new MindCacheSync(gitStore, mindcache, {
                filePath,
                instanceName: 'Twitter Scraper',
            });

            await sync.save({ message: `Twitter @${username}: ${tweets.length} tweets` });
            console.log(`   ✅ Synced ${tweets.length} tweets to ${filePath}`);
            totalSynced += tweets.length;
        } catch (error: any) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total tweets synced: ${totalSynced}`);
    console.log('✨ Done!');
}

main().catch(console.error);
