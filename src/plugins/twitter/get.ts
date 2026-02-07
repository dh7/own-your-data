/**
 * Twitter GET script - Fetch tweets using Playwright browser automation
 * Run: npm run twitter:get
 *
 * Uses Playwright to scrape tweets from configured Twitter accounts.
 * Saves raw JSON to raw-dumps/twitter/{username}.json
 *
 * NOTE: This script ONLY fetches raw data. Processing is handled separately.
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths, getTodayString } from '../../config/config';
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
    isRetweet: boolean;
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
        await page.goto(`https://x.com/${username}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await page.waitForTimeout(Math.floor(Math.random() * 3000) + 2000);

        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

        let scrollAttempts = 0;
        const maxScrollAttempts = 20;

        while (tweets.length < count && scrollAttempts < maxScrollAttempts) {
            const tweetElements = await page.$$('article[data-testid="tweet"]');

            for (const tweetEl of tweetElements) {
                if (tweets.length >= count) break;

                try {
                    const linkEl = await tweetEl.$('a[href*="/status/"]');
                    const href = await linkEl?.getAttribute('href');
                    if (!href) continue;

                    const idMatch = href.match(/\/status\/(\d+)/);
                    if (!idMatch) continue;

                    const id = idMatch[1];
                    if (seenIds.has(id)) continue;
                    seenIds.add(id);

                    const contentEl = await tweetEl.$('[data-testid="tweetText"]');
                    const content = await contentEl?.textContent() || '';

                    const displaynameEl = await tweetEl.$('[data-testid="User-Name"] span');
                    const displayname = await displaynameEl?.textContent() || username;

                    const timeEl = await tweetEl.$('time');
                    const datetime = await timeEl?.getAttribute('datetime');

                    const replyEl = await tweetEl.$('[data-testid="reply"] span');
                    const retweetEl = await tweetEl.$('[data-testid="retweet"] span');
                    const likeEl = await tweetEl.$('[data-testid="like"] span');

                    const replyCount = parseCount(await replyEl?.textContent() || null);
                    const retweetCount = parseCount(await retweetEl?.textContent() || null);
                    const likeCount = parseCount(await likeEl?.textContent() || null);

                    // Check for Retweet indicator (Social Context)
                    const socialContextEl = await tweetEl.$('[data-testid="socialContext"]');
                    const socialText = await socialContextEl?.textContent() || '';
                    const isRetweet = socialText.toLowerCase().includes('retweeted');

                    tweets.push({
                        id,
                        url: `https://x.com/${username}/status/${id}`,
                        date: datetime || null,
                        content,
                        user: { username, displayname },
                        isRetweet,
                        replyCount,
                        retweetCount,
                        likeCount,
                    });
                } catch (e) {
                    // Skip individual tweet errors
                }
            }

            const scrollAmount = Math.floor(Math.random() * 500) + 500;
            await page.evaluate((amount) => { (globalThis as any).scrollBy(0, amount); }, scrollAmount);

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

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = await loadPluginConfig<TwitterPluginConfig>('twitter');
    const twitterConfig = pluginConfig || DEFAULT_CONFIG;

    // Use plugin paths
    const logsDir = path.join(paths.logs, 'twitter');
    const rawDumpsDir = path.join(paths.rawDumps, 'twitter');

    const logger = new Logger(logsDir);

    logger.log(`🐦 Twitter Scraper (GET only)`);
    logger.log(`📅 Started: ${getTodayString()}`);

    const accounts = twitterConfig.accounts || [];
    if (accounts.length === 0) {
        logger.error('No Twitter accounts configured.');
        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);
        process.exit(1);
    }

    const shuffleArray = <T>(arr: T[]): T[] => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    const shuffledAccounts = shuffleArray(accounts);

    const tweetsPerAccount = twitterConfig.tweetsPerAccount || DEFAULT_CONFIG.tweetsPerAccount;
    logger.log(`📂 Raw dumps: ${rawDumpsDir}`);
    logger.log(`👥 Accounts (randomized): ${shuffledAccounts.join(', ')}`);
    logger.log(`📊 Tweets per account: ${tweetsPerAccount}\n`);

    await fs.mkdir(rawDumpsDir, { recursive: true });

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

    try {
        for (const username of shuffledAccounts) {
            const rawPath = path.join(rawDumpsDir, `${username}.json`);

            const newTweets = await scrapeTweetsForUser(page, username, tweetsPerAccount, logger);

            if (newTweets.length > 0) {
                const existingTweets = await loadExistingTweets(rawPath);
                const { merged, newCount } = mergeTweets(existingTweets, newTweets);

                await fs.writeFile(rawPath, JSON.stringify(merged, null, 2));
                logger.log(`   📁 Saved: ${merged.length} total tweets (${newCount} new)`);

                totalNew += newCount;
                totalTotal += merged.length;
            }

            if (shuffledAccounts.indexOf(username) < shuffledAccounts.length - 1) {
                const accountDelay = Math.floor(Math.random() * 5000) + 5000;
                logger.log(`   ⏳ Waiting ${Math.round(accountDelay / 1000)}s before next account...`);
                await page.waitForTimeout(accountDelay);
            }
        }
    } finally {
        await browser.close();
    }

    logger.log(`\n📊 Summary:`);
    logger.log(`   New tweets: ${totalNew}`);
    logger.log(`   Total tweets: ${totalTotal}`);
    logger.log(`   Accounts processed: ${shuffledAccounts.length}`);
    logger.log('\n✅ GET complete. Run `npm run twitter:process` to process raw data.');

    const logFile = await logger.save();
    console.log(`\n📄 Log saved to: ${logFile}`);
}

main().catch(console.error);
