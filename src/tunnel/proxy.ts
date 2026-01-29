/**
 * Tunnel Proxy Server
 * 
 * Routes incoming requests from Cloudflare Tunnel to the appropriate plugin servers.
 * Only routes declared in plugin manifests are allowed (security whitelist).
 * 
 * Usage: Started automatically when tunnel is enabled via config UI
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PluginManifest, TunnelConfig, TunnelRoute } from '../plugins/types';

export const PROXY_PORT = 3458;

interface RouteMapping {
    pluginId: string;
    pathPrefix: string;
    targetPort: number;
    routes: TunnelRoute[];
}

/**
 * Discover all plugins with tunnel configurations
 */
async function discoverTunnelRoutes(): Promise<RouteMapping[]> {
    const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
    const mappings: RouteMapping[] = [];

    try {
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const manifestPath = path.join(pluginsDir, entry.name, 'manifest.json');

            try {
                const manifestData = await fs.readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(manifestData) as PluginManifest;

                if (manifest.tunnel?.enabled) {
                    mappings.push({
                        pluginId: manifest.id,
                        pathPrefix: manifest.tunnel.pathPrefix,
                        targetPort: manifest.tunnel.port,
                        routes: manifest.tunnel.routes,
                    });
                    console.log(`🔗 Tunnel route: ${manifest.tunnel.pathPrefix}/* → localhost:${manifest.tunnel.port}`);
                }
            } catch {
                // No manifest or invalid, skip
            }
        }
    } catch (e) {
        console.error('Failed to discover tunnel routes:', e);
    }

    return mappings;
}

/**
 * Check if a request path matches an allowed route
 */
function isRouteAllowed(requestPath: string, mapping: RouteMapping): TunnelRoute | null {
    // Remove the pathPrefix from the request to get the local path
    const localPath = requestPath.replace(mapping.pathPrefix, '') || '/';

    for (const route of mapping.routes) {
        if (localPath === route.path || localPath.startsWith(route.path + '/')) {
            return route;
        }
    }
    return null;
}

/**
 * Load API key for a plugin (if it exists)
 */
async function loadApiKey(pluginId: string): Promise<string | null> {
    const keyFile = path.join(process.cwd(), 'auth', `${pluginId}-api-key.txt`);
    try {
        const key = await fs.readFile(keyFile, 'utf-8');
        return key.trim();
    } catch {
        // Try alternative naming
        const altKeyFile = path.join(process.cwd(), 'auth', 'chrome-api-key.txt');
        try {
            const key = await fs.readFile(altKeyFile, 'utf-8');
            return key.trim();
        } catch {
            return null;
        }
    }
}

/**
 * Create and start the tunnel proxy server
 */
export async function createProxyServer(): Promise<express.Express> {
    const app = express();
    const routeMappings = await discoverTunnelRoutes();

    if (routeMappings.length === 0) {
        console.log('⚠️  No plugins with tunnel routes configured');
    }

    // Load API keys for each plugin
    const apiKeys: Record<string, string | null> = {};
    for (const mapping of routeMappings) {
        apiKeys[mapping.pluginId] = await loadApiKey(mapping.pluginId);
    }

    // Health check endpoint for the proxy itself
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            proxy: true,
            timestamp: new Date().toISOString(),
            routes: routeMappings.map(m => ({
                prefix: m.pathPrefix,
                port: m.targetPort,
                routeCount: m.routes.length,
            })),
        });
    });

    // Set up proxy for each plugin with tunnel config
    for (const mapping of routeMappings) {
        app.use(mapping.pathPrefix, (req, res, next) => {
            const fullPath = mapping.pathPrefix + req.path;
            const allowedRoute = isRouteAllowed(fullPath, mapping);

            if (!allowedRoute) {
                console.log(`🚫 Blocked: ${fullPath} (not in whitelist)`);
                res.status(403).json({ error: 'Route not allowed' });
                return;
            }

            // Check auth if required
            if (allowedRoute.auth === 'api-key') {
                const providedKey = req.headers['x-api-key'];
                const expectedKey = apiKeys[mapping.pluginId];

                if (!expectedKey) {
                    console.log(`🚫 Blocked: ${fullPath} (no API key configured for plugin)`);
                    res.status(500).json({ error: 'API key not configured for this plugin' });
                    return;
                }

                if (providedKey !== expectedKey) {
                    console.log(`🚫 Blocked: ${fullPath} (invalid API key)`);
                    res.status(401).json({ error: 'Invalid or missing API key' });
                    return;
                }
            }

            console.log(`✅ Proxying: ${fullPath} → localhost:${mapping.targetPort}${req.path}`);
            next();
        });

        // Create proxy middleware for this plugin
        const proxyOptions = {
            target: `http://localhost:${mapping.targetPort}`,
            changeOrigin: true,
            pathRewrite: {
                [`^${mapping.pathPrefix}`]: '', // Remove prefix when forwarding
            },
        };
        
        app.use(mapping.pathPrefix, createProxyMiddleware(proxyOptions));
    }

    // Catch-all for unknown routes
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Unknown route',
            availablePrefixes: routeMappings.map(m => m.pathPrefix),
        });
    });

    return app;
}

/**
 * Start the proxy server
 */
export async function startProxyServer(): Promise<{ server: ReturnType<express.Express['listen']>; port: number }> {
    const app = await createProxyServer();

    return new Promise((resolve) => {
        const server = app.listen(PROXY_PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🔀 Tunnel Proxy Server                                      ║
║  Listening on: http://localhost:${PROXY_PORT}                       ║
╚══════════════════════════════════════════════════════════════╝
`);
            resolve({ server, port: PROXY_PORT });
        });
    });
}

// Allow running standalone for testing
if (require.main === module) {
    startProxyServer().catch(console.error);
}
