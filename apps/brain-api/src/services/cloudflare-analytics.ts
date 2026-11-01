/**
 * Cloudflare GraphQL Analytics. Free plan, adaptive datasets, 31 days.
 * Not metered in units. Cache Analytics is Pro and is not called.
 */

const API = 'https://api.cloudflare.com/client/v4';

export interface ZoneTraffic {
  zoneId: string;
  zone: string;
  days: number;
  requests: number;
  visits: number;
  bytes: number;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}`,
    'Content-Type': 'application/json',
  };
}

export async function zoneIdFor(token: string, hostname: string): Promise<string> {
  const name = hostname.replace(/^sc-domain:/i, '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!name) throw new Error('Zone hostname is empty');
  const res = await fetch(`${API}/zones?name=${encodeURIComponent(name)}`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json() as { success?: boolean; errors?: Array<{ message?: string }>; result?: Array<{ id?: string }> };
  if (!res.ok || json.success === false) {
    throw new Error(json.errors?.[0]?.message || `Cloudflare zones returned ${res.status}`);
  }
  const id = json.result?.[0]?.id;
  if (!id) throw new Error(`No Cloudflare zone named ${name} on this token`);
  return id;
}

export async function zoneTraffic(token: string, zoneId: string, hostname: string, days: number): Promise<ZoneTraffic> {
  const span = Math.min(Math.max(days || 7, 1), 31);
  const until = new Date();
  const since = new Date(until.getTime() - span * 86400000);
  const query = `query($zoneTag: String!, $since: Time!, $until: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequestsAdaptiveGroups(limit: 1, filter: { datetime_geq: $since, datetime_lt: $until }) {
          count
          sum { visits edgeResponseBytes }
        }
      }
    }
  }`;
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      query,
      variables: { zoneTag: zoneId, since: since.toISOString(), until: until.toISOString() },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json() as {
    errors?: Array<{ message?: string }>;
    data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: Array<{ count?: number; sum?: { visits?: number; edgeResponseBytes?: number } }> }> } };
  };
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || `Cloudflare GraphQL returned ${res.status}`);
  }
  const row = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0];
  return {
    zoneId,
    zone: hostname,
    days: span,
    requests: Number(row?.count || 0),
    visits: Number(row?.sum?.visits || 0),
    bytes: Number(row?.sum?.edgeResponseBytes || 0),
  };
}
