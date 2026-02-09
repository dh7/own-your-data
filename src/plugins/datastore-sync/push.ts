/**
 * Datastore Sync PUSH script
 * Pushes ALL files from connector_data/ to GitHub in a single commit.
 * Uses the GitHub token from gitstore config (auth/github-token.json).
 *
 * Run: npm run datastore-sync:push
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { loadConfig, getResolvedPaths, loadPluginConfig, loadGitHubConfig, getTodayString } from '../../config/config';
import { DatastoreSyncConfig, DEFAULT_CONFIG } from './config';

/**
 * Recursively walk a directory and return all file paths (relative to root).
 */
async function walkDir(dir: string, root: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkDir(fullPath, root));
        } else if (entry.isFile()) {
            files.push(path.relative(root, fullPath));
        }
    }

    return files;
}

/**
 * Check if a file is likely binary by reading first bytes.
 */
async function isBinary(filePath: string): Promise<boolean> {
    const buf = Buffer.alloc(512);
    const fd = await fs.open(filePath, 'r');
    try {
        const { bytesRead } = await fd.read(buf, 0, 512, 0);
        for (let i = 0; i < bytesRead; i++) {
            if (buf[i] === 0) return true;
        }
        return false;
    } finally {
        await fd.close();
    }
}

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const pluginConfig = await loadPluginConfig<DatastoreSyncConfig>('datastore-sync');
    const cfg = pluginConfig || DEFAULT_CONFIG;

    if (!cfg.enabled) {
        console.log('⏸ Datastore Sync is disabled.');
        return;
    }

    // Load GitHub config (same token as gitstore)
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const date = getTodayString();
    const message = (cfg.commitMessage || DEFAULT_CONFIG.commitMessage).replace('{date}', date);
    const branch = 'main';

    console.log(`📦 Datastore Sync - Push`);
    console.log(`📂 Local:  ${paths.connectorData}`);
    console.log(`📦 Remote: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);
    console.log(`📝 Message: ${message}\n`);

    // Verify local datastore exists
    try {
        await fs.access(paths.connectorData);
    } catch {
        console.error(`❌ Datastore folder not found: ${paths.connectorData}`);
        process.exit(1);
    }

    // Walk all local files
    const localFiles = await walkDir(paths.connectorData, paths.connectorData);
    if (localFiles.length === 0) {
        console.log('⚠️ No files in datastore. Nothing to push.');
        return;
    }

    console.log(`📄 Found ${localFiles.length} local files\n`);

    const octokit = new Octokit({ auth: githubConfig.token });
    const owner = githubConfig.owner;
    const repo = githubConfig.repo;

    try {
        // 1. Get current commit SHA on branch
        const { data: refData } = await octokit.git.getRef({
            owner, repo, ref: `heads/${branch}`,
        });
        const latestCommitSha = refData.object.sha;

        // 2. Get the current tree
        const { data: commitData } = await octokit.git.getCommit({
            owner, repo, commit_sha: latestCommitSha,
        });
        const baseTreeSha = commitData.tree.sha;

        // 3. Get existing remote tree to detect changes
        let existingFiles: Map<string, string> = new Map();
        try {
            const { data: tree } = await octokit.git.getTree({
                owner, repo, tree_sha: baseTreeSha, recursive: 'true',
            });
            for (const item of tree.tree) {
                if (item.type === 'blob' && item.path?.startsWith(githubPath + '/') && item.sha) {
                    existingFiles.set(item.path, item.sha);
                }
            }
        } catch {
            // Tree might not exist yet, that's fine
        }

        // 4. Create blobs for new/changed files
        const treeItems: Array<{
            path: string;
            mode: '100644';
            type: 'blob';
            sha: string;
        }> = [];

        let changedCount = 0;
        let skippedCount = 0;

        for (const relPath of localFiles) {
            const remotePath = `${githubPath}/${relPath}`;
            const localPath = path.join(paths.connectorData, relPath);

            const binary = await isBinary(localPath);
            let content: string;
            let encoding: 'utf-8' | 'base64';

            if (binary) {
                const buf = await fs.readFile(localPath);
                content = buf.toString('base64');
                encoding = 'base64';
            } else {
                content = await fs.readFile(localPath, 'utf-8');
                encoding = 'utf-8';
            }

            // Create blob
            const { data: blob } = await octokit.git.createBlob({
                owner, repo, content, encoding,
            });

            // Skip if SHA matches (no change)
            if (existingFiles.get(remotePath) === blob.sha) {
                skippedCount++;
                continue;
            }

            treeItems.push({
                path: remotePath,
                mode: '100644',
                type: 'blob',
                sha: blob.sha,
            });
            changedCount++;
            console.log(`  📤 ${remotePath}`);
        }

        if (treeItems.length === 0) {
            console.log('\n✅ Nothing to push, everything up to date.');
            return;
        }

        console.log(`\n📊 ${changedCount} changed, ${skippedCount} unchanged`);

        // 5. Create new tree
        const { data: newTree } = await octokit.git.createTree({
            owner, repo,
            base_tree: baseTreeSha,
            tree: treeItems,
        });

        // 6. Create commit
        const { data: newCommit } = await octokit.git.createCommit({
            owner, repo,
            message,
            tree: newTree.sha,
            parents: [latestCommitSha],
        });

        // 7. Update branch ref
        await octokit.git.updateRef({
            owner, repo,
            ref: `heads/${branch}`,
            sha: newCommit.sha,
        });

        console.log(`\n✅ Pushed successfully!`);
        console.log(`   Commit: ${newCommit.sha.substring(0, 7)}`);
        console.log(`   URL: ${newCommit.html_url}`);
    } catch (error: any) {
        console.error(`\n❌ Failed: ${error.message}`);
        if (error.status) console.error(`   HTTP ${error.status}`);
        process.exit(1);
    }
}

main().catch(console.error);
