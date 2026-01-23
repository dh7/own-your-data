/**
 * LinkedIn PROCESS script - Generate MindCache markdown files
 * Run: npm run linkedin:process
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths, getTodayString } from '../../config/config';
import { LinkedInPluginConfig, DEFAULT_CONFIG } from './config';
import { parseCSV } from '../../shared/csv';
import { Contact, CONTACT_SCHEMA } from '../../shared/contact';

// Map CSV headers to Contact properties
function mapToContact(row: Record<string, string>): Contact {
    const contact: Contact = {
        name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim(),
        company: row['Company'],
        role: row['Position'],
        email: row['Email Address'],
        linkedin: row['URL'],
    };

    // Add extra info to notes
    const connectedOn = row['Connected On'];
    let notes = '';

    if (connectedOn) {
        notes += `Connected on: ${connectedOn}\n`;
    }

    // Clean up empty fields
    if (!contact.email) delete contact.email;
    if (!contact.company) delete contact.company;
    if (!contact.role) delete contact.role;
    if (!contact.linkedin) delete contact.linkedin;

    if (notes) {
        contact.notes = notes.trim();
    }

    return contact;
}

function generateMindCacheContent(contacts: Contact[], exportDate: string): string {
    const lines: string[] = [
        '# MindCache STM Export',
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
        if (!contact.name) continue; // Skip empty names

        // Create a unique key (MindCache style)
        const keyName = `contact_linkedin_${contact.name.replace(/\s+/g, '_').toLowerCase()}`;

        lines.push(`### ${keyName}`);
        lines.push(`- **Type**: \`Contact\``);
        lines.push(`- **System Tags**: \`none\``);
        lines.push(`- **Z-Index**: \`0\``);
        lines.push(`- **Tags**: \`linkedin\`, \`contact\``);
        lines.push(`- **Value**:`);
        lines.push('```json');
        lines.push(JSON.stringify(contact, null, 2));
        lines.push('```');
        lines.push('');
    }

    return lines.join('\n');
}

async function main() {
    console.log('💼 LinkedIn Process - Generating MindCache files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.linkedin as LinkedInPluginConfig | undefined;
    const linkedinConfig = pluginConfig || DEFAULT_CONFIG;
    const folderName = linkedinConfig.folderName || 'linkedin';

    const rawDumpsDir = path.join(paths.rawDumps, folderName);
    const outputDir = path.join(paths.connectorData, folderName);
    const today = getTodayString();

    await fs.mkdir(outputDir, { recursive: true });

    // Look for Connections.csv
    const csvPath = path.join(rawDumpsDir, 'Connections.csv');

    try {
        const content = await fs.readFile(csvPath, 'utf-8');

        // Skip lines until "First Name" header is found (LinkedIn export has notes at the top)
        const lines = content.split('\n');
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('First Name')) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) {
            console.error('❌ Could not find "First Name" header in Connections.csv');
            return;
        }

        const cleanCsv = lines.slice(headerIndex).join('\n');
        const rows = parseCSV(cleanCsv);

        console.log(`   Found ${rows.length} rows in CSV.`);

        const contacts = rows.map(mapToContact).filter(c => c.name.length > 0);

        if (contacts.length === 0) {
            console.log('   ⚠️ No valid contacts found.');
            return;
        }

        // Generate Markdown
        const mdContent = generateMindCacheContent(contacts, today);
        const mdPath = path.join(outputDir, 'linkedin-contacts.md');
        await fs.writeFile(mdPath, mdContent);

        console.log(`   ✅ Generated ${path.basename(mdPath)} (${contacts.length} contacts)`);
        console.log(`\n✨ Done! Files saved to: ${outputDir}`);

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`⚠️ Connections.csv not found in ${rawDumpsDir}`);
            console.log(`   Please export your connections from LinkedIn and place "Connections.csv" in that folder.`);
        } else {
            console.error('❌ Error processing LinkedIn data:', error);
        }
    }
}

main().catch(console.error);
