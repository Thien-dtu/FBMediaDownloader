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
import { getOrCreateUser, saveMedia } from "./database.js";
import { checkMediaSkip, logDownloadSummary } from "./download_helpers.js";
import { runBatchDownload } from "./batch_utils.js";
import { isCancelled } from "./cancellation.js";

/**
 * Extract video information from a post attachment
 * Handles video types and recursively processes album sub-attachments
 * @param {Object} attachment - Facebook post attachment object
 * @param {string} attachment.type - Attachment type (video_autoplay, video_inline, video, album)
 * @param {Object} attachment.target - Target object containing video ID
 * @param {Object} attachment.media - Media object containing video source URL
 * @param {Object} attachment.subattachments - Sub-attachments for albums
 * @returns {Array<{id: string, source: string, description: string, has_hd_quality: boolean}>} Array of video data
 */
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

/**
 * Fetch user's videos from their feed with pagination support
 * Uses feed endpoint with attachments to bypass permission restrictions
 * @param {Object} params - Fetch parameters
 * @param {string} params.targetId - Facebook user ID
 * @param {number} params.pageLimit - Maximum number of pages to fetch (default: Infinity)
 * @param {string|null} params.fromCursor - Pagination cursor to start from
 * @param {Function} params.pageFetchedCallback - Callback called after each page is fetched
 * @returns {Promise<Array>} Array of all fetched videos with metadata
 */
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
    // Check for cancellation before each page fetch
    if (isCancelled()) {
      log(S.FgYellow + `⏸️  Stopping at page ${page - 1} (cancelled)` + S.Reset);
      break;
    }

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

/**
 * Download all videos from a user's feed
 * Saves videos in the user's videos folder with descriptions
 * @param {Object} params - Download parameters
 * @param {string} params.targetId - Facebook user ID
 * @param {string|null} params.fromCursor - Pagination cursor to resume from
 * @param {number} params.pageLimit - Maximum number of pages to fetch (default: Infinity)
 * @returns {Promise<{saved: number, skipped: number}>} Download statistics
 */
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
        const skipCheck = checkMediaSkip(userId, id, false);
        if (skipCheck.skip) {
          log(`⏭️  SKIPPING ${id} (${skipCheck.reason})`);
          skipped++;
          continue;
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
  logDownloadSummary({ saved, skipped, mediaType: 'videos' });

  return { saved, skipped };
};

/**
 * Batch download videos from multiple users
 * Uses runBatchDownload for consistent progress reporting
 * @param {string[]} userIds - Array of Facebook user IDs
 * @param {Object} options - Download options (fromCursor, pageLimit)
 * @returns {Promise<Array>} Array of results for each user
 */
export const downloadUserVideosBatch = async (userIds, options) => {
  return runBatchDownload(userIds, downloadUserVideos, options, {
    mediaType: 'videos'
  });
};
