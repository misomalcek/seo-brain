-- Competitor tracking (periodic snapshots of competitor domains)
-- Enables trend analysis: DR changes, keyword movements, backlink growth

CREATE TABLE IF NOT EXISTS competitor_tracking (
  id SERIAL PRIMARY KEY,
  our_domain VARCHAR(255) NOT NULL, -- which of our domains this competitor relates to
  competitor_domain VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  domain_rating NUMERIC(5,2),
  organic_keywords INTEGER,
  organic_traffic INTEGER,
  common_keywords INTEGER, -- keyword overlap with our domain
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(our_domain, competitor_domain, snapshot_date)
);

CREATE INDEX idx_competitor_domain ON competitor_tracking(competitor_domain);
CREATE INDEX idx_competitor_our_domain ON competitor_tracking(our_domain);
CREATE INDEX idx_competitor_date ON competitor_tracking(snapshot_date DESC);
