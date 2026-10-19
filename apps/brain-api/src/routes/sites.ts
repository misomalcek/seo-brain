import { Router, Request, Response } from 'express';
import { isAnyAdmin } from '../middleware/auth';
import { query, queryOne } from '../db/connection';

export const sitesRouter = Router();

// GET /sites - List all sites (all authenticated users)
sitesRouter.get('/', async (_req: Request, res: Response) => {
  const sites = await query(
    'SELECT id, domain, name, description, is_primary, gsc_property, created_at FROM sites ORDER BY is_primary DESC, name'
  );

  res.json({
    sites: sites.map(s => ({
      id: s.id,
      domain: s.domain,
      name: s.name,
      description: s.description,
      isPrimary: s.is_primary,
      gscProperty: s.gsc_property,
      createdAt: s.created_at,
    })),
  });
});

// GET /sites/:id - Get site details
sitesRouter.get('/:id', async (req: Request, res: Response) => {
  const site = await queryOne(
    'SELECT id, domain, name, description, is_primary, gsc_property, created_at FROM sites WHERE id = $1',
    [req.params.id]
  );

  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  res.json({
    id: site.id,
    domain: site.domain,
    name: site.name,
    description: site.description,
    isPrimary: site.is_primary,
    gscProperty: site.gsc_property,
    createdAt: site.created_at,
  });
});

// POST /sites - Create site (admin only)
sitesRouter.post('/', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const { domain, name, description, isPrimary, gscProperty } = req.body;

  if (!domain || !name) {
    res.status(400).json({ error: 'domain and name are required' });
    return;
  }

  const existing = await queryOne('SELECT id FROM sites WHERE domain = $1', [domain]);
  if (existing) {
    res.status(409).json({ error: 'Site with this domain already exists' });
    return;
  }

  const result = await queryOne<{ id: string }>(
    `INSERT INTO sites (domain, name, description, is_primary, gsc_property)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [domain, name, description || null, isPrimary || false, gscProperty || null]
  );

  res.json({ success: true, id: result!.id });
});

// PUT /sites/:id - Update site (admin only)
sitesRouter.put('/:id', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const { name, description, isPrimary, gscProperty } = req.body;
  const siteId = req.params.id;

  const site = await queryOne('SELECT id FROM sites WHERE id = $1', [siteId]);
  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  await query(
    `UPDATE sites SET name = COALESCE($1, name), description = $2, is_primary = COALESCE($3, is_primary), gsc_property = $4
     WHERE id = $5`,
    [name, description ?? null, isPrimary, gscProperty ?? null, siteId]
  );

  res.json({ success: true });
});

// DELETE /sites/:id - Delete site (admin only)
sitesRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const site = await queryOne('SELECT id, is_primary FROM sites WHERE id = $1', [req.params.id]);
  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  if (site.is_primary) {
    res.status(400).json({ error: 'Cannot delete primary site' });
    return;
  }

  await query('DELETE FROM sites WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});
