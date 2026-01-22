/**
 * Plugin discovery and loading
 *
 * Scans src/plugins/[name]/manifest.json to find all available plugins.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PluginManifest, Plugin, DiscoveredPlugin, BasePluginConfig } from './types';

// Re-export types for external use
export { PluginManifest, Plugin, DiscoveredPlugin, BasePluginConfig };

// Cache for discovered plugins
let pluginCache: DiscoveredPlugin[] | null = null;

/**
 * Get the plugins directory path
 */
function getPluginsDir(): string {
    return path.join(process.cwd(), 'src', 'plugins');
}

/**
 * Discover all plugins by scanning for manifest.json files
 * Results are cached after first call.
 */
export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
    if (pluginCache) {
        return pluginCache;
    }

    const pluginsDir = getPluginsDir();
    const discovered: DiscoveredPlugin[] = [];

    try {
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            // Skip special files/folders
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const manifestPath = path.join(pluginsDir, entry.name, 'manifest.json');

            try {
                const manifestData = await fs.readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(manifestData) as PluginManifest;

                discovered.push({
                    manifest,
                    path: path.join(pluginsDir, entry.name),
                });

                console.log(`📦 Discovered plugin: ${manifest.name} (${manifest.id})`);
            } catch {
                // No manifest.json in this directory, skip
            }
        }
    } catch (e) {
        console.error('Failed to discover plugins:', e);
    }

    pluginCache = discovered;
    return discovered;
}

/**
 * Clear the plugin cache (useful for hot reloading)
 */
export function clearPluginCache(): void {
    pluginCache = null;
}

/**
 * Get a specific plugin by ID
 */
export async function getPlugin(id: string): Promise<DiscoveredPlugin | undefined> {
    const plugins = await discoverPlugins();
    return plugins.find(p => p.manifest.id === id);
}

/**
 * Load a plugin's module (template, parseFormData, etc.)
 */
export async function loadPluginModule(id: string): Promise<Plugin | undefined> {
    const discovered = await getPlugin(id);
    if (!discovered) return undefined;

    try {
        // Dynamic import of the plugin's template module
        const templatePath = path.join(discovered.path, 'template');
        const module = await import(templatePath);

        return {
            manifest: discovered.manifest,
            renderTemplate: module.renderTemplate,
            parseFormData: module.parseFormData,
            getDefaultConfig: module.getDefaultConfig,
        };
    } catch (e) {
        console.error(`Failed to load plugin module for ${id}:`, e);
        return undefined;
    }
}

/**
 * Get all plugins with interval scheduling mode
 */
export async function getIntervalPlugins(): Promise<DiscoveredPlugin[]> {
    const plugins = await discoverPlugins();
    return plugins.filter(p => p.manifest.scheduler.mode === 'interval');
}

/**
 * Get all plugins with realtime scheduling mode
 */
export async function getRealtimePlugins(): Promise<DiscoveredPlugin[]> {
    const plugins = await discoverPlugins();
    return plugins.filter(p => p.manifest.scheduler.mode === 'realtime');
}

/**
 * Get resolved paths for a plugin
 */
export function getPluginPaths(manifest: PluginManifest, basePaths: {
    rawDumps: string;
    logs: string;
    connectorData: string;
}) {
    return {
        rawDumps: path.join(basePaths.rawDumps, manifest.folder),
        logs: path.join(basePaths.logs, manifest.folder),
        connectorData: path.join(basePaths.connectorData, manifest.folder),
    };
}
