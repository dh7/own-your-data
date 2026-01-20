/**
 * CONFIG server - Web UI for all connectors
 * Run: npm run config
 */

import express from 'express';
import * as QRCode from 'qrcode';
import makeWASocket, { DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import { chromium } from 'playwright'; // Add playwright import
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { saveGitHubConfig, loadGitHubConfig, loadConfig, saveConfig, getResolvedPaths } from './config';
import { useSingleFileAuthState } from '../shared/auth-utils';

// Templates
import { renderLayout } from './templates/layout';
import { renderStorageSection } from './templates/storage';
import { renderGitHubSection } from './templates/github';
import { renderWhatsAppSection } from './templates/whatsapp';
import { renderTwitterSection } from './templates/twitter';
import { renderInstagramSection } from './templates/instagram';

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// State
let currentQR: string | null = null;
let whatsappConnected = false;
let connectionStatus: 'checking' | 'connected' | 'needs_qr' = 'checking';

// ============ ROUTES ============

// Main page
app.get('/', async (req, res) => {
  const githubConfig = await loadGitHubConfig();
  const config = await loadConfig();

  // Check if Playwright is installed
  let playwrightInstalled = false;
  try {
    await fs.access(path.join(process.cwd(), 'node_modules', 'playwright'));
    playwrightInstalled = true;
  } catch { /* playwright not installed */ }

  // Get persisted collapsed state from query
  const savedSection = req.query.saved as string | undefined;

  const sections = [
    renderStorageSection(config.storage, savedSection === 'storage'),
    renderGitHubSection(githubConfig, savedSection === 'github'),
    renderWhatsAppSection({
      connected: whatsappConnected,
      status: connectionStatus,
      qrCode: currentQR,
      config: config.whatsapp,
    }, savedSection === 'whatsapp'),
    renderTwitterSection({
      config: config.twitter,
      playwrightInstalled,
    }, savedSection === 'twitter'),
    renderInstagramSection({
      config: config.instagram,
      playwrightInstalled,
      isLoggedIn: await checkInstagramAuth(getResolvedPaths(config))
    }, savedSection === 'instagram'),
  ];

  res.send(renderLayout(sections));
});

// Save storage config
app.post('/storage', async (req, res) => {
  const { auth, logs, rawDumps, connectorData } = req.body;
  const config = await loadConfig();

  config.storage = {
    auth: auth || './auth',
    logs: logs || './logs',
    rawDumps: rawDumps || './raw-dumps',
    connectorData: connectorData || './connector_data',
  };

  await saveConfig(config);
  console.log('✅ Storage config saved');
  res.redirect('/?saved=storage');
});

// Save GitHub config
app.post('/github', async (req, res) => {
  const { token, owner, repo } = req.body;

  if (!token || !owner || !repo) {
    res.status(400).send('All fields are required');
    return;
  }

  await saveGitHubConfig({ token, owner, repo });
  console.log('✅ GitHub config saved');
  res.redirect('/?saved=github');
});

// Save WhatsApp config
app.post('/whatsapp', async (req, res) => {
  const { githubPath } = req.body;
  const config = await loadConfig();

  config.whatsapp = {
    githubPath: githubPath || 'whatsapp',
  };

  await saveConfig(config);
  console.log('✅ WhatsApp config saved');
  res.redirect('/?saved=whatsapp');
});

// Save Twitter config
app.post('/twitter', async (req, res) => {
  const { accounts, tweetsPerAccount, githubPath } = req.body;
  const config = await loadConfig();

  // Save Twitter config
  const accountList = accounts ? accounts.split(',').filter((a: string) => a.trim()) : [];
  config.twitter = {
    githubPath: githubPath || 'twitter',
    accounts: accountList,
    tweetsPerAccount: parseInt(tweetsPerAccount) || 100,
  };

  await saveConfig(config);
  console.log('✅ Twitter config saved');
  res.redirect('/?saved=twitter');
  res.redirect('/?saved=twitter');
});

// Save Instagram config
app.post('/instagram', async (req, res) => {
  const { accounts, postsPerAccount, githubPath } = req.body;
  const config = await loadConfig();

  const accountList = accounts ? accounts.split(',').filter((a: string) => a.trim()) : [];
  config.instagram = {
    githubPath: githubPath || 'instagram',
    accounts: accountList,
    postsPerAccount: parseInt(postsPerAccount) || 50,
  };

  await saveConfig(config);
  console.log('✅ Instagram config saved');
  res.redirect('/?saved=instagram');
});

// Instagram Login
app.post('/instagram/login', async (req, res) => {
  try {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    console.log('📸 Starting Instagram login flow...');

    // Ensure auth dir
    await fs.mkdir(paths.auth, { recursive: true });

    const browser = await chromium.launch({
      headless: false,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Auth state path
    const statePath = path.join(paths.auth, 'instagram-state.json');

    // Goto Instagram
    await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded' });

    // Check if already logged in (unlikely if we're here, but maybe user had weird state)
    let isLoggedIn = false;
    try {
      await page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 3000 });
      isLoggedIn = true;
    } catch { }

    if (!isLoggedIn) {
      // Wait for user to log in
      // Poll for success element
      console.log('⏳ Waiting for user to log in...');

      // Wait up to 5 minutes
      await page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 300000 });
    }

    // Save state
    await context.storageState({ path: statePath });
    console.log('✅ Instagram session saved!');

    await browser.close();

    res.json({ success: true });
  } catch (e: any) {
    console.error('Instagram login failed:', e);
    res.json({ success: false, error: e.message });
  }
});

app.get('/status', (req, res) => {
  res.json({ qr: currentQR, connected: whatsappConnected, status: connectionStatus });
});

// Test GitHub connection
app.post('/test-github', async (req, res) => {
  const githubConfig = await loadGitHubConfig();

  if (!githubConfig) {
    res.json({ success: false, error: 'GitHub not configured' });
    return;
  }

  const { token, owner, repo } = githubConfig;
  const filePath = 'connector_test.md';
  const now = new Date();
  const content = `# Connector Test\n\nConnection test successful!\n\n- **Date**: ${now.toISOString()}\n- **Repository**: ${owner}/${repo}\n`;

  try {
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

    const putRes = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Connector test - ${now.toISOString()}`,
        content: Buffer.from(content).toString('base64'),
        ...(sha && { sha }),
      }),
    });

    if (putRes.ok) {
      res.json({ success: true, message: `File created at ${owner}/${repo}/${filePath}` });
    } else {
      const errorData = await putRes.json() as { message?: string };
      res.json({ success: false, error: errorData.message || 'Failed to write file' });
    }
  } catch (e: any) {
    res.json({ success: false, error: e.message });
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

// List repos
app.post('/list-repos', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.json({ success: false, error: 'Token required' });
    return;
  }

  try {
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      }
    });

    if (!response.ok) {
      const err = await response.json() as { message: string };
      throw new Error(err.message || response.statusText);
    }

    const repos = await response.json() as Array<{ name: string; private: boolean; permissions?: { push?: boolean } }>;
    const writableRepos = repos
      .filter(r => r.permissions?.push)
      .map(r => ({ name: r.name, private: r.private }));

    res.json({ success: true, repos: writableRepos });
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

// ============ HELPERS ============

async function checkInstagramAuth(paths: any): Promise<boolean> {
  try {
    await fs.access(path.join(paths.auth, 'instagram-state.json'));
    return true;
  } catch {
    return false;
  }
}

// ============ WHATSAPP ============


async function checkOrStartWhatsApp() {
  const config = await loadConfig();
  const paths = getResolvedPaths(config);
  const sessionPath = paths.whatsappSession;

  try {
    await fs.access(sessionPath);
    console.log('✅ WhatsApp session found at:', sessionPath);
    whatsappConnected = true;
    connectionStatus = 'connected';
    return;
  } catch {
    console.log('📱 No WhatsApp session found. Starting QR flow...');
  }

  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  const { state, saveCreds } = await useSingleFileAuthState(sessionPath);

  console.log('📱 Connecting to WhatsApp for QR code...');

  const sock = makeWASocket({
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'needs_qr';
      console.log('📱 QR Code received');
      try {
        currentQR = await QRCode.toDataURL(qr);
      } catch (e) {
        console.error('QR generation error:', e);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (statusCode === DisconnectReason.restartRequired) {
        console.log('🔄 Restart required - reconnecting...');
        checkOrStartWhatsApp();
        return;
      }

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Logged out - will need new QR scan');
        connectionStatus = 'needs_qr';
        whatsappConnected = false;
        currentQR = null;
        setTimeout(checkOrStartWhatsApp, 2000);
        return;
      }

      if (whatsappConnected) {
        sock.end(undefined);
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected! Session saved.');
      whatsappConnected = true;
      connectionStatus = 'connected';
      currentQR = null;
      setTimeout(() => sock.end(undefined), 2000);
    }
  });
}

// ============ START ============

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

async function main() {
  console.log('🚀 SecondBrain Connectors Config\n');

  const url = `http://localhost:${PORT}`;
  app.listen(PORT, () => {
    console.log(`🌐 Config server running at ${url}`);
    console.log('Opening browser...\n');
    openBrowser(url);
  });

  checkOrStartWhatsApp();
}

main().catch(console.error);
