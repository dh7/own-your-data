/**
 * Transcripts plugin template
 *
 * Renders the configuration UI section for Transcripts (WhisperX via Docker)
 */

import { BasePluginConfig, PluginRenderData } from '../types';
import { TranscriptsPluginConfig, DEFAULT_CONFIG, SUPPORTED_AUDIO_EXTENSIONS, WHISPERX_MODELS, WHISPERX_DOCKER_IMAGE } from './config';

/**
 * Render the Transcripts configuration section
 */
export function renderTemplate(
    config: BasePluginConfig & Record<string, unknown>,
    data: PluginRenderData
): string {
    const cfg = config as unknown as TranscriptsPluginConfig;
    const transcriptsFolder = cfg.transcriptsFolder || DEFAULT_CONFIG.transcriptsFolder;
    const githubPath = cfg.githubPath || DEFAULT_CONFIG.githubPath;
    const language = cfg.language || DEFAULT_CONFIG.language;
    const model = cfg.model || DEFAULT_CONFIG.model;
    const device = cfg.device || DEFAULT_CONFIG.device;
    const computeType = cfg.computeType || DEFAULT_CONFIG.computeType;
    const intervalHours = cfg.intervalHours ?? DEFAULT_CONFIG.intervalHours;
    const randomMinutes = cfg.randomMinutes ?? DEFAULT_CONFIG.randomMinutes;
    const enabled = cfg.enabled ?? DEFAULT_CONFIG.enabled;

    const dockerInstalled = data.dockerInstalled ?? false;
    const statusClass = dockerInstalled ? 'connected' : 'pending';
    const statusText = dockerInstalled ? '✅ Ready' : '⚠️ Docker needed';

    return `
<details${data.justSaved ? ' open' : ''}>
    <summary>
        <span class="icon">🎙️</span>
        Audio Transcripts
        <span class="status ${statusClass}">${statusText}</span>
    </summary>
    <div class="section-content">
        <p class="help" style="margin-bottom: 1rem; color: #7ee787;">
            🐳 <strong>Local transcription</strong> using WhisperX via Docker - no API keys needed!<br>
            <span style="color: #8b949e;">Supported: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}</span>
        </p>

        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0a1a1a; border: 1px solid #2a4a4a; border-radius: 4px;">
            <code style="color: #7ee787;">${WHISPERX_DOCKER_IMAGE}</code>
        </div>

        <form action="/plugin/transcripts" method="POST">
            <!-- Scheduling -->
            <h4 style="margin-bottom: 0.75rem; color: #aaa;">⏰ Scheduling</h4>
            <div class="schedule-row" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding: 0.75rem; background: #0a0a0a; border: 1px solid #333; border-radius: 4px;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} />
                    Enable scheduling
                </label>
                <div style="display: flex; align-items: center; gap: 0.5rem; color: #aaa;">
                    <span>Every</span>
                    <input type="number" name="intervalHours" value="${intervalHours}" min="1" max="24" style="width: 60px;" />
                    <span>hours</span>
                    <span style="color: #666; margin-left: 0.5rem;">±</span>
                    <input type="number" name="randomMinutes" value="${randomMinutes}" min="0" max="120" style="width: 60px;" />
                    <span>min</span>
                </div>
            </div>

            <h4 style="margin-bottom: 0.75rem; color: #aaa;">📁 Audio Source</h4>
            <div>
                <label for="transcripts-folder">Transcripts Folder</label>
                <input type="text" id="transcripts-folder" name="transcriptsFolder"
                    value="${transcriptsFolder}"
                    placeholder="./transcripts" />
                <p class="help">Folder containing audio files to transcribe</p>
            </div>

            <h4 style="margin-bottom: 0.75rem; color: #aaa;">🤖 WhisperX Settings</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <label for="transcripts-model">Model</label>
                    <select id="transcripts-model" name="model" style="width: 100%;">
                        ${WHISPERX_MODELS.map(m => `
                            <option value="${m}" ${model === m ? 'selected' : ''}>${m}</option>
                        `).join('')}
                    </select>
                    <p class="help">Larger = more accurate, slower</p>
                </div>
                <div>
                    <label for="transcripts-device">Device</label>
                    <select id="transcripts-device" name="device" style="width: 100%;">
                        <option value="cpu" ${device === 'cpu' ? 'selected' : ''}>CPU</option>
                        <option value="cuda" ${device === 'cuda' ? 'selected' : ''}>CUDA (GPU)</option>
                    </select>
                    <p class="help">Use CUDA if you have NVIDIA GPU</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div>
                    <label for="transcripts-compute">Compute Type</label>
                    <select id="transcripts-compute" name="computeType" style="width: 100%;">
                        <option value="int8" ${computeType === 'int8' ? 'selected' : ''}>int8 (fastest)</option>
                        <option value="float16" ${computeType === 'float16' ? 'selected' : ''}>float16 (GPU)</option>
                        <option value="float32" ${computeType === 'float32' ? 'selected' : ''}>float32 (CPU accurate)</option>
                    </select>
                </div>
                <div>
                    <label for="transcripts-language">Language</label>
                    <input type="text" id="transcripts-language" name="language"
                        value="${language || ''}"
                        placeholder="auto-detect" />
                    <p class="help">Leave empty for auto (multilingual)</p>
                </div>
            </div>

            <h4 style="margin-bottom: 0.75rem; margin-top: 1.5rem; color: #aaa;">📤 Output</h4>
            <div>
                <label for="transcripts-github-path">GitHub Output Path</label>
                <input type="text" id="transcripts-github-path" name="githubPath"
                    value="${githubPath}"
                    placeholder="transcripts" />
                <p class="help">Folder in your GitHub repo</p>
            </div>

            <button type="submit">💾 Save Transcripts Config</button>
        </form>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #30363d;" />

        <p style="color: #8b949e; font-size: 0.85rem;">
            <strong>Commands:</strong><br>
            <code>npm run transcript:process</code> - Transcribe audio files<br>
            <code>npm run transcript:push</code> - Sync to GitHub
        </p>
    </div>
</details>
`;
}

/**
 * Parse form data into plugin config
 */
export function parseFormData(body: Record<string, string>): TranscriptsPluginConfig {
    return {
        enabled: body.enabled === 'on',
        intervalHours: parseInt(body.intervalHours) || DEFAULT_CONFIG.intervalHours,
        randomMinutes: parseInt(body.randomMinutes) || DEFAULT_CONFIG.randomMinutes,
        transcriptsFolder: body.transcriptsFolder || DEFAULT_CONFIG.transcriptsFolder,
        model: (body.model as TranscriptsPluginConfig['model']) || DEFAULT_CONFIG.model,
        device: (body.device as 'cuda' | 'cpu') || DEFAULT_CONFIG.device,
        computeType: (body.computeType as 'float16' | 'float32' | 'int8') || DEFAULT_CONFIG.computeType,
        language: body.language || undefined,
        githubPath: body.githubPath || DEFAULT_CONFIG.githubPath,
    };
}

/**
 * Get default config
 */
export function getDefaultConfig(): TranscriptsPluginConfig {
    return { ...DEFAULT_CONFIG };
}
