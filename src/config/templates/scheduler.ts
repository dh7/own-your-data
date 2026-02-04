/**
 * Scheduler Templates
 * 
 * - renderSchedulerSection: Status section for main config page
 * - renderSchedulerSettingsPage: Full settings page for scheduler config
 */

import { SchedulerConfig } from '../config';

export interface PluginInfo {
    id: string;
    name: string;
    icon: string;
    hasServer: boolean;
    commands: string[];
}

export interface SchedulerSectionData {
    schedulerRunning: boolean;
    processes: Array<{
        name: string;
        script: string;
        status: string;
        pid?: number;
        uptime?: number;
        restarts: number;
    }>;
    tasks: {
        tasks: Array<{
            plugins: string[];
            commands: string[];
            intervalHours?: number;
            schedule?: string;
        }>;
        isWithinActiveHours: boolean;
        activeHours: { start: number; end: number };
    };
}

function formatUptime(seconds?: number): string {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function getStatusBadge(status: string): string {
    const colors: Record<string, string> = {
        running: '#2ea043',
        stopped: '#6e7681',
        crashed: '#da3633',
        starting: '#bf8700',
        restarting: '#bf8700',
    };
    const color = colors[status] || '#6e7681';
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: ${color}; color: white; font-size: 11px; text-transform: uppercase;">${status}</span>`;
}

export function renderSchedulerSection(data: SchedulerSectionData): string {
    const { schedulerRunning, processes, tasks } = data;

    // Processes table
    const processRows = processes.map(p => `
        <tr>
            <td><strong>${p.name}</strong></td>
            <td><code>${p.script}</code></td>
            <td>${getStatusBadge(p.status)}</td>
            <td>${p.pid || '-'}</td>
            <td>${formatUptime(p.uptime)}</td>
            <td>${p.restarts}</td>
            <td>
                ${p.status === 'running' ? `
                    <button onclick="schedulerAction('${p.name}', 'stop')" class="btn-small btn-danger">Stop</button>
                    <button onclick="schedulerAction('${p.name}', 'restart')" class="btn-small">Restart</button>
                ` : `
                    <button onclick="schedulerAction('${p.name}', 'start')" class="btn-small btn-success">Start</button>
                `}
            </td>
        </tr>
    `).join('');

    // Tasks table
    const taskRows = tasks.tasks.map(t => `
        <tr>
            <td>${t.plugins.join(', ')}</td>
            <td><code>${t.commands.join(' → ')}</code></td>
            <td>${t.schedule === 'manual' ? 'Manual' : `Every ${t.intervalHours}h`}</td>
            <td>
                <button onclick="runTask('${t.plugins.join(',')}', '${t.commands.join(',')}')" class="btn-small">
                    Run Now
                </button>
            </td>
        </tr>
    `).join('');

    return `
    <div class="section">
        <h2>⚡ Scheduler ${schedulerRunning 
            ? '<span style="color: #2ea043; font-size: 14px;">(Running)</span>' 
            : '<span style="color: #6e7681; font-size: 14px;">(Not Running)</span>'}</h2>
        
        ${!schedulerRunning ? `
            <div class="info-box" style="background: #30363d; border-color: #484f58;">
                <p>The scheduler is not running. Start it with:</p>
                <pre style="background: #0d1117; padding: 10px; border-radius: 6px;">npm run start</pre>
                <p style="margin-top: 8px; color: #8b949e;">
                    The scheduler manages servers and runs tasks on schedule.
                    You can still run individual plugin commands directly.
                </p>
            </div>
        ` : `
            <h3 style="margin-top: 20px;">Managed Processes</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Script</th>
                        <th>Status</th>
                        <th>PID</th>
                        <th>Uptime</th>
                        <th>Restarts</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${processRows || '<tr><td colspan="7" style="text-align: center; color: #8b949e;">No processes registered</td></tr>'}
                </tbody>
            </table>

            <h3 style="margin-top: 30px;">Scheduled Tasks</h3>
            <p style="color: #8b949e; margin-bottom: 10px;">
                Active hours: ${tasks.activeHours.start}:00 - ${tasks.activeHours.end}:00
                ${tasks.isWithinActiveHours 
                    ? '<span style="color: #2ea043;"> (Currently active)</span>' 
                    : '<span style="color: #bf8700;"> (Outside active hours)</span>'}
            </p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Plugins</th>
                        <th>Commands</th>
                        <th>Schedule</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${taskRows || '<tr><td colspan="4" style="text-align: center; color: #8b949e;">No tasks configured</td></tr>'}
                </tbody>
            </table>

            <div style="margin-top: 20px;">
                <button onclick="refreshSchedulerStatus()" class="btn">🔄 Refresh Status</button>
            </div>
        `}

        <style>
            .data-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            .data-table th, .data-table td {
                padding: 8px 12px;
                text-align: left;
                border-bottom: 1px solid #30363d;
            }
            .data-table th {
                background: #161b22;
                font-weight: 500;
                color: #8b949e;
                font-size: 12px;
                text-transform: uppercase;
            }
            .data-table tbody tr:hover {
                background: #161b22;
            }
            .btn-small {
                padding: 4px 8px;
                font-size: 12px;
                border-radius: 4px;
                border: 1px solid #30363d;
                background: #21262d;
                color: #c9d1d9;
                cursor: pointer;
                margin-right: 4px;
            }
            .btn-small:hover {
                background: #30363d;
            }
            .btn-success {
                border-color: #238636;
                background: #238636;
            }
            .btn-success:hover {
                background: #2ea043;
            }
            .btn-danger {
                border-color: #da3633;
                background: transparent;
                color: #f85149;
            }
            .btn-danger:hover {
                background: #da3633;
                color: white;
            }
        </style>

        <script>
        async function schedulerAction(name, action) {
            try {
                const res = await fetch('/scheduler/processes/' + name + '/' + action, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    setTimeout(refreshSchedulerStatus, 500);
                } else {
                    alert(data.error || 'Action failed');
                }
            } catch (e) {
                alert('Failed to contact scheduler');
            }
        }

        async function runTask(plugins, commands) {
            const pluginList = plugins.split(',');
            const commandList = commands.split(',');
            
            for (const plugin of pluginList) {
                for (const cmd of commandList) {
                    try {
                        await fetch('/scheduler/tasks/run/' + plugin + '/' + cmd, { method: 'POST' });
                    } catch (e) {
                        console.error('Failed to run task:', e);
                    }
                }
            }
            alert('Task started. Check console for progress.');
        }

        async function refreshSchedulerStatus() {
            // Reload just the scheduler section
            const container = document.getElementById('scheduler-section');
            if (!container) return;
            
            try {
                const res = await fetch('/scheduler/status');
                const data = await res.json();
                // For now, just reload the page
                location.reload();
            } catch (e) {
                console.error('Failed to refresh scheduler status');
            }
        }
        </script>
    </div>
    `;
}

/**
 * Render the full scheduler settings page
 */
export function renderSchedulerSettingsPage(
    config: SchedulerConfig,
    plugins: PluginInfo[]
): string {
    const serverPlugins = plugins.filter(p => p.hasServer);
    
    // Build server rows
    const serverRows = serverPlugins.map(p => {
        const serverConfig = config.servers[p.id] || { autoStart: false };
        return `
            <tr data-server="${p.id}">
                <td>
                    <span class="icon">${p.icon}</span>
                    <strong>${p.name}</strong>
                </td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" name="server_${p.id}_autoStart" 
                            ${serverConfig.autoStart ? 'checked' : ''} />
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" name="server_${p.id}_restartOnCrash" 
                            ${serverConfig.restartOnCrash !== false ? 'checked' : ''} />
                        <span class="toggle-slider"></span>
                    </label>
                </td>
            </tr>
        `;
    }).join('');

    // Config server row (always present)
    const configServerConfig = config.servers.config || { autoStart: true };
    const configServerRow = `
        <tr data-server="config">
            <td>
                <span class="icon">⚙️</span>
                <strong>Config Server</strong>
            </td>
            <td>
                <label class="toggle">
                    <input type="checkbox" name="server_config_autoStart" 
                        ${configServerConfig.autoStart ? 'checked' : ''} />
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td>
                <label class="toggle">
                    <input type="checkbox" name="server_config_restartOnCrash" 
                        ${configServerConfig.restartOnCrash !== false ? 'checked' : ''} />
                    <span class="toggle-slider"></span>
                </label>
            </td>
        </tr>
    `;

    // Build task rows
    const taskRows = config.tasks.map((task, index) => {
        const isManual = task.schedule === 'manual';
        return `
            <div class="task-card" data-task-index="${index}">
                <div class="task-header">
                    <span class="task-title">Task ${index + 1}</span>
                    <button type="button" class="btn-icon btn-danger" onclick="removeTask(${index})" title="Remove task">×</button>
                </div>
                <div class="task-body">
                    <div class="form-row">
                        <label>Plugins</label>
                        <div class="plugin-checkboxes">
                            ${plugins.map(p => `
                                <label class="checkbox-label">
                                    <input type="checkbox" name="task_${index}_plugins" value="${p.id}"
                                        ${task.plugins.includes(p.id) ? 'checked' : ''} />
                                    <span>${p.icon} ${p.name}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="form-row">
                        <label>Commands</label>
                        <div class="command-checkboxes">
                            <label class="checkbox-label">
                                <input type="checkbox" name="task_${index}_commands" value="get"
                                    ${task.commands.includes('get') ? 'checked' : ''} />
                                <span>get</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="task_${index}_commands" value="process"
                                    ${task.commands.includes('process') ? 'checked' : ''} />
                                <span>process</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="task_${index}_commands" value="push"
                                    ${task.commands.includes('push') ? 'checked' : ''} />
                                <span>push</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-row schedule-row">
                        <label>Schedule</label>
                        <div class="schedule-options">
                            <label class="radio-label">
                                <input type="radio" name="task_${index}_scheduleType" value="interval"
                                    ${!isManual ? 'checked' : ''} onchange="toggleScheduleInputs(${index})" />
                                <span>Interval</span>
                            </label>
                            <label class="radio-label">
                                <input type="radio" name="task_${index}_scheduleType" value="manual"
                                    ${isManual ? 'checked' : ''} onchange="toggleScheduleInputs(${index})" />
                                <span>Manual only</span>
                            </label>
                        </div>
                        <div class="interval-inputs" id="interval-inputs-${index}" style="${isManual ? 'display: none;' : ''}">
                            <span>Every</span>
                            <input type="number" name="task_${index}_intervalHours" 
                                value="${task.intervalHours || 6}" min="1" max="168" style="width: 60px;" />
                            <span>hours ±</span>
                            <input type="number" name="task_${index}_randomMinutes" 
                                value="${task.randomMinutes || 30}" min="0" max="120" style="width: 60px;" />
                            <span>min</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scheduler Settings - SecondBrain</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.5;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            color: #58a6ff;
            margin-bottom: 8px;
        }
        .subtitle {
            color: #8b949e;
            margin-bottom: 30px;
        }
        .back-link {
            display: inline-block;
            color: #58a6ff;
            text-decoration: none;
            margin-bottom: 20px;
        }
        .back-link:hover { text-decoration: underline; }
        
        .section {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .section h2 {
            color: #c9d1d9;
            font-size: 18px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #30363d;
        }
        
        /* Active Hours */
        .hours-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .hours-row input {
            width: 70px;
            padding: 8px;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 4px;
            color: #c9d1d9;
            text-align: center;
        }
        
        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #30363d;
        }
        th {
            color: #8b949e;
            font-weight: 500;
            font-size: 12px;
            text-transform: uppercase;
        }
        .icon { margin-right: 8px; }
        
        /* Toggle Switch */
        .toggle {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
        }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #30363d;
            border-radius: 24px;
            transition: 0.2s;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background: white;
            border-radius: 50%;
            transition: 0.2s;
        }
        .toggle input:checked + .toggle-slider { background: #238636; }
        .toggle input:checked + .toggle-slider:before { transform: translateX(20px); }
        
        /* Task Cards */
        .task-card {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 8px;
            margin-bottom: 16px;
        }
        .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #161b22;
            border-bottom: 1px solid #30363d;
            border-radius: 8px 8px 0 0;
        }
        .task-title { font-weight: 500; }
        .task-body { padding: 16px; }
        .form-row {
            margin-bottom: 16px;
        }
        .form-row:last-child { margin-bottom: 0; }
        .form-row label {
            display: block;
            color: #8b949e;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        
        /* Checkboxes */
        .plugin-checkboxes, .command-checkboxes {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .checkbox-label, .radio-label {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .checkbox-label:hover, .radio-label:hover {
            background: #30363d;
        }
        .checkbox-label input:checked + span,
        .radio-label input:checked + span {
            color: #58a6ff;
        }
        
        /* Schedule */
        .schedule-options {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
        }
        .interval-inputs {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #8b949e;
        }
        .interval-inputs input {
            padding: 6px;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 4px;
            color: #c9d1d9;
            text-align: center;
        }
        
        /* Buttons */
        .btn {
            padding: 10px 20px;
            border-radius: 6px;
            border: 1px solid #30363d;
            background: #21262d;
            color: #c9d1d9;
            cursor: pointer;
            font-size: 14px;
        }
        .btn:hover { background: #30363d; }
        .btn-primary {
            background: #238636;
            border-color: #238636;
        }
        .btn-primary:hover { background: #2ea043; }
        .btn-icon {
            width: 28px;
            height: 28px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            border: 1px solid transparent;
            background: transparent;
            color: #8b949e;
            cursor: pointer;
            font-size: 18px;
        }
        .btn-icon:hover { background: #30363d; }
        .btn-icon.btn-danger:hover {
            background: #da3633;
            color: white;
        }
        
        .actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }
        
        .help-text {
            color: #8b949e;
            font-size: 13px;
            margin-top: 8px;
        }
        
        .success-message {
            background: #238636;
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Config</a>
        <h1>⚡ Scheduler Settings</h1>
        <p class="subtitle">Configure when tasks run and which servers auto-start</p>
        
        <div id="message"></div>
        
        <form id="scheduler-form" onsubmit="saveScheduler(event)">
            <!-- Active Hours -->
            <div class="section">
                <h2>🕐 Active Hours</h2>
                <p class="help-text" style="margin-bottom: 12px;">Tasks only run during these hours</p>
                <div class="hours-row">
                    <span>From</span>
                    <input type="number" name="activeHoursStart" value="${config.activeHours.start}" min="0" max="23" />
                    <span>:00 to</span>
                    <input type="number" name="activeHoursEnd" value="${config.activeHours.end}" min="0" max="23" />
                    <span>:00</span>
                </div>
            </div>
            
            <!-- Servers -->
            <div class="section">
                <h2>🖥️ Servers</h2>
                <p class="help-text" style="margin-bottom: 12px;">Long-running processes managed by the scheduler</p>
                <table>
                    <thead>
                        <tr>
                            <th>Server</th>
                            <th>Auto-Start</th>
                            <th>Restart on Crash</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${configServerRow}
                        ${serverRows}
                    </tbody>
                </table>
            </div>
            
            <!-- Tasks -->
            <div class="section">
                <h2>📋 Scheduled Tasks</h2>
                <p class="help-text" style="margin-bottom: 12px;">Define which plugins run which commands and when</p>
                
                <div id="tasks-container">
                    ${taskRows || '<p style="color: #8b949e; text-align: center; padding: 20px;">No tasks configured. Click "Add Task" to create one.</p>'}
                </div>
                
                <button type="button" class="btn" onclick="addTask()" style="margin-top: 12px;">
                    + Add Task
                </button>
            </div>
            
            <!-- Save -->
            <div class="actions">
                <button type="submit" class="btn btn-primary">💾 Save Scheduler Config</button>
                <a href="/" class="btn">Cancel</a>
            </div>
        </form>
    </div>
    
    <script>
        const allPlugins = ${JSON.stringify(plugins)};
        let taskCount = ${config.tasks.length};
        
        function toggleScheduleInputs(index) {
            const isManual = document.querySelector(\`input[name="task_\${index}_scheduleType"][value="manual"]\`).checked;
            const inputs = document.getElementById(\`interval-inputs-\${index}\`);
            if (inputs) {
                inputs.style.display = isManual ? 'none' : 'flex';
            }
        }
        
        function removeTask(index) {
            const card = document.querySelector(\`[data-task-index="\${index}"]\`);
            if (card) card.remove();
        }
        
        function addTask() {
            const container = document.getElementById('tasks-container');
            const index = taskCount++;
            
            const pluginCheckboxes = allPlugins.map(p => \`
                <label class="checkbox-label">
                    <input type="checkbox" name="task_\${index}_plugins" value="\${p.id}" />
                    <span>\${p.icon} \${p.name}</span>
                </label>
            \`).join('');
            
            const html = \`
                <div class="task-card" data-task-index="\${index}">
                    <div class="task-header">
                        <span class="task-title">Task \${index + 1}</span>
                        <button type="button" class="btn-icon btn-danger" onclick="removeTask(\${index})" title="Remove task">×</button>
                    </div>
                    <div class="task-body">
                        <div class="form-row">
                            <label>Plugins</label>
                            <div class="plugin-checkboxes">\${pluginCheckboxes}</div>
                        </div>
                        <div class="form-row">
                            <label>Commands</label>
                            <div class="command-checkboxes">
                                <label class="checkbox-label">
                                    <input type="checkbox" name="task_\${index}_commands" value="get" />
                                    <span>get</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" name="task_\${index}_commands" value="process" />
                                    <span>process</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" name="task_\${index}_commands" value="push" />
                                    <span>push</span>
                                </label>
                            </div>
                        </div>
                        <div class="form-row schedule-row">
                            <label>Schedule</label>
                            <div class="schedule-options">
                                <label class="radio-label">
                                    <input type="radio" name="task_\${index}_scheduleType" value="interval" checked onchange="toggleScheduleInputs(\${index})" />
                                    <span>Interval</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="task_\${index}_scheduleType" value="manual" onchange="toggleScheduleInputs(\${index})" />
                                    <span>Manual only</span>
                                </label>
                            </div>
                            <div class="interval-inputs" id="interval-inputs-\${index}">
                                <span>Every</span>
                                <input type="number" name="task_\${index}_intervalHours" value="6" min="1" max="168" style="width: 60px;" />
                                <span>hours ±</span>
                                <input type="number" name="task_\${index}_randomMinutes" value="30" min="0" max="120" style="width: 60px;" />
                                <span>min</span>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            // Remove "no tasks" message if present
            const noTasks = container.querySelector('p');
            if (noTasks) noTasks.remove();
            
            container.insertAdjacentHTML('beforeend', html);
        }
        
        async function saveScheduler(e) {
            e.preventDefault();
            
            const form = document.getElementById('scheduler-form');
            const formData = new FormData(form);
            
            // Build config object
            const config = {
                activeHours: {
                    start: parseInt(formData.get('activeHoursStart')) || 7,
                    end: parseInt(formData.get('activeHoursEnd')) || 23
                },
                servers: {},
                tasks: []
            };
            
            // Parse servers
            const serverNames = ['config', ...allPlugins.filter(p => p.hasServer).map(p => p.id)];
            for (const name of serverNames) {
                config.servers[name] = {
                    autoStart: formData.get(\`server_\${name}_autoStart\`) === 'on',
                    restartOnCrash: formData.get(\`server_\${name}_restartOnCrash\`) === 'on'
                };
            }
            
            // Parse tasks
            const taskCards = document.querySelectorAll('.task-card');
            taskCards.forEach(card => {
                const index = card.dataset.taskIndex;
                const plugins = formData.getAll(\`task_\${index}_plugins\`);
                const commands = formData.getAll(\`task_\${index}_commands\`);
                const scheduleType = formData.get(\`task_\${index}_scheduleType\`);
                
                if (plugins.length === 0 || commands.length === 0) return;
                
                const task = { plugins, commands };
                
                if (scheduleType === 'manual') {
                    task.schedule = 'manual';
                } else {
                    task.intervalHours = parseInt(formData.get(\`task_\${index}_intervalHours\`)) || 6;
                    task.randomMinutes = parseInt(formData.get(\`task_\${index}_randomMinutes\`)) || 30;
                }
                
                config.tasks.push(task);
            });
            
            try {
                const res = await fetch('/scheduler/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                const result = await res.json();
                
                if (result.success) {
                    document.getElementById('message').innerHTML = 
                        '<div class="success-message">✅ Scheduler config saved!</div>';
                    setTimeout(() => {
                        document.getElementById('message').innerHTML = '';
                    }, 3000);
                } else {
                    alert(result.error || 'Failed to save');
                }
            } catch (err) {
                alert('Failed to save: ' + err.message);
            }
        }
    </script>
</body>
</html>
    `;
}
