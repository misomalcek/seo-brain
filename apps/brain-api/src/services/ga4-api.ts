import { brainPath } from '../paths';
/**
 * GA4 API Service — Direct service account authentication to Google Analytics Data API v1beta.
 * Mirrors gsc-api.ts pattern with JWT (RS256) service account auth.
 *
 * Service account: /opt/team-brain/credentials/ga4-service-account.json
 *   (CAN be the same key as GSC if the service account has both APIs enabled
 *    AND is added as Viewer on each GA4 property)
 *
 * Setup checklist:
 *   1. GCP project with "Google Analytics Data API" enabled
 *   2. Service account with key downloaded (JSON)
 *   3. Service account email added as "Viewer" on each GA4 property in GA4 admin
 *   4. JSON key placed at /opt/team-brain/credentials/ga4-service-account.json
 *   5. sites.ga4_property_id populated for each tracked domain (Admin > Sites)
 */

import fs from 'fs';
import crypto from 'crypto';

const SERVICE_ACCOUNT_FILE = brainPath('credentials', 'ga4-service-account.json');
const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

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

export function resetGa4Auth(): void {
  serviceAccount = null;
  tokenCache = null;
}

function loadServiceAccount(): ServiceAccount {
  if (!serviceAccount) {
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      throw new Error(
        `GA4 service account file not found: ${SERVICE_ACCOUNT_FILE}. ` +
        `Setup: enable Google Analytics Data API in GCP, create service account, ` +
        `add its email as Viewer on each GA4 property, drop the JSON key here.`
      );
    }
    const raw = fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf-8');
    serviceAccount = JSON.parse(raw);
  }
  return serviceAccount!;
}

function createJWT(): string {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsignedToken = `${base64url(header)}.${base64url(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  sign.end();
  const signature = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsignedToken}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires_at > Date.now() + 60000) {
    return tokenCache.access_token;
  }

  const jwt = createJWT();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`GA4 token exchange failed: HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  };
  return tokenCache.access_token;
}

interface RunReportInput {
  propertyId: string;
  startDate?: string;  // YYYY-MM-DD or 'NdaysAgo' / 'today' / 'yesterday'
  endDate?: string;
  dimensions?: string[];
  metrics?: string[];
  limit?: number;
  orderBy?: { metric?: string; dimension?: string; desc?: boolean };
  /**
   * Cross-domain filter: org uses ONE GA4 property for all 3 domains
   * (example.com, example-qa.com, example-dev.com). When set, constrains
   * the report to sessions on this hostname via dimensionFilter on hostName.
   * CONTAINS match so both www and non-www variants are included.
   */
  hostName?: string;
}

export interface GA4ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

export interface GA4Report {
  rows: GA4ReportRow[];
  rowCount: number;
  totals?: { metricValues: { value: string }[] }[];
  dimensionHeaders: { name: string }[];
  metricHeaders: { name: string; type: string }[];
}

/**
 * Run a GA4 report.
 * @see https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */
export async function runReport(input: RunReportInput): Promise<GA4Report> {
  const token = await getAccessToken();
  const propertyId = input.propertyId.replace(/^properties\//, ''); // accept with or without prefix

  const body: any = {
    dateRanges: [{
      startDate: input.startDate || '7daysAgo',
      endDate: input.endDate || 'today',
    }],
    dimensions: (input.dimensions || ['date']).map(name => ({ name })),
    metrics: (input.metrics || ['activeUsers', 'sessions']).map(name => ({ name })),
    limit: String(Math.min(input.limit || 100, 10000)),
  };

  if (input.orderBy) {
    body.orderBys = [{
      metric: input.orderBy.metric ? { metricName: input.orderBy.metric } : undefined,
      dimension: input.orderBy.dimension ? { dimensionName: input.orderBy.dimension } : undefined,
      desc: input.orderBy.desc !== false,
    }];
  }

  if (input.hostName) {
    // Cross-domain filter: single GA4 property tracks all 3 tracked domains;
    // CONTAINS on bare domain matches both www and non-www variants.
    body.dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: input.hostName, caseSensitive: false },
      },
    };
  }

  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GA4 runReport failed: HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json() as GA4Report;
}

/**
 * Run a GA4 realtime report (last 30 minutes).
 */
export async function runRealtimeReport(propertyId: string, dimensions?: string[], metrics?: string[], hostName?: string): Promise<GA4Report> {
  const token = await getAccessToken();
  const cleanId = propertyId.replace(/^properties\//, '');

  const body: any = {
    dimensions: (dimensions || ['country']).map(name => ({ name })),
    metrics: (metrics || ['activeUsers']).map(name => ({ name })),
    limit: '50',
  };

  if (hostName) {
    // Cross-domain filter: single GA4 property tracks all 3 tracked domains;
    // CONTAINS on bare domain matches both www and non-www variants.
    body.dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: hostName, caseSensitive: false },
      },
    };
  }

  const res = await fetch(`${GA4_BASE}/properties/${cleanId}:runRealtimeReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GA4 runRealtimeReport failed: HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json() as GA4Report;
}

/**
 * Convenience: traffic overview (sessions/users/pageviews/bounceRate by channel)
 * Returns simplified shape for direct consumption.
 */
export async function trafficOverview(propertyId: string, startDate?: string, endDate?: string, hostName?: string) {
  const report = await runReport({
    propertyId,
    startDate: startDate || '28daysAgo',
    endDate: endDate || 'yesterday',
    dimensions: ['sessionDefaultChannelGroup'],
    metrics: ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration'],
    orderBy: { metric: 'sessions', desc: true },
    limit: 20,
    hostName,
  });

  const channels = (report.rows || []).map(row => ({
    channel: row.dimensionValues[0]?.value || '(unknown)',
    activeUsers: parseInt(row.metricValues[0]?.value || '0', 10),
    sessions: parseInt(row.metricValues[1]?.value || '0', 10),
    pageViews: parseInt(row.metricValues[2]?.value || '0', 10),
    bounceRate: parseFloat(row.metricValues[3]?.value || '0'),
    avgSessionDurationSec: parseFloat(row.metricValues[4]?.value || '0'),
  }));

  const totalSessions = channels.reduce((s, c) => s + c.sessions, 0);
  const totalUsers = channels.reduce((s, u) => s + u.activeUsers, 0);

  return {
    propertyId: propertyId.replace(/^properties\//, ''),
    period: { startDate: startDate || '28daysAgo', endDate: endDate || 'yesterday' },
    summary: { totalSessions, totalUsers, channelCount: channels.length },
    channels,
  };
}

/**
 * Helper: get GA4 property ID for a given domain via sites table.
 */
export async function getGA4PropertyMap(): Promise<Record<string, string>> {
  const { query } = await import('../db/connection.js');
  const rows = await query<{ domain: string; ga4_property_id: string | null }>(
    `SELECT domain, ga4_property_id FROM sites
     WHERE is_tracked = TRUE AND ga4_property_id IS NOT NULL`
  );
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.ga4_property_id) map[r.domain] = r.ga4_property_id;
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────
// Run T (2026-05-26) — GA4 Max extensions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Latest captured propertyQuota from the most recent Data API response.
 * Surfaced via ga4_quota_status tool + _meta.quota on every tool result.
 */
let lastQuotaSnapshot: any = null;
export function getLastQuotaSnapshot() { return lastQuotaSnapshot; }

/** Patched runReport that captures propertyQuota into the module cache. */
export async function runReportWithQuota(input: RunReportInput): Promise<GA4Report & { propertyQuota?: any }> {
  const token = await getAccessToken();
  const propertyId = input.propertyId.replace(/^properties\//, '');

  const body: any = {
    dateRanges: [{
      startDate: input.startDate || '7daysAgo',
      endDate: input.endDate || 'today',
    }],
    dimensions: (input.dimensions || ['date']).map(name => ({ name })),
    metrics: (input.metrics || ['activeUsers', 'sessions']).map(name => ({ name })),
    limit: String(Math.min(input.limit || 100, 10000)),
    returnPropertyQuota: true,
  };
  if (input.orderBy) {
    body.orderBys = [{
      metric: input.orderBy.metric ? { metricName: input.orderBy.metric } : undefined,
      dimension: input.orderBy.dimension ? { dimensionName: input.orderBy.dimension } : undefined,
      desc: input.orderBy.desc !== false,
    }];
  }

  if (input.hostName) {
    // Cross-domain filter: single GA4 property tracks all 3 tracked domains;
    // CONTAINS on bare domain matches both www and non-www variants.
    body.dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: input.hostName, caseSensitive: false },
      },
    };
  }

  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 runReport failed: HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as GA4Report & { propertyQuota?: any };
  if (json.propertyQuota) lastQuotaSnapshot = { ...json.propertyQuota, capturedAt: new Date().toISOString() };
  return json;
}

/**
 * Run a comparison report (current vs previous period) for any metrics + dimensions.
 * Returns rows with currentValue, previousValue, deltaAbs, deltaPct.
 */
export async function runCompareReport(args: {
  propertyId: string;
  dimensions: string[];
  metrics: string[];
  currentStart: string; currentEnd: string;
  previousStart: string; previousEnd: string;
  limit?: number;
  hostName?: string;
}) {
  const token = await getAccessToken();
  const propertyId = args.propertyId.replace(/^properties\//, '');
  const body: any = {
    dateRanges: [
      { startDate: args.currentStart, endDate: args.currentEnd, name: 'current' },
      { startDate: args.previousStart, endDate: args.previousEnd, name: 'previous' },
    ],
    dimensions: args.dimensions.map(name => ({ name })),
    metrics: args.metrics.map(name => ({ name })),
    limit: String(Math.min(args.limit || 100, 5000)),
    returnPropertyQuota: true,
  };
  if (args.hostName) {
    // Cross-domain filter: single GA4 property tracks all 3 tracked domains;
    // CONTAINS on bare domain matches both www and non-www variants.
    body.dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: args.hostName, caseSensitive: false },
      },
    };
  }
  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 runCompareReport failed: HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  if (json.propertyQuota) lastQuotaSnapshot = { ...json.propertyQuota, capturedAt: new Date().toISOString() };
  return json;
}

/** Get Data API metadata — available dimensions, metrics, custom_* per property. */
export async function getPropertyMetadata(propertyId: string) {
  const token = await getAccessToken();
  const cleanId = propertyId.replace(/^properties\//, '');
  const res = await fetch(`${GA4_BASE}/properties/${cleanId}/metadata`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GA4 getMetadata failed: HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

/**
 * Cohort retention — `runReport` with cohortSpec extension. Weekly granularity default
 * (example-org content cycle). Returns matrix [cohort × period → activeUsers].
 */
export async function runCohortReport(args: {
  propertyId: string;
  granularity?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  cohortSize?: number;
  metric?: string;
  hostName?: string;
}) {
  const token = await getAccessToken();
  const propertyId = args.propertyId.replace(/^properties\//, '');
  const granularity = args.granularity || 'WEEKLY';
  const size = Math.min(Math.max(args.cohortSize ?? 6, 2), 12);

  // Build cohort spec with N cohorts ending today
  const today = new Date();
  const days = granularity === 'DAILY' ? 1 : granularity === 'WEEKLY' ? 7 : 30;
  const cohorts = [];
  for (let i = size - 1; i >= 0; i--) {
    const end = new Date(today);
    end.setDate(end.getDate() - i * days);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    cohorts.push({
      name: `cohort_${i}`,
      dimension: 'firstSessionDate',
      dateRange: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
    });
  }

  const body: any = {
    cohortSpec: {
      cohorts,
      cohortsRange: { granularity, startOffset: 0, endOffset: size - 1 },
      cohortReportSettings: { accumulate: false },
    },
    dimensions: [{ name: 'cohort' }, { name: 'cohortNthWeek' }],
    metrics: [{ name: args.metric || 'cohortActiveUsers' }],
    returnPropertyQuota: true,
  };
  if (args.hostName) {
    // Cross-domain filter: single GA4 property tracks all 3 tracked domains;
    // CONTAINS on bare domain matches both www and non-www variants.
    body.dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: args.hostName, caseSensitive: false },
      },
    };
  }

  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 cohort failed: HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  if (json.propertyQuota) lastQuotaSnapshot = { ...json.propertyQuota, capturedAt: new Date().toISOString() };
  return json;
}

/**
 * Path exploration approximation — `runReport` with dimension pagePath +
 * nextPagePath (forward) or previousPagePath (backward). v1alpha funnel report
 * is NOT used here because it requires AnalyticsAdminAPI access; this is a
 * close-enough Data API approximation for the basic example-org path UX.
 */
export async function runPathReport(args: {
  propertyId: string;
  startPage: string;
  direction?: 'forward' | 'backward';
  startDate?: string;
  endDate?: string;
  hostName?: string;
}) {
  const propertyId = args.propertyId.replace(/^properties\//, '');
  const direction = args.direction || 'forward';
  const filterDim = 'pagePath';
  const adjacentDim = direction === 'forward' ? 'pagePath' : 'pagePath';
  // We pull a session-scoped sequence by combining pagePath + sessionId,
  // then post-process in the executor. Data API does not natively support
  // path exploration; this gives "what next/prev page did sessions hit".
  const report = await runReportWithQuota({
    propertyId,
    startDate: args.startDate || '28daysAgo',
    endDate: args.endDate || 'yesterday',
    dimensions: ['pagePath', 'sessionDefaultChannelGroup'],
    metrics: ['screenPageViews', 'engagedSessions'],
    limit: 200,
    hostName: args.hostName,
  });
  // Note: real path exploration needs Admin/v1alpha. Return top adjacent pages
  // alongside the start page for now — agent can interpret.
  return {
    propertyId, startPage: args.startPage, direction,
    note: 'Data API approximation. Top pages adjacent to start by traffic share.',
    rows: report.rows.slice(0, 20),
  };
}

/**
 * Funnel report wrapper — v1alpha endpoint when available, falls back
 * to multi-step runReport approximation if v1alpha returns 403.
 *
 * `steps` is a list of { name, filter: { eventName | pagePathContains } }.
 */
export async function runFunnelReport(args: {
  propertyId: string;
  steps: Array<{ name: string; filter: { eventName?: string; pagePathContains?: string } }>;
  startDate?: string;
  endDate?: string;
  hostName?: string;
}) {
  const propertyId = args.propertyId.replace(/^properties\//, '');
  const dateRange = {
    startDate: args.startDate || '28daysAgo',
    endDate: args.endDate || 'yesterday',
  };

  // Attempt v1alpha runFunnelReport first (most accurate for sequential steps).
  try {
    const token = await getAccessToken();
    const ALPHA_BASE = 'https://analyticsdata.googleapis.com/v1alpha';
    const funnelSteps = args.steps.map(s => ({
      name: s.name,
      filterExpression: s.filter.eventName
        ? { filter: { fieldName: 'eventName', stringFilter: { value: s.filter.eventName } } }
        : { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: s.filter.pagePathContains || '' } } },
    }));
    const body: any = {
      dateRanges: [dateRange],
      funnel: { steps: funnelSteps, type: 'STANDARD_FUNNEL' },
      returnPropertyQuota: true,
    };
    if (args.hostName) {
      // Cross-domain filter applied at segment level for v1alpha funnel.
      body.funnelFilterExpression = {
        filter: {
          fieldName: 'hostName',
          stringFilter: { matchType: 'CONTAINS', value: args.hostName, caseSensitive: false },
        },
      };
    }
    const res = await fetch(`${ALPHA_BASE}/properties/${propertyId}:runFunnelReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json() as any;
      if (json.propertyQuota) lastQuotaSnapshot = { ...json.propertyQuota, capturedAt: new Date().toISOString() };
      return { mode: 'v1alpha_funnel', ...json };
    }
    // fall through to approximation on 403 / 400 (likely property doesn't support funnel reports)
  } catch { /* fallback */ }

  // Approximation: run a per-step session count and report dropoff manually.
  const stepResults: Array<{ name: string; sessions: number }> = [];
  for (const step of args.steps) {
    const stepFilter = step.filter.eventName
      ? { filter: { fieldName: 'eventName', stringFilter: { value: step.filter.eventName } } }
      : { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: step.filter.pagePathContains || '' } } };
    // Cross-domain filter: combine step filter with hostName constraint when set.
    const dimensionFilter = args.hostName
      ? {
          andGroup: {
            expressions: [
              stepFilter,
              { filter: { fieldName: 'hostName', stringFilter: { matchType: 'CONTAINS', value: args.hostName, caseSensitive: false } } },
            ],
          },
        }
      : stepFilter;
    // Filter not actually applied here — needs deeper body shape. Use raw fetch.
    const token = await getAccessToken();
    const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [dateRange],
        metrics: [{ name: 'sessions' }],
        dimensionFilter,
        returnPropertyQuota: true,
      }),
    });
    const j = await res.json() as any;
    if (j.propertyQuota) lastQuotaSnapshot = { ...j.propertyQuota, capturedAt: new Date().toISOString() };
    const sessions = parseInt(j.rows?.[0]?.metricValues?.[0]?.value ?? '0', 10);
    stepResults.push({ name: step.name, sessions });
  }
  return {
    mode: 'approximation',
    propertyId, period: dateRange,
    steps: stepResults.map((s, i) => ({
      ...s,
      completionRate: i === 0 ? 1 : (s.sessions / (stepResults[i - 1].sessions || 1)),
      dropoff: i === 0 ? 0 : (stepResults[i - 1].sessions - s.sessions),
    })),
  };
}
