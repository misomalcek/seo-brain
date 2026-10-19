-- Migration 004: User files
-- Store uploaded files metadata (actual files on filesystem)

CREATE TABLE IF NOT EXISTS user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_created ON user_files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON user_files(conversation_id);
