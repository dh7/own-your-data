/**
 * Chrome History Receiver Server
 * 
 * A simple HTTP server that receives browsing history from the Chrome extension
 * and saves it to the raw-dumps directory organized by date, then syncs to GitHub.
 * 
 * Usage: npm run chrome:server
 * Location: src/plugins/chrome-history/server.ts
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as crypto from 'crypto';

// Project root is 3 levels up from this file (src/plugins/chrome-history/)
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const PORT = 3457; // Different from config server (3456)
const RAW_DUMPS_DIR = path.join(PROJECT_ROOT, 'raw-dumps', 'chrome-history');
const API_KEY_FILE = path.join(PROJECT_ROOT, 'auth', 'chrome-api-key.txt');

// Generate or load API key
let API_KEY: string;
if (fs.existsSync(API_KEY_FILE)) {
    API_KEY = fs.readFileSync(API_KEY_FILE, 'utf8').trim();
} else {
    API_KEY = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(API_KEY_FILE), { recursive: true });
    fs.writeFileSync(API_KEY_FILE, API_KEY);
    console.log(`🔑 Generated new API key: ${API_KEY}`);
}

// Ensure directory exists
if (!fs.existsSync(RAW_DUMPS_DIR)) {
    fs.mkdirSync(RAW_DUMPS_DIR, { recursive: true });
    console.log(`Created directory: ${RAW_DUMPS_DIR}`);
}

interface UrlEntry {
    url: string;
    title: string;
    timestamp: string;
    date: string;
}

interface IncomingData {
    timestamp: string;
    urlsByDate: Record<string, UrlEntry[]>;
    totalCount: number;
}

// Track if a push is in progress to avoid overlapping pushes
let isPushing = false;
let pendingPush = false;

/**
 * Push saved history to GitHub using the chrome:push script
 */
async function pushToGitHub(): Promise<{ success: boolean; message: string }> {
    if (isPushing) {
        pendingPush = true;
        return { success: true, message: 'Push already in progress, will push again after' };
    }

    isPushing = true;
    console.log('\n🚀 Pushing to GitHub...');

    return new Promise((resolve) => {
        const child = spawn('npm', ['run', 'chrome:push'], {
            cwd: PROJECT_ROOT,
            stdio: 'pipe',
            shell: true
        });

        let output = '';

        child.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
            // Print each line with indentation
            text.split('\n').filter((l: string) => l.trim()).forEach((line: string) => {
                console.log(`   ${line}`);
            });
        });

        child.stderr?.on('data', (data) => {
            console.error(`   ⚠️ ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
            isPushing = false;

            if (code === 0) {
                console.log('   ✅ GitHub push complete!\n');
                resolve({ success: true, message: 'Pushed to GitHub successfully' });
            } else {
                console.error(`   ❌ Push failed with code ${code}\n`);
                resolve({ success: false, message: `Push failed with code ${code}` });
            }

            // If another push was requested while we were pushing, do it now
            if (pendingPush) {
                pendingPush = false;
                setTimeout(() => pushToGitHub(), 1000);
            }
        });

        child.on('error', (error) => {
            isPushing = false;
            console.error(`   ❌ Push error: ${error.message}\n`);
            resolve({ success: false, message: error.message });
        });
    });
}

const server = http.createServer((req, res) => {
    // CORS headers for Chrome extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check doesn't need API key
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            isPushing
        }));
        return;
    }

    // Validate API key for all other endpoints
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== API_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing API key' }));
        return;
    }

    // Ping endpoint - validates API key and returns pong
    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            pong: true,
            timestamp: new Date().toISOString(),
            message: 'Connection successful! API key is valid.'
        }));
        return;
    }

    // Manual push endpoint
    if (req.method === 'POST' && req.url === '/api/push') {
        pushToGitHub().then(result => {
            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/chrome-history') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data: IncomingData = JSON.parse(body);
                console.log(`\n📥 Received ${data.totalCount} URLs at ${new Date().toISOString()}`);

                let savedCount = 0;

                // Save each day's URLs to a separate file
                for (const [date, urls] of Object.entries(data.urlsByDate)) {
                    const filename = `${date}.json`;
                    const filepath = path.join(RAW_DUMPS_DIR, filename);

                    // Load existing data if file exists
                    let existingUrls: UrlEntry[] = [];
                    if (fs.existsSync(filepath)) {
                        const content = fs.readFileSync(filepath, 'utf8');
                        existingUrls = JSON.parse(content);
                    }

                    // Merge and deduplicate by timestamp+url
                    const existingKeys = new Set(
                        existingUrls.map(u => `${u.timestamp}|${u.url}`)
                    );

                    const newUrls = urls.filter(
                        u => !existingKeys.has(`${u.timestamp}|${u.url}`)
                    );

                    if (newUrls.length > 0) {
                        const mergedUrls = [...existingUrls, ...newUrls];
                        // Sort by timestamp
                        mergedUrls.sort((a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );

                        fs.writeFileSync(filepath, JSON.stringify(mergedUrls, null, 2));
                        console.log(`  💾 ${date}: Added ${newUrls.length} new URLs (total: ${mergedUrls.length})`);
                        savedCount += newUrls.length;
                    } else {
                        console.log(`  ⏭️  ${date}: No new URLs`);
                    }
                }

                // Note: GitHub push happens on schedule via daemon (npm run get_all)
                // or manually via: npm run chrome:push

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Saved ${savedCount} new URLs`,
                    savedCount
                }));

            } catch (error) {
                console.error('Error processing data:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🧠 Chrome History Receiver Server                         ║
║                                                              ║
║   Listening on: http://localhost:${PORT}                       ║
║   Saving to:    raw-dumps/chrome-history/                    ║
║   Syncing to:   GitHub (auto-push enabled)                   ║
║                                                              ║
║   🔑 API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(56)}
║   (Full key in: auth/chrome-api-key.txt)                     ║
║                                                              ║
║   Endpoints:                                                 ║
║   POST /api/chrome-history  - Receive & save URL data        ║
║   POST /api/push            - Manually trigger GitHub sync   ║
║   GET  /health              - Health check (no auth needed)  ║
║                                                              ║
║   Press Ctrl+C to stop                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
