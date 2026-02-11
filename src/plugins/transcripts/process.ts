/**
 * Transcripts PROCESS script - Transcribe audio files using WhisperX (local)
 * Run: npm run transcript:process
 *
 * Scans audio folder, transcribes new files, generates MindCache .md files grouped by day
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MindCache } from 'mindcache';
import { loadConfig, getResolvedPaths } from '../../config/config';
import { writeIfChanged } from '../../shared/write-if-changed';
import { TranscriptsPluginConfig, DEFAULT_CONFIG, SUPPORTED_AUDIO_EXTENSIONS, WHISPERX_DOCKER_IMAGE } from './config';
import { TranscriptEntry, TranscriptMetadata, ProcessedDay } from './types';

const execAsync = promisify(exec);
const METADATA_FILE = 'transcripts-metadata.json';

/**
 * Load metadata tracking which files have been processed
 */
async function loadMetadata(metadataPath: string): Promise<TranscriptMetadata> {
    try {
        const data = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { processed: {} };
    }
}

/**
 * Save metadata
 */
async function saveMetadata(metadataPath: string, metadata: TranscriptMetadata): Promise<void> {
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Get file modification date as YYYY-MM-DD
 */
async function getFileDate(filepath: string): Promise<string> {
    const stats = await fs.stat(filepath);
    return stats.mtime.toISOString().split('T')[0];
}

/**
 * Transcribe audio file using WhisperX Docker
 */
async function transcribeFile(
    filepath: string,
    outputDir: string,
    config: TranscriptsPluginConfig
): Promise<{ text: string; duration?: number }> {
    const filename = path.basename(filepath);
    const filenameNoExt = path.basename(filepath, path.extname(filepath));
    const audioDir = path.dirname(filepath);

    // Docker mode: mount audio dir and output dir
    const gpuFlag = config.device === 'cuda' ? '--gpus all' : '';
    const dockerArgs = [
        'docker', 'run', '--rm',
        gpuFlag,
        `-v "${audioDir}:/audio:ro"`,
        `-v "${outputDir}:/output"`,
        WHISPERX_DOCKER_IMAGE + ':no_model',
        '--',
        `/audio/${filename}`,
        '--model', config.model,
        '--compute_type', config.computeType,
        '--output_dir', '/output',
        '--output_format', 'json',
    ].filter(Boolean);

    if (config.language) {
        dockerArgs.push('--language', config.language);
    }

    const cmd = dockerArgs.join(' ');

    try {
        await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 30 * 60 * 1000 }); // 30min timeout
    } catch (error: any) {
        throw new Error(`WhisperX failed: ${error.message}`);
    }

    // Read the output JSON
    const jsonPath = path.join(outputDir, `${filenameNoExt}.json`);
    try {
        const data = await fs.readFile(jsonPath, 'utf-8');
        const result = JSON.parse(data);

        // WhisperX outputs segments array
        const segments = result.segments || [];
        const text = segments.map((s: any) => s.text).join(' ').trim();

        // Calculate duration from last segment
        let duration: number | undefined;
        if (segments.length > 0) {
            const lastSeg = segments[segments.length - 1];
            duration = lastSeg.end;
        }

        return { text, duration };
    } catch {
        throw new Error(`Failed to read WhisperX output: ${jsonPath}`);
    }
}

/**
 * Find all audio files in folder
 */
async function findAudioFiles(folder: string): Promise<string[]> {
    const files: string[] = [];

    try {
        const entries = await fs.readdir(folder, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
                    files.push(path.join(folder, entry.name));
                }
            }
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`📁 Transcripts folder does not exist: ${folder}`);
        } else {
            throw error;
        }
    }

    return files.sort();
}

/**
 * Group transcripts by date
 */
function groupByDate(transcripts: TranscriptEntry[]): ProcessedDay[] {
    const byDate: Record<string, TranscriptEntry[]> = {};

    for (const t of transcripts) {
        if (!byDate[t.fileDate]) {
            byDate[t.fileDate] = [];
        }
        byDate[t.fileDate].push(t);
    }

    return Object.entries(byDate)
        .map(([date, transcripts]) => ({ date, transcripts }))
        .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Generate MindCache markdown for a day's transcripts
 */
function generateMindCache(day: ProcessedDay): string {
    const mindcache = new MindCache();

    for (const transcript of day.transcripts) {
        const keyName = `Transcript - ${transcript.filename}`;

        let content = transcript.text;
        if (transcript.duration) {
            const minutes = Math.floor(transcript.duration / 60);
            const seconds = Math.round(transcript.duration % 60);
            content += `\n\n⏱️ Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        const tags = ['transcript', day.date];
        if (transcript.language) {
            tags.push(`lang:${transcript.language}`);
        }

        mindcache.set_value(keyName, content, {
            contentTags: tags,
            zIndex: 0
        });
    }

    return mindcache.toMarkdown();
}

/**
 * Check if Docker and WhisperX image are available
 */
async function checkDocker(): Promise<boolean> {
    try {
        // Check Docker is available
        await execAsync('docker --version');
        // Pull image if not present (will be quick if already cached)
        console.log(`🐳 Checking Docker image: ${WHISPERX_DOCKER_IMAGE}:no_model`);
        await execAsync(`docker pull ${WHISPERX_DOCKER_IMAGE}:no_model`, { timeout: 5 * 60 * 1000 });
        return true;
    } catch {
        return false;
    }
}

async function main() {
    console.log('🎙️ Transcripts Process - Transcribing audio files (WhisperX)\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.transcripts as TranscriptsPluginConfig | undefined;
    const transcriptsConfig = pluginConfig || DEFAULT_CONFIG;

    // Check Docker is available
    const hasDocker = await checkDocker();
    if (!hasDocker) {
        console.error('❌ Docker not found or image pull failed.');
        console.error('   Install Docker: https://docs.docker.com/get-docker/');
        process.exit(1);
    }
    console.log(`✅ 🐳 WhisperX ready (model: ${transcriptsConfig.model}, device: ${transcriptsConfig.device})`);

    const transcriptsFolder = path.resolve(process.cwd(), transcriptsConfig.transcriptsFolder);
    console.log(`📁 Scanning: ${transcriptsFolder}`);

    // Find audio files
    const audioFiles = await findAudioFiles(transcriptsFolder);
    if (audioFiles.length === 0) {
        console.log('⚠️ No audio files found.');
        process.exit(0);
    }
    console.log(`📄 Found ${audioFiles.length} audio file(s)\n`);

    // Load metadata to track processed files
    const outputDir = path.join(paths.connectorData, 'transcripts');
    await fs.mkdir(outputDir, { recursive: true });
    const metadataPath = path.join(outputDir, METADATA_FILE);
    const metadata = await loadMetadata(metadataPath);

    // Process new files
    const allTranscripts: TranscriptEntry[] = [];
    let newCount = 0;

    for (const filepath of audioFiles) {
        const filename = path.basename(filepath);

        // Check if already processed
        if (metadata.processed[filename]) {
            console.log(`⏭️ Skipping (already processed): ${filename}`);

            // Still load the cached transcript for output
            const cachedPath = path.join(outputDir, `${filename}.json`);
            try {
                const cached = JSON.parse(await fs.readFile(cachedPath, 'utf-8')) as TranscriptEntry;
                allTranscripts.push(cached);
            } catch {
                // Cached file missing, will re-process
                delete metadata.processed[filename];
            }
            continue;
        }

        console.log(`🎧 Transcribing: ${filename}...`);

        try {
            const fileDate = await getFileDate(filepath);
            const result = await transcribeFile(filepath, outputDir, transcriptsConfig);

            const entry: TranscriptEntry = {
                filename,
                filepath,
                fileDate,
                text: result.text,
                duration: result.duration,
                language: transcriptsConfig.language,
                transcribedAt: new Date().toISOString(),
            };

            // Cache the transcript
            const cachePath = path.join(outputDir, `${filename}.json`);
            await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));

            // Track as processed
            metadata.processed[filename] = entry.transcribedAt;
            allTranscripts.push(entry);
            newCount++;

            console.log(`   ✅ Transcribed (${result.text.length} chars)`);
        } catch (error: any) {
            console.error(`   ❌ Failed: ${error.message}`);
        }
    }

    // Save metadata
    await saveMetadata(metadataPath, metadata);

    // Group by date and generate MindCache files
    const byDate = groupByDate(allTranscripts);
    console.log(`\n📅 Generating files for ${byDate.length} day(s)...`);

    for (const day of byDate) {
        const mindCacheContent = generateMindCache(day);
        const mdPath = path.join(outputDir, `transcripts-${day.date}.md`);
        const written = await writeIfChanged(mdPath, mindCacheContent);
        if (written) {
            console.log(`   ✅ ${day.date}: ${day.transcripts.length} transcript(s)`);
        } else {
            console.log(`   ⏭️  Skipped ${path.basename(mdPath)} (no changes)`);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   New transcriptions: ${newCount}`);
    console.log(`   Total transcripts: ${allTranscripts.length}`);
    console.log(`   Days: ${byDate.length}`);
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
