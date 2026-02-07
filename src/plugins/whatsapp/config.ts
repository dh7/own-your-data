/**
 * WhatsApp plugin configuration types and defaults
 */

/**
 * WhatsApp-specific configuration
 */
import { BasePluginConfig } from '../types';

export interface WhatsAppPluginConfig extends BasePluginConfig {
    /** GitHub path for this plugin's data */
    githubPath: string;

    /** Number of days to push to GitHub (default: 7) */
    pushDays?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: WhatsAppPluginConfig = {
    enabled: true,
    githubPath: 'whatsapp',
    pushDays: 7,
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<WhatsAppPluginConfig>): WhatsAppPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
