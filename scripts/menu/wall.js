/**
 * Wall Media Download Menu Module
 *
 * Handles the wall/feed media download submenu.
 * @module menu/wall
 */

import { prompt, choose } from "./core.js";
import { t } from "../lang.js";
import { log } from "../logger.js";
import { parseUserIds } from "../utils.js";
import {
    downloadWallMedia,
    downloadWallMediaLinks,
    downloadWallMediaBatch,
} from "../download_wall_media.js";
import { ensureUserProfileForUIDs } from "../user_profile.js";
import { runCancellable } from "../cancellation.js";

/**
 * Menu handler for downloading wall/feed media
 * Downloads photos and optionally videos from user's wall posts
 * Supports batch downloads for multiple user IDs
 * @returns {Promise<void>}
 */
export const menuDownloadWallMedia = async () => {
    while (true) {
        const action = await choose(t("downloadWallTitle"), {
            0: t("back"),
            1: t("downloadAllMediaInWall"),
            2: t("donwloadAllMediaLinkWall"),
        });

        if (action.key == 0) break;
        if (action.key == 1 || action.key == 2) {
            // Accept comma-separated IDs
            const target_ids_input = await prompt(t("enterTargetID") + " (comma-separated)");
            if (target_ids_input != -1) {
                const target_ids = parseUserIds(target_ids_input);

                if (target_ids.length === 0) {
                    log("No valid IDs entered.");
                    continue;
                }

                const page_limit = await prompt(t("howManyPageWall"));
                if (page_limit >= 0) {
                    const include_video = await prompt(t("downloadVideoWall"));
                    const largest_photo = await prompt(t("downloadHDWall"));
                    const is_largest_photo = largest_photo == "0" ? false : true;

                    if (action.key == 2 && is_largest_photo) {
                        log(t("saveHDLinkNotSupported"));
                    }

                    const options = {
                        includeVideo: include_video == 1 ? true : false,
                        pageLimit: page_limit == 0 ? Infinity : page_limit,
                        isGetLargestPhoto: is_largest_photo,
                    };

                    // Wrap download in cancellable operation
                    await runCancellable(async () => {
                        // Fetch user profiles before starting download
                        await ensureUserProfileForUIDs(target_ids);

                        if (action.key == 1) {
                            // Download media (not links)
                            if (target_ids.length > 1) {
                                // Batch mode
                                await downloadWallMediaBatch(target_ids, options);
                            } else {
                                // Single user
                                await downloadWallMedia({
                                    targetId: target_ids[0],
                                    ...options
                                });
                            }
                        } else {
                            // Download links - batch not needed for links
                            await downloadWallMediaLinks({
                                targetId: target_ids[0], // Only use first ID for links
                                ...options
                            });
                        }
                    });
                }
            }
        }
    }
};
