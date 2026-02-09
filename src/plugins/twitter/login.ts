/**
 * Twitter LOGIN script - Save browser session for scraping
 * Run: npm run twitter:login
 *
 * Opens a real Chrome browser with a persistent profile so you can log in.
 * Session persists in auth/twitter-profile/ and is also exported to
 * auth/twitter-state.json for headless use on another machine.
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths } from '../../config/config';

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const statePath = paths.twitterSession;
    const profileDir = path.join(paths.auth, 'twitter-profile');

    console.log('🐦 Twitter Login - Save session for scraping\n');
    console.log(`📁 Profile dir: ${profileDir}`);
    console.log(`📁 State export: ${statePath}\n`);

    await fs.mkdir(profileDir, { recursive: true });

    // Use persistent context — behaves like a real Chrome install
    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        channel: 'chrome',  // Use real Chrome, not Chromium
        viewport: { width: 1280, height: 800 },
        args: [
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const page = context.pages()[0] || await context.newPage();

    console.log('🌐 Opening X.com...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

    // Check if already logged in
    try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });
        console.log('✅ Already logged in!');
    } catch {
        console.log('⚠️  Not logged in. Please log in manually in the browser window.');
        console.log('⏳ Waiting for login (no timeout)...\n');

        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 0 });
        console.log('✅ Login detected!');
    }

    // Export session state for use on other machines
    await context.storageState({ path: statePath });
    console.log(`💾 Session exported to: ${statePath}`);
    console.log('\n📋 Copy to your server:');
    console.log(`   scp ${statePath} server:~/own-your-data/auth/twitter-state.json`);

    await context.close();
    console.log('\n✨ Done!');
}

main().catch(console.error);
