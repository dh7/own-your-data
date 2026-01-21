/**
 * Configuration types and management for all connectors
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============ INTERFACES ============

/**
 * Global storage paths (shared across all connectors)
 */
export interface StorageConfig {
    auth: string;          // Sessions & tokens (./auth)
    logs: string;          // Collection logs (./logs)
    rawDumps: string;      // Raw API data (./raw-dumps)
    connectorData: string; // MindCache output (./connector_data)
}

/**
 * GitHub storage configuration
 */
export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
}

/**
 * WhatsApp connector configuration
 */
export interface WhatsAppConfig {
    githubPath: string;  // Path in GitHub repo (whatsapp)
}

/**
 * Twitter connector configuration
 */
export interface TwitterConfig {
    githubPath: string;       // Path in GitHub repo (twitter)
    accounts: string[];       // Twitter usernames to scrape
    tweetsPerAccount?: number; // Number of tweets per account (default: 100)
}

/**
 * Instagram connector configuration
 */
export interface InstagramConfig {
    githubPath: string;       // Path in GitHub repo (instagram)
    accounts: string[];       // Instagram usernames to scrape
    postsPerAccount?: number; // Number of posts per account (default: 50)
}

/**
 * Scheduler configuration for human-like behavior
 */
export interface SchedulerConnectorConfig {
    enabled: boolean;
    intervalHours: number;      // Base interval between runs
    randomMinutes: number;      // Random variance ±minutes
}

export interface SchedulerConfig {
    activeHours: {
        start: number;          // Hour to start (0-23), e.g., 7
        end: number;            // Hour to end (0-23), e.g., 23
    };
    twitter?: SchedulerConnectorConfig;
    instagram?: SchedulerConnectorConfig;
    push?: {
        enabled: boolean;
        intervalHours: number;  // How often to push (includes WhatsApp)
    };
}

/**
 * Main app configuration (stored in config.json)
 */
export interface AppConfig {
    storage: StorageConfig;
    whatsapp?: WhatsAppConfig;
    twitter?: TwitterConfig;
    instagram?: InstagramConfig;
    scheduler?: SchedulerConfig;
}

// ============ DEFAULTS ============

const DEFAULT_STORAGE: StorageConfig = {
    auth: './auth',
    logs: './logs',
    rawDumps: './raw-dumps',
    connectorData: './connector_data',
};

const DEFAULT_WHATSAPP: WhatsAppConfig = {
    githubPath: 'whatsapp',
};

const DEFAULT_TWITTER: TwitterConfig = {
    githubPath: 'twitter',
    accounts: [],
    tweetsPerAccount: 100,
};

const DEFAULT_INSTAGRAM: InstagramConfig = {
    githubPath: 'instagram',
    accounts: [],
    postsPerAccount: 50,
};

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

// ============ LOAD/SAVE ============

/**
 * Load app config from config.json (or return defaults)
 */
export async function loadConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data) as Partial<AppConfig>;
        return {
            storage: { ...DEFAULT_STORAGE, ...config.storage },
            whatsapp: config.whatsapp ? { ...DEFAULT_WHATSAPP, ...config.whatsapp } : undefined,
            twitter: config.twitter ? { ...DEFAULT_TWITTER, ...config.twitter } : undefined,
            instagram: config.instagram ? { ...DEFAULT_INSTAGRAM, ...config.instagram } : undefined,
        };
    } catch {
        return { storage: DEFAULT_STORAGE };
    }
}

/**
 * Save app config to config.json
 */
export async function saveConfig(config: AppConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============ RESOLVED PATHS ============

/**
 * Get resolved absolute paths from config
 */
export function getResolvedPaths(config: AppConfig) {
    const root = process.cwd();
    const authDir = path.resolve(root, config.storage.auth);
    const logsDir = path.resolve(root, config.storage.logs);
    const rawDumpsDir = path.resolve(root, config.storage.rawDumps);
    const connectorDataDir = path.resolve(root, config.storage.connectorData || DEFAULT_STORAGE.connectorData);

    return {
        // Global
        auth: authDir,
        logs: logsDir,
        rawDumps: rawDumpsDir,
        connectorData: connectorDataDir,

        // Auth files
        githubToken: path.join(authDir, 'github-token.json'),
        apifyToken: path.join(authDir, 'twitter-token.json'),
        whatsappSession: path.join(authDir, 'whatsapp-session.json'),

        // WhatsApp
        whatsappLocal: path.join(connectorDataDir, 'whatsapp'),
        whatsappLogs: path.join(logsDir, 'whatsapp'),
        whatsappRawDumps: path.join(rawDumpsDir, 'whatsapp'),

        // Twitter
        twitterLocal: path.join(connectorDataDir, 'twitter'),
        twitterLogs: path.join(logsDir, 'twitter'),
        twitterRawDumps: path.join(rawDumpsDir, 'twitter'),

        // Instagram
        instagramLocal: path.join(connectorDataDir, 'instagram'),
        instagramLogs: path.join(logsDir, 'instagram'),
        instagramRawDumps: path.join(rawDumpsDir, 'instagram'),
    };
}

// ============ GITHUB CONFIG ============

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

// ============ UTILITIES ============

/**
 * Get today's date string (YYYY-MM-DD)
 */
export function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}
