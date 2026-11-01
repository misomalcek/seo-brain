import { brainPath, wwwPath } from '../paths';
import { query, queryOne } from '../db/connection';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = brainPath('reports', 'mcp');
const DASHBOARDS_DIR = process.env.SEO_BRAIN_DASHBOARDS || wwwPath('reports', 'dashboards');

if (!fs.existsSync(DASHBOARDS_DIR)) {
  fs.mkdirSync(DASHBOARDS_DIR, { recursive: true });
}

// ============================
// Data readers
// ============================

function readReportsByTool(toolPrefix: string, limit = 10): any[] {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    return fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith(toolPrefix) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit)
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8')); }
        catch { return null; }
      }).filter(Boolean);
  } catch { return []; }
}

function readGSCSnapshot(): any | null {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return null;
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('gsc_snapshot_example-org') && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    if (files.length === 0) return null;
    const raw = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, files[0]), 'utf8'));

    // Process raw GSC snapshot (rows with keys[]) into dashboard-friendly format
    const rows = raw.rows || [];
    const totalClicks = rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
    const totalImpressions = rows.reduce((s: number, r: any) => s + (r.impressions || 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition = rows.length > 0 ? rows.reduce((s: number, r: any) => s + (r.position || 0), 0) / rows.length : 0;

    const topQueries = rows.slice(0, 50).map((r: any) => ({
      query: r.keys?.[0] || r.query || '',
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: (r.ctr || 0) * 100,
      position: r.position || 0,
    }));

    // Quick wins: position 4-15, sorted by impressions desc
    const quickWins = rows
      .filter((r: any) => r.position >= 4 && r.position <= 15 && r.impressions > 50)
      .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 20)
      .map((r: any) => ({
        query: r.keys?.[0] || r.query || '',
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        position: r.position || 0,
      }));

    return {
      overview: {
        total_clicks: totalClicks,
        total_impressions: totalImpressions,
        avg_ctr: avgCtr,
        avg_position: avgPosition,
        total_queries: rows.length,
        total_pages: 0,
      },
      top_queries: topQueries,
      top_pages: [],
      quick_wins: quickWins,
      countries: [],
      devices: [],
      date_range: {
        start: raw.startDate || '',
        end: raw.endDate || '',
      },
    };
  } catch { return null; }
}

function readSiteReports(toolPrefix: string, limit = 10): any[] {
  return readReportsByTool(toolPrefix, limit * 3)
    .filter(r => {
      const target = r.params?.target || r.params?.siteUrl || '';
      return target.includes('example-org');
    })
    .slice(0, limit);
}

// ============================
// Utility
// ============================

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function num(n: any): string {
  const v = Number(n);
  if (isNaN(v)) return '0';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toLocaleString('en');
}

function pct(n: any): string {
  const v = Number(n);
  if (isNaN(v)) return '0%';
  return v.toFixed(2) + '%';
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/';
}

export interface DashboardSummary {
  [key: string]: any;
}

// ============================
// Example Org Brand CSS (shared)
// ============================

const TURBO_CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0f1218 0%,#1a1f2e 50%,#0f1218 100%);min-height:100vh;color:#e5e7eb;padding:16px;font-size:12px}
.container{max-width:1400px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#c2003a,#8c24f5);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:16px;box-shadow:0 4px 15px rgba(194,0,58,0.3)}
h1{font-size:17px;font-weight:800;background:linear-gradient(90deg,#c2003a,#8c24f5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.subtitle{color:#5a6478;font-size:10px}
.summary-bar{display:flex;gap:16px;margin-bottom:12px;padding:10px 14px;background:rgba(26,31,46,0.6);border-radius:10px;border:1px solid #2d3344;flex-wrap:wrap;align-items:center}
.sum-item .val{font-weight:800;font-size:16px}
.sum-item .lbl{color:#5a6478;font-size:8px;text-transform:uppercase;letter-spacing:0.3px}
.section-header{font-size:13px;font-weight:700;margin:16px 0 10px;padding-bottom:5px;border-bottom:2px solid #2d3344;display:flex;align-items:center;gap:8px}
.card{background:rgba(26,31,46,0.7);border:1px solid #2d3344;border-radius:10px;padding:14px;margin-bottom:10px;backdrop-filter:blur(10px)}
.card:hover{border-color:#3d4455}
.card-title{font-size:12px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.card-sub{color:#5a6478;font-size:9px;font-weight:normal}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.grid-6{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
@media(max-width:1200px){.grid-5,.grid-6{grid-template-columns:repeat(3,1fr)}}
@media(max-width:800px){.grid-2,.grid-3,.grid-4,.grid-5,.grid-6{grid-template-columns:1fr 1fr}}
@media(max-width:500px){.grid-2,.grid-3,.grid-4,.grid-5,.grid-6{grid-template-columns:1fr}}
.metric-card{background:rgba(26,31,46,0.8);border:1px solid #2d3344;border-radius:8px;padding:12px;text-align:center;transition:all 0.2s}
.metric-card:hover{transform:translateY(-2px);border-color:#3d4455}
.metric-val{font-size:20px;font-weight:800}
.metric-lbl{color:#5a6478;font-size:8px;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px}
.metric-sub{font-size:9px;margin-top:3px;color:#8b95a8}
.cyan{color:#c2003a} .green{color:#10b981} .amber{color:#f59e0b} .red{color:#ef4444} .purple{color:#8c24f5} .blue{color:#3b82f6} .pink{color:#ec4899} .orange{color:#f97316}
table{width:100%;border-collapse:collapse;font-size:10px}
th{text-align:left;padding:7px 6px;color:#5a6478;border-bottom:1px solid #2d3344;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;position:sticky;top:0;background:rgba(26,31,46,0.98)}
td{padding:6px;border-bottom:1px solid rgba(45,51,68,0.3)}
tr:hover td{background:rgba(45,51,68,0.3)}
.txt-r{text-align:right} .txt-c{text-align:center}
.pos{display:inline-block;min-width:22px;text-align:center;padding:2px 5px;border-radius:4px;font-weight:700;font-size:9px}
.pos-1{background:rgba(16,185,129,0.25);color:#10b981}
.pos-2{background:rgba(245,158,11,0.25);color:#f59e0b}
.pos-3{background:rgba(100,116,139,0.25);color:#94a3b8}
.pos-4{background:rgba(239,68,68,0.25);color:#ef4444}
.tbl-wrap{max-height:340px;overflow-y:auto}
.tbl-wrap::-webkit-scrollbar{width:4px}
.tbl-wrap::-webkit-scrollbar-track{background:#1a1f2e}
.tbl-wrap::-webkit-scrollbar-thumb{background:#3d4455;border-radius:2px}
.url-cell{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#8b95a8}
.bar-row{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.bar-label{width:120px;font-size:10px;color:#8b95a8;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{flex:1;height:22px;background:rgba(45,51,68,0.4);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;display:flex;align-items:center;padding-left:6px;font-size:9px;color:white;min-width:fit-content}
.gsc-badge{font-size:8px;padding:2px 6px;border-radius:3px;background:rgba(59,130,246,0.2);color:#3b82f6;font-weight:600}
.ahrefs-badge{font-size:8px;padding:2px 6px;border-radius:3px;background:rgba(249,115,22,0.2);color:#f97316;font-weight:600}
.turbo-badge{background:linear-gradient(135deg,#c2003a,#8c24f5);color:#fff;font-size:8px;padding:3px 8px;border-radius:4px;font-weight:700;text-transform:uppercase}
.footer{text-align:center;color:#5a6478;font-size:9px;margin-top:16px;padding:10px;border-top:1px solid #2d3344}
.country-bar{height:6px;background:#1a1f2e;border-radius:3px;overflow:hidden;margin-top:4px}
.country-fill{height:100%;background:linear-gradient(90deg,#c2003a,#8c24f5);border-radius:3px}
.theme-toggle{position:fixed;bottom:12px;right:12px;z-index:99;background:rgba(26,31,46,0.9);border:1px solid #2d3344;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:14px;color:#e5e7eb;backdrop-filter:blur(8px);transition:all 0.2s}
.theme-toggle:hover{border-color:#5a6478}
body.light{background:#f6f6f8;color:#1a1a1c}
body.light .card,body.light .metric-card{background:rgba(255,255,255,0.9);border-color:#e8e8ec}
body.light .card:hover{border-color:#d0d0d6}
body.light th{background:rgba(255,255,255,0.95);color:#5c5c66;border-bottom-color:#e8e8ec}
body.light td{border-bottom-color:rgba(232,232,236,0.5)}
body.light tr:hover td{background:rgba(0,0,0,0.03)}
body.light .summary-bar{background:rgba(255,255,255,0.8);border-color:#e8e8ec}
body.light .sum-item .lbl,body.light .metric-lbl,body.light .card-sub{color:#5c5c66}
body.light .metric-sub,body.light .url-cell,body.light .bar-label{color:#8c8c96}
body.light .footer{color:#8c8c96;border-top-color:#e8e8ec}
body.light .section-header{border-bottom-color:#e8e8ec}
body.light .tbl-wrap::-webkit-scrollbar-track{background:#f0f0f2}
body.light .tbl-wrap::-webkit-scrollbar-thumb{background:#d0d0d6}
body.light .subtitle{color:#5c5c66}
body.light .bar-track{background:rgba(0,0,0,0.05)}
body.light .country-bar{background:#e8e8ec}
body.light .theme-toggle{background:rgba(255,255,255,0.9);border-color:#e8e8ec;color:#1a1a1c}
body.light .pos-3{background:rgba(100,116,139,0.15);color:#64748b}
</style>
<script>
(function(){var b=document.body,k='brain-dash-theme',t=localStorage.getItem(k);
if(t==='light')b.classList.add('light');
var btn=document.createElement('button');btn.className='theme-toggle';btn.textContent=t==='light'?'🌙':'☀️';
btn.onclick=function(){b.classList.toggle('light');var isLight=b.classList.contains('light');
btn.textContent=isLight?'🌙':'☀️';localStorage.setItem(k,isLight?'light':'dark')};
document.addEventListener('DOMContentLoaded',function(){document.body.appendChild(btn)})})();
</script>`;

function posClass(pos: number): string {
  if (pos <= 3) return 'pos-1';
  if (pos <= 10) return 'pos-2';
  if (pos <= 20) return 'pos-3';
  return 'pos-4';
}

// ============================
// SEO Dashboard Generator
// ============================
export async function generateSEODashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  // 1. GSC snapshot (richest data source)
  const gscSnap = readGSCSnapshot();
  const overview = gscSnap?.overview || {};
  const gscQueries = gscSnap?.top_queries || [];
  const gscPages = gscSnap?.top_pages || [];
  const quickWins = gscSnap?.quick_wins || [];
  const countries = gscSnap?.countries || [];
  const devices = gscSnap?.devices || [];
  const dateRange = gscSnap?.date_range || {};

  // 2. Ahrefs data (example.com)
  const drReports = readSiteReports('ahrefs_domain_rating', 30);
  const latestDR = drReports[0]?.data?.domain_rating;
  const drHistory = drReports.reverse().map((r: any) => ({
    date: r.timestamp?.slice(0, 10) || '',
    value: r.data?.domain_rating?.domain_rating || 0,
  })).filter((d: any) => d.date && d.value > 0);

  const kwReports = readSiteReports('ahrefs_organic_keywords', 3);
  const ahrefsKw = kwReports[0]?.data?.keywords || [];

  const blReports = readSiteReports('ahrefs_backlinks', 3);
  const ahrefsBl = blReports[0]?.data?.backlinks || [];

  const compReports = readSiteReports('ahrefs_competitors', 3);
  const ahrefsComp = compReports[0]?.data?.competitors || [];

  const drVal = latestDR?.domain_rating || 0;
  const drRank = latestDR?.ahrefs_rank || 0;
  const totalClicks = overview.total_clicks || 0;
  const totalImpr = overview.total_impressions || 0;
  const avgCtr = overview.avg_ctr || 0;
  const avgPos = overview.avg_position || 0;
  const totalQueries = overview.total_queries || gscQueries.length;
  const totalPages = overview.total_pages || gscPages.length;

  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  // Summary bar
  const summaryBar = `<div class="summary-bar">
    <div class="sum-item"><div class="val cyan">${num(totalClicks)}</div><div class="lbl">Clicks (28d)</div></div>
    <div class="sum-item"><div class="val">${num(totalImpr)}</div><div class="lbl">Impressions</div></div>
    <div class="sum-item"><div class="val green">${pct(avgCtr)}</div><div class="lbl">Avg CTR</div></div>
    <div class="sum-item"><div class="val amber">${avgPos.toFixed(1)}</div><div class="lbl">Avg Position</div></div>
    <div class="sum-item"><div class="val purple">${num(totalQueries)}</div><div class="lbl">Queries</div></div>
    <div class="sum-item"><div class="val blue">${num(totalPages)}</div><div class="lbl">Pages</div></div>
    <div class="sum-item"><div class="val orange">${drVal}</div><div class="lbl">Domain Rating</div></div>
    <span class="turbo-badge">Example Org</span>
  </div>`;

  // Top metrics
  const metricsGrid = `<div class="grid-6">
    <div class="metric-card" style="border-top:3px solid #06b6d4"><div class="metric-val cyan">${num(totalClicks)}</div><div class="metric-lbl">Clicks</div></div>
    <div class="metric-card" style="border-top:3px solid #8b5cf6"><div class="metric-val purple">${num(totalImpr)}</div><div class="metric-lbl">Impressions</div></div>
    <div class="metric-card" style="border-top:3px solid #10b981"><div class="metric-val green">${pct(avgCtr)}</div><div class="metric-lbl">CTR</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${avgPos.toFixed(1)}</div><div class="metric-lbl">Avg Position</div></div>
    <div class="metric-card" style="border-top:3px solid #f97316"><div class="metric-val orange">${drVal}</div><div class="metric-lbl">Domain Rating</div></div>
    <div class="metric-card" style="border-top:3px solid #3b82f6"><div class="metric-val blue">${num(drRank)}</div><div class="metric-lbl">Ahrefs Rank</div></div>
  </div>`;

  // DR History chart
  let drChart = '';
  if (drHistory.length > 1) {
    const maxDR = Math.max(...drHistory.map(d => d.value), 1);
    drChart = `<div class="card"><div class="card-title">📈 Domain Rating History <span class="ahrefs-badge">Ahrefs</span></div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:80px">`;
    for (const d of drHistory.slice(-24)) {
      const pctH = (d.value / (maxDR + 5)) * 100;
      drChart += `<div style="flex:1;background:linear-gradient(180deg,#f97316,#ef4444);border-radius:3px 3px 0 0;height:${pctH}%;min-height:4px" title="${d.date}: DR ${d.value}"></div>`;
    }
    drChart += `</div><div style="display:flex;justify-content:space-between;font-size:8px;color:#64748b;margin-top:4px">
      <span>${drHistory[Math.max(0, drHistory.length - 24)]?.date || ''}</span>
      <span>DR ${drHistory[drHistory.length - 1]?.value || 0}</span>
      <span>${drHistory[drHistory.length - 1]?.date || ''}</span></div></div>`;
  }

  // Countries + Devices row
  let countriesCard = '';
  if (countries.length > 0) {
    const maxC = Math.max(...countries.map((c: any) => c.clicks || 0), 1);
    const countryNames: Record<string, string> = { svk: 'Slovakia', deu: 'Germany', aut: 'Austria', cze: 'Czechia', che: 'Switzerland', hun: 'Hungary', gbr: 'UK', usa: 'USA', pol: 'Poland', ind: 'India', nld: 'Netherlands', irl: 'Ireland' };
    countriesCard = `<div class="card"><div class="card-title">🌍 Countries <span class="gsc-badge">GSC</span></div>`;
    for (const c of countries.slice(0, 8)) {
      const name = countryNames[c.country] || c.country.toUpperCase();
      const barPct = (c.clicks / maxC) * 100;
      countriesCard += `<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;margin-bottom:3px">
        <span style="width:80px">${esc(name)}</span>
        <span class="cyan" style="width:50px;text-align:right;font-weight:700">${num(c.clicks)}</span>
        <span style="color:#64748b;width:60px;text-align:right">${num(c.impressions)}</span>
      </div>
      <div class="country-bar"><div class="country-fill" style="width:${Math.max(barPct, 2)}%"></div></div>`;
    }
    countriesCard += `</div>`;
  }

  let devicesCard = '';
  if (devices.length > 0) {
    const colors: Record<string, string> = { DESKTOP: '#06b6d4', MOBILE: '#8b5cf6', TABLET: '#f59e0b' };
    const totalDev = devices.reduce((s: number, d: any) => s + (d.clicks || 0), 0);
    devicesCard = `<div class="card"><div class="card-title">📱 Devices</div>
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:8px">`;
    for (const d of devices) {
      const devPct = totalDev > 0 ? ((d.clicks / totalDev) * 100) : 33;
      devicesCard += `<div style="width:${devPct}%;background:${colors[d.device] || '#64748b'}"></div>`;
    }
    devicesCard += `</div>`;
    for (const d of devices) {
      const devPct = totalDev > 0 ? ((d.clicks / totalDev) * 100).toFixed(1) : '33.3';
      devicesCard += `<div style="display:flex;justify-content:space-between;font-size:10px;padding:3px 0;border-bottom:1px solid rgba(51,65,85,0.3)">
        <span>${d.device.charAt(0) + d.device.slice(1).toLowerCase()}</span>
        <span>${num(d.clicks)} clicks</span>
        <span style="color:${colors[d.device] || '#64748b'};font-weight:700">${devPct}%</span>
        <span style="color:#64748b">CTR ${d.ctr?.toFixed(2) || 0}%</span>
      </div>`;
    }
    devicesCard += `</div>`;
  }

  // GSC Top Queries table
  let queriesTable = '';
  if (gscQueries.length > 0) {
    queriesTable = `<div class="card"><div class="card-title">🎯 Top Queries <span class="gsc-badge">GSC ${dateRange.start || ''} → ${dateRange.end || ''}</span></div>
      <div class="tbl-wrap"><table><tr><th>Query</th><th class="txt-c">Clicks</th><th class="txt-c">Impressions</th><th class="txt-c">CTR</th><th class="txt-c">Position</th></tr>`;
    for (const q of gscQueries.slice(0, 25)) {
      const pos = q.position || 0;
      queriesTable += `<tr>
        <td>${esc(q.query || q.keys?.[0] || '')}</td>
        <td class="txt-c"><strong>${num(q.clicks)}</strong></td>
        <td class="txt-c">${num(q.impressions)}</td>
        <td class="txt-c">${typeof q.ctr === 'number' && q.ctr < 1 ? (q.ctr * 100).toFixed(2) : q.ctr?.toFixed(2) || 0}%</td>
        <td class="txt-c"><span class="pos ${posClass(pos)}">${pos.toFixed(1)}</span></td>
      </tr>`;
    }
    queriesTable += `</table></div></div>`;
  }

  // GSC Top Pages table
  let pagesTable = '';
  if (gscPages.length > 0) {
    pagesTable = `<div class="card"><div class="card-title">📄 Top Pages <span class="gsc-badge">GSC</span></div>
      <div class="tbl-wrap"><table><tr><th>Page</th><th class="txt-c">Clicks</th><th class="txt-c">Impressions</th><th class="txt-c">CTR</th><th class="txt-c">Position</th></tr>`;
    for (const p of gscPages.slice(0, 20)) {
      const url = p.page || p.keys?.[0] || '';
      const pos = p.position || 0;
      const ctr = typeof p.ctr === 'number' && p.ctr < 1 ? (p.ctr * 100).toFixed(2) : p.ctr?.toFixed(2) || 0;
      pagesTable += `<tr>
        <td class="url-cell" title="${esc(url)}">${esc(shortUrl(url))}</td>
        <td class="txt-c"><strong>${num(p.clicks)}</strong></td>
        <td class="txt-c">${num(p.impressions)}</td>
        <td class="txt-c">${ctr}%</td>
        <td class="txt-c"><span class="pos ${posClass(pos)}">${pos.toFixed(1)}</span></td>
      </tr>`;
    }
    pagesTable += `</table></div></div>`;
  }

  // Ahrefs Organic Keywords
  let ahrefsKwTable = '';
  if (ahrefsKw.length > 0) {
    ahrefsKwTable = `<div class="card"><div class="card-title">🔑 Organic Keywords <span class="ahrefs-badge">Ahrefs</span></div>
      <div class="tbl-wrap"><table><tr><th>Keyword</th><th class="txt-c">Position</th><th class="txt-c">Volume</th><th class="txt-c">Traffic</th><th>URL</th></tr>`;
    for (const k of ahrefsKw.slice(0, 20)) {
      const pos = k.best_position || k.position || 0;
      ahrefsKwTable += `<tr>
        <td>${esc(k.keyword)}</td>
        <td class="txt-c"><span class="pos ${posClass(pos)}">${pos}</span></td>
        <td class="txt-c">${num(k.volume || k.search_volume)}</td>
        <td class="txt-c"><strong>${num(k.sum_traffic || k.traffic)}</strong></td>
        <td class="url-cell" title="${esc(k.best_position_url || '')}">${esc(shortUrl(k.best_position_url || ''))}</td>
      </tr>`;
    }
    ahrefsKwTable += `</table></div></div>`;
  }

  // Quick Wins
  let quickWinsTable = '';
  if (quickWins.length > 0) {
    quickWinsTable = `<div class="card" style="border-left:3px solid #10b981"><div class="card-title">🚀 Quick Wins <span class="card-sub">• Position 4-15, high impressions</span></div>
      <div class="tbl-wrap"><table><tr><th>Query</th><th class="txt-c">Clicks</th><th class="txt-c">Impressions</th><th class="txt-c">Position</th></tr>`;
    for (const q of quickWins.slice(0, 15)) {
      const pos = q.position || 0;
      quickWinsTable += `<tr>
        <td>${esc(q.query)}</td>
        <td class="txt-c">${num(q.clicks)}</td>
        <td class="txt-c">${num(q.impressions)}</td>
        <td class="txt-c"><span class="pos ${posClass(pos)}">${pos.toFixed(1)}</span></td>
      </tr>`;
    }
    quickWinsTable += `</table></div></div>`;
  }

  // Competitors
  let compTable = '';
  if (ahrefsComp.length > 0) {
    compTable = `<div class="card"><div class="card-title">⚔️ Organic Competitors <span class="ahrefs-badge">Ahrefs</span></div>
      <div class="tbl-wrap"><table><tr><th>Domain</th><th class="txt-c">Common KW</th><th class="txt-c">Traffic</th><th class="txt-c">DR</th></tr>`;
    for (const c of ahrefsComp.slice(0, 10)) {
      compTable += `<tr>
        <td>${esc(c.competitor_domain || c.domain)}</td>
        <td class="txt-c">${num(c.keywords_common || c.common_keywords)}</td>
        <td class="txt-c">${num(c.traffic || c.organic_traffic)}</td>
        <td class="txt-c"><span class="pos pos-2">${c.domain_rating || c.dr || '-'}</span></td>
      </tr>`;
    }
    compTable += `</table></div></div>`;
  }

  // Backlinks
  let blTable = '';
  const realBl = ahrefsBl.filter((b: any) => {
    const url = b.url_from || '';
    return !url.includes('exlinko') && !url.includes('itxoft') && (b.domain_rating_source || 0) > 0;
  });
  if (realBl.length > 0) {
    blTable = `<div class="card"><div class="card-title">🔗 Backlinks <span class="ahrefs-badge">Ahrefs</span></div>
      <div class="tbl-wrap"><table><tr><th>Source</th><th>Anchor</th><th class="txt-c">DR</th></tr>`;
    for (const b of realBl.slice(0, 10)) {
      blTable += `<tr>
        <td class="url-cell" title="${esc(b.url_from)}">${esc(shortUrl(b.url_from || ''))}</td>
        <td>${esc(b.anchor || '').slice(0, 60)}</td>
        <td class="txt-c"><span class="pos pos-2">${b.domain_rating_source || '-'}</span></td>
      </tr>`;
    }
    blTable += `</table></div></div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEO Dashboard — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">⚡</div>
      <div>
        <h1>Example Org — SEO Dashboard</h1>
        <div class="subtitle">example.com • Ahrefs + Google Search Console • ${dateRange.start || ''} → ${dateRange.end || ''}</div>
      </div>
    </div>
  </div>

  ${summaryBar}
  ${metricsGrid}

  <div class="grid-3" style="margin-top:12px">
    ${countriesCard}
    ${devicesCard}
    ${drChart}
  </div>

  ${queriesTable}
  ${pagesTable}

  <div class="grid-2">
    ${ahrefsKwTable}
    ${quickWinsTable}
  </div>

  <div class="grid-2">
    ${compTable}
    ${blTable}
  </div>

  <div class="footer">
    ⚡ Team Brain SEO Dashboard &middot; ${now} &middot; Data: Google Search Console + Ahrefs API<br>
    <span style="color:#475569">example.com &middot; Generated by Team Brain v1.8</span>
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: {
      domainRating: drVal,
      totalClicks,
      totalImpressions: totalImpr,
      avgCtr,
      totalQueries,
      organicKeywords: ahrefsKw.length,
    },
  };
}

// ============================
// Content Dashboard Generator
// ============================
export async function generateContentDashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const conversations = await query(
    `SELECT c.id, c.title, c.created_at, u.name as user_name
     FROM conversations c JOIN users u ON c.user_id = u.id
     ORDER BY c.created_at DESC LIMIT 20`
  );

  const stats = await queryOne<{ conv_count: string; msg_count: string }>(
    `SELECT (SELECT COUNT(*) FROM conversations) as conv_count,
            (SELECT COUNT(*) FROM messages WHERE role = 'assistant') as msg_count`
  );

  const toolUsage = await query(
    `SELECT tool_type, COUNT(*) as count FROM user_reports GROUP BY tool_type ORDER BY count DESC`
  );

  const contentStats = await query(
    `SELECT status, COUNT(*) as count FROM content_items GROUP BY status ORDER BY status`
  );

  const recentContent = await query(
    `SELECT c.title, c.status, c.content_type, c.deadline, c.updated_at,
            COALESCE(array_length(c.keywords, 1), 0) as kw_count
     FROM content_items c
     ORDER BY c.updated_at DESC LIMIT 20`
  );

  // Weekly activity
  const weeklyActivity = await query(
    `SELECT DATE(created_at) as day, COUNT(*) as count
     FROM messages WHERE created_at >= NOW() - INTERVAL '14 days'
     GROUP BY DATE(created_at) ORDER BY day`
  );

  // Agent usage (personas is a text[] array)
  const agentUsage = await query(
    `SELECT p as agent_name, COUNT(*) as count
     FROM persona_deliberations, UNNEST(personas) AS p
     GROUP BY p ORDER BY count DESC LIMIT 10`
  );

  const convCount = Number(stats?.conv_count || 0);
  const msgCount = Number(stats?.msg_count || 0);
  const totalContent = contentStats.reduce((s: number, r: any) => s + Number(r.count), 0);
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  // Pipeline status
  const statusLabels: Record<string, string> = { idea: 'Napady', brief: 'Briefy', draft: 'Drafty', review: 'Review', published: 'Publikovane', archived: 'Archiv' };
  const statusColors: Record<string, string> = { idea: '#f59e0b', brief: '#3b82f6', draft: '#8b5cf6', review: '#f97316', published: '#10b981', archived: '#64748b' };

  // Activity chart
  let activityChart = '';
  if (weeklyActivity.length > 0) {
    const maxA = Math.max(...weeklyActivity.map((a: any) => Number(a.count)), 1);
    activityChart = `<div class="card"><div class="card-title">📊 Daily Activity (14 days)</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:80px">`;
    for (const a of weeklyActivity) {
      const h = (Number(a.count) / maxA) * 100;
      const day = new Date(a.day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
      activityChart += `<div style="flex:1;background:linear-gradient(180deg,#06b6d4,#3b82f6);border-radius:3px 3px 0 0;height:${h}%;min-height:4px" title="${day}: ${a.count} msgs"></div>`;
    }
    activityChart += `</div><div style="display:flex;justify-content:space-between;font-size:8px;color:#64748b;margin-top:4px">
      <span>${weeklyActivity.length > 0 ? new Date(weeklyActivity[0].day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}</span>
      <span>${weeklyActivity.length > 0 ? new Date(weeklyActivity[weeklyActivity.length - 1].day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}</span>
    </div></div>`;
  }

  // Pipeline bars
  let pipelineCard = '';
  if (contentStats.length > 0) {
    const maxP = Math.max(...contentStats.map((r: any) => Number(r.count)), 1);
    pipelineCard = `<div class="card"><div class="card-title">📋 Content Pipeline</div>`;
    for (const r of contentStats) {
      const pctV = (Number(r.count) / maxP) * 100;
      const color = statusColors[r.status] || '#64748b';
      pipelineCard += `<div class="bar-row"><div class="bar-label">${statusLabels[r.status] || r.status}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 8)}%;background:${color}">${r.count}</div></div></div>`;
    }
    pipelineCard += `</div>`;
  }

  // Tool usage bars
  let toolCard = '';
  if (toolUsage.length > 0) {
    const maxT = Math.max(...toolUsage.map((t: any) => Number(t.count)), 1);
    toolCard = `<div class="card"><div class="card-title">🔧 MCP Tool Usage</div>`;
    for (const t of toolUsage.slice(0, 8)) {
      const pctV = (Number(t.count) / maxT) * 100;
      toolCard += `<div class="bar-row"><div class="bar-label">${esc(t.tool_type)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 8)}%;background:linear-gradient(90deg,#06b6d4,#8b5cf6)">${t.count}</div></div></div>`;
    }
    toolCard += `</div>`;
  }

  // Agent usage
  let agentCard = '';
  if (agentUsage.length > 0) {
    const maxAg = Math.max(...agentUsage.map((a: any) => Number(a.count)), 1);
    agentCard = `<div class="card"><div class="card-title">🤖 Agent Usage</div>`;
    for (const a of agentUsage) {
      const pctV = (Number(a.count) / maxAg) * 100;
      agentCard += `<div class="bar-row"><div class="bar-label">${esc(a.agent_name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 8)}%;background:linear-gradient(90deg,#a855f7,#ec4899)">${a.count}</div></div></div>`;
    }
    agentCard += `</div>`;
  }

  // Recent content table
  let contentTable = '';
  if (recentContent.length > 0) {
    contentTable = `<div class="card"><div class="card-title">📝 Recent Content Items</div>
      <div class="tbl-wrap"><table><tr><th>Title</th><th class="txt-c">Status</th><th>Type</th><th class="txt-c">Keywords</th><th>Deadline</th></tr>`;
    for (const c of recentContent) {
      const color = statusColors[c.status] || '#64748b';
      const deadline = c.deadline ? new Date(c.deadline).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : '-';
      contentTable += `<tr>
        <td>${esc(c.title)}</td>
        <td class="txt-c"><span style="color:${color};font-weight:600">${c.status}</span></td>
        <td>${esc(c.content_type || '-')}</td>
        <td class="txt-c">${c.kw_count || 0}</td>
        <td>${deadline}</td>
      </tr>`;
    }
    contentTable += `</table></div></div>`;
  }

  // Recent conversations
  let convTable = '';
  if (conversations.length > 0) {
    convTable = `<div class="card"><div class="card-title">💬 Recent AI Conversations</div>
      <div class="tbl-wrap"><table><tr><th>Title</th><th>User</th><th>Date</th></tr>`;
    for (const c of conversations.slice(0, 12)) {
      const date = new Date(c.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      convTable += `<tr><td>${esc(c.title || 'Bez nazvu')}</td><td>${esc(c.user_name)}</td><td>${date}</td></tr>`;
    }
    convTable += `</table></div></div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Dashboard — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">✏️</div>
      <div>
        <h1>Content & AI Dashboard</h1>
        <div class="subtitle">Team Brain • Content Pipeline + AI Usage Analytics</div>
      </div>
    </div>
  </div>

  <div class="grid-5">
    <div class="metric-card" style="border-top:3px solid #06b6d4"><div class="metric-val cyan">${num(convCount)}</div><div class="metric-lbl">Conversations</div></div>
    <div class="metric-card" style="border-top:3px solid #10b981"><div class="metric-val green">${num(msgCount)}</div><div class="metric-lbl">AI Responses</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${totalContent}</div><div class="metric-lbl">Content Items</div></div>
    <div class="metric-card" style="border-top:3px solid #8b5cf6"><div class="metric-val purple">${toolUsage.length}</div><div class="metric-lbl">Tool Types</div></div>
    <div class="metric-card" style="border-top:3px solid #ec4899"><div class="metric-val pink">${agentUsage.length}</div><div class="metric-lbl">Active Agents</div></div>
  </div>

  ${activityChart}

  <div class="grid-3">
    ${pipelineCard}
    ${toolCard}
    ${agentCard}
  </div>

  ${contentTable}
  ${convTable}

  <div class="footer">
    Team Brain Content Dashboard &middot; ${now} &middot; Generated by Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: {
      conversations: convCount,
      aiResponses: msgCount,
      contentItems: totalContent,
      toolTypes: toolUsage.length,
    },
  };
}

// ============================
// CEO Dashboard Generator
// ============================
export async function generateCEODashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const activity = await query(
    `SELECT DATE(created_at) as day, COUNT(*) as count
     FROM messages WHERE created_at >= NOW() - INTERVAL '14 days'
     GROUP BY DATE(created_at) ORDER BY day`
  );

  const users = await query(
    `SELECT u.id, u.name, u.role, u.last_login_at,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as conversations,
      (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = u.id) as messages
     FROM users u ORDER BY u.last_login_at DESC NULLS LAST`
  );

  const deliberations = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM persona_deliberations');
  const reports = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_reports');
  const files = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM user_files');
  const workspaceItems = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM workspace_items');
  const contentItems = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM content_items');

  // Content pipeline breakdown
  const contentPipeline = await query(
    `SELECT status, COUNT(*) as count FROM content_items GROUP BY status ORDER BY status`
  );

  const drReports = readSiteReports('ahrefs_domain_rating', 1);
  const latestDR = drReports[0]?.data?.domain_rating;
  const gscSnap = readGSCSnapshot();
  const gscOverview = gscSnap?.overview || {};

  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const totalConv = users.reduce((s: number, u: any) => s + Number(u.conversations), 0);
  const totalMsg = users.reduce((s: number, u: any) => s + Number(u.messages), 0);
  const uptimeStr = uptime > 86400 ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h` : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  // Activity chart
  let activityChart = '';
  if (activity.length > 0) {
    const maxA = Math.max(...activity.map((a: any) => Number(a.count)), 1);
    activityChart = `<div class="card"><div class="card-title">📊 Daily Activity (14 days)</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:100px">`;
    for (const a of activity) {
      const h = (Number(a.count) / maxA) * 100;
      const day = new Date(a.day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
      activityChart += `<div style="flex:1;background:linear-gradient(180deg,#10b981,#3b82f6);border-radius:3px 3px 0 0;height:${h}%;min-height:4px" title="${day}: ${a.count} msgs"></div>`;
    }
    activityChart += `</div><div style="display:flex;justify-content:space-between;font-size:8px;color:#64748b;margin-top:4px">
      <span>${activity.length > 0 ? new Date(activity[0].day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}</span>
      <span>${activity.length > 0 ? new Date(activity[activity.length - 1].day).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}</span>
    </div></div>`;
  }

  // Users table
  let usersTable = `<div class="card"><div class="card-title">👥 Team Members</div>
    <div class="tbl-wrap"><table><tr><th>Name</th><th class="txt-c">Role</th><th>Last Login</th><th class="txt-c">Conversations</th><th class="txt-c">Messages</th></tr>`;
  for (const u of users) {
    const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nikdy';
    const roleColor = u.role === 'admin' ? '#a855f7' : '#10b981';
    usersTable += `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td class="txt-c"><span style="color:${roleColor};font-weight:600">${u.role}</span></td>
      <td>${lastLogin}</td>
      <td class="txt-c">${num(u.conversations)}</td>
      <td class="txt-c">${num(u.messages)}</td>
    </tr>`;
  }
  usersTable += `</table></div></div>`;

  // Content pipeline
  let pipelineCard = '';
  const statusLabels: Record<string, string> = { idea: 'Napady', brief: 'Briefy', draft: 'Drafty', review: 'Review', published: 'Publikovane', archived: 'Archiv' };
  const statusColors: Record<string, string> = { idea: '#f59e0b', brief: '#3b82f6', draft: '#8b5cf6', review: '#f97316', published: '#10b981', archived: '#64748b' };
  if (contentPipeline.length > 0) {
    const maxP = Math.max(...contentPipeline.map((r: any) => Number(r.count)), 1);
    pipelineCard = `<div class="card"><div class="card-title">📋 Content Pipeline</div>`;
    for (const r of contentPipeline) {
      const pctV = (Number(r.count) / maxP) * 100;
      const color = statusColors[r.status] || '#64748b';
      pipelineCard += `<div class="bar-row"><div class="bar-label">${statusLabels[r.status] || r.status}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 8)}%;background:${color}">${r.count}</div></div></div>`;
    }
    pipelineCard += `</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEO Dashboard — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">👔</div>
      <div>
        <h1>CEO Dashboard — Team Brain</h1>
        <div class="subtitle">Example Org • Executive Overview • KPIs + Activity</div>
      </div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="sum-item"><div class="val cyan">${users.length}</div><div class="lbl">Team Members</div></div>
    <div class="sum-item"><div class="val green">${num(totalConv)}</div><div class="lbl">Conversations</div></div>
    <div class="sum-item"><div class="val purple">${num(totalMsg)}</div><div class="lbl">Messages</div></div>
    <div class="sum-item"><div class="val orange">${latestDR?.domain_rating || '-'}</div><div class="lbl">Domain Rating</div></div>
    <div class="sum-item"><div class="val blue">${num(gscOverview.total_clicks || 0)}</div><div class="lbl">GSC Clicks</div></div>
  </div>

  <div class="grid-5">
    <div class="metric-card" style="border-top:3px solid #06b6d4"><div class="metric-val cyan">${users.length}</div><div class="metric-lbl">Users</div></div>
    <div class="metric-card" style="border-top:3px solid #10b981"><div class="metric-val green">${num(totalConv)}</div><div class="metric-lbl">Conversations</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${num(totalMsg)}</div><div class="metric-lbl">Messages</div></div>
    <div class="metric-card" style="border-top:3px solid #a855f7"><div class="metric-val purple">${Number(deliberations?.count || 0)}</div><div class="metric-lbl">Deliberations</div></div>
    <div class="metric-card" style="border-top:3px solid #3b82f6"><div class="metric-val blue">${Number(reports?.count || 0)}</div><div class="metric-lbl">Reports</div></div>
  </div>

  <div class="grid-4" style="margin-top:8px">
    <div class="metric-card"><div class="metric-val pink">${Number(files?.count || 0)}</div><div class="metric-lbl">Uploaded Files</div></div>
    <div class="metric-card"><div class="metric-val amber">${Number(contentItems?.count || 0)}</div><div class="metric-lbl">Content Items</div></div>
    <div class="metric-card"><div class="metric-val cyan">${Number(workspaceItems?.count || 0)}</div><div class="metric-lbl">Workspace Items</div></div>
    <div class="metric-card"><div class="metric-val green">${uptimeStr}</div><div class="metric-lbl">Server Uptime</div><div class="metric-sub">${Math.round(mem.heapUsed / 1024 / 1024)} MB RAM</div></div>
  </div>

  ${activityChart}

  <div class="grid-2">
    ${usersTable}
    ${pipelineCard}
  </div>

  <div class="footer">
    Team Brain CEO Dashboard &middot; ${now} &middot; Node ${process.version} &middot; Generated by Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: {
      domainRating: latestDR?.domain_rating || null,
      totalUsers: users.length,
      totalConversations: totalConv,
      totalMessages: totalMsg,
      features: {
        deliberations: Number(deliberations?.count || 0),
        reports: Number(reports?.count || 0),
        files: Number(files?.count || 0),
        contentItems: Number(contentItems?.count || 0),
      },
    },
  };
}

// ============================
// Keyword Opportunities Hub
// ============================
export async function generateKeywordOpportunitiesDashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const DOMAINS = ['example.com', 'example-dev.com', 'example-qa.com'];
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  // Gather GSC + Ahrefs keyword data for all domains
  const allOpportunities: any[] = [];
  const domainStats: any[] = [];

  for (const domain of DOMAINS) {
    // GSC data
    const gscRow = await queryOne<any>(
      'SELECT top_queries, total_clicks, total_impressions, total_queries FROM gsc_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    const gscQueries: Record<string, any> = {};
    if (gscRow?.top_queries) {
      const tq = typeof gscRow.top_queries === 'string' ? JSON.parse(gscRow.top_queries) : gscRow.top_queries;
      for (const q of (Array.isArray(tq) ? tq : [])) {
        const kw = (q.query || q.keys?.[0] || '').toLowerCase().trim();
        if (kw) gscQueries[kw] = q;
      }
    }
    // Also read raw GSC snapshot file for richer data
    const domainSlug = domain.replace(/\./g, '-');
    const gscFiles = fs.existsSync(REPORTS_DIR) ? fs.readdirSync(REPORTS_DIR).filter(f => f.startsWith(`gsc_snapshot_${domainSlug}`) && f.endsWith('.json')).sort((a, b) => b.localeCompare(a)) : [];
    if (gscFiles.length > 0) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, gscFiles[0]), 'utf8'));
        for (const r of (raw.rows || [])) {
          const kw = (r.keys?.[0] || r.query || '').toLowerCase().trim();
          if (kw && !gscQueries[kw]) gscQueries[kw] = { clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr };
        }
      } catch {}
    }

    // Ahrefs keyword snapshot (T2a has keywords, T2b has only kd_enrichment)
    const kwSnap = await queryOne<any>(
      "SELECT keywords, kd_enrichment, keyword_count FROM ahrefs_keyword_snapshots WHERE domain = $1 AND tier = 'T2a' ORDER BY snapshot_date DESC LIMIT 1",
      [domain]
    );
    // Also get KD enrichment from T2b
    const kdSnap = await queryOne<any>(
      "SELECT kd_enrichment FROM ahrefs_keyword_snapshots WHERE domain = $1 AND tier = 'T2b' ORDER BY snapshot_date DESC LIMIT 1",
      [domain]
    );
    const ahrefsKw: Record<string, any> = {};
    if (kwSnap?.keywords) {
      const kws = typeof kwSnap.keywords === 'string' ? JSON.parse(kwSnap.keywords) : kwSnap.keywords;
      for (const k of (Array.isArray(kws) ? kws : [])) {
        const kw = (k.keyword || '').toLowerCase().trim();
        if (kw) ahrefsKw[kw] = k;
      }
    }
    // Merge KD enrichment data into ahrefsKw
    if (kdSnap?.kd_enrichment) {
      const kds = typeof kdSnap.kd_enrichment === 'string' ? JSON.parse(kdSnap.kd_enrichment) : kdSnap.kd_enrichment;
      for (const e of (Array.isArray(kds) ? kds : [])) {
        const kw = (e.keyword || '').toLowerCase().trim();
        if (kw && ahrefsKw[kw]) ahrefsKw[kw].keyword_difficulty = e.keyword_difficulty;
      }
    }

    // Build opportunity scores: ahrefs_volume × (1 / gsc_position)
    const allKws = new Set([...Object.keys(gscQueries), ...Object.keys(ahrefsKw)]);
    let domainOpps = 0;
    const buckets = { '1-3': 0, '4-10': 0, '11-20': 0, '21-50': 0, '51-100': 0, '100+': 0 };

    for (const kw of allKws) {
      const gsc = gscQueries[kw];
      const ahrefs = ahrefsKw[kw];
      const pos = gsc?.position || 0;
      const volume = ahrefs?.volume || ahrefs?.search_volume || 0;
      const clicks = gsc?.clicks || 0;
      const impressions = gsc?.impressions || 0;
      const kd = ahrefs?.keyword_difficulty || null;
      const score = pos > 0 && volume > 0 ? Math.round(volume * (1 / pos)) : 0;

      if (pos > 0) {
        if (pos <= 3) buckets['1-3']++;
        else if (pos <= 10) buckets['4-10']++;
        else if (pos <= 20) buckets['11-20']++;
        else if (pos <= 50) buckets['21-50']++;
        else if (pos <= 100) buckets['51-100']++;
        else buckets['100+']++;
      }

      allOpportunities.push({
        keyword: kw, domain, pos, volume, clicks, impressions, kd, score,
        inGSC: !!gsc, inAhrefs: !!ahrefs,
      });
      if (score > 0) domainOpps++;
    }

    domainStats.push({
      domain,
      totalGSC: Object.keys(gscQueries).length,
      totalAhrefs: Object.keys(ahrefsKw).length,
      opportunities: domainOpps,
      clicks: Number(gscRow?.total_clicks || 0),
      impressions: Number(gscRow?.total_impressions || 0),
      buckets,
    });
  }

  // Sort opportunities by score desc
  allOpportunities.sort((a, b) => b.score - a.score);

  // Quick wins: position 4-15, sorted by score
  const quickWins = allOpportunities.filter(o => o.pos >= 4 && o.pos <= 15 && o.score > 0).slice(0, 25);

  // Keyword gap: in Ahrefs but NOT in GSC
  const keywordGap = allOpportunities.filter(o => o.inAhrefs && !o.inGSC && o.volume > 0)
    .sort((a, b) => b.volume - a.volume).slice(0, 20);

  // Top opportunities overall
  const topOpps = allOpportunities.filter(o => o.score > 0).slice(0, 30);

  const totalKws = allOpportunities.length;
  const totalOpps = allOpportunities.filter(o => o.score > 0).length;

  // Domain overview cards
  let domainCards = '<div class="grid-3">';
  for (const ds of domainStats) {
    domainCards += `<div class="card">
      <div class="card-title">${esc(ds.domain)}</div>
      <div class="grid-2" style="gap:6px">
        <div><span class="cyan" style="font-weight:800;font-size:16px">${num(ds.clicks)}</span><div class="metric-lbl">GSC Clicks</div></div>
        <div><span class="purple" style="font-weight:800;font-size:16px">${num(ds.totalAhrefs)}</span><div class="metric-lbl">Ahrefs KW</div></div>
        <div><span class="green" style="font-weight:800;font-size:16px">${num(ds.totalGSC)}</span><div class="metric-lbl">GSC Queries</div></div>
        <div><span class="amber" style="font-weight:800;font-size:16px">${ds.opportunities}</span><div class="metric-lbl">Opportunities</div></div>
      </div>
    </div>`;
  }
  domainCards += '</div>';

  // Position distribution (combined)
  const combinedBuckets = { '1-3': 0, '4-10': 0, '11-20': 0, '21-50': 0, '51-100': 0, '100+': 0 };
  for (const ds of domainStats) {
    for (const [k, v] of Object.entries(ds.buckets)) combinedBuckets[k as keyof typeof combinedBuckets] += v as number;
  }
  const bucketColors: Record<string, string> = { '1-3': '#10b981', '4-10': '#06b6d4', '11-20': '#f59e0b', '21-50': '#f97316', '51-100': '#ef4444', '100+': '#64748b' };
  const maxBucket = Math.max(...Object.values(combinedBuckets), 1);
  let bucketChart = '<div class="card"><div class="card-title">Position Distribution (all domains)</div>';
  for (const [label, count] of Object.entries(combinedBuckets)) {
    const pctV = (count / maxBucket) * 100;
    bucketChart += `<div class="bar-row"><div class="bar-label">Pos ${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 5)}%;background:${bucketColors[label] || '#64748b'}">${count}</div></div></div>`;
  }
  bucketChart += '</div>';

  // Top opportunities table
  let oppsTable = '';
  if (topOpps.length > 0) {
    oppsTable = `<div class="card" style="border-left:3px solid #06b6d4"><div class="card-title">Top Keyword Opportunities <span class="card-sub">Score = Volume x (1/Position)</span></div>
      <div class="tbl-wrap"><table><tr><th>Keyword</th><th>Domain</th><th class="txt-c">Score</th><th class="txt-c">Position</th><th class="txt-c">Volume</th><th class="txt-c">Clicks</th><th class="txt-c">KD</th></tr>`;
    for (const o of topOpps) {
      oppsTable += `<tr>
        <td>${esc(o.keyword)}</td>
        <td style="color:#64748b;font-size:9px">${esc(o.domain)}</td>
        <td class="txt-c"><strong class="cyan">${num(o.score)}</strong></td>
        <td class="txt-c"><span class="pos ${posClass(o.pos)}">${o.pos.toFixed(1)}</span></td>
        <td class="txt-c">${num(o.volume)}</td>
        <td class="txt-c">${num(o.clicks)}</td>
        <td class="txt-c">${o.kd !== null ? o.kd : '-'}</td>
      </tr>`;
    }
    oppsTable += '</table></div></div>';
  }

  // Quick wins table
  let qwTable = '';
  if (quickWins.length > 0) {
    qwTable = `<div class="card" style="border-left:3px solid #10b981"><div class="card-title">Quick Wins <span class="card-sub">Position 4-15, high opportunity score</span></div>
      <div class="tbl-wrap"><table><tr><th>Keyword</th><th>Domain</th><th class="txt-c">Score</th><th class="txt-c">Position</th><th class="txt-c">Volume</th><th class="txt-c">Impressions</th></tr>`;
    for (const o of quickWins) {
      qwTable += `<tr>
        <td>${esc(o.keyword)}</td>
        <td style="color:#64748b;font-size:9px">${esc(o.domain)}</td>
        <td class="txt-c"><strong class="green">${num(o.score)}</strong></td>
        <td class="txt-c"><span class="pos ${posClass(o.pos)}">${o.pos.toFixed(1)}</span></td>
        <td class="txt-c">${num(o.volume)}</td>
        <td class="txt-c">${num(o.impressions)}</td>
      </tr>`;
    }
    qwTable += '</table></div></div>';
  }

  // Keyword gap table
  let gapTable = '';
  if (keywordGap.length > 0) {
    gapTable = `<div class="card" style="border-left:3px solid #f59e0b"><div class="card-title">Keyword Gap <span class="card-sub">In Ahrefs but NOT in GSC — untapped potential</span></div>
      <div class="tbl-wrap"><table><tr><th>Keyword</th><th>Domain</th><th class="txt-c">Volume</th><th class="txt-c">KD</th></tr>`;
    for (const o of keywordGap) {
      gapTable += `<tr>
        <td>${esc(o.keyword)}</td>
        <td style="color:#64748b;font-size:9px">${esc(o.domain)}</td>
        <td class="txt-c"><strong>${num(o.volume)}</strong></td>
        <td class="txt-c">${o.kd !== null ? o.kd : '-'}</td>
      </tr>`;
    }
    gapTable += '</table></div></div>';
  }

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keyword Opportunities Hub — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon" style="background:linear-gradient(135deg,#06b6d4,#10b981)">K</div>
      <div>
        <h1>Keyword Opportunities Hub</h1>
        <div class="subtitle">GSC + Ahrefs Cross-Analysis • Opportunity Scoring • ${now}</div>
      </div>
    </div>
    <span class="turbo-badge">Example Org</span>
  </div>

  <div class="grid-5">
    <div class="metric-card" style="border-top:3px solid #06b6d4"><div class="metric-val cyan">${num(totalKws)}</div><div class="metric-lbl">Total Keywords</div></div>
    <div class="metric-card" style="border-top:3px solid #10b981"><div class="metric-val green">${num(totalOpps)}</div><div class="metric-lbl">With Score</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${quickWins.length}</div><div class="metric-lbl">Quick Wins</div></div>
    <div class="metric-card" style="border-top:3px solid #a855f7"><div class="metric-val purple">${keywordGap.length}</div><div class="metric-lbl">Gap Keywords</div></div>
    <div class="metric-card" style="border-top:3px solid #3b82f6"><div class="metric-val blue">${DOMAINS.length}</div><div class="metric-lbl">Domains</div></div>
  </div>

  ${domainCards}

  <div class="grid-2" style="margin-top:12px">
    ${bucketChart}
    ${qwTable || '<div class="card"><div class="card-title">Quick Wins</div><p style="color:#64748b">No quick wins data yet. Run keyword snapshot first.</p></div>'}
  </div>

  ${oppsTable}
  ${gapTable}

  <div class="footer">
    Keyword Opportunities Hub &middot; ${now} &middot; Data: GSC + Ahrefs API &middot; Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: { totalKeywords: totalKws, scoredOpportunities: totalOpps, quickWins: quickWins.length, gapKeywords: keywordGap.length },
  };
}

// ============================
// Site Audit Health Dashboard
// ============================
export async function generateSiteAuditDashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const DOMAINS = ['example.com', 'example-dev.com', 'example-qa.com'];
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const domainAudits: any[] = [];

  for (const domain of DOMAINS) {
    const latest = await queryOne<any>(
      'SELECT * FROM ahrefs_audit_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    const previous = await queryOne<any>(
      'SELECT * FROM ahrefs_audit_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1',
      [domain]
    );
    domainAudits.push({ domain, latest, previous });
  }

  const hasData = domainAudits.some(d => d.latest);

  // Health score cards
  let healthCards = '<div class="grid-3">';
  for (const da of domainAudits) {
    const l = da.latest;
    const p = da.previous;
    const score = l?.health_score ?? '-';
    const prevScore = p?.health_score;
    const trend = prevScore != null && score !== '-' ? score - prevScore : null;
    const trendStr = trend !== null ? (trend > 0 ? `<span class="green">+${trend}</span>` : trend < 0 ? `<span class="red">${trend}</span>` : '<span class="green">0</span>') : '';
    const scoreColor = score === '-' ? '#64748b' : score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

    healthCards += `<div class="card" style="text-align:center;border-top:3px solid ${scoreColor}">
      <div class="card-title" style="justify-content:center">${esc(da.domain)}</div>
      <div style="font-size:48px;font-weight:800;color:${scoreColor}">${score}</div>
      <div class="metric-lbl">Health Score ${trendStr}</div>
      <div style="margin-top:8px;display:flex;justify-content:center;gap:16px">
        <div><span class="red" style="font-weight:700">${l?.critical_issues ?? '-'}</span><div class="metric-lbl">Critical</div></div>
        <div><span class="amber" style="font-weight:700">${l?.warning_issues ?? '-'}</span><div class="metric-lbl">Warnings</div></div>
        <div><span style="color:#64748b;font-weight:700">${l?.total_issues ?? '-'}</span><div class="metric-lbl">Total</div></div>
      </div>
    </div>`;
  }
  healthCards += '</div>';

  // Issues detail table (combined from all domains)
  let issuesTable = '';
  const allIssues: any[] = [];
  for (const da of domainAudits) {
    if (!da.latest?.issues) continue;
    const issues = typeof da.latest.issues === 'string' ? JSON.parse(da.latest.issues) : da.latest.issues;
    for (const issue of (Array.isArray(issues) ? issues : [])) {
      allIssues.push({ ...issue, domain: da.domain });
    }
  }

  if (allIssues.length > 0) {
    // Sort: errors first, then warnings, then notices
    const severityOrder: Record<string, number> = { error: 0, warning: 1, notice: 2 };
    allIssues.sort((a, b) => {
      const aS = severityOrder[(a.importance || a.severity || 'notice').toLowerCase()] ?? 2;
      const bS = severityOrder[(b.importance || b.severity || 'notice').toLowerCase()] ?? 2;
      return aS - bS;
    });

    issuesTable = `<div class="card"><div class="card-title">Technical SEO Issues (All Domains)</div>
      <div class="tbl-wrap"><table><tr><th>Issue</th><th>Domain</th><th class="txt-c">Severity</th><th class="txt-c">Affected</th></tr>`;
    for (const issue of allIssues.slice(0, 40)) {
      const sev = (issue.importance || issue.severity || 'notice').toLowerCase();
      const sevColor = sev === 'error' ? '#ef4444' : sev === 'warning' ? '#f59e0b' : '#64748b';
      const affected = issue.crawled || issue.count || issue.urls_count || '-';
      issuesTable += `<tr>
        <td>${esc(issue.name || issue.title || issue.issue || issue.description || '-')}</td>
        <td style="color:#64748b;font-size:9px">${esc(issue.domain)}</td>
        <td class="txt-c"><span style="color:${sevColor};font-weight:600">${sev}</span></td>
        <td class="txt-c"><strong>${affected}</strong></td>
      </tr>`;
    }
    issuesTable += '</table></div></div>';
  }

  // Summary metrics
  const totalCritical = domainAudits.reduce((s, d) => s + (d.latest?.critical_issues || 0), 0);
  const totalWarnings = domainAudits.reduce((s, d) => s + (d.latest?.warning_issues || 0), 0);
  const totalAll = domainAudits.reduce((s, d) => s + (d.latest?.total_issues || 0), 0);
  const avgHealth = domainAudits.filter(d => d.latest?.health_score != null).length > 0
    ? Math.round(domainAudits.filter(d => d.latest?.health_score != null).reduce((s, d) => s + d.latest.health_score, 0) / domainAudits.filter(d => d.latest?.health_score != null).length)
    : 0;

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Audit Health — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon" style="background:linear-gradient(135deg,#ef4444,#f59e0b)">A</div>
      <div>
        <h1>Site Audit Health Dashboard</h1>
        <div class="subtitle">Ahrefs Site Audit • Technical SEO Health • ${now}</div>
      </div>
    </div>
    <span class="turbo-badge">Example Org</span>
  </div>

  <div class="grid-4">
    <div class="metric-card" style="border-top:3px solid #10b981"><div class="metric-val green">${avgHealth || '-'}</div><div class="metric-lbl">Avg Health</div></div>
    <div class="metric-card" style="border-top:3px solid #ef4444"><div class="metric-val red">${totalCritical}</div><div class="metric-lbl">Critical</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${totalWarnings}</div><div class="metric-lbl">Warnings</div></div>
    <div class="metric-card" style="border-top:3px solid #64748b"><div class="metric-val">${totalAll}</div><div class="metric-lbl">Total Issues</div></div>
  </div>

  ${healthCards}

  ${issuesTable || (hasData ? '' : '<div class="card"><p style="color:#64748b;text-align:center;padding:20px">No audit data yet. Audit snapshots will be populated on next monthly run or manual refresh.</p></div>')}

  <div class="footer">
    Site Audit Health Dashboard &middot; ${now} &middot; Data: Ahrefs Site Audit API &middot; Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: { avgHealthScore: avgHealth, criticalIssues: totalCritical, warningIssues: totalWarnings, totalIssues: totalAll },
  };
}

// ============================
// Link Profile Dashboard
// ============================
export async function generateLinkProfileDashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const DOMAINS = ['example.com', 'example-dev.com', 'example-qa.com'];
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const domainLinks: any[] = [];

  for (const domain of DOMAINS) {
    const linkSnap = await queryOne<any>(
      'SELECT * FROM ahrefs_link_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    const ahrefsSnap = await queryOne<any>(
      'SELECT domain_rating, referring_domains, backlinks FROM ahrefs_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [domain]
    );
    domainLinks.push({ domain, linkSnap, ahrefsSnap });
  }

  const hasData = domainLinks.some(d => d.linkSnap || d.ahrefsSnap);

  // Domain overview cards
  let overviewCards = '<div class="grid-3">';
  for (const dl of domainLinks) {
    const dr = dl.ahrefsSnap?.domain_rating || '-';
    const refDom = dl.ahrefsSnap?.referring_domains || '-';
    const bl = dl.ahrefsSnap?.backlinks || '-';
    overviewCards += `<div class="card">
      <div class="card-title">${esc(dl.domain)}</div>
      <div class="grid-3" style="gap:6px">
        <div style="text-align:center"><span class="orange" style="font-weight:800;font-size:18px">${dr}</span><div class="metric-lbl">DR</div></div>
        <div style="text-align:center"><span class="cyan" style="font-weight:800;font-size:18px">${num(refDom)}</span><div class="metric-lbl">Ref. Domains</div></div>
        <div style="text-align:center"><span class="purple" style="font-weight:800;font-size:18px">${num(bl)}</span><div class="metric-lbl">Backlinks</div></div>
      </div>
    </div>`;
  }
  overviewCards += '</div>';

  // Anchor text distribution (primary domain)
  let anchorChart = '';
  const primaryLink = domainLinks.find(d => d.domain === 'example.com')?.linkSnap;
  if (primaryLink?.anchors) {
    const anchors = (typeof primaryLink.anchors === 'string' ? JSON.parse(primaryLink.anchors) : primaryLink.anchors) as any[];
    if (anchors.length > 0) {
      const maxAnch = Math.max(...anchors.slice(0, 15).map((a: any) => Number(a.referring_domains || a.dofollow || a.backlinks || 1)), 1);
      anchorChart = `<div class="card"><div class="card-title">Anchor Text Distribution <span class="ahrefs-badge">example.com</span></div>`;
      for (const a of anchors.slice(0, 15)) {
        const val = Number(a.referring_domains || a.dofollow || a.backlinks || 0);
        const pctV = (val / maxAnch) * 100;
        anchorChart += `<div class="bar-row"><div class="bar-label">${esc((a.anchor || '(empty)').slice(0, 30))}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 5)}%;background:linear-gradient(90deg,#f97316,#ef4444)">${val} ref.dom</div></div></div>`;
      }
      anchorChart += '</div>';
    }
  }

  // Top pages by backlinks (primary domain)
  let pagesTable = '';
  if (primaryLink?.pages_by_backlinks) {
    const pages = (typeof primaryLink.pages_by_backlinks === 'string' ? JSON.parse(primaryLink.pages_by_backlinks) : primaryLink.pages_by_backlinks) as any[];
    if (pages.length > 0) {
      pagesTable = `<div class="card"><div class="card-title">Top Pages by Backlinks <span class="ahrefs-badge">example.com</span></div>
        <div class="tbl-wrap"><table><tr><th>Page</th><th class="txt-c">Backlinks</th><th class="txt-c">Ref. Domains</th></tr>`;
      for (const p of pages.slice(0, 20)) {
        pagesTable += `<tr>
          <td class="url-cell" title="${esc(p.url || p.url_from || '')}">${esc(shortUrl(p.url || p.url_from || ''))}</td>
          <td class="txt-c"><strong>${num(p.backlinks || p.links || 0)}</strong></td>
          <td class="txt-c">${num(p.referring_domains || p.dofollow_refdomains || 0)}</td>
        </tr>`;
      }
      pagesTable += '</table></div></div>';
    }
  }

  // Broken backlinks
  let brokenTable = '';
  const allBroken: any[] = [];
  for (const dl of domainLinks) {
    if (!dl.linkSnap?.broken_backlinks) continue;
    const broken = (typeof dl.linkSnap.broken_backlinks === 'string' ? JSON.parse(dl.linkSnap.broken_backlinks) : dl.linkSnap.broken_backlinks) as any[];
    for (const b of broken) allBroken.push({ ...b, domain: dl.domain });
  }
  if (allBroken.length > 0) {
    brokenTable = `<div class="card" style="border-left:3px solid #ef4444"><div class="card-title"><span class="red">Broken Backlinks</span> <span class="card-sub">${allBroken.length} found</span></div>
      <div class="tbl-wrap"><table><tr><th>Source</th><th>Target</th><th>Domain</th><th class="txt-c">Source DR</th></tr>`;
    for (const b of allBroken.slice(0, 20)) {
      brokenTable += `<tr>
        <td class="url-cell" title="${esc(b.url_from || '')}">${esc(shortUrl(b.url_from || ''))}</td>
        <td class="url-cell" title="${esc(b.url_to || '')}">${esc(shortUrl(b.url_to || ''))}</td>
        <td style="color:#64748b;font-size:9px">${esc(b.domain)}</td>
        <td class="txt-c"><span class="pos pos-2">${b.domain_rating_source || b.dr_source || '-'}</span></td>
      </tr>`;
    }
    brokenTable += '</table></div></div>';
  }

  // Referring domains table (primary)
  let refDomsTable = '';
  if (primaryLink?.referring_domains) {
    const refDoms = (typeof primaryLink.referring_domains === 'string' ? JSON.parse(primaryLink.referring_domains) : primaryLink.referring_domains) as any[];
    if (refDoms.length > 0) {
      refDomsTable = `<div class="card"><div class="card-title">Referring Domains <span class="ahrefs-badge">example.com</span></div>
        <div class="tbl-wrap"><table><tr><th>Domain</th><th class="txt-c">DR</th><th class="txt-c">Backlinks</th><th class="txt-c">First Seen</th></tr>`;
      for (const r of refDoms.slice(0, 20)) {
        refDomsTable += `<tr>
          <td>${esc(r.domain_from || r.domain || '')}</td>
          <td class="txt-c"><span class="pos pos-2">${r.domain_rating || r.dr || '-'}</span></td>
          <td class="txt-c">${num(r.backlinks || r.links_to_target || 0)}</td>
          <td class="txt-c" style="color:#64748b">${r.first_seen ? r.first_seen.slice(0, 10) : '-'}</td>
        </tr>`;
      }
      refDomsTable += '</table></div></div>';
    }
  }

  // Compute totals from link_snapshots (referring_domains array length) and ahrefs_snapshots fallback
  const totalRefDom = domainLinks.reduce((s, d) => {
    const fromLink = d.linkSnap?.referring_domains;
    const arr = fromLink ? (typeof fromLink === 'string' ? JSON.parse(fromLink) : fromLink) : [];
    return s + (Array.isArray(arr) && arr.length > 0 ? arr.length : Number(d.ahrefsSnap?.referring_domains || 0));
  }, 0);
  const totalBL = domainLinks.reduce((s, d) => {
    const fromPages = d.linkSnap?.pages_by_backlinks;
    const arr = fromPages ? (typeof fromPages === 'string' ? JSON.parse(fromPages) : fromPages) : [];
    // Sum backlinks from pages_by_backlinks, fallback to ahrefs_snapshots
    if (Array.isArray(arr) && arr.length > 0) {
      return s + arr.reduce((sum: number, p: any) => sum + Number(p.links_to_target || p.backlinks || p.dofollow || 0), 0);
    }
    return s + Number(d.ahrefsSnap?.backlinks || 0);
  }, 0);

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Profile Dashboard — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon" style="background:linear-gradient(135deg,#f97316,#a855f7)">L</div>
      <div>
        <h1>Link Profile & Opportunities</h1>
        <div class="subtitle">Ahrefs Backlink Analysis • Referring Domains • Anchor Distribution • ${now}</div>
      </div>
    </div>
    <span class="turbo-badge">Example Org</span>
  </div>

  <div class="grid-4">
    <div class="metric-card" style="border-top:3px solid #f97316"><div class="metric-val orange">${num(totalRefDom)}</div><div class="metric-lbl">Ref. Domains</div></div>
    <div class="metric-card" style="border-top:3px solid #a855f7"><div class="metric-val purple">${num(totalBL)}</div><div class="metric-lbl">Backlinks</div></div>
    <div class="metric-card" style="border-top:3px solid #ef4444"><div class="metric-val red">${allBroken.length}</div><div class="metric-lbl">Broken Links</div></div>
    <div class="metric-card" style="border-top:3px solid #3b82f6"><div class="metric-val blue">${DOMAINS.length}</div><div class="metric-lbl">Domains</div></div>
  </div>

  ${overviewCards}

  <div class="grid-2" style="margin-top:12px">
    ${anchorChart || '<div class="card"><div class="card-title">Anchor Distribution</div><p style="color:#64748b">No anchor data yet.</p></div>'}
    ${pagesTable || '<div class="card"><div class="card-title">Pages by Backlinks</div><p style="color:#64748b">No page data yet.</p></div>'}
  </div>

  ${brokenTable}
  ${refDomsTable}

  ${!hasData ? '<div class="card"><p style="color:#64748b;text-align:center;padding:20px">No link data yet. Link snapshots will be populated on next monthly run or manual refresh.</p></div>' : ''}

  <div class="footer">
    Link Profile Dashboard &middot; ${now} &middot; Data: Ahrefs API &middot; Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: { totalReferringDomains: totalRefDom, totalBacklinks: totalBL, brokenBacklinks: allBroken.length },
  };
}

// ============================
// Visibility & Performance Dashboard
// ============================
export async function generateVisibilityDashboard(): Promise<{ html: string; summary: DashboardSummary }> {
  const DOMAINS = ['example.com', 'example-dev.com', 'example-qa.com'];
  const now = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });

  const domainVis: any[] = [];

  for (const domain of DOMAINS) {
    // GSC latest + previous
    const gscLatest = await queryOne<any>(
      'SELECT * FROM gsc_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1', [domain]
    );
    const gscPrev = await queryOne<any>(
      'SELECT * FROM gsc_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1 OFFSET 1', [domain]
    );

    // Ahrefs DR history
    const drHistory = await query(
      'SELECT snapshot_date, domain_rating FROM ahrefs_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 12', [domain]
    );

    // Keyword snapshot (position distribution)
    const kwSnap = await queryOne<any>(
      'SELECT keywords, keyword_count FROM ahrefs_keyword_snapshots WHERE domain = $1 ORDER BY snapshot_date DESC LIMIT 1', [domain]
    );

    // GSC snapshot file for full keyword positions
    const domainSlug = domain.replace(/\./g, '-');
    let gscRows: any[] = [];
    if (fs.existsSync(REPORTS_DIR)) {
      const gscFiles = fs.readdirSync(REPORTS_DIR).filter(f => f.startsWith(`gsc_snapshot_${domainSlug}`) && f.endsWith('.json')).sort((a, b) => b.localeCompare(a));
      if (gscFiles.length > 0) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, gscFiles[0]), 'utf8'));
          gscRows = raw.rows || [];
        } catch {}
      }
    }

    // Visibility index: sum of 1/position for all GSC keywords
    let visIndex = 0;
    const buckets = { '1-3': 0, '4-10': 0, '11-20': 0, '21-50': 0, '51-100': 0 };
    for (const r of gscRows) {
      const pos = r.position || 0;
      if (pos > 0 && pos <= 100) {
        visIndex += 1 / pos;
        if (pos <= 3) buckets['1-3']++;
        else if (pos <= 10) buckets['4-10']++;
        else if (pos <= 20) buckets['11-20']++;
        else if (pos <= 50) buckets['21-50']++;
        else buckets['51-100']++;
      }
    }

    domainVis.push({
      domain, gscLatest, gscPrev, drHistory: drHistory.reverse(), kwSnap, gscRows,
      visIndex: Math.round(visIndex * 100) / 100, buckets,
    });
  }

  // Top movers (biggest position changes for primary domain)
  let moversTable = '';
  const primary = domainVis.find(d => d.domain === 'example.com');
  if (primary && primary.gscRows.length > 0 && primary.gscPrev?.top_queries) {
    const prevQueries: Record<string, number> = {};
    const pq = typeof primary.gscPrev.top_queries === 'string' ? JSON.parse(primary.gscPrev.top_queries) : primary.gscPrev.top_queries;
    for (const q of (Array.isArray(pq) ? pq : [])) {
      const kw = (q.query || q.keys?.[0] || '').toLowerCase().trim();
      if (kw) prevQueries[kw] = q.position || 0;
    }

    const movers: any[] = [];
    for (const r of primary.gscRows) {
      const kw = (r.keys?.[0] || r.query || '').toLowerCase().trim();
      const currPos = r.position || 0;
      const prevPos = prevQueries[kw];
      if (prevPos && currPos > 0) {
        const change = prevPos - currPos; // positive = improved
        if (Math.abs(change) >= 1) {
          movers.push({ keyword: kw, currPos, prevPos, change, clicks: r.clicks || 0, impressions: r.impressions || 0 });
        }
      }
    }

    movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    if (movers.length > 0) {
      const gainers = movers.filter(m => m.change > 0).slice(0, 10);
      const losers = movers.filter(m => m.change < 0).slice(0, 10);

      if (gainers.length > 0) {
        moversTable += `<div class="card" style="border-left:3px solid #10b981"><div class="card-title"><span class="green">Biggest Gains</span> <span class="card-sub">example.com</span></div>
          <div class="tbl-wrap"><table><tr><th>Keyword</th><th class="txt-c">Now</th><th class="txt-c">Before</th><th class="txt-c">Change</th><th class="txt-c">Clicks</th></tr>`;
        for (const m of gainers) {
          moversTable += `<tr>
            <td>${esc(m.keyword)}</td>
            <td class="txt-c"><span class="pos ${posClass(m.currPos)}">${m.currPos.toFixed(1)}</span></td>
            <td class="txt-c" style="color:#64748b">${m.prevPos.toFixed(1)}</td>
            <td class="txt-c"><strong class="green">+${m.change.toFixed(1)}</strong></td>
            <td class="txt-c">${num(m.clicks)}</td>
          </tr>`;
        }
        moversTable += '</table></div></div>';
      }

      if (losers.length > 0) {
        moversTable += `<div class="card" style="border-left:3px solid #ef4444"><div class="card-title"><span class="red">Biggest Losses</span> <span class="card-sub">example.com</span></div>
          <div class="tbl-wrap"><table><tr><th>Keyword</th><th class="txt-c">Now</th><th class="txt-c">Before</th><th class="txt-c">Change</th><th class="txt-c">Clicks</th></tr>`;
        for (const m of losers) {
          moversTable += `<tr>
            <td>${esc(m.keyword)}</td>
            <td class="txt-c"><span class="pos ${posClass(m.currPos)}">${m.currPos.toFixed(1)}</span></td>
            <td class="txt-c" style="color:#64748b">${m.prevPos.toFixed(1)}</td>
            <td class="txt-c"><strong class="red">${m.change.toFixed(1)}</strong></td>
            <td class="txt-c">${num(m.clicks)}</td>
          </tr>`;
        }
        moversTable += '</table></div></div>';
      }
    }
  }

  // Domain visibility cards
  let visCards = '<div class="grid-3">';
  for (const dv of domainVis) {
    const clicks = Number(dv.gscLatest?.total_clicks || 0);
    const prevClicks = Number(dv.gscPrev?.total_clicks || 0);
    const clickChange = prevClicks > 0 ? Math.round(((clicks - prevClicks) / prevClicks) * 100) : 0;
    const changeStr = clickChange > 0 ? `<span class="green">+${clickChange}%</span>` : clickChange < 0 ? `<span class="red">${clickChange}%</span>` : '';
    const dr = dv.drHistory.length > 0 ? dv.drHistory[dv.drHistory.length - 1]?.domain_rating : '-';

    visCards += `<div class="card">
      <div class="card-title">${esc(dv.domain)}</div>
      <div class="grid-2" style="gap:6px">
        <div style="text-align:center"><span class="cyan" style="font-weight:800;font-size:18px">${num(clicks)}</span><div class="metric-lbl">Clicks ${changeStr}</div></div>
        <div style="text-align:center"><span class="amber" style="font-weight:800;font-size:18px">${dv.visIndex}</span><div class="metric-lbl">Visibility Index</div></div>
        <div style="text-align:center"><span class="orange" style="font-weight:800;font-size:18px">${dr || '-'}</span><div class="metric-lbl">DR</div></div>
        <div style="text-align:center"><span class="purple" style="font-weight:800;font-size:18px">${num(Number(dv.gscLatest?.total_queries || 0))}</span><div class="metric-lbl">Queries</div></div>
      </div>
    </div>`;
  }
  visCards += '</div>';

  // Position distribution chart (primary domain)
  let posDist = '';
  if (primary) {
    const bucketColors: Record<string, string> = { '1-3': '#10b981', '4-10': '#06b6d4', '11-20': '#f59e0b', '21-50': '#f97316', '51-100': '#ef4444' };
    const maxB = Math.max(...(Object.values(primary.buckets) as number[]), 1);
    posDist = `<div class="card"><div class="card-title">Position Distribution <span class="gsc-badge">example.com</span></div>`;
    for (const [label, count] of Object.entries(primary.buckets)) {
      const pctV = ((count as number) / maxB) * 100;
      posDist += `<div class="bar-row"><div class="bar-label">Pos ${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pctV, 5)}%;background:${bucketColors[label] || '#64748b'}">${count}</div></div></div>`;
    }
    posDist += '</div>';
  }

  // DR history chart (primary domain)
  let drChart = '';
  if (primary && primary.drHistory.length > 1) {
    const maxDR = Math.max(...primary.drHistory.map((d: any) => Number(d.domain_rating || 0)), 1);
    drChart = `<div class="card"><div class="card-title">Domain Rating Trend <span class="ahrefs-badge">example.com</span></div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:80px">`;
    for (const d of primary.drHistory) {
      const val = Number(d.domain_rating || 0);
      const pctH = (val / (maxDR + 5)) * 100;
      const dateStr = d.snapshot_date ? new Date(d.snapshot_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : '';
      drChart += `<div style="flex:1;background:linear-gradient(180deg,#f97316,#ef4444);border-radius:3px 3px 0 0;height:${pctH}%;min-height:4px" title="${dateStr}: DR ${val}"></div>`;
    }
    drChart += `</div><div style="display:flex;justify-content:space-between;font-size:8px;color:#64748b;margin-top:4px">
      <span>${primary.drHistory[0]?.snapshot_date ? new Date(primary.drHistory[0].snapshot_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}</span>
      <span>DR ${primary.drHistory[primary.drHistory.length - 1]?.domain_rating || '-'}</span>
    </div></div>`;
  }

  const totalVis = domainVis.reduce((s, d) => s + d.visIndex, 0);
  const totalClicks = domainVis.reduce((s, d) => s + Number(d.gscLatest?.total_clicks || 0), 0);
  const totalImpr = domainVis.reduce((s, d) => s + Number(d.gscLatest?.total_impressions || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visibility & Performance — ${now} — Team Brain</title>
  ${TURBO_CSS}
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <div class="logo-icon" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6)">V</div>
      <div>
        <h1>Visibility & Performance</h1>
        <div class="subtitle">GSC + Ahrefs • Position Distribution • Keyword Movers • ${now}</div>
      </div>
    </div>
    <span class="turbo-badge">Example Org</span>
  </div>

  <div class="grid-4">
    <div class="metric-card" style="border-top:3px solid #06b6d4"><div class="metric-val cyan">${num(totalClicks)}</div><div class="metric-lbl">Total Clicks</div></div>
    <div class="metric-card" style="border-top:3px solid #8b5cf6"><div class="metric-val purple">${num(totalImpr)}</div><div class="metric-lbl">Impressions</div></div>
    <div class="metric-card" style="border-top:3px solid #f59e0b"><div class="metric-val amber">${totalVis.toFixed(1)}</div><div class="metric-lbl">Visibility Index</div></div>
    <div class="metric-card" style="border-top:3px solid #3b82f6"><div class="metric-val blue">${DOMAINS.length}</div><div class="metric-lbl">Domains</div></div>
  </div>

  ${visCards}

  <div class="grid-2" style="margin-top:12px">
    ${posDist || ''}
    ${drChart || ''}
  </div>

  ${moversTable}

  <div class="footer">
    Visibility & Performance Dashboard &middot; ${now} &middot; Data: GSC + Ahrefs API &middot; Team Brain v1.8
  </div>
</div>
</body>
</html>`;

  return {
    html,
    summary: { totalClicks, totalImpressions: totalImpr, visibilityIndex: totalVis, domains: DOMAINS.length },
  };
}
