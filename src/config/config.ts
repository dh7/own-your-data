/**
 * Configuration types and management for all connectors
 * 
 * NEW STRUCTURE:
 * - Global config: config.json (storage paths only)
 * - Per-plugin config: config/{pluginId}.json
 * - Scheduler config: config/scheduler.json
 * - Example configs: src/plugins/{plugin}/config.example.json
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
 * Base plugin configuration (all plugins share these fields)
 */
export interface PluginConfig {
    enabled: boolean;
    githubPath?: string;
    [key: string]: unknown;
}

/**
 * Main app configuration (stored in config.json)
 * Now only contains global settings - plugin configs are separate files
 */
export interface AppConfig {
    storage: StorageConfig;
    /** @deprecated Use config/scheduler.json instead */
    daemon?: {
        activeHours: {
            start: number;
            end: number;
        };
    };
    // Legacy: plugins embedded in main config (being migrated to separate files)
    plugins?: Record<string, PluginConfig>;
}

/**
 * Scheduler configuration (stored in config/scheduler.json)
 */
export interface SchedulerConfig {
    activeHours: {
        start: number;
        end: number;
    };
    /** Servers to auto-start */
    servers: Record<string, {
        autoStart: boolean;
        restartOnCrash?: boolean;
    }>;
    /** Scheduled task groups */
    tasks: Array<{
        plugins: string[];
        commands: Array<'get' | 'process' | 'push'>;
        intervalHours?: number;
        randomMinutes?: number;
        schedule?: 'manual';
    }>;
}

// ============ DEFAULTS ============

const DEFAULT_STORAGE: StorageConfig = {
    auth: './auth',
    logs: './logs',
    rawDumps: './raw-dumps',
    connectorData: './connector_data',
};

const DEFAULT_SCHEDULER: SchedulerConfig = {
    activeHours: { start: 7, end: 23 },
    servers: {
        config: { autoStart: true },
    },
    tasks: [],
};

const CONFIG_FILE = path.join(process.cwd(), 'config.json');
const CONFIG_DIR = path.join(process.cwd(), 'config');
const SCHEDULER_CONFIG_FILE = path.join(CONFIG_DIR, 'scheduler.json');

// ============ HELPERS ============

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/**
 * Get path to a plugin's config file
 */
function getPluginConfigPath(pluginId: string): string {
    return path.join(CONFIG_DIR, `${pluginId}.json`);
}

/**
 * Get path to a plugin's example config file
 */
function getPluginExampleConfigPath(pluginId: string): string {
    return path.join(process.cwd(), 'src', 'plugins', pluginId, 'config.example.json');
}

// ============ LOAD/SAVE: GLOBAL CONFIG ============

/**
 * Load global app config from config.json (or return defaults)
 */
export async function loadConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const raw = JSON.parse(data);
        return {
            storage: { ...DEFAULT_STORAGE, ...(raw.storage || {}) },
            daemon: raw.daemon, // Legacy - scheduler now in config/scheduler.json
            plugins: raw.plugins, // Legacy - keep for migration
        };
    } catch {
        return { storage: DEFAULT_STORAGE };
    }
}

/**
 * Save global app config to config.json
 */
export async function saveConfig(config: AppConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============ LOAD/SAVE: PLUGIN CONFIG ============

/**
 * Load a plugin's config from config/{pluginId}.json
 * Falls back to example config if not found
 */
export async function loadPluginConfig<T extends PluginConfig = PluginConfig>(pluginId: string): Promise<T> {
    const configPath = getPluginConfigPath(pluginId);
    const examplePath = getPluginExampleConfigPath(pluginId);

    try {
        // Try loading existing config
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data) as T;
    } catch {
        // Fall back to example config
        try {
            const exampleData = await fs.readFile(examplePath, 'utf-8');
            const exampleConfig = JSON.parse(exampleData) as T;
            // Save it as the actual config
            await savePluginConfig(pluginId, exampleConfig);
            return exampleConfig;
        } catch {
            // Return minimal default
            return { enabled: false } as T;
        }
    }
}

/**
 * Save a plugin's config to config/{pluginId}.json
 */
export async function savePluginConfig(pluginId: string, config: PluginConfig): Promise<void> {
    await ensureConfigDir();
    const configPath = getPluginConfigPath(pluginId);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Check if plugin has a config file
 */
export async function hasPluginConfig(pluginId: string): Promise<boolean> {
    try {
        await fs.access(getPluginConfigPath(pluginId));
        return true;
    } catch {
        return false;
    }
}

/**
 * @deprecated Use loadPluginConfig() instead - kept for backward compatibility
 */
export function getPluginConfig(config: AppConfig, pluginId: string): PluginConfig | undefined {
    return config.plugins?.[pluginId];
}

/**
 * @deprecated Use savePluginConfig() instead - kept for backward compatibility  
 */
export function setPluginConfig(config: AppConfig, pluginId: string, pluginConfig: PluginConfig): void {
    if (!config.plugins) {
        config.plugins = {};
    }
    config.plugins[pluginId] = pluginConfig;
}

// ============ LOAD/SAVE: SCHEDULER CONFIG ============

/**
 * Load scheduler config from config/scheduler.json
 */
export async function loadSchedulerConfig(): Promise<SchedulerConfig> {
    try {
        const data = await fs.readFile(SCHEDULER_CONFIG_FILE, 'utf-8');
        return JSON.parse(data) as SchedulerConfig;
    } catch {
        return DEFAULT_SCHEDULER;
    }
}

/**
 * Save scheduler config to config/scheduler.json
 */
export async function saveSchedulerConfig(config: SchedulerConfig): Promise<void> {
    await ensureConfigDir();
    await fs.writeFile(SCHEDULER_CONFIG_FILE, JSON.stringify(config, null, 2));
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
