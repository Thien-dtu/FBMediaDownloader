/**
 * Timeline Album Download Module
 *
 * Timeline Albums contain all photos posted to a Facebook Page.
 * These albums are hidden on Facebook's UI but accessible via Graph API.
 * @module download_timeline_album
 */

import { FB_API_HOST } from "./constants.js";
import { ACCESS_TOKEN } from "../config.js";
import {
  downloadAlbumPhoto,
  downloadAlbumPhotoLinks,
} from "./download_album.js";
import { myFetch } from "./utils.js";
import { t } from "./lang.js";
import { log } from "./logger.js";

/**
 * Fetch the Timeline Album ID for a Facebook Page
 * Searches through the page's albums to find the one with type "wall"
 * @param {string} page_id - Facebook Page ID
 * @returns {Promise<string|null>} Timeline album ID or null if not found
 */
export const fetchTimeLineAlbumId_FBPage = async (page_id) => {
  // create link to fetch all albums of page
  const url = `${FB_API_HOST}/${page_id}/albums?fields=type&limit=100&access_token=${ACCESS_TOKEN}`;

  // fetch data
  const json = await myFetch(url);
  if (!json) return null;

  // find timeline album
  const timeLineAlbum = json.data.find((_) => _.type === "wall");

  // return id (or null if not found timeline album)
  return timeLineAlbum?.id;
};

/**
 * Download all photo links from a Page's Timeline Album to a text file
 * @param {Object} params - Download parameters
 * @param {string} params.page_id - Facebook Page ID
 * @param {string|null} params.fromPhotoId - Start from this photo ID (optional)
 * @returns {Promise<void>}
 */
export const downloadTimeLineAlbumPhotoLinks_FBPage = async ({
  page_id,
  fromPhotoId,
}) => {
  const album_id = await fetchTimeLineAlbumId_FBPage(page_id);
  if (album_id) {
    log(t("foundTimelineAlbumID"), album_id);
    await downloadAlbumPhotoLinks({ albumId: album_id, fromPhotoId });
  } else {
    console.error(t("pageDontHaveTimelineAlbum"));
  }
};

/**
 * Download all photos from a Page's Timeline Album to disk
 * @param {Object} params - Download parameters
 * @param {string} params.page_id - Facebook Page ID
 * @param {string|null} params.fromPhotoId - Start from this photo ID (optional)
 * @returns {Promise<void>}
 */
export const downloadTimeLineAlbum_FBPage = async ({
  page_id,
  fromPhotoId,
}) => {
  const album_id = await fetchTimeLineAlbumId_FBPage(page_id);
  if (album_id) {
    log(t("foundTimelineAlbumID"), album_id);
    await downloadAlbumPhoto({ albumId: album_id, fromPhotoId });
  } else {
    console.error(t("pageDontHaveTimelineAlbum"));
  }
};
