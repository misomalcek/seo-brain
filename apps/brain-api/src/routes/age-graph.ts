/**
 * Apache AGE routes (2026-05-26 — order-1 wiring).
 *
 * Brain's `hive_graph` Cypher graph is seeded by migration 038 from
 * brain_embeddings + brain_memories. These three routes give the user UI
 * and the agent tool `knowledge_graph_query` a thin Cypher surface:
 *
 *   GET /api/graph/age/stats
 *   GET /api/graph/age/explore?node=<entityId>&depth=1|2
 *   GET /api/graph/age/path?from=<id>&to=<id>&maxDepth=3
 *
 * Mounted under requireAuth like the rest of /api/graph/* — team-shared
 * knowledge, no per-user filtering needed.
 *
 * AGE quirks handled here:
 *   - LOAD 'age' + SET search_path per connection (pg pool reuses
 *     connections so we set per query for safety)
 *   - `agtype` columns come back as strings — we parse via small helper
 *   - Cypher params can't bind directly; we sanitise + interpolate as
 *     literal strings (whitelist on shape).
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/connection';

export const ageGraphRouter = Router();

// ── AGE plumbing ───────────────────────────────────────────────────────────

/** Sanitise an entity id passed in by the caller — must look like a UUID or
 *  short alphanumeric. We reject anything else so we can interpolate it
 *  literally into Cypher without param binding (AGE does not accept $params). */
function safeId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

/** Strip the AGE type suffix from an agtype literal: "{...}::vertex" → {...}. */
function parseAg(value: any): any {
  if (typeof value !== 'string') return value;
  const cleaned = value
    .replace(/::vertex$/, '')
    .replace(/::edge$/, '')
    .replace(/::path$/, '')
    .replace(/::numeric$/, '')
    .replace(/::integer$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return cleaned;
  }
}

/** Run a Cypher query that already has values inlined and returns N agtype columns.
 *  Each row in the result is returned as a parsed array (one element per RETURN slot). */
// Graph name is env-configurable (AGE_GRAPH). Default hive_kg_graph = the
// knowledge graph (the DB actually holds hive_kg_graph + hive_code_graph, NOT
// the old hardcoded 'hive_graph' which doesn't exist). Sanitized to a bare
// identifier since it's interpolated into SQL.
const AGE_GRAPH = (process.env.AGE_GRAPH || 'hive_kg_graph').replace(/[^a-zA-Z0-9_]/g, '');

async function cypher<T = any>(cy: string, columns: string[]): Promise<T[]> {
  const colSig = columns.map(c => `${c} agtype`).join(', ');
  // AGE preloaded by postmaster (session_preload_libraries on brain_app);
  // search_path set per-connection in pool.on('connect').
  const sql = `SELECT * FROM cypher('${AGE_GRAPH}', $cy$ ${cy} $cy$) AS (${colSig})`;
  const rows = await query<any>(sql);
  return rows.map(r => {
    const out: any = {};
    for (const c of columns) out[c] = parseAg(r[c]);
    return out as T;
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/graph/age/stats — counts of vertices by label + edges by type.
ageGraphRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [vertices, edges, domains] = await Promise.all([
      cypher<{ lbl: any; c: any }>(
        `MATCH (n) RETURN labels(n) AS lbl, count(*) AS c`,
        ['lbl', 'c'],
      ),
      cypher<{ rt: any; c: any }>(
        `MATCH ()-[r]->() RETURN type(r) AS rt, count(*) AS c`,
        ['rt', 'c'],
      ),
      cypher<{ name: any; degree: any }>(
        `MATCH (d:Domain)<-[r:IN_DOMAIN]-(:Memory)
         RETURN d.name AS name, count(r) AS degree
         ORDER BY degree DESC LIMIT 20`,
        ['name', 'degree'],
      ),
    ]);
    res.json({
      vertices: vertices.map(v => ({ labels: Array.isArray(v.lbl) ? v.lbl : [v.lbl], count: Number(v.c) })),
      edges:    edges.map(e => ({ type: String(e.rt), count: Number(e.c) })),
      topDomains: domains.map(d => ({ name: String(d.name), degree: Number(d.degree) })),
    });
  } catch (err: any) {
    console.error('[age/stats] error:', err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// GET /api/graph/age/explore?node=<id>&depth=1
ageGraphRouter.get('/explore', async (req: Request, res: Response) => {
  const node = safeId(req.query.node);
  if (!node) { res.status(400).json({ error: 'node param required (UUID or alphanumeric)' }); return; }
  const depth = Math.min(Math.max(parseInt(String(req.query.depth ?? '1'), 10), 1), 2);

  try {
    const rows = await cypher<{ n: any; r: any; m: any }>(
      `MATCH (n:Entity { id: '${node}' })-[r*1..${depth}]-(m:Entity)
       RETURN n, r, m
       LIMIT 100`,
      ['n', 'r', 'm'],
    );
    if (rows.length === 0) {
      // Confirm the starting node at least exists, otherwise the empty
      // result is a not-found rather than an isolated-node case.
      const exists = await cypher<{ n: any }>(
        `MATCH (n:Entity { id: '${node}' }) RETURN n LIMIT 1`,
        ['n'],
      );
      if (exists.length === 0) {
        res.status(404).json({ error: `node ${node} not found in hive_graph` });
        return;
      }
      res.json({ centre: exists[0].n, neighbours: [], edges: [], depth });
      return;
    }
    const centre = rows[0].n;
    const neighbourMap = new Map<string, any>();
    const edges: any[] = [];
    for (const row of rows) {
      const m = row.m;
      if (m?.properties?.id && m.properties.id !== node) {
        neighbourMap.set(m.properties.id, m);
      }
      const rs = Array.isArray(row.r) ? row.r : [row.r];
      for (const e of rs) {
        if (e?.start_id && e?.end_id) {
          edges.push({
            type: e.label ?? 'EDGE',
            start_id: e.start_id,
            end_id: e.end_id,
            properties: e.properties ?? {},
          });
        }
      }
    }
    res.json({
      centre,
      neighbours: Array.from(neighbourMap.values()),
      edges,
      depth,
    });
  } catch (err: any) {
    console.error('[age/explore] error:', err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// GET /api/graph/age/path?from=<id>&to=<id>&maxDepth=3
ageGraphRouter.get('/path', async (req: Request, res: Response) => {
  const from = safeId(req.query.from);
  const to = safeId(req.query.to);
  if (!from || !to) { res.status(400).json({ error: 'from + to params required (UUID or alphanumeric)' }); return; }
  const maxDepth = Math.min(Math.max(parseInt(String(req.query.maxDepth ?? '3'), 10), 1), 5);

  try {
    const rows = await cypher<{ p: any }>(
      `MATCH p = (a:Entity { id: '${from}' })-[*1..${maxDepth}]-(b:Entity { id: '${to}' })
       RETURN p
       ORDER BY length(p)
       LIMIT 1`,
      ['p'],
    );
    if (rows.length === 0) {
      res.json({ found: false, from, to, maxDepth });
      return;
    }
    res.json({ found: true, from, to, path: rows[0].p });
  } catch (err: any) {
    console.error('[age/path] error:', err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});
