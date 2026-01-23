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

    // Check if the CSV file exists
    const csvPath = path.join(process.cwd(), 'raw-dumps', folderName, 'Connections.csv');
    const fileExists = fs.existsSync(csvPath);

    const statusClass = fileExists ? 'connected' : 'pending';
    const statusText = fileExists ? '✅ Ready' : '⚠️ Setup needed';

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">💼</span>
        LinkedIn
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        ${fileExists ? `
            <div class="success" style="margin-bottom: 1rem;">
                ✅ <strong>File found:</strong> <code>raw-dumps/${folderName}/Connections.csv</code>
            </div>
        ` : `
            <div class="warning" style="margin-bottom: 1rem; border-left: 4px solid #e3b341; background: rgba(227, 179, 65, 0.1); padding: 1rem;">
                <strong>Missing File</strong><br>
                Please export your LinkedIn connections and save the file to:<br>
                <code>raw-dumps/${folderName}/Connections.csv</code>
            </div>
            
            <details style="margin-bottom: 1rem; background: #0d1117; padding: 0.5rem; border-radius: 4px;">
                <summary style="cursor: pointer; color: #58a6ff;">How to export from LinkedIn</summary>
                <ol style="margin-top: 0.5rem; margin-left: 1.5rem; color: #8b949e;">
                    <li>Go to <strong>Me</strong> > <strong>Settings & Privacy</strong></li>
                    <li>Select <strong>Data privacy</strong> > <strong>Get a copy of your data</strong></li>
                    <li>Select <strong>Connections</strong> and click <strong>Request archive</strong></li>
                    <li>Wait for the email (usually fast), download, and extract</li>
                    <li>Rename <code>Connections.csv</code> and move it to the folder above</li>
                </ol>
            </details>
        `}

        <form action="/plugin/linkedin" method="POST">
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
    </div>
</details>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): LinkedInPluginConfig {
    return {
        enabled: true,
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
