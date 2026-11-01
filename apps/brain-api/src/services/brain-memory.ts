import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from '../db/connection';

// === Types ===

export type MemoryCategory = 'domain' | 'preference' | 'pattern';
export type SourceType = 'manual' | 'remember' | 'extracted' | 'admin';

export interface BrainMemory {
  id: string;
  content: string;
  category: MemoryCategory;
  domains: string[];
  use_count: number;
  last_used_at: string | null;
  char_count: number;
  source_type: SourceType;
  source_conversation_id: string | null;
  source_quote: string | null;
  created_by_user_id: string | null;
  is_active: boolean;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Amygdala fields (migration 033) — per Codex Symbiosis weights schema
  importance?: number;     // 0.0-1.0 — technical/contextual weight
  spirit_level?: number;   // 0=utility, 1=logic, 2=vision, 3=soul
  valence?: number;        // -1..+1 — emotional charge
  is_anchor?: boolean;     // permanent foundational memory
  phase?: string | null;   // optional phase/project tag
}

export interface CreateMemoryInput {
  content: string;
  category: MemoryCategory;
  domains?: string[];
  source_type?: SourceType;
  source_conversation_id?: string;
  source_quote?: string;
  created_by_user_id?: string;
  is_active?: boolean;
}

export interface UpdateMemoryInput {
  content?: string;
  category?: MemoryCategory;
  domains?: string[];
  is_active?: boolean;
  is_pinned?: boolean;
  expires_at?: string | null;
}

export interface MemoryFilters {
  category?: MemoryCategory;
  active?: boolean;     // true=active, false=pending, undefined=all
  search?: string;
  sort?: 'use_count' | 'created_at' | 'updated_at';
  limit?: number;
  createdBy?: string;   // #5 (2026-04-29) — uuid filter for "Moje" tab in browser
}

const VALID_CATEGORIES: MemoryCategory[] = ['domain', 'preference', 'pattern'];
const MAX_CONTENT_CHARS = 300;
const MEMORY_BUDGET_CHARS = 3000;
const MAX_MEMORIES_LOADED = 10;
// Raised 50→200 (2026-06-10): the old cap of 50 was tiny for a team KB and,
// combined with auto-activate flipping ALL pending on, caused active-set thrash.
// Per-request load is already char-budgeted (3000 chars / max 10), so this is
// just the pool size, not what gets injected per message.
const MAX_ACTIVE_MEMORIES = 200;
const AUTO_ACTIVATE_DAYS = 7;

// === Extraction Cooldown (5-min per-user throttle) ===
const EXTRACTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastExtractionByUser = new Map<string, number>();

// === Extraction Monitoring (in-memory counters, reset daily) ===

let extractionCounters = {
  attempted: 0,
  succeeded: 0,
  errors: 0,
  lastReset: new Date(),
};

function resetCountersIfNeeded() {
  const now = new Date();
  const hoursSinceReset = (now.getTime() - extractionCounters.lastReset.getTime()) / (1000 * 60 * 60);
  if (hoursSinceReset >= 24) {
    // Log warning if zero successes in 24h (after first day)
    if (extractionCounters.attempted > 0 && extractionCounters.succeeded === 0) {
      console.warn('[brain-memory] WARNING: 0 successful extractions in last 24h');
    }
    extractionCounters = { attempted: 0, succeeded: 0, errors: 0, lastReset: now };
  }
}

// === LOADING (called every request) ===

export async function loadRelevantMemories(
  userMessage: string,
  currentDomain?: string,
  conversationId?: string
): Promise<string> {
  // Filter: active, not expired, domain-scoped
  // Soul-aware ranking (Brain-1 bio math 2026-05-23):
  //   soul (biological composite: importance×recency×usage) is the primary signal.
  //   spirit_level + valence + pinned kept as explicit boosters.
  //   Anchors always win at 1000.
  const rows = await query<BrainMemory>(
    `SELECT id, content, char_count, is_anchor, spirit_level, importance, valence, soul,
       (CASE WHEN is_anchor THEN 1000 ELSE 0 END
        + COALESCE(soul, 0.5) * 50
        + spirit_level * 8
        + GREATEST(valence, 0) * 5
        + CASE WHEN is_pinned THEN 20 ELSE 0 END
       ) AS relevance_score
     FROM brain_memories
     WHERE is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (domains = '{}' OR domains @> $1)
     ORDER BY relevance_score DESC`,
    [currentDomain ? [currentDomain] : []]
  );

  if (rows.length === 0) return '';

  // Budget: running sum of char_count, stop at MEMORY_BUDGET_CHARS, max MAX_MEMORIES_LOADED
  const selected: BrainMemory[] = [];
  let totalChars = 0;

  for (const row of rows) {
    if (selected.length >= MAX_MEMORIES_LOADED) break;
    if (totalChars + row.char_count > MEMORY_BUDGET_CHARS) break;
    selected.push(row);
    totalChars += row.char_count;
  }

  if (selected.length === 0) return '';

  // Log: INSERT INTO conversation_memories (fire-and-forget)
  if (conversationId) {
    const values = selected.map((_, i) => `($1, $${i + 2}, NOW())`).join(', ');
    const params = [conversationId, ...selected.map(s => s.id)];
    query(
      `INSERT INTO conversation_memories (conversation_id, memory_id, loaded_at)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
      params
    ).catch(err => console.error('[brain-memory] Failed to log conversation_memories:', err));
  }

  // Async: UPDATE use_count + soul activation + last_tick
  // Soul gets a small boost on each access (Hebbian reinforcement), capped at 1.0
  const ids = selected.map(s => s.id);
  query(
    `UPDATE brain_memories SET
       use_count   = use_count + 1,
       last_used_at = NOW(),
       last_tick   = FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
       soul        = LEAST(1.0, COALESCE(soul, 0.5) + 0.03)
     WHERE id = ANY($1)`,
    [ids]
  ).catch(err => console.error('[brain-memory] Failed to update use_count/soul:', err));

  // Format
  const lines = selected.map(s => `- ${s.content}`).join('\n');
  return `## Brain Memory\n${lines}`;
}

// === EXTRACTION (called after each substantive conversation) ===

const EXTRACTION_PROMPT = `You are a memory extraction assistant. Review this conversation between a user and Brain (AI assistant for example-org Slovakia team).

Extract 0-2 facts worth remembering for future conversations across the whole team.

Rules:
- Each memory MUST be under 300 characters. This is a hard limit.
- Only genuinely new, non-obvious information
- NOT: conversation-specific details, temporary state, things derivable from tools
- NOT: anything Brain asserted — only facts from user input or tool results
- NOT: facts already stated in the knowledge base (domain strategies, site descriptions)
- YES: user corrections, project decisions, effective tool patterns, formatting preferences
- If nothing worth remembering, return empty array.

Conversation:
{CONVERSATION}

Return ONLY valid JSON array: [{"content": "...", "category": "domain|preference|pattern", "domains": ["example.com"] or []}]`;

// Lazy Anthropic client
let extractionClient: Anthropic | null = null;
function getExtractionClient(): Anthropic {
  if (!extractionClient) {
    extractionClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return extractionClient;
}

export async function extractMemories(
  messages: Array<{ role: string; content: string }>,
  conversationId: string,
  userId?: string
): Promise<void> {
  resetCountersIfNeeded();

  // Cooldown: skip if same user extracted in last 5 minutes
  if (userId) {
    const lastTime = lastExtractionByUser.get(userId);
    if (lastTime && Date.now() - lastTime < EXTRACTION_COOLDOWN_MS) {
      return;
    }
    lastExtractionByUser.set(userId, Date.now());
  }

  extractionCounters.attempted++;

  try {
    // Check trigger conditions: ≥4 message pairs OR ≥1 tool use
    const userMsgCount = messages.filter(m => m.role === 'user').length;
    const hasToolUse = messages.some(m =>
      typeof m.content === 'string' && m.content.includes('tool_use')
    );

    if (userMsgCount < 4 && !hasToolUse) {
      return; // Not enough substance
    }

    // Take last 4 message pairs (8 messages)
    const lastMessages = messages.slice(-8);
    const conversation = lastMessages
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const truncated = content.length > 2000 ? content.slice(0, 2000) + '...[truncated]' : content;
        return `${m.role.toUpperCase()}: ${truncated}`;
      })
      .join('\n\n');

    const prompt = EXTRACTION_PROMPT.replace('{CONVERSATION}', conversation);

    const response = await getExtractionClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const extracted = JSON.parse(jsonMatch[0]) as Array<{
      content: string;
      category: string;
      domains: string[];
    }>;

    if (!Array.isArray(extracted) || extracted.length === 0) return;

    for (const item of extracted) {
      // Validate
      if (!item.content || typeof item.content !== 'string') continue;
      if (item.content.length > MAX_CONTENT_CHARS) continue; // Skip over-limit
      if (!VALID_CATEGORIES.includes(item.category as MemoryCategory)) continue;

      // Dedup check
      const similar = await findSimilar(item.content);
      if (similar.length > 0) {
        // Update existing instead of insert
        await query(
          `UPDATE brain_memories SET content = $1, updated_at = NOW()
           WHERE id = $2`,
          [item.content, similar[0].id]
        );
        continue;
      }

      // Extract source quote (first user message mentioning related content)
      const sourceQuote = lastMessages
        .filter(m => m.role === 'user')
        .map(m => typeof m.content === 'string' ? m.content : '')
        .find(c => c.length > 10 && c.length <= 500);

      // INSERT as pending
      await query(
        `INSERT INTO brain_memories (content, category, domains, source_type, source_conversation_id, source_quote, is_active)
         VALUES ($1, $2, $3, 'extracted', $4, $5, FALSE)`,
        [
          item.content,
          item.category,
          item.domains || [],
          conversationId,
          sourceQuote?.slice(0, 500) || null,
        ]
      );

      extractionCounters.succeeded++;
    }
  } catch (err) {
    extractionCounters.errors++;
    console.error('[brain-memory] Extraction error:', err);
  }
}

// === DEDUP ===

export async function findSimilar(content: string): Promise<BrainMemory[]> {
  return query<BrainMemory>(
    `SELECT * FROM brain_memories
     WHERE similarity(content, $1) > 0.7
     ORDER BY similarity(content, $1) DESC
     LIMIT 3`,
    [content]
  );
}

// === UNIFIED CONTEXT RETRIEVAL (D4 crown) ===
// Single semantic search across memories + articles + brain_embeddings (knowledge/agents/brand/templates)

export interface UnifiedContextHit {
  source: 'memory' | 'article' | 'knowledge' | 'agent' | 'brand' | 'memory_be' | 'template';
  id: string;
  title: string | null;
  preview: string;
  score: number;
  raw_score: number;
  meta?: Record<string, any>;
}

export async function unifiedContextSearch(queryText: string, opts: {
  limit?: number;
  perSourceLimit?: number;
  minScore?: number;
  sources?: string[];
} = {}): Promise<{
  query: string;
  total_hits: number;
  by_source: Record<string, number>;
  results: UnifiedContextHit[];
  durationMs: number;
}> {
  const start = Date.now();
  const { limit = 15, perSourceLimit = 8, minScore = 0.25, sources } = opts;
  const want = (s: string) => !sources || sources.includes(s);

  const tasks: Promise<UnifiedContextHit[]>[] = [];

  // 1. brain_memories (D1) — amygdala-aware
  if (want('memory')) {
    tasks.push((async () => {
      const rows = await searchMemoriesSemantically(queryText, { limit: perSourceLimit, minSimilarity: minScore, activeOnly: true, amygdalaBoost: true });
      return rows.map(r => ({
        source: 'memory' as const, id: r.id,
        title: r.category || null,
        preview: r.content.slice(0, 240),
        score: r.combined_score ?? r.similarity,
        raw_score: r.similarity,
        meta: { is_anchor: r.is_anchor, spirit_level: r.spirit_level, importance: r.importance, domains: r.domains },
      }));
    })().catch(err => { console.warn('[unified] memory failed:', err); return []; }));
  }

  // 2. articles (D3) — semantic search
  if (want('article')) {
    tasks.push((async () => {
      const { searchSemantic } = await import('./vector.js');
      const rows = await searchSemantic(queryText, { limit: perSourceLimit, minScore });
      return rows.map(r => ({
        source: 'article' as const, id: r.id,
        title: r.title,
        preview: (r.content_md || '').slice(0, 240),
        score: r.score,
        raw_score: r.score,
        meta: { url: r.url, domain: r.domain, word_count: r.word_count },
      }));
    })().catch(err => { console.warn('[unified] article failed:', err); return []; }));
  }

  // 3. brain_embeddings (D2) — knowledge + agents + brand + templates
  const beTypes: string[] = [];
  if (want('knowledge')) beTypes.push('knowledge');
  if (want('agent'))     beTypes.push('agent');
  if (want('brand'))     beTypes.push('brand');
  if (want('template'))  beTypes.push('template');
  if (beTypes.length > 0) {
    tasks.push((async () => {
      const { searchBrain } = await import('./vector.js');
      const rows = await searchBrain(queryText, { types: beTypes, limit: perSourceLimit * 2, minScore });
      return rows.map(r => ({
        source: r.source_type as any, id: r.id,
        title: r.title,
        preview: r.content_chunk.slice(0, 240),
        score: r.score,
        raw_score: r.score,
        meta: r.metadata,
      }));
    })().catch(err => { console.warn('[unified] brain_embeddings failed:', err); return []; }));
  }

  const allResults = (await Promise.all(tasks)).flat();
  // Sort by score, take top N
  const sorted = allResults.sort((a, b) => b.score - a.score).slice(0, limit);

  const by_source: Record<string, number> = {};
  for (const hit of sorted) by_source[hit.source] = (by_source[hit.source] || 0) + 1;

  return {
    query: queryText,
    total_hits: sorted.length,
    by_source,
    results: sorted,
    durationMs: Date.now() - start,
  };
}

// === EMBEDDING PIPELINE (migration 036) ===

const EMBED_MODEL_ID = 'Xenova/nomic-embed-text-v1'; // 768d (migrated from MiniLM-384, 2026-06-10)

/**
 * Generate + store embedding for a memory. Fire-and-forget pattern.
 * Uses Brain's existing embedding pipeline via vector.ts service.
 */
export async function embedMemory(memoryId: string, content: string): Promise<void> {
  try {
    const { embed } = await import('./vector.js');
    const vec = await embed(content);
    await query(
      `UPDATE brain_memories
       SET embedding = $1::vector, embedded_at = NOW(), embedded_model = $2
       WHERE id = $3`,
      [JSON.stringify(vec), EMBED_MODEL_ID, memoryId]
    );
  } catch (err) {
    console.warn(`[brain-memory] embedMemory failed for ${memoryId}: ${String(err).slice(0, 200)}`);
  }
}

/**
 * Backfill embeddings for all memories missing them.
 * Returns counts of processed/skipped/failed. Sequential to manage memory.
 */
export async function backfillEmbeddings(opts: { limit?: number; activeOnly?: boolean } = {}): Promise<{
  total: number; processed: number; failed: number; durationMs: number;
}> {
  const start = Date.now();
  const { limit = 1000, activeOnly = false } = opts;
  const where = activeOnly ? 'WHERE embedding IS NULL AND is_active = true' : 'WHERE embedding IS NULL';
  const rows = await query<{ id: string; content: string }>(
    `SELECT id, content FROM brain_memories ${where} ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const { embed } = await import('./vector.js');
      const vec = await embed(row.content);
      await query(
        `UPDATE brain_memories SET embedding = $1::vector, embedded_at = NOW(), embedded_model = $2 WHERE id = $3`,
        [JSON.stringify(vec), EMBED_MODEL_ID, row.id]
      );
      processed++;
    } catch (err) {
      failed++;
      console.error(`[backfill] memory ${row.id} failed: ${String(err).slice(0, 200)}`);
    }
  }

  return { total: rows.length, processed, failed, durationMs: Date.now() - start };
}

/**
 * Semantic search across brain_memories. Uses HNSW cosine index.
 * Optional amygdala-aware re-ranking via importance + spirit_level + anchors boost.
 */
export interface MemorySearchResult extends BrainMemory {
  similarity: number;
  combined_score?: number;
}

export async function searchMemoriesSemantically(
  queryText: string,
  opts: { limit?: number; minSimilarity?: number; activeOnly?: boolean; amygdalaBoost?: boolean } = {}
): Promise<MemorySearchResult[]> {
  const { limit = 10, minSimilarity = 0.3, activeOnly = true, amygdalaBoost = true } = opts;
  const { embed } = await import('./vector.js');
  const vec = await embed(queryText, 'query');

  const where = activeOnly
    ? 'WHERE embedding IS NOT NULL AND is_active = true'
    : 'WHERE embedding IS NOT NULL';

  const sql = `
    SELECT id, content, category, domains, use_count, last_used_at, char_count,
           source_type, source_conversation_id, source_quote, created_by_user_id,
           is_active, is_pinned, expires_at, created_at, updated_at,
           importance, spirit_level, valence, is_anchor, phase,
           1 - (embedding <=> $1::vector) AS similarity
    FROM brain_memories
    ${where}
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;
  const rows = await query<MemorySearchResult>(sql, [JSON.stringify(vec), limit * 3]);

  let results = rows
    .map(r => ({ ...r, similarity: parseFloat(String(r.similarity)) }))
    .filter(r => r.similarity >= minSimilarity);

  if (amygdalaBoost) {
    // Soul-aware re-ranking: semantic similarity + biological soul + spirit boost
    results = results.map(r => ({
      ...r,
      combined_score:
        r.similarity * 0.55 +
        (r.is_anchor ? 0.35 : 0) +
        ((r as any).soul ?? r.importance ?? 0.5) * 0.20 +
        (r.spirit_level ?? 1) * 0.025,
    })).sort((a, b) => (b.combined_score! - a.combined_score!));
  }

  return results.slice(0, limit);
}

// === /remember UPGRADE ===

export async function rememberFromCommand(
  memoryText: string,
  userId: string,
  conversationId?: string
): Promise<{ memory: BrainMemory; formatted: string }> {
  // Send to Haiku for structured extraction
  const prompt = `Extract a structured memory from this user request. Return JSON:
{"content": "concise fact (max 300 chars)", "category": "domain|preference|pattern", "domains": ["example.com"] or []}

User said: "${memoryText.slice(0, 500)}"

Return ONLY the JSON object (not array).`;

  let content = memoryText.slice(0, MAX_CONTENT_CHARS);
  let category: MemoryCategory = 'preference';
  let domains: string[] = [];

  try {
    const response = await getExtractionClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.content && parsed.content.length <= MAX_CONTENT_CHARS) content = parsed.content;
      if (VALID_CATEGORIES.includes(parsed.category)) category = parsed.category;
      if (Array.isArray(parsed.domains)) domains = parsed.domains;
    }
  } catch (err) {
    console.error('[brain-memory] /remember Haiku extraction failed, using raw text:', err);
  }

  // Dedup check
  const similar = await findSimilar(content);
  if (similar.length > 0) {
    // Update existing
    const updated = await queryOne<BrainMemory>(
      `UPDATE brain_memories SET content = $1, is_active = TRUE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [content, similar[0].id]
    );
    return {
      memory: updated!,
      formatted: `Zapamätal som si: "${content}" (kategória: ${category}, aktualizované existujúce)`,
    };
  }

  // INSERT as active (/remember = user explicitly asked)
  const memory = await queryOne<BrainMemory>(
    `INSERT INTO brain_memories (content, category, domains, source_type, source_conversation_id, created_by_user_id, is_active)
     VALUES ($1, $2, $3, 'remember', $4, $5, TRUE)
     RETURNING *`,
    [content, category, domains, conversationId || null, userId]
  );

  return {
    memory: memory!,
    formatted: `Zapamätal som si: "${content}" (kategória: ${category})`,
  };
}

// === CRUD (admin) ===

export async function getMemories(filters?: MemoryFilters): Promise<BrainMemory[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (filters?.category) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(filters.category);
  }

  if (filters?.active === true) {
    conditions.push('is_active = TRUE');
  } else if (filters?.active === false) {
    conditions.push('is_active = FALSE');
  }

  if (filters?.search) {
    conditions.push(`content ILIKE $${paramIdx++}`);
    params.push(`%${filters.search}%`);
  }

  if (filters?.createdBy) {
    conditions.push(`created_by_user_id = $${paramIdx++}`);
    params.push(filters.createdBy);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sort = filters?.sort === 'use_count' ? 'use_count DESC' :
    filters?.sort === 'updated_at' ? 'updated_at DESC' : 'created_at DESC';
  const limit = filters?.limit || 100;

  return query<BrainMemory>(
    `SELECT * FROM brain_memories ${where} ORDER BY ${sort} LIMIT $${paramIdx}`,
    [...params, limit]
  );
}

export async function createMemory(data: CreateMemoryInput): Promise<BrainMemory> {
  if (!VALID_CATEGORIES.includes(data.category)) {
    throw new Error(`Invalid category: ${data.category}`);
  }
  if (data.content.length > MAX_CONTENT_CHARS) {
    throw new Error(`Content exceeds ${MAX_CONTENT_CHARS} chars`);
  }

  const memory = await queryOne<BrainMemory>(
    `INSERT INTO brain_memories (content, category, domains, source_type, source_conversation_id, source_quote, created_by_user_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.content,
      data.category,
      data.domains || [],
      data.source_type || 'admin',
      data.source_conversation_id || null,
      data.source_quote || null,
      data.created_by_user_id || null,
      data.is_active !== undefined ? data.is_active : true,
    ]
  );
  return memory!;
}

export async function updateMemory(id: string, updates: UpdateMemoryInput): Promise<BrainMemory> {
  const sets: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (updates.content !== undefined) {
    if (updates.content.length > MAX_CONTENT_CHARS) {
      throw new Error(`Content exceeds ${MAX_CONTENT_CHARS} chars`);
    }
    sets.push(`content = $${paramIdx++}`);
    params.push(updates.content);
  }
  if (updates.category !== undefined) {
    if (!VALID_CATEGORIES.includes(updates.category)) {
      throw new Error(`Invalid category: ${updates.category}`);
    }
    sets.push(`category = $${paramIdx++}`);
    params.push(updates.category);
  }
  if (updates.domains !== undefined) {
    sets.push(`domains = $${paramIdx++}`);
    params.push(updates.domains);
  }
  if (updates.is_active !== undefined) {
    sets.push(`is_active = $${paramIdx++}`);
    params.push(updates.is_active);
  }
  if (updates.is_pinned !== undefined) {
    sets.push(`is_pinned = $${paramIdx++}`);
    params.push(updates.is_pinned);
  }
  if (updates.expires_at !== undefined) {
    sets.push(`expires_at = $${paramIdx++}`);
    params.push(updates.expires_at);
  }

  if (sets.length === 0) throw new Error('No updates provided');

  params.push(id);
  const memory = await queryOne<BrainMemory>(
    `UPDATE brain_memories SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    params
  );
  if (!memory) throw new Error('Memory not found');
  return memory;
}

export async function deleteMemory(id: string): Promise<void> {
  const result = await query('DELETE FROM brain_memories WHERE id = $1', [id]);
  // query returns rows, for DELETE it's empty but no error means success
}

export async function toggleActive(id: string): Promise<BrainMemory> {
  const memory = await queryOne<BrainMemory>(
    `UPDATE brain_memories SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!memory) throw new Error('Memory not found');
  return memory;
}

export async function togglePin(id: string): Promise<BrainMemory> {
  const memory = await queryOne<BrainMemory>(
    `UPDATE brain_memories SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!memory) throw new Error('Memory not found');
  return memory;
}

// === STATS ===

export async function getMemoryStats(): Promise<{
  total: number;
  active: number;
  pending: number;
  pinned: number;
  byCategory: Record<MemoryCategory, number>;
  totalChars: number;
  budgetUsed: string;
  extractions_attempted_24h: number;
  extractions_succeeded_24h: number;
  extraction_errors_24h: number;
}> {
  resetCountersIfNeeded();

  const stats = await queryOne<{
    total: string;
    active: string;
    pending: string;
    pinned: string;
    total_chars: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_active = TRUE) as active,
       COUNT(*) FILTER (WHERE is_active = FALSE) as pending,
       COUNT(*) FILTER (WHERE is_pinned = TRUE) as pinned,
       COALESCE(SUM(char_count) FILTER (WHERE is_active = TRUE), 0) as total_chars
     FROM brain_memories`
  );

  const categories = await query<{ category: string; count: string }>(
    `SELECT category, COUNT(*) as count FROM brain_memories GROUP BY category`
  );

  const byCategory: Record<MemoryCategory, number> = { domain: 0, preference: 0, pattern: 0 };
  for (const row of categories) {
    if (VALID_CATEGORIES.includes(row.category as MemoryCategory)) {
      byCategory[row.category as MemoryCategory] = parseInt(row.count);
    }
  }

  const totalChars = parseInt(stats?.total_chars || '0');

  return {
    total: parseInt(stats?.total || '0'),
    active: parseInt(stats?.active || '0'),
    pending: parseInt(stats?.pending || '0'),
    pinned: parseInt(stats?.pinned || '0'),
    byCategory,
    totalChars,
    budgetUsed: `${totalChars} / ${MEMORY_BUDGET_CHARS}`,
    extractions_attempted_24h: extractionCounters.attempted,
    extractions_succeeded_24h: extractionCounters.succeeded,
    extraction_errors_24h: extractionCounters.errors,
  };
}

// === AUTO-ACTIVATE PENDING (7 days) ===

export async function autoActivatePending(): Promise<number> {
  // Top up the active set toward the cap with the BEST pending memories
  // (quality order: pinned → soul → importance → spirit → recency). We no longer
  // blindly activate every pending >7d — that flooded the set and fought the decay
  // pass, leaving it thrashing. Intelligent dedup/merge/promote lives in the weekly
  // curation cron; this just keeps a healthy active pool up to the cap.
  const activeRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM brain_memories WHERE is_active = TRUE`
  );
  const room = MAX_ACTIVE_MEMORIES - parseInt(activeRow?.count || '0');
  if (room <= 0) return 0;
  const result = await query(
    `UPDATE brain_memories SET is_active = TRUE
     WHERE id IN (
       SELECT id FROM brain_memories
       WHERE is_active = FALSE
         AND created_at < NOW() - INTERVAL '${AUTO_ACTIVATE_DAYS} days'
       ORDER BY is_pinned DESC, COALESCE(soul, 0) DESC, COALESCE(importance, 0) DESC,
                COALESCE(spirit_level, 0) DESC, created_at DESC
       LIMIT $1
     ) RETURNING id`,
    [room]
  );
  if (result.length > 0) {
    console.log(`[brain-memory] Auto-activated ${result.length} pending memories (top-up to cap ${MAX_ACTIVE_MEMORIES})`);
  }
  return result.length;
}

// === DECAY (monthly cleanup) ===

export async function runDecay(): Promise<{ deactivated: number }> {
  let deactivated = 0;

  // Rule 1: unpinned, 0 uses, >90 days old → deactivate
  const r1 = await query(
    `UPDATE brain_memories SET is_active = FALSE
     WHERE is_pinned = FALSE AND use_count = 0 AND is_active = TRUE
       AND created_at < NOW() - INTERVAL '90 days'
     RETURNING id`
  );
  deactivated += r1.length;

  // Rule 2: unpinned, ≤1 use, last used >60 days ago → deactivate
  const r2 = await query(
    `UPDATE brain_memories SET is_active = FALSE
     WHERE is_pinned = FALSE AND use_count <= 1 AND is_active = TRUE
       AND last_used_at < NOW() - INTERVAL '60 days'
     RETURNING id`
  );
  deactivated += r2.length;

  // Rule 3: active count > MAX_ACTIVE_MEMORIES → deactivate lowest use_count
  const activeCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM brain_memories WHERE is_active = TRUE`
  );
  const count = parseInt(activeCount?.count || '0');
  if (count > MAX_ACTIVE_MEMORIES) {
    const excess = count - MAX_ACTIVE_MEMORIES;
    const r3 = await query(
      `UPDATE brain_memories SET is_active = FALSE
       WHERE id IN (
         SELECT id FROM brain_memories
         WHERE is_active = TRUE AND is_pinned = FALSE
         ORDER BY use_count ASC, created_at ASC
         LIMIT $1
       ) RETURNING id`,
      [excess]
    );
    deactivated += r3.length;
  }

  if (deactivated > 0) {
    console.log(`[brain-memory] Decay: deactivated ${deactivated} memories`);
  }
  return { deactivated };
}
