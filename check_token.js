import Database from 'better-sqlite3';

const db = new Database('./downloader.db');
const result = db.prepare('SELECT COUNT(*) as count FROM access_tokens WHERE is_active = 1').get();
console.log('Active tokens in database:', result.count);

if (result.count > 0) {
    const token = db.prepare('SELECT id, substr(token, 1, 40) as preview, created_at FROM access_tokens WHERE is_active = 1').get();
    console.log('Token ID:', token.id);
    console.log('Token preview:', token.preview + '...');
    console.log('Created:', token.created_at);
} else {
    console.log('❌ NO ACTIVE TOKENS FOUND!');
    console.log('\nYou need to run: node migrate_token.js');
}

db.close();
