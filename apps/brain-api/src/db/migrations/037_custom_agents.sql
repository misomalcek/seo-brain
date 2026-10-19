-- 037_custom_agents.sql
-- Sprint G (2026-05-22): Custom agents + specialist extensions
-- custom_agents: team-shared, fully DB-managed, created via UI or manage_agent tool
-- agent_extensions: user overrides for the 6 base specialists (extra prompt + keywords)

BEGIN;

CREATE TABLE IF NOT EXISTS custom_agents (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT    NOT NULL UNIQUE,                       -- routing ID, e.g. "hr-writer"
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  system_prompt TEXT  NOT NULL,
  model       TEXT    NOT NULL DEFAULT 'sonnet'
                CHECK (model IN ('haiku', 'sonnet', 'sonnet-high')),
  tools       TEXT[]  NOT NULL DEFAULT '{}',                 -- empty = ALL tools
  keywords    TEXT[]  NOT NULL DEFAULT '{}',
  color       TEXT    NOT NULL DEFAULT '#6B7280',
  icon        TEXT    NOT NULL DEFAULT '🤖',
  created_by  UUID    REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_extensions (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          TEXT  NOT NULL UNIQUE,                   -- matches definitions.ts specialist id
  custom_description TEXT,                                   -- overrides card description in UI
  extra_system_prompt TEXT,                                  -- appended to base specialist prompt
  extra_keywords    TEXT[] NOT NULL DEFAULT '{}',            -- added to routing keywords[]
  updated_by        UUID  REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_agents_active
  ON custom_agents(is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_custom_agents_slug
  ON custom_agents(slug);

COMMENT ON TABLE custom_agents    IS 'Team-shared custom agents created via Brain UI or manage_agent tool';
COMMENT ON TABLE agent_extensions IS 'Per-specialist user overrides: extra prompt + routing keywords';

COMMIT;
