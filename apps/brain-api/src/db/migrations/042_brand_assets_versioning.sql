-- Migration 042: Brand assets versioning — drop one-per-type unique constraint
-- so multiple version rows can exist for the same (site_id, asset_type).
-- Conflict rule (newest version wins) is now enforced in application code:
--   getBrandContext() selects ORDER BY version DESC and takes the first per type.

-- Drop the unique index that prevented inserting new version rows.
DROP INDEX IF EXISTS idx_brand_unique;

-- Add a composite index for efficient "latest per type" queries.
CREATE INDEX IF NOT EXISTS idx_brand_site_type_version
  ON brand_assets(site_id, asset_type, version DESC);
