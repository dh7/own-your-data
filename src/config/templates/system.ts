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
): string {
    const config = appConfig.storage;
    const allDepsGood = status.playwrightInstalled && status.browsersInstalled;

    let statusHtml = '';

    if (status.daemonRunning) {
        statusHtml = '<span class="status" style="background:rgb(6, 170, 6); color: white;">🔥 Running</span>';
    } else if (allDepsGood) {
        statusHtml = '<span class="status" style="background: #bd561d; color: white;">⏸ Ready</span>';
    } else {
        statusHtml = '<span class="status warning">⚠️ Dependency Missing</span>';
    }

    return `
<details${justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">⚙️</span>
        System
        ${statusHtml}
    </summary>
    <div class="section-content">
        <!-- Updates -->
        <h3 style="margin-bottom: 1rem; color: #58a6ff;">🔄 Updates</h3>
        
        <div style="display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
            <!-- Update Check -->
            <div style="flex: 1; min-width: 250px; padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px;">
                <h4 style="margin-bottom: 0.75rem; color: #79c0ff;">📦 Software Updates</h4>
                ${status.updateAvailable ? `
                    <p style="color: #f0a030; margin-bottom: 0.5rem;">
                        ⬆️ Update available! (${status.commitsBehind} commit${status.commitsBehind > 1 ? 's' : ''} behind)
                    </p>
                    <p style="color: #8b949e; font-size: 0.85em; margin-bottom: 0.75rem;">
                        Local: <code>${status.currentCommit.substring(0, 7)}</code> → Remote: <code>${status.remoteCommit.substring(0, 7)}</code>
                    </p>
                    <div style="display: flex; gap: 0.5rem;">
                        <button type="button" onclick="pullUpdates(this)" class="btn">
                            ⬇️ Pull Updates
                        </button>
                        <button type="button" onclick="checkForUpdates(this)" class="btn secondary small-btn">
                            🔍 Re-check
                        </button>
                    </div>
                    <p id="update-status" style="margin-top: 0.5rem; font-size: 0.85em;"></p>
                ` : `
                    <p style="color: #8b949e; margin-bottom: 0.5rem;">
                        Current: <code>${status.currentCommit.substring(0, 7)}</code>
                    </p>
                    <button type="button" onclick="checkForUpdates(this)" class="btn secondary small-btn">
                        🔍 Check for Updates
                    </button>
                    <p id="update-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;">
                        Click to check GitHub for new updates
                    </p>
                `}
            </div>
        </div>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

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
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                        <button type="button" onclick="window.open('http://' + window.location.hostname + ':8384', '_blank')" class="btn" style="text-decoration: none;">
                            🌐 Open Syncthing GUI
                        </button>
                        <button type="button" onclick="configureSyncthingRemote(this)" class="btn secondary">
                            🔓 Enable Remote Access
                        </button>
                    </div>
                    <p id="syncthing-config-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
                    <p style="margin-top: 0.5rem; font-size: 0.8em; color: #6e7681;">
                        💡 "Enable Remote Access" changes Syncthing to listen on 0.0.0.0 so you can access it from other machines.
                    </p>
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

        <!-- Docker -->
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #30363d;">
            <h4 style="margin-bottom: 0.75rem; color: #79c0ff;">🐳 Docker</h4>
            ${status.dockerInstalled ? `
                <p style="color: #7ee787;">✅ Docker installed</p>
                ${status.nvidiaDockerInstalled ? `
                    <p style="color: #7ee787;">✅ NVIDIA Container Toolkit installed (GPU support)</p>
                ` : `
                    <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                        💡 For GPU acceleration, install the NVIDIA Container Toolkit.
                    </p>
                `}
                <button type="button" onclick="recheckDocker(this)" style="margin-top: 0.75rem;" class="btn secondary small-btn">
                    🔄 Recheck
                </button>
                <span id="docker-recheck-status" style="margin-left: 0.5rem;"></span>
            ` : `
                <p style="color: #f0a030;">⚠️ Docker not installed</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                    Docker is used for running WhisperX transcription without complex local setup.
                </p>
                <div style="margin-top: 1rem; padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                    <p style="color: #f0a030; margin-bottom: 0.75rem;">Choose your platform:</p>
                    
                    <details style="margin-bottom: 0.75rem;">
                        <summary style="cursor: pointer; color: #58a6ff;">🍎 macOS</summary>
                        <div style="margin-top: 0.5rem; padding-left: 1rem;">
                            <p style="color: #8b949e; margin-bottom: 0.5rem;">Install Docker Desktop (includes GPU support for Apple Silicon):</p>
                            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block; margin-bottom: 0.5rem;">
                                brew install --cask docker
                            </code>
                            <p style="color: #8b949e; font-size: 0.85em;">
                                Or download from <a href="https://www.docker.com/products/docker-desktop/" target="_blank" style="color: #58a6ff;">docker.com</a>
                            </p>
                        </div>
                    </details>
                    
                    <details style="margin-bottom: 0.75rem;">
                        <summary style="cursor: pointer; color: #58a6ff;">🐧 Linux (CPU only)</summary>
                        <div style="margin-top: 0.5rem; padding-left: 1rem;">
                            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block; margin-bottom: 0.5rem; white-space: pre-wrap;">curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER</code>
                            <p style="color: #8b949e; font-size: 0.85em;">Log out and back in after adding yourself to the docker group.</p>
                        </div>
                    </details>
                    
                    <details>
                        <summary style="cursor: pointer; color: #58a6ff;">🐧 Linux + NVIDIA GPU</summary>
                        <div style="margin-top: 0.5rem; padding-left: 1rem;">
                            <p style="color: #8b949e; margin-bottom: 0.5rem;">1. Install Docker (if not already):</p>
                            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block; margin-bottom: 0.75rem;">
                                curl -fsSL https://get.docker.com | sh
                            </code>
                            <p style="color: #8b949e; margin-bottom: 0.5rem;">2. Install NVIDIA Container Toolkit:</p>
                            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block; white-space: pre-wrap; margin-bottom: 0.5rem;">curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code>
                            <p style="color: #8b949e; font-size: 0.85em; margin-top: 0.5rem;">
                                See <a href="https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html" target="_blank" style="color: #58a6ff;">NVIDIA docs</a> for other distros.
                            </p>
                        </div>
                    </details>
                    
                    <button type="button" onclick="recheckDocker(this)" style="margin-top: 1rem;" class="btn secondary">
                        🔄 Recheck
                    </button>
                    <span id="docker-recheck-status" style="margin-left: 0.5rem;"></span>
                </div>
            `}
        </div>

        <!-- WhisperX (via Docker) -->
        <div style="margin-top: 1.5rem; padding-top: 1rem;">
            ${status.dockerInstalled ? `
                <p style="color: #7ee787;">✅ WhisperX ready via Docker</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                    The transcripts plugin uses <code>ghcr.io/jim60105/whisperx</code>.
                    ${status.nvidiaDockerInstalled ? 'GPU acceleration available.' : 'Running in CPU mode.'}
                </p>
            ` : `
                <p style="color: #f0a030;">⚠️ WhisperX requires Docker</p>
                <p style="color: #8b949e; margin-top: 0.5rem; font-size: 0.9em;">
                    Install Docker above to enable audio transcription.
                </p>
            `}
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
                <div>
                    <label for="path-scheduler-logs">Scheduler Logs Directory</label>
                    <input type="text" id="path-scheduler-logs" name="schedulerLogs" value="${config.schedulerLogs || './logs/scheduler'}" placeholder="./logs/scheduler" />
                    <p class="help">Daily scheduler logs (one file per day)</p>
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
