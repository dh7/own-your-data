/**
 * Twitter PROCESS script - Generate MindCache markdown files per day
 * Run: npm run twitter:process
 *
 * Reads raw JSON dumps and generates one MindCache .md file per day.
 * Tweets are grouped by their actual date.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths } from '../../config/config';
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



async function main() {
    console.log('🐦 Twitter Process - Generating MindCache files per day\n');

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

    console.log(`📅 Processing all available tweets...`);

    // Collect all tweets from all accounts, grouped by date
    // Map: dateStr -> Map: username -> tweets[]
    const tweetsByDate = new Map<string, Map<string, Tweet[]>>();

    for (const username of accounts) {
        console.log(`   📥 Loading @${username}...`);

        const rawPath = path.join(rawDumpsDir, `${username}.json`);

        let tweets: Tweet[] = [];
        try {
            const data = await fs.readFile(rawPath, 'utf-8');
            tweets = JSON.parse(data);
        } catch {
            console.log(`      ⚠️ No raw data found for @${username}`);
            continue;
        }

        if (tweets.length === 0) {
            console.log(`      ⚠️ No tweets for @${username}`);
            continue;
        }

        // Group tweets by date
        for (const tweet of tweets) {
            if (!tweet.date) continue;

            const dateStr = new Date(tweet.date).toISOString().split('T')[0];

            if (!tweetsByDate.has(dateStr)) {
                tweetsByDate.set(dateStr, new Map());
            }
            const dayMap = tweetsByDate.get(dateStr)!;

            if (!dayMap.has(username)) {
                dayMap.set(username, []);
            }
            dayMap.get(username)!.push(tweet);
        }

        console.log(`      ✅ Loaded ${tweets.length} tweets`);
    }

    if (tweetsByDate.size === 0) {
        console.log('\n⚠️ No tweets found for the configured date range.');
        return;
    }

    let totalTweets = 0;
    let filesGenerated = 0;

    // Generate one MindCache file per day
    for (const [dateStr, usersMap] of tweetsByDate) {
        const mindcache = new MindCache();
        let dayTweetCount = 0;

        for (const [username, tweets] of usersMap) {
            // Sort tweets by time
            tweets.sort((a, b) => {
                if (!a.date || !b.date) return 0;
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });

            // Build content for this user on this day
            const contentLines: string[] = [];
            contentLines.push(`# @${username} - ${dateStr}`);
            contentLines.push('');

            for (const tweet of tweets) {
                const dateObj = tweet.date ? new Date(tweet.date) : null;
                const timeStr = dateObj
                    ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                    : '??:??';

                let content = tweet.content.replace(/\n/g, ' ').trim();
                if (tweet.isRetweet && tweet.user) {
                    content = `RT @${tweet.user.username}: ${content}`;
                }

                const stats = `♥${tweet.likeCount} ↻${tweet.retweetCount} 💬${tweet.replyCount}`;
                contentLines.push(`*${timeStr}* ${content}`);
                contentLines.push(`${stats} [link](${tweet.url})`);
                contentLines.push('');
            }

            const content = contentLines.join('\n');

            // Generate a clean username tag
            const usernameTag = username.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            mindcache.set_value(`@${username}`, content, {
                contentTags: ['twitter', dateStr, usernameTag],
                zIndex: 0
            });

            dayTweetCount += tweets.length;
        }

        // Write to file
        const localPath = path.join(outputDir, `twitter-${dateStr}.md`);
        await fs.writeFile(localPath, mindcache.toMarkdown(), 'utf-8');

        console.log(`   📅 ${dateStr}: ${dayTweetCount} tweets from ${usersMap.size} accounts`);
        totalTweets += dayTweetCount;
        filesGenerated++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Accounts processed: ${accounts.length}`);
    console.log(`   Days with tweets: ${filesGenerated}`);
    console.log(`   Total tweets: ${totalTweets}`);
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
