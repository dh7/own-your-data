/**
 * Plugin system types
 *
 * Defines the contract that all plugins must follow.
 * Plugins declare capabilities (commands) only - scheduling is centralized.
 */

/**
 * Available command types
 */
export type PluginCommand = 'get' | 'process' | 'push' | 'server' | 'config';

/**
 * Scheduler mode for a plugin (legacy - used for backward compatibility)
 * @deprecated Use config/scheduler.json for scheduling
 */
export type SchedulerMode = 'interval' | 'realtime' | 'manual';

/**
 * Plugin manifest - stored in manifest.json in each plugin folder
 * Declares capabilities only, no scheduling (that's in config/scheduler.json)
 */
export interface PluginManifest {
    /** Unique identifier, used in config and routes */
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

    /** 
     * Commands this plugin supports
     * Each command maps to an npm script: npm run {pluginId}:{command}
     */
    commands: {
        /** Fetch raw data from source → raw-dumps/{folder}/ */
        get?: string;
        /** Long-running server (e.g., WhatsApp listener, Chrome history receiver) */
        server?: string;
        /** Process raw data → connector_data/{folder}/ */
        process?: string;
        /** Push to GitHub */
        push?: string;
        /** Standalone config UI server */
        config?: string;
    };

    /** 
     * @deprecated Scheduling moved to config/scheduler.json
     * Kept for backward compatibility with get_all.ts
     */
    scheduler?: {
        mode: SchedulerMode;
        defaultIntervalHours?: number;
        defaultRandomMinutes?: number;
        cmd?: Array<'get' | 'process' | 'push'>;
    };

    /** Optional dependencies information */
    dependencies?: {
        /** Requires Playwright browsers */
        playwright?: boolean;
        /** Requires user login/authentication */
        requiresLogin?: boolean;
        /** Requires Chrome extension */
        chromeExtension?: boolean;
        /** Requires Docker */
        docker?: boolean;
    };

    /** Tunnel configuration for exposing routes via Cloudflare Tunnel */
    tunnel?: TunnelConfig;
}

/**
 * Route exposed via tunnel
 */
export interface TunnelRoute {
    /** Path relative to plugin's pathPrefix (e.g., "/api/push") */
    path: string;
    /** Auth requirement: false = no auth, "api-key" = requires X-API-Key header */
    auth: false | 'api-key';
}

/**
 * Tunnel configuration for a plugin
 */
export interface TunnelConfig {
    /** Whether this plugin wants tunnel exposure */
    enabled: boolean;
    /** Port the plugin's server runs on */
    port: number;
    /** Path prefix for routing (e.g., "/chrome-history") */
    pathPrefix: string;
    /** Routes to expose (whitelist) */
    routes: TunnelRoute[];
}

/**
 * Base plugin config stored in config/{pluginId}.json
 * Scheduling is handled separately in config/scheduler.json
 */
export interface BasePluginConfig {
    /** Whether this plugin is enabled */
    enabled: boolean;

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

    /** Whether Docker is installed */
    dockerInstalled?: boolean;

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
