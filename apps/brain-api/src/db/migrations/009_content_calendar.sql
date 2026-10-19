-- Migration 009: Content Calendar
CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea','brief','draft','review','published','archived')),
  content_type VARCHAR(30) NOT NULL DEFAULT 'article'
    CHECK (content_type IN ('article','landing-page','guide','case-study','infographic','video-script')),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deadline TIMESTAMPTZ,
  url TEXT,
  keywords TEXT[] DEFAULT '{}',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_site ON content_items(site_id);
CREATE INDEX IF NOT EXISTS idx_content_assignee ON content_items(assignee_id);
CREATE INDEX IF NOT EXISTS idx_content_deadline ON content_items(deadline);
