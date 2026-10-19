-- Migration 020: Add is_shared column to user_files for file sharing
-- Date: 2026-02-26

ALTER TABLE user_files ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_files_shared ON user_files(is_shared) WHERE is_shared = TRUE;

-- Track migration
INSERT INTO _migrations (name) VALUES ('020_user_files_sharing') ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON user_files TO brain_app;
