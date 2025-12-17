/**
 * Database Module - Main Entry Point
 *
 * Re-exports all database functions for backward compatibility.
 * Import from this file to use the database module.
 * @module database
 */

// Connection management
export {
    initDatabase,
    closeDatabase,
    getDatabase,
    isDatabaseReady
} from './connection.js';

// User operations
export {
    getOrCreateUser,
    getUserIdByUID,
    hasUsername,
    saveUsername,
    getAllUIDs
} from './users.js';

// Media operations
export {
    isMediaDownloaded,
    saveMedia,
    getMediaStatus,
    updateMediaToHD,
    getMediaNeedingHDUpgrade,
    getSavedMediaIds,
    getCursor,
    updateCursor
} from './media.js';

// Reporting operations
export {
    createReport,
    addReportDetail,
    getDownloadStats
} from './reports.js';
