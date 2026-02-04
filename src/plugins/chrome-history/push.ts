/**
 * Chrome History PUSH script - Sync browsing history to GitHub using MindCache
 * Run: npm run chrome:push
 * 
 * Creates one file per day, with one key per domain
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
 * Group URLs by domain
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
 * Format domain URLs as markdown content
 */
function formatDomainContent(domain: string, urls: UrlEntry[]): string {
    const lines: string[] = [];

    // Sort by timestamp
    urls.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const entry of urls) {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const title = entry.title || 'Untitled';
        // Escape markdown special chars in title
        const safeTitle = title.replace(/[[\]]/g, '\\$&');
        lines.push(`- ${time} [${safeTitle}](${entry.url})`);
    }

    return lines.join('\n');
}

/**
 * Create MindCache for a single day with one key per domain
 */
function createDayMindCache(date: string, urls: UrlEntry[]): MindCache {
    const mindcache = new MindCache();
    const byDomain = groupByDomain(urls);

    // Sort domains by visit count
    const sortedDomains = [...byDomain.entries()]
        .sort((a, b) => b[1].length - a[1].length);

    for (const [domain, domainUrls] of sortedDomains) {
        const keyName = domain;
        const content = formatDomainContent(domain, domainUrls);

        mindcache.set_value(keyName, content, {
            contentTags: [date, 'chrome', domain],
            zIndex: 0
        });
    }

    return mindcache;
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

    let totalUrls = 0;
    let totalDomains = 0;

    // Create one file per day
    for (const [date, urls] of historyByDate) {
        const mindcache = createDayMindCache(date, urls);
        const domainCount = groupByDomain(urls).size;

        const syncFile = `${githubPath}/chrome-history-${date}.md`;
        const sync = new MindCacheSync(gitStore, mindcache, {
            filePath: syncFile,
            instanceName: `Chrome History ${date}`,
        });

        try {
            await sync.save({ message: `Chrome ${date}: ${urls.length} URLs, ${domainCount} domains` });
            console.log(`   ✅ ${date}: ${urls.length} URLs, ${domainCount} domains → ${syncFile}`);
            totalUrls += urls.length;
            totalDomains += domainCount;
        } catch (error: any) {
            console.error(`   ❌ ${date}: Failed - ${error.message}`);
        }
    }

    console.log(`\n📊 Summary: ${totalUrls} URLs, ${totalDomains} domains across ${historyByDate.size} days`);
    console.log('✨ Done!');
}

main().catch(console.error);
