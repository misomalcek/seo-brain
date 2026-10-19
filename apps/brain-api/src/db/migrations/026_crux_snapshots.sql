-- CrUX (Chrome UX Report) snapshots for Core Web Vitals tracking
-- Migration 026 | 2026-03-26

CREATE TABLE crux_snapshots (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  form_factor TEXT NOT NULL DEFAULT 'PHONE', -- PHONE, DESKTOP, ALL
  -- Core Web Vitals (p75 values)
  lcp_p75 NUMERIC(8,2),        -- Largest Contentful Paint (ms)
  cls_p75 NUMERIC(6,4),        -- Cumulative Layout Shift
  inp_p75 NUMERIC(8,2),        -- Interaction to Next Paint (ms)
  ttfb_p75 NUMERIC(8,2),       -- Time to First Byte (ms)
  -- Good/NI/Poor percentages
  lcp_good_pct NUMERIC(5,2),
  cls_good_pct NUMERIC(5,2),
  inp_good_pct NUMERIC(5,2),
  -- Full response data
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, snapshot_date, form_factor)
);

CREATE INDEX idx_crux_domain_date ON crux_snapshots (domain, snapshot_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON crux_snapshots TO brain_app;
GRANT USAGE, SELECT ON SEQUENCE crux_snapshots_id_seq TO brain_app;

INSERT INTO _migrations (name) VALUES ('026_crux_snapshots');
