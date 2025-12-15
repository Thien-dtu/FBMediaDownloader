// Shared readline interface for the entire application
// This prevents conflicts between token_validator and menu readline instances
import readline from 'readline';

let rl = null;

/**
 * Get or create the shared readline interface
 * @returns {readline.Interface}
 */
export const getSharedReadline = () => {
    if (!rl) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        // Exit on close
        rl.on('close', () => process.exit(0));
    }
    return rl;
};

/**
 * Create a prompt function using the shared readline
 * @param {string} query - Prompt text
 * @param {string} color - Color code (optional)
 * @returns {Promise<string>}
 */
export const createPrompt = (color = '') => {
    return (query) => new Promise((resolve) => {
        getSharedReadline().question(color + query + '\x1b[0m', resolve);
    });
};

/**
 * Close the shared readline (should only be called on app exit)
 */
export const closeSharedReadline = () => {
    if (rl) {
        rl.close();
        rl = null;
    }
};
