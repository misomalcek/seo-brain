-- Ahrefs snapshot storage (nightly domain metrics cache)
-- Replaces MCP cache for core domain metrics with structured, queryable data

CREATE TABLE IF NOT EXISTS ahrefs_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  domain_rating NUMERIC(5,2),
  ahrefs_rank INTEGER,
  organic_keywords INTEGER,
  organic_traffic INTEGER,
  organic_value INTEGER, -- USD cents
  referring_domains INTEGER,
  backlinks INTEGER,
  top_keywords JSONB, -- top 20 keywords [{keyword, position, volume, traffic}]
  top_pages JSONB, -- top 10 pages [{url, traffic, keywords}]
  raw_data JSONB, -- full API response for detailed queries
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date)
);

CREATE INDEX idx_ahrefs_snapshots_domain ON ahrefs_snapshots(domain);
CREATE INDEX idx_ahrefs_snapshots_date ON ahrefs_snapshots(snapshot_date DESC);
CREATE INDEX idx_ahrefs_snapshots_domain_date ON ahrefs_snapshots(domain, snapshot_date DESC);
