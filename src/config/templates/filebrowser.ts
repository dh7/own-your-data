/**
 * File Browser section for the config UI
 */

export interface FileInfo {
    name: string;
    isDirectory: boolean;
    size: number;
    modified: string;
}

export function renderFileBrowserSection(): { card: string; modal: string } {
    const card = `
    <button class="sys-card" onclick="openSysModal('sys-modal-files')">
        <span class="sys-icon">📂</span>
        Server Files
        <span class="sys-badge" style="background:#21262d;color:#8b949e;">Browse</span>
    </button>`;

    const modal = `
<div class="sys-modal-overlay" id="sys-modal-files" onclick="if(event.target===this)closeSysModal(this.id)">
    <div class="sys-modal" style="max-width:800px; max-height:85vh;">
        <div class="sys-modal-header">
            <span>📂 Server Files</span>
            <button class="btn small-btn secondary" onclick="closeSysModal('sys-modal-files')">✕</button>
        </div>
        <div class="sys-modal-body" style="padding:0;">
            <div id="file-browser" style="padding:1rem;">
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
    </div>
</div>

<!-- EDITOR MODAL -->
<div id="editor-modal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 id="editor-filename">Editing File</h3>
            <button onclick="closeEditor()" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <textarea id="editor-textarea" spellcheck="false"></textarea>
        </div>
        <div class="modal-footer">
            <button onclick="closeEditor()" class="secondary-btn">Cancel</button>
            <button onclick="saveFile()" class="primary-btn">Save Changes</button>
        </div>
    </div>
</div>

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

    /* Modal Styles */
    .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.8);
        backdrop-filter: blur(5px);
    }

    .modal-content {
        background-color: #0d1117;
        margin: 5% auto;
        padding: 0;
        border: 1px solid #30363d;
        width: 80%;
        height: 80%;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }

    .modal-header {
        padding: 1rem;
        border-bottom: 1px solid #30363d;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #161b22;
        border-radius: 8px 8px 0 0;
    }

    .modal-header h3 {
        margin: 0;
        color: #c9d1d9;
        font-family: 'JetBrains Mono', monospace;
        font-size: 1rem;
    }

    .close-btn {
        color: #8b949e;
        font-size: 24px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0 0.5rem;
        line-height: 1;
    }

    .close-btn:hover {
        color: #c9d1d9;
    }

    .modal-body {
        padding: 0;
        flex: 1;
        display: flex;
        position: relative;
    }

    #editor-textarea {
        width: 100%;
        height: 100%;
        background: #0d1117;
        color: #c9d1d9;
        font-family: 'JetBrains Mono', monospace;
        border: none;
        padding: 1rem;
        resize: none;
        font-size: 14px;
        line-height: 1.6;
        outline: none;
        box-sizing: border-box;
    }

    .modal-footer {
        padding: 1rem;
        border-top: 1px solid #30363d;
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        background: #161b22;
        border-radius: 0 0 8px 8px;
    }

    .primary-btn {
        background: #238636;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
    }

    .primary-btn:hover {
        background: #2ea043;
    }

    .secondary-btn {
        background: #21262d;
        color: #c9d1d9;
        border: 1px solid #30363d;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-family: 'JetBrains Mono', monospace;
    }

    .secondary-btn:hover {
        background: #30363d;
        border-color: #8b949e;
    }

    .icon-btn {
        background: transparent !important;
        border: none !important;
        color: #8b949e !important;
        padding: 4px !important;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .icon-btn:hover {
        background: #21262d !important;
        color: #58a6ff !important;
    }

    .icon-btn.delete-btn:hover {
        color: #f85149 !important;
        background: rgba(218, 54, 51, 0.15) !important;
    }
</style>

<script>
(function() {
    let currentPath = '.';
    let currentEditingFile = null;
    
    // Icons
    const ICONS = {
        edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
        download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
        trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
    };

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
            const pathInput = document.getElementById('current-path');
            if (pathInput) pathInput.value = currentPath;
            
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
                
                const isEditable = !file.isDirectory && /\\.(json|txt|md|js|ts|css|html|yml|yaml)$/i.test(file.name);
                
                let clickAction = '';
                if (file.isDirectory) {
                    clickAction = \`navigateTo('\${currentPath}/\${file.name}')\`;
                } else if (isEditable) {
                    clickAction = \`editFile('\${currentPath}/\${file.name}')\`;
                }

                return \`
                    <div class="file-item \${file.isDirectory ? 'directory' : ''}" 
                         onclick="\${clickAction}"
                         style="\${clickAction ? 'cursor: pointer;' : ''}">
                        <span class="icon">\${icon}</span>
                        <span class="name">\${file.name}</span>
                        <span class="size">\${size}</span>
                        <span class="modified">\${modified}</span>
                        <span class="actions">
                            \${isEditable ? \`<button onclick="event.stopPropagation(); editFile('\${currentPath}/\${file.name}')" title="Edit" class="icon-btn">\${ICONS.edit}</button>\` : ''}
                            \${!file.isDirectory ? \`<button onclick="event.stopPropagation(); downloadFile('\${currentPath}/\${file.name}')" title="Download" class="icon-btn">\${ICONS.download}</button>\` : ''}
                            <button onclick="event.stopPropagation(); deleteFile('\${currentPath}/\${file.name}')" title="Delete" class="icon-btn delete-btn">\${ICONS.trash}</button>
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
    
    // EDITOR API
    window.editFile = async function(path) {
        const modal = document.getElementById('editor-modal');
        const filenameSpan = document.getElementById('editor-filename');
        const textarea = document.getElementById('editor-textarea');

        if (!modal || !filenameSpan || !textarea) return;

        filenameSpan.textContent = 'Loading ' + path + '...';
        modal.style.display = 'block';
        textarea.value = 'Loading...';
        textarea.disabled = true;

        try {
            const response = await fetch('/files/read?path=' + encodeURIComponent(path));
            if (!response.ok) throw new Error('Failed to load file');
            
            const data = await response.json();
            
            textarea.value = data.content;
            textarea.disabled = false;
            filenameSpan.textContent = 'Editing: ' + path;
            currentEditingFile = path;
            textarea.focus();
        } catch (e) {
            textarea.value = 'Error loading file: ' + e.message;
            filenameSpan.textContent = 'Error';
        }
    };

    window.closeEditor = function() {
        const modal = document.getElementById('editor-modal');
        if (modal) modal.style.display = 'none';
        currentEditingFile = null;
    };

    window.saveFile = async function() {
        if (!currentEditingFile) return;

        const textarea = document.getElementById('editor-textarea');
        const content = textarea.value;
        const btn = document.querySelector('.modal-footer .primary-btn');
        const originalText = btn.textContent;
        
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
             const response = await fetch('/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentEditingFile, content })
            });
            const result = await response.json();

            if (result.success) {
                closeEditor();
                refreshFiles(); // Refresh to update timestamp
            } else {
                alert('Failed to save: ' + result.error);
            }
        } catch (e) {
            alert('Error saving file: ' + e.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    // Close on click outside
    window.onclick = function(event) {
        const modal = document.getElementById('editor-modal');
        if (event.target == modal) {
            closeEditor();
        }
    };
    
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
    setTimeout(() => {
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('file-input');
        const uploadQueue = document.getElementById('upload-queue');
        
        if (!dropzone || !fileInput || !uploadQueue) return;
        
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
    }, 100);
    
    // Initial load
    loadFiles('.');
})();
</script>
`;

    return { card, modal };
}
