# Scheduler & Services Architecture

## Process Hierarchy

`npm run start` launches three top-level services:

```
start.ts
 ├── config server    (npm run config)     → port 3456
 ├── scheduler daemon (npm run scheduler)  → manages plugin servers + scheduled jobs
 └── tunnel server    (npm run tunnel)     → optional, if configured
```

Each can also be run standalone:

```bash
npm run config      # Config UI only
npm run scheduler   # Scheduler daemon only
npm run start       # All three
```

## Scheduler Daemon (`daemon.ts`)

The daemon runs a **tick loop every 30 seconds** that does two things:

1. **Server management** — For plugins with `autoStart: true` in `config/scheduler.json`, ensures their server process is running. Detects external processes, uses exponential backoff on crashes, and gives up after 5 fast failures.

2. **Job scheduling** — For plugins listed in `tasks`, runs their commands (`get`, `process`, `push`) based on cadence (interval + jitter, or fixed times) within active hours.

```
tick() every 30s
 ├── for each plugin:
 │   ├── if autoStartServer → ensurePluginServer()
 │   └── if scheduled job is due → runPluginJob()
 │       └── runs: get → process → push (sequential, stops on failure)
```

## Config Source of Truth

### `config/scheduler.json`

```json
{
  "activeHours": { "start": 7, "end": 23 },
  "servers": {
    "chrome-history": { "autoStart": true, "restartOnCrash": true },
    "whatsapp":       { "autoStart": true, "restartOnCrash": false }
  },
  "tasks": [
    {
      "plugins": ["twitter", "instagram"],
      "commands": ["get", "process", "push"],
      "intervalHours": 6,
      "jitterMinutes": 30
    }
  ]
}
```

- **`servers`** — Which plugin servers the daemon should auto-start and whether to restart on crash.
- **`tasks`** — Groups of plugins sharing the same schedule. Each task defines commands to run, interval, and jitter.
- **`activeHours`** — Jobs only run within this window.

Plugins not listed in `servers` default to `autoStart: false`. Plugins not listed in any task won't have scheduled jobs.

### Plugin `manifest.json`

Each plugin declares its available commands:

```json
{
  "id": "chrome-history",
  "commands": {
    "server": "ts-node src/plugins/chrome-history/server.ts",
    "push": "ts-node src/plugins/chrome-history/push.ts"
  },
  "scheduler": {
    "mode": "interval",
    "defaultIntervalHours": 24,
    "cmd": ["push"]
  }
}
```

The `scheduler` block in the manifest provides defaults if the plugin isn't explicitly configured in `scheduler.json`.

## Plugin Self-Containment

Every plugin is fully standalone. It can be run without the scheduler:

```bash
# Run servers directly
ts-node src/plugins/chrome-history/server.ts
ts-node src/plugins/whatsapp/get.ts

# Run jobs directly
npm run twitter:get
npm run twitter:process
npm run twitter:push
```

The scheduler is optional orchestration — it just automates what you could do manually.

## Graceful Shutdown

When `npm run start` receives SIGINT (Ctrl+C) or SIGTERM:

```
start.ts receives signal
 ├── SIGTERM → config server process
 ├── SIGTERM → scheduler daemon
 │   └── stopAllPluginServers()
 │       ├── SIGTERM → chrome-history server
 │       ├── SIGTERM → whatsapp server
 │       └── ... all managed plugin servers
 └── SIGTERM → tunnel server
```

The scheduler daemon also writes a PID file (`logs/scheduler.pid`) so other processes can detect if it's already running.

## Restart & Crash Recovery

The daemon tracks server health with exponential backoff:

- If a server exits within 10 seconds of starting → **fast crash**, backoff doubles (5s, 10s, 20s, 40s...)
- After 5 fast crashes → **gives up** (log error, don't retry)
- If a server runs for >10 seconds then crashes → reset failure count, restart normally
- External processes (started outside the daemon) are detected via `pgrep` and logged once

`start.ts` applies the same pattern to the config server (backoff + max 5 retries).

## Logging

All scheduler activity is written to daily log files in `logs/scheduler/YYYY-MM-DD.log`:

- Server stdout/stderr per plugin
- Command execution (start, output, end with duration)
- Scheduler lifecycle events

Per-plugin logs may also exist in `logs/{pluginId}/` for plugins that write their own logs (e.g., WhatsApp collector).
