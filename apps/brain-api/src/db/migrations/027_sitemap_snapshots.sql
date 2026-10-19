-- Sitemap crawl snapshots — monthly URL inventory with meta/status
-- Migration 027 | 2026-03-26

CREATE TABLE sitemap_snapshots (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  url TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  response_code INTEGER,
  is_indexable BOOLEAN DEFAULT TRUE,
  canonical_url TEXT,
  hreflang TEXT,
  page_size_bytes INTEGER,
  content_length INTEGER,  -- char count of body text
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date, url)
);

CREATE INDEX idx_sitemap_domain_date ON sitemap_snapshots (domain, snapshot_date DESC);
CREATE INDEX idx_sitemap_url ON sitemap_snapshots (url);
CREATE INDEX idx_sitemap_response ON sitemap_snapshots (response_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON sitemap_snapshots TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE sitemap_snapshots_id_seq TO brain_app;

INSERT INTO _migrations (name) VALUES ('027_sitemap_snapshots');
