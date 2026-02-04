/**
 * LinkedIn plugin configuration types and defaults
 */

import { BasePluginConfig } from '../types';

export interface LinkedInPluginConfig extends BasePluginConfig {
    /** Folder name for raw dumps in raw-dumps/ directory */
    folderName: string;
    /** GitHub path for this plugin's data */
    githubPath?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: LinkedInPluginConfig = {
    enabled: true,
    folderName: 'linkedin',
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<LinkedInPluginConfig>): LinkedInPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
