import { DATABASE_ENABLED, WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO } from "../config.js";
import { getMediaStatus, saveMedia, updateMediaToHD } from "./database.js";
import { getLargestPhotoLink, sleep } from "./utils.js";
import { t } from "./lang.js";
import { log } from "./logger.js";

/**
 * Check if media should be skipped based on database status
 * @param {number|null} userId - Database user ID
 * @param {string} mediaId - Media ID
 * @param {boolean} isGetLargestPhoto - Whether HD mode is enabled
 * @returns {object} { skip: boolean, reason: string, needsUpgrade: boolean, mediaStatus: object|null }
 */
export const checkMediaSkip = (userId, mediaId, isGetLargestPhoto = false) => {
    if (!DATABASE_ENABLED || !userId) {
        return { skip: false, reason: null, needsUpgrade: false, mediaStatus: null };
    }

    const mediaStatus = getMediaStatus(userId, mediaId);

    if (!mediaStatus?.exists) {
        return { skip: false, reason: null, needsUpgrade: false, mediaStatus };
    }

    // Check if we need HD upgrade
    if (isGetLargestPhoto && !mediaStatus.isHd) {
        return {
            skip: false,
            reason: null,
            needsUpgrade: true,
            mediaStatus
        };
    }

    // Already downloaded (and HD if requested)
    return {
        skip: true,
        reason: `already downloaded${mediaStatus.isHd ? ', HD' : ''}`,
        needsUpgrade: false,
        mediaStatus
    };
};

/**
 * Attempt to get HD version of a photo
 * @param {string} mediaId - Photo ID
 * @param {number|null} userId - Database user ID
 * @param {boolean} isUpgradeAttempt - Whether this is upgrading an existing SD photo
 * @returns {Promise<object>} { url: string|null, isHd: boolean, shouldSkip: boolean }
 */
export const attemptHDFetch = async (mediaId, userId, isUpgradeAttempt = false) => {
    await sleep(WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO);
    log(t("fetchingHDPhoto").replace("{media_id}", mediaId).replace("media_id", mediaId));

    const hdUrl = await getLargestPhotoLink(mediaId);

    if (hdUrl) {
        return { url: hdUrl, isHd: true, shouldSkip: false };
    }

    // HD fetch failed
    if (isUpgradeAttempt) {
        // We already have SD version, skip re-download
        return { url: null, isHd: false, shouldSkip: true };
    }

    // No HD available, but we can still download SD
    return { url: null, isHd: false, shouldSkip: false };
};

/**
 * Save media to database with proper HD tracking
 * @param {number|null} userId - Database user ID
 * @param {string} mediaId - Media ID
 * @param {boolean} isHd - Whether media was downloaded in HD
 * @param {string} savePath - Path where file is saved
 * @param {boolean} wasUpgrade - Whether this was an upgrade from SD to HD
 */
export const saveMediaWithTracking = (userId, mediaId, isHd, savePath, wasUpgrade = false) => {
    if (!DATABASE_ENABLED || !userId) return;

    const existingStatus = getMediaStatus(userId, mediaId);

    if (existingStatus?.exists) {
        // Only update to HD if HD fetch actually succeeded
        if (isHd) {
            updateMediaToHD(userId, mediaId, savePath);
        }
        // If HD fetch failed, leave the record as-is (still SD)
    } else {
        // New media
        saveMedia(userId, mediaId, isHd, savePath);
    }
};

/**
 * Log download summary in consistent format
 * @param {object} stats - Download statistics
 * @param {number} stats.savedPhotos - Number of photos saved
 * @param {number} stats.savedVideos - Number of videos saved  
 * @param {number} stats.skippedPhotos - Number of photos skipped
 * @param {number} stats.skippedVideos - Number of videos skipped
 * @param {number} stats.saved - Total items saved (for single media type)
 * @param {number} stats.skipped - Total items skipped (for single media type)
 * @param {string} stats.mediaType - Type of media: 'photos', 'videos', or 'media'
 */
export const logDownloadSummary = (stats) => {
    const {
        savedPhotos,
        savedVideos,
        skippedPhotos,
        skippedVideos,
        saved,
        skipped,
        mediaType = 'media'
    } = stats;

    if (savedPhotos !== undefined && savedVideos !== undefined) {
        // Mixed media (wall)
        log(`\n📊 Summary: ${savedPhotos} photos, ${savedVideos} videos saved | ${skippedPhotos || 0} photos, ${skippedVideos || 0} videos skipped (duplicates)`);
    } else {
        // Single media type
        log(`\n📊 Summary: ${saved} ${mediaType} saved, ${skipped} skipped (duplicates)`);
    }
};
