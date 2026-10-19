-- Migration 041: custom_personas table
-- Allows admin/team_admin users to create personas via chat (manage_persona tool).
-- DB rows override or extend the hardcoded PERSONAS record in definitions.ts.
-- is_active = FALSE is the "soft delete" / built-in override-hide mechanism.

CREATE TABLE IF NOT EXISTS custom_personas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  name_localized TEXT      NOT NULL DEFAULT '',
  description  TEXT        NOT NULL DEFAULT '',
  icon         TEXT        NOT NULL DEFAULT '🎭',
  color        TEXT        NOT NULL DEFAULT '#6B7280',
  system_prompt TEXT       NOT NULL,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_personas_slug_idx ON custom_personas(slug);
CREATE INDEX IF NOT EXISTS custom_personas_active_idx ON custom_personas(is_active);
