/**
 * Simple CSV Parser that handles quoted fields and multiline values.
 * Returns an array of objects where keys are column headers.
 */
export function parseCSV(content: string): Record<string, string>[] {
    const lines: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    // Normalize line endings
    const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped quote
                    currentCell += '"';
                    i++; // Skip next quote
                } else {
                    // End of quoted cell
                    inQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n') {
                currentRow.push(currentCell);
                lines.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
    }

    // Add last row if not empty
    if (currentRow.length > 0 || currentCell.length > 0) {
        currentRow.push(currentCell);
        lines.push(currentRow);
    }

    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.trim());
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        // Skip empty rows
        if (row.length === 1 && row[0].trim() === '') continue;

        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            // Handle rows that might be shorter than headers (though valid CSVs shouldn't usually be)
            const value = row[j] || '';
            obj[headers[j]] = value.trim();
        }
        result.push(obj);
    }

    return result;
}
