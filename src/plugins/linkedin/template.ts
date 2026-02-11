/**
 * LinkedIn plugin template
 *
 * Renders the configuration UI section for LinkedIn
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { LinkedInPluginConfig, DEFAULT_CONFIG } from './config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Render the LinkedIn configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as LinkedInPluginConfig;
    const folderName = cfg.folderName || DEFAULT_CONFIG.folderName;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    // Check if the CSV files exist
    const folderPath = path.join(process.cwd(), 'raw-dumps', folderName);
    const hasConnections = fs.existsSync(path.join(folderPath, 'Connections.csv'));
    const hasImported = fs.existsSync(path.join(folderPath, 'ImportedContacts.csv'));
    const hasMessages = fs.existsSync(path.join(folderPath, 'messages.csv'));

    // We consider it "Ready" if at least the main Connections file is there, but we show status for all
    const isReady = hasConnections || hasImported || hasMessages;

    // Check if output file exists to get "last processed" date
    const outputPath = path.join(process.cwd(), 'connector_data', githubPath || 'linkedin', 'linkedin-contacts.md');
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
    } else if (isReady) {
        statusClass = 'warning';
        statusText = '⏳ Not processed yet';
    }

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">💼</span>
        LinkedIn
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <div style="margin-bottom: 1rem; padding: 1rem; border-radius: 6px; background: rgba(255, 255, 255, 0.05);">
            <div style="margin-bottom: 0.5rem; font-weight: bold;">File Status (raw-dumps/${folderName}/):</div>
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 0.25rem;">
                    ${hasConnections ? '✅' : '❌'} <code>Connections.csv</code> 
                    <span style="opacity: 0.7; font-size: 0.9em;">(Primary contacts)</span>
                </li>
                <li style="margin-bottom: 0.25rem;">
                    ${hasImported ? '✅' : '❌'} <code>ImportedContacts.csv</code>
                    <span style="opacity: 0.7; font-size: 0.9em;">(Synced contacts)</span>
                </li>
                <li>
                    ${hasMessages ? '✅' : '❌'} <code>messages.csv</code>
                    <span style="opacity: 0.7; font-size: 0.9em;">(Message history)</span>
                </li>
            </ul>
        </div>

        ${!isReady ? `
            <div class="warning" style="margin-bottom: 1rem; border-left: 4px solid #e3b341; background: rgba(227, 179, 65, 0.1); padding: 1rem;">
                <strong>Missing Files</strong><br>
                Please export your LinkedIn data and save the files to:<br>
                <code>raw-dumps/${folderName}/</code>
            </div>
            
            <details style="margin-bottom: 1rem; background: #0d1117; padding: 0.5rem; border-radius: 4px;">
                <summary style="cursor: pointer; color: #58a6ff;">How to export from LinkedIn</summary>
                <ol style="margin-top: 0.5rem; margin-left: 1.5rem; color: #8b949e;">
                    <li>Go to <strong>Me</strong> > <strong>Settings & Privacy</strong></li>
                    <li>Select <strong>Data privacy</strong> > <strong>Get a copy of your data</strong></li>
                    <li>Select <strong>Download larger data archive</strong> (includes everything)</li>
                    <li>Request archive and wait for the email</li>
                    <li>Download and unzip the archive</li>
                    <li>Copy <code>Connections.csv</code>, <code>ImportedContacts.csv</code>, and <code>messages.csv</code> to the folder above</li>
                </ol>
            </details>
        ` : ''}

        <form action="/plugin/linkedin" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            <div>
                <label for="linkedin-folder-name">Raw Data Folder Name</label>
                <input type="text" id="linkedin-folder-name" name="folderName"
                    value="${folderName}"
                    placeholder="linkedin" />
                <p class="help">Folder in <code>raw-dumps/</code> containing Connections.csv</p>
            </div>

            <div>
                <label for="linkedin-github-path">GitHub Output Path</label>
                <input type="text" id="linkedin-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="linkedin" />
                <p class="help">Folder in your GitHub repo</p>
            </div>

            <button type="submit">💾 Save LinkedIn Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run linkedin:process</code> - Process CSV<br>
            <code>npm run linkedin:push</code> - Sync to GitHub
        </p>
        <button type="button" class="btn small-btn secondary" onclick="viewPluginLogs('linkedin')" style="margin-top: 0.5rem;">📋 View Logs</button>
    </div>
</details>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): LinkedInPluginConfig {
    return {
        enabled: body.enabled === 'on',
        folderName: body.folderName || DEFAULT_CONFIG.folderName,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): LinkedInPluginConfig {
    return { ...DEFAULT_CONFIG };
}
