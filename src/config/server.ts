/**
 * CONFIG server - Web UI for all connectors
 * Run: npm run config
 *
 * Uses plugin discovery to dynamically load and render plugin config sections.
 */

import express from 'express';
import * as QRCode from 'qrcode';
import makeWASocket, { DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import multer from 'multer';
import { saveGitHubConfig, loadGitHubConfig, loadConfig, saveConfig, getResolvedPaths, setPluginConfig } from './config';
import { useSingleFileAuthState } from '../shared/auth-utils';
import { discoverPlugins, loadPluginModule } from '../plugins';

// Templates
import { renderLayout } from './templates/layout';
import { renderSystemSection, renderPluginsDivider, TunnelRouteInfo } from './templates/system';
import { renderGitHubSection } from './templates/github';
import { renderFileBrowserSection } from './templates/filebrowser';
import { renderDomainSection, TunnelPluginInfo } from './templates/domain';

// Tunnel
import {
  getTunnelStatusAsync,
  startTunnel,
  stopTunnel,
  checkCloudflared,
  installCloudflared,
  startTunnelWithToken,
  saveTunnelConfig,
  deleteTunnelConfig,
} from '../tunnel/manager';
import { saveCredentials, loadCredentials, loadTunnelConfig } from '../tunnel/config';
import {
  testCredentials,
  setupTunnel,
  teardownTunnel,
} from '../tunnel/cloudflare-api';
import { PROXY_PORT } from '../tunnel/proxy';

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// State
let currentQR: string | null = null;
let whatsappConnected = false;
let connectionStatus: 'checking' | 'connected' | 'needs_qr' = 'checking';

// ============ HELPERS ============

async function checkPlaywright(): Promise<{ installed: boolean; browsers: boolean }> {
  let installed = false;
  let browsers = false;

  try {
    await fs.access(path.join(process.cwd(), 'node_modules', 'playwright'));
    installed = true;

    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const possiblePaths = [
      path.join(homeDir, '.cache', 'ms-playwright'),
      path.join(homeDir, 'Library', 'Caches', 'ms-playwright'),
      path.join(homeDir, 'AppData', 'Local', 'ms-playwright'),
    ];

    for (const cachePath of possiblePaths) {
      try {
        const entries = await fs.readdir(cachePath);
        if (entries.some(e => e.toLowerCase().startsWith('chromium'))) {
          browsers = true;
          break;
        }
      } catch { }
    }
  } catch { }

  return { installed, browsers };
}

async function checkInstagramAuth(paths: ReturnType<typeof getResolvedPaths>): Promise<boolean> {
  try {
    await fs.access(path.join(paths.auth, 'instagram-state.json'));
    return true;
  } catch {
    return false;
  }
}

async function checkDaemonRunning(): Promise<boolean> {
  try {
    const pidPath = path.join(process.cwd(), 'logs', 'get_all.pid');
    await fs.access(pidPath);
    // TODO: strictly we should check if process is alive, but existence is good enough for now
    return true;
  } catch {
    return false;
  }
}

async function checkSyncthing(): Promise<boolean> {
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    await execAsync('which syncthing');
    return true;
  } catch {
    return false;
  }
}

// ============ ROUTES ============

// Main page
app.get('/', async (req, res) => {
  const githubConfig = await loadGitHubConfig();
  const config = await loadConfig();
  const paths = getResolvedPaths(config);
  const savedSection = req.query.saved as string | undefined;

  const playwright = await checkPlaywright();
  const playwrightInstalled = playwright.installed && playwright.browsers;
  const daemonRunning = await checkDaemonRunning();
  const syncthingInstalled = await checkSyncthing();
  const tunnelStatus = await getTunnelStatusAsync();

  // Discover and render plugin sections
  const plugins = await discoverPlugins();

  // Build tunnel routes info from plugins (for both system and domain sections)
  const tunnelPlugins: TunnelPluginInfo[] = plugins
    .filter(p => p.manifest.tunnel?.enabled)
    .map(p => ({
      pluginId: p.manifest.id,
      pluginName: p.manifest.name,
      pluginIcon: p.manifest.icon,
      pathPrefix: p.manifest.tunnel!.pathPrefix,
      port: p.manifest.tunnel!.port,
      routeCount: p.manifest.tunnel!.routes.length,
    }));

  // Build core sections first: System, Your Domain, File Browser, GitHub
  const sections: string[] = [
    renderSystemSection(config, plugins, {
      playwrightInstalled: playwright.installed,
      browsersInstalled: playwright.browsers,
      daemonRunning,
      syncthingInstalled,
      cloudflaredInstalled: tunnelStatus.cloudflaredInstalled,
      tunnelRunning: tunnelStatus.tunnelRunning,
      tunnelUrl: tunnelStatus.tunnelUrl,
      tunnelRoutes: tunnelPlugins,
    }, savedSection === 'system' || savedSection === 'storage' || savedSection === 'daemon'),
    renderDomainSection(
      {
        cloudflaredInstalled: tunnelStatus.cloudflaredInstalled,
        credentialsConfigured: tunnelStatus.credentialsConfigured,
        tunnelConfigured: tunnelStatus.tunnelConfigured,
        tunnelRunning: tunnelStatus.tunnelRunning,
        tunnelUrl: tunnelStatus.tunnelUrl,
        tunnelConfig: tunnelStatus.tunnelConfig,
      },
      tunnelPlugins,
      savedSection === 'domain'
    ),
    renderFileBrowserSection(),
    renderGitHubSection(githubConfig, savedSection === 'github'),
  ];

  // Add title-style divider before plugins
  sections.push(renderPluginsDivider());



  for (const discovered of plugins) {
    const plugin = await loadPluginModule(discovered.manifest.id);
    if (!plugin) continue;

    const pluginConfig = config.plugins?.[discovered.manifest.id] || plugin.getDefaultConfig();

    // Build data for template
    const data: Record<string, unknown> = {
      playwrightInstalled,
      justSaved: savedSection === discovered.manifest.id,
    };

    // Special handling for each plugin type
    if (discovered.manifest.id === 'whatsapp') {
      data.isLoggedIn = whatsappConnected;
      data.status = connectionStatus;
      data.qrCode = currentQR;
    } else if (discovered.manifest.id === 'instagram') {
      data.isLoggedIn = await checkInstagramAuth(paths);
    }

    try {
      sections.push(plugin.renderTemplate(pluginConfig, data));
    } catch (e) {
      console.error(`Failed to render plugin ${discovered.manifest.id}:`, e);
    }
  }



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

// Save daemon config
app.post('/daemon', async (req, res) => {
  const { startHour, endHour } = req.body;
  const config = await loadConfig();

  config.daemon = {
    activeHours: {
      start: parseInt(startHour) || 7,
      end: parseInt(endHour) || 23
    }
  };

  await saveConfig(config);
  console.log('✅ Daemon config saved');
  res.redirect('/?saved=daemon');
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

// Generic plugin config save route
app.post('/plugin/:id', async (req, res) => {
  const pluginId = req.params.id;

  try {
    const plugin = await loadPluginModule(pluginId);
    if (!plugin) {
      res.status(404).send(`Plugin not found: ${pluginId}`);
      return;
    }

    const config = await loadConfig();
    const pluginConfig = plugin.parseFormData(req.body);
    setPluginConfig(config, pluginId, pluginConfig);
    await saveConfig(config);

    console.log(`✅ ${plugin.manifest.name} config saved`);
    res.redirect(`/?saved=${pluginId}`);
  } catch (e: any) {
    console.error(`Failed to save plugin ${pluginId}:`, e);
    res.status(500).send(`Failed to save: ${e.message}`);
  }
});

// Instagram Login (special route for Instagram plugin)
app.post('/instagram/login', async (req, res) => {
  try {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    console.log('📸 Starting Instagram login flow...');

    await fs.mkdir(paths.auth, { recursive: true });

    const browser = await chromium.launch({
      headless: false,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    const statePath = path.join(paths.auth, 'instagram-state.json');

    await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded' });

    let isLoggedIn = false;
    try {
      await page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 3000 });
      isLoggedIn = true;
    } catch { }

    if (!isLoggedIn) {
      console.log('⏳ Waiting for user to log in...');
      await page.waitForSelector('a[href^="/direct/inbox/"]', { timeout: 300000 });
    }

    await context.storageState({ path: statePath });
    console.log('✅ Instagram session saved!');

    await browser.close();

    res.json({ success: true });
  } catch (e: any) {
    console.error('Instagram login failed:', e);
    res.json({ success: false, error: e.message });
  }
});

// Generic folder zip download
// Usage: /zip?folder=src/plugins/chrome-history/extension&name=chrome-extension
app.get('/zip', async (req, res) => {
  const folderPath = req.query.folder as string;
  const zipName = (req.query.name as string) || 'download';

  if (!folderPath) {
    res.status(400).send('Missing folder parameter');
    return;
  }

  try {
    const basePath = process.cwd();
    const fullPath = path.resolve(basePath, folderPath);

    // Security: ensure path is within project
    if (!fullPath.startsWith(basePath)) {
      res.status(403).send('Access denied');
      return;
    }

    await fs.access(fullPath);
    const stat = await fs.stat(fullPath);

    if (!stat.isDirectory()) {
      res.status(400).send('Path is not a directory');
      return;
    }

    // Create zip
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const safeZipName = `${zipName.replace(/[^a-zA-Z0-9-_]/g, '')}.zip`;
    const zipPath = path.join(basePath, 'logs', safeZipName);

    await fs.mkdir(path.join(basePath, 'logs'), { recursive: true });

    try {
      await fs.unlink(zipPath);
    } catch { }

    await execAsync(`cd "${fullPath}" && zip -r "${zipPath}" .`);
    console.log(`📦 Created zip: ${safeZipName}`);

    res.download(zipPath, safeZipName);
  } catch (e: any) {
    console.error(`Failed to create zip:`, e);
    res.status(500).send(`Failed to create zip: ${e.message}`);
  }
});

// ============ FILE BROWSER ROUTES ============

// List files in directory
app.get('/files/list', async (req, res) => {
  try {
    const basePath = process.cwd();
    let requestedPath = (req.query.path as string) || '.';

    const fullPath = path.resolve(basePath, requestedPath);

    if (!fullPath.startsWith(basePath)) {
      res.json({ error: 'Access denied' });
      return;
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      res.json({ error: 'Not a directory' });
      return;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(e => !e.name.startsWith('.'))
        .map(async (entry) => {
          const filePath = path.join(fullPath, entry.name);
          try {
            const fileStat = await fs.stat(filePath);
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: fileStat.size,
              modified: fileStat.mtime.toISOString(),
            };
          } catch {
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: 0,
              modified: '',
            };
          }
        })
    );

    const relativePath = path.relative(basePath, fullPath) || '.';
    res.json({ path: relativePath, files });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// Download file
app.get('/files/download', async (req, res) => {
  try {
    const basePath = process.cwd();
    const requestedPath = (req.query.path as string) || '';
    const fullPath = path.resolve(basePath, requestedPath);

    if (!fullPath.startsWith(basePath)) {
      res.status(403).send('Access denied');
      return;
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      res.status(400).send('Cannot download directory');
      return;
    }

    res.download(fullPath);
  } catch (e: any) {
    res.status(404).send('File not found');
  }
});

// Delete file
app.post('/files/delete', async (req, res) => {
  try {
    const basePath = process.cwd();
    const requestedPath = req.body.path || '';
    const fullPath = path.resolve(basePath, requestedPath);

    if (!fullPath.startsWith(basePath)) {
      res.json({ success: false, error: 'Access denied' });
      return;
    }

    const protectedPaths = ['package.json', 'tsconfig.json', 'node_modules', 'src', '.git'];
    if (protectedPaths.some(p => fullPath.endsWith(p) || fullPath.includes('/node_modules/'))) {
      res.json({ success: false, error: 'Cannot delete protected file' });
      return;
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    res.json({ success: true });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// Upload file with multer
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = (req.query.path as string) || '.';
      const basePath = process.cwd();
      const fullPath = path.resolve(basePath, uploadPath);

      if (!fullPath.startsWith(basePath)) {
        cb(new Error('Access denied'), '');
        return;
      }

      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.get('/files/exists', async (req, res) => {
  try {
    const basePath = process.cwd();
    const dirPath = (req.query.path as string) || '.';
    const filename = req.query.filename as string;

    if (!filename) {
      res.json({ exists: false });
      return;
    }

    const fullPath = path.resolve(basePath, dirPath, filename);

    if (!fullPath.startsWith(basePath)) {
      res.json({ exists: false, error: 'Access denied' });
      return;
    }

    try {
      await fs.access(fullPath);
      res.json({ exists: true, path: fullPath });
    } catch {
      res.json({ exists: false });
    }
  } catch (e: any) {
    res.json({ exists: false, error: e.message });
  }
});

app.post('/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.json({ success: false, error: 'No file uploaded' });
      return;
    }

    console.log(`📁 File uploaded: ${req.file.filename} → ${req.file.destination}/${req.file.filename}`);
    res.json({ success: true, filename: req.file.filename, path: req.file.destination });
  } catch (e: any) {
    console.error('Upload error:', e);
    res.json({ success: false, error: e.message });
  }
});

// Read file content
app.get('/files/read', async (req, res) => {
  try {
    const basePath = process.cwd();
    const requestedPath = (req.query.path as string) || '';
    const fullPath = path.resolve(basePath, requestedPath);

    if (!fullPath.startsWith(basePath)) {
      res.status(403).send('Access denied');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (!['.json', '.txt', '.md'].includes(ext)) {
      res.status(400).send('Unsupported file type');
      return;
    }

    const content = await fs.readFile(fullPath, 'utf8');
    res.json({ content });
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

// Save file content
app.post('/files/save', async (req, res) => {
  try {
    const { path: requestedPath, content } = req.body;
    const basePath = process.cwd();
    const fullPath = path.resolve(basePath, requestedPath);

    if (!fullPath.startsWith(basePath)) {
      res.json({ success: false, error: 'Access denied' });
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (!['.json', '.txt', '.md'].includes(ext)) {
      res.json({ success: false, error: 'Unsupported file type' });
      return;
    }

    await fs.writeFile(fullPath, content, 'utf8');
    res.json({ success: true });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// ============ DEPENDENCIES ROUTES ============

app.get('/dependencies/check-playwright', async (req, res) => {
  const result = await checkPlaywright();
  res.json(result);
});

app.post('/dependencies/install-playwright', async (req, res) => {
  console.log('🔧 Installing Playwright browsers...');

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout, stderr } = await execAsync('npx playwright install chromium', {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('✅ Playwright browsers installed');
    res.json({
      success: true,
      message: 'Playwright browsers installed successfully!',
      output: stdout + (stderr ? '\n' + stderr : '')
    });
  } catch (e: any) {
    console.error('❌ Failed to install Playwright browsers:', e.message);
    res.json({
      success: false,
      error: e.message,
      output: e.stdout || e.stderr || e.message
    });
  }
});

app.post('/dependencies/install-syncthing', async (req, res) => {
  console.log('🔧 Installing Syncthing...');

  try {
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const platform = process.platform;
    let installCmd: string;
    
    if (platform === 'darwin') {
      installCmd = 'brew install syncthing';
    } else if (platform === 'linux') {
      // Try apt first, fall back to snap
      installCmd = 'sudo apt-get install -y syncthing || sudo snap install syncthing';
    } else {
      res.json({
        success: false,
        error: 'Automatic installation not supported on this platform. Please install Syncthing manually from https://syncthing.net/downloads/'
      });
      return;
    }

    const { stdout, stderr } = await execAsync(installCmd, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('✅ Syncthing installed');
    res.json({
      success: true,
      message: 'Syncthing installed successfully!',
      output: stdout + (stderr ? '\n' + stderr : '')
    });
  } catch (e: any) {
    console.error('❌ Failed to install Syncthing:', e.message);
    res.json({
      success: false,
      error: e.message,
      output: e.stdout || e.stderr || e.message
    });
  }
});

// ============ CLOUDFLARE TUNNEL ROUTES ============

app.get('/dependencies/check-cloudflared', async (req, res) => {
  const installed = await checkCloudflared();
  res.json({ installed });
});

app.post('/dependencies/install-cloudflared', async (req, res) => {
  console.log('🔧 Installing cloudflared...');
  const result = await installCloudflared();
  console.log(result.success ? '✅ cloudflared installed' : '❌ Failed to install cloudflared');
  res.json(result);
});

app.get('/tunnel/status', async (req, res) => {
  const status = await getTunnelStatusAsync();
  res.json(status);
});

app.post('/tunnel/start', async (req, res) => {
  console.log('☁️  Starting Cloudflare tunnel...');
  const result = await startTunnel();
  res.json(result);
});

app.post('/tunnel/stop', async (req, res) => {
  console.log('☁️  Stopping Cloudflare tunnel...');
  const result = await stopTunnel();
  res.json(result);
});

// API-based tunnel routes
app.post('/tunnel/test-credentials', async (req, res) => {
  const { accountId, zoneId, apiToken } = req.body;
  if (!accountId || !zoneId || !apiToken) {
    res.json({ success: false, message: 'All credential fields are required' });
    return;
  }
  console.log('☁️  Testing Cloudflare credentials...');
  const result = await testCredentials({ accountId, zoneId, apiToken });
  res.json(result);
});

app.post('/tunnel/save-credentials', async (req, res) => {
  const { accountId, zoneId, apiToken } = req.body;
  if (!accountId || !zoneId || !apiToken) {
    res.json({ success: false, message: 'All credential fields are required' });
    return;
  }
  
  // Test credentials first
  console.log('☁️  Verifying Cloudflare credentials...');
  try {
    const testResult = await testCredentials({ accountId, zoneId, apiToken });
    console.log('☁️  Test result:', testResult);
    
    if (!testResult.success) {
      res.json(testResult);
      return;
    }
    
    // Save credentials
    console.log('☁️  Saving credentials...');
    await saveCredentials({ accountId, zoneId, apiToken });
    console.log('☁️  Credentials saved!');
    res.json({ success: true, message: `Credentials saved! Connected to ${testResult.zoneName}` });
  } catch (e: any) {
    console.error('☁️  Error:', e);
    res.json({ success: false, message: e.message });
  }
});

app.post('/tunnel/setup', async (req, res) => {
  const { name, subdomain } = req.body;
  if (!name || !subdomain) {
    res.json({ success: false, message: 'Tunnel name and subdomain are required' });
    return;
  }
  
  const credentials = await loadCredentials();
  if (!credentials) {
    res.json({ success: false, message: 'Cloudflare credentials not configured' });
    return;
  }
  
  console.log(`☁️  Setting up tunnel "${name}" with subdomain "${subdomain}"...`);
  const result = await setupTunnel(credentials, name, subdomain, PROXY_PORT);
  
  if (result.success && result.tunnelId && result.tunnelToken && result.hostname) {
    // Save the full tunnel config
    await saveTunnelConfig({
      credentials,
      tunnelId: result.tunnelId,
      tunnelName: name,
      subdomain,
      hostname: result.hostname,
      tunnelToken: result.tunnelToken,
      createdAt: new Date().toISOString(),
    });
  }
  
  res.json(result);
});

app.post('/tunnel/teardown', async (req, res) => {
  const config = await loadTunnelConfig();
  if (!config || !config.credentials) {
    res.json({ success: false, message: 'No tunnel configured' });
    return;
  }
  
  // Stop the tunnel first
  await stopTunnel();
  
  console.log('☁️  Tearing down tunnel...');
  const result = await teardownTunnel(config.credentials, config.tunnelId, config.hostname);
  
  if (result.success) {
    await deleteTunnelConfig();
  }
  
  res.json(result);
});

app.post('/tunnel/start-token', async (req, res) => {
  console.log('☁️  Starting tunnel with token...');
  const result = await startTunnelWithToken();
  res.json(result);
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
  const content = `# Connector Test\n\nConnection test successful!\n\n - ** Date **: ${now.toISOString()}\n - ** Repository **: ${owner} / ${repo}\n`;

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
  console.log('🚀 SecondBrain Connectors Config (Plugin Architecture)\n');

  // Discover plugins on startup
  const plugins = await discoverPlugins();
  console.log(`📦 Discovered ${plugins.length} plugins: ${plugins.map(p => p.manifest.name).join(', ')}\n`);

  const url = `http://localhost:${PORT}`;
  app.listen(PORT, () => {
    console.log(`🌐 Config server running at ${url}`);
    console.log('Opening browser...\n');
    openBrowser(url);
  });

  checkOrStartWhatsApp();
}

main().catch(console.error);
