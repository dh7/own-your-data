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
import {
  saveGitHubConfig,
  loadGitHubConfig,
  loadConfig,
  saveConfig,
  getResolvedPaths,
  loadPluginConfig,
  savePluginConfig,
  PluginConfig,
  SchedulerCommand,
  migrateConfigIfNeeded,
  loadSchedulerConfig,
  saveSchedulerConfig,
} from './config';
import { PluginSchedule } from '../scheduler/config';
import { useSingleFileAuthState } from '../shared/auth-utils';
import { discoverPlugins, loadPluginModule, DiscoveredPlugin } from '../plugins';
import { PluginManifest } from '../plugins/types';

// Templates
import { renderLayout } from './templates/layout';
import { renderSystemSection, TunnelRouteInfo } from './templates/system';
import { renderSchedulerSection, renderSchedulerPanel, SchedulerServiceStatus, SchedulerPluginEditor } from './templates/scheduler';
import { renderPluginsHub, wrapPluginPanel, PluginSummary } from './templates/plugins';
import { renderGitHubSection } from './templates/github';
import { renderFileBrowserSection } from './templates/filebrowser';
import { renderDomainSection, TunnelPluginInfo } from './templates/domain';

// Tunnel
import {
  getTunnelStatusAsync,
  checkCloudflared,
  installCloudflared,
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
import { getAvailableCommands, resolvePluginSchedule } from '../scheduler/config';

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
    const pidPaths = ['scheduler.pid', 'get_all.pid'];
    for (const pidFile of pidPaths) {
      try {
        const pidPath = path.join(process.cwd(), 'logs', pidFile);
        const data = await fs.readFile(pidPath, 'utf-8');
        const pid = parseInt(data.trim(), 10);
        if (Number.isNaN(pid)) continue;
        process.kill(pid, 0);
        await fs.access(pidPath);
        return true;
      } catch {
        // continue
      }
    }

    return false;
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

async function checkServiceHealth(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getServicePidFile(serviceId: string): string {
  return path.join(process.cwd(), 'logs', 'services', `${serviceId}.pid`);
}

async function ensureServicePidDir(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), 'logs', 'services'), { recursive: true });
}

async function readServicePid(serviceId: string): Promise<number | null> {
  try {
    const data = await fs.readFile(getServicePidFile(serviceId), 'utf-8');
    const pid = parseInt(data.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

async function isServicePidAlive(serviceId: string): Promise<boolean> {
  const pid = await readServicePid(serviceId);
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startServiceByCommand(serviceId: string, command: string): Promise<void> {
  if (await isServicePidAlive(serviceId)) return;

  await ensureServicePidDir();
  const { spawn } = await import('child_process');
  const child = spawn(command, {
    cwd: process.cwd(),
    shell: true,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await fs.writeFile(getServicePidFile(serviceId), String(child.pid), 'utf-8');
}

async function stopServiceByPid(serviceId: string): Promise<void> {
  const pid = await readServicePid(serviceId);
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }
  await fs.unlink(getServicePidFile(serviceId)).catch(() => { });
}

async function checkDocker(): Promise<boolean> {
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

async function checkNvidiaDocker(): Promise<boolean> {
  const { promisify } = await import('util');
  const os = await import('os');
  const execAsync = promisify(exec);

  // Skip on macOS - Apple Silicon uses different GPU passthrough (no nvidia-container-toolkit needed)
  if (os.platform() === 'darwin') {
    return false;
  }

  try {
    // Quick check: just see if nvidia-container-toolkit CLI exists
    await execAsync('nvidia-ctk --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function describeSchedule(schedule: PluginSchedule, manifest?: PluginManifest): string {
  if (!schedule.enabled) {
    if (manifest?.scheduler?.mode === 'manual') {
      return '<span style="color:#8b949e">Manual</span>';
    }
    return '<span style="color:#8b949e">Disabled</span>';
  }

  if (schedule.cadence === 'fixed') {
    if (!schedule.fixedTimes.length) {
      return '<span style="color:#8b949e">No fixed times</span>';
    }
    return `Fixed: <strong>${schedule.fixedTimes.join(', ')}</strong>`;
  }

  return `Every <strong>${schedule.intervalHours}h</strong> ± ${schedule.jitterMinutes}m (${schedule.startHour}:00-${schedule.endHour}:00)`;
}

function extractPluginStatus(renderedHtml: string): {
  text: string;
  className: 'connected' | 'disconnected' | 'pending' | 'warning';
} {
  const match = renderedHtml.match(/<span class="status\s+([^"]+)">([\s\S]*?)<\/span>/i);
  if (!match) {
    return { text: 'Configured', className: 'pending' };
  }

  const classes = match[1].split(/\s+/).map(v => v.trim()).filter(Boolean);
  const className = (['connected', 'disconnected', 'pending', 'warning'] as const).find(cls => classes.includes(cls)) || 'pending';
  const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  return { text: text || 'Configured', className };
}

function getPluginServiceId(pluginId: string): string {
  return `${pluginId}-server`;
}

async function startSchedulerDaemonProcess(): Promise<void> {
  if (await checkDaemonRunning()) return;
  const { spawn } = await import('child_process');
  const child = spawn('npm', ['run', 'scheduler'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function stopSchedulerDaemonProcess(): Promise<void> {
  const pidPath = path.join(process.cwd(), 'logs', 'scheduler.pid');
  const pidData = await fs.readFile(pidPath, 'utf-8');
  const pid = parseInt(pidData.trim(), 10);
  if (!pid) return;
  process.kill(pid, 'SIGTERM');
  await fs.unlink(pidPath).catch(() => { });
}

async function startAutoStartPluginServers(): Promise<void> {
  const plugins = await discoverPlugins();
  for (const plugin of plugins) {
    if (!plugin.manifest.commands.server || plugin.manifest.commands.server.trim().length === 0) {
      continue;
    }
    const scheduler = await resolvePluginSchedule(plugin);
    if (!scheduler.enabled || !scheduler.autoStartServer) continue;
    await startServiceByCommand(getPluginServiceId(plugin.manifest.id), plugin.manifest.commands.server);
  }
}

async function stopAutoStartPluginServers(): Promise<void> {
  const plugins = await discoverPlugins();
  for (const plugin of plugins) {
    if (!plugin.manifest.commands.server || plugin.manifest.commands.server.trim().length === 0) {
      continue;
    }
    const scheduler = await resolvePluginSchedule(plugin);
    if (!scheduler.autoStartServer) continue;
    await stopServiceByPid(getPluginServiceId(plugin.manifest.id));
  }
}

interface GitUpdateStatus {
  updateAvailable: boolean;
  currentCommit: string;
  remoteCommit: string;
  commitsBehind: number;
  fetchSucceeded: boolean; // Whether we actually reached GitHub
}

async function checkForGitUpdates(skipFetch: boolean = false): Promise<GitUpdateStatus> {
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Get current commit first (this always works locally)
    const { stdout: currentCommit } = await execAsync('git rev-parse HEAD', { cwd: process.cwd() });

    let fetchSucceeded = false;

    if (!skipFetch) {
      // Fetch latest from origin with:
      // - Batch mode SSH (no passphrase prompt)
      // - Short timeout (5 seconds)
      // - Quiet mode
      try {
        await execAsync('git fetch origin main --quiet', {
          cwd: process.cwd(),
          timeout: 5000, // 5 second timeout
          env: {
            ...process.env,
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no',
            GIT_TERMINAL_PROMPT: '0', // Disable git credential prompts
          }
        });
        fetchSucceeded = true;
        console.log('✅ Git fetch succeeded');
      } catch (fetchError) {
        // Fetch failed (likely SSH auth issue), but we can still compare with cached origin/main
        console.log('⚠️ Git fetch failed (auth required or timeout) - using cached data');
        fetchSucceeded = false;
      }
    }

    // Get remote commit (uses cached value if fetch failed)
    let remoteCommit = currentCommit.trim(); // Default to same as current
    let commitsBehind = 0;

    try {
      const { stdout: remote } = await execAsync('git rev-parse origin/main', { cwd: process.cwd() });
      remoteCommit = remote.trim();

      // Count commits behind
      const { stdout: behindCount } = await execAsync('git rev-list HEAD..origin/main --count', { cwd: process.cwd() });
      commitsBehind = parseInt(behindCount.trim()) || 0;
    } catch {
      // origin/main might not exist yet, that's ok
    }

    return {
      updateAvailable: commitsBehind > 0,
      currentCommit: currentCommit.trim(),
      remoteCommit,
      commitsBehind,
      fetchSucceeded,
    };
  } catch (e) {
    // If git commands fail, return safe defaults
    return {
      updateAvailable: false,
      currentCommit: 'unknown',
      remoteCommit: 'unknown',
      commitsBehind: 0,
      fetchSucceeded: false,
    };
  }
}

// ============ ROUTES ============

// Main page
app.get('/', async (req, res) => {
  const githubConfig = await loadGitHubConfig();
  const config = await loadConfig();
  const paths = getResolvedPaths(config);
  const rawSavedSection = req.query.saved as string | undefined;
  const savedSection = rawSavedSection === 'daemon' || rawSavedSection === 'scheduler'
    ? 'services'
    : rawSavedSection;

  const playwright = await checkPlaywright();
  const playwrightInstalled = playwright.installed && playwright.browsers;
  const daemonRunning = await checkDaemonRunning();
  const syncthingInstalled = await checkSyncthing();
  const tunnelStatus = await getTunnelStatusAsync();
  const dockerInstalled = await checkDocker();
  const nvidiaDockerInstalled = dockerInstalled ? await checkNvidiaDocker() : false;
  // Skip fetch on initial load to avoid SSH passphrase prompts - user can click "Check for Updates"
  const gitStatus = await checkForGitUpdates(true);

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

  const pluginSummaries: PluginSummary[] = [];
  const pluginPanels: string[] = [];
  const pluginScheduleRows: SchedulerPluginEditor[] = [];

  for (const discovered of plugins) {
    const plugin = await loadPluginModule(discovered.manifest.id);
    if (!plugin) continue;

    // Load from config/{pluginId}.json, fall back to legacy config.plugins, then defaults
    const pluginConfig = await loadPluginConfig(discovered.manifest.id)
      || (config.plugins?.[discovered.manifest.id] as PluginConfig | undefined)
      || plugin.getDefaultConfig();
    const schedulerConfig = await resolvePluginSchedule(discovered);
    const availableCommands = getAvailableCommands(discovered);
    const hasServer = typeof discovered.manifest.commands.server === 'string' && discovered.manifest.commands.server.trim().length > 0;

    const scheduleText = availableCommands.length === 0
      ? (schedulerConfig.autoStartServer
        ? '<span style="color:#8b949e">Server managed</span>'
        : '<span style="color:#8b949e">Disabled</span>')
      : describeSchedule(schedulerConfig, discovered.manifest);

    // Show in scheduler UI if plugin has scheduled commands OR a server
    if (availableCommands.length > 0 || hasServer) {
      pluginScheduleRows.push({
        id: discovered.manifest.id,
        name: discovered.manifest.name,
        icon: discovered.manifest.icon,
        enabled: schedulerConfig.enabled,
        cadence: schedulerConfig.cadence,
        startHour: schedulerConfig.startHour,
        endHour: schedulerConfig.endHour,
        intervalHours: schedulerConfig.intervalHours,
        jitterMinutes: schedulerConfig.jitterMinutes,
        fixedTimes: schedulerConfig.fixedTimes,
        commands: schedulerConfig.commands,
        availableCommands,
        autoStartServer: schedulerConfig.autoStartServer,
        autoRestartServer: schedulerConfig.autoRestartServer,
        hasServer,
        scheduleText,
      });
    }

    // Build data for template
    const data: Record<string, unknown> = {
      playwrightInstalled,
      dockerInstalled,
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
      const rendered = plugin.renderTemplate(pluginConfig, data);
      const pluginStatus = extractPluginStatus(rendered);
      pluginSummaries.push({
        id: discovered.manifest.id,
        name: discovered.manifest.name,
        icon: discovered.manifest.icon,
        description: discovered.manifest.description,
        statusText: pluginStatus.text,
        statusClass: pluginStatus.className,
        scheduleText,
      });
      pluginPanels.push(wrapPluginPanel(discovered.manifest.id, discovered.manifest.name, discovered.manifest.icon, rendered));
    } catch (e) {
      console.error(`Failed to render plugin ${discovered.manifest.id}:`, e);
    }
  }

  const schedulerServices: SchedulerServiceStatus[] = [
    {
      id: 'config-server',
      name: 'Config Server',
      icon: '🧩',
      running: true,
      description: 'This configuration UI',
      detail: `Port ${PORT}`,
      actions: [{ action: 'restart', label: 'Restart', style: 'secondary' }],
    },
    {
      id: 'daemon',
      name: 'Scheduler Daemon',
      icon: '🤖',
      running: daemonRunning,
      description: 'Runs npm run scheduler',
      detail: daemonRunning ? 'PID file present' : 'Not running',
      actions: daemonRunning
        ? [
          { action: 'restart', label: 'Restart', style: 'secondary' },
          { action: 'stop', label: 'Stop', style: 'danger' },
        ]
        : [{ action: 'start', label: 'Start' }],
    },
    {
      id: 'tunnel',
      name: 'Cloudflare Tunnel',
      icon: '☁️',
      running: tunnelStatus.tunnelRunning,
      description: tunnelStatus.tunnelConfigured ? 'Standalone service (npm run tunnel)' : 'Not configured',
      detail: tunnelStatus.tunnelRunning
        ? (tunnelStatus.tunnelUrl || `Proxy on port ${PROXY_PORT}`)
        : (tunnelStatus.tunnelConfigured ? 'Ready to start' : 'Configure in Domain section'),
      actions: tunnelStatus.tunnelConfigured
        ? (tunnelStatus.tunnelRunning
          ? [
            { action: 'restart', label: 'Restart', style: 'secondary' },
            { action: 'stop', label: 'Stop', style: 'danger' },
          ]
          : [{ action: 'start', label: 'Start' }])
        : [],
    },
  ];

  for (const plugin of plugins) {
    const serverCommand = plugin.manifest.commands.server;
    if (!serverCommand || serverCommand.trim().length === 0) continue;

    const serviceId = getPluginServiceId(plugin.manifest.id);
    let running = await isServicePidAlive(serviceId);

    if (!running && plugin.manifest.tunnel?.enabled) {
      const healthRoute = plugin.manifest.tunnel.routes.find(route => route.path === '/health' && route.auth === false);
      if (healthRoute) {
        running = await checkServiceHealth(`http://127.0.0.1:${plugin.manifest.tunnel.port}${healthRoute.path}`);
      }
    }

    const detail = plugin.manifest.tunnel?.enabled
      ? `Port ${plugin.manifest.tunnel.port}`
      : 'No health endpoint configured';

    schedulerServices.push({
      id: serviceId,
      name: `${plugin.manifest.name} Server`,
      icon: plugin.manifest.icon,
      running,
      description: 'Plugin-managed background service',
      detail,
      actions: running
        ? [
          { action: 'restart', label: 'Restart', style: 'secondary' },
          { action: 'stop', label: 'Stop', style: 'danger' },
        ]
        : [{ action: 'start', label: 'Start' }],
    });
  }

  const services = renderSchedulerSection({
    daemonRunning,
    services: schedulerServices,
    plugins: pluginScheduleRows,
  }, savedSection === 'services');

  const system = renderSystemSection(config, {
    playwrightInstalled: playwright.installed,
    browsersInstalled: playwright.browsers,
    daemonRunning,
    syncthingInstalled,
    cloudflaredInstalled: tunnelStatus.cloudflaredInstalled,
    tunnelRunning: tunnelStatus.tunnelRunning,
    tunnelUrl: tunnelStatus.tunnelUrl,
    tunnelRoutes: tunnelPlugins,
    dockerInstalled,
    nvidiaDockerInstalled,
    updateAvailable: gitStatus.updateAvailable,
    currentCommit: gitStatus.currentCommit,
    remoteCommit: gitStatus.remoteCommit,
    commitsBehind: gitStatus.commitsBehind,
  }, savedSection === 'system' || savedSection === 'storage');

  const domain = renderDomainSection(
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
  );

  const files = renderFileBrowserSection();
  const github = renderGitHubSection(githubConfig, savedSection === 'github');

  const topGrid = `<div class="sys-grid">${services.card}${system.cards}${domain.card}${files.card}${github.card}</div>`;
  const allModals = services.modal + system.modals + domain.modal + files.modal + github.modal;

  const sections: string[] = [
    topGrid,
    allModals,
    renderPluginsHub(pluginSummaries),
  ];

  const initialPluginPanel = pluginSummaries.some(p => p.id === savedSection) ? savedSection : undefined;

  // Generate scheduler popup panels for each plugin
  const schedulerPanels = pluginScheduleRows.map(p => renderSchedulerPanel(p));

  res.send(renderLayout(sections, {
    modals: [...pluginPanels, ...schedulerPanels],
    initialPluginPanel,
  }));
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
  res.redirect('/?saved=services');
});

app.post('/scheduler/plugin/:id', async (req, res) => {
  const pluginId = req.params.id;
  const plugins = await discoverPlugins();
  const plugin = plugins.find(p => p.manifest.id === pluginId);

  if (!plugin) {
    res.status(404).send(`Plugin not found: ${pluginId}`);
    return;
  }

  const existing = await resolvePluginSchedule(plugin);
  const rawCommands = req.body.commands;
  const commandList = Array.isArray(rawCommands)
    ? rawCommands
    : typeof rawCommands === 'string'
      ? [rawCommands]
      : [];

  const availableCommands = getAvailableCommands(plugin);
  const commands = commandList
    .map((value: string) => value as SchedulerCommand)
    .filter(command => availableCommands.includes(command));

  const fixedTimes = typeof req.body.fixedTimes === 'string'
    ? req.body.fixedTimes
      .split(',')
      .map((value: string) => value.trim())
      .filter((value: string) => /^\d{1,2}:\d{2}$/.test(value))
      .map((value: string) => {
        const [hours, minutes] = value.split(':');
        return `${hours.padStart(2, '0')}:${minutes}`;
      })
    : [];

  const nextConfig: PluginSchedule = {
    enabled: req.body.enabled === 'on',
    cadence: req.body.cadence === 'fixed' ? 'fixed' : 'interval',
    startHour: Math.min(23, Math.max(0, parseInt(req.body.startHour, 10) || existing.startHour)),
    endHour: Math.min(24, Math.max(1, parseInt(req.body.endHour, 10) || existing.endHour)),
    intervalHours: Math.min(168, Math.max(1, parseInt(req.body.intervalHours, 10) || existing.intervalHours)),
    jitterMinutes: Math.min(180, Math.max(0, parseInt(req.body.jitterMinutes, 10) || existing.jitterMinutes)),
    fixedTimes,
    commands: commands.length > 0 ? commands : existing.commands,
    autoStartServer: req.body.autoStartServer === 'on',
    autoRestartServer: req.body.autoRestartServer === 'on',
  };

  // Save everything to config/scheduler.json (source of truth)
  const schedulerJson = await loadSchedulerConfig();

  // Update server settings
  if (plugin.manifest.commands.server?.trim()) {
    schedulerJson.servers[pluginId] = {
      autoStart: nextConfig.autoStartServer,
      restartOnCrash: nextConfig.autoRestartServer,
    };
  }

  // Update tasks: remove any existing task that includes this plugin
  schedulerJson.tasks = schedulerJson.tasks.filter(
    t => !t.plugins.includes(pluginId)
  );

  // Add new task for this plugin
  if (nextConfig.enabled) {
    const task: import('../config/config').SchedulerTask = {
      plugins: [pluginId],
      commands: nextConfig.commands,
      ...(nextConfig.cadence === 'fixed' && nextConfig.fixedTimes.length > 0
        ? { fixedTimes: nextConfig.fixedTimes }
        : {
          intervalHours: nextConfig.intervalHours,
          jitterMinutes: nextConfig.jitterMinutes,
        }),
    };
    schedulerJson.tasks.push(task);
  } else {
    // Disabled → store as manual task so it's explicitly off
    schedulerJson.tasks.push({
      plugins: [pluginId],
      commands: nextConfig.commands,
      schedule: 'manual',
    });
  }

  await saveSchedulerConfig(schedulerJson);

  res.redirect('/?saved=services');
});


// Manually trigger a plugin command (get, process, push)
app.post('/scheduler/run/:pluginId/:command', async (req, res) => {
  const { pluginId, command } = req.params;

  if (!['get', 'process', 'push'].includes(command)) {
    res.status(400).json({ success: false, error: 'Invalid command. Must be get, process, or push.' });
    return;
  }

  try {
    const plugins = await discoverPlugins();
    const plugin = plugins.find(p => p.manifest.id === pluginId);

    if (!plugin) {
      res.status(404).json({ success: false, error: `Plugin not found: ${pluginId}` });
      return;
    }

    const cmd = plugin.manifest.commands[command as keyof typeof plugin.manifest.commands];
    if (!cmd || cmd.trim().length === 0) {
      res.status(400).json({ success: false, error: `Plugin ${pluginId} has no "${command}" command.` });
      return;
    }

    console.log(`▶️ Manual run: ${pluginId}:${command} → ${cmd}`);

    // Log file — same flat file the plugin scripts append to
    const logDir = path.join(process.cwd(), 'logs');
    await fs.mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `${pluginId}.log`);

    const { spawn } = await import('child_process');
    const child = spawn(cmd, {
      cwd: process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    child.on('close', async (code) => {
      if (code === 0) {
        console.log(`✅ ${pluginId}:${command} completed`);
        res.json({ success: true, output: stdout, stderr });
      } else {
        console.error(`❌ ${pluginId}:${command} failed with code ${code}`);
        res.json({ success: false, error: `Exited with code ${code}`, output: stdout, stderr });
      }
    });

    child.on('error', (err) => {
      console.error(`❌ ${pluginId}:${command} error:`, err.message);
      res.json({ success: false, error: err.message });
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// View plugin logs
app.get('/plugin/logs/:pluginId', async (req, res) => {
  const pluginId = req.params.pluginId;
  const maxLines = Math.min(Math.max(parseInt(req.query.lines as string, 10) || 500, 10), 5000);
  const logPath = path.join(process.cwd(), 'logs', `${pluginId}.log`);

  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.split('\n');
    const tail = lines.slice(-maxLines).join('\n');
    res.json({ logs: tail, file: `${pluginId}.log` });
  } catch {
    res.json({ logs: 'No logs yet. Run a command first.', file: '' });
  }
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

    // Load existing config from config/{pluginId}.json
    const existingConfig = await loadPluginConfig(pluginId) || {};
    const parsedPluginConfig = plugin.parseFormData(req.body) as PluginConfig;
    const pluginConfig = { ...existingConfig, ...parsedPluginConfig };

    // Save to config/{pluginId}.json (new location)
    await savePluginConfig(pluginId, pluginConfig);

    console.log(`✅ ${plugin.manifest.name} config saved to config/${pluginId}.json`);
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

    // Send with proper headers and streaming
    const zipStat = await fs.stat(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
    res.setHeader('Content-Length', zipStat.size);
    res.setHeader('Connection', 'close');

    const { createReadStream } = await import('fs');
    const fileStream = createReadStream(zipPath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('❌ Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    });
  } catch (e: any) {
    console.error(`Failed to create zip:`, e);
    if (!res.headersSent) {
      res.status(500).send(`Failed to create zip: ${e.message}`);
    }
  }
});

// Pre-configured Chrome extension download
// Creates a zip with API key and server URL already configured
app.get('/chrome-extension-configured', async (req, res) => {
  console.log('📦 Creating pre-configured Chrome extension...');

  try {
    const basePath = process.cwd();
    const extensionSrc = path.join(basePath, 'src', 'plugins', 'chrome-history', 'extension');
    const tempDir = path.join(basePath, 'logs', 'chrome-ext-temp');
    const zipPath = path.join(basePath, 'logs', 'chrome-extension-configured.zip');

    // Check extension source exists
    try {
      await fs.access(extensionSrc);
    } catch {
      console.error('❌ Extension source not found:', extensionSrc);
      res.status(404).send('Extension source files not found');
      return;
    }

    // Get API key
    const apiKeyPath = path.join(basePath, 'auth', 'chrome-api-key.txt');
    let apiKey = '';
    try {
      apiKey = (await fs.readFile(apiKeyPath, 'utf8')).trim();
      console.log('   Using existing API key');
    } catch {
      // Generate one if missing
      const crypto = await import('crypto');
      apiKey = crypto.randomBytes(32).toString('hex');
      await fs.mkdir(path.dirname(apiKeyPath), { recursive: true });
      await fs.writeFile(apiKeyPath, apiKey);
      console.log('   Generated new API key');
    }

    // Get tunnel URL if configured
    const tunnelConfigPath = path.join(basePath, 'auth', 'cloudflare-tunnel.json');
    let serverUrl = 'http://localhost:3457/api/chrome-history'; // default
    try {
      const tunnelConfig = JSON.parse(await fs.readFile(tunnelConfigPath, 'utf8'));
      if (tunnelConfig.hostname) {
        serverUrl = `https://${tunnelConfig.hostname}/chrome-history/api/chrome-history`;
      }
    } catch { }
    console.log('   Server URL:', serverUrl);

    // Clean up temp dir
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch { }
    await fs.mkdir(tempDir, { recursive: true });

    // Copy extension files using Node.js (cross-platform)
    const copyDir = async (src: string, dest: string) => {
      const entries = await fs.readdir(src, { withFileTypes: true });
      await fs.mkdir(dest, { recursive: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyDir(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    };
    await copyDir(extensionSrc, tempDir);
    console.log('   Copied extension files');

    // Create a settings.json file with pre-configured values
    const settingsContent = JSON.stringify({
      apiKey: apiKey,
      serverUrl: serverUrl
    }, null, 2);
    await fs.writeFile(path.join(tempDir, 'settings.json'), settingsContent);

    // Modify background.js to load settings.json on install
    const bgPath = path.join(tempDir, 'background.js');
    const bgContent = await fs.readFile(bgPath, 'utf8');

    // Add code to auto-load settings on install or update
    const autoConfigCode = `
// Auto-configure from settings.json on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  // Run on install or update (in case user re-downloads)
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const response = await fetch(chrome.runtime.getURL('settings.json'));
      const preConfig = await response.json();
      
      if (preConfig.apiKey && preConfig.serverUrl) {
        // Only set if not already configured (don't overwrite user changes)
        const { settings } = await chrome.storage.local.get('settings');
        if (!settings?.apiKey || details.reason === 'install') {
          const newSettings = {
            ...(settings || {}),
            apiKey: preConfig.apiKey,
            serverUrl: preConfig.serverUrl
          };
          await chrome.storage.local.set({ settings: newSettings });
          console.log('🎉 Extension pre-configured with API key and server URL!');
        }
      }
    } catch (e) {
      console.log('No pre-config found, using defaults');
    }
  }
});

`;

    // Prepend the auto-config code
    await fs.writeFile(bgPath, autoConfigCode + bgContent);

    // Update manifest to include settings.json in web_accessible_resources
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.web_accessible_resources = manifest.web_accessible_resources || [];
    manifest.web_accessible_resources.push({
      resources: ['settings.json'],
      matches: ['<all_urls>']
    });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('   Modified manifest and background.js');

    // Create zip using exec
    try {
      await fs.unlink(zipPath);
    } catch { }

    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync(`cd "${tempDir}" && zip -r "${zipPath}" .`);

    // Verify zip was created
    const zipStat = await fs.stat(zipPath);
    console.log(`📦 Created zip: ${zipPath} (${zipStat.size} bytes)`);

    // Clean up temp
    await fs.rm(tempDir, { recursive: true });

    // Send the file with proper headers
    const zipStat2 = await fs.stat(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="chrome-extension-configured.zip"');
    res.setHeader('Content-Length', zipStat2.size);
    res.setHeader('Connection', 'close');

    const { createReadStream } = await import('fs');
    const fileStream = createReadStream(zipPath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log('✅ Extension downloaded successfully');
    });

    fileStream.on('error', (err) => {
      console.error('❌ Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    });
  } catch (e: any) {
    console.error('❌ Failed to create configured extension:', e);
    if (!res.headersSent) {
      res.status(500).send(`Failed to create extension: ${e.message}`);
    }
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

// Configure Syncthing for remote access
app.post('/dependencies/configure-syncthing-remote', async (req, res) => {
  console.log('🔧 Configuring Syncthing for remote access...');

  try {
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const os = await import('os');

    // Find Syncthing config file
    const platform = process.platform;
    let configPath: string;

    if (platform === 'darwin') {
      configPath = path.join(os.homedir(), 'Library/Application Support/Syncthing/config.xml');
    } else if (platform === 'linux') {
      configPath = path.join(os.homedir(), '.config/syncthing/config.xml');
    } else {
      res.json({ success: false, error: 'Unsupported platform: ' + platform });
      return;
    }

    // Check if config exists
    try {
      await fs.access(configPath);
    } catch {
      res.json({
        success: false,
        error: 'Syncthing config not found. Please run Syncthing at least once first.'
      });
      return;
    }

    // Read config
    let configContent = await fs.readFile(configPath, 'utf-8');

    // Check if already configured for remote access
    if (configContent.includes('<address>0.0.0.0:8384</address>')) {
      res.json({
        success: true,
        message: 'Syncthing is already configured for remote access!',
        alreadyConfigured: true
      });
      return;
    }

    // Replace 127.0.0.1 with 0.0.0.0
    const originalContent = configContent;
    configContent = configContent.replace(
      /<address>127\.0\.0\.1:8384<\/address>/g,
      '<address>0.0.0.0:8384</address>'
    );

    if (configContent === originalContent) {
      res.json({
        success: false,
        error: 'Could not find GUI address to update in config. Config format may have changed.'
      });
      return;
    }

    // Backup original config
    await fs.writeFile(configPath + '.backup', originalContent);

    // Write new config
    await fs.writeFile(configPath, configContent);

    // Try to restart Syncthing
    let restartMessage = '';
    try {
      // Kill existing syncthing process
      await execAsync('pkill syncthing || true', { timeout: 5000 });

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start syncthing in background
      if (platform === 'linux') {
        await execAsync('nohup syncthing > /dev/null 2>&1 &', { timeout: 5000 });
      } else {
        await execAsync('syncthing &', { timeout: 5000 });
      }
      restartMessage = ' Syncthing restarted.';
    } catch (e) {
      restartMessage = ' Please restart Syncthing manually.';
    }

    console.log('✅ Syncthing configured for remote access');
    res.json({
      success: true,
      message: 'Syncthing configured for remote access!' + restartMessage + ' GUI now accessible on 0.0.0.0:8384'
    });

  } catch (e: any) {
    console.error('❌ Failed to configure Syncthing:', e.message);
    res.json({
      success: false,
      error: e.message
    });
  }
});

// ============ UPDATES & RESTART ROUTES ============

app.get('/system/check-updates', async (req, res) => {
  console.log('🔍 Checking for updates...');
  const status = await checkForGitUpdates();
  res.json(status);
});

app.post('/system/pull-updates', async (req, res) => {
  console.log('⬇️ Pulling updates from GitHub...');

  try {
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // First stash any local changes
    console.log('📦 Stashing local changes...');
    await execAsync('git stash', { cwd: process.cwd() });

    // Pull latest changes
    console.log('⬇️ Pulling from origin/main...');
    const { stdout: pullOutput, stderr: pullStderr } = await execAsync('git pull origin main', { cwd: process.cwd() });

    // Run npm install to get any new dependencies
    console.log('📦 Installing dependencies...');
    const { stdout: npmOutput, stderr: npmStderr } = await execAsync('npm install', {
      cwd: process.cwd(),
      timeout: 120000, // 2 minute timeout for npm install
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('✅ Updates pulled and dependencies installed');
    res.json({
      success: true,
      message: 'Updates pulled and dependencies installed! Restart the server to apply changes.',
      output: pullOutput + (pullStderr ? '\n' + pullStderr : '') + '\n--- npm install ---\n' + npmOutput
    });
  } catch (e: any) {
    console.error('❌ Failed to pull updates:', e.message);
    res.json({
      success: false,
      error: e.message,
      output: e.stdout || e.stderr || e.message
    });
  }
});

app.post('/system/restart-config', async (req, res) => {
  console.log('🔄 Restart config requested...');
  res.json({ success: true, message: 'Config server will restart. Page will reload shortly.' });

  // Give time for response to send, then exit (pm2/nodemon will restart, or user will need to manually restart)
  setTimeout(() => {
    console.log('🔄 Restarting config server...');
    process.exit(0);
  }, 500);
});

app.post('/system/start-daemon', async (req, res) => {
  console.log('▶️ Starting daemon...');

  try {
    await startSchedulerDaemonProcess();
    await startAutoStartPluginServers();

    res.json({ success: true, message: 'Daemon started!' });
  } catch (e: any) {
    console.error('❌ Failed to start daemon:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.post('/system/stop-daemon', async (req, res) => {
  console.log('⏹️ Stopping daemon...');

  try {
    await stopSchedulerDaemonProcess();
    await stopAutoStartPluginServers();
    res.json({ success: true, message: 'Daemon stopped!' });
  } catch (e: any) {
    console.error('❌ Failed to stop daemon:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.post('/system/restart-daemon', async (req, res) => {
  console.log('🔄 Restarting daemon...');

  try {
    try {
      await stopSchedulerDaemonProcess();
    } catch {
      // ignore stop failures
    }
    await stopAutoStartPluginServers();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await startSchedulerDaemonProcess();
    await startAutoStartPluginServers();

    res.json({ success: true, message: 'Daemon restarted!' });
  } catch (e: any) {
    console.error('❌ Failed to restart daemon:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// List directories endpoint - for web-based folder picker
app.post('/system/list-dirs', async (req, res) => {
  const { path: reqPath } = req.body;
  const cwd = process.cwd();
  const targetPath = reqPath || cwd;

  try {
    const resolved = path.resolve(targetPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const dirs = entries
      .filter((e: any) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e: any) => e.name)
      .sort((a: string, b: string) => a.localeCompare(b));

    // Make path relative to cwd for display if inside cwd
    let displayPath = resolved;
    let relativePath = resolved;
    if (resolved.startsWith(cwd + '/') || resolved === cwd) {
      relativePath = resolved === cwd ? '.' : './' + resolved.slice(cwd.length + 1);
    }

    res.json({
      success: true,
      current: resolved,
      relative: relativePath,
      parent: path.dirname(resolved),
      dirs,
      cwd,
    });
  } catch (e: any) {
    console.error('List dirs error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.post('/system/service/:id/:action', async (req, res) => {
  const serviceId = req.params.id;
  const action = req.params.action as 'start' | 'stop' | 'restart';

  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ success: false, error: 'Invalid action' });
    return;
  }

  try {
    if (serviceId === 'daemon') {
      if (action === 'start') {
        await startSchedulerDaemonProcess();
        await startAutoStartPluginServers();
      } else if (action === 'stop') {
        await stopSchedulerDaemonProcess();
        await stopAutoStartPluginServers();
      } else {
        try {
          await stopSchedulerDaemonProcess();
        } catch {
          // ignore
        }
        await stopAutoStartPluginServers();
        await new Promise(resolve => setTimeout(resolve, 600));
        await startSchedulerDaemonProcess();
        await startAutoStartPluginServers();
      }

      res.json({ success: true, message: `Daemon ${action} complete` });
      return;
    }

    // Tunnel runs as standalone process - start/stop via PID
    if (serviceId === 'tunnel') {
      const tunnelPidPath = path.join(process.cwd(), 'logs', 'tunnel.pid');

      if (action === 'stop' || action === 'restart') {
        try {
          const pidData = await fs.readFile(tunnelPidPath, 'utf-8');
          const pid = parseInt(pidData.trim(), 10);
          if (!isNaN(pid)) {
            process.kill(pid, 'SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch { /* no pid file or process */ }
      }

      if (action === 'start' || action === 'restart') {
        const { spawn } = await import('child_process');
        const child = spawn('npm', ['run', 'tunnel'], {
          cwd: process.cwd(),
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      }

      res.json({ success: true, message: `Tunnel ${action} complete` });
      return;
    }

    if (serviceId === 'whatsapp') {
      await checkOrStartWhatsApp();
      res.json({ success: true, message: 'WhatsApp reconnect requested' });
      return;
    }

    if (!serviceId.endsWith('-server')) {
      res.status(404).json({ success: false, error: 'Unknown service id' });
      return;
    }

    const pluginId = serviceId.slice(0, -'-server'.length);
    const plugins = await discoverPlugins();
    const plugin = plugins.find(p => p.manifest.id === pluginId);
    const command = plugin?.manifest.commands.server;

    if (!plugin || !command || command.trim().length === 0) {
      res.status(404).json({ success: false, error: 'Service command not found' });
      return;
    }

    if (action === 'start') {
      await startServiceByCommand(serviceId, command);
    } else if (action === 'stop') {
      await stopServiceByPid(serviceId);
    } else {
      await stopServiceByPid(serviceId);
      await new Promise(resolve => setTimeout(resolve, 400));
      await startServiceByCommand(serviceId, command);
    }

    res.json({ success: true, message: `${plugin.manifest.name} server ${action} complete` });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// ============ LOGS VIEWER ============

app.get('/system/logs/:serviceId', async (req, res) => {
  const serviceId = req.params.serviceId;
  const maxLines = Math.min(Math.max(parseInt(req.query.lines as string, 10) || 200, 10), 2000);

  try {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    let logFile: string | null = null;

    if (serviceId === 'scheduler' || serviceId === 'daemon') {
      // Scheduler daily log: logs/scheduler/YYYY-MM-DD.log
      const schedulerDir = paths.schedulerLogs;
      try {
        const files = await fs.readdir(schedulerDir);
        const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
        if (logFiles.length > 0) {
          logFile = path.join(schedulerDir, logFiles[0]);
        }
      } catch { /* dir doesn't exist */ }
    } else {
      // Plugin server logs: try logs/{pluginId}/ (strip -server suffix)
      const pluginId = serviceId.replace(/-server$/, '');
      const pluginLogDir = path.join(paths.logs, pluginId);
      try {
        const files = await fs.readdir(pluginLogDir);
        const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
        if (logFiles.length > 0) {
          logFile = path.join(pluginLogDir, logFiles[0]);
        }
      } catch { /* dir doesn't exist */ }

      // Fallback: check scheduler logs for this plugin's entries
      if (!logFile) {
        const schedulerDir = paths.schedulerLogs;
        try {
          const files = await fs.readdir(schedulerDir);
          const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
          if (logFiles.length > 0) {
            logFile = path.join(schedulerDir, logFiles[0]);
          }
        } catch { /* dir doesn't exist */ }
      }
    }

    if (!logFile) {
      res.json({ logs: 'No log files found.', file: '' });
      return;
    }

    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.split('\n');
    const tail = lines.slice(-maxLines).join('\n');

    res.json({ logs: tail, file: path.basename(logFile) });
  } catch (e: any) {
    res.json({ logs: `Error reading logs: ${e.message}`, file: '' });
  }
});

// ============ SERVICES STATUS API ============

app.get('/system/services-status', async (req, res) => {
  try {
    const plugins = await discoverPlugins();
    const daemonRunning = await checkDaemonRunning();
    const tunnelStatus = await getTunnelStatusAsync();

    const services: Array<{
      id: string;
      name: string;
      icon: string;
      running: boolean;
      description: string;
      detail: string;
      actions: Array<{ action: string; label: string; style?: string }>;
    }> = [];

    // Config server (always running if this endpoint responds)
    services.push({
      id: 'config-server',
      name: 'Config Server',
      icon: '🧩',
      running: true,
      description: 'This configuration UI',
      detail: `Port ${PORT}`,
      actions: [{ action: 'restart', label: 'Restart', style: 'secondary' }],
    });

    // Daemon
    services.push({
      id: 'daemon',
      name: 'Scheduler Daemon',
      icon: '🤖',
      running: daemonRunning,
      description: 'Runs npm run scheduler',
      detail: daemonRunning ? 'PID file present' : 'Not running',
      actions: daemonRunning
        ? [
          { action: 'restart', label: 'Restart', style: 'secondary' },
          { action: 'stop', label: 'Stop', style: 'danger' },
        ]
        : [{ action: 'start', label: 'Start' }],
    });

    // Tunnel
    services.push({
      id: 'tunnel',
      name: 'Cloudflare Tunnel',
      icon: '☁️',
      running: tunnelStatus.tunnelRunning,
      description: tunnelStatus.tunnelConfigured ? 'Standalone service (npm run tunnel)' : 'Not configured',
      detail: tunnelStatus.tunnelRunning
        ? (tunnelStatus.tunnelUrl || `Proxy on port ${PROXY_PORT}`)
        : (tunnelStatus.tunnelConfigured ? 'Ready to start' : 'Configure in Domain section'),
      actions: tunnelStatus.tunnelConfigured
        ? (tunnelStatus.tunnelRunning
          ? [
            { action: 'restart', label: 'Restart', style: 'secondary' },
            { action: 'stop', label: 'Stop', style: 'danger' },
          ]
          : [{ action: 'start', label: 'Start' }])
        : [],
    });

    // Plugin servers
    for (const plugin of plugins) {
      const serverCommand = plugin.manifest.commands.server;
      if (!serverCommand || serverCommand.trim().length === 0) continue;

      const serviceId = getPluginServiceId(plugin.manifest.id);
      let running = await isServicePidAlive(serviceId);

      if (!running && plugin.manifest.tunnel?.enabled) {
        const healthRoute = plugin.manifest.tunnel.routes.find(
          (route: any) => route.path === '/health' && route.auth === false
        );
        if (healthRoute) {
          running = await checkServiceHealth(`http://127.0.0.1:${plugin.manifest.tunnel.port}${healthRoute.path}`);
        }
      }

      const detail = plugin.manifest.tunnel?.enabled
        ? `Port ${plugin.manifest.tunnel.port}`
        : 'No health endpoint configured';

      services.push({
        id: serviceId,
        name: `${plugin.manifest.name} Server`,
        icon: plugin.manifest.icon,
        running,
        description: 'Plugin-managed background service',
        detail,
        actions: running
          ? [
            { action: 'restart', label: 'Restart', style: 'secondary' },
            { action: 'stop', label: 'Stop', style: 'danger' },
          ]
          : [{ action: 'start', label: 'Start' }],
      });
    }

    res.json({ services });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

// Note: /tunnel/start and /tunnel/stop routes removed
// Tunnel is now managed by npm run start (start.ts)

// Test chrome-history tunnel endpoint (proxy to avoid CORS)
app.post('/tunnel/test-chrome', async (req, res) => {
  const { tunnelUrl, apiKey } = req.body;

  if (!tunnelUrl || !apiKey) {
    res.json({ success: false, message: 'Missing tunnelUrl or apiKey' });
    return;
  }

  try {
    // Test the /ping endpoint
    const pingUrl = tunnelUrl.replace('/api/chrome-history', '/ping');
    const response = await fetch(pingUrl, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, message: 'Tunnel working!', data });
    } else if (response.status === 401) {
      res.json({ success: false, message: 'Tunnel reachable but API key mismatch' });
    } else {
      res.json({ success: false, message: `Tunnel error: ${response.status}` });
    }
  } catch (e: any) {
    res.json({ success: false, message: `Cannot reach tunnel: ${e.message}` });
  }
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

  // Note: Tunnel process (if running) is managed by start.ts and will
  // fail gracefully when config is deleted, or user can restart npm run start

  console.log('☁️  Tearing down tunnel...');
  const result = await teardownTunnel(config.credentials, config.tunnelId, config.hostname);

  if (result.success) {
    await deleteTunnelConfig();
  }

  res.json(result);
});

app.get('/dependencies/check-docker', async (req, res) => {
  const dockerInstalled = await checkDocker();
  const nvidiaDockerInstalled = dockerInstalled ? await checkNvidiaDocker() : false;
  res.json({ dockerInstalled, nvidiaDockerInstalled });
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

  // Migrate old config format if needed
  const migration = await migrateConfigIfNeeded();
  if (migration.migrated) {
    console.log(`✅ ${migration.message}\n`);
  }

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
