import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATABASE_PATH, DATABASE_ENABLED } from '../config.js';
import { log } from './logger.js';

let db = null;

/**
 * Initialize database and run schema if needed
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
            // Database is new, run schema
            log('📊 Initializing database schema...');
            const schema = fs.readFileSync('./schema-v2.sql', 'utf8');
            db.exec(schema);
            log('✅ Database schema created successfully');
        } else {
            // Check if migration is needed (v3: HD tracking)
            const hasIsHdColumn = db.prepare(
                "SELECT 1 FROM pragma_table_info('saved_media') WHERE name='is_hd'"
            ).get();

            if (!hasIsHdColumn) {
                log('📊 Running migration v3 (HD tracking)...');
                try {
                    const migration = fs.readFileSync('./migration-v3.sql', 'utf8');
                    db.exec(migration);
                    log('✅ Migration v3 completed successfully');
                } catch (migrationError) {
                    log(`⚠️ Migration v3 error: ${migrationError.message}`);
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
 * Get or create user by platform and UID
 * @param {number} platformId - Platform ID (1=Facebook, 2=Instagram)
 * @param {string} uid - User's stable UID
 * @returns {number|null} User ID or null on error
 */
export const getOrCreateUser = (platformId, uid) => {
    if (!db || !DATABASE_ENABLED) return null;

    try {
        // Try to find existing user
        const existingUser = db.prepare(
            'SELECT id FROM users WHERE platform_id = ? AND uid = ?'
        ).get(platformId, uid);

        if (existingUser) {
            return existingUser.id;
        }

        // Create new user
        const result = db.prepare(
            'INSERT INTO users (platform_id, uid) VALUES (?, ?)'
        ).run(platformId, uid);

        return result.lastInsertRowid;
    } catch (error) {
        log(`⚠️ Error getting/creating user: ${error.message}`);
        return null;
    }
};

/**
 * Save or update username for a user
 * @param {number} userId - User ID
 * @param {string} username - Username
 * @param {string} profileUrl - Profile URL (optional)
 * @returns {boolean} Success status
 */
export const saveUsername = (userId, username, profileUrl = null) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        // Mark all existing usernames as not current
        db.prepare(
            'UPDATE username_history SET is_current = 0 WHERE user_id = ?'
        ).run(userId);

        // Insert new username
        db.prepare(
            'INSERT INTO username_history (user_id, username, profile_url, is_current) VALUES (?, ?, ?, 1)'
        ).run(userId, username, profileUrl);

        return true;
    } catch (error) {
        log(`⚠️ Error saving username: ${error.message}`);
        return false;
    }
};

/**
 * Check if media has already been downloaded
 * @param {number} userId - User ID
 * @param {string} mediaId - Media ID
 * @returns {boolean} True if already downloaded, false otherwise
 */
export const isMediaDownloaded = (userId, mediaId) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        const result = db.prepare(
            'SELECT 1 FROM saved_media WHERE user_id = ? AND media_id = ? LIMIT 1'
        ).get(userId, mediaId);

        return !!result;
    } catch (error) {
        log(`⚠️ Error checking media: ${error.message}`);
        return false;
    }
};

/**
 * Mark media as downloaded with HD status and file path
 * @param {number} userId - User ID
 * @param {string} mediaId - Media ID
 * @param {boolean} isHd - Whether media was downloaded in HD quality
 * @param {string} filePath - Path where the file is stored
 * @returns {boolean} Success status
 */
export const saveMedia = (userId, mediaId, isHd = false, filePath = null) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        db.prepare(
            'INSERT OR IGNORE INTO saved_media (user_id, media_id, is_hd, file_path) VALUES (?, ?, ?, ?)'
        ).run(userId, mediaId, isHd ? 1 : 0, filePath);

        return true;
    } catch (error) {
        log(`⚠️ Error saving media: ${error.message}`);
        return false;
    }
};

/**
 * Check if media is downloaded AND in HD quality
 * @param {number} userId - User ID
 * @param {string} mediaId - Media ID
 * @returns {object|null} {exists: boolean, isHd: boolean, filePath: string|null}
 */
export const getMediaStatus = (userId, mediaId) => {
    if (!db || !DATABASE_ENABLED) return null;

    try {
        const result = db.prepare(
            'SELECT is_hd, file_path FROM saved_media WHERE user_id = ? AND media_id = ? LIMIT 1'
        ).get(userId, mediaId);

        if (!result) return { exists: false, isHd: false, filePath: null };

        return {
            exists: true,
            isHd: !!result.is_hd,
            filePath: result.file_path
        };
    } catch (error) {
        log(`⚠️ Error getting media status: ${error.message}`);
        return null;
    }
};

/**
 * Update media to HD status after upgrade
 * @param {number} userId - User ID
 * @param {string} mediaId - Media ID
 * @param {string} filePath - New file path (optional)
 * @returns {boolean} Success status
 */
export const updateMediaToHD = (userId, mediaId, filePath = null) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        if (filePath) {
            db.prepare(
                'UPDATE saved_media SET is_hd = 1, file_path = ? WHERE user_id = ? AND media_id = ?'
            ).run(filePath, userId, mediaId);
        } else {
            db.prepare(
                'UPDATE saved_media SET is_hd = 1 WHERE user_id = ? AND media_id = ?'
            ).run(userId, mediaId);
        }
        return true;
    } catch (error) {
        log(`⚠️ Error updating media to HD: ${error.message}`);
        return false;
    }
};

/**
 * Get all non-HD media for a user (for upgrade feature)
 * @param {number} userId - User ID
 * @returns {Array} Array of {media_id, file_path}
 */
export const getMediaNeedingHDUpgrade = (userId) => {
    if (!db || !DATABASE_ENABLED) return [];

    try {
        const results = db.prepare(
            'SELECT media_id, file_path FROM saved_media WHERE user_id = ? AND is_hd = 0'
        ).all(userId);
        return results;
    } catch (error) {
        log(`⚠️ Error getting media needing HD upgrade: ${error.message}`);
        return [];
    }
};

/**
 * Get pagination cursor for user and API type
 * @param {number} userId - User ID
 * @param {number} apiTypeId - API type ID
 * @returns {object|null} Cursor data or null
 */
export const getCursor = (userId, apiTypeId) => {
    if (!db || !DATABASE_ENABLED) return null;

    try {
        const result = db.prepare(
            'SELECT cursor, pages_loaded FROM user_cursors WHERE user_id = ? AND api_type_id = ?'
        ).get(userId, apiTypeId);

        return result;
    } catch (error) {
        log(`⚠️ Error getting cursor: ${error.message}`);
        return null;
    }
};

/**
 * Update pagination cursor for user and API type
 * @param {number} userId - User ID
 * @param {number} apiTypeId - API type ID
 * @param {string} cursor - Cursor value
 * @param {number} pagesLoaded - Number of pages loaded
 * @returns {boolean} Success status
 */
export const updateCursor = (userId, apiTypeId, cursor, pagesLoaded) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        db.prepare(`
      INSERT INTO user_cursors (user_id, api_type_id, cursor, pages_loaded)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, api_type_id) DO UPDATE SET
        cursor = excluded.cursor,
        pages_loaded = excluded.pages_loaded,
        last_updated = CURRENT_TIMESTAMP
    `).run(userId, apiTypeId, cursor, pagesLoaded);

        return true;
    } catch (error) {
        log(`⚠️ Error updating cursor: ${error.message}`);
        return false;
    }
};

/**
 * Create a new download report
 * @param {number} apiTypeId - API type ID
 * @returns {number|null} Report ID or null
 */
export const createReport = (apiTypeId) => {
    if (!db || !DATABASE_ENABLED) return null;

    try {
        const result = db.prepare(
            'INSERT INTO api_reports (api_type_id, timestamp) VALUES (?, datetime("now"))'
        ).run(apiTypeId);

        return result.lastInsertRowid;
    } catch (error) {
        log(`⚠️ Error creating report: ${error.message}`);
        return null;
    }
};

/**
 * Add detail to a download report
 * @param {number} reportId - Report ID
 * @param {number} userId - User ID
 * @param {object} stats - Statistics object
 * @returns {boolean} Success status
 */
export const addReportDetail = (reportId, userId, stats) => {
    if (!db || !DATABASE_ENABLED) return false;

    try {
        db.prepare(`
      INSERT INTO report_details 
      (report_id, user_id, url, total_items, items_saved, items_not_saved, duration, pages_fetched, media_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            reportId,
            userId,
            stats.url || null,
            stats.totalItems || 0,
            stats.itemsSaved || 0,
            stats.itemsNotSaved || 0,
            stats.duration || 0,
            stats.pagesFetched || 0,
            stats.mediaIds ? JSON.stringify(stats.mediaIds) : null
        );

        return true;
    } catch (error) {
        log(`⚠️ Error adding report detail: ${error.message}`);
        return false;
    }
};

/**
 * Get download statistics for a user
 * @param {number} userId - User ID
 * @returns {object|null} Statistics or null
 */
export const getDownloadStats = (userId) => {
    if (!db || !DATABASE_ENABLED) return null;

    try {
        const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_media,
        MIN(created_at) as first_download,
        MAX(created_at) as last_download
      FROM saved_media
      WHERE user_id = ?
    `).get(userId);

        return stats;
    } catch (error) {
        log(`⚠️ Error getting stats: ${error.message}`);
        return null;
    }
};

/**
 * Get all saved media IDs for a user
 * @param {number} userId - User ID
 * @returns {Set<string>} Set of media IDs
 */
export const getSavedMediaIds = (userId) => {
    if (!db || !DATABASE_ENABLED) return new Set();

    try {
        const results = db.prepare(
            'SELECT media_id FROM saved_media WHERE user_id = ?'
        ).all(userId);

        return new Set(results.map(r => r.media_id));
    } catch (error) {
        log(`⚠️ Error getting saved media IDs: ${error.message}`);
        return new Set();
    }
};

/**
 * Close database connection
 */
export const closeDatabase = () => {
    if (db) {
        db.close();
        db = null;
    }
};

/**
 * Get database instance (for advanced queries)
 */
export const getDatabase = () => db;
