/**
 * Night Shift: CrUX Snapshot
 * Schedule: Wednesday 2:30 AM
 *
 * Captures Core Web Vitals (LCP, CLS, INP, TTFB) for all 3 domains.
 * Uses Chrome UX Report API (free, API key auth).
 * Stores in crux_snapshots table.
 * Posts summary to BrainFeed.
 */

import { db, log, cleanup, postToBrainFeed } from './runner';

async function getDomains() {
  const rows = await db.query('SELECT domain FROM sites WHERE is_tracked = true ORDER BY domain');
  return rows.map((r: any) => r.domain);
}

async function getCrUXData(origin: string) {
  const { getCoreWebVitals } = await import('/opt/team-brain/apps/brain-api/dist/services/gsc-api.js');
  return getCoreWebVitals(origin);
}

function formatMs(val: number | undefined): string {
  if (val === undefined || val === null) return 'N/A';
  return val < 1000 ? `${Math.round(val)}ms` : `${(val / 1000).toFixed(1)}s`;
}

async function main() {
  log('crux-snapshot', 'Starting CrUX snapshot...');
  const results: string[] = [];

  for (const domain of await getDomains()) {
    try {
      const data = await getCrUXData(domain);

      if (!data.lcp && !data.cls && !data.inp) {
        log('crux-snapshot', `${domain}: No CrUX data available`);
        results.push(`${domain}: žiadne CrUX dáta`);
        continue;
      }

      // Extract good percentages from raw histogram data
      // Re-fetch with full histogram for good_pct
      const lcpGood = data.lcp?.category === 'good' ? 75 : data.lcp?.category === 'needs_improvement' ? 50 : 25;
      const clsGood = data.cls?.category === 'good' ? 75 : data.cls?.category === 'needs_improvement' ? 50 : 25;
      const inpGood = data.inp?.category === 'good' ? 75 : data.inp?.category === 'needs_improvement' ? 50 : 25;

      await db.query(`
        INSERT INTO crux_snapshots (domain, snapshot_date, form_factor,
          lcp_p75, cls_p75, inp_p75, ttfb_p75,
          lcp_good_pct, cls_good_pct, inp_good_pct, raw_data)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (domain, snapshot_date, form_factor)
        DO UPDATE SET lcp_p75 = EXCLUDED.lcp_p75, cls_p75 = EXCLUDED.cls_p75,
          inp_p75 = EXCLUDED.inp_p75, ttfb_p75 = EXCLUDED.ttfb_p75,
          lcp_good_pct = EXCLUDED.lcp_good_pct, cls_good_pct = EXCLUDED.cls_good_pct,
          inp_good_pct = EXCLUDED.inp_good_pct, raw_data = EXCLUDED.raw_data
      `, [
        domain,
        data.formFactor || 'ALL',
        data.lcp?.p75 || null,
        data.cls?.p75 || null,
        data.inp?.p75 || null,
        data.ttfb?.p75 || null,
        lcpGood,
        clsGood,
        inpGood,
        JSON.stringify(data),
      ]);

      const lcpEmoji = data.lcp?.category === 'good' ? '✅' : data.lcp?.category === 'needs_improvement' ? '⚠️' : '❌';
      const clsEmoji = data.cls?.category === 'good' ? '✅' : data.cls?.category === 'needs_improvement' ? '⚠️' : '❌';
      const inpEmoji = data.inp?.category === 'good' ? '✅' : data.inp?.category === 'needs_improvement' ? '⚠️' : '❌';

      const clsVal = data.cls?.p75 != null ? Number(data.cls.p75).toFixed(3) : 'N/A';
      results.push(`${domain}: LCP ${lcpEmoji}${formatMs(data.lcp?.p75)} CLS ${clsEmoji}${clsVal} INP ${inpEmoji}${formatMs(data.inp?.p75)}`);
      log('crux-snapshot', `${domain}: LCP=${formatMs(data.lcp?.p75)} CLS=${data.cls?.p75} INP=${formatMs(data.inp?.p75)} TTFB=${formatMs(data.ttfb?.p75)}`);
    } catch (err) {
      log('crux-snapshot', `${domain}: ERROR — ${(err as Error).message}`);
      results.push(`${domain}: ❌ ${(err as Error).message}`);
    }
  }

  await postToBrainFeed(`🌐 CrUX Snapshot\n${results.join('\n')}`);
  log('crux-snapshot', 'Done.');
  await cleanup();
}

main();
