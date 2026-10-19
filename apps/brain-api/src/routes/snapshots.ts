import { Router, Request, Response } from 'express';
import { getLatestAhrefsSnapshot, getAhrefsSnapshotHistory, generateAllAhrefsSnapshots, runDueSnapshots } from '../services/ahrefs-snapshot';
import { query, queryOne } from '../db/connection';
import fs from 'fs';
import path from 'path';

export const snapshotsRouter = Router();

function fmtDate(d: any): string {
  if (!d) return 'N/A';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split('T')[0];
}

// GET /snapshots/:type/:id/download - Download snapshot as CSV
snapshotsRouter.get('/:type/:id/download', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const format = (req.query.format as string) || 'csv';

    // Check for GSC v2 CSV files first
    if (type === 'gsc') {
      const row = await queryOne<any>('SELECT * FROM gsc_snapshots WHERE id = $1', [id as string]);
      if (!row) { res.status(404).json({ error: 'Not found' }); return; }
      const dateStr = fmtDate(row.snapshot_date);

      // Try exact date CSV, then find latest CSV for this domain
      const snapshotsDir = '/opt/team-brain/reports/snapshots';
      let csvPath = `${snapshotsDir}/gsc-${row.domain}-${dateStr}.csv`;

      if (!fs.existsSync(csvPath)) {
        // Find latest CSV for this domain (date mismatch between DB summary and v2 CSV)
        try {
          const files = fs.readdirSync(snapshotsDir)
            .filter((f: string) => f.startsWith(`gsc-${row.domain}-`) && f.endsWith('.csv'))
            .sort()
            .reverse();
          if (files.length > 0) {
            csvPath = `${snapshotsDir}/${files[0]}`;
          }
        } catch { /* dir might not exist */ }
      }

      if (fs.existsSync(csvPath)) {
        const csvFilename = path.basename(csvPath);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${csvFilename}"`);
        fs.createReadStream(csvPath).pipe(res);
        return;
      }
      // Fallback: JSON from DB
      const data = { ...row, top_queries: row.top_queries || [], top_pages: row.top_pages || [] };
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="gsc-${row.domain}-${dateStr}.json"`);
        res.send(JSON.stringify(data, null, 2));
      } else {
        // Build CSV from top_queries
        const queries = Array.isArray(data.top_queries) ? data.top_queries : [];
        const header = 'keyword,clicks,impressions,ctr,position,top_url';
        const rows = queries.map((q: any) => [
          `"${(q.query || q.keys?.[0] || '').replace(/"/g, '""')}"`,
          q.clicks || 0, q.impressions || 0,
          ((q.ctr || 0) * 100).toFixed(2) + '%',
          (q.position || 0).toFixed(1),
          `"${q.top_url || ''}"`,
        ].join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="gsc-${row.domain}-${dateStr}.csv"`);
        res.send([header, ...rows].join('\n'));
      }
      return;
    }

    // Generic table download
    const tableMap: Record<string, string> = {
      ahrefs: 'ahrefs_snapshots',
      'ahrefs-keywords': 'ahrefs_keyword_snapshots',
      'ahrefs-links': 'ahrefs_link_snapshots',
      'ahrefs-audit': 'ahrefs_audit_snapshots',
      'ahrefs-competitors': 'ahrefs_competitor_snapshots',
      crux: 'crux_snapshots',
      sitemap: 'sitemap_snapshots',
    };
    const table = tableMap[type as string];
    if (!table) { res.status(400).json({ error: 'Invalid type' }); return; }

    const row = await queryOne<any>(`SELECT * FROM ${table} WHERE id = $1`, [id as string]);
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }

    const dateStr = fmtDate(row.snapshot_date);
    const domain = row.domain || 'data';

    // Convert DB row to CSV based on type
    if (type === 'ahrefs' || type === 'ahrefs-keywords') {
      // Ahrefs: extract ALL keywords from JSONB (not just top N)
      let keywords: any[] = [];
      if (type === 'ahrefs-keywords' && row.keywords) {
        keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords;
      } else if (type === 'ahrefs') {
        // For DR snapshot, combine top_keywords + top_pages for full download
        const topKw = row.top_keywords ? (typeof row.top_keywords === 'string' ? JSON.parse(row.top_keywords) : row.top_keywords) : [];
        keywords = Array.isArray(topKw) ? topKw : [];
      }
      if (Array.isArray(keywords) && keywords.length > 0) {
        const header = 'keyword,volume,traffic,position,difficulty,cpc';
        const csvRows = keywords.map((k: any) => [
          `"${(k.keyword || '').replace(/"/g, '""')}"`,
          k.volume || 0, k.traffic || 0, (k.position || 0).toFixed?.(1) || k.position || 0,
          k.difficulty || k.keyword_difficulty || '', k.cpc || '',
        ].join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-${domain}-${dateStr}.csv"`);
        res.send([header, ...csvRows].join('\n'));
        return;
      }
    }

    if (type === 'ahrefs-links' && row.referring_domains) {
      const refDom = typeof row.referring_domains === 'string' ? JSON.parse(row.referring_domains) : row.referring_domains;
      if (Array.isArray(refDom) && refDom.length > 0) {
        const header = 'domain,domain_rating,backlinks,dofollow';
        const csvRows = refDom.map((r: any) => [
          `"${(r.domain || '').replace(/"/g, '""')}"`,
          r.domain_rating || 0, r.links_to_target || r.backlinks || 0, r.dofollow_links || '',
        ].join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="ahrefs-links-${domain}-${dateStr}.csv"`);
        res.send([header, ...csvRows].join('\n'));
        return;
      }
    }

    if (type === 'crux') {
      const header = 'domain,date,form_factor,lcp_p75_ms,cls_p75,inp_p75_ms,ttfb_p75_ms';
      const csvRow = [domain, dateStr, row.form_factor || 'ALL',
        row.lcp_p75 || '', row.cls_p75 || '', row.inp_p75 || '', row.ttfb_p75 || ''].join(',');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="crux-${domain}-${dateStr}.csv"`);
      res.send([header, csvRow].join('\n'));
      return;
    }

    if (type === 'sitemap') {
      // Sitemap: fetch all URLs for this domain+date
      const urls = await query(
        'SELECT url, title, meta_description, response_code, is_indexable, canonical_url, page_size_bytes, content_length FROM sitemap_snapshots WHERE domain = $1 AND snapshot_date = $2 ORDER BY url',
        [domain, row.snapshot_date]
      );
      const header = 'url,title,meta_description,response_code,is_indexable,canonical_url,page_size_kb,content_chars';
      const csvRows = urls.map((u: any) => [
        `"${(u.url || '').replace(/"/g, '""')}"`,
        `"${(u.title || '').replace(/"/g, '""')}"`,
        `"${(u.meta_description || '').replace(/"/g, '""').substring(0, 200)}"`,
        u.response_code || 0, u.is_indexable ? 'yes' : 'no',
        `"${u.canonical_url || ''}"`,
        ((u.page_size_bytes || 0) / 1024).toFixed(1),
        u.content_length || 0,
      ].join(','));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sitemap-${domain}-${dateStr}.csv"`);
      res.send([header, ...csvRows].join('\n'));
      return;
    }

    // Fallback: JSON for types without CSV conversion
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${domain}-${dateStr}.json"`);
    res.send(JSON.stringify(row, null, 2));
  } catch (err) {
    console.error('[snapshots] Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// GET /snapshots/all - List all individual snapshots (GSC + Ahrefs + Keywords + Links + Audit + Competitors + CrUX + Sitemap)
snapshotsRouter.get('/all', async (_req: Request, res: Response) => {
  try {
    const [gscRows, ahrefsRows, kwRows, linkRows, auditRows, compRows, cruxRows, sitemapRows, userSeoRows] = await Promise.all([
      query(
        `SELECT id, domain, snapshot_date, total_clicks, total_impressions, total_queries, pulled_at
         FROM gsc_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, domain_rating, organic_keywords, organic_traffic, pulled_at
         FROM ahrefs_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, tier, keyword_count, pulled_at
         FROM ahrefs_keyword_snapshots WHERE tier = 'T2a' ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, pulled_at
         FROM ahrefs_link_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, health_score, total_issues, critical_issues, warning_issues, pulled_at
         FROM ahrefs_audit_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, pulled_at
         FROM ahrefs_competitor_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT id, domain, snapshot_date, lcp_p75, cls_p75, inp_p75, form_factor, created_at
         FROM crux_snapshots ORDER BY snapshot_date DESC`
      ),
      query(
        `SELECT snapshot_date, domain, COUNT(*) as url_count,
         COUNT(*) FILTER (WHERE is_indexable = true) as indexable_count,
         COUNT(*) FILTER (WHERE response_code != 200) as error_count,
         MIN(id) as id
         FROM sitemap_snapshots GROUP BY domain, snapshot_date ORDER BY snapshot_date DESC`
      ),
      // User-created SEO/Ahrefs datasets from user_files
      query(
        `SELECT id, original_name, mime_type, size_bytes, created_at
         FROM user_files
         WHERE original_name ~* '(ahrefs|keyword|backlink|seo|link-profil|organic|serp|competitor|audit)'
         ORDER BY created_at DESC LIMIT 200`
      ),
    ]);

    const snapshots = [
      ...gscRows.map((r: any) => ({
        id: r.id, type: 'gsc' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: { clicks: Number(r.total_clicks || 0), impressions: Number(r.total_impressions || 0), queries: Number(r.total_queries || 0) },
        createdAt: r.pulled_at,
      })),
      ...ahrefsRows.map((r: any) => ({
        id: r.id, type: 'ahrefs' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: { dr: Number(r.domain_rating || 0), keywords: Number(r.organic_keywords || 0), traffic: Number(r.organic_traffic || 0) },
        createdAt: r.pulled_at,
      })),
      ...kwRows.map((r: any) => ({
        id: r.id, type: 'ahrefs-keywords' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: { keywords: Number(r.keyword_count || 0) },
        createdAt: r.pulled_at,
      })),
      ...linkRows.map((r: any) => ({
        id: r.id, type: 'ahrefs-links' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: {},
        createdAt: r.pulled_at,
      })),
      ...auditRows.map((r: any) => ({
        id: r.id, type: 'ahrefs-audit' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: { healthScore: Number(r.health_score || 0), critical: Number(r.critical_issues || 0), warnings: Number(r.warning_issues || 0) },
        createdAt: r.pulled_at,
      })),
      ...compRows.map((r: any) => ({
        id: r.id, type: 'ahrefs-competitors' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: {},
        createdAt: r.pulled_at,
      })),
      ...cruxRows.map((r: any) => ({
        id: r.id, type: 'crux' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: {
          lcp: r.lcp_p75 ? Number(r.lcp_p75) : null,
          cls: r.cls_p75 ? Number(r.cls_p75) : null,
          inp: r.inp_p75 ? Number(r.inp_p75) : null,
          formFactor: r.form_factor,
        },
        createdAt: r.created_at,
      })),
      ...sitemapRows.map((r: any) => ({
        id: r.id, type: 'sitemap' as const, domain: r.domain, snapshotDate: r.snapshot_date,
        metrics: {
          urls: Number(r.url_count || 0),
          indexable: Number(r.indexable_count || 0),
          errors: Number(r.error_count || 0),
        },
        createdAt: r.snapshot_date,
      })),
      ...userSeoRows.map((r: any) => {
        // Extract domain from filename if possible
        const domainMatch = (r.original_name || '').match(/(example-org[\w.-]*|example-dev[\w.-]*|example-qa[\w.-]*)/i);
        return {
          id: r.id, type: 'user-dataset' as const,
          domain: domainMatch ? domainMatch[1].replace(/-/g, '.').replace(/\.sk\./, '.sk') : 'user',
          snapshotDate: r.created_at,
          metrics: { filename: r.original_name, size: Number(r.size_bytes || 0) },
          createdAt: r.created_at,
        };
      }),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ snapshots, total: snapshots.length });
  } catch (err) {
    console.error('[snapshots] All error:', err);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// GET /snapshots/gsc/:id - GSC snapshot detail
snapshotsRouter.get('/gsc/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne('SELECT * FROM gsc_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    res.json({ snapshot: row });
  } catch (err) {
    console.error('[snapshots] GSC detail error:', err);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// GET /snapshots/gsc/:id/content - GSC snapshot content for context injection
snapshotsRouter.get('/gsc/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM gsc_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }

    // Try to read full JSON file
    const domainSlug = row.domain.replace(/\./g, '-');
    const dateStr = fmtDate(row.snapshot_date);
    const jsonFile = path.join('/opt/team-brain/reports/mcp', `gsc_snapshot_${domainSlug}_${dateStr}.json`);
    let content = '';
    if (fs.existsSync(jsonFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        const rows = (data.rows || []).slice(0, 30);
        content = `GSC Snapshot: ${row.domain} (${dateStr})\n`;
        content += `Clicks: ${row.total_clicks}, Impressions: ${row.total_impressions}, Queries: ${row.total_queries}\n\n`;
        content += `Top 30 Queries:\n`;
        for (const r of rows) {
          content += `  ${r.keys?.[0] || r.query || '?'} — clicks: ${r.clicks}, impr: ${r.impressions}, pos: ${(r.position || 0).toFixed(1)}\n`;
        }
      } catch { /* fallback to summary */ }
    }
    if (!content) {
      content = `GSC Snapshot: ${row.domain} (${dateStr})\n`;
      content += `Clicks: ${row.total_clicks}, Impressions: ${row.total_impressions}, Queries: ${row.total_queries}\n`;
      if (row.top_queries) content += `\nTop Queries: ${JSON.stringify(row.top_queries).slice(0, 2000)}`;
      if (row.top_pages) content += `\nTop Pages: ${JSON.stringify(row.top_pages).slice(0, 2000)}`;
    }
    res.json({ content, label: `GSC ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] GSC content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/ahrefs/:id - Ahrefs snapshot detail
snapshotsRouter.get('/ahrefs/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne('SELECT * FROM ahrefs_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    res.json({ snapshot: row });
  } catch (err) {
    console.error('[snapshots] Ahrefs detail error:', err);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// GET /snapshots/ahrefs/:id/content - Ahrefs snapshot content for context injection
snapshotsRouter.get('/ahrefs/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM ahrefs_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const dateStr = fmtDate(row.snapshot_date);
    let content = `Ahrefs Snapshot: ${row.domain} (${dateStr})\n`;
    content += `DR: ${row.domain_rating || 'N/A'}, Keywords: ${row.organic_keywords || 'N/A'}, Traffic: ${row.organic_traffic || 'N/A'}\n`;
    content += `Referring Domains: ${row.referring_domains || 'N/A'}, Backlinks: ${row.backlinks || 'N/A'}\n`;
    if (row.top_keywords) content += `\nTop Keywords: ${JSON.stringify(row.top_keywords).slice(0, 2000)}`;
    if (row.top_pages) content += `\nTop Pages: ${JSON.stringify(row.top_pages).slice(0, 2000)}`;
    res.json({ content, label: `Ahrefs ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] Ahrefs content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/ahrefs-keywords/:id/content - Keyword snapshot content for context
snapshotsRouter.get('/ahrefs-keywords/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM ahrefs_keyword_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const dateStr = fmtDate(row.snapshot_date);
    const keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords || []);
    const sorted = (Array.isArray(keywords) ? keywords : []).sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));
    let content = `Ahrefs Keywords: ${row.domain} (${dateStr})\n`;
    const kwCount = sorted.length;
    content += `Total keywords: ${kwCount}\n\n`;
    content += `Keywords (by search volume):\n`;
    for (const kw of sorted.slice(0, 100)) {
      content += `  ${kw.keyword || '?'} — vol: ${kw.volume || 0}\n`;
    }
    res.json({ content, label: `Ahrefs Keywords ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] Keywords content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/ahrefs-links/:id/content - Link snapshot content for context
snapshotsRouter.get('/ahrefs-links/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM ahrefs_link_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const dateStr = fmtDate(row.snapshot_date);
    const refDom = Array.isArray(row.referring_domains) ? row.referring_domains :
      (typeof row.referring_domains === 'string' ? JSON.parse(row.referring_domains) : []);
    const broken = Array.isArray(row.broken_backlinks) ? row.broken_backlinks :
      (typeof row.broken_backlinks === 'string' ? JSON.parse(row.broken_backlinks) : []);

    // Sort by DR descending for top domains
    const byDR = [...refDom].sort((a: any, b: any) => (b.domain_rating || 0) - (a.domain_rating || 0));
    // Sort by DR ascending + links descending for spammy detection
    const bySpammy = [...refDom].sort((a: any, b: any) => {
      const drDiff = (a.domain_rating || 0) - (b.domain_rating || 0);
      if (drDiff !== 0) return drDiff;
      return (b.links_to_target || b.dofollow_links || b.dofollow_linked_domains || 0) - (a.links_to_target || a.dofollow_links || a.dofollow_linked_domains || 0);
    });
    // Sort broken by DR descending
    const brokenSorted = [...broken].sort((a: any, b: any) => (b.domain_rating || 0) - (a.domain_rating || 0));

    let content = `Ahrefs Links: ${row.domain} (${dateStr})\n`;
    content += `Total referring domains: ${refDom.length}, Broken backlinks: ${broken.length}\n\n`;

    content += `=== TOP 100 REFERRING DOMAINS (by DR) ===\n`;
    for (const rd of byDR.slice(0, 100)) {
      const links = rd.links_to_target || rd.dofollow_links || rd.backlinks || rd.dofollow_linked_domains || 0;
      content += `  ${rd.domain || '?'} — DR: ${rd.domain_rating || 0}, links: ${links}\n`;
    }

    content += `\n=== LOW 20 SPAMMY DOMAINS (lowest DR, most links) ===\n`;
    for (const rd of bySpammy.slice(0, 20)) {
      const links = rd.links_to_target || rd.dofollow_links || rd.backlinks || rd.dofollow_linked_domains || 0;
      content += `  ${rd.domain || '?'} — DR: ${rd.domain_rating || 0}, links: ${links}\n`;
    }

    if (brokenSorted.length > 0) {
      content += `\n=== BROKEN BACKLINKS (by DR) ===\n`;
      for (const bl of brokenSorted.slice(0, 50)) {
        content += `  ${bl.url_from || bl.referring_page || '?'} → ${bl.url_to || bl.target_url || '?'} — DR: ${bl.domain_rating || 0}\n`;
      }
    } else {
      content += `\n=== BROKEN BACKLINKS ===\nŽiadne broken backlinks nájdené.\n`;
    }

    res.json({ content, label: `Ahrefs Links ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] Links content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/ahrefs-audit/:id/content - Audit snapshot content for context
snapshotsRouter.get('/ahrefs-audit/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM ahrefs_audit_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const dateStr = fmtDate(row.snapshot_date);
    const issues = typeof row.issues === 'string' ? JSON.parse(row.issues) : (row.issues || []);
    const issueArr = Array.isArray(issues) ? issues : [];

    // Sort: Errors first, then Warnings, then Notices
    const severityOrder: Record<string, number> = { error: 0, critical: 0, warning: 1, notice: 2, info: 3 };
    const sorted = [...issueArr].sort((a: any, b: any) => {
      const aS = severityOrder[(a.importance || '').toLowerCase()] ?? 3;
      const bS = severityOrder[(b.importance || '').toLowerCase()] ?? 3;
      return aS - bS;
    });

    let content = `Ahrefs Site Audit: ${row.domain} (${dateStr})\n`;
    content += `Health Score: ${row.health_score ?? 'N/A'}, Total: ${row.total_issues || 0}, Critical: ${row.critical_issues || 0}, Warnings: ${row.warning_issues || 0}\n\n`;

    if (sorted.length === 0) {
      content += `Žiadne issues nájdené — web je v poriadku.\n`;
    } else {
      content += `Issues (${sorted.length}):\n`;
      for (const iss of sorted) {
        const affected = (iss.new || 0) + (iss.added || 0) + (iss.crawled || 0) + (iss.missing || 0);
        const affectedStr = affected > 0 ? `, affected: ${affected}` : '';
        content += `  [${iss.importance || '?'}] ${iss.name || '?'} (${iss.category || 'N/A'}${affectedStr})\n`;
      }
    }
    res.json({ content, label: `Ahrefs Audit ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] Audit content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/ahrefs-competitors/:id/content - Competitor snapshot content for context
snapshotsRouter.get('/ahrefs-competitors/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM ahrefs_competitor_snapshots WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const dateStr = fmtDate(row.snapshot_date);
    const competitors = typeof row.competitors === 'string' ? JSON.parse(row.competitors) : (row.competitors || []);
    const compArr = Array.isArray(competitors) ? competitors : [];
    // Sort by common keywords descending
    const sorted = [...compArr].sort((a: any, b: any) => (b.keywords_common || 0) - (a.keywords_common || 0));

    let content = `Ahrefs Competitors: ${row.domain} (${dateStr})\n`;
    content += `Total competitors found: ${sorted.length}\n\n`;

    if (sorted.length === 0) {
      content += `Žiadni organickí konkurenti nájdení pre túto doménu.\n`;
    } else {
      content += `Competitors (sorted by common keywords):\n`;
      for (const comp of sorted) {
        content += `  ${comp.competitor_domain || comp.domain || '?'} — DR: ${comp.domain_rating || 'N/A'}, common KW: ${comp.keywords_common || 0}, traffic: ${comp.traffic || 0}\n`;
      }
    }
    res.json({ content, label: `Ahrefs Competitors ${row.domain} ${dateStr}` });
  } catch (err) {
    console.error('[snapshots] Competitors content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// GET /snapshots/user-dataset/:id/content - User-created SEO dataset content
snapshotsRouter.get('/user-dataset/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const row = await queryOne<any>('SELECT * FROM user_files WHERE id = $1', [id]);
    if (!row) { res.status(404).json({ error: 'File not found' }); return; }
    const storagePath = row.storage_path;
    if (!storagePath || !fs.existsSync(storagePath)) {
      res.status(404).json({ error: 'File not found on disk' }); return;
    }
    // For text-based files, return content directly
    const ext = path.extname(row.original_name || '').toLowerCase();
    if (['.csv', '.md', '.txt', '.json', '.html'].includes(ext)) {
      const content = fs.readFileSync(storagePath, 'utf8').slice(0, 50000);
      res.json({ content, label: row.original_name });
    } else {
      // For binary files (xlsx, docx), return metadata
      res.json({
        content: `Súbor: ${row.original_name}\nTyp: ${row.mime_type}\nVeľkosť: ${(row.size_bytes / 1024).toFixed(1)} KB\n\nBinárny súbor — stiahni cez Files pre zobrazenie.`,
        label: row.original_name,
      });
    }
  } catch (err) {
    console.error('[snapshots] User dataset content error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// DELETE /snapshots/:type/:id - Admin delete snapshot
snapshotsRouter.delete('/:type/:id', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const tableMap: Record<string, string> = {
      gsc: 'gsc_snapshots', ahrefs: 'ahrefs_snapshots',
      'ahrefs-keywords': 'ahrefs_keyword_snapshots', 'ahrefs-links': 'ahrefs_link_snapshots',
      'ahrefs-audit': 'ahrefs_audit_snapshots', 'ahrefs-competitors': 'ahrefs_competitor_snapshots',
      crux: 'crux_snapshots', sitemap: 'sitemap_snapshots',
    };
    const table = tableMap[type as string];
    if (!table) { res.status(400).json({ error: 'Invalid type' }); return; }
    await query(`DELETE FROM ${table} WHERE id = $1`, [id as string]);
    res.json({ success: true });
  } catch (err) {
    console.error('[snapshots] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete snapshot' });
  }
});

// GET /snapshots/summary - Snapshot counts per domain per type (MUST be before /:domain routes)
snapshotsRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [gscRows, ahrefsRows, kwRows, linkRows, auditRows, compRows] = await Promise.all([
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest, MAX(total_clicks) as max_clicks FROM gsc_snapshots GROUP BY domain ORDER BY domain`),
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest, MAX(domain_rating) as max_dr FROM ahrefs_snapshots GROUP BY domain ORDER BY domain`),
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest, MAX(keyword_count) as max_keywords FROM ahrefs_keyword_snapshots WHERE tier = 'T2a' GROUP BY domain ORDER BY domain`),
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest FROM ahrefs_link_snapshots GROUP BY domain ORDER BY domain`),
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest, MAX(health_score) as max_health FROM ahrefs_audit_snapshots GROUP BY domain ORDER BY domain`),
      query(`SELECT domain, COUNT(*) as count, MAX(snapshot_date) as latest FROM ahrefs_competitor_snapshots GROUP BY domain ORDER BY domain`),
    ]);
    const sum = (rows: any[]) => rows.reduce((s: number, r: any) => s + parseInt(r.count), 0);
    res.json({
      gsc: gscRows,
      ahrefs: ahrefsRows,
      'ahrefs-keywords': kwRows,
      'ahrefs-links': linkRows,
      'ahrefs-audit': auditRows,
      'ahrefs-competitors': compRows,
      totals: {
        gsc: sum(gscRows), ahrefs: sum(ahrefsRows),
        'ahrefs-keywords': sum(kwRows), 'ahrefs-links': sum(linkRows),
        'ahrefs-audit': sum(auditRows), 'ahrefs-competitors': sum(compRows),
      },
    });
  } catch (err) {
    console.error('[snapshots] Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /snapshots/:domain/keywords - Latest keyword snapshot
snapshotsRouter.get('/:domain/keywords', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const row = await queryOne(
      'SELECT * FROM ahrefs_keyword_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    res.json({ data: row || null });
  } catch (err) {
    console.error('[snapshots] Keywords fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch keyword snapshot' });
  }
});

// GET /snapshots/:domain/links - Latest link snapshot
snapshotsRouter.get('/:domain/links', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const row = await queryOne(
      'SELECT * FROM ahrefs_link_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    res.json({ data: row || null });
  } catch (err) {
    console.error('[snapshots] Links fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch link snapshot' });
  }
});

// GET /snapshots/:domain/audit - Latest audit snapshot
snapshotsRouter.get('/:domain/audit', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const row = await queryOne(
      'SELECT * FROM ahrefs_audit_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    res.json({ data: row || null });
  } catch (err) {
    console.error('[snapshots] Audit fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch audit snapshot' });
  }
});

// GET /snapshots/:domain/competitors - Latest competitor snapshot
snapshotsRouter.get('/:domain/competitors', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const row = await queryOne(
      'SELECT * FROM ahrefs_competitor_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    res.json({ data: row || null });
  } catch (err) {
    console.error('[snapshots] Competitors fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch competitor snapshot' });
  }
});

// GET /snapshots/:domain/ahrefs - Latest Ahrefs snapshot
snapshotsRouter.get('/:domain/ahrefs', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const snapshot = await getLatestAhrefsSnapshot(domain);
    if (!snapshot) {
      res.json({ data: null, message: 'No snapshot found for this domain' });
      return;
    }
    res.json({ data: snapshot });
  } catch (err) {
    console.error('[snapshots] Ahrefs fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// GET /snapshots/:domain/ahrefs/history?days=30 - Ahrefs trend data
snapshotsRouter.get('/:domain/ahrefs/history', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const history = await getAhrefsSnapshotHistory(domain, days);
    res.json({ data: history, count: history.length });
  } catch (err) {
    console.error('[snapshots] Ahrefs history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /snapshots/:domain/gsc - Latest GSC snapshot summary
snapshotsRouter.get('/:domain/gsc', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const rows = await query(
      'SELECT * FROM gsc_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    console.error('[snapshots] GSC fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// GET /snapshots/:domain/gsc/history?days=30 - GSC trend data
snapshotsRouter.get('/:domain/gsc/history', async (req: Request, res: Response) => {
  try {
    const domain = req.params.domain as string;
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const history = await query(
      'SELECT snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position, total_queries FROM gsc_snapshots WHERE domain = $1 AND snapshot_date >= CURRENT_DATE - $2 ORDER BY snapshot_date DESC',
      [domain, days]
    );
    res.json({ data: history, count: history.length });
  } catch (err) {
    console.error('[snapshots] GSC history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /snapshots/ahrefs/refresh-tiered - Run tiered Ahrefs snapshots (monthly cron or manual)
snapshotsRouter.post('/ahrefs/refresh-tiered', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const result = await runDueSnapshots(force);
    res.json(result);
  } catch (err) {
    console.error('[snapshots] Tiered refresh error:', err);
    res.status(500).json({ error: 'Failed to run tiered snapshots' });
  }
});

// POST /snapshots/ahrefs/refresh - Manually trigger legacy Ahrefs snapshot (admin only)
snapshotsRouter.post('/ahrefs/refresh', async (req: Request, res: Response) => {
  try {
    const result = await generateAllAhrefsSnapshots();
    res.json(result);
  } catch (err) {
    console.error('[snapshots] Ahrefs refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh snapshots' });
  }
});
