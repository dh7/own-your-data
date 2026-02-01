/**
 * Chrome History plugin template
 *
 * Renders the configuration UI section for Chrome History
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { ChromeHistoryPluginConfig, DEFAULT_CONFIG, API_KEY_PATH } from './config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Path to tunnel config
const TUNNEL_CONFIG_PATH = path.join(process.cwd(), 'auth', 'cloudflare-tunnel.json');

interface TunnelConfig {
    hostname?: string;
}

/**
 * Get the tunnel URL if configured
 */
function getTunnelUrl(): string | null {
    try {
        if (fs.existsSync(TUNNEL_CONFIG_PATH)) {
            const config: TunnelConfig = JSON.parse(fs.readFileSync(TUNNEL_CONFIG_PATH, 'utf8'));
            if (config.hostname) {
                return `https://${config.hostname}`;
            }
        }
    } catch { }
    return null;
}

/**
 * Generate or load API key
 */
function getOrCreateApiKey(): string {
    const keyPath = path.join(process.cwd(), API_KEY_PATH);

    try {
        if (fs.existsSync(keyPath)) {
            return fs.readFileSync(keyPath, 'utf8').trim();
        }
    } catch { }

    // Generate new key
    const newKey = crypto.randomBytes(32).toString('hex');

    // Ensure auth directory exists
    const authDir = path.dirname(keyPath);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    fs.writeFileSync(keyPath, newKey);
    console.log(`🔑 Generated new Chrome History API key`);

    return newKey;
}

/**
 * Render the Chrome History configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as ChromeHistoryPluginConfig;
    const folderName = cfg.folderName || DEFAULT_CONFIG.folderName;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const daysToSync = cfg.daysToSync || DEFAULT_CONFIG.daysToSync;
    const serverPort = cfg.serverPort || DEFAULT_CONFIG.serverPort;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;
    const intervalHours = cfg.intervalHours ?? DEFAULT_CONFIG.intervalHours;
    const randomMinutes = cfg.randomMinutes ?? DEFAULT_CONFIG.randomMinutes;

    // Get or create API key
    const apiKey = getOrCreateApiKey();

    // Check raw-dumps folder for history files
    const folderPath = path.join(process.cwd(), 'raw-dumps', folderName);
    let historyFiles: string[] = [];
    let totalUrls = 0;
    let latestDate = '';

    try {
        if (fs.existsSync(folderPath)) {
            historyFiles = fs.readdirSync(folderPath)
                .filter(f => f.endsWith('.json'))
                .sort()
                .reverse();

            // Count total URLs
            for (const file of historyFiles.slice(0, 7)) {
                const content = fs.readFileSync(path.join(folderPath, file), 'utf8');
                const urls = JSON.parse(content);
                totalUrls += urls.length;
            }

            if (historyFiles.length > 0) {
                latestDate = historyFiles[0].replace('.json', '');
            }
        }
    } catch { }

    const isActive = historyFiles.length > 0;

    // Check extension folder exists
    const extensionPath = path.join(__dirname, 'extension');
    const extensionExists = fs.existsSync(path.join(extensionPath, 'manifest.json'));

    // Get tunnel URL if configured
    const tunnelUrl = getTunnelUrl();
    const localServerUrl = `http://localhost:${serverPort}/api/chrome-history`;
    const tunnelServerUrl = tunnelUrl ? `${tunnelUrl}/chrome-history/api/chrome-history` : null;

    // Determine status
    let statusClass = 'pending';
    let statusText = '⚠️ Setup needed';

    if (isActive) {
        statusClass = 'connected';
        statusText = `✅ ${historyFiles.length} days tracked`;
    } else if (apiKey) {
        statusClass = 'warning';
        statusText = '⏳ Waiting for data';
    }

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">🌐</span>
        Chrome History
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <!-- Status -->
        <div style="margin-bottom: 1rem; padding: 1rem; border-radius: 6px; background: rgba(255, 255, 255, 0.05);">
            <div style="margin-bottom: 0.5rem; font-weight: bold;">Status:</div>
            <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 0.25rem;">
                    ${extensionExists ? '✅' : '❌'} Chrome extension ${extensionExists ? 'ready' : 'not found'}
                </li>
                <li style="margin-bottom: 0.25rem;">
                    ✅ API key generated
                </li>
                <li style="margin-bottom: 0.25rem;">
                    ${isActive ? '✅' : '⏳'} ${historyFiles.length} days of history saved
                </li>
                ${isActive ? `
                <li style="margin-bottom: 0.25rem;">
                    📊 ${totalUrls} URLs in last 7 days
                </li>
                <li>
                    📅 Latest: ${latestDate}
                </li>
                ` : ''}
            </ul>
        </div>

        <form action="/plugin/chrome-history" method="POST">
            <!-- Server Port (first) -->
            <h4 style="margin-bottom: 0.75rem; color: #aaa;">🖥️ Server</h4>
            <div style="margin-bottom: 1.5rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <label style="color: #aaa;">Receiver port:</label>
                    <input type="number" name="serverPort" value="${serverPort}" min="1024" max="65535" style="width: 100px;" />
                    <span style="color: #666; font-size: 0.85em;">Start with: <code>npm run chrome:server</code></span>
                </div>
            </div>

            <!-- Scheduling (like Instagram) -->
            <h4 style="margin-bottom: 0.75rem; color: #aaa;">⏰ GitHub Push Schedule</h4>
            <div class="schedule-row" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable scheduling
                </label>
                <div style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <span>Every</span>
                    <input type="number" name="intervalHours" value="${intervalHours}" min="1" max="168" style="width: 60px;" />
                    <span>hours</span>
                    <span style="color: #666; margin-left: 0.5rem;">±</span>
                    <input type="number" name="randomMinutes" value="${randomMinutes}" min="0" max="120" style="width: 60px;" />
                    <span>min</span>
                </div>
            </div>

            <h4 style="margin-bottom: 0.75rem; color: #aaa;">⚙️ Settings</h4>
            
            <div>
                <label for="chrome-folder-name">Raw Data Folder Name</label>
                <input type="text" id="chrome-folder-name" name="folderName"
                    value="${folderName}"
                    placeholder="chrome-history" />
                <p class="help">Folder in <code>raw-dumps/</code> for daily JSON files</p>
            </div>

            <div>
                <label for="chrome-github-path">GitHub Output Path</label>
                <input type="text" id="chrome-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="chrome-history" />
                <p class="help">Folder in your GitHub repo for synced history</p>
            </div>

            <div>
                <label for="chrome-days-sync">Days to Sync</label>
                <input type="number" id="chrome-days-sync" name="daysToSync"
                    value="${daysToSync}"
                    min="1" max="365" />
                <p class="help">Number of days of history to include in GitHub sync</p>
            </div>

            <button type="submit">💾 Save Chrome History Config</button>
        </form>

        <!-- Server URL Configuration -->
        <div style="margin-top: 1.5rem; padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px;">
            <h4 style="margin-bottom: 0.75rem; color: #79c0ff;">🔗 Server URL for Extension</h4>
            
            ${tunnelServerUrl ? `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a1a0a; border: 1px solid #2a4a2a; border-radius: 4px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: #7ee787; font-weight: 600;">🌐 Remote Access (via Tunnel)</span>
                    <button type="button" id="testTunnelBtn" onclick="testTunnel()" style="background: #238636; border: none; cursor: pointer; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8em;">🔍 Test</button>
                </div>
                <p style="color: #8b949e; font-size: 0.85em; margin-bottom: 0.5rem;">Use this URL when accessing from anywhere (other devices, laptops):</p>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <code id="tunnel-url" style="flex: 1; background: #161b22; padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; word-break: break-all; border: 1px solid #30363d;">${tunnelServerUrl}</code>
                    <button type="button" onclick="copyTunnelUrl(this)" style="background: #238636; border: none; cursor: pointer; color: white; padding: 8px 12px; border-radius: 4px; font-size: 0.85rem; white-space: nowrap;">📋 Copy</button>
                </div>
                <p id="tunnel-test-result" style="margin-top: 0.5rem; font-size: 0.85em;"></p>
            </div>
            ` : `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                <span style="color: #f0a030;">⚠️ No tunnel configured</span>
                <p style="color: #8b949e; font-size: 0.85em; margin-top: 0.5rem;">
                    Configure a tunnel in the <strong>Your Domain</strong> section for remote access.
                </p>
            </div>
            `}

            <div style="padding: 0.75rem; background: #0a0a1a; border: 1px solid #2a2a4a; border-radius: 4px;">
                <span style="color: #79c0ff; font-weight: 600;">🏠 Local Access</span>
                <p style="color: #8b949e; font-size: 0.85em; margin: 0.5rem 0;">Use this URL when the extension and server are on the same machine:</p>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <code id="local-url" style="flex: 1; background: #161b22; padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; word-break: break-all; border: 1px solid #30363d;">${localServerUrl}</code>
                    <button type="button" onclick="copyLocalUrl(this)" style="background: #238636; border: none; cursor: pointer; color: white; padding: 8px 12px; border-radius: 4px; font-size: 0.85rem; white-space: nowrap;">📋 Copy</button>
                </div>
            </div>
        </div>

        <!-- Instructions -->
        <details style="margin-top: 1.5rem; background: #0d1117; padding: 0.75rem; border-radius: 6px; border: 1px solid #30363d;" open>
            <summary style="cursor: pointer; color: #58a6ff; font-weight: 600;">📖 Setup Instructions</summary>
            
            <!-- Quick Setup (pre-configured) -->
            ${tunnelServerUrl ? `
            <div style="margin-top: 1rem; padding: 1rem; background: #0a1a0a; border: 1px solid #2a4a2a; border-radius: 6px;">
                <h5 style="color: #7ee787; margin-bottom: 0.75rem;">⚡ Quick Setup (Pre-configured)</h5>
                <ol style="margin-left: 1.5rem; color: #c9d1d9; line-height: 1.8;">
                    <li>
                        <a href="/chrome-extension-configured" style="color: #58a6ff; font-weight: 500;">⬇️ Download pre-configured extension</a>
                        <small style="color: #7ee787; margin-left: 0.5rem;">(API key + tunnel URL included!)</small>
                    </li>
                    <li>Unzip and load in Chrome (see manual steps below)</li>
                    <li>Done! Extension is ready to use 🎉</li>
                </ol>
            </div>
            ` : ''}
            
            <!-- Manual Setup -->
            <div style="margin-top: 1rem;">
                <h5 style="color: #8b949e; margin-bottom: 0.75rem;">${tunnelServerUrl ? '📝 Manual Setup (or customize settings)' : '📝 Setup Steps'}</h5>
                <ol style="margin-left: 1.5rem; color: #c9d1d9; line-height: 2;">
                    <li>
                        <a href="/zip?folder=src/plugins/chrome-history/extension&name=chrome-extension" style="color: #58a6ff; font-weight: 500;">⬇️ Download the extension .zip</a>
                    </li>
                    <li>Unzip the downloaded file</li>
                    <li>
                        Open Chrome → 
                        <code style="background: #161b22; padding: 2px 6px; border-radius: 3px;">chrome://extensions/</code>
                        <button type="button" id="copyUrlBtn" onclick="copyUrl()" style="background: #238636; border: none; cursor: pointer; color: white; padding: 4px 10px; border-radius: 4px; margin-left: 4px; font-size: 0.85em;" title="Copy URL">📋 Copy</button>
                        <small style="color: #8b949e; margin-left: 4px;">(paste in Chrome)</small>
                    </li>
                    <li>Enable <strong style="color: #f0f6fc;">Developer mode</strong> (top right toggle)</li>
                    <li>Click <strong style="color: #f0f6fc;">Load unpacked</strong> → select the unzipped folder</li>
                    <li>
                        <strong style="color: #f0f6fc;">Copy the API key:</strong>
                        <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 8px;">
                            <code id="chrome-api-key" style="flex: 1; background: #161b22; padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; word-break: break-all; border: 1px solid #30363d;">${apiKey}</code>
                            <button type="button" id="copyApiKeyBtn" onclick="copyApiKey()" style="background: #238636; border: none; cursor: pointer; color: white; padding: 8px 12px; border-radius: 4px; font-size: 0.85rem; white-space: nowrap;" title="Copy API key">📋 Copy</button>
                        </div>
                    </li>
                    <li>Open extension popup → ⚙️ <strong style="color: #f0f6fc;">Settings</strong> → Paste API key and Server URL</li>
                    <li>Start the server: <code style="background: #161b22; padding: 2px 6px; border-radius: 3px;">npm run chrome:server</code></li>
                    <li>Browse normally - URLs sync to GitHub automatically! 🎉</li>
                </ol>
            </div>
        </details>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run chrome:server</code> - Start receiver server (port ${serverPort})<br>
            <code>npm run chrome:push</code> - Manually sync to GitHub
        </p>

        <p style="margin-top: 1rem; font-size: 0.85rem;">
            💬 <a href="https://discord.gg/Er8SY365" target="_blank" style="color: #5865F2;">Join our Discord community</a> for help & feedback!
        </p>
    </div>
</details>

<script>
function copyUrl() {
    navigator.clipboard.writeText('chrome://extensions/').then(() => {
        const btn = document.getElementById('copyUrlBtn');
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        btn.style.background = '#1a7f37';
        setTimeout(() => {
            btn.innerHTML = original;
            btn.style.background = '#238636';
        }, 2000);
    });
}

function copyApiKey() {
    const keyEl = document.getElementById('chrome-api-key');
    const btn = document.getElementById('copyApiKeyBtn');
    navigator.clipboard.writeText(keyEl.innerText).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        btn.style.background = '#1a7f37';
        setTimeout(() => {
            btn.innerHTML = original;
            btn.style.background = '#238636';
        }, 2000);
    });
}

function copyTunnelUrl(btn) {
    const urlEl = document.getElementById('tunnel-url');
    navigator.clipboard.writeText(urlEl.innerText).then(() => {
        showCopied(btn);
    });
}

function copyLocalUrl(btn) {
    const urlEl = document.getElementById('local-url');
    navigator.clipboard.writeText(urlEl.innerText).then(() => {
        showCopied(btn);
    });
}

function showCopied(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.style.background = '#1a7f37';
    setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '#238636';
    }, 2000);
}

async function testTunnel() {
    const btn = document.getElementById('testTunnelBtn');
    const result = document.getElementById('tunnel-test-result');
    const tunnelUrl = document.getElementById('tunnel-url').innerText;
    const apiKey = document.getElementById('chrome-api-key').innerText;
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Testing...';
    result.innerHTML = '';
    
    try {
        // Use server-side proxy to avoid CORS issues
        const response = await fetch('/tunnel/test-chrome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tunnelUrl, apiKey })
        });
        
        const data = await response.json();
        
        if (data.success) {
            result.innerHTML = '<span style="color: #7ee787;">✅ Tunnel working! Connection successful.</span>';
        } else if (data.message.includes('API key')) {
            result.innerHTML = '<span style="color: #f0a030;">⚠️ ' + data.message + '</span>';
        } else {
            result.innerHTML = '<span style="color: #ff7b72;">❌ ' + data.message + '</span>';
        }
    } catch (e) {
        result.innerHTML = '<span style="color: #ff7b72;">❌ Test failed: ' + e.message + '</span>';
    }
    
    btn.disabled = false;
    btn.innerHTML = '🔍 Test';
}
</script>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): ChromeHistoryPluginConfig {
    return {
        enabled: body.enabled === 'on',
        intervalHours: parseInt(body.intervalHours) || DEFAULT_CONFIG.intervalHours,
        randomMinutes: parseInt(body.randomMinutes) || DEFAULT_CONFIG.randomMinutes,
        folderName: body.folderName || DEFAULT_CONFIG.folderName,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
        daysToSync: parseInt(body.daysToSync) || DEFAULT_CONFIG.daysToSync,
        serverPort: parseInt(body.serverPort) || DEFAULT_CONFIG.serverPort,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): ChromeHistoryPluginConfig {
    return { ...DEFAULT_CONFIG };
}
