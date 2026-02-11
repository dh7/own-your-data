/**
 * Layout template - Base HTML structure with accordion container
 */

interface LayoutOptions {
    modals?: string[];
    initialPluginPanel?: string;
}

export function renderLayout(sections: string[], options: LayoutOptions = {}): string {
    const modalsHtml = options.modals?.join('\n') ?? '';
    const initialPluginPanel = options.initialPluginPanel ?? '';
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
        .status.warning { background: #9e6a03; color: white; }
        
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
        button.secondary,
        .btn.secondary {
            background: #30363d;
        }
        button.secondary:hover,
        .btn.secondary:hover {
            background: #484f58;
        }
        button.secondary:active,
        .btn.secondary:active {
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

        .btn.danger {
            background: #da3633;
        }
        .btn.danger:hover {
            background: #f85149;
        }
        .btn.danger:active {
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

        /* Plugin hub & modal styles */
        .plugin-panel {
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999;
        }
        .plugin-panel.active {
            display: flex;
        }
        .plugin-panel__overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
        }
        .plugin-panel__body {
            position: relative;
            width: min(90vw, 800px);
            max-height: 90vh;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 10px;
            padding: 1.5rem;
            box-shadow: 0 25px 40px rgba(0,0,0,0.45);
            overflow-y: auto;
            z-index: 1;
        }
        .plugin-panel__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1rem;
        }
        .plugin-panel__header h3 {
            margin: 0;
            color: #79c0ff;
        }
        .plugin-panel__content > details {
            margin: 0;
            border: none;
            background: transparent;
            overflow: visible;
        }
        .plugin-panel__content > details[open] {
            border: none;
        }
        .plugin-panel__content > details > summary {
            display: none;
        }
        .plugin-panel__content > details > .section-content {
            border-top: none;
            padding: 0;
        }
        body.modal-open {
            overflow: hidden;
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

        /* System card grid */
        .sys-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 0.75rem;
            margin-bottom: 0.5rem;
        }
        .sys-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.4rem;
            padding: 1.1rem 0.75rem;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
            text-align: center;
            font-family: inherit;
            color: #c9d1d9;
            font-size: 0.85rem;
            font-weight: 600;
        }
        .sys-card:hover { border-color: #58a6ff; background: #1c2333; }
        .sys-card .sys-icon { font-size: 1.4rem; }
        .sys-card .sys-badge {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 0.15rem 0.45rem;
            border-radius: 999px;
            margin-top: 0.15rem;
        }
        .sys-badge.green { background: #1a3a1a; color: #7ee787; }
        .sys-badge.orange { background: #3a2a0a; color: #f0a030; }
        .sys-badge.red { background: #3a1a1a; color: #ff7b72; }
        @media (max-width: 500px) {
            .sys-grid { grid-template-columns: 1fr; }
        }

        /* System modal overlay */
        .sys-modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0,0,0,0.7);
            justify-content: center;
            align-items: center;
        }
        .sys-modal-overlay.active { display: flex; }
        .sys-modal {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 12px;
            width: 90vw;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }
        .sys-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #30363d;
            color: #c9d1d9;
            font-weight: 600;
        }
        .sys-modal-body {
            overflow-y: auto;
            padding: 1.25rem;
            flex: 1;
            min-height: 0;
        }

        /* Folder browser modal */
        .folder-browser-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0,0,0,0.7);
            justify-content: center;
            align-items: center;
        }
        .folder-browser-overlay.active { display: flex; }
        .folder-browser {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 12px;
            width: 90vw;
            max-width: 500px;
            max-height: 70vh;
            display: flex;
            flex-direction: column;
        }
        .folder-browser-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #30363d;
            color: #c9d1d9;
            font-weight: 600;
        }
        .folder-browser-path {
            padding: 0.5rem 1rem;
            font-size: 0.78rem;
            color: #58a6ff;
            background: #161b22;
            border-bottom: 1px solid #30363d;
            word-break: break-all;
        }
        .folder-browser-list {
            overflow-y: auto;
            flex: 1;
            min-height: 0;
            padding: 0.25rem 0;
        }
        .folder-browser-list .fb-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 1rem;
            cursor: pointer;
            color: #c9d1d9;
            font-size: 0.85rem;
            border: none;
            background: none;
            width: 100%;
            text-align: left;
            font-family: inherit;
        }
        .folder-browser-list .fb-item:hover { background: #161b22; }
        .folder-browser-list .fb-item.fb-parent { color: #8b949e; }
        .folder-browser-footer {
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-top: 1px solid #30363d;
        }

        /* Log viewer modal */
        .log-viewer-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(0,0,0,0.7);
            justify-content: center;
            align-items: center;
        }
        .log-viewer-overlay.active {
            display: flex;
        }
        .log-viewer {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 12px;
            width: 90vw;
            max-width: 900px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }
        .log-viewer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #30363d;
            color: #c9d1d9;
            font-weight: 600;
        }
        .log-viewer-header .log-actions {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }
        .log-viewer-body {
            overflow-y: auto;
            padding: 1rem;
            flex: 1;
            min-height: 0;
        }
        .log-viewer-body pre {
            margin: 0;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.78rem;
            line-height: 1.5;
            color: #8b949e;
            white-space: pre-wrap;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Own your data <div class="header-actions"><a href="https://discord.gg/gpWGbfX5ZX" target="_blank" class="discord-btn">💬 Join Discord</a><button onclick="closeConfig()" class="close-btn">✕ Close</button></div></h1>
        ${sections.join('\n')}
    </div>
    ${modalsHtml}

    <div class="log-viewer-overlay" id="log-viewer-overlay" onclick="if(event.target===this)closeLogViewer()">
        <div class="log-viewer">
            <div class="log-viewer-header">
                <span id="log-viewer-title">Logs</span>
                <div class="log-actions">
                    <button class="btn small-btn secondary" onclick="refreshLogViewer()">Refresh</button>
                    <button class="btn small-btn secondary" onclick="closeLogViewer()">Close</button>
                </div>
            </div>
            <div class="log-viewer-body">
                <pre id="log-viewer-content">Loading...</pre>
            </div>
        </div>
    </div>

    <div class="folder-browser-overlay" id="folder-browser-overlay" onclick="if(event.target===this)closeFolderBrowser()">
        <div class="folder-browser">
            <div class="folder-browser-header">
                <span>📂 Select Folder</span>
                <button class="btn small-btn secondary" onclick="closeFolderBrowser()">✕</button>
            </div>
            <div class="folder-browser-path" id="fb-path">Loading...</div>
            <div class="folder-browser-list" id="fb-list"></div>
            <div class="folder-browser-footer">
                <button class="btn small-btn secondary" onclick="closeFolderBrowser()">Cancel</button>
                <button class="btn small-btn" onclick="selectCurrentFolder()">Select this folder</button>
            </div>
        </div>
    </div>

    <script>
    const INITIAL_PLUGIN_PANEL = '${initialPluginPanel}';

    // ---- Log Viewer ----
    let _logViewerServiceId = null;

    async function viewServiceLogs(serviceId) {
        _logViewerServiceId = serviceId;
        const overlay = document.getElementById('log-viewer-overlay');
        const title = document.getElementById('log-viewer-title');
        const content = document.getElementById('log-viewer-content');
        title.textContent = 'Loading...';
        content.textContent = 'Loading...';
        overlay.classList.add('active');
        await refreshLogViewer();
    }

    async function refreshLogViewer() {
        if (!_logViewerServiceId) return;
        const content = document.getElementById('log-viewer-content');
        const title = document.getElementById('log-viewer-title');
        try {
            const res = await fetch('/system/logs/' + encodeURIComponent(_logViewerServiceId));
            const data = await res.json();
            title.textContent = (data.file ? data.file + ' - ' : '') + _logViewerServiceId;
            content.textContent = data.logs || '(empty)';
            // Scroll to bottom
            content.parentElement.scrollTop = content.parentElement.scrollHeight;
        } catch (e) {
            content.textContent = 'Error loading logs: ' + (e.message || e);
        }
    }

    function closeLogViewer() {
        _logViewerServiceId = null;
        document.getElementById('log-viewer-overlay').classList.remove('active');
    }

    async function viewPluginLogs(pluginId) {
        const overlay = document.getElementById('log-viewer-overlay');
        const title = document.getElementById('log-viewer-title');
        const content = document.getElementById('log-viewer-content');
        title.textContent = pluginId + ' — Logs';
        content.textContent = 'Loading...';
        overlay.classList.add('active');
        _logViewerServiceId = null;
        try {
            const res = await fetch('/plugin/logs/' + encodeURIComponent(pluginId));
            const data = await res.json();
            title.textContent = (data.file ? data.file + ' — ' : '') + pluginId;
            content.textContent = data.logs || '(empty)';
            content.parentElement.scrollTop = content.parentElement.scrollHeight;
        } catch (e) {
            content.textContent = 'Error loading logs: ' + (e.message || e);
        }
    }

    // ---- Services Status Refresh (no full page reload) ----

    function buildActionButtons(service) {
        let html = (service.actions || []).map(function(entry) {
            const sc = entry.style === 'danger' ? ' danger' : entry.style === 'secondary' ? ' secondary' : '';
            return '<button type="button" class="btn small-btn' + sc + '" onclick="runServiceAction(\\''+service.id+'\\',\\''+entry.action+'\\',this)">' + entry.label + '</button>';
        }).join(' ');
        if (service.id !== 'config-server') {
            html += ' <button type="button" class="btn small-btn secondary" onclick="viewServiceLogs(\\''+service.id+'\\')">Logs</button>';
        }
        return html;
    }

    async function refreshServicesSection() {
        try {
            const res = await fetch('/system/services-status');
            const data = await res.json();
            if (!data.services) return;

            for (const svc of data.services) {
                const row = document.querySelector('tr[data-service-id="' + svc.id + '"]');
                if (!row) continue;

                // Update status
                const statusTd = row.querySelector('.svc-status');
                if (statusTd) {
                    statusTd.style.color = svc.running ? '#7ee787' : '#f85149';
                    statusTd.textContent = svc.running ? 'Running' : 'Stopped';
                }

                // Update detail
                const detailTd = row.querySelector('.svc-detail');
                if (detailTd) {
                    detailTd.textContent = svc.detail || '';
                }

                // Update actions
                const actionsTd = row.querySelector('.svc-actions');
                if (actionsTd) {
                    actionsTd.innerHTML = buildActionButtons(svc);
                }
            }
        } catch (e) {
            // Silently fail — server might be restarting
        }
    }

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
                    '<button class="btn small-btn" onclick="pullUpdates(this)" style="margin-top:0.5rem;">⬆️ Pull Updates</button>';
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
                statusEl.innerHTML = '✅ ' + data.message + '<br/><button onclick="restartConfig(this)" class="btn" style="margin-top: 0.5rem;">🔄 Restart Config Server</button>';
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
            // Server will exit — poll until it's back
            if (statusEl) statusEl.textContent = 'Waiting for server to restart...';
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts++;
                try {
                    const r = await fetch('/system/services-status');
                    if (r.ok) {
                        clearInterval(poll);
                        if (statusEl) { statusEl.textContent = '✅ Server restarted.'; statusEl.style.color = '#7ee787'; }
                        await refreshServicesSection();
                    }
                } catch { /* still restarting */ }
                if (attempts > 20) {
                    clearInterval(poll);
                    if (statusEl) { statusEl.textContent = '⚠️ Server may still be restarting. Try refreshing manually.'; statusEl.style.color = '#f0a030'; }
                }
            }, 1000);
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#f85149';
            }
            btn.disabled = false;
        }
    }
    
    async function startDaemon(btn) {
        const statusEl = document.getElementById('scheduler-daemon-status') || document.getElementById('restart-status');
        btn.disabled = true;
        if (statusEl) {
            statusEl.textContent = 'Starting daemon...';
            statusEl.style.color = '#f0a030';
        }
        
        try {
            const res = await fetch('/system/start-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (statusEl) {
                    statusEl.textContent = '✅ ' + data.message;
                    statusEl.style.color = '#7ee787';
                }
                setTimeout(() => refreshServicesSection(), 1500);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ ' + (data.error || 'Start failed');
                    statusEl.style.color = '#f85149';
                }
                btn.disabled = false;
            }
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#f85149';
            }
            btn.disabled = false;
        }
    }
    
    async function stopDaemon(btn) {
        const statusEl = document.getElementById('scheduler-daemon-status') || document.getElementById('restart-status');
        btn.disabled = true;
        if (statusEl) {
            statusEl.textContent = 'Stopping daemon...';
            statusEl.style.color = '#f0a030';
        }
        
        try {
            const res = await fetch('/system/stop-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (statusEl) {
                    statusEl.textContent = '✅ ' + data.message;
                    statusEl.style.color = '#7ee787';
                }
                setTimeout(() => refreshServicesSection(), 1500);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ ' + (data.error || 'Stop failed');
                    statusEl.style.color = '#f85149';
                }
                btn.disabled = false;
            }
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#f85149';
            }
            btn.disabled = false;
        }
    }
    
    async function restartDaemon(btn) {
        const statusEl = document.getElementById('scheduler-daemon-status') || document.getElementById('restart-status');
        btn.disabled = true;
        if (statusEl) {
            statusEl.textContent = 'Restarting daemon...';
            statusEl.style.color = '#f0a030';
        }
        
        try {
            const res = await fetch('/system/restart-daemon', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (statusEl) {
                    statusEl.textContent = '✅ ' + data.message;
                    statusEl.style.color = '#7ee787';
                }
                setTimeout(() => refreshServicesSection(), 2000);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ ' + (data.error || 'Restart failed');
                    statusEl.style.color = '#f85149';
                }
                btn.disabled = false;
            }
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#f85149';
            }
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
                statusEl.textContent = '✅ Playwright installed with browsers.';
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
                statusEl.textContent = '✅ ' + data.message;
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
                statusEl.textContent = '✅ Tunnel started!';
                statusEl.style.color = '#7ee787';
                setTimeout(() => refreshServicesSection(), 1500);
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
                statusEl.textContent = '✅ Tunnel stopped.';
                statusEl.style.color = '#7ee787';
                setTimeout(() => refreshServicesSection(), 1500);
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

    // ---- System Modals ----
    function openSysModal(id) {
        document.getElementById(id).classList.add('active');
    }
    function closeSysModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // ---- Folder Browser ----
    let _fbTargetInputId = null;
    let _fbCurrentPath = null;
    let _fbRelativePath = null;

    document.getElementById('fb-list').addEventListener('click', function(e) {
        const btn = e.target.closest('.fb-item');
        if (btn && btn.dataset.path) loadFolderBrowser(btn.dataset.path);
    });

    async function pickFolder(inputId, btn) {
        _fbTargetInputId = inputId;
        const input = document.getElementById(inputId);
        const startPath = input ? input.value : '';
        document.getElementById('folder-browser-overlay').classList.add('active');
        await loadFolderBrowser(startPath || '');
    }

    async function loadFolderBrowser(dirPath) {
        const listEl = document.getElementById('fb-list');
        const pathEl = document.getElementById('fb-path');
        listEl.innerHTML = '<div style="padding:1rem;color:#8b949e;">Loading...</div>';

        try {
            const res = await fetch('/system/list-dirs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirPath || '' })
            });
            const data = await res.json();
            if (!data.success) {
                listEl.innerHTML = '<div style="padding:1rem;color:#f85149;">Error: ' + (data.error || 'Unknown') + '</div>';
                return;
            }

            _fbCurrentPath = data.current;
            _fbRelativePath = data.relative;
            pathEl.textContent = data.current;

            const frag = document.createDocumentFragment();
            if (data.parent && data.parent !== data.current) {
                const el = document.createElement('button');
                el.className = 'fb-item fb-parent';
                el.dataset.path = data.parent;
                el.textContent = '⬆️ ..';
                frag.appendChild(el);
            }
            for (const d of data.dirs) {
                const el = document.createElement('button');
                el.className = 'fb-item';
                el.dataset.path = data.current + '/' + d;
                el.textContent = '📁 ' + d;
                frag.appendChild(el);
            }
            listEl.innerHTML = '';
            if (frag.childNodes.length) {
                listEl.appendChild(frag);
            } else {
                listEl.innerHTML = '<div style="padding:1rem;color:#8b949e;">Empty directory</div>';
            }
        } catch (e) {
            listEl.innerHTML = '<div style="padding:1rem;color:#f85149;">Failed to load</div>';
        }
    }

    function selectCurrentFolder() {
        if (_fbTargetInputId && _fbRelativePath != null) {
            const input = document.getElementById(_fbTargetInputId);
            if (input) {
                input.value = _fbRelativePath;
                input.dispatchEvent(new Event('change'));
            }
        }
        closeFolderBrowser();
    }

    function closeFolderBrowser() {
        document.getElementById('folder-browser-overlay').classList.remove('active');
        _fbTargetInputId = null;
    }

    function closeAllPluginPanels() {
        document.querySelectorAll('.plugin-panel.active').forEach(panel => {
            panel.classList.remove('active');
            panel.setAttribute('aria-hidden', 'true');
        });
        document.body.classList.remove('modal-open');
    }

    function openPluginPanel(id) {
        const panel = document.getElementById('plugin-panel-' + id);
        if (!panel) return;
        closeAllPluginPanels();
        panel.classList.add('active');
        panel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        panel.querySelectorAll('.plugin-panel__content > details').forEach(detail => detail.open = true);
    }

    function closePluginPanel(id) {
        const panel = document.getElementById('plugin-panel-' + id);
        if (!panel) return;
        panel.classList.remove('active');
        panel.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.plugin-panel.active')) {
            document.body.classList.remove('modal-open');
        }
    }

    function openSchedulerPanel(id) {
        const panel = document.getElementById('scheduler-panel-' + id);
        if (!panel) return;
        closeAllPluginPanels();
        panel.classList.add('active');
        panel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }

    function closeSchedulerPanel(id) {
        const panel = document.getElementById('scheduler-panel-' + id);
        if (!panel) return;
        panel.classList.remove('active');
        panel.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.plugin-panel.active')) {
            document.body.classList.remove('modal-open');
        }
    }

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Escape') {
            closeLogViewer();
            closeAllPluginPanels();
        }
    });

    if (INITIAL_PLUGIN_PANEL) {
        setTimeout(() => openPluginPanel(INITIAL_PLUGIN_PANEL), 300);
    }

    async function runServiceAction(serviceId, action, btn) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳';

        try {
            const endpoint = serviceId === 'config-server' && action === 'restart'
                ? '/system/restart-config'
                : '/system/service/' + encodeURIComponent(serviceId) + '/' + encodeURIComponent(action);
            const res = await fetch(endpoint, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || data.message || 'Action failed');
            }
            btn.textContent = '✅';
            setTimeout(() => refreshServicesSection(), 1500);
        } catch (e) {
            btn.disabled = false;
            btn.textContent = originalText;
            alert('Service action failed: ' + (e.message || e));
        }
    }

    async function runPluginCommand(pluginId, command, btn) {
        const statusEl = document.getElementById('run-status-' + pluginId);
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳';
        if (statusEl) statusEl.textContent = 'Running ' + command + '...';

        try {
            const res = await fetch('/scheduler/run/' + encodeURIComponent(pluginId) + '/' + encodeURIComponent(command), { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                btn.textContent = '✅';
                if (statusEl) statusEl.textContent = '✅ ' + command + ' completed';
                if (statusEl) statusEl.style.color = '#7ee787';
            } else {
                throw new Error(data.error || 'Command failed');
            }
        } catch (e) {
            btn.textContent = '❌';
            if (statusEl) statusEl.textContent = '❌ ' + (e.message || 'Failed');
            if (statusEl) statusEl.style.color = '#f85149';
        }
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        }, 2000);
    }

    async function runPluginCommandChain(pluginId, commands, btn) {
        const statusEl = document.getElementById('run-status-' + pluginId);
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳';

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            if (statusEl) {
                statusEl.textContent = '⏳ Running ' + command + ' (' + (i + 1) + '/' + commands.length + ')...';
                statusEl.style.color = '#d2a8ff';
            }
            try {
                const res = await fetch('/scheduler/run/' + encodeURIComponent(pluginId) + '/' + encodeURIComponent(command), { method: 'POST' });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || command + ' failed');
                }
            } catch (e) {
                btn.textContent = '❌';
                btn.disabled = false;
                if (statusEl) {
                    statusEl.textContent = '❌ ' + command + ': ' + (e.message || 'Failed');
                    statusEl.style.color = '#f85149';
                }
                setTimeout(() => { btn.textContent = originalText; }, 2000);
                return;
            }
        }

        btn.textContent = '✅';
        if (statusEl) {
            statusEl.textContent = '✅ All commands completed';
            statusEl.style.color = '#7ee787';
        }
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        }, 2000);
    }

    function syncSchedulerCadenceUi(pluginId) {
        const select = document.querySelector('.scheduler-cadence[data-plugin-id="' + pluginId + '"]');
        if (!select) return;
        const intervalBlock = document.getElementById('interval-settings-' + pluginId);
        const fixedBlock = document.getElementById('fixed-settings-' + pluginId);
        const isFixed = select.value === 'fixed';
        if (intervalBlock) intervalBlock.style.display = isFixed ? 'none' : 'grid';
        if (fixedBlock) fixedBlock.style.display = isFixed ? 'block' : 'none';
    }

    document.querySelectorAll('.scheduler-cadence').forEach(select => {
        const pluginId = select.getAttribute('data-plugin-id');
        if (!pluginId) return;
        syncSchedulerCadenceUi(pluginId);
        select.addEventListener('change', () => syncSchedulerCadenceUi(pluginId));
    });
    
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
                statusEl.textContent = '✅ ' + data.message;
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
                statusEl.textContent = '✅ ' + data.message;
                statusEl.style.color = '#7ee787';
                setTimeout(() => refreshServicesSection(), 1500);
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
                statusEl.textContent = '✅ Tunnel started!';
                statusEl.style.color = '#7ee787';
                setTimeout(() => refreshServicesSection(), 1500);
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
                statusEl.textContent = '✅ Tunnel deleted.';
                statusEl.style.color = '#7ee787';
                setTimeout(() => refreshServicesSection(), 1500);
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
                msg += ' Docker is ready.';
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
