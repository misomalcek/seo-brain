-- Migration 040: Chat input snippets (Run V, 2026-05-27)
-- ---------------------------------------------------------------------------
-- Stores per-user reusable markdown snippets that the chat-input expand
-- modal can save and load. Mirrors Factorium's factorium-input-snippets/
-- filesystem approach but DB-backed so VPS users get their own scoped set.

CREATE TABLE IF NOT EXISTS chat_snippets (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,          -- title-derived filename-safe identifier
  title      TEXT NOT NULL,          -- human-readable title
  content_md TEXT NOT NULL,          -- markdown body
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_chat_snippets_user
  ON chat_snippets (user_id, updated_at DESC);
