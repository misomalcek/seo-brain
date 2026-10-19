-- Migration 006: Team Chat + Feedback
-- Created: 2026-02-13

-- ==================== TEAM CHAT ====================

CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('team', 'direct')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  mentions_brain BOOLEAN DEFAULT FALSE,
  brain_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tchat_msg_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tchat_msg_user ON chat_messages(user_id);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'offline',
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== FEEDBACK ====================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_index INTEGER,
  type VARCHAR(20) NOT NULL CHECK (type IN ('like', 'dislike', 'general', 'bug', 'feature')),
  content TEXT,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);

CREATE TABLE IF NOT EXISTS feedback_votes (
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (feedback_id, user_id)
);

-- ==================== SEED DATA ====================

-- Default #general team channel
INSERT INTO chat_channels (name, type) VALUES ('general', 'team') ON CONFLICT DO NOTHING;

-- Initialize presence for existing users
INSERT INTO user_presence (user_id, status, last_seen_at)
SELECT id, 'offline', NOW() FROM users
ON CONFLICT DO NOTHING;

-- Add all existing users to #general channel
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT c.id, u.id FROM chat_channels c CROSS JOIN users u WHERE c.name = 'general'
ON CONFLICT DO NOTHING;
