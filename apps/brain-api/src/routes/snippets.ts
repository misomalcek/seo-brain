/**
 * Chat snippets — per-user saveable markdown drafts (Run V, 2026-05-27).
 *
 * Ported from Factorium's factorium-input-snippets/ filesystem store.
 * Brain is multi-user → DB-backed and scoped to the calling user.
 *
 *   GET    /api/snippets               → list { snippets: [{slug,title,updated_at}] }
 *   GET    /api/snippets/:slug         → fetch { slug, title, content }
 *   POST   /api/snippets               → save  body { title, content }
 *   DELETE /api/snippets/:slug         → remove
 */
import { Router, Request, Response } from 'express';
import { query } from '../db/connection';

export const snippetsRouter = Router();

function toSlug(title: string): string {
  return (title || 'untitled')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

snippetsRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = await query<{ slug: string; title: string; updated_at: string }>(
    `SELECT slug, title, updated_at FROM chat_snippets
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 100`,
    [userId],
  );
  res.json({ snippets: rows });
});

snippetsRouter.get('/:slug', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const slug = String(req.params.slug || '').slice(0, 80);
  const rows = await query<{ slug: string; title: string; content_md: string }>(
    `SELECT slug, title, content_md FROM chat_snippets
     WHERE user_id = $1 AND slug = $2 LIMIT 1`,
    [userId, slug],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ slug: rows[0].slug, title: rows[0].title, content: rows[0].content_md });
});

snippetsRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const title = String(req.body?.title ?? '').trim() || 'untitled';
  const content = String(req.body?.content ?? '').trim();
  if (!content) { res.status(400).json({ error: 'content required' }); return; }
  const slug = toSlug(title);
  await query(
    `INSERT INTO chat_snippets (user_id, slug, title, content_md)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, slug) DO UPDATE
       SET title = EXCLUDED.title,
           content_md = EXCLUDED.content_md,
           updated_at = now()`,
    [userId, slug, title, content],
  );
  res.json({ ok: true, slug, title });
});

snippetsRouter.delete('/:slug', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const slug = String(req.params.slug || '').slice(0, 80);
  await query(
    `DELETE FROM chat_snippets WHERE user_id = $1 AND slug = $2`,
    [userId, slug],
  );
  res.json({ ok: true, slug });
});
