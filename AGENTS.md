# Agent Instructions

## Critical Files - DO NOT DELETE

### `auth/` directory
Contains session credentials and tokens for all connectors. **Never delete, modify, or commit these files.**

- `auth/whatsapp-session.json` - WhatsApp session (QR code login)
- `auth/github-token.json` - GitHub PAT for syncing data
- Etc...

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


## Mindcache
Always use `mindcache.toMarkdown()` to generate md files. Do not write files directly.
