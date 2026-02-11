/**
 * Google Contacts plugin template
 *
 * Renders the configuration UI section for Google Contacts
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { GoogleContactsPluginConfig, DEFAULT_CONFIG } from './config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Render the Google Contacts configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as GoogleContactsPluginConfig;
    const folderName = cfg.folderName || DEFAULT_CONFIG.folderName;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    // Check if the CSV file exists
    const csvPath = path.join(process.cwd(), 'raw-dumps', folderName, 'contacts.csv');
    const fileExists = fs.existsSync(csvPath);

    // Check if output file exists to get "last processed" date
    const outputPath = path.join(process.cwd(), 'connector_data', githubPath || 'gcontact', 'google-contacts.md');
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
    } else if (fileExists) {
        statusClass = 'warning';
        statusText = '⏳ Not processed yet';
    }

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">👥</span>
        Google Contacts
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        ${fileExists ? `
            <div class="success" style="margin-bottom: 1rem;">
                ✅ <strong>File found:</strong> <code>raw-dumps/${folderName}/contacts.csv</code>
            </div>
        ` : `
            <div class="warning" style="margin-bottom: 1rem; border-left: 4px solid #e3b341; background: rgba(227, 179, 65, 0.1); padding: 1rem;">
                <strong>Missing File</strong><br>
                Please export your Google Contacts and save the file to:<br>
                <code>raw-dumps/${folderName}/contacts.csv</code>
            </div>

            <details style="margin-bottom: 1rem; background: #0d1117; padding: 0.5rem; border-radius: 4px;">
                <summary style="cursor: pointer; color: #58a6ff;">How to export from Google</summary>
                <ol style="margin-top: 0.5rem; margin-left: 1.5rem; color: #8b949e;">
                    <li>Go to <a href="https://contacts.google.com" target="_blank" style="color: #58a6ff;">contacts.google.com</a></li>
                    <li>Select contacts (or leave empty to export all)</li>
                    <li>Click <strong>Export</strong> (top right or in sidebar)</li>
                    <li>Select <strong>Google CSV</strong> format</li>
                    <li>Download 'contacts.csv' and move it to the folder above</li>
                </ol>
            </details>
        `}

        <form action="/plugin/google-contacts" method="POST">
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
            </div>

            <div>
                <label for="gcontact-folder-name">Raw Data Folder Name</label>
                <input type="text" id="gcontact-folder-name" name="folderName"
                    value="${folderName}"
                    placeholder="gcontact" />
                <p class="help">Folder in <code>raw-dumps/</code> containing contacts.csv</p>
            </div>

            <div>
                <label for="gcontact-github-path">GitHub Output Path</label>
                <input type="text" id="gcontact-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="google-contacts" />
                <p class="help">Folder in your GitHub repo</p>
            </div>

            <button type="submit">💾 Save Google Contacts Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run google-contacts:process</code> - Process CSV<br>
            <code>npm run google-contacts:push</code> - Sync to GitHub
        </p>
        <button type="button" class="btn small-btn secondary" onclick="viewPluginLogs('google-contacts')" style="margin-top: 0.5rem;">📋 View Logs</button>
    </div>
</details>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): GoogleContactsPluginConfig {
    return {
        enabled: body.enabled === 'on',
        folderName: body.folderName || DEFAULT_CONFIG.folderName,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): GoogleContactsPluginConfig {
    return { ...DEFAULT_CONFIG };
}
