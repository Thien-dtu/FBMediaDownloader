/**
 * Database Connection Module
 *
 * Handles database initialization, connection management, and schema migrations.
 * @module database/connection
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { DATABASE_PATH, DATABASE_ENABLED } from '../../config.js';
import { log } from '../logger.js';

/** @type {import('better-sqlite3').Database|null} Database connection instance */
let db = null;

/**
 * Initialize database connection and run schema migrations if needed
 * Creates tables on first run and adds HD tracking columns for backward compatibility
 * @returns {import('better-sqlite3').Database|null} Database instance or null if disabled/error
 */
export const initDatabase = () => {
    if (!DATABASE_ENABLED) {
        return null;
    }

    try {
        // Open database connection
        db = new Database(DATABASE_PATH);

        // Enable foreign keys
        db.pragma('foreign_keys = ON');

        // Check if database is already initialized
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='platforms'").get();

        if (!tables) {
            // Database is new, run schema (already includes HD tracking columns)
            log('📊 Initializing database schema...');
            const schema = fs.readFileSync('./schema.sql', 'utf8');
            db.exec(schema);
            log('✅ Database schema created successfully');
        } else {
            // Check if old database needs HD columns added (backward compatibility)
            const hasIsHdColumn = db.prepare(
                "SELECT 1 FROM pragma_table_info('saved_media') WHERE name='is_hd'"
            ).get();

            if (!hasIsHdColumn) {
                log('📊 Adding HD tracking columns to existing database...');
                try {
                    db.exec(`
                        ALTER TABLE saved_media ADD COLUMN is_hd BOOLEAN DEFAULT 0;
                        ALTER TABLE saved_media ADD COLUMN file_path TEXT;
                        CREATE INDEX IF NOT EXISTS idx_saved_media_hd_status ON saved_media(user_id, is_hd);
                    `);
                    log('✅ HD tracking columns added successfully');
                } catch (migrationError) {
                    log(`⚠️ Migration error: ${migrationError.message}`);
                }
            }
        }

        return db;
    } catch (error) {
        log(`⚠️ Database initialization error: ${error.message}`);
        return null;
    }
};

/**
 * Close the database connection gracefully
 * Should be called when the application exits
 * @returns {void}
 */
export const closeDatabase = () => {
    if (db) {
        db.close();
        db = null;
    }
};

/**
 * Get the raw database instance for advanced queries
 * Use with caution - prefer using exported helper functions
 * @returns {import('better-sqlite3').Database|null} Database instance or null if not initialized
 */
export const getDatabase = () => db;

/**
 * Check if database is enabled and connected
 * @returns {boolean} True if database is available
 */
export const isDatabaseReady = () => DATABASE_ENABLED && db !== null;
