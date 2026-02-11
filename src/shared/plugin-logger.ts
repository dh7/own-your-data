/**
 * Plugin logger — appends all stdout/stderr to logs/{pluginId}.log
 *
 * Call initPluginLog('instagram') at the top of main().
 */

import * as fs from 'fs';
import * as path from 'path';

export function initPluginLog(pluginId: string): void {
    const logDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const logPath = path.join(logDir, `${pluginId}.log`);
    const stream = fs.createWriteStream(logPath, { flags: 'a' });

    // Run separator
    stream.write(`\n${'='.repeat(60)}\n[${new Date().toISOString()}] ${process.argv.slice(1).join(' ')}\n${'='.repeat(60)}\n`);

    // Tee stdout
    const origOut = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any, ...args: any[]) => {
        stream.write(chunk);
        return origOut(chunk, ...args);
    };

    // Tee stderr
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (chunk: any, ...args: any[]) => {
        stream.write(chunk);
        return origErr(chunk, ...args);
    };
}
