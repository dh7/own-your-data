import * as fs from 'fs';
import * as path from 'path';
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
    const exportFolder = cfg.exportFolder || '';
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    // Check if conversations.json exists in raw-dumps/openAI/
    const rawDumpsPath = path.join(process.cwd(), 'raw-dumps', 'openAI');
    let hasConversations = false;
    let detectedFolder = '';

    try {
        // Try to find conversations.json in any subfolder
        const entries = fs.readdirSync(rawDumpsPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const convPath = path.join(rawDumpsPath, entry.name, 'conversations.json');
                if (fs.existsSync(convPath)) {
                    hasConversations = true;
                    detectedFolder = entry.name;
                    break;
                }
            }
        }
        // Also check root folder
        if (!hasConversations && fs.existsSync(path.join(rawDumpsPath, 'conversations.json'))) {
            hasConversations = true;
        }
    } catch { }

    // Check if output file exists to get "last processed" date
    const outputPath = path.join(process.cwd(), 'connector_data', githubPath || 'openai', 'openai-conversations.md');
    let lastProcessed: Date | null = null;
    try {
        const stat = fs.statSync(outputPath);
        lastProcessed = stat.mtime;
    } catch { }

    let statusClass = 'pending';
    let statusText = '⚠️ Setup needed';
    if (!enabled) {
        statusClass = 'disconnected';
        statusText = '⏸ Disabled';
    } else if (lastProcessed) {
        statusClass = 'connected';
        statusText = `✅ Done on ${lastProcessed.toLocaleDateString()}`;
    } else if (hasConversations) {
        statusClass = 'warning';
        statusText = '⏳ Not processed yet';
    }

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">🤖</span>
        OpenAI / ChatGPT
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <div style="margin-bottom: 1rem; padding: 1rem; border-radius: 6px; background: rgba(255, 255, 255, 0.05);">
            <div style="margin-bottom: 0.5rem; font-weight: bold;">File Status (raw-dumps/openAI/):</div>
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li>
                    ${hasConversations ? '✅' : '❌'} <code>conversations.json</code>
                    ${detectedFolder ? `<span style="opacity: 0.7; font-size: 0.9em;">(found ✓)</span>` : ''}
                </li>
            </ul>
        </div>

        ${!hasConversations ? `
            <div class="warning" style="margin-bottom: 1rem; border-left: 4px solid #e3b341; background: rgba(227, 179, 65, 0.1); padding: 1rem;">
                <strong>Missing File</strong><br>
                Please export your ChatGPT data and save the files to:<br>
                <code>raw-dumps/openAI/[export-folder]/</code>
            </div>
            
            <details style="margin-bottom: 1rem; background: #0d1117; padding: 0.5rem; border-radius: 4px;">
                <summary style="cursor: pointer; color: #58a6ff;">How to export from ChatGPT</summary>
                <ol style="margin-top: 0.5rem; margin-left: 1.5rem; color: #8b949e;">
                    <li>Go to <a href="https://chatgpt.com" target="_blank" style="color: #58a6ff;">chatgpt.com</a></li>
                    <li>Click your profile icon → <strong>Settings</strong></li>
                    <li>Go to <strong>Data controls</strong></li>
                    <li>Click <strong>Export data</strong></li>
                    <li>Wait for the email with download link</li>
                    <li>Download and unzip the archive</li>
                    <li>Copy the extracted folder to <code>raw-dumps/openAI/</code></li>
                </ol>
            </details>
        ` : ''}

        <form action="/plugin/openai" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            ${hasConversations ? `
                <input type="hidden" name="exportFolder" value="${detectedFolder}" />
            ` : `
                <div style="margin-bottom: 1rem;">
                    <label for="openai-folder">Export Folder Name</label>
                    <input type="text" id="openai-folder" name="exportFolder" 
                        value="${exportFolder}" 
                        placeholder="Folder containing conversations.json"
                        style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9;" />
                    <p class="help-text" style="color: #8b949e; font-size: 0.85em; margin-top: 0.25rem;">Only needed if auto-detection fails.</p>
                </div>
            `}

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
        <button type="button" class="btn small-btn secondary" onclick="viewPluginLogs('openai')" style="margin-top: 0.5rem;">📋 View Logs</button>
    </div>
</details>
`;
}
