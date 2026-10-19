-- GSC snapshot summary storage (DB mirror of nightly JSON snapshots)
-- JSON files remain for full 1000-row data; DB stores summary metrics

CREATE TABLE IF NOT EXISTS gsc_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_clicks INTEGER,
  total_impressions INTEGER,
  avg_ctr NUMERIC(6,4),
  avg_position NUMERIC(6,2),
  total_queries INTEGER,
  top_queries JSONB, -- top 20 [{query, clicks, impressions, ctr, position}]
  top_pages JSONB, -- top 10 [{page, clicks, impressions}]
  date_range_start DATE,
  date_range_end DATE,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  json_file VARCHAR(500), -- path to full JSON snapshot
  UNIQUE(domain, snapshot_date)
);

CREATE INDEX idx_gsc_snapshots_domain ON gsc_snapshots(domain);
CREATE INDEX idx_gsc_snapshots_date ON gsc_snapshots(snapshot_date DESC);
CREATE INDEX idx_gsc_snapshots_domain_date ON gsc_snapshots(domain, snapshot_date DESC);
