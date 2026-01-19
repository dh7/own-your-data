# Twitter Scraper Implementation Guide

This guide explains how to implement a reliable Twitter scraper using the Apify API. This implementation mimics the robust setup used in the `chat-with-karpathy` project.

## 1. Prerequisites

- **Node.js**: Ensure Node.js is installed.
- **Apify Account**: You need an account at [Apify](https://apify.com/).
- **Apify API Token**: obtaining your API token from the Apify console.

## 2. Setup

Initialize your project and install the necessary dependencies:

```bash
npm install apify-client dotenv
npm install -D typescript ts-node @types/node
```

## 3. Configuration

Create a `.env` file in your project root to store your API token securely:

```env
APIFY_API_TOKEN=your_token_here
```

## 4. The Scraper Script

Create a file named `scrape-tweets.ts`. This script uses the `web.harvester/easy-twitter-search-scraper` actor, which is cost-effective and reliable.

```typescript
import { ApifyClient } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

if (!APIFY_TOKEN) {
    console.error('❌ Error: APIFY_API_TOKEN not found in .env');
    console.error('Please sign up at https://apify.com, get your API token, and add it to .env');
    process.exit(1);
}

const client = new ApifyClient({
    token: APIFY_TOKEN,
});

async function scrapeTweets(targetUsername: string, count: number = 100) {
    console.log(`🚀 Starting tweet scrape for @${targetUsername}...`);

    // Input for "Easy Twitter Search Scraper"
    const runInput = {
        "searchQueries": [`from:${targetUsername}`],
        "tweetsDesired": count,
    };

    try {
        console.log('Using actor: web.harvester/easy-twitter-search-scraper');
        
        // Start the actor and wait for it to finish
        const run = await client.actor('web.harvester/easy-twitter-search-scraper').call(runInput);

        console.log(`✅ Scrape finished! Fetching results from dataset ${run.defaultDatasetId}...`);

        // Fetch results from the dataset
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (items.length === 0) {
            console.log('⚠️ No tweets found.');
            return;
        }

        // Transform items to a clean, usable format
        const tweets = items.map((item: any) => ({
            id: item.id_str || item.id || item.rest_id,
            text: item.full_text || item.text || item.legacy?.full_text,
            created_at: item.timestamp || item.created_at || item.legacy?.created_at,
            likes: item.likes || item.favorite_count || item.legacy?.favorite_count || 0,
            retweets: item.retweets || item.retweet_count || item.legacy?.retweet_count || 0,
            replies: item.replies || item.reply_count || item.legacy?.reply_count || 0,
            url: item.url || (item.legacy?.id_str ? `https://twitter.com/${targetUsername}/status/${item.legacy.id_str}` : undefined),
            is_retweet: item.isRetweet || item.is_retweet || item.legacy?.retweeted || false,
            is_reply: item.isReply || item.is_reply || false,
        }));

        // Ensure output directory exists
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)){
            fs.mkdirSync(dataDir);
        }

        const outputPath = path.join(dataDir, `${targetUsername}_tweets.json`);
        fs.writeFileSync(outputPath, JSON.stringify(tweets, null, 2));

        console.log(`💾 Saved ${tweets.length} tweets to ${outputPath}`);
        console.log('🔍 First tweet preview:', JSON.stringify(tweets[0], null, 2));

    } catch (error) {
        console.error('❌ Error scraping tweets:', error);
    }
}

// Get username from command line arg or default to 'karpathy'
const username = process.argv[2] || 'karpathy';
scrapeTweets(username);
```

## 5. Usage

Add a script to your `package.json` for convenience:

```json
"scripts": {
  "scrape": "ts-node scrape-tweets.ts"
}
```

Run the scraper:

```bash
# Default (scrapes 'karpathy')
npm run scrape

# Scrape a specific user (e.g., 'elonmusk')
npm run scrape elonmusk
```

## 6. Output Structure

The script generates a JSON file in the `data/` directory with the following clean structure:

```json
[
  {
    "id": "180123456789",
    "text": "Hello world! This is a tweet.",
    "created_at": "Fri Jan 18 10:00:00 +0000 2024",
    "likes": 1200,
    "retweets": 450,
    "replies": 32,
    "url": "https://twitter.com/username/status/180123456789",
    "is_retweet": false,
    "is_reply": false
  }
]
```

## 7. Advanced: Fetching Past Runs

If a run completes on the Apify cloud but fails locally (e.g., due to timeout), you can fetch the results using the Run ID:

```typescript
const run = await client.run('YOUR_RUN_ID').get();
const { items } = await client.dataset(run.defaultDatasetId).listItems();
// ... process items as above
```
