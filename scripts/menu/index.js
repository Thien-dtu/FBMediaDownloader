/**
 * Menu Module - Main Entry Point
 *
 * Provides the main menu loop and re-exports menu utilities.
 * @module menu
 */

import { choose, closeReadline, waitForKeyPressed } from "./core.js";
import { t } from "../lang.js";
import { initDatabase } from "../database.js";

// Import menu handlers
import { menuDownloadAlbum, showAlbumInfo } from "./album.js";
import { menuDownloadWallMedia } from "./wall.js";
import { menuDownloadPhotoVideoOfUser } from "./user.js";
import {
    menuDownloadFromFile,
    menuSelectLanguage,
    menuFindTimelineAlbum,
    menuPrintAllUIDs,
    menuScanUIDs,
    menuProxyHealthCheck,
    menuShowHelp,
    menuFetchUserProfiles
} from "./admin.js";

// Re-export core utilities
export { prompt, choose, waitForKeyPressed, closeReadline } from "./core.js";

/**
 * Main application menu loop
 * Displays all available options and handles user navigation
 * Initializes database and manages all download/utility features
 * @returns {Promise<void>}
 */
export const menu = async () => {
    // Initialize database for UID listing
    initDatabase();

    while (true) {
        const action = await choose("FB Media Downloader Tool", {
            1: t("albumInfo"),
            2: t("findTimelinkAlbum"),
            3: t("downloadAlbum"),
            4: t("downloadWall"),
            5: t("downloadUser"),
            6: t("downloadFromUrlFile"),
            7: t("language"),
            8: t("help"),
            9: "Print all UIDs",
            10: "Scan UIDs for usernames",
            11: "Proxy Health Check",
            12: t("fetchUserProfiles"),
            13: t("exit"),
        });

        if (action.key == 1) {
            await showAlbumInfo();
        }
        if (action.key == 2) {
            await menuFindTimelineAlbum();
        }
        if (action.key == 3) {
            await menuDownloadAlbum();
        }
        if (action.key == 4) {
            await menuDownloadWallMedia();
        }
        if (action.key == 5) {
            await menuDownloadPhotoVideoOfUser();
        }
        if (action.key == 6) {
            await menuDownloadFromFile();
        }
        if (action.key == 7) {
            await menuSelectLanguage();
        }
        if (action.key == 8) {
            await menuShowHelp();
        }
        if (action.key == 9) {
            await menuPrintAllUIDs();
        }
        if (action.key == 10) {
            await menuScanUIDs();
        }
        if (action.key == 11) {
            await menuProxyHealthCheck();
        }
        if (action.key == 12) {
            await menuFetchUserProfiles();
        }
        if (action.key == 13) break;
    }

    closeReadline();
};
