export interface Contact {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    address?: string;
    linkedin?: string;
    twitter?: string;
    birthday?: string;
    notes?: string;
}

export const CONTACT_SCHEMA = `
#Contact
* name: full name of the contact
* email: email address (primary)
* phone: phone number (mobile preferred)
* company: company or organization name
* role: job title or role
* address: physical address
* linkedin: LinkedIn profile URL
* twitter: Twitter/X handle
* birthday: birthday in YYYY-MM-DD format
* notes: any additional notes or context about this person
`;
