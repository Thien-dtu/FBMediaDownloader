/**
 * Menu Core Utilities Module
 *
 * Provides core menu functionality: prompts, choices, and shared readline.
 * @module menu/core
 */

import readline from "readline";
import { S } from "../constants.js";
import { t } from "../lang.js";
import { log } from "../logger.js";

/**
 * Readline interface for user input
 * @type {readline.Interface}
 */
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

/**
 * Display a prompt and wait for user input
 * @param {string} query - The prompt text to display
 * @returns {Promise<string>} User's input response
 */
export const prompt = (query) =>
    new Promise((resolve) => rl.question(S.FgGreen + query + S.Reset, resolve));

/**
 * Wait for user to press any key before continuing
 * @returns {Promise<string>} Resolves when user presses a key
 */
export const waitForKeyPressed = async () => await prompt(t("pressAnyKey"));

/**
 * Display a menu and get user's choice
 * @param {string} title - Menu title to display
 * @param {Object<string, string>} menuItems - Object mapping keys to menu item labels
 * @returns {Promise<{key: string, value: string}>} Selected menu item with key and value
 */
export const choose = async (title, menuItems) => {
    const titleUi = `======== ${title} ========`;
    let ui = "";
    ui += "\n" + new Array(titleUi.length).fill("=").join("") + "\n";
    ui += titleUi + "\n";
    ui += new Array(titleUi.length).fill("=").join("");
    Object.entries(menuItems).map(([key, value]) => {
        ui += `\n${key}: ${value}`;
    });
    log(ui);

    while (true) {
        const input = await prompt("\n" + t("chooseFunction"));
        if (input in menuItems) {
            return {
                key: input,
                value: menuItems[input],
            };
        } else {
            log(t("wrongChoice"));
        }
    }
};

/**
 * Close the readline interface
 * Should be called when the application exits
 * @returns {void}
 */
export const closeReadline = () => {
    rl.close();
};

/**
 * Get the readline interface instance
 * @returns {readline.Interface} The readline interface
 */
export const getReadline = () => rl;

// Exit on readline close
rl.on("close", () => process.exit(0));
