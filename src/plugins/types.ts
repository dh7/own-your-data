/**
 * Plugin system types
 *
 * Defines the contract that all plugins must follow.
 */

/**
 * Scheduler mode for a plugin
 * - interval: Runs periodically (e.g., Twitter, Instagram)
 * - realtime: Runs continuously as a listener (e.g., WhatsApp)
 */
export type SchedulerMode = 'interval' | 'realtime';

/**
 * Plugin manifest - stored in manifest.json in each plugin folder
 */
export interface PluginManifest {
    /** Unique identifier, used in config.json and routes */
    id: string;

    /** Human-readable name */
    name: string;

    /** Emoji icon for UI */
    icon: string;

    /** Short description */
    description: string;

    /** Semantic version */
    version: string;

    /**
     * Folder name for data storage
     * Used in: raw-dumps/{folder}/, logs/{folder}/, connector_data/{folder}/
     */
    folder: string;

    /** Scheduler configuration */
    scheduler: {
        mode: SchedulerMode;
        /** Default interval in hours (for interval mode) */
        defaultIntervalHours?: number;
        /** Default random variance in minutes (for interval mode) */
        defaultRandomMinutes?: number;
        /** Commands to run on schedule (e.g., ["get", "process", "push"]) */
        cmd: Array<'get' | 'process' | 'push'>;
    };

    /** Commands to execute for each phase */
    commands: {
        /** Fetch raw data from source → raw-dumps/{folder}/ */
        get: string;
        /** Process raw data → connector_data/{folder}/ */
        process?: string;
        /** Push to GitHub */
        push: string;
    };

    /** Optional dependencies information */
    dependencies?: {
        /** Requires Playwright browsers */
        playwright?: boolean;
        /** Requires user login/authentication */
        requiresLogin?: boolean;
    };
}

/**
 * Base plugin config stored in config.json under plugins.{id}
 */
export interface BasePluginConfig {
    /** Whether this plugin is enabled for scheduling */
    enabled: boolean;

    /** Interval hours (for interval mode plugins) */
    intervalHours?: number;

    /** Random variance in minutes (for interval mode plugins) */
    randomMinutes?: number;

    /** GitHub path for this plugin's data */
    githubPath?: string;
}

/**
 * Plugin interface - what each plugin module must export
 */
export interface Plugin {
    /** The plugin manifest */
    manifest: PluginManifest;

    /**
     * Render the config UI section for this plugin
     * @param config Plugin-specific config from config.json
     * @param data Additional runtime data (e.g., login status)
     * @returns HTML string
     */
    renderTemplate(config: BasePluginConfig & Record<string, unknown>, data: PluginRenderData): string;

    /**
     * Parse form data from the config UI
     * @param body Express request body
     * @returns Parsed plugin config
     */
    parseFormData(body: Record<string, string>): BasePluginConfig & Record<string, unknown>;

    /**
     * Get default config values
     */
    getDefaultConfig(): BasePluginConfig & Record<string, unknown>;
}

/**
 * Data passed to plugin template rendering
 */
export interface PluginRenderData {
    /** Whether Playwright browsers are installed */
    playwrightInstalled?: boolean;

    /** Whether user is logged in (for plugins that require auth) */
    isLoggedIn?: boolean;

    /** Whether section was just saved */
    justSaved?: boolean;

    /** Any additional plugin-specific data */
    [key: string]: unknown;
}

/**
 * Discovered plugin info (manifest + path)
 */
export interface DiscoveredPlugin {
    manifest: PluginManifest;
    path: string;
}
