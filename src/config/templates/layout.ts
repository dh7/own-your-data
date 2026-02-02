/**
 * Layout template - Base HTML structure with accordion container
 */

export function renderLayout(sections: string[]): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Own your data - Config</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'JetBrains Mono', monospace;
            background: #0d1117;
            min-height: 100vh;
            padding: 2rem;
            color: #c9d1d9;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #58a6ff;
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .discord-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: #5865F2;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.15s ease;
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            user-select: none;
        }
        .discord-btn:hover {
            background: #4752c4;
            text-decoration: none;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        .discord-btn:active {
            transform: translateY(1px) scale(0.98);
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .close-btn {
            background: #da3633;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            user-select: none;
        }
        .close-btn:hover {
            background: #f85149;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        .close-btn:active {
            transform: translateY(1px) scale(0.98);
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        
        /* Accordion styles using details/summary */
        details {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            margin-bottom: 1rem;
            overflow: hidden;
        }
        details[open] {
            border-color: #58a6ff;
        }
        summary {
            padding: 1rem 1.5rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            color: #c9d1d9;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            list-style: none;
            user-select: none;
        }
        summary::-webkit-details-marker { display: none; }
        summary::before {
            content: '▶';
            font-size: 0.6rem;
            transition: transform 0.2s;
            color: #8b949e;
        }
        details[open] summary::before {
            transform: rotate(90deg);
            color: #58a6ff;
        }
        summary:hover {
            background: #21262d;
        }
        .section-content {
            padding: 1rem 1.5rem 1.5rem 1.5rem;
            border-top: 1px solid #30363d;
        }
        
        /* Status badges */
        .status {
            display: inline-block;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 600;
            margin-left: auto;
            text-transform: uppercase;
        }
        .status.connected { background: #238636; color: white; }
        .status.disconnected { background: #da3633; color: white; }
        .status.pending { background: #9e6a03; color: white; }
        
        /* Form styles */
        form { display: flex; flex-direction: column; gap: 1rem; }
        label {
            font-weight: 500;
            color: #8b949e;
            font-size: 0.875rem;
            margin-bottom: 0.25rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        input[type="text"], input[type="password"], select {
            width: 100%;
            padding: 0.6rem 0.75rem;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-size: 0.9rem;
            font-family: 'JetBrains Mono', monospace;
            background: #0d1117;
            color: #c9d1d9;
            transition: border-color 0.2s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #58a6ff;
        }
        input::placeholder {
            color: #484f58;
        }
        button {
            background: #238636;
            color: white;
            border: none;
            padding: 0.6rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            position: relative;
            user-select: none;
        }
        button:hover {
            background: #2ea043;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        button:active {
            transform: translateY(1px) scale(0.98);
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            transition: all 0.05s ease;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        button:disabled:hover {
            transform: none;
            box-shadow: none;
        }
        button:disabled:active {
            transform: none;
        }
        
        /* Secondary button style */
        button.secondary {
            background: #30363d;
        }
        button.secondary:hover {
            background: #484f58;
        }
        button.secondary:active {
            background: #21262d;
        }
        
        /* Danger button style */
        button.danger {
            background: #da3633;
        }
        button.danger:hover {
            background: #f85149;
        }
        button.danger:active {
            background: #b62324;
        }
        
        /* .btn class for non-button elements (like <a>) */
        .btn {
            display: inline-block;
            background: #238636;
            color: white;
            border: none;
            padding: 0.6rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            text-decoration: none;
            user-select: none;
        }
        .btn:hover {
            background: #2ea043;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            text-decoration: none;
        }
        .btn:active {
            transform: translateY(1px) scale(0.98);
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        
        /* Small button variant */
        .small-btn, button.small-btn {
            padding: 0.4rem 0.75rem;
            font-size: 0.75rem;
        }
        .help {
            font-size: 0.75rem;
            color: #8b949e;
            margin-top: 0.25rem;
        }
        .success {
            background: rgba(35, 134, 54, 0.15);
            border: 1px solid #238636;
            color: #7ee787;
            padding: 0.75rem 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }
        .error {
            background: rgba(218, 54, 51, 0.15);
            border: 1px solid #da3633;
            color: #f85149;
            padding: 0.75rem 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }
        .input-group {
            display: flex;
            gap: 0.5rem;
        }
        .input-group input, .input-group select { flex: 1; }
        .input-group button {
            padding: 0.6rem 0.75rem;
            font-size: 0.8rem;
            white-space: nowrap;
        }
        .small-btn {
            background: #30363d;
        }
        .small-btn:hover {
            background: #484f58;
        }
        .qr-container {
            text-align: center;
            padding: 1rem;
        }
        .qr-container img {
            max-width: 200px;
            border-radius: 8px;
            border: 2px solid #58a6ff;
        }
        .icon { font-size: 1rem; }
        
        /* Tags/chips for accounts */
        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .tag {
            background: #30363d;
            padding: 0.4rem 0.75rem;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: #58a6ff;
        }
        .tag button {
            background: none;
            border: none;
            color: #f85149;
            padding: 0;
            font-size: 0.9rem;
            cursor: pointer;
            line-height: 1;
        }
        .tag button:hover {
            background: none;
        }
        
        .password-container {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
        }
        .password-container input {
            padding-right: 2.5rem;
        }
        .toggle-password {
            position: absolute;
            right: 0.5rem;
            background: none;
            border: none;
            cursor: pointer;
            color: #8b949e;
            padding: 0;
            display: flex;
        }
        .toggle-password:hover {
            color: #58a6ff;
            background: none;
        }
        
        a {
            color: #58a6ff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        
        code {
            background: #30363d;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Own your data <div class="header-actions"><a href="https://discord.gg/gpWGbfX5ZX" target="_blank" class="discord-btn">💬 Join Discord</a><button onclick="closeConfig()" class="close-btn">✕ Close</button></div></h1>
        ${sections.join('\n')}
    </div>
    
    <script>
    async function closeConfig() {
        try {
            await fetch('/shutdown', { method: 'POST' });
        } catch (e) {
            // Server closed
        }
        window.close();
        setTimeout(() => {
            document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#7ee787;font-size:1.25rem;font-family:JetBrains Mono,monospace;"><div>> Config saved. You can close this tab.</div></div>';
        }, 100);
    }
    
    // ============ UPDATE & RESTART FUNCTIONS ============
    
    async function checkForUpdates(btn) {
        const statusEl = document.getElementById('update-status');
        if (!statusEl) {
            console.error('update-status element not found');
            alert('Error: Status element not found');
            return;
        }
        
        btn.disabled = true;
        statusEl.textContent = 'Checking for updates...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/system/check-updates');
            const data = await res.json();
            
            if (!data.fetchSucceeded) {
                // Fetch failed - warn user
                statusEl.innerHTML = '⚠️ Could not reach GitHub (SSH auth may be required).<br/>Run <code>ssh-add ~/.ssh/id_rsa</code> to add your key, or check network.';
                statusEl.style.color = '#f0a030';
            } else if (data.updateAvailable) {
                const localShort = data.currentCommit.substring(0, 7);
                const remoteShort = data.remoteCommit.substring(0, 7);
                statusEl.innerHTML = '⬆️ Update available! (' + data.commitsBehind + ' commits behind)<br/>' +
                    'Local: <code>' + localShort + '</code> → Remote: <code>' + remoteShort + '</code><br/>' +
                    '<a href="javascript:location.reload()">Refresh to see Pull button</a>';
                statusEl.style.color = '#f0a030';
            } else {
                const remoteShort = data.remoteCommit.substring(0, 7);
                statusEl.innerHTML = '✅ Up to date! Latest: <code>' + remoteShort + '</code>';
                statusEl.style.color = '#7ee787';
            }
            btn.disabled = false;
        } catch (e) {
            console.error('Check for updates failed:', e);
            statusEl.textContent = '❌ Check failed: ' + (e.message || e);
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    async function pullUpdates(btn) {
        const statusEl = document.getElementById('update-status');
        btn.disabled = true;
        statusEl.textContent = 'Pulling updates & installing dependencies (may take a minute)...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/system/pull-updates', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + '<br/><button onclick="restartConfig(this)" class="btn" style="margin-top: 0.5rem;">🔄 Restart to Apply</button>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Pull failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    async function restartConfig(btn) {
        const statusEl = document.getElementById('restart-status') || document.getElementById('update-status');
        btn.disabled = true;
        if (statusEl) {
            statusEl.textContent = 'Restarting config server...';
            statusEl.style.color = '#f0a030';
        }
        
        try {
            await fetch('/system/restart-config', { method: 'POST' });
            // Server will exit, wait and reload
            setTimeout(() => {
                if (statusEl) statusEl.textContent = 'Waiting for server to restart...';
                // Try to reload after a delay
                setTimeout(() => location.reload(), 3000);
            }, 500);
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#f85149';
            }
            btn.disabled = false;
        }
    }
    
    async function startDaemon(btn) {
        const statusEl = document.getElementById('restart-status');
        btn.disabled = true;
        statusEl.textContent = 'Starting daemon...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/system/start-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + ' <a href="javascript:location.reload()">Refresh</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Start failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    async function stopDaemon(btn) {
        const statusEl = document.getElementById('restart-status');
        btn.disabled = true;
        statusEl.textContent = 'Stopping daemon...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/system/stop-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + ' <a href="javascript:location.reload()">Refresh</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Stop failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    async function restartDaemon(btn) {
        const statusEl = document.getElementById('restart-status');
        btn.disabled = true;
        statusEl.textContent = 'Restarting daemon...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/system/restart-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + ' <a href="javascript:location.reload()">Refresh</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Restart failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    // ============ DEPENDENCY FUNCTIONS ============
    
    async function recheckPlaywright(btn) {
        const statusEl = document.getElementById('playwright-recheck-status');
        btn.disabled = true;
        statusEl.textContent = 'Checking...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/dependencies/check-playwright');
            const data = await res.json();
            
            if (data.installed && data.browsers) {
                statusEl.textContent = '✅ All good! Refresh page to update UI.';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ Still missing';
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ Check failed';
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    
    async function installSyncthing(btn) {
        const statusEl = document.getElementById('syncthing-install-status');
        btn.disabled = true;
        btn.textContent = '⏳ Installing...';
        statusEl.textContent = 'This may take a minute...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/dependencies/install-syncthing', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                const syncthingUrl = 'http://' + window.location.hostname + ':8384';
                statusEl.innerHTML = '✅ ' + data.message + ' <button onclick="window.open(\\'' + syncthingUrl + '\\', \\'_blank\\')" class="btn" style="margin-left:1rem;">🌐 Open Syncthing GUI</button>';
                statusEl.style.color = '#7ee787';
                btn.style.display = 'none';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Installation failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '📦 Install Syncthing';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '📦 Install Syncthing';
        }
    }
    
    async function configureSyncthingRemote(btn) {
        const statusEl = document.getElementById('syncthing-config-status');
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '⏳ Configuring...';
        statusEl.textContent = 'Updating Syncthing config...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/dependencies/configure-syncthing-remote', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (data.alreadyConfigured) {
                    statusEl.textContent = '✅ ' + data.message;
                } else {
                    statusEl.innerHTML = '✅ ' + data.message + '<br/>⚠️ <strong>Important:</strong> Set a password in Syncthing GUI → Actions → Settings → GUI';
                }
                statusEl.style.color = '#7ee787';
                btn.textContent = '✅ Remote Access Enabled';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Configuration failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = originalText;
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
    
    async function installCloudflared(btn) {
        const statusEl = document.getElementById('cloudflared-install-status');
        btn.disabled = true;
        btn.textContent = '⏳ Installing...';
        statusEl.textContent = 'This may take a minute...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/dependencies/install-cloudflared', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + ' <a href="javascript:location.reload()">Refresh page</a>';
                statusEl.style.color = '#7ee787';
                btn.style.display = 'none';
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Installation failed');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '📦 Install cloudflared';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '📦 Install cloudflared';
        }
    }
    
    async function startTunnel(btn) {
        const statusEl = document.getElementById('tunnel-status');
        btn.disabled = true;
        btn.textContent = '⏳ Starting tunnel...';
        statusEl.textContent = 'Starting proxy and cloudflared...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/start', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ Tunnel started! <a href="javascript:location.reload()">Refresh to see URL</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to start tunnel');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '▶️ Start Tunnel';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '▶️ Start Tunnel';
        }
    }
    
    async function stopTunnel(btn) {
        const statusEl = document.getElementById('tunnel-status');
        btn.disabled = true;
        btn.textContent = '⏳ Stopping...';
        
        try {
            const res = await fetch('/tunnel/stop', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ Tunnel stopped. <a href="javascript:location.reload()">Refresh page</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to stop tunnel');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '⏹️ Stop Tunnel';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '⏹️ Stop Tunnel';
        }
    }
    
    function copyTunnelUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    }
    
    // API-based tunnel functions for Your Domain section
    async function testCloudflareCredentials(btn) {
        const statusEl = document.getElementById('cf-credentials-status');
        const accountId = document.getElementById('cf-account-id').value.trim();
        const zoneId = document.getElementById('cf-zone-id').value.trim();
        const apiToken = document.getElementById('cf-api-token').value.trim();
        
        if (!accountId || !zoneId || !apiToken) {
            statusEl.textContent = '❌ Please fill in all credential fields';
            statusEl.style.color = '#f85149';
            return;
        }
        
        btn.disabled = true;
        btn.textContent = '⏳ Testing...';
        statusEl.textContent = 'Connecting to Cloudflare API...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/test-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, zoneId, apiToken })
            });
            const data = await res.json();
            
            if (data.success) {
                statusEl.textContent = '✅ ' + data.message;
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Connection failed');
                statusEl.style.color = '#f85149';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
        }
        btn.disabled = false;
        btn.textContent = '🔍 Test Connection';
    }
    
    async function saveCloudflareCredentials(btn) {
        const statusEl = document.getElementById('cf-credentials-status');
        const accountId = document.getElementById('cf-account-id').value.trim();
        const zoneId = document.getElementById('cf-zone-id').value.trim();
        const apiToken = document.getElementById('cf-api-token').value.trim();
        
        if (!accountId || !zoneId || !apiToken) {
            statusEl.textContent = '❌ Please fill in all credential fields';
            statusEl.style.color = '#f85149';
            return;
        }
        
        btn.disabled = true;
        btn.textContent = '⏳ Saving...';
        statusEl.textContent = 'Verifying and saving credentials...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/save-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, zoneId, apiToken })
            });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + '<br/><a href="javascript:location.reload()" class="btn small-btn" style="margin-top: 0.5rem; display: inline-block;">🔄 Reload to continue</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to save credentials');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '💾 Save Credentials';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '💾 Save Credentials';
        }
    }
    
    async function createTunnelViaApi(btn) {
        const statusEl = document.getElementById('tunnel-create-status');
        const nameInput = document.getElementById('tunnel-name');
        const subdomainInput = document.getElementById('tunnel-subdomain');
        
        const name = nameInput.value.trim();
        const subdomain = subdomainInput.value.trim();
        
        if (!name) {
            statusEl.textContent = '❌ Please enter a tunnel name';
            statusEl.style.color = '#f85149';
            return;
        }
        if (!subdomain) {
            statusEl.textContent = '❌ Please enter a subdomain';
            statusEl.style.color = '#f85149';
            return;
        }
        
        btn.disabled = true;
        btn.textContent = '⏳ Creating tunnel...';
        statusEl.textContent = 'Creating tunnel via Cloudflare API (this may take a moment)...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, subdomain })
            });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ ' + data.message + '<br/><a href="javascript:location.reload()" class="btn small-btn" style="margin-top: 0.5rem; display: inline-block;">🔄 Reload to continue</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to create tunnel');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '🚀 Create Tunnel';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '🚀 Create Tunnel';
        }
    }
    
    async function startTunnelWithToken(btn) {
        const statusEl = document.getElementById('tunnel-action-status');
        btn.disabled = true;
        btn.textContent = '⏳ Starting...';
        statusEl.textContent = 'Starting tunnel...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/start-token', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ Tunnel started!<br/><a href="javascript:location.reload()" class="btn small-btn" style="margin-top: 0.5rem; display: inline-block;">🔄 Reload to see status</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to start tunnel');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '▶️ Start Tunnel';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '▶️ Start Tunnel';
        }
    }
    
    async function deleteTunnelViaApi(btn) {
        if (!confirm('Are you sure you want to delete this tunnel? This will remove it from Cloudflare and cannot be undone.')) {
            return;
        }
        
        const statusEl = document.getElementById('tunnel-action-status');
        btn.disabled = true;
        btn.textContent = '⏳ Deleting...';
        statusEl.textContent = 'Deleting tunnel via Cloudflare API...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/tunnel/teardown', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                statusEl.innerHTML = '✅ Tunnel deleted.<br/><a href="javascript:location.reload()" class="btn small-btn" style="margin-top: 0.5rem; display: inline-block;">🔄 Reload page</a>';
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ ' + (data.message || 'Failed to delete tunnel');
                statusEl.style.color = '#f85149';
                btn.disabled = false;
                btn.textContent = '🗑️ Delete Tunnel';
            }
        } catch (e) {
            statusEl.textContent = '❌ ' + e.message;
            statusEl.style.color = '#f85149';
            btn.disabled = false;
            btn.textContent = '🗑️ Delete Tunnel';
        }
    }
    
    async function recheckDocker(btn) {
        const statusEl = document.getElementById('docker-recheck-status');
        btn.disabled = true;
        statusEl.textContent = 'Checking...';
        statusEl.style.color = '#f0a030';
        
        try {
            const res = await fetch('/dependencies/check-docker');
            const data = await res.json();
            
            if (data.dockerInstalled) {
                let msg = '✅ Docker installed!';
                if (data.nvidiaDockerInstalled) {
                    msg += ' (GPU support detected)';
                }
                msg += ' Refresh page to update UI.';
                statusEl.textContent = msg;
                statusEl.style.color = '#7ee787';
            } else {
                statusEl.textContent = '❌ Docker not detected';
                statusEl.style.color = '#f85149';
                btn.disabled = false;
            }
        } catch (e) {
            statusEl.textContent = '❌ Check failed';
            statusEl.style.color = '#f85149';
            btn.disabled = false;
        }
    }
    </script>
</body>
</html>
`;
}
