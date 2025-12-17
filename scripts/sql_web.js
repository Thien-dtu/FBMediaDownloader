/**
 * Web SQL Playground - Browser-based SQL query interface
 * 
 * A modern web interface for running SQL queries against the database.
 * 
 * Usage: node scripts/sql_web.js
 * Then open: http://localhost:3333
 */

import express from 'express';
import Database from 'better-sqlite3';
import { DATABASE_PATH, DATABASE_ENABLED } from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!DATABASE_ENABLED) {
    console.log('Database is disabled. Enable it in config to use SQL playground.');
    process.exit(1);
}

const db = new Database(DATABASE_PATH, { readonly: false });
db.pragma('journal_mode = WAL');

const app = express();
app.use(express.json());

const PORT = 3333;

// Serve static HTML
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Playground</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            color: #e4e4e7;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding: 15px 25px;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            font-size: 1.5rem;
            background: linear-gradient(90deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .db-info {
            font-size: 0.85rem;
            color: #94a3b8;
        }
        
        .main-grid {
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 20px;
        }
        
        .sidebar {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 15px;
            height: fit-content;
            position: sticky;
            top: 20px;
        }
        
        .sidebar h3 {
            font-size: 0.85rem;
            color: #94a3b8;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .table-list {
            list-style: none;
        }
        
        .table-list li {
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .table-list li:hover {
            background: rgba(96, 165, 250, 0.15);
            color: #60a5fa;
        }
        
        .table-list li .icon { opacity: 0.5; }
        
        .editor-section {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .editor-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        
        .CodeMirror {
            height: 200px;
            font-size: 14px;
            border-radius: 0;
        }
        
        .btn {
            padding: 10px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.2s;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(96, 165, 250, 0.4);
        }
        
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #e4e4e7;
        }
        
        .btn-secondary:hover {
            background: rgba(255,255,255,0.15);
        }
        
        .results-section {
            margin-top: 20px;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        
        .results-count {
            font-size: 0.85rem;
            color: #94a3b8;
        }
        
        .results-table-wrapper {
            overflow-x: auto;
            overflow-y: auto;
        }
        
        table {
            width: max-content;
            min-width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
        }
        
        th {
            background: rgba(0,0,0,0.3);
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            color: #60a5fa;
            position: sticky;
            top: 0;
            white-space: nowrap;
        }
        
        td {
            padding: 10px 15px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            word-break: break-word !important;
            max-width: 400px;
            vertical-align: top;
        }
        
        tr:hover td {
            background: rgba(96, 165, 250, 0.05);
        }
        
        .null-value {
            color: #6b7280;
            font-style: italic;
        }
        
        .error-msg {
            padding: 20px;
            color: #f87171;
            background: rgba(248, 113, 113, 0.1);
        }
        
        .success-msg {
            padding: 20px;
            color: #4ade80;
            background: rgba(74, 222, 128, 0.1);
        }
        
        .time-badge {
            font-size: 0.75rem;
            padding: 4px 8px;
            background: rgba(74, 222, 128, 0.15);
            color: #4ade80;
            border-radius: 4px;
        }
        
        .example-queries {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        .example-queries h4 {
            font-size: 0.8rem;
            color: #94a3b8;
            margin-bottom: 8px;
        }
        
        .example-query {
            font-size: 0.75rem;
            padding: 6px 10px;
            margin-bottom: 5px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .example-query:hover {
            background: rgba(96, 165, 250, 0.15);
        }
        
        .kbd {
            font-size: 0.7rem;
            padding: 2px 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            margin-left: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🗄️ SQL Playground</h1>
            <div class="db-info">Database: ${DATABASE_PATH}</div>
        </header>
        
        <div class="main-grid">
            <aside class="sidebar">
                <h3>📋 Tables</h3>
                <ul class="table-list" id="tableList">
                    <li onclick="loadTable('users')"><span class="icon">📁</span> users</li>
                    <li onclick="loadTable('user_profiles')"><span class="icon">📁</span> user_profiles</li>
                    <li onclick="loadTable('fb_entities')"><span class="icon">📁</span> fb_entities</li>
                    <li onclick="loadTable('user_work_history')"><span class="icon">📁</span> user_work_history</li>
                    <li onclick="loadTable('user_education_history')"><span class="icon">📁</span> user_education_history</li>
                    <li onclick="loadTable('fb_pages')"><span class="icon">📁</span> fb_pages</li>
                    <li onclick="loadTable('user_page_likes')"><span class="icon">📁</span> user_page_likes</li>
                    <li onclick="loadTable('saved_media')"><span class="icon">📁</span> saved_media</li>
                    <li onclick="loadTable('username_history')"><span class="icon">📁</span> username_history</li>
                </ul>
                
                <div class="example-queries">
                    <h4>⚡ Quick Queries</h4>
                    <div class="example-query" onclick="setQuery('SELECT * FROM v_user_profiles_full LIMIT 10;')">
                        User profiles with locations
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT * FROM v_user_work;')">
                        Work history
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT * FROM v_user_education;')">
                        Education history
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT * FROM v_user_page_likes LIMIT 100;')">
                        Page likes
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT * FROM v_user_stats;')">
                        User stats
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT entity_type, COUNT(*) as count FROM fb_entities GROUP BY entity_type;')">
                        Entity breakdown
                    </div>
                    <div class="example-query" onclick="searchDaNang()">
                        Search Da Nang
                    </div>
                    
                    <h4 style="margin-top:12px">📈 Stats</h4>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as total FROM users;')">
                        Total users
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as total FROM user_profiles;')">
                        Total profiles
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as total FROM fb_entities;')">
                        Total entities
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as total FROM fb_pages;')">
                        Total liked pages
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as total FROM saved_media;')">
                        Total saved media
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT entity_type, COUNT(*) as count FROM fb_entities GROUP BY entity_type ORDER BY count DESC;')">
                        Entity breakdown
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT COUNT(*) as users, (SELECT COUNT(*) FROM user_profiles) as profiles, (SELECT COUNT(*) FROM fb_entities) as entities, (SELECT COUNT(*) FROM fb_pages) as pages, (SELECT COUNT(*) FROM saved_media) as media, (SELECT COUNT(*) FROM user_page_likes) as likes FROM users;')">
                        All counts
                    </div>
                    
                    <h4 style="margin-top:12px">🔍 Search</h4>
                    <div class="example-query" onclick="searchByName()">
                        Search by name
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT u.uid, up.name, fe.name as location FROM users u JOIN user_profiles up ON u.id = up.user_id JOIN fb_entities fe ON up.current_location_id = fe.id;')">
                        Users with locations
                    </div>
                    <div class="example-query" onclick="setQuery('SELECT u.uid, up.name, COUNT(upl.id) as likes_count FROM users u JOIN user_profiles up ON u.id = up.user_id LEFT JOIN user_page_likes upl ON u.id = upl.user_id GROUP BY u.id ORDER BY likes_count DESC;')">
                        Users by likes count
                    </div>
                </div>
            </aside>
            
            <main>
                <div class="editor-section">
                    <div class="editor-header">
                        <span>SQL Query <span class="kbd">Ctrl+Enter</span> to run</span>
                        <div>
                            <button class="btn btn-secondary" onclick="clearEditor()">Clear</button>
                            <button class="btn btn-primary" onclick="runQuery()">▶ Run Query</button>
                        </div>
                    </div>
                    <textarea id="sqlEditor">SELECT * FROM users LIMIT 10;</textarea>
                </div>
                
                <div class="results-section" id="resultsSection">
                    <div class="results-header">
                        <span>Results</span>
                        <div>
                            <span class="results-count" id="resultsCount"></span>
                            <span class="time-badge" id="queryTime"></span>
                        </div>
                    </div>
                    <div class="results-table-wrapper" id="resultsWrapper">
                        <div style="padding: 40px; text-align: center; color: #6b7280;">
                            Run a query to see results
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js"><\/script>
    <script>
        let editor;
        
        document.addEventListener('DOMContentLoaded', () => {
            editor = CodeMirror.fromTextArea(document.getElementById('sqlEditor'), {
                mode: 'text/x-sql',
                theme: 'dracula',
                lineNumbers: true,
                autofocus: true,
                extraKeys: {
                    'Ctrl-Enter': runQuery,
                    'Cmd-Enter': runQuery
                }
            });
        });
        
        function setQuery(sql) {
            editor.setValue(sql);
        }
        
        function searchDaNang() {
            editor.setValue("SELECT * FROM fb_entities WHERE name LIKE '%Da Nang%';");
        }
        
        function searchByName() {
            editor.setValue("SELECT * FROM user_profiles WHERE name LIKE '%YOUR_SEARCH_TERM%';");
        }
        
        function loadTable(tableName) {
            setQuery('SELECT * FROM ' + tableName + ' LIMIT 100;');
            runQuery();
        }
        
        function clearEditor() {
            editor.setValue('');
        }
        
        async function runQuery() {
            const sql = editor.getValue().trim();
            if (!sql) return;
            
            const startTime = performance.now();
            
            try {
                const response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql })
                });
                
                const result = await response.json();
                const elapsed = (performance.now() - startTime).toFixed(0);
                
                document.getElementById('queryTime').textContent = elapsed + 'ms';
                
                if (result.error) {
                    document.getElementById('resultsCount').textContent = 'Error';
                    document.getElementById('resultsWrapper').innerHTML = 
                        '<div class="error-msg">❌ ' + escapeHtml(result.error) + '</div>';
                } else if (result.message) {
                    document.getElementById('resultsCount').textContent = 'Success';
                    document.getElementById('resultsWrapper').innerHTML = 
                        '<div class="success-msg">✓ ' + escapeHtml(result.message) + '</div>';
                } else {
                    renderResults(result.data);
                }
            } catch (error) {
                document.getElementById('resultsWrapper').innerHTML = 
                    '<div class="error-msg">❌ ' + escapeHtml(error.message) + '</div>';
            }
        }
        
        function renderResults(data) {
            if (!data || data.length === 0) {
                document.getElementById('resultsCount').textContent = '0 rows';
                document.getElementById('resultsWrapper').innerHTML = 
                    '<div style="padding: 40px; text-align: center; color: #6b7280;">No results</div>';
                return;
            }
            
            const columns = Object.keys(data[0]);
            document.getElementById('resultsCount').textContent = data.length + ' row' + (data.length !== 1 ? 's' : '');
            
            let html = '<table><thead><tr>';
            columns.forEach(col => {
                html += '<th>' + escapeHtml(col) + '</th>';
            });
            html += '</tr></thead><tbody>';
            
            data.forEach(row => {
                html += '<tr>';
                columns.forEach(col => {
                    const val = row[col];
                    if (val === null) {
                        html += '<td class="null-value">NULL</td>';
                    } else {
                        html += '<td title="' + escapeHtml(String(val)) + '">' + escapeHtml(String(val)) + '</td>';
                    }
                });
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            document.getElementById('resultsWrapper').innerHTML = html;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    <\/script>
</body>
</html>
    `);
});

// API endpoint for queries
app.post('/api/query', (req, res) => {
    const { sql } = req.body;

    if (!sql) {
        return res.json({ error: 'No SQL query provided' });
    }

    try {
        const trimmed = sql.trim();
        const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed);

        if (isSelect) {
            const rows = db.prepare(trimmed).all();
            res.json({ data: rows });
        } else {
            db.exec(trimmed);
            res.json({ message: 'Query executed successfully' });
        }
    } catch (error) {
        res.json({ error: error.message });
    }
});

// API to list tables
app.get('/api/tables', (req, res) => {
    try {
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all();
        res.json(tables);
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  🗄️  SQL Playground Web Interface                        ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Open in browser: http://localhost:${PORT}                 ║
║                                                          ║
║  Press Ctrl+C to stop                                    ║
╚══════════════════════════════════════════════════════════╝
`);
});

// Cleanup on exit
process.on('SIGINT', () => {
    db.close();
    process.exit();
});
