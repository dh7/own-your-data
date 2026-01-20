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
                <h4>📤 Upload File</h4>
                <form id="upload-form" enctype="multipart/form-data">
                    <input type="file" id="file-input" name="file" />
                    <button type="submit">Upload to current folder</button>
                </form>
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
    
    #upload-form {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    
    #upload-form input[type="file"] {
        flex: 1;
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
    
    // Handle upload
    document.getElementById('upload-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const fileInput = document.getElementById('file-input');
        const statusEl = document.getElementById('upload-status');
        
        if (!fileInput.files.length) {
            statusEl.textContent = 'Please select a file';
            return;
        }
        
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('path', currentPath);
        
        statusEl.textContent = 'Uploading...';
        
        try {
            const response = await fetch('/files/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            
            if (result.success) {
                statusEl.textContent = '✅ Uploaded successfully!';
                fileInput.value = '';
                refreshFiles();
            } else {
                statusEl.textContent = '❌ Upload failed: ' + result.error;
            }
        } catch (err) {
            statusEl.textContent = '❌ Upload failed';
        }
    });
    
    // Initial load
    loadFiles('.');
})();
</script>
`;
}
