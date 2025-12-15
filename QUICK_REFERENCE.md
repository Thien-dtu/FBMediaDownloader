# FB Media Downloader - Quick Reference

## 📋 TL;DR (Too Long; Didn't Read)

**What it does**: Downloads photos and videos from Facebook using Graph API  
**How it works**: Interactive CLI menu → Select download type → Enter ID → Download media  
**Main tech**: Node.js + Facebook Graph API v21.0 + node-fetch

---

## 🎯 9 Main Features (Menu Options)

| # | Feature | What It Does |
|---|---------|--------------|
| 1 | **View Album Info** | Shows album details (name, count, link) |
| 2 | **Find Timeline Album** | Gets timeline album ID from a page |
| 3 | **Download Album** | Downloads all photos from an album |
| 4 | **Download Wall Media** | Downloads photos/videos from timeline posts |
| 5 | **Download User Media** | Downloads all photos OR videos uploaded by user |
| 6 | **Download from File** | Downloads URLs from a text file |
| 7 | **Language** | Switch between Vietnamese/English |
| 8 | **Help** | Shows contact info |
| 9 | **Exit** | Quit the app |

---

## 🗂️ File Structure (What Goes Where)

```
📁 FBMediaDownloader/
│
├── 📄 index.js                    # Start here: node index.js
├── 📄 config.js                   # ⚠️ PUT YOUR ACCESS TOKEN HERE
├── 📄 test_token.js               # Test if your token works
│
├── 📁 scripts/                    # Core code modules
│   ├── menu.js                    # CLI interface
│   ├── utils.js                   # Helper functions
│   ├── download_album.js          # Album downloads
│   ├── download_wall_media.js     # Wall/feed downloads
│   ├── download_user_photos.js    # User photo downloads
│   ├── download_user_videos.js    # User video downloads
│   └── lang.js                    # Translations
│
└── 📁 downloads/                  # ALL DOWNLOADS GO HERE
    ├── album_media/{albumId}/     # Feature 3 downloads
    ├── feed_media/{targetId}/     # Feature 4 downloads
    ├── user_photos/{userId}/      # Feature 5 (photos)
    ├── user_videos/{userId}/      # Feature 5 (videos)
    ├── links/                     # Link files (.txt)
    └── from-file/{folder}/        # Feature 6 downloads
```

---

## 🔄 Simple Code Flow

```
1. User runs: node index.js
   ↓
2. menu.js shows interactive menu
   ↓
3. User selects an option (1-9)
   ↓
4. menu.js calls the right function:
   - Option 3 → menuDownloadAlbum() → download_album.js
   - Option 4 → menuDownloadWallMedia() → download_wall_media.js
   - Option 5 → menuDownloadPhotoVideoOfUser() → download_user_photos.js or download_user_videos.js
   ↓
5. Download function uses utils.js to:
   a) myFetch() - Call Facebook API
   b) Parse response
   c) download() - Download each file
   d) Save to downloads/ folder
   ↓
6. Success! Files saved to disk
```

---

## 🧩 Key Modules Explained (Simple)

### **menu.js** - The Interface
- Shows the menu you see on screen
- Gets your input (album ID, user ID, etc.)
- Calls the right download function

### **download_album.js** - Album Downloads
- `fetchAlbumPhotos()` - Gets list of all photos in album
- `downloadAlbumPhoto()` - Downloads actual photo files
- Uses pagination to handle 1000s of photos

### **download_wall_media.js** - Wall/Feed Downloads
- `fetchWallMedia()` - Gets posts from timeline
- `getMediaFromAttachment()` - Extracts photos/videos from posts
- `downloadWallMedia()` - Downloads the media files

### **download_user_photos.js** / **download_user_videos.js**
- Gets ALL photos or videos uploaded by a user
- Not just from one album - from EVERYTHING they uploaded

### **utils.js** - The Helper
- `myFetch()` - Makes API calls to Facebook
- `download()` - Downloads files from URL
- `getLargestPhotoLink()` - Gets HD version of photo
- File operations (create folders, save files)

### **config.js** - Settings
- `ACCESS_TOKEN` ⚠️ **IMPORTANT**: Your Facebook token goes here
- Wait times between requests
- Output folders

---

## 🔌 Facebook API (How It Gets Data)

### **What the app calls:**

| Function | API Endpoint | Gets |
|----------|--------------|------|
| Album info | `GET /{albumId}` | Album details |
| Album photos | `GET /{albumId}/photos` | List of photos |
| User wall | `GET /{userId}/feed` | Timeline posts |
| User photos | `GET /{userId}/photos?type=uploaded` | All uploaded photos |
| User videos | `GET /{userId}/videos?type=uploaded` | All uploaded videos |
| HD photo | `GET /{photoId}?fields=largest_image` | Highest quality URL |

### **How pagination works:**

```
Page 1: API returns 100 items + "next cursor"
        ↓
Page 2: Use cursor to get next 100 items + "next cursor"
        ↓
Page 3: Use cursor to get next 100 items + "next cursor"
        ↓
...continues until no more "next cursor"
```

---

## 🎓 Typical Usage Flow (Example)

### **Scenario: Download all photos from your timeline**

1. **Get a token** (if expired):
   ```
   • Go to: https://developers.facebook.com/tools/explorer/
   • Generate token with: user_posts, user_photos, user_videos
   • Copy token to config.js
   ```

2. **Test token**:
   ```bash
   node test_token.js
   # Should show ✅ Token is valid!
   ```

3. **Run the app**:
   ```bash
   node index.js
   ```

4. **Navigate menu**:
   ```
   > Select: 4 (Download wall media)
   > Select: 1 (Download all photos/videos)
   > Enter ID: me
   > Pages: 0 (all pages)
   > Videos: 1 (yes, include videos)
   > HD: 1 (yes, highest quality)
   ```

5. **Wait for download**:
   ```
   Loading... [Progress shown in terminal]
   ```

6. **Check files**:
   ```
   Downloads saved to: downloads/feed_media/[your-id]/
   ```

---

## 🔐 Important Limitations

### ✅ You CAN download:
- Your own photos/videos
- Public content you have access to
- Pages/groups you manage

### ❌ You CANNOT download:
- Other people's private content
- Friends' photos (unless public)
- Photos you don't have permission to see

**Why?** Facebook's privacy policy prevents apps from accessing other users' data.

---

## 🚨 Common Issues & Quick Fixes

| Problem | Solution |
|---------|----------|
| "Invalid request" error | Token expired → Get new token |
| "Object does not exist" | Wrong user ID OR privacy restriction |
| "Missing permissions" | Token needs user_posts, user_photos, user_videos |
| Rate limited / banned | Increase `WAIT_BEFORE_NEXT_FETCH` in config.js |
| No photos downloaded | User might have no public photos OR wrong ID |

---

## 🎯 Pro Tips

1. **Use "me" instead of user ID** for your own data
2. **Start small** - Download 1 page first, then increase
3. **HD takes longer** - Disable if you just want quick downloads
4. **Check test_token.js** before big downloads
5. **Backup your token** - They expire every 60 days
6. **Use Option 2** (download links) first to see what you'll get before downloading files

---

## 📊 Performance Notes

- **100 photos/page** (album downloads)
- **~25 posts/page** (wall downloads)
- **500ms delay** between requests (configurable)
- **Parallel downloads** NOT used (to avoid rate limits)

### Estimated Times (with default settings):
- 100 photos: ~2-3 minutes
- 1000 photos: ~20-30 minutes
- 100 videos: ~10-15 minutes (depends on video size)

---

## 📚 Documentation Files

- **PROJECT_OVERVIEW.md** ← Full detailed documentation
- **TROUBLESHOOTING.md** ← Fix errors and problems
- **README.md** (if exists) ← Getting started guide

---

**Quick Start**: 
```bash
1. Update ACCESS_TOKEN in config.js
2. Run: node index.js
3. Follow the menu prompts
```

That's it! 🎉
