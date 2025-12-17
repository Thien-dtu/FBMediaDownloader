/**
 * Constants Module for FB Media Downloader
 *
 * Contains API endpoints, media type enums, and console styling codes.
 * @module constants
 */

/**
 * Facebook Graph API base URL with version
 * @constant {string}
 */
export const FB_API_HOST = "https://graph.facebook.com/v21.0";

/**
 * Supported media types for downloads
 * @constant {Object}
 * @property {string} PHOTO - Photo media type
 * @property {string} VIDEO - Video media type
 */
export const MEDIA_TYPE = Object.freeze({
  PHOTO: "photo",
  VIDEO: "video",
});

/**
 * Console text styling codes for terminal output
 * @see https://stackoverflow.com/a/41407246
 * @constant {Object}
 */
export const S = Object.freeze({
  // Reset
  Reset: "\x1b[0m",

  // Text modifiers
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underscore: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",

  // Foreground colors
  FgBlack: "\x1b[30m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgWhite: "\x1b[37m",

  // Background colors
  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m",
});
