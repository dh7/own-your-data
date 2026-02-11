/**
 * Twitter GET script - Fetch tweets using Playwright browser automation
 * Run: npm run twitter:get
 *
 * Designed to mimic natural human browsing patterns:
 * - Only visits a random subset of accounts per run
 * - Variable tweet counts, scroll speeds, and delays
 * - Browses home feed first like a real user
 * - Best used with a scheduler (every 30min ± jitter)
 *
 * Saves raw JSON to raw-dumps/twitter/{username}.json
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, loadPluginConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { TwitterPluginConfig, DEFAULT_CONFIG } from './config';
import { initPluginLog } from '../../shared/plugin-logger';

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

// ============ HUMAN-LIKE HELPERS ============

/** Random int between min and max (inclusive) */
function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float between min and max */
function randFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/** Human-like delay — sometimes short, sometimes long, occasional longer pauses */
async function humanDelay(page: Page, minMs: number, maxMs: number): Promise<void> {
    // 10% chance of an extra-long "distraction" pause (2x-3x)
    const isDistracted = Math.random() < 0.1;
    const base = randInt(minMs, maxMs);
    const delay = isDistracted ? base * randFloat(2, 3) : base;
    await page.waitForTimeout(Math.round(delay));
}

/** Human-like scroll — variable distance, sometimes small, sometimes large */
async function humanScroll(page: Page): Promise<void> {
    // Humans don't scroll perfectly — vary amount and speed
    const scrollAmount = randInt(200, 900);

    // 15% chance to scroll up a bit first (re-reading something)
    if (Math.random() < 0.15) {
        const upAmount = randInt(50, 200);
        await page.evaluate((amt) => { (globalThis as any).scrollBy(0, -amt); }, upAmount);
        await page.waitForTimeout(randInt(300, 800));
    }

    await page.evaluate((amt) => { (globalThis as any).scrollBy(0, amt); }, scrollAmount);
}

/**
 * Pick a random subset of accounts to visit this run.
 * With 30min schedule, each account gets checked several times/day.
 */
function pickAccountsForThisRun(accounts: string[]): string[] {
    const shuffled = [...accounts].sort(() => Math.random() - 0.5);
    // Visit 3-6 accounts per run (or all if fewer than 3)
    const count = Math.min(accounts.length, randInt(3, 6));
    return shuffled.slice(0, count);
}

// ============ LOGGER ============

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

// ============ PARSING ============

function parseCount(text: string | null): number {
    if (!text) return 0;
    text = text.trim().toLowerCase();
    if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
    if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
    return parseInt(text.replace(/,/g, '')) || 0;
}

// ============ SCRAPING ============

/**
 * Browse the home feed briefly — like a real user opening Twitter
 */
async function browseHomeFeed(page: Page, logger: Logger): Promise<void> {
    logger.log('🏠 Browsing home feed...');
    try {
        await page.goto('https://x.com/home', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await humanDelay(page, 3000, 8000);

        // Scroll a bit through the feed
        const scrolls = randInt(1, 4);
        for (let i = 0; i < scrolls; i++) {
            await humanScroll(page);
            await humanDelay(page, 1500, 4000);
        }
    } catch (e: any) {
        logger.log(`   ⚠️ Home feed browse failed: ${e.message}`);
    }
}

/**
 * Scrape tweets for a user — with human-like behavior
 */
async function scrapeTweetsForUser(
    page: Page,
    username: string,
    count: number,
    logger: Logger
): Promise<Tweet[]> {
    logger.log(`🔍 Checking @${username}...`);

    const tweets: Tweet[] = [];
    const seenIds = new Set<string>();

    try {
        await page.goto(`https://x.com/${username}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // Variable initial wait — like reading the bio / looking at the page
        await humanDelay(page, 2000, 6000);

        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

        // Another brief pause before scrolling
        await humanDelay(page, 1000, 3000);

        let scrollAttempts = 0;
        const maxScrollAttempts = randInt(3, 8); // Don't always scroll the same amount

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

            // Human-like scroll with variable reading time
            await humanScroll(page);
            await humanDelay(page, 2000, 5000);
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

// ============ DEDUPLICATION ============

async function loadExistingTweets(filePath: string): Promise<Tweet[]> {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function mergeTweets(existing: Tweet[], newTweets: Tweet[]): { merged: Tweet[]; newCount: number } {
    const existingIds = new Set(existing.map(t => t.id));
    const uniqueNew = newTweets.filter(t => !existingIds.has(t.id));

    return {
        merged: [...uniqueNew, ...existing],
        newCount: uniqueNew.length,
    };
}

// ============ MAIN ============

async function main() {
    initPluginLog('twitter');
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = await loadPluginConfig<TwitterPluginConfig>('twitter');
    const twitterConfig = pluginConfig || DEFAULT_CONFIG;

    const logsDir = path.join(paths.logs, 'twitter');
    const rawDumpsDir = path.join(paths.rawDumps, 'twitter');

    const logger = new Logger(logsDir);

    logger.log(`🐦 Twitter Scraper (GET only)`);
    logger.log(`📅 Started: ${getTodayString()}`);

    const allAccounts = twitterConfig.accounts || [];
    if (allAccounts.length === 0) {
        logger.error('No Twitter accounts configured.');
        const logFile = await logger.save();
        console.log(`\n📄 Log saved to: ${logFile}`);
        process.exit(1);
    }

    // Pick a random subset for this run
    const accounts = pickAccountsForThisRun(allAccounts);
    // Randomize tweet count per account: 5-15 (just the recent ones)
    const baseTweetCount = Math.min(twitterConfig.tweetsPerAccount || 10, 15);

    logger.log(`📂 Raw dumps: ${rawDumpsDir}`);
    logger.log(`👥 This run: ${accounts.join(', ')} (${accounts.length}/${allAccounts.length} accounts)`);
    logger.log(`📊 ~${baseTweetCount} tweets per account (varies)\n`);

    await fs.mkdir(rawDumpsDir, { recursive: true });

    // Check for saved session
    const statePath = paths.twitterSession;
    let hasState = false;
    try {
        await fs.access(statePath);
        hasState = true;
        logger.log(`🔐 Using saved session from ${statePath}`);
    } catch {
        logger.log('⚠️ No session found. Run "npm run twitter:login" first for better results.');
    }

    logger.log('🌐 Launching browser...');
    const browser = await chromium.launch({
        headless: true,
    });
    const context = await browser.newContext({
        ...(hasState ? { storageState: statePath } : {}),
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: randInt(1200, 1400), height: randInt(750, 900) },
    });
    const page = await context.newPage();

    let totalNew = 0;
    let totalTotal = 0;

    try {
        // Start by browsing home feed like a real user
        if (hasState) {
            await browseHomeFeed(page, logger);
        }

        for (let i = 0; i < accounts.length; i++) {
            const username = accounts[i];
            const rawPath = path.join(rawDumpsDir, `${username}.json`);

            // Vary tweet count per account: ±40% of base
            const tweetsForThis = Math.max(3, Math.round(baseTweetCount * randFloat(0.6, 1.4)));

            const newTweets = await scrapeTweetsForUser(page, username, tweetsForThis, logger);

            if (newTweets.length > 0) {
                const existingTweets = await loadExistingTweets(rawPath);
                const { merged, newCount } = mergeTweets(existingTweets, newTweets);

                await fs.writeFile(rawPath, JSON.stringify(merged, null, 2));
                logger.log(`   📁 Saved: ${merged.length} total tweets (${newCount} new)`);

                totalNew += newCount;
                totalTotal += merged.length;
            }

            // Human-like delay between profiles — long and variable
            if (i < accounts.length - 1) {
                const delay = randInt(15000, 45000);
                logger.log(`   ⏳ Waiting ${Math.round(delay / 1000)}s before next profile...`);
                await page.waitForTimeout(delay);
            }
        }
    } finally {
        await browser.close();
    }

    logger.log(`\n📊 Summary:`);
    logger.log(`   Accounts checked: ${accounts.length}/${allAccounts.length}`);
    logger.log(`   New tweets: ${totalNew}`);
    logger.log(`   Total tweets in store: ${totalTotal}`);
    logger.log('\n✅ GET complete. Run `npm run twitter:process` to process raw data.');

    const logFile = await logger.save();
    console.log(`\n📄 Log saved to: ${logFile}`);
}

main().catch(console.error);
