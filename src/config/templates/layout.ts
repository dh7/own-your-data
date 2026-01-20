/**
 * Layout template - Base HTML structure with accordion container
 */

export function renderLayout(sections: string[]): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Own your data - Config</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'JetBrains Mono', monospace;
            background: #0d1117;
            min-height: 100vh;
            padding: 2rem;
            color: #c9d1d9;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding: 1rem 1.5rem;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
        }
        h1 {
            color: #58a6ff;
            font-size: 1.5rem;
            font-weight: 700;
        }
        h1::before {
            content: '> ';
            color: #7ee787;
        }
        .close-btn {
            background: #238636;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .close-btn:hover {
            background: #2ea043;
        }
        
        /* Accordion styles using details/summary */
        details {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            margin-bottom: 1rem;
            overflow: hidden;
        }
        details[open] {
            border-color: #58a6ff;
        }
        summary {
            padding: 1rem 1.5rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            color: #c9d1d9;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            list-style: none;
            user-select: none;
        }
        summary::-webkit-details-marker { display: none; }
        summary::before {
            content: '▶';
            font-size: 0.6rem;
            transition: transform 0.2s;
            color: #8b949e;
        }
        details[open] summary::before {
            transform: rotate(90deg);
            color: #58a6ff;
        }
        summary:hover {
            background: #21262d;
        }
        .section-content {
            padding: 1rem 1.5rem 1.5rem 1.5rem;
            border-top: 1px solid #30363d;
        }
        
        /* Status badges */
        .status {
            display: inline-block;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: 600;
            margin-left: auto;
            text-transform: uppercase;
        }
        .status.connected { background: #238636; color: white; }
        .status.disconnected { background: #da3633; color: white; }
        .status.pending { background: #9e6a03; color: white; }
        
        /* Form styles */
        form { display: flex; flex-direction: column; gap: 1rem; }
        label {
            font-weight: 500;
            color: #8b949e;
            font-size: 0.875rem;
            margin-bottom: 0.25rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        input[type="text"], input[type="password"], select {
            width: 100%;
            padding: 0.6rem 0.75rem;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-size: 0.9rem;
            font-family: 'JetBrains Mono', monospace;
            background: #0d1117;
            color: #c9d1d9;
            transition: border-color 0.2s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #58a6ff;
        }
        input::placeholder {
            color: #484f58;
        }
        button {
            background: #238636;
            color: white;
            border: none;
            padding: 0.6rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover {
            background: #2ea043;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .help {
            font-size: 0.75rem;
            color: #8b949e;
            margin-top: 0.25rem;
        }
        .success {
            background: rgba(35, 134, 54, 0.15);
            border: 1px solid #238636;
            color: #7ee787;
            padding: 0.75rem 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }
        .error {
            background: rgba(218, 54, 51, 0.15);
            border: 1px solid #da3633;
            color: #f85149;
            padding: 0.75rem 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }
        .input-group {
            display: flex;
            gap: 0.5rem;
        }
        .input-group input, .input-group select { flex: 1; }
        .input-group button {
            padding: 0.6rem 0.75rem;
            font-size: 0.8rem;
            white-space: nowrap;
        }
        .small-btn {
            background: #30363d;
        }
        .small-btn:hover {
            background: #484f58;
        }
        .qr-container {
            text-align: center;
            padding: 1rem;
        }
        .qr-container img {
            max-width: 200px;
            border-radius: 8px;
            border: 2px solid #58a6ff;
        }
        .icon { font-size: 1rem; }
        
        /* Tags/chips for accounts */
        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .tag {
            background: #30363d;
            padding: 0.4rem 0.75rem;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: #58a6ff;
        }
        .tag button {
            background: none;
            border: none;
            color: #f85149;
            padding: 0;
            font-size: 0.9rem;
            cursor: pointer;
            line-height: 1;
        }
        .tag button:hover {
            background: none;
        }
        
        .password-container {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
        }
        .password-container input {
            padding-right: 2.5rem;
        }
        .toggle-password {
            position: absolute;
            right: 0.5rem;
            background: none;
            border: none;
            cursor: pointer;
            color: #8b949e;
            padding: 0;
            display: flex;
        }
        .toggle-password:hover {
            color: #58a6ff;
            background: none;
        }
        
        a {
            color: #58a6ff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        
        code {
            background: #30363d;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Own your data</h1>
            <button onclick="closeConfig()" class="close-btn">✓ Close</button>
        </div>
        ${sections.join('\n')}
    </div>
    
    <script>
    async function closeConfig() {
        try {
            await fetch('/shutdown', { method: 'POST' });
        } catch (e) {
            // Server closed
        }
        window.close();
        setTimeout(() => {
            document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#7ee787;font-size:1.25rem;font-family:JetBrains Mono,monospace;"><div>> Config saved. You can close this tab.</div></div>';
        }, 100);
    }
    </script>
</body>
</html>
`;
}
