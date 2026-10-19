-- Migration 025: pgvector extension + articles table for semantic search
-- pgvector 0.8.0 available on this system, just needs CREATE EXTENSION
-- Embedding model: all-MiniLM-L6-v2 quantized (384 dimensions)

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Articles table — scraped content from 3 websites
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  content_md TEXT NOT NULL,
  embedding vector(384),
  word_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest neighbor search
-- m=16, ef_construction=64 is conservative — good for up to ~10K vectors
CREATE INDEX idx_articles_embedding ON articles
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Standard indexes
CREATE INDEX idx_articles_domain ON articles (domain);
CREATE INDEX idx_articles_url_hash ON articles USING hash (url);
CREATE INDEX idx_articles_published ON articles (published_at DESC);

-- Full-text search index for hybrid search (lexical component)
CREATE INDEX idx_articles_search ON articles USING gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_md, ''))
);

-- Updated_at trigger (function already exists from migration 024)
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON articles TO brain_app;

INSERT INTO _migrations (name) VALUES ('025_vector_articles');
