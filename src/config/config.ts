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
    schedulerLogs?: string; // Scheduler daily logs (./logs/scheduler)
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
 * Base plugin configuration (all plugins share these fields)
 */
export interface PluginConfig {
    /** Legacy per-plugin scheduler toggle (deprecated; use schedulerConfig) */
    enabled?: boolean;
    /** Legacy per-plugin interval setting (deprecated; use schedulerConfig) */
    intervalHours?: number;
    /** Legacy per-plugin jitter setting (deprecated; use schedulerConfig) */
    randomMinutes?: number;
    githubPath?: string;
    [key: string]: unknown;
}

export type SchedulerCadence = 'interval' | 'fixed';
export type SchedulerCommand = 'get' | 'process' | 'push';

export interface SchedulerPluginConfig {
    enabled: boolean;
    cadence: SchedulerCadence;
    startHour: number;
    endHour: number;
    intervalHours: number;
    jitterMinutes: number;
    fixedTimes: string[];
    commands: SchedulerCommand[];
    autoStartServer: boolean;
    autoRestartServer: boolean;
}

export interface SchedulerConfig {
    plugins: Record<string, SchedulerPluginConfig>;
}

/**
 * Main app configuration (stored in config.json)
 */
export interface AppConfig {
    storage: StorageConfig;
    daemon?: DaemonConfig;
    plugins?: Record<string, PluginConfig>;
    schedulerConfig?: SchedulerConfig;

    // ========== LEGACY FIELDS (for backward compatibility) ==========
    /** @deprecated Use plugins.whatsapp */
    whatsapp?: { githubPath: string };
    /** @deprecated Use plugins.twitter */
    twitter?: { githubPath: string; accounts: string[]; tweetsPerAccount?: number };
    /** @deprecated Use plugins.instagram */
    instagram?: { githubPath: string; accounts: string[]; postsPerAccount?: number };
    /** @deprecated Use plugin-level scheduling */
    scheduler?: {
        activeHours: { start: number; end: number };
        twitter?: { enabled: boolean; intervalHours: number; randomMinutes: number };
        instagram?: { enabled: boolean; intervalHours: number; randomMinutes: number };
        push?: { enabled: boolean; intervalHours: number };
    };
}

/**
 * Daemon configuration (scheduling, etc)
 */
export interface DaemonConfig {
    activeHours: {
        start: number;
        end: number;
    };
}

// ============ DEFAULTS ============

const DEFAULT_STORAGE: StorageConfig = {
    auth: './auth',
    logs: './logs',
    rawDumps: './raw-dumps',
    connectorData: './connector_data',
};

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

// ============ MIGRATION ============

/**
 * Migrate old config format to new plugin-based format
 */
function migrateConfig(raw: Record<string, unknown>): AppConfig {
    const config: AppConfig = {
        storage: { ...DEFAULT_STORAGE, ...(raw.storage as Partial<StorageConfig>) },
        daemon: (raw.daemon as DaemonConfig) || {
            activeHours: { start: 7, end: 23 }
        },
        schedulerConfig: raw.schedulerConfig as SchedulerConfig | undefined,
    };

    // Check if already migrated (has plugins field)
    if (raw.plugins) {
        config.plugins = raw.plugins as Record<string, PluginConfig>;
        return config;
    }

    // Migrate from old format
    const plugins: Record<string, PluginConfig> = {};

    // Migrate Instagram
    const oldInstagram = raw.instagram as { githubPath?: string; accounts?: string[]; postsPerAccount?: number } | undefined;
    const oldInstaScheduler = (raw.scheduler as any)?.instagram;
    if (oldInstagram) {
        plugins.instagram = {
            enabled: oldInstaScheduler?.enabled ?? true,
            intervalHours: oldInstaScheduler?.intervalHours ?? 6,
            randomMinutes: oldInstaScheduler?.randomMinutes ?? 30,
            accounts: oldInstagram.accounts || [],
            postsPerAccount: oldInstagram.postsPerAccount || 50,
            githubPath: oldInstagram.githubPath || 'instagram',
        };
    }

    // Migrate Twitter
    const oldTwitter = raw.twitter as { githubPath?: string; accounts?: string[]; tweetsPerAccount?: number } | undefined;
    const oldTwitterScheduler = (raw.scheduler as any)?.twitter;
    if (oldTwitter) {
        plugins.twitter = {
            enabled: oldTwitterScheduler?.enabled ?? true,
            intervalHours: oldTwitterScheduler?.intervalHours ?? 6,
            randomMinutes: oldTwitterScheduler?.randomMinutes ?? 30,
            accounts: oldTwitter.accounts || [],
            tweetsPerAccount: oldTwitter.tweetsPerAccount || 100,
            githubPath: oldTwitter.githubPath || 'twitter',
        };
    }

    // Migrate WhatsApp
    const oldWhatsApp = raw.whatsapp as { githubPath?: string } | undefined;
    if (oldWhatsApp) {
        plugins.whatsapp = {
            enabled: true,
            githubPath: oldWhatsApp.githubPath || 'whatsapp',
        };
    }

    if (Object.keys(plugins).length > 0) {
        config.plugins = plugins;
    }

    // Keep legacy fields for backward compatibility during transition
    if (raw.whatsapp) config.whatsapp = raw.whatsapp as AppConfig['whatsapp'];
    if (raw.twitter) config.twitter = raw.twitter as AppConfig['twitter'];
    if (raw.instagram) config.instagram = raw.instagram as AppConfig['instagram'];
    if (raw.scheduler) config.scheduler = raw.scheduler as AppConfig['scheduler'];

    return config;
}

// ============ LOAD/SAVE ============

/**
 * Load app config from config.json (or return defaults)
 */
export async function loadConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const raw = JSON.parse(data);
        return migrateConfig(raw);
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

/**
 * Get plugin config by ID
 */
export function getPluginConfig(config: AppConfig, pluginId: string): PluginConfig | undefined {
    return config.plugins?.[pluginId];
}

/**
 * Set plugin config by ID
 */
export function setPluginConfig(config: AppConfig, pluginId: string, pluginConfig: PluginConfig): void {
    if (!config.plugins) {
        config.plugins = {};
    }
    config.plugins[pluginId] = pluginConfig;
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
    const schedulerLogsDir = path.resolve(root, config.storage.schedulerLogs || path.join(config.storage.logs, 'scheduler'));

    return {
        // Global
        auth: authDir,
        logs: logsDir,
        rawDumps: rawDumpsDir,
        connectorData: connectorDataDir,
        schedulerLogs: schedulerLogsDir,

        // Auth files
        githubToken: path.join(authDir, 'github-token.json'),
        apifyToken: path.join(authDir, 'twitter-token.json'),
        whatsappSession: path.join(authDir, 'whatsapp-session.json'),

        // WhatsApp (legacy paths kept for compatibility)
        whatsappLocal: path.join(connectorDataDir, 'whatsapp'),
        whatsappLogs: path.join(logsDir, 'whatsapp'),
        whatsappRawDumps: path.join(rawDumpsDir, 'whatsapp'),

        // Twitter (legacy paths kept for compatibility)
        twitterLocal: path.join(connectorDataDir, 'twitter'),
        twitterLogs: path.join(logsDir, 'twitter'),
        twitterRawDumps: path.join(rawDumpsDir, 'twitter'),

        // Instagram (legacy paths kept for compatibility)
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
