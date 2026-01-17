# Agent Instructions

## Critical Files - DO NOT DELETE

### `auth/` directory
Contains WhatsApp session credentials and GitHub tokens. **Never delete, modify, or commit these files.**

- `auth/whatsapp-session.json` - WhatsApp session (QR code login). If deleted, user must re-scan QR code.
- `auth/github-token.json` - GitHub PAT for syncing data.

### Why this matters
The WhatsApp session file contains encryption keys from the Signal protocol. Losing it breaks the device link and requires manual re-authentication via QR code scan on the user's phone.

## Commands
```bash
npm run config   # Setup WhatsApp QR + GitHub token (webapp)
npm run get      # Collect raw data from WhatsApp
npm run process  # Generate output & sync to GitHub
npm run sync     # Shortcut for get + process
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
