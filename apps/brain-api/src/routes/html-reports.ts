import { brainPath, wwwPath } from '../paths';
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import { generateHTMLReport } from '../services/report-generator';
import { serveHtmlFile } from '../services/html-content';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = process.env.SEO_BRAIN_HTML_REPORTS || wwwPath('reports', 'html');

// Ensure directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export const htmlReportsRouter = Router();

// POST /html-reports/generate - Generate a new HTML report
htmlReportsRouter.post('/generate', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, templateType, siteId, dataSources, period } = req.body as {
    title: string;
    templateType: string;
    siteId?: string;
    dataSources?: Array<{ name: string; data: any }>;
    period?: string; // e.g. '7d', '30d', '90d'
  };

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const effectiveType = templateType || 'custom';

  try {
    // Get site domain if siteId provided
    let siteDomain: string | undefined;
    if (siteId) {
      const site = await queryOne<{ domain: string }>('SELECT domain FROM sites WHERE id = $1', [siteId]);
      siteDomain = site?.domain;
    }

    // Use provided data sources or empty array
    const resolvedSources: Array<{ name: string; data: any }> = (dataSources || []).map(ds => {
      if (ds.data === null && ds.name) {
        const reportPath = path.join(brainPath('reports', 'mcp'), ds.name);
        if (fs.existsSync(reportPath)) {
          try {
            return { name: ds.name, data: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
          } catch { /* ignore */ }
        }
      }
      return ds;
    });

    console.log(`Generating HTML report: ${title} (${effectiveType}) with ${resolvedSources.length} data sources`);
    const html = await generateHTMLReport({
      templateType: effectiveType,
      title,
      siteDomain,
      dataSources: resolvedSources,
    });

    // Save to disk
    const unique = crypto.randomBytes(8).toString('hex');
    const filename = `${unique}-${effectiveType}.html`;
    const filePath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(filePath, html, 'utf8');

    // Save to database
    const result = await queryOne<{ id: string }>(
      `INSERT INTO html_reports (user_id, site_id, title, template_type, filename, file_path, data_sources)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, siteId || null, title, effectiveType, filename, filePath, JSON.stringify(dataSources || [])]
    );

    res.json({
      success: true,
      report: {
        id: result!.id,
        title,
        templateType: effectiveType,
        filename,
        viewUrl: `/reports/html/${filename}`,
      },
    });
  } catch (err) {
    console.error('HTML report generation failed:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// POST /html-reports/save - Save raw HTML directly (no AI generation)
htmlReportsRouter.post('/save', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { title, html } = req.body as { title: string; html: string };

  if (!title || !html) {
    res.status(400).json({ error: 'title and html are required' });
    return;
  }

  if (html.length > 500_000) {
    res.status(400).json({ error: 'HTML content too large (max 500KB)' });
    return;
  }

  try {
    const unique = crypto.randomBytes(8).toString('hex');
    const filename = `saved-${unique}.html`;
    const filePath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(filePath, html, 'utf8');

    const result = await queryOne<{ id: string }>(
      `INSERT INTO html_reports (user_id, title, template_type, filename, file_path)
       VALUES ($1, $2, 'custom', $3, $4)
       RETURNING id`,
      [userId, title, filename, filePath]
    );

    res.json({
      success: true,
      report: { id: result!.id, title, filename, viewUrl: `/html-reports/${result!.id}/view` },
    });
  } catch (err) {
    console.error('HTML report save failed:', err);
    res.status(500).json({ error: 'Save failed' });
  }
});

// GET /html-reports/shared - List all publicly shared reports (MUST be before /:id routes in Express 5)
htmlReportsRouter.get('/shared', async (_req: Request, res: Response) => {
  const reports = await query(
    `SELECT r.id, r.title, r.template_type, r.filename, r.created_at,
            r.is_public, s.domain as site_domain, u.name as user_name
     FROM html_reports r
     LEFT JOIN sites s ON r.site_id = s.id
     JOIN users u ON r.user_id = u.id
     WHERE r.is_public = TRUE
     ORDER BY r.created_at DESC LIMIT 50`
  );

  res.json({
    reports: reports.map(r => ({
      id: r.id,
      title: r.title,
      templateType: r.template_type,
      filename: r.filename,
      siteDomain: r.site_domain,
      userName: r.user_name,
      viewUrl: `/reports/html/${r.filename}`,
      createdAt: r.created_at,
    })),
  });
});

// GET /html-reports - List user's reports
htmlReportsRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const reports = await query(
    `SELECT r.*, s.domain as site_domain FROM html_reports r
     LEFT JOIN sites s ON r.site_id = s.id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC LIMIT 50`,
    [userId]
  );

  res.json({
    reports: reports.map(r => ({
      id: r.id,
      title: r.title,
      templateType: r.template_type,
      filename: r.filename,
      siteDomain: r.site_domain,
      isPublic: r.is_public,
      shareToken: r.share_token,
      viewUrl: `/reports/html/${r.filename}`,
      createdAt: r.created_at,
    })),
  });
});

// GET /html-reports/:id/view - Serve HTML report
htmlReportsRouter.get('/:id/view', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const report = await queryOne<{ file_path: string; user_id: string }>(
    'SELECT file_path, user_id FROM html_reports WHERE id = $1',
    [req.params.id as string]
  );

  if (!report || report.user_id !== userId) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  serveHtmlFile(report.file_path, res);
});

// POST /html-reports/:id/share - Toggle public sharing
htmlReportsRouter.post('/:id/share', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const report = await queryOne<{ id: string; is_public: boolean; share_token: string | null }>(
    'SELECT id, is_public, share_token FROM html_reports WHERE id = $1 AND user_id = $2',
    [req.params.id as string, userId]
  );

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  const newPublic = !report.is_public;
  const token = newPublic && !report.share_token ? crypto.randomBytes(32).toString('hex') : report.share_token;

  await query(
    'UPDATE html_reports SET is_public = $1, share_token = $2 WHERE id = $3',
    [newPublic, token, report.id]
  );

  res.json({
    success: true,
    isPublic: newPublic,
    shareToken: newPublic ? token : null,
    shareUrl: newPublic ? `/api/html-reports/public/${token}` : null,
  });
});

// POST /html-reports/:id/refresh - Regenerate report with fresh data (24h cooldown)
htmlReportsRouter.post('/:id/refresh', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const report = await queryOne<{
    id: string; title: string; template_type: string; file_path: string;
    site_id: string | null; user_id: string; data_sources: any;
    created_at: Date; updated_at: Date | null; is_public: boolean;
  }>(
    'SELECT * FROM html_reports WHERE id = $1 AND user_id = $2',
    [req.params.id as string, userId]
  );

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  // Rate limit: 24h since last update (or creation)
  const lastUpdate = report.updated_at || report.created_at;
  const hoursSince = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
  if (hoursSince < 24) {
    const nextRefresh = new Date(new Date(lastUpdate).getTime() + 24 * 60 * 60 * 1000);
    res.status(429).json({
      error: 'Report bol obnovený nedávno',
      nextRefreshAt: nextRefresh.toISOString(),
      hoursRemaining: Math.ceil(24 - hoursSince),
    });
    return;
  }

  try {
    // Get site domain
    let siteDomain: string | undefined;
    if (report.site_id) {
      const site = await queryOne<{ domain: string }>('SELECT domain FROM sites WHERE id = $1', [report.site_id]);
      siteDomain = site?.domain;
    }

    // Use existing data sources or empty
    const dataSources = report.data_sources || [];

    console.log(`Refreshing HTML report: ${report.title} (${report.template_type})`);
    const html = await generateHTMLReport({
      templateType: report.template_type || 'custom',
      title: report.title,
      siteDomain,
      dataSources,
    });

    // Overwrite file
    fs.writeFileSync(report.file_path, html, 'utf8');

    // Update timestamp
    await query('UPDATE html_reports SET updated_at = NOW() WHERE id = $1', [report.id]);

    res.json({
      success: true,
      report: {
        id: report.id,
        title: report.title,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Report refresh failed:', err);
    res.status(500).json({ error: 'Obnovenie reportu zlyhalo' });
  }
});

// DELETE /html-reports/:id
htmlReportsRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const report = await queryOne<{ file_path: string }>(
    'SELECT file_path FROM html_reports WHERE id = $1 AND user_id = $2',
    [req.params.id as string, userId]
  );

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  if (fs.existsSync(report.file_path)) {
    fs.unlinkSync(report.file_path);
  }
  await query('DELETE FROM html_reports WHERE id = $1', [req.params.id as string]);
  res.json({ success: true });
});

// Public route — used outside auth middleware
export const publicReportRouter = Router();

const publicShareLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

publicReportRouter.get('/public/:token', publicShareLimiter, async (req: Request, res: Response) => {
  const report = await queryOne<{ file_path: string; is_public: boolean }>(
    'SELECT file_path, is_public FROM html_reports WHERE share_token = $1',
    [req.params.token as string]
  );

  if (!report || !report.is_public) {
    res.status(404).json({ error: 'Report not found or not public' });
    return;
  }

  serveHtmlFile(report.file_path, res, { cache: true });
});
