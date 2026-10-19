/**
 * Night Shift: Memory Curation (Pool Hygiene)
 * Schedule: Weekly Sunday 4:00 AM
 *
 * Cleans the brain_memories PENDING pool so it doesn't grow unbounded.
 * The daily autoActivatePending keeps the best 200 ACTIVE by quality —
 * this job does hygiene on the pending (is_active=false) pool only.
 *
 * SAFETY: NEVER touches is_pinned=true or is_active=true memories.
 * Only operates on unpinned pending (is_active=false, is_pinned=false).
 *
 * Three passes (in order, no double-counting):
 *   1. Dedup vs active   — pending whose embedding is sim>0.93 to any active → redundant
 *   2. Dedup within pending — cluster pending by sim>0.93; keep best per cluster
 *   3. Prune stale junk  — pending >90 days, 0 uses, importance<0.3, soul<0.3
 *
 * DRY-RUN BY DEFAULT. Set CURATE_APPLY=1 (or pass --apply) to mutate.
 */

import { db, postToBrainFeed, log, cleanup } from './runner';

// ─── Thresholds ─────────────────────────────────────────────────────────────
const SIM_THRESHOLD = 0.93;       // cosine similarity for near-duplicate detection
const STALE_DAYS = 90;             // days without use before a low-quality row is pruned
const STALE_IMPORTANCE = 0.3;      // importance ceiling for stale-junk pass
const STALE_SOUL = 0.3;            // soul ceiling for stale-junk pass
const MAX_PENDING_CANDIDATES = 500; // cap: process newest N pending rows
// ────────────────────────────────────────────────────────────────────────────

const DRY_RUN =
  process.env.CURATE_APPLY !== '1' && !process.argv.includes('--apply');

interface MemoryRow {
  id: string;
  soul: number | null;
  importance: number | null;
  spirit_level: number | null;
  created_at: Date;
  embedding: number[] | null;
}

/** Parse the Postgres vector literal "[0.1,0.2,...]" → number[] */
function parseVector(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  const str = String(raw);
  // pgvector returns strings like "[0.1,0.2,...]"
  const trimmed = str.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed) return null;
  return trimmed.split(',').map(Number);
}

/** Cosine similarity between two vectors (pre-normalized not assumed). */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  log('curate-memories', `Starting (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})...`);

  try {
    // ── Fetch candidates: newest N unpinned pending rows ──────────────────
    const candidatesResult = await db.query<MemoryRow & { embedding: string }>(
      `SELECT id, soul, importance, spirit_level, created_at, embedding::text AS embedding
       FROM brain_memories
       WHERE is_active = FALSE AND is_pinned = FALSE
         AND embedding IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [MAX_PENDING_CANDIDATES]
    );

    const candidates: (MemoryRow & { parsedEmbedding: number[] | null })[] =
      candidatesResult.rows.map(r => ({
        ...r,
        embedding: r.embedding,
        parsedEmbedding: parseVector(r.embedding),
      }));

    const pendingTotal = candidatesResult.rowCount ?? 0;
    log('curate-memories', `Loaded ${pendingTotal} pending candidates`);

    // Track deleted IDs across passes to avoid double-counting
    const deletedIds = new Set<string>();

    // ── PASS 1: Dedup vs active ───────────────────────────────────────────
    // For each pending candidate, ask: is there an active memory with sim>threshold?
    // Use the HNSW index via pgvector: for each embedding, nearest active neighbour.
    // We batch via a single lateral query using unnest + lateral.
    //
    // Strategy: pass the embedding literal for each candidate into a lateral subquery
    // that finds the nearest active. Do it in a single round-trip with unnest of ids
    // and a correlated lateral. With ~300 rows this is fast enough.

    let pass1Ids: string[] = [];
    if (candidates.length > 0) {
      // Build a VALUES list of (id, embedding_vector) for a single SQL call
      // pgvector accepts the cast-friendly literal '[f,f,f,...]'::vector
      const values = candidates
        .filter(c => c.parsedEmbedding !== null)
        .map((c, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::vector(768))`)
        .join(', ');

      const params: (string | string)[] = [];
      candidates
        .filter(c => c.parsedEmbedding !== null)
        .forEach(c => {
          params.push(c.id);
          params.push(`[${c.parsedEmbedding!.join(',')}]`);
        });

      if (params.length > 0) {
        const p1Result = await db.query<{ pending_id: string }>(
          `WITH candidates(pending_id, emb) AS (VALUES ${values})
           SELECT c.pending_id
           FROM candidates c
           WHERE EXISTS (
             SELECT 1
             FROM brain_memories a
             WHERE a.is_active = TRUE
               AND 1 - (a.embedding <=> c.emb) > $${params.length + 1}
             LIMIT 1
           )`,
          [...params, SIM_THRESHOLD]
        );
        pass1Ids = (p1Result.rows ?? []).map(r => r.pending_id);
      }
    }

    // Remove pass1 hits from the working set for subsequent passes
    pass1Ids.forEach(id => deletedIds.add(id));
    log('curate-memories', `Pass 1 (dedup vs active): ${pass1Ids.length} redundant`);

    // ── PASS 2: Dedup within pending ─────────────────────────────────────
    // Build similarity matrix in JS (O(n²) over ≤300 surviving rows — ~45K ops).
    // Greedy clustering: iterate by descending quality; if a row is already
    // absorbed into a cluster, skip it; otherwise it becomes the cluster keeper
    // and all rows within SIM_THRESHOLD are marked for deletion.
    //
    // Quality order: soul desc, importance desc, spirit_level desc, created_at desc.

    const surviving = candidates.filter(
      c => !deletedIds.has(c.id) && c.parsedEmbedding !== null
    );

    function qualityScore(c: MemoryRow): number {
      // Composite score for ordering; all fields nullable so default to 0
      return (
        (c.soul ?? 0) * 1000 +
        (c.importance ?? 0) * 100 +
        (c.spirit_level ?? 0) * 10 +
        // recency: newer = slightly higher (normalise to 0..1 range over a year)
        Math.min(1, (Date.now() - new Date(c.created_at).getTime()) / 0) // fallback below
      );
    }

    // Sort by quality descending (keep the best at the front)
    const sorted = [...surviving].sort((a, b) => {
      const sa = (a.soul ?? 0) * 1000 + (a.importance ?? 0) * 100 + (a.spirit_level ?? 0) * 10;
      const sb = (b.soul ?? 0) * 1000 + (b.importance ?? 0) * 100 + (b.spirit_level ?? 0) * 10;
      if (sb !== sa) return sb - sa;
      // newer first as tiebreaker
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const clusterAbsorbed = new Set<string>();
    const pass2Ids: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const keeper = sorted[i];
      if (clusterAbsorbed.has(keeper.id)) continue; // already absorbed by an earlier keeper

      // Find all lower-ranked rows (j > i) that are near-dups of this keeper
      for (let j = i + 1; j < sorted.length; j++) {
        const candidate = sorted[j];
        if (clusterAbsorbed.has(candidate.id)) continue;

        const sim = cosineSim(keeper.parsedEmbedding!, candidate.parsedEmbedding!);
        if (sim > SIM_THRESHOLD) {
          clusterAbsorbed.add(candidate.id);
          pass2Ids.push(candidate.id);
        }
      }
    }

    pass2Ids.forEach(id => deletedIds.add(id));
    log('curate-memories', `Pass 2 (dedup within pending): ${pass2Ids.length} cluster duplicates`);

    // ── PASS 3: Prune stale junk ──────────────────────────────────────────
    // Pure SQL predicate — no embeddings needed.
    // Excludes anything already slated for deletion in passes 1+2.
    const alreadyDeletedArr = Array.from(deletedIds);
    const excludeClause =
      alreadyDeletedArr.length > 0 ? `AND id != ALL($4::uuid[])` : '';
    const p3Params: (string | number | string[])[] = [
      STALE_DAYS,
      STALE_IMPORTANCE,
      STALE_SOUL,
    ];
    if (alreadyDeletedArr.length > 0) p3Params.push(alreadyDeletedArr);

    const p3Result = await db.query<{ id: string }>(
      `SELECT id
       FROM brain_memories
       WHERE is_active = FALSE AND is_pinned = FALSE
         AND created_at < NOW() - ($1 || ' days')::interval
         AND use_count = 0
         AND COALESCE(importance, 0) < $2
         AND COALESCE(soul, 0) < $3
         ${excludeClause}`,
      p3Params
    );
    const pass3Ids = (p3Result.rows ?? []).map(r => r.id);
    pass3Ids.forEach(id => deletedIds.add(id));
    log('curate-memories', `Pass 3 (stale junk): ${pass3Ids.length} stale rows`);

    // ── Summary counts ───────────────────────────────────────────────────
    const totalToDelete = deletedIds.size;
    log('curate-memories',
      `Total to ${DRY_RUN ? 'delete (dry-run)' : 'delete'}: ${totalToDelete} ` +
      `(pass1=${pass1Ids.length}, pass2=${pass2Ids.length}, pass3=${pass3Ids.length})`
    );

    // ── Execute deletions (apply mode only) ──────────────────────────────
    let pendingAfter: number | null = null;

    if (!DRY_RUN && totalToDelete > 0) {
      const idsToDelete = Array.from(deletedIds);

      // Pass 1 deletions
      if (pass1Ids.length > 0) {
        await db.query(
          `DELETE FROM brain_memories WHERE id = ANY($1::uuid[]) AND is_active = FALSE AND is_pinned = FALSE`,
          [pass1Ids]
        );
      }
      // Pass 2 deletions
      if (pass2Ids.length > 0) {
        await db.query(
          `DELETE FROM brain_memories WHERE id = ANY($1::uuid[]) AND is_active = FALSE AND is_pinned = FALSE`,
          [pass2Ids]
        );
      }
      // Pass 3 deletions
      if (pass3Ids.length > 0) {
        await db.query(
          `DELETE FROM brain_memories WHERE id = ANY($1::uuid[]) AND is_active = FALSE AND is_pinned = FALSE`,
          [pass3Ids]
        );
      }

      // Count remaining pending
      const afterResult = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM brain_memories WHERE is_active = FALSE AND is_pinned = FALSE`
      );
      pendingAfter = parseInt(afterResult.rows[0].cnt, 10);
    } else if (!DRY_RUN) {
      // Nothing to delete — still fetch pending count for the feed message
      const afterResult = await db.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM brain_memories WHERE is_active = FALSE AND is_pinned = FALSE`
      );
      pendingAfter = parseInt(afterResult.rows[0].cnt, 10);
    }

    // ── Post to BrainFeed ────────────────────────────────────────────────
    const feedMessage = DRY_RUN
      ? `[DRY-RUN] by zmazal: ` +
        `dedup-vs-active ${pass1Ids.length}, dedup-pending ${pass2Ids.length}, prune-stale ${pass3Ids.length} ` +
        `→ celkom ${totalToDelete} kandidátov (žiadna zmena)`
      : `🧹 Memory curation (týždenná): ` +
        `dedup-vs-active ${pass1Ids.length}, dedup-pending ${pass2Ids.length}, prune-stale ${pass3Ids.length} ` +
        `→ zmazaných ${totalToDelete}, pending teraz ${pendingAfter ?? '?'}`;

    await postToBrainFeed(feedMessage);
    log('curate-memories', 'Done.');

  } catch (err) {
    log('curate-memories', `Error: ${(err as Error).message}`);
    await postToBrainFeed(
      `⚠️ Memory curation: zlyhalo — ${(err as Error).message}`
    );
  } finally {
    await cleanup();
  }
}

main();
