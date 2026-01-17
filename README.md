# WhatsApp Collector

Local-first WhatsApp message collector. Reads your daily conversations and saves them to GitHub via MindCache.

> ⚠️ **READ-ONLY**: This tool only reads messages. It never sends anything to WhatsApp.

## Quick Start

```bash
# Install dependencies
npm install

# 1. Configure (once) - opens web UI
npm run config

# 2. Collect messages (run manually or via cron)
npm run get
```

## Features

- 📱 **WhatsApp Web** connection via Baileys (WebSocket, lightweight)
- 🔄 **Incremental sync** - only fetches new messages
- 📁 **Per-person-per-day** storage: `john-doe-2026-01-17`
- 🐙 **GitHub backup** via MindCache GitStore
- 📝 **Log files** for each collection run
- 🐢 **Rate limiting** to avoid bans (random 2-5s delays)

## Setup

### 1. Configure WhatsApp & GitHub

```bash
npm run config
```

Opens `http://localhost:3456`:

1. **Scan QR code** with WhatsApp on your phone
2. **Enter GitHub details**:
   - Personal Access Token (with `repo` scope)
   - Repository owner/name
   - Folder path (e.g., `whatsapp`)

### 2. Collect Messages

```bash
npm run get
```

This will:
1. Load existing data from GitHub
2. Connect to WhatsApp
3. Fetch today's new messages
4. Save to GitHub with a commit

### 3. Automate with Cron

Run every hour:

```bash
0 * * * * cd /path/to/whatsapp_connector && npm run get >> /dev/null 2>&1
```

## Project Structure

```
whatsapp_connector/
├── src/
│   ├── config.ts         # Configuration types and utilities
│   ├── storage.ts        # MindCache + GitStore integration
│   ├── collector.ts      # WhatsApp message fetching
│   ├── config-server.ts  # Web UI for setup
│   └── get.ts            # Main collection script
├── auth/                 # Session files (gitignored)
├── logs/                 # Collection logs
└── package.json
```

## Data Format

Messages are stored in MindCache as markdown, one key per conversation per day:

**Key**: `john-doe-2026-01-17`  
**Value**:
```markdown
# John Doe - 2026-01-17

**10:30** John: Hey, how are you?
**10:32** Me: I'm good, thanks!
```

## Technologies

| Component | Library |
|-----------|---------|
| WhatsApp | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) |
| Storage | [mindcache](https://mindcache.dev) |
| GitHub Sync | [@mindcache/gitstore](https://www.npmjs.com/package/@mindcache/gitstore) |

## Logs

Each `npm run get` creates a log file in `logs/`:

```
logs/
├── collect-2026-01-17T10-30-00-000Z.log
├── collect-2026-01-17T14-00-00-000Z.log
└── ...
```

## Security Notes

- Session files in `auth/` are gitignored
- GitHub token is stored locally in `auth/github-token.json`
- No credentials are committed to the repository

## License

ISC
