/**
 * Transcripts plugin configuration types and defaults
 * Uses WhisperX via Docker for transcription
 */

import { BasePluginConfig } from '../types';

/**
 * Supported audio file extensions
 */
export const SUPPORTED_AUDIO_EXTENSIONS = [
    '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'
];

/**
 * WhisperX model sizes
 */
export const WHISPERX_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'] as const;
export type WhisperXModel = typeof WHISPERX_MODELS[number];

/**
 * Docker image for WhisperX
 */
export const WHISPERX_DOCKER_IMAGE = 'ghcr.io/jim60105/whisperx';

/**
 * Transcripts-specific configuration
 */
export interface TranscriptsPluginConfig extends BasePluginConfig {
    /** Folder containing audio files to transcribe */
    transcriptsFolder: string;

    /** WhisperX model to use */
    model: WhisperXModel;

    /** Language hint for transcription (e.g., 'en', 'es', 'fr') */
    language?: string;

    /** Device to use: 'cuda' or 'cpu' */
    device: 'cuda' | 'cpu';

    /** Compute type: 'float16', 'float32', or 'int8' */
    computeType: 'float16' | 'float32' | 'int8';

    /** GitHub path for this plugin's data */
    githubPath: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: TranscriptsPluginConfig = {
    enabled: true,
    transcriptsFolder: './transcripts',
    model: 'base',
    language: undefined, // auto-detect (supports multilingual)
    device: 'cpu',
    computeType: 'int8',
    githubPath: 'transcripts',
};

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(config?: Partial<TranscriptsPluginConfig>): TranscriptsPluginConfig {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
