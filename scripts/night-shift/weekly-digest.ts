/**
 * Night Shift: Weekly SEO Digest
 * Schedule: Monday 5:00 AM
 *
 * Compares this week's GSC data vs last week for all 3 domains.
 * Uses Claude to generate a structured Slovak digest.
 * Posts summary to BrainFeed + saves full HTML report.
 */

import { db, claude, postToBrainFeed, log, cleanup } from './runner';

// Dynamic domains from DB
async function getDomains() {
  const rows = await db.query('SELECT domain FROM sites WHERE is_tracked = true ORDER BY domain');
  return rows.map((r: any) => r.domain);
}

interface WeekData {
  domain: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  queries: number;
  topQueries: any[];
}

async function getWeekData(domain: string, daysAgo: number): Promise<WeekData | null> {
  // Get average of last 7 days starting from daysAgo
  const result = await db.query(`
    SELECT
      AVG(total_clicks) as clicks,
      AVG(total_impressions) as impressions,
      AVG(avg_ctr) as ctr,
      AVG(avg_position) as position,
      AVG(total_queries) as queries
    FROM gsc_snapshots
    WHERE domain = $1
      AND snapshot_date BETWEEN CURRENT_DATE - CAST($2 AS INTEGER) - 7 AND CURRENT_DATE - CAST($2 AS INTEGER)
  `, [domain, daysAgo]);

  if (!result.rows[0] || !result.rows[0].clicks) return null;

  // Get latest top_queries for this domain
  const latest = await db.query(`
    SELECT top_queries FROM gsc_snapshots
    WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1
  `, [domain]);

  const row = result.rows[0];
  return {
    domain,
    clicks: Math.round(parseFloat(row.clicks)),
    impressions: Math.round(parseFloat(row.impressions)),
    ctr: parseFloat(row.ctr),
    position: parseFloat(row.position),
    queries: Math.round(parseFloat(row.queries)),
    topQueries: latest.rows[0]?.top_queries?.slice(0, 10) || [],
  };
}

async function main() {
  log('weekly-digest', 'Starting Monday digest...');

  try {
    // Collect data for all domains: this week vs last week
    const data: { domain: string; thisWeek: WeekData | null; lastWeek: WeekData | null }[] = [];

    for (const domain of await getDomains()) {
      const thisWeek = await getWeekData(domain, 0);
      const lastWeek = await getWeekData(domain, 7);
      data.push({ domain, thisWeek, lastWeek });
    }

    // Check we have data
    const hasData = data.some(d => d.thisWeek !== null);
    if (!hasData) {
      log('weekly-digest', 'No GSC data available for digest');
      await postToBrainFeed('📊 Weekly SEO Digest: žiadne GSC dáta k dispozícii');
      await cleanup();
      return;
    }

    // Build digest data for Claude
    const digestInput = data.map(d => {
      if (!d.thisWeek) return `${d.domain}: žiadne dáta`;

      const tw = d.thisWeek;
      const lw = d.lastWeek;

      let comparison = '';
      if (lw) {
        const clicksDiff = tw.clicks - lw.clicks;
        const impDiff = tw.impressions - lw.impressions;
        const clicksPct = lw.clicks > 0 ? ((clicksDiff / lw.clicks) * 100).toFixed(1) : 'N/A';
        const impPct = lw.impressions > 0 ? ((impDiff / lw.impressions) * 100).toFixed(1) : 'N/A';
        comparison = `Zmena: kliky ${clicksDiff > 0 ? '+' : ''}${clicksDiff} (${clicksPct}%), impresie ${impDiff > 0 ? '+' : ''}${impDiff} (${impPct}%)`;
      }

      const topQ = tw.topQueries
        .slice(0, 5)
        .map((q: any) => `"${q.query}" (pos ${q.position?.toFixed(1)}, ${q.clicks} klikov)`)
        .join(', ');

      return `${d.domain}: ${tw.clicks} klikov, ${tw.impressions} impresií, CTR ${(tw.ctr * 100).toFixed(2)}%, priem. pozícia ${tw.position.toFixed(1)}. ${comparison}. Top queries: ${topQ}`;
    }).join('\n\n');

    // Use Claude to generate structured digest in Slovak
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Vytvor stručný týždenný SEO prehľad pre tím v slovenčine. Max 15 riadkov. Formát: emoji + krátke vety. Zvýrazni najdôležitejšie zmeny a action items.

Dáta za posledný týždeň:
${digestInput}

Dátum: ${new Date().toLocaleDateString('sk-SK')}`
      }],
    });

    const digestText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Post to BrainFeed
    await postToBrainFeed(`📊 Weekly SEO Digest\n\n${digestText}`);

    log('weekly-digest', 'Done. Digest posted to BrainFeed.');
  } catch (err) {
    log('weekly-digest', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Weekly SEO Digest: zlyhalo — ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
