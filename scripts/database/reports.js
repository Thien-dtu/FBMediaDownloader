/**
 * Database Reports Module
 *
 * Handles download reporting and statistics tracking.
 * @module database/reports
 */

import { DATABASE_ENABLED } from '../../config.js';
import { getDatabase } from './connection.js';
import { log } from '../logger.js';

/**
 * Create a new download report
 * @param {number} apiTypeId - API type ID
 * @returns {number|null} Report ID or null
 */
export const createReport = (apiTypeId) => {
    const db = getDatabase();
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
 * @param {Object} stats - Statistics object
 * @param {string} stats.url - Source URL
 * @param {number} stats.totalItems - Total items found
 * @param {number} stats.itemsSaved - Items successfully saved
 * @param {number} stats.itemsNotSaved - Items not saved
 * @param {number} stats.duration - Duration in seconds
 * @param {number} stats.pagesFetched - Number of pages fetched
 * @param {Array} stats.mediaIds - Array of media IDs
 * @returns {boolean} Success status
 */
export const addReportDetail = (reportId, userId, stats) => {
    const db = getDatabase();
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
 * @returns {{total_media: number, first_download: string, last_download: string}|null} Statistics or null
 */
export const getDownloadStats = (userId) => {
    const db = getDatabase();
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
