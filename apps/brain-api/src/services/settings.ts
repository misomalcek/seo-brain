import fs from 'fs';
import { query } from '../db/connection';
import { brainPath, wwwPath } from '../paths';
import { listSites, resetGscAuth } from './gsc-api';
import { resetGa4Auth, trafficOverview } from './ga4-api';
import { zoneIdFor, zoneTraffic } from './cloudflare-analytics';
import { serpapiAccount } from './serpapi';

export type UiLanguage = 'en' | 'de' | 'sk' | 'cs';

export type FeatureFlags = Record<string, boolean>;

type SecretField =
  | 'anthropic_api_key'
  | 'endpoint_api_key'
  | 'ahrefs_api_key'
  | 'crux_api_key'
  | 'gsc_service_account_json'
  | 'ga4_service_account_json'
  | 'cloudflare_api_token'
  | 'serpapi_api_key';

export interface Settings {
  anthropic_api_key: string;
  endpoint_mode: 'anthropic' | 'compatible';
  endpoint_base_url: string;
  endpoint_api_key: string;
  endpoint_model: string;
  ahrefs_api_key: string;
  crux_api_key: string;
  gsc_service_account_json: string;
  gsc_site_url: string;
  ga4_service_account_json: string;
  ga4_property_id: string;
  cloudflare_api_token: string;
  serpapi_api_key: string;
  ui_language: UiLanguage;
  speech_language: string;
  reply_language: string;
  features: FeatureFlags;
}

const SECRET_FIELDS: SecretField[] = [
  'anthropic_api_key',
  'endpoint_api_key',
  'ahrefs_api_key',
  'crux_api_key',
  'gsc_service_account_json',
  'ga4_service_account_json',
  'cloudflare_api_token',
  'serpapi_api_key',
];

const LANGUAGES: UiLanguage[] = ['en', 'de', 'sk', 'cs'];

const SPEECH: Record<UiLanguage, string> = {
  en: 'en-US',
  de: 'de-DE',
  sk: 'sk-SK',
  cs: 'cs-CZ',
};

function defaultFeatures(): FeatureFlags {
  const desktop = process.env.SEO_BRAIN_DESKTOP === '1';
  return {
    chats: true,
    files: true,
    agents: true,
    personas: true,
    calendar: true,
    vectors: true,
    tools: true,
    graph: !desktop,
    'data-viewer': true,
    memory: true,
    docs: true,
    team: true,
    search: true,
  };
}

function defaults(): Settings {
  return {
    anthropic_api_key: '',
    endpoint_mode: 'compatible',
    endpoint_base_url: 'http://127.0.0.1:8080/v1',
    endpoint_api_key: '',
    endpoint_model: '',
    ahrefs_api_key: '',
    crux_api_key: '',
    gsc_service_account_json: '',
    gsc_site_url: '',
    ga4_service_account_json: '',
    ga4_property_id: '',
    cloudflare_api_token: '',
    serpapi_api_key: '',
    ui_language: 'en',
    speech_language: '',
    reply_language: '',
    features: defaultFeatures(),
  };
}

let cache: Settings = defaults();

function asLanguage(value: unknown): UiLanguage {
  return LANGUAGES.includes(value as UiLanguage) ? (value as UiLanguage) : 'en';
}

function asMode(value: unknown): Settings['endpoint_mode'] {
  return value === 'compatible' ? 'compatible' : 'anthropic';
}

/** Accept a pasted models URL or a localhost name and store the API root. */
export function normalizeEndpointBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  base = base.replace(/^http:\/\/localhost\b/i, 'http://127.0.0.1');
  base = base.replace(/^https:\/\/localhost\b/i, 'https://127.0.0.1');
  if (base.endsWith('/chat/completions')) base = base.slice(0, -'/chat/completions'.length);
  if (base.endsWith('/models')) base = base.slice(0, -'/models'.length);
  return base.replace(/\/+$/, '');
}

export function currentLanguage(): { ui: UiLanguage; speech: string; replyLanguage: UiLanguage } {
  const ui = cache.ui_language;
  const replyLanguage = cache.reply_language ? asLanguage(cache.reply_language) : ui;
  const speechCode = cache.speech_language ? asLanguage(cache.speech_language) : ui;
  return { ui, speech: SPEECH[speechCode], replyLanguage };
}

export function configuredHost(): string {
  const raw = cache.gsc_site_url.trim();
  if (!raw) return '';
  return raw.replace(/^sc-domain:/i, '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

/** Property id from Settings when the asked host is the configured site. */
export function ga4PropertyForHost(site: string): string | null {
  const id = cache.ga4_property_id.trim();
  const known = configuredHost();
  if (!id || !known) return null;
  const wanted = site.replace(/^sc-domain:/i, '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return wanted === known ? id : null;
}

export async function freeDomainRatingLine(): Promise<string> {
  const key = cache.ahrefs_api_key.replace(/^Bearer\s+/i, '').trim();
  const host = configuredHost();
  if (!key || !host) return '';
  try {
    const res = await fetch(
      `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(host)}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return '';
    const rating = (await res.json() as { domain_rating?: { domain_rating?: unknown } })?.domain_rating?.domain_rating;
    return typeof rating === 'number' || typeof rating === 'string'
      ? `Ahrefs free domain rating for ${host}: ${rating}.`
      : '';
  } catch {
    return '';
  }
}

export function siteContext(): string {
  const lines: string[] = [];
  if (cache.gsc_site_url) lines.push(`Default Search Console site: ${cache.gsc_site_url}`);
  if (cache.ga4_property_id) lines.push(`Default GA4 property id: ${cache.ga4_property_id}`);
  return lines.length ? `\n${lines.join('\n')}` : '';
}

export function currentFeatures(): FeatureFlags {
  return cache.features;
}

export function storagePaths() {
  return {
    files: process.env.FILES_DIR || brainPath('user-files'),
    uploads: brainPath('uploads'),
    reports: brainPath('reports', 'mcp'),
    html: process.env.SEO_BRAIN_HTML_REPORTS || wwwPath('reports', 'html'),
    dashboards: process.env.SEO_BRAIN_DASHBOARDS || wwwPath('reports', 'dashboards'),
    memory: brainPath('memory'),
    knowledge: brainPath('knowledge'),
    docs: brainPath('docs'),
    credentials: brainPath('credentials'),
  };
}

function masked(value: string): { set: boolean; last4: string } {
  const trimmed = value.trim();
  return { set: trimmed.length > 0, last4: trimmed.length >= 4 ? trimmed.slice(-4) : '' };
}

export function publicSettings() {
  const lang = currentLanguage();
  return {
    ui_language: lang.ui,
    speech_language: lang.speech,
    reply_language: lang.replyLanguage,
    features: cache.features,
    paths: storagePaths(),
    endpoint_mode: cache.endpoint_mode,
    gsc_site_url: cache.gsc_site_url,
    ga4_property_id: cache.ga4_property_id,
  };
}

export function adminSettingsView() {
  const secrets: Record<string, { set: boolean; last4: string }> = {};
  for (const field of SECRET_FIELDS) secrets[field] = masked(cache[field]);
  return {
    ...publicSettings(),
    endpoint_base_url: cache.endpoint_base_url,
    endpoint_model: cache.endpoint_model,
    speech_language_override: cache.speech_language,
    reply_language_override: cache.reply_language,
    secrets,
  };
}

function apply(settings: Settings): void {
  process.env.ANTHROPIC_API_KEY = settings.anthropic_api_key;
  process.env.AHREFS_API_KEY = settings.ahrefs_api_key;
  process.env.CRUX_API_KEY = settings.crux_api_key;
  process.env.SEO_BRAIN_ENDPOINT_MODE = settings.endpoint_mode;
  process.env.SEO_BRAIN_ENDPOINT_BASE_URL = settings.endpoint_base_url;
  process.env.SEO_BRAIN_ENDPOINT_API_KEY = settings.endpoint_api_key;
  process.env.SEO_BRAIN_ENDPOINT_MODEL = settings.endpoint_model;
  process.env.CLOUDFLARE_API_TOKEN = settings.cloudflare_api_token;
  if (settings.serpapi_api_key) process.env.SERPAPI_KEY = settings.serpapi_api_key;
  writeCredential('gsc-service-account.json', settings.gsc_service_account_json);
  writeCredential('ga4-service-account.json', settings.ga4_service_account_json);
  resetGscAuth();
  resetGa4Auth();
}

function writeCredential(filename: string, raw: string): void {
  const dest = brainPath('credentials', filename);
  fs.mkdirSync(brainPath('credentials'), { recursive: true });
  if (!raw.trim()) {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return;
  }
  fs.writeFileSync(dest, raw.endsWith('\n') ? raw : `${raw}\n`, { mode: 0o600 });
}

function rowToSettings(rows: { key: string; value: unknown }[]): Settings {
  const next = defaults();
  const bag = new Map(rows.map(row => [row.key, row.value]));
  const str = (key: keyof Settings) => {
    const value = bag.get(key);
    return typeof value === 'string' ? value : next[key] as string;
  };
  next.anthropic_api_key = str('anthropic_api_key');
  next.endpoint_mode = asMode(bag.get('endpoint_mode'));
  next.endpoint_base_url = str('endpoint_base_url');
  next.endpoint_api_key = str('endpoint_api_key');
  next.endpoint_model = str('endpoint_model');
  next.ahrefs_api_key = str('ahrefs_api_key');
  next.crux_api_key = str('crux_api_key');
  next.gsc_service_account_json = str('gsc_service_account_json');
  next.gsc_site_url = str('gsc_site_url');
  next.ga4_service_account_json = str('ga4_service_account_json');
  next.ga4_property_id = str('ga4_property_id');
  next.cloudflare_api_token = str('cloudflare_api_token');
  next.serpapi_api_key = str('serpapi_api_key');
  next.ui_language = asLanguage(bag.get('ui_language'));
  next.speech_language = str('speech_language');
  next.reply_language = str('reply_language');
  const features = bag.get('features');
  if (features && typeof features === 'object') {
    next.features = { ...defaultFeatures(), ...(features as FeatureFlags) };
  }
  return next;
}

export async function loadSettings(): Promise<void> {
  try {
    const rows = await query<{ key: string; value: unknown }>(
      'SELECT key, value FROM system_settings',
    );
    cache = rowToSettings(rows);
  } catch (err) {
    console.warn('[settings] load skipped:', err instanceof Error ? err.message : err);
    cache = defaults();
  }
  apply(cache);
  const lang = currentLanguage();
  console.log(`[settings] language ${lang.ui}, speech ${lang.speech}, reply ${lang.replyLanguage}`);
}

export async function saveSettings(patch: Record<string, unknown>): Promise<void> {
  const next: Settings = { ...cache, features: { ...cache.features } };
  const assign = (key: keyof Settings, value: unknown) => {
    if (typeof value === 'string') (next as unknown as Record<string, unknown>)[key] = value;
  };
  for (const field of SECRET_FIELDS) {
    if (patch[field] === '') continue;
    if (patch[`clear_${field}`] === true) {
      next[field] = '';
      continue;
    }
    assign(field, patch[field]);
  }
  if (patch.endpoint_mode !== undefined) next.endpoint_mode = asMode(patch.endpoint_mode);
  if (typeof patch.endpoint_base_url === 'string') {
    next.endpoint_base_url = normalizeEndpointBase(patch.endpoint_base_url);
  }
  assign('endpoint_model', patch.endpoint_model);
  assign('gsc_site_url', patch.gsc_site_url);
  assign('ga4_property_id', patch.ga4_property_id);
  if (patch.ui_language !== undefined) next.ui_language = asLanguage(patch.ui_language);
  if (patch.speech_language !== undefined && typeof patch.speech_language === 'string') {
    next.speech_language = patch.speech_language;
  }
  if (patch.reply_language !== undefined && typeof patch.reply_language === 'string') {
    next.reply_language = patch.reply_language;
  }
  if (patch.features && typeof patch.features === 'object') {
    next.features = { ...next.features, ...(patch.features as FeatureFlags) };
  }
  if (next.gsc_service_account_json.trim()) validateServiceAccount(next.gsc_service_account_json, 'Search Console');
  if (next.ga4_service_account_json.trim()) validateServiceAccount(next.ga4_service_account_json, 'GA4');

  const entries = Object.entries(next) as [string, unknown][];
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }
  cache = next;
  apply(cache);
}

function validateServiceAccount(raw: string, label: string): void {
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} key is not valid JSON`);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`${label} key needs client_email and private_key`);
  }
}

export async function testConnection(target: string): Promise<{ ok: boolean; detail: string }> {
  if (target === 'anthropic') return testAnthropic();
  if (target === 'crux') return testPageSpeed();
  if (target === 'ahrefs') return testAhrefs();
  if (target === 'endpoint') return testEndpoint();
  if (target === 'gsc') return testGsc();
  if (target === 'ga4') return testGa4();
  if (target === 'cloudflare') return testCloudflare();
  if (target === 'serpapi') return testSerpapi();
  return { ok: false, detail: 'Unknown target' };
}

async function testAnthropic(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.anthropic_api_key) return { ok: false, detail: 'Claude key is empty' };
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': cache.anthropic_api_key, 'anthropic-version': '2023-06-01' },
  });
  return { ok: res.ok, detail: res.ok ? 'Claude accepted the key' : `Claude returned ${res.status}` };
}

async function testGsc(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.gsc_service_account_json.trim()) return { ok: false, detail: 'Search Console key is empty' };
  try {
    validateServiceAccount(cache.gsc_service_account_json, 'Search Console');
    const sites = await listSites();
    const wanted = cache.gsc_site_url.replace(/\/$/, '');
    const urls = sites.map(s => s.siteUrl);
    const host = (() => { try { return new URL(wanted).hostname; } catch { return ''; } })();
    const granted = urls.some(u => {
      const site = u.replace(/\/$/, '');
      return site === wanted || (host !== '' && site === `sc-domain:${host}`);
    });
    if (!urls.length) {
      return { ok: false, detail: 'Search Console accepted the key. This account is not a user on any property.' };
    }
    if (wanted && !granted) {
      return { ok: false, detail: `Search Console accepted the key. ${wanted} is not in this account. Properties: ${urls.slice(0, 4).join(', ')}` };
    }
    return { ok: true, detail: `Search Console is live. ${urls.length} propert${urls.length === 1 ? 'y' : 'ies'}.` };
  } catch (err) {
    return { ok: false, detail: clip(err) };
  }
}

async function testGa4(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.ga4_service_account_json.trim()) return { ok: false, detail: 'GA4 key is empty' };
  if (!cache.ga4_property_id.trim()) return { ok: false, detail: 'GA4 property id is empty' };
  try {
    validateServiceAccount(cache.ga4_service_account_json, 'GA4');
    const report = await trafficOverview(cache.ga4_property_id);
    const sessions = report.summary.totalSessions;
    const note = sessions === 0
      ? 'No sessions in the last 28 days yet. The connection is live.'
      : `Sessions in the last 28 days: ${sessions}.`;
    return { ok: true, detail: `GA4 is live for property ${report.propertyId}. ${note}` };
  } catch (err) {
    return { ok: false, detail: clip(err) };
  }
}

async function testPageSpeed(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.crux_api_key) return { ok: false, detail: 'PageSpeed key is empty' };
  const page = cache.gsc_site_url.trim();
  if (!page) return { ok: false, detail: 'Set the site URL. PageSpeed runs against that address.' };
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(page)}&strategy=mobile&category=performance&key=${encodeURIComponent(cache.crux_api_key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  if (!res.ok) return { ok: false, detail: `PageSpeed returned ${res.status}: ${text.slice(0, 180)}` };
  const json = JSON.parse(text) as {
    lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { displayValue?: string }> };
    loadingExperience?: { overall_category?: string };
  };
  const score = json.lighthouseResult?.categories?.performance?.score;
  if (score == null) return { ok: false, detail: 'PageSpeed answered, but there is no performance score.' };
  const lcp = json.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue;
  const field = json.loadingExperience?.overall_category;
  const fieldNote = field ? `Field data: ${field}.` : 'Field data: none for this origin. Lab data is the result.';
  return {
    ok: true,
    detail: `PageSpeed mobile performance ${Math.round(score * 100)} for ${page}.${lcp ? ` Lab LCP ${lcp}.` : ''} ${fieldNote}`,
  };
}

async function testCloudflare(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.cloudflare_api_token.trim()) return { ok: false, detail: 'Cloudflare token is empty' };
  const host = configuredHost();
  if (!host) return { ok: false, detail: 'Set the site URL. Cloudflare reads that zone.' };
  try {
    const zoneId = await zoneIdFor(cache.cloudflare_api_token, host);
    const traffic = await zoneTraffic(cache.cloudflare_api_token, zoneId, host, 7);
    return {
      ok: true,
      detail: `Cloudflare is live for ${host}. Last 7 days: ${traffic.requests} requests, ${traffic.visits} visits.`,
    };
  } catch (err) {
    return { ok: false, detail: clip(err) };
  }
}

async function testAhrefs(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.ahrefs_api_key) return { ok: false, detail: 'Ahrefs key is empty' };
  let target = 'aisvet.sk';
  try { if (cache.gsc_site_url.trim()) target = new URL(cache.gsc_site_url).hostname; } catch { /* keep default */ }
  const res = await fetch(
    `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(target)}`,
    { headers: { Authorization: `Bearer ${cache.ahrefs_api_key.replace(/^Bearer\s+/i, '')}`, Accept: 'application/json' } },
  );
  const text = await res.text();
  if (res.status === 403) {
    return { ok: false, detail: `Ahrefs accepted the request shape but will not rate ${target} on this key.` };
  }
  if (!res.ok) return { ok: false, detail: `Ahrefs returned ${res.status}: ${text.slice(0, 160)}` };
  let rating = '';
  try { rating = String(JSON.parse(text)?.domain_rating?.domain_rating ?? ''); } catch { /* keep raw */ }
  return { ok: true, detail: rating ? `Ahrefs domain rating for ${target}: ${rating}.` : `Ahrefs returned domain rating for ${target}.` };
}

async function testSerpapi(): Promise<{ ok: boolean; detail: string }> {
  if (!cache.serpapi_api_key && !process.env.SERPAPI_KEY) {
    return { ok: false, detail: 'SerpAPI key is empty' };
  }
  if (cache.serpapi_api_key) process.env.SERPAPI_KEY = cache.serpapi_api_key;
  try {
    const account = await serpapiAccount();
    const left = account.searchesLeft == null ? 'unknown credits left' : `${account.searchesLeft} searches left`;
    return { ok: true, detail: `SerpAPI is live. Plan ${account.plan}, ${left}.` };
  } catch (err) {
    return { ok: false, detail: clip(err) };
  }
}

function endpointHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://aisvet.sk',
    'X-Title': 'SEO Brain',
  };
  if (cache.endpoint_api_key) headers.Authorization = `Bearer ${cache.endpoint_api_key}`;
  return headers;
}

function clip(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/key=[^&\s]+/gi, 'key=…').slice(0, 240);
}

async function testEndpoint(): Promise<{ ok: boolean; detail: string }> {
  const base = normalizeEndpointBase(cache.endpoint_base_url);
  if (!base) return { ok: false, detail: 'Endpoint URL is empty' };
  if (!cache.endpoint_model.trim()) return { ok: false, detail: 'Model name is empty' };
  const root = base.endsWith('/v1') ? base : `${base}/v1`;
  const body = JSON.stringify({
    model: cache.endpoint_model.trim(),
    messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
    max_tokens: 64,
  });
  let res = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: endpointHeaders(),
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 429) {
    const waitSec = Number(res.headers.get('retry-after') || '2');
    await new Promise(r => setTimeout(r, Math.min(waitSec, 8) * 1000));
    res = await fetch(`${root}/chat/completions`, {
      method: 'POST',
      headers: endpointHeaders(),
      body,
      signal: AbortSignal.timeout(60000),
    });
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, detail: `Endpoint returned ${res.status}: ${text.slice(0, 180)}` };
  }
  const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string; reasoning?: string } }> };
  const message = json.choices?.[0]?.message;
  const reply = (message?.content || message?.reasoning || '').trim();
  if (!reply) return { ok: false, detail: 'Endpoint accepted the key. The model returned an empty reply.' };
  return { ok: true, detail: `Endpoint replied (${reply.length} characters) on ${cache.endpoint_model.trim()}.` };
}
