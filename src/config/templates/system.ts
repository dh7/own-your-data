/**
 * System section - Dependencies, Daemon control, and Storage Paths
 */

import { AppConfig } from '../config';

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
    dockerInstalled: boolean;
    nvidiaDockerInstalled: boolean;
    // Update status
    updateAvailable: boolean;
    currentCommit: string;
    remoteCommit: string;
    commitsBehind: number;
}

export function renderSystemSection(
    appConfig: AppConfig,
    status: SystemStatus,
    justSaved: boolean = false
): { cards: string; modals: string } {
    const config = appConfig.storage;
    const allDepsGood = status.playwrightInstalled && status.browsersInstalled;

    // Badge logic
    const updateBadge = status.updateAvailable
        ? `<span class="sys-badge orange">${status.commitsBehind} update${status.commitsBehind > 1 ? 's' : ''}</span>`
        : `<span class="sys-badge green">Up to date</span>`;

    const depCount = [status.playwrightInstalled, status.browsersInstalled, status.syncthingInstalled, status.cloudflaredInstalled, status.dockerInstalled].filter(Boolean).length;
    const depTotal = 5;
    const depBadge = depCount === depTotal
        ? `<span class="sys-badge green">All good</span>`
        : `<span class="sys-badge orange">${depCount}/${depTotal}</span>`;

    const pathsBadge = `<span class="sys-badge green">Configured</span>`;

    // --- Updates modal content ---
    const updatesContent = status.updateAvailable ? `
        <p style="color: #f0a030; margin-bottom: 0.5rem;">
            ⬆️ Update available! (${status.commitsBehind} commit${status.commitsBehind > 1 ? 's' : ''} behind)
        </p>
        <p style="color: #8b949e; font-size: 0.85em; margin-bottom: 0.75rem;">
            Local: <code>${status.currentCommit.substring(0, 7)}</code> → Remote: <code>${status.remoteCommit.substring(0, 7)}</code>
        </p>
        <div style="display: flex; gap: 0.5rem;">
            <button type="button" onclick="pullUpdates(this)" class="btn">⬇️ Pull Updates</button>
            <button type="button" onclick="checkForUpdates(this)" class="btn secondary small-btn">🔍 Re-check</button>
        </div>
        <p id="update-status" style="margin-top: 0.5rem; font-size: 0.85em;"></p>
    ` : `
        <p style="color: #8b949e; margin-bottom: 0.5rem;">
            Current: <code>${status.currentCommit.substring(0, 7)}</code>
        </p>
        <button type="button" onclick="checkForUpdates(this)" class="btn secondary small-btn">🔍 Check for Updates</button>
        <p id="update-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;">Click to check GitHub for new updates</p>
    `;

    // --- Dependencies modal content ---
    const depsContent = `
        <!-- Playwright -->
        <h4 style="margin-bottom: 0.5rem; color: #79c0ff;">🎭 Playwright</h4>
        ${allDepsGood ? `
            <p style="color: #7ee787;">✅ Package installed</p>
            <p style="color: #7ee787; margin-bottom: 1rem;">✅ Browsers installed</p>
        ` : `
            <p>${status.playwrightInstalled ? '<span style="color:#7ee787;">✅</span>' : '<span style="color:#ff7b72;">❌</span>'} Package ${status.playwrightInstalled ? 'installed' : 'missing'}</p>
            <p>${status.browsersInstalled ? '<span style="color:#7ee787;">✅</span>' : '<span style="color:#f0a030;">⚠️</span>'} Browsers ${status.browsersInstalled ? 'installed' : 'need install'}</p>
            <div style="margin: 0.75rem 0 1rem; padding: 0.75rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                <code style="background: #0a0a0a; padding: 0.4rem 0.75rem; border-radius: 4px; display: block; font-size: 0.85em;">npx playwright install chromium</code>
                <button type="button" onclick="recheckPlaywright(this)" style="margin-top: 0.5rem;" class="btn secondary small-btn">🔄 Recheck</button>
                <span id="playwright-recheck-status" style="margin-left: 0.5rem;"></span>
            </div>
        `}

        <!-- Syncthing -->
        <h4 style="margin-bottom: 0.5rem; color: #79c0ff;">🔄 Syncthing</h4>
        ${status.syncthingInstalled ? `
            <p style="color: #7ee787;">✅ Installed</p>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0 1rem;">
                <button type="button" onclick="window.open('http://' + window.location.hostname + ':8384', '_blank')" class="btn small-btn">🌐 Open GUI</button>
                <button type="button" onclick="configureSyncthingRemote(this)" class="btn secondary small-btn">🔓 Remote Access</button>
            </div>
            <p id="syncthing-config-status" style="font-size: 0.85em; color: #8b949e; margin-bottom: 1rem;"></p>
        ` : `
            <p style="color: #f0a030; margin-bottom: 0.5rem;">⚠️ Not installed</p>
            <button type="button" onclick="installSyncthing(this)" class="btn small-btn">📦 Install</button>
            <p id="syncthing-install-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e; margin-bottom: 1rem;"></p>
        `}

        <!-- Cloudflare -->
        <h4 style="margin-bottom: 0.5rem; color: #79c0ff;">☁️ Cloudflare Tunnel</h4>
        ${!status.cloudflaredInstalled ? `
            <p style="color: #f0a030; margin-bottom: 0.5rem;">⚠️ Not installed</p>
            <button type="button" onclick="installCloudflared(this)" class="btn small-btn">📦 Install</button>
            <p id="cloudflared-install-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e; margin-bottom: 1rem;"></p>
        ` : `
            <p style="color: #7ee787;">✅ Installed</p>
            ${status.tunnelRunning && status.tunnelUrl ? `<p style="color: #7ee787; margin-top: 0.25rem; font-size: 0.9em;">🌐 <code>${status.tunnelUrl}</code></p>` : ''}
            <p style="color: #8b949e; font-size: 0.85em; margin: 0.25rem 0 1rem;">Configured in <strong>Your Domain</strong>.</p>
        `}

        <!-- Docker -->
        <h4 style="margin-bottom: 0.5rem; color: #79c0ff;">🐳 Docker</h4>
        ${status.dockerInstalled ? `
            <p style="color: #7ee787;">✅ Installed</p>
            ${status.nvidiaDockerInstalled ? `<p style="color: #7ee787;">✅ NVIDIA Toolkit (GPU)</p>` : `<p style="color: #8b949e; font-size: 0.9em;">No NVIDIA Toolkit.</p>`}
            <button type="button" onclick="recheckDocker(this)" style="margin-top: 0.5rem;" class="btn secondary small-btn">🔄 Recheck</button>
            <span id="docker-recheck-status" style="margin-left: 0.5rem;"></span>
        ` : `
            <p style="color: #f0a030; margin-bottom: 0.5rem;">⚠️ Not installed</p>
            <p style="color: #8b949e; font-size: 0.85em; margin-bottom: 0.5rem;">Required for WhisperX transcription.</p>
            <details style="margin-bottom: 0.5rem;"><summary style="cursor:pointer;color:#58a6ff;font-size:0.85em;">🍎 macOS</summary><div style="padding:0.5rem 0 0 1rem;"><code style="background:#0a0a0a;padding:0.3rem 0.5rem;border-radius:4px;display:block;font-size:0.85em;">brew install --cask docker</code></div></details>
            <details style="margin-bottom: 0.5rem;"><summary style="cursor:pointer;color:#58a6ff;font-size:0.85em;">🐧 Linux</summary><div style="padding:0.5rem 0 0 1rem;"><code style="background:#0a0a0a;padding:0.3rem 0.5rem;border-radius:4px;display:block;font-size:0.85em;">curl -fsSL https://get.docker.com | sh</code></div></details>
            <button type="button" onclick="recheckDocker(this)" style="margin-top: 0.5rem;" class="btn secondary small-btn">🔄 Recheck</button>
            <span id="docker-recheck-status" style="margin-left: 0.5rem;"></span>
        `}
    `;

    // --- Paths modal content ---
    const pathsContent = `
        <form action="/storage" method="POST">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <label for="path-auth">Auth Directory</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="path-auth" name="auth" value="${config.auth}" placeholder="./auth" style="flex: 1;" />
                        <button type="button" onclick="pickFolder('path-auth', this)" class="btn secondary small-btn" title="Browse...">📂</button>
                    </div>
                    <p class="help">Sessions & tokens</p>
                </div>
                <div>
                    <label for="path-logs">Logs Directory</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="path-logs" name="logs" value="${config.logs}" placeholder="./logs" style="flex: 1;" />
                        <button type="button" onclick="pickFolder('path-logs', this)" class="btn secondary small-btn" title="Browse...">📂</button>
                    </div>
                    <p class="help">Collection logs</p>
                </div>
                <div>
                    <label for="path-raw">Raw Dumps Directory</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="path-raw" name="rawDumps" value="${config.rawDumps}" placeholder="./raw-dumps" style="flex: 1;" />
                        <button type="button" onclick="pickFolder('path-raw', this)" class="btn secondary small-btn" title="Browse...">📂</button>
                    </div>
                    <p class="help">Raw API data</p>
                </div>
                <div>
                    <label for="path-connector-data">Connector Data Directory</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="path-connector-data" name="connectorData" value="${config.connectorData || './connector_data'}" placeholder="./connector_data" style="flex: 1;" />
                        <button type="button" onclick="pickFolder('path-connector-data', this)" class="btn secondary small-btn" title="Browse...">📂</button>
                    </div>
                    <p class="help">Processed output</p>
                </div>
            </div>
            <button type="submit" style="margin-top: 1rem;">💾 Save Storage Config</button>
        </form>
    `;

    return {
        cards: `
    <button class="sys-card" onclick="openSysModal('sys-modal-updates')">
        <span class="sys-icon">🔄</span>
        Updates
        ${updateBadge}
    </button>
    <button class="sys-card" onclick="openSysModal('sys-modal-deps')">
        <span class="sys-icon">🔧</span>
        Dependencies
        ${depBadge}
    </button>
    <button class="sys-card" onclick="openSysModal('sys-modal-paths')">
        <span class="sys-icon">📁</span>
        Paths
        ${pathsBadge}
    </button>`,
        modals: `
<div class="sys-modal-overlay" id="sys-modal-updates" onclick="if(event.target===this)closeSysModal(this.id)">
    <div class="sys-modal">
        <div class="sys-modal-header">
            <span>🔄 Updates</span>
            <button class="btn small-btn secondary" onclick="closeSysModal('sys-modal-updates')">✕</button>
        </div>
        <div class="sys-modal-body">${updatesContent}</div>
    </div>
</div>
<div class="sys-modal-overlay" id="sys-modal-deps" onclick="if(event.target===this)closeSysModal(this.id)">
    <div class="sys-modal">
        <div class="sys-modal-header">
            <span>🔧 Dependencies</span>
            <button class="btn small-btn secondary" onclick="closeSysModal('sys-modal-deps')">✕</button>
        </div>
        <div class="sys-modal-body">${depsContent}</div>
    </div>
</div>
<div class="sys-modal-overlay" id="sys-modal-paths" onclick="if(event.target===this)closeSysModal(this.id)">
    <div class="sys-modal">
        <div class="sys-modal-header">
            <span>📁 Storage Paths</span>
            <button class="btn small-btn secondary" onclick="closeSysModal('sys-modal-paths')">✕</button>
        </div>
        <div class="sys-modal-body">${pathsContent}</div>
    </div>
</div>`
    };
}

export function renderPluginsDivider(): string {
    return `
<h2 style="color: #58a6ff; font-size: 1.25rem; font-weight: 700; margin: 2rem 0 1rem 0;">
    Installed Plugins
</h2>
`;
}
