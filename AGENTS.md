# Agent Instructions

## Critical Files - DO NOT DELETE

### `auth/` directory
Contains session credentials and tokens for all connectors. **Never delete, modify, or commit these files.**

- `auth/whatsapp-session.json` - WhatsApp session (QR code login)
- `auth/github-token.json` - GitHub PAT for syncing data
- `auth/linkedin-*.json` - LinkedIn credentials (future)
- `auth/google-*.json` - Google OAuth credentials (future)

### Why this matters
The WhatsApp session file contains encryption keys from the Signal protocol. Losing it breaks the device link and requires manual re-authentication via QR code scan.

## Commands
```bash
npm run config            # Setup all connectors (webapp)

# WhatsApp
npm run whatsapp:get      # Collect raw data from WhatsApp
npm run whatsapp:process  # Generate local output
npm run whatsapp:push     # Sync to GitHub
```

## Project Structure
```
src/
  config/       # Shared config webapp + settings
  shared/       # Shared utilities (auth, etc.)
  whatsapp/     # WhatsApp connector
  linkedin/     # LinkedIn connector (placeholder)
  google-contact/  # Google Contact connector (placeholder)

auth/           # All auth files (DO NOT DELETE)
logs/           # Logs per connector (logs/whatsapp/, etc.)
raw-dumps/      # Raw API data per connector (raw-dumps/whatsapp/, etc.)
conversations/  # Processed messages (shared, flat)
contacts/       # Synced contacts (shared, flat)
```

## Safe Operations
- ✅ Edit source files in `src/`
- ✅ Update `package.json` dependencies
- ✅ Modify configuration logic
- ✅ Delete files in `logs/`
- ✅ Delete files in `raw-dumps/`

## Forbidden Operations
- ❌ Delete or modify anything in `auth/`
- ❌ Remove `auth/` from `.gitignore`
- ❌ Commit auth files or raw-dumps to git
