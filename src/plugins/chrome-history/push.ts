/**
 * Chrome History PUSH script - Sync browsing history to GitHub using MindCache
 * Run: npm run chrome:push
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { ChromeHistoryPluginConfig, DEFAULT_CONFIG } from './config';
import { UrlEntry } from './types';

/**
 * Load all history files from raw-dumps/chrome-history
 */
async function loadHistoryFiles(rawDumpsDir: string, daysToSync: number): Promise<Map<string, UrlEntry[]>> {
    const historyByDate = new Map<string, UrlEntry[]>();

    try {
        const files = await fs.readdir(rawDumpsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

        // Calculate cutoff date
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysToSync);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        for (const file of jsonFiles) {
            const date = file.replace('.json', '');
            if (date < cutoffStr) continue; // Skip old files

            const filePath = path.join(rawDumpsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const urls: UrlEntry[] = JSON.parse(content);

            if (urls.length > 0) {
                historyByDate.set(date, urls);
            }
        }
    } catch (error) {
        // Directory might not exist yet
    }

    return historyByDate;
}

/**
 * Group URLs by domain for better organization
 */
function groupByDomain(urls: UrlEntry[]): Map<string, UrlEntry[]> {
    const byDomain = new Map<string, UrlEntry[]>();

    for (const entry of urls) {
        let domain = 'unknown';
        try {
            domain = new URL(entry.url).hostname;
        } catch { }

        if (!byDomain.has(domain)) {
            byDomain.set(domain, []);
        }
        byDomain.get(domain)!.push(entry);
    }

    return byDomain;
}

/**
 * Format a day's browsing history as markdown
 */
function formatDayAsMarkdown(date: string, urls: UrlEntry[]): string {
    const lines = [`# Browsing History: ${date}`, ''];

    // Group by domain
    const byDomain = groupByDomain(urls);

    // Sort domains by visit count
    const sortedDomains = [...byDomain.entries()]
        .sort((a, b) => b[1].length - a[1].length);

    lines.push(`Total visits: ${urls.length} | Domains: ${sortedDomains.length}`);
    lines.push('');

    for (const [domain, domainUrls] of sortedDomains) {
        lines.push(`## ${domain} (${domainUrls.length})`);
        lines.push('');

        // Sort by timestamp
        domainUrls.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (const entry of domainUrls) {
            const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const title = entry.title || 'Untitled';
            // Escape markdown special chars in title
            const safeTitle = title.replace(/[[\]]/g, '\\$&');
            lines.push(`- ${time} [${safeTitle}](${entry.url})`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.['chrome-history'] as ChromeHistoryPluginConfig | undefined;
    const chromeConfig = pluginConfig || DEFAULT_CONFIG;

    console.log(`🌐 Chrome History Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = chromeConfig.githubPath || 'chrome-history';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const rawDumpsDir = path.join(paths.rawDumps, chromeConfig.folderName || 'chrome-history');

    // Load all history files
    const historyByDate = await loadHistoryFiles(rawDumpsDir, chromeConfig.daysToSync);

    if (historyByDate.size === 0) {
        console.log('   ⚠️ No browsing history found. Start the extension and server first.');
        return;
    }

    console.log(`   📊 Found ${historyByDate.size} days of history`);

    // Create MindCache with all history
    const mindcache = new MindCache();

    let totalUrls = 0;

    for (const [date, urls] of historyByDate) {
        const key = `chrome_history_${date.replace(/-/g, '_')}`;
        const markdown = formatDayAsMarkdown(date, urls);

        mindcache.set_value(key, markdown, {
            contentTags: ['chrome', 'history', 'browsing', date],
            zIndex: 0
        });

        totalUrls += urls.length;
        console.log(`   📅 ${date}: ${urls.length} URLs`);
    }

    mindcache.set('last_sync_chrome_history', new Date().toISOString());

    // Sync to GitHub
    const syncFile = `${githubPath}/history.md`;
    const sync = new MindCacheSync(gitStore, mindcache, {
        filePath: syncFile,
        instanceName: 'Chrome History',
    });

    try {
        await sync.save({ message: `Chrome: ${historyByDate.size} days, ${totalUrls} URLs` });
        console.log(`   ✅ Synced ${totalUrls} URLs across ${historyByDate.size} days to ${syncFile}`);
    } catch (error: any) {
        console.error(`   ❌ Failed to sync: ${error.message}`);
    }

    console.log('✨ Done!');
}

main().catch(console.error);
