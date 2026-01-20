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
Local-first data connectors. Collect your conversations and contacts from various platforms and store them locally + optionally sync to your own GitHub repository.

## Connectors

| Connector | Status | Description |
|-----------|--------|-------------|
| WhatsApp | ✅ Working | Messages via Baileys |
| Twitter/X | ✅ Working | Tweets via Playwright |
| LinkedIn | 🚧 Planned | Messages & connections |
| Google Contacts | 🚧 Planned | Contact sync |

## Quick Start

```bash
npm install

# 1. Configure (once) - opens web UI
npm run config

# 2. WhatsApp workflow
npm run whatsapp:get      # Collect raw data
npm run whatsapp:process  # Generate MindCache

# 3. Twitter workflow
npm run twitter:get       # Scrape tweets + generate MindCache

# 4. Sync Everything
npm run push              # Sync all connector data to GitHub
```

## Project Structure

```
src/
  config/           # Shared config webapp
  shared/           # Shared utilities
  whatsapp/         # WhatsApp connector
  twitter/          # Twitter connector
  linkedin/         # LinkedIn connector
  google-contact/   # Google Contact connector

docs/               # Website (GitHub Pages)
auth/               # Session files (DO NOT DELETE)
logs/               # Logs per connector
raw-dumps/          # Raw API data per connector
connector_data/     # Processed MindCache output (whatsapp, twitter)
contacts/           # Synced contacts (flat)
```

## Philosophy

Your data belongs to you. These platforms hold your conversations, your contacts, your memories hostage. This project helps you take them back.

- **Local-first**: Everything is stored on your machine first
- **Raw dumps**: Keep the original API responses
- **GitHub backup**: Optional sync to your own repository
- **No cloud dependencies**: Works offline after initial setup

## Security Notes

- Session files in `auth/` are gitignored and contain encryption keys
- GitHub token is stored locally in `auth/github-token.json`
- Raw dumps contain your personal messages - keep them safe
- No data is sent anywhere except your own GitHub repo (if configured)

## License

ISC
