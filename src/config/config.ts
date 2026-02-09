/**
 * Configuration types and management for all connectors
 * 
 * NEW STRUCTURE:
 * - Global config: config.json (storage paths only)
 * - Scheduler config: config/scheduler.json
 * - Per-plugin config: config/{pluginId}.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============ PATHS ============

const ROOT = process.cwd();
const CONFIG_FILE = path.join(ROOT, 'config.json');
const CONFIG_DIR = path.join(ROOT, 'config');

// ============ STORAGE CONFIG ============

/**
 * Global storage paths (shared across all connectors)
 */
export interface StorageConfig {
    auth: string;          // Sessions & tokens (./auth)
    logs: string;          // Collection logs (./logs)
    rawDumps: string;      // Raw API data (./raw-dumps)
    connectorData: string; // MindCache output (./connector_data)
}

const DEFAULT_STORAGE: StorageConfig = {
    auth: './auth',
    logs: './logs',
    rawDumps: './raw-dumps',
    connectorData: './connector_data',
};

// ============ GITHUB CONFIG ============

/**
 * GitHub storage configuration
 */
export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
}

// ============ SCHEDULER CONFIG ============

export type SchedulerCommand = 'get' | 'process' | 'push';

/**
 * Server auto-start configuration
 */
export interface ServerConfig {
    autoStart: boolean;
    restartOnCrash: boolean;
}

/**
 * A scheduled task definition
 */
export interface SchedulerTask {
    plugins: string[];
    commands: SchedulerCommand[];
    /** Use 'manual' for no automatic scheduling */
    schedule?: 'manual';
    /** Hours between runs (for interval-based scheduling) */
    intervalHours?: number;
    /** Random jitter in minutes to add to interval */
    jitterMinutes?: number;
    /** Fixed times to run (24h format, e.g., ["07:00", "19:30"]) */
    fixedTimes?: string[];
}

/**
 * Scheduler configuration (stored in config/scheduler.json)
 */
export interface SchedulerConfig {
    activeHours: {
        start: number;
        end: number;
    };
    servers: Record<string, ServerConfig>;
    tasks: SchedulerTask[];
}

const DEFAULT_SCHEDULER: SchedulerConfig = {
    activeHours: { start: 7, end: 23 },
    servers: {
        config: { autoStart: true, restartOnCrash: true },
        tunnel: { autoStart: false, restartOnCrash: true },
    },
    tasks: [],
};

// ============ PLUGIN CONFIG ============

/**
 * Base plugin configuration (plugin-specific, no scheduler fields)
 */
export interface PluginConfig {
    enabled: boolean;
    githubPath?: string;
    [key: string]: unknown;
}

// ============ APP CONFIG ============

/**
 * Main app configuration (stored in config.json)
 * Now only contains global settings - plugin/scheduler configs are separate files
 */
export interface AppConfig {
    storage: StorageConfig;
    /** @deprecated Legacy - kept for migration only */
    daemon?: { activeHours: { start: number; end: number } };
    /** @deprecated Legacy - kept for migration only */
    plugins?: Record<string, PluginConfig & { intervalHours?: number; randomMinutes?: number }>;
    /** @deprecated Legacy - kept for migration only */
    schedulerConfig?: { plugins: Record<string, unknown> };
}

// ============ LOAD/SAVE: APP CONFIG ============

/**
 * Load app config from config.json (or return defaults)
 */
export async function loadConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const raw = JSON.parse(data);
        return {
            storage: { ...DEFAULT_STORAGE, ...(raw.storage as Partial<StorageConfig>) },
            // Keep legacy fields for migration
            daemon: raw.daemon,
            plugins: raw.plugins,
            schedulerConfig: raw.schedulerConfig,
        };
    } catch {
        return { storage: DEFAULT_STORAGE };
    }
}

/**
 * Save app config to config.json
 */
export async function saveConfig(config: AppConfig): Promise<void> {
    // Only save storage (clean config)
    const clean = { storage: config.storage };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(clean, null, 2));
}

// ============ LOAD/SAVE: SCHEDULER CONFIG ============

/**
 * Get scheduler config file path
 */
export function getSchedulerConfigPath(): string {
    return path.join(CONFIG_DIR, 'scheduler.json');
}

/**
 * Load scheduler config from config/scheduler.json
 */
export async function loadSchedulerConfig(): Promise<SchedulerConfig> {
    const configPath = getSchedulerConfigPath();
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        const raw = JSON.parse(data);
        return {
            activeHours: raw.activeHours ?? DEFAULT_SCHEDULER.activeHours,
            servers: raw.servers ?? DEFAULT_SCHEDULER.servers,
            tasks: raw.tasks ?? DEFAULT_SCHEDULER.tasks,
        };
    } catch {
        return DEFAULT_SCHEDULER;
    }
}

/**
 * Save scheduler config to config/scheduler.json
 */
export async function saveSchedulerConfig(config: SchedulerConfig): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const configPath = getSchedulerConfigPath();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// ============ LOAD/SAVE: PLUGIN CONFIG ============

/**
 * Get plugin config file path
 */
export function getPluginConfigPath(pluginId: string): string {
    return path.join(CONFIG_DIR, `${pluginId}.json`);
}

/**
 * Load plugin config from config/{pluginId}.json
 */
export async function loadPluginConfig<T extends PluginConfig>(pluginId: string): Promise<T | null> {
    const configPath = getPluginConfigPath(pluginId);
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data) as T;
    } catch {
        return null;
    }
}

/**
 * Save plugin config to config/{pluginId}.json
 */
export async function savePluginConfig(pluginId: string, config: PluginConfig): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const configPath = getPluginConfigPath(pluginId);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Check if plugin config file exists
 */
export async function pluginConfigExists(pluginId: string): Promise<boolean> {
    const configPath = getPluginConfigPath(pluginId);
    try {
        await fs.access(configPath);
        return true;
    } catch {
        return false;
    }
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
    const schedulerLogsDir = path.resolve(root, path.join(config.storage.logs, 'scheduler'));

    return {
        // Global
        auth: authDir,
        logs: logsDir,
        rawDumps: rawDumpsDir,
        connectorData: connectorDataDir,
        schedulerLogs: schedulerLogsDir,
        configDir: CONFIG_DIR,

        // Auth files
        githubToken: path.join(authDir, 'github-token.json'),
        apifyToken: path.join(authDir, 'twitter-token.json'),
        twitterSession: path.join(authDir, 'twitter-state.json'),
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

// ============ MIGRATION ============

/**
 * Check if migration from old config format is needed
 */
async function needsMigration(): Promise<boolean> {
    // Check if scheduler.json already exists
    const schedulerPath = getSchedulerConfigPath();
    try {
        await fs.access(schedulerPath);
        return false; // Already migrated
    } catch {
        // scheduler.json doesn't exist, check if old config has data to migrate
        const appConfig = await loadConfig();
        return Boolean(appConfig.daemon || appConfig.plugins || appConfig.schedulerConfig);
    }
}

/**
 * Migrate old config.json format to new config/ folder structure
 * 
 * This function:
 * 1. Reads the old embedded config from config.json
 * 2. Creates config/scheduler.json from daemon and schedulerConfig
 * 3. Creates config/{plugin}.json for each plugin
 * 4. Cleans config.json to only contain storage paths
 */
export async function migrateConfigIfNeeded(): Promise<{ migrated: boolean; message: string }> {
    if (!(await needsMigration())) {
        return { migrated: false, message: 'No migration needed' };
    }

    console.log('📦 Migrating config to new structure...');
    
    try {
        const appConfig = await loadConfig();
        await fs.mkdir(CONFIG_DIR, { recursive: true });

        // Build scheduler config from old format
        const schedulerConfig: SchedulerConfig = {
            activeHours: appConfig.daemon?.activeHours ?? DEFAULT_SCHEDULER.activeHours,
            servers: { ...DEFAULT_SCHEDULER.servers },
            tasks: [],
        };

        // Migrate plugin configs and build tasks
        const pluginIds = Object.keys(appConfig.plugins || {});
        
        for (const pluginId of pluginIds) {
            const oldConfig = appConfig.plugins![pluginId];
            
            // Extract scheduler-related fields
            const intervalHours = (oldConfig as any).intervalHours;
            const randomMinutes = (oldConfig as any).randomMinutes;
            
            // Create clean plugin config (without scheduler fields)
            const cleanConfig: PluginConfig = { ...oldConfig };
            delete (cleanConfig as any).intervalHours;
            delete (cleanConfig as any).randomMinutes;
            
            // Save plugin config
            await savePluginConfig(pluginId, cleanConfig);
            console.log(`  ✅ Created config/${pluginId}.json`);
            
            // Add to scheduler tasks if it had scheduling
            if (intervalHours !== undefined) {
                schedulerConfig.tasks.push({
                    plugins: [pluginId],
                    commands: ['get', 'process', 'push'],
                    intervalHours: intervalHours,
                    jitterMinutes: randomMinutes ?? 30,
                });
            }
        }

        // Migrate old schedulerConfig.plugins format if present
        if (appConfig.schedulerConfig?.plugins) {
            for (const [pluginId, oldSchedule] of Object.entries(appConfig.schedulerConfig.plugins)) {
                const schedule = oldSchedule as any;
                
                // Check if we already have a task for this plugin
                const existingTask = schedulerConfig.tasks.find(t => t.plugins.includes(pluginId));
                if (existingTask) continue;
                
                // Add task from old schedulerConfig format
                if (schedule.enabled !== false) {
                    const task: SchedulerTask = {
                        plugins: [pluginId],
                        commands: schedule.commands || ['get', 'process', 'push'],
                        intervalHours: schedule.intervalHours,
                        jitterMinutes: schedule.jitterMinutes ?? 30,
                    };
                    
                    if (schedule.cadence === 'fixed' && schedule.fixedTimes?.length) {
                        task.fixedTimes = schedule.fixedTimes;
                        delete task.intervalHours;
                        delete task.jitterMinutes;
                    }
                    
                    schedulerConfig.tasks.push(task);
                }
                
                // Add server config if auto-start was enabled
                if (schedule.autoStartServer) {
                    schedulerConfig.servers[pluginId] = {
                        autoStart: true,
                        restartOnCrash: schedule.autoRestartServer ?? true,
                    };
                }
            }
        }

        // Save scheduler config
        await saveSchedulerConfig(schedulerConfig);
        console.log('  ✅ Created config/scheduler.json');

        // Clean up config.json (keep only storage)
        await saveConfig({ storage: appConfig.storage });
        console.log('  ✅ Cleaned config.json');

        return { migrated: true, message: `Migrated ${pluginIds.length} plugin configs` };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Migration failed:', message);
        return { migrated: false, message: `Migration failed: ${message}` };
    }
}

// ============ LEGACY COMPATIBILITY ============

/**
 * @deprecated Use loadPluginConfig instead
 * Get plugin config by ID from legacy embedded config
 */
export function getPluginConfig(config: AppConfig, pluginId: string): PluginConfig | undefined {
    return config.plugins?.[pluginId];
}

/**
 * @deprecated Use savePluginConfig instead
 * Set plugin config by ID in legacy embedded config
 */
export function setPluginConfig(config: AppConfig, pluginId: string, pluginConfig: PluginConfig): void {
    if (!config.plugins) {
        config.plugins = {};
    }
    config.plugins[pluginId] = pluginConfig;
}
