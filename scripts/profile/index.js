/**
 * Profile Module - Main Entry Point
 *
 * Provides high-level profile fetching and saving operations.
 * @module profile
 */

import { DATABASE_ENABLED, PLATFORM_FACEBOOK } from '../../config.js';
import { getDatabase } from '../database/connection.js';
import { getOrCreateUser } from '../database/users.js';
import { log } from '../logger.js';

// Import fetch functions
import { fetchUserProfile, fetchAllLikes, fetchFieldGroup } from './fetch.js';

// Import save functions
import {
    saveProfile,
    saveWorkHistory,
    saveEducationHistory,
    saveLikes,
    updateUsername,
    hasUserProfile
} from './save.js';

// Re-export all functions
export {
    fetchUserProfile,
    fetchAllLikes,
    fetchFieldGroup,
    saveProfile,
    saveWorkHistory,
    saveEducationHistory,
    saveLikes,
    updateUsername,
    hasUserProfile
};

/**
 * Display profile summary to console
 * @param {Object} profile - Profile data
 */
function displayProfileSummary(profile) {
    log(`   📛 ${profile.name || 'Unknown'} (${profile.gender || 'N/A'})`);
    if (profile.location?.name) log(`   📍 ${profile.location.name}`);
    if (profile.work?.length) log(`   💼 ${profile.work[0].employer?.name || 'Unknown'}`);
    if (profile.education?.length) log(`   🎓 ${profile.education[0].school?.name || 'Unknown'}`);
}

/**
 * Fetch user profile and save to database
 * Main entry point for getting complete user profile
 * Matches original test_user_profile.js logic
 * @param {string} uid - User's UID
 * @param {Object} options - Options
 * @param {boolean} options.includeLikes - Whether to fetch likes (default: false)
 * @param {number} options.likesLimit - Maximum likes to fetch (default: unlimited)
 * @returns {Promise<Object>} Result with profile data and save status
 */
export const fetchAndSaveProfile = async (uid, options = {}) => {
    const { includeLikes = false, likesLimit = Infinity } = options;

    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) {
        // Just fetch without saving
        const profile = await fetchUserProfile(uid);
        return { profile, saved: false, reason: 'database_disabled', isNew: false, changedFields: [] };
    }

    try {
        // Fetch profile
        const profile = await fetchUserProfile(uid);

        if (!profile || !profile.id) {
            return { profile: null, saved: false, reason: 'fetch_failed', isNew: false, changedFields: [] };
        }

        // Display summary
        displayProfileSummary(profile);

        // Get or create user
        const userId = getOrCreateUser(PLATFORM_FACEBOOK, uid);
        if (!userId) {
            return { profile, saved: false, reason: 'user_creation_failed', isNew: false, changedFields: [] };
        }

        // Save profile (now returns {saved, isNew, changedFields})
        const saveResult = saveProfile(db, userId, profile);
        if (!saveResult.saved) {
            return { profile, saved: false, reason: 'profile_save_failed', isNew: false, changedFields: [] };
        }

        log(`   ✅ Profile saved (user_id: ${userId})`);

        // Save work history (normalized)
        if (profile.work && profile.work.length > 0) {
            const workSaved = saveWorkHistory(db, userId, profile.work);
            log(`   ✅ Work history: ${workSaved} records`);
        }

        // Save education history (normalized)
        if (profile.education && profile.education.length > 0) {
            const eduSaved = saveEducationHistory(db, userId, profile.education);
            log(`   ✅ Education: ${eduSaved} records`);
        }

        // Update username
        if (profile.name) {
            updateUsername(db, userId, profile.name, profile.link);
        }

        // Fetch and save likes if requested
        if (includeLikes) {
            const likes = await fetchAllLikes(uid, likesLimit);
            if (likes.length > 0) {
                const likesResult = saveLikes(db, userId, likes);
                log(`   ✅ Likes: ${likesResult.saved} saved, ${likesResult.skipped} skipped`);
            }
        }

        return {
            profile,
            saved: true,
            userId,
            isNew: saveResult.isNew,
            changedFields: saveResult.changedFields
        };

    } catch (error) {
        log(`⚠️ Error in fetchAndSaveProfile: ${error.message}`);
        return { profile: null, saved: false, reason: error.message, isNew: false, changedFields: [] };
    }
};

/**
 * Ensure a user has a profile, fetching if missing
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {Promise<{exists: boolean, fetched: boolean}>} Status
 */
export const ensureUserProfile = async (uid, platformId = PLATFORM_FACEBOOK) => {
    if (hasUserProfile(uid, platformId)) {
        return { exists: true, fetched: false };
    }

    const result = await fetchAndSaveProfile(uid);
    return { exists: result.saved, fetched: result.saved };
};

/**
 * Ensure profiles exist for multiple UIDs, fetching missing ones
 * @param {string[]} uids - Array of UIDs
 * @returns {Promise<{total: number, fetched: number, existing: number, failed: number}>} Stats
 */
export const ensureUserProfileForUIDs = async (uids) => {
    const stats = { total: uids.length, fetched: 0, existing: 0, failed: 0 };

    for (const uid of uids) {
        if (hasUserProfile(uid)) {
            stats.existing++;
            continue;
        }

        const result = await fetchAndSaveProfile(uid);
        if (result.saved) {
            stats.fetched++;
        } else {
            stats.failed++;
        }
    }

    if (stats.fetched > 0) {
        log(`📊 Profile sync: ${stats.fetched} fetched, ${stats.existing} already existed, ${stats.failed} failed`);
    }

    return stats;
};
