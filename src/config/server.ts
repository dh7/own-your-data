/**
 * CONFIG server - Web UI for all connectors
 * Run: npm run config
 */

import express from 'express';
import * as QRCode from 'qrcode';
import makeWASocket, { DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { saveGitHubConfig, loadGitHubConfig, GitHubConfig, loadConfig, saveConfig, getResolvedPaths, PathsConfig } from './config';
import { useSingleFileAuthState } from '../shared/auth-utils';

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// State
let currentQR: string | null = null;
let whatsappConnected = false;
let connectionStatus: 'checking' | 'connected' | 'needs_qr' = 'checking';

/**
 * HTML template for the config UI
 */
function getHTML(githubConfig: GitHubConfig | null, pathsConfig: PathsConfig): string {
  const statusClass = whatsappConnected ? 'connected' : (connectionStatus === 'needs_qr' ? 'pending' : 'pending');
  const statusText = whatsappConnected ? '✅ Connected' : (connectionStatus === 'checking' ? '🔍 Checking...' : '⏳ Scan QR code');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SecondBrain Connectors - Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 2rem;
      font-size: 2rem;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .card h2 {
      color: #333;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .status.connected { background: #d4edda; color: #155724; }
    .status.disconnected { background: #f8d7da; color: #721c24; }
    .status.pending { background: #fff3cd; color: #856404; }
    .qr-container {
      text-align: center;
      padding: 1rem;
    }
    .qr-container img {
      max-width: 300px;
      border-radius: 8px;
      border: 4px solid #667eea;
    }
    form { display: flex; flex-direction: column; gap: 1rem; }
    label {
      font-weight: 500;
      color: #555;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .help {
      font-size: 0.875rem;
      color: #888;
      margin-top: 0.25rem;
    }
    .success {
      background: #d4edda;
      color: #155724;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .step-number {
      background: #667eea;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 0.875rem;
    }
    .info-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }
    .info-btn svg {
      width: 18px;
      height: 18px;
      fill: #667eea;
      transition: fill 0.2s;
    }
    .info-btn:hover svg {
      fill: #5a6fd6;
    }
    .info-popup {
      display: none;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      line-height: 1.6;
    }
    .info-popup.show {
      display: block;
    }
    .info-popup ol {
      margin-left: 1.5rem;
      margin-top: 0.5rem;
    }
    .info-popup li {
      margin-bottom: 0.5rem;
    }
    .info-popup code {
      background: #e9ecef;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      font-size: 0.8rem;
    }
    .info-popup a {
      color: #667eea;
    }
    .password-container {
      position: relative;
      display: flex;
      align-items: center;
    }
    .password-container input {
      padding-right: 2.5rem;
    }
    .toggle-password {
      position: absolute;
      right: 0.75rem;
      background: none;
      border: none;
      cursor: pointer;
      color: #888;
      padding: 0;
      display: flex;
      align-items: center;
    }
    .toggle-password:hover {
      color: #667eea;
    }
    select {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      background: white;
      cursor: pointer;
    }
    select:focus {
      outline: none;
      border-color: #667eea;
    }
    .input-with-btn {
      display: flex;
      gap: 0.5rem;
    }
    .input-with-btn input, .input-with-btn select {
      flex: 1;
    }
    .input-with-btn button {
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      white-space: nowrap;
    }
    .small-btn {
      background: #6c757d;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }
    .small-btn:hover {
      background: #5a6268;
    }
    .auto-detected {
      background: #e8f5e9;
      border-color: #4caf50;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔧 SecondBrain Connectors</h1>

    <!-- Step 1: WhatsApp -->
    <div class="card">
      <h2>
        <span class="step-number">1</span>
        WhatsApp Connection
        <span class="status ${statusClass}">
          ${statusText}
        </span>
      </h2>
      
      ${whatsappConnected
      ? '<p style="color: #155724; font-weight: 500;">✅ WhatsApp is connected! Session saved.</p>'
      : `
        <div class="qr-container">
          ${currentQR
        ? `<img src="${currentQR}" alt="WhatsApp QR Code" />`
        : '<p>⏳ Waiting for QR code from WhatsApp...</p>'
      }
          <p class="help" style="margin-top: 1rem;">Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
          <p class="help"><a href="/" style="color: #667eea;">↻ Refresh page</a> if QR expired</p>
        </div>
      `
    }
    </div>

    <!-- Step 2: GitHub -->
    <div class="card">
      <h2>
        <span class="step-number">2</span>
        GitHub Configuration
        <span class="status ${githubConfig ? 'connected' : 'disconnected'}">
          ${githubConfig ? '✅ Configured' : '❌ Not configured'}
        </span>
      </h2>
      
      <p style="margin-bottom: 1rem;">
        <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" style="color: #667eea; text-decoration: none;">
          🔑 Create/Edit GitHub Token →
        </a>
      </p>
      
      ${githubConfig ? `<div class="success">Saving to: <strong>${githubConfig.owner}/${githubConfig.repo}/${githubConfig.path}</strong></div>` : ''}
      
      ${githubConfig ? `
        <div style="margin-bottom: 1rem;">
          <button type="button" onclick="testGitHub()" id="test-btn" style="background: #17a2b8;">🔗 Test GitHub Connection</button>
          <div id="test-result" style="margin-top: 0.5rem;"></div>
        </div>
      ` : ''}
      
      <form action="/github" method="POST">
        <div>
          <label for="token">
            GitHub Personal Access Token
            <button type="button" class="info-btn" onclick="toggleInfo('token-info')" title="How to create a token">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            </button>
          </label>
          <div id="token-info" class="info-popup">
            <strong>How to create a GitHub token:</strong>
            <ol>
              <li>Open <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">GitHub Token Settings ↗</a> (opens in new window)</li>
              <li>Click <strong>"Generate new token"</strong></li>
              <li>Give it a name like <code>whatsapp-collector</code></li>
              <li>Set expiration (e.g., 90 days or "No expiration")</li>
              <li>Under <strong>"Repository access"</strong>, select "Only select repositories" and choose your data repo</li>
              <li>Under <strong>"Permissions" → "Repository permissions"</strong>:
                <ul>
                  <li><code>Contents</code>: Read and write</li>
                  <li><code>Metadata</code>: Read-only (required)</li>
                </ul>
              </li>
              <li>Click <strong>"Generate token"</strong> and copy it immediately!</li>
            </ol>
          </div>
          <div class="input-with-btn">
            <div class="password-container" style="flex:1;">
              <input type="password" id="token" name="token" 
                value="${githubConfig?.token || ''}"
                placeholder="github_pat_xxxxxxxxxxxx" required />
              <button type="button" class="toggle-password" onclick="togglePassword()" title="Show/Hide Token">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
            <button type="button" class="small-btn" onclick="detectUser()" id="detect-btn">🔍 Detect</button>
          </div>
          <p class="help">After entering token, click Detect to auto-fill owner and load repos</p>
        </div>
        <div>
          <label for="owner">Repository Owner <span id="owner-status"></span></label>
          <input type="text" id="owner" name="owner" 
            value="${githubConfig?.owner || ''}"
            placeholder="(auto-detected from token)" required readonly class="${githubConfig?.owner ? 'auto-detected' : ''}" />
        </div>
        <div>
          <label for="repo">Repository (with write access)</label>
          <select id="repo" name="repo" required>
            <option value="">-- Click "Detect" above first --</option>
            ${githubConfig?.repo ? `<option value="${githubConfig.repo}" selected>${githubConfig.repo}</option>` : ''}
          </select>
          <p class="help">Only shows repos where your token has write permission</p>
        </div>
        <div>
          <label for="path">Folder Path in Repo</label>
          <div class="input-with-btn">
            <select id="path-select" onchange="onPathSelect()">
              <option value="">-- Select repo first --</option>
              ${githubConfig?.path ? `<option value="${githubConfig.path}" selected>${githubConfig.path}/</option>` : ''}
              <option value="__new__">➕ Create new folder...</option>
            </select>
            <input type="text" id="path" name="path" 
              value="${githubConfig?.path || 'whatsapp'}"
              placeholder="whatsapp" required style="display:${githubConfig?.path ? 'none' : 'block'};" />
          </div>
          <p class="help">Select existing folder or create new one</p>
        </div>
        <button type="submit">💾 Save GitHub Config</button>
      </form>
    </div>

    <!-- Step 3: Paths Config -->
    <div class="card">
      <h2>
        <span class="step-number">3</span>
        Storage Paths
        <span class="status connected">✅ Configured</span>
      </h2>
      
      <form action="/paths" method="POST">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div>
            <label for="path-auth">Auth Directory</label>
            <input type="text" id="path-auth" name="auth" value="${pathsConfig.auth}" placeholder="./auth" />
            <p class="help">WhatsApp session & GitHub token</p>
          </div>
          <div>
            <label for="path-logs">Logs Directory</label>
            <input type="text" id="path-logs" name="logs" value="${pathsConfig.logs}" placeholder="./logs" />
            <p class="help">Collection logs</p>
          </div>
          <div>
            <label for="path-raw">Raw Dumps Directory</label>
            <input type="text" id="path-raw" name="rawDumps" value="${pathsConfig.rawDumps}" placeholder="./raw-dumps" />
            <p class="help">Raw API data (source of truth)</p>
          </div>
          <div>
            <label for="path-conv">Conversations Directory</label>
            <input type="text" id="path-conv" name="conversations" value="${pathsConfig.conversations}" placeholder="./conversations" />
            <p class="help">Processed messages output</p>
          </div>
          <div>
            <label for="path-contacts">Contacts Directory</label>
            <input type="text" id="path-contacts" name="contacts" value="${(pathsConfig as any).contacts || './contacts'}" placeholder="./contacts" />
            <p class="help">Synced contacts output</p>
          </div>
        </div>
        <button type="submit" style="margin-top: 1rem;">💾 Save Paths</button>
      </form>
    </div>

    <!-- Step 4: Ready -->
    <div class="card">
      <h2>
        <span class="step-number">4</span>
        Ready to Collect
      </h2>
      ${whatsappConnected && githubConfig
      ? `<p style="color: #155724; font-weight: 500;">✅ All set! You can close this page and run the collector.</p>
         <button onclick="closeConfig()" style="margin-top: 1rem; background: #28a745;">✓ Close Config</button>`
      : `<p style="color: #856404;">Complete the steps above first.</p>`
    }
      <p style="margin-top: 1rem;">To collect and process messages, run:</p>
      <pre style="background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; margin-top: 0.5rem; overflow-x: auto;"># WhatsApp
npm run whatsapp:get      # Collect raw data
npm run whatsapp:process  # Generate local output
npm run whatsapp:push     # Sync to GitHub</pre>
      <p class="help" style="margin-top: 0.5rem;">All 3 are independent. Chain as needed.</p>
    </div>
  </div>

  <script>
    function toggleInfo(id) {
      const el = document.getElementById(id);
      el.classList.toggle('show');
    }
    
    function togglePassword() {
      const input = document.getElementById('token');
      const icon = document.getElementById('eye-icon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
      } else {
        input.type = 'password';
        icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
      }
    }

    async function detectUser() {
      const token = document.getElementById('token').value;
      const btn = document.getElementById('detect-btn');
      const ownerInput = document.getElementById('owner');
      const ownerStatus = document.getElementById('owner-status');
      
      if (!token) {
        alert('Please enter your GitHub Token first');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳...';
      
      try {
        // Get user info
        const res = await fetch('/get-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success) {
          ownerInput.value = data.username;
          ownerInput.classList.add('auto-detected');
          ownerStatus.textContent = '✅';
          
          // Now load repos
          await loadRepos(token);
          btn.textContent = '✅ Done';
        } else {
          ownerStatus.textContent = '❌';
          alert('Error: ' + data.error);
          btn.textContent = '❌ Failed';
        }
      } catch (e) {
        alert('Network error');
        btn.textContent = '❌ Error';
      }
      
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '🔍 Detect';
      }, 2000);
    }

    async function loadRepos(token) {
      const repoSelect = document.getElementById('repo');
      repoSelect.innerHTML = '<option value="">⏳ Loading repos...</option>';
      
      try {
        const res = await fetch('/list-repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        
        if (data.success && data.repos.length > 0) {
          repoSelect.innerHTML = '<option value="">-- Select a repository --</option>';
          data.repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.name;
            option.textContent = repo.name + (repo.private ? ' 🔒' : ' 🌐');
            repoSelect.appendChild(option);
          });
        } else {
          repoSelect.innerHTML = '<option value="">No writable repos found</option>';
        }
      } catch (e) {
        repoSelect.innerHTML = '<option value="">Error loading repos</option>';
      }
    }

    // When repo is selected, load folders
    document.getElementById('repo').addEventListener('change', async function() {
      const token = document.getElementById('token').value;
      const owner = document.getElementById('owner').value;
      const repo = this.value;
      
      if (!repo) return;
      await loadFolders(token, owner, repo);
    });

    async function loadFolders(token, owner, repo) {
      const pathSelect = document.getElementById('path-select');
      const pathInput = document.getElementById('path');
      pathSelect.innerHTML = '<option value="">⏳ Loading folders...</option>';
      
      try {
        const res = await fetch('/list-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, owner, repo })
        });
        const data = await res.json();
        
        pathSelect.innerHTML = '';
        
        if (data.success && data.folders.length > 0) {
          data.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder + '/';
            pathSelect.appendChild(option);
          });
        }
        
        // Always add "create new" option
        const newOption = document.createElement('option');
        newOption.value = '__new__';
        newOption.textContent = '➕ Create new folder...';
        pathSelect.appendChild(newOption);
        
        // Default to whatsapp if exists, otherwise show input
        const whatsappExists = data.folders?.includes('whatsapp');
        if (whatsappExists) {
          pathSelect.value = 'whatsapp';
          pathInput.style.display = 'none';
          pathInput.value = 'whatsapp';
        } else {
          pathSelect.value = '__new__';
          pathInput.style.display = 'block';
          pathInput.value = 'whatsapp';
        }
      } catch (e) {
        pathSelect.innerHTML = '<option value="__new__">➕ Create new folder...</option>';
        pathInput.style.display = 'block';
      }
    }

    function onPathSelect() {
      const pathSelect = document.getElementById('path-select');
      const pathInput = document.getElementById('path');
      
      if (pathSelect.value === '__new__') {
        pathInput.style.display = 'block';
        pathInput.value = 'whatsapp';
        pathInput.focus();
      } else {
        pathInput.style.display = 'none';
        pathInput.value = pathSelect.value;
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
          result.innerHTML = '<div style="background:#d4edda;color:#155724;padding:0.75rem;border-radius:8px;">✅ ' + data.message + '</div>';
        } else {
          result.innerHTML = '<div style="background:#f8d7da;color:#721c24;padding:0.75rem;border-radius:8px;"><strong>❌ Error:</strong> ' + data.error + '<br><small style="opacity:0.8">' + (data.details || '') + '</small></div>';
        }
      } catch (e) {
        result.innerHTML = '<div style="background:#f8d7da;color:#721c24;padding:0.75rem;border-radius:8px;">❌ Network error: ' + e.message + '</div>';
      }
      
      btn.disabled = false;
      btn.textContent = '🔗 Test GitHub Connection';
    }
    
    async function closeConfig() {
      try {
        await fetch('/shutdown', { method: 'POST' });
      } catch (e) {
        // Server closed
      }
      window.close();
      // If window.close doesn't work, show message
      setTimeout(() => {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-size:1.5rem;text-align:center;"><div>✅ Config complete!<br><br>You can close this tab.</div></div>';
      }, 100);
    }
    
    // Auto-refresh while waiting for connection (every 3 seconds)
    ${!whatsappConnected ? 'setTimeout(() => location.reload(), 3000);' : ''}
  </script>
</body>
</html>
`;
}

// Routes
app.get('/', async (req, res) => {
  const githubConfig = await loadGitHubConfig();
  const config = await loadConfig();
  res.send(getHTML(githubConfig, config.paths));
});

// Save paths config
app.post('/paths', async (req, res) => {
  const { auth, logs, rawDumps, conversations, contacts } = req.body;
  const config = await loadConfig();

  config.paths = {
    auth: auth || './auth',
    logs: logs || './logs',
    rawDumps: rawDumps || './raw-dumps',
    conversations: conversations || './conversations',
    contacts: contacts || './contacts',
  };

  await saveConfig(config);
  console.log('✅ Paths config saved');
  res.redirect('/');
});

app.post('/github', async (req, res) => {
  const { token, owner, repo, path: repoPath } = req.body;

  if (!token || !owner || !repo || !repoPath) {
    res.status(400).send('All fields are required');
    return;
  }

  await saveGitHubConfig({
    token,
    owner,
    repo,
    path: repoPath,
  });

  console.log('✅ GitHub config saved');
  res.redirect('/');
});

app.get('/status', (req, res) => {
  res.json({ qr: currentQR, connected: whatsappConnected, status: connectionStatus });
});

// Test GitHub connection endpoint
app.post('/test-github', async (req, res) => {
  const githubConfig = await loadGitHubConfig();

  if (!githubConfig) {
    res.json({ success: false, error: 'GitHub not configured' });
    return;
  }

  const { token, owner, repo, path: repoPath } = githubConfig;
  const filePath = `${repoPath}/whatsapp_connector.md`;
  const now = new Date();
  const content = `# WhatsApp Connector

Connection test successful!

- **Date**: ${now.toISOString()}
- **Repository**: ${owner}/${repo}
- **Path**: ${repoPath}

This file confirms your GitHub token has write access.
`;

  try {
    // First, try to get existing file (for SHA)
    let sha: string | undefined;
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;

    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    if (getRes.ok) {
      const existing = await getRes.json() as { sha: string };
      sha = existing.sha;
    }

    // Create or update file
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `WhatsApp Connector test - ${now.toISOString()}`,
        content: Buffer.from(content).toString('base64'),
        ...(sha && { sha }),
      }),
    });

    if (putRes.ok) {
      console.log('✅ GitHub test successful');
      res.json({ success: true, message: `File created at ${owner}/${repo}/${filePath}` });
    } else {
      const errorData = await putRes.json() as { message?: string, documentation_url?: string };
      console.error('❌ GitHub test failed:', errorData.message);
      res.json({
        success: false,
        error: errorData.message || 'Failed to write file',
        details: `Status: ${putRes.status} ${putRes.statusText}<br>URL: ${errorData.documentation_url || ''}`
      });
    }
  } catch (e: any) {
    console.error('❌ GitHub test error:', e);
    res.json({ success: false, error: e.message, details: e.stack });
  }
});

// Get user from token
app.post('/get-user', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.json({ success: false, error: 'Token required' });
    return;
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });

    if (!response.ok) {
      const err = await response.json() as { message: string };
      throw new Error(err.message || response.statusText);
    }

    const user = await response.json() as { login: string };
    res.json({ success: true, username: user.login });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// List repos endpoint - only repos with push access
app.post('/list-repos', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.json({ success: false, error: 'Token required' });
    return;
  }

  try {
    const url = 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator';

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });

    if (!response.ok) {
      const err = await response.json() as { message: string };
      throw new Error(err.message || response.statusText);
    }

    const repos = await response.json() as Array<{
      name: string,
      full_name: string,
      private: boolean,
      permissions?: { push?: boolean }
    }>;

    // Filter to only repos where we have push access
    const writableRepos = repos
      .filter(r => r.permissions?.push === true)
      .map(r => ({ name: r.name, private: r.private }));

    res.json({ success: true, repos: writableRepos });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// List folders in repo
app.post('/list-folders', async (req, res) => {
  const { token, owner, repo } = req.body;
  if (!token || !owner || !repo) {
    res.json({ success: false, error: 'Token, owner, and repo required' });
    return;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });

    if (response.status === 404) {
      // Empty repo or doesn't exist
      res.json({ success: true, folders: [] });
      return;
    }

    if (!response.ok) {
      const err = await response.json() as { message: string };
      throw new Error(err.message || response.statusText);
    }

    const contents = await response.json() as Array<{ name: string, type: string }>;
    const folders = contents
      .filter(item => item.type === 'dir')
      .map(item => item.name);

    res.json({ success: true, folders });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// Shutdown endpoint
app.post('/shutdown', (req, res) => {
  res.json({ ok: true });
  console.log('\n👋 Config complete! Shutting down...');
  setTimeout(() => process.exit(0), 500);
});

/**
 * Check WhatsApp session status
 * If session file exists, assume connected (don't actually connect to avoid message loss)
 * If no session, start connection to get QR code
 */
async function checkOrStartWhatsApp() {
  const config = await loadConfig();
  const paths = getResolvedPaths(config);
  const sessionPath = paths.whatsappSession;

  // Check if session file exists
  try {
    await fs.access(sessionPath);
    // Session file exists - assume we're good
    console.log('✅ WhatsApp session found at:', sessionPath);
    whatsappConnected = true;
    connectionStatus = 'connected';
    return;
  } catch {
    // No session file - need to create one via QR scan
    console.log('📱 No WhatsApp session found. Starting QR flow...');
  }

  // Only connect if we need to get a QR code
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });

  const { state, saveCreds } = await useSingleFileAuthState(sessionPath);

  console.log('📱 Connecting to WhatsApp for QR code...');

  const sock = makeWASocket({
    auth: state,
    // Don't print QR to terminal - only web UI
  });

  // Save credentials when updated
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR code received - means we need to authenticate
    if (qr) {
      connectionStatus = 'needs_qr';
      console.log('📱 QR Code received - show on web page');
      try {
        currentQR = await QRCode.toDataURL(qr);
      } catch (e) {
        console.error('QR generation error:', e);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log('Connection closed, status:', statusCode);

      // Restart required (after QR scan) - create new socket
      if (statusCode === DisconnectReason.restartRequired) {
        console.log('🔄 Restart required - reconnecting...');
        checkOrStartWhatsApp();
        return;
      }

      // Logged out - need new QR
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Logged out - will need new QR scan');
        connectionStatus = 'needs_qr';
        whatsappConnected = false;
        currentQR = null;
        // Restart to get new QR
        setTimeout(checkOrStartWhatsApp, 2000);
        return;
      }

      // Session created successfully - disconnect and mark as ready
      if (whatsappConnected) {
        console.log('✅ Session saved. Disconnecting to avoid message consumption.');
        sock.end(undefined);
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected! Session saved.');
      whatsappConnected = true;
      connectionStatus = 'connected';
      currentQR = null;
      // Disconnect after successful auth to avoid consuming messages
      console.log('🔌 Disconnecting config server (use whatsapp:get to collect messages)');
      setTimeout(() => sock.end(undefined), 2000);
    }
  });
}

/**
 * Open URL in default browser (cross-platform)
 */
function openBrowser(url: string) {
  const platform = process.platform;
  let cmd: string;

  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.log(`📋 Please open manually: ${url}`);
    }
  });
}

// Start
async function main() {
  console.log('🚀 WhatsApp Collector Config\n');

  // Start HTTP server first
  const url = `http://localhost:${PORT}`;
  app.listen(PORT, () => {
    console.log(`🌐 Config server running at ${url}`);
    console.log('Opening browser...\n');
    openBrowser(url);
  });

  // Check WhatsApp session (only connects if no session exists)
  checkOrStartWhatsApp();
}

main().catch(console.error);
