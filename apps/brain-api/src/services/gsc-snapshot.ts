/**
 * GSC Snapshot Generator
 *
 * Pulls GSC search analytics for tracked domains nightly and caches to disk.
 * This avoids API rate limits, reduces token usage, and ensures consistent data access.
 *
 * Tracked domains: example.com (sc-domain:), example-dev.com (https://), example-qa.com (https://)
 * Data: Top 1000 queries for last 90 days, sorted by clicks descending
 */

import fs from 'fs/promises';
import path from 'path';
import { searchAnalytics } from './gsc-api';
import { query as dbQuery } from '../db/connection';

const SNAPSHOT_DIR = '/opt/team-brain/reports/mcp';

// GSC property URLs — loaded dynamically from sites table
import { getTrackedDomains } from '../config/domain-config';

async function getTrackedSites(): Promise<Record<string, string>> {
  const domains = await getTrackedDomains();
  const map: Record<string, string> = {};
  for (const d of domains) {
    if (d.gscProperty) map[d.domain] = d.gscProperty;
  }
  return map;
}

interface GSCSnapshotData {
  domain: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowsReturned: number;
  rows: any[]; // GSC rows with query, clicks, impressions, ctr, position
  pulled_at: string;
  expires_at: string;
}

/**
 * Generate snapshot filename for a domain
 */
function getSnapshotFilename(domain: string): string {
  const date = new Date().toISOString().split('T')[0];
  const domainSlug = domain.replace(/\./g, '-');
  return `gsc_snapshot_${domainSlug}_${date}.json`;
}

/**
 * Get snapshot file path for a domain
 */
function getSnapshotPath(domain: string): string {
  return path.join(SNAPSHOT_DIR, getSnapshotFilename(domain));
}

/**
 * Load existing snapshot if fresh (< 24 hours old)
 */
export async function loadGSCSnapshot(domain: string): Promise<GSCSnapshotData | null> {
  try {
    // Find latest snapshot for domain
    const files = await fs.readdir(SNAPSHOT_DIR);
    const domainSlug = domain.replace(/\./g, '-');
    const snapshotFiles = files
      .filter(f => f.startsWith(`gsc_snapshot_${domainSlug}_`) && f.endsWith('.json'))
      .sort()
      .reverse();

    if (snapshotFiles.length === 0) return null;

    const latestFile = path.join(SNAPSHOT_DIR, snapshotFiles[0]);
    const content = await fs.readFile(latestFile, 'utf-8');
    const snapshot: GSCSnapshotData = JSON.parse(content);

    // Check if expired (24 hours for GSC data)
    const expiresAt = new Date(snapshot.expires_at);
    if (expiresAt < new Date()) {
      console.log(`[GSC Snapshot] Expired for ${domain} (${snapshot.pulled_at})`);
      return null;
    }

    console.log(`[GSC Snapshot] HIT for ${domain} (${snapshot.rowsReturned} rows, pulled ${snapshot.pulled_at})`);
    return snapshot;
  } catch (err) {
    console.error(`[GSC Snapshot] Error loading for ${domain}:`, err);
    return null;
  }
}

/**
 * Pull fresh GSC data for a domain (last 90 days, top 1000 queries)
 */
async function pullDomainData(domain: string): Promise<GSCSnapshotData> {
  const siteUrl = (await getTrackedSites())[domain];
  if (!siteUrl) {
    throw new Error(`Domain ${domain} not in tracked sites`);
  }

  console.log(`[GSC Snapshot] Pulling fresh data for ${domain} (${siteUrl})...`);

  // Calculate date range: last 90 days (GSC has 2-3 day delay)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 90);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Pull GSC data (top 1000 queries sorted by clicks)
  const data = await searchAnalytics({
    siteUrl,
    startDate: startDateStr,
    endDate: endDateStr,
    dimensions: ['query'],
    rowLimit: 1000,
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  return {
    domain,
    siteUrl,
    startDate: startDateStr,
    endDate: endDateStr,
    rowsReturned: data.rows?.length || 0,
    rows: data.rows || [],
    pulled_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Save snapshot to disk + DB summary
 */
async function saveSnapshot(snapshot: GSCSnapshotData): Promise<void> {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const filePath = getSnapshotPath(snapshot.domain);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`[GSC Snapshot] Saved → ${path.basename(filePath)} (${snapshot.rowsReturned} rows)`);

  // Also save summary to DB for trend analysis
  try {
    const rows = snapshot.rows || [];
    const totalClicks = rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
    const totalImpressions = rows.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition = rows.length > 0 ? rows.reduce((s: number, r: any) => s + (r.position || 0), 0) / rows.length : 0;
    const topQueries = rows.slice(0, 20).map((r: any) => ({
      query: r.keys?.[0] || r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
    const topPages = rows.slice(0, 10);

    await dbQuery(
      `INSERT INTO gsc_snapshots
        (domain, snapshot_date, total_clicks, total_impressions, avg_ctr, avg_position,
         total_queries, top_queries, top_pages, date_range_start, date_range_end, json_file)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (domain, snapshot_date)
       DO UPDATE SET
         total_clicks = EXCLUDED.total_clicks,
         total_impressions = EXCLUDED.total_impressions,
         avg_ctr = EXCLUDED.avg_ctr,
         avg_position = EXCLUDED.avg_position,
         total_queries = EXCLUDED.total_queries,
         top_queries = EXCLUDED.top_queries,
         top_pages = EXCLUDED.top_pages,
         pulled_at = NOW()`,
      [
        snapshot.domain, totalClicks, totalImpressions, avgCtr, avgPosition,
        snapshot.rowsReturned, JSON.stringify(topQueries), JSON.stringify(topPages),
        snapshot.startDate, snapshot.endDate, path.basename(filePath),
      ]
    );
    console.log(`[GSC Snapshot] DB summary saved for ${snapshot.domain}`);
  } catch (err) {
    console.warn(`[GSC Snapshot] DB save failed (non-fatal):`, err);
  }
}

/**
 * Generate snapshot for a single domain
 */
export async function generateDomainSnapshot(domain: string): Promise<GSCSnapshotData> {
  const snapshot = await pullDomainData(domain);
  await saveSnapshot(snapshot);
  return snapshot;
}

/**
 * Generate snapshots for all tracked domains
 * Called by cron job or on-demand
 */
export async function generateAllSnapshots(): Promise<{
  success: boolean;
  snapshots: Array<{ domain: string; status: string; rows?: number; error?: string }>;
}> {
  const domains = Object.keys(await getTrackedSites());
  console.log(`[GSC Snapshot] Starting nightly pull for ${domains.length} domains...`);
  const results: Array<{ domain: string; status: string; rows?: number; error?: string }> = [];

  for (const domain of domains) {
    try {
      const snapshot = await generateDomainSnapshot(domain);
      results.push({ domain, status: 'success', rows: snapshot.rowsReturned });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[GSC Snapshot] Failed for ${domain}:`, error);
      results.push({ domain, status: 'failed', error });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  console.log(`[GSC Snapshot] Completed: ${successCount}/${domains.length} successful`);

  return {
    success: successCount === domains.length,
    snapshots: results,
  };
}

/**
 * Get GSC data with snapshot-first strategy
 * Used by executor to avoid token waste on large datasets
 */
export async function getGSCData(
  domain: string,
  options?: { startDate?: string; endDate?: string; dimensions?: string[]; rowLimit?: number }
): Promise<any> {
  // Default to snapshot if no custom date range or dimensions
  const useSnapshot = !options?.startDate && !options?.endDate && (!options?.dimensions || options.dimensions.length === 1 && options.dimensions[0] === 'query');

  if (useSnapshot) {
    // Try to load from snapshot first
    const snapshot = await loadGSCSnapshot(domain);

    if (snapshot) {
      // Apply rowLimit if specified
      const limit = options?.rowLimit ? Math.min(options.rowLimit, 1000) : snapshot.rowsReturned;
      return {
        rows: snapshot.rows.slice(0, limit),
        responseAggregationType: 'auto',
        _meta: {
          rowsReturned: Math.min(limit, snapshot.rowsReturned),
          rowLimit: limit,
          hasMore: snapshot.rowsReturned > limit,
          source: 'gsc_snapshot',
          snapshotDate: snapshot.pulled_at,
          dateRange: `${snapshot.startDate} to ${snapshot.endDate}`,
        },
        _noTruncate: true  // Snapshots are already safe (max 1000 rows)
      };
    }

    // Snapshot miss - generate fresh snapshot
    console.log(`[GSC Snapshot] MISS for ${domain}, generating fresh snapshot...`);
    const freshSnapshot = await generateDomainSnapshot(domain);
    const limit = options?.rowLimit ? Math.min(options.rowLimit, 1000) : freshSnapshot.rowsReturned;

    return {
      rows: freshSnapshot.rows.slice(0, limit),
      responseAggregationType: 'auto',
      _meta: {
        rowsReturned: Math.min(limit, freshSnapshot.rowsReturned),
        rowLimit: limit,
        hasMore: freshSnapshot.rowsReturned > limit,
        source: 'gsc_snapshot_fresh',
        snapshotDate: freshSnapshot.pulled_at,
        dateRange: `${freshSnapshot.startDate} to ${freshSnapshot.endDate}`,
      },
      _noTruncate: true  // Snapshots are already safe (max 1000 rows)
    };
  }

  // Custom query - fall back to live API
  console.log(`[GSC Snapshot] Custom query for ${domain}, using live API`);
  const siteUrl = (await getTrackedSites())[domain];
  if (!siteUrl) {
    throw new Error(`Domain ${domain} not in tracked sites`);
  }

  const liveData = await searchAnalytics({
    siteUrl,
    startDate: options?.startDate,
    endDate: options?.endDate,
    dimensions: options?.dimensions || ['query'],
    rowLimit: options?.rowLimit || 250,
  });

  // Add _noTruncate flag since rowLimit is capped at 1000 (safe for token limits)
  return {
    ...liveData,
    _noTruncate: true,
    _meta: {
      rowsReturned: liveData.rows?.length || 0,
      rowLimit: options?.rowLimit || 250,
      hasMore: (liveData.rows?.length || 0) >= (options?.rowLimit || 250),
      source: 'gsc_api_live',
      dateRange: options?.startDate && options?.endDate
        ? `${options.startDate} to ${options.endDate}`
        : 'default range',
    }
  };
}

/**
 * Clean old snapshots (keep last 7 days only)
 */
export async function cleanOldSnapshots(): Promise<number> {
  const files = await fs.readdir(SNAPSHOT_DIR);
  const gscFiles = files.filter(f => f.startsWith('gsc_snapshot_'));

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  let cleaned = 0;
  for (const file of gscFiles) {
    const filePath = path.join(SNAPSHOT_DIR, file);
    const stat = await fs.stat(filePath);

    if (stat.mtime < cutoffDate) {
      await fs.unlink(filePath);
      cleaned++;
    }
  }

  console.log(`[GSC Snapshot] Cleaned ${cleaned} old snapshots (>7 days)`);
  return cleaned;
}
