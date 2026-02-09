# GitHub Backup

Git add, commit, and push a local directory to the GitHub vault repo.

## How it works

1. Resolves `sourcePath` from config (absolute or relative to CWD)
2. Walks up from that path to find an existing `.git` repo
3. If found: uses that repo, `git add <relative-source-path>`
4. If not found: initializes a new repo at sourcePath
5. Sets remote to the vault URL (from GitStore config)
6. Commits and pushes

## Usage

```bash
npm run github-backup:push
```

## Config

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Enable/disable the plugin |
| `sourcePath` | `./connector_data` | Local directory to back up |
| `commitMessage` | `backup: {date}` | Commit message (`{date}` replaced with YYYY-MM-DD) |
