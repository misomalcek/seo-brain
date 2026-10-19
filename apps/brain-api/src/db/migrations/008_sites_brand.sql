-- Migration 008: Sites and Brand Assets
-- Sites (managed websites)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  gsc_property VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);

-- Seed the 3 managed websites
INSERT INTO sites (domain, name, description, is_primary, gsc_property) VALUES
  ('example.com', 'Example Org', 'Hlavny web Example Org - zivotne poistenie, financne planovanie, HR', TRUE, 'sc-domain:example.com'),
  ('example-dev.com', 'msg Programator', 'Karierna stranka pre programatorov a IT developerov', FALSE, 'sc-domain:example-dev.com'),
  ('example-qa.com', 'msg Tester', 'Karierna stranka pre QA testerov a test automatizaciu', FALSE, 'sc-domain:example-qa.com')
ON CONFLICT (domain) DO NOTHING;

-- Brand Assets (core brand + per-site overrides)
CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,  -- NULL = core brand (applies to all)
  asset_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_site ON brand_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_brand_type ON brand_assets(asset_type);
-- One asset type per site (NULL site = core brand)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_unique ON brand_assets(COALESCE(site_id, '00000000-0000-0000-0000-000000000000'), asset_type);
