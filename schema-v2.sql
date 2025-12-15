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
    MAX(sm.created_at) as last_download_date
FROM users u
JOIN platforms p ON u.platform_id = p.platform_id
LEFT JOIN username_history uh ON u.id = uh.user_id AND uh.is_current = 1
LEFT JOIN saved_media sm ON u.id = sm.user_id
GROUP BY u.id, u.uid, uh.username, p.platform_name;

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
