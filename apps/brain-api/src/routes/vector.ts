/**
 * Vector API Routes — articles, semantic search, Smart Connections, cannibalization
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { searchSemantic, searchHybrid, searchLexical, findSimilarArticles, detectCannibalization, suggestInternalLinks, getVectorStats } from '../services/vector';
import { scrapeDomain, scrapeUrl, scrapeAllDomains } from '../services/article-scraper';

export const vectorRouter = Router();

// GET /vector/articles — list articles with pagination and domain filter
vectorRouter.get('/articles', async (req: Request, res: Response) => {
  try {
    const domain = req.query.domain as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = (req.query.sort as string) || 'scraped_at';
    const validSorts = ['scraped_at', 'published_at', 'word_count', 'title'];
    const sortCol = validSorts.includes(sort) ? sort : 'scraped_at';

    const whereClause = domain ? 'WHERE domain = $3' : '';
    const params: any[] = [limit, offset];
    if (domain) params.push(domain);

    const articles = await query(
      `SELECT id, url, title, domain, word_count, published_at, scraped_at, metadata,
              (embedding IS NOT NULL) as has_embedding
       FROM articles ${whereClause}
       ORDER BY ${sortCol} DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      params
    );

    const totalResult = await query(
      `SELECT count(*) as total FROM articles ${whereClause}`,
      domain ? [domain] : []
    );

    res.json({ articles, total: parseInt((totalResult as any)[0]?.total || '0') });
  } catch (err) {
    console.error('[vector] List articles error:', err);
    res.status(500).json({ error: 'Failed to list articles' });
  }
});

// GET /vector/articles/:id — get full article
vectorRouter.get('/articles/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const rows = await query(
      'SELECT id, url, title, domain, content_md, word_count, published_at, scraped_at, metadata FROM articles WHERE id = $1',
      [id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Article not found' }); return; }
    res.json({ article: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get article' });
  }
});

// DELETE /vector/articles/:id — delete article
vectorRouter.delete('/articles/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await query('DELETE FROM articles WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// POST /vector/articles/:id/refresh — re-scrape and re-embed
vectorRouter.post('/articles/:id/refresh', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const rows = await query<any>('SELECT url, domain FROM articles WHERE id = $1', [id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Article not found' }); return; }

    const status = await scrapeUrl(rows[0].url, rows[0].domain);
    res.json({ status, url: rows[0].url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to refresh article' });
  }
});

// POST /vector/search — semantic/hybrid/lexical search
vectorRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, mode = 'hybrid', domain, limit = 10 } = req.body;
    if (!searchQuery) { res.status(400).json({ error: 'Query required' }); return; }

    let results;
    if (mode === 'semantic') {
      results = await searchSemantic(searchQuery, { domain, limit });
    } else if (mode === 'lexical') {
      results = await searchLexical(searchQuery, { domain, limit });
    } else {
      results = await searchHybrid(searchQuery, { domain, limit });
    }

    res.json({ results, query: searchQuery, mode });
  } catch (err) {
    console.error('[vector] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /vector/articles/:id/related — Smart Connections
vectorRouter.get('/articles/:id/related', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const related = await findSimilarArticles(id, limit);
    res.json({ related });
  } catch (err) {
    res.status(500).json({ error: 'Failed to find related articles' });
  }
});

// GET /vector/cannibalization — detect content cannibalization
vectorRouter.get('/cannibalization', async (req: Request, res: Response) => {
  try {
    const threshold = parseFloat(req.query.threshold as string) || 0.95;
    const domain = req.query.domain as string | undefined;
    const pairs = await detectCannibalization(threshold, domain);
    res.json({ pairs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to detect cannibalization' });
  }
});

// GET /vector/stats — overview stats
vectorRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getVectorStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /vector/articles/:id/internal-links — suggest internal linking opportunities
vectorRouter.get('/articles/:id/internal-links', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const crossDomain = req.query.crossDomain === 'true';
    const suggestions = await suggestInternalLinks(id, { limit, crossDomainOnly: crossDomain });
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest internal links' });
  }
});

// GET /vector/brain-items — list brain_embeddings for Znalosti tab
vectorRouter.get('/brain-items', async (_req: Request, res: Response) => {
  try {
    const items = await query(
      'SELECT id, source_type, source_id, title, metadata FROM brain_embeddings ORDER BY source_type, title'
    );
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[vector] Brain items error:', err);
    res.status(500).json({ error: 'Failed to fetch brain items' });
  }
});

// POST /vector/scrape — trigger scrape for one or all domains
vectorRouter.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { domain, url } = req.body;

    if (url) {
      // Single URL scrape (web_scrape tool equivalent)
      const d = domain || new URL(url).hostname.replace('www.', '');
      const status = await scrapeUrl(url, d);
      res.json({ status, url, domain: d });
      return;
    }

    if (domain) {
      const result = await scrapeDomain(domain);
      res.json(result);
    } else {
      const results = await scrapeAllDomains();
      res.json({ results });
    }
  } catch (err) {
    console.error('[vector] Scrape error:', err);
    res.status(500).json({ error: 'Scrape failed' });
  }
});
