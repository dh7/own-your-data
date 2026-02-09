/**
 * Datastore Sync PUSH script
 * Simple git add, commit, push using the GitHub token for auth.
 * Run: npm run datastore-sync:push
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getResolvedPaths, loadPluginConfig, loadGitHubConfig, getTodayString } from '../../config/config';
import { DatastoreSyncConfig, DEFAULT_CONFIG } from './config';

function git(cmd: string, cwd: string, env?: Record<string, string>): string {
    console.log(`  $ git ${cmd}`);
    return execSync(`git ${cmd}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
    }).trim();
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

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const datastorePath = paths.connectorData;
    const date = getTodayString();
    const message = (cfg.commitMessage || DEFAULT_CONFIG.commitMessage).replace('{date}', date);

    console.log(`📦 Datastore Sync - Push`);
    console.log(`📂 Path: ${datastorePath}`);
    console.log(`📝 Message: ${message}\n`);

    // Verify folder exists
    if (!fs.existsSync(datastorePath)) {
        console.error(`❌ Datastore folder not found: ${datastorePath}`);
        process.exit(1);
    }

    // Init git repo if needed
    if (!fs.existsSync(path.join(datastorePath, '.git'))) {
        console.log('📦 Initializing git repo...');
        git('init', datastorePath);
        git('branch -M main', datastorePath);
    }

    // Set remote with token-based URL
    const remoteUrl = `https://x-access-token:${githubConfig.token}@github.com/${githubConfig.owner}/${githubConfig.repo}.git`;
    try {
        git('remote get-url origin', datastorePath);
        git(`remote set-url origin ${remoteUrl}`, datastorePath);
    } catch {
        git(`remote add origin ${remoteUrl}`, datastorePath);
    }

    try {
        // Check for changes
        git('add .', datastorePath);

        const status = git('status --porcelain', datastorePath);
        if (!status) {
            console.log('✅ Nothing to commit, everything up to date.');
            return;
        }

        console.log(`📄 Changed files:\n${status}\n`);

        // Commit & push
        git(`commit -m "${message}"`, datastorePath);
        git('push -u origin main', datastorePath);

        console.log('\n✅ Pushed successfully!');
    } catch (error: any) {
        console.error(`\n❌ Failed: ${error.message}`);
        if (error.stderr) console.error(error.stderr);
        process.exit(1);
    }
}

main().catch(console.error);
