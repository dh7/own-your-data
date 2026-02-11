/**
 * Shared utility to write files only when content has actually changed.
 * Strips the dynamic "Export Date:" line from MindCache output before comparing,
 * so that re-running a process script doesn't create spurious file changes.
 */

import * as fs from 'fs/promises';

function normalizeContent(content: string): string {
    return content
        .split('\n')
        .filter(line => !line.trim().startsWith('Export Date:'))
        .join('\n');
}

/**
 * Write content to a file only if it has actually changed (ignoring the Export Date line).
 * @returns true if the file was written, false if skipped (no changes).
 */
export async function writeIfChanged(filePath: string, newContent: string): Promise<boolean> {
    try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        if (normalizeContent(existingContent) === normalizeContent(newContent)) {
            return false; // No meaningful change
        }
    } catch {
        // File doesn't exist yet — must write
    }

    await fs.writeFile(filePath, newContent, 'utf-8');
    return true;
}
