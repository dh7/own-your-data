/**
 * Instagram GET script - Fetch posts using Playwright
 * Run: npm run instagram:get
 *
 * Uses Playwright to scrape posts from configured Instagram accounts.
 * Saves raw JSON to raw-dumps/instagram/{username}.json
 */

import { chromium, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../config/config';

interface InstaPost {
    id: string;
    url: string;
    date: string | null;
    caption: string;
    imageUrl: string;
    localImagePath?: string; // Path to locally saved image
    user: {
        username: string;
        displayname?: string;
    };
    likes: number;
    comments: number;
}

/**
 * Download an image from URL and save locally
 */
async function downloadImage(imageUrl: string, savePath: string): Promise<boolean> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) return false;

        const buffer = await response.arrayBuffer();
        await fs.writeFile(savePath, Buffer.from(buffer));
        return true;
    } catch {
        return false;
    }
}

/**
 * Logger
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
 * Helper to parse counts (e.g. "1,234 likes")
 */
function parseCount(text: string | null): number {
    if (!text) return 0;
    const clean = text.replace(/,/g, '');
    const match = clean.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

async function ensureLoggedIn(page: Page, context: BrowserContext, statePath: string, logger: Logger) {
    logger.log('🔐 Checking login status...');

    // Check if we are logged in by looking for a common logged-in element or strictly checking URL
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });

    // Simple check: do we see the "Log In" strings or a profile icon?
    // Waiting for either valid logged in state or login form
    try {
        await Promise.race([
            page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 5000 }), // Basic logged in indicator
            page.waitForSelector('input[name="username"]', { timeout: 5000 })     // Login form
        ]);
    } catch {
        // Timeout, unsure
    }

    const isLoggedIn = await page.$('a[href^="/direct/inbox/"]');

    if (isLoggedIn) {
        logger.log('✅ Already logged in.');
        return;
    }

    logger.log('⚠️ Not logged in. Please log in manually in the browser window.');
    logger.log('⏳ Waiting for you to log in...');

    // Wait efficiently for login success
    await page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 0 }); // Wait indefinitely

    logger.log('✅ Login detected! Saving session state...');
    await context.storageState({ path: statePath });
    logger.log(`💾 Session saved to ${statePath}`);
}

async function scrapePostsForUser(
    page: Page,
    username: string,
    count: number,
    logger: Logger,
    logsDir: string,
    imagesDir: string
): Promise<InstaPost[]> {
    logger.log(`🔍 Scraping posts for @${username}...`);
    const posts: InstaPost[] = [];
    const seenIds = new Set<string>();

    try {
        await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Check if private or not found
        const isPrivate = await page.$('h2:has-text("This Account is Private")');
        if (isPrivate) {
            logger.error(`Account @${username} is private.`);
            return [];
        }

        // Wait for grid - try multiple possible selectors
        let gridFound = false;
        const gridSelectors = [
            'article a[href*="/p/"]',
            'a[href*="/p/"]',
            'main article',
            'div[style*="flex"] a[href*="/p/"]',
        ];

        for (const selector of gridSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                gridFound = true;
                logger.log(`   Found grid using: ${selector}`);
                break;
            } catch {
                // Try next selector
            }
        }

        if (!gridFound) {
            logger.log('   ⚠️ No posts found or timeout waiting for grid.');
            // Take a screenshot for debugging
            const screenshotPath = path.join(logsDir, `debug-${username}.png`);
            await page.screenshot({ path: screenshotPath });
            logger.log(`   📸 Debug screenshot saved: ${screenshotPath}`);
            return [];
        }

        // Collect links first
        let links: string[] = [];
        let previousHeight = 0;
        let scrollAttempts = 0;

        while (links.length < count && scrollAttempts < 10) {
            // Try multiple selectors for post links
            const linkSelectors = [
                'a[href*="/p/"]',
                'article a[href*="/p/"]',
            ];

            for (const selector of linkSelectors) {
                const anchors = await page.$$(selector);
                for (const a of anchors) {
                    const href = await a.getAttribute('href');
                    if (href && href.includes('/p/')) links.push(href);
                }
            }
            // Dedup links
            links = [...new Set(links)];

            if (links.length >= count) break;

            // Scroll
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForTimeout(2000);

            const newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === previousHeight) {
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
            }
        }

        // Truncate to limit
        links = links.slice(0, count);
        logger.log(`   Found ${links.length} post links. Scraping details...`);

        // Visit each post to get details
        for (const link of links) {
            try {
                const url = `https://www.instagram.com${link}`;
                // We use regex to get ID from /p/ID/
                const idMatch = link.match(/\/p\/([^/]+)\//);
                const id = idMatch ? idMatch[1] : link;

                if (seenIds.has(id)) continue;
                seenIds.add(id);

                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(1500); // Wait for dynamic content

                // Extract Data
                // Time
                const dateEl = await page.$('time');
                const date = await dateEl?.getAttribute('datetime') || null;

                // Caption - try multiple strategies
                let caption = '';

                // Strategy 1: Get from og:description meta tag (most reliable)
                const metaDesc = await page.$('meta[property="og:description"]');
                const metaContent = await metaDesc?.getAttribute('content');
                if (metaContent) {
                    // Format is typically: "123 likes, 4 comments - Caption text here"
                    const dashIndex = metaContent.indexOf(' - ');
                    if (dashIndex > -1) {
                        caption = metaContent.substring(dashIndex + 3);
                    } else {
                        caption = metaContent;
                    }
                }

                // Strategy 2: Try to find caption in the DOM if meta is empty
                if (!caption) {
                    // Look for the first span with substantial text in the comments area
                    const spans = await page.$$('article span');
                    for (const span of spans) {
                        const text = await span.textContent();
                        if (text && text.length > 20 && !text.includes('likes') && !text.includes('comments')) {
                            caption = text;
                            break;
                        }
                    }
                }

                // Image - find the main post image (not profile pic)
                // The post image is typically much larger than profile pics
                let imageUrl = '';

                // Get all images and find the one with largest dimensions
                const allImages = await page.$$('img');
                let bestImage = { src: '', size: 0 };

                for (const img of allImages) {
                    try {
                        const src = await img.getAttribute('src');
                        const width = await img.getAttribute('width');
                        const height = await img.getAttribute('height');

                        // Skip if no src or if it's a small image (profile pics are typically < 150px)
                        if (!src || !src.startsWith('http')) continue;

                        // Calculate size - use actual rendered size if width/height not available
                        let size = 0;
                        if (width && height) {
                            size = parseInt(width) * parseInt(height);
                        } else {
                            // Try to get natural size from element
                            const box = await img.boundingBox();
                            if (box) {
                                size = box.width * box.height;
                            }
                        }

                        // Post images are typically > 400x400
                        if (size > bestImage.size && size > 160000) {
                            bestImage = { src, size };
                        }
                    } catch {
                        // Skip problematic images
                    }
                }

                imageUrl = bestImage.src;

                // Likes - extract from page content without waiting
                let likes = 0;
                try {
                    // Try to get likes from the page text content
                    const pageContent = await page.content();
                    // Look for patterns like "1,234 likes" or "liked by X and 123 others"
                    const likesMatch = pageContent.match(/(\d[\d,]*)\s*likes?/i);
                    if (likesMatch) {
                        likes = parseCount(likesMatch[1]);
                    }
                } catch {
                    // Silently skip likes extraction if it fails
                }

                // Download image locally
                let localImagePath: string | undefined;
                if (imageUrl) {
                    const ext = imageUrl.includes('.jpg') ? '.jpg' : '.png';
                    const imageName = `${id}${ext}`;
                    const imagePath = path.join(imagesDir, imageName);

                    const downloaded = await downloadImage(imageUrl, imagePath);
                    if (downloaded) {
                        localImagePath = imagePath;
                    }
                }

                posts.push({
                    id,
                    url,
                    date,
                    caption,
                    imageUrl,
                    localImagePath,
                    user: { username },
                    likes,
                    comments: 0 // Hard to parse consistently
                });

                logger.log(`      Extracted post ${id}${localImagePath ? ' (image saved)' : ''}`);

            } catch (e: any) {
                logger.error(`Error processing ${link}: ${e.message}`);
            }
        }

    } catch (e: any) {
        logger.error(`Failed to scrape @${username}: ${e.message}`);
    }

    return posts;
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const logger = new Logger(paths.instagramLogs);

    logger.log('📸 Instagram Scraper');

    if (!config.instagram?.accounts || config.instagram.accounts.length === 0) {
        logger.error('No Instagram accounts configured.');
        process.exit(1);
    }

    // Ensure state dir
    await fs.mkdir(paths.auth, { recursive: true });
    await fs.mkdir(paths.instagramRawDumps, { recursive: true });

    const statePath = path.join(paths.auth, 'instagram-state.json');
    let hasState = false;
    try {
        await fs.access(statePath);
        hasState = true;
    } catch { }

    // Launch non-headless initially if we might need to login, or if we want to debug.
    // Ideally we use headless unless we need login.
    // But since "ensureLoggedIn" might need interaction, let's toggle based on state existence?
    // Actually, always launch headless: false for first run is safer for Instagram bots detection too?
    // Let's default to headless: false for Instagram as it's very sensitive to headless.

    logger.log('🌐 Launching browser...');

    const browser = await chromium.launch({
        headless: true,
    });

    // Use realistic browser settings to avoid detection
    const context = await browser.newContext({
        ...(hasState ? { storageState: statePath } : {}),
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        timezoneId: 'Europe/Paris',
    });

    const page = await context.newPage();

    // Verify login
    await ensureLoggedIn(page, context, statePath, logger);

    // Shuffle accounts for more human-like behavior
    const shuffleArray = <T>(arr: T[]): T[] => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    const accounts = shuffleArray(config.instagram.accounts);
    const postsPerAccount = config.instagram.postsPerAccount || 50;

    logger.log(`👥 Accounts (randomized): ${accounts.join(', ')}`);

    for (const username of accounts) {
        // Create images directory for this user
        const imagesDir = path.join(paths.instagramRawDumps, 'images', username);
        await fs.mkdir(imagesDir, { recursive: true });

        const posts = await scrapePostsForUser(page, username, postsPerAccount, logger, paths.instagramLogs, imagesDir);

        if (posts.length > 0) {
            const dumpPath = path.join(paths.instagramRawDumps, `${username}.json`);

            // Merge with existing
            let existing: InstaPost[] = [];
            try {
                const data = await fs.readFile(dumpPath, 'utf-8');
                existing = JSON.parse(data);
            } catch { }

            const existingIds = new Set(existing.map(p => p.id));
            const newPosts = posts.filter(p => !existingIds.has(p.id));
            const merged = [...newPosts, ...existing];

            await fs.writeFile(dumpPath, JSON.stringify(merged, null, 2));
            logger.log(`   💾 Saved ${merged.length} posts for @${username} (+${newPosts.length} new)`);
        }

        await page.waitForTimeout(Math.random() * 5000 + 2000);
    }

    await browser.close();
    await logger.save();
}

main().catch(console.error);
