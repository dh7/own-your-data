export interface PluginSummary {
    id: string;
    name: string;
    icon: string;
    description: string;
    statusText: string;
    statusClass: 'connected' | 'disconnected' | 'pending' | 'warning';
    scheduleText: string;
}

export function renderPluginsHub(summaries: PluginSummary[]): string {
    const rows = summaries.length > 0 ? summaries.map(summary => `
        <tr>
            <td style="padding:0.65rem;">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600;">${summary.icon} ${summary.name}</span>
                    <span style="font-size:0.8em; color:#8b949e;">${summary.description}</span>
                </div>
            </td>
            <td style="padding:0.65rem;">
                <span class="status ${summary.statusClass}" style="margin-left:0;">${summary.statusText}</span>
            </td>
            <td style="padding:0.65rem;"><a href="#" onclick="event.preventDefault(); openSchedulerPanel('${summary.id}')" style="color:#58a6ff; text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${summary.scheduleText}</a></td>
            <td style="padding:0.65rem; text-align:right;">
                <button type="button" class="btn small-btn" onclick="openPluginPanel('${summary.id}')">⚙️ Config</button>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="4" style="padding:0.75rem; color:#8b949e;">No plugins available.</td></tr>`;

    return `
<section class="plugin-hub">
    <h2 style="color: #58a6ff; font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">Installed Plugins</h2>
    <div style="background:#0d1117; border:1px solid #30363d; border-radius:8px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
                <tr style="border-bottom:1px solid #30363d; color:#8b949e;">
                    <th style="padding:0.65rem;">Plugin</th>
                    <th style="padding:0.65rem;">Status</th>
                    <th style="padding:0.65rem;">Schedule</th>
                    <th style="padding:0.65rem; text-align:right;">&nbsp;</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>
</section>
`;
}

export function wrapPluginPanel(pluginId: string, pluginName: string, pluginIcon: string, innerHtml: string): string {
    return `
<div class="plugin-panel" id="plugin-panel-${pluginId}" aria-hidden="true">
    <div class="plugin-panel__overlay" onclick="closePluginPanel('${pluginId}')"></div>
    <div class="plugin-panel__body">
        <div class="plugin-panel__header">
            <h3>${pluginIcon} ${pluginName}</h3>
            <button type="button" class="close-btn small-btn" onclick="closePluginPanel('${pluginId}')">✕</button>
        </div>
        <div class="plugin-panel__content">
            ${innerHtml}
        </div>
    </div>
</div>
`;
}
