/**
 * WhatsApp PUSH script - Sync conversations to GitHub
 * Run: npm run whatsapp:push
 * 
 * Pushes the last N days of whatsapp-YYYY-MM-DD.md files to GitHub.
 * Also uploads any media files from media/{date}/ folders.
 * 
 * Default: last 7 days. Override with WHATSAPP_PUSH_DAYS env var.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, loadPluginConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { WhatsAppPluginConfig, DEFAULT_CONFIG } from './config';

/**
 * Get date strings for the last N days (including today)
 */
function getLastNDays(n: number): string[] {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

/**
 * Upload a file to GitHub (creates or updates)
 */
async function uploadFileToGitHub(
    octokit: Octokit,
    owner: string,
    repo: string,
    filePath: string,
    content: Buffer,
    message: string
): Promise<boolean> {
    try {
        // Check if file already exists to get its SHA
        let sha: string | undefined;
        try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
            if (!Array.isArray(data) && 'sha' in data) {
                sha = data.sha;
            }
        } catch {
            // File doesn't exist, that's fine
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message,
            content: content.toString('base64'),
            sha,
        });
        return true;
    } catch (error: any) {
        console.error(`Failed to upload ${filePath}: ${error.message}`);
        return false;
    }
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const pluginConfig = await loadPluginConfig<WhatsAppPluginConfig>('whatsapp');
    const whatsappConfig = pluginConfig || DEFAULT_CONFIG;

    const pushDays = whatsappConfig.pushDays ?? DEFAULT_CONFIG.pushDays ?? 7;
    const dates = getLastNDays(pushDays);
    const whatsappPath = whatsappConfig.githubPath || DEFAULT_CONFIG.githubPath;

    console.log(`📤 WhatsApp Push - Syncing last ${pushDays} days to GitHub`);
    console.log(`📅 Dates: ${dates[dates.length - 1]} → ${dates[0]}`);

    // Load GitHub config
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${whatsappPath}\n`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const octokit = new Octokit({ auth: githubConfig.token });

    let filesSynced = 0;
    let totalMedia = 0;

    for (const date of dates) {
        const localPath = path.join(paths.whatsappLocal, `whatsapp-${date}.md`);

        // Check if local file exists
        try {
            await fs.access(localPath);
        } catch {
            continue; // No file for this day, skip
        }

        try {
            // Read local file and parse into MindCache
            const content = await fs.readFile(localPath, 'utf-8');
            const mindcache = new MindCache();
            mindcache.fromMarkdown(content);

            const sync = new MindCacheSync(gitStore, mindcache, {
                filePath: `${whatsappPath}/whatsapp-${date}.md`,
                instanceName: 'WhatsApp Collector',
            });

            const keys = mindcache.keys();
            await sync.save({ message: `WhatsApp ${date}: ${keys.length} conversations` });
            console.log(`   ✅ ${date}: ${keys.length} conversations`);
            filesSynced++;

            // Upload media files for this day
            const mediaDirPath = path.join(paths.whatsappLocal, 'media', date);
            try {
                const mediaFiles = await fs.readdir(mediaDirPath);
                if (mediaFiles.length > 0) {
                    for (const filename of mediaFiles) {
                        const localFilePath = path.join(mediaDirPath, filename);
                        const remoteFilePath = `${whatsappPath}/media/${date}/${filename}`;
                        const fileContent = await fs.readFile(localFilePath);

                        const success = await uploadFileToGitHub(
                            octokit,
                            githubConfig.owner,
                            githubConfig.repo,
                            remoteFilePath,
                            fileContent,
                            `Add media: ${filename}`
                        );

                        if (success) totalMedia++;
                    }
                }
            } catch {
                // Media directory doesn't exist or is empty - that's fine
            }
        } catch (e: any) {
            console.error(`   ❌ ${date}: ${e.message}`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Days synced: ${filesSynced}`);
    if (totalMedia > 0) console.log(`   Media uploaded: ${totalMedia}`);
    console.log('✨ Done!');
}

main().catch(console.error);
