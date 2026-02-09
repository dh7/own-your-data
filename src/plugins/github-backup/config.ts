import { BasePluginConfig } from '../types';

export interface GithubBackupConfig extends BasePluginConfig {
    /** Local path to back up (absolute or relative to CWD) */
    sourcePath: string;
    /** Commit message template. Use {date} for current date */
    commitMessage: string;
}

export const DEFAULT_CONFIG: GithubBackupConfig = {
    enabled: true,
    sourcePath: './connector_data',
    commitMessage: 'backup: {date}',
};
