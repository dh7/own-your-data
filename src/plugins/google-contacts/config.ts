/**
 * Google Contacts plugin configuration types and defaults
 */

import { BasePluginConfig } from '../types';

export interface GoogleContactsPluginConfig extends BasePluginConfig {
    /** Folder name for raw dumps in raw-dumps/ directory */
    folderName: string;
    /** GitHub path for this plugin's data */
    githubPath?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: GoogleContactsPluginConfig = {
    enabled: true,
    folderName: 'gcontact',
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<GoogleContactsPluginConfig>): GoogleContactsPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
