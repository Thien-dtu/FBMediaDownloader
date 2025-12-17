/**
 * User Media Download Menu Module
 *
 * Handles the user photos/videos download submenu.
 * @module menu/user
 */

import { prompt, choose } from "./core.js";
import { t } from "../lang.js";
import { log } from "../logger.js";
import { parseUserIds } from "../utils.js";
import { downloadUserPhotos, downloadUserPhotosBatch } from "../download_user_photos.js";
import { downloadUserVideos, downloadUserVideosBatch } from "../download_user_videos.js";
import { ensureUserProfileForUIDs } from "../user_profile.js";
import { runCancellable } from "../cancellation.js";

/**
 * Menu handler for downloading user's uploaded photos and videos
 * Fetches from user's photo albums and video posts
 * Supports batch downloads for multiple user IDs
 * @returns {Promise<void>}
 */
export const menuDownloadPhotoVideoOfUser = async () => {
    while (true) {
        const action = await choose(t("downloadUserTitle"), {
            0: t("back"),
            1: t("downloadUserImagePost"),
            2: t("downloadUserVideoPost"),
        });

        if (action.key == 0) break;
        if (action.key == 1 || action.key == 2) {
            // Accept comma-separated IDs
            const target_ids_input = await prompt(t("enterUserID") + " (comma-separated)");
            if (target_ids_input != -1) {
                const target_ids = parseUserIds(target_ids_input);

                if (target_ids.length === 0) {
                    log("No valid user IDs entered.");
                    continue;
                }

                const from_cursor = await prompt(t("startPageUser"));
                const page_limit = await prompt(t("howManyPageUser"));

                if (page_limit >= 0) {
                    const options = {
                        fromCursor: from_cursor == 0 ? null : from_cursor,
                        pageLimit: page_limit == 0 ? Infinity : page_limit,
                    };

                    // Wrap download in cancellable operation
                    await runCancellable(async () => {
                        // Fetch user profiles before starting download
                        await ensureUserProfileForUIDs(target_ids);

                        // Use batch download for multiple users
                        if (target_ids.length > 1) {
                            if (action.key == 1) {
                                await downloadUserPhotosBatch(target_ids, options);
                            } else {
                                await downloadUserVideosBatch(target_ids, options);
                            }
                        } else {
                            // Single user - original function
                            if (action.key == 1) {
                                await downloadUserPhotos({ targetId: target_ids[0], ...options });
                            } else {
                                await downloadUserVideos({ targetId: target_ids[0], ...options });
                            }
                        }
                    });
                }
            }
        }
    }
};
