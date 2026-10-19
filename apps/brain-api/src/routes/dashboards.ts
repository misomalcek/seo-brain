import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import { serveHtmlFile } from '../services/html-content';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateSEODashboard, generateContentDashboard, generateCEODashboard, generateKeywordOpportunitiesDashboard, generateSiteAuditDashboard, generateLinkProfileDashboard, generateVisibilityDashboard } from '../services/dashboard-generator';

const REPORTS_DIR = '/opt/team-brain/reports/mcp';
const DASHBOARDS_DIR = '/var/www/brain/reports/dashboards';

export const dashboardsRouter = Router();

// ============================
// Snapshot-based routes (NEW)
// ============================

const VALID_TYPES = ['seo', 'content', 'ceo', 'keywords', 'audit', 'links', 'visibility'];

// POST /dashboards/:type/generate - Generate a new snapshot
dashboardsRouter.post('/:type/generate', async (req: Request, res: Response) => {
  const dashType = req.params.type as string;
  if (!VALID_TYPES.includes(dashType)) {
    res.status(400).json({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` });
    return;
  }

  const userId = req.user!.userId;

  try {
    let result: { html: string; summary: any };

    if (dashType === 'seo') result = await generateSEODashboard();
    else if (dashType === 'content') result = await generateContentDashboard();
    else if (dashType === 'keywords') result = await generateKeywordOpportunitiesDashboard();
    else if (dashType === 'audit') result = await generateSiteAuditDashboard();
    else if (dashType === 'links') result = await generateLinkProfileDashboard();
    else if (dashType === 'visibility') result = await generateVisibilityDashboard();
    else result = await generateCEODashboard();

    // Save file
    const unique = crypto.randomBytes(8).toString('hex');
    const filename = `${dashType}-${unique}.html`;
    const filePath = path.join(DASHBOARDS_DIR, filename);
    fs.writeFileSync(filePath, result.html, 'utf8');

    // Mark all previous as not latest
    await query(
      'UPDATE dashboard_snapshots SET is_latest = FALSE WHERE dashboard_type = $1',
      [dashType]
    );

    // Insert new snapshot
    const typeLabels: Record<string, string> = { seo: 'SEO Dashboard', content: 'Content Dashboard', ceo: 'CEO Dashboard', keywords: 'Keyword Opportunities Hub', audit: 'Site Audit Health', links: 'Link Profile', visibility: 'Visibility & Performance' };
    const snap = await queryOne<{ id: string; created_at: string }>(
      `INSERT INTO dashboard_snapshots (dashboard_type, title, filename, file_path, data_summary, generated_by, is_latest)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, created_at`,
      [dashType, typeLabels[dashType], filename, filePath, JSON.stringify(result.summary), userId]
    );

    res.json({
      success: true,
      snapshot: {
        id: snap!.id,
        dashboardType: dashType,
        title: typeLabels[dashType],
        filename,
        dataSummary: result.summary,
        createdAt: snap!.created_at,
      },
    });
  } catch (err) {
    console.error(`Dashboard generation failed (${dashType}):`, err);
    res.status(500).json({ error: 'Dashboard generation failed' });
  }
});

// GET /dashboards/:type/latest - Latest snapshot metadata
dashboardsRouter.get('/:type/latest', async (req: Request, res: Response) => {
  const dashType = req.params.type as string;
  if (!VALID_TYPES.includes(dashType)) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }

  const snap = await queryOne(
    `SELECT ds.*, u.name as generated_by_name FROM dashboard_snapshots ds
     LEFT JOIN users u ON ds.generated_by = u.id
     WHERE ds.dashboard_type = $1 AND ds.is_latest = TRUE`,
    [dashType]
  );

  if (!snap) {
    res.json({ snapshot: null });
    return;
  }

  res.json({
    snapshot: formatSnapshot(snap),
  });
});

// GET /dashboards/:type/history - All snapshots for a type
dashboardsRouter.get('/:type/history', async (req: Request, res: Response) => {
  const dashType = req.params.type as string;
  if (!VALID_TYPES.includes(dashType)) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }

  const snaps = await query(
    `SELECT ds.*, u.name as generated_by_name FROM dashboard_snapshots ds
     LEFT JOIN users u ON ds.generated_by = u.id
     WHERE ds.dashboard_type = $1
     ORDER BY ds.created_at DESC
     LIMIT 50`,
    [dashType]
  );

  res.json({
    snapshots: snaps.map(formatSnapshot),
  });
});

// GET /dashboards/snapshots/:id - Serve HTML snapshot
dashboardsRouter.get('/snapshots/:id', async (req: Request, res: Response) => {
  const snap = await queryOne<{ file_path: string }>(
    'SELECT file_path FROM dashboard_snapshots WHERE id = $1',
    [req.params.id as string]
  );

  if (!snap) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }

  serveHtmlFile(snap.file_path, res);
});

// DELETE /dashboards/snapshots/:id
dashboardsRouter.delete('/snapshots/:id', async (req: Request, res: Response) => {
  const snap = await queryOne<{ file_path: string; is_latest: boolean; dashboard_type: string }>(
    'SELECT file_path, is_latest, dashboard_type FROM dashboard_snapshots WHERE id = $1',
    [req.params.id as string]
  );

  if (!snap) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }

  if (fs.existsSync(snap.file_path)) {
    fs.unlinkSync(snap.file_path);
  }
  await query('DELETE FROM dashboard_snapshots WHERE id = $1', [req.params.id as string]);

  // If we deleted the latest, promote the previous one
  if (snap.is_latest) {
    await query(
      `UPDATE dashboard_snapshots SET is_latest = TRUE
       WHERE id = (SELECT id FROM dashboard_snapshots WHERE dashboard_type = $1 ORDER BY created_at DESC LIMIT 1)`,
      [snap.dashboard_type]
    );
  }

  res.json({ success: true });
});

function formatSnapshot(row: any) {
  return {
    id: row.id,
    dashboardType: row.dashboard_type,
    title: row.title,
    filename: row.filename,
    dataSummary: row.data_summary,
    isLatest: row.is_latest,
    generatedBy: row.generated_by_name || null,
    createdAt: row.created_at,
  };
}

// ============================
// Legacy data routes (backward compat)
// ============================

// Simple in-memory cache (5 min TTL)
const cache: Record<string, { data: any; expires: number }> = {};

function getCached(key: string): any | null {
  const entry = cache[key];
  if (entry && Date.now() < entry.expires) return entry.data;
  return null;
}

function setCache(key: string, data: any, ttlMs = 300000) {
  cache[key] = { data, expires: Date.now() + ttlMs };
}

function readReportsByTool(toolPrefix: string, limit = 10): any[] {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith(toolPrefix) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
    return files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// Legacy data endpoints (keep both /seo and /seo/data for compat)
dashboardsRouter.get('/seo/data', async (_req: Request, res: Response) => {
  const cached = getCached('seo');
  if (cached) { res.json(cached); return; }

  const drReports = readReportsByTool('ahrefs_domain_rating', 30);
  const latestDR = drReports[0]?.data?.domain_rating;
  const drHistory = drReports.reverse().map((r: any) => ({
    date: r.timestamp?.slice(0, 10) || '',
    value: r.data?.domain_rating?.domain_rating || 0,
  })).filter((d: any) => d.date);

  const kwReports = readReportsByTool('ahrefs_organic_keywords', 5);
  const latestKW = kwReports[0]?.data;
  const keywords = latestKW?.keywords || latestKW?.organic || (Array.isArray(latestKW) ? latestKW : []);
  const blReports = readReportsByTool('ahrefs_backlinks', 3);
  const latestBL = blReports[0]?.data;
  const backlinks = latestBL?.backlinks || (Array.isArray(latestBL) ? latestBL : []);
  const compReports = readReportsByTool('ahrefs_competitors', 3);
  const latestComp = compReports[0]?.data;
  const competitors = latestComp?.competitors || (Array.isArray(latestComp) ? latestComp : []);
  const gscReports = readReportsByTool('gsc_search_analytics', 5);
  const latestGSC = gscReports[0]?.data;
  const topQueries = latestGSC?.rows || latestGSC?.queries || (Array.isArray(latestGSC) ? latestGSC : []);
  const qwReports = readReportsByTool('gsc_quick_wins', 3);
  const latestQW = qwReports[0]?.data;
  const quickWins = latestQW?.rows || latestQW?.queries || (Array.isArray(latestQW) ? latestQW : []);

  const result = {
    domainRating: { current: latestDR?.domain_rating || null, rank: latestDR?.ahrefs_rank || null, history: drHistory },
    keywords: { total: keywords.length, top10: keywords.slice(0, 10) },
    backlinks: { total: backlinks.length, sample: backlinks.slice(0, 5) },
    competitors: competitors.slice(0, 8),
    topQueries: topQueries.slice(0, 10),
    quickWins: quickWins.slice(0, 10),
    reportCount: drReports.length + kwReports.length + blReports.length + compReports.length + gscReports.length,
  };
  setCache('seo', result);
  res.json(result);
});

dashboardsRouter.get('/content/data', async (_req: Request, res: Response) => {
  const cached = getCached('content');
  if (cached) { res.json(cached); return; }

  const conversations = await query(
    `SELECT c.id, c.title, c.created_at, u.name as user_name FROM conversations c JOIN users u ON c.user_id = u.id
     WHERE c.title ILIKE '%content%' OR c.title ILIKE '%article%' OR c.title ILIKE '%brief%' OR c.title ILIKE '%seo%' OR c.title ILIKE '%keyword%'
     ORDER BY c.created_at DESC LIMIT 20`
  );
  const stats = await queryOne<{ conv_count: string; msg_count: string }>(
    `SELECT (SELECT COUNT(*) FROM conversations) as conv_count, (SELECT COUNT(*) FROM messages WHERE role = 'assistant') as msg_count`
  );
  const toolUsage = await query(`SELECT tool_type, COUNT(*) as count FROM user_reports GROUP BY tool_type ORDER BY count DESC`);

  const result = {
    recentConversations: conversations.map((c: any) => ({ id: c.id, title: c.title, createdAt: c.created_at, userName: c.user_name })),
    totalConversations: Number(stats?.conv_count || 0),
    totalResponses: Number(stats?.msg_count || 0),
    toolUsage: toolUsage.map((t: any) => ({ type: t.tool_type, count: Number(t.count) })),
  };
  setCache('content', result);
  res.json(result);
});

dashboardsRouter.get('/ceo/data', async (_req: Request, res: Response) => {
  const cached = getCached('ceo');
  if (cached) { res.json(cached); return; }

  const activity = await query(
    `SELECT DATE(created_at) as day, COUNT(*) as count FROM messages WHERE created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY day`
  );
  const users = await query(
    `SELECT u.id, u.name, u.role, u.last_login_at,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as conversations,
      (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = u.id) as messages
     FROM users u ORDER BY u.last_login_at DESC NULLS LAST`
  );
  const deliberations = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM persona_deliberations');
  const reports = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_reports');
  const files = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_files');
  const workspaceItems = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM workspace_items');
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const drReports = readReportsByTool('ahrefs_domain_rating', 1);
  const latestDR = drReports[0]?.data?.domain_rating;

  const result = {
    activity: activity.map((a: any) => ({ date: a.day, messages: Number(a.count) })),
    users: users.map((u: any) => ({ id: u.id, name: u.name, role: u.role, lastLogin: u.last_login_at, conversations: Number(u.conversations), messages: Number(u.messages) })),
    featureUsage: { deliberations: Number(deliberations?.count || 0), reports: Number(reports?.count || 0), files: Number(files?.count || 0), workspaceItems: Number(workspaceItems?.count || 0) },
    system: { uptime: Math.round(uptime), memoryMB: Math.round(mem.heapUsed / 1024 / 1024) },
    kpis: { domainRating: latestDR?.domain_rating || null, totalUsers: users.length, totalConversations: users.reduce((s: number, u: any) => s + Number(u.conversations), 0) },
  };
  setCache('ceo', result);
  res.json(result);
});
