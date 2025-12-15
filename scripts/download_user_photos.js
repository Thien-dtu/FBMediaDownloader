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
import { getOrCreateUser, getMediaStatus, saveMedia } from "./database.js";

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
        if (DATABASE_ENABLED && userId) {
          const mediaStatus = getMediaStatus(userId, id);

          if (mediaStatus?.exists) {
            log(`⏭️  SKIPPING ${id} (already downloaded${mediaStatus.isHd ? ', HD' : ''})`);
            skipped++;
            continue;
          }
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
  log(`\n📊 Summary: ${saved} photos saved, ${skipped} skipped (duplicates)`);

  return { saved, skipped };
};

// ========== BATCH DOWNLOAD SUPPORT ==========
export const downloadUserPhotosBatch = async (userIds, options) => {
  const results = [];
  const totalUsers = userIds.length;
  const startTime = Date.now();

  console.log(`\n📦 Processing ${totalUsers} user(s)...\n`);

  for (let i = 0; i < totalUsers; i++) {
    const userId = userIds[i];
    console.log(`[${i + 1}/${totalUsers}] Downloading photos from user ${userId}...`);

    try {
      const result = await downloadUserPhotos({
        targetId: userId,
        ...options
      });

      results.push({
        userId,
        success: true,
        ...result
      });

      console.log(`✅ User ${userId}: ${result.saved} saved, ${result.skipped} skipped`);

    } catch (error) {
      results.push({
        userId,
        success: false,
        error: error.message
      });

      console.log(`❌ User ${userId}: ${error.message}`);
    }

    // Small delay between users to avoid rate limiting
    if (i < totalUsers - 1) {
      await sleep(1000);
    }
  }

  // Print summary
  printBatchSummary(results, startTime);

  return results;
};

const printBatchSummary = (results, startTime) => {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(50));
  console.log('BATCH SUMMARY'.padStart(32));
  console.log('='.repeat(50));
  console.log(`Total Users: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    const totalSaved = successful.reduce((sum, r) => sum + (r.saved || 0), 0);
    const totalSkipped = successful.reduce((sum, r) => sum + (r.skipped || 0), 0);
    console.log(`Total Photos Downloaded: ${totalSaved}`);
    console.log(`Total Skipped (duplicates): ${totalSkipped}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed Users:');
    failed.forEach(r => {
      console.log(`  - ${r.userId}: ${r.error}`);
    });
  }

  console.log(`Time Elapsed: ${duration}s`);
  console.log('='.repeat(50) + '\n');
};
