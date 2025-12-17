/**
 * Proxy Manager for FB Media Downloader
 * Supports single proxy, proxy list file, and automatic rotation
 * 
 * Configuration via .env:
 * - PROXY_ENABLED=true/false
 * - PROXY_URL=http://ip:port (single proxy)
 * - PROXY_LIST_FILE=proxies.txt (file with list of proxies, one per line)
 * 
 * Proxy URL formats supported:
 * - http://ip:port
 * - http://user:pass@ip:port
 * - https://ip:port
 * - socks4://ip:port
 * - socks5://ip:port
 * - socks5://user:pass@ip:port
 */

import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { log } from './logger.js';

// Proxy state
let proxyList = [];
let currentProxyIndex = 0;
let proxyEnabled = false;
let failedProxies = new Set();

/**
 * Initialize proxy configuration from environment variables
 */
export const initProxy = () => {
    proxyEnabled = process.env.PROXY_ENABLED === 'true';

    if (!proxyEnabled) {
        log('🔌 Proxy: Disabled');
        return;
    }

    // Check for proxy list file first
    const proxyListFile = process.env.PROXY_LIST_FILE;
    if (proxyListFile && fs.existsSync(proxyListFile)) {
        loadProxyListFromFile(proxyListFile);
    } else if (process.env.PROXY_URL) {
        // Single proxy from PROXY_URL
        proxyList = [process.env.PROXY_URL.trim()];
        log(`🔌 Proxy: Using single proxy`);
    } else {
        log('⚠️ Proxy: Enabled but no PROXY_URL or PROXY_LIST_FILE configured');
        proxyEnabled = false;
        return;
    }

    if (proxyList.length > 0) {
        log(`🔌 Proxy: Loaded ${proxyList.length} proxy(ies)`);
    }
};

/**
 * Load proxies from a text file (one proxy per line)
 * Format: ip:port or full URL like http://ip:port
 * @param {string} filePath - Path to proxy list file
 */
export const loadProxyListFromFile = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments

        proxyList = lines.map(line => {
            // If it's just ip:port, assume HTTP
            if (!line.includes('://')) {
                return `http://${line}`;
            }
            return line;
        });

        log(`📋 Loaded ${proxyList.length} proxies from ${filePath}`);
    } catch (error) {
        log(`⚠️ Error loading proxy list: ${error.message}`);
        proxyList = [];
    }
};

/**
 * Get the current proxy URL
 * @returns {string|null} Current proxy URL or null if disabled
 */
export const getCurrentProxy = () => {
    if (!proxyEnabled || proxyList.length === 0) {
        return null;
    }
    return proxyList[currentProxyIndex];
};

/**
 * Create a proxy agent for the given URL
 * @param {string} proxyUrl - Proxy URL
 * @returns {object|null} Proxy agent or null
 */
export const createProxyAgent = (proxyUrl) => {
    if (!proxyUrl) return null;

    try {
        if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
            return new SocksProxyAgent(proxyUrl);
        } else {
            // HTTP/HTTPS proxy
            return new HttpsProxyAgent(proxyUrl);
        }
    } catch (error) {
        log(`⚠️ Error creating proxy agent: ${error.message}`);
        return null;
    }
};

/**
 * Get proxy agent for current proxy
 * @returns {object|null} Proxy agent or null if disabled
 */
export const getProxyAgent = () => {
    const proxyUrl = getCurrentProxy();
    return createProxyAgent(proxyUrl);
};

/**
 * Rotate to the next proxy in the list
 * @param {boolean} markFailed - Whether to mark current proxy as failed
 * @returns {string|null} New proxy URL or null if no more proxies
 */
export const rotateProxy = (markFailed = false) => {
    if (!proxyEnabled || proxyList.length === 0) {
        return null;
    }

    if (markFailed) {
        const failedProxy = proxyList[currentProxyIndex];
        failedProxies.add(failedProxy);
        log(`❌ Marking proxy as failed: ${maskProxyUrl(failedProxy)}`);
    }

    // Find next working proxy
    let attempts = 0;
    do {
        currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
        attempts++;
    } while (
        failedProxies.has(proxyList[currentProxyIndex]) &&
        attempts < proxyList.length
    );

    // If all proxies failed, reset and try again
    if (attempts >= proxyList.length) {
        log('⚠️ All proxies failed. Resetting failed list...');
        failedProxies.clear();
        currentProxyIndex = 0;
    }

    const newProxy = proxyList[currentProxyIndex];
    log(`🔄 Switched to proxy: ${maskProxyUrl(newProxy)}`);
    return newProxy;
};

/**
 * Mask proxy URL for logging (hide password)
 * @param {string} proxyUrl - Proxy URL
 * @returns {string} Masked URL
 */
export const maskProxyUrl = (proxyUrl) => {
    try {
        const url = new URL(proxyUrl);
        if (url.password) {
            url.password = '***';
        }
        return url.toString();
    } catch {
        return proxyUrl;
    }
};

/**
 * Get proxy statistics
 * @returns {object} Proxy stats
 */
export const getProxyStats = () => {
    return {
        enabled: proxyEnabled,
        total: proxyList.length,
        currentIndex: currentProxyIndex,
        failed: failedProxies.size,
        current: proxyEnabled ? maskProxyUrl(getCurrentProxy()) : null
    };
};

/**
 * Check if proxy is enabled
 * @returns {boolean}
 */
export const isProxyEnabled = () => proxyEnabled;

/**
 * Toggle proxy on/off
 * @returns {boolean} New proxy state
 */
export const toggleProxy = () => {
    proxyEnabled = !proxyEnabled;
    log(`🔌 Proxy: ${proxyEnabled ? 'ENABLED' : 'DISABLED'}`);
    return proxyEnabled;
};

/**
 * Set proxy enabled state
 * @param {boolean} enabled - Whether to enable proxy
 */
export const setProxyEnabled = (enabled) => {
    proxyEnabled = enabled;
    log(`🔌 Proxy: ${proxyEnabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Test current proxy connectivity
 * @returns {Promise<object>} Test result with success status and IP
 */
export const testProxyConnection = async () => {
    const agent = getProxyAgent();

    if (!agent) {
        log('ℹ️ No proxy configured, testing direct connection...');
    }

    try {
        const response = await fetch('https://api.ipify.org?format=json', {
            agent,
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const result = {
            success: true,
            ip: data.ip,
            proxy: agent ? maskProxyUrl(getCurrentProxy()) : 'direct'
        };

        log(`✅ Connection test passed! IP: ${data.ip}`);
        return result;
    } catch (error) {
        const result = {
            success: false,
            error: error.message,
            proxy: agent ? maskProxyUrl(getCurrentProxy()) : 'direct'
        };

        log(`❌ Connection test failed: ${error.message}`);
        return result;
    }
};

/**
 * Test a single proxy and return detailed results
 * @param {string} proxyUrl - Proxy URL to test
 * @param {number} timeout - Timeout in ms (default 10000)
 * @returns {Promise<object>} Test result with success, latency, IP
 */
export const testSingleProxy = async (proxyUrl, timeout = 10000) => {
    const startTime = Date.now();

    try {
        const agent = createProxyAgent(proxyUrl);
        if (!agent) {
            return {
                proxy: proxyUrl,
                success: false,
                error: 'Failed to create proxy agent',
                latency: null,
                ip: null
            };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch('https://api.ipify.org?format=json', {
            agent,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;

        return {
            proxy: proxyUrl,
            success: true,
            latency,
            ip: data.ip,
            error: null
        };
    } catch (error) {
        return {
            proxy: proxyUrl,
            success: false,
            latency: null,
            ip: null,
            error: error.name === 'AbortError' ? 'Timeout' : error.message
        };
    }
};

/**
 * Check health of all proxies in the list
 * Tests all proxies in parallel and returns detailed results
 * @param {object} options - Options
 * @param {number} options.timeout - Timeout per proxy in ms (default 10000)
 * @param {boolean} options.removeDeadProxies - Remove dead proxies from list (default false)
 * @param {function} options.onProgress - Progress callback (current, total, result)
 * @returns {Promise<object>} Health check results
 */
export const checkAllProxies = async (options = {}) => {
    const { timeout = 10000, removeDeadProxies = false, onProgress } = options;

    if (!proxyEnabled || proxyList.length === 0) {
        log('⚠️ No proxies loaded to check');
        return {
            total: 0,
            healthy: 0,
            dead: 0,
            results: []
        };
    }

    log(`\n🔍 Testing ${proxyList.length} proxies (timeout: ${timeout / 1000}s each)...\n`);

    const results = [];
    let completed = 0;

    // Test all proxies in parallel with concurrency limit
    const concurrencyLimit = 10; // Test 10 proxies at a time
    const chunks = [];

    for (let i = 0; i < proxyList.length; i += concurrencyLimit) {
        chunks.push(proxyList.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
        const chunkResults = await Promise.all(
            chunk.map(async (proxyUrl) => {
                const result = await testSingleProxy(proxyUrl, timeout);
                completed++;

                if (onProgress) {
                    onProgress(completed, proxyList.length, result);
                }

                return result;
            })
        );
        results.push(...chunkResults);
    }

    // Sort by latency (healthy first, then by speed)
    results.sort((a, b) => {
        if (a.success && !b.success) return -1;
        if (!a.success && b.success) return 1;
        if (a.success && b.success) return a.latency - b.latency;
        return 0;
    });

    const healthy = results.filter(r => r.success);
    const dead = results.filter(r => !r.success);

    // Display results
    log('\n' + '='.repeat(70));
    log('📊 PROXY HEALTH CHECK RESULTS');
    log('='.repeat(70));

    log('\n✅ HEALTHY PROXIES:');
    if (healthy.length === 0) {
        log('   (none)');
    } else {
        healthy.forEach((r, i) => {
            log(`   ${i + 1}. ${maskProxyUrl(r.proxy)}`);
            log(`      IP: ${r.ip} | Latency: ${r.latency}ms`);
        });
    }

    log('\n❌ DEAD PROXIES:');
    if (dead.length === 0) {
        log('   (none)');
    } else {
        dead.forEach((r, i) => {
            log(`   ${i + 1}. ${maskProxyUrl(r.proxy)}`);
            log(`      Error: ${r.error}`);
        });
    }

    log('\n' + '-'.repeat(70));
    log(`📈 Summary: ${healthy.length} healthy, ${dead.length} dead out of ${proxyList.length} total`);

    if (healthy.length > 0) {
        const avgLatency = Math.round(healthy.reduce((sum, r) => sum + r.latency, 0) / healthy.length);
        const fastestProxy = healthy[0];
        log(`⚡ Average latency: ${avgLatency}ms | Fastest: ${fastestProxy.latency}ms`);
    }

    // Remove dead proxies if requested
    if (removeDeadProxies && dead.length > 0) {
        const deadUrls = new Set(dead.map(r => r.proxy));
        const originalCount = proxyList.length;
        proxyList = proxyList.filter(p => !deadUrls.has(p));
        currentProxyIndex = 0; // Reset to first proxy
        failedProxies.clear(); // Clear failed list

        log(`\n🧹 Removed ${originalCount - proxyList.length} dead proxies. ${proxyList.length} remaining.`);
    }

    log('='.repeat(70) + '\n');

    return {
        total: results.length,
        healthy: healthy.length,
        dead: dead.length,
        averageLatency: healthy.length > 0
            ? Math.round(healthy.reduce((sum, r) => sum + r.latency, 0) / healthy.length)
            : null,
        fastestProxy: healthy.length > 0 ? healthy[0] : null,
        results
    };
};

/**
 * Get list of healthy proxies only
 * @returns {string[]} Array of healthy proxy URLs
 */
export const getHealthyProxies = () => {
    return proxyList.filter(p => !failedProxies.has(p));
};

/**
 * Reorder proxies by latency (fastest first)
 * @param {object[]} healthResults - Results from checkAllProxies
 */
export const reorderByLatency = (healthResults) => {
    if (!healthResults?.results) return;

    const healthyByLatency = healthResults.results
        .filter(r => r.success)
        .sort((a, b) => a.latency - b.latency)
        .map(r => r.proxy);

    if (healthyByLatency.length > 0) {
        proxyList = healthyByLatency;
        currentProxyIndex = 0;
        failedProxies.clear();
        log(`🔄 Reordered ${proxyList.length} proxies by latency (fastest first)`);
    }
};

// Initialize on module load
initProxy();
