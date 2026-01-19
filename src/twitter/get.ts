/**
 * Twitter GET script - Fetch tweets for configured accounts
 * Run: npm run twitter:get
 *
 * Uses Apify API to scrape tweets from configured Twitter accounts.
 * Saves raw JSON to raw-dumps/twitter/{username}.json
 */

import { ApifyClient } from 'apify-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../config/config';

interface ApifyTokenConfig {
    token: string;
}

/**
 * Logger that writes to both console and file
 */
class Logger {
    private logDir: string;
    private logPath: string = '';
    private logs: string[] = [];
    private startTime: Date;

    constructor(logDir: string) {
        this.logDir = logDir;
        this.startTime = new Date();
        const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
        this.logPath = path.join(logDir, `fetch-${timestamp}.log`);
    }

    log(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}`;
        console.log(message);
        this.logs.push(line);
    }

    error(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ERROR: ${message}`;
        console.error(`❌ ${message}`);
        this.logs.push(line);
    }

    async save(): Promise<string> {
        await fs.mkdir(this.logDir, { recursive: true });
        const duration = (Date.now() - this.startTime.getTime()) / 1000;
        this.logs.push(`\n[${new Date().toISOString()}] Completed in ${duration.toFixed(1)}s`);
        await fs.writeFile(this.logPath, this.logs.join('\n'), 'utf-8');
        return this.logPath;
    }
}

/**
 * Load Apify token from auth folder
 */
async function loadApifyToken(tokenPath: string): Promise<string | null> {
    try {
        const data = await fs.readFile(tokenPath, 'utf-8');
        const config = JSON.parse(data) as ApifyTokenConfig;
        return config.token;
    } catch {
        return null;
    }
}

/**
 * Scrape tweets for a single username
 */
async function scrapeTweetsForUser(
    client: ApifyClient,
    username: string,
    count: number,
    logger: Logger
): Promise<any[]> {
    logger.log(`🔍 Scraping tweets for @${username}...`);

    const runInput = {
        searchQueries: [`from:${username}`],
        tweetsDesired: count,
        includeUserInfo: true,
    };

    try {
        const run = await client.actor('web.harvester/easy-twitter-search-scraper').call(runInput);
        logger.log(`   Run completed: ${run.defaultDatasetId}`);

        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (items.length === 0) {
            logger.log(`   ⚠️ No tweets found for @${username}`);
            return [];
        }

        logger.log(`   ✅ Found ${items.length} tweets`);
        return items;
    } catch (error: any) {
        logger.error(`Failed to scrape @${username}: ${error.message}`);
        return [];
    }
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const logger = new Logger(paths.twitterLogs);

    logger.log(`🐦 Twitter Scraper - Fetching tweets`);
    logger.log(`📅 Started: ${getTodayString()}`);

    // Load Apify token
    const token = await loadApifyToken(paths.apifyToken);
    if (!token) {
        logger.error(`Apify token not found. Create ${paths.apifyToken} with { "token": "your_token" }`);
        logger.error('Get your token from: https://apify.com');
        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);
        process.exit(1);
    }

    // Check config
    if (!config.twitter?.accounts || config.twitter.accounts.length === 0) {
        logger.error('No Twitter accounts configured. Add accounts to config.json under twitter.accounts');
        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);
        process.exit(1);
    }

    const tweetsPerAccount = config.twitter.tweetsPerAccount || 100;
    logger.log(`📂 Raw dumps: ${paths.twitterRawDumps}`);
    logger.log(`👥 Accounts: ${config.twitter.accounts.join(', ')}`);
    logger.log(`📊 Tweets per account: ${tweetsPerAccount}\n`);

    // Ensure output directory exists
    await fs.mkdir(paths.twitterRawDumps, { recursive: true });

    const client = new ApifyClient({ token });

    let totalTweets = 0;
    for (const username of config.twitter.accounts) {
        const tweets = await scrapeTweetsForUser(client, username, tweetsPerAccount, logger);

        if (tweets.length > 0) {
            const outputPath = path.join(paths.twitterRawDumps, `${username}.json`);
            await fs.writeFile(outputPath, JSON.stringify(tweets, null, 2), 'utf-8');
            logger.log(`   💾 Saved to ${outputPath}`);
            totalTweets += tweets.length;
        }

        // Small delay between accounts to be gentle
        if (config.twitter.accounts.indexOf(username) < config.twitter.accounts.length - 1) {
            logger.log(`   ⏳ Waiting 2s before next account...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    logger.log(`\n📊 Summary:`);
    logger.log(`   Total tweets fetched: ${totalTweets}`);
    logger.log(`   Accounts processed: ${config.twitter.accounts.length}`);
    logger.log('✨ Done! Run "npm run twitter:push" to sync to GitHub.');

    const logFile = await logger.save();
    console.log(`\n📄 Log saved to: ${logFile}`);
}

main().catch(console.error);
