import { FB_API_HOST, S } from "./constants.js";
import {
  ACCESS_TOKEN,
  WAIT_BEFORE_NEXT_FETCH,
  ID_LINK_SEPERATOR,
  FOLDER_TO_SAVE_LINKS,
  PHOTO_FILE_FORMAT,
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
import { isCancelled } from "./cancellation.js";

// Hàm này fetch và trả về 2 thứ:
// 1. Toàn bộ link ảnh (max 100) từ 1 vị trí (cursor) nhất định trong album ảnh. Định dạng: [[{id: .., url: ...}, ...]
// 2. Vị trí của ảnh tiếp theo (next cursor) (nếu có)
const fetchAlbumPhotosFromCursor = async ({ albumId, cursor }) => {
  // create link to fetch
  let url = `${FB_API_HOST}/${albumId}/photos?fields=largest_image&limit=100&access_token=${ACCESS_TOKEN}`;
  if (cursor) url += `&after=${cursor}`;

  const json = await myFetch(url);
  if (!json) return null;

  // return imgData + next cursor
  return {
    imgData: json.data?.map((_) => ({ id: _.id, url: _.largest_image.source })),
    nextCursor: json.paging?.cursors?.after || null,
  };
};

// Hàm này fetch về toàn bộ ảnh từ 1 album. Sử dụng hàm fetchAlbumPhotosFromCursor
// Liên tục fetch ảnh và lấy nextCursor, rồi lại fetch ảnh tiếp ở cursor mới. Liên tục cho tới khi không còn nextCursor
// Dữ liệu trả về là 1 mảng chứa dữ liệu {id, url} của từng ảnh. Có dạng [{id: .., url: ...}, {id: .., url: ...}, ...]
const fetchAlbumPhotos = async ({
  albumId,
  pageLimit = Infinity,
  fromPhotoId = null, // tải từ vị trí ảnh nào đó thay vì tải từ đầu
  pageFetchedCallback = async () => { },
}) => {
  let currentPage = 1;
  let hasNextCursor = true;
  let nextCursor = fromPhotoId
    ? Buffer.from(fromPhotoId).toString("base64")
    : null;
  let allImgsData = [];

  while (hasNextCursor && currentPage <= pageLimit) {
    // Check for cancellation before each page fetch
    if (isCancelled()) {
      log(S.FgYellow + `⏸️  Stopping at page ${currentPage - 1} (cancelled)` + S.Reset);
      break;
    }

    log(t("downloadingAlbum").replace("{page}", currentPage));

    const data = await fetchAlbumPhotosFromCursor({
      albumId,
      cursor: nextCursor,
    });

    if (data?.imgData) {
      // concat data to result array
      allImgsData.push(...data.imgData);

      log(
        S.BgGreen +
        t("foundAlbumMedia")
          .replace("{length}", data.imgData.length)
          .replace("{total}", allImgsData.length) +
        S.Reset
      );

      // callback when each page fetched
      await pageFetchedCallback(data.imgData);

      // get next cursor AND increase pageNum
      nextCursor = data.nextCursor;
      hasNextCursor = nextCursor != null;
      currentPage++;

      // wait for next fetch - if needed
      if (WAIT_BEFORE_NEXT_FETCH) {
        log(t("pausing").replace("{ms}", WAIT_BEFORE_NEXT_FETCH));
        await sleep(WAIT_BEFORE_NEXT_FETCH);
      }
    } else {
      // FAILED => re-fetch currentPage
      log(S.BgRed + "[!] ERROR." + S.Reset);
      break;
    }
  }

  return allImgsData;
};

// Fetch album info including owner's user ID
export const fetchAlbumInfo = async (albumId) => {
  // create link to fetch - now includes 'from' field to get owner info
  let url = `${FB_API_HOST}/${albumId}?fields=id,from,name,type,count,link&access_token=${ACCESS_TOKEN}`;

  // fetch data
  const json = await myFetch(url);

  // return album infomation
  if (!json) return null;
  return {
    id: albumId,
    count: json.count,
    link: json.link,
    name: json.name,
    ownerId: json.from?.id || null, // Owner's user ID for unified storage
  };
};

// Tải và lưu tất cả id hình ảnh + link hình ảnh từ album, lưu vào file có tên trùng với albumId, lưu trong folder links
export const downloadAlbumPhotoLinks = async ({
  albumId,
  fromPhotoId,
  isGetLargestPhoto = false,
}) => {
  const from_text = fromPhotoId
    ? t("fromPhotoID") + fromPhotoId
    : t("fromBeginAlbum");
  log(t("downloadAlbumFrom").replace("{albumId}", albumId) + `${from_text}...`);

  const fileName = `${FOLDER_TO_SAVE_LINKS}/${albumId}.txt`;
  deleteFile(fileName); // delete if file exist

  await fetchAlbumPhotos({
    albumId,
    fromPhotoId,
    pageFetchedCallback: (pageImgsData) => {
      log(`Đang lưu link vào file ${fileName}`);

      if (isGetLargestPhoto) {
        // TODO  gett largest photo link
      }

      saveToFile(
        fileName,
        pageImgsData.map((_) => _.id + ID_LINK_SEPERATOR + _.url).join("\n"),
        false
      );
    },
  });
};

// Tải và lưu tất cả HÌNH ẢNH từ album, lưu từng file ảnh bằng id của ảnh và lưu hết vào folder downloads/{ownerId}/photos/
export const downloadAlbumPhoto = async ({
  albumId,
  fromPhotoId,
  isGetLargestPhoto = false,
}) => {
  const from_text = fromPhotoId
    ? t("fromPhotoID") + fromPhotoId
    : t("fromBeginAlbum");
  log(t("downloadAlbumFrom").replace("{albumId}", albumId) + `${from_text}...`);

  // Get album info to find owner ID
  const albumInfo = await fetchAlbumInfo(albumId);
  const ownerId = albumInfo?.ownerId;

  if (!ownerId) {
    log(S.BgRed + "Could not determine album owner. Using albumId for folder." + S.Reset);
  }

  const targetId = ownerId || albumId; // Use owner ID if available, fallback to album ID

  // Get or create user in database
  const userId = DATABASE_ENABLED && ownerId ? getOrCreateUser(PLATFORM_FACEBOOK, ownerId) : null;

  let saved = 0;
  let skipped = 0;

  await fetchAlbumPhotos({
    albumId,
    fromPhotoId,
    pageFetchedCallback: async (pageImgsData) => {
      // Use unified folder structure: downloads/{ownerId}/photos/
      const dir = getSaveFolderPath(targetId, 'photos');
      createIfNotExistDir(dir);

      // save all photo to directory
      for (let data of pageImgsData) {
        let { id: photo_id, url: photo_url } = data;

        const savePath = `${dir}/${photo_id}.${PHOTO_FILE_FORMAT}`;

        // Smart skip: check DB status for HD upgrade
        const skipCheck = checkMediaSkip(userId, photo_id, isGetLargestPhoto);

        if (skipCheck.skip) {
          log(`⏭️  SKIPPING ${photo_id} (${skipCheck.reason})`);
          skipped++;
          continue;
        }

        if (skipCheck.needsUpgrade) {
          log(`🔄 UPGRADE ${photo_id} to HD (was SD)`);
        }

        let isHdDownload = false;
        if (isGetLargestPhoto) {
          const hdResult = await attemptHDFetch(photo_id, userId, skipCheck.needsUpgrade);

          if (hdResult.shouldSkip) {
            log(`⏭️  SKIPPING ${photo_id} (HD fetch failed, keeping SD version)`);
            skipped++;
            continue;
          }

          if (hdResult.url) {
            photo_url = hdResult.url;
            isHdDownload = true;
          }
        }

        try {
          log(
            t("saving").replace("{count}", saved).replace("{path}", savePath)
          );
          await download(photo_url, savePath);

          // Mark as downloaded in database with HD status
          saveMediaWithTracking(userId, photo_id, isHdDownload, savePath, skipCheck.needsUpgrade);

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
