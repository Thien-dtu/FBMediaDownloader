-- SQLite Database Schema v2 for Social Media Downloader
-- Migration to uid/uuid-based user system
-- Created: 2025-10-31

-- Enable foreign keys (must be set per connection in SQLite)
PRAGMA foreign_keys = ON;

-- ============================================================
-- Table: platforms
-- Purpose: Store platform reference data (facebook, instagram)
-- ============================================================
CREATE TABLE IF NOT EXISTS platforms (
    platform_id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_name TEXT NOT NULL UNIQUE,
    base_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: users
-- Purpose: Central table for users identified by stable uid/uuid
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER NOT NULL,
    uid TEXT NOT NULL,  -- Facebook UID or Instagram UUID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (platform_id) REFERENCES platforms(platform_id),
    UNIQUE(platform_id, uid)
);

-- ============================================================
-- Table: username_history
-- Purpose: Track username changes over time
-- ============================================================
CREATE TABLE IF NOT EXISTS username_history (
    user_his_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    profile_url TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_current BOOLEAN DEFAULT 1,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Table: user_profiles
-- Purpose: Store detailed Facebook user profile information
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    
    -- Basic info
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    about TEXT,                          -- user_about_me
    email TEXT,
    link TEXT,                           -- user_link - profile URL
    
    -- Personal details
    birthday TEXT,                       -- Format: MM/DD/YYYY or partial
    age_range_min INTEGER,               -- user_age_range
    age_range_max INTEGER,
    gender TEXT,
    
    -- Location info
    hometown TEXT,                       -- JSON: {id, name}
    location TEXT,                       -- JSON: {id, name} - current city
    
    -- Relationship
    relationship_status TEXT,            -- user_relationships
    significant_other TEXT,              -- JSON: {id, name}
    
    -- Religious/Political views
    religion TEXT,
    political TEXT,
    
    -- Work & Education (JSON arrays)
    work_history TEXT,                   -- JSON array of work entries
    education_history TEXT,              -- JSON array of education entries
    
    -- Social
    website TEXT,                        -- user_website
    
    -- Counts (may not always be available)
    friend_count INTEGER,
    
    -- Timestamps
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Table: user_profiles_history
-- Purpose: Store historical snapshots of profile changes
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- All profile fields (mirror of user_profiles)
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    about TEXT,
    email TEXT,
    link TEXT,
    birthday TEXT,
    age_range_min INTEGER,
    age_range_max INTEGER,
    gender TEXT,
    hometown TEXT,
    location TEXT,
    relationship_status TEXT,
    significant_other TEXT,
    religion TEXT,
    political TEXT,
    work_history TEXT,
    education_history TEXT,
    website TEXT,
    friend_count INTEGER,
    hometown_id INTEGER,
    current_location_id INTEGER,
    significant_other_uid TEXT,
    
    -- Change metadata
    changed_fields TEXT,  -- JSON array of field names that changed
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Table: fb_pages
-- Purpose: Store Facebook page info (for likes - normalized)
-- ============================================================
CREATE TABLE IF NOT EXISTS fb_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL UNIQUE,       -- Facebook page ID
    page_name TEXT,                      -- Page name (can be updated)
    page_url TEXT,                       -- Page URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: user_page_likes
-- Purpose: Junction table linking users to pages they've liked
-- ============================================================
CREATE TABLE IF NOT EXISTS user_page_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fb_page_id INTEGER NOT NULL,         -- References fb_pages.id
    liked_at DATETIME,                   -- When the user liked the page
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fb_page_id) REFERENCES fb_pages(id) ON DELETE CASCADE,
    UNIQUE(user_id, fb_page_id)          -- Prevent duplicate likes
);

-- ============================================================
-- Table: fb_entities
-- Purpose: Unified table for all Facebook entities (locations, employers, schools, positions)
-- ============================================================
CREATE TABLE IF NOT EXISTS fb_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fb_id TEXT UNIQUE,                   -- Facebook entity ID
    name TEXT,                           -- Entity name
    entity_type TEXT,                    -- 'location', 'employer', 'school', 'position', 'concentration'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: user_work_history
-- Purpose: Junction table for user employment history (normalized)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_work_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    employer_id INTEGER,                 -- FK fb_entities (employer)
    position_id INTEGER,                 -- FK fb_entities (position)
    location_id INTEGER,                 -- FK fb_entities (work location)
    start_date TEXT,
    end_date TEXT,
    fb_work_id TEXT,                     -- Facebook work entry ID
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (employer_id) REFERENCES fb_entities(id),
    FOREIGN KEY (position_id) REFERENCES fb_entities(id),
    FOREIGN KEY (location_id) REFERENCES fb_entities(id),
    UNIQUE(user_id, fb_work_id)
);

-- ============================================================
-- Table: user_education_history
-- Purpose: Junction table for user education history (normalized)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_education_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    school_id INTEGER,                   -- FK fb_entities (school)
    concentration_id INTEGER,            -- FK fb_entities (field of study)
    education_type TEXT,                 -- 'College', 'High School', etc.
    year TEXT,
    fb_education_id TEXT,                -- Facebook education entry ID
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (school_id) REFERENCES fb_entities(id),
    FOREIGN KEY (concentration_id) REFERENCES fb_entities(id),
    UNIQUE(user_id, fb_education_id)
);

-- ============================================================
-- Table: api_types
-- Purpose: Store different API endpoint types
-- ============================================================
CREATE TABLE IF NOT EXISTS api_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Table: saved_media
-- Purpose: Track downloaded media with HD quality status
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    media_id TEXT NOT NULL,
    is_hd BOOLEAN DEFAULT 0,        -- 1 if downloaded in HD quality
    file_path TEXT,                  -- Path where file is stored
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, media_id)
);

-- ============================================================
-- Table: user_cursors
-- Purpose: Store pagination cursors
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cursors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    api_type_id INTEGER NOT NULL,
    cursor TEXT NOT NULL,
    pages_loaded INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (api_type_id) REFERENCES api_types(id) ON DELETE CASCADE,
    UNIQUE(user_id, api_type_id)
);

-- ============================================================
-- Table: api_reports
-- Purpose: Store API call session metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS api_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_type_id INTEGER NOT NULL,
    timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (api_type_id) REFERENCES api_types(id)
);

-- ============================================================
-- Table: report_details
-- Purpose: Store individual user results within an API report
-- ============================================================
CREATE TABLE IF NOT EXISTS report_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    url TEXT,
    total_items INTEGER DEFAULT 0,
    items_saved INTEGER DEFAULT 0,
    items_not_saved INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    pages_fetched INTEGER DEFAULT 0,
    media_ids TEXT,  -- JSON array: '["id1", "id2", ...]'

    FOREIGN KEY (report_id) REFERENCES api_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES for Performance
-- ============================================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_platform_uid
    ON users(platform_id, uid);

-- Username history indexes
CREATE INDEX IF NOT EXISTS idx_username_history_user
    ON username_history(user_id);

CREATE INDEX IF NOT EXISTS idx_username_history_current
    ON username_history(user_id, is_current);

CREATE INDEX IF NOT EXISTS idx_username_history_username
    ON username_history(username);

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
    ON user_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_name
    ON user_profiles(name);

CREATE INDEX IF NOT EXISTS idx_user_profiles_fetched
    ON user_profiles(fetched_at);

-- FB pages indexes
CREATE INDEX IF NOT EXISTS idx_fb_pages_page_id
    ON fb_pages(page_id);

CREATE INDEX IF NOT EXISTS idx_fb_pages_name
    ON fb_pages(page_name);

-- User page likes indexes
CREATE INDEX IF NOT EXISTS idx_user_page_likes_user
    ON user_page_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_user_page_likes_page
    ON user_page_likes(fb_page_id);

CREATE INDEX IF NOT EXISTS idx_user_page_likes_liked_at
    ON user_page_likes(liked_at);

-- FB entities indexes
CREATE INDEX IF NOT EXISTS idx_fb_entities_fb_id
    ON fb_entities(fb_id);

CREATE INDEX IF NOT EXISTS idx_fb_entities_name
    ON fb_entities(name);

CREATE INDEX IF NOT EXISTS idx_fb_entities_type
    ON fb_entities(entity_type);

CREATE INDEX IF NOT EXISTS idx_fb_entities_type_name
    ON fb_entities(entity_type, name);

-- User work history indexes
CREATE INDEX IF NOT EXISTS idx_user_work_user
    ON user_work_history(user_id);

CREATE INDEX IF NOT EXISTS idx_user_work_employer
    ON user_work_history(employer_id);

CREATE INDEX IF NOT EXISTS idx_user_work_location
    ON user_work_history(location_id);

-- User education history indexes
CREATE INDEX IF NOT EXISTS idx_user_edu_user
    ON user_education_history(user_id);

CREATE INDEX IF NOT EXISTS idx_user_edu_school
    ON user_education_history(school_id);

-- Saved media indexes
CREATE INDEX IF NOT EXISTS idx_saved_media_user
    ON saved_media(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_media_lookup
    ON saved_media(user_id, media_id);

CREATE INDEX IF NOT EXISTS idx_saved_media_created
    ON saved_media(created_at);

CREATE INDEX IF NOT EXISTS idx_saved_media_hd_status
    ON saved_media(user_id, is_hd);

-- Cursor indexes
CREATE INDEX IF NOT EXISTS idx_user_cursors_lookup
    ON user_cursors(user_id, api_type_id);

-- Report indexes
CREATE INDEX IF NOT EXISTS idx_reports_timestamp
    ON api_reports(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reports_api_type
    ON api_reports(api_type_id);

CREATE INDEX IF NOT EXISTS idx_report_details_report
    ON report_details(report_id);

CREATE INDEX IF NOT EXISTS idx_report_details_user
    ON report_details(user_id);

-- ============================================================
-- VIEWS for Common Queries
-- ============================================================

-- View: User statistics
CREATE VIEW IF NOT EXISTS v_user_stats AS
SELECT
    u.id,
    u.uid,
    uh.username,
    p.platform_name,
    COUNT(DISTINCT sm.id) as total_saved_media,
    COUNT(DISTINCT upl.id) as total_page_likes,
    MAX(sm.created_at) as last_download_date
FROM users u
JOIN platforms p ON u.platform_id = p.platform_id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1
LEFT JOIN saved_media sm ON u.id = sm.user_id
LEFT JOIN user_page_likes upl ON u.id = upl.user_id
GROUP BY u.id, u.uid, uh.username, p.platform_name;

-- View: User profiles with easy access
CREATE VIEW IF NOT EXISTS v_user_profiles AS
SELECT 
    u.uid,
    u.platform_id,
    up.*,
    uh.username as current_username
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1;

-- View: User likes with easy access (normalized)
CREATE VIEW IF NOT EXISTS v_user_page_likes AS
SELECT 
    u.uid,
    fp.page_id,
    fp.page_name,
    upl.liked_at,
    upl.fetched_at,
    uh.username as current_username
FROM users u
JOIN user_page_likes upl ON u.id = upl.user_id
JOIN fb_pages fp ON upl.fb_page_id = fp.id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1;

-- View: User profiles with location names (normalized)
CREATE VIEW IF NOT EXISTS v_user_profiles_full AS
SELECT 
    u.uid,
    up.*,
    ht.name as hometown_name,
    loc.name as location_name,
    uh.username as current_username
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN fb_entities ht ON up.hometown_id = ht.id
LEFT JOIN fb_entities loc ON up.current_location_id = loc.id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1;

-- View: Work history with entity names
CREATE VIEW IF NOT EXISTS v_user_work AS
SELECT 
    u.uid,
    emp.name as employer_name,
    pos.name as position_name,
    loc.name as work_location,
    wh.start_date,
    wh.end_date
FROM user_work_history wh
JOIN users u ON wh.user_id = u.id
LEFT JOIN fb_entities emp ON wh.employer_id = emp.id
LEFT JOIN fb_entities pos ON wh.position_id = pos.id
LEFT JOIN fb_entities loc ON wh.location_id = loc.id;

-- View: Education history with entity names
CREATE VIEW IF NOT EXISTS v_user_education AS
SELECT 
    u.uid,
    sch.name as school_name,
    con.name as concentration_name,
    eh.education_type,
    eh.year
FROM user_education_history eh
JOIN users u ON eh.user_id = u.id
LEFT JOIN fb_entities sch ON eh.school_id = sch.id
LEFT JOIN fb_entities con ON eh.concentration_id = con.id;

-- View: Recent reports with details
CREATE VIEW IF NOT EXISTS v_recent_reports AS
SELECT
    ar.id as report_id,
    at.name as api_name,
    ar.timestamp,
    u.uid,
    uh.username,
    p.platform_name,
    rd.url,
    rd.total_items,
    rd.items_saved,
    rd.items_not_saved,
    rd.duration,
    rd.pages_fetched,
    rd.media_ids
FROM api_reports ar
JOIN api_types at ON ar.api_type_id = at.id
JOIN report_details rd ON ar.id = rd.report_id
JOIN users u ON rd.user_id = u.id
JOIN platforms p ON u.platform_id = p.platform_id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1
ORDER BY ar.timestamp DESC;

-- View: API performance metrics
CREATE VIEW IF NOT EXISTS v_api_performance AS
SELECT
    at.name as api_name,
    COUNT(DISTINCT ar.id) as total_calls,
    COUNT(DISTINCT u.uid) as unique_users,
    SUM(rd.total_items) as total_items_fetched,
    SUM(rd.items_saved) as total_items_saved,
    AVG(rd.duration) as avg_duration_seconds,
    AVG(rd.pages_fetched) as avg_pages_per_call
FROM api_types at
JOIN api_reports ar ON at.id = ar.api_type_id
JOIN report_details rd ON ar.id = rd.report_id
JOIN users u ON rd.user_id = u.id
GROUP BY at.name;

-- View: Current usernames (easy lookup)
CREATE VIEW IF NOT EXISTS v_current_usernames AS
SELECT
    u.id as user_id,
    u.uid,
    p.platform_name,
    uh.username,
    uh.profile_url
FROM users u
JOIN platforms p ON u.platform_id = p.platform_id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1;

-- ============================================================
-- TRIGGERS for Data Integrity
-- ============================================================

-- Trigger: Update last_updated on cursor changes
CREATE TRIGGER IF NOT EXISTS trg_update_cursor_timestamp
AFTER UPDATE ON user_cursors
FOR EACH ROW
BEGIN
    UPDATE user_cursors
    SET last_updated = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Trigger: Update updated_at on user_profiles changes
CREATE TRIGGER IF NOT EXISTS trg_user_profiles_updated
AFTER UPDATE ON user_profiles
FOR EACH ROW
BEGIN
    UPDATE user_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Insert platforms
INSERT OR IGNORE INTO platforms (platform_name, base_url) VALUES
    ('facebook', 'https://www.facebook.com'),
    ('instagram', 'https://www.instagram.com');

-- Insert common API types
INSERT OR IGNORE INTO api_types (name) VALUES
    ('get_list_fb_user_photos'),
    ('get_list_fb_user_reels'),
    ('get_list_fb_highlights'),
    ('get_list_ig_post'),
    ('get_list_ig_user_stories');
