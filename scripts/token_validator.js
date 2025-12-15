import fetch from 'node-fetch';
import { FB_API_HOST, S } from './constants.js';
import { PLATFORM_FACEBOOK } from '../config.js';
import { saveToken, getActiveToken } from './database.js';
import { log } from './logger.js';
import { getSharedReadline } from './shared_readline.js';

// Use shared readline - DO NOT create separate instance
const prompt = (query) =>
    new Promise((resolve) => getSharedReadline().question(S.FgGreen + query + S.Reset, resolve));

/**
 * Validate token with Facebook API
 * @param {string} token - Access token to validate
 * @returns {Promise<object>} Validation result {valid, user, error}
 */
export const validateTokenWithAPI = async (token) => {
    try {
        const response = await fetch(`${FB_API_HOST}/me?access_token=${token}`);
        const data = await response.json();

        if (data.error) {
            return {
                valid: false,
                error: data.error.message,
                errorCode: data.error.code
            };
        }

        return {
            valid: true,
            user: {
                id: data.id,
                name: data.name
            }
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
};

/**
 * Get token permissions from Facebook API
 * @param {string} token - Access token
 * @returns {Promise<Array>} Array of granted permissions
 */
export const getTokenPermissions = async (token) => {
    try {
        const response = await fetch(`${FB_API_HOST}/me/permissions?access_token=${token}`);
        const data = await response.json();

        if (data.error) {
            return [];
        }

        // Filter only granted permissions
        const granted = data.data
            .filter(p => p.status === 'granted')
            .map(p => p.permission);

        return granted;
    } catch (error) {
        log(`⚠️ Error fetching permissions: ${error.message}`);
        return [];
    }
};

/**
 * Check if token has required permissions
 * @param {Array<string>} permissions - Array of permissions
 * @returns {object} Check result {hasRequired, hasRecommended, missing}
 */
export const checkRequiredPermissions = (permissions) => {
    const ESSENTIAL = ['user_photos', 'user_posts'];
    const RECOMMENDED = ['user_videos'];

    const permSet = new Set(permissions);
    const missingEssential = ESSENTIAL.filter(p => !permSet.has(p));
    const missingRecommended = RECOMMENDED.filter(p => !permSet.has(p));

    return {
        hasRequired: missingEssential.length === 0,
        hasRecommended: missingRecommended.length === 0,
        missingEssential,
        missingRecommended,
        granted: permissions
    };
};

/**
 * Interactive token input with masking
 * @returns {Promise<string>} Entered token
 */
export const promptForToken = async () => {
    console.log('\n' + S.FgYellow + '━'.repeat(60) + S.Reset);
    console.log(S.FgYellow + '  ACCESS TOKEN REQUIRED' + S.Reset);
    console.log(S.FgYellow + '━'.repeat(60) + S.Reset);
    console.log('\nTo use this downloader, you need a Facebook access token.');
    console.log('Get one from: ' + S.FgCyan + 'https://developers.facebook.com/tools/explorer/' + S.Reset);
    console.log('\nSteps:');
    console.log('  1. Visit the Graph API Explorer');
    console.log('  2. Click "Generate Access Token"');
    console.log('  3. Grant permissions: user_photos, user_posts, user_videos');
    console.log('  4. Copy the token and paste it below\n');

    const token = await prompt('> Enter your access token: ');
    return token.trim();
};

/**
 * Validate and save token
 * @param {string} token - Token to validate
 * @returns {Promise<boolean>} Success status
 */
export const validateAndSaveToken = async (token) => {
    console.log(S.FgCyan + '\n🔍 Validating token...' + S.Reset);

    // Validate token
    const validation = await validateTokenWithAPI(token);

    if (!validation.valid) {
        console.log(S.BgRed + '\n❌ Token validation failed!' + S.Reset);
        console.log(S.FgRed + `Error: ${validation.error}` + S.Reset);
        return false;
    }

    console.log(S.FgGreen + '✅ Token is valid!' + S.Reset);
    console.log(`   User: ${validation.user.name} (ID: ${validation.user.id})`);

    // Get permissions
    console.log(S.FgCyan + '🔍 Checking permissions...' + S.Reset);
    const permissions = await getTokenPermissions(token);
    const permCheck = checkRequiredPermissions(permissions);

    if (!permCheck.hasRequired) {
        console.log(S.BgRed + '\n❌ Missing required permissions!' + S.Reset);
        console.log(S.FgRed + 'Missing: ' + permCheck.missingEssential.join(', ') + S.Reset);
        console.log('\nPlease generate a new token with these permissions:');
        console.log('  - user_photos');
        console.log('  - user_posts');
        console.log('  - user_videos (recommended)');
        return false;
    }

    console.log(S.FgGreen + '✅ Permissions verified!' + S.Reset);
    console.log(`   Granted: ${permissions.slice(0, 5).join(', ')}${permissions.length > 5 ? `, +${permissions.length - 5} more` : ''}`);

    if (!permCheck.hasRecommended) {
        console.log(S.FgYellow + '⚠️  Recommended permission missing: user_videos' + S.Reset);
        console.log('   (Video downloads may not work)');
    }

    // Save token to database
    console.log(S.FgCyan + '\n💾 Saving token to database...' + S.Reset);
    const saved = saveToken(PLATFORM_FACEBOOK, token, permissions, 'User-entered token');

    if (saved) {
        console.log(S.FgGreen + '✅ Token saved successfully!\n' + S.Reset);
        return true;
    } else {
        console.log(S.BgRed + '❌ Failed to save token to database' + S.Reset);
        return false;
    }
};

/**
 * Main token validation flow for startup
 * @returns {Promise<boolean>} True if valid token available, false otherwise
 */
export const ensureValidToken = async () => {
    // Check for existing token in database
    const existingToken = getActiveToken(PLATFORM_FACEBOOK);

    if (existingToken) {
        console.log(S.FgCyan + '🔍 Validating stored access token...' + S.Reset);

        try {
            const validation = await validateTokenWithAPI(existingToken);

            if (validation.valid) {
                const permissions = await getTokenPermissions(existingToken);
                const permCheck = checkRequiredPermissions(permissions);

                console.log(S.FgGreen + '✅ Access token validated' + S.Reset);
                console.log(S.FgGreen + `✅ Permissions: ${permissions.slice(0, 3).join(', ')}${permissions.length > 3 ? `, +${permissions.length - 3} more` : ''}` + S.Reset);

                if (!permCheck.hasRecommended) {
                    console.log(S.FgYellow + '⚠️  Note: user_videos permission not found (video downloads may fail)' + S.Reset);
                }

                return true;
            }

            // Token is invalid - prompt for new one
            console.log(S.BgRed + '\n❌ Stored token is invalid or expired' + S.Reset);
            console.log(S.FgRed + `Error: ${validation.error}\n` + S.Reset);

            console.log('What would you like to do?');
            console.log('  1. Enter a new access token');
            console.log('  2. Exit program\n');

            const choice = await prompt('> Choice (1 or 2): ');

            if (choice.trim() === '1') {
                while (true) {
                    const newToken = await promptForToken();
                    if (!newToken) {
                        console.log(S.FgRed + 'No token entered.' + S.Reset);
                        continue;
                    }

                    const success = await validateAndSaveToken(newToken);
                    if (success) {
                        return true;
                    }

                    const retry = await prompt('\n> Try again? (y/n): ');
                    if (retry.trim().toLowerCase() !== 'y') {
                        return false;
                    }
                }
            }

            return false;
        } catch (error) {
            console.log(S.BgRed + '\n❌ Error validating token: ' + error.message + S.Reset);
            console.log(S.FgYellow + 'Proceeding anyway (validation will happen on first API call)\n' + S.Reset);
            return true; // Allow proceeding on network errors
        }
    }

    // No token in database - first run
    console.log(S.BgYellow + '\n⚠️  No access token found!' + S.Reset);

    while (true) {
        const token = await promptForToken();
        if (!token) {
            console.log(S.FgRed + '\nNo token entered. Cannot proceed without a token.' + S.Reset);
            const exit = await prompt('> Exit program? (y/n): ');
            if (exit.trim().toLowerCase() === 'y') {
                return false;
            }
            continue;
        }

        const success = await validateAndSaveToken(token);
        if (success) {
            return true;
        }

        // Ask if want to try again
        const retry = await prompt('\n> Try again? (y/n): ');
        if (retry.trim().toLowerCase() !== 'y') {
            return false;
        }
    }
};

/**
 * Close readline interface (deprecated - using shared readline now)
 * This function is kept for compatibility but does nothing
 * The shared readline will be closed when the application exits
 */
export const closeTokenValidator = () => {
    return Promise.resolve();
};
