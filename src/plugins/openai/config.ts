export interface OpenAIPluginConfig {
    enabled: boolean;
    // The specific subfolder inside raw-dumps/openAI containing conversations.json
    // e.g. "dbfa57d0.../conversations.json" or just the folder name "dbfa57d0..."
    exportFolder?: string;
    githubPath?: string;
}

export const DEFAULT_CONFIG: OpenAIPluginConfig = {
    enabled: true,
    githubPath: 'openai',
};
