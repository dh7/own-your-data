/**
 * System section - Dependencies, Daemon control, and Storage Paths
 */

import { StorageConfig } from '../config';

export interface SystemStatus {
    playwrightInstalled: boolean;
    browsersInstalled: boolean;
    daemonRunning: boolean;
}

export function renderSystemSection(
    config: StorageConfig,
    status: SystemStatus,
    justSaved: boolean = false
): string {
    const allDepsGood = status.playwrightInstalled && status.browsersInstalled;

    let statusHtml = '';

    if (status.daemonRunning) {
        statusHtml = '<span class="status" style="background: #da3633; color: white;">🔥 Running</span>';
    } else if (allDepsGood) {
        statusHtml = '<span class="status" style="background: #bd561d; color: white;">⏸ Ready</span>';
    } else {
        statusHtml = '<span class="status warning">⚠️ Dependency Missing</span>';
    }

    return `
<details>
    <summary>
        <span class="icon">⚙️</span>
        System
        ${statusHtml}
    </summary>
    <div class="section-content">
        <!-- Dependencies -->
        <h3 style="margin-bottom: 1rem; color: #58a6ff;">🔧 Dependencies</h3>
        ${allDepsGood ? `
            <p style="color: #7ee787;">✅ Playwright package installed</p>
            <p style="color: #7ee787;">✅ Playwright browsers installed</p>
            <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">Twitter and Instagram collectors are ready to use.</p>
        ` : `
            <p>${status.playwrightInstalled ? '<span style="color:#7ee787;">✅</span>' : '<span style="color:#ff7b72;">❌</span>'} Playwright package ${status.playwrightInstalled ? 'installed' : 'missing'}</p>
            <p>${status.browsersInstalled ? '<span style="color:#7ee787;">✅</span>' : '<span style="color:#f0a030;">⚠️</span>'} Playwright browsers ${status.browsersInstalled ? 'installed' : 'need install'}</p>
            
            <div style="margin-top: 1rem; padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                <p style="color: #f0a030; margin-bottom: 0.5rem;">
                    Run this command to install Playwright browsers:
                </p>
                <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block;">
                    npx playwright install chromium
                </code>
                <button type="button" onclick="location.reload()" style="margin-top: 1rem;" class="btn secondary">
                    🔄 Recheck
                </button>
            </div>
        `}

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <!-- Daemon Control -->
        <h3 style="margin-bottom: 1rem; color: #58a6ff;">🤖 Data Collection Daemon</h3>
        <p style="color: #8b949e; margin-bottom: 1rem;">
            The daemon runs in the background and automatically collects data from all enabled plugins on schedule.
        </p>
        
        <div style="padding: 1rem; background: #0a1a0a; border: 1px solid #2a4a2a; border-radius: 4px;">
            <p style="color: #7ee787; margin-bottom: 0.75rem;">
                <strong>To start the daemon:</strong>
            </p>
            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block; font-size: 0.9em;">
                npm run get_all
            </code>
            <p style="color: #8b949e; margin-top: 0.75rem; font-size: 0.85em;">
                The daemon will:<br>
                • Run each plugin's commands (get → process → push) on schedule<br>
                • Respect active hours (default: 7:00 - 23:00)<br>
                • Add random delays to mimic human behavior<br>
                • Press Ctrl+C to stop
            </p>
        </div>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <!-- Storage Paths -->
        <h3 style="margin-bottom: 1rem; color: #58a6ff;">📁 Storage Paths</h3>
        <form action="/storage" method="POST">
            <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <label for="path-auth">Auth Directory</label>
                    <input type="text" id="path-auth" name="auth" value="${config.auth}" placeholder="./auth" />
                    <p class="help">Sessions & tokens</p>
                </div>
                <div>
                    <label for="path-logs">Logs Directory</label>
                    <input type="text" id="path-logs" name="logs" value="${config.logs}" placeholder="./logs" />
                    <p class="help">Collection logs</p>
                </div>
                <div>
                    <label for="path-raw">Raw Dumps Directory</label>
                    <input type="text" id="path-raw" name="rawDumps" value="${config.rawDumps}" placeholder="./raw-dumps" />
                    <p class="help">Raw API data</p>
                </div>
                <div>
                    <label for="path-connector-data">Connector Data Directory</label>
                    <input type="text" id="path-connector-data" name="connectorData" value="${config.connectorData || './connector_data'}" placeholder="./connector_data" />
                    <p class="help">Processed output</p>
                </div>
            </div>
            <button type="submit" style="margin-top: 1rem;">💾 Save Storage Config</button>
        </form>
    </div>
</details>
`;
}

export function renderPluginsDivider(): string {
    return `
<h2 style="color: #58a6ff; font-size: 1.25rem; font-weight: 700; margin: 2rem 0 1rem 0;">
    Installed Plugins
</h2>
`;
}
