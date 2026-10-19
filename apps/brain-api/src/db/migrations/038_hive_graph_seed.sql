-- Migration 038: Seed hive_graph from brain_embeddings + brain_memories
-- ---------------------------------------------------------------------------
-- Apache AGE was installed earlier (extension v1.5.0) and the empty
-- `hive_graph` graph was created, but no Cypher routes or populator existed.
-- This migration seeds the graph idempotently from the live data tables so
-- the agent tool `knowledge_graph_query` and the /api/graph/age/* endpoints
-- have something to traverse.
--
-- Nodes:
--   :Entity { id, source_type, title, source_id }   — one per brain_embeddings row
--   :Memory inherits the above + { category, domains, importance, spirit_level,
--                                  is_anchor, is_pinned } when source_type='memory'
--   :Domain { name }                                — one per unique memory domain
--
-- Edges:
--   (:Memory)-[:IN_DOMAIN]->(:Domain)         — memory ↔ domain
--   (:Entity)-[:RELATED_TO {score}]->(:Entity) — top-5 cosine neighbours per node
--
-- Idempotent: re-running drops + repopulates so future runs (after memory
-- changes) refresh the graph. Production load is small (~131 entities, max
-- ~600 edges) — well under PL/pgSQL execution budget.
--
-- 2026-05-26 (Run O — Apache AGE wiring)

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

DO $migration$
DECLARE
  ent RECORD;
  mem RECORD;
  pair RECORD;
  dom TEXT;
BEGIN
  -- Wipe existing data so re-runs refresh from current tables.
  EXECUTE $$ SELECT * FROM cypher('hive_graph', $cy$ MATCH (n) DETACH DELETE n $cy$) AS (v agtype) $$;

  -- Vertices from brain_embeddings (131 rows: memory/article/knowledge/agent/brand/template)
  FOR ent IN
    SELECT id::text AS id, source_type, source_id, COALESCE(title, '') AS title
    FROM brain_embeddings
  LOOP
    EXECUTE format(
      $$ SELECT * FROM cypher('hive_graph', $cy$
           CREATE (e:Entity { id: %L, source_type: %L, source_id: %L, title: %L })
         $cy$) AS (v agtype) $$,
      ent.id, ent.source_type, ent.source_id, replace(ent.title, '''', '')
    );
  END LOOP;

  -- Enrich memory entities with category/anchor/spirit + IN_DOMAIN edges to Domain hubs.
  FOR mem IN
    SELECT
      e.id::text                       AS ent_id,
      m.category,
      m.domains,
      m.importance::float              AS importance,
      m.spirit_level::int              AS spirit_level,
      m.is_anchor,
      m.is_pinned
    FROM brain_embeddings e
    JOIN brain_memories  m ON m.id::text = e.source_id
    WHERE e.source_type = 'memory' AND m.is_active = true
  LOOP
    EXECUTE format(
      $$ SELECT * FROM cypher('hive_graph', $cy$
           MATCH (e:Entity { id: %L })
           SET   e:Memory, e.category = %L, e.importance = %s,
                 e.spirit_level = %s, e.is_anchor = %L, e.is_pinned = %L
         $cy$) AS (v agtype) $$,
      mem.ent_id, mem.category, mem.importance,
      mem.spirit_level,
      CASE WHEN mem.is_anchor THEN 'true' ELSE 'false' END,
      CASE WHEN mem.is_pinned THEN 'true' ELSE 'false' END
    );

    -- Per-domain Domain node + IN_DOMAIN edge.
    FOREACH dom IN ARRAY mem.domains LOOP
      EXECUTE format(
        $$ SELECT * FROM cypher('hive_graph', $cy$
             MERGE (d:Domain { name: %L })
             WITH d
             MATCH (e:Memory { id: %L })
             MERGE (e)-[:IN_DOMAIN]->(d)
           $cy$) AS (v agtype) $$,
        dom, mem.ent_id
      );
    END LOOP;
  END LOOP;

  -- RELATED_TO edges from top-5 cosine neighbours per entity (pgvector precomputes,
  -- AGE just records the relationship). Threshold 0.55 keeps the graph sparse;
  -- raise it later if traversals get too dense.
  FOR pair IN
    WITH neighbours AS (
      SELECT
        a.id::text AS a_id,
        b.id::text AS b_id,
        1 - (a.embedding <=> b.embedding) AS score,
        row_number() OVER (PARTITION BY a.id ORDER BY a.embedding <=> b.embedding) AS rn
      FROM brain_embeddings a
      JOIN brain_embeddings b ON a.id <> b.id
      WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    )
    SELECT a_id, b_id, score
    FROM neighbours
    WHERE rn <= 5 AND score >= 0.55
  LOOP
    EXECUTE format(
      $$ SELECT * FROM cypher('hive_graph', $cy$
           MATCH (a:Entity { id: %L }), (b:Entity { id: %L })
           MERGE (a)-[r:RELATED_TO]->(b)
           SET   r.score = %s
         $cy$) AS (v agtype) $$,
      pair.a_id, pair.b_id, pair.score
    );
  END LOOP;
END
$migration$;
