/**
 * Transcript types
 */

export interface TranscriptEntry {
    /** Original audio filename */
    filename: string;

    /** Full path to the audio file */
    filepath: string;

    /** File modification date (used for grouping by day) */
    fileDate: string;

    /** Transcription text */
    text: string;

    /** Duration in seconds (if available) */
    duration?: number;

    /** Language detected/used */
    language?: string;

    /** Timestamp when transcribed */
    transcribedAt: string;
}

export interface ProcessedDay {
    /** Date string (YYYY-MM-DD) */
    date: string;

    /** All transcripts for this day */
    transcripts: TranscriptEntry[];
}

export interface TranscriptMetadata {
    /** Map of filename -> transcribedAt timestamp */
    processed: Record<string, string>;
}
