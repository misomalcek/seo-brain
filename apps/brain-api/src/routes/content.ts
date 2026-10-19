import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';

export const contentRouter = Router();

// GET /content - List content items with filters
contentRouter.get('/', async (req: Request, res: Response) => {
  const { status, site, assignee, type, search, deadline_from, deadline_to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`c.status = $${paramIdx++}`);
    params.push(status);
  }
  if (site) {
    conditions.push(`c.site_id = $${paramIdx++}`);
    params.push(site);
  }
  if (assignee) {
    conditions.push(`c.assignee_id = $${paramIdx++}`);
    params.push(assignee);
  }
  if (type) {
    conditions.push(`c.content_type = $${paramIdx++}`);
    params.push(type);
  }
  if (search) {
    conditions.push(`(c.title ILIKE $${paramIdx} OR c.description ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (deadline_from) {
    conditions.push(`c.deadline >= $${paramIdx++}`);
    params.push(deadline_from);
  }
  if (deadline_to) {
    conditions.push(`c.deadline <= $${paramIdx++}`);
    params.push(deadline_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const items = await query(
    `SELECT c.*, s.domain as site_domain, s.name as site_name,
            u.name as assignee_name, cr.name as creator_name
     FROM content_items c
     LEFT JOIN sites s ON c.site_id = s.id
     LEFT JOIN users u ON c.assignee_id = u.id
     LEFT JOIN users cr ON c.created_by = cr.id
     ${where}
     ORDER BY
       CASE WHEN c.deadline IS NOT NULL AND c.deadline > NOW() THEN 0 ELSE 1 END,
       c.deadline ASC NULLS LAST,
       c.updated_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_items c ${where}`,
    params
  );

  res.json({
    items: items.map(formatItem),
    total: Number(countResult?.count || 0),
  });
});

// GET /content/stats - Stats by status, site, upcoming deadlines
contentRouter.get('/stats', async (_req: Request, res: Response) => {
  const byStatus = await query(
    `SELECT status, COUNT(*) as count FROM content_items GROUP BY status ORDER BY status`
  );

  const bySite = await query(
    `SELECT s.name as site_name, s.domain, COUNT(c.id) as count
     FROM content_items c
     LEFT JOIN sites s ON c.site_id = s.id
     GROUP BY s.name, s.domain
     ORDER BY count DESC`
  );

  const upcoming = await query(
    `SELECT c.id, c.title, c.deadline, c.status, s.domain as site_domain, u.name as assignee_name
     FROM content_items c
     LEFT JOIN sites s ON c.site_id = s.id
     LEFT JOIN users u ON c.assignee_id = u.id
     WHERE c.deadline IS NOT NULL
       AND c.deadline BETWEEN NOW() AND NOW() + INTERVAL '14 days'
       AND c.status NOT IN ('published', 'archived')
     ORDER BY c.deadline ASC
     LIMIT 20`
  );

  res.json({
    byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
    bySite: bySite.map(r => ({ siteName: r.site_name, domain: r.domain, count: Number(r.count) })),
    upcoming: upcoming.map(r => ({
      id: r.id,
      title: r.title,
      deadline: r.deadline,
      status: r.status,
      siteDomain: r.site_domain,
      assigneeName: r.assignee_name,
    })),
  });
});

// GET /content/:id - Single item
contentRouter.get('/:id', async (req: Request, res: Response) => {
  const item = await queryOne(
    `SELECT c.*, s.domain as site_domain, s.name as site_name,
            u.name as assignee_name, cr.name as creator_name
     FROM content_items c
     LEFT JOIN sites s ON c.site_id = s.id
     LEFT JOIN users u ON c.assignee_id = u.id
     LEFT JOIN users cr ON c.created_by = cr.id
     WHERE c.id = $1`,
    [req.params.id]
  );

  if (!item) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  res.json(formatItem(item));
});

// POST /content - Create
contentRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, description, status, contentType, siteId, assigneeId, deadline, url, keywords, notes, attachments } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const result = await queryOne<{ id: string }>(
    `INSERT INTO content_items (title, description, status, content_type, site_id, assignee_id, deadline, url, keywords, notes, attachments, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      title.trim(),
      description || null,
      status || 'idea',
      contentType || 'article',
      siteId || null,
      assigneeId || null,
      deadline || null,
      url || null,
      keywords || [],
      notes || null,
      JSON.stringify(attachments || []),
      userId,
    ]
  );

  res.json({ success: true, id: result!.id });
});

// PUT /content/:id - Update
contentRouter.put('/:id', async (req: Request, res: Response) => {
  const { title, description, status, contentType, siteId, assigneeId, deadline, url, keywords, notes, attachments } = req.body;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM content_items WHERE id = $1',
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  await query(
    `UPDATE content_items
     SET title = COALESCE($1, title),
         description = $2,
         status = COALESCE($3, status),
         content_type = COALESCE($4, content_type),
         site_id = $5,
         assignee_id = $6,
         deadline = $7,
         url = $8,
         keywords = COALESCE($9, keywords),
         notes = $10,
         attachments = COALESCE($11, attachments),
         updated_at = NOW()
     WHERE id = $12`,
    [
      title?.trim() || null,
      description ?? null,
      status || null,
      contentType || null,
      siteId || null,
      assigneeId || null,
      deadline || null,
      url || null,
      keywords || null,
      notes ?? null,
      attachments ? JSON.stringify(attachments) : null,
      req.params.id,
    ]
  );

  res.json({ success: true });
});

// PATCH /content/:id/status - Quick status change
contentRouter.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['idea', 'brief', 'draft', 'review', 'published', 'archived'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    return;
  }

  const result = await query(
    `UPDATE content_items SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, req.params.id]
  );

  if (result.length === 0 && !(await queryOne('SELECT id FROM content_items WHERE id = $1', [req.params.id]))) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  res.json({ success: true });
});

// DELETE /content/:id - Delete (creator or admin)
contentRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  const item = await queryOne<{ created_by: string }>(
    'SELECT created_by FROM content_items WHERE id = $1',
    [req.params.id]
  );

  if (!item) {
    res.status(404).json({ error: 'Content item not found' });
    return;
  }

  if (item.created_by !== userId && userRole !== 'admin') {
    res.status(403).json({ error: 'Only the creator or admin can delete' });
    return;
  }

  await query('DELETE FROM content_items WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// Helper: format DB row to API response
function formatItem(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    contentType: row.content_type,
    siteId: row.site_id,
    siteDomain: row.site_domain || null,
    siteName: row.site_name || null,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    createdBy: row.created_by,
    creatorName: row.creator_name || null,
    deadline: row.deadline,
    url: row.url,
    keywords: row.keywords || [],
    notes: row.notes,
    attachments: row.attachments || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
