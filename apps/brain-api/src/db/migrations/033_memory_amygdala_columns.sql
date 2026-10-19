-- 033_memory_amygdala_columns.sql
-- Port amygdala schema (personal_memory) → brain_memories
-- Per LIP: p2-memory-amygdala-port (c=0.90)
-- Bridges persistent layer: same metadata vocabulary across personal + Brain memories

BEGIN;

-- Amygdala fields (all nullable / safe defaults — non-breaking)
ALTER TABLE brain_memories
  ADD COLUMN IF NOT EXISTS importance   numeric(3,2) NOT NULL DEFAULT 0.50
    CHECK (importance >= 0.0 AND importance <= 1.0),
  ADD COLUMN IF NOT EXISTS spirit_level smallint     NOT NULL DEFAULT 1
    CHECK (spirit_level >= 0 AND spirit_level <= 3),
  ADD COLUMN IF NOT EXISTS valence      numeric(3,2) NOT NULL DEFAULT 0.00
    CHECK (valence >= -1.0 AND valence <= 1.0),
  ADD COLUMN IF NOT EXISTS is_anchor    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phase        text;

-- Comments documenting semantics (helpful for future agents querying schema)
COMMENT ON COLUMN brain_memories.importance   IS 'Amygdala 0.0-1.0 — technical/contextual weight, used in retrieval ranking';
COMMENT ON COLUMN brain_memories.spirit_level IS 'Amygdala 0-3 — 0=utility, 1=logic, 2=vision, 3=soul (Codex Symbiosis)';
COMMENT ON COLUMN brain_memories.valence      IS 'Amygdala -1..+1 — emotional charge (failure→success spectrum)';
COMMENT ON COLUMN brain_memories.is_anchor    IS 'Amygdala — permanent foundational memory, never decays, always retrieved';
COMMENT ON COLUMN brain_memories.phase        IS 'Optional phase/project tag (e.g. project_msg_brain, harness, msg-cms)';

-- Retrieval index: anchors + importance + use_count for filter+boost queries
CREATE INDEX IF NOT EXISTS idx_brain_memories_amygdala
  ON brain_memories (is_anchor DESC, spirit_level DESC, importance DESC, use_count DESC)
  WHERE is_active = true;

-- Index for phase-scoped queries
CREATE INDEX IF NOT EXISTS idx_brain_memories_phase
  ON brain_memories (phase, importance DESC)
  WHERE is_active = true AND phase IS NOT NULL;

COMMIT;
