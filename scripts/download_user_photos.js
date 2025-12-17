import {
  ACCESS_TOKEN,
  PHOTO_FILE_FORMAT,
  WAIT_BEFORE_NEXT_FETCH,
  DATABASE_ENABLED,
  PLATFORM_FACEBOOK,
  getSaveFolderPath,
} from "../config.js";
import { FB_API_HOST, S } from "./constants.js";
import { t } from "./lang.js";
import { log } from "./logger.js";
import { createIfNotExistDir, download, myFetch, sleep, sanitizeFolderName, saveCaptionFile } from "./utils.js";
import { getOrCreateUser, saveMedia } from "./database.js";
import { checkMediaSkip, logDownloadSummary } from "./download_helpers.js";
import { runBatchDownload } from "./batch_utils.js";
import { isCancelled, throwIfCancelled } from "./cancellation.js";

const fetchUserPhotos = async ({
  targetId,
  pageLimit = Infinity,
  fromCursor,
  pageFetchedCallback = () => { },
}) => {
  const all_photos = [];
  let page = 1;
  let url = `${FB_API_HOST}/${targetId}/photos?type=uploaded&fields=largest_image,name,album&access_token=${ACCESS_TOKEN}`;

  if (fromCursor) {
    url += "&after=" + fromCursor;
  }

  while (url && page <= pageLimit) {
    // Check for cancellation before each page fetch
    if (isCancelled()) {
      log(S.FgYellow + `⏸️  Stopping at page ${page - 1} (cancelled)` + S.Reset);
      break;
    }

    log(t("downloadingPage").replace("{page}", page));
    const fetchData = await myFetch(url);
    page++;

    if (!fetchData?.data) break;

    const photos = fetchData.data;
    all_photos.push(...photos);
    log(`> TÌM THẤY ${photos.length} ảnh. (TỔNG: ${all_photos.length})`);
    log(t("currentPageID"), fetchData.paging?.cursors?.before);
    log(t("nextPageID"), fetchData.paging?.cursors?.after, "\n");

    // callback when each page fetched
    await pageFetchedCallback(photos);

    // get next paging
    url = fetchData?.paging?.next;

    // wait for next fetch - if needed
    if (WAIT_BEFORE_NEXT_FETCH) {
      log(t("pausing").replace("{ms}", WAIT_BEFORE_NEXT_FETCH));
      await sleep(WAIT_BEFORE_NEXT_FETCH);
    }
  }

  return all_photos;
};

export const downloadUserPhotos = async ({
  targetId,
  fromCursor,
  pageLimit = Infinity,
}) => {
  log(t("downloadingUserImage").replace("{user_id}", targetId));
  let saved = 0;
  let skipped = 0;

  // Get or create user in database
  const userId = DATABASE_ENABLED ? getOrCreateUser(PLATFORM_FACEBOOK, targetId) : null;

  await fetchUserPhotos({
    targetId,
    fromCursor,
    pageLimit,
    pageFetchedCallback: async (photos) => {
      // save all photos to directory
      for (let data of photos) {
        const { largest_image, name, album, id } = data;

        // Organize by album: downloads/{userId}/photos/{albumName}/
        const albumName = album?.name ? sanitizeFolderName(album.name) : '(no album)';
        const baseDir = getSaveFolderPath(targetId, 'photos');
        const albumDir = `${baseDir}/${albumName}`;
        const savePath = `${albumDir}/${id}.${PHOTO_FILE_FORMAT}`;

        // Smart skip: check DB status only
        const skipCheck = checkMediaSkip(userId, id, false);
        if (skipCheck.skip) {
          log(`⏭️  SKIPPING ${id} (${skipCheck.reason})`);
          skipped++;
          continue;
        }

        createIfNotExistDir(albumDir);

        try {
          const moreInfo = `[${album?.name || 'No album'}] [${name || ""}]`;

          log(
            t("savingUserMedia")
              .replace("{count}", saved)
              .replace("{path}", savePath)
              .replace("{moreInfo}", moreInfo)
          );
          await download(largest_image.source, savePath);

          // Save caption as text file if exists
          if (name) {
            saveCaptionFile(`${albumDir}/${id}`, name);
          }

          // Mark as downloaded in database (photos from user_photos endpoint include largest_image, so HD)
          if (DATABASE_ENABLED && userId) {
            saveMedia(userId, id, true, savePath);
          }

          saved++;
        } catch (e) {
          log(
            S.BgRed + t("errorWhenSave").replace("{path}", savePath) + S.Reset,
            e.toString()
          );
        }
      }
    },
  });

  // Log summary
  logDownloadSummary({ saved, skipped, mediaType: 'photos' });

  return { saved, skipped };
};

// ========== BATCH DOWNLOAD SUPPORT ==========
export const downloadUserPhotosBatch = async (userIds, options) => {
  return runBatchDownload(userIds, downloadUserPhotos, options, {
    mediaType: 'photos'
  });
};
