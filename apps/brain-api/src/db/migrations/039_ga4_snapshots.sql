-- Migration 039: GA4 monthly snapshots table (Run T, 2026-05-26)
-- ---------------------------------------------------------------------------
-- Mirrors the GSC snapshot system. Holds compact monthly rollups of the most
-- valuable GA4 reports per tracked site, so the Brain UI dashboards and
-- agent queries can answer "how does June compare to May?" without burning
-- live Data API quota every time.
--
-- Retention: keep 24 months (2 years) per Integrator decision. Trends start
-- to be meaningful around 12 months; 24 lets us see seasonal patterns
-- (Y/Y comparisons) without unbounded growth.
--
-- Cron: scripts/ga4-snapshot-cron.sh, 1st of each month at 03:30 (after GSC).

CREATE TABLE IF NOT EXISTS ga4_snapshots (
  id              SERIAL PRIMARY KEY,
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  property_id     TEXT NOT NULL,
  snapshot_date   DATE NOT NULL,            -- 1st of the month covered (e.g. 2026-05-01)
  report_type     TEXT NOT NULL,            -- 'traffic_overview' | 'landing_pages' | 'source_medium' | 'device' | 'geo' | 'key_events'
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  payload         JSONB NOT NULL,           -- the report rows as captured
  row_count       INT NOT NULL DEFAULT 0,
  api_tokens_used INT,                      -- approximation from propertyQuota
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, snapshot_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_ga4_snapshots_site_date
  ON ga4_snapshots (site_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_snapshots_type
  ON ga4_snapshots (report_type, snapshot_date DESC);

-- Retention helper: 24 months auto-prune (run by cron after each insert burst).
-- Not a TimescaleDB hypertable yet — small volume (~6 reports × 3 sites × 24 = 432 rows).
COMMENT ON TABLE ga4_snapshots IS
  '24-month retention. Pruned by ga4-snapshot-cron.sh after each monthly insert.';
