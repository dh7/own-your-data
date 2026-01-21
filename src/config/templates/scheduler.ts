/**
 * Scheduler configuration section for human-like behavior
 * No cron - runs as a daemon with natural timing patterns
 */

import { SchedulerConfig } from '../config';

export function renderSchedulerSection(config?: SchedulerConfig): string {
    const defaults: SchedulerConfig = {
        activeHours: { start: 7, end: 23 },
        twitter: { enabled: true, intervalHours: 6, randomMinutes: 30 },
        instagram: { enabled: true, intervalHours: 6, randomMinutes: 30 },
        push: { enabled: true, intervalHours: 1 },
    };

    const scheduler = config || defaults;

    return `
<details>
    <summary>
        <span class="icon">⏰</span>
        Scheduler
        <span class="status" id="scheduler-status">Checking...</span>
    </summary>
    <div class="section-content">
        <div class="info-box" style="margin-bottom: 1.5rem; padding: 1rem; background: #1a2a1a; border: 1px solid #2a4a2a; border-radius: 4px;">
            <strong>🤖 Unified Collector Daemon</strong>
            <p style="margin: 0.5rem 0 0 0; color: #8b949e; font-size: 0.9rem;">
                Run <code>npm run get_all</code> to start the daemon. It collects Twitter & Instagram 
                with human-like timing (more active during day, sleeps at night, random delays).
            </p>
        </div>
        
        <div class="whatsapp-note" style="margin-bottom: 1.5rem; padding: 0.75rem; background: #2a2a1a; border: 1px solid #4a4a2a; border-radius: 4px;">
            <strong>📱 WhatsApp</strong>
            <span style="color: #f0a030; margin-left: 0.5rem;">
                ⚠️ Must be launched separately — it's a real-time listener
            </span>
            <p style="margin: 0.5rem 0 0 0; color: #8b949e; font-size: 0.85rem;">
                Run <code>npm run whatsapp:get</code> in another terminal. It stays connected and receives messages in real-time.
            </p>
        </div>
        
        <form action="/scheduler" method="POST">
            <h4 style="margin-bottom: 0.75rem; color: #aaa;">Active Hours</h4>
            <div class="time-range" style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
                <div>
                    <label for="active-start">Start</label>
                    <select id="active-start" name="activeStart">
                        ${Array.from({ length: 24 }, (_, i) =>
        `<option value="${i}" ${i === scheduler.activeHours.start ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`
    ).join('')}
                    </select>
                </div>
                <span style="color: #666;">to</span>
                <div>
                    <label for="active-end">End</label>
                    <select id="active-end" name="activeEnd">
                        ${Array.from({ length: 24 }, (_, i) =>
        `<option value="${i}" ${i === scheduler.activeHours.end ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`
    ).join('')}
                    </select>
                </div>
                <p class="help" style="margin: 0; color: #666;">Collectors sleep outside these hours</p>
            </div>
            
            <h4 style="margin-bottom: 0.75rem; color: #aaa;">Connector Intervals</h4>
            <div class="schedule-grid">
                <div class="schedule-item">
                    <label>
                        <input type="checkbox" name="twitterEnabled" ${scheduler.twitter?.enabled ? 'checked' : ''} />
                        🐦 Twitter
                    </label>
                    <div class="interval-inputs">
                        <span>Every</span>
                        <input type="number" name="twitterInterval" value="${scheduler.twitter?.intervalHours || 6}" min="1" max="24" style="width: 60px;" />
                        <span>hours</span>
                        <span style="color: #666; margin-left: 0.5rem;">±</span>
                        <input type="number" name="twitterRandom" value="${scheduler.twitter?.randomMinutes || 30}" min="0" max="120" style="width: 60px;" />
                        <span>min</span>
                    </div>
                </div>
                
                <div class="schedule-item">
                    <label>
                        <input type="checkbox" name="instagramEnabled" ${scheduler.instagram?.enabled ? 'checked' : ''} />
                        📸 Instagram
                    </label>
                    <div class="interval-inputs">
                        <span>Every</span>
                        <input type="number" name="instagramInterval" value="${scheduler.instagram?.intervalHours || 6}" min="1" max="24" style="width: 60px;" />
                        <span>hours</span>
                        <span style="color: #666; margin-left: 0.5rem;">±</span>
                        <input type="number" name="instagramRandom" value="${scheduler.instagram?.randomMinutes || 30}" min="0" max="120" style="width: 60px;" />
                        <span>min</span>
                    </div>
                </div>
                
                <div class="schedule-item" style="background: #1a1a2a; border-color: #2a2a4a;">
                    <label>
                        <input type="checkbox" name="pushEnabled" ${scheduler.push?.enabled ? 'checked' : ''} />
                        📤 Push to GitHub
                    </label>
                    <div class="interval-inputs">
                        <span>Every</span>
                        <input type="number" name="pushInterval" value="${scheduler.push?.intervalHours || 1}" min="1" max="24" style="width: 60px;" />
                        <span>hours</span>
                        <span style="color: #666; margin-left: 0.5rem;">(syncs WhatsApp + all data)</span>
                    </div>
                </div>
            </div>
            
            <button type="submit" style="margin-top: 1.5rem;">💾 Save Scheduler Config</button>
        </form>
        
        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />
        
        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run get_all</code> - Start the unified collector daemon<br>
            <code>npm run whatsapp:get</code> - Run WhatsApp only (stays connected)<br>
            <code>npm run twitter:get</code> - Run Twitter once<br>
            <code>npm run instagram:get</code> - Run Instagram once<br>
            <code>npm run push</code> - Push all data to GitHub once
        </p>
    </div>
</details>

<style>
    .schedule-grid {
        display: grid;
        gap: 1rem;
    }
    
    .schedule-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 4px;
        flex-wrap: wrap;
    }
    
    .schedule-item label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 140px;
        cursor: pointer;
    }
    
    .interval-inputs {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #aaa;
        font-size: 0.9rem;
    }
    
    .interval-inputs input[type="number"] {
        text-align: center;
        font-family: monospace;
    }
    
    .time-range select {
        padding: 0.5rem;
        background: #0a0a0a;
        border: 1px solid #333;
        color: #fff;
        border-radius: 4px;
    }
</style>

<script>
(function() {
    async function checkDaemonStatus() {
        try {
            const res = await fetch('/scheduler/status');
            const data = await res.json();
            const statusEl = document.getElementById('scheduler-status');
            
            if (data.running) {
                statusEl.textContent = '🟢 Running';
                statusEl.className = 'status connected';
            } else {
                statusEl.textContent = '⚪ Stopped';
                statusEl.className = 'status';
            }
        } catch {
            document.getElementById('scheduler-status').textContent = '❓ Unknown';
        }
    }
    
    // Check on load and every 10 seconds
    checkDaemonStatus();
    setInterval(checkDaemonStatus, 10000);
})();
</script>
`;
}
