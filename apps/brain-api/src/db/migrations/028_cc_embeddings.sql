-- CC Embeddings — vector index for Claude Code Custom Mode workflow
-- Indexes: skills, memory, agents, source code, docs, plans, hints
-- Migration 028 | 2026-03-26

CREATE TABLE cc_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  -- Types: skill, memory, plan, hint, agent, knowledge, template, doc, source, config
  entity_id TEXT NOT NULL,         -- relative file path (canonical key)
  chunk_index SMALLINT NOT NULL DEFAULT 0,
  title TEXT,                      -- file name or section heading
  content_chunk TEXT NOT NULL,     -- the text that was embedded
  embedding vector(384) NOT NULL,
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,               -- SHA256 for change detection
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, chunk_index)
);

CREATE INDEX idx_cc_embeddings_vector
  ON cc_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_cc_embeddings_type ON cc_embeddings(entity_type);
CREATE INDEX idx_cc_embeddings_entity ON cc_embeddings(entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON cc_embeddings TO brain_app;

INSERT INTO _migrations (name) VALUES ('028_cc_embeddings');
