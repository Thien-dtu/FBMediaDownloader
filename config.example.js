// Configuration management using dotenv
// Copy .env.example to .env and fill in your values
// DO NOT commit .env to version control!

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ========== ACCESS TOKEN ==========
// Get your Facebook access token from: https://developers.facebook.com/tools/explorer/
export const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || "";

// ========== TIMING CONFIGURATION ==========
export const WAIT_BEFORE_NEXT_FETCH = parseInt(process.env.WAIT_BEFORE_NEXT_FETCH) || 500;
export const WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO = parseInt(process.env.WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO) || 500;

// ========== MISC ==========
export const ID_LINK_SEPERATOR = ";";
export const FOLDER_TO_SAVE_LINKS = "./links";  // Folder to save txt files with links

// ========== DATABASE CONFIGURATION ==========
export const DATABASE_ENABLED = process.env.DATABASE_ENABLED !== 'false';
export const DATABASE_PATH = process.env.DATABASE_PATH || './downloader.db';

// ========== PLATFORM IDS ==========
export const PLATFORM_FACEBOOK = 1;
export const PLATFORM_INSTAGRAM = 2;

// ========== UNIFIED FOLDER STRUCTURE ==========
// All downloads now go to: downloads/{userId}/photos/ or downloads/{userId}/videos/
export const DOWNLOADS_FOLDER = process.env.DOWNLOADS_FOLDER || './downloads';

/**
 * Get save folder path for a user's media
 * @param {string} userId - User ID
 * @param {string} mediaType - 'photos' or 'videos'
 * @returns {string} Folder path
 */
export function getSaveFolderPath(userId, mediaType) {
    return `${DOWNLOADS_FOLDER}/${userId}/${mediaType}`;
}

// ========== FILE FORMATS ==========
export const PHOTO_FILE_FORMAT = process.env.PHOTO_FILE_FORMAT || "png";
export const VIDEO_FILE_FORMAT = process.env.VIDEO_FILE_FORMAT || "mp4";
