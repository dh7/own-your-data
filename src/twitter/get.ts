/**
 * Twitter GET script - Fetch tweets using Playwright browser automation
 * Run: npm run twitter:get
 *
 * Uses Playwright to scrape tweets from configured Twitter accounts.
 * Saves raw JSON to raw-dumps/twitter/{username}.json
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../config/config';

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
        this.logs.push(`\n[Duration: ${duration.toFixed(1)}s]`);
        await fs.writeFile(this.logPath, this.logs.join('\n'));
        return this.logPath;
    }
}

/**
 * Parse engagement count (e.g., "1.2K" -> 1200)
 */
function parseCount(text: string | null): number {
    if (!text) return 0;
    text = text.trim().toLowerCase();
    if (text.includes('k')) {
        return Math.round(parseFloat(text) * 1000);
    }
    if (text.includes('m')) {
        return Math.round(parseFloat(text) * 1000000);
    }
    return parseInt(text.replace(/,/g, '')) || 0;
}

/**
 * Scrape tweets for a user using Playwright
 */
async function scrapeTweetsForUser(
    page: Page,
    username: string,
    count: number,
    logger: Logger
): Promise<Tweet[]> {
    logger.log(`🔍 Scraping tweets for @${username}...`);

    const tweets: Tweet[] = [];
    const seenIds = new Set<string>();

    try {
        // Navigate to user's profile (use x.com - Twitter's new domain)
        await page.goto(`https://x.com/${username}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // Wait a bit for JS to execute (random 2-5s)
        await page.waitForTimeout(Math.floor(Math.random() * 3000) + 2000);

        // Wait for tweets to load
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

        // Scroll and collect tweets
        let scrollAttempts = 0;
        const maxScrollAttempts = 20;

        while (tweets.length < count && scrollAttempts < maxScrollAttempts) {
            // Get all tweet elements
            const tweetElements = await page.$$('article[data-testid="tweet"]');

            for (const tweetEl of tweetElements) {
                if (tweets.length >= count) break;

                try {
                    // Get tweet link to extract ID
                    const linkEl = await tweetEl.$('a[href*="/status/"]');
                    const href = await linkEl?.getAttribute('href');
                    if (!href) continue;

                    const idMatch = href.match(/\/status\/(\d+)/);
                    if (!idMatch) continue;

                    const id = idMatch[1];
                    if (seenIds.has(id)) continue;
                    seenIds.add(id);

                    // Get tweet content
                    const contentEl = await tweetEl.$('[data-testid="tweetText"]');
                    const content = await contentEl?.textContent() || '';

                    // Get display name
                    const displaynameEl = await tweetEl.$('[data-testid="User-Name"] span');
                    const displayname = await displaynameEl?.textContent() || username;

                    // Get time
                    const timeEl = await tweetEl.$('time');
                    const datetime = await timeEl?.getAttribute('datetime');

                    // Get engagement counts
                    const replyEl = await tweetEl.$('[data-testid="reply"] span');
                    const retweetEl = await tweetEl.$('[data-testid="retweet"] span');
                    const likeEl = await tweetEl.$('[data-testid="like"] span');

                    const replyCount = parseCount(await replyEl?.textContent() || null);
                    const retweetCount = parseCount(await retweetEl?.textContent() || null);
                    const likeCount = parseCount(await likeEl?.textContent() || null);

                    tweets.push({
                        id,
                        url: `https://x.com/${username}/status/${id}`,
                        date: datetime || null,
                        content,
                        user: { username, displayname },
                        replyCount,
                        retweetCount,
                        likeCount,
                    });
                } catch (e) {
                    // Skip individual tweet errors
                }
            }

            // Scroll down for more tweets with random behavior
            const scrollAmount = Math.floor(Math.random() * 500) + 500; // 500-1000px
            await page.evaluate((amount) => { (globalThis as any).scrollBy(0, amount); }, scrollAmount);

            // Random pause 2-5 seconds
            const delay = Math.floor(Math.random() * 3000) + 2000;
            await page.waitForTimeout(delay);
            scrollAttempts++;

            logger.log(`   Collected ${tweets.length}/${count} tweets...`);
        }

        if (tweets.length > 0) {
            logger.log(`   ✅ Scraped ${tweets.length} tweets`);
        } else {
            logger.log(`   ⚠️ No tweets found`);
        }

    } catch (e: any) {
        logger.error(`Failed to scrape @${username}: ${e.message}`);
    }

    return tweets;
}

/**
 * Load existing tweets from raw dumps (for deduplication)
 */
async function loadExistingTweets(filePath: string): Promise<Tweet[]> {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Merge new tweets with existing ones, deduplicating by ID
 */
function mergeTweets(existing: Tweet[], newTweets: Tweet[]): { merged: Tweet[]; newCount: number } {
    const existingIds = new Set(existing.map(t => t.id));
    const uniqueNew = newTweets.filter(t => !existingIds.has(t.id));

    return {
        merged: [...uniqueNew, ...existing],
        newCount: uniqueNew.length,
    };
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

    // Sort tweets by date descending (most recent first)
    const sortedTweets = [...tweets].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    for (const tweet of sortedTweets) {
        // Format: @karpathy Tweets - 2024-10-10 20:25
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
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const logger = new Logger(paths.twitterLogs);

    logger.log(`🐦 Twitter Scraper - Fetching tweets (Playwright)`);
    logger.log(`📅 Started: ${getTodayString()}`);

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

    // Launch browser
    logger.log('🌐 Launching browser...');
    const browser = await chromium.launch({
        headless: true,
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    let totalNew = 0;
    let totalTotal = 0;
    const allTweetsByUser = new Map<string, Tweet[]>();

    try {
        for (const username of config.twitter.accounts) {
            const rawPath = path.join(paths.twitterRawDumps, `${username}.json`);

            // Scrape tweets
            const newTweets = await scrapeTweetsForUser(page, username, tweetsPerAccount, logger);

            if (newTweets.length > 0) {
                const existingTweets = await loadExistingTweets(rawPath);
                const { merged, newCount } = mergeTweets(existingTweets, newTweets);

                // Save merged result
                await fs.writeFile(rawPath, JSON.stringify(merged, null, 2));
                logger.log(`   📁 Saved: ${merged.length} total tweets (${newCount} new)`);

                totalNew += newCount;
                totalTotal += merged.length;
                allTweetsByUser.set(username, merged);
            } else {
                // Load existing tweets for MindCache generation even if no new scrape
                const existingTweets = await loadExistingTweets(rawPath);
                if (existingTweets.length > 0) {
                    allTweetsByUser.set(username, existingTweets);
                    totalTotal += existingTweets.length;
                }
            }

            // Small delay between accounts (random 5-10s)
            if (config.twitter.accounts.indexOf(username) < config.twitter.accounts.length - 1) {
                const accountDelay = Math.floor(Math.random() * 5000) + 5000;
                logger.log(`   ⏳ Waiting ${Math.round(accountDelay / 1000)}s before next account...`);
                await page.waitForTimeout(accountDelay);
            }
        }
    } finally {
        await browser.close();
    }

    // Generate MindCache files
    await fs.mkdir(paths.twitterLocal, { recursive: true });

    const today = getTodayString();
    for (const [username, tweets] of allTweetsByUser) {
        const mindCacheContent = generateMindCache(tweets, username, today);
        const mindCachePath = path.join(paths.twitterLocal, `twitter-${username}.md`);
        await fs.writeFile(mindCachePath, mindCacheContent);
        logger.log(`📝 MindCache saved: ${mindCachePath}`);
    }

    logger.log(`\n📊 Summary:`);
    logger.log(`   New tweets: ${totalNew}`);
    logger.log(`   Total tweets: ${totalTotal}`);
    logger.log(`   Accounts processed: ${config.twitter.accounts.length}`);
    logger.log('✨ Done! Run "npm run twitter:push" to sync to GitHub.');

    const logFile = await logger.save();
    console.log(`\n📄 Log saved to: ${logFile}`);
}

main().catch(console.error);
