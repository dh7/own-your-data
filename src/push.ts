/**
 * Unified PUSH script - Push all connector data to GitHub
 * Run: npm run push
 *
 * Pushes all files from connector_data/ to the configured GitHub repo
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, loadGitHubConfig, getResolvedPaths, getTodayString } from './config/config';

interface FileToUpload {
    localPath: string;
    remotePath: string;
    connector: string;
}

async function getFilesRecursively(dir: string, baseDir: string = dir): Promise<string[]> {
    const files: string[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await getFilesRecursively(fullPath, baseDir));
            } else if (entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }
    } catch {
        // Directory doesn't exist
    }
    return files;
}

async function main() {
    console.log('📤 Push - Syncing all connector data to GitHub\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const githubConfig = await loadGitHubConfig();

    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" to set up.');
        process.exit(1);
    }

    const octokit = new Octokit({ auth: githubConfig.token });

    // Collect all files to upload
    const filesToUpload: FileToUpload[] = [];

    // WhatsApp files
    const whatsappFiles = await getFilesRecursively(paths.whatsappLocal);
    for (const file of whatsappFiles) {
        const relativePath = path.relative(paths.whatsappLocal, file);
        filesToUpload.push({
            localPath: file,
            remotePath: `${config.whatsapp?.githubPath || 'whatsapp'}/${relativePath}`,
            connector: 'whatsapp',
        });
    }

    // Twitter files
    const twitterFiles = await getFilesRecursively(paths.twitterLocal);
    for (const file of twitterFiles) {
        const relativePath = path.relative(paths.twitterLocal, file);
        filesToUpload.push({
            localPath: file,
            remotePath: `${config.twitter?.githubPath || 'twitter'}/${relativePath}`,
            connector: 'twitter',
        });
    }

    // Instagram files
    const instagramFiles = await getFilesRecursively(paths.instagramLocal);
    for (const file of instagramFiles) {
        const relativePath = path.relative(paths.instagramLocal, file);
        filesToUpload.push({
            localPath: file,
            remotePath: `${config.instagram?.githubPath || 'instagram'}/${relativePath}`,
            connector: 'instagram',
        });
    }

    if (filesToUpload.length === 0) {
        console.log('⚠️ No files to push. Run connector get scripts first.');
        process.exit(0);
    }

    console.log(`📂 Found ${filesToUpload.length} file(s) to push:`);
    const byConnector = filesToUpload.reduce((acc, f) => {
        acc[f.connector] = (acc[f.connector] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    for (const [connector, count] of Object.entries(byConnector)) {
        console.log(`   ${connector}: ${count} file(s)`);
    }
    console.log('');

    // Upload each file
    let uploaded = 0;
    let updated = 0;
    let failed = 0;

    for (const file of filesToUpload) {
        try {
            const content = await fs.readFile(file.localPath, 'utf-8');
            const contentBase64 = Buffer.from(content).toString('base64');

            // Check if file exists to get SHA
            let sha: string | undefined;
            try {
                const { data } = await octokit.repos.getContent({
                    owner: githubConfig.owner,
                    repo: githubConfig.repo,
                    path: file.remotePath,
                });
                if (!Array.isArray(data) && 'sha' in data) {
                    sha = data.sha;
                }
            } catch {
                // File doesn't exist, will create
            }

            // Create or update file
            await octokit.repos.createOrUpdateFileContents({
                owner: githubConfig.owner,
                repo: githubConfig.repo,
                path: file.remotePath,
                message: `Update ${file.connector} data - ${getTodayString()}`,
                content: contentBase64,
                sha,
            });

            if (sha) {
                console.log(`   ✅ Updated: ${file.remotePath}`);
                updated++;
            } else {
                console.log(`   ✅ Created: ${file.remotePath}`);
                uploaded++;
            }
        } catch (err: any) {
            console.error(`   ❌ Failed: ${file.remotePath} - ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${uploaded}`);
    console.log(`   Updated: ${updated}`);
    if (failed > 0) {
        console.log(`   Failed: ${failed}`);
    }
    console.log(`\n✨ Done! View at: https://github.com/${githubConfig.owner}/${githubConfig.repo}`);
}

main().catch(console.error);
