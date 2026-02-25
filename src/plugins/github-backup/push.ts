/**
 * GitHub Backup PUSH script
 * Finds the git repo containing sourcePath, adds files, commits, pushes.
 * Run: npm run github-backup:push
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getResolvedPaths, loadPluginConfig, loadGitHubConfig, getTodayString } from '../../config/config';
import { GithubBackupConfig, DEFAULT_CONFIG } from './config';
import { initPluginLog } from '../../shared/plugin-logger';

function git(cmd: string, cwd: string): string {
    console.log(`  $ git ${cmd}`);
    return execSync(`git ${cmd}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
    }).trim();
}

/**
 * Walk up from `dir` looking for a .git directory.
 * Returns the repo root or null.
 */
function findGitRoot(dir: string): string | null {
    let current = path.resolve(dir);
    while (true) {
        if (fs.existsSync(path.join(current, '.git'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return null; // reached filesystem root
        current = parent;
    }
}

async function main() {
    initPluginLog('github-backup');
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    const pluginConfig = await loadPluginConfig<GithubBackupConfig>('github-backup');
    const cfg = pluginConfig || DEFAULT_CONFIG;

    if (!cfg.enabled) {
        console.log('⏸ GitHub Backup is disabled.');
        return;
    }

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    // Resolve source path (could be absolute or relative to CWD)
    const sourcePath = path.resolve(cfg.sourcePath || DEFAULT_CONFIG.sourcePath);
    const date = getTodayString();
    const message = (cfg.commitMessage || DEFAULT_CONFIG.commitMessage).replace('{date}', date);

    console.log(`📦 GitHub Backup - Push`);
    console.log(`📂 Source: ${sourcePath}`);
    console.log(`📝 Message: ${message}\n`);

    // Verify source exists
    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ Source path not found: ${sourcePath}`);
        process.exit(1);
    }

    // Find the git repo that CONTAINS sourcePath (look from parent up first,
    // so we don't get tricked by a nested .git inside sourcePath itself).
    const parentRepo = findGitRoot(path.dirname(sourcePath));
    const selfRepo = fs.existsSync(path.join(sourcePath, '.git')) ? sourcePath : null;

    let workDir: string;
    let addPath: string;

    if (parentRepo) {
        // sourcePath is inside a larger repo — use the parent repo
        workDir = parentRepo;
        addPath = path.relative(parentRepo, sourcePath);
        if (!addPath) addPath = '.';
        console.log(`📁 Using repo at: ${parentRepo}`);
        console.log(`📎 Adding: ${addPath}/\n`);
        // If sourcePath has a stale nested .git, warn
        if (selfRepo) {
            console.log(`⚠️  Ignoring nested .git inside ${sourcePath} (using parent repo)\n`);
        }
    } else if (selfRepo) {
        // sourcePath IS a standalone repo — use it
        workDir = sourcePath;
        addPath = '.';
        console.log(`📁 Using repo at: ${sourcePath}\n`);
    } else {
        // No git repo found — init one at the source path
        console.log('📦 No git repo found, initializing...');
        git('init -b main', sourcePath);
        workDir = sourcePath;
        addPath = '.';
    }

    // Set remote with token-based URL
    const remoteUrl = `https://x-access-token:${githubConfig.token}@github.com/${githubConfig.owner}/${githubConfig.repo}.git`;
    try {
        git('remote get-url origin', workDir);
        git(`remote set-url origin ${remoteUrl}`, workDir);
    } catch {
        git(`remote add origin ${remoteUrl}`, workDir);
    }

    try {
        // Get current branch name
        const branch = git('rev-parse --abbrev-ref HEAD', workDir);

        // Pull remote changes first (rebase to keep history clean).
        // This prevents "rejected - fetch first" errors when another
        // source (e.g. Vercel cron) pushes to the same repo.
        try {
            console.log('🔄 Pulling remote changes...');
            git(`pull --rebase origin ${branch}`, workDir);
            console.log('✅ Up to date with remote.\n');
        } catch (pullErr: any) {
            // If pull fails due to uncommitted changes, stash → pull → pop
            if (pullErr.message?.includes('unstaged changes') || pullErr.message?.includes('uncommitted changes')) {
                console.log('📦 Stashing local changes before pull...');
                git('stash --include-untracked', workDir);
                git(`pull --rebase origin ${branch}`, workDir);
                git('stash pop', workDir);
                console.log('✅ Pulled and restored local changes.\n');
            } else {
                // If remote doesn't exist yet (first push), that's fine
                console.log(`⚠️ Pull skipped: ${pullErr.message}\n`);
            }
        }

        // Add files
        git(`add "${addPath}"`, workDir);

        const status = git('status --porcelain', workDir);
        if (!status) {
            console.log('✅ Nothing to commit, everything up to date.');
            return;
        }

        console.log(`📄 Changed files:\n${status}\n`);

        // Commit
        git(`commit -m "${message}"`, workDir);

        // Push
        git(`push -u origin ${branch}`, workDir);

        console.log('\n✅ Pushed successfully!');
    } catch (error: any) {
        console.error(`\n❌ Failed: ${error.message}`);
        if (error.stderr) console.error(error.stderr);
        process.exit(1);
    }
}

main().catch(console.error);
