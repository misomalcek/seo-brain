-- Migration 003: Persona support
-- Add persona tracking to conversations and messages

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS persona_id VARCHAR(50);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS persona_id VARCHAR(50);

-- Deliberation sessions (multi-persona analysis)
CREATE TABLE IF NOT EXISTS persona_deliberations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  personas TEXT[] NOT NULL,
  responses JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delib_user ON persona_deliberations(user_id);
CREATE INDEX IF NOT EXISTS idx_delib_created ON persona_deliberations(created_at DESC);
