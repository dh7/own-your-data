/**
 * Twitter PUSH script - Sync tweets to GitHub
 * Run: npm run twitter:push
 *
 * Reads processed data from connector_data and pushes to GitHub.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { TwitterPluginConfig, DEFAULT_CONFIG } from './config';

interface Tweet {
    id: string;
    url?: string;
    text?: string;
    content?: string;
    timestamp?: string;
    date?: string;
    likes?: number;
    likeCount?: number;
    replies?: number;
    replyCount?: number;
    retweets?: number;
    retweetCount?: number;
    quotes?: number;
    isRetweet?: boolean;
    isReply?: boolean;
    isQuote?: boolean;
    images?: string[];
    user?: {
        username?: string;
        userFullName?: string;
        displayname?: string;
    };
}

/**
 * Convert a tweet to MindCache entry format
 */
function tweetToMindCacheEntry(tweet: Tweet): string {
    const lines: string[] = [];

    // Main text
    const text = tweet.text || tweet.content;
    if (text) {
        lines.push(text);
    }

    lines.push('');

    // Metadata
    const timestamp = tweet.timestamp || tweet.date;
    if (timestamp) {
        const date = new Date(timestamp);
        lines.push(`📅 ${date.toLocaleString()}`);
    }

    // Engagement metrics
    const metrics: string[] = [];
    const likes = tweet.likes || tweet.likeCount;
    const retweets = tweet.retweets || tweet.retweetCount;
    const replies = tweet.replies || tweet.replyCount;

    if (likes) metrics.push(`❤️ ${likes}`);
    if (retweets) metrics.push(`🔁 ${retweets}`);
    if (replies) metrics.push(`💬 ${replies}`);
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

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.twitter as TwitterPluginConfig | undefined;
    const twitterConfig = pluginConfig || DEFAULT_CONFIG;

    console.log(`📤 Twitter Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const accounts = twitterConfig.accounts || [];
    if (accounts.length === 0) {
        console.error('❌ No Twitter accounts configured.');
        process.exit(1);
    }

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const twitterPath = twitterConfig.githubPath || DEFAULT_CONFIG.githubPath;
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${twitterPath}`);
    console.log(`👥 Accounts: ${accounts.join(', ')}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    let totalSynced = 0;

    // Use raw dumps for push (they contain the full data)
    const rawDumpsDir = path.join(paths.rawDumps, 'twitter');

    for (const username of accounts) {
        const rawPath = path.join(rawDumpsDir, `${username}.json`);

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

            const mindcache = new MindCache();
            for (const tweet of tweets) {
                if (tweet.id) {
                    const contentValues = tweetToMindCacheEntry(tweet);
                    const tags = ['twitter'];

                    if (tweet.user?.username) {
                        tags.push(`@${tweet.user.username}`);
                    }

                    if (tweet.date || tweet.timestamp) {
                        const d = new Date(tweet.date || tweet.timestamp || '');
                        if (!isNaN(d.getTime())) {
                            tags.push(d.toISOString().split('T')[0]);
                        }
                    }

                    if (tweet.isRetweet) {
                        tags.push('retweet');
                    }

                    // Use set_value to support tags
                    mindcache.set_value(tweet.id, contentValues, {
                        contentTags: tags,
                        zIndex: 0
                    });
                }
            }

            mindcache.set('last_scrape', new Date().toISOString());

            const filePath = `${twitterPath}/twitter-${username}.md`;
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
