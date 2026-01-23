/**
 * LinkedIn PUSH script - Sync contacts to GitHub
 * Run: npm run linkedin:push
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { LinkedInPluginConfig, DEFAULT_CONFIG } from './config';
import { Contact, CONTACT_SCHEMA } from '../../shared/contact';

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.linkedin as LinkedInPluginConfig | undefined;
    const linkedinConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = linkedinConfig.folderName || 'linkedin';

    console.log(`📤 LinkedIn Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = linkedinConfig.githubPath || 'linkedin';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const outputDir = path.join(paths.connectorData, folderName);
    const mdPath = path.join(outputDir, 'linkedin-contacts.md');

    try {
        await fs.access(mdPath);
    } catch {
        console.log(`⚠️ No processed data found. Run "npm run linkedin:process" first.`);
        return;
    }

    // Read the processed Markdown file (which mimics MindCache format)
    // Actually, for the Push script, we should probably re-parse the contacts or read the intermediate JSON if we saved one. 
    // `process.ts` saved a `.md` file for local viewing/storage, but `MindCacheSync` expects a `MindCache` object.
    // We can parse the contacts from the Markdown we just wrote, OR (better) `process.ts` could also output a JSON file for `push.ts` to consume easier.
    // However, specifically for this implementation, let's parse the contacts back from the JSON blocks inside the generated MD, 
    // or just re-process the CSV if we want to be pure. 
    // Let's re-process the CSV to build the MindCache object cleanly for sync, 
    // as parsing the MD back is brittle and redundant given we have the source.

    // WAIT: Users workflow is typically Get -> Process -> Push.
    // If Process generates the artifact, Push should sync it.
    // But `process.ts` did the heavy lifting of parsing CSV.
    // Let's modify `process.ts` to also save `contacts.json` to make `push.ts` life easier?
    // User requirement: "The process extracts the meaningfull informations ... into mindcache files."
    // `process.ts` generates the file.
    // If I re-read the CSV here, it's duplication but robust.

    const rawDumpsDir = path.join(paths.rawDumps, folderName);
    const csvPath = path.join(rawDumpsDir, 'Connections.csv');
    // We'll import the parsing logic or just duplicate the minimal part needed to get the objects.
    // For simplicity and robustness, I will re-parse the Markdown file or re-read CSV? 
    // Re-reading CSV is safer than parsing Markdown.

    // We need parseCSV again... wait I can't import `mapToContact` from `process.ts` easily unless I export it.
    // Let's just assume `process.ts` worked and we use the CSV.

    const { parseCSV } = require('../../shared/csv');

    let contacts: Contact[] = [];

    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split('\n');
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('First Name')) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex === -1) throw new Error('No header found');
        const cleanCsv = lines.slice(headerIndex).join('\n');
        const rows = parseCSV(cleanCsv);

        // Re-implement mapping (simple version)
        contacts = rows.map((row: any) => {
            const contact: Contact = {
                name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim(),
                company: row['Company'],
                role: row['Position'],
                email: row['Email Address'],
                linkedin: row['URL'],
            };
            const connectedOn = row['Connected On'];
            if (connectedOn) contact.notes = `Connected on: ${connectedOn}`;

            // Clean
            if (!contact.email) delete contact.email;
            if (!contact.company) delete contact.company;
            if (!contact.role) delete contact.role;
            if (!contact.linkedin) delete contact.linkedin;

            return contact.name ? contact : null;
        }).filter((c: any) => c) as Contact[];

    } catch (e) {
        console.log('⚠️ Could not read CSV source for push. Ensure process ran correctly or CSV exists.');
        return;
    }

    const mindcache = new MindCache();

    // REGISTER THE SCHEMA
    mindcache.registerType('Contact', CONTACT_SCHEMA);

    for (const contact of contacts) {
        const key = `contact_linkedin_${contact.name.replace(/\s+/g, '_').toLowerCase()}`;
        // Set Value (JSON) and Type (Contact)
        mindcache.set(key, JSON.stringify(contact));
        mindcache.setType(key, 'Contact');
    }

    mindcache.set('last_sync_linkedin', new Date().toISOString());

    const syncFile = `${githubPath}/linkedin.md`; // This will be the remote file name
    const sync = new MindCacheSync(gitStore, mindcache, {
        filePath: syncFile,
        instanceName: 'LinkedIn Connector',
    });

    try {
        await sync.save({ message: `LinkedIn: ${contacts.length} contacts` });
        console.log(`   ✅ Synced ${contacts.length} contacts to ${syncFile}`);
    } catch (error: any) {
        console.error(`   ❌ Failed to sync: ${error.message}`);
    }

    console.log('✨ Done!');
}

main().catch(console.error);
