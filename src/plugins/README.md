# Plugin Design Contract

Plugins must be self-contained.

## Core Rule

Each plugin is responsible for its own behavior and should be runnable on its own.

- A plugin should work without the scheduler.
- A plugin should expose its own commands in `manifest.json` (for example: `get`, `process`, `push`, optional `server`).
- A plugin should keep plugin-specific logic and config inside its own folder.

## Scheduler Relationship

The scheduler orchestrates plugins. It does not define plugin internals.

- Scheduler reads plugin capabilities from plugin manifests/config.
- Scheduler triggers plugin commands.
- Scheduler may start/stop plugin services.
- Plugins must not depend on scheduler-specific behavior to function correctly.

## Practical Implication

If the scheduler is removed, each plugin should still be usable by directly running its commands.
