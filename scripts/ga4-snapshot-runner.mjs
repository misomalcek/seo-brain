#!/usr/bin/env node
/**
 * GA4 snapshot runner — Run T (2026-05-26).
 *
 * Direct DB writer. Replaces the HTTP-endpoint approach in the original
 * ga4-snapshot-cron.sh (the endpoint was never wired). This script is
 * what cron should call.
 *
 * Captures 6 report types per tracked site (with ga4_property_id) for the
 * previous calendar month and upserts into `ga4_snapshots`. Idempotent
 * via the UNIQUE (site_id, snapshot_date, report_type) constraint.
 *
 * Usage:
 *   node scripts/ga4-snapshot-runner.mjs
 *   PERIOD_START=2026-04-01 PERIOD_END=2026-04-30 node scripts/ga4-snapshot-runner.mjs
 *
 * Cron (replace ga4-snapshot-cron.sh contents to call this):
 *   30 3 1 * * cd /opt/team-brain && node scripts/ga4-snapshot-runner.mjs >> /var/log/brain/ga4-snapshot.log 2>&1
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {
  trafficOverview, runReportWithQuota, getLastQuotaSnapshot,
} from '../apps/brain-api/dist/services/ga4-api.js';

// Read DATABASE_URL from brain-api .env if not already in process.env
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), 'apps/brain-api/.env');
    const env = fs.readFileSync(envPath, 'utf-8');
    for (const line of env.split('\n')) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) {
        process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
        break;
      }
    }
  } catch { /* fall through to default */ }
}

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new pg.Pool({ host: 'localhost', port: 5432, database: 'team_brain', user: 'brain_app', password: 'cms_local' });

function lastMonthRange() {
  const today = new Date();
  const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastPrev = new Date(firstThis.getTime() - 86400_000);
  const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(firstPrev), end: fmt(lastPrev), snapshotDate: fmt(firstPrev) };
}

const REPORTS = {
  traffic_overview: async (propertyId, start, end) => {
    const r = await trafficOverview(propertyId, start, end);
    return { rows: r.channels, rowCount: r.channels.length };
  },
  landing_pages: async (propertyId, start, end) => {
    const r = await runReportWithQuota({
      propertyId, startDate: start, endDate: end,
      dimensions: ['landingPage'],
      metrics: ['sessions', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'conversions'],
      orderBy: { metric: 'sessions', desc: true }, limit: 100,
    });
    return parseReport(r);
  },
  source_medium: async (propertyId, start, end) => {
    const r = await runReportWithQuota({
      propertyId, startDate: start, endDate: end,
      dimensions: ['sessionSource', 'sessionMedium'],
      metrics: ['sessions', 'newUsers', 'conversions'],
      orderBy: { metric: 'sessions', desc: true }, limit: 100,
    });
    return parseReport(r);
  },
  device: async (propertyId, start, end) => {
    const r = await runReportWithQuota({
      propertyId, startDate: start, endDate: end,
      dimensions: ['deviceCategory', 'browser'],
      metrics: ['sessions', 'engagementRate', 'conversions'],
      orderBy: { metric: 'sessions', desc: true }, limit: 60,
    });
    return parseReport(r);
  },
  geo: async (propertyId, start, end) => {
    const r = await runReportWithQuota({
      propertyId, startDate: start, endDate: end,
      dimensions: ['country'],
      metrics: ['sessions', 'activeUsers', 'engagementRate'],
      orderBy: { metric: 'sessions', desc: true }, limit: 50,
    });
    return parseReport(r);
  },
  key_events: async (propertyId, start, end) => {
    const r = await runReportWithQuota({
      propertyId, startDate: start, endDate: end,
      dimensions: ['eventName'],
      metrics: ['eventCount', 'eventCountPerUser'],
      orderBy: { metric: 'eventCount', desc: true }, limit: 50,
    });
    return parseReport(r);
  },
};

function parseReport(r) {
  const dimH = r.dimensionHeaders || [];
  const metH = r.metricHeaders || [];
  const rows = (r.rows || []).map((row) => {
    const o = {};
    dimH.forEach((h, i) => { o[h.name] = row.dimensionValues[i]?.value ?? ''; });
    metH.forEach((h, i) => {
      const v = row.metricValues[i]?.value ?? '0';
      const n = Number(v);
      o[h.name] = Number.isFinite(n) ? n : v;
    });
    return o;
  });
  return { rows, rowCount: rows.length };
}

async function main() {
  const period = process.env.PERIOD_START && process.env.PERIOD_END
    ? { start: process.env.PERIOD_START, end: process.env.PERIOD_END, snapshotDate: process.env.PERIOD_START }
    : lastMonthRange();

  console.log(`[ga4-runner] window: ${period.start}..${period.end}`);

  const sitesRes = await pool.query(
    `SELECT id, domain, ga4_property_id FROM sites
     WHERE is_tracked = TRUE AND ga4_property_id IS NOT NULL`
  );

  if (sitesRes.rows.length === 0) {
    console.log('[ga4-runner] No tracked sites with ga4_property_id — done.');
    await pool.end();
    return;
  }

  let okCount = 0, failCount = 0;
  for (const site of sitesRes.rows) {
    console.log(`\n[ga4-runner] site=${site.domain} property=${site.ga4_property_id}`);
    for (const [reportType, fn] of Object.entries(REPORTS)) {
      try {
        const { rows, rowCount } = await fn(site.ga4_property_id, period.start, period.end);
        const quota = getLastQuotaSnapshot();
        const tokensUsed = quota?.tokensPerHour?.consumed ?? null;
        await pool.query(
          `INSERT INTO ga4_snapshots
             (site_id, property_id, snapshot_date, report_type, period_start, period_end, payload, row_count, api_tokens_used)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (site_id, snapshot_date, report_type) DO UPDATE
             SET payload = EXCLUDED.payload, row_count = EXCLUDED.row_count,
                 api_tokens_used = EXCLUDED.api_tokens_used, created_at = now()`,
          [site.id, site.ga4_property_id, period.snapshotDate, reportType,
           period.start, period.end, JSON.stringify({ rows }), rowCount, tokensUsed]
        );
        console.log(`  ✓ ${reportType} → ${rowCount} rows`);
        okCount++;
      } catch (err) {
        console.error(`  ✗ ${reportType}: ${err.message ?? err}`);
        failCount++;
      }
    }
  }

  // Prune > 24 months
  const pruneRes = await pool.query(
    `DELETE FROM ga4_snapshots
     WHERE snapshot_date < (CURRENT_DATE - INTERVAL '24 months')`
  );
  console.log(`\n[ga4-runner] done: ok=${okCount} fail=${failCount} pruned=${pruneRes.rowCount}`);
  await pool.end();
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
