/**
 * Twitter plugin configuration types and defaults
 */

import { BasePluginConfig } from '../types';

/**
 * Twitter-specific configuration
 */
export interface TwitterPluginConfig extends BasePluginConfig {
    /** Twitter usernames to scrape */
    accounts: string[];

    /** Number of tweets to fetch per account */
    tweetsPerAccount: number;

    /** GitHub path for this plugin's data */
    githubPath: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: TwitterPluginConfig = {
    enabled: true,
    accounts: [],
    tweetsPerAccount: 100,
    githubPath: 'twitter',
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<TwitterPluginConfig>): TwitterPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
