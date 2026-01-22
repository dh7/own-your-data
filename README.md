# Own Your Data

[**🌐 Live Website**](https://dh7.github.io/own-your-data/) | [**⭐ Star on GitHub**](https://github.com/dh7/own-your-data)

> ## ⚠️ EXPERIMENTAL - USE AT YOUR OWN RISK ⚠️
> 
> **This project uses unofficial APIs. Using it may result in your account being banned.**
> 
> The fact that you fear losing your account is telling a lot about how much of your own life you don't control already.
> 
> Do you fear losing your data? **OWN IT.**

---

**Own Your Data** sets your digital life free.
Local-first data connectors. Collect your conversations and posts from various platforms, store them locally, and optionally sync to your own GitHub repository.

## Plugins

| Plugin | Status | Description |
|--------|--------|-------------|
| 📸 Instagram | ✅ Working | Posts via Playwright |
| 🐦 Twitter/X | ✅ Working | Tweets via Playwright |
| 💬 WhatsApp | ✅ Working | Messages via Baileys (real-time) |
| 🔗 LinkedIn | 🚧 Planned | Messages & connections |
| 📇 Google Contacts | 🚧 Planned | Contact sync |

## Quick Start

```bash
npm install

# 1. Configure (opens web UI at http://localhost:3456)
npm run config

# 2. Start the daemon (runs all plugins on schedule)
npm run get_all
```

That's it! The daemon will automatically:
- Run each plugin's `get → process → push` commands on schedule
- Respect active hours (7:00 - 23:00)
- Add random delays to mimic human behavior

### Manual Commands

```bash
# Individual plugin commands
npm run twitter:get       # Fetch tweets
npm run twitter:process   # Generate MindCache
npm run twitter:push      # Sync to GitHub

npm run instagram:get     # Fetch posts (requires login first via config)
npm run instagram:process # Generate viewer + markdown
npm run instagram:push    # Sync to GitHub

npm run whatsapp:get      # Real-time listener (runs until Ctrl+C)
npm run whatsapp:process  # Process raw dumps
npm run whatsapp:push     # Sync to GitHub

# Batch commands
npm run process_all       # Process all plugins
npm run push_all          # Push all plugins to GitHub
```

## Project Structure

```
src/
  plugins/              # Plugin system
    instagram/          # 📸 Instagram plugin
    twitter/            # 🐦 Twitter plugin
    whatsapp/           # 💬 WhatsApp plugin
  config/               # Config web UI
  shared/               # Shared utilities

docs/                   # Website (GitHub Pages)
auth/                   # Session files (DO NOT DELETE)
logs/                   # Logs per plugin
raw-dumps/              # Raw API data per plugin
connector_data/         # Processed output (MindCache, viewers)
```

## Plugin Architecture

Each plugin is self-contained with:
- `manifest.json` - Metadata, scheduler config, commands
- `config.ts` - Plugin-specific configuration types
- `template.ts` - Config UI section
- `get.ts` - Fetch raw data
- `process.ts` - Process raw data into output formats
- `push.ts` - Sync to GitHub

### Config Format

```json
{
  "storage": { ... },
  "plugins": {
    "twitter": {
      "enabled": true,
      "intervalHours": 6,
      "randomMinutes": 30,
      "accounts": ["karpathy", "paulg"],
      "tweetsPerAccount": 100,
      "githubPath": "twitter"
    },
    "instagram": { ... },
    "whatsapp": { ... }
  }
}
```

## Philosophy

Your data belongs to you. These platforms hold your conversations, your contacts, your memories hostage. This project helps you take them back.

- **Local-first**: Everything is stored on your machine first
- **Raw dumps**: Keep the original API responses
- **GitHub backup**: Optional sync to your own private repository
- **No cloud dependencies**: Works offline after initial setup
- **Plugin architecture**: Easy to add new data sources

## Security Notes

- Session files in `auth/` are gitignored and contain encryption keys
- GitHub token is stored locally in `auth/github-token.json`
- Raw dumps contain your personal messages - keep them safe
- No data is sent anywhere except your own GitHub repo (if configured)

## License

ISC
