// Popup script for URL Tracker - Minimal, Auto-sync version

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadSettings();
    checkServerStatus();
    setupEventListeners();
});

function loadStats() {
    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
        if (response) {
            document.getElementById('totalCount').textContent = formatNumber(response.total);
            document.getElementById('todayCount').textContent = formatNumber(response.today);
            document.getElementById('syncedCount').textContent = formatNumber(response.synced || 0);
            renderRecentUrls(response.recentUrls);
        }
    });
}

function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        if (response) {
            document.getElementById('apiKeyInput').value = response.settings.apiKey || '';
            document.getElementById('serverUrlInput').value = response.settings.serverUrl || 'http://localhost:3457/api/chrome-history';

            // Show settings panel if API key not set
            if (!response.settings.apiKey) {
                document.getElementById('settingsPanel').open = true;
                document.getElementById('apiKeyHelp').textContent = '⚠️ Please paste your API key from the config page';
                document.getElementById('apiKeyHelp').style.color = '#f0a030';
            }
        }
    });
}

async function checkServerStatus() {
    const statusEl = document.getElementById('connectionStatus');
    const iconEl = document.getElementById('statusIcon');
    const titleEl = document.getElementById('statusTitle');
    const detailEl = document.getElementById('statusDetail');

    try {
        const { settings } = await chrome.storage.local.get('settings');

        if (!settings || !settings.apiKey) {
            statusEl.className = 'connection-status warning';
            iconEl.textContent = '⚠️';
            titleEl.textContent = 'API key not configured';
            detailEl.textContent = 'Open Settings below';
            return;
        }

        // Extract base URL
        const baseUrl = settings.serverUrl.replace('/api/chrome-history', '');

        const response = await fetch(`${baseUrl}/ping`, {
            method: 'GET',
            headers: { 'X-API-Key': settings.apiKey }
        });

        if (response.ok) {
            statusEl.className = 'connection-status connected';
            iconEl.textContent = '✅';
            titleEl.textContent = 'Connected to server';
            detailEl.textContent = 'URLs sync automatically';
        } else if (response.status === 401) {
            statusEl.className = 'connection-status error';
            iconEl.textContent = '🔑';
            titleEl.textContent = 'Invalid API key';
            detailEl.textContent = 'Check Settings below';
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        statusEl.className = 'connection-status error';
        iconEl.textContent = '❌';
        titleEl.textContent = 'Server not reachable';
        detailEl.textContent = 'Run: npm run chrome:server';
    }
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

function renderRecentUrls(urls) {
    const list = document.getElementById('recentList');
    list.innerHTML = '';

    if (!urls || urls.length === 0) {
        list.innerHTML = '<li class="empty">No URLs tracked yet. Start browsing!</li>';
        return;
    }

    urls.forEach(entry => {
        const li = document.createElement('li');
        li.onclick = () => chrome.tabs.create({ url: entry.url });

        let domain = '';
        try {
            domain = new URL(entry.url).hostname;
        } catch {
            domain = entry.url;
        }

        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const syncIcon = entry.synced ? '✓' : '•';
        const syncClass = entry.synced ? 'synced' : 'pending';

        li.innerHTML = `
      <span class="url-sync ${syncClass}">${syncIcon}</span>
      <span class="url-time">${time}</span>
      <span class="url-title">${escapeHtml(entry.title)}</span>
      <span class="url-domain">${escapeHtml(domain)}</span>
    `;

        list.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupEventListeners() {
    // Toggle API key visibility
    document.getElementById('toggleApiKey').addEventListener('click', () => {
        const input = document.getElementById('apiKeyInput');
        const btn = document.getElementById('toggleApiKey');

        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
            btn.classList.add('visible');
        } else {
            input.type = 'password';
            btn.textContent = '👁️';
            btn.classList.remove('visible');
        }
    });

    // Auto-save API key on change (with debounce)
    let saveTimeout;
    document.getElementById('apiKeyInput').addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveSettings(), 500);
    });

    // Auto-save server URL on change
    document.getElementById('serverUrlInput').addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveSettings(), 500);
    });

    // Also save on blur
    document.getElementById('apiKeyInput').addEventListener('blur', saveSettings);
    document.getElementById('serverUrlInput').addEventListener('blur', saveSettings);
}

function saveSettings() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const serverUrl = document.getElementById('serverUrlInput').value.trim();
    const helpEl = document.getElementById('apiKeyHelp');

    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        const currentSettings = response?.settings || {};

        const newSettings = {
            ...currentSettings,
            apiKey: apiKey,
            serverUrl: serverUrl || 'http://localhost:3457/api/chrome-history'
        };

        chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: newSettings
        }, (updateResponse) => {
            if (updateResponse && updateResponse.success) {
                helpEl.textContent = '✓ Settings saved';
                helpEl.style.color = '#7ee787';
                setTimeout(() => {
                    helpEl.textContent = '';
                    checkServerStatus();
                }, 1500);
            }
        });
    });
}
