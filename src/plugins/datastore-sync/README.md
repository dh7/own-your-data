# Datastore Sync

Git add, commit, and push the entire `connector_data/` folder to GitHub.

## What it does

This plugin treats `connector_data/` as a standalone git repo and runs:

```
git add .
git commit -m "sync: update datastore 2026-02-09"
git push
```

It authenticates using the GitHub token from the gitstore config (`auth/github-token.json`).

## What it does NOT do

- It does **not** use the GitHub API to push files individually
- It does **not** process or transform any data
- It does **not** touch `raw-dumps/` — only `connector_data/`

## How it differs from per-plugin push

Each plugin (Twitter, WhatsApp, etc.) has its own `push.ts` that syncs individual MindCache `.md` files to GitHub via the GitStore API. This plugin instead pushes **everything** in `connector_data/` as a single git commit — including files that aren't MindCache format (images, JSON, etc.).

## Usage

```bash
npm run datastore-sync:push
```

## Config

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Enable/disable the plugin |
| `githubPath` | `connector_data` | Target path in the GitHub repo |
| `commitMessage` | `sync: update datastore {date}` | Commit message (`{date}` replaced with YYYY-MM-DD) |
