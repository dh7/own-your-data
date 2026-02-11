/**
 * Chrome History PROCESS script - Generate MindCache files per day
 * Run: npm run chrome:process
 *
 * Reads raw JSON dumps from raw-dumps/chrome-history and generates
 * one MindCache .md file per day in connector_data/chrome-history/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths } from '../../config/config';
import { ChromeHistoryPluginConfig, DEFAULT_CONFIG } from './config';
import { UrlEntry } from './types';
import { writeIfChanged } from '../../shared/write-if-changed';
import { initPluginLog } from '../../shared/plugin-logger';

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



async function main() {
    initPluginLog('chrome-history');
    console.log('🌐 Chrome History Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.['chrome-history'] as ChromeHistoryPluginConfig | undefined;
    const chromeConfig = pluginConfig || DEFAULT_CONFIG;

    const rawDumpsDir = path.join(paths.rawDumps, chromeConfig.folderName || 'chrome-history');
    const outputDir = path.join(paths.connectorData, 'chrome-history');

    await fs.mkdir(outputDir, { recursive: true });

    console.log(`📅 Processing all available history files...`);

    // Group all URLs by date
    const urlsByDate = new Map<string, UrlEntry[]>();

    // Read all available JSON files
    let files: string[];
    try {
        const allFiles = await fs.readdir(rawDumpsDir);
        files = allFiles.filter(f => f.endsWith('.json')).sort().reverse();
    } catch {
        console.log('   ⚠️ No raw dumps directory found.');
        return;
    }

    for (const file of files) {
        const dateStr = file.replace('.json', '');

        const filePath = path.join(rawDumpsDir, file);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const urls: UrlEntry[] = JSON.parse(content);
            urlsByDate.set(dateStr, urls);
        } catch (e) {
            console.error(`   Error reading ${file}:`, e);
        }
    }

    if (urlsByDate.size === 0) {
        console.log('   ⚠️ No browsing history found.');
        return;
    }

    let totalUrls = 0;
    let filesGenerated = 0;

    // Generate one MindCache file per day
    for (const [dateStr, urls] of urlsByDate) {
        if (urls.length === 0) continue;

        const mindcache = new MindCache();

        // Group by domain
        const byDomain = groupByDomain(urls);

        // Sort domains by visit count
        const sortedDomains = [...byDomain.entries()]
            .sort((a, b) => b[1].length - a[1].length);

        // Create one entry per domain
        for (const [domain, domainUrls] of sortedDomains) {
            // Sort by timestamp
            domainUrls.sort((a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            // Build content
            const contentLines: string[] = [];
            contentLines.push(`# ${domain} - ${dateStr}`);
            contentLines.push('');

            for (const entry of domainUrls) {
                const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const title = entry.title || 'Untitled';
                // Escape markdown special chars in title
                const safeTitle = title.replace(/[[\]]/g, '\\$&');
                contentLines.push(`*${time}* [${safeTitle}](${entry.url})`);
                contentLines.push('');
            }

            const content = contentLines.join('\n');

            // Generate a clean domain tag
            const domainTag = domain
                .replace(/^www\./, '')
                .replace(/\.[^.]+$/, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

            mindcache.set_value(domain, content, {
                contentTags: ['chrome', 'history', dateStr, domainTag],
                zIndex: 0
            });
        }

        // Write to file only if content changed
        const localPath = path.join(outputDir, `chrome-${dateStr}.md`);
        const written = await writeIfChanged(localPath, mindcache.toMarkdown());

        totalUrls += urls.length;
        if (written) {
            console.log(`   📅 ${dateStr}: ${urls.length} URLs across ${sortedDomains.length} domains`);
            filesGenerated++;
        } else {
            console.log(`   ⏭️  Skipped ${path.basename(localPath)} (no changes)`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Days processed: ${filesGenerated}`);
    console.log(`   Total URLs: ${totalUrls}`);
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
