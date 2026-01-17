/**
 * Configuration types and management for the WhatsApp collector
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Default paths (relative to project root)
const DEFAULT_PATHS = {
    auth: './auth',
    logs: './logs',
    conversations: './conversations',
    rawDumps: './raw-dumps',
};

export interface PathsConfig {
    auth: string;
    logs: string;
    conversations: string;
    rawDumps: string;
}

export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    path: string; // folder in repo, e.g., "whatsapp"
}

export interface AppConfig {
    paths: PathsConfig;
    github?: GitHubConfig;
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
    rawDumps: string;
    whatsappSession: string;
    githubToken: string;
} {
    const root = process.cwd();
    const authDir = path.resolve(root, config.paths.auth);
    return {
        auth: authDir,
        logs: path.resolve(root, config.paths.logs),
        conversations: path.resolve(root, config.paths.conversations),
        rawDumps: path.resolve(root, config.paths.rawDumps),
        whatsappSession: path.join(authDir, 'whatsapp-session.json'),
        githubToken: path.join(authDir, 'github-token.json'),
    };
}

/**
 * Legacy: CONFIG_PATHS for backward compatibility
 */
export const CONFIG_PATHS = {
    get whatsappSession() {
        return path.join(process.cwd(), 'auth', 'whatsapp-session.json');
    },
    get githubToken() {
        return path.join(process.cwd(), 'auth', 'github-token.json');
    },
};

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

/**
 * Generate a key name from contact name and date
 */
export function generateKey(contactName: string, date: Date): string {
    const safeName = contactName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const dateStr = date.toISOString().split('T')[0];
    return `${safeName}-${dateStr}`;
}
