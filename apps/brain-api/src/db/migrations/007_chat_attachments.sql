-- Add attachments support to team chat messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Index for conversation sharing (finding shared conversations)
CREATE TABLE IF NOT EXISTS shared_conversations (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES users(id),
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, channel_id)
);
