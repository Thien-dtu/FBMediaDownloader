/**
 * Admin/Utility Menu Module
 *
 * Handles administrative functions: UIDs, proxy health, language, etc.
 * @module menu/admin
 */

import fs from "fs";
import { prompt, choose, waitForKeyPressed } from "./core.js";
import { S } from "../constants.js";
import { t, LANGKEY, setLang } from "../lang.js";
import { log } from "../logger.js";
import { download, createIfNotExistDir, parseUserIds } from "../utils.js";
import { getAllUIDs } from "../database.js";
import { ensureUsername, scanAllUIDs } from "../user_info.js";
import { ensureUserProfile, fetchAndSaveProfile, fetchUserProfile } from "../user_profile.js";
import { fetchTimeLineAlbumId_FBPage } from "../download_timeline_album.js";
import { fetchAlbumInfo } from "../download_album.js";
import { checkAllProxies, reorderByLatency, isProxyEnabled, getProxyStats, toggleProxy } from "../proxy_manager.js";

/**
 * Menu handler for downloading media from a text file containing URLs
 * Reads URLs from file and downloads each one
 * @returns {Promise<void>}
 */
export const menuDownloadFromFile = async () => {
    const file_path = await prompt(t("enterFilePath"));

    if (file_path) {
        const folder_name = await prompt(t("folderToSave"));
        const folder_path = `downloads/from-file/${folder_name}/`;
        createIfNotExistDir(folder_path);

        try {
            const content = fs.readFileSync(file_path, "utf8");
            const urls = content.split("\n");

            log(t("foundLinks").replace("{length}", urls.length));

            let index = 1;
            for (let url of urls) {
                try {
                    let isPhoto = url.indexOf(".jpg") > 0;
                    let fileName = `${folder_path}/${index}.${isPhoto ? "jpg" : "mp4"}`;

                    log(
                        t("downloadingLinks").replace(
                            "{progress}",
                            `${index}/${urls.length}`
                        )
                    );
                    await download(url, fileName);
                    index++;
                } catch (e) {
                    log(t("errorWhenDownloadUrl").replace("{url}", url), e);
                }
            }
        } catch (e) {
            log(t("error"), e);
        }
    }
};

/**
 * Menu handler for selecting application language
 * Supports Vietnamese and English
 * @returns {Promise<void>}
 */
export const menuSelectLanguage = async () => {
    const action = await choose("Ngôn ngữ / Select Language", {
        1: "Tiếng Việt",
        2: "English",
    });

    if (action.key == 1) {
        setLang(LANGKEY.vi);
    }
    if (action.key == 2) {
        setLang(LANGKEY.en);
    }
};

/**
 * Show timeline album info for a Facebook page
 * @returns {Promise<void>}
 */
export const menuFindTimelineAlbum = async () => {
    const page_id = await prompt(t("enterPageID"));
    if (page_id != -1) {
        // Auto-fetch user profile for the page ID
        await ensureUserProfile(page_id);

        const timeline_album_id = await fetchTimeLineAlbumId_FBPage(page_id);
        if (timeline_album_id) {
            log(t("foundTimelineAlbumID"), timeline_album_id);
            log(t("fetchingAlbumInfo"));
            log(await fetchAlbumInfo(timeline_album_id));
        } else {
            log(S.BgRed + t("notFoundTimlineAlbum") + S.Reset);
        }
        await waitForKeyPressed();
    }
};

/**
 * Print all UIDs from the database
 * @returns {Promise<void>}
 */
export const menuPrintAllUIDs = async () => {
    const uids = getAllUIDs();
    if (uids.length === 0) {
        log("No UIDs found in database.");
    } else {
        log(`\n📋 All UIDs (${uids.length} total):\n`);
        log(uids.join(","));
    }
    await waitForKeyPressed();
};

/**
 * Scan UIDs and fetch missing usernames
 * @returns {Promise<void>}
 */
export const menuScanUIDs = async () => {
    const uid_input = await prompt("Enter UID(s) (comma-separated, or Enter to scan all): ");

    if (uid_input && uid_input.trim()) {
        // Parse comma-separated UIDs
        const uids = parseUserIds(uid_input);

        if (uids.length === 0) {
            log("No valid UIDs entered.");
        } else if (uids.length === 1) {
            // Single UID mode
            const uid = uids[0];
            log(`\n🔍 Fetching username for UID: ${uid}...`);
            const result = await ensureUsername(uid);
            if (result.username) {
                log(`✅ ${uid} → ${result.username}`);
            } else {
                log(`❌ Could not fetch username for ${uid}${result.error ? ': ' + result.error : ''}`);
            }
        } else {
            // Multiple UIDs - batch mode
            log(`\n🔍 Fetching usernames for ${uids.length} UIDs...\n`);
            let fetched = 0, skipped = 0, errors = 0;

            for (let i = 0; i < uids.length; i++) {
                const uid = uids[i];
                const result = await ensureUsername(uid);

                if (result.username) {
                    if (result.fetched) {
                        log(`  [${i + 1}/${uids.length}] ✅ ${uid} → ${result.username}`);
                        fetched++;
                    } else {
                        log(`  [${i + 1}/${uids.length}] ⏭️ ${uid} → ${result.username} (already exists)`);
                        skipped++;
                    }
                } else {
                    log(`  [${i + 1}/${uids.length}] ❌ ${uid} → Failed`);
                    errors++;
                }

                // Small delay between requests
                if (i < uids.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            log(`\n📊 Summary: ${fetched} fetched, ${skipped} already existed, ${errors} errors`);
        }
    } else {
        // Scan all UIDs mode
        log("\n🔍 Starting UID username scan for all UIDs...");
        await scanAllUIDs((current, total, uid, username, status) => {
            if (status === 'fetched') {
                log(`  [${current}/${total}] ✅ ${uid} → ${username}`);
            } else if (status === 'error') {
                log(`  [${current}/${total}] ❌ ${uid} → Failed to fetch`);
            }
            // Skip logging for 'skipped' to avoid clutter
        });
    }
    await waitForKeyPressed();
};

/**
 * Proxy health check menu
 * @returns {Promise<void>}
 */
export const menuProxyHealthCheck = async () => {
    const stats = getProxyStats();
    const proxyStatus = isProxyEnabled() ? '✅ ENABLED' : '❌ DISABLED';
    log(`\n📊 Proxy Status: ${proxyStatus}`);
    if (isProxyEnabled()) {
        log(`   Loaded: ${stats.total} proxies, ${stats.failed} marked as failed`);
        log(`   Current: ${stats.current || 'none'}`);
    }

    const healthAction = await choose("Proxy Management", {
        0: t("back"),
        1: isProxyEnabled() ? "🔴 Disable Proxy" : "🟢 Enable Proxy",
        2: "Test all proxies",
        3: "Test all & remove dead proxies",
        4: "Test all & reorder by speed (fastest first)",
    });

    if (healthAction.key == 1) {
        toggleProxy();
    } else if (healthAction.key >= 2 && healthAction.key <= 4) {
        if (!isProxyEnabled()) {
            log("\n⚠️ Proxy is disabled. Enable it first to run health checks.");
        } else {
            const results = await checkAllProxies({
                timeout: 10000,
                removeDeadProxies: healthAction.key == 3,
                onProgress: (current, total, result) => {
                    const status = result.success ? `✅ ${result.latency}ms` : `❌ ${result.error}`;
                    log(`  [${current}/${total}] ${status}`);
                }
            });

            if (healthAction.key == 4 && results.healthy > 0) {
                reorderByLatency(results);
            }
        }
    }

    await waitForKeyPressed();
};

/**
 * Show help/contact information
 * @returns {Promise<void>}
 */
export const menuShowHelp = async () => {
    log(t("contact"));
    await waitForKeyPressed();
};

/**
 * Fetch/Update user profiles with change tracking
 * Supports multiple UIDs (comma-separated)
 * Shows which fields changed for each profile
 * @returns {Promise<void>}
 */
export const menuFetchUserProfiles = async () => {
    const uidInput = await prompt(t("enterUIDsToFetch"));
    if (!uidInput || uidInput.trim() === '' || uidInput === '-1') return;

    // Parse comma-separated UIDs
    const uids = parseUserIds(uidInput);
    if (uids.length === 0) {
        log("No valid UIDs entered.");
        return;
    }

    const includeLikesInput = await prompt(t("includeLikes"));
    const includeLikes = includeLikesInput === '1';

    log(`\n${"─".repeat(60)}`);
    log(`  ${t("fetchProfilesTitle")}`);
    log(`  UIDs: ${uids.length} | ${t("includeLikes").split("?")[0]}: ${includeLikes ? 'Yes' : 'No'}`);
    log("─".repeat(60));

    const results = { fetched: 0, updated: 0, noChanges: 0, failed: 0 };

    for (let i = 0; i < uids.length; i++) {
        const uid = uids[i];
        log(`\n[${i + 1}/${uids.length}] UID: ${uid}`);

        try {
            const result = await fetchAndSaveProfile(uid, { includeLikes });

            if (result.saved) {
                if (result.isNew) {
                    log(`   ✅ ${t("profileFetched")}: ${result.profile?.name || 'N/A'}`);
                    results.fetched++;
                } else if (result.changedFields && result.changedFields.length > 0) {
                    log(`   📝 ${t("profileUpdated")}: ${result.profile?.name || 'N/A'}`);
                    log(`   ${t("fieldsChanged")}: ${result.changedFields.join(', ')}`);
                    results.updated++;
                } else {
                    log(`   ⏭️ ${t("profileNoChanges")}: ${result.profile?.name || 'N/A'}`);
                    results.noChanges++;
                }
            } else {
                log(`   ❌ ${t("profileFailed")}: ${result.reason || 'Unknown error'}`);
                results.failed++;
            }
        } catch (error) {
            log(`   ❌ ${t("profileFailed")}: ${error.message}`);
            results.failed++;
        }

        // Small delay between UIDs
        if (i < uids.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Summary
    log(`\n${"─".repeat(60)}`);
    log(`  📊 Summary:`);
    log(`     New: ${results.fetched} | Updated: ${results.updated} | No changes: ${results.noChanges} | Failed: ${results.failed}`);
    log("─".repeat(60));

    await waitForKeyPressed();
};

