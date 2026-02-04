/**
 * PM2-style Process Manager
 * 
 * Manages long-running child processes (servers) with:
 * - Start/stop/restart controls
 * - Auto-restart on crash
 * - Health monitoring
 * - Status tracking
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ProcessConfig {
    /** Unique name for this process */
    name: string;
    /** NPM script to run (e.g., 'chrome-history:server') */
    script: string;
    /** Auto-restart on crash */
    restartOnCrash?: boolean;
    /** Max restart attempts before giving up */
    maxRestarts?: number;
    /** Delay between restart attempts (ms) */
    restartDelay?: number;
}

export interface ProcessStatus {
    name: string;
    script: string;
    status: 'stopped' | 'starting' | 'running' | 'crashed' | 'restarting';
    pid?: number;
    uptime?: number;  // seconds
    restarts: number;
    lastError?: string;
    startedAt?: Date;
}

interface ManagedProcess {
    config: ProcessConfig;
    process: ChildProcess | null;
    status: ProcessStatus;
    startedAt: Date | null;
    restartCount: number;
    restartTimer: NodeJS.Timeout | null;
}

export class ProcessManager extends EventEmitter {
    private processes: Map<string, ManagedProcess> = new Map();
    private shuttingDown = false;

    constructor() {
        super();
        // Handle graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    /**
     * Register a process to be managed
     */
    register(config: ProcessConfig): void {
        if (this.processes.has(config.name)) {
            console.warn(`Process ${config.name} already registered`);
            return;
        }

        const managed: ManagedProcess = {
            config: {
                restartOnCrash: true,
                maxRestarts: 5,
                restartDelay: 1000,
                ...config,
            },
            process: null,
            status: {
                name: config.name,
                script: config.script,
                status: 'stopped',
                restarts: 0,
            },
            startedAt: null,
            restartCount: 0,
            restartTimer: null,
        };

        this.processes.set(config.name, managed);
        console.log(`📝 Registered process: ${config.name}`);
    }

    /**
     * Start a registered process
     */
    async start(name: string): Promise<boolean> {
        const managed = this.processes.get(name);
        if (!managed) {
            console.error(`Process ${name} not registered`);
            return false;
        }

        if (managed.process && managed.status.status === 'running') {
            console.log(`Process ${name} already running`);
            return true;
        }

        return this.spawnProcess(managed);
    }

    /**
     * Stop a running process
     */
    async stop(name: string): Promise<boolean> {
        const managed = this.processes.get(name);
        if (!managed) {
            console.error(`Process ${name} not registered`);
            return false;
        }

        // Clear any pending restart
        if (managed.restartTimer) {
            clearTimeout(managed.restartTimer);
            managed.restartTimer = null;
        }

        if (!managed.process) {
            managed.status.status = 'stopped';
            return true;
        }

        return new Promise((resolve) => {
            const proc = managed.process!;
            
            // Set up listener for exit
            const onExit = () => {
                managed.process = null;
                managed.status.status = 'stopped';
                managed.status.pid = undefined;
                managed.startedAt = null;
                this.emit('stopped', name);
                resolve(true);
            };

            proc.once('exit', onExit);

            // Send SIGTERM first
            proc.kill('SIGTERM');

            // Force kill after 5 seconds
            setTimeout(() => {
                if (managed.process) {
                    proc.kill('SIGKILL');
                }
            }, 5000);
        });
    }

    /**
     * Restart a process
     */
    async restart(name: string): Promise<boolean> {
        const managed = this.processes.get(name);
        if (!managed) {
            console.error(`Process ${name} not registered`);
            return false;
        }

        managed.status.status = 'restarting';
        await this.stop(name);
        return this.start(name);
    }

    /**
     * Get status of all processes
     */
    getStatus(): ProcessStatus[] {
        const statuses: ProcessStatus[] = [];
        
        for (const managed of this.processes.values()) {
            const status = { ...managed.status };
            
            if (managed.startedAt && managed.status.status === 'running') {
                status.uptime = Math.floor((Date.now() - managed.startedAt.getTime()) / 1000);
                status.startedAt = managed.startedAt;
            }
            
            statuses.push(status);
        }
        
        return statuses;
    }

    /**
     * Get status of a specific process
     */
    getProcessStatus(name: string): ProcessStatus | undefined {
        const managed = this.processes.get(name);
        if (!managed) return undefined;

        const status = { ...managed.status };
        if (managed.startedAt && managed.status.status === 'running') {
            status.uptime = Math.floor((Date.now() - managed.startedAt.getTime()) / 1000);
            status.startedAt = managed.startedAt;
        }
        
        return status;
    }

    /**
     * Shutdown all processes gracefully
     */
    async shutdown(): Promise<void> {
        if (this.shuttingDown) return;
        this.shuttingDown = true;

        console.log('\n🛑 Shutting down all processes...');

        const stopPromises: Promise<boolean>[] = [];
        for (const name of this.processes.keys()) {
            stopPromises.push(this.stop(name));
        }

        await Promise.all(stopPromises);
        console.log('✅ All processes stopped');
        
        this.emit('shutdown');
    }

    /**
     * Start all registered processes
     */
    async startAll(): Promise<void> {
        for (const name of this.processes.keys()) {
            await this.start(name);
        }
    }

    /**
     * Internal: spawn a child process
     */
    private spawnProcess(managed: ManagedProcess): Promise<boolean> {
        return new Promise((resolve) => {
            managed.status.status = 'starting';
            
            console.log(`🚀 Starting ${managed.config.name}: npm run ${managed.config.script}`);

            const proc = spawn('npm', ['run', managed.config.script], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                cwd: process.cwd(),
            });

            managed.process = proc;
            managed.status.pid = proc.pid;
            managed.startedAt = new Date();
            managed.status.status = 'running';

            // Pipe output with prefix
            proc.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    console.log(`[${managed.config.name}] ${line}`);
                }
            });

            proc.stderr?.on('data', (data: Buffer) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    console.error(`[${managed.config.name}] ${line}`);
                }
            });

            // Handle process exit
            proc.on('exit', (code, signal) => {
                const wasRunning = managed.status.status === 'running';
                managed.process = null;
                managed.status.pid = undefined;

                if (this.shuttingDown) {
                    managed.status.status = 'stopped';
                    return;
                }

                if (code !== 0 && wasRunning) {
                    managed.status.status = 'crashed';
                    managed.status.lastError = `Exited with code ${code} (signal: ${signal})`;
                    console.error(`💥 ${managed.config.name} crashed: ${managed.status.lastError}`);
                    this.emit('crashed', managed.config.name, code, signal);

                    // Auto-restart if enabled
                    if (managed.config.restartOnCrash && managed.restartCount < (managed.config.maxRestarts || 5)) {
                        managed.restartCount++;
                        managed.status.restarts = managed.restartCount;
                        
                        console.log(`🔄 Restarting ${managed.config.name} in ${managed.config.restartDelay}ms (attempt ${managed.restartCount}/${managed.config.maxRestarts})`);
                        
                        managed.restartTimer = setTimeout(() => {
                            this.spawnProcess(managed);
                        }, managed.config.restartDelay);
                    } else if (managed.restartCount >= (managed.config.maxRestarts || 5)) {
                        console.error(`❌ ${managed.config.name} exceeded max restarts, giving up`);
                    }
                } else {
                    managed.status.status = 'stopped';
                    console.log(`⏹️ ${managed.config.name} stopped`);
                }
            });

            proc.on('error', (err) => {
                managed.status.status = 'crashed';
                managed.status.lastError = err.message;
                console.error(`💥 ${managed.config.name} error: ${err.message}`);
                this.emit('error', managed.config.name, err);
            });

            // Consider it started after a brief delay
            setTimeout(() => {
                if (managed.status.status === 'running') {
                    this.emit('started', managed.config.name);
                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 500);
        });
    }
}

// Export singleton instance
export const processManager = new ProcessManager();
