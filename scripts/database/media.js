/**
 * Database Media Module
 *
 * Handles media tracking: download status, HD upgrades, and cursor management.
 * @module database/media
 */

import { DATABASE_ENABLED } from '../../config.js';
import { getDatabase } from './connection.js';
import { log } from '../logger.js';

/**
 * Check if media has already been downloaded
 * @param {number} userId - User ID
 * @param {string} mediaId - Media ID
 * @returns {boolean} True if already downloaded, false otherwise
 */
export const isMediaDownloaded = (userId, mediaId) => {
    const db = getDatabase();
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
    const db = getDatabase();
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
 * @returns {{exists: boolean, isHd: boolean, filePath: string|null}|null} Media status
 */
export const getMediaStatus = (userId, mediaId) => {
    const db = getDatabase();
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
    const db = getDatabase();
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
 * @returns {Array<{media_id: string, file_path: string}>} Array of media needing upgrade
 */
export const getMediaNeedingHDUpgrade = (userId) => {
    const db = getDatabase();
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
 * Get all saved media IDs for a user
 * @param {number} userId - User ID
 * @returns {Set<string>} Set of media IDs
 */
export const getSavedMediaIds = (userId) => {
    const db = getDatabase();
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
 * Get pagination cursor for user and API type
 * @param {number} userId - User ID
 * @param {number} apiTypeId - API type ID
 * @returns {{cursor: string, pages_loaded: number}|null} Cursor data or null
 */
export const getCursor = (userId, apiTypeId) => {
    const db = getDatabase();
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
    const db = getDatabase();
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
