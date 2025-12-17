/**
 * Profile Save Module
 *
 * Handles saving user profile data to the database.
 * Uses normalized database structure (fb_entities, fb_pages, user_page_likes).
 * @module profile/save
 */

import { DATABASE_ENABLED, PLATFORM_FACEBOOK } from '../../config.js';
import { getDatabase } from '../database/connection.js';
import { log } from '../logger.js';

/**
 * Get or create an entity in the fb_entities table
 * Used for normalizing locations, employers, schools, etc.
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {string} fbId - Facebook ID of the entity
 * @param {string} name - Display name of the entity
 * @param {string} entityType - Type of entity (location, employer, school, etc.)
 * @returns {number|null} Entity ID or null if fbId is missing
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
        // Update name if changed
        db.prepare('UPDATE fb_entities SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE fb_id = ?').run(name, fbId);
        return entity.id;
    }
}

/**
 * Get or create a Facebook page in the fb_pages table
 * Used for storing liked pages
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {string} pageId - Facebook page ID
 * @param {string} pageName - Display name of the page
 * @returns {number} Page record ID
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
 * Fields to track for change detection
 * @constant {string[]}
 */
const TRACKED_FIELDS = [
    'name', 'first_name', 'last_name', 'about', 'email', 'link',
    'birthday', 'age_range_min', 'age_range_max', 'gender',
    'hometown', 'location', 'relationship_status', 'significant_other',
    'religion', 'political', 'work_history', 'education_history',
    'website', 'friend_count'
];

/**
 * Detect which fields have changed between old and new profile data
 * @param {Object} oldProfile - Existing profile from database
 * @param {Object} newData - New profile data to compare
 * @returns {string[]} Array of field names that changed
 */
function detectProfileChanges(oldProfile, newData) {
    if (!oldProfile) return []; // New profile, no history needed

    const changedFields = [];

    for (const field of TRACKED_FIELDS) {
        const oldVal = oldProfile[field];
        const newVal = newData[field];

        // Normalize for comparison (both null/undefined treated as equal)
        const oldNorm = oldVal === undefined ? null : (typeof oldVal === 'object' ? JSON.stringify(oldVal) : oldVal);
        const newNorm = newVal === undefined ? null : (typeof newVal === 'object' ? JSON.stringify(newVal) : newVal);

        if (oldNorm !== newNorm) {
            changedFields.push(field);
        }
    }

    return changedFields;
}

/**
 * Save a snapshot of the old profile to history before update
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {Object} oldProfile - The profile data before update
 * @param {string[]} changedFields - List of fields that will change
 * @returns {boolean} True if saved successfully
 */
function saveProfileHistory(db, oldProfile, changedFields) {
    if (!oldProfile || changedFields.length === 0) return false;

    try {
        db.prepare(`
            INSERT INTO user_profiles_history (
                user_id, name, first_name, last_name, about, email, link,
                birthday, age_range_min, age_range_max, gender,
                hometown, location, relationship_status, significant_other,
                religion, political, work_history, education_history,
                website, friend_count, hometown_id, current_location_id, significant_other_uid,
                changed_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            oldProfile.user_id,
            oldProfile.name, oldProfile.first_name, oldProfile.last_name,
            oldProfile.about, oldProfile.email, oldProfile.link,
            oldProfile.birthday, oldProfile.age_range_min, oldProfile.age_range_max, oldProfile.gender,
            oldProfile.hometown, oldProfile.location, oldProfile.relationship_status, oldProfile.significant_other,
            oldProfile.religion, oldProfile.political, oldProfile.work_history, oldProfile.education_history,
            oldProfile.website, oldProfile.friend_count,
            oldProfile.hometown_id, oldProfile.current_location_id, oldProfile.significant_other_uid,
            JSON.stringify(changedFields)
        );
        return true;
    } catch (error) {
        log(`⚠️ Error saving profile history: ${error.message}`);
        return false;
    }
}

/**
 * Get existing profile from database for change detection
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @returns {Object|null} Existing profile or null
 */
export function getExistingProfile(db, userId) {
    try {
        return db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    } catch (error) {
        return null;
    }
}

/**
 * Save user profile to database with change tracking
 * Detects changes and saves history before updating
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @param {Object} profile - Profile data from Facebook API
 * @returns {{saved: boolean, isNew: boolean, changedFields: string[]}} Save result with change info
 */
export function saveProfile(db, userId, profile) {
    // Get or create hometown and location entities
    const hometownId = profile.hometown ? getOrCreateEntity(db, profile.hometown.id, profile.hometown.name, 'location') : null;
    const locationId = profile.location ? getOrCreateEntity(db, profile.location.id, profile.location.name, 'location') : null;
    const significantOtherUid = profile.significant_other?.id || null;

    // Prepare the new data object for comparison
    const newProfileData = {
        name: profile.name || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        about: profile.about || null,
        email: profile.email || null,
        link: profile.link || null,
        birthday: profile.birthday || null,
        age_range_min: profile.age_range?.min || null,
        age_range_max: profile.age_range?.max || null,
        gender: profile.gender || null,
        hometown: profile.hometown ? JSON.stringify(profile.hometown) : null,
        location: profile.location ? JSON.stringify(profile.location) : null,
        relationship_status: profile.relationship_status || null,
        significant_other: profile.significant_other ? JSON.stringify(profile.significant_other) : null,
        religion: profile.religion || null,
        political: profile.political || null,
        work_history: profile.work ? JSON.stringify(profile.work) : null,
        education_history: profile.education ? JSON.stringify(profile.education) : null,
        website: profile.website || null,
        friend_count: profile.friends?.summary?.total_count || null,
    };

    // Check for existing profile and detect changes
    const existingProfile = getExistingProfile(db, userId);
    const isNew = !existingProfile;
    let changedFields = [];

    if (existingProfile) {
        changedFields = detectProfileChanges(existingProfile, newProfileData);

        // Save history if there are changes
        if (changedFields.length > 0) {
            saveProfileHistory(db, existingProfile, changedFields);
        }
    }

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
            newProfileData.name,
            newProfileData.first_name,
            newProfileData.last_name,
            newProfileData.about,
            newProfileData.email,
            newProfileData.link,
            newProfileData.birthday,
            newProfileData.age_range_min,
            newProfileData.age_range_max,
            newProfileData.gender,
            newProfileData.hometown,
            newProfileData.location,
            newProfileData.relationship_status,
            newProfileData.significant_other,
            newProfileData.religion,
            newProfileData.political,
            newProfileData.work_history,
            newProfileData.education_history,
            newProfileData.website,
            newProfileData.friend_count,
            hometownId,
            locationId,
            significantOtherUid
        );
        return { saved: true, isNew, changedFields };
    } catch (error) {
        log(`⚠️ Error saving profile: ${error.message}`);
        return { saved: false, isNew, changedFields: [] };
    }
}

/**
 * Save user's work history using normalized structure
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @param {Array} workArray - Array of work history objects from Facebook API
 * @returns {number} Number of work records saved
 */
export function saveWorkHistory(db, userId, workArray) {
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
            // Skip duplicates silently
        }
    }
    return saved;
}

/**
 * Save user's education history using normalized structure
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @param {Array} educationArray - Array of education history objects from Facebook API
 * @returns {number} Number of education records saved
 */
export function saveEducationHistory(db, userId, educationArray) {
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
            // Skip duplicates silently
        }
    }
    return saved;
}

/**
 * Save user's page likes using normalized structure
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @param {Array} likes - Array of liked page objects with id, name, created_time
 * @returns {{saved: number, skipped: number}} Count of saved and skipped likes
 */
export function saveLikes(db, userId, likes) {
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
 * Update username history for a user
 * @param {import('better-sqlite3').Database} db - Database instance
 * @param {number} userId - Internal database user ID
 * @param {string} name - Current username/display name
 * @param {string} link - Profile URL
 * @returns {boolean} True if username was updated, false if unchanged
 */
export function updateUsername(db, userId, name, link) {
    const existing = db.prepare('SELECT * FROM username_history WHERE user_id = ? AND is_current = 1').get(userId);

    if (!existing || existing.username !== name) {
        db.prepare('UPDATE username_history SET is_current = 0 WHERE user_id = ?').run(userId);
        db.prepare('INSERT INTO username_history (user_id, username, profile_url) VALUES (?, ?, ?)').run(userId, name, link);
        return true;
    }
    return false;
}

/**
 * Check if a user profile exists in the database
 * @param {string} uid - User's UID
 * @param {number} platformId - Platform ID (default: 1 for Facebook)
 * @returns {boolean} True if profile exists
 */
export function hasUserProfile(uid, platformId = PLATFORM_FACEBOOK) {
    const db = getDatabase();
    if (!db || !DATABASE_ENABLED) return false;

    try {
        const result = db.prepare(`
            SELECT 1 FROM user_profiles up
            JOIN users u ON up.user_id = u.id
            WHERE u.platform_id = ? AND u.uid = ?
            LIMIT 1
        `).get(platformId, uid);
        return !!result;
    } catch (error) {
        return false;
    }
}
