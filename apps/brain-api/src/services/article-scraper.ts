/**
 * Article Scraper Service
 *
 * Fetches articles from msg websites via sitemaps.
 * Converts HTML to Markdown, embeds with pgvector.
 */

import { query } from '../db/connection';
import { embed } from './vector';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

turndown.remove(['script', 'style', 'nav', 'footer', 'aside', 'iframe', 'header', 'noscript']);
// Remove image-heavy markdown (SVGs, data URIs, WordPress theme assets)
turndown.addRule('removeImages', {
  filter: 'img',
  replacement: () => '',
});
turndown.addRule('removeSvg', {
  filter: 'svg',
  replacement: () => '',
});

import { getScrapeConfigs } from '../config/domain-config';

const RATE_LIMIT_MS = 2000;

interface ScrapeResult {
  domain: string;
  newArticles: number;
  updatedArticles: number;
  errors: number;
  details: string[];
}

function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  // Handle both plain <loc>url</loc> and <loc><![CDATA[url]]></loc>
  const locRegex = /<loc>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TeamBrain/1.0 (internal SEO tool)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Fetch page using Playwright for JS-rendered WordPress sites.
 * Falls back to simple fetch if Playwright unavailable.
 */
async function fetchPageRendered(url: string): Promise<string | null> {
  try {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const context = await browser.newContext({
      userAgent: 'TeamBrain/1.0 (internal SEO tool)',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    await browser.close();
    return html;
  } catch (err) {
    console.warn(`[scraper] Playwright failed for ${url}: ${(err as Error).message}, falling back to fetch`);
    return fetchPage(url);
  }
}

function extractContent(html: string): { title: string; content: string; publishedAt: string | null } {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const title = (h1Match?.[1] || titleMatch?.[1] || 'Untitled').replace(/<[^>]+>/g, '').trim();

  const dateMatch = html.match(/property="article:published_time"\s+content="([^"]+)"/i)
    || html.match(/name="date"\s+content="([^"]+)"/i)
    || html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  const publishedAt = dateMatch?.[1] || null;

  // WordPress content extraction — try multiple selectors in priority order
  // msg themes use class="content" and section.blog-post
  const contentSelectors = [
    // msg custom themes (discovered via Playwright inspection)
    /class="content"[^>]*>([\s\S]*?)(?:<\/div>\s*<(?:section|footer|div\s+class="(?:cookie|more-article|related)))/i,
    /<section[^>]*class="blog-post"[^>]*>([\s\S]*?)<\/section>/i,
    // Standard WordPress
    /class="entry-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<div\s+class="(?:post-|entry-|article-))|$)/i,
    /class="post-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<div\s+class="(?:post-|entry-|article-))|$)/i,
    /class="article-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<div\s+class=")|$)/i,
    /class="single-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<section)|$)/i,
    // Other WordPress patterns
    /class="content-area[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<footer)|$)/i,
    /id="content"[^>]*>([\s\S]*?)(?:<\/div>\s*(?:<\/div>|<footer)|$)/i,
    // Generic
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let rawHtml = '';
  for (const selector of contentSelectors) {
    const match = html.match(selector);
    if (match?.[1] && match[1].length > 500) {
      rawHtml = match[1];
      break;
    }
  }

  // Final fallback: strip header/footer/nav manually from body
  if (!rawHtml || rawHtml.length < 500) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      rawHtml = bodyMatch[1]
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/class="cookie[^"]*"[\s\S]*?<\/div>/gi, '')
        .replace(/id="cookie[^"]*"[\s\S]*?<\/div>/gi, '');
    }
  }

  if (!rawHtml) rawHtml = html;

  let content = turndown.turndown(rawHtml);

  // Post-process: remove markdown image references, data URIs, empty links
  content = content
    .replace(/!\[.*?\]\(data:.*?\)/g, '')  // data URI images
    .replace(/!\[.*?\]\(.*?\.svg\)/g, '')  // SVG images
    .replace(/\[[\s]*\]\([^)]*\)/g, '')    // empty link text
    .replace(/\n{3,}/g, '\n\n')            // collapse multiple newlines
    .trim();

  return { title, content, publishedAt };
}

// Domains that need Playwright (JS-rendered WordPress themes)
// example.com uses standard HTML, others use JS-heavy WP themes
const JS_RENDERED_DOMAINS = ['example-dev', 'example-qa']; // partial match

export async function scrapeUrl(url: string, domain: string): Promise<'new' | 'updated' | 'skipped' | 'error'> {
  try {
    const usePlaywright = JS_RENDERED_DOMAINS.some(d => domain.includes(d));
    const html = usePlaywright ? await fetchPageRendered(url) : await fetchPage(url);
    if (!html) return 'error';

    const { title, content, publishedAt } = extractContent(html);
    if (content.length < 200) return 'skipped';

    const wordCount = content.split(/\s+/).length;
    const embedding = await embed(title + '\n\n' + content);

    const existing = await query<any>('SELECT id FROM articles WHERE url = $1', [url]);

    if (existing.length > 0) {
      await query(
        `UPDATE articles SET title = $1, content_md = $2, embedding = $3, word_count = $4,
         published_at = $5, scraped_at = NOW(), metadata = $6 WHERE url = $7`,
        [title, content, JSON.stringify(embedding), wordCount, publishedAt, JSON.stringify({ source: 'sitemap' }), url]
      );
      return 'updated';
    } else {
      await query(
        `INSERT INTO articles (url, title, domain, content_md, embedding, word_count, published_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [url, title, domain, content, JSON.stringify(embedding), wordCount, publishedAt, JSON.stringify({ source: 'sitemap' })]
      );
      return 'new';
    }
  } catch (err) {
    console.error(`[scraper] Error scraping ${url}:`, (err as Error).message);
    return 'error';
  }
}

export async function scrapeDomain(domain: string): Promise<ScrapeResult> {
  const configs = await getScrapeConfigs();
  const config = configs.find(d => d.domain === domain);
  if (!config) {
    return { domain, newArticles: 0, updatedArticles: 0, errors: 1, details: [`Unknown domain: ${domain}`] };
  }

  const result: ScrapeResult = { domain, newArticles: 0, updatedArticles: 0, errors: 0, details: [] };

  console.log(`[scraper] Fetching sitemap: ${config.sitemapUrl}`);
  const sitemapHtml = await fetchPage(config.sitemapUrl);
  if (!sitemapHtml) {
    result.errors++;
    result.details.push('Failed to fetch sitemap');
    return result;
  }

  const isIndex = sitemapHtml.includes('<sitemapindex');
  let urls: string[];

  if (isIndex) {
    const subSitemaps = parseSitemapUrls(sitemapHtml);
    urls = [];
    for (const subUrl of subSitemaps) {
      const subXml = await fetchPage(subUrl);
      if (subXml) urls.push(...parseSitemapUrls(subXml));
      await sleep(500);
    }
  } else {
    urls = parseSitemapUrls(sitemapHtml);
  }

  const articleUrls = urls.filter(u => {
    const path = new URL(u).pathname;
    if (path === '/' || path === '') return false;
    if (/\/(category|tag|page|wp-content|wp-admin|feed)\//i.test(path)) return false;
    if (/\.(jpg|png|gif|svg|pdf|xml|json)$/i.test(path)) return false;
    // SK only — exclude /de/ and /en/ language variants
    if (/^\/(de|en)\//i.test(path)) return false;
    return true;
  });

  console.log(`[scraper] ${domain}: ${articleUrls.length} article URLs from sitemap`);
  result.details.push(`Found ${articleUrls.length} URLs in sitemap`);

  for (let i = 0; i < articleUrls.length; i++) {
    const status = await scrapeUrl(articleUrls[i], domain);
    if (status === 'new') result.newArticles++;
    else if (status === 'updated') result.updatedArticles++;
    else if (status === 'error') result.errors++;

    if ((i + 1) % 10 === 0) {
      console.log(`[scraper] ${domain}: ${i + 1}/${articleUrls.length} processed`);
    }
    if (i < articleUrls.length - 1) await sleep(RATE_LIMIT_MS);
  }

  result.details.push(`New: ${result.newArticles}, Updated: ${result.updatedArticles}, Errors: ${result.errors}`);
  return result;
}

export async function scrapeAllDomains(): Promise<ScrapeResult[]> {
  const configs = await getScrapeConfigs();
  const results: ScrapeResult[] = [];
  for (const config of configs) {
    results.push(await scrapeDomain(config.domain));
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
