/**
 * Twitter PROCESS script - Generate MindCache markdown files
 * Run: npm run twitter:process
 *
 * Reads raw JSON dumps and generates MindCache .md files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
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
    replyCount: number;
    retweetCount: number;
    likeCount: number;
}

/**
 * Generate MindCache format from tweets - one entry per tweet
 */
function generateMindCache(tweets: Tweet[], username: string, exportDate: string): string {
    const lines: string[] = [
        '# MindCache STM Export',
        '',
        `Export Date: ${exportDate}`,
        '',
        '---',
        '',
        '## STM Entries',
        '',
    ];

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
        const content = tweet.content.replace(/\n/g, ' ');
        const stats = `♥${tweet.likeCount} ↻${tweet.retweetCount} 💬${tweet.replyCount}`;

        lines.push(`### ${keyName}`);
        lines.push(`- **Type**: \`text\``);
        lines.push(`- **System Tags**: \`none\``);
        lines.push(`- **Z-Index**: \`0\``);
        lines.push(`- **Tags**: \`twitter\`, \`${dateStr}\`, \`@${username}\``);
        lines.push(`- **Value**:`);
        lines.push('```');
        lines.push(content);
        lines.push(`  ${stats} [${tweet.url}]`);
        lines.push('```');
        lines.push('');
    }

    return lines.join('\n');
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
