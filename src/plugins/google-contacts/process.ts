/**
 * Google Contacts PROCESS script - Generate MindCache markdown files
 * Run: npm run google-contacts:process
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { GoogleContactsPluginConfig, DEFAULT_CONFIG } from './config';
import { parseCSV } from '../../shared/csv';
import { Contact, CONTACT_SCHEMA } from '../../shared/contact';
import { writeIfChanged } from '../../shared/write-if-changed';
import { initPluginLog } from '../../shared/plugin-logger';

// Map CSV headers to Contact properties
function mapToContact(row: Record<string, string>): Contact {
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

    // Website field: try to detect LinkedIn or Twitter, otherwise add to notes
    const website = row['Website 1 - Value'];
    if (website) {
        if (website.includes('linkedin.com')) {
            contact.linkedin = website;
        } else if (website.includes('twitter.com') || website.includes('x.com')) {
            contact.twitter = website;
        } else {
            notes += `\nWebsite: ${website}`;
        }
    }

    // Capture other potentially useful fields into notes if present
    const otherFields = [
        'E-mail 2 - Value', 'Phone 2 - Value', 'Address 2 - Formatted'
    ];

    for (const field of otherFields) {
        if (row[field]) {
            notes += `\n${field.replace(' - Value', '').replace(' - Formatted', '')}: ${row[field]}`;
        }
    }

    if (notes) {
        contact.notes = notes.trim();
    }

    // Clean up empty fields
    if (!contact.email) delete contact.email;
    if (!contact.phone) delete contact.phone;
    if (!contact.company) delete contact.company;
    if (!contact.role) delete contact.role;
    if (!contact.address) delete contact.address;
    if (!contact.birthday) delete contact.birthday;
    if (!contact.linkedin) delete contact.linkedin;
    if (!contact.twitter) delete contact.twitter;

    return contact;
}

function generateMindCacheContent(contacts: Contact[], exportDate: string): string {
    const lines: string[] = [
        '# MindCache STM Export (Google Contacts)',
        '',
        `Export Date: ${exportDate}`,
        '',
        '---',
        '',
        '## Contact Schema',
        '',
        '```mindcache-schema',
        CONTACT_SCHEMA.trim(),
        '```',
        '',
        '## STM Entries',
        '',
    ];

    for (const contact of contacts) {
        if (!contact.name) continue;

        const keyName = `contact_google_${contact.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

        lines.push(`### ${keyName}`);
        lines.push(`- **Type**: \`Contact\``);
        lines.push(`- **System Tags**: \`none\``);
        lines.push(`- **Z-Index**: \`0\``);
        lines.push(`- **Tags**: \`google-contacts\`, \`contact\``);
        lines.push(`- **Value**:`);
        lines.push('```json');
        lines.push(JSON.stringify(contact, null, 2));
        lines.push('```');
        lines.push('');
    }

    return lines.join('\n');
}

async function main() {
    initPluginLog('google-contacts');
    console.log('👥 Google Contacts Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    const pluginConfig = (config as any).plugins?.['google-contacts'] as GoogleContactsPluginConfig | undefined;
    const gContactConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = gContactConfig.folderName || 'gcontact';

    const rawDumpsDir = path.join(paths.rawDumps, folderName);
    const outputDir = path.join(paths.connectorData, folderName);
    const today = getTodayString();

    await fs.mkdir(outputDir, { recursive: true });

    const csvPath = path.join(rawDumpsDir, 'contacts.csv');

    try {
        const content = await fs.readFile(csvPath, 'utf-8');
        const rows = parseCSV(content);

        console.log(`   Found ${rows.length} contacts in CSV.`);

        const contacts = rows.map(mapToContact).filter(c => c.name.length > 0);

        if (contacts.length === 0) {
            console.log('   ⚠️ No valid contacts found.');
            return;
        }

        const mdContent = generateMindCacheContent(contacts, today);
        const mdPath = path.join(outputDir, 'google-contacts.md');
        const written = await writeIfChanged(mdPath, mdContent);

        if (written) {
            console.log(`   ✅ Generated ${path.basename(mdPath)} (${contacts.length} contacts)`);
        } else {
            console.log(`   ⏭️  Skipped ${path.basename(mdPath)} (no changes)`);
        }
        console.log(`\n✨ Done! Files saved to: ${outputDir}`);

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`⚠️ contacts.csv not found in ${rawDumpsDir}`);
        } else {
            console.error('❌ Error processing Google Contacts data:', error);
        }
    }
}

main().catch(console.error);
