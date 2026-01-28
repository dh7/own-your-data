/**
 * Chrome History Types
 */

export interface UrlEntry {
    url: string;
    title: string;
    timestamp: string;
    date: string;
}

export interface DailyHistory {
    date: string;
    urls: UrlEntry[];
}
