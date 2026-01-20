/**
 * Twitter configuration section
 */

import { TwitterConfig } from '../config';

export interface TwitterData {
    config?: TwitterConfig;
    playwrightInstalled: boolean;
}

export function renderTwitterSection(data: TwitterData, collapsed: boolean = true): string {
    const accounts = data.config?.accounts || [];

    const githubPath = data.config?.githubPath || 'twitter';
    const tweetsPerAccount = data.config?.tweetsPerAccount || 100;

    const isReady = data.playwrightInstalled && accounts.length > 0;
    const statusClass = isReady ? 'connected' : 'pending';
    const statusText = isReady ? `✅ ${accounts.length} account(s)` : '⚠️ Setup needed';

    return `
<details>
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
        
        <form action="/twitter" method="POST">
            <div>
                <label>Accounts to Scrape</label>
                <div class="tag-list" id="accounts-list">
                    ${accounts.map(acc => `
                        <span class="tag">
                            @${acc}
                            <button type="button" onclick="removeAccount('${acc}')">×</button>
                        </span>
                    `).join('')}
                </div>
                <div class="input-group">
                    <input type="text" id="new-account" placeholder="username (without @)" />
                    <button type="button" class="small-btn" onclick="addAccount()">+ Add</button>
                </div>
                <input type="hidden" id="accounts" name="accounts" value="${accounts.join(',')}" />
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
            <code>npm run twitter:push</code> - Sync to GitHub
        </p>
    </div>
</details>

<script>
let twitterAccounts = ${JSON.stringify(accounts)};

function updateAccountsInput() {
    document.getElementById('accounts').value = twitterAccounts.join(',');
}

function renderAccountTags() {
    const list = document.getElementById('accounts-list');
    list.innerHTML = twitterAccounts.map(acc => \`
        <span class="tag">
            @\${acc}
            <button type="button" onclick="removeAccount('\${acc}')">×</button>
        </span>
    \`).join('');
    updateAccountsInput();
}

function addAccount() {
    const input = document.getElementById('new-account');
    const username = input.value.trim().replace(/^@/, '');
    if (username && !twitterAccounts.includes(username)) {
        twitterAccounts.push(username);
        renderAccountTags();
        input.value = '';
    }
    input.focus();
}

function removeAccount(username) {
    twitterAccounts = twitterAccounts.filter(a => a !== username);
    renderAccountTags();
}

document.getElementById('new-account')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addAccount();
    }
});
</script>
`;
}
