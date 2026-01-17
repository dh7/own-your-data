/**
 * Single File Auth State for Baileys
 * Consolidates all session data into a single JSON file instead of hundreds of files.
 */

import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from 'baileys';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Custom auth state that saves to a single JSON file
 */
export const useSingleFileAuthState = async (filename: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    let creds: AuthenticationCreds;
    let keys: any = {};

    // Try to load existing session
    try {
        const data = await fs.readFile(filename, { encoding: 'utf-8' });
        const parsed = JSON.parse(data, BufferJSON.reviver);
        creds = parsed.creds;
        keys = parsed.keys;
    } catch (error) {
        // If file doesn't exist or is invalid, start fresh
        creds = initAuthCreds();
        keys = {};
    }

    // Debounce saves to avoid excessive writes and race conditions
    let saveTimeout: NodeJS.Timeout | null = null;
    let savePromise: Promise<void> | null = null;

    const saveCreds = async () => {
        // Wait for any pending save to complete
        if (savePromise) await savePromise;
        
        savePromise = (async () => {
            try {
                // Ensure directory exists
                await fs.mkdir(path.dirname(filename), { recursive: true });
                const data = JSON.stringify({ creds, keys }, BufferJSON.replacer, 2);
                await fs.writeFile(filename + '.tmp', data);
                await fs.rename(filename + '.tmp', filename); // Atomic write
            } catch (err) {
                console.error('Failed to save auth state:', err);
                throw err;
            } finally {
                savePromise = null;
            }
        })();
        
        return savePromise;
    };

    // Debounced save for frequent key updates
    const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveCreds(), 100);
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        if (keys[key]) {
                            data[id] = keys[key];
                        }
                    }
                    return data;
                },
                set: async (data: any) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const key = `${category}-${id}`;
                            const value = data[category][id];
                            if (value) {
                                keys[key] = value;
                            } else {
                                delete keys[key];
                            }
                        }
                    }
                    debouncedSave(); // Debounced to batch rapid updates
                }
            }
        },
        saveCreds
    };
};
