import { AppConfig, SchedulerCommand, SchedulerPluginConfig } from '../config/config';
import { DiscoveredPlugin } from '../plugins';

type PluginCommandName = 'get' | 'process' | 'push';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeFixedTime(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = clamp(parseInt(match[1], 10), 0, 23);
    const minutes = clamp(parseInt(match[2], 10), 0, 59);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function getAvailableCommands(plugin: DiscoveredPlugin): SchedulerCommand[] {
    const available: SchedulerCommand[] = [];
    (['get', 'process', 'push'] as PluginCommandName[]).forEach(cmd => {
        const script = plugin.manifest.commands[cmd];
        if (typeof script === 'string' && script.trim().length > 0) {
            available.push(cmd);
        }
    });
    return available;
}

export function getDefaultSchedulerPluginConfig(
    appConfig: AppConfig,
    plugin: DiscoveredPlugin
): SchedulerPluginConfig {
    const availableCommands = getAvailableCommands(plugin);
    const defaultCommands = (plugin.manifest.scheduler.cmd || []).filter(cmd => availableCommands.includes(cmd));
    const fallbackCommands = defaultCommands.length > 0 ? defaultCommands : availableCommands;

    const defaultStart = clamp(appConfig.daemon?.activeHours.start ?? 7, 0, 23);
    const defaultEnd = clamp(appConfig.daemon?.activeHours.end ?? 23, 1, 24);

    return {
        enabled: plugin.manifest.scheduler.mode !== 'manual',
        cadence: plugin.manifest.scheduler.mode === 'manual' ? 'fixed' : 'interval',
        startHour: defaultStart,
        endHour: defaultEnd,
        intervalHours: clamp(
            plugin.manifest.scheduler.defaultIntervalHours ?? 6,
            1,
            168
        ),
        jitterMinutes: clamp(
            plugin.manifest.scheduler.defaultRandomMinutes ?? 30,
            0,
            180
        ),
        fixedTimes: [],
        commands: fallbackCommands,
        autoStartServer: typeof plugin.manifest.commands.server === 'string' && plugin.manifest.commands.server.trim().length > 0,
        autoRestartServer: true,
    };
}

export function resolveSchedulerPluginConfig(
    appConfig: AppConfig,
    plugin: DiscoveredPlugin
): SchedulerPluginConfig {
    const existing = appConfig.schedulerConfig?.plugins?.[plugin.manifest.id];
    const pluginEnabled = appConfig.plugins?.[plugin.manifest.id]?.enabled;
    const defaults = getDefaultSchedulerPluginConfig(appConfig, plugin);
    const availableCommands = getAvailableCommands(plugin);

    const commands = (existing?.commands || defaults.commands).filter(cmd => availableCommands.includes(cmd));
    const fixedTimes = (existing?.fixedTimes || [])
        .map(normalizeFixedTime)
        .filter((value): value is string => Boolean(value));

    return {
        enabled: (existing?.enabled ?? defaults.enabled) && (pluginEnabled ?? true),
        cadence: existing?.cadence === 'fixed' ? 'fixed' : defaults.cadence,
        startHour: clamp(existing?.startHour ?? defaults.startHour, 0, 23),
        endHour: clamp(existing?.endHour ?? defaults.endHour, 1, 24),
        intervalHours: clamp(existing?.intervalHours ?? defaults.intervalHours, 1, 168),
        jitterMinutes: clamp(existing?.jitterMinutes ?? defaults.jitterMinutes, 0, 180),
        fixedTimes,
        commands: commands.length > 0 ? commands : defaults.commands,
        autoStartServer: existing?.autoStartServer ?? defaults.autoStartServer,
        autoRestartServer: existing?.autoRestartServer ?? defaults.autoRestartServer,
    };
}
