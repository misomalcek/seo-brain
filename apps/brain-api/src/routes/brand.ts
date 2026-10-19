import { Router, Request, Response } from 'express';
import { isAnyAdmin } from '../middleware/auth';
import { query, queryOne } from '../db/connection';

export const brandRouter = Router();

const VALID_ASSET_TYPES = [
  'voice-guide', 'writing-dna', 'style-guide', 'topic-clusters',
  'seo-strategy', 'web-architecture', 'sitemap',
  'quality-checklist-seo', 'quality-checklist-content', 'custom',
];

// GET /brand/assets - List all brand assets (with optional site filter)
brandRouter.get('/assets', async (req: Request, res: Response) => {
  const siteId = req.query.siteId as string | undefined;
  let assets;

  if (siteId) {
    // Get site-specific + core assets
    assets = await query(
      `SELECT ba.id, ba.site_id, ba.asset_type, ba.title, ba.version, ba.created_at, ba.updated_at,
              s.name as site_name, s.domain as site_domain
       FROM brand_assets ba
       LEFT JOIN sites s ON ba.site_id = s.id
       WHERE ba.site_id = $1 OR ba.site_id IS NULL
       ORDER BY ba.asset_type, ba.site_id NULLS LAST`,
      [siteId]
    );
  } else {
    assets = await query(
      `SELECT ba.id, ba.site_id, ba.asset_type, ba.title, ba.version, ba.created_at, ba.updated_at,
              s.name as site_name, s.domain as site_domain
       FROM brand_assets ba
       LEFT JOIN sites s ON ba.site_id = s.id
       ORDER BY ba.asset_type, ba.site_id NULLS LAST`
    );
  }

  res.json({
    assets: assets.map(a => ({
      id: a.id,
      siteId: a.site_id,
      siteName: a.site_name || null,
      siteDomain: a.site_domain || null,
      assetType: a.asset_type,
      title: a.title,
      version: a.version,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
  });
});

// GET /brand/assets/:id - Get single asset with full content
brandRouter.get('/assets/:id', async (req: Request, res: Response) => {
  const asset = await queryOne(
    `SELECT ba.*, s.name as site_name, s.domain as site_domain, u.name as updated_by_name
     FROM brand_assets ba
     LEFT JOIN sites s ON ba.site_id = s.id
     LEFT JOIN users u ON ba.updated_by = u.id
     WHERE ba.id = $1`,
    [req.params.id]
  );

  if (!asset) {
    res.status(404).json({ error: 'Brand asset not found' });
    return;
  }

  res.json({
    id: asset.id,
    siteId: asset.site_id,
    siteName: asset.site_name || null,
    siteDomain: asset.site_domain || null,
    assetType: asset.asset_type,
    title: asset.title,
    content: asset.content,
    version: asset.version,
    updatedBy: asset.updated_by,
    updatedByName: asset.updated_by_name || null,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
  });
});

// GET /brand/context?siteId=X - Get resolved brand context for AI injection
// Priority: site-specific > core brand
brandRouter.get('/context', async (req: Request, res: Response) => {
  const siteId = req.query.siteId as string | undefined;

  // Get all core assets
  const coreAssets = await query(
    'SELECT asset_type, title, content FROM brand_assets WHERE site_id IS NULL ORDER BY asset_type'
  );

  // Build a map: asset_type -> content
  const contextMap = new Map<string, { title: string; content: string; source: string }>();

  for (const asset of coreAssets) {
    contextMap.set(asset.asset_type, {
      title: asset.title,
      content: asset.content,
      source: 'core',
    });
  }

  // If siteId provided, overlay with site-specific assets
  let siteName = '';
  let siteDomain = '';
  if (siteId) {
    const site = await queryOne<{ name: string; domain: string }>(
      'SELECT name, domain FROM sites WHERE id = $1',
      [siteId]
    );
    if (site) {
      siteName = site.name;
      siteDomain = site.domain;
    }

    const siteAssets = await query(
      'SELECT asset_type, title, content FROM brand_assets WHERE site_id = $1 ORDER BY asset_type',
      [siteId]
    );

    for (const asset of siteAssets) {
      contextMap.set(asset.asset_type, {
        title: asset.title,
        content: asset.content,
        source: 'site-specific',
      });
    }
  }

  // Build text context for system prompt
  const contextParts: string[] = [];

  if (siteName) {
    contextParts.push(`## Active Site: ${siteName} (${siteDomain})\n`);
  }

  for (const [type, data] of contextMap) {
    contextParts.push(`### ${data.title}\n${data.content}\n`);
  }

  res.json({
    siteName: siteName || null,
    siteDomain: siteDomain || null,
    assetCount: contextMap.size,
    context: contextParts.join('\n'),
    assets: Array.from(contextMap.entries()).map(([type, data]) => ({
      assetType: type,
      title: data.title,
      source: data.source,
    })),
  });
});

// POST /brand/assets - Create a new version of a brand asset (admin only).
// Newer-version-wins: computes version = MAX(existing)+1 for the same (site_id, asset_type)
// and inserts a new row — previous rows are kept as history.
brandRouter.post('/assets', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const userId = req.user!.userId;
  const { siteId, assetType, title, content } = req.body;

  if (!assetType || !title || !content) {
    res.status(400).json({ error: 'assetType, title, and content are required' });
    return;
  }

  if (!VALID_ASSET_TYPES.includes(assetType)) {
    res.status(400).json({ error: `Invalid asset type. Valid: ${VALID_ASSET_TYPES.join(', ')}` });
    return;
  }

  // Validate site exists if provided
  if (siteId) {
    const site = await queryOne('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
  }

  // Compute next version: COALESCE(MAX(version), 0) + 1 for the same (site_id, asset_type).
  // NULL site_id is treated as core brand (global).
  const versionRow = await queryOne<{ next_version: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM brand_assets
     WHERE asset_type = $1
       AND ($2::uuid IS NULL AND site_id IS NULL OR site_id = $2::uuid)`,
    [assetType, siteId || null]
  );
  const nextVersion = versionRow?.next_version ?? 1;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO brand_assets (site_id, asset_type, title, content, version, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [siteId || null, assetType, title, content, nextVersion, userId]
  );

  res.json({ success: true, id: result!.id, version: nextVersion });
});

// PUT /brand/assets/:id - Update asset (admin only, increments version)
brandRouter.put('/assets/:id', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const userId = req.user!.userId;
  const { title, content } = req.body;

  const asset = await queryOne('SELECT id FROM brand_assets WHERE id = $1', [req.params.id]);
  if (!asset) {
    res.status(404).json({ error: 'Brand asset not found' });
    return;
  }

  await query(
    `UPDATE brand_assets SET
      title = COALESCE($1, title),
      content = COALESCE($2, content),
      version = version + 1,
      updated_by = $3,
      updated_at = NOW()
     WHERE id = $4`,
    [title, content, userId, req.params.id]
  );

  res.json({ success: true });
});

// DELETE /brand/assets/:id - Delete asset (admin only)
brandRouter.delete('/assets/:id', async (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const asset = await queryOne('SELECT id FROM brand_assets WHERE id = $1', [req.params.id]);
  if (!asset) {
    res.status(404).json({ error: 'Brand asset not found' });
    return;
  }

  await query('DELETE FROM brand_assets WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});
