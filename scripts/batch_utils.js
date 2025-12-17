import { sleep } from "./utils.js";
import { isCancelled } from "./cancellation.js";
import { S } from "./constants.js";
import { log } from "./logger.js";

/**
 * Print standardized batch download summary
 * @param {Array} results - Array of download results
 * @param {number} startTime - Start timestamp
 * @param {object} options - Configuration options
 * @param {string} options.mediaType - Type of media: 'photos', 'videos', or 'media'
 * @param {boolean} options.showPhotoVideoSplit - Show separate photo/video counts (for wall media)
 * @param {boolean} options.wasCancelled - Whether the batch was cancelled
 */
export const printBatchSummary = (results, startTime, options = {}) => {
    const { mediaType = 'media', showPhotoVideoSplit = false, wasCancelled = false } = options;
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(50));
    console.log('BATCH SUMMARY'.padStart(32));
    console.log('='.repeat(50));

    if (wasCancelled) {
        console.log(S.FgYellow + '⚠️  Batch was cancelled by user' + S.Reset);
    }

    console.log(`Total Users: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);

    if (successful.length > 0) {
        if (showPhotoVideoSplit) {
            // Wall media has separate photo/video counts
            const totalPhotos = successful.reduce((sum, r) => sum + (r.savedPhotos || 0), 0);
            const totalVideos = successful.reduce((sum, r) => sum + (r.savedVideos || 0), 0);
            const totalSkipped = successful.reduce((sum, r) => sum + (r.skipped || 0), 0);
            console.log(`Total Media Downloaded: ${totalPhotos} photos, ${totalVideos} videos`);
            console.log(`Total Skipped (duplicates): ${totalSkipped}`);
        } else {
            // Simple saved/skipped counts for photos or videos only
            const totalSaved = successful.reduce((sum, r) => sum + (r.saved || 0), 0);
            const totalSkipped = successful.reduce((sum, r) => sum + (r.skipped || 0), 0);
            const label = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
            console.log(`Total ${label} Downloaded: ${totalSaved}`);
            console.log(`Total Skipped (duplicates): ${totalSkipped}`);
        }
    }

    if (failed.length > 0) {
        console.log('\nFailed Users:');
        failed.forEach(r => {
            console.log(`  - ${r.userId}: ${r.error}`);
        });
    }

    console.log(`Time Elapsed: ${duration}s`);
    console.log('='.repeat(50) + '\n');
};

/**
 * Run batch download with consistent error handling and progress reporting
 * @param {string[]} userIds - Array of user IDs to process
 * @param {Function} downloadFn - Single-user download function (receives { targetId, ...options })
 * @param {object} options - Options to pass to each download function call
 * @param {object} config - Batch configuration
 * @param {string} config.mediaType - Type of media: 'photos', 'videos', or 'wall media'
 * @param {boolean} config.showPhotoVideoSplit - Show separate photo/video counts in summary
 * @param {number} config.delayBetweenUsers - Delay in ms between processing users (default: 1000)
 * @returns {Array} Array of results with userId, success, and download stats
 */
export const runBatchDownload = async (userIds, downloadFn, options = {}, config = {}) => {
    const {
        mediaType = 'media',
        showPhotoVideoSplit = false,
        delayBetweenUsers = 1000
    } = config;

    const results = [];
    const totalUsers = userIds.length;
    const startTime = Date.now();
    let wasCancelled = false;

    console.log(`\n📦 Processing ${totalUsers} user(s)...\n`);

    for (let i = 0; i < totalUsers; i++) {
        // Check for cancellation before each user
        if (isCancelled()) {
            log(S.FgYellow + `⏸️  Batch cancelled after ${i} of ${totalUsers} users` + S.Reset);
            wasCancelled = true;
            break;
        }

        const userId = userIds[i];
        console.log(`[${i + 1}/${totalUsers}] Downloading ${mediaType} from user ${userId}...`);

        try {
            const result = await downloadFn({
                targetId: userId,
                ...options
            });

            results.push({
                userId,
                success: true,
                ...result
            });

            // Log individual result
            if (showPhotoVideoSplit && result.savedPhotos !== undefined) {
                console.log(`✅ User ${userId}: ${result.savedPhotos} photos, ${result.savedVideos} videos saved | ${result.skippedPhotos || 0}+${result.skippedVideos || 0} skipped`);
            } else {
                console.log(`✅ User ${userId}: ${result.saved} saved, ${result.skipped} skipped`);
            }

        } catch (error) {
            results.push({
                userId,
                success: false,
                error: error.message
            });

            console.log(`❌ User ${userId}: ${error.message}`);
        }

        // Small delay between users to avoid rate limiting
        if (i < totalUsers - 1 && delayBetweenUsers > 0 && !isCancelled()) {
            await sleep(delayBetweenUsers);
        }
    }

    // Print summary
    printBatchSummary(results, startTime, { mediaType, showPhotoVideoSplit, wasCancelled });

    return results;
};
