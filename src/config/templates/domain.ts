/**
 * Your Domain section - Cloudflare Tunnel setup via API
 * 
 * Guides users through setting up a permanent public URL using Cloudflare API.
 */

import { TunnelConfigData, CloudflareCredentials } from '../../tunnel/config';

export interface DomainStatus {
    cloudflaredInstalled: boolean;
    credentialsConfigured: boolean;
    tunnelConfigured: boolean;
    tunnelRunning: boolean;
    tunnelUrl: string | null;
    tunnelConfig: TunnelConfigData | null;
}

export interface TunnelPluginInfo {
    pluginId: string;
    pluginName: string;
    pluginIcon: string;
    pathPrefix: string;
    port: number;
    routeCount: number;
}

/**
 * Render the Your Domain section
 */
export function renderDomainSection(
    status: DomainStatus,
    tunnelPlugins: TunnelPluginInfo[],
    justSaved: boolean = false
): { card: string; modal: string } {
    // Determine the current state
    let stateNumber = 1; // cloudflared not installed
    if (status.cloudflaredInstalled && !status.credentialsConfigured) stateNumber = 2;
    else if (status.cloudflaredInstalled && status.credentialsConfigured && !status.tunnelConfigured) stateNumber = 3;
    else if (status.cloudflaredInstalled && status.credentialsConfigured && status.tunnelConfigured && !status.tunnelRunning) stateNumber = 4;
    else if (status.cloudflaredInstalled && status.credentialsConfigured && status.tunnelConfigured && status.tunnelRunning) stateNumber = 5;

    // Status badge
    let statusBadge = '';
    if (stateNumber === 5 && status.tunnelUrl) {
        statusBadge = '<span class="status connected">🌐 Online</span>';
    } else if (stateNumber >= 3) {
        statusBadge = '<span class="status pending">⚙️ Setup</span>';
    } else {
        statusBadge = '<span class="status" style="background: #8b949e; color: white;">Optional</span>';
    }

    // Build plugin list
    const pluginListHtml = tunnelPlugins.length > 0 ? `
        <div style="margin-top: 1rem; padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px;">
            <h5 style="color: #79c0ff; margin-bottom: 0.75rem; font-size: 0.9em;">Plugins that can be accessed remotely:</h5>
            <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.85em;">
                <thead>
                    <tr style="border-bottom: 1px solid #30363d; color: #8b949e;">
                        <th style="padding: 0.4rem;">Plugin</th>
                        <th style="padding: 0.4rem;">Path</th>
                        <th style="padding: 0.4rem;">Routes</th>
                    </tr>
                </thead>
                <tbody>
                    ${tunnelPlugins.map(p => `
                        <tr>
                            <td style="padding: 0.4rem;">${p.pluginIcon} ${p.pluginName}</td>
                            <td style="padding: 0.4rem;"><code>${p.pathPrefix}/*</code></td>
                            <td style="padding: 0.4rem;">${p.routeCount} endpoints</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    ` : `
        <p style="color: #8b949e; font-size: 0.9em; margin-top: 1rem;">
            No plugins have remote access configured. Add a <code>tunnel</code> section to a plugin's manifest.json to enable it.
        </p>
    `;

    const cardBadge = stateNumber === 5
        ? '<span class="sys-badge green">Online</span>'
        : stateNumber >= 3
            ? '<span class="sys-badge orange">Setup</span>'
            : '<span class="sys-badge" style="background:#21262d;color:#8b949e;">Optional</span>';

    const card = `
    <button class="sys-card" onclick="openSysModal('sys-modal-domain')">
        <span class="sys-icon">🌍</span>
        Your Domain
        ${cardBadge}
    </button>`;

    const modal = `
<div class="sys-modal-overlay" id="sys-modal-domain" onclick="if(event.target===this)closeSysModal(this.id)">
    <div class="sys-modal" style="max-width:650px;">
        <div class="sys-modal-header">
            <span>🌍 Your Domain</span>
            <button class="btn small-btn secondary" onclick="closeSysModal('sys-modal-domain')">✕</button>
        </div>
        <div class="sys-modal-body">
            <p style="color: #8b949e; margin-bottom: 1rem; font-size:0.9em;">
                <strong>Optional:</strong> Set up a permanent public URL using Cloudflare Tunnel.
            </p>
            ${pluginListHtml}
            <hr style="margin: 1rem 0; border: none; border-top: 1px solid #30363d;" />
            ${renderStateContent(status, stateNumber)}
        </div>
    </div>
</div>`;

    return { card, modal };
}

function renderStateContent(status: DomainStatus, stateNumber: number): string {
    // State 1: cloudflared not installed
    if (stateNumber === 1) {
        return `
            <h4 style="color: #79c0ff; margin-bottom: 1rem;">Step 1: Install cloudflared</h4>
            <p style="color: #f0a030; margin-bottom: 0.5rem;">⚠️ cloudflared is not installed</p>
            <p style="color: #8b949e; font-size: 0.9em; margin-bottom: 1rem;">
                cloudflared is Cloudflare's tunnel client that creates secure connections.
            </p>
            <div style="padding: 1rem; background: #1a1a0a; border: 1px solid #4a4a2a; border-radius: 4px;">
                <button type="button" onclick="installCloudflared(this)" class="btn">
                    📦 Install cloudflared
                </button>
                <p id="cloudflared-install-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
            </div>
        `;
    }

    // State 2: Installed but no credentials
    if (stateNumber === 2) {
        return `
            <h4 style="color: #79c0ff; margin-bottom: 1rem;">Step 2: Connect Cloudflare Account</h4>
            <p style="color: #7ee787; margin-bottom: 1rem;">✅ cloudflared installed</p>
            
            ${renderPrerequisites()}
            
            <div style="margin-top: 1.5rem; padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px;">
                <h5 style="color: #c9d1d9; margin-bottom: 1rem;">Enter your Cloudflare credentials:</h5>
                
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Account ID</label>
                    <input type="text" id="cf-account-id" placeholder="e.g., 1a2b3c4d5e6f7g8h9i0j" style="width: 100%; max-width: 400px;" />
                    <p class="help">Found in your Cloudflare dashboard URL: dash.cloudflare.com/<strong>account-id</strong>/...</p>
                </div>
                
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Zone ID</label>
                    <input type="text" id="cf-zone-id" placeholder="e.g., 9k8l7m6n5o4p3q2r1s0t" style="width: 100%; max-width: 400px;" />
                    <p class="help">Found on your domain's overview page in Cloudflare dashboard (right sidebar)</p>
                </div>
                
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">API Token</label>
                    <input type="password" id="cf-api-token" placeholder="Your API token" style="width: 100%; max-width: 400px;" />
                    <p class="help">
                        <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" style="color: #58a6ff;">Create API Token →</a>
                        (needs "Cloudflare Tunnel: Edit" and "DNS: Edit" permissions)
                    </p>
                </div>
                
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button type="button" onclick="testCloudflareCredentials(this)" class="btn" style="background: #30363d;">
                        🔍 Test Connection
                    </button>
                    <button type="button" onclick="saveCloudflareCredentials(this)" class="btn">
                        💾 Save Credentials
                    </button>
                </div>
                <p id="cf-credentials-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
            </div>
        `;
    }

    // State 3: Credentials saved, no tunnel created
    if (stateNumber === 3) {
        return `
            <h4 style="color: #79c0ff; margin-bottom: 1rem;">Step 3: Create Your Tunnel</h4>
            <p style="color: #7ee787; margin-bottom: 0.5rem;">✅ cloudflared installed</p>
            <p style="color: #7ee787; margin-bottom: 1rem;">✅ Cloudflare connected</p>
            
            <div style="padding: 1rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px; margin-bottom: 1rem;">
                <p style="color: #c9d1d9; margin-bottom: 0.5rem;">
                    <strong>What happens next:</strong>
                </p>
                <p style="color: #8b949e; font-size: 0.9em; margin: 0;">
                    This will create a secure tunnel and a public URL for your plugins.
                    All plugins with tunnel routes will be accessible via path prefixes
                    (e.g., <code>api.yourdomain.com/chrome-history/*</code>).
                </p>
            </div>
            
            <div style="padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px;">
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Tunnel Name</label>
                    <input type="text" id="tunnel-name" value="secondbrain" placeholder="secondbrain" style="width: 100%; max-width: 300px;" />
                    <p class="help">A friendly identifier for your tunnel in Cloudflare dashboard</p>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #8b949e;">Subdomain</label>
                    <input type="text" id="tunnel-subdomain" value="api" placeholder="api" style="width: 100%; max-width: 300px;" />
                    <p class="help">
                        Your public base URL will be: <code><span id="subdomain-preview">api</span>.yourdomain.com</code><br/>
                        All plugins will be accessible under this URL via their path prefixes.
                    </p>
                </div>
                <button type="button" onclick="createTunnelViaApi(this)" class="btn">
                    🚀 Create Tunnel
                </button>
                <p id="tunnel-create-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
            </div>
        `;
    }

    // State 4: Tunnel created but not running
    if (stateNumber === 4 && status.tunnelConfig) {
        return `
            <h4 style="color: #79c0ff; margin-bottom: 1rem;">Your Domain Configuration</h4>
            <p style="color: #7ee787; margin-bottom: 0.5rem;">✅ cloudflared installed</p>
            <p style="color: #7ee787; margin-bottom: 0.5rem;">✅ Cloudflare connected</p>
            <p style="color: #7ee787; margin-bottom: 1rem;">✅ Tunnel configured</p>
            
            <div style="padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; margin-bottom: 1rem;">
                <table style="width: 100%; font-size: 0.9em;">
                    <tr>
                        <td style="color: #8b949e; padding: 0.25rem 0;">Name:</td>
                        <td style="color: #c9d1d9;"><strong>${status.tunnelConfig.tunnelName}</strong></td>
                    </tr>
                    <tr>
                        <td style="color: #8b949e; padding: 0.25rem 0;">URL:</td>
                        <td><code style="color: #58a6ff;">https://${status.tunnelConfig.hostname}</code></td>
                    </tr>
                    <tr>
                        <td style="color: #8b949e; padding: 0.25rem 0;">Status:</td>
                        <td style="color: #f0a030;">⏸️ Stopped</td>
                    </tr>
                </table>
            </div>
            
            <p style="color: #8b949e; font-size: 0.9em; margin-bottom: 1rem;">
                💡 Start/stop the tunnel from the <strong>Services</strong> section above.
            </p>
            
            <button type="button" onclick="deleteTunnelViaApi(this)" class="btn" style="background: #da3633;">
                🗑️ Delete Tunnel Configuration
            </button>
            <p id="tunnel-action-status" style="margin-top: 0.5rem; font-size: 0.85em; color: #8b949e;"></p>
        `;
    }

    // State 5: Tunnel running
    if (stateNumber === 5 && status.tunnelConfig) {
        return `
            <h4 style="color: #79c0ff; margin-bottom: 1rem;">Your Domain Configuration</h4>
            <p style="color: #7ee787; margin-bottom: 1rem;">✅ Tunnel is running</p>
            
            <div style="padding: 1rem; background: #0a1a0a; border: 1px solid #2a4a2a; border-radius: 6px; margin-bottom: 1rem;">
                <p style="color: #7ee787; font-weight: bold; margin-bottom: 0.5rem;">🌐 Your Public URL:</p>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; font-size: 1.1em; color: #58a6ff;">
                        https://${status.tunnelConfig.hostname}
                    </code>
                    <button type="button" onclick="copyTunnelUrl('https://${status.tunnelConfig.hostname}')" class="btn small-btn">
                        📋 Copy
                    </button>
                </div>
            </div>
            
            <div style="padding: 1rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; margin-bottom: 1rem;">
                <table style="width: 100%; font-size: 0.9em;">
                    <tr>
                        <td style="color: #8b949e; padding: 0.25rem 0;">Name:</td>
                        <td style="color: #c9d1d9;"><strong>${status.tunnelConfig.tunnelName}</strong></td>
                    </tr>
                    <tr>
                        <td style="color: #8b949e; padding: 0.25rem 0;">Status:</td>
                        <td style="color: #7ee787;">🟢 Running</td>
                    </tr>
                </table>
            </div>
            
            <p style="color: #8b949e; font-size: 0.9em;">
                💡 Start/stop the tunnel from the <strong>Services</strong> section above.
            </p>
        `;
    }

    // Fallback
    return '<p style="color: #8b949e;">Unable to determine tunnel state.</p>';
}

function renderPrerequisites(): string {
    return `
        <div style="padding: 1rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px;">
            <h5 style="color: #f0a030; margin-bottom: 0.75rem;">📋 Prerequisites (one-time setup in Cloudflare)</h5>
            <ol style="color: #8b949e; font-size: 0.9em; margin: 0; padding-left: 1.25rem;">
                <li style="margin-bottom: 0.75rem;">
                    <strong>Cloudflare Account</strong> - 
                    <a href="https://dash.cloudflare.com/sign-up" target="_blank" style="color: #58a6ff;">Create free account →</a>
                </li>
                <li style="margin-bottom: 0.75rem;">
                    <strong>Domain in Cloudflare</strong> - Add your domain and update nameservers
                    <a href="https://developers.cloudflare.com/fundamentals/get-started/setup/add-site/" target="_blank" style="color: #58a6ff;">Guide →</a>
                </li>
                <li style="margin-bottom: 0.5rem;">
                    <strong>API Token</strong> - Create a scoped API token (NOT the Global API Key!)
                </li>
            </ol>
            
            <details style="margin-top: 1rem;">
                <summary style="color: #58a6ff; cursor: pointer; font-weight: 500;">📖 Step-by-step: How to create an API Token</summary>
                <div style="margin-top: 0.75rem; padding: 1rem; background: #0d1117; border-radius: 4px; font-size: 0.85em;">
                    <ol style="margin: 0; padding-left: 1.25rem; color: #c9d1d9;">
                        <li style="margin-bottom: 0.5rem;">
                            Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" style="color: #58a6ff;">Cloudflare API Tokens page →</a>
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Click <strong>"Create Token"</strong>
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Scroll down and click <strong>"Create Custom Token"</strong> → <strong>"Get started"</strong>
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Set a <strong>Token name</strong> (e.g., "SecondBrain Tunnel")
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Under <strong>Permissions</strong>, add these two:
                            <ul style="margin-top: 0.25rem; padding-left: 1rem; color: #7ee787;">
                                <li><code>Account</code> → <code>Cloudflare Tunnel</code> → <code>Edit</code></li>
                                <li><code>Zone</code> → <code>DNS</code> → <code>Edit</code></li>
                            </ul>
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Under <strong>Account Resources</strong>, select your account
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Under <strong>Zone Resources</strong>, select <strong>"Specific zone"</strong> → choose your domain
                        </li>
                        <li style="margin-bottom: 0.5rem;">
                            Click <strong>"Continue to summary"</strong> → <strong>"Create Token"</strong>
                        </li>
                        <li style="margin-bottom: 0;">
                            <strong style="color: #f0a030;">⚠️ Copy the token immediately!</strong> It won't be shown again.
                        </li>
                    </ol>
                </div>
            </details>
            
            <details style="margin-top: 0.75rem;">
                <summary style="color: #58a6ff; cursor: pointer; font-weight: 500;">📖 Where to find Account ID and Zone ID</summary>
                <div style="margin-top: 0.75rem; padding: 1rem; background: #0d1117; border-radius: 4px; font-size: 0.85em;">
                    <p style="color: #c9d1d9; margin-bottom: 0.75rem;"><strong>Account ID:</strong></p>
                    <ol style="margin: 0 0 1rem 0; padding-left: 1.25rem; color: #c9d1d9;">
                        <li>Go to <a href="https://dash.cloudflare.com" target="_blank" style="color: #58a6ff;">Cloudflare Dashboard</a></li>
                        <li>Click on your domain</li>
                        <li>Look at the URL: <code>dash.cloudflare.com/<strong style="color: #7ee787;">ACCOUNT_ID</strong>/...</code></li>
                        <li>Or scroll down on the right sidebar → "Account ID"</li>
                    </ol>
                    
                    <p style="color: #c9d1d9; margin-bottom: 0.75rem;"><strong>Zone ID:</strong></p>
                    <ol style="margin: 0; padding-left: 1.25rem; color: #c9d1d9;">
                        <li>Go to your domain's overview page in Cloudflare</li>
                        <li>Scroll down on the <strong>right sidebar</strong></li>
                        <li>Find <strong>"Zone ID"</strong> under "API" section</li>
                        <li>Click to copy</li>
                    </ol>
                </div>
            </details>
        </div>
    `;
}
