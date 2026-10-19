-- Dashboard Snapshots: pre-generated HTML dashboard snapshots
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_type VARCHAR(30) NOT NULL CHECK (dashboard_type IN ('seo', 'content', 'ceo')),
  site_id UUID REFERENCES sites(id),
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  data_summary JSONB,
  generated_by UUID REFERENCES users(id),
  is_latest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_type ON dashboard_snapshots(dashboard_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_latest ON dashboard_snapshots(dashboard_type, is_latest) WHERE is_latest = TRUE;
