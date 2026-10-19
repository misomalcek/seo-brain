-- 035_sites_ga4_property.sql
-- Add GA4 property ID to sites table — enables GA4 tools to map domain → GA4 property
-- Per LIP: p2-ga4-integration (latent → active after this)

BEGIN;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS ga4_property_id text;

COMMENT ON COLUMN sites.ga4_property_id IS 'GA4 property ID (numeric, e.g. "123456789") — used by ga4-api service. NULL = no GA4 tracking for this site.';

COMMIT;
