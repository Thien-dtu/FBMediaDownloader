import { FB_API_HOST, MEDIA_TYPE, S } from "./constants.js";
import {
  ACCESS_TOKEN,
  FOLDER_TO_SAVE_LINKS,
  ID_LINK_SEPERATOR,
  PHOTO_FILE_FORMAT,
  VIDEO_FILE_FORMAT,
  WAIT_BEFORE_NEXT_FETCH,
  DATABASE_ENABLED,
  PLATFORM_FACEBOOK,
  getSaveFolderPath,
} from "../config.js";
import {
  createIfNotExistDir,
  deleteFile,
  download,
  getLargestPhotoLink,
  myFetch,
  saveToFile,
  sleep,
} from "./utils.js";
import { t } from "./lang.js";
import { log } from "./logger.js";
import { getOrCreateUser } from "./database.js";
import { checkMediaSkip, attemptHDFetch, saveMediaWithTracking, logDownloadSummary } from "./download_helpers.js";
import { runBatchDownload } from "./batch_utils.js";
import { isCancelled } from "./cancellation.js";

/**
 * Extract media (photos/videos) from a Facebook post attachment
 * Handles photo, video, and album attachment types recursively
 * @param {Object} attachment - Facebook attachment object from feed API
 * @param {string} attachment.type - Attachment type (photo, video_autoplay, video_inline, video, album)
 * @param {Object} attachment.target - Target object containing media ID
 * @param {Object} attachment.media - Media object with image/video data
 * @param {Object} attachment.subattachments - Sub-attachments for album types
 * @returns {Array<{type: string, id: string, url: string}>} Array of extracted media items
 */
const getMediaFromAttachment = (attachment) => {
  const filtered_media = [];

  let id = attachment?.target?.id;
  let type = attachment?.type;

  if (!id || !type) return filtered_media;

  /*
    Attachment LOẠI PHOTO có cấu trúc như sau
    {
        "media": {
            "image": {
                "height": 720,
                "src": "https://scontent.fhan2-4.fna.fbcdn.net/v/t39.30808-6/p480x480/233193975_582887376210934_3917501890611553539_n.jpg?_nc_cat=103&ccb=1-5&_nc_sid=07e735&_nc_ohc=b2Z1BxAj3PwAX_a0j-F&_nc_ht=scontent.fhan2-4.fna&oh=1100b63609d1d331a0a17721b002ae78&oe=614A6EAD",
                "width": 480
            }
        },
        "target": {
            "id": "582887366210935",
            "url": "https://www.facebook.com/photo.php?fbid=582887366210935&set=gm.1020873538672374&type=3"
        },
        "type": "photo",
        "url": "https://www.facebook.com/photo.php?fbid=582887366210935&set=gm.1020873538672374&type=3"
    }*/
  if (type === "photo") {
    filtered_media.push({
      type: MEDIA_TYPE.PHOTO,
      id: id,
      url: attachment.media.image.src,
    });
  }

  /*
    Attachment LOẠI VIDEO_AUTOPLAY, VIDEO_INLINE, VIDEO có định dạng như sau
    {
        "media": {
            "image": {
                "height": 720,
                "src": "https://scontent.fsgn2-4.fna.fbcdn.net/v/t15.5256-10/s720x720/241870607_843209866352821_4272847571535179706_n.jpg?_nc_cat=101&ccb=1-5&_nc_sid=ad6a45&_nc_ohc=Ap2YChXA4fUAX_RgBT7&_nc_ht=scontent.fsgn2-4.fna&oh=f9fcc65d6c8a53207c1d03b19d036503&oe=614B4EE9",
                "width": 405
            },
            "source": "https://video.fsgn2-6.fna.fbcdn.net/v/t42.1790-2/241979905_562868464766358_5763545655575200708_n.mp4?_nc_cat=110&ccb=1-5&_nc_sid=985c63&efg=eyJybHIiOjM5MiwicmxhIjo1MTIsInZlbmNvZGVfdGFnIjoic3ZlX3NkIn0%3D&_nc_ohc=1vx2K2s8m1IAX8TzDPs&rl=392&vabr=218&_nc_ht=video.fsgn2-6.fna&oh=32df5af4a31f119a16ca4fb8d30b48f0&oe=61477791"
        },
        "target": {
            "id": "843209423019532",
            "url": "https://www.facebook.com/groups/j2team.community.girls/permalink/1045907852835609/"
        },
        "type": "video_autoplay",
        "url": "https://www.facebook.com/groups/j2team.community.girls/permalink/1045907852835609/"
    } */
  if (
    type === "video_autoplay" ||
    type === "video_inline" ||
    type === "video"
  ) {
    filtered_media.push({
      type: MEDIA_TYPE.VIDEO,
      id: id,
      url: attachment.media.source,
    });
  }

  /*
    Attachment LOẠI ALBUM có định dạng như sau
    {
        "media": {
            "image": {
                "height": 720,
                "src": "https://scontent.fhan2-4.fna.fbcdn.net/v/t39.30808-6/p480x480/233193975_582887376210934_3917501890611553539_n.jpg?_nc_cat=103&ccb=1-5&_nc_sid=07e735&_nc_ohc=b2Z1BxAj3PwAX_a0j-F&_nc_ht=scontent.fhan2-4.fna&oh=1100b63609d1d331a0a17721b002ae78&oe=614A6EAD",
                "width": 480
            }
        },
        "subattachments": {
            "data": [
                {sub_attachment_1}, // Các sub attachment này có cấu trúc giống attachment PHOTO hoặc VIDEO_AUTOPLAY
                {sub_attachment_2},
                ...
            ]
        },
        "target": {
            "id": "1020873538672374",
            "url": "https://www.facebook.com/media/set/?set=pcb.1020873538672374&type=1"
        },
        "title": "Photos from Lê Tài's post",
        "type": "album",
        "url": "https://www.facebook.com/media/set/?set=pcb.1020873538672374&type=1"
    } */
  if (type === "album") {
    // GỌI ĐỆ QUY VỚI TỪNG SUB_ATTACHMENT
    attachment?.subattachments?.data?.forEach((sub) => {
      filtered_media.push(...getMediaFromAttachment(sub));
    });
  }

  return filtered_media;
};

/**
 * Fetch all media from a user's wall/feed with pagination
 * Retrieves photos and videos from post attachments
 * @param {Object} params - Fetch parameters
 * @param {string} params.targetId - Facebook user/page/group ID
 * @param {number} params.pageLimit - Maximum number of pages to fetch (default: Infinity)
 * @param {Function} params.pageFetchedCallback - Callback called after each page with media array
 * @returns {Promise<Array<{type: string, id: string, url: string}>>} Array of all fetched media
 */
const fetchWallMedia = async ({
  targetId,
  pageLimit = Infinity,
  pageFetchedCallback = () => { },
}) => {
  const all_media = []; // store all media {id, url, type}
  let page = 1;
  let url = `${FB_API_HOST}/${targetId}/feed?fields=attachments{media,type,subattachments,target}&access_token=${ACCESS_TOKEN}`;

  while (url && page <= pageLimit) {
    // Check for cancellation before each page fetch
    if (isCancelled()) {
      log(S.FgYellow + `⏸️  Stopping at page ${page - 1} (cancelled)` + S.Reset);
      break;
    }

    log(t("downloadingPage").replace("{page}", page));
    const fetchData = await myFetch(url);
    page++;

    if (fetchData?.data) {
      // Get all media from each attachment
      const media = [];
      fetchData.data.forEach((feedData) => {
        feedData.attachments?.data.forEach((at) => {
          media.push(...getMediaFromAttachment(at));
        });
      });

      all_media.push(...media);
      log(
        t("foundWallMedia")
          .replace("{length}", media.length)
          .replace("{total}", all_media.length)
      );

      // callback when each page fetched
      await pageFetchedCallback(media);

      // get next paging
      url = fetchData?.paging?.next;

      // wait for next fetch - if needed
      if (WAIT_BEFORE_NEXT_FETCH) {
        log(t("pausing").replace("{ms}", WAIT_BEFORE_NEXT_FETCH));
        await sleep(WAIT_BEFORE_NEXT_FETCH);
      }
    } else {
      break;
    }
  }

  return all_media;
};

/**
 * Download and save all media links from a wall to a text file
 * Saves IDs and URLs in the links folder for later use
 * @param {Object} params - Download parameters
 * @param {string} params.targetId - Facebook user/page/group ID
 * @param {boolean} params.includeVideo - Whether to include videos (default: true)
 * @param {number} params.pageLimit - Maximum pages to fetch (default: Infinity)
 * @param {boolean} params.isGetLargestPhoto - Whether to fetch HD photo URLs (default: false)
 * @returns {Promise<void>}
 */
export const downloadWallMediaLinks = async ({
  targetId,
  includeVideo = true,
  pageLimit = Infinity,
  isGetLargestPhoto = false,
}) => {
  log(t("gettingWallInfo").replace("{id}", targetId));

  const fileName = `${FOLDER_TO_SAVE_LINKS}/${targetId}.txt`;
  deleteFile(fileName); // delete if file exist

  await fetchWallMedia({
    targetId: targetId,
    pageLimit: pageLimit,
    pageFetchedCallback: (media) => {
      if (!includeVideo)
        media = media.filter((m) => m.type !== MEDIA_TYPE.VIDEO);

      if (isGetLargestPhoto) {
        // TODO get largest photo link
      }

      saveToFile(
        fileName,
        media.map((_) => _.id + ID_LINK_SEPERATOR + _.url).join("\n"),
        false
      );
    },
  });
};

/**
 * Download all media (photos and videos) from a user's wall/feed
 * Saves files organized in photos/ and videos/ subfolders
 * Supports HD photo fetching and duplicate detection
 * @param {Object} params - Download parameters
 * @param {string} params.targetId - Facebook user/page/group ID
 * @param {boolean} params.includeVideo - Whether to download videos (default: true)
 * @param {number} params.pageLimit - Maximum pages to fetch (default: Infinity)
 * @param {boolean} params.isGetLargestPhoto - Whether to fetch HD photo versions (default: false)
 * @returns {Promise<{saved: number, skipped: number, savedPhotos: number, savedVideos: number, skippedPhotos: number, skippedVideos: number}>} Download statistics
 */
export const downloadWallMedia = async ({
  targetId,
  includeVideo = true,
  pageLimit = Infinity,
  isGetLargestPhoto = false,
}) => {
  log(t("gettingWallInfo").replace("{id}", targetId));

  // Get or create user in database
  const userId = DATABASE_ENABLED ? getOrCreateUser(PLATFORM_FACEBOOK, targetId) : null;

  let savedPhotos = 0;
  let savedVideos = 0;
  let skippedPhotos = 0;
  let skippedVideos = 0;

  await fetchWallMedia({
    targetId: targetId,
    pageLimit: pageLimit,
    pageFetchedCallback: async (media) => {
      // save all media to directory
      for (let data of media) {
        let { id: media_id, url: media_url, type: media_type } = data;

        // Determine file path for this media
        const mediaSubfolder = media_type === MEDIA_TYPE.PHOTO ? 'photos' : 'videos';
        const dir = getSaveFolderPath(targetId, mediaSubfolder);
        const file_format = media_type === MEDIA_TYPE.PHOTO ? PHOTO_FILE_FORMAT : VIDEO_FILE_FORMAT;
        const savePath = `${dir}/${media_id}.${file_format}`;

        // Smart skip: check DB status for HD upgrade capability
        const skipCheck = checkMediaSkip(userId, media_id, isGetLargestPhoto && media_type === MEDIA_TYPE.PHOTO);

        if (skipCheck.skip) {
          if (media_type === MEDIA_TYPE.PHOTO) {
            log(`⏭️  SKIPPING photo ${media_id} (${skipCheck.reason})`);
            skippedPhotos++;
          } else {
            log(`⏭️  SKIPPING video ${media_id} (${skipCheck.reason})`);
            skippedVideos++;
          }
          continue;
        }

        if (skipCheck.needsUpgrade) {
          log(`🔄 UPGRADE ${media_id} to HD (was SD)`);
        }

        // For photos, optionally fetch HD version
        let isHdDownload = false;
        if (isGetLargestPhoto && media_type == MEDIA_TYPE.PHOTO) {
          const hdResult = await attemptHDFetch(media_id, userId, skipCheck.needsUpgrade);

          if (hdResult.shouldSkip) {
            log(`⏭️  SKIPPING ${media_id} (HD fetch failed, keeping SD version)`);
            skippedPhotos++;
            continue;
          }

          if (hdResult.url) {
            media_url = hdResult.url;
            isHdDownload = true;
          }
        }

        if (!includeVideo && media_type === MEDIA_TYPE.VIDEO) {
          log(t("skipVideo").replace("{url}", media_url));
          continue;
        }

        // Create directory if needed
        createIfNotExistDir(dir);
        const saved = media_type === MEDIA_TYPE.PHOTO ? savedPhotos : savedVideos;
        // Determine HD status for this save
        const mediaIsHd = media_type === MEDIA_TYPE.VIDEO ? true : isHdDownload;

        try {
          log(
            t("saving").replace("{count}", saved).replace("{path}", savePath)
          );
          await download(media_url, savePath);

          // Mark as downloaded in database with HD status
          saveMediaWithTracking(userId, media_id, mediaIsHd, savePath, skipCheck.needsUpgrade);

          if (media_type === MEDIA_TYPE.PHOTO) {
            savedPhotos++;
          } else {
            savedVideos++;
          }
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
  logDownloadSummary({ savedPhotos, savedVideos, skippedPhotos, skippedVideos });

  return {
    saved: savedPhotos + savedVideos,
    skipped: skippedPhotos + skippedVideos,
    savedPhotos,
    savedVideos,
    skippedPhotos,
    skippedVideos
  };
};

/**
 * Batch download wall media from multiple users
 * Uses runBatchDownload for consistent progress reporting
 * @param {string[]} userIds - Array of Facebook user IDs
 * @param {Object} options - Download options (includeVideo, pageLimit, isGetLargestPhoto)
 * @returns {Promise<Array>} Array of results for each user
 */
export const downloadWallMediaBatch = async (userIds, options) => {
  return runBatchDownload(userIds, downloadWallMedia, options, {
    mediaType: 'wall media',
    showPhotoVideoSplit: true
  });
};
