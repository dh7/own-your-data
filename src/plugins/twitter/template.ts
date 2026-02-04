/**
 * Twitter plugin template
 *
 * Renders the configuration UI section for Twitter
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { TwitterPluginConfig, DEFAULT_CONFIG } from './config';

/**
 * Render the Twitter configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as TwitterPluginConfig;
    const accounts = cfg.accounts || [];
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const tweetsPerAccount = cfg.tweetsPerAccount || DEFAULT_CONFIG.tweetsPerAccount;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    const isReady = data.playwrightInstalled && accounts.length > 0;
    const statusClass = isReady ? 'connected' : 'pending';
    const statusText = isReady ? `✅ ${accounts.length} account(s)` : '⚠️ Setup needed';

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">🐦</span>
        Twitter / X
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <!-- Playwright status -->
        ${!data.playwrightInstalled ? `
            <div class="error" style="margin-bottom: 1rem;">
                <strong>Install Playwright browser</strong><br>
                Run: <code>npx playwright install chromium</code>
            </div>
        ` : `
            <div class="success" style="margin-bottom: 0.75rem;">
                ✅ Playwright ready
            </div>
        `}

        <p class="help" style="margin-bottom: 1rem; color: #7ee787;">
            🎉 <strong>No API key required!</strong> Uses browser automation to scrape public profiles.
        </p>

        <form action="/plugin/twitter" method="POST">
            <!-- Enable -->
            <div style="margin-bottom: 1.5rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable plugin
                </label>
                <p style="margin: 0.5rem 0 0 0; color: #666; font-size: 12px;">
                    Scheduling is configured in <code>config/scheduler.json</code>
                </p>
            </div>

            <h4 style="margin-bottom: 0.75rem; color: #aaa;">📋 Accounts</h4>
            <div>
                <label>Accounts to Scrape</label>
                <div class="tag-list" id="twitter-accounts-list">
                    ${accounts.map(acc => `
                        <span class="tag">
                            @${acc}
                            <button type="button" onclick="removeTwitterAccount('${acc}')">×</button>
                        </span>
                    `).join('')}
                </div>
                <div class="input-group">
                    <input type="text" id="new-twitter-account" placeholder="username (without @)" />
                    <button type="button" class="small-btn" onclick="addTwitterAccount()">+ Add</button>
                </div>
                <input type="hidden" id="twitter-accounts" name="accounts" value="${accounts.join(',')}" />
                <p class="help">Enter Twitter usernames to scrape</p>
            </div>

            <div>
                <label for="tweets-per-account">Tweets per Account</label>
                <input type="text" id="tweets-per-account" name="tweetsPerAccount"
                    value="${tweetsPerAccount}"
                    placeholder="100" />
            </div>

            <div>
                <label for="twitter-github-path">GitHub Output Path</label>
                <input type="text" id="twitter-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="twitter" />
                <p class="help">Folder in your GitHub repo</p>
            </div>

            <button type="submit">💾 Save Twitter Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run twitter:get</code> - Fetch tweets<br>
            <code>npm run twitter:process</code> - Process raw data<br>
            <code>npm run twitter:push</code> - Sync to GitHub
        </p>
    </div>
</details>

<script>
let twitterAccounts = ${JSON.stringify(accounts)};

function updateTwitterAccountsInput() {
    document.getElementById('twitter-accounts').value = twitterAccounts.join(',');
}

function renderTwitterAccountTags() {
    const list = document.getElementById('twitter-accounts-list');
    list.innerHTML = twitterAccounts.map(acc => \`
        <span class="tag">
            @\${acc}
            <button type="button" onclick="removeTwitterAccount('\${acc}')">×</button>
        </span>
    \`).join('');
    updateTwitterAccountsInput();
}

function addTwitterAccount() {
    const input = document.getElementById('new-twitter-account');
    const username = input.value.trim().replace(/^@/, '');
    if (username && !twitterAccounts.includes(username)) {
        twitterAccounts.push(username);
        renderTwitterAccountTags();
        input.value = '';
    }
    input.focus();
}

function removeTwitterAccount(username) {
    twitterAccounts = twitterAccounts.filter(a => a !== username);
    renderTwitterAccountTags();
}

document.getElementById('new-twitter-account')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addTwitterAccount();
    }
});
</script>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): TwitterPluginConfig {
    const accounts = body.accounts ? body.accounts.split(',').filter(a => a.trim()) : [];

    return {
        enabled: body.enabled === 'on',
        accounts,
        tweetsPerAccount: parseInt(body.tweetsPerAccount) || DEFAULT_CONFIG.tweetsPerAccount,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): TwitterPluginConfig {
    return { ...DEFAULT_CONFIG };
}
