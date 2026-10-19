/**
 * Brain Docs Scraper — stack reference layer for shared team KB
 *
 * Scrapes official docs for our tech stack → Markdown → embeds → hive_stack_docs
 * Model: MiniLM 384d (same as Brain API vector.ts)
 *
 * Usage:
 *   DATABASE_URL=... node --import tsx scripts/docs-scraper/docs-scraper.ts [stack]
 *   DATABASE_URL=... node --import tsx scripts/docs-scraper/docs-scraper.ts  # all stacks
 *
 * Cron: 1st of month at 3:00 AM UTC (set in crontab)
 */

import { Pool } from 'pg';
import TurndownService from 'turndown';
import { createHash } from 'crypto';
import { pipeline as createPipeline } from '@xenova/transformers';

// ─── Config ──────────────────────────────────────────────────────────────────

// No hardcoded credential fallback — DATABASE_URL must come from the environment
// (the cron line sources apps/brain-api/.env). Fail loudly if it's missing.
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set — source apps/brain-api/.env before running');
const RATE_MS = 1500;  // polite crawl delay
const MAX_CONTENT_CHARS = 8000;
const MAX_EMBED_CHARS = 512;  // MiniLM context window

// ─── Stack definitions ───────────────────────────────────────────────────────

interface DocPage {
  url: string;
  section: string;
  title?: string;
}

interface StackConfig {
  name: string;
  pages: DocPage[];
}

const STACKS: StackConfig[] = [
  {
    name: 'anthropic',
    // Raw markdown via platform.claude.com (avoids JS-rendered docs.anthropic.com)
    pages: [
      { url: 'https://platform.claude.com/docs/en/intro.md', section: 'overview', title: 'Intro to Claude' },
      { url: 'https://platform.claude.com/docs/en/about-claude/models/overview.md', section: 'models', title: 'Models overview' },
      { url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md', section: 'tool-use', title: 'Tool use overview' },
      { url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools.md', section: 'tool-use', title: 'Define tools' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md', section: 'prompt-caching', title: 'Prompt caching' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md', section: 'extended-thinking', title: 'Extended thinking' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/files.md', section: 'files-api', title: 'Files API' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/overview.md', section: 'api-reference', title: 'API features overview' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages.md', section: 'api-reference', title: 'Using the Messages API' },
      { url: 'https://platform.claude.com/docs/en/build-with-claude/streaming.md', section: 'api-reference', title: 'Streaming messages' },
    ],
  },
  {
    name: 'pgvector',
    pages: [
      { url: 'https://raw.githubusercontent.com/pgvector/pgvector/master/README.md', section: 'readme', title: 'pgvector README' },
    ],
  },
  {
    name: 'timescaledb',
    pages: [
      { url: 'https://docs.timescale.com/getting-started/latest/', section: 'getting-started' },
      { url: 'https://docs.timescale.com/use-timescale/latest/hypertables/', section: 'hypertables' },
      { url: 'https://docs.timescale.com/use-timescale/latest/continuous-aggregates/', section: 'caggs' },
      { url: 'https://docs.timescale.com/use-timescale/latest/compression/', section: 'compression' },
      { url: 'https://docs.timescale.com/api/latest/hyperfunctions/time_bucket/', section: 'api-reference' },
    ],
  },
  {
    name: 'express',
    pages: [
      { url: 'https://expressjs.com/en/4x/api.html', section: 'api-reference' },
      { url: 'https://expressjs.com/en/guide/routing.html', section: 'guide' },
      { url: 'https://expressjs.com/en/guide/using-middleware.html', section: 'guide' },
      { url: 'https://expressjs.com/en/guide/error-handling.html', section: 'guide' },
    ],
  },
  {
    name: 'nodejs',
    pages: [
      { url: 'https://nodejs.org/docs/latest/api/fs.html', section: 'api-reference' },
      { url: 'https://nodejs.org/docs/latest/api/path.html', section: 'api-reference' },
      { url: 'https://nodejs.org/docs/latest/api/crypto.html', section: 'api-reference' },
      { url: 'https://nodejs.org/docs/latest/api/events.html', section: 'api-reference' },
      { url: 'https://nodejs.org/docs/latest/api/http.html', section: 'api-reference' },
    ],
  },
  {
    name: 'apache-age',
    pages: [
      { url: 'https://age.apache.org/age-manual/master/intro/overview.html', section: 'overview' },
      { url: 'https://age.apache.org/age-manual/master/intro/setup.html', section: 'setup' },
      { url: 'https://age.apache.org/age-manual/master/clauses/match.html', section: 'cypher' },
      { url: 'https://age.apache.org/age-manual/master/clauses/create.html', section: 'cypher' },
    ],
  },
  {
    name: 'react',
    pages: [
      { url: 'https://react.dev/learn', section: 'getting-started' },
      { url: 'https://react.dev/reference/react/hooks', section: 'api-reference' },
      { url: 'https://react.dev/reference/react/useState', section: 'api-reference' },
      { url: 'https://react.dev/reference/react/useEffect', section: 'api-reference' },
      { url: 'https://react.dev/reference/react/useCallback', section: 'api-reference' },
    ],
  },
  {
    name: 'tailwind',
    pages: [
      { url: 'https://tailwindcss.com/docs/installation', section: 'getting-started' },
      { url: 'https://tailwindcss.com/docs/utility-first', section: 'core-concepts' },
      { url: 'https://tailwindcss.com/docs/responsive-design', section: 'core-concepts' },
      { url: 'https://tailwindcss.com/docs/customizing-colors', section: 'customization' },
      { url: 'https://tailwindcss.com/docs/adding-custom-styles', section: 'customization' },
    ],
  },
  {
    name: 'astro',
    pages: [
      { url: 'https://docs.astro.build/en/getting-started/', section: 'getting-started' },
      { url: 'https://docs.astro.build/en/basics/astro-components/', section: 'core-concepts' },
      { url: 'https://docs.astro.build/en/basics/astro-pages/', section: 'core-concepts' },
      { url: 'https://docs.astro.build/en/guides/routing/', section: 'core-concepts' },
      { url: 'https://docs.astro.build/en/guides/content-collections/', section: 'guides' },
      { url: 'https://docs.astro.build/en/guides/server-side-rendering/', section: 'guides' },
    ],
  },
  {
    name: 'postgresql',
    pages: [
      { url: 'https://www.postgresql.org/docs/current/sql-select.html', section: 'sql-reference' },
      { url: 'https://www.postgresql.org/docs/current/functions-window.html', section: 'sql-reference' },
      { url: 'https://www.postgresql.org/docs/current/indexes.html', section: 'indexes' },
      { url: 'https://www.postgresql.org/docs/current/plpgsql.html', section: 'plpgsql' },
    ],
  },
];

// ─── Infrastructure ───────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: DB_URL, max: 3 });

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe']);
turndown.addRule('removeImages', { filter: 'img', replacement: () => '' });

let embedPipeline: any = null;
async function embed(text: string): Promise<number[]> {
  if (!embedPipeline) {
    console.log('  [embed] Loading MiniLM model...');
    const { pipeline } = await import('@xenova/transformers');
    embedPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    console.log('  [embed] Model loaded');
  }
  const out = await embedPipeline(text.slice(0, MAX_EMBED_CHARS * 4), { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<{ html: string; title: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Brain-Docs-Scraper/1.0 (team knowledge base; contact: example.com)',
        'Accept': 'text/html,text/plain,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`  [fetch] ${res.status} ${url}`);
      return null;
    }
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/\s+\|.*$/, '') : url.split('/').pop() || url;
    return { html, title };
  } catch (e: any) {
    console.warn(`  [fetch] Error ${url}: ${e.message}`);
    return null;
  }
}

function htmlToMarkdown(html: string, url: string): string {
  // For raw .md URLs, skip conversion
  if (url.endsWith('.md') || url.includes('raw.githubusercontent.com') || url.includes('platform.claude.com')) {
    // Strip HTML entities only
    return html
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .slice(0, MAX_CONTENT_CHARS);
  }

  // Extract main content — try common doc site selectors in order
  let content = html;
  const mainPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*id="docContent"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ];
  for (const pat of mainPatterns) {
    const m = html.match(pat);
    if (m && m[1].length > 500) { content = m[1]; break; }
  }

  try {
    const md = turndown.turndown(content);
    return md.slice(0, MAX_CONTENT_CHARS);
  } catch {
    // Fallback: strip all tags
    return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
  }
}

async function upsertDoc(
  stack: string,
  url: string,
  title: string,
  contentMd: string,
  section: string,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const wordCount = contentMd.split(/\s+/).length;

  // Check if URL already exists (any content), and if content is unchanged
  const existRow = await pool.query(
    `SELECT id, md5(content_md) AS content_hash FROM hive_stack_docs
     WHERE stack=$1 AND url=$2 LIMIT 1`,
    [stack, url]
  );
  if (existRow.rows.length > 0) {
    // Compare md5 of existing vs new content
    const checkSame = await pool.query(
      `SELECT md5($1::text) = $2 AS same`,
      [contentMd, existRow.rows[0].content_hash]
    );
    if (checkSame.rows[0]?.same) return 'skipped';
  }
  const alreadyExists = existRow.rows.length > 0;

  const vec = await embed(contentMd.slice(0, MAX_EMBED_CHARS * 4));
  const vecStr = '[' + vec.join(',') + ']';

  await pool.query(
    `INSERT INTO hive_stack_docs (stack, url, title, content_md, section, word_count, text_vector, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW())
     ON CONFLICT (stack, url) DO UPDATE SET
       title = EXCLUDED.title,
       content_md = EXCLUDED.content_md,
       word_count = EXCLUDED.word_count,
       text_vector = EXCLUDED.text_vector,
       scraped_at = NOW()`,
    [stack, url, title, contentMd, section, wordCount, vecStr]
  );

  return alreadyExists ? 'updated' : 'inserted';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function scrapeStack(config: StackConfig): Promise<void> {
  console.log(`\n▶ ${config.name} (${config.pages.length} pages)`);
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const page of config.pages) {
    const result = await fetchPage(page.url);
    if (!result) { errors++; await sleep(RATE_MS); continue; }

    const md = htmlToMarkdown(result.html, page.url);
    if (md.length < 100) {
      console.log(`  skip (too short) ${page.url}`);
      errors++;
      await sleep(RATE_MS);
      continue;
    }

    const title = page.title || result.title;
    const status = await upsertDoc(config.name, page.url, title, md, page.section);
    const icon = status === 'inserted' ? '✚' : status === 'updated' ? '↺' : '·';
    console.log(`  ${icon} [${status}] ${title.slice(0, 60)}`);

    if (status === 'inserted') inserted++;
    else if (status === 'updated') updated++;
    else skipped++;

    await sleep(RATE_MS);
  }

  console.log(`  → ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

async function main() {
  const targetStack = process.argv[2];
  const configs = targetStack
    ? STACKS.filter(s => s.name === targetStack)
    : STACKS;

  if (configs.length === 0) {
    console.error(`Unknown stack: ${targetStack}`);
    console.error(`Available: ${STACKS.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Brain Docs Scraper — ${new Date().toISOString()}`);
  console.log(`Stacks: ${configs.map(s => s.name).join(', ')}`);

  for (const config of configs) {
    await scrapeStack(config);
  }

  const total = await pool.query('SELECT COUNT(*), stack FROM hive_stack_docs GROUP BY stack ORDER BY stack');
  console.log('\n─── hive_stack_docs summary ───');
  for (const row of total.rows) {
    console.log(`  ${row.stack}: ${row.count} pages`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
