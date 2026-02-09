import { BasePluginConfig } from '../types';

export interface DatastoreSyncConfig extends BasePluginConfig {
    /** Target path in the GitHub repo (e.g. "connector_data") */
    githubPath: string;
    /** Commit message template. Use {date} for current date */
    commitMessage: string;
}

export const DEFAULT_CONFIG: DatastoreSyncConfig = {
    enabled: true,
    githubPath: 'connector_data',
    commitMessage: 'sync: update datastore {date}',
};
