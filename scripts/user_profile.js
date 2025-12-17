/**
 * User Profile Module
 * 
 * Fetch and save user profile information from Facebook API.
 * Extracted from test_user_profile.js for integration into main program flow.
 */

import fetch from 'node-fetch';
import { ACCESS_TOKEN, DATABASE_ENABLED, PLATFORM_FACEBOOK } from '../config.js';
import { FB_API_HOST } from './constants.js';
import { log } from './logger.js';
import { getOrCreateUser, getDatabase } from './database.js';

// Profile fields to fetch individually for resilience
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
 * @param {string} uid - User ID
 * @param {Array} fields - Field names to fetch
 * @returns {Promise<object>} Field data (may be partial or empty)
 */
async function fetchFieldGroup(uid, fields) {
    const fieldsStr = fields.join(',');
    const url = `${FB_API_HOST}/${uid}?fields=${fieldsStr}&access_token=${ACCESS_TOKEN}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return {};
        }

        return data;
    } catch (error) {
        return {};
    }
}

/**
 * Fetch user profile by trying each field group individually
 * @param {string} uid - User ID
 * @returns {Promise<object|null>} Complete profile or null on total failure
 */
export async function fetchUserProfile(uid) {
    log(`🔍 Fetching profile for UID: ${uid}`);

    let profile = {};
    let hasAnyData = false;

    for (const fields of PROFILE_FIELD_GROUPS) {
        const data = await fetchFieldGroup(uid, fields);
        if (Object.keys(data).length > 0) {
            profile = { ...profile, ...data };
            hasAnyData = true;
        }
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!hasAnyData || !profile.id) {
        log(`❌ Could not fetch any data for UID: ${uid}`);
        return null;
    }

    return profile;
}

/**
 * Fetch ALL likes by following pagination
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of all liked pages
 */
export async function fetchAllLikes(uid) {
    const allLikes = [];
    let url = `${FB_API_HOST}/${uid}/likes?fields=id,name,created_time&limit=100&access_token=${ACCESS_TOKEN}`;
    let page = 1;

    log('📋 Fetching liked pages...');

    while (url) {
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                log(`   ⚠️ Likes error: ${data.error.message}`);
                break;
            }

            if (data.data && data.data.length > 0) {
                allLikes.push(...data.data);
                process.stdout.write(`\r   Pages: ${page} (${allLikes.length} likes)`);
            }

            url = data.paging?.next || null;
            page++;

            if (url) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        } catch (error) {
            log(`   ⚠️ Error: ${error.message}`);
            break;
        }
    }

    if (allLikes.length > 0) {
        console.log(); // New line after progress
    }
    log(`   ✅ Total: ${allLikes.length} likes`);
    return allLikes;
}

/**
 * Get or create entity in fb_entities table
 */
function getOrCreateEntity(db, fbId, name, entityType) {
    if (!fbId) return null;

    let entity = db.prepare('SELECT id FROM fb_entities WHERE fb_id = ?').get(fbId);
    if (!entity) {
        const result = db.prepare(
            'INSERT INTO fb_entities (fb_id, name, entity_type) VALUES (?, ?, ?)'
        ).run(fbId, name, entityType);
        return result.lastInsertRowid;
    } else {
        db.prepare('UPDATE fb_entities SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE fb_id = ?').run(name, fbId);
        return entity.id;
    }
}

/**
 * Get or create page in fb_pages table (for likes)
 */
function getOrCreatePage(db, pageId, pageName) {
    let page = db.prepare('SELECT id FROM fb_pages WHERE page_id = ?').get(pageId);

    if (!page) {
        const result = db.prepare('INSERT INTO fb_pages (page_id, page_name) VALUES (?, ?)').run(pageId, pageName);
        return result.lastInsertRowid;
    } else {
        db.prepare('UPDATE fb_pages SET page_name = ?, updated_at = CURRENT_TIMESTAMP WHERE page_id = ?').run(pageName, pageId);
        return page.id;
    }
}

/**
 * Save profile to database (using normalized structure)
 */
function saveProfile(db, userId, profile) {
    const hometownId = profile.hometown ? getOrCreateEntity(db, profile.hometown.id, profile.hometown.name, 'location') : null;
    const locationId = profile.location ? getOrCreateEntity(db, profile.location.id, profile.location.name, 'location') : null;
    const significantOtherUid = profile.significant_other?.id || null;

    const sql = `
        INSERT INTO user_profiles (
            user_id, name, first_name, last_name, about, email, link,
            birthday, age_range_min, age_range_max, gender,
            hometown, location, relationship_status, significant_other,
            religion, political, work_history, education_history, website, friend_count,
            hometown_id, current_location_id, significant_other_uid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name = excluded.name,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            about = excluded.about,
            email = excluded.email,
            link = excluded.link,
            birthday = excluded.birthday,
            age_range_min = excluded.age_range_min,
            age_range_max = excluded.age_range_max,
            gender = excluded.gender,
            hometown = excluded.hometown,
            location = excluded.location,
            relationship_status = excluded.relationship_status,
            significant_other = excluded.significant_other,
            religion = excluded.religion,
            political = excluded.political,
            work_history = excluded.work_history,
            education_history = excluded.education_history,
            website = excluded.website,
            friend_count = excluded.friend_count,
            hometown_id = excluded.hometown_id,
            current_location_id = excluded.current_location_id,
            significant_other_uid = excluded.significant_other_uid,
            updated_at = CURRENT_TIMESTAMP
    `;

    try {
        db.prepare(sql).run(
            userId,
            profile.name || null,
            profile.first_name || null,
            profile.last_name || null,
            profile.about || null,
            profile.email || null,
            profile.link || null,
            profile.birthday || null,
            profile.age_range?.min || null,
            profile.age_range?.max || null,
            profile.gender || null,
            profile.hometown ? JSON.stringify(profile.hometown) : null,
            profile.location ? JSON.stringify(profile.location) : null,
            profile.relationship_status || null,
            profile.significant_other ? JSON.stringify(profile.significant_other) : null,
            profile.religion || null,
            profile.political || null,
            profile.work ? JSON.stringify(profile.work) : null,
            profile.education ? JSON.stringify(profile.education) : null,
            profile.website || null,
            profile.friends?.summary?.total_count || null,
            hometownId,
            locationId,
            significantOtherUid
        );
        return true;
    } catch (error) {
        log(`   ❌ Save error: ${error.message}`);
        return false;
    }
}

/**
 * Save work history using normalized structure
 */
function saveWorkHistory(db, userId, workArray) {
    if (!workArray || workArray.length === 0) return 0;

    const insertWork = db.prepare(`
        INSERT INTO user_work_history 
        (user_id, employer_id, position_id, location_id, start_date, end_date, fb_work_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, fb_work_id) DO UPDATE SET
            employer_id = excluded.employer_id,
            position_id = excluded.position_id,
            location_id = excluded.location_id,
            start_date = excluded.start_date,
            end_date = excluded.end_date
    `);

    let saved = 0;
    for (const work of workArray) {
        const employerId = work.employer ? getOrCreateEntity(db, work.employer.id, work.employer.name, 'employer') : null;
        const positionId = work.position ? getOrCreateEntity(db, work.position.id, work.position.name, 'position') : null;
        const locationId = work.location ? getOrCreateEntity(db, work.location.id, work.location.name, 'location') : null;

        try {
            insertWork.run(
                userId,
                employerId,
                positionId,
                locationId,
                work.start_date || null,
                work.end_date || null,
                work.id || null
            );
            saved++;
        } catch (e) {
            // Skip duplicates
        }
    }
    return saved;
}

/**
 * Save education history using normalized structure
 */
function saveEducationHistory(db, userId, educationArray) {
    if (!educationArray || educationArray.length === 0) return 0;

    const insertEdu = db.prepare(`
        INSERT INTO user_education_history 
        (user_id, school_id, concentration_id, education_type, year, fb_education_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, fb_education_id) DO UPDATE SET
            school_id = excluded.school_id,
            concentration_id = excluded.concentration_id,
            education_type = excluded.education_type,
            year = excluded.year
    `);

    let saved = 0;
    for (const edu of educationArray) {
        const schoolId = edu.school ? getOrCreateEntity(db, edu.school.id, edu.school.name, 'school') : null;
        let concentrationId = null;
        if (edu.concentration && edu.concentration.length > 0) {
            concentrationId = getOrCreateEntity(db, edu.concentration[0].id, edu.concentration[0].name, 'concentration');
        }

        try {
            insertEdu.run(
                userId,
                schoolId,
                concentrationId,
                edu.type || null,
                edu.year?.name || null,
                edu.id || null
            );
            saved++;
        } catch (e) {
            // Skip duplicates
        }
    }
    return saved;
}

/**
 * Save likes using normalized structure
 */
function saveLikes(db, userId, likes) {
    if (!likes || likes.length === 0) {
        return { saved: 0, skipped: 0 };
    }

    const insertLike = db.prepare(`
        INSERT INTO user_page_likes (user_id, fb_page_id, liked_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, fb_page_id) DO UPDATE SET
            liked_at = excluded.liked_at
    `);

    let saved = 0;
    let skipped = 0;

    for (const like of likes) {
        try {
            const fbPageId = getOrCreatePage(db, like.id, like.name);
            insertLike.run(userId, fbPageId, like.created_time || null);
            saved++;
        } catch (error) {
            skipped++;
        }
    }

    return { saved, skipped };
}

/**
 * Update username history
 */
function updateUsername(db, userId, name, link) {
    const existing = db.prepare('SELECT * FROM username_history WHERE user_id = ? AND is_current = 1').get(userId);

    if (!existing || existing.username !== name) {
        db.prepare('UPDATE username_history SET is_current = 0 WHERE user_id = ?').run(userId);
        db.prepare('INSERT INTO username_history (user_id, username, profile_url) VALUES (?, ?, ?)').run(userId, name, link);
        return true;
    }
    return false;
}

/**
 * Check if user profile exists in database
 * @param {number} userId - User ID
 * @returns {boolean} True if profile exists
 */
export function hasUserProfile(userId) {
    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) return false;

    try {
        const result = db.prepare('SELECT 1 FROM user_profiles WHERE user_id = ? LIMIT 1').get(userId);
        return !!result;
    } catch (error) {
        log(`⚠️ Error checking user profile: ${error.message}`);
        return false;
    }
}

/**
 * Fetch and save complete user profile
 * @param {string} uid - User ID
 * @param {number} userId - Database user ID
 * @returns {Promise<object>} Result with success status
 */
async function fetchAndSaveProfile(uid, userId) {
    const db = getDatabase();
    if (!db) {
        return { success: false, error: 'Database not available' };
    }

    // Fetch profile from API
    const profile = await fetchUserProfile(uid);
    if (!profile) {
        return { success: false, error: 'Could not fetch profile from API' };
    }

    // Save profile
    const saved = saveProfile(db, userId, profile);
    if (!saved) {
        return { success: false, error: 'Could not save profile to database' };
    }

    log(`   ✅ Profile saved for ${profile.name || uid}`);

    // Save work history
    if (profile.work && profile.work.length > 0) {
        const workSaved = saveWorkHistory(db, userId, profile.work);
        log(`   ✅ Work history: ${workSaved} records`);
    }

    // Save education history
    if (profile.education && profile.education.length > 0) {
        const eduSaved = saveEducationHistory(db, userId, profile.education);
        log(`   ✅ Education: ${eduSaved} records`);
    }

    // Update username
    if (profile.name) {
        updateUsername(db, userId, profile.name, profile.link);
    }

    // Fetch and save likes
    const likes = await fetchAllLikes(uid);
    if (likes.length > 0) {
        const likesResult = saveLikes(db, userId, likes);
        log(`   ✅ Likes: ${likesResult.saved} saved, ${likesResult.skipped} skipped`);
    }

    return { success: true, name: profile.name };
}

/**
 * Ensure user profile exists. If not, fetch and save it.
 * Main integration function for use in download features.
 * 
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {Promise<object>} {userId, hasProfile, fetched, name, error?}
 */
export async function ensureUserProfile(uid, platformId = PLATFORM_FACEBOOK) {
    if (!DATABASE_ENABLED) {
        return { userId: null, hasProfile: false, fetched: false };
    }

    // Get or create user
    const userId = getOrCreateUser(platformId, uid);
    if (!userId) {
        return { userId: null, hasProfile: false, fetched: false, error: 'Could not create user' };
    }

    // Check if profile exists
    const profileExists = hasUserProfile(userId);
    if (profileExists) {
        log(`📋 Profile already exists for UID: ${uid}`);
        return { userId, hasProfile: true, fetched: false };
    }

    // Fetch and save profile
    log(`📡 Profile not found. Fetching for UID: ${uid}...`);
    const result = await fetchAndSaveProfile(uid, userId);

    if (!result.success) {
        return { userId, hasProfile: false, fetched: false, error: result.error };
    }

    return { userId, hasProfile: true, fetched: true, name: result.name };
}

/**
 * Ensure user profiles exist for multiple UIDs
 * @param {string[]} uids - Array of UIDs
 * @returns {Promise<void>}
 */
export async function ensureUserProfileForUIDs(uids) {
    for (const uid of uids) {
        await ensureUserProfile(uid);
    }
}
