import { Router } from 'express';
import type { Request, Response } from 'express';
import { query } from '../db/connection';

export const graphRouter = Router();

export interface GraphNode {
  id: string;
  label: string;
  type: 'memory' | 'category' | 'domain';
  group: string;
  size: number;
  active?: boolean;   // memory nodes: is_active (pending memories render dimmed)
  detail?: string;    // memory nodes: fuller content for the detail panel
  pinned?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

// GET /api/graph/data
// Returns nodes + edges for the Brain knowledge graph.
// Node types:
//   - category: one hub per memory category (domain/pattern/preference/analysis)
//   - memory: active brain_memories (max 120, limited for render perf)
//   - domain: unique domain tags from memories (linked to memories that carry them)
// This endpoint does NOT require Apache AGE — it builds the graph from relational data.
graphRouter.get('/data', async (_req: Request, res: Response) => {
  try {
    // Memories — active first (rendered solid), then most-recent pending (dimmed).
    // Previously WHERE is_active = true only, which left the graph near-empty when
    // most extractions sit in the pending inbox. We now include pending so the
    // knowledge graph reflects the full picture; the frontend dims inactive nodes.
    const memoriesResult = await query(`
      SELECT id, content, category, domains, is_pinned, is_active
      FROM brain_memories
      ORDER BY is_active DESC, is_pinned DESC, created_at DESC
      LIMIT 150
    `);

    const memories = memoriesResult as Array<{
      id: string;
      content: string;
      category: string | null;
      domains: string[] | null;
      is_pinned: boolean;
      is_active: boolean;
    }>;

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const addedCategories = new Set<string>();
    const addedDomains = new Set<string>();

    // Category hub nodes
    const CATEGORIES = ['domain', 'pattern', 'preference', 'analysis'];
    for (const cat of CATEGORIES) {
      const count = memories.filter(m => m.category === cat).length;
      if (count > 0) {
        nodes.push({ id: `cat:${cat}`, label: cat, type: 'category', group: cat, size: Math.min(24, 14 + count * 0.4) });
        addedCategories.add(cat);
      }
    }

    // Memory nodes + edges to their category hub
    for (const m of memories) {
      const id = `mem:${m.id}`;
      const label = m.content.slice(0, 40).replace(/\s+/g, ' ').trim() + (m.content.length > 40 ? '…' : '');
      const group = m.category || 'other';
      nodes.push({
        id, label, type: 'memory', group,
        size: m.is_pinned ? 9 : 6,
        active: m.is_active,
        pinned: m.is_pinned,
        detail: m.content.slice(0, 280).replace(/\s+/g, ' ').trim() + (m.content.length > 280 ? '…' : ''),
      });

      // Edge to category hub
      if (m.category && addedCategories.has(m.category)) {
        edges.push({ source: `cat:${m.category}`, target: id });
      }

      // Domain hub nodes — add once, then link memory to domain
      if (m.domains?.length) {
        for (const domain of m.domains.slice(0, 3)) {
          const domId = `dom:${domain}`;
          if (!addedDomains.has(domain)) {
            nodes.push({ id: domId, label: domain, type: 'domain', group: 'domain', size: 10 });
            addedDomains.add(domain);
          }
          edges.push({ source: domId, target: id });
        }
      }
    }

    res.json({
      nodes,
      edges,
      meta: {
        total_memories: memories.length,
        active_memories: memories.filter(m => m.is_active).length,
        categories: [...addedCategories],
        domains: [...addedDomains].slice(0, 20),
      },
    });
  } catch (err) {
    console.error('[graph] data error:', err);
    res.status(500).json({ error: 'Graph data load failed' });
  }
});
