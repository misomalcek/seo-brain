-- Migration 010: HTML Reports
CREATE TABLE IF NOT EXISTS html_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE,
  data_sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_html_reports_user ON html_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_html_reports_token ON html_reports(share_token);
