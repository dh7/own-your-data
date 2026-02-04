/**
 * Scheduler Logger
 * Creates daily log files for all scheduler activity including:
 * - Server output (stdout/stderr)
 * - GET and process command results
 */

import * as fs from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import * as path from 'path';
import { loadConfig, getResolvedPaths } from '../config/config';

interface DailyLogStream {
    date: string;
    stream: WriteStream;
    logsDir: string;
}

let currentLogStream: DailyLogStream | null = null;

function getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTimestamp(): string {
    return new Date().toISOString();
}

async function getLogsDir(): Promise<string> {
    const config = await loadConfig();
    const paths = getResolvedPaths(config);
    return paths.schedulerLogs;
}

async function ensureLogDir(logsDir: string): Promise<void> {
    await fs.mkdir(logsDir, { recursive: true });
}

function getLogFilePath(logsDir: string, dateStr: string): string {
    return path.join(logsDir, `${dateStr}.log`);
}

async function getDailyLogStream(): Promise<WriteStream> {
    const today = getDateString();
    const logsDir = await getLogsDir();

    // Check if we have a valid stream for today in the same directory
    if (currentLogStream && currentLogStream.date === today && currentLogStream.logsDir === logsDir) {
        return currentLogStream.stream;
    }

    // Close old stream if it exists
    if (currentLogStream) {
        currentLogStream.stream.end();
    }

    await ensureLogDir(logsDir);

    const logPath = getLogFilePath(logsDir, today);
    const stream = createWriteStream(logPath, { flags: 'a' });

    currentLogStream = { date: today, stream, logsDir };

    // Log header for new day
    const header = `\n${'='.repeat(60)}\n📅 New Day: ${today}\n${'='.repeat(60)}\n\n`;
    stream.write(header);

    return stream;
}

export async function log(message: string, category?: string): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const prefix = category ? `[${category}]` : '';
    const line = `${timestamp} ${prefix} ${message}\n`;

    stream.write(line);
    // Also output to console for visibility
    process.stdout.write(`📝 ${line}`);
}

export async function logServerOutput(pluginId: string, data: string, isError = false): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const streamType = isError ? 'stderr' : 'stdout';
    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
        const formatted = `${timestamp} [${pluginId}:server:${streamType}] ${line}\n`;
        stream.write(formatted);
    }
}

export async function logCommandOutput(pluginId: string, commandId: string, data: string, isError = false): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const streamType = isError ? 'stderr' : 'stdout';
    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
        const formatted = `${timestamp} [${pluginId}:${commandId}:${streamType}] ${line}\n`;
        stream.write(formatted);
    }
}

export async function logCommandStart(pluginId: string, commandId: string, command: string): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const separator = '-'.repeat(40);
    const formatted = `\n${separator}\n${timestamp} [${pluginId}:${commandId}] 🚀 Starting: ${command}\n${separator}\n`;
    stream.write(formatted);
}

export async function logCommandEnd(pluginId: string, commandId: string, success: boolean, durationMs: number): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const status = success ? '✅ Completed' : '❌ Failed';
    const durationSec = (durationMs / 1000).toFixed(2);
    const formatted = `${timestamp} [${pluginId}:${commandId}] ${status} (${durationSec}s)\n`;
    stream.write(formatted);
}

export async function logServerStart(pluginId: string, command: string): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const formatted = `\n${timestamp} [${pluginId}:server] 🧩 Starting server: ${command}\n`;
    stream.write(formatted);
}

export async function logServerStop(pluginId: string): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const formatted = `${timestamp} [${pluginId}:server] ⛔ Server stopped\n`;
    stream.write(formatted);
}

export async function logPluginJobStart(pluginName: string, commands: string[]): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const formatted = `\n${timestamp} [scheduler] 📦 ${pluginName}: ${commands.join(' -> ')}\n`;
    stream.write(formatted);
}

export async function logSchedulerStart(): Promise<void> {
    const stream = await getDailyLogStream();
    const timestamp = getTimestamp();
    const formatted = `\n${timestamp} [scheduler] 🤖 Scheduler daemon started (PID: ${process.pid})\n`;
    stream.write(formatted);
}

export async function logSchedulerTick(pluginCount: number): Promise<void> {
    // This is called every 30s, so we don't want to spam the log
    // Only log if we want to track tick activity
}

export async function closeLogger(): Promise<void> {
    if (currentLogStream) {
        currentLogStream.stream.end();
        currentLogStream = null;
    }
}

export async function getLogsDirectory(): Promise<string> {
    return getLogsDir();
}
