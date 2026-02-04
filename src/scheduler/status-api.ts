/**
 * Status API Server
 * 
 * HTTP API for monitoring and controlling the scheduler.
 * Used by the config UI to show status and trigger actions.
 */

import express, { Request, Response } from 'express';
import { processManager, ProcessStatus } from './process-manager';
import { taskRunner, TaskStatus } from './task-runner';

const app = express();
app.use(express.json());

// CORS for config server
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

/**
 * GET /status
 * Returns full scheduler status
 */
app.get('/status', (req: Request, res: Response) => {
    const processStatus = processManager.getStatus();
    const taskStatus = taskRunner.getStatus();

    res.json({
        scheduler: {
            running: true,
            uptime: process.uptime(),
        },
        processes: processStatus,
        tasks: taskStatus,
    });
});

/**
 * GET /processes
 * Returns status of all managed processes
 */
app.get('/processes', (req: Request, res: Response) => {
    res.json(processManager.getStatus());
});

/**
 * GET /processes/:name
 * Returns status of a specific process
 */
app.get('/processes/:name', (req: Request, res: Response) => {
    const status = processManager.getProcessStatus(req.params.name);
    if (!status) {
        return res.status(404).json({ error: 'Process not found' });
    }
    res.json(status);
});

/**
 * POST /processes/:name/start
 * Start a process
 */
app.post('/processes/:name/start', async (req: Request, res: Response) => {
    const { name } = req.params;
    const success = await processManager.start(name);
    
    if (success) {
        res.json({ success: true, message: `Started ${name}` });
    } else {
        res.status(500).json({ success: false, error: `Failed to start ${name}` });
    }
});

/**
 * POST /processes/:name/stop
 * Stop a process
 */
app.post('/processes/:name/stop', async (req: Request, res: Response) => {
    const { name } = req.params;
    const success = await processManager.stop(name);
    
    if (success) {
        res.json({ success: true, message: `Stopped ${name}` });
    } else {
        res.status(500).json({ success: false, error: `Failed to stop ${name}` });
    }
});

/**
 * POST /processes/:name/restart
 * Restart a process
 */
app.post('/processes/:name/restart', async (req: Request, res: Response) => {
    const { name } = req.params;
    const success = await processManager.restart(name);
    
    if (success) {
        res.json({ success: true, message: `Restarted ${name}` });
    } else {
        res.status(500).json({ success: false, error: `Failed to restart ${name}` });
    }
});

/**
 * GET /tasks
 * Returns status of all scheduled tasks
 */
app.get('/tasks', (req: Request, res: Response) => {
    res.json(taskRunner.getStatus());
});

/**
 * POST /tasks/run
 * Run a task manually
 * Body: { plugins: string[], commands: string[] }
 */
app.post('/tasks/run', async (req: Request, res: Response) => {
    const { plugins, commands } = req.body;

    if (!Array.isArray(plugins) || !Array.isArray(commands)) {
        return res.status(400).json({ error: 'plugins and commands must be arrays' });
    }

    const executions = await taskRunner.runTask(plugins, commands);
    res.json({ executions });
});

/**
 * POST /tasks/run/:plugin/:command
 * Run a single plugin command manually
 */
app.post('/tasks/run/:plugin/:command', async (req: Request, res: Response) => {
    const { plugin, command } = req.params;
    
    const execution = await taskRunner.runPluginCommand(plugin, command);
    res.json(execution);
});

/**
 * POST /shutdown
 * Gracefully shutdown the scheduler
 */
app.post('/shutdown', async (req: Request, res: Response) => {
    res.json({ success: true, message: 'Shutting down...' });
    
    // Give time for response to be sent
    setTimeout(async () => {
        taskRunner.stop();
        await processManager.shutdown();
        process.exit(0);
    }, 100);
});

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Export for use in main scheduler
export function startStatusApi(port: number = 3455): Promise<void> {
    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`📊 Status API listening on http://localhost:${port}`);
            resolve();
        });
    });
}

export { app };
