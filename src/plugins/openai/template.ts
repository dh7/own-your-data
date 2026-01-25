import { OpenAIPluginConfig, DEFAULT_CONFIG } from './config';

export const template = `
<div class="plugin-section" id="openai-plugin">
    <div class="section-header">
        <h2>🤖 OpenAI / ChatGPT</h2>
        <div class="toggle-switch">
             <input type="checkbox" id="openai-enabled" name="openaiEnabled" \${data.config.plugins.openai?.enabled ? 'checked' : ''}>
             <label for="openai-enabled"></label>
        </div>
    </div>
    
    <div class="section-content">
        <p class="description">
            Process your ChatGPT data export (conversations.json). 
            <br>
            Place your extracted export folder in <code>raw-dumps/openAI/</code>.
        </p>

        <form action="/plugin/openai" method="POST">
             <div class="form-group">
                <label for="openai-folder">Export Folder Name</label>
                <input type="text" id="openai-folder" name="exportFolder" 
                    value="\${data.config.plugins.openai?.exportFolder || ''}" 
                    placeholder="e.g. dbfa57d0... or just leave empty to auto-detect">
                <p class="help-text">The folder inside <code>raw-dumps/openAI/</code> containing <code>conversations.json</code>.</p>
            </div>

            <div class="form-group">
                <label for="openai-github-path">GitHub Path</label>
                <input type="text" id="openai-github-path" name="githubPath" 
                    value="\${data.config.plugins.openai?.githubPath || 'openai'}"
                    placeholder="openai">
            </div>

            <button type="submit" class="save-btn">Save OpenAI Config</button>
        </form>
    </div>
</div>
`;
