/**
 * Scheduler configuration helpers
 * 
 * Resolves plugin schedules from:
 * 1. New format: config/scheduler.json with tasks array
 * 2. Legacy format: embedded schedulerConfig in config.json
 */

import { 
    AppConfig, 
    SchedulerCommand, 
    SchedulerConfig, 
    SchedulerTask,
    loadSchedulerConfig 
} from '../config/config';
import { DiscoveredPlugin } from '../plugins';

// ============ TYPES ============

/**
 * Resolved schedule for a single plugin (used by daemon)
 */
export interface PluginSchedule {
    enabled: boolean;
    cadence: 'interval' | 'fixed';
    startHour: number;
    endHour: number;
    intervalHours: number;
    jitterMinutes: number;
    fixedTimes: string[];
    commands: SchedulerCommand[];
    autoStartServer: boolean;
    autoRestartServer: boolean;
}

/** @deprecated Use PluginSchedule instead */
export type SchedulerPluginConfig = PluginSchedule;

// ============ HELPERS ============

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

// ============ PUBLIC API ============

/**
 * Get available commands from a plugin's manifest
 */
export function getAvailableCommands(plugin: DiscoveredPlugin): SchedulerCommand[] {
    const available: SchedulerCommand[] = [];
    (['get', 'process', 'push'] as SchedulerCommand[]).forEach(cmd => {
        const script = plugin.manifest.commands[cmd];
        if (typeof script === 'string' && script.trim().length > 0) {
            available.push(cmd);
        }
    });
    return available;
}

/**
 * Find a task that includes this plugin in the scheduler config
 */
export function findTaskForPlugin(schedulerConfig: SchedulerConfig, pluginId: string): SchedulerTask | null {
    return schedulerConfig.tasks.find(task => task.plugins.includes(pluginId)) ?? null;
}

/**
 * Get default schedule from plugin manifest
 */
export function getDefaultPluginSchedule(
    schedulerConfig: SchedulerConfig,
    plugin: DiscoveredPlugin
): PluginSchedule {
    const availableCommands = getAvailableCommands(plugin);
    const manifestCommands = (plugin.manifest.scheduler?.cmd || []).filter(cmd => availableCommands.includes(cmd));
    const fallbackCommands = manifestCommands.length > 0 ? manifestCommands : availableCommands;

    const defaultStart = clamp(schedulerConfig.activeHours.start, 0, 23);
    const defaultEnd = clamp(schedulerConfig.activeHours.end, 1, 24);

    return {
        enabled: plugin.manifest.scheduler?.mode !== 'manual',
        cadence: plugin.manifest.scheduler?.mode === 'manual' ? 'fixed' : 'interval',
        startHour: defaultStart,
        endHour: defaultEnd,
        intervalHours: clamp(plugin.manifest.scheduler?.defaultIntervalHours ?? 6, 1, 168),
        jitterMinutes: clamp(plugin.manifest.scheduler?.defaultRandomMinutes ?? 30, 0, 180),
        fixedTimes: [],
        commands: fallbackCommands,
        autoStartServer: Boolean(plugin.manifest.commands.server?.trim()),
        autoRestartServer: true,
    };
}

/**
 * Get server config for a plugin from scheduler config
 */
export function getServerConfig(schedulerConfig: SchedulerConfig, pluginId: string): { autoStart: boolean; restartOnCrash: boolean } {
    const serverConfig = schedulerConfig.servers[pluginId];
    return {
        autoStart: serverConfig?.autoStart ?? false,
        restartOnCrash: serverConfig?.restartOnCrash ?? true,
    };
}

/**
 * Resolve the effective schedule for a plugin
 * Reads from config/scheduler.json tasks, falls back to manifest defaults
 */
export async function resolvePluginSchedule(plugin: DiscoveredPlugin): Promise<PluginSchedule> {
    const schedulerConfig = await loadSchedulerConfig();
    const task = findTaskForPlugin(schedulerConfig, plugin.manifest.id);
    const defaults = getDefaultPluginSchedule(schedulerConfig, plugin);
    const availableCommands = getAvailableCommands(plugin);
    const serverConfig = getServerConfig(schedulerConfig, plugin.manifest.id);

    // If no task found, return defaults
    if (!task) {
        return {
            ...defaults,
            autoStartServer: serverConfig.autoStart,
            autoRestartServer: serverConfig.restartOnCrash,
        };
    }

    // Task is manual (no scheduling)
    if (task.schedule === 'manual') {
        return {
            enabled: false,
            cadence: 'fixed',
            startHour: defaults.startHour,
            endHour: defaults.endHour,
            intervalHours: defaults.intervalHours,
            jitterMinutes: defaults.jitterMinutes,
            fixedTimes: [],
            commands: task.commands.filter(cmd => availableCommands.includes(cmd)),
            autoStartServer: serverConfig.autoStart,
            autoRestartServer: serverConfig.restartOnCrash,
        };
    }

    // Determine cadence
    const hasFixedTimes = task.fixedTimes && task.fixedTimes.length > 0;
    const cadence = hasFixedTimes ? 'fixed' : 'interval';

    // Normalize fixed times
    const fixedTimes = (task.fixedTimes || [])
        .map(normalizeFixedTime)
        .filter((value): value is string => Boolean(value));

    // Filter commands to only available ones
    const commands = task.commands.filter(cmd => availableCommands.includes(cmd));

    return {
        enabled: true,
        cadence,
        startHour: schedulerConfig.activeHours.start,
        endHour: schedulerConfig.activeHours.end,
        intervalHours: clamp(task.intervalHours ?? defaults.intervalHours, 1, 168),
        jitterMinutes: clamp(task.jitterMinutes ?? defaults.jitterMinutes, 0, 180),
        fixedTimes,
        commands: commands.length > 0 ? commands : defaults.commands,
        autoStartServer: serverConfig.autoStart,
        autoRestartServer: serverConfig.restartOnCrash,
    };
}

/**
 * @deprecated Use resolvePluginSchedule instead
 * Kept for backward compatibility with existing code
 */
export function resolveSchedulerPluginConfig(
    appConfig: AppConfig,
    plugin: DiscoveredPlugin
): PluginSchedule {
    // Legacy: read from embedded schedulerConfig
    const existing = appConfig.schedulerConfig?.plugins?.[plugin.manifest.id] as PluginSchedule | undefined;
    const pluginEnabled = appConfig.plugins?.[plugin.manifest.id]?.enabled;
    
    // Create defaults using activeHours from daemon config
    const defaultStart = clamp(appConfig.daemon?.activeHours.start ?? 7, 0, 23);
    const defaultEnd = clamp(appConfig.daemon?.activeHours.end ?? 23, 1, 24);
    const availableCommands = getAvailableCommands(plugin);
    const manifestCommands = (plugin.manifest.scheduler?.cmd || []).filter(cmd => availableCommands.includes(cmd));
    const fallbackCommands = manifestCommands.length > 0 ? manifestCommands : availableCommands;

    const defaults: PluginSchedule = {
        enabled: plugin.manifest.scheduler?.mode !== 'manual',
        cadence: plugin.manifest.scheduler?.mode === 'manual' ? 'fixed' : 'interval',
        startHour: defaultStart,
        endHour: defaultEnd,
        intervalHours: clamp(plugin.manifest.scheduler?.defaultIntervalHours ?? 6, 1, 168),
        jitterMinutes: clamp(plugin.manifest.scheduler?.defaultRandomMinutes ?? 30, 0, 180),
        fixedTimes: [],
        commands: fallbackCommands,
        autoStartServer: Boolean(plugin.manifest.commands.server?.trim()),
        autoRestartServer: true,
    };

    if (!existing) {
        return {
            ...defaults,
            enabled: defaults.enabled && (pluginEnabled ?? true),
        };
    }

    const commands = (existing.commands || defaults.commands).filter(cmd => availableCommands.includes(cmd));
    const fixedTimes = (existing.fixedTimes || [])
        .map(normalizeFixedTime)
        .filter((value): value is string => Boolean(value));

    return {
        enabled: (existing.enabled ?? defaults.enabled) && (pluginEnabled ?? true),
        cadence: existing.cadence === 'fixed' ? 'fixed' : defaults.cadence,
        startHour: clamp(existing.startHour ?? defaults.startHour, 0, 23),
        endHour: clamp(existing.endHour ?? defaults.endHour, 1, 24),
        intervalHours: clamp(existing.intervalHours ?? defaults.intervalHours, 1, 168),
        jitterMinutes: clamp(existing.jitterMinutes ?? defaults.jitterMinutes, 0, 180),
        fixedTimes,
        commands: commands.length > 0 ? commands : defaults.commands,
        autoStartServer: existing.autoStartServer ?? defaults.autoStartServer,
        autoRestartServer: existing.autoRestartServer ?? defaults.autoRestartServer,
    };
}

/**
 * @deprecated Use getDefaultPluginSchedule instead
 */
export function getDefaultSchedulerPluginConfig(
    appConfig: AppConfig,
    plugin: DiscoveredPlugin
): PluginSchedule {
    const defaultStart = clamp(appConfig.daemon?.activeHours.start ?? 7, 0, 23);
    const defaultEnd = clamp(appConfig.daemon?.activeHours.end ?? 23, 1, 24);
    const availableCommands = getAvailableCommands(plugin);
    const manifestCommands = (plugin.manifest.scheduler?.cmd || []).filter(cmd => availableCommands.includes(cmd));
    const fallbackCommands = manifestCommands.length > 0 ? manifestCommands : availableCommands;

    return {
        enabled: plugin.manifest.scheduler?.mode !== 'manual',
        cadence: plugin.manifest.scheduler?.mode === 'manual' ? 'fixed' : 'interval',
        startHour: defaultStart,
        endHour: defaultEnd,
        intervalHours: clamp(plugin.manifest.scheduler?.defaultIntervalHours ?? 6, 1, 168),
        jitterMinutes: clamp(plugin.manifest.scheduler?.defaultRandomMinutes ?? 30, 0, 180),
        fixedTimes: [],
        commands: fallbackCommands,
        autoStartServer: Boolean(plugin.manifest.commands.server?.trim()),
        autoRestartServer: true,
    };
}
