/**
 * File Browser section for the config UI
 */

export interface FileInfo {
    name: string;
    isDirectory: boolean;
    size: number;
    modified: string;
}

export function renderFileBrowserSection(): string {
    return `
<details>
    <summary>
        <span class="icon">📂</span>
        File Browser
        <span class="status">Browse & Upload</span>
    </summary>
    <div class="section-content">
        <div id="file-browser">
            <div class="file-browser-header">
                <div class="path-bar">
                    <span class="path-label">📁</span>
                    <input type="text" id="current-path" value="." readonly />
                    <button onclick="navigateTo('.')" title="Home">🏠</button>
                    <button onclick="navigateUp()" title="Go up">⬆️</button>
                    <button onclick="refreshFiles()" title="Refresh">🔄</button>
                </div>
            </div>
            
            <div class="file-list" id="file-list">
                <div class="loading">Loading...</div>
            </div>
            
            <div class="upload-section">
                <h4>📤 Upload Files</h4>
                <div id="dropzone" class="dropzone">
                    <span class="dropzone-icon">📁</span>
                    <p>Drag & drop files here</p>
                    <p class="dropzone-or">or</p>
                </div>
                <div class="upload-btn-container">
                    <input type="file" id="file-input" multiple />
                </div>
                <div id="upload-queue" class="upload-queue"></div>
                <p id="upload-status" class="help"></p>
            </div>
        </div>
    </div>
</details>

<style>
    .file-browser-header {
        margin-bottom: 1rem;
    }
    
    .path-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 0.5rem;
    }
    
    .path-bar input {
        flex: 1;
        background: transparent;
        border: none;
        color: #0f0;
        font-family: monospace;
    }
    
    .path-bar button {
        background: #1a1a1a;
        border: 1px solid #333;
        color: #fff;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .path-bar button:hover {
        background: #2a2a2a;
    }
    
    .file-list {
        border: 1px solid #333;
        border-radius: 4px;
        max-height: 400px;
        overflow-y: auto;
        background: #0a0a0a;
    }
    
    .file-item {
        display: flex;
        align-items: center;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid #222;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .file-item:hover {
        background: #1a1a1a;
    }
    
    .file-item.directory {
        color: #4af;
    }
    
    .file-item .icon {
        margin-right: 0.75rem;
        font-size: 1.2rem;
    }
    
    .file-item .name {
        flex: 1;
        font-family: monospace;
    }
    
    .file-item .size {
        color: #888;
        font-size: 0.8rem;
        margin-right: 1rem;
    }
    
    .file-item .modified {
        color: #666;
        font-size: 0.75rem;
    }
    
    .file-item .actions {
        display: flex;
        gap: 0.5rem;
    }
    
    .file-item .actions button {
        background: #1a1a1a;
        border: 1px solid #333;
        color: #fff;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    
    .file-item .actions button:hover {
        background: #2a2a2a;
    }
    
    .upload-section {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #333;
    }
    
    .upload-section h4 {
        margin-bottom: 0.75rem;
        color: #aaa;
    }
    
    .dropzone {
        border: 2px dashed #444;
        border-radius: 8px;
        padding: 2rem;
        text-align: center;
        transition: all 0.3s ease;
        background: #0a0a0a;
        cursor: pointer;
    }
    
    .dropzone:hover,
    .dropzone.dragover {
        border-color: #0f0;
        background: #0a1a0a;
    }
    
    .dropzone-content {
        pointer-events: none;
    }
    
    .dropzone-icon {
        font-size: 3rem;
        display: block;
        margin-bottom: 0.5rem;
    }
    
    .dropzone p {
        color: #888;
        margin: 0.25rem 0;
    }
    
    .dropzone-or {
        font-size: 0.8rem;
        color: #555 !important;
    }
    
    .upload-btn-container {
        margin-top: 0.75rem;
        text-align: center;
    }
    
    .upload-btn-container input[type="file"] {
        background: #1a1a1a;
        border: 1px solid #444;
        color: #fff;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .upload-btn-container input[type="file"]:hover {
        background: #2a2a2a;
    }
    
    .upload-queue {
        margin-top: 1rem;
    }
    
    .upload-item {
        display: flex;
        align-items: center;
        padding: 0.5rem;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }
    
    .upload-item .name {
        flex: 1;
        font-family: monospace;
        font-size: 0.85rem;
    }
    
    .upload-item .status {
        font-size: 0.8rem;
        margin-left: 0.5rem;
    }
    
    .upload-item .status.pending { color: #888; }
    .upload-item .status.uploading { color: #4af; }
    .upload-item .status.success { color: #0f0; }
    .upload-item .status.error { color: #f66; }
    
    .upload-item .progress {
        width: 60px;
        height: 4px;
        background: #333;
        border-radius: 2px;
        margin-left: 0.5rem;
        overflow: hidden;
    }
    
    .upload-item .progress-bar {
        height: 100%;
        background: #0f0;
        transition: width 0.2s;
    }
    
    .loading {
        padding: 2rem;
        text-align: center;
        color: #666;
    }
</style>

<script>
(function() {
    let currentPath = '.';
    
    async function loadFiles(path) {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '<div class="loading">Loading...</div>';
        
        try {
            const response = await fetch('/files/list?path=' + encodeURIComponent(path));
            const data = await response.json();
            
            if (data.error) {
                fileList.innerHTML = '<div class="loading" style="color: #f66;">Error: ' + data.error + '</div>';
                return;
            }
            
            currentPath = data.path;
            document.getElementById('current-path').value = currentPath;
            
            if (data.files.length === 0) {
                fileList.innerHTML = '<div class="loading">Empty folder</div>';
                return;
            }
            
            // Sort: directories first, then files
            const sorted = data.files.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
            
            fileList.innerHTML = sorted.map(file => {
                const icon = file.isDirectory ? '📁' : getFileIcon(file.name);
                const size = file.isDirectory ? '-' : formatSize(file.size);
                const modified = file.modified ? new Date(file.modified).toLocaleDateString() : '';
                
                return \`
                    <div class="file-item \${file.isDirectory ? 'directory' : ''}" 
                         onclick="\${file.isDirectory ? \`navigateTo('\${currentPath}/\${file.name}')\` : ''}">
                        <span class="icon">\${icon}</span>
                        <span class="name">\${file.name}</span>
                        <span class="size">\${size}</span>
                        <span class="modified">\${modified}</span>
                        <span class="actions">
                            \${!file.isDirectory ? \`<button onclick="event.stopPropagation(); downloadFile('\${currentPath}/\${file.name}')">⬇️</button>\` : ''}
                            <button onclick="event.stopPropagation(); deleteFile('\${currentPath}/\${file.name}')" style="color: #f66;">🗑️</button>
                        </span>
                    </div>
                \`;
            }).join('');
        } catch (err) {
            fileList.innerHTML = '<div class="loading" style="color: #f66;">Failed to load files</div>';
        }
    }
    
    function getFileIcon(name) {
        const ext = name.split('.').pop()?.toLowerCase();
        const icons = {
            'json': '📄',
            'md': '📝',
            'ts': '🔷',
            'js': '🟡',
            'html': '🌐',
            'css': '🎨',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'mp4': '🎬',
            'mp3': '🎵',
            'pdf': '📕',
            'zip': '📦',
        };
        return icons[ext] || '📄';
    }
    
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
    
    window.navigateTo = function(path) {
        loadFiles(path);
    };
    
    window.navigateUp = function() {
        if (currentPath === '.' || currentPath === '/') return;
        const parts = currentPath.split('/');
        parts.pop();
        const parent = parts.length > 0 ? parts.join('/') : '.';
        loadFiles(parent);
    };
    
    window.refreshFiles = function() {
        loadFiles(currentPath);
    };
    
    window.downloadFile = function(path) {
        window.open('/files/download?path=' + encodeURIComponent(path), '_blank');
    };
    
    window.deleteFile = async function(path) {
        if (!confirm('Delete ' + path + '?')) return;
        
        try {
            const response = await fetch('/files/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            const result = await response.json();
            
            if (result.success) {
                refreshFiles();
            } else {
                alert('Delete failed: ' + result.error);
            }
        } catch (err) {
            alert('Delete failed');
        }
    };
    
    // Dropzone handling (drag & drop only, file input is separate)
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const uploadQueue = document.getElementById('upload-queue');
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            uploadFiles(files);
        }
    });
    
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            uploadFiles(files);
            fileInput.value = '';
        }
    });
    
    async function uploadFiles(files) {
        uploadQueue.innerHTML = '';
        
        // Check which files already exist
        const filesToUpload = [];
        for (const file of files) {
            const existsRes = await fetch('/files/exists?path=' + encodeURIComponent(currentPath) + '&filename=' + encodeURIComponent(file.name));
            const existsData = await existsRes.json();
            
            if (existsData.exists) {
                if (confirm('File "' + file.name + '" already exists. Overwrite?')) {
                    filesToUpload.push(file);
                } else {
                    // Skip this file
                    uploadQueue.innerHTML += \`
                        <div class="upload-item">
                            <span class="name">\${file.name}</span>
                            <span class="status" style="color: #888;">⏭️ Skipped</span>
                        </div>
                    \`;
                }
            } else {
                filesToUpload.push(file);
            }
        }
        
        if (filesToUpload.length === 0) {
            return;
        }
        
        for (const file of filesToUpload) {
            const itemId = 'upload-' + Math.random().toString(36).substr(2, 9);
            uploadQueue.innerHTML += \`
                <div class="upload-item" id="\${itemId}">
                    <span class="name">\${file.name}</span>
                    <span class="status pending">Waiting...</span>
                    <div class="progress"><div class="progress-bar" style="width: 0%"></div></div>
                </div>
            \`;
        }
        
        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            // Find the item by looking for non-skipped items
            const items = uploadQueue.querySelectorAll('.upload-item:not(.skipped)');
            const item = items[i];
            if (!item) continue;
            
            const statusEl = item.querySelector('.status');
            const progressBar = item.querySelector('.progress-bar');
            
            if (!statusEl) continue;
            
            statusEl.textContent = 'Uploading...';
            statusEl.className = 'status uploading';
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                
                // Send path as query param since multer receives file before body
                const response = await fetch('/files/upload?path=' + encodeURIComponent(currentPath), {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    statusEl.textContent = '✅ Done';
                    statusEl.className = 'status success';
                    if (progressBar) progressBar.style.width = '100%';
                } else {
                    statusEl.textContent = '❌ ' + (result.error || 'Failed');
                    statusEl.className = 'status error';
                }
            } catch (err) {
                statusEl.textContent = '❌ Error';
                statusEl.className = 'status error';
            }
        }
        
        // Refresh file list after all uploads
        setTimeout(() => refreshFiles(), 500);
    }
    
    // Initial load
    loadFiles('.');
})();
</script>
`;
}
