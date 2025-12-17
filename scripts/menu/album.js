/**
 * Album Download Menu Module
 *
 * Handles the album download submenu and related functionality.
 * @module menu/album
 */

import { prompt, choose, waitForKeyPressed } from "./core.js";
import { t } from "../lang.js";
import { log } from "../logger.js";
import {
    downloadAlbumPhoto,
    downloadAlbumPhotoLinks,
    fetchAlbumInfo,
} from "../download_album.js";
import { runCancellable } from "../cancellation.js";

/**
 * Menu handler for downloading photos from Facebook albums
 * Supports downloading all images or saving image links to file
 * @returns {Promise<void>}
 */
export const menuDownloadAlbum = async () => {
    while (true) {
        const action = await choose(t("downAlbumTitle"), {
            0: t("back"),
            1: t("downloadAllImageInAlbum"),
            2: t("downloadAllLinkInAlbum"),
        });

        if (action.key == 0) break;
        if (action.key == 1 || action.key == 2) {
            const album_id = await prompt(t("enterAlbumID"));
            if (album_id != -1) {
                const from_photo_id_text = await prompt(t("enterStartPhotoID"));
                const largest_photo = await prompt(t("downloadHD"));
                const from_photo_id =
                    from_photo_id_text == "0" ? null : from_photo_id_text;
                const is_largest_photo = largest_photo == "0" ? false : true;

                if (action.key == 2 && is_largest_photo) {
                    log(t("saveHDLinkNotSupported"));
                }

                // Wrap download in cancellable operation
                await runCancellable(async () => {
                    if (action.key == 1) {
                        await downloadAlbumPhoto({
                            albumId: album_id,
                            fromPhotoId: from_photo_id,
                            isGetLargestPhoto: is_largest_photo,
                        });
                    } else {
                        await downloadAlbumPhotoLinks({
                            albumId: album_id,
                            fromPhotoId: from_photo_id,
                            isGetLargestPhoto: is_largest_photo,
                        });
                    }
                });
            }
        }
    }
};

/**
 * Show album information for a given album ID
 * @returns {Promise<void>}
 */
export const showAlbumInfo = async () => {
    const album_id = await prompt(t("enterAlbumID"));
    if (album_id != -1) {
        log(await fetchAlbumInfo(album_id));
        await waitForKeyPressed();
    }
};
