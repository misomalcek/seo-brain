-- Migration 022: Ahrefs Tiered Snapshot Tables
-- Separate tables for different snapshot data types (keywords, links, audit, competitors)
-- Supports monthly automated snapshots + on-demand dashboard refresh

-- T2: Keyword snapshots (organic keywords + KD enrichment)
CREATE TABLE IF NOT EXISTS ahrefs_keyword_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tier VARCHAR(10) NOT NULL DEFAULT 'T2a',
  keywords JSONB,
  kd_enrichment JSONB,
  keyword_count INTEGER DEFAULT 0,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date, tier)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_kw_snap_domain ON ahrefs_keyword_snapshots(domain);
CREATE INDEX IF NOT EXISTS idx_ahrefs_kw_snap_date ON ahrefs_keyword_snapshots(snapshot_date DESC);

-- T3: Link snapshots (top_pages, referring_domains, broken_backlinks, anchors, pages_by_backlinks, internal_links)
CREATE TABLE IF NOT EXISTS ahrefs_link_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  top_pages JSONB,
  referring_domains JSONB,
  broken_backlinks JSONB,
  anchors JSONB,
  pages_by_backlinks JSONB,
  internal_links JSONB,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_link_snap_domain ON ahrefs_link_snapshots(domain);
CREATE INDEX IF NOT EXISTS idx_ahrefs_link_snap_date ON ahrefs_link_snapshots(snapshot_date DESC);

-- T5: Audit snapshots (site audit issues + health score)
CREATE TABLE IF NOT EXISTS ahrefs_audit_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  project_id VARCHAR(100),
  issues JSONB,
  health_score INTEGER,
  total_issues INTEGER DEFAULT 0,
  critical_issues INTEGER DEFAULT 0,
  warning_issues INTEGER DEFAULT 0,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_audit_snap_domain ON ahrefs_audit_snapshots(domain);
CREATE INDEX IF NOT EXISTS idx_ahrefs_audit_snap_date ON ahrefs_audit_snapshots(snapshot_date DESC);

-- T4: Competitor snapshots (organic competitors + keyword ideas)
CREATE TABLE IF NOT EXISTS ahrefs_competitor_snapshots (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  competitors JSONB,
  keyword_ideas JSONB,
  keyword_cluster VARCHAR(255),
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_comp_snap_domain ON ahrefs_competitor_snapshots(domain);
CREATE INDEX IF NOT EXISTS idx_ahrefs_comp_snap_date ON ahrefs_competitor_snapshots(snapshot_date DESC);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ahrefs_keyword_snapshots TO brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ahrefs_link_snapshots TO brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ahrefs_audit_snapshots TO brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ahrefs_competitor_snapshots TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE ahrefs_keyword_snapshots_id_seq TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE ahrefs_link_snapshots_id_seq TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE ahrefs_audit_snapshots_id_seq TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE ahrefs_competitor_snapshots_id_seq TO brain_app;
