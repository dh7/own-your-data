/**
 * OpenAI plugin template
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { OpenAIPluginConfig, DEFAULT_CONFIG } from './config';

export function getDefaultConfig(): OpenAIPluginConfig {
    return { ...DEFAULT_CONFIG };
}

export function parseFormData(body: Record<string, string>): OpenAIPluginConfig {
    return {
        enabled: body.enabled === 'on',
        exportFolder: body.exportFolder || undefined,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as OpenAIPluginConfig;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;
    const exportFolder = cfg.exportFolder || '';
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;

    return `
<details>
    <summary>
        <span class="icon">🤖</span>
        OpenAI / ChatGPT
        <span class="status ${enabled ? 'connected' : 'pending'}">${enabled ? 'Enabled' : 'Disabled'}</span>
    </summary>
    <div class="section-content">
        <p class="description" style="color: #8b949e; margin-bottom: 1rem;">
             Process your ChatGPT data export (conversations.json). 
             Place your extracted export folder in <code>raw-dumps/openAI/</code>.
        </p>

        <form action="/plugin/openai" method="POST">
             <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable processing
                </label>
            </div>

             <div style="margin-bottom: 1rem;">
                <label for="openai-folder">Export Folder Name</label>
                <input type="text" id="openai-folder" name="exportFolder" 
                    value="${exportFolder}" 
                    placeholder="e.g. package-2023-01-01 or leave empty to auto-detect"
                    style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9;" />
                <p class="help-text" style="color: #8b949e; font-size: 0.85em; margin-top: 0.25rem;">The folder inside <code>raw-dumps/openAI/</code> containing <code>conversations.json</code>.</p>
            </div>

            <div style="margin-bottom: 1rem;">
                <label for="openai-github-path">GitHub Output Path</label>
                <input type="text" id="openai-github-path" name="githubPath" 
                    value="${githubPath}"
                    placeholder="openai"
                    style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9;" />
            </div>

            <button type="submit">💾 Save OpenAI Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run openai:process</code> - Process raw data<br>
            <code>npm run openai:push</code> - Sync to GitHub
        </p>
    </div>
</details>
`;
}

