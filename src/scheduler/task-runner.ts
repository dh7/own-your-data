/**
 * Task Runner
 * 
 * Runs scheduled tasks (get, process, push) based on config/scheduler.json
 * Features:
 * - Respects active hours
 * - Random variance for human-like scheduling
 * - Task history tracking
 * - Manual run support
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { loadSchedulerConfig, SchedulerConfig } from '../config/config';
import { discoverPlugins, getPlugin } from '../plugins/index';

export interface TaskExecution {
    plugin: string;
    command: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt?: Date;
    completedAt?: Date;
    exitCode?: number;
    error?: string;
}

export interface ScheduledTask {
    plugins: string[];
    commands: Array<'get' | 'process' | 'push'>;
    intervalHours?: number;
    randomMinutes?: number;
    schedule?: 'manual';
    lastRun?: Date;
    nextRun?: Date;
}

export interface TaskStatus {
    tasks: ScheduledTask[];
    recentExecutions: TaskExecution[];
    isWithinActiveHours: boolean;
    activeHours: { start: number; end: number };
}

export class TaskRunner extends EventEmitter {
    private config: SchedulerConfig | null = null;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private recentExecutions: TaskExecution[] = [];
    private maxExecutionHistory = 50;
    private running = false;

    /**
     * Load scheduler config and start running tasks
     */
    async start(): Promise<void> {
        this.config = await loadSchedulerConfig();
        this.running = true;
        
        console.log('📅 Task runner started');
        console.log(`   Active hours: ${this.config.activeHours.start}:00 - ${this.config.activeHours.end}:00`);

        // Schedule all tasks
        for (let i = 0; i < this.config.tasks.length; i++) {
            const task = this.config.tasks[i];
            if (task.schedule !== 'manual' && task.intervalHours) {
                this.scheduleTask(i, task);
            }
        }
    }

    /**
     * Stop all scheduled tasks
     */
    stop(): void {
        this.running = false;
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        console.log('📅 Task runner stopped');
    }

    /**
     * Check if current time is within active hours
     */
    isWithinActiveHours(): boolean {
        if (!this.config) return false;
        
        const hour = new Date().getHours();
        const { start, end } = this.config.activeHours;
        
        if (start <= end) {
            return hour >= start && hour < end;
        } else {
            // Handles overnight ranges like 22:00 - 06:00
            return hour >= start || hour < end;
        }
    }

    /**
     * Get status of all tasks
     */
    getStatus(): TaskStatus {
        return {
            tasks: this.config?.tasks.map((task, i) => ({
                ...task,
                lastRun: this.getLastRun(i),
                nextRun: this.getNextRun(i),
            })) || [],
            recentExecutions: this.recentExecutions.slice(-20),
            isWithinActiveHours: this.isWithinActiveHours(),
            activeHours: this.config?.activeHours || { start: 7, end: 23 },
        };
    }

    /**
     * Run a task manually (ignores schedule and active hours)
     */
    async runTask(plugins: string[], commands: Array<'get' | 'process' | 'push'>): Promise<TaskExecution[]> {
        const executions: TaskExecution[] = [];

        for (const plugin of plugins) {
            for (const command of commands) {
                const execution = await this.executeCommand(plugin, command);
                executions.push(execution);
            }
        }

        return executions;
    }

    /**
     * Run a single plugin command manually
     */
    async runPluginCommand(plugin: string, command: string): Promise<TaskExecution> {
        return this.executeCommand(plugin, command);
    }

    /**
     * Schedule a task to run at intervals
     */
    private scheduleTask(index: number, task: ScheduledTask): void {
        const key = `task-${index}`;
        
        // Clear existing timer
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key)!);
        }

        // Calculate next run time with random variance
        const baseIntervalMs = (task.intervalHours || 1) * 60 * 60 * 1000;
        const varianceMs = (task.randomMinutes || 0) * 60 * 1000;
        const randomVariance = Math.random() * varianceMs * 2 - varianceMs;
        const intervalMs = Math.max(baseIntervalMs + randomVariance, 60000); // Min 1 minute

        console.log(`   Scheduled [${task.plugins.join(', ')}]: every ${(intervalMs / 3600000).toFixed(1)}h`);

        const timer = setTimeout(async () => {
            if (!this.running) return;

            // Check active hours
            if (!this.isWithinActiveHours()) {
                console.log(`⏰ Skipping [${task.plugins.join(', ')}] - outside active hours`);
                // Reschedule for later
                this.scheduleTask(index, task);
                return;
            }

            // Run the task
            console.log(`\n🏃 Running scheduled task: [${task.plugins.join(', ')}] ${task.commands.join(' → ')}`);
            
            for (const plugin of task.plugins) {
                for (const command of task.commands) {
                    await this.executeCommand(plugin, command);
                }
            }

            // Reschedule
            if (this.running) {
                this.scheduleTask(index, task);
            }
        }, intervalMs);

        this.timers.set(key, timer);
    }

    /**
     * Execute a single command
     */
    private executeCommand(plugin: string, command: string): Promise<TaskExecution> {
        return new Promise(async (resolve) => {
            const execution: TaskExecution = {
                plugin,
                command,
                status: 'pending',
            };

            // Verify plugin exists and has this command
            const discovered = await getPlugin(plugin);
            if (!discovered) {
                execution.status = 'failed';
                execution.error = `Plugin ${plugin} not found`;
                this.addExecution(execution);
                resolve(execution);
                return;
            }

            const manifest = discovered.manifest;
            if (!(command in manifest.commands) || !manifest.commands[command as keyof typeof manifest.commands]) {
                execution.status = 'failed';
                execution.error = `Plugin ${plugin} has no ${command} command`;
                this.addExecution(execution);
                resolve(execution);
                return;
            }

            execution.status = 'running';
            execution.startedAt = new Date();
            this.emit('taskStarted', execution);

            const scriptName = `${plugin}:${command}`;
            console.log(`   → npm run ${scriptName}`);

            const proc = spawn('npm', ['run', scriptName], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                cwd: process.cwd(),
            });

            let output = '';
            let errorOutput = '';

            proc.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });

            proc.stderr?.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });

            proc.on('exit', (code) => {
                execution.completedAt = new Date();
                execution.exitCode = code ?? undefined;

                if (code === 0) {
                    execution.status = 'completed';
                    console.log(`   ✅ ${scriptName} completed`);
                } else {
                    execution.status = 'failed';
                    execution.error = errorOutput || `Exit code ${code}`;
                    console.log(`   ❌ ${scriptName} failed: ${execution.error}`);
                }

                this.addExecution(execution);
                this.emit('taskCompleted', execution);
                resolve(execution);
            });

            proc.on('error', (err) => {
                execution.status = 'failed';
                execution.error = err.message;
                execution.completedAt = new Date();
                this.addExecution(execution);
                this.emit('taskCompleted', execution);
                resolve(execution);
            });
        });
    }

    /**
     * Add execution to history
     */
    private addExecution(execution: TaskExecution): void {
        this.recentExecutions.push(execution);
        if (this.recentExecutions.length > this.maxExecutionHistory) {
            this.recentExecutions.shift();
        }
    }

    /**
     * Get last run time for a task
     */
    private getLastRun(taskIndex: number): Date | undefined {
        const task = this.config?.tasks[taskIndex];
        if (!task) return undefined;

        // Find the most recent execution for any plugin in this task
        for (let i = this.recentExecutions.length - 1; i >= 0; i--) {
            const exec = this.recentExecutions[i];
            if (task.plugins.includes(exec.plugin) && exec.completedAt) {
                return exec.completedAt;
            }
        }
        return undefined;
    }

    /**
     * Get next scheduled run time for a task (approximate)
     */
    private getNextRun(taskIndex: number): Date | undefined {
        const task = this.config?.tasks[taskIndex];
        if (!task || task.schedule === 'manual' || !task.intervalHours) return undefined;

        const lastRun = this.getLastRun(taskIndex);
        if (!lastRun) {
            // First run - approximately now
            return new Date();
        }

        return new Date(lastRun.getTime() + task.intervalHours * 60 * 60 * 1000);
    }
}

// Export singleton instance
export const taskRunner = new TaskRunner();
