/**
 * Tunnel Configuration Management
 * 
 * Manages the tunnel configuration stored in auth/cloudflare-tunnel.json
 * Supports API-based tunnel creation with Cloudflare credentials.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'auth', 'cloudflare-tunnel.json');

/**
 * Cloudflare API credentials
 */
export interface CloudflareCredentials {
    /** Cloudflare Account ID */
    accountId: string;
    /** Zone ID for the domain */
    zoneId: string;
    /** API Token with Tunnel and DNS permissions */
    apiToken: string;
}

/**
 * Full tunnel configuration
 */
export interface TunnelConfigData {
    /** Cloudflare API credentials */
    credentials: CloudflareCredentials;
    /** UUID of the tunnel */
    tunnelId: string;
    /** Human-readable tunnel name */
    tunnelName: string;
    /** Subdomain (e.g., "api" for api.yourdomain.com) */
    subdomain: string;
    /** Full public hostname (e.g., api.yourdomain.com) */
    hostname: string;
    /** Tunnel token for running without login */
    tunnelToken: string;
    /** When the tunnel was created */
    createdAt: string;
}

/**
 * Load tunnel configuration
 */
export async function loadTunnelConfig(): Promise<TunnelConfigData | null> {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return JSON.parse(data) as TunnelConfigData;
    } catch {
        return null;
    }
}

/**
 * Save tunnel configuration
 */
export async function saveTunnelConfig(config: TunnelConfigData): Promise<void> {
    // Ensure auth directory exists
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Delete tunnel configuration
 */
export async function deleteTunnelConfig(): Promise<void> {
    try {
        await fs.unlink(CONFIG_PATH);
    } catch {
        // File doesn't exist, that's fine
    }
}

/**
 * Check if tunnel is configured
 */
export async function isTunnelConfigured(): Promise<boolean> {
    const config = await loadTunnelConfig();
    return config !== null;
}

/**
 * Get the cloudflared config directory
 */
export function getCloudflaredConfigDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.cloudflared');
}

/**
 * Check if credentials are configured (but tunnel may not be created yet)
 */
export async function hasCredentials(): Promise<boolean> {
    const config = await loadTunnelConfig();
    return config !== null && !!config.credentials?.apiToken;
}

/**
 * Save just the credentials (before tunnel is created)
 */
export async function saveCredentials(credentials: CloudflareCredentials): Promise<void> {
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    
    // Load existing config or create new one
    let config: Partial<TunnelConfigData> = {};
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        config = JSON.parse(data);
    } catch {
        // File doesn't exist, start fresh
    }
    
    config.credentials = credentials;
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Load just the credentials
 */
export async function loadCredentials(): Promise<CloudflareCredentials | null> {
    const config = await loadTunnelConfig();
    return config?.credentials || null;
}
