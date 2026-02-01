/**
 * System section - Dependencies, Daemon control, and Storage Paths
 */

import { AppConfig, StorageConfig } from '../config';
import { DiscoveredPlugin } from '../../plugins';

export interface TunnelRouteInfo {
    pluginId: string;
    pluginName: string;
    pluginIcon: string;
    pathPrefix: string;
    port: number;
    routeCount: number;
}

export interface SystemStatus {
    playwrightInstalled: boolean;
    browsersInstalled: boolean;
    daemonRunning: boolean;
    syncthingInstalled: boolean;
    cloudflaredInstalled: boolean;
    tunnelRunning: boolean;
    tunnelUrl: string | null;
    tunnelRoutes: TunnelRouteInfo[];
    whisperXInstalled: boolean;
}

export function renderSystemSection(
    appConfig: AppConfig,
    plugins: DiscoveredPlugin[],
    status: SystemStatus,
    justSaved: boolean = false
): string {
    const config = appConfig.storage;
    const daemon = appConfig.daemon || { activeHours: { start: 7, end: 23 } };
    const allDepsGood = status.playwrightInstalled && status.browsersInstalled;

    let statusHtml = '';

    if (status.daemonRunning) {
        statusHtml = '<span class="status" style="background: #00ff00; color: white;">🔥 Running</span>';
    } else if (allDepsGood) {
        statusHtml = '<span class="status" style="background: #bd561d; color: white;">⏸ Ready</span>';
    } else {
        statusHtml = '<span class="status warning">⚠️ Dependency Missing</span>';
    }

    // Schedule Recap Table
    const scheduleRows = plugins.map(p => {
        const pConfig = appConfig.plugins?.[p.manifest.id];
        const enabled = pConfig?.enabled ?? true;
        const interval = pConfig?.intervalHours ?? p.manifest.scheduler.defaultIntervalHours ?? 6;
        const random = pConfig?.randomMinutes ?? p.manifest.scheduler.defaultRandomMinutes ?? 30;

        let scheduleText = '';
        if (p.manifest.scheduler.mode === 'interval') {
            scheduleText = `Every <strong>${interval}h</strong> ± ${random}m`;
        } else if (p.manifest.scheduler.mode === 'manual') {
            scheduleText = '<span style="color:#8b949e">Manual only</span>';
        } else {
            scheduleText = p.manifest.scheduler.mode;
        }

        return `
        <tr style="opacity: ${enabled ? 1 : 0.5}">
            <td style="padding: 0.5rem;">${p.manifest.icon} ${p.manifest.name}</td>
            <td style="padding: 0.5rem;">
                ${enabled
                ? `<span style="color:#7ee787">Enabled</span>`
                : `<span style="color:#8b949e">Disabled</span>`}
            </td>
            <td style="padding: 0.5rem;">
                ${scheduleText}
            </td>
        </tr>`;
    }).join('');

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
        
        <!-- Playwright -->
        ${allDepsGood ? `
            <p style="color: #7ee787;">✅ Playwright package installed</p>
            <p style="color: #7ee787;">✅ Playwright browsers installed</p>
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
                <button type="button" onclick="recheckPlaywright(this)" style="margin-top: 1rem;" class="btn secondary">
                    🔄 Recheck
                </button>
                <span id="playwright-recheck-status" style="margin-left: 0.5rem;"></span>
            </div>
        `}

        <!-- Syncthing -->
        <div style="margin-top: 1.5rem; padding-top: 1rem;">
            ${status.syncthingInstalled ? `
                <p style="color: #7ee787;">✅ Syncthing installed</p>
                <div style="margin-top: 1rem; padding: 1rem; background: #0a1a1a; border: 1px solid #2a4a4a; border-radius: 4px;">
                    <p style="color: #8b949e; margin-bottom: 0.75rem;">Access the Syncthing Web GUI to manage sync folders and devices:</p>
                    <a href="http://localhost:8384" target="_blank" class="btn" style="display: inline-block; text-decoration: none;">
                        🌐 Open Syncthing GUI
                    </a>
                </div>
            ` : `
                <p style="color: #f0a030;">⚠️ Syncthing not installed</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">Syncthing enables P2P file synchronization across your devices.</p>
                <div style="margin-top: 1rem; padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                    <button type="button" onclick="installSyncthing(this)" class="btn">
                        📦 Install Syncthing
                    </button>
                    <p id="syncthing-install-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
                </div>
            `}
        </div>

        <!-- Cloudflare Tunnel (simplified - full config in Your Domain section) -->
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #30363d;">
            <h4 style="margin-bottom: 0.75rem; color: #79c0ff;">☁️ Cloudflare Tunnel</h4>
            ${!status.cloudflaredInstalled ? `
                <p style="color: #f0a030;">⚠️ cloudflared not installed</p>
                <div style="margin-top: 1rem; padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                    <button type="button" onclick="installCloudflared(this)" class="btn">
                        📦 Install cloudflared
                    </button>
                    <p id="cloudflared-install-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
                </div>
            ` : `
                <p style="color: #7ee787;">✅ cloudflared installed</p>
                ${status.tunnelRunning && status.tunnelUrl ? `
                    <p style="color: #7ee787; margin-top: 0.5rem;">🌐 Tunnel running: <code>${status.tunnelUrl}</code></p>
                ` : ''}
                <p style="color: #8b949e; font-size: 0.9em; margin-top: 0.75rem;">
                    Configure your permanent public URL in the <strong>Your Domain</strong> section below.
                </p>
            `}
        </div>

        <!-- WhisperX -->
        <div style="margin-top: 1.5rem; padding-top: 1rem;">
            ${status.whisperXInstalled ? `
                <p style="color: #7ee787;">✅ WhisperX installed</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                    Automatic speech recognition with word-level timestamps and speaker diarization.
                </p>
            ` : `
                <p style="color: #f0a030;">⚠️ WhisperX not installed</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                    WhisperX provides automatic speech recognition with word-level timestamps and speaker diarization.
                </p>
                <div style="margin-top: 1rem; padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                    <p style="color: #f0a030; margin-bottom: 0.5rem;">
                        Run this command to install WhisperX:
                    </p>
                    <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block;">
                        pip install whisperx
                    </code>
                    <p style="color: #8b949e; margin-top: 0.75rem; font-size: 0.85em;">
                        <strong>Note:</strong> For GPU acceleration, install CUDA toolkit 12.8 first.<br>
                        For speaker diarization, you'll also need a Hugging Face token.
                    </p>
                    <button type="button" onclick="recheckWhisperX(this)" style="margin-top: 1rem;" class="btn secondary">
                        🔄 Recheck
                    </button>
                    <span id="whisperx-recheck-status" style="margin-left: 0.5rem;"></span>
                </div>
            `}
        </div>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <!-- Daemon Control -->
        <h3 style="margin-bottom: 1rem; color: #58a6ff;">🤖 Data Collection Daemon</h3>
        
        <form action="/daemon" method="POST" style="margin-bottom: 1.5rem; background: #0d1117; padding: 1rem; border-radius: 6px; border: 1px solid #30363d;">
            <div style="display: flex; gap: 2rem; align-items: center; margin-bottom: 1rem;">
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Active Hours (Start)</label>
                    <input type="number" name="startHour" value="${daemon.activeHours.start}" min="0" max="23" style="width: 80px;" />
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Active Hours (End)</label>
                    <input type="number" name="endHour" value="${daemon.activeHours.end}" min="0" max="24" style="width: 80px;" />
                </div>
                <div style="flex: 1; display: flex; align-items: flex-end; justify-content: flex-end;">
                    <button type="submit" class="small-btn">💾 Save Settings</button>
                </div>
            </div>
            <p style="color: #8b949e; font-size: 0.85em;">
                The daemon will only collect data between these hours to mimic human behavior.
            </p>
        </form>

        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.75rem; color: #79c0ff;">Schedule Recap</h4>
            <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 1px solid #30363d; color: #8b949e;">
                        <th style="padding: 0.5rem;">Plugin</th>
                        <th style="padding: 0.5rem;">Status</th>
                        <th style="padding: 0.5rem;">Schedule</th>
                    </tr>
                </thead>
                <tbody>
                    ${scheduleRows}
                </tbody>
            </table>
        </div>
        
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
                • Respect active hours (${daemon.activeHours.start}:00 - ${daemon.activeHours.end}:00)<br>
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
