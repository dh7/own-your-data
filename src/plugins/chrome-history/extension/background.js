// Background service worker for URL tracking
// Sends URLs to server in realtime as you browse

const STORAGE_KEY = 'visitedUrls';
const SETTINGS_KEY = 'settings';
const SYNCED_COUNT_KEY = 'syncedCount';

// Default settings
const DEFAULT_SETTINGS = {
    serverUrl: 'http://localhost:3457/api/chrome-history',
    apiKey: ''
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async () => {
    const result = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]);

    if (!result[STORAGE_KEY]) {
        await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    }

    if (!result[SETTINGS_KEY]) {
        await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }

    console.log('Own Your Data - URL Tracker installed');
});

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        trackAndSync(tab.url, tab.title);
    }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) {
            trackAndSync(tab.url, tab.title);
        }
    });
});

async function trackAndSync(url, title) {
    // Skip internal pages
    if (!url ||
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('edge://') ||
        url.startsWith('brave://')) {
        return;
    }

    const entry = {
        url: url,
        title: title || 'Untitled',
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        synced: false
    };

    // Get current state
    const result = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]);
    let urls = result[STORAGE_KEY] || [];
    const settings = result[SETTINGS_KEY] || DEFAULT_SETTINGS;

    // Check if last entry is same URL (avoid duplicates on page refresh)
    if (urls.length > 0 && urls[urls.length - 1].url === url) {
        // Update title if it changed
        if (urls[urls.length - 1].title !== title && title) {
            urls[urls.length - 1].title = title;
            urls[urls.length - 1].timestamp = entry.timestamp;
            await chrome.storage.local.set({ [STORAGE_KEY]: urls });
        }
        return;
    }

    // Add new entry
    urls.push(entry);

    // Keep only last 1000 entries locally
    if (urls.length > 1000) {
        urls = urls.slice(-1000);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: urls });
    console.log('Tracked:', url);

    // Try to sync immediately to server
    if (settings.apiKey) {
        syncToServer(entry, settings);
    }
}

async function syncToServer(entry, settings) {
    try {
        const urlsByDate = {
            [entry.date]: [entry]
        };

        const response = await fetch(settings.serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': settings.apiKey
            },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                urlsByDate: urlsByDate,
                totalCount: 1
            })
        });

        if (response.ok) {
            // Mark entry as synced
            const result = await chrome.storage.local.get([STORAGE_KEY, SYNCED_COUNT_KEY]);
            const urls = result[STORAGE_KEY] || [];
            const syncedCount = (result[SYNCED_COUNT_KEY] || 0) + 1;

            // Find and mark entry as synced
            const idx = urls.findIndex(u => u.timestamp === entry.timestamp && u.url === entry.url);
            if (idx >= 0) {
                urls[idx].synced = true;
                await chrome.storage.local.set({
                    [STORAGE_KEY]: urls,
                    [SYNCED_COUNT_KEY]: syncedCount
                });
            }

            console.log('✓ Synced:', entry.url);
        }
    } catch (error) {
        // Silent fail - will retry next time
        console.log('Sync pending:', entry.url);
    }
}

// Retry syncing unsynced entries periodically
chrome.alarms.create('retrySync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'retrySync') {
        await retrySyncUnsynced();
    }
});

async function retrySyncUnsynced() {
    const result = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]);
    const urls = result[STORAGE_KEY] || [];
    const settings = result[SETTINGS_KEY] || DEFAULT_SETTINGS;

    if (!settings.apiKey) return;

    const unsynced = urls.filter(u => !u.synced);
    if (unsynced.length === 0) return;

    console.log(`Retrying sync for ${unsynced.length} entries...`);

    // Group by date
    const urlsByDate = {};
    unsynced.forEach(entry => {
        if (!urlsByDate[entry.date]) {
            urlsByDate[entry.date] = [];
        }
        urlsByDate[entry.date].push(entry);
    });

    try {
        const response = await fetch(settings.serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': settings.apiKey
            },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                urlsByDate: urlsByDate,
                totalCount: unsynced.length
            })
        });

        if (response.ok) {
            // Mark all as synced
            const updatedUrls = urls.map(u => ({ ...u, synced: true }));
            const syncedCount = updatedUrls.filter(u => u.synced).length;
            await chrome.storage.local.set({
                [STORAGE_KEY]: updatedUrls,
                [SYNCED_COUNT_KEY]: syncedCount
            });
            console.log(`✓ Synced ${unsynced.length} entries`);
        }
    } catch (error) {
        console.log('Retry sync failed, will try again later');
    }
}

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStats') {
        chrome.storage.local.get([STORAGE_KEY, SYNCED_COUNT_KEY], (result) => {
            const urls = result[STORAGE_KEY] || [];
            const today = new Date().toISOString().split('T')[0];
            const todayCount = urls.filter(u => u.date === today).length;
            const syncedCount = urls.filter(u => u.synced).length;

            sendResponse({
                total: urls.length,
                today: todayCount,
                synced: syncedCount,
                recentUrls: urls.slice(-10).reverse()
            });
        });
        return true;
    }

    if (request.action === 'getSettings') {
        chrome.storage.local.get([SETTINGS_KEY], (result) => {
            sendResponse({
                settings: result[SETTINGS_KEY] || DEFAULT_SETTINGS
            });
        });
        return true;
    }

    if (request.action === 'updateSettings') {
        chrome.storage.local.set({ [SETTINGS_KEY]: request.settings }, async () => {
            // Try to sync any unsynced entries with new settings
            await retrySyncUnsynced();
            sendResponse({ success: true });
        });
        return true;
    }
});
