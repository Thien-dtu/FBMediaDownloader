-- Migration v3: Add HD tracking and file path columns
-- Run this on existing databases to add new columns

-- Add is_hd column to track if media was downloaded in HD quality
ALTER TABLE saved_media ADD COLUMN is_hd BOOLEAN DEFAULT 0;

-- Add file_path column to track where the file is stored
ALTER TABLE saved_media ADD COLUMN file_path TEXT;

-- Create index for efficient HD upgrade queries
CREATE INDEX IF NOT EXISTS idx_saved_media_hd_status
    ON saved_media(user_id, is_hd);
