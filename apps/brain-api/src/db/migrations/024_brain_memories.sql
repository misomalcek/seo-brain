-- BUM v1: Brain Memories — autonomous shared memory system
-- Migration 024 | 2026-03-13

-- pg_trgm is a search speedup. The desktop database does not ship it.
-- A missing extension must not roll back the memories table.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available — trigram index skipped';
END $$;

CREATE TABLE brain_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content (max 300 chars enforced)
  content TEXT NOT NULL CHECK (length(content) <= 300),
  category TEXT NOT NULL,           -- validated in app: 'domain', 'preference', 'pattern'
  domains TEXT[] NOT NULL DEFAULT '{}',  -- empty = global, e.g. '{example.com}'

  -- Relevance
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TIMESTAMPTZ,
  char_count SMALLINT GENERATED ALWAYS AS (length(content) + 4) STORED,  -- +4 for "- " prefix + newline

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'remember' | 'extracted' | 'admin'
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  source_quote TEXT CHECK (length(source_quote) <= 500),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_brain_memories_active ON brain_memories (use_count DESC, created_at DESC) WHERE is_active = TRUE;
CREATE INDEX idx_brain_memories_pending ON brain_memories (created_at DESC) WHERE is_active = FALSE;
CREATE INDEX idx_brain_memories_domains ON brain_memories USING gin (domains) WHERE is_active = TRUE;
CREATE INDEX idx_brain_memories_search ON brain_memories USING gin (
  to_tsvector('simple', coalesce(content, ''))
) WHERE is_active = TRUE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX idx_brain_memories_trgm ON brain_memories USING gin (content gin_trgm_ops) WHERE is_active = TRUE;
  END IF;
END $$;

-- Updated_at trigger (CREATE OR REPLACE — safe for existing function)
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brain_memories_updated_at
  BEFORE UPDATE ON brain_memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Memory-conversation junction (which memories were injected — debugging)
CREATE TABLE conversation_memories (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES brain_memories(id) ON DELETE CASCADE,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, memory_id)
);

CREATE INDEX idx_conv_memories_memory ON conversation_memories (memory_id);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON brain_memories TO brain_app;
GRANT SELECT, INSERT, DELETE ON conversation_memories TO brain_app;

INSERT INTO _migrations (name) VALUES ('024_brain_memories');
