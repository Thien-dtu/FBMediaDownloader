# FB Media Downloader - Troubleshooting Guide

## ❌ Error: "Invalid request" OAuthException

This error occurs when your Facebook access token is missing required permissions or trying to access unauthorized data.

---

## 🔧 Quick Fix Steps

### Step 1: Get a New Access Token with Correct Permissions

1. **Open Facebook Graph API Explorer**
   - URL: https://developers.facebook.com/tools/explorer/

2. **Click "Generate Access Token"**

3. **Enable Required Permissions:**
   - ✅ `user_posts` - Required to read posts
   - ✅ `user_photos` - Required to download photos
   - ✅ `user_videos` - Required to download videos
   
   **For Pages (if downloading from a page you manage):**
   - ✅ `pages_read_engagement`
   - ✅ `pages_show_list`

4. **Copy the Generated Token**

5. **Update config.js**
   - Open `config.js`
   - Replace the `ACCESS_TOKEN` value with your new token
   - Example:
   ```javascript
   export const ACCESS_TOKEN = "YOUR_NEW_TOKEN_HERE";
   ```

### Step 2: Use the Correct User ID

**Your Facebook User ID:** `3388775101304010`

When the tool asks for a user ID:
- ✅ Enter `me` (to download your own data)
- ✅ Enter `3388775101304010` (your actual ID)
- ❌ Do NOT use other people's IDs (like `100009299031474`) - Facebook blocks this!

---

## 🧪 Test Your Token

Run this command to verify your token works:

\`\`\`bash
node test_token.js
\`\`\`

**Expected output if working:**
\`\`\`
✅ Token is valid!
👤 User: [Your Name]
✓ user_posts
✓ user_photos
✓ user_videos
✅ Feed access works!
\`\`\`

---

## 📋 Common Issues

### Issue 1: "Token is invalid or expired"
**Solution:** Generate a new token (Step 1 above)

### Issue 2: "Missing recommended permissions"
**Solution:** Regenerate token and make sure to check all required permissions

### Issue 3: "Feed access returned no data"
**Possible causes:**
- Missing permissions
- Trying to access someone else's data
- Your wall/timeline is empty

### Issue 4: Cannot access other users' data
**This is normal!** Facebook's privacy policy prevents apps from accessing other users' data unless:
- They explicitly granted permission to YOUR app
- Your app is in Production mode with approved permissions
- Even then, access is very limited

**Workaround:** You can only download:
- ✅ Your own photos/videos
- ✅ Pages you admin (with page token)
- ✅ Groups you admin (with group admin approval)

---

## 🔐 Token Types

### Short-lived Token (1-2 hours)
- What you get from Graph API Explorer
- Good for testing
- Expires quickly

### Long-lived Token (60 days)
- Convert from short-lived token
- Better for regular use
- URL to convert:
  \`\`\`
  https://graph.facebook.com/oauth/access_token?
    grant_type=fb_exchange_token&
    client_id=YOUR_APP_ID&
    client_secret=YOUR_APP_SECRET&
    fb_exchange_token=YOUR_SHORT_LIVED_TOKEN
  \`\`\`

---

## 📚 Additional Resources

- [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Graph API Documentation](https://developers.facebook.com/docs/graph-api)
- [Permissions Reference](https://developers.facebook.com/docs/permissions/reference)

---

## ✅ Checklist Before Running

- [ ] Generated new access token
- [ ] Enabled `user_posts`, `user_photos`, `user_videos` permissions
- [ ] Updated `ACCESS_TOKEN` in `config.js`
- [ ] Tested token with `node test_token.js`
- [ ] Using correct user ID (your own ID or "me")

---

## 🆘 Still Having Issues?

Run the diagnostic tool:
\`\`\`bash
node test_token.js
\`\`\`

This will show you exactly what's wrong with your token and permissions.
