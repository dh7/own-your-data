/**
 * Dependencies check section - Playwright browsers
 */

export interface DependenciesStatus {
    playwrightInstalled: boolean;
    browsersInstalled: boolean;
}

export function renderDependenciesSection(status: DependenciesStatus): string {
    const allGood = status.playwrightInstalled && status.browsersInstalled;

    // If all good, just show a simple collapsed section
    if (allGood) {
        return `
<details>
    <summary>
        <span class="icon">🔧</span>
        Dependencies
        <span class="status connected">✅ Ready</span>
    </summary>
    <div class="section-content">
        <p>✅ Playwright package installed</p>
        <p>✅ Playwright browsers installed</p>
        <p style="color: #8b949e; margin-top: 1rem;">Twitter and Instagram collectors are ready to use.</p>
    </div>
</details>`;
    }

    // Not ready - show install section
    return `
<details open>
    <summary>
        <span class="icon">🔧</span>
        Dependencies
        <span class="status warning">⚠️ Setup needed</span>
    </summary>
    <div class="section-content">
        <p>${status.playwrightInstalled ? '✅' : '❌'} Playwright package ${status.playwrightInstalled ? 'installed' : 'missing'}</p>
        <p>${status.browsersInstalled ? '✅' : '⚠️'} Playwright browsers ${status.browsersInstalled ? 'installed' : 'need install'}</p>
        
        <div style="margin-top: 1.5rem;">
            <p style="color: #f0a030; margin-bottom: 1rem;">
                Run this command to install Playwright browsers:
            </p>
            <code style="background: #0a0a0a; padding: 0.5rem 1rem; border-radius: 4px; display: block;">
                npx playwright install chromium
            </code>
            <button type="button" onclick="location.reload()" style="margin-top: 1rem;">
                🔄 Recheck
            </button>
        </div>
    </div>
</details>`;
}
