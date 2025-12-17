/**
 * Logger Module for FB Media Downloader
 *
 * Provides centralized logging functionality.
 * Can be extended for file logging or log levels.
 * @module logger
 */

/**
 * Log messages to console
 * Wrapper around console.log for centralized logging control
 * @param {...any} params - Values to log (same as console.log)
 * @returns {void}
 */
export const log = (...params) => {
  console.log(...params);
};
