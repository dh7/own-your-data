/**
 * WhatsApp plugin template
 *
 * Renders the configuration UI section for WhatsApp
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { WhatsAppPluginConfig, DEFAULT_CONFIG } from './config';

/**
 * Render the WhatsApp configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as WhatsAppPluginConfig;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    const statusClass = data.isLoggedIn ? 'connected' : 'pending';
    const statusText = data.isLoggedIn ? '✅ Connected' :
        (data.status === 'checking' ? '🔍 Checking...' : '⏳ Scan QR');

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">💬</span>
        WhatsApp
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        ${data.isLoggedIn
            ? '<p style="color: #155724; font-weight: 500; margin-bottom: 1rem;">✅ WhatsApp is connected! Session saved.</p>'
            : `
                <div class="qr-container">
                    ${data.qrCode
                ? `<img src="${data.qrCode}" alt="WhatsApp QR Code" />`
                : '<p>⏳ Waiting for QR code from WhatsApp...</p>'
            }
                    <p class="help" style="margin-top: 1rem;">
                        Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                    </p>
                    <p class="help">
                        <a href="/" style="color: #667eea;">↻ Refresh page</a> if QR expired
                    </p>
                </div>
                <script>
                    // Auto-refresh while waiting for connection
                    setTimeout(() => location.reload(), 3000);
                </script>
            `
        }

        <!-- Note about realtime mode -->
        <div class="info-box" style="margin: 1.5rem 0; padding: 1rem; background: #2a2a1a; border: 1px solid #4a4a2a; border-radius: 4px;">
            <strong>📱 Real-time Listener</strong>
            <p style="margin: 0.5rem 0 0 0; color: #8b949e; font-size: 0.9rem;">
                WhatsApp runs as a real-time listener. It cannot be scheduled automatically.
            </p>
            <p style="margin: 0.5rem 0 0 0; color: #8b949e; font-size: 0.85rem;">
                Run <code>npm run whatsapp:get</code> separately to start collecting messages.
            </p>
        </div>

        <form action="/plugin/whatsapp" method="POST">
            <input type="hidden" name="enabled" value="${enabled ? 'on' : 'off'}" />

            <div>
                <label for="whatsapp-github-path">GitHub Output Path</label>
                <input type="text" id="whatsapp-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="whatsapp" />
                <p class="help">Folder in your GitHub repo</p>
            </div>
            <button type="submit">💾 Save WhatsApp Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #eee;" />

        <p style="color: #666; font-size: 0.9rem;">
            <strong>Commands:</strong><br>
            <code style="background: #f5f5f5; padding: 0.25rem 0.5rem; border-radius: 4px;">npm run whatsapp:get</code> - Collect messages<br>
            <code style="background: #f5f5f5; padding: 0.25rem 0.5rem; border-radius: 4px;">npm run whatsapp:process</code> - Process raw data<br>
            <code style="background: #f5f5f5; padding: 0.25rem 0.5rem; border-radius: 4px;">npm run whatsapp:push</code> - Sync to GitHub
        </p>
    </div>
</details>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): WhatsAppPluginConfig {
    return {
        enabled: body.enabled === 'on',
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): WhatsAppPluginConfig {
    return { ...DEFAULT_CONFIG };
}
