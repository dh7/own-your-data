# WhatsApp Connector

Collects messages from WhatsApp using the Baileys library.

## Commands

```bash
npm run whatsapp:get      # Collect raw data from WhatsApp
npm run whatsapp:process  # Generate local output
npm run whatsapp:push     # Sync to GitHub
```

## How it works

1. **Get**: Connects to WhatsApp, saves raw API responses to `raw-dumps/whatsapp/`
2. **Process**: Reads raw dumps, generates MindCache output to `conversations/`

## Auth

Session stored in `auth/whatsapp-session.json`. Run `npm run config` to scan QR code.

## Output

- Local: `conversations/whatsapp-YYYY-MM-DD.md`
- GitHub: `{repo}/{path}/whatsapp-YYYY-MM-DD.md`
