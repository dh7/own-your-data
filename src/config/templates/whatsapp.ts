/**
 * WhatsApp configuration section
 */

import { WhatsAppConfig } from '../config';

export interface WhatsAppData {
    connected: boolean;
    status: 'checking' | 'connected' | 'needs_qr';
    qrCode: string | null;
    config?: WhatsAppConfig;
}

export function renderWhatsAppSection(data: WhatsAppData, collapsed: boolean = true): string {
    const statusClass = data.connected ? 'connected' : 'pending';
    const statusText = data.connected ? '✅ Connected' :
        (data.status === 'checking' ? '🔍 Checking...' : '⏳ Scan QR');


    const githubPath = data.config?.githubPath || 'whatsapp';

    return `
<details>
    <summary>
        <span class="icon">💬</span>
        WhatsApp
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        ${data.connected
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
        
        <form action="/whatsapp" method="POST">
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
            <code style="background: #f5f5f5; padding: 0.25rem 0.5rem; border-radius: 4px;">npm run whatsapp:push</code> - Sync to GitHub
        </p>
    </div>
</details>
`;
}
