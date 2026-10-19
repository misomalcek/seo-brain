-- Migration 005: User reports tracking + Team workspace
-- Created: 2026-02-13

-- Track report ownership (MCP tool reports)
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  conversation_id UUID REFERENCES conversations(id),
  filename TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_type TEXT NOT NULL, -- 'ahrefs' | 'gsc' | 'other'
  size_bytes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON user_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_created ON user_reports(user_id, created_at DESC);

-- Team workspace: shared items visible to all users
CREATE TABLE IF NOT EXISTS workspace_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'report', 'conversation')),
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_created ON workspace_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_type ON workspace_items(item_type);

-- Backfill existing reports into user_reports
-- Since we don't know who created existing reports, skip backfill.
-- New reports will be tracked going forward.
