import fetch from 'node-fetch';
import { FB_API_HOST, S } from './constants.js';
import { ACCESS_TOKEN, PLATFORM_FACEBOOK } from '../config.js';
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
 * Permission descriptions in Vietnamese
 */
const PERMISSION_DESCRIPTIONS = {
    // User data
    'user_photos': 'Ảnh của người dùng',
    'user_posts': 'Bài đăng của người dùng',
    'user_videos': 'Video của người dùng',
    'user_about_me': 'Thông tin giới thiệu bản thân',
    'user_birthday': 'Ngày sinh',
    'user_education_history': 'Lịch sử học vấn',
    'user_events': 'Sự kiện của người dùng',
    'user_friends': 'Danh sách bạn bè',
    'user_hometown': 'Quê quán',
    'user_likes': 'Các trang đã thích',
    'user_location': 'Vị trí hiện tại',
    'user_messenger_contact': 'Liên hệ Messenger',
    'user_relationship_details': 'Chi tiết mối quan hệ',
    'user_relationships': 'Tình trạng mối quan hệ',
    'user_religion_politics': 'Tôn giáo và chính trị',
    'user_website': 'Website cá nhân',
    'user_work_history': 'Lịch sử công việc',
    'user_managed_groups': 'Nhóm do người dùng quản lý',
    'user_age_range': 'Độ tuổi',
    'user_gender': 'Giới tính',
    'user_link': 'Liên kết hồ sơ',
    'user_groups': 'Nhóm',

    // Profile & Auth
    'public_profile': 'Thông tin công khai (tên, ảnh đại diện)',
    'email': 'Địa chỉ email',
    'openid': 'Xác thực OpenID',
    'offline_access': 'Truy cập ngoại tuyến (token dài hạn)',

    // Ads
    'ads_management': 'Quản lý quảng cáo',
    'ads_read': 'Đọc quảng cáo',
    'attribution_read': 'Đọc dữ liệu phân bổ quảng cáo',
    'read_ads_dataset_quality': 'Đọc chất lượng dataset quảng cáo',
    'paid_marketing_messages': 'Tin nhắn marketing trả phí',

    // Business
    'business_management': 'Quản lý doanh nghiệp',
    'business_creative_transfer': 'Chuyển nội dung sáng tạo doanh nghiệp',

    // Commerce
    'catalog_management': 'Quản lý danh mục sản phẩm',
    'commerce_account_manage_orders': 'Quản lý đơn hàng',
    'commerce_account_read_orders': 'Đọc đơn hàng',
    'commerce_account_read_reports': 'Đọc báo cáo thương mại',
    'commerce_account_read_settings': 'Đọc cài đặt thương mại',

    // Pages
    'pages_show_list': 'Xem danh sách trang quản lý',
    'pages_read_engagement': 'Đọc tương tác trang',
    'pages_read_user_content': 'Đọc nội dung người dùng trên trang',
    'pages_manage_posts': 'Quản lý bài đăng trang',
    'pages_manage_ads': 'Quản lý quảng cáo trang',
    'pages_manage_cta': 'Quản lý nút kêu gọi hành động',
    'pages_manage_engagement': 'Quản lý tương tác trang',
    'pages_manage_instant_articles': 'Quản lý bài viết tức thì',
    'pages_manage_metadata': 'Quản lý metadata trang',
    'pages_manage_store_location': 'Quản lý vị trí cửa hàng',
    'pages_messaging': 'Nhắn tin từ trang',
    'pages_messaging_phone_number': 'Nhắn tin qua số điện thoại',
    'pages_messaging_subscriptions': 'Đăng ký nhắn tin trang',
    'pages_utility_messaging': 'Tin nhắn tiện ích trang',
    'page_events': 'Sự kiện của trang',
    'page_store_location_read': 'Đọc vị trí cửa hàng',
    'read_page_mailboxes': 'Đọc hộp thư trang',
    'publish_to_groups': 'Đăng lên nhóm',
    'publish_pages': 'Đăng lên trang',

    // Insights
    'read_insights': 'Đọc thống kê',
    'read_audience_network_insights': 'Đọc thống kê Audience Network',

    // Instagram
    'instagram_basic': 'Truy cập Instagram cơ bản',
    'instagram_content_publish': 'Đăng nội dung Instagram',
    'instagram_manage_comments': 'Quản lý bình luận Instagram',
    'instagram_manage_insights': 'Thống kê Instagram',
    'instagram_manage_events': 'Quản lý sự kiện Instagram',
    'instagram_manage_messages': 'Quản lý tin nhắn Instagram',
    'instagram_manage_upcoming_events': 'Sự kiện sắp tới Instagram',
    'instagram_shopping_tag_products': 'Gắn thẻ sản phẩm Shopping',
    'instagram_branded_content_ads_brand': 'Quảng cáo nội dung thương hiệu',
    'instagram_branded_content_brand': 'Nội dung thương hiệu (Brand)',
    'instagram_branded_content_creator': 'Nội dung thương hiệu (Creator)',
    'instagram_creator_marketplace_discovery': 'Khám phá Creator Marketplace',
    'instagram_creator_marketplace_messaging': 'Nhắn tin Creator Marketplace',

    // Threads
    'threads_business_basic': 'Threads Business cơ bản',
    'threads_location_tagging': 'Gắn thẻ vị trí Threads',
    'threads_profile_discovery': 'Khám phá hồ sơ Threads',

    // WhatsApp
    'whatsapp_business_manage_events': 'Quản lý sự kiện WhatsApp',
    'whatsapp_business_management': 'Quản lý WhatsApp Business',
    'whatsapp_business_messaging': 'Nhắn tin WhatsApp Business',

    // Other
    'gaming_user_locale': 'Ngôn ngữ người dùng game',
    'leads_retrieval': 'Truy xuất khách hàng tiềm năng',
    'manage_app_solution': 'Quản lý giải pháp ứng dụng',
    'manage_fundraisers': 'Quản lý chiến dịch gây quỹ',
    'private_computation_access': 'Truy cập tính toán riêng tư',
    'publish_video': 'Đăng video',
    'read_custom_friendlists': 'Đọc danh sách bạn bè tùy chỉnh',
    'rsvp_event': 'Phản hồi sự kiện',
    'test_expanded_granular': 'Quyền kiểm tra (dev)',
    'xmpp_login': 'Đăng nhập XMPP (chat)',
    'facebook_creator_marketplace_discovery': 'Khám phá Creator Marketplace FB',
};

/**
 * Display comprehensive token status at startup
 * @param {string} token - Access token
 * @param {object} validation - Validation result from validateTokenWithAPI
 * @param {Array} permissions - Array of granted permissions
 */
export const displayTokenStatus = (token, validation, permissions) => {
    console.log('\n' + S.FgCyan + '━'.repeat(70) + S.Reset);
    console.log(S.FgCyan + '  🔑 ACCESS TOKEN STATUS' + S.Reset);
    console.log(S.FgCyan + '━'.repeat(70) + S.Reset);

    // Token validity
    if (validation.valid) {
        console.log(S.FgGreen + '  ✅ Status: VALID' + S.Reset);
        console.log(`  👤 User: ${validation.user.name}`);
        console.log(`  🆔 User ID: ${validation.user.id}`);
    } else {
        console.log(S.BgRed + '  ❌ Status: INVALID' + S.Reset);
        console.log(S.FgRed + `  Error: ${validation.error}` + S.Reset);
        console.log(S.FgCyan + '━'.repeat(70) + S.Reset + '\n');
        return;
    }

    // Token preview (masked)
    const tokenPreview = token.substring(0, 10) + '...' + token.substring(token.length - 10);
    console.log(`  🔐 Token: ${tokenPreview}`);

    // Permissions - show ALL with Vietnamese descriptions
    console.log('\n  📋 Permissions (' + permissions.length + ' total):');
    console.log(S.FgCyan + '  ' + '─'.repeat(66) + S.Reset);

    // Sort permissions alphabetically
    const sortedPerms = [...permissions].sort((a, b) => a.localeCompare(b));

    sortedPerms.forEach(perm => {
        const description = PERMISSION_DESCRIPTIONS[perm] || 'Quyền Facebook';
        const icon = S.FgGreen + '✓' + S.Reset;
        const permDisplay = perm.padEnd(38);
        console.log(`     ${icon} ${permDisplay} ${description}`);
    });

    console.log(S.FgCyan + '━'.repeat(70) + S.Reset + '\n');
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
    // Use ACCESS_TOKEN from config (loaded from .env)
    const existingToken = ACCESS_TOKEN;

    if (!existingToken || existingToken.trim() === '') {
        console.log(S.BgYellow + '\n⚠️  No access token found in .env file!' + S.Reset);
        console.log('Please add FB_ACCESS_TOKEN to your .env file.');
        console.log('Get a token from: ' + S.FgCyan + 'https://developers.facebook.com/tools/explorer/' + S.Reset);
        return false;
    }

    console.log(S.FgCyan + '🔍 Validating access token...' + S.Reset);

    try {
        const validation = await validateTokenWithAPI(existingToken);

        if (validation.valid) {
            const permissions = await getTokenPermissions(existingToken);

            // Display comprehensive token status
            displayTokenStatus(existingToken, validation, permissions);

            return true;
        }

        // Token is invalid
        console.log(S.BgRed + '\n❌ Access token is invalid or expired' + S.Reset);
        console.log(S.FgRed + `Error: ${validation.error}` + S.Reset);
        console.log('\nPlease update FB_ACCESS_TOKEN in your .env file with a valid token.');
        return false;

    } catch (error) {
        console.log(S.FgYellow + '⚠️  Could not validate token: ' + error.message + S.Reset);
        console.log('Proceeding anyway - validation will occur on first API call.');
        return true; // Allow proceeding on network errors
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
