# Chrome History URL Tracker Extension

Part of the **Own Your Data** Chrome History plugin.

## Installation

### From the Config UI (Recommended)

1. Go to `npm run config`
2. Find the **Chrome History** plugin section
3. Click **Download .zip**
4. Unzip the downloaded file
5. Open Chrome → `chrome://extensions/`
6. Enable **Developer mode** (top right)
7. Click **Load unpacked** → select the unzipped folder
8. Copy the API key from the config page
9. Click extension icon → ⚙️ Settings → Paste API key → Save

### Manual Installation

1. Start the server: `npm run chrome:server`
2. Copy `src/plugins/chrome-history/extension/` to a separate folder
3. Follow steps 5-9 above

## Features

- 🔒 **Privacy-first**: All data stays local + your private GitHub
- 📊 **Statistics**: Total URLs, daily count, unique domains
- 💾 **Auto-save**: Daily at 11:55 PM
- 🚀 **Auto-push**: Syncs to GitHub after every save
- 📥 **Export**: Download as JSON anytime
- 🔑 **API Key**: Secure communication with server

## How It Works

```
Extension → localhost:3457 → raw-dumps/chrome-history/ → GitHub
```

1. Extension tracks all URLs you visit
2. Daily (or manual) save sends data to local server
3. Server saves to JSON files and pushes to GitHub
4. History is formatted as Markdown grouped by domain

## Files

- `manifest.json` - Chrome extension manifest
- `background.js` - Service worker for URL tracking
- `popup.html/js/css` - Extension popup UI
- `icons/` - Extension icons
