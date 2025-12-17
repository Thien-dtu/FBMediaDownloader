/**
 * Cancellation System for FB Media Downloader
 * 
 * Allows graceful cancellation of long-running operations by pressing 'q' or 'Esc'.
 * When cancelled, operations complete their current atomic task (e.g., finish downloading
 * the current file) then return to the menu.
 */

import { S } from './constants.js';
import { log } from './logger.js';

// Cancellation state
let cancelled = false;
let keyListenerActive = false;
let originalRawMode = null;

// Key codes
const KEY_Q_LOWER = 'q';
const KEY_Q_UPPER = 'Q';
const KEY_ESC = '\x1B';
const KEY_CTRL_C = '\x03';

/**
 * Custom error class for cancellation
 * This allows us to distinguish cancellation from other errors
 */
export class CancellationError extends Error {
    constructor(message = 'Operation cancelled by user') {
        super(message);
        this.name = 'CancellationError';
    }
}

/**
 * Check if operation has been cancelled
 * @returns {boolean} True if cancelled
 */
export const isCancelled = () => cancelled;

/**
 * Reset cancellation state
 * Call this before starting a new operation
 */
export const resetCancellation = () => {
    cancelled = false;
};

/**
 * Trigger cancellation
 * Called when user presses q or Esc
 */
export const cancel = () => {
    if (!cancelled) {
        cancelled = true;
        log('\n' + S.FgYellow + '🛑 Cancelling... Please wait for current operation to complete.' + S.Reset);
    }
};

/**
 * Handle keypress event
 * @param {Buffer} key - Key data
 */
const handleKeyPress = (key) => {
    const keyStr = key.toString();

    if (keyStr === KEY_Q_LOWER || keyStr === KEY_Q_UPPER || keyStr === KEY_ESC) {
        cancel();
    } else if (keyStr === KEY_CTRL_C) {
        // Still allow Ctrl+C to exit the program entirely
        process.exit(0);
    }
};

/**
 * Start listening for cancellation keys
 * Call this when starting a cancellable operation
 */
export const startCancellableOperation = () => {
    if (keyListenerActive) return;

    resetCancellation();

    // Store original raw mode state
    if (process.stdin.isTTY) {
        originalRawMode = process.stdin.isRaw;

        // Set raw mode to capture individual keypresses
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', handleKeyPress);

        keyListenerActive = true;

        // Show hint to user
        log(S.FgCyan + '💡 Press [q] or [Esc] anytime to cancel and return to menu' + S.Reset + '\n');
    }
};

/**
 * Stop listening for cancellation keys
 * Call this when operation completes or is cancelled
 */
export const stopCancellableOperation = () => {
    if (!keyListenerActive) return;

    // Remove our listener
    process.stdin.removeListener('data', handleKeyPress);

    // Restore original raw mode state
    if (process.stdin.isTTY && originalRawMode !== null) {
        process.stdin.setRawMode(originalRawMode);
    }

    keyListenerActive = false;
};

/**
 * Check cancellation and throw if cancelled
 * Use this at strategic points in loops to enable clean exit
 * @throws {CancellationError} If operation was cancelled
 */
export const throwIfCancelled = () => {
    if (cancelled) {
        throw new CancellationError();
    }
};

/**
 * Wrapper to run a cancellable operation
 * Automatically sets up and tears down the key listener
 * @param {Function} operation - Async function to run
 * @returns {Promise<object>} Result with { result, cancelled }
 */
export const runCancellable = async (operation) => {
    try {
        startCancellableOperation();
        const result = await operation();
        return { result, cancelled: false };
    } catch (error) {
        if (error instanceof CancellationError) {
            log('\n' + S.FgYellow + '✅ Operation cancelled. Returning to menu...' + S.Reset + '\n');
            return { result: null, cancelled: true };
        }
        throw error; // Re-throw non-cancellation errors
    } finally {
        stopCancellableOperation();
    }
};
