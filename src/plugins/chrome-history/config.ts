/**
 * Chrome History Plugin Configuration
 */

import { BasePluginConfig } from '../types';

export interface ChromeHistoryPluginConfig extends BasePluginConfig {
    /** Raw data folder name */
    folderName: string;
    /** GitHub output path */
    githubPath: string;
    /** Number of days of history to include in each sync */
    daysToSync: number;
    /** Server port for receiving extension data */
    serverPort: number;
}

export const DEFAULT_CONFIG: ChromeHistoryPluginConfig = {
    enabled: true,
    intervalHours: 24,
    randomMinutes: 60,
    folderName: 'chrome-history',
    githubPath: 'chrome-history',
    daysToSync: 30,
    serverPort: 3457,
};

// Path to the API key file (relative to project root)
export const API_KEY_PATH = 'auth/chrome-api-key.txt';

// Path to the extension folder (relative to this plugin)
export const EXTENSION_FOLDER = 'extension';
