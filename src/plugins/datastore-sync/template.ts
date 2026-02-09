import { BasePluginConfig, PluginRenderData } from '../types';
import { DatastoreSyncConfig, DEFAULT_CONFIG } from './config';

export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as DatastoreSyncConfig;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
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
        Datastore Sync
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <p style="color: #8b949e; margin-bottom: 1rem;">
            Push all connector_data files to GitHub using the gitstore token.
        </p>

        <form action="/plugin/datastore-sync" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            <div>
                <label for="ds-github-path">GitHub Path</label>
                <input type="text" id="ds-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="connector_data" />
                <p class="help">Target folder path in the GitHub repo</p>
            </div>

            <div>
                <label for="ds-msg">Commit Message</label>
                <input type="text" id="ds-msg" name="commitMessage"
                    value="${commitMessage}"
                    placeholder="sync: update datastore {date}" />
                <p class="help">Use <code>{date}</code> for current date</p>
            </div>

            <button type="submit">💾 Save Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run datastore-sync:push</code> - Push all files to GitHub
        </p>
    </div>
</details>
`;
}

export function parseFormData(body: Record<string, string>): DatastoreSyncConfig {
    return {
        enabled: body.enabled === 'on',
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
        commitMessage: body.commitMessage || DEFAULT_CONFIG.commitMessage,
    };
}

export function getDefaultConfig(): DatastoreSyncConfig {
    return { ...DEFAULT_CONFIG };
}
