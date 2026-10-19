import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import { isAnyAdmin } from '../middleware/auth';

export const workspaceRouter = Router();

// GET /workspace - List all workspace items (visible to all users)
workspaceRouter.get('/', async (req: Request, res: Response) => {
  const typeFilter = req.query.type as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let whereClause = '';
  const params: any[] = [];

  if (typeFilter) {
    whereClause = 'WHERE w.item_type = $1';
    params.push(typeFilter);
  }

  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  params.push(limit, offset);

  const items = await query(
    `SELECT w.id, w.user_id, w.item_type, w.item_id, w.title, w.description, w.created_at,
            u.name as user_name
     FROM workspace_items w
     JOIN users u ON w.user_id = u.id
     ${whereClause}
     ORDER BY w.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const countParams = params.slice(0, -2);
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM workspace_items w ${whereClause}`,
    countParams
  );

  res.json({
    items: items.map(i => ({
      id: i.id,
      userId: i.user_id,
      userName: i.user_name,
      itemType: i.item_type,
      itemId: i.item_id,
      title: i.title,
      description: i.description || null,
      createdAt: i.created_at,
    })),
    total: Number(countResult?.count || 0),
  });
});

// POST /workspace - Add item to workspace
workspaceRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { itemType, itemId, title, description } = req.body;

  if (!itemType || !itemId || !title) {
    res.status(400).json({ error: 'itemType, itemId, and title are required' });
    return;
  }

  if (!['file', 'report', 'conversation'].includes(itemType)) {
    res.status(400).json({ error: 'itemType must be file, report, or conversation' });
    return;
  }

  // Check for duplicate
  const existing = await queryOne(
    'SELECT id FROM workspace_items WHERE item_type = $1 AND item_id = $2',
    [itemType, itemId]
  );

  if (existing) {
    res.status(409).json({ error: 'Item already shared to workspace' });
    return;
  }

  // Verify referenced item exists
  const sourceTable = itemType === 'file' ? 'user_files' : itemType === 'report' ? 'user_reports' : 'conversations';
  const sourceItem = await queryOne(`SELECT id FROM ${sourceTable} WHERE id = $1`, [itemId]);
  if (!sourceItem) {
    res.status(404).json({ error: 'Referenced item not found' });
    return;
  }

  const result = await queryOne<{ id: string }>(
    `INSERT INTO workspace_items (user_id, item_type, item_id, title, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, itemType, itemId, title, description || null]
  );

  res.json({ success: true, id: result!.id });
});

// DELETE /workspace/:id - Remove item (only owner or admin)
workspaceRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const isAdmin = isAnyAdmin(req.user?.role);
  const itemId = req.params.id;

  const item = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM workspace_items WHERE id = $1',
    [itemId]
  );

  if (!item) {
    res.status(404).json({ error: 'Workspace item not found' });
    return;
  }

  if (item.user_id !== userId && !isAdmin) {
    res.status(403).json({ error: 'Only the owner or admin can remove workspace items' });
    return;
  }

  await query('DELETE FROM workspace_items WHERE id = $1', [itemId]);
  res.json({ success: true });
});
