/**
 * Profile Fetch Module
 *
 * Handles fetching user profile data from the Facebook Graph API.
 * Fetches fields individually for better resilience - if one fails, others still work.
 * @module profile/fetch
 */

import { FB_API_HOST } from '../constants.js';
import { ACCESS_TOKEN } from '../../config.js';
import { myFetch, sleep } from '../utils.js';
import { log } from '../logger.js';

/**
 * Profile fields to fetch individually for resilience
 * Each group is fetched separately so if one fails, others still work
 * @constant {Array<string[]>}
 */
const PROFILE_FIELD_GROUPS = [
    ['id', 'name', 'first_name', 'last_name', 'link'],  // Basic - should always work
    ['gender'],
    ['about'],
    ['email'],
    ['birthday'],
    ['age_range'],
    ['hometown'],
    ['location'],
    ['relationship_status', 'significant_other'],
    ['religion', 'political'],
    ['work'],
    ['education'],
    ['website'],
    ['friends.summary(true)'],
];

/**
 * Fetch a single field group from Facebook API
 * Silently skips errors for individual fields
 * @param {string} uid - User ID
 * @param {string[]} fields - Field names to fetch
 * @returns {Promise<Object>} Field data (may be partial or empty)
 */
export const fetchFieldGroup = async (uid, fields) => {
    const fieldsStr = fields.join(',');
    const url = `${FB_API_HOST}/${uid}?fields=${fieldsStr}&access_token=${ACCESS_TOKEN}`;

    try {
        const data = await myFetch(url);
        if (!data || data.error) {
            // Silently skip errors for individual fields
            return {};
        }
        return data;
    } catch (error) {
        return {};
    }
};

/**
 * Fetch user profile by trying each field group individually
 * Uses resilient fetching - if one group fails, others still work
 * @param {string} uid - User ID
 * @returns {Promise<Object|null>} Complete profile or null on total failure
 */
export const fetchUserProfile = async (uid) => {
    log(`\n🔍 Fetching profile for UID: ${uid}`);

    let profile = {};
    let hasAnyData = false;

    for (const fields of PROFILE_FIELD_GROUPS) {
        const data = await fetchFieldGroup(uid, fields);
        if (Object.keys(data).length > 0) {
            profile = { ...profile, ...data };
            hasAnyData = true;
        }
        // Small delay between requests
        await sleep(200);
    }

    if (!hasAnyData || !profile.id) {
        log(`❌ Could not fetch any data for UID: ${uid}`);
        return null;
    }

    return profile;
};

/**
 * Fetch ALL page likes by following pagination
 * @param {string} uid - User ID
 * @param {number} limit - Maximum number of likes to fetch (default: unlimited)
 * @returns {Promise<Array>} Array of all liked pages
 */
export const fetchAllLikes = async (uid, limit = Infinity) => {
    const allLikes = [];
    let url = `${FB_API_HOST}/${uid}/likes?fields=id,name,created_time&limit=100&access_token=${ACCESS_TOKEN}`;
    let page = 1;

    log('📋 Fetching liked pages...');

    while (url && allLikes.length < limit) {
        try {
            const data = await myFetch(url);

            if (!data || data.error) {
                log(`   ⚠️ Likes error: ${data?.error?.message || 'Unknown error'}`);
                break;
            }

            if (data.data && data.data.length > 0) {
                allLikes.push(...data.data);
                process.stdout.write(`\r   Pages: ${page} (${allLikes.length} likes)`);
            }

            url = data.paging?.next || null;
            page++;

            if (url) {
                await sleep(300);
            }

        } catch (error) {
            log(`   ⚠️ Error: ${error.message}`);
            break;
        }
    }

    log(`\n   ✅ Total: ${allLikes.length} likes`);
    return allLikes;
};
