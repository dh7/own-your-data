/**
 * Instagram plugin configuration types and defaults
 */

import { BasePluginConfig } from '../types';

/**
 * Instagram-specific configuration
 */
export interface InstagramPluginConfig extends BasePluginConfig {
    /** Instagram usernames to scrape */
    accounts: string[];

    /** Number of posts to fetch per account */
    postsPerAccount: number;

    /** GitHub path for this plugin's data */
    githubPath: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: InstagramPluginConfig = {
    enabled: true,
    accounts: [],
    postsPerAccount: 50,
    githubPath: 'instagram',
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<InstagramPluginConfig>): InstagramPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
