-- Brain Embeddings — semantic index for agents, knowledge, brand, memory, templates
-- Separate from articles (different lifecycle) and cc_embeddings (CC dev workflow)
-- Migration 030 | 2026-03-26

CREATE TABLE brain_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  -- Types: agent, knowledge, brand, memory, template
  source_id TEXT NOT NULL,         -- file path, asset ID, or memory ID
  title TEXT,
  content_chunk TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,               -- SHA256 for change detection
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);

CREATE INDEX idx_brain_embeddings_vector
  ON brain_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_brain_embeddings_type ON brain_embeddings(source_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON brain_embeddings TO brain_app;

INSERT INTO _migrations (name) VALUES ('030_brain_embeddings');
