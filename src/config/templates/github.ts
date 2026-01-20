/**
 * GitHub (GitStore) configuration section
 */

import { GitHubConfig } from '../config';

export function renderGitHubSection(config: GitHubConfig | null, collapsed: boolean = true): string {
    const statusClass = config ? 'connected' : 'disconnected';
    const statusText = config ? '✅ Configured' : '❌ Not configured';

    return `
<details>
    <summary>
        <span class="icon">📦</span>
        GitStore (GitHub)
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <p style="margin-bottom: 1rem;">
            <a href="https://github.com/settings/tokens?type=beta" target="_blank" style="color: #667eea;">
                🔑 Create/Edit GitHub Token →
            </a>
        </p>
        
        ${config ? `<div class="success">Connected to: <strong>${config.owner}/${config.repo}</strong></div>` : ''}
        
        ${config ? `
            <div style="margin-bottom: 1rem;">
                <button type="button" onclick="testGitHub()" id="test-btn" style="background: #17a2b8;">
                    🔗 Test Connection
                </button>
                <div id="test-result" style="margin-top: 0.5rem;"></div>
            </div>
        ` : ''}
        
        <form action="/github" method="POST">
            <div>
                <label for="token">Personal Access Token</label>
                <div class="input-group">
                    <div class="password-container">
                        <input type="password" id="token" name="token" 
                            value="${config?.token || ''}"
                            placeholder="github_pat_xxxxxxxxxxxx" required />
                        <button type="button" class="toggle-password" onclick="togglePassword('token')">
                            👁
                        </button>
                    </div>
                    <button type="button" class="small-btn" onclick="detectUser()" id="detect-btn">
                        🔍 Detect
                    </button>
                </div>
                <p class="help">After entering token, click Detect to auto-fill owner and load repos</p>
            </div>
            <div>
                <label for="owner">Repository Owner</label>
                <input type="text" id="owner" name="owner" 
                    value="${config?.owner || ''}"
                    placeholder="(auto-detected from token)" required readonly />
            </div>
            <div>
                <label for="repo">Repository</label>
                <select id="repo" name="repo" required>
                    <option value="">-- Click "Detect" above first --</option>
                    ${config?.repo ? `<option value="${config.repo}" selected>${config.repo}</option>` : ''}
                </select>
            </div>
            <button type="submit">💾 Save GitHub Config</button>
        </form>
    </div>
</details>

<script>
function togglePassword(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function detectUser() {
    const token = document.getElementById('token').value;
    const btn = document.getElementById('detect-btn');
    const ownerInput = document.getElementById('owner');
    
    if (!token) {
        alert('Please enter your GitHub Token first');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳...';
    
    try {
        const res = await fetch('/get-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success) {
            ownerInput.value = data.username;
            await loadRepos(token);
            btn.textContent = '✅';
        } else {
            alert('Error: ' + data.error);
            btn.textContent = '❌';
        }
    } catch (e) {
        alert('Network error');
        btn.textContent = '❌';
    }
    
    setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '🔍 Detect';
    }, 2000);
}

async function loadRepos(token) {
    const repoSelect = document.getElementById('repo');
    repoSelect.innerHTML = '<option value="">⏳ Loading...</option>';
    
    try {
        const res = await fetch('/list-repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success && data.repos.length > 0) {
            repoSelect.innerHTML = '<option value="">-- Select --</option>';
            data.repos.forEach(repo => {
                const option = document.createElement('option');
                option.value = repo.name;
                option.textContent = repo.name + (repo.private ? ' 🔒' : ' 🌐');
                repoSelect.appendChild(option);
            });
        } else {
            repoSelect.innerHTML = '<option value="">No repos found</option>';
        }
    } catch (e) {
        repoSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

async function testGitHub() {
    const btn = document.getElementById('test-btn');
    const result = document.getElementById('test-result');
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
    result.innerHTML = '';
    
    try {
        const res = await fetch('/test-github', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            result.innerHTML = '<div class="success">✅ ' + data.message + '</div>';
        } else {
            result.innerHTML = '<div class="error">❌ ' + data.error + '</div>';
        }
    } catch (e) {
        result.innerHTML = '<div class="error">❌ Network error</div>';
    }
    
    btn.disabled = false;
    btn.textContent = '🔗 Test Connection';
}
</script>
`;
}
