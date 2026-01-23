/**
 * Twitter PROCESS script - Generate MindCache markdown files
 * Run: npm run twitter:process
 *
 * Reads raw JSON dumps and generates MindCache .md files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { TwitterPluginConfig, DEFAULT_CONFIG } from './config';

interface Tweet {
    id: string;
    url: string;
    date: string | null;
    content: string;
    user: {
        username: string;
        displayname: string;
    };
    isRetweet?: boolean;
    replyCount: number;
    retweetCount: number;
    likeCount: number;
}

/**
 * Generate MindCache format from tweets - one entry per tweet
 */
function generateMindCache(tweets: Tweet[], username: string, exportDate: string): string {
    const mindcache = new MindCache();

    // Register a simplified text type implicitly used by storing string values?
    // Or just store as text. MindCache defaults handle text.

    const sortedTweets = [...tweets].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    for (const tweet of sortedTweets) {
        const dateObj = tweet.date ? new Date(tweet.date) : null;
        const dateStr = dateObj ? dateObj.toISOString().split('T')[0] : 'unknown';
        const timeStr = dateObj
            ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : '??:??';

        const keyName = `@${username} Tweets - ${dateStr} ${timeStr}`;
        let content = tweet.content.replace(/\n/g, ' ');

        if (tweet.isRetweet) {
            content = `RT @${tweet.user.username}: ${content}`;
        }

        const stats = `♥${tweet.likeCount} ↻${tweet.retweetCount} 💬${tweet.replyCount}`;
        const fullContent = `${content}\n  ${stats} [${tweet.url}]`;

        const tags = [`twitter`, dateStr, `@${username}`];
        if (tweet.isRetweet) tags.push('retweet');

        // Use standard text type
        mindcache.set_value(keyName, fullContent, {
            contentTags: tags,
            zIndex: 0
        });
    }

    // Add header manually since MindCache toMarkdown might not add custom headers exactly as before?
    // MindCache adds "# MindCache STM Export" by default.
    // We just need to ensure the export date is there if we want it.
    // The previous implementation added "Export Date: ...".
    // MindCache `toMarkdown` produces the standard format.
    // If we want the metadata header, we might need to handle it or accept the standard.
    // Standard is fine.

    return mindcache.toMarkdown();
}

async function main() {
    console.log('🐦 Twitter Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.twitter as TwitterPluginConfig | undefined;
    const twitterConfig = pluginConfig || DEFAULT_CONFIG;

    const accounts = twitterConfig.accounts || [];

    if (accounts.length === 0) {
        console.log('⚠️ No Twitter accounts configured.');
        process.exit(0);
    }

    // Use plugin paths
    const rawDumpsDir = path.join(paths.rawDumps, 'twitter');
    const outputDir = path.join(paths.connectorData, 'twitter');

    await fs.mkdir(outputDir, { recursive: true });

    const today = getTodayString();
    let totalTweets = 0;

    for (const username of accounts) {
        console.log(`\n📄 Processing @${username}...`);

        const rawPath = path.join(rawDumpsDir, `${username}.json`);

        let tweets: Tweet[] = [];
        try {
            const data = await fs.readFile(rawPath, 'utf-8');
            tweets = JSON.parse(data);
        } catch {
            console.log(`   ⚠️ No raw data found for @${username}`);
            continue;
        }

        if (tweets.length === 0) {
            console.log(`   ⚠️ No tweets for @${username}`);
            continue;
        }

        // Generate MindCache markdown
        const mindCacheContent = generateMindCache(tweets, username, today);
        const mdPath = path.join(outputDir, `twitter-${username}.md`);
        await fs.writeFile(mdPath, mindCacheContent);
        console.log(`   ✅ Generated ${path.basename(mdPath)} (${tweets.length} tweets)`);

        totalTweets += tweets.length;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Accounts processed: ${accounts.length}`);
    console.log(`   Total tweets: ${totalTweets}`);
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
