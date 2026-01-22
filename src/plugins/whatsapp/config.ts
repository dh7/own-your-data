/**
 * WhatsApp plugin configuration types and defaults
 */

import { BasePluginConfig } from '../types';

/**
 * WhatsApp-specific configuration
 */
export interface WhatsAppPluginConfig extends BasePluginConfig {
    /** GitHub path for this plugin's data */
    githubPath: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: WhatsAppPluginConfig = {
    enabled: true,
    githubPath: 'whatsapp',
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
