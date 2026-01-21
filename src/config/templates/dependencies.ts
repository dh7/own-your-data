/**
 * Dependencies check section
 * Checks system requirements like Playwright browsers
 */

export interface DependenciesStatus {
    playwrightInstalled: boolean;
    browsersInstalled: boolean;
}

export function renderDependenciesSection(status: DependenciesStatus): string {
    const allGood = status.playwrightInstalled && status.browsersInstalled;

    return `
<details ${!allGood ? 'open' : ''}>
    <summary>
        <span class="icon">🔧</span>
        Dependencies
        <span class="status ${allGood ? 'connected' : 'warning'}">${allGood ? '✅ Ready' : '⚠️ Setup needed'}</span>
    </summary>
    <div class="section-content">
        <p class="help" style="margin-bottom: 1rem;">
            System dependencies required for Twitter and Instagram collectors.
        </p>
        
        <div class="dep-list">
            <div class="dep-item ${status.playwrightInstalled ? 'ok' : 'missing'}">
                <span class="dep-icon">${status.playwrightInstalled ? '✅' : '❌'}</span>
                <span class="dep-name">Playwright Package</span>
                <span class="dep-status">${status.playwrightInstalled ? 'Installed' : 'Not installed'}</span>
            </div>
            
            <div class="dep-item ${status.browsersInstalled ? 'ok' : 'missing'}">
                <span class="dep-icon">${status.browsersInstalled ? '✅' : '⚠️'}</span>
                <span class="dep-name">Playwright Browsers</span>
                <span class="dep-status">${status.browsersInstalled ? 'Installed' : 'Need to install'}</span>
            </div>
        </div>
        
        ${!status.browsersInstalled ? `
        <div class="install-section" style="margin-top: 1.5rem;">
            <p style="margin-bottom: 1rem; color: #f0a030;">
                ⚠️ Playwright browsers need to be installed for Twitter/Instagram scraping.
            </p>
            <button type="button" onclick="installPlaywrightBrowsers()" id="install-pw-btn" class="btn primary">
                🚀 Install Playwright Browsers
            </button>
            <p id="install-status" class="help" style="margin-top: 0.5rem;"></p>
            <pre id="install-output" style="display: none; background: #0a0a0a; padding: 1rem; border-radius: 4px; margin-top: 1rem; max-height: 300px; overflow-y: auto; font-size: 0.8rem;"></pre>
        </div>
        ` : `
        <div style="margin-top: 1rem; padding: 0.75rem; background: #1a2a1a; border: 1px solid #2a4a2a; border-radius: 4px;">
            <strong>✅ All dependencies ready!</strong>
            <p style="margin: 0.5rem 0 0 0; color: #8b949e; font-size: 0.9rem;">
                Twitter and Instagram collectors are ready to use.
            </p>
        </div>
        `}
        
        <div style="margin-top: 1.5rem;">
            <button type="button" onclick="recheckDependencies()" class="btn secondary" style="font-size: 0.85rem;">
                🔄 Recheck Dependencies
            </button>
        </div>
    </div>
</details>

<style>
    .dep-list {
        display: grid;
        gap: 0.5rem;
    }
    
    .dep-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 4px;
    }
    
    .dep-item.ok {
        border-color: #238636;
    }
    
    .dep-item.missing {
        border-color: #9e6a03;
    }
    
    .dep-icon {
        font-size: 1.2rem;
    }
    
    .dep-name {
        flex: 1;
        font-weight: 500;
    }
    
    .dep-status {
        color: #8b949e;
        font-size: 0.85rem;
    }
    
    .btn.primary {
        background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
        border-color: #238636;
    }
    
    .btn.secondary {
        background: #21262d;
        border-color: #30363d;
    }
</style>

<script>
(function() {
    window.installPlaywrightBrowsers = async function() {
        const btn = document.getElementById('install-pw-btn');
        const statusEl = document.getElementById('install-status');
        const outputEl = document.getElementById('install-output');
        
        btn.disabled = true;
        btn.textContent = '⏳ Installing...';
        statusEl.textContent = 'This may take a few minutes...';
        statusEl.style.color = '#79c0ff';
        outputEl.style.display = 'block';
        outputEl.textContent = 'Starting installation...\\n';
        
        try {
            const res = await fetch('/dependencies/install-playwright', {
                method: 'POST'
            });
            const data = await res.json();
            
            if (data.success) {
                statusEl.textContent = '✅ ' + data.message;
                statusEl.style.color = '#7ee787';
                outputEl.textContent += data.output || 'Installation complete!';
                btn.textContent = '✅ Installed';
                
                // Reload page after 2 seconds to update status
                setTimeout(() => location.reload(), 2000);
            } else {
                statusEl.textContent = '❌ ' + (data.error || 'Installation failed');
                statusEl.style.color = '#ff7b72';
                outputEl.textContent += data.output || data.error || 'Unknown error';
                btn.disabled = false;
                btn.textContent = '🔄 Retry Installation';
            }
        } catch (e) {
            statusEl.textContent = '❌ Error: ' + e.message;
            statusEl.style.color = '#ff7b72';
            btn.disabled = false;
            btn.textContent = '🔄 Retry Installation';
        }
    };
    
    window.recheckDependencies = function() {
        location.reload();
    };
})();
</script>
`;
}
