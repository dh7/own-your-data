import { BasePluginConfig, PluginRenderData } from '../types';
import { GithubBackupConfig, DEFAULT_CONFIG } from './config';

export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as GithubBackupConfig;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;
    const sourcePath = cfg.sourcePath || DEFAULT_CONFIG.sourcePath;
    const commitMessage = cfg.commitMessage || DEFAULT_CONFIG.commitMessage;

    let statusClass = 'pending';
    let statusText = '⚠️ Setup needed';
    if (!enabled) {
        statusClass = 'disconnected';
        statusText = '⏸ Disabled';
    } else {
        statusClass = 'connected';
        statusText = '✅ Ready';
    }

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">📦</span>
        GitHub Backup
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <p style="color: #8b949e; margin-bottom: 1rem;">
            Git add, commit and push a local directory to the GitHub vault repo.
        </p>

        <form action="/plugin/github-backup" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            <div>
                <label for="gb-source-path">Source Path</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" id="gb-source-path" name="sourcePath"
                        value="${sourcePath}"
                        placeholder="./connector_data" style="flex: 1;" />
                    <button type="button" onclick="pickFolder('gb-source-path', this)" class="btn secondary small-btn" title="Browse...">📂</button>
                </div>
                <p class="help">Local directory to back up (absolute or relative to project root)</p>
            </div>

            <div>
                <label for="gb-msg">Commit Message</label>
                <input type="text" id="gb-msg" name="commitMessage"
                    value="${commitMessage}"
                    placeholder="backup: {date}" />
                <p class="help">Use <code>{date}</code> for current date</p>
            </div>

            <button type="submit">💾 Save Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run github-backup:push</code> - Push to GitHub
        </p>
        <button type="button" class="btn small-btn secondary" onclick="viewPluginLogs('github-backup')" style="margin-top: 0.5rem;">📋 View Logs</button>
    </div>
</details>
`;
}

export function parseFormData(body: Record<string, string>): GithubBackupConfig {
    return {
        enabled: body.enabled === 'on',
        sourcePath: body.sourcePath || DEFAULT_CONFIG.sourcePath,
        commitMessage: body.commitMessage || DEFAULT_CONFIG.commitMessage,
    };
}

export function getDefaultConfig(): GithubBackupConfig {
    return { ...DEFAULT_CONFIG };
}
