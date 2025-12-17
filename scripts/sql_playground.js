/**
 * SQL Playground - Interactive SQL query tool
 * 
 * Run custom SQL queries against the downloader database.
 * 
 * Usage: node scripts/sql_playground.js
 */

import Database from 'better-sqlite3';
import readline from 'readline';
import { DATABASE_PATH, DATABASE_ENABLED } from '../config.js';

if (!DATABASE_ENABLED) {
    console.log('Database is disabled. Enable it in config to use SQL playground.');
    process.exit(1);
}

const db = new Database(DATABASE_PATH, { readonly: false });
db.pragma('journal_mode = WAL');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ANSI colors
const C = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

console.log(`
${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}
${C.cyan}║${C.reset}  ${C.bold}SQL Playground${C.reset} - Interactive Database Query Tool          ${C.cyan}║${C.reset}
${C.cyan}╠══════════════════════════════════════════════════════════════╣${C.reset}
${C.cyan}║${C.reset}  Database: ${C.dim}${DATABASE_PATH}${C.reset}
${C.cyan}║${C.reset}  Commands:                                                    ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.tables${C.reset}     - List all tables                         ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.schema <t>${C.reset}  - Show table schema                       ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.views${C.reset}      - List all views                          ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.stats${C.reset}      - Show database statistics                ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.clear${C.reset}      - Clear screen                            ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}    ${C.yellow}.exit${C.reset}       - Exit playground                         ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}                                                              ${C.cyan}║${C.reset}
${C.cyan}║${C.reset}  ${C.dim}End queries with ; for SELECT or just press Enter for DDL${C.reset}  ${C.cyan}║${C.reset}
${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}
`);

// =============================================================
// [ADDED] Expanded (vertical) mode state
// =============================================================
let expandedMode = false;

let queryBuffer = '';

function prompt() {
    const prefix = queryBuffer ? '...> ' : 'sql> ';
    rl.question(`${C.green}${prefix}${C.reset}`, handleInput);
}

function formatTable(rows) {
    if (!rows || rows.length === 0) {
        console.log(`${C.dim}(no results)${C.reset}`);
        return;
    }

    const columns = Object.keys(rows[0]);
    const widths = {};

    // Calculate column widths
    columns.forEach(col => {
        widths[col] = Math.max(
            col.length,
            ...rows.map(row => String(row[col] ?? 'NULL').substring(0, 50).length)
        );
    });

    // Header
    const header = columns.map(col => col.padEnd(widths[col])).join(' │ ');
    const separator = columns.map(col => '─'.repeat(widths[col])).join('─┼─');

    console.log(`${C.cyan}${header}${C.reset}`);
    console.log(`${C.dim}${separator}${C.reset}`);

    // Rows
    rows.forEach(row => {
        const line = columns.map(col => {
            let val = row[col];
            if (val === null) val = 'NULL';
            return String(val).substring(0, 50).padEnd(widths[col]);
        }).join(' │ ');
        console.log(line);
    });

    console.log(`${C.dim}(${rows.length} row${rows.length !== 1 ? 's' : ''})${C.reset}\n`);
}

// =============================================================
// [ADDED] Expanded / vertical formatter (psql \x style)
// =============================================================
function formatExpanded(rows) {
    if (!rows || rows.length === 0) {
        console.log(`${C.dim}(no results)${C.reset}`);
        return;
    }

    rows.forEach((row, index) => {
        console.log(
            `${C.cyan}-[ RECORD ${index + 1} ]${'─'.repeat(40)}${C.reset}`
        );
        Object.entries(row).forEach(([key, value]) => {
            const val = value === null ? 'NULL' : String(value);
            console.log(
                `${C.yellow}${key.padEnd(24)}${C.reset} | ${val}`
            );
        });
        console.log();
    });

    console.log(
        `${C.dim}(${rows.length} row${rows.length !== 1 ? 's' : ''})${C.reset}\n`
    );
}

// =============================================================
// [MODIFIED] SELECT → switch formatter, DDL giữ nguyên
// =============================================================
function executeQuery(sql) {
    const trimmed = sql.trim();
    if (!trimmed) return;

    try {
        const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed);

        if (isSelect) {
            const rows = db.prepare(trimmed).all();
            expandedMode ? formatExpanded(rows) : formatTable(rows);
        } else {
            db.exec(trimmed);
            console.log(`${C.green}✓ Query executed successfully${C.reset}\n`);
        }
    } catch (error) {
        console.log(`${C.red}Error: ${error.message}${C.reset}\n`);
    }
}

// =============================================================
// [MODIFIED] handleCommand – KHÔNG XOÁ case nào
// =============================================================
function handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    switch (command) {

        // [ADDED]
        case '.x':
            expandedMode = !expandedMode;
            console.log(
                `${C.green}Expanded mode: ${expandedMode ? 'ON' : 'OFF'}${C.reset}\n`
            );
            break;

        // [UNCHANGED]
        case '.tables':
            const tables = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `).all();
            console.log(`\n${C.bold}Tables:${C.reset}`);
            tables.forEach(t => console.log(`  ${C.yellow}${t.name}${C.reset}`));
            console.log();
            break;

        // [UNCHANGED]
        case '.views':
            const views = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='view'
                ORDER BY name
            `).all();
            console.log(`\n${C.bold}Views:${C.reset}`);
            views.forEach(v => console.log(`  ${C.yellow}${v.name}${C.reset}`));
            console.log();
            break;

        // [UNCHANGED]
        case '.schema':
            if (!arg) {
                console.log(`${C.red}Usage: .schema <table_name>${C.reset}\n`);
                break;
            }
            const schema = db.prepare(`
                SELECT sql FROM sqlite_master
                WHERE name = ? AND sql IS NOT NULL
            `).get(arg);
            if (schema) {
                console.log(`\n${C.dim}${schema.sql}${C.reset}\n`);
            } else {
                console.log(`${C.red}Table '${arg}' not found${C.reset}\n`);
            }
            break;

        // [UNCHANGED – FULLY RESTORED]
        case '.stats':
            console.log(`\n${C.bold}Database Statistics:${C.reset}`);
            const stats = [
                ['users', 'SELECT COUNT(*) as count FROM users'],
                ['user_profiles', 'SELECT COUNT(*) as count FROM user_profiles'],
                ['fb_pages', 'SELECT COUNT(*) as count FROM fb_pages'],
                ['user_page_likes', 'SELECT COUNT(*) as count FROM user_page_likes'],
                ['saved_media', 'SELECT COUNT(*) as count FROM saved_media'],
                ['username_history', 'SELECT COUNT(*) as count FROM username_history'],
            ];
            stats.forEach(([name, sql]) => {
                try {
                    const result = db.prepare(sql).get();
                    console.log(`  ${C.yellow}${name}:${C.reset} ${result.count} rows`);
                } catch {
                    console.log(`  ${C.yellow}${name}:${C.reset} ${C.dim}(not found)${C.reset}`);
                }
            });
            console.log();
            break;

        // [UNCHANGED]
        case '.clear':
            console.clear();
            break;

        // [UNCHANGED]
        case '.exit':
        case '.quit':
            console.log(`${C.dim}Goodbye!${C.reset}`);
            db.close();
            rl.close();
            process.exit(0);

        default:
            console.log(`${C.red}Unknown command: ${command}${C.reset}`);
            console.log(
                `${C.dim}Type .tables, .views, .schema <table>, .stats, .x, .clear, or .exit${C.reset}\n`
            );
    }
}

function handleInput(input) {
    const trimmed = input.trim();

    // Handle special commands
    if (trimmed.startsWith('.')) {
        handleCommand(trimmed);
        prompt();
        return;
    }

    // Build multi-line query
    queryBuffer += (queryBuffer ? ' ' : '') + input;

    // Execute if ends with semicolon or is a DDL statement
    if (queryBuffer.trim().endsWith(';') ||
        /^\s*(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)/i.test(queryBuffer)) {
        executeQuery(queryBuffer);
        queryBuffer = '';
    }

    prompt();
}

// Handle Ctrl+C
rl.on('close', () => {
    console.log(`\n${C.dim}Goodbye!${C.reset}`);
    db.close();
    process.exit(0);
});

// Start the REPL
prompt();
