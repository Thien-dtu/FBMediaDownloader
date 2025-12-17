import { FB_API_HOST } from './constants.js';
import { ACCESS_TOKEN, PLATFORM_FACEBOOK } from '../config.js';
import { myFetch } from './utils.js';
import { log } from './logger.js';
import {
    hasUsername,
    getOrCreateUser,
    saveUsername,
    getAllUIDs,
    getUserIdByUID
} from './database.js';

/**
 * Fetch user info (id, name) from Facebook API
 * @param {string} uid - User's UID
 * @returns {Promise<object|null>} {id, name} or null on error
 */
export const fetchUserInfo = async (uid) => {
    try {
        const url = `${FB_API_HOST}/${uid}?fields=id,name&access_token=${ACCESS_TOKEN}`;
        const data = await myFetch(url);

        if (!data || !data.name) {
            return null;
        }

        return {
            id: data.id,
            name: data.name
        };
    } catch (error) {
        log(`⚠️ Error fetching user info for ${uid}: ${error.message}`);
        return null;
    }
};

/**
 * Ensure a UID has a username stored. If not, fetch and save it.
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {Promise<object>} {userId, username, fetched: boolean, error?: string}
 */
export const ensureUsername = async (uid, platformId = PLATFORM_FACEBOOK) => {
    // Check if username already exists
    const existing = hasUsername(uid, platformId);

    if (existing.hasUsername) {
        return {
            userId: existing.userId,
            username: existing.username,
            fetched: false
        };
    }

    // Need to fetch username from API
    log(`📡 Fetching username for UID: ${uid}...`);
    const userInfo = await fetchUserInfo(uid);

    if (!userInfo || !userInfo.name) {
        return {
            userId: existing.userId,
            username: null,
            fetched: false,
            error: 'Could not fetch username from API'
        };
    }

    // Get or create user in database
    let userId = existing.userId;
    if (!userId) {
        userId = getOrCreateUser(platformId, uid);
    }

    if (!userId) {
        return {
            userId: null,
            username: userInfo.name,
            fetched: true,
            error: 'Could not create user in database'
        };
    }

    // Save username to database
    const profileUrl = `https://www.facebook.com/${uid}`;
    saveUsername(userId, userInfo.name, profileUrl);

    log(`✅ Saved username: ${userInfo.name} for UID: ${uid}`);

    return {
        userId,
        username: userInfo.name,
        fetched: true
    };
};

/**
 * Scan all UIDs in database and fetch missing usernames
 * @param {function} progressCallback - Optional callback for progress updates (current, total, uid, username)
 * @returns {Promise<object>} {total, fetched, skipped, errors}
 */
export const scanAllUIDs = async (progressCallback = null) => {
    const allUIDs = getAllUIDs();
    const stats = {
        total: allUIDs.length,
        fetched: 0,
        skipped: 0,
        errors: 0
    };

    if (allUIDs.length === 0) {
        log('📋 No UIDs found in database.');
        return stats;
    }

    log(`\n📋 Scanning ${allUIDs.length} UIDs for missing usernames...\n`);

    for (let i = 0; i < allUIDs.length; i++) {
        const uid = allUIDs[i];
        const existing = hasUsername(uid);

        if (existing.hasUsername) {
            stats.skipped++;
            if (progressCallback) {
                progressCallback(i + 1, allUIDs.length, uid, existing.username, 'skipped');
            }
            continue;
        }

        // Small delay to avoid rate limiting
        if (stats.fetched > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const result = await ensureUsername(uid);

        if (result.error) {
            stats.errors++;
            if (progressCallback) {
                progressCallback(i + 1, allUIDs.length, uid, null, 'error');
            }
        } else if (result.fetched) {
            stats.fetched++;
            if (progressCallback) {
                progressCallback(i + 1, allUIDs.length, uid, result.username, 'fetched');
            }
        }
    }

    log(`\n✅ Scan complete!`);
    log(`   Total UIDs: ${stats.total}`);
    log(`   Fetched: ${stats.fetched}`);
    log(`   Already had username: ${stats.skipped}`);
    log(`   Errors: ${stats.errors}`);

    return stats;
};
