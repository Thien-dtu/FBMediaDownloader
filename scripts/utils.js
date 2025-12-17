import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import { FB_API_HOST } from "./constants.js";
import { ACCESS_TOKEN } from "../config.js";
import { log } from "./logger.js";
import {
  parseRateLimitHeader,
  updateRateLimitUsage,
  handle429Response,
  smartSleep,
  formatRateLimitStatus
} from "./rate_limit_manager.js";
import {
  getProxyAgent,
  rotateProxy,
  isProxyEnabled
} from "./proxy_manager.js";

// Dùng FB API lấy link hình ảnh có độ phân giải lớn nhất từ id ảnh truyền vào
// Trả về undefined nếu không tìm thấy
export const getLargestPhotoLink = async (photo_id) => {
  let url = `${FB_API_HOST}/${photo_id}?fields=largest_image&access_token=${ACCESS_TOKEN}`;
  const json = await myFetch(url);
  return json?.largest_image?.source;
};

/**
 * Enhanced fetch with automatic rate limit handling and proxy support
 * - Parses X-App-Usage header to track rate limit usage
 * - Handles 429 responses with smart retry logic
 * - Applies smart delays based on current usage levels
 * - Routes requests through proxy if configured
 * 
 * @param {string} _url - URL to fetch
 * @param {object} options - Optional fetch options
 * @param {number} options.maxRetries - Max retries for 429 errors (default: 3)
 * @param {boolean} options.skipRateLimitDelay - Skip the smart delay after fetch
 * @returns {Promise<object|null>} JSON response or null on error
 */
export const myFetch = async (_url, options = {}) => {
  const { maxRetries = 17, skipRateLimitDelay = false } = options;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      // Get proxy agent if enabled
      const agent = getProxyAgent();
      const fetchOptions = agent ? { agent } : {};

      const response = await fetch(_url, fetchOptions);

      // Parse and update rate limit usage from header
      const usage = parseRateLimitHeader(response);
      if (usage) {
        updateRateLimitUsage(usage);
      }

      // Handle rate limit (429 Too Many Requests)
      if (response.status === 429) {
        const waitTime = handle429Response(response);
        log(`⚠️ Rate limited (429). Waiting ${Math.round(waitTime / 1000)}s before retry... (attempt ${retryCount + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }

      // Handle other HTTP errors
      if (!response.ok) {
        log(`[!] HTTP Error: ${response.status} ${response.statusText}`);
        return null;
      }

      const json = await response.json();

      if (json.error) {
        // Check if it's a rate limit error in the response body
        if (json.error.code === 4 || json.error.code === 17 || json.error.code === 32) {
          log(`⚠️ Rate limit error in response. Waiting 60s before retry...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
          retryCount++;
          continue;
        }
        log("[!] ERROR", JSON.stringify(json, null, 4));
        return null;
      }

      // Apply smart delay after successful requests (based on current usage)
      if (!skipRateLimitDelay) {
        await smartSleep(false); // Silent delay
      }

      return json;
    } catch (e) {
      // Check for network errors that warrant a retry with proxy rotation
      const isNetworkError = e.code === 'ECONNRESET' ||
        e.code === 'ETIMEDOUT' ||
        e.code === 'ECONNREFUSED' ||
        e.code === 'ENOTFOUND' ||
        e.code === 'EAI_AGAIN' ||
        e.message?.includes('ECONNRESET') ||
        e.message?.includes('socket hang up') ||
        e.message?.includes('proxy rejected') ||
        e.message?.includes('Socks') ||
        e.message?.includes('SOCKS');

      if (isNetworkError && retryCount < maxRetries) {
        retryCount++;
        log(`[!] Network error: ${e.message}. Rotating proxy and retrying... (attempt ${retryCount}/${maxRetries + 1})`);

        // Rotate to a different proxy before retrying
        if (isProxyEnabled()) {
          rotateProxy();
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      log("[!] ERROR", e.toString());
      return null;
    }
  }

  log(`[!] Max retries (${maxRetries}) exceeded. Giving up.`);
  return null;
};

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const checkFileExist = (fileDir) => fs.existsSync(fileDir);

export const deleteFile = (fileDir) =>
  checkFileExist(fileDir) && fs.unlinkSync(fileDir);

export const createIfNotExistDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`> Đã tạo thư mục ${dir}.`);
  }
};

export const saveToFile = (fileName, data, override = false) => {
  try {
    fs.writeFileSync(fileName, data, { flag: override ? "w+" : "a+" });
    log(`> Đã lưu vào file ${fileName}`);
  } catch (err) {
    console.error("[!] ERROR: ", err);
  }
};

/**
 * Download a file with atomic write mechanism
 * Downloads to a temporary file first, then renames to final destination
 * to prevent corrupted partial downloads from being treated as complete files
 *
 * @param {string} url - URL to download from
 * @param {string} destination - Final file path
 * @returns {Promise<boolean>} Resolves to true on success
 */
export const download = (url, destination) =>
  new Promise((resolve, reject) => {
    const tempDestination = `${destination}.tmp`;

    // Clean up any existing temp file from previous failed attempts
    if (fs.existsSync(tempDestination)) {
      try {
        fs.unlinkSync(tempDestination);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    const file = fs.createWriteStream(tempDestination);

    const cleanupAndReject = (error) => {
      // Close the file stream if still open
      file.destroy();
      // Remove temp file on error
      if (fs.existsSync(tempDestination)) {
        try {
          fs.unlinkSync(tempDestination);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      reject(error.message || error);
    };

    // Get proxy agent if enabled
    const agent = getProxyAgent();
    const requestOptions = agent ? { agent } : {};

    const request = https.get(url, requestOptions, (response) => {
      // Handle HTTP redirects (3xx status codes)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.destroy();
        if (fs.existsSync(tempDestination)) {
          try {
            fs.unlinkSync(tempDestination);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        // Follow redirect
        download(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      // Check for successful HTTP status
      if (response.statusCode !== 200) {
        cleanupAndReject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      // Handle stream errors
      response.on("error", cleanupAndReject);
      file.on("error", cleanupAndReject);

      file.on("finish", () => {
        file.close(() => {
          try {
            // Atomic rename: move temp file to final destination
            fs.renameSync(tempDestination, destination);
            resolve(true);
          } catch (renameError) {
            cleanupAndReject(renameError);
          }
        });
      });
    });

    request.on("error", cleanupAndReject);

    // Set a timeout to prevent hanging downloads
    request.setTimeout(60000, () => {
      request.destroy();
      cleanupAndReject(new Error("Download timeout (60s)"));
    });
  });

/**
 * Parse comma-separated user IDs for batch downloads
 * @param {string} input - Comma-separated IDs (e.g., "123, 456, 789")
 * @returns {string[]} Array of trimmed IDs
 */
export const parseUserIds = (input) => {
  if (!input || typeof input !== 'string') {
    return [];
  }

  return input
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
};

/**
 * Sanitize folder/file name by removing invalid characters
 * @param {string} name - Folder or file name
 * @returns {string} Sanitized name safe for filesystem
 */
export const sanitizeFolderName = (name) => {
  if (!name || typeof name !== 'string') {
    return '(no name)';
  }

  // Replace invalid Windows filename characters: < > : " / \ | ? *
  // Also replace newlines and tabs
  let sanitized = name
    .replace(/[<>:"\/\\|?*\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();

  // Limit length to 100 characters (Windows path limit is 260 total)
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  // If empty after sanitization, use default
  if (!sanitized) {
    return '(no name)';
  }

  return sanitized;
};

/**
 * Save caption/description as a text file next to media file
 * @param {string} mediaPath - Path to media file (without extension)
 * @param {string} caption - Caption/description text
 */
export const saveCaptionFile = (mediaPath, caption) => {
  if (!caption || typeof caption !== 'string' || !caption.trim()) {
    return; // Don't create file for empty captions
  }

  try {
    const captionPath = `${mediaPath}.txt`;
    fs.writeFileSync(captionPath, caption.trim(), 'utf8');
  } catch (error) {
    // Silently fail - caption is nice to have but not critical
    console.error(`Failed to save caption: ${error.message}`);
  }
};

// Re-export rate limit utilities for convenience
export {
  smartSleep,
  formatRateLimitStatus,
  getRateLimitUsage,
  getMaxUsagePercent
} from './rate_limit_manager.js';
