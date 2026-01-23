/**
 * Google Contacts PUSH script - Sync contacts to GitHub
 * Run: npm run google-contacts:push
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MindCache } from 'mindcache';
import { GitStore, MindCacheSync } from '@mindcache/gitstore';
import { loadConfig, getResolvedPaths, loadGitHubConfig, getTodayString } from '../../config/config';
import { GoogleContactsPluginConfig, DEFAULT_CONFIG } from './config';
import { Contact, CONTACT_SCHEMA } from '../../shared/contact';

async function main() {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.['google-contacts'] as GoogleContactsPluginConfig | undefined;
    const gContactConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = gContactConfig.folderName || 'gcontact';

    console.log(`📤 Google Contacts Push - Syncing to GitHub`);
    console.log(`📅 Date: ${getTodayString()}`);

    const githubConfig = await loadGitHubConfig();
    if (!githubConfig) {
        console.error('❌ GitHub not configured. Run "npm run config" first.');
        process.exit(1);
    }

    const githubPath = gContactConfig.githubPath || 'google-contacts';
    console.log(`📦 Target: ${githubConfig.owner}/${githubConfig.repo}/${githubPath}`);

    const gitStore = new GitStore({
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        tokenProvider: async () => githubConfig.token,
    });

    const outputDir = path.join(paths.connectorData, folderName);
    const mdPath = path.join(outputDir, 'google-contacts.md');

    try {
        await fs.access(mdPath);
    } catch {
        console.log(`⚠️ No processed data found. Run "npm run google-contacts:process" first.`);
        return;
    }

    const rawDumpsDir = path.join(paths.rawDumps, folderName);
    const csvPath = path.join(rawDumpsDir, 'contacts.csv');

    const { parseCSV } = require('../../shared/csv');

    let contacts: Contact[] = [];

    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const rows = parseCSV(content);

        // Re-implement mapping (abbreviated version for push)
        contacts = rows.map((row: any) => {
            const contact: Contact = {
                name: `${row['First Name'] || ''} ${row['Middle Name'] || ''} ${row['Last Name'] || ''}`.replace(/\s+/g, ' ').trim(),
                company: row['Organization Name'],
                role: row['Organization Title'],
                email: row['E-mail 1 - Value'],
                phone: row['Phone 1 - Value'],
                address: row['Address 1 - Formatted'],
                birthday: row['Birthday'],
            };

            let notes = row['Notes'] || '';
            const website = row['Website 1 - Value'];
            if (website) {
                if (website.includes('linkedin.com')) contact.linkedin = website;
                else if (website.includes('twitter.com') || website.includes('x.com')) contact.twitter = website;
                else notes += `\nWebsite: ${website}`;
            }
            if (notes) contact.notes = notes.trim();

            // Clean
            if (!contact.email) delete contact.email;
            if (!contact.phone) delete contact.phone;
            if (!contact.company) delete contact.company;
            if (!contact.role) delete contact.role;
            if (!contact.address) delete contact.address;
            if (!contact.birthday) delete contact.birthday;
            if (!contact.linkedin) delete contact.linkedin;
            if (!contact.twitter) delete contact.twitter;

            return contact.name ? contact : null;
        }).filter((c: any) => c) as Contact[];

    } catch (e) {
        console.log('⚠️ Could not read CSV source for push.');
        return;
    }

    const mindcache = new MindCache();

    // REGISTER THE SCHEMA
    mindcache.registerType('Contact', CONTACT_SCHEMA);

    for (const contact of contacts) {
        const key = `contact_google_${contact.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
        mindcache.set(key, JSON.stringify(contact));
        mindcache.setType(key, 'Contact');
    }

    mindcache.set('last_sync_google', new Date().toISOString());

    const syncFile = `${githubPath}/contacts.md`;
    const sync = new MindCacheSync(gitStore, mindcache, {
        filePath: syncFile,
        instanceName: 'Google Contacts Connector',
    });

    try {
        await sync.save({ message: `Google Contacts: ${contacts.length} contacts` });
        console.log(`   ✅ Synced ${contacts.length} contacts to ${syncFile}`);
    } catch (error: any) {
        console.error(`   ❌ Failed to sync: ${error.message}`);
    }

    console.log('✨ Done!');
}

main().catch(console.error);
