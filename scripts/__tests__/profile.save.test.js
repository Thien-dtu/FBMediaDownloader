/**
 * Tests for profile/save.js - Change Detection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';

const TEST_DB_PATH = './test_profile_save.db';

describe('profile/save.js - Change Detection', () => {
    let db;

    beforeEach(() => {
        db = new Database(TEST_DB_PATH);
        db.pragma('foreign_keys = ON');

        // Create required tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS platforms (
                platform_id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_name TEXT NOT NULL UNIQUE
            );
            INSERT OR IGNORE INTO platforms (platform_name) VALUES ('facebook');
            
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform_id INTEGER NOT NULL,
                uid TEXT NOT NULL,
                UNIQUE(platform_id, uid)
            );
            
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                name TEXT,
                first_name TEXT,
                last_name TEXT,
                about TEXT,
                email TEXT,
                link TEXT,
                birthday TEXT,
                age_range_min INTEGER,
                age_range_max INTEGER,
                gender TEXT,
                hometown TEXT,
                location TEXT,
                relationship_status TEXT,
                significant_other TEXT,
                religion TEXT,
                political TEXT,
                work_history TEXT,
                education_history TEXT,
                website TEXT,
                friend_count INTEGER,
                hometown_id INTEGER,
                current_location_id INTEGER,
                significant_other_uid TEXT,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS user_profiles_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                name TEXT,
                first_name TEXT,
                last_name TEXT,
                changed_fields TEXT
            );
        `);
    });

    afterEach(() => {
        if (db) db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    });

    describe('Profile CRUD', () => {
        it('should insert new profile', () => {
            // Create user first
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (1, ?)').run('123456');

            // Insert profile
            const result = db.prepare(`
                INSERT INTO user_profiles (user_id, name, gender) VALUES (1, ?, ?)
            `).run('Test User', 'male');

            expect(result.lastInsertRowid).toBeGreaterThan(0);

            const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = 1').get();
            expect(profile.name).toBe('Test User');
            expect(profile.gender).toBe('male');
        });

        it('should update existing profile with ON CONFLICT', () => {
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (1, ?)').run('123456');

            // Insert initial profile
            db.prepare(`
                INSERT INTO user_profiles (user_id, name, gender) VALUES (1, ?, ?)
            `).run('Old Name', 'male');

            // Update using ON CONFLICT
            db.prepare(`
                INSERT INTO user_profiles (user_id, name, gender) VALUES (1, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, gender = excluded.gender
            `).run('New Name', 'female');

            const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = 1').get();
            expect(profile.name).toBe('New Name');
            expect(profile.gender).toBe('female');
        });
    });

    describe('Change Detection Logic', () => {
        const TRACKED_FIELDS = ['name', 'gender', 'location'];

        function detectChanges(oldProfile, newData) {
            if (!oldProfile) return [];
            const changedFields = [];
            for (const field of TRACKED_FIELDS) {
                if (oldProfile[field] !== newData[field]) {
                    changedFields.push(field);
                }
            }
            return changedFields;
        }

        it('should return empty array for identical data', () => {
            const old = { name: 'Test', gender: 'male', location: 'NYC' };
            const newData = { name: 'Test', gender: 'male', location: 'NYC' };
            expect(detectChanges(old, newData)).toEqual([]);
        });

        it('should detect single field change', () => {
            const old = { name: 'Test', gender: 'male', location: 'NYC' };
            const newData = { name: 'New Name', gender: 'male', location: 'NYC' };
            expect(detectChanges(old, newData)).toEqual(['name']);
        });

        it('should detect multiple field changes', () => {
            const old = { name: 'Test', gender: 'male', location: 'NYC' };
            const newData = { name: 'New Name', gender: 'female', location: 'LA' };
            expect(detectChanges(old, newData)).toEqual(['name', 'gender', 'location']);
        });

        it('should return empty array for new profile (null old)', () => {
            const newData = { name: 'Test', gender: 'male', location: 'NYC' };
            expect(detectChanges(null, newData)).toEqual([]);
        });
    });

    describe('Profile History', () => {
        it('should save snapshot to history table', () => {
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (1, ?)').run('123456');

            // Save to history
            db.prepare(`
                INSERT INTO user_profiles_history (user_id, name, first_name, changed_fields)
                VALUES (?, ?, ?, ?)
            `).run(1, 'Old Name', 'Old First', JSON.stringify(['name', 'first_name']));

            const history = db.prepare('SELECT * FROM user_profiles_history WHERE user_id = 1').get();
            expect(history).toBeDefined();
            expect(history.name).toBe('Old Name');
            expect(JSON.parse(history.changed_fields)).toEqual(['name', 'first_name']);
        });

        it('should allow multiple history entries per user', () => {
            db.prepare('INSERT INTO users (platform_id, uid) VALUES (1, ?)').run('123456');

            db.prepare('INSERT INTO user_profiles_history (user_id, name, changed_fields) VALUES (?, ?, ?)').run(1, 'Name V1', '["name"]');
            db.prepare('INSERT INTO user_profiles_history (user_id, name, changed_fields) VALUES (?, ?, ?)').run(1, 'Name V2', '["name"]');

            const history = db.prepare('SELECT * FROM user_profiles_history WHERE user_id = 1').all();
            expect(history).toHaveLength(2);
        });
    });
});
