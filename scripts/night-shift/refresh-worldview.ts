/**
 * Night Shift: Worldview Knowledge Refresh
 * Schedule: Daily 5:00 AM (ns-refresh-worldview)
 *
 * Regenerates 4 knowledge/*.md files from live DB data so Brain's baked-in
 * context stays current instead of frozen.
 *
 * Files written:
 *   knowledge/team-domains.md   — live domain metrics (ahrefs + gsc snapshots)
 *   knowledge/seo-strategy.md   — current SEO priorities (content_items + gsc quick-wins)
 *   knowledge/content-strategy.md — content pipeline state (content_items status counts + recent articles)
 *   knowledge/knowledge-map.md  — Brain's own data surface index (counts of core tables)
 */

import { db, postToBrainFeed, log, cleanup } from './runner';
import * as fs from 'fs';
import * as path from 'path';

const KNOWLEDGE_DIR = '/opt/team-brain/knowledge';

// Pad a date object to YYYY-MM-DD string
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TODAY = toDateStr(new Date());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a knowledge file; returns char count */
function writeKnowledge(filename: string, content: string): number {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
  const filePath = path.join(KNOWLEDGE_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return content.length;
}

/** Gracefully run a query — returns rows or [] on error */
async function safeQuery(sql: string, params: unknown[] = []): Promise<any[]> {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (err) {
    log('refresh-worldview', `Query skipped (${(err as Error).message.slice(0, 80)})`);
    return [];
  }
}

/** Truncate a string to maxLen chars, appending '…' if cut */
function trunc(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// File 1: team-domains.md
// ---------------------------------------------------------------------------
async function buildTeamDomains(): Promise<string> {
  // Latest ahrefs snapshot per domain
  const ahrefs = await safeQuery(`
    SELECT DISTINCT ON (domain)
      domain,
      domain_rating,
      organic_keywords,
      organic_traffic,
      snapshot_date
    FROM ahrefs_snapshots
    ORDER BY domain, snapshot_date DESC
  `);

  // Latest gsc snapshot per domain
  const gsc = await safeQuery(`
    SELECT DISTINCT ON (domain)
      domain,
      total_clicks,
      total_impressions,
      avg_position,
      snapshot_date
    FROM gsc_snapshots
    ORDER BY domain, snapshot_date DESC
  `);

  // All tracked sites
  const sites = await safeQuery(`
    SELECT domain, name, is_primary
    FROM sites
    WHERE is_tracked = TRUE
    ORDER BY is_primary DESC, domain
  `);

  const ahrefsMap = new Map(ahrefs.map((r: any) => [r.domain, r]));
  const gscMap = new Map(gsc.map((r: any) => [r.domain, r]));

  let bullets = '';
  for (const site of sites) {
    const a = ahrefsMap.get(site.domain);
    const g = gscMap.get(site.domain);
    const dr    = a ? `DR ${a.domain_rating}` : 'DR n/a';
    const kw    = a ? `${a.organic_keywords} kw` : '';
    const traf  = a ? `${a.organic_traffic} visits/mo` : '';
    const clicks = g ? `${g.total_clicks} clicks` : '';
    const impr   = g ? `${g.total_impressions} impressions` : '';
    const pos    = g ? `pos ${Number(g.avg_position).toFixed(1)}` : '';
    const snap   = a?.snapshot_date
      ? toDateStr(new Date(a.snapshot_date))
      : g?.snapshot_date
        ? toDateStr(new Date(g.snapshot_date))
        : 'n/a';
    const metrics = [dr, kw, traf, clicks, impr, pos].filter(Boolean).join(', ');
    bullets += `- **${site.domain}** (${site.name}${site.is_primary ? ', primary' : ''}): ${metrics} [${snap}]\n`;
  }

  if (!bullets) {
    bullets = '- Žiadne dáta — snapshots ešte neboli stiahnuté.\n';
  }

  return `---
title: Team Domains & Sites
category: company
updated: ${TODAY}
---

# Example Org — Domény

Sledované weby a ich aktuálne metriky (zdroj: ahrefs_snapshots + gsc_snapshots).

${bullets.trimEnd()}

## Poznámky
- Ahrefs: domain_rating, organic_keywords, organic_traffic (monthly estimate)
- GSC: total_clicks + total_impressions za 90-dňové okno, avg_position
- Hodnoty [dátum] = dátum snapshotu (nie dnešný deň)
`;
}

// ---------------------------------------------------------------------------
// File 2: seo-strategy.md
// ---------------------------------------------------------------------------
async function buildSeoStrategy(): Promise<string> {
  // In-progress and upcoming content items (= what the team is prioritising)
  const pipeline = await safeQuery(`
    SELECT ci.title, ci.content_type, ci.status, s.domain, ci.deadline
    FROM content_items ci
    LEFT JOIN sites s ON s.id = ci.site_id
    WHERE ci.status IN ('brief', 'draft', 'review')
    ORDER BY ci.deadline ASC NULLS LAST, ci.updated_at DESC
    LIMIT 10
  `);

  // Quick wins: high impressions, position 11–30 (low-hanging fruit)
  const quickWins = await safeQuery(`
    SELECT domain, top_queries
    FROM gsc_snapshots
    WHERE top_queries IS NOT NULL
    ORDER BY snapshot_date DESC
    LIMIT 3
  `);

  let priorityLines = '';
  if (pipeline.length > 0) {
    priorityLines = '## Aktuálne priority (obsah v pipeline)\n';
    for (const row of pipeline) {
      const dl = row.deadline ? ` (deadline: ${toDateStr(new Date(row.deadline))})` : '';
      const site = row.domain ? ` [${row.domain}]` : '';
      priorityLines += `- [${row.status}] ${trunc(row.title, 80)}${site}${dl}\n`;
    }
  } else {
    priorityLines = '## Aktuálne priority\n- Žiadne položky v pipeline.\n';
  }

  // Extract quick wins from top_queries JSONB
  const winsByDomain: string[] = [];
  for (const snap of quickWins) {
    let queries: any[] = [];
    try {
      queries = Array.isArray(snap.top_queries) ? snap.top_queries : JSON.parse(snap.top_queries);
    } catch { continue; }
    const wins = queries
      .filter((q: any) => q.position >= 11 && q.position <= 30 && q.impressions >= 50)
      .sort((a: any, b: any) => b.impressions - a.impressions)
      .slice(0, 3)
      .map((q: any) => `  - "${trunc(q.query, 60)}" pos ${Number(q.position).toFixed(0)}, ${q.impressions} impressions`);
    if (wins.length > 0) {
      winsByDomain.push(`**${snap.domain}:**\n${wins.join('\n')}`);
    }
  }

  const winsSection = winsByDomain.length > 0
    ? `\n## Quick wins (pozície 11–30, ≥50 impressions)\n${winsByDomain.join('\n')}\n`
    : '';

  return `---
title: SEO Stratégia
category: seo
updated: ${TODAY}
---

# SEO Stratégia — aktuálne priority

${priorityLines.trimEnd()}
${winsSection}
## Kontext
- 3 domény: example.com (primary), example-dev.com, example-qa.com
- Ahrefs Advanced plán (500K API units/mes)
- GSC snapshots: týždenné (streda 1:30 AM)
- Cieľ: organický traffic SK IT profesionáli
`;
}

// ---------------------------------------------------------------------------
// File 3: content-strategy.md
// ---------------------------------------------------------------------------
async function buildContentStrategy(): Promise<string> {
  // Status counts
  const statusCounts = await safeQuery(`
    SELECT status, COUNT(*) as cnt
    FROM content_items
    GROUP BY status
    ORDER BY cnt DESC
  `);

  // Recent published articles (last 30 days)
  const recentArticles = await safeQuery(`
    SELECT title, domain, published_at
    FROM articles
    WHERE published_at >= NOW() - INTERVAL '30 days'
    ORDER BY published_at DESC
    LIMIT 6
  `);

  // Total article count per domain
  const articleCounts = await safeQuery(`
    SELECT domain, COUNT(*) as cnt
    FROM articles
    GROUP BY domain
    ORDER BY cnt DESC
  `);

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = Number(row.cnt);
  }
  const statusOrder = ['idea', 'brief', 'draft', 'review', 'published', 'archived'];
  const pipelineLines = statusOrder
    .filter(s => statusMap[s] !== undefined)
    .map(s => `- **${s}:** ${statusMap[s]} položiek`)
    .join('\n');

  let recentLines = '';
  if (recentArticles.length > 0) {
    recentLines = '\n## Nedávno publikované (posledných 30 dní)\n';
    for (const a of recentArticles) {
      const pub = a.published_at ? toDateStr(new Date(a.published_at)) : '?';
      recentLines += `- ${trunc(a.title, 70)} [${a.domain}, ${pub}]\n`;
    }
  }

  let articleCountLines = '';
  if (articleCounts.length > 0) {
    articleCountLines = '\n## Celkový obsah (articles)\n';
    for (const r of articleCounts) {
      articleCountLines += `- ${r.domain}: ${r.cnt} článkov\n`;
    }
  }

  return `---
title: Content Stratégia
category: content
updated: ${TODAY}
---

# Content Pipeline — stav

## Obsah podľa statusu
${pipelineLines || '- Žiadne záznamy.'}
${recentLines.trimEnd()}
${articleCountLines.trimEnd()}

## Typy obsahu
article, landing-page, guide, case-study, infographic, video-script

## Pracovný postup
idea → brief → draft → review → published → (archived)
`;
}

// ---------------------------------------------------------------------------
// File 4: knowledge-map.md
// ---------------------------------------------------------------------------
async function buildKnowledgeMap(): Promise<string> {
  const articleCount   = (await safeQuery('SELECT COUNT(*) as cnt FROM articles'))[0]?.cnt ?? '?';
  const memoriesTotal  = (await safeQuery('SELECT COUNT(*) as cnt FROM brain_memories'))[0]?.cnt ?? '?';
  const memoriesActive = (await safeQuery('SELECT COUNT(*) as cnt FROM brain_memories WHERE is_active = TRUE'))[0]?.cnt ?? '?';
  const ccEmbCount     = (await safeQuery('SELECT COUNT(*) as cnt FROM cc_embeddings'))[0]?.cnt ?? '?';
  const brainEmbCount  = (await safeQuery('SELECT COUNT(*) as cnt FROM brain_embeddings'))[0]?.cnt ?? '?';
  const datasetCount   = (await safeQuery('SELECT COUNT(*) as cnt FROM datasets WHERE is_approved = TRUE'))[0]?.cnt ?? '?';
  const brandCount     = (await safeQuery('SELECT COUNT(*) as cnt FROM brand_assets'))[0]?.cnt ?? '?';
  const domainCount    = (await safeQuery('SELECT COUNT(*) as cnt FROM sites WHERE is_tracked = TRUE'))[0]?.cnt ?? '?';

  return `---
title: Knowledge Map
category: meta
updated: ${TODAY}
---

# Brain Knowledge Map — čo Brain vie a kde to leží

## Dáta (live counts k ${TODAY})
- **articles:** ${articleCount} (scraped content z 3 domén)
- **brain_memories:** ${memoriesActive} aktívnych / ${memoriesTotal} celkom
- **cc_embeddings:** ${ccEmbCount} chunks (skills, agents, docs, code)
- **brain_embeddings:** ${brainEmbCount} chunks (agents, knowledge, brand, templates)
- **datasets:** ${datasetCount} schválených datasetov
- **brand_assets:** ${brandCount} brand assets
- **sledované domény:** ${domainCount} (example.com, example-dev.com, example-qa.com)

## Ako sa dostať k dátam
- Sémantické hľadanie článkov → articles_search / context_search tool
- Tech docs (Anthropic, React, Node…) → docs_search tool
- Ahrefs metriky → ahrefs_* tools (MCP Bridge, cache TTL 12h–7d)
- GSC dáta → gsc_search_analytics (snapshot-first, 24h TTL)
- KG / admin datasety → admin-only routes

## Knowledge files (knowledge/*.md)
Tieto súbory sa regenerujú každý deň o 5:00 ráno (ns-refresh-worldview).
Zahrnuté: team-domains.md, seo-strategy.md, content-strategy.md, knowledge-map.md
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log('refresh-worldview', 'Spúšťam regeneráciu worldview knowledge files...');
  const results: Array<{ file: string; chars: number }> = [];
  const errors: string[] = [];

  try {
    // team-domains.md
    try {
      const content = await buildTeamDomains();
      const chars = writeKnowledge('team-domains.md', content);
      log('refresh-worldview', `team-domains.md — ${chars} znakov`);
      results.push({ file: 'team-domains.md', chars });
    } catch (err) {
      errors.push(`team-domains: ${(err as Error).message}`);
      log('refresh-worldview', `team-domains.md CHYBA: ${(err as Error).message}`);
    }

    // seo-strategy.md
    try {
      const content = await buildSeoStrategy();
      const chars = writeKnowledge('seo-strategy.md', content);
      log('refresh-worldview', `seo-strategy.md — ${chars} znakov`);
      results.push({ file: 'seo-strategy.md', chars });
    } catch (err) {
      errors.push(`seo-strategy: ${(err as Error).message}`);
      log('refresh-worldview', `seo-strategy.md CHYBA: ${(err as Error).message}`);
    }

    // content-strategy.md
    try {
      const content = await buildContentStrategy();
      const chars = writeKnowledge('content-strategy.md', content);
      log('refresh-worldview', `content-strategy.md — ${chars} znakov`);
      results.push({ file: 'content-strategy.md', chars });
    } catch (err) {
      errors.push(`content-strategy: ${(err as Error).message}`);
      log('refresh-worldview', `content-strategy.md CHYBA: ${(err as Error).message}`);
    }

    // knowledge-map.md
    try {
      const content = await buildKnowledgeMap();
      const chars = writeKnowledge('knowledge-map.md', content);
      log('refresh-worldview', `knowledge-map.md — ${chars} znakov`);
      results.push({ file: 'knowledge-map.md', chars });
    } catch (err) {
      errors.push(`knowledge-map: ${(err as Error).message}`);
      log('refresh-worldview', `knowledge-map.md CHYBA: ${(err as Error).message}`);
    }

    // BrainFeed summary
    const fileLines = results
      .map(r => `• ${r.file} (${r.chars} znakov)`)
      .join('\n');
    const errLines = errors.length > 0 ? `\n⚠️ Chyby:\n${errors.map(e => `• ${e}`).join('\n')}` : '';

    await postToBrainFeed(
      `🧠 Worldview refresh dokončený (${TODAY})\n\n${fileLines}${errLines}\n\nBrain's kontext je aktuálny.`
    );

    log('refresh-worldview', `Hotovo. ${results.length}/4 súborov obnovených.`);
  } catch (err) {
    log('refresh-worldview', `Fatálna chyba: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Worldview refresh zlyhalo: ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
