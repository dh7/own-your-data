import * as fs from 'fs/promises';
import * as path from 'path';
import { parseCSV } from '../../shared/csv';
import { Contact } from '../../shared/contact';
import { LinkedinMessage } from './types';

// Helper to map Connections.csv row to Contact
function mapConnectionToContact(row: Record<string, string>): Contact {
    const contact: Contact = {
        name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim(),
        company: row['Company'],
        role: row['Position'],
        email: row['Email Address'],
        linkedin: row['URL'],
    };

    const connectedOn = row['Connected On'];
    if (connectedOn) {
        contact.notes = `Connected on: ${connectedOn}`;
    }

    return cleanupContact(contact);
}

// Helper to map ImportedContacts.csv row to Contact
function mapImportedToContact(row: Record<string, string>): Contact {
    // Columns: FirstName,MiddleName,LastName,MaidenName,NickName,NamePrefix,NameSuffix,Title,Emails,PhoneNumbers,CreatedAt,UpdatedAt,CountryCode,RegionCode,ThirdPartyVerified,Location
    const firstName = row['FirstName'] || '';
    const middleName = row['MiddleName'] || '';
    const lastName = row['LastName'] || '';

    // Construct full name intelligently
    const nameParts = [firstName, middleName, lastName].filter(p => p);

    const contact: Contact = {
        name: nameParts.join(' ').trim(),
        role: row['Title'],
        email: row['Emails'],
        phone: row['PhoneNumbers'],
        address: row['Location']
    };

    // Add metadata to notes
    const notesParts = [];
    if (row['CreatedAt']) notesParts.push(`Imported on: ${row['CreatedAt']}`);
    if (row['UpdatedAt']) notesParts.push(`Updated on: ${row['UpdatedAt']}`);
    if (row['Location']) notesParts.push(`Location: ${row['Location']}`);

    if (notesParts.length > 0) {
        contact.notes = notesParts.join('\n');
    }

    return cleanupContact(contact);
}

function cleanupContact(contact: Contact): Contact {
    if (!contact.email) delete contact.email;
    if (!contact.company) delete contact.company;
    if (!contact.role) delete contact.role;
    if (!contact.linkedin) delete contact.linkedin;
    if (!contact.phone) delete contact.phone;
    if (!contact.address) delete contact.address;
    if (!contact.notes) delete contact.notes;
    return contact;
}

function mapToMessage(row: Record<string, string>): LinkedinMessage {
    return {
        conversationId: row['CONVERSATION ID'],
        conversationTitle: row['CONVERSATION TITLE'],
        from: row['FROM'],
        senderProfileUrl: row['SENDER PROFILE URL'],
        to: row['TO'],
        recipientProfileUrls: row['RECIPIENT PROFILE URLS'],
        date: row['DATE'],
        subject: row['SUBJECT'],
        content: row['CONTENT'],
        folder: row['FOLDER']
    };
}

export async function loadLinkedInContacts(rawDumpsDir: string, verbose: boolean = true): Promise<Contact[]> {
    const contactsMap = new Map<string, Contact>();

    // 1. Load Connections.csv
    try {
        const connectionsContent = await fs.readFile(path.join(rawDumpsDir, 'Connections.csv'), 'utf-8');
        // Connections.csv often has a header note, look for "First Name"
        const lines = connectionsContent.split('\n');
        const headerIndex = lines.findIndex(l => l.includes('First Name'));

        if (headerIndex !== -1) {
            const cleanCsv = lines.slice(headerIndex).join('\n');
            const rows = parseCSV(cleanCsv);
            for (const row of rows) {
                const contact = mapConnectionToContact(row);
                if (contact.name) {
                    // Use name as initial key, but email is better if available
                    contactsMap.set(contact.name, contact);
                }
            }
            if (verbose) console.log(`   Loaded ${rows.length} contacts from Connections.csv`);
        }
    } catch (e: any) {
        if (e.code !== 'ENOENT') console.warn('   ⚠️ Error reading Connections.csv:', e.message);
    }

    // 2. Load ImportedContacts.csv
    try {
        const importedContent = await fs.readFile(path.join(rawDumpsDir, 'ImportedContacts.csv'), 'utf-8');
        // ImportedContacts usually starts with headers directly? Let's check logic:
        // The earlier `view_file` showed it starts with headers on line 1.
        const importedRows = parseCSV(importedContent);

        let newCount = 0;
        let mergedCount = 0;

        for (const row of importedRows) {
            const importedContact = mapImportedToContact(row);
            if (!importedContact.name) continue;

            // Simple merge strategy: If name exists, merge fields if missing in existing.
            // Note: This is simplistic. Same name != Same person. 
            // Ideally we check email.

            const existing = contactsMap.get(importedContact.name);
            if (existing) {
                // Merge logic: prefer existing, fill gaps from imported
                if (!existing.email && importedContact.email) existing.email = importedContact.email;
                if (!existing.phone && importedContact.phone) existing.phone = importedContact.phone;
                if (!existing.address && importedContact.address) existing.address = importedContact.address;

                // Append notes
                if (importedContact.notes) {
                    existing.notes = existing.notes ? `${existing.notes}\n\n${importedContact.notes}` : importedContact.notes;
                }
                mergedCount++;
            } else {
                contactsMap.set(importedContact.name, importedContact);
                newCount++;
            }
        }
        if (verbose) console.log(`   Loaded ${importedRows.length} rows from ImportedContacts.csv (Added ${newCount}, Merged ${mergedCount})`);

    } catch (e: any) {
        if (e.code !== 'ENOENT') console.warn('   ⚠️ Error reading ImportedContacts.csv:', e.message);
    }

    return Array.from(contactsMap.values());
}

export async function loadLinkedInMessages(rawDumpsDir: string): Promise<LinkedinMessage[]> {
    try {
        const content = await fs.readFile(path.join(rawDumpsDir, 'messages.csv'), 'utf-8');
        // Check for headers
        const lines = content.split('\n');
        const headerIndex = lines.findIndex(l => l.includes('CONVERSATION ID'));

        if (headerIndex !== -1) {
            const cleanCsv = lines.slice(headerIndex).join('\n');
            const rows = parseCSV(cleanCsv);
            return rows.map(mapToMessage);
        }
        return [];
    } catch (e: any) {
        if (e.code !== 'ENOENT') console.warn('   ⚠️ Error reading messages.csv:', e.message);
        return [];
    }
}
