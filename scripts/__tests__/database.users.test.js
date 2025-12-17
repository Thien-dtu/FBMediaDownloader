/**
 * Tests for database/users.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';

// Create a test database
const TEST_DB_PATH = './test_users.db';

describe('database/users.js', () => {
    let db;

    beforeEach(() => {
        // Create fresh test database
        db = new Database(TEST_DB_PATH);
        db.pragma('foreign_keys = ON');

        // Create required tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS platforms (
                platform_id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_name TEXT NOT NULL UNIQUE
            );
            INSERT OR IGNORE INTO platforms (platform_name) VALUES ('facebook'), ('instagram');
            
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_id INTEGER NOT NULL,
                uid TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (platform_id) REFERENCES platforms(platform_id),
                UNIQUE(platform_id, uid)
            );
            
            CREATE TABLE IF NOT EXISTS username_history (
                user_his_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                profile_url TEXT,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_current BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
    });

    afterEach(() => {
        if (db) db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    });

    describe('User CRUD operations', () => {
        it('should create a new user', () => {
            const result = db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            expect(result.lastInsertRowid).toBeGreaterThan(0);
        });

        it('should get user by UID', () => {
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            const user = db.prepare('SELECT * FROM users WHERE platform_id = ? AND uid = ?').get(1, '123456');
            expect(user).toBeDefined();
            expect(user.uid).toBe('123456');
        });

        it('should return undefined for non-existent user', () => {
            const user = db.prepare('SELECT * FROM users WHERE platform_id = ? AND uid = ?').get(1, 'nonexistent');
            expect(user).toBeUndefined();
        });

        it('should enforce unique constraint on platform_id + uid', () => {
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            expect(() => {
                db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            }).toThrow();
        });
    });

    describe('Username history', () => {
        it('should add username to history', () => {
            const userResult = db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            const userId = userResult.lastInsertRowid;

            db.prepare('INSERT INTO username_history (user_id, username) VALUES (?, ?)').run(userId, 'TestUser');

            const history = db.prepare('SELECT * FROM username_history WHERE user_id = ?').get(userId);
            expect(history.username).toBe('TestUser');
            expect(history.is_current).toBe(1);
        });

        it('should track username changes', () => {
            const userResult = db.prepare('INSERT INTO users (platform_id, uid) VALUES (?, ?)').run(1, '123456');
            const userId = userResult.lastInsertRowid;

            // Add first username
            db.prepare('INSERT INTO username_history (user_id, username, is_current) VALUES (?, ?, 1)').run(userId, 'OldName');

            // Mark old as not current, add new
            db.prepare('UPDATE username_history SET is_current = 0 WHERE user_id = ?').run(userId);
            db.prepare('INSERT INTO username_history (user_id, username, is_current) VALUES (?, ?, 1)').run(userId, 'NewName');

            const allHistory = db.prepare('SELECT * FROM username_history WHERE user_id = ? ORDER BY user_his_id').all(userId);
            expect(allHistory).toHaveLength(2);
            expect(allHistory[0].username).toBe('OldName');
            expect(allHistory[0].is_current).toBe(0);
            expect(allHistory[1].username).toBe('NewName');
            expect(allHistory[1].is_current).toBe(1);
        });
    });
});
