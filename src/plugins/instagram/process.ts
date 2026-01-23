/**
 * Instagram PROCESS script - Generate viewer and markdown files
 * Run: npm run instagram:process
 *
 * Reads raw JSON dumps and generates:
 * - One .md file per account with all posts
 * - A viewer.html for browsing posts visually
 * - Copies images to connector_data/instagram/images/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig, getResolvedPaths } from '../../config/config';
import { InstagramPluginConfig, DEFAULT_CONFIG } from './config';

interface InstaPost {
    id: string;
    url: string;
    date: string | null;
    caption: string;
    imageUrl: string;
    localImagePath?: string;
    user: {
        username: string;
        displayname?: string;
    };
    likes: number;
    comments: number;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function cleanCaption(caption: string): string {
    if (!caption) return '';

    const colonMatch = caption.match(/:\s*"?(.+?)"?\.?\s*$/);
    if (colonMatch && colonMatch[1]) {
        return colonMatch[1].replace(/^"|"$/g, '').trim();
    }

    const cleaned = caption
        .replace(/^[a-z0-9_]+ on [A-Za-z]+ \d+, \d{4}\.?\s*/i, '')
        .replace(/^"|"$/g, '')
        .trim();

    if (!cleaned || cleaned === caption) {
        return '';
    }

    return cleaned;
}

import { MindCache } from 'mindcache';

function generateMarkdown(username: string, posts: InstaPost[]): string {
    const mindcache = new MindCache();

    const sortedPosts = [...posts].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
    });

    for (const post of sortedPosts) {
        const dateStr = formatDate(post.date) || 'Unknown date';
        const dateIso = post.date ? new Date(post.date).toISOString().split('T')[0] : 'unknown';
        const caption = cleanCaption(post.caption);
        const imagePath = post.id ? `./images/${username}/${post.id}.jpg` : '';

        // Generate content similar to manual markdown but structured for MindCache
        // We will store the full visual representation as the value (since it's rich text/markdown)
        const contentLines = [];
        if (imagePath) contentLines.push(`![Post](${imagePath})`);
        if (caption) contentLines.push(caption);
        contentLines.push(`❤️ ${post.likes} likes`);
        contentLines.push(`[View on Instagram](${post.url})`);

        const value = contentLines.join('\n\n');

        // Use post ID or date as key. Since date isn't unique, append ID or index.
        const keyName = `${dateIso}_${post.id || Math.random().toString(36).substr(2, 9)}`;

        mindcache.set_value(keyName, value, {
            contentTags: ['instagram', `@${username}`, dateIso],
            zIndex: post.likes || 0 // Use likes as z-index for interesting sorting? Or just 0.
        });
    }

    // Add header info as a special meta entry or just rely on file name?
    // MindCache `toMarkdown` generates a standard header.
    // If we want the specific "Last updated" header, we can add a meta entry.
    mindcache.set('meta_stats', JSON.stringify({
        lastUpdated: new Date().toISOString().split('T')[0],
        totalPosts: posts.length
    }));

    return mindcache.toMarkdown();
}

function generateViewerHTML(username: string, posts: InstaPost[]): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instagram Posts - @${username}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%);
            min-height: 100vh;
            color: #fafafa;
        }
        .header {
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding: 1rem 2rem;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }
        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .username { font-weight: 600; font-size: 1.1rem; }
        .stats {
            margin-left: auto;
            display: flex;
            gap: 2rem;
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.9rem;
        }
        .stats span strong { color: #fff; margin-right: 0.25rem; }
        .view-toggle {
            display: flex;
            justify-content: center;
            gap: 1rem;
            padding: 1.5rem;
            background: rgba(0, 0, 0, 0.3);
        }
        .view-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .view-btn:hover { background: rgba(255, 255, 255, 0.15); }
        .view-btn.active {
            background: linear-gradient(45deg, #f09433, #e6683c, #dc2743);
            border-color: transparent;
        }
        .grid-container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
        .posts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .grid-item {
            aspect-ratio: 1;
            position: relative;
            overflow: hidden;
            cursor: pointer;
            background: #1a1a2e;
        }
        .grid-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease, filter 0.3s ease;
        }
        .grid-item:hover img { transform: scale(1.05); filter: brightness(0.7); }
        .grid-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.5rem;
            opacity: 0;
            transition: opacity 0.3s ease;
            background: rgba(0, 0, 0, 0.3);
        }
        .grid-item:hover .grid-overlay { opacity: 1; }
        .grid-stat { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
        .feed-container { max-width: 470px; margin: 0 auto; padding: 1rem; display: none; }
        .feed-container.active { display: block; }
        .post-card {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .post-header { display: flex; align-items: center; padding: 0.75rem 1rem; gap: 0.75rem; }
        .post-avatar {
            width: 32px; height: 32px; border-radius: 50%;
            background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366);
            padding: 2px;
        }
        .post-avatar-inner {
            width: 100%; height: 100%; border-radius: 50%;
            background: #1a1a2e;
            display: flex; align-items: center; justify-content: center;
            font-size: 0.7rem; font-weight: 600;
        }
        .post-username { font-weight: 600; font-size: 0.9rem; }
        .post-date { margin-left: auto; font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); }
        .post-image { width: 100%; aspect-ratio: 1; object-fit: cover; background: #1a1a2e; }
        .post-actions { display: flex; gap: 1rem; padding: 0.75rem 1rem; }
        .action-btn {
            background: none; border: none; color: #fff;
            cursor: pointer; font-size: 1.5rem; transition: transform 0.2s ease;
        }
        .action-btn:hover { transform: scale(1.1); }
        .post-likes { padding: 0 1rem; font-weight: 600; font-size: 0.9rem; }
        .post-caption {
            padding: 0.5rem 1rem 1rem;
            font-size: 0.9rem;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.9);
        }
        .post-caption .caption-username { font-weight: 600; margin-right: 0.5rem; }
        .modal {
            display: none; position: fixed; inset: 0;
            background: rgba(0, 0, 0, 0.9); z-index: 1000;
            justify-content: center; align-items: center; padding: 2rem;
        }
        .modal.active { display: flex; }
        .modal-content {
            max-width: 1000px; max-height: 90vh;
            display: flex; background: #1a1a2e;
            border-radius: 8px; overflow: hidden;
        }
        .modal-image { max-width: 60%; max-height: 90vh; object-fit: contain; background: #000; }
        .modal-details { width: 340px; display: flex; flex-direction: column; background: rgba(0, 0, 0, 0.6); }
        .modal-close {
            position: absolute; top: 1rem; right: 1rem;
            background: none; border: none; color: #fff; font-size: 2rem; cursor: pointer;
        }
        .no-image {
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%);
            color: rgba(255, 255, 255, 0.3); font-size: 3rem;
        }
        @media (max-width: 768px) {
            .posts-grid { grid-template-columns: repeat(3, 1fr); gap: 2px; }
            .stats { display: none; }
            .modal-content { flex-direction: column; max-width: 100%; }
            .modal-image { max-width: 100%; }
            .modal-details { width: 100%; }
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="logo">📸 Instagram Viewer</div>
            <span class="username">@${username}</span>
            <div class="stats">
                <span><strong>${posts.length}</strong> posts</span>
                <span><strong>${posts.reduce((sum, p) => sum + (p.likes || 0), 0).toLocaleString()}</strong> likes</span>
            </div>
        </div>
    </header>

    <div class="view-toggle">
        <button class="view-btn active" onclick="setView('grid')" id="grid-btn">🔲 Grid</button>
        <button class="view-btn" onclick="setView('feed')" id="feed-btn">📜 Feed</button>
    </div>

    <main>
        <div class="grid-container" id="grid-view">
            <div class="posts-grid" id="posts-grid"></div>
        </div>
        <div class="feed-container" id="feed-view"></div>
    </main>

    <div class="modal" id="modal" onclick="closeModal(event)">
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <div class="modal-content" onclick="event.stopPropagation()">
            <img class="modal-image" id="modal-image" src="" alt="">
            <div class="modal-details">
                <div class="post-header">
                    <div class="post-avatar"><div class="post-avatar-inner">👤</div></div>
                    <span class="post-username" id="modal-username">@${username}</span>
                    <span class="post-date" id="modal-date"></span>
                </div>
                <div class="post-likes" id="modal-likes"></div>
                <div class="post-caption" id="modal-caption"></div>
            </div>
        </div>
    </div>

    <script>
        const posts = ${JSON.stringify(posts.map(p => ({
        ...p,
        localImagePath: p.id ? `./images/${username}/${p.id}.jpg` : ''
    })).sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
    }), null, 2)};
        
        const basePath = './images/${username}/';
        let currentView = 'grid';

        function getImagePath(post) {
            if (post.id) return basePath + post.id + '.jpg';
            return post.imageUrl || '';
        }

        function formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function cleanCaption(caption) {
            if (!caption) return '';
            const colonMatch = caption.match(/:\\s*"?(.+?)"?\\.?\\s*$/);
            if (colonMatch && colonMatch[1]) return colonMatch[1].replace(/^"|"$/g, '').trim();
            const cleaned = caption.replace(/^[a-z0-9_]+ on [A-Za-z]+ \\d+, \\d{4}\\.?\\s*/i, '').replace(/^"|"$/g, '').trim();
            return (!cleaned || cleaned === caption) ? '' : cleaned;
        }

        function renderGrid() {
            document.getElementById('posts-grid').innerHTML = posts.map((post, i) => {
                const img = getImagePath(post);
                return \`<div class="grid-item" onclick="openModal(\${i})">
                    \${img ? \`<img src="\${img}" alt="Post" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\\\'no-image\\\\'>📷</div>'">\` : '<div class="no-image">📷</div>'}
                    <div class="grid-overlay"><span class="grid-stat">❤️ \${post.likes || 0}</span></div>
                </div>\`;
            }).join('');
        }

        function renderFeed() {
            document.getElementById('feed-view').innerHTML = posts.map((post, i) => {
                const img = getImagePath(post);
                const caption = cleanCaption(post.caption);
                return \`<div class="post-card">
                    <div class="post-header">
                        <div class="post-avatar"><div class="post-avatar-inner">👤</div></div>
                        <span class="post-username">@\${post.user?.username || '${username}'}</span>
                        <span class="post-date">\${formatDate(post.date)}</span>
                    </div>
                    \${img ? \`<img class="post-image" src="\${img}" alt="Post" loading="lazy">\` : ''}
                    <div class="post-actions">
                        <button class="action-btn">❤️</button>
                        <button class="action-btn">💬</button>
                        <button class="action-btn" onclick="window.open('\${post.url}', '_blank')">🔗</button>
                    </div>
                    <div class="post-likes">\${(post.likes || 0).toLocaleString()} likes</div>
                    \${caption ? \`<div class="post-caption"><span class="caption-username">@\${post.user?.username || '${username}'}</span>\${caption}</div>\` : ''}
                </div>\`;
            }).join('');
        }

        function setView(view) {
            currentView = view;
            document.getElementById('grid-view').style.display = view === 'grid' ? 'block' : 'none';
            document.getElementById('feed-view').classList.toggle('active', view === 'feed');
            document.getElementById('grid-btn').classList.toggle('active', view === 'grid');
            document.getElementById('feed-btn').classList.toggle('active', view === 'feed');
        }

        function openModal(index) {
            const post = posts[index];
            document.getElementById('modal-image').src = getImagePath(post);
            document.getElementById('modal-username').textContent = '@' + (post.user?.username || '${username}');
            document.getElementById('modal-date').textContent = formatDate(post.date);
            document.getElementById('modal-likes').textContent = (post.likes || 0).toLocaleString() + ' likes';
            document.getElementById('modal-caption').innerHTML = '<span class="caption-username">@' + (post.user?.username || '${username}') + '</span>' + (cleanCaption(post.caption) || '');
            document.getElementById('modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(e) {
            if (e && e.target !== document.getElementById('modal')) return;
            document.getElementById('modal').classList.remove('active');
            document.body.style.overflow = '';
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
        renderGrid();
        renderFeed();
    </script>
</body>
</html>`;
}

async function copyImages(
    sourceDir: string,
    destDir: string,
    username: string
): Promise<number> {
    const userSourceDir = path.join(sourceDir, username);
    const userDestDir = path.join(destDir, username);

    try {
        await fs.mkdir(userDestDir, { recursive: true });

        const files = await fs.readdir(userSourceDir);
        let copied = 0;

        for (const file of files) {
            if (file.endsWith('.jpg') || file.endsWith('.png')) {
                const src = path.join(userSourceDir, file);
                const dest = path.join(userDestDir, file);

                try {
                    await fs.copyFile(src, dest);
                    copied++;
                } catch {
                    // Skip files that can't be copied
                }
            }
        }

        return copied;
    } catch {
        return 0;
    }
}

async function main() {
    console.log('📸 Instagram Process - Generating viewer and markdown files\n');

    const config = await loadConfig();
    const paths = getResolvedPaths(config);

    // Get plugin-specific config
    const pluginConfig = (config as any).plugins?.instagram as InstagramPluginConfig | undefined;
    const instagramConfig = pluginConfig || DEFAULT_CONFIG;

    const accounts = instagramConfig.accounts || [];

    if (accounts.length === 0) {
        console.log('⚠️ No Instagram accounts configured.');
        process.exit(0);
    }

    // Use plugin paths
    const rawDumpsDir = path.join(paths.rawDumps, 'instagram');
    const outputDir = path.join(paths.connectorData, 'instagram');
    const imagesOutputDir = path.join(outputDir, 'images');

    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(imagesOutputDir, { recursive: true });

    let totalPosts = 0;
    let totalImages = 0;

    for (const username of accounts) {
        console.log(`\n📄 Processing @${username}...`);

        const dumpPath = path.join(rawDumpsDir, `${username}.json`);

        let posts: InstaPost[] = [];
        try {
            const data = await fs.readFile(dumpPath, 'utf-8');
            posts = JSON.parse(data);
        } catch {
            console.log(`   ⚠️ No data found for @${username}`);
            continue;
        }

        if (posts.length === 0) {
            console.log(`   ⚠️ No posts for @${username}`);
            continue;
        }

        // Generate markdown file
        const markdown = generateMarkdown(username, posts);
        const mdPath = path.join(outputDir, `instagram-${username}.md`);
        await fs.writeFile(mdPath, markdown);
        console.log(`   ✅ Generated ${path.basename(mdPath)} (${posts.length} posts)`);

        // Generate viewer HTML
        const viewerHtml = generateViewerHTML(username, posts);
        const htmlPath = path.join(outputDir, `viewer-${username}.html`);
        await fs.writeFile(htmlPath, viewerHtml);
        console.log(`   ✅ Generated ${path.basename(htmlPath)}`);

        // Copy images
        const imagesCopied = await copyImages(
            path.join(rawDumpsDir, 'images'),
            imagesOutputDir,
            username
        );
        console.log(`   ✅ Copied ${imagesCopied} images`);

        totalPosts += posts.length;
        totalImages += imagesCopied;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Accounts processed: ${accounts.length}`);
    console.log(`   Total posts: ${totalPosts}`);
    console.log(`   Total images: ${totalImages}`);
    console.log(`\n✨ Done! Files saved to: ${outputDir}`);
}

main().catch(console.error);
