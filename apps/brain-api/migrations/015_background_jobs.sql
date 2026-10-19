-- Migration 015: Background jobs queue
-- Stores async Claude API jobs that run server-side with polling notifications

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID,
  title TEXT NOT NULL DEFAULT 'Background task',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  request_payload JSONB NOT NULL,
  result_content TEXT,
  tools_used JSONB DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_user_status ON background_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_created ON background_jobs(status, created_at);
