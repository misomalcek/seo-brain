/**
 * Vector Service — pgvector + @xenova/transformers
 *
 * Provides semantic search, hybrid search, embedding generation,
 * and content similarity analysis for Team Brain.
 *
 * Model: all-MiniLM-L6-v2 (quantized INT8, 384 dimensions, ~30MB)
 * Loaded lazily on first use — not at startup.
 */

import { query, getPool } from '../db/connection';

// ============================================================
// Embedding Pipeline (lazy-loaded singleton)
// ============================================================

let pipeline: any = null;
let modelLoading: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  if (modelLoading) return modelLoading;

  modelLoading = (async () => {
    console.log('[vector] Loading embedding model (first use)...');
    const start = Date.now();
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    // Nomic 768d (2026-06-10, migrated from MiniLM-384). Still fully in-process via
    // @xenova/transformers — no external embedding service, so handover stays simple.
    pipeline = await createPipeline('feature-extraction', 'Xenova/nomic-embed-text-v1', {
      quantized: true,
    });
    console.log(`[vector] Model loaded in ${Date.now() - start}ms`);
    modelLoading = null;
    return pipeline;
  })();

  return modelLoading;
}

// ============================================================
// pgvector type registration
// ============================================================

let pgvectorRegistered = false;

async function ensurePgvector() {
  // No-op: we use JSON.stringify for vector params instead of pgvector type registration
  // This avoids the "client.setTypeParser is not a function" error with Pool
  pgvectorRegistered = true;
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Generate embedding for a single text.
 *
 * Nomic-embed-text REQUIRES a task prefix: stored content uses "search_document:",
 * search queries use "search_query:". Mixing them up (or omitting them) measurably
 * hurts retrieval — so callers MUST pass mode='query' when embedding a search query.
 * Default is 'document' (the common storage path).
 */
export async function embed(text: string, mode: 'document' | 'query' = 'document'): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const prefix = mode === 'query' ? 'search_query: ' : 'search_document: ';
  // Nomic context is 8192 tokens; ~4000 chars is a safe, generous truncation.
  const truncated = prefix + text.slice(0, 4000);
  const output = await pipe(truncated, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts (sequential to manage memory)
 */
export async function embedBatch(texts: string[], batchSize = 4): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    for (const text of batch) {
      results.push(await embed(text));
    }
  }
  return results;
}

// ============================================================
// Search Functions
// ============================================================

export interface ArticleSearchResult {
  id: string;
  url: string;
  title: string;
  domain: string;
  content_md: string;
  word_count: number;
  scraped_at: string;
  score: number;
  score_type: 'semantic' | 'lexical' | 'hybrid';
}

/**
 * Semantic search — pure vector similarity
 */
export async function searchSemantic(
  queryText: string,
  opts: { limit?: number; domain?: string; minScore?: number } = {}
): Promise<ArticleSearchResult[]> {
  await ensurePgvector();
  const { limit = 10, domain, minScore = 0.2 } = opts;

  const queryEmbedding = await embed(queryText, 'query');

  const sql = `
    SELECT id, url, title, domain, content_md, word_count, scraped_at,
           1 - (embedding <=> $1::vector) AS score
    FROM articles
    WHERE embedding IS NOT NULL
      ${domain ? 'AND domain = $3' : ''}
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  const params: any[] = [JSON.stringify(queryEmbedding), limit];
  if (domain) params.push(domain);

  const rows = await query<any>(sql, params);
  return rows
    .filter((r: any) => r.score >= minScore)
    .map((r: any) => ({ ...r, score: parseFloat(r.score), score_type: 'semantic' as const }));
}

/**
 * Pure lexical (keyword) search — no embeddings, just ts_rank
 */
export async function searchLexical(
  queryText: string,
  opts: { limit?: number; domain?: string; minScore?: number } = {}
): Promise<ArticleSearchResult[]> {
  const { limit = 10, domain, minScore = 0.001 } = opts;

  const sql = `
    SELECT id, url, title, domain, content_md, word_count, scraped_at,
           ts_rank(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_md,'')),
                   plainto_tsquery('simple', $1)) AS score
    FROM articles
    WHERE to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_md,''))
          @@ plainto_tsquery('simple', $1)
      ${domain ? 'AND domain = $3' : ''}
    ORDER BY score DESC
    LIMIT $2
  `;

  const params: any[] = [queryText, limit];
  if (domain) params.push(domain);

  const rows = await query<any>(sql, params);
  return rows
    .filter((r: any) => parseFloat(r.score) >= minScore)
    .map((r: any) => ({ ...r, score: parseFloat(r.score), score_type: 'lexical' as const }));
}

/**
 * Hybrid search — combines semantic + lexical with weighted fusion
 */
export async function searchHybrid(
  queryText: string,
  opts: { limit?: number; domain?: string; minScore?: number; semanticWeight?: number } = {}
): Promise<ArticleSearchResult[]> {
  await ensurePgvector();
  const { limit = 10, domain, minScore = 0.15, semanticWeight = 0.6 } = opts;
  const lexicalWeight = 1 - semanticWeight;

  const queryEmbedding = await embed(queryText, 'query');

  const sql = `
    WITH semantic AS (
      SELECT id, url, title, domain, content_md, word_count, scraped_at,
             1 - (embedding <=> $1::vector) AS sem_score
      FROM articles
      WHERE embedding IS NOT NULL
        ${domain ? 'AND domain = $4' : ''}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    ),
    lexical AS (
      SELECT id, url, title, domain, content_md, word_count, scraped_at,
             ts_rank(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_md,'')),
                     plainto_tsquery('simple', $3)) AS lex_score
      FROM articles
      WHERE to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_md,''))
            @@ plainto_tsquery('simple', $3)
        ${domain ? 'AND domain = $4' : ''}
      LIMIT $2
    )
    SELECT
      COALESCE(s.id, l.id) AS id,
      COALESCE(s.url, l.url) AS url,
      COALESCE(s.title, l.title) AS title,
      COALESCE(s.domain, l.domain) AS domain,
      COALESCE(s.content_md, l.content_md) AS content_md,
      COALESCE(s.word_count, l.word_count) AS word_count,
      COALESCE(s.scraped_at, l.scraped_at) AS scraped_at,
      COALESCE(s.sem_score, 0) * ${semanticWeight} + COALESCE(l.lex_score, 0) * ${lexicalWeight} AS score
    FROM semantic s
    FULL OUTER JOIN lexical l ON s.id = l.id
    ORDER BY score DESC
    LIMIT $2
  `;

  const params: any[] = [JSON.stringify(queryEmbedding), limit, queryText];
  if (domain) params.push(domain);

  const rows = await query<any>(sql, params);
  return rows
    .filter((r: any) => parseFloat(r.score) >= minScore)
    .map((r: any) => ({ ...r, score: parseFloat(r.score), score_type: 'hybrid' as const }));
}

/**
 * Find articles similar to a given article (Smart Connections)
 */
export async function findSimilarArticles(
  articleId: string,
  limit = 10
): Promise<ArticleSearchResult[]> {
  await ensurePgvector();

  const sql = `
    SELECT b.id, b.url, b.title, b.domain, b.content_md, b.word_count, b.scraped_at,
           1 - (a.embedding <=> b.embedding) AS score
    FROM articles a, articles b
    WHERE a.id = $1 AND b.id != $1
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    ORDER BY a.embedding <=> b.embedding
    LIMIT $2
  `;

  const rows = await query<any>(sql, [articleId, limit]);
  return rows.map((r: any) => ({ ...r, score: parseFloat(r.score), score_type: 'semantic' as const }));
}

/**
 * Detect content cannibalization — article pairs with cosine similarity > threshold
 */
export async function detectCannibalization(
  threshold = 0.95,
  domain?: string
): Promise<Array<{ article1: any; article2: any; similarity: number }>> {
  await ensurePgvector();

  const sql = `
    SELECT
      a.id AS id1, a.title AS title1, a.url AS url1, a.domain AS domain1,
      b.id AS id2, b.title AS title2, b.url AS url2, b.domain AS domain2,
      1 - (a.embedding <=> b.embedding) AS similarity
    FROM articles a, articles b
    WHERE a.id < b.id
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
      AND 1 - (a.embedding <=> b.embedding) > $1
      ${domain ? 'AND a.domain = $2 AND b.domain = $2' : ''}
    ORDER BY similarity DESC
    LIMIT 50
  `;

  const params: any[] = [threshold];
  if (domain) params.push(domain);

  const rows = await query<any>(sql, params);
  return rows.map((r: any) => ({
    article1: { id: r.id1, title: r.title1, url: r.url1, domain: r.domain1 },
    article2: { id: r.id2, title: r.title2, url: r.url2, domain: r.domain2 },
    similarity: parseFloat(r.similarity),
  }));
}

/**
 * Get vector stats
 */
export async function getVectorStats(): Promise<{
  totalArticles: number;
  embeddedCount: number;
  byDomain: Record<string, number>;
  lastScrape: string | null;
}> {
  const total = await query<any>('SELECT count(*) as count FROM articles');
  const embedded = await query<any>('SELECT count(*) as count FROM articles WHERE embedding IS NOT NULL');
  const domains = await query<any>('SELECT domain, count(*) as count FROM articles GROUP BY domain ORDER BY count DESC');
  const lastScrape = await query<any>('SELECT max(scraped_at) as last_scrape FROM articles');

  return {
    totalArticles: parseInt(total[0]?.count || '0'),
    embeddedCount: parseInt(embedded[0]?.count || '0'),
    byDomain: Object.fromEntries(domains.map((d: any) => [d.domain, parseInt(d.count)])),
    lastScrape: lastScrape[0]?.last_scrape || null,
  };
}

/**
 * Internal linking suggestions — find articles to cross-link with a given article.
 * Returns articles from OTHER domains for cross-domain linking.
 */
export async function suggestInternalLinks(
  articleId: string,
  opts: { limit?: number; minScore?: number; crossDomainOnly?: boolean } = {}
): Promise<ArticleSearchResult[]> {
  await ensurePgvector();
  const { limit = 10, minScore = 0.3, crossDomainOnly = false } = opts;

  const article = await query<any>('SELECT embedding, domain FROM articles WHERE id = $1', [articleId]);
  if (!article[0]?.embedding) return [];

  const domainFilter = crossDomainOnly ? `AND b.domain != $3` : '';
  const sql = `
    SELECT b.id, b.url, b.title, b.domain, b.word_count, b.scraped_at,
           1 - (b.embedding <=> $1::vector) AS score
    FROM articles b
    WHERE b.id != $2 AND b.embedding IS NOT NULL ${domainFilter}
      AND 1 - (b.embedding <=> $1::vector) >= ${minScore}
    ORDER BY b.embedding <=> $1::vector
    LIMIT ${limit}
  `;

  const params: any[] = [JSON.stringify(article[0].embedding), articleId];
  if (crossDomainOnly) params.push(article[0].domain);

  const rows = await query<any>(sql, params);
  return rows.map((r: any) => ({ ...r, score: parseFloat(r.score), score_type: 'internal_link' as const }));
}

// ============================================================
// CC Embeddings — Claude Code Custom Mode vector search
// ============================================================

export interface CCSearchResult {
  id: string;
  entity_type: string;
  entity_id: string;
  chunk_index: number;
  title: string | null;
  content_chunk: string;
  metadata: Record<string, any>;
  score: number;
}

/**
 * Search CC embeddings (skills, memory, agents, source code, docs, plans).
 * Used by Custom Mode for semantic skill matching, code navigation, plan recall.
 */
export async function searchCC(
  queryText: string,
  opts: {
    types?: string[];      // filter by entity_type(s)
    limit?: number;        // default 10
    minScore?: number;     // default 0.25
    dedupe?: boolean;      // default true — best chunk per entity_id
  } = {}
): Promise<CCSearchResult[]> {
  const { types, limit = 10, minScore = 0.25, dedupe = true } = opts;

  const queryEmbedding = await embed(queryText, 'query');
  const vectorParam = JSON.stringify(queryEmbedding);

  let sql: string;
  const params: any[] = [vectorParam];
  let paramIdx = 2;

  if (dedupe) {
    // Return best chunk per entity (prevents multiple results from same file)
    const typeFilter = types ? `AND entity_type = ANY($${paramIdx++})` : '';
    sql = `
      WITH ranked AS (
        SELECT id, entity_type, entity_id, chunk_index, title, content_chunk, metadata,
               1 - (embedding <=> $1::vector) AS score,
               ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY embedding <=> $1::vector) AS rn
        FROM cc_embeddings
        WHERE 1=1 ${typeFilter}
      )
      SELECT id, entity_type, entity_id, chunk_index, title, content_chunk, metadata, score
      FROM ranked
      WHERE rn = 1 AND score >= $${paramIdx++}
      ORDER BY score DESC
      LIMIT $${paramIdx}
    `;
    if (types) params.push(types);
    params.push(minScore, limit);
  } else {
    const typeFilter = types ? `AND entity_type = ANY($${paramIdx++})` : '';
    sql = `
      SELECT id, entity_type, entity_id, chunk_index, title, content_chunk, metadata,
             1 - (embedding <=> $1::vector) AS score
      FROM cc_embeddings
      WHERE 1=1 ${typeFilter}
        AND 1 - (embedding <=> $1::vector) >= $${paramIdx++}
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIdx}
    `;
    if (types) params.push(types);
    params.push(minScore, limit);
  }

  const rows = await query<any>(sql, params);
  return rows.map((r: any) => ({
    id: r.id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    chunk_index: r.chunk_index,
    title: r.title,
    content_chunk: r.content_chunk,
    metadata: r.metadata || {},
    score: parseFloat(r.score),
  }));
}

// ============================================================
// Brain Embeddings — semantic search for agents, knowledge, brand, memory
// ============================================================

export interface BrainSearchResult {
  id: string;
  source_type: string;
  source_id: string;
  title: string | null;
  content_chunk: string;
  metadata: Record<string, any>;
  score: number;
}

/**
 * Search Brain's own embeddings (agents, knowledge, brand, memories, templates).
 * Used for semantic agent selection, knowledge retrieval, brand matching.
 */
export async function searchBrain(
  queryText: string,
  opts: { types?: string[]; limit?: number; minScore?: number } = {}
): Promise<BrainSearchResult[]> {
  const { types, limit = 10, minScore = 0.25 } = opts;

  const queryEmbedding = await embed(queryText, 'query');
  const vectorParam = JSON.stringify(queryEmbedding);

  const typeFilter = types ? `AND source_type = ANY($3)` : '';
  const sql = `
    SELECT id, source_type, source_id, title, content_chunk, metadata,
           1 - (embedding <=> $1::vector) AS score
    FROM brain_embeddings
    WHERE 1=1 ${typeFilter}
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  const params: any[] = [vectorParam, limit];
  if (types) params.push(types);

  const rows = await query<any>(sql, params);
  return rows
    .filter((r: any) => parseFloat(r.score) >= minScore)
    .map((r: any) => ({
      id: r.id,
      source_type: r.source_type,
      source_id: r.source_id,
      title: r.title,
      content_chunk: r.content_chunk,
      metadata: r.metadata || {},
      score: parseFloat(r.score),
    }));
}
