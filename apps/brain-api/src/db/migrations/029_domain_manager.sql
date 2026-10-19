-- Domain Manager — centralize all domain configuration
-- Migration 029 | 2026-03-26

-- Add missing columns to sites table
ALTER TABLE sites ADD COLUMN IF NOT EXISTS sitemap_url TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS ahrefs_project_id TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_tracked BOOLEAN DEFAULT TRUE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS primary_language VARCHAR(5) DEFAULT 'sk';

-- Update existing domains with their config
UPDATE sites SET
  gsc_property = 'sc-domain:example.com',
  sitemap_url = 'https://example.com/sitemap.xml',
  ahrefs_project_id = '4716186',
  is_tracked = TRUE,
  primary_language = 'sk'
WHERE domain = 'example.com';

UPDATE sites SET
  gsc_property = 'https://example-dev.com/',
  sitemap_url = 'https://example-dev.com/sitemap.xml',
  ahrefs_project_id = '4716182',
  is_tracked = TRUE,
  primary_language = 'sk'
WHERE domain = 'example-dev.com';

UPDATE sites SET
  gsc_property = 'https://example-qa.com/',
  sitemap_url = 'https://example-qa.com/sitemap.xml',
  ahrefs_project_id = '4716181',
  is_tracked = TRUE,
  primary_language = 'sk'
WHERE domain = 'example-qa.com';

-- 4th domain placeholder (Michal will provide details)
INSERT INTO sites (domain, name, description, gsc_property, sitemap_url, is_tracked, primary_language)
VALUES ('example-org.com', 'Example Org Group', 'Parent company website', 'sc-domain:example-org.com', 'https://www.example-org.com/sitemap.xml', TRUE, 'de')
ON CONFLICT (domain) DO NOTHING;

INSERT INTO _migrations (name) VALUES ('029_domain_manager');
