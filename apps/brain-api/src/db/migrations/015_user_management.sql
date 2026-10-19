-- Migration 015: User management enhancements
-- Adds is_active, must_change_password to users + deletion audit log

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Audit log for deleted users (preserves token history)
CREATE TABLE IF NOT EXISTS user_deletions_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Ensure indexes exist for token usage query performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
