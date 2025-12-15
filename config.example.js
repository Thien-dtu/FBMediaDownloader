// Copy this file to config.js and fill in your values
// DO NOT commit config.js to version control!

// ========== ACCESS TOKEN ==========
// Get your Facebook access token from: https://developers.facebook.com/tools/explorer/
export const ACCESS_TOKEN = "YOUR_FACEBOOK_ACCESS_TOKEN_HERE";
export const WAIT_BEFORE_NEXT_FETCH = 500; // wait time (ms) before each fetch
export const WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO = 500; // wait time (ms) before fetching high-res photo (lower = higher ban risk)
export const ID_LINK_SEPERATOR = ";";
export const FOLDER_TO_SAVE_LINKS = "./links";  // Folder to save txt files with links

// ========== DATABASE CONFIGURATION ==========
export const DATABASE_ENABLED = true;
export const DATABASE_PATH = './downloader.db';

// ========== PLATFORM IDS ==========
export const PLATFORM_FACEBOOK = 1;
export const PLATFORM_INSTAGRAM = 2;

// ========== UNIFIED FOLDER STRUCTURE ==========
// All downloads now go to: downloads/{userId}/photos/ or downloads/{userId}/videos/
export const DOWNLOADS_FOLDER = './downloads';

/**
 * Get save folder path for a user's media
 * @param {string} userId - User ID
 * @param {string} mediaType - 'photos' or 'videos'
 * @returns {string} Folder path
 */
export function getSaveFolderPath(userId, mediaType) {
    return `${DOWNLOADS_FOLDER}/${userId}/${mediaType}`;
}

export const PHOTO_FILE_FORMAT = "png"; // OR jpg
export const VIDEO_FILE_FORMAT = "mp4"; // OR wav ?
