/**
 * Configuration types and management for all connectors
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Default paths (relative to project root)
const DEFAULT_PATHS = {
    auth: './auth',
    logs: './logs',
    conversations: './conversations',
    contacts: './contacts',
    rawDumps: './raw-dumps',
};

export interface PathsConfig {
    auth: string;
    logs: string;
    conversations: string;
    contacts: string;
    rawDumps: string;
}

export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    path: string; // folder in repo, e.g., "data"
}

export interface TwitterConfig {
    accounts: string[]; // Twitter usernames to scrape
    tweetsPerAccount?: number; // Number of tweets to fetch per account (default: 100)
}

export interface ConnectorStatus {
    whatsapp: boolean;
    linkedin: boolean;
    googleContact: boolean;
}

export interface AppConfig {
    paths: PathsConfig;
    github?: GitHubConfig;
    twitter?: TwitterConfig;
    connectors?: ConnectorStatus;
}

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

/**
 * Load app config from config.json (or return defaults)
 */
export async function loadConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data) as Partial<AppConfig>;
        return {
            paths: { ...DEFAULT_PATHS, ...config.paths },
            github: config.github,
            twitter: config.twitter,
            connectors: config.connectors,
        };
    } catch {
        return { paths: DEFAULT_PATHS };
    }
}

/**
 * Save app config to config.json
 */
export async function saveConfig(config: AppConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get resolved paths (absolute from project root)
 */
export function getResolvedPaths(config: AppConfig): {
    auth: string;
    logs: string;
    conversations: string;
    contacts: string;
    rawDumps: string;
    githubToken: string;
    // WhatsApp specific
    whatsappSession: string;
    whatsappLogs: string;
    whatsappRawDumps: string;
    // LinkedIn specific
    linkedinLogs: string;
    linkedinRawDumps: string;
    // Google Contact specific
    googleContactLogs: string;
    googleContactRawDumps: string;
    // Twitter specific
    twitterLogs: string;
    twitterRawDumps: string;
    apifyToken: string;
} {
    const root = process.cwd();
    const authDir = path.resolve(root, config.paths.auth);
    const logsDir = path.resolve(root, config.paths.logs);
    const rawDumpsDir = path.resolve(root, config.paths.rawDumps);

    return {
        auth: authDir,
        logs: logsDir,
        conversations: path.resolve(root, config.paths.conversations),
        contacts: path.resolve(root, config.paths.contacts),
        rawDumps: rawDumpsDir,
        githubToken: path.join(authDir, 'github-token.json'),
        // WhatsApp
        whatsappSession: path.join(authDir, 'whatsapp-session.json'),
        whatsappLogs: path.join(logsDir, 'whatsapp'),
        whatsappRawDumps: path.join(rawDumpsDir, 'whatsapp'),
        // LinkedIn
        linkedinLogs: path.join(logsDir, 'linkedin'),
        linkedinRawDumps: path.join(rawDumpsDir, 'linkedin'),
        // Google Contact
        googleContactLogs: path.join(logsDir, 'google-contact'),
        googleContactRawDumps: path.join(rawDumpsDir, 'google-contact'),
        // Twitter
        twitterLogs: path.join(logsDir, 'twitter'),
        twitterRawDumps: path.join(rawDumpsDir, 'twitter'),
        apifyToken: path.join(authDir, 'apify-token.json'),
    };
}

/**
 * Load GitHub config from auth file
 */
export async function loadGitHubConfig(): Promise<GitHubConfig | null> {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    try {
        const data = await fs.readFile(paths.githubToken, 'utf-8');
        return JSON.parse(data) as GitHubConfig;
    } catch {
        return null;
    }
}

/**
 * Save GitHub config to auth file
 */
export async function saveGitHubConfig(ghConfig: GitHubConfig): Promise<void> {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    await fs.mkdir(paths.auth, { recursive: true });
    await fs.writeFile(paths.githubToken, JSON.stringify(ghConfig, null, 2));
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
export function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}
