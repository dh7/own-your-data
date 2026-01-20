/**
 * WhatsApp PUSH script - Sync conversations to GitHub
 * Run: npm run whatsapp:push
 * 
 * Reads the local whatsapp-YYYY-MM-DD.md and pushes to GitHub.
 * Also uploads any media files from media/{date}/ folder.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../config/config';

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
    const today = getTodayString();

    const localPath = path.join(paths.whatsappLocal, `whatsapp-${today}.md`);
    const mediaDirPath = path.join(paths.whatsappLocal, 'media', today);

    console.log(`📤 WhatsApp Push - Syncing to GitHub`);
    console.log(`📅 Date: ${today}`);
    console.log(`📂 Source: ${localPath}`);

    // Check if local file exists
    try {
        await fs.access(localPath);
    } catch {
        console.error(`❌ No local file found: ${localPath}`);
        console.log('Run "npm run whatsapp:process" first to generate output.');
        process.exit(1);
    }

    // Load GitHub config
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const outputPath = config.whatsapp?.githubPath || 'whatsapp';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${outputPath}`);

    try {
        // Read local file and parse into MindCache
        const content = await fs.readFile(localPath, 'utf-8');
        const mindcache = new MindCache();
        mindcache.fromMarkdown(content);

        // Sync markdown to GitHub
        const gitStore = new GitStore({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            tokenProvider: async () => githubConfig.token,
        });

        // Use per-connector path or fallback
        const whatsappPath = config.whatsapp?.githubPath || 'whatsapp';
        const sync = new MindCacheSync(gitStore, mindcache, {
            filePath: `${whatsappPath}/whatsapp-${today}.md`,
            instanceName: 'WhatsApp Collector',
        });

        const keys = mindcache.keys();
        await sync.save({ message: `WhatsApp ${today}: ${keys.length} conversations` });
        console.log('✅ Markdown synced to GitHub');

        // Upload media files
        let mediaCount = 0;
        try {
            const mediaFiles = await fs.readdir(mediaDirPath);
            if (mediaFiles.length > 0) {
                console.log(`📷 Uploading ${mediaFiles.length} media files...`);

                const octokit = new Octokit({ auth: githubConfig.token });

                for (const filename of mediaFiles) {
                    const localFilePath = path.join(mediaDirPath, filename);
                    const remoteFilePath = `${outputPath}/media/${today}/${filename}`;
                    const fileContent = await fs.readFile(localFilePath);

                    const success = await uploadFileToGitHub(
                        octokit,
                        githubConfig.owner,
                        githubConfig.repo,
                        remoteFilePath,
                        fileContent,
                        `Add media: ${filename}`
                    );

                    if (success) {
                        mediaCount++;
                        console.log(`   ✅ ${filename}`);
                    }
                }
                console.log(`📷 Uploaded ${mediaCount}/${mediaFiles.length} media files`);
            }
        } catch {
            // Media directory doesn't exist or is empty - that's fine
        }

        console.log('✨ Done!');
    } catch (e: any) {
        console.error(`❌ GitHub sync failed: ${e.message}`);
        process.exit(1);
    }
}

main().catch(console.error);

