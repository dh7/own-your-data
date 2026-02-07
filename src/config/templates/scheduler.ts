import { SchedulerCommand } from '../config';

export interface SchedulerServiceAction {
    action: 'start' | 'stop' | 'restart';
    label: string;
    style?: 'default' | 'danger' | 'secondary';
}

export interface SchedulerServiceStatus {
    id: string;
    name: string;
    icon?: string;
    running: boolean;
    description?: string;
    detail?: string;
    actions?: SchedulerServiceAction[];
}

export interface SchedulerPluginEditor {
    id: string;
    name: string;
    icon: string;
    enabled: boolean;
    cadence: 'interval' | 'fixed';
    startHour: number;
    endHour: number;
    intervalHours: number;
    jitterMinutes: number;
    fixedTimes: string[];
    commands: SchedulerCommand[];
    availableCommands: SchedulerCommand[];
    autoStartServer: boolean;
    autoRestartServer: boolean;
    hasServer: boolean;
    scheduleText: string;
}

export interface SchedulerSectionData {
    daemonRunning: boolean;
    services: SchedulerServiceStatus[];
    plugins: SchedulerPluginEditor[];
}

function renderCommandToggles(plugin: SchedulerPluginEditor): string {
    const commandLabels: Record<SchedulerCommand, string> = {
        get: 'Get',
        process: 'Process',
        push: 'Push',
    };

    return (['get', 'process', 'push'] as SchedulerCommand[]).map(command => {
        const available = plugin.availableCommands.includes(command);
        const checked = plugin.commands.includes(command);
        return `
        <label style="display:flex; align-items:center; gap:0.45rem; color:${available ? '#c9d1d9' : '#6e7681'};">
            <input type="checkbox" name="commands" value="${command}" ${checked ? 'checked' : ''} ${available ? '' : 'disabled'} />
            ${commandLabels[command]}
        </label>`;
    }).join('');
}

function renderManualTriggerButtons(plugin: SchedulerPluginEditor): string {
    if (plugin.availableCommands.length === 0) return '';

    const commandIcons: Record<SchedulerCommand, string> = {
        get: '📥',
        process: '⚙️',
        push: '📤',
    };
    const commandLabels: Record<SchedulerCommand, string> = {
        get: 'Get',
        process: 'Process',
        push: 'Push',
    };

    const buttons = plugin.availableCommands.map(command => {
        return `<button type="button" class="btn small-btn secondary" onclick="runPluginCommand('${plugin.id}','${command}',this)">${commandIcons[command]} ${commandLabels[command]}</button>`;
    }).join(' ');

    const allBtn = plugin.availableCommands.length > 1
        ? ` <button type="button" class="btn small-btn" onclick="runPluginCommandChain('${plugin.id}',${JSON.stringify(plugin.availableCommands)},this)">▶️ Run All</button>`
        : '';

    return `
    <div style="padding:0.6rem; border:1px solid #30363d; border-radius:6px;">
        <div style="margin-bottom:0.4rem; color:#8b949e; font-size:0.85em;">Manual trigger</div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
            ${buttons}${allBtn}
            <span id="run-status-${plugin.id}" style="font-size:0.85em; color:#8b949e;"></span>
        </div>
    </div>`;
}

function renderServiceActions(service: SchedulerServiceStatus): string {
    const actions = service.actions || [];
    if (!actions.length) return '';

    return actions.map(entry => {
        const styleClass = entry.style === 'danger' ? ' danger' : entry.style === 'secondary' ? ' secondary' : '';
        return `<button type="button" class="btn small-btn${styleClass}" onclick="runServiceAction('${service.id}','${entry.action}',this)">${entry.label}</button>`;
    }).join(' ');
}

function renderServiceRows(services: SchedulerServiceStatus[], emptyLabel: string): string {
    if (services.length === 0) {
        return `<tr><td colspan="4" style="padding: 0.75rem; color:#8b949e;">${emptyLabel}</td></tr>`;
    }

    return services.map(service => {
        const icon = service.icon || '🖥️';
        const statusColor = service.running ? '#7ee787' : '#f85149';
        const statusLabel = service.running ? 'Running' : 'Stopped';
        const logsBtn = service.id !== 'config-server'
            ? ` <button type="button" class="btn small-btn secondary" onclick="viewServiceLogs('${service.id}')">Logs</button>`
            : '';
        return `
        <tr data-service-id="${service.id}">
            <td style="padding: 0.65rem;">
                ${icon} ${service.name}
                ${service.description ? `<div style="font-size:0.8em;color:#8b949e;margin-top:0.25rem;">${service.description}</div>` : ''}
            </td>
            <td class="svc-status" style="padding: 0.65rem; color: ${statusColor}; font-weight: 600;">${statusLabel}</td>
            <td class="svc-detail" style="padding: 0.65rem; color:#8b949e;">${service.detail ?? ''}</td>
            <td class="svc-actions" style="padding: 0.65rem; display:flex; gap:0.35rem; flex-wrap:wrap;">
                ${renderServiceActions(service)}${logsBtn}
            </td>
        </tr>`;
    }).join('');
}

export function renderSchedulerSection(
    data: SchedulerSectionData,
    justSaved: boolean = false
): string {
    const statusHtml = data.daemonRunning
        ? '<span class="status connected">🔥 Running</span>'
        : '<span class="status pending">⏸ Stopped</span>';

    const systemServiceIds = ['config-server', 'daemon', 'tunnel'];
    const systemServices = data.services.filter(service => systemServiceIds.includes(service.id));
    const pluginServices = data.services.filter(service => !systemServiceIds.includes(service.id));
    const systemServiceRows = renderServiceRows(systemServices, 'No system services detected.');
    const pluginServiceRows = renderServiceRows(pluginServices, 'No plugin services detected.');

    const pluginRows = data.plugins.length > 0
        ? data.plugins.map(plugin => {
            const fixedTimesValue = plugin.fixedTimes.join(', ');
            return `
            <details style="margin-bottom:0.75rem;" ${justSaved ? '' : ''}>
                <summary>
                    <span class="icon">${plugin.icon}</span>
                    ${plugin.name}
                    <span style="margin-left:auto; color:${plugin.enabled ? '#7ee787' : '#8b949e'}; font-size:0.85em;">${plugin.scheduleText}</span>
                </summary>
                <div class="section-content" style="background:#0d1117;">
                    <form action="/scheduler/plugin/${plugin.id}" method="POST" style="gap:0.85rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:0.5rem;">
                                <input type="checkbox" name="enabled" ${plugin.enabled ? 'checked' : ''} />
                                Enable this plugin in scheduler
                            </label>
                            <button type="button" class="btn secondary small-btn" onclick="openPluginPanel('${plugin.id}')">Open Plugin Config</button>
                        </div>

                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:0.75rem;">
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Cadence</span>
                                <select name="cadence" class="scheduler-cadence" data-plugin-id="${plugin.id}">
                                    <option value="interval" ${plugin.cadence === 'interval' ? 'selected' : ''}>Interval + jitter</option>
                                    <option value="fixed" ${plugin.cadence === 'fixed' ? 'selected' : ''}>Fixed times</option>
                                </select>
                            </label>
                        </div>

                        <div id="interval-settings-${plugin.id}" style="display:${plugin.cadence === 'interval' ? 'grid' : 'none'}; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:0.75rem;">
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Start hour</span>
                                <input type="number" min="0" max="23" name="startHour" value="${plugin.startHour}" />
                            </label>
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Stop hour</span>
                                <input type="number" min="1" max="24" name="endHour" value="${plugin.endHour}" />
                            </label>
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Interval (hours)</span>
                                <input type="number" min="1" max="168" name="intervalHours" value="${plugin.intervalHours}" />
                            </label>
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Jitter (minutes)</span>
                                <input type="number" min="0" max="180" name="jitterMinutes" value="${plugin.jitterMinutes}" />
                            </label>
                        </div>

                        <div id="fixed-settings-${plugin.id}" style="display:${plugin.cadence === 'fixed' ? 'block' : 'none'};">
                            <label>
                                <span style="display:block; margin-bottom:0.2rem; color:#8b949e;">Fixed run times</span>
                                <input type="text" name="fixedTimes" value="${fixedTimesValue}" placeholder="07:00, 12:30, 20:15" />
                            </label>
                            <p class="help">Comma-separated 24h times. Example: <code>07:00, 19:30</code>.</p>
                        </div>

                        ${plugin.availableCommands.length > 0 ? `
                            <div style="padding:0.6rem; border:1px solid #30363d; border-radius:6px;">
                                <div style="margin-bottom:0.4rem; color:#8b949e; font-size:0.85em;">Commands per run (order is always Get → Process → Push)</div>
                                <div style="display:flex; gap:0.85rem; flex-wrap:wrap;">
                                    ${renderCommandToggles(plugin)}
                                </div>
                            </div>
                        ` : `
                            <div style="padding:0.6rem; border:1px solid #30363d; border-radius:6px; color:#8b949e; font-size:0.85em;">
                                This plugin is server-managed. No scheduled command chain is required.
                            </div>
                        `}

                        ${renderManualTriggerButtons(plugin)}

                        ${plugin.hasServer ? `
                            <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.35rem;">
                                <label style="display:flex; align-items:center; gap:0.5rem;">
                                    <input type="checkbox" name="autoStartServer" ${plugin.autoStartServer ? 'checked' : ''} />
                                    Auto-start this plugin's server with the scheduler daemon
                                </label>
                                <label style="display:flex; align-items:center; gap:0.5rem;">
                                    <input type="checkbox" name="autoRestartServer" ${plugin.autoRestartServer ? 'checked' : ''} />
                                    Auto-restart server if it crashes
                                </label>
                            </div>
                        ` : ''}

                        <button type="submit">💾 Save Scheduler Rules</button>
                    </form>
                </div>
            </details>
        `;
        }).join('')
        : `<div style="padding: 0.75rem; color:#8b949e;">No plugins discovered.</div>`;

    return `
<details${justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">🗓</span>
        Services
        ${statusHtml}
    </summary>
    <div class="section-content">
        <h3 style="margin-bottom:0.75rem; color:#79c0ff;">🤖 Daemon Controls</h3>
        <p style="color:#8b949e; font-size:0.9em; margin-bottom:1rem;">
            Runs <code>npm run scheduler</code> and executes plugin jobs based on the rules below.
        </p>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${data.daemonRunning ? `
                <button type="button" class="btn secondary" onclick="restartDaemon(this)">🔄 Restart Scheduler</button>
                <button type="button" class="btn danger" onclick="stopDaemon(this)">⏹️ Stop Scheduler</button>
            ` : `
                <button type="button" class="btn" onclick="startDaemon(this)">▶️ Start Scheduler</button>
            `}
            <button type="button" class="btn secondary" onclick="refreshServicesSection()">🔄 Refresh Status</button>
        </div>
        <p id="scheduler-daemon-status" style="margin-top:0.5rem; font-size:0.85em;"></p>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <h3 style="margin-bottom: 0.75rem; color: #58a6ff;">🧩 System Services</h3>
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
                <tr style="border-bottom:1px solid #30363d; color:#8b949e;">
                    <th style="padding:0.65rem;">Service</th>
                    <th style="padding:0.65rem;">Status</th>
                    <th style="padding:0.65rem;">Details</th>
                    <th style="padding:0.65rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${systemServiceRows}
            </tbody>
        </table>

        <h3 style="margin: 1.25rem 0 0.75rem; color: #58a6ff;">🔌 Plugin Services</h3>
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
                <tr style="border-bottom:1px solid #30363d; color:#8b949e;">
                    <th style="padding:0.65rem;">Service</th>
                    <th style="padding:0.65rem;">Status</th>
                    <th style="padding:0.65rem;">Details</th>
                    <th style="padding:0.65rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${pluginServiceRows}
            </tbody>
        </table>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <h3 style="margin-bottom: 0.75rem; color: #58a6ff;">📋 Plugin Schedules</h3>
        ${pluginRows}
    </div>
</details>
`;
}
