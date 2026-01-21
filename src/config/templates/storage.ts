/**
 * Storage configuration section (global paths)
 */

import { StorageConfig } from '../config';

// collapsed param is now unused if we want default folded, but let's keep signal just in case we change mind
// Default is now folded (no 'open' attribute)
export function renderStorageSection(config: StorageConfig, collapsed: boolean = true): string {
    return `
<details>
    <summary>
        <span class="icon">📁</span>
        Server Paths
        <span class="status connected">✅ Configured</span>
    </summary>
    <div class="section-content">
        <form action="/storage" method="POST">
            <div>
                <label for="path-auth">Auth Directory</label>
                <input type="text" id="path-auth" name="auth" value="${config.auth}" placeholder="./auth" />
                <p class="help">Sessions & tokens</p>
            </div>
            <div>
                <label for="path-logs">Logs Directory</label>
                <input type="text" id="path-logs" name="logs" value="${config.logs}" placeholder="./logs" />
                <p class="help">Collection logs</p>
            </div>
            <div>
                <label for="path-raw">Raw Dumps Directory</label>
                <input type="text" id="path-raw" name="rawDumps" value="${config.rawDumps}" placeholder="./raw-dumps" />
                <p class="help">Raw API data</p>
            </div>
            <div>
                <label for="path-connector-data">Connector Data Directory</label>
                <input type="text" id="path-connector-data" name="connectorData" value="${config.connectorData || './connector_data'}" placeholder="./connector_data" />
                <p class="help">MindCache output (whatsapp/, twitter/)</p>
            </div>
            <button type="submit">💾 Save Storage Config</button>
        </form>
    </div>
</details>
`;
}
