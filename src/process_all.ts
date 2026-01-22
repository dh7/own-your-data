/**
 * Process All - Run process command for all plugins
 * Run: npm run process_all
 *
 * Discovers all plugins and runs their process command.
 */

import { spawn } from 'child_process';
import { discoverPlugins } from './plugins';

async function runCommand(name: string, command: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n📄 Processing ${name}...`);

        const [cmd, ...args] = command.split(' ');
        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd(),
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${name} processed successfully`);
                resolve(true);
            } else {
                console.log(`❌ ${name} process failed with code ${code}`);
                resolve(false);
            }
        });

        child.on('error', (err) => {
            console.error(`❌ ${name} process error:`, err.message);
            resolve(false);
        });
    });
}

async function main() {
    console.log('📄 Process All - Running process for all plugins\n');

    const plugins = await discoverPlugins();

    let processed = 0;
    let skipped = 0;

    for (const plugin of plugins) {
        const processCmd = plugin.manifest.commands.process;

        if (!processCmd) {
            console.log(`⏩ ${plugin.manifest.name} has no process command, skipping`);
            skipped++;
            continue;
        }

        const success = await runCommand(plugin.manifest.name, processCmd);
        if (success) processed++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log('✨ Done!');
}

main().catch(console.error);
