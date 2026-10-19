/**
 * Ahrefs Snapshot Service v3 — Tiered Monthly Strategy
 *
 * All tiers run monthly on the 1st. On-demand refresh via dashboard "Obnoviť".
 * Data stored in 5 tables: ahrefs_snapshots (legacy T1), ahrefs_keyword_snapshots (T2),
 * ahrefs_link_snapshots (T3), ahrefs_audit_snapshots (T5), ahrefs_competitor_snapshots (T4).
 *
 * Tracked domains: example.com, example-dev.com, example-qa.com
 * Schedule: Cron at 3:30 AM on 1st of month (all tiers)
 * Budget: ~44K units/month (9% of 500K limit)
 */

import { query, queryOne } from '../db/connection';
import { executeMCPTool } from './mcp-bridge';
import { getDomainNames, getAhrefsProjectMap } from '../config/domain-config';

interface TierResult {
  tier: string;
  domain: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  details?: string;
}

interface SnapshotRunResult {
  success: boolean;
  tiersRun: string[];
  results: TierResult[];
  totalDomains: number;
  timestamp: string;
}

// ============================
// MCP Tool Caller
// ============================

async function callAhrefs(toolName: string, params: Record<string, any>): Promise<any> {
  const result = await executeMCPTool({
    tool: toolName,
    params,
  });
  if (!result.success) {
    throw new Error(result.error || `Ahrefs tool ${toolName} failed`);
  }
  return result.data;
}

// Safely extract array from API response (handles nested objects, stringified JSON, etc.)
function safeArray(data: any, ...keys: string[]): any[] {
  if (!data) return [];
  for (const k of keys) {
    if (data[k] && Array.isArray(data[k])) return data[k];
  }
  if (Array.isArray(data)) return data;
  return [];
}

// ============================
// T1: Legacy batch analysis (keeps ahrefs_snapshots table fresh)
// ============================

async function snapshotDomain(domain: string): Promise<TierResult> {
  try {
    console.log(`[Ahrefs Snapshot] T1 pulling ${domain}...`);

    // DR + rank from domain-rating endpoint
    const drData = await callAhrefs('ahrefs_domain_rating', { target: domain });

    // Organic metrics (keywords, traffic, cost) — fixes N/A issue
    let siteMetrics: any = {};
    try {
      const metricsData = await callAhrefs('site-explorer-metrics', { target: domain });
      siteMetrics = metricsData?.metrics || metricsData || {};
    } catch (err) {
      console.warn(`[Ahrefs Snapshot] T1 site-explorer-metrics failed for ${domain}:`, err);
    }

    // Backlinks + referring domains
    let backlinkStats: any = {};
    try {
      const blData = await callAhrefs('site-explorer-backlinks-stats', { target: domain });
      backlinkStats = blData?.metrics || blData || {};
    } catch (err) {
      console.warn(`[Ahrefs Snapshot] T1 backlinks-stats failed for ${domain}:`, err);
    }

    let topPages: any[] = [];
    try {
      const pagesData = await callAhrefs('ahrefs_top_pages', { target: domain, limit: 50 });
      topPages = pagesData?.pages || pagesData?.top_pages || [];
      if (Array.isArray(topPages)) {
        topPages = topPages.slice(0, 50).map((p: any) => ({
          url: p.url, traffic: p.traffic || p.organic_traffic, keywords: p.keywords || p.top_keyword,
        }));
      }
    } catch (err) {
      console.warn(`[Ahrefs Snapshot] T1 top pages failed for ${domain}:`, err);
    }

    const drMetrics = drData?.domain_rating || drData?.metrics || drData || {};
    const domainRating = drMetrics.domain_rating ?? drMetrics.dr ?? null;
    const ahrefsRank = drMetrics.ahrefs_rank ?? null;
    // Use site-explorer-metrics for organic data (was N/A from domain-rating endpoint)
    const organicKeywords = siteMetrics.org_keywords ?? null;
    const organicTraffic = siteMetrics.org_traffic ?? null;
    const organicValue = siteMetrics.org_cost_usd ? Math.round(siteMetrics.org_cost_usd * 100) : null; // store in cents
    // Use backlinks-stats for link data (was N/A from domain-rating endpoint)
    const referringDomains = backlinkStats.live_refdomains ?? null;
    const backlinks = backlinkStats.live ?? null;

    await query(
      `INSERT INTO ahrefs_snapshots
        (domain, snapshot_date, domain_rating, ahrefs_rank, organic_keywords, organic_traffic,
         organic_value, referring_domains, backlinks, top_keywords, top_pages, raw_data)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (domain, snapshot_date)
       DO UPDATE SET
         domain_rating = EXCLUDED.domain_rating, ahrefs_rank = EXCLUDED.ahrefs_rank,
         organic_keywords = EXCLUDED.organic_keywords, organic_traffic = EXCLUDED.organic_traffic,
         organic_value = EXCLUDED.organic_value, referring_domains = EXCLUDED.referring_domains,
         backlinks = EXCLUDED.backlinks, top_keywords = EXCLUDED.top_keywords,
         top_pages = EXCLUDED.top_pages, raw_data = EXCLUDED.raw_data, pulled_at = NOW()`,
      [domain, domainRating, ahrefsRank, organicKeywords, organicTraffic,
       organicValue, referringDomains, backlinks,
       JSON.stringify([]), JSON.stringify(topPages), JSON.stringify({ dr: drMetrics, metrics: siteMetrics, backlinks: backlinkStats })]
    );

    console.log(`[Ahrefs Snapshot] T1 OK: ${domain} DR=${domainRating} KW=${organicKeywords}`);
    return { tier: 'T1', domain, status: 'success', details: `DR=${domainRating}` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T1 FAILED: ${domain}`, err);
    return { tier: 'T1', domain, status: 'error', error: String(err) };
  }
}

// ============================
// T2a: Organic keywords (limit=500, volume only)
// ============================

async function snapshotKeywords(domain: string): Promise<TierResult> {
  try {
    console.log(`[Ahrefs Snapshot] T2a pulling keywords for ${domain} (limit=500, volume only)...`);

    const kwData = await callAhrefs('ahrefs_organic_keywords', {
      target: domain, country: 'sk', limit: 500,
    });

    let keywords = kwData?.keywords || kwData?.organic_keywords || [];
    if (Array.isArray(keywords)) {
      keywords = keywords
        .map((k: any) => ({ keyword: k.keyword, volume: Number(k.volume || 0) }))
        .sort((a: any, b: any) => b.volume - a.volume)
        .slice(0, 500);
    }

    await query(
      `INSERT INTO ahrefs_keyword_snapshots (domain, snapshot_date, tier, keywords, keyword_count)
       VALUES ($1, CURRENT_DATE, 'T2a', $2, $3)
       ON CONFLICT (domain, snapshot_date, tier)
       DO UPDATE SET keywords = EXCLUDED.keywords, keyword_count = EXCLUDED.keyword_count, pulled_at = NOW()`,
      [domain, JSON.stringify(keywords), keywords.length]
    );

    console.log(`[Ahrefs Snapshot] T2a OK: ${domain} — ${keywords.length} keywords`);
    return { tier: 'T2a', domain, status: 'success', details: `${keywords.length} keywords` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T2a FAILED: ${domain}`, err);
    return { tier: 'T2a', domain, status: 'error', error: String(err) };
  }
}

// ============================
// T2b: KD enrichment (only for keywords with volume >= 100)
// ============================

async function snapshotKeywordKD(domain: string): Promise<TierResult> {
  try {
    console.log(`[Ahrefs Snapshot] T2b KD enrichment for ${domain}...`);

    // Get latest T2a keywords
    const latest = await queryOne<any>(
      `SELECT keywords FROM ahrefs_keyword_snapshots WHERE domain = $1 AND tier = 'T2a' ORDER BY snapshot_date DESC LIMIT 1`,
      [domain]
    );

    if (!latest?.keywords) {
      return { tier: 'T2b', domain, status: 'skipped', details: 'No T2a data yet' };
    }

    const allKeywords = Array.isArray(latest.keywords) ? latest.keywords : JSON.parse(latest.keywords);
    const highVolume = allKeywords.filter((k: any) => (k.volume || 0) >= 100);

    if (highVolume.length === 0) {
      return { tier: 'T2b', domain, status: 'skipped', details: 'No keywords with volume >= 100' };
    }

    // Batch KD lookup (comma-separated keywords, max 10 at a time)
    const kdResults: any[] = [];
    const batches = [];
    for (let i = 0; i < highVolume.length; i += 10) {
      batches.push(highVolume.slice(i, i + 10));
    }

    for (const batch of batches) {
      try {
        const kwString = batch.map((k: any) => k.keyword).join(',');
        const data = await callAhrefs('ahrefs_keyword_overview', {
          keywords: kwString, country: 'sk',
        });
        // Parse results — may be array or single object
        const results = Array.isArray(data) ? data : (data?.keywords || [data]);
        for (const r of results) {
          if (r?.keyword) {
            kdResults.push({
              keyword: r.keyword,
              difficulty: r.difficulty ?? r.keyword_difficulty,
              cpc: r.cpc,
              volume: r.volume,
            });
          }
        }
        await new Promise(r => setTimeout(r, 1000)); // Rate limit between batches
      } catch (batchErr) {
        console.warn(`[Ahrefs Snapshot] T2b batch error:`, batchErr);
      }
    }

    await query(
      `INSERT INTO ahrefs_keyword_snapshots (domain, snapshot_date, tier, kd_enrichment, keyword_count)
       VALUES ($1, CURRENT_DATE, 'T2b', $2, $3)
       ON CONFLICT (domain, snapshot_date, tier)
       DO UPDATE SET kd_enrichment = EXCLUDED.kd_enrichment, keyword_count = EXCLUDED.keyword_count, pulled_at = NOW()`,
      [domain, JSON.stringify(kdResults), kdResults.length]
    );

    console.log(`[Ahrefs Snapshot] T2b OK: ${domain} — ${kdResults.length} KD entries (from ${highVolume.length} high-volume)`);
    return { tier: 'T2b', domain, status: 'success', details: `${kdResults.length} KD entries` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T2b FAILED: ${domain}`, err);
    return { tier: 'T2b', domain, status: 'error', error: String(err) };
  }
}

// ============================
// T3: Link snapshots (top_pages, referring_domains, broken_backlinks, anchors, pages_by_backlinks, internal_links)
// ============================

async function snapshotLinks(domain: string): Promise<TierResult> {
  try {
    console.log(`[Ahrefs Snapshot] T3 pulling link data for ${domain}...`);

    const results: Record<string, any> = {};

    // T3a: top_pages + referring_domains (200 for comprehensive link profile)
    try {
      const pages = await callAhrefs('ahrefs_top_pages', { target: domain, country: 'sk', limit: 50 });
      results.top_pages = safeArray(pages, 'pages', 'top_pages').slice(0, 50);
    } catch (e) { console.warn(`[T3] top_pages failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    try {
      const refs = await callAhrefs('ahrefs_referring_domains', { target: domain, limit: 200 });
      results.referring_domains = safeArray(refs, 'domains', 'referring_domains', 'refdomains').slice(0, 200);
    } catch (e) { console.warn(`[T3] referring_domains failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    // T3b: broken_backlinks (200 limit for comprehensive broken link detection)
    try {
      const broken = await callAhrefs('ahrefs_broken_backlinks', { target: domain, limit: 200 });
      results.broken_backlinks = safeArray(broken, 'backlinks', 'broken_backlinks').slice(0, 200);
    } catch (e) { console.warn(`[T3] broken_backlinks failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    // T3c: anchors
    try {
      const anchors = await callAhrefs('ahrefs_anchors', { target: domain, limit: 100 });
      results.anchors = safeArray(anchors, 'anchors').slice(0, 100);
    } catch (e) { console.warn(`[T3] anchors failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    // T3d: pages_by_backlinks
    try {
      const pbb = await callAhrefs('ahrefs_pages_by_backlinks', { target: domain, limit: 100 });
      results.pages_by_backlinks = safeArray(pbb, 'pages', 'pages_by_backlinks').slice(0, 100);
    } catch (e) { console.warn(`[T3] pages_by_backlinks failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    // T3e: pages_by_internal_links
    try {
      const pil = await callAhrefs('ahrefs_pages_by_internal_links', { target: domain, limit: 100 });
      results.internal_links = safeArray(pil, 'pages', 'pages_by_internal_links').slice(0, 100);
    } catch (e) { console.warn(`[T3] pages_by_internal_links failed: ${e}`); }

    await query(
      `INSERT INTO ahrefs_link_snapshots (domain, snapshot_date, top_pages, referring_domains, broken_backlinks, anchors, pages_by_backlinks, internal_links)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (domain, snapshot_date)
       DO UPDATE SET top_pages = EXCLUDED.top_pages, referring_domains = EXCLUDED.referring_domains,
         broken_backlinks = EXCLUDED.broken_backlinks, anchors = EXCLUDED.anchors,
         pages_by_backlinks = EXCLUDED.pages_by_backlinks, internal_links = EXCLUDED.internal_links, pulled_at = NOW()`,
      [domain, JSON.stringify(results.top_pages || []), JSON.stringify(results.referring_domains || []),
       JSON.stringify(results.broken_backlinks || []), JSON.stringify(results.anchors || []),
       JSON.stringify(results.pages_by_backlinks || []), JSON.stringify(results.internal_links || [])]
    );

    const fieldCount = Object.values(results).filter(v => Array.isArray(v) && v.length > 0).length;
    console.log(`[Ahrefs Snapshot] T3 OK: ${domain} — ${fieldCount}/6 link datasets`);
    return { tier: 'T3', domain, status: 'success', details: `${fieldCount}/6 datasets` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T3 FAILED: ${domain}`, err);
    return { tier: 'T3', domain, status: 'error', error: String(err) };
  }
}

// ============================
// T4: Competitors + keyword ideas
// ============================

async function snapshotCompetitors(domain: string): Promise<TierResult> {
  try {
    console.log(`[Ahrefs Snapshot] T4 pulling competitors for ${domain}...`);

    let competitors: any[] = [];
    try {
      const compData = await callAhrefs('ahrefs_competitors', { target: domain, country: 'sk', limit: 20 });
      competitors = safeArray(compData, 'competitors', 'organic_competitors').slice(0, 20);
    } catch (e) { console.warn(`[T4] competitors failed: ${e}`); }

    await new Promise(r => setTimeout(r, 2000));

    // Keyword ideas with rotating seed from top keyword
    let keywordIdeas: any[] = [];
    let clusterSeed = domain.replace(/\.[a-z]+$/, ''); // default seed = domain name
    try {
      // Use first keyword from latest T2a snapshot as seed
      const latest = await queryOne<any>(
        `SELECT keywords FROM ahrefs_keyword_snapshots WHERE domain = $1 AND tier = 'T2a' ORDER BY snapshot_date DESC LIMIT 1`,
        [domain]
      );
      if (latest?.keywords) {
        const kws = Array.isArray(latest.keywords) ? latest.keywords : JSON.parse(latest.keywords);
        if (kws.length > 0) {
          // Pick a random high-volume keyword as seed
          const sorted = kws.filter((k: any) => k.volume > 30).sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));
          const seedIdx = new Date().getMonth() % Math.max(sorted.length, 1); // rotate monthly
          clusterSeed = sorted[seedIdx]?.keyword || clusterSeed;
        }
      }

      const ideas = await callAhrefs('ahrefs_keyword_ideas', { keyword: clusterSeed, country: 'sk', limit: 30 });
      keywordIdeas = safeArray(ideas, 'keywords', 'keyword_ideas').slice(0, 30);
    } catch (e) { console.warn(`[T4] keyword_ideas failed: ${e}`); }

    await query(
      `INSERT INTO ahrefs_competitor_snapshots (domain, snapshot_date, competitors, keyword_ideas, keyword_cluster)
       VALUES ($1, CURRENT_DATE, $2, $3, $4)
       ON CONFLICT (domain, snapshot_date)
       DO UPDATE SET competitors = EXCLUDED.competitors, keyword_ideas = EXCLUDED.keyword_ideas,
         keyword_cluster = EXCLUDED.keyword_cluster, pulled_at = NOW()`,
      [domain, JSON.stringify(competitors), JSON.stringify(keywordIdeas), clusterSeed]
    );

    console.log(`[Ahrefs Snapshot] T4 OK: ${domain} — ${competitors.length} competitors, ${keywordIdeas.length} ideas (seed: "${clusterSeed}")`);
    return { tier: 'T4', domain, status: 'success', details: `${competitors.length} comp, ${keywordIdeas.length} ideas` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T4 FAILED: ${domain}`, err);
    return { tier: 'T4', domain, status: 'error', error: String(err) };
  }
}

// ============================
// T5: Site Audit issues
// ============================

async function snapshotAudit(domain: string): Promise<TierResult> {
  try {
    const projectId = ((await getAhrefsProjectMap())[domain]);
    if (!projectId) {
      return { tier: 'T5', domain, status: 'skipped', details: 'No Site Audit project ID' };
    }

    console.log(`[Ahrefs Snapshot] T5 pulling site audit for ${domain} (project ${projectId})...`);

    const data = await callAhrefs('ahrefs_site_audit_issues', {
      project_id: projectId, limit: 200,
    });

    const issues = data?.issues || data || [];
    const issueList = Array.isArray(issues) ? issues : [];

    // Count by severity
    let critical = 0, warnings = 0, total = issueList.length;
    for (const issue of issueList) {
      const severity = (issue.importance || issue.severity || '').toLowerCase();
      if (severity === 'error' || severity === 'critical') critical++;
      else if (severity === 'warning') warnings++;
    }

    // Simple health score: 100 - (critical * 5 + warnings * 1), min 0
    const healthScore = Math.max(0, 100 - (critical * 5 + warnings * 1));

    await query(
      `INSERT INTO ahrefs_audit_snapshots (domain, snapshot_date, project_id, issues, health_score, total_issues, critical_issues, warning_issues)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (domain, snapshot_date)
       DO UPDATE SET project_id = EXCLUDED.project_id, issues = EXCLUDED.issues, health_score = EXCLUDED.health_score,
         total_issues = EXCLUDED.total_issues, critical_issues = EXCLUDED.critical_issues,
         warning_issues = EXCLUDED.warning_issues, pulled_at = NOW()`,
      [domain, projectId, JSON.stringify(issueList), healthScore, total, critical, warnings]
    );

    console.log(`[Ahrefs Snapshot] T5 OK: ${domain} — health=${healthScore}, issues=${total} (${critical} critical, ${warnings} warnings)`);
    return { tier: 'T5', domain, status: 'success', details: `health=${healthScore}, ${total} issues` };
  } catch (err) {
    console.error(`[Ahrefs Snapshot] T5 FAILED: ${domain}`, err);
    return { tier: 'T5', domain, status: 'error', error: String(err) };
  }
}

// ============================
// Orchestrator: Run all due tiers
// ============================

export async function runDueSnapshots(force: boolean = false): Promise<SnapshotRunResult> {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // All tiers run on the 1st of month, or when forced
  if (dayOfMonth !== 1 && !force) {
    console.log(`[Ahrefs Snapshot] Not the 1st (day=${dayOfMonth}), skipping. Use force=true to override.`);
    return {
      success: true,
      tiersRun: [],
      results: [],
      totalDomains: (await getDomainNames()).length,
      timestamp: today.toISOString(),
    };
  }

  console.log(`[Ahrefs Snapshot] Running ALL tiers for ${(await getDomainNames()).length} domains (force=${force})...`);
  const results: TierResult[] = [];
  const tiersRun: string[] = [];

  for (const domain of await getDomainNames()) {
    // T1: Legacy batch
    results.push(await snapshotDomain(domain));
    await new Promise(r => setTimeout(r, 3000));

    // T2a: Keywords (volume only, limit=500)
    results.push(await snapshotKeywords(domain));
    await new Promise(r => setTimeout(r, 3000));

    // T3: Links (all 6 sub-tools)
    results.push(await snapshotLinks(domain));
    await new Promise(r => setTimeout(r, 3000));

    // T4: Competitors + keyword ideas
    results.push(await snapshotCompetitors(domain));
    await new Promise(r => setTimeout(r, 3000));

    // T5: Site Audit
    results.push(await snapshotAudit(domain));
    await new Promise(r => setTimeout(r, 3000));
  }

  // T2b: KD enrichment (after all T2a are done)
  for (const domain of await getDomainNames()) {
    results.push(await snapshotKeywordKD(domain));
    await new Promise(r => setTimeout(r, 2000));
  }

  tiersRun.push('T1', 'T2a', 'T2b', 'T3', 'T4', 'T5');

  const successes = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`[Ahrefs Snapshot] Done: ${successes} success, ${errors} errors, ${results.length} total`);

  return {
    success: errors === 0,
    tiersRun,
    results,
    totalDomains: (await getDomainNames()).length,
    timestamp: today.toISOString(),
  };
}

// ============================
// Legacy exports (backward compat)
// ============================

export async function generateAllAhrefsSnapshots(): Promise<{
  success: boolean;
  results: Array<{ domain: string; status: string; domain_rating?: number; organic_keywords?: number; error?: string }>;
}> {
  console.log(`[Ahrefs Snapshot] Legacy pull for ${(await getDomainNames()).length} domains...`);
  const results: any[] = [];

  for (const domain of await getDomainNames()) {
    const result = await snapshotDomain(domain);
    results.push({
      domain: result.domain,
      status: result.status,
      error: result.error,
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  return {
    success: results.some(r => r.status === 'success'),
    results,
  };
}

export async function getLatestAhrefsSnapshot(domain: string): Promise<any> {
  const rows = await query(
    'SELECT * FROM ahrefs_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [domain]
  );
  return rows[0] || null;
}

export async function getAhrefsSnapshotHistory(domain: string, days: number = 30): Promise<any[]> {
  return query(
    'SELECT snapshot_date, domain_rating, organic_keywords, organic_traffic, referring_domains, backlinks FROM ahrefs_snapshots WHERE domain = $1 AND snapshot_date >= CURRENT_DATE - $2 ORDER BY snapshot_date DESC',
    [domain, days]
  );
}

// ============================
// Getters for new tables
// ============================

export async function getLatestKeywordSnapshot(domain: string): Promise<any> {
  return queryOne(
    'SELECT * FROM ahrefs_keyword_snapshots WHERE domain = $1 AND tier = \'T2a\' ORDER BY snapshot_date DESC LIMIT 1',
    [domain]
  );
}

export async function getLatestLinkSnapshot(domain: string): Promise<any> {
  return queryOne(
    'SELECT * FROM ahrefs_link_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [domain]
  );
}

export async function getLatestAuditSnapshot(domain: string): Promise<any> {
  return queryOne(
    'SELECT * FROM ahrefs_audit_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [domain]
  );
}

export async function getLatestCompetitorSnapshot(domain: string): Promise<any> {
  return queryOne(
    'SELECT * FROM ahrefs_competitor_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [domain]
  );
}
