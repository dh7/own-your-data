/**
 * Transcripts PUSH script - Sync transcripts to GitHub
 * Run: npm run transcript:push
 *
 * Reads processed data from connector_data and pushes to GitHub.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { TranscriptsPluginConfig, DEFAULT_CONFIG } from './config';
import { TranscriptEntry } from './types';

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.transcripts as TranscriptsPluginConfig | undefined;
    const transcriptsConfig = pluginConfig || DEFAULT_CONFIG;

    console.log(`📤 Transcripts Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const transcriptsPath = transcriptsConfig.githubPath || DEFAULT_CONFIG.githubPath;
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${transcriptsPath}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    // Find all transcript JSON files
    const outputDir = path.join(paths.connectorData, 'transcripts');
    let jsonFiles: string[] = [];

    try {
        const entries = await fs.readdir(outputDir);
        jsonFiles = entries
            .filter(f => f.endsWith('.json') && !f.includes('metadata'))
            .sort();
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('⚠️ No transcripts found. Run "npm run transcript:process" first.');
            process.exit(0);
        }
        throw error;
    }

    if (jsonFiles.length === 0) {
        console.log('⚠️ No transcripts to push.');
        process.exit(0);
    }

    // Load all transcripts and group by date
    const byDate: Record<string, TranscriptEntry[]> = {};

    for (const file of jsonFiles) {
        try {
            const data = await fs.readFile(path.join(outputDir, file), 'utf-8');
            const entry = JSON.parse(data) as TranscriptEntry;
            const date = entry.fileDate;

            if (!byDate[date]) {
                byDate[date] = [];
            }
            byDate[date].push(entry);
        } catch {
            // Skip invalid files
        }
    }

    const dates = Object.keys(byDate).sort().reverse();
    console.log(`📄 Found transcripts for ${dates.length} day(s)\n`);

    let totalSynced = 0;

    for (const date of dates) {
        const transcripts = byDate[date];
        console.log(`📅 Processing ${date} (${transcripts.length} transcript(s))...`);

        try {
            const mindcache = new MindCache();

            for (const transcript of transcripts) {
                let content = transcript.text;
                if (transcript.duration) {
                    const minutes = Math.floor(transcript.duration / 60);
                    const seconds = Math.round(transcript.duration % 60);
                    content += `\n\n⏱️ Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                content += `\n📁 File: ${transcript.filename}`;

                const tags = ['transcript', date];
                if (transcript.language) {
                    tags.push(`lang:${transcript.language}`);
                }

                const keyName = `Transcript - ${transcript.filename}`;
                mindcache.set_value(keyName, content, {
                    contentTags: tags,
                    zIndex: 0
                });
            }

            const filePath = `${transcriptsPath}/transcripts-${date}.md`;
            const sync = new MindCacheSync(gitStore, mindcache, {
                filePath,
                instanceName: 'Transcripts',
            });

            await sync.save({ message: `Transcripts ${date}: ${transcripts.length} file(s)` });
            console.log(`   ✅ Synced to ${filePath}`);
            totalSynced += transcripts.length;
        } catch (error: any) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total transcripts synced: ${totalSynced}`);
    console.log(`   Days: ${dates.length}`);
    console.log('✨ Done!');
}

main().catch(console.error);
