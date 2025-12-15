import { getDatabase } from './database.js';
import { DATABASE_ENABLED, PLATFORM_FACEBOOK } from '../config.js';
import { log } from './logger.js';

/**
 * TokenManager - Handles multi-token load balancing and usage tracking
 */
class TokenManager {
    /**
     * Get next available token using Round Robin + least-used strategy
     * @param {number} platformId - Platform ID (1=Facebook, 2=Instagram)
     * @returns {object|null} {token, tokenId} or null
     */
    static getToken(platformId = PLATFORM_FACEBOOK) {
        if (!DATABASE_ENABLED) return null;

        const db = getDatabase();
        if (!db) return null;

        try {
            // Get all active tokens that are not rate limited
            // Order by priority (desc), then requests_made (asc) for load balancing
            const result = db.prepare(`
        SELECT id, token
        FROM access_tokens
        WHERE platform_id = ? 
          AND is_active = 1
          AND (is_rate_limited = 0 OR rate_limit_reset IS NULL OR rate_limit_reset < datetime('now'))
        ORDER BY priority DESC, requests_made ASC
        LIMIT 1
      `).get(platformId);

            if (result) {
                // Update last_request timestamp
                db.prepare(`
          UPDATE access_tokens
          SET last_request = datetime('now')
          WHERE id = ?
        `).run(result.id);

                return {
                    token: result.token,
                    tokenId: result.id
                };
            }

            return null;
        } catch (error) {
            log(`⚠️ Error getting token: ${error.message}`);
            return null;
        }
    }

    /**
     * Record token usage for analytics and load balancing
     * @param {number} tokenId - Token ID
     * @param {string} endpoint - API endpoint (e.g., '/me/photos')
     * @param {boolean} success - Whether request was successful
     * @param {number} httpStatus - HTTP status code
     * @param {number} responseTime - Response time in milliseconds
     * @param {string} error - Error message if failed
     */
    static recordUsage(tokenId, endpoint, success, httpStatus = null, responseTime = null, error = null) {
        if (!DATABASE_ENABLED || !tokenId) return;

        const db = getDatabase();
        if (!db) return;

        try {
            // Log to usage_log
            db.prepare(`
        INSERT INTO token_usage_log (token_id, endpoint, success, http_status, response_time_ms, error_message)
        VALUES (?, ?, ?, ? ,?, ?)
      `).run(tokenId, endpoint, success ? 1 : 0, httpStatus, responseTime, error);

            // Increment requests_made counter
            db.prepare(`
        UPDATE access_tokens
        SET requests_made = requests_made + 1,
            last_used = datetime('now')
        WHERE id = ?
      `).run(tokenId);

        } catch (error) {
            log(`⚠️ Error recording usage: ${error.message}`);
        }
    }

    /**
     * Mark token as rate limited
     * @param {number} tokenId - Token ID
     * @param {string} resetTime - ISO timestamp when rate limit resets
     */
    static markRateLimited(tokenId, resetTime = null) {
        if (!DATABASE_ENABLED || !tokenId) return;

        const db = getDatabase();
        if (!db) return;

        try {
            const reset = resetTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(); // Default: 1 hour

            db.prepare(`
        UPDATE access_tokens
        SET is_rate_limited = 1,
            rate_limit_reset = ?
        WHERE id = ?
      `).run(reset, tokenId);

            log(`⚠️ Token ${tokenId} marked as rate limited until ${reset}`);
        } catch (error) {
            log(`⚠️ Error marking rate limit: ${error.message}`);
        }
    }

    /**
     * Clear rate limit flag (called when reset time has passed)
     * @param {number} tokenId - Token ID
     */
    static clearRateLimit(tokenId) {
        if (!DATABASE_ENABLED || !tokenId) return;

        const db = getDatabase();
        if (!db) return;

        try {
            db.prepare(`
        UPDATE access_tokens
        SET is_rate_limited = 0,
            rate_limit_reset = NULL
        WHERE id = ?
      `).run(tokenId);

            log(`✅ Rate limit cleared for token ${tokenId}`);
        } catch (error) {
            log(`⚠️ Error clearing rate limit: ${error.message}`);
        }
    }

    /**
     * Get analytics for all active tokens
     * @returns {Array} Array of token analytics
     */
    static getAnalytics() {
        if (!DATABASE_ENABLED) return [];

        const db = getDatabase();
        if (!db) return [];

        try {
            return db.prepare(`
        SELECT * FROM v_token_analytics
        ORDER BY priority DESC, total_api_requests DESC
      `).all();
        } catch (error) {
            log(`⚠️ Error getting analytics: ${error.message}`);
            return [];
        }
    }

    /**
     * Get endpoint statistics
     * @param {number} days - Number of days to look back (default: 7)
     * @returns {Array} Array of endpoint statistics
     */
    static getEndpointStats(days = 7) {
        if (!DATABASE_ENABLED) return [];

        const db = getDatabase();
        if (!db) return [];

        try {
            return db.prepare(`
        SELECT 
          endpoint,
          COUNT(*) as total_requests,
          ROUND(AVG(response_time_ms), 2) as avg_response_time,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
          ROUND(AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0 END), 2) as success_rate
        FROM token_usage_log
        WHERE created_at > datetime('now', '-' || ? || ' days')
        GROUP BY endpoint
        ORDER BY total_requests DESC
        LIMIT 10
      `).all(days);
        } catch (error) {
            log(`⚠️ Error getting endpoint stats: ${error.message}`);
            return [];
        }
    }
}

export default TokenManager;
