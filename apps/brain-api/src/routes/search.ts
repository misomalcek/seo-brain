import { Router, Request, Response } from 'express';
import { query } from '../db/connection';

export const searchRouter = Router();

// GET /search?q=term&types=conversations,files,content,reports
searchRouter.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const typesParam = String(req.query.types || 'conversations,files,content,reports');
  const types = typesParam.split(',').map(t => t.trim());
  const limit = Math.min(Number(req.query.limit) || 10, 30);
  const userId = req.user!.userId;

  if (!q || q.length < 2) {
    res.json({ results: [], total: 0 });
    return;
  }

  const pattern = `%${q}%`;
  const results: Array<{ type: string; id: string; title: string; snippet: string; date: string }> = [];

  // Search conversations
  if (types.includes('conversations')) {
    try {
      const convs = await query(
        `SELECT c.id, c.title, c.updated_at,
                (SELECT content FROM messages WHERE conversation_id = c.id AND content ILIKE $2 LIMIT 1) as snippet
         FROM conversations c
         WHERE c.user_id = $1 AND (c.title ILIKE $2 OR EXISTS (
           SELECT 1 FROM messages cm WHERE cm.conversation_id = c.id AND cm.content ILIKE $2
         ))
         ORDER BY c.updated_at DESC LIMIT $3`,
        [userId, pattern, limit]
      );
      for (const c of convs) {
        results.push({
          type: 'conversation',
          id: c.id,
          title: c.title || 'Konverzacia',
          snippet: truncate(c.snippet || c.title || '', 120),
          date: c.updated_at,
        });
      }
    } catch (err) { console.error('Search conversations error:', err); }
  }

  // Search files
  if (types.includes('files')) {
    try {
      const files = await query(
        `SELECT id, original_name, mime_type, created_at
         FROM user_files
         WHERE user_id = $1 AND original_name ILIKE $2
         ORDER BY created_at DESC LIMIT $3`,
        [userId, pattern, limit]
      );
      for (const f of files) {
        results.push({
          type: 'file',
          id: f.id,
          title: f.original_name,
          snippet: f.mime_type,
          date: f.created_at,
        });
      }
    } catch (err) { console.error('Search files error:', err); }
  }

  // Search content items
  if (types.includes('content')) {
    try {
      const items = await query(
        `SELECT c.id, c.title, c.description, c.status, c.updated_at, s.domain as site_domain
         FROM content_items c
         LEFT JOIN sites s ON c.site_id = s.id
         WHERE c.title ILIKE $1 OR c.description ILIKE $1 OR c.notes ILIKE $1
         ORDER BY c.updated_at DESC LIMIT $2`,
        [pattern, limit]
      );
      for (const item of items) {
        results.push({
          type: 'content',
          id: item.id,
          title: item.title,
          snippet: truncate(item.description || `${item.status}${item.site_domain ? ' · ' + item.site_domain : ''}`, 120),
          date: item.updated_at,
        });
      }
    } catch (err) { console.error('Search content error:', err); }
  }

  // Search reports
  if (types.includes('reports')) {
    try {
      const reports = await query(
        `SELECT id, title, template_type, created_at
         FROM html_reports
         WHERE user_id = $1 AND title ILIKE $2
         ORDER BY created_at DESC LIMIT $3`,
        [userId, pattern, limit]
      );
      for (const r of reports) {
        results.push({
          type: 'report',
          id: r.id,
          title: r.title,
          snippet: r.template_type,
          date: r.created_at,
        });
      }
    } catch (err) { console.error('Search reports error:', err); }
  }

  // Sort all results by date descending
  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({ results: results.slice(0, limit * 2), total: results.length });
});

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

// GET /search/context — unified semantic search across all 6 sources
// (memory + article + knowledge + agent + brand + template). Moved out from
// /admin/context/search (2026-05-26) so any logged-in team user can call it;
// the underlying brain_embeddings table is team-shared knowledge, not
// per-user, so no privacy gate is needed. Admin variant still exists at
// /admin/context/search for the dedicated admin page.
searchRouter.get('/context', async (req: Request, res: Response) => {
  try {
    const queryText = String(req.query.q || '').trim();
    if (!queryText) { res.status(400).json({ error: 'Query param "q" required.' }); return; }
    const limit = Math.min(parseInt(String(req.query.limit || '15'), 10), 50);
    const perSourceLimit = Math.min(parseInt(String(req.query.perSource || '8'), 10), 20);
    const minScore = parseFloat(String(req.query.minScore || '0.25'));
    const sources = req.query.sources ? String(req.query.sources).split(',') : undefined;
    const { unifiedContextSearch } = await import('../services/brain-memory');
    const result = await unifiedContextSearch(queryText, { limit, perSourceLimit, minScore, sources });
    res.json(result);
  } catch (err) {
    console.error('[search/context] error:', err);
    res.status(500).json({ error: String(err) });
  }
});
