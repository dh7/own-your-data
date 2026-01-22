/**
 * Push All - Sync all plugins to GitHub
 * Run: npm run push_all
 *
 * Discovers all plugins and runs their push command.
 */

import { spawn } from 'child_process';
import { discoverPlugins } from './plugins';
import { loadGitHubConfig } from './config/config';

async function runCommand(name: string, command: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n📤 Pushing ${name}...`);

        const [cmd, ...args] = command.split(' ');
        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd(),
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${name} pushed successfully`);
                resolve(true);
            } else {
                console.log(`❌ ${name} push failed with code ${code}`);
                resolve(false);
            }
        });

        child.on('error', (err) => {
            console.error(`❌ ${name} push error:`, err.message);
            resolve(false);
        });
    });
}

async function main() {
    console.log('📤 Push All - Syncing all plugins to GitHub\n');

    // Check GitHub config first
    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}`);

    const plugins = await discoverPlugins();

    let pushed = 0;
    let failed = 0;

    for (const plugin of plugins) {
        const pushCmd = plugin.manifest.commands.push;

        if (!pushCmd) {
            console.log(`⏩ ${plugin.manifest.name} has no push command, skipping`);
            continue;
        }

        const success = await runCommand(plugin.manifest.name, pushCmd);
        if (success) {
            pushed++;
        } else {
            failed++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Pushed: ${pushed}`);
    console.log(`   Failed: ${failed}`);
    console.log('✨ Done!');
}

main().catch(console.error);
