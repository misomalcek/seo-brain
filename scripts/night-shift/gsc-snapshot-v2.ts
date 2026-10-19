/**
 * Night Shift: GSC Snapshot v2
 * Schedule: Wednesday 1:30 AM
 *
 * Full keyword export for all 3 domains:
 * - Up to 10,000 keywords with auto-pagination
 * - Top URL for each keyword (query+page dimensions)
 * - Saves as CSV (server-side, not through Claude context)
 * - Stores summary in gsc_snapshots table
 * - Posts to BrainFeed
 *
 * Date range: last 3 months ending last Sunday
 */

import { db, log, cleanup, postToBrainFeed } from './runner';

async function getDomains() {
  // db is a pg Pool — query() returns { rows }, not the array itself. The missing
  // `.rows` here ("rows.map is not a function") is why GSC snapshots silently died
  // on 2026-03-26 — every weekly run threw before writing anything.
  const result = await db.query("SELECT domain, gsc_property FROM sites WHERE is_tracked = true AND gsc_property IS NOT NULL ORDER BY domain");
  return result.rows.map((r: any) => ({ domain: r.domain, siteUrl: r.gsc_property }));
}

const MAX_ROWS = 10000;
const BATCH_SIZE = 1000;

// Import GSC API functions dynamically (they use dotenv from brain-api)
async function getGSCFunctions() {
  const mod = await import('/opt/team-brain/apps/brain-api/dist/services/gsc-api.js');
  return { searchAnalytics: mod.searchAnalytics };
}

// Get last Sunday as end date, 3 months back as start
function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  // Last Sunday
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - now.getDay());
  // 3 months back
  const start = new Date(lastSunday);
  start.setMonth(start.getMonth() - 3);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: lastSunday.toISOString().split('T')[0],
  };
}

// Paginated fetch — all keywords
async function fetchAllKeywords(
  searchAnalytics: Function,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>> {
  const allRows: any[] = [];
  let batch = 0;

  while (allRows.length < MAX_ROWS) {
    batch++;
    const result = await searchAnalytics({
      siteUrl,
      startDate,
      endDate,
      dimensions,
      rowLimit: Math.min(BATCH_SIZE, MAX_ROWS - allRows.length),
      startRow: allRows.length,
    });

    if (!result.rows?.length) break;
    allRows.push(...result.rows);
    log('gsc-snapshot-v2', `  Batch ${batch}: +${result.rows.length} rows (total: ${allRows.length})`);

    if (result.rows.length < BATCH_SIZE) break; // No more data
  }

  return allRows;
}

async function snapshotDomain(
  searchAnalytics: Function,
  domain: string,
  siteUrl: string,
): Promise<{ keywords: number; csvSize: number }> {
  const { startDate, endDate } = getDateRange();
  log('gsc-snapshot-v2', `${domain}: ${startDate} → ${endDate}`);

  // Step 1: Fetch keywords only
  log('gsc-snapshot-v2', `${domain}: fetching keywords...`);
  const keywordRows = await fetchAllKeywords(searchAnalytics, siteUrl, startDate, endDate, ['query']);
  log('gsc-snapshot-v2', `${domain}: ${keywordRows.length} keywords`);

  // Step 2: Fetch keywords + pages (for top URL mapping)
  log('gsc-snapshot-v2', `${domain}: fetching keywords + top URLs...`);
  const kwPageRows = await fetchAllKeywords(searchAnalytics, siteUrl, startDate, endDate, ['query', 'page']);
  log('gsc-snapshot-v2', `${domain}: ${kwPageRows.length} keyword+page pairs`);

  // Step 3: Build top URL map (keyword → best URL by clicks)
  const topUrlMap = new Map<string, string>();
  for (const r of kwPageRows) {
    const kw = r.keys[0];
    const url = r.keys[1];
    const existing = topUrlMap.get(kw);
    if (!existing) {
      topUrlMap.set(kw, url);
    }
    // kwPageRows are already sorted by clicks desc, so first seen = best
  }

  // Step 4: Build CSV
  const fs = await import('fs');
  const header = 'keyword,clicks,impressions,ctr,position,top_url';
  const csvRows = keywordRows.map(r => [
    `"${r.keys[0].replace(/"/g, '""')}"`,
    r.clicks,
    r.impressions,
    (r.ctr * 100).toFixed(2) + '%',
    r.position.toFixed(1),
    `"${topUrlMap.get(r.keys[0]) || ''}"`,
  ].join(','));
  const csv = [header, ...csvRows].join('\n');

  // Step 5: Save CSV
  const dir = '/opt/team-brain/reports/snapshots';
  fs.mkdirSync(dir, { recursive: true });
  const filename = `gsc-${domain}-${endDate}.csv`;
  const filepath = `${dir}/${filename}`;
  fs.writeFileSync(filepath, csv, 'utf-8');
  const csvSize = Buffer.byteLength(csv);
  log('gsc-snapshot-v2', `${domain}: saved ${filepath} (${(csvSize / 1024).toFixed(1)} KB)`);

  // Step 6: Update DB summary
  const totalClicks = keywordRows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = keywordRows.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition = keywordRows.length > 0
    ? keywordRows.reduce((s, r) => s + r.position, 0) / keywordRows.length
    : 0;

  await db.query(`
    INSERT INTO gsc_snapshots (domain, snapshot_date, total_clicks, total_impressions,
      avg_ctr, avg_position, total_queries, top_queries, top_pages, date_range_start, date_range_end)
    VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
    ON CONFLICT (domain, snapshot_date)
    DO UPDATE SET total_clicks = EXCLUDED.total_clicks, total_impressions = EXCLUDED.total_impressions,
      avg_ctr = EXCLUDED.avg_ctr, avg_position = EXCLUDED.avg_position,
      total_queries = EXCLUDED.total_queries, top_queries = EXCLUDED.top_queries,
      date_range_start = EXCLUDED.date_range_start, date_range_end = EXCLUDED.date_range_end
  `, [
    domain, totalClicks, totalImpressions, avgCtr.toFixed(4), avgPosition.toFixed(2),
    keywordRows.length,
    JSON.stringify(keywordRows.slice(0, 20).map(r => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position, top_url: topUrlMap.get(r.keys[0]) || null,
    }))),
    startDate, endDate,
  ]);

  // Step 7: Cleanup old snapshots (keep last 12 weekly)
  const oldFiles = fs.readdirSync(dir)
    .filter((f: string) => f.startsWith(`gsc-${domain}-`) && f.endsWith('.csv'))
    .sort()
    .reverse();
  for (const f of oldFiles.slice(12)) {
    fs.unlinkSync(`${dir}/${f}`);
    log('gsc-snapshot-v2', `${domain}: deleted old snapshot ${f}`);
  }

  return { keywords: keywordRows.length, csvSize };
}

async function main() {
  log('gsc-snapshot-v2', 'Starting weekly GSC snapshot...');
  const { searchAnalytics } = await getGSCFunctions();

  const results: string[] = [];

  for (const { domain, siteUrl } of await getDomains()) {
    try {
      const { keywords, csvSize } = await snapshotDomain(searchAnalytics, domain, siteUrl);
      results.push(`${domain}: ${keywords} keywords (${(csvSize / 1024).toFixed(0)} KB)`);
    } catch (err) {
      log('gsc-snapshot-v2', `${domain}: ERROR — ${(err as Error).message}`);
      results.push(`${domain}: ❌ ${(err as Error).message}`);
    }
  }

  const summary = `📊 GSC Snapshot v2\n${results.join('\n')}`;
  await postToBrainFeed(summary);
  log('gsc-snapshot-v2', 'Done.');
  await cleanup();
}

main();
