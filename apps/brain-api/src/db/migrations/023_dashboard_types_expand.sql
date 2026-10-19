-- Migration 023: Expand dashboard_type CHECK to include new dashboard types
-- New types: keywords (Keyword Opportunities Hub), audit (Site Audit Health),
--            links (Link Profile), visibility (Visibility & Performance)

ALTER TABLE dashboard_snapshots DROP CONSTRAINT IF EXISTS dashboard_snapshots_dashboard_type_check;
ALTER TABLE dashboard_snapshots ADD CONSTRAINT dashboard_snapshots_dashboard_type_check
  CHECK (dashboard_type IN ('seo', 'content', 'ceo', 'keywords', 'audit', 'links', 'visibility'));

-- Record migration
-- Run: sudo -u postgres psql -d team_brain -f 023_dashboard_types_expand.sql
