-- 036_memory_embeddings.sql
-- Add semantic embedding to brain_memories for vector search retrieval
-- Per LIP: p2-memory-embeddings-table + p2-memory-vector-search (both latent → active)
-- Reuses Brain's existing @xenova/transformers pipeline (vector.ts), no new provider.

BEGIN;

-- Vector(384) matches all-MiniLM-L6-v2 — same model used by articles + brain_embeddings tables
ALTER TABLE brain_memories
  ADD COLUMN IF NOT EXISTS embedding         vector(384),
  ADD COLUMN IF NOT EXISTS embedded_at       timestamptz,
  ADD COLUMN IF NOT EXISTS embedded_model    text;

COMMENT ON COLUMN brain_memories.embedding      IS 'Semantic vector (vector(384), cosine), all-MiniLM-L6-v2 quantized via @xenova/transformers';
COMMENT ON COLUMN brain_memories.embedded_at    IS 'Last embedding generation timestamp (for staleness detection)';
COMMENT ON COLUMN brain_memories.embedded_model IS 'Model identifier (e.g. "Xenova/all-MiniLM-L6-v2") — multi-model support if/when needed';

-- HNSW index for fast cosine search (same pattern as articles + brain_embeddings)
CREATE INDEX IF NOT EXISTS idx_brain_memories_embedding
  ON brain_memories USING hnsw (embedding vector_cosine_ops)
  WHERE is_active = true AND embedding IS NOT NULL;

COMMIT;
