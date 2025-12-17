/**
 * Rate Limit Manager for Facebook Graph API
 * Automatically handles rate limiting based on X-App-Usage header
 * 
 * Facebook's X-App-Usage header format:
 * { "call_count": 28, "total_cputime": 15, "total_time": 24 }
 * Values are percentages (0-100) of the rolling 1-hour limit
 */

import { WAIT_BEFORE_NEXT_FETCH } from '../config.js';
import { log } from './logger.js';

// Rate limit state
let currentUsage = {
    call_count: 0,
    total_cputime: 0,
    total_time: 0,
    lastUpdated: null
};

// Configuration thresholds
const THRESHOLDS = {
    // Below this: no delay needed
    LOW: 20,
    // Between LOW and MEDIUM: use minimum delay
    MEDIUM: 50,
    // Between MEDIUM and HIGH: use moderate delay
    HIGH: 80,
    // Above HIGH: use maximum delay (approaching rate limit)
    CRITICAL: 95
};

// Delay values in milliseconds
const DELAYS = {
    NONE: 0,
    MINIMUM: WAIT_BEFORE_NEXT_FETCH || 500,
    MODERATE: 2000,
    HIGH: 5000,
    CRITICAL: 15000,
    RATE_LIMITED: 60000  // When 429 received
};

/**
 * Parse the X-App-Usage header from Facebook API response
 * @param {Response} response - Fetch response object
 * @returns {object|null} Parsed usage data or null
 */
export const parseRateLimitHeader = (response) => {
    try {
        const usageHeader = response.headers.get('x-app-usage');
        if (usageHeader) {
            const usage = JSON.parse(usageHeader);
            return {
                call_count: usage.call_count || 0,
                total_cputime: usage.total_cputime || 0,
                total_time: usage.total_time || 0
            };
        }
    } catch (e) {
        // Silently ignore parsing errors
    }
    return null;
};

/**
 * Update the current rate limit usage state
 * @param {object} usage - New usage data from header
 */
export const updateRateLimitUsage = (usage) => {
    if (usage) {
        currentUsage = {
            ...usage,
            lastUpdated: Date.now()
        };
    }
};

/**
 * Get the current rate limit usage
 * @returns {object} Current usage state
 */
export const getRateLimitUsage = () => ({ ...currentUsage });

/**
 * Get the highest usage percentage among all metrics
 * @returns {number} Maximum usage percentage (0-100)
 */
export const getMaxUsagePercent = () => {
    return Math.max(
        currentUsage.call_count,
        currentUsage.total_cputime,
        currentUsage.total_time
    );
};

/**
 * Calculate the recommended delay based on current rate limit usage
 * @param {boolean} verbose - Whether to log delay decisions
 * @returns {number} Recommended delay in milliseconds
 */
export const calculateSmartDelay = (verbose = false) => {
    const maxUsage = getMaxUsagePercent();
    let delay;
    let reason;

    if (maxUsage >= THRESHOLDS.CRITICAL) {
        delay = DELAYS.CRITICAL;
        reason = `⚠️ CRITICAL usage (${maxUsage}%)`;
    } else if (maxUsage >= THRESHOLDS.HIGH) {
        delay = DELAYS.HIGH;
        reason = `🔶 High usage (${maxUsage}%)`;
    } else if (maxUsage >= THRESHOLDS.MEDIUM) {
        delay = DELAYS.MODERATE;
        reason = `📊 Moderate usage (${maxUsage}%)`;
    } else if (maxUsage >= THRESHOLDS.LOW) {
        delay = DELAYS.MINIMUM;
        reason = `✅ Normal usage (${maxUsage}%)`;
    } else {
        delay = DELAYS.NONE;
        reason = `🚀 Low usage (${maxUsage}%)`;
    }

    if (verbose && delay > 0) {
        log(`${reason} - waiting ${delay}ms`);
    }

    return delay;
};

/**
 * Smart sleep based on current rate limit usage
 * Replaces the fixed WAIT_BEFORE_NEXT_FETCH approach
 * @param {boolean} verbose - Whether to log delay decisions
 * @returns {Promise<void>}
 */
export const smartSleep = async (verbose = true) => {
    const delay = calculateSmartDelay(verbose);
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
};

/**
 * Handle 429 Too Many Requests response
 * Parses Retry-After header if available
 * @param {Response} response - Fetch response object
 * @returns {number} Recommended wait time in milliseconds
 */
export const handle429Response = (response) => {
    // Try to get Retry-After header (in seconds)
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
            return seconds * 1000;
        }
    }

    // Try business use case header for estimated time
    try {
        const businessHeader = response.headers.get('x-business-use-case-usage');
        if (businessHeader) {
            const data = JSON.parse(businessHeader);
            // Find estimated_time_to_regain_access in any account
            for (const accountId of Object.keys(data)) {
                const accountData = data[accountId];
                if (Array.isArray(accountData)) {
                    for (const item of accountData) {
                        if (item.estimated_time_to_regain_access) {
                            return item.estimated_time_to_regain_access * 60 * 1000; // Convert minutes to ms
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Ignore parsing errors
    }

    // Default wait time for 429
    return DELAYS.RATE_LIMITED;
};

/**
 * Format rate limit status for display
 * @returns {string} Formatted status string
 */
export const formatRateLimitStatus = () => {
    const { call_count, total_cputime, total_time, lastUpdated } = currentUsage;
    const maxUsage = getMaxUsagePercent();

    let statusIcon = '🟢';
    if (maxUsage >= THRESHOLDS.CRITICAL) statusIcon = '🔴';
    else if (maxUsage >= THRESHOLDS.HIGH) statusIcon = '🟠';
    else if (maxUsage >= THRESHOLDS.MEDIUM) statusIcon = '🟡';

    const lastUpdateStr = lastUpdated
        ? `${Math.round((Date.now() - lastUpdated) / 1000)}s ago`
        : 'never';

    return `${statusIcon} Rate Limit: calls=${call_count}% cpu=${total_cputime}% time=${total_time}% (updated ${lastUpdateStr})`;
};

/**
 * Check if we should proceed with API call or wait
 * @returns {{ canProceed: boolean, waitTime: number }}
 */
export const checkRateLimit = () => {
    const maxUsage = getMaxUsagePercent();

    if (maxUsage >= THRESHOLDS.CRITICAL) {
        return {
            canProceed: false,
            waitTime: DELAYS.CRITICAL,
            message: `Rate limit critical (${maxUsage}%), waiting...`
        };
    }

    return {
        canProceed: true,
        waitTime: calculateSmartDelay(false),
        message: null
    };
};
