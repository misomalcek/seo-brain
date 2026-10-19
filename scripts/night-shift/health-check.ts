/**
 * Night Shift: Health Check
 * Schedule: Daily 6:30 AM
 *
 * Checks: API health, DB size, memory budget, PM2 status.
 * Posts summary to BrainFeed.
 */

import { db, postToBrainFeed, log, cleanup, claude } from './runner';
import { execFileSync } from 'child_process';

const PM2_PATH = '/opt/team-brain/apps/brain-api/node_modules/pm2/bin/pm2';

async function main() {
  log('health-check', 'Starting...');

  const checks: string[] = [];
  let hasIssues = false;

  try {
    // 1. API Health
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        checks.push('✅ API: online');
      } else {
        checks.push(`🔴 API: HTTP ${response.status}`);
        hasIssues = true;
      }
    } catch {
      checks.push('🔴 API: nedostupné');
      hasIssues = true;
    }

    // 2. DB Size
    const dbSize = await db.query(`
      SELECT pg_size_pretty(pg_database_size('team_brain')) as size
    `);
    checks.push(`💾 DB: ${dbSize.rows[0].size}`);

    // 3. Memory Budget
    const memStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COUNT(*) FILTER (WHERE is_active = FALSE AND created_at > NOW() - INTERVAL '7 days') as pending_recent,
        COUNT(*) as total
      FROM brain_memories
    `);
    const m = memStats.rows[0];
    // Healthy active set is ~200 (the cap). Flag only the broken states: too few
    // (decay/activate thrash returned) or above cap+buffer (decay not trimming).
    const active = parseInt(m.active);
    const memBad = active < 10 || active > 210;
    checks.push(`${memBad ? '⚠️' : '✅'} Memory: ${m.active} aktívnych, ${m.pending_recent} pending (7d), ${m.total} celkom`);
    if (memBad) hasIssues = true;

    // 4. PM2 Status
    try {
      const pm2Output = execFileSync(PM2_PATH, ['jlist'], { encoding: 'utf-8' });
      const processes = JSON.parse(pm2Output);
      const brainApi = processes.find((p: any) => p.name === 'brain-api');
      if (brainApi) {
        const memMB = Math.round(brainApi.monit?.memory / 1048576);
        const restarts = brainApi.pm2_env?.restart_time || 0;
        const uptime = brainApi.pm2_env?.pm_uptime
          ? Math.round((Date.now() - brainApi.pm2_env.pm_uptime) / 3600000)
          : 0;
        checks.push(`⚙️ PM2: brain-api ${memMB}MB RAM, ${restarts} restarts, ${uptime}h uptime`);
      }
    } catch {
      checks.push('⚠️ PM2: status nedostupný');
    }

    // 5. Disk space
    try {
      const dfOutput = execFileSync('df', ['-h', '/opt/team-brain'], { encoding: 'utf-8' });
      const lines = dfOutput.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const usageStr = parts[4] || '0%';
        const usage = parseInt(usageStr);
        const diskStatus = usage > 85 ? '🔴' : usage > 70 ? '⚠️' : '✅';
        checks.push(`${diskStatus} Disk: ${usageStr} used`);
        if (usage > 85) hasIssues = true;
      }
    } catch {
      checks.push('⚠️ Disk: nepodarilo sa skontrolovať');
    }

    // 6. Anthropic credit/billing — a tiny REAL ping (1 token). We only alarm on an
    // actual billing error from the API, never on a token/credit estimate (estimates
    // are unreliable and would cause false alarms). This is the early warning for the
    // exact failure mode that caused the recent outage.
    try {
      await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      checks.push('✅ Anthropic API: kredit OK');
    } catch (err: any) {
      const msg = String(err?.error?.message ?? err?.message ?? '');
      const status = err?.status ?? err?.response?.status;
      if ((status === 400 || status === 403) && /credit|billing|balance/i.test(msg)) {
        checks.push('🔴 Anthropic API: VYČERPANÝ KREDIT — Brain chat nefunguje, dobi kredit!');
        hasIssues = true;
      } else {
        // network/rate-limit/other — not a billing issue, don't false-alarm
        checks.push(`⚠️ Anthropic API: ping zlyhal (${status ?? 'net'}) — pravdepodobne dočasné`);
      }
    }

    // Post to BrainFeed
    const icon = hasIssues ? '⚠️' : '✅';
    await postToBrainFeed(
      `${icon} Health check (${new Date().toLocaleDateString('sk-SK')})\n${checks.join('\n')}`
    );

    log('health-check', `Done. Issues: ${hasIssues}`);
  } catch (err) {
    log('health-check', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`🔴 Health check: zlyhalo — ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
