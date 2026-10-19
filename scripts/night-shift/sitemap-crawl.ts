/**
 * Night Shift: Sitemap Crawl
 * Schedule: Monthly 1st, 3:00 AM
 *
 * Crawls sitemaps for all 3 domains, collects URL metadata:
 * - title, meta description, response code
 * - indexability (robots meta), canonical, hreflang
 * - page size
 *
 * Rate limited: 1 request/second to avoid self-DoS.
 * Stores in sitemap_snapshots table.
 * Retains last 6 monthly snapshots.
 */

import { db, log, cleanup, postToBrainFeed } from './runner';

async function getDomains() {
  const rows = await db.query("SELECT domain, sitemap_url FROM sites WHERE is_tracked = true AND sitemap_url IS NOT NULL ORDER BY domain");
  return rows.map((r: any) => ({ domain: r.domain, sitemapUrl: r.sitemap_url }));
}

const DELAY_MS = 1000; // 1 second between requests
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchSitemap(url: string): Promise<string[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Sitemap fetch failed: ${response.status}`);
  const xml = await response.text();

  // Parse URLs from <loc> tags (handles both sitemap index and regular sitemaps)
  const urls: string[] = [];

  // Universal URL extractor — handles CDATA, sitemap index, and regular sitemaps
  const allLocs = [...xml.matchAll(/<loc>(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?<\/loc>/gs)].map(m => m[1].trim());
  const isSitemapIndex = xml.includes('<sitemapindex') || xml.includes('sitemap.xml');

  if (isSitemapIndex && allLocs.some(u => u.endsWith('.xml'))) {
    // Sitemap index — fetch each sub-sitemap
    const subSitemapUrls = allLocs.filter(u => u.endsWith('.xml'));
    log('sitemap-crawl', `  Found ${subSitemapUrls.length} sub-sitemaps`);
    for (const subUrl of subSitemapUrls) {
      try {
        const subResponse = await fetch(subUrl, { signal: AbortSignal.timeout(15000) });
        if (subResponse.ok) {
          const subXml = await subResponse.text();
          const subUrls = [...subXml.matchAll(/<loc>(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?<\/loc>/gs)]
            .map(m => m[1].trim())
            .filter(u => !u.endsWith('.xml')); // Only actual page URLs
          urls.push(...subUrls);
          log('sitemap-crawl', `  ${subUrl}: ${subUrls.length} URLs`);
        }
      } catch {
        log('sitemap-crawl', `  Sub-sitemap failed: ${subUrl}`);
      }
    }
  } else {
    // Regular sitemap — all locs are page URLs
    urls.push(...allLocs.filter(u => !u.endsWith('.xml')));
  }

  // Filter: only HTTP(S) URLs, no query params, no fragments
  return [...new Set(urls.filter(u => u.startsWith('http') && !u.includes('?') && !u.includes('#')))];
}

async function crawlUrl(url: string): Promise<{
  title: string | null;
  metaDescription: string | null;
  responseCode: number;
  isIndexable: boolean;
  canonicalUrl: string | null;
  hreflang: string | null;
  pageSizeBytes: number;
  contentLength: number;
}> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'TeamBrain-Sitemap-Crawler/1.0' },
    });

    const responseCode = response.status;

    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      return {
        title: null, metaDescription: null, responseCode,
        isIndexable: false, canonicalUrl: null, hreflang: null,
        pageSizeBytes: 0, contentLength: 0,
      };
    }

    const html = await response.text();
    const pageSizeBytes = Buffer.byteLength(html);

    // Extract meta
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().substring(0, 500) : null;

    const descMatch = html.match(/<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([\s\S]*?)["']/i)
      || html.match(/<meta\s+content\s*=\s*["']([\s\S]*?)["']\s+name\s*=\s*["']description["']/i);
    const metaDescription = descMatch ? descMatch[1].trim().substring(0, 1000) : null;

    // Robots meta
    const robotsMatch = html.match(/<meta\s+name\s*=\s*["']robots["']\s+content\s*=\s*["'](.*?)["']/i);
    const robotsContent = robotsMatch ? robotsMatch[1].toLowerCase() : '';
    const isIndexable = !robotsContent.includes('noindex');

    // Canonical
    const canonicalMatch = html.match(/<link\s+rel\s*=\s*["']canonical["']\s+href\s*=\s*["'](.*?)["']/i);
    const canonicalUrl = canonicalMatch ? canonicalMatch[1] : null;

    // Hreflang
    const hreflangMatch = html.match(/<link\s+rel\s*=\s*["']alternate["']\s+hreflang\s*=\s*["'](.*?)["']/i);
    const hreflang = hreflangMatch ? hreflangMatch[1] : null;

    // Content length (approximate text content)
    const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const contentLength = textContent.length;

    return { title, metaDescription, responseCode, isIndexable, canonicalUrl, hreflang, pageSizeBytes, contentLength };
  } catch (err) {
    return {
      title: null, metaDescription: null, responseCode: 0,
      isIndexable: false, canonicalUrl: null, hreflang: null,
      pageSizeBytes: 0, contentLength: 0,
    };
  }
}

async function crawlDomain(domain: string, sitemapUrl: string): Promise<{ total: number; indexable: number; errors: number }> {
  log('sitemap-crawl', `${domain}: fetching sitemap ${sitemapUrl}...`);
  const urls = await fetchSitemap(sitemapUrl);
  log('sitemap-crawl', `${domain}: ${urls.length} URLs found`);

  let indexable = 0;
  let errors = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const data = await crawlUrl(url);

    if (data.responseCode === 0) errors++;
    if (data.isIndexable) indexable++;

    await db.query(`
      INSERT INTO sitemap_snapshots (domain, snapshot_date, url, title, meta_description,
        response_code, is_indexable, canonical_url, hreflang, page_size_bytes, content_length)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (domain, snapshot_date, url)
      DO UPDATE SET title = EXCLUDED.title, meta_description = EXCLUDED.meta_description,
        response_code = EXCLUDED.response_code, is_indexable = EXCLUDED.is_indexable,
        canonical_url = EXCLUDED.canonical_url, page_size_bytes = EXCLUDED.page_size_bytes,
        content_length = EXCLUDED.content_length
    `, [domain, url, data.title, data.metaDescription, data.responseCode,
        data.isIndexable, data.canonicalUrl, data.hreflang, data.pageSizeBytes, data.contentLength]);

    if ((i + 1) % 20 === 0) {
      log('sitemap-crawl', `  ${domain}: ${i + 1}/${urls.length} crawled`);
    }

    await sleep(DELAY_MS);
  }

  // Cleanup old snapshots (keep last 6)
  await db.query(`
    DELETE FROM sitemap_snapshots
    WHERE domain = $1 AND snapshot_date < (
      SELECT DISTINCT snapshot_date FROM sitemap_snapshots
      WHERE domain = $1 ORDER BY snapshot_date DESC OFFSET 6 LIMIT 1
    )
  `, [domain]);

  return { total: urls.length, indexable, errors };
}

async function main() {
  log('sitemap-crawl', 'Starting monthly sitemap crawl...');
  const results: string[] = [];

  for (const { domain, sitemapUrl } of await getDomains()) {
    try {
      const { total, indexable, errors } = await crawlDomain(domain, sitemapUrl);
      results.push(`${domain}: ${total} URLs, ${indexable} indexable, ${errors} errors`);
    } catch (err) {
      log('sitemap-crawl', `${domain}: ERROR — ${(err as Error).message}`);
      results.push(`${domain}: ❌ ${(err as Error).message}`);
    }
  }

  await postToBrainFeed(`🗺️ Sitemap Crawl\n${results.join('\n')}`);
  log('sitemap-crawl', 'Done.');
  await cleanup();
}

main();
