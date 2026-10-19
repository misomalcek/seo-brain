/**
 * GSC API Service — Direct service account authentication to Google Search Console API.
 * Uses JWT (JSON Web Token) with service account private key.
 *
 * Service account: /opt/team-brain/credentials/gsc-service-account.json
 * Replaces OAuth flow - simpler, no token refresh needed, works for all authorized domains.
 */

import fs from 'fs';
import crypto from 'crypto';

const SERVICE_ACCOUNT_FILE = '/opt/team-brain/credentials/gsc-service-account.json';
const GSC_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface TokenCache {
  access_token: string;
  expires_at: number;
}

let serviceAccount: ServiceAccount | null = null;
let tokenCache: TokenCache | null = null;

function loadServiceAccount(): ServiceAccount {
  if (!serviceAccount) {
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      throw new Error(`Service account file not found: ${SERVICE_ACCOUNT_FILE}`);
    }
    const raw = fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf-8');
    serviceAccount = JSON.parse(raw);
  }
  return serviceAccount!;
}

/**
 * Create JWT assertion for service account authentication
 */
function createJWT(): string {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const payload = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600, // 1 hour
    iat: now
  };

  const base64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const unsignedToken = `${base64url(header)}.${base64url(payload)}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  sign.end();

  const signature = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${signature}`;
}

/**
 * Exchange JWT for access token
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expires_at > now + 60000) {
    return tokenCache.access_token;
  }

  const jwt = createJWT();

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Service account auth failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  tokenCache = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in * 1000)
  };

  return data.access_token;
}

async function gscFetch(endpoint: string, body?: object): Promise<unknown> {
  const token = await getAccessToken();

  const response = await fetch(`${GSC_BASE}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC API error (${response.status}): ${text}`);
  }

  return response.json();
}

// ==================== PUBLIC API ====================

export async function listSites(): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const data = await gscFetch('/sites') as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return data.siteEntry || [];
}

export async function searchAnalytics(params: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: unknown[];
}): Promise<{ rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>; totalRows?: number }> {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(now.getDate() - 2); // GSC has 2-3 day delay
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 28);

  // Hard cap rowLimit per-request (GSC API max is 25000, but we cap at 5000 for safety)
  const safeRowLimit = Math.min(params.rowLimit || 250, 5000);

  const body: Record<string, unknown> = {
    startDate: params.startDate || defaultStart.toISOString().split('T')[0],
    endDate: params.endDate || defaultEnd.toISOString().split('T')[0],
    dimensions: params.dimensions || ['query'],
    rowLimit: safeRowLimit,
    dimensionFilterGroups: params.dimensionFilterGroups || []
  };

  // GSC API supports startRow for pagination (0-based)
  if (params.startRow && params.startRow > 0) {
    body.startRow = params.startRow;
  }

  const data = await gscFetch(`/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`, body) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    responseAggregationType?: string;
  };

  return { rows: data.rows || [] };
}

/**
 * Fetch ALL rows with automatic pagination (for exports).
 * Returns up to maxRows (default 5000) by paginating in batches of 1000.
 */
export async function searchAnalyticsAll(params: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  maxRows?: number;
  dimensionFilterGroups?: unknown[];
}): Promise<{ rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>; totalFetched: number; batches: number }> {
  const maxRows = params.maxRows || 5000;
  const batchSize = 1000;
  const allRows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = [];
  let batches = 0;

  while (allRows.length < maxRows) {
    batches++;
    const result = await searchAnalytics({
      ...params,
      rowLimit: Math.min(batchSize, maxRows - allRows.length),
      startRow: allRows.length,
    });

    if (!result.rows.length) break; // No more data
    allRows.push(...result.rows);

    // If we got fewer than batchSize, we've reached the end
    if (result.rows.length < batchSize) break;
  }

  return { rows: allRows, totalFetched: allRows.length, batches };
}

export interface QuickWinsParams {
  siteUrl: string;
  minPosition?: number;   // default 4
  maxPosition?: number;   // default 20
  minImpressions?: number; // default 10 (backward compat)
  minClicks?: number;     // default 0
  limit?: number;         // default 200, max 1000
  sort?: 'position' | 'impressions' | 'clicks'; // default 'position'
}

export async function quickWins(params: QuickWinsParams | string): Promise<{
  opportunities: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number; potential: string }>;
  total_found: number;
  summary: { high_potential: number; medium_potential: number; total_impressions: number; total_clicks: number };
  applied_params: { min_position: number; max_position: number; min_impressions: number; min_clicks: number; limit: number; sort: string };
}> {
  // Backward compat: accept string siteUrl or params object
  const p: QuickWinsParams = typeof params === 'string' ? { siteUrl: params } : params;
  const minPosition = p.minPosition ?? 4;
  const maxPosition = p.maxPosition ?? 20;
  const minImpressions = p.minImpressions ?? 10;
  const minClicks = p.minClicks ?? 0;
  const limit = Math.min(p.limit ?? 200, 1000);  // hard cap 1000
  const sortBy = p.sort ?? 'position';

  // Overfetch raw rows so filtering leaves enough candidates.
  // GSC rowLimit cap is 5000 per call. Target: 3x limit or at least 500.
  const rowLimit = Math.min(5000, Math.max(500, limit * 3));

  // Filter out branded queries (msg, example) — keep this default
  const filterGroups = [
    {
      filters: [
        { dimension: 'query', operator: 'notContains', expression: 'msg' },
        { dimension: 'query', operator: 'notContains', expression: 'example' }
      ]
    }
  ];

  const result = await searchAnalytics({
    siteUrl: p.siteUrl,
    dimensions: ['query'],
    rowLimit,
    dimensionFilterGroups: filterGroups
  });

  // Filter by user-supplied thresholds
  const filtered = result.rows
    .filter(row =>
      row.position >= minPosition &&
      row.position <= maxPosition &&
      row.impressions >= minImpressions &&
      row.clicks >= minClicks
    )
    .map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      potential: row.position <= 10 ? 'high' : 'medium'
    }));

  // Sort by requested column
  const sorters: Record<string, (a: any, b: any) => number> = {
    position: (a, b) => a.position - b.position,
    impressions: (a, b) => b.impressions - a.impressions,
    clicks: (a, b) => b.clicks - a.clicks,
  };
  const sorter = sorters[sortBy] ?? sorters.position;
  filtered.sort(sorter);

  const opportunities = filtered.slice(0, limit);
  const high_potential = filtered.filter(o => o.potential === 'high').length;
  const medium_potential = filtered.filter(o => o.potential === 'medium').length;
  const total_impressions = filtered.reduce((sum, o) => sum + o.impressions, 0);
  const total_clicks = filtered.reduce((sum, o) => sum + o.clicks, 0);

  return {
    opportunities,
    total_found: filtered.length,  // total across all filtered, not just returned slice
    summary: { high_potential, medium_potential, total_impressions, total_clicks },
    applied_params: {
      min_position: minPosition,
      max_position: maxPosition,
      min_impressions: minImpressions,
      min_clicks: minClicks,
      limit,
      sort: sortBy,
    },
  };
}

// ==================== PERIOD COMPARISON ====================

export interface ComparePeriodsParams {
  siteUrl: string;
  period1: { startDate: string; endDate: string; label?: string }; // baseline (earlier)
  period2: { startDate: string; endDate: string; label?: string }; // current (later)
  dimension?: 'query' | 'page';       // default 'query'
  minImpressions?: number;             // default 50, filters noise from either period
  minChangeThreshold?: number;         // default 0; if >0, only returns rows with position change ≥ threshold OR click_change_pct abs ≥ threshold
  limit?: number;                      // default 100, max 500
  rowLimit?: number;                   // per-period underlying fetch (default 5000)
}

type DiffDirection = 'improved' | 'declined' | 'stable' | 'new' | 'lost';
type DiffSeverity = 'low' | 'medium' | 'high';

export interface PeriodDiffRow {
  key: string;
  period1: { clicks: number; impressions: number; ctr: number; position: number } | null;
  period2: { clicks: number; impressions: number; ctr: number; position: number } | null;
  direction: DiffDirection;
  pos_change: number | null;            // period2.position - period1.position; positive = worse, negative = better
  click_change_abs: number;
  click_change_pct: number | null;      // null if period1 clicks = 0
  impressions_change_abs: number;
  impressions_change_pct: number | null;
  severity: DiffSeverity;
}

export async function comparePeriods(params: ComparePeriodsParams): Promise<{
  period1_meta: { startDate: string; endDate: string; label?: string; row_count: number; total_clicks: number; total_impressions: number };
  period2_meta: { startDate: string; endDate: string; label?: string; row_count: number; total_clicks: number; total_impressions: number };
  diff: PeriodDiffRow[];
  summary: {
    total: number;
    improved: number;
    declined: number;
    stable: number;
    new: number;
    lost: number;
    total_clicks_change: number;
    total_impressions_change: number;
  };
  applied_params: Record<string, any>;
}> {
  const dimension = params.dimension ?? 'query';
  const minImpressions = params.minImpressions ?? 50;
  const minChangeThreshold = params.minChangeThreshold ?? 0;
  const limit = Math.min(params.limit ?? 100, 500);
  const rowLimit = Math.min(params.rowLimit ?? 5000, 5000);

  // Fetch both periods in parallel
  const [result1, result2] = await Promise.all([
    searchAnalytics({
      siteUrl: params.siteUrl,
      dimensions: [dimension],
      rowLimit,
      startDate: params.period1.startDate,
      endDate: params.period1.endDate,
    }),
    searchAnalytics({
      siteUrl: params.siteUrl,
      dimensions: [dimension],
      rowLimit,
      startDate: params.period2.startDate,
      endDate: params.period2.endDate,
    }),
  ]);

  // Build maps keyed by dimension value
  const map1 = new Map(result1.rows.map(r => [r.keys[0], r]));
  const map2 = new Map(result2.rows.map(r => [r.keys[0], r]));
  const allKeys = new Set([...map1.keys(), ...map2.keys()]);

  const diff: PeriodDiffRow[] = [];
  for (const key of allKeys) {
    const r1 = map1.get(key);
    const r2 = map2.get(key);

    // Filter out low-impression noise from whichever period has data
    const maxImpressions = Math.max(r1?.impressions ?? 0, r2?.impressions ?? 0);
    if (maxImpressions < minImpressions) continue;

    let direction: DiffDirection;
    let pos_change: number | null = null;
    let click_change_abs = 0;
    let click_change_pct: number | null = null;
    let impressions_change_abs = 0;
    let impressions_change_pct: number | null = null;

    if (!r1 && r2) {
      direction = 'new';
      click_change_abs = r2.clicks;
      impressions_change_abs = r2.impressions;
    } else if (r1 && !r2) {
      direction = 'lost';
      click_change_abs = -r1.clicks;
      impressions_change_abs = -r1.impressions;
    } else if (r1 && r2) {
      pos_change = r2.position - r1.position;   // positive = worse, negative = better
      click_change_abs = r2.clicks - r1.clicks;
      click_change_pct = r1.clicks > 0 ? (click_change_abs / r1.clicks) * 100 : null;
      impressions_change_abs = r2.impressions - r1.impressions;
      impressions_change_pct = r1.impressions > 0 ? (impressions_change_abs / r1.impressions) * 100 : null;

      // Direction: improved if position decreased meaningfully OR clicks grew >20%; declined if worse
      const clickPctAbs = Math.abs(click_change_pct ?? 0);
      if (pos_change <= -1 || (click_change_pct !== null && click_change_pct > 20)) {
        direction = 'improved';
      } else if (pos_change >= 1 || (click_change_pct !== null && click_change_pct < -20)) {
        direction = 'declined';
      } else {
        direction = 'stable';
      }
    } else {
      continue; // should not happen
    }

    // Apply minChangeThreshold filter
    if (minChangeThreshold > 0) {
      const posAbs = Math.abs(pos_change ?? 0);
      const clickPctAbs = Math.abs(click_change_pct ?? 0);
      if (direction !== 'new' && direction !== 'lost' && posAbs < minChangeThreshold && clickPctAbs < minChangeThreshold) {
        continue;
      }
    }

    // Severity: high if |pos_change|>=5 OR |click_pct|>=50, medium if >=2 / >=20, else low
    let severity: DiffSeverity = 'low';
    const posAbs = Math.abs(pos_change ?? 0);
    const clickPctAbs = Math.abs(click_change_pct ?? 0);
    if (posAbs >= 5 || clickPctAbs >= 50 || direction === 'new' || direction === 'lost') severity = 'high';
    else if (posAbs >= 2 || clickPctAbs >= 20) severity = 'medium';

    diff.push({
      key,
      period1: r1 ? { clicks: r1.clicks, impressions: r1.impressions, ctr: r1.ctr, position: r1.position } : null,
      period2: r2 ? { clicks: r2.clicks, impressions: r2.impressions, ctr: r2.ctr, position: r2.position } : null,
      direction,
      pos_change,
      click_change_abs,
      click_change_pct,
      impressions_change_abs,
      impressions_change_pct,
      severity,
    });
  }

  // Sort by severity + magnitude — high severity declined first, then improved, etc.
  const severityRank: Record<DiffSeverity, number> = { high: 0, medium: 1, low: 2 };
  const directionRank: Record<DiffDirection, number> = { declined: 0, lost: 1, new: 2, improved: 3, stable: 4 };
  diff.sort((a, b) => {
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const dirDiff = directionRank[a.direction] - directionRank[b.direction];
    if (dirDiff !== 0) return dirDiff;
    // Tie-break by click_change_abs magnitude
    return Math.abs(b.click_change_abs) - Math.abs(a.click_change_abs);
  });

  const diffSliced = diff.slice(0, limit);

  const total_clicks_1 = result1.rows.reduce((sum, r) => sum + r.clicks, 0);
  const total_impressions_1 = result1.rows.reduce((sum, r) => sum + r.impressions, 0);
  const total_clicks_2 = result2.rows.reduce((sum, r) => sum + r.clicks, 0);
  const total_impressions_2 = result2.rows.reduce((sum, r) => sum + r.impressions, 0);

  return {
    period1_meta: {
      startDate: params.period1.startDate,
      endDate: params.period1.endDate,
      label: params.period1.label,
      row_count: result1.rows.length,
      total_clicks: total_clicks_1,
      total_impressions: total_impressions_1,
    },
    period2_meta: {
      startDate: params.period2.startDate,
      endDate: params.period2.endDate,
      label: params.period2.label,
      row_count: result2.rows.length,
      total_clicks: total_clicks_2,
      total_impressions: total_impressions_2,
    },
    diff: diffSliced,
    summary: {
      total: diff.length,  // total after impressions+change filters, before limit slice
      improved: diff.filter(d => d.direction === 'improved').length,
      declined: diff.filter(d => d.direction === 'declined').length,
      stable: diff.filter(d => d.direction === 'stable').length,
      new: diff.filter(d => d.direction === 'new').length,
      lost: diff.filter(d => d.direction === 'lost').length,
      total_clicks_change: total_clicks_2 - total_clicks_1,
      total_impressions_change: total_impressions_2 - total_impressions_1,
    },
    applied_params: {
      dimension,
      minImpressions,
      minChangeThreshold,
      limit,
      rowLimit,
    },
  };
}

// ==================== TECH SEO API ====================

const URL_INSPECTION_BASE = 'https://searchconsole.googleapis.com/v1';

export async function inspectUrl(siteUrl: string, inspectionUrl: string): Promise<{
  inspectionResultLink: string;
  indexStatusResult: {
    coverageState: string;
    robotsTxtState: string;
    indexingState: string;
    lastCrawlTime?: string;
    pageFetchState: string;
    crawledAs?: string;
    verdict: string;
  };
  mobileUsabilityResult?: {
    verdict: string;
    issues?: Array<{ issueType: string; severity: string; message: string }>;
  };
  richResultsResult?: {
    verdict: string;
    detectedItems?: Array<{ richResultType: string }>;
  };
}> {
  const token = await getAccessToken();

  const response = await fetch(`${URL_INSPECTION_BASE}/urlInspection/index:inspect`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`URL Inspection API error (${response.status}): ${text}`);
  }

  const data = await response.json() as { inspectionResult: any };
  return data.inspectionResult;
}

export async function listSitemaps(siteUrl: string): Promise<Array<{
  path: string;
  lastSubmitted?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  type: string;
  lastDownloaded?: string;
  warnings?: number;
  errors?: number;
  contents?: Array<{ type: string; submitted?: number; indexed?: number }>;
}>> {
  const data = await gscFetch(`/sites/${encodeURIComponent(siteUrl)}/sitemaps`) as {
    sitemap?: Array<any>;
  };
  return data.sitemap || [];
}

// CrUX API — Chrome User Experience Report (free, API key auth)
const CRUX_API_BASE = 'https://chromeuxreport.googleapis.com/v1';

export async function getCoreWebVitals(origin: string): Promise<{
  lcp?: { p75: number; category: string };
  fid?: { p75: number; category: string };
  cls?: { p75: number; category: string };
  inp?: { p75: number; category: string };
  ttfb?: { p75: number; category: string };
  formFactor?: string;
  collectionPeriod?: { firstDate: string; lastDate: string };
}> {
  const apiKey = process.env.CRUX_API_KEY;
  const url = apiKey
    ? `${CRUX_API_BASE}/records:queryRecord?key=${apiKey}`
    : `${CRUX_API_BASE}/records:queryRecord`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: origin.startsWith('http') ? origin : `https://${origin}`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) {
      return { lcp: undefined, cls: undefined, inp: undefined };
    }
    throw new Error(`CrUX API error (${response.status}): ${text}`);
  }

  const data = await response.json() as { record?: any };
  const metrics = data.record?.metrics || {};
  const period = data.record?.collectionPeriod;

  const parseMetric = (m: any) => {
    if (!m) return undefined;
    const p75 = m.percentiles?.p75;
    const hist = m.histogram || [];
    // Good/Needs Improvement/Poor based on density
    const goodDensity = hist[0]?.density || 0;
    const category = goodDensity >= 0.75 ? 'good' : goodDensity >= 0.5 ? 'needs_improvement' : 'poor';
    return { p75, category };
  };

  return {
    lcp: parseMetric(metrics.largest_contentful_paint),
    fid: parseMetric(metrics.first_input_delay),
    cls: parseMetric(metrics.cumulative_layout_shift),
    inp: parseMetric(metrics.interaction_to_next_paint),
    ttfb: parseMetric(metrics.experimental_time_to_first_byte),
    formFactor: data.record?.key?.formFactor,
    collectionPeriod: period ? {
      firstDate: `${period.firstDate.year}-${String(period.firstDate.month).padStart(2, '0')}-${String(period.firstDate.day).padStart(2, '0')}`,
      lastDate: `${period.lastDate.year}-${String(period.lastDate.month).padStart(2, '0')}-${String(period.lastDate.day).padStart(2, '0')}`,
    } : undefined,
  };
}
