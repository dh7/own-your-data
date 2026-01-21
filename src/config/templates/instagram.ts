/**
 * Instagram configuration section
 */

import { InstagramConfig } from '../config';

export interface InstagramData {
    config?: InstagramConfig;
    playwrightInstalled: boolean;
    isLoggedIn: boolean;
}

export function renderInstagramSection(data: InstagramData, justSaved: boolean = false): string {
    const accounts = data.config?.accounts || [];
    const githubPath = data.config?.githubPath || 'instagram';
    const postsPerAccount = data.config?.postsPerAccount || 50;

    const isReady = data.playwrightInstalled && data.isLoggedIn && accounts.length > 0;
    const statusClass = isReady ? 'connected' : 'pending';

    let statusText = '⚠️ Setup needed';
    if (isReady) {
        statusText = `✅ Connected (${accounts.length} accounts)`;
    } else if (data.isLoggedIn) {
        statusText = `⚠️ Add accounts`;
    } else if (!data.playwrightInstalled) {
        statusText = `⚠️ Install Playwright`;
    } else if (!data.isLoggedIn) {
        statusText = `⚠️ Login needed`;
    }

    // justSaved = true means section was just saved, so keep it open
    // justSaved = false means normal load, keep it collapsed
    return `
<details>
    <summary>
        <span class="icon">📸</span>
        Instagram
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <!-- Playwright status -->
        ${!data.playwrightInstalled ? `
            <div class="error" style="margin-bottom: 1rem;">
                <strong>Install Playwright browser</strong><br>
                Run: <code>npx playwright install chromium</code>
            </div>
        ` : ''}

        <!-- Login Status -->
        <div class="card ${data.isLoggedIn ? 'success-card' : 'warning-card'}" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>Authentication Status</strong><br>
                    ${data.isLoggedIn
            ? '✅ Session active (Logged in)'
            : '❌ Not logged in'
        }
                </div>
                <div>
                    <button type="button" class="btn secondary" id="insta-login-btn" onclick="loginInstagram()">
                        ${data.isLoggedIn ? '🔄 Re-Login' : '🔐 Login with Browser'}
                    </button>
                </div>
            </div>
            <div id="insta-login-message" style="margin-top: 0.5rem; display: none; font-size: 0.9em;"></div>
        </div>
        
        <form action="/instagram" method="POST">
            <div>
                <label>Accounts to Scrape</label>
                <div class="tag-list" id="insta-accounts-list">
                    ${accounts.map(acc => `
                        <span class="tag">
                            @${acc}
                            <button type="button" onclick="removeInstaAccount('${acc}')">×</button>
                        </span>
                    `).join('')}
                </div>
                <div class="input-group">
                    <input type="text" id="new-insta-account" placeholder="username" />
                    <button type="button" class="small-btn" onclick="addInstaAccount()">+ Add</button>
                </div>
                <input type="hidden" id="insta-accounts" name="accounts" value="${accounts.join(',')}" />
            </div>
            
            <div>
                <label for="posts-per-account">Posts per Account</label>
                <input type="text" id="posts-per-account" name="postsPerAccount" 
                    value="${postsPerAccount}"
                    placeholder="50" />
            </div>
            
            <div>
                <label for="insta-github-path">GitHub Output Path</label>
                <input type="text" id="insta-github-path" name="githubPath" 
                    value="${githubPath}"
                    placeholder="instagram" />
            </div>
            
            <button type="submit">💾 Save Instagram Config</button>
        </form>
        
        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />
        
        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run instagram:get</code> - Fetch posts<br>
            <code>npm run instagram:push</code> - Sync to GitHub
        </p>
    </div>
</details>

<script>
let instaAccounts = ${JSON.stringify(accounts)};

function updateInstaAccountsInput() {
    document.getElementById('insta-accounts').value = instaAccounts.join(',');
}

function renderInstaAccountTags() {
    const list = document.getElementById('insta-accounts-list');
    list.innerHTML = instaAccounts.map(acc => \`
        <span class="tag">
            @\${acc}
            <button type="button" onclick="removeInstaAccount('\${acc}')">×</button>
        </span>
    \`).join('');
    updateInstaAccountsInput();
}

function addInstaAccount() {
    const input = document.getElementById('new-insta-account');
    const username = input.value.trim().replace(/^@/, '');
    if (username && !instaAccounts.includes(username)) {
        instaAccounts.push(username);
        renderInstaAccountTags();
        input.value = '';
    }
    input.focus();
}

function removeInstaAccount(username) {
    instaAccounts = instaAccounts.filter(a => a !== username);
    renderInstaAccountTags();
}

async function loginInstagram() {
    const btn = document.getElementById('insta-login-btn');
    const msg = document.getElementById('insta-login-message');
    
    btn.disabled = true;
    btn.innerText = '🌐 Browser Opening...';
    msg.style.display = 'block';
    msg.style.color = '#79c0ff';
    msg.innerText = 'Please log in to Instagram in the popup browser window...';

    try {
        const res = await fetch('/instagram/login', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            msg.style.color = '#7ee787';
            msg.innerText = '✅ Login successful! Reloading...';
            setTimeout(() => window.location.reload(), 1000);
        } else {
            msg.style.color = '#ff7b72';
            msg.innerText = '❌ Error: ' + (data.error || 'Unknown error');
            btn.disabled = false;
            btn.innerText = '🔐 Login with Browser';
        }
    } catch (e) {
        msg.style.color = '#ff7b72';
        msg.innerText = '❌ Error: ' + e.message;
        btn.disabled = false;
        btn.innerText = '🔐 Login with Browser';
    }
}

document.getElementById('new-insta-account')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addInstaAccount();
    }
});
</script>
`;
}
