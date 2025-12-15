import {
  ACCESS_TOKEN,
  VIDEO_FILE_FORMAT,
  WAIT_BEFORE_NEXT_FETCH,
  DATABASE_ENABLED,
  PLATFORM_FACEBOOK,
  getSaveFolderPath,
} from "../config.js";
import { FB_API_HOST, S } from "./constants.js";
import { t } from "./lang.js";
import { log } from "./logger.js";
import { createIfNotExistDir, download, myFetch, sleep, saveCaptionFile } from "./utils.js";
import { getOrCreateUser, getMediaStatus, saveMedia } from "./database.js";

// Extract video info from a post attachment (recursive for albums)
const getVideoFromAttachment = (attachment) => {
  const videos = [];
  const type = attachment?.type;
  const id = attachment?.target?.id;

  if (!type) return videos;

  // Handle video types
  if (type === "video_autoplay" || type === "video_inline" || type === "video") {
    if (id && attachment.media?.source) {
      videos.push({
        id: id,
        source: attachment.media.source,
        description: attachment.description || "",
        // Estimate quality from URL or default to SD
        has_hd_quality: attachment.media.source?.includes("hd") || false,
      });
    }
  }

  // Handle albums (may contain videos)
  if (type === "album" && attachment?.subattachments?.data) {
    attachment.subattachments.data.forEach((sub) => {
      videos.push(...getVideoFromAttachment(sub));
    });
  }

  return videos;
};

const fetchUserVideos = async ({
  targetId,
  pageLimit = Infinity,
  fromCursor,
  pageFetchedCallback = () => { },
}) => {
  const all_videos = [];
  let page = 1;

  // Use feed endpoint with attachments - works for any user's public posts
  // This bypasses the Permission Denied error from /{user-id}/videos endpoint
  let url = `${FB_API_HOST}/${targetId}/feed?fields=attachments{media,type,subattachments,target,description}&access_token=${ACCESS_TOKEN}`;

  if (fromCursor) {
    url += "&after=" + fromCursor;
  }

  while (url && page <= pageLimit) {
    log(t("downloadingPage").replace("{page}", page));
    const fetchData = await myFetch(url);
    page++;

    if (!fetchData?.data) break;

    // Extract videos from post attachments
    const videos = [];
    fetchData.data.forEach((post) => {
      if (post.attachments?.data) {
        post.attachments.data.forEach((attachment) => {
          videos.push(...getVideoFromAttachment(attachment));
        });
      }
    });

    if (videos.length > 0) {
      all_videos.push(...videos);
      log(
        t("foundVideos")
          .replace("{length}", videos.length)
          .replace("{total}", all_videos.length)
      );
      log(t("currentPageID"), fetchData.paging?.cursors?.before);
      log(t("nextPageID"), fetchData.paging?.cursors?.after, "\n");

      // callback when each page fetched
      await pageFetchedCallback(videos);
    } else {
      log(`> Trang ${page - 1}: Không tìm thấy video nào.`);
    }

    // get next paging
    url = fetchData?.paging?.next;

    // wait for next fetch - if needed
    if (WAIT_BEFORE_NEXT_FETCH) {
      log(t("pausing").replace("{ms}", WAIT_BEFORE_NEXT_FETCH));
      await sleep(WAIT_BEFORE_NEXT_FETCH);
    }
  }

  return all_videos;
};

export const downloadUserVideos = async ({
  targetId,
  fromCursor,
  pageLimit = Infinity,
}) => {
  log(t("downloadingUserVideo").replace("{user_id}", targetId));
  let saved = 0;
  let skipped = 0;

  // Get or create user in database
  const userId = DATABASE_ENABLED ? getOrCreateUser(PLATFORM_FACEBOOK, targetId) : null;

  await fetchUserVideos({
    targetId,
    fromCursor,
    pageLimit,
    pageFetchedCallback: async (videos) => {
      // Use unified folder structure: downloads/{userId}/videos/
      const dir = getSaveFolderPath(targetId, 'videos');
      createIfNotExistDir(dir);

      // save all videos to directory
      for (let data of videos) {
        const {
          source,
          id,
          description,
          has_hd_quality,
        } = data;

        const url = source;
        const savePath = `${dir}/${id}.${VIDEO_FILE_FORMAT}`;

        // Smart skip: check DB status only
        if (DATABASE_ENABLED && userId) {
          const mediaStatus = getMediaStatus(userId, id);

          if (mediaStatus?.exists) {
            log(`⏭️  SKIPPING ${id} (already downloaded)`);
            skipped++;
            continue;
          }
        }

        try {
          const moreInfo =
            (has_hd_quality ? "[HD]" : "[sd]") +
            (description ? ` [${description}]` : "");

          log(
            t("savingUserMedia")
              .replace("{count}", saved)
              .replace("{path}", savePath)
              .replace("{moreInfo}", moreInfo)
          );
          await download(url, savePath);

          // Save description as text file if exists
          if (description) {
            saveCaptionFile(`${dir}/${id}`, description);
          }

          // Mark as downloaded in database (videos are always considered HD)
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
  log(`\n📊 Summary: ${saved} videos saved, ${skipped} skipped (duplicates)`);

  return { saved, skipped };
};

// ========== BATCH DOWNLOAD SUPPORT ==========
export const downloadUserVideosBatch = async (userIds, options) => {
  const results = [];
  const totalUsers = userIds.length;
  const startTime = Date.now();

  console.log(`\n📦 Processing ${totalUsers} user(s)...\n`);

  for (let i = 0; i < totalUsers; i++) {
    const userId = userIds[i];
    console.log(`[${i + 1}/${totalUsers}] Downloading videos from user ${userId}...`);

    try {
      const result = await downloadUserVideos({
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
    console.log(`Total Videos Downloaded: ${totalSaved}`);
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
