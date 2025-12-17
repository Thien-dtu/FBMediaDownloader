/**
 * Database Users Module
 *
 * Handles user-related database operations: creation, lookup, and username management.
 * @module database/users
 */

import { DATABASE_ENABLED } from '../../config.js';
import { getDatabase } from './connection.js';
import { log } from '../logger.js';

/**
 * Get or create user by platform and UID
 * @param {number} platformId - Platform ID (1=Facebook, 2=Instagram)
 * @param {string} uid - User's stable UID
 * @returns {number|null} User ID or null on error
 */
export const getOrCreateUser = (platformId, uid) => {
    const db = getDatabase();
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
 * Get user ID by UID (without creating)
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {number|null} User ID or null if not found
 */
export const getUserIdByUID = (uid, platformId = 1) => {
    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) return null;

    try {
        const result = db.prepare(
            'SELECT id FROM users WHERE platform_id = ? AND uid = ?'
        ).get(platformId, uid);
        return result?.id || null;
    } catch (error) {
        log(`⚠️ Error getting user by UID: ${error.message}`);
        return null;
    }
};

/**
 * Check if a UID has a username stored
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {{hasUsername: boolean, username: string|null, userId: number|null}} Username status
 */
export const hasUsername = (uid, platformId = 1) => {
    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) return { hasUsername: false, username: null, userId: null };

    try {
        const result = db.prepare(`
            SELECT u.id as userId, uh.username
            FROM users u
            LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1
            WHERE u.platform_id = ? AND u.uid = ?
        `).get(platformId, uid);

        if (!result) {
            return { hasUsername: false, username: null, userId: null };
        }

        return {
            hasUsername: !!result.username,
            username: result.username || null,
            userId: result.userId
        };
    } catch (error) {
        log(`⚠️ Error checking username: ${error.message}`);
        return { hasUsername: false, username: null, userId: null };
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
    const db = getDatabase();
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
 * Get all UIDs from the database
 * @returns {Array<string>} Array of all UIDs
 */
export const getAllUIDs = () => {
    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) return [];

    try {
        const results = db.prepare('SELECT uid FROM users ORDER BY uid').all();
        return results.map(r => r.uid);
    } catch (error) {
        log(`⚠️ Error getting all UIDs: ${error.message}`);
        return [];
    }
};
