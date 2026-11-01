// Google Organic and Google AI Mode via SerpAPI.
// One search costs one credit. The key is SERPAPI_KEY (settings or the process env).

const ENDPOINT = 'https://serpapi.com/search.json';

export function serpapiKey(): string {
  return (process.env.SERPAPI_KEY || '').trim();
}

type SerpJson = Record<string, unknown>;

async function search(params: Record<string, string>): Promise<SerpJson> {
  const key = serpapiKey();
  if (!key) {
    throw new Error('SERPAPI_KEY is empty. Add the SerpAPI key in Settings.');
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set('api_key', key);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const json = await res.json() as SerpJson;
  if (!res.ok || typeof json.error === 'string') {
    const message = typeof json.error === 'string' ? json.error : `SerpAPI returned ${res.status}`;
    throw new Error(message);
  }
  return json;
}

export interface OrganicHit {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayed_link: string;
}

export async function googleOrganic(input: {
  query: string;
  gl?: string;
  hl?: string;
  num?: number;
}): Promise<{ query: string; gl: string; hl: string; results: OrganicHit[] }> {
  const query = input.query.trim();
  if (!query) throw new Error('query is empty');
  const gl = (input.gl || 'sk').trim();
  const hl = (input.hl || 'sk').trim();
  const num = Math.min(Math.max(Number(input.num) || 10, 1), 10);
  const json = await search({
    engine: 'google',
    q: query,
    gl,
    hl,
    num: String(num),
  });
  const rows = Array.isArray(json.organic_results) ? json.organic_results : [];
  const results: OrganicHit[] = rows.slice(0, num).map((row, index) => {
    const hit = row as Record<string, unknown>;
    return {
      position: typeof hit.position === 'number' ? hit.position : index + 1,
      title: String(hit.title || ''),
      link: String(hit.link || ''),
      snippet: String(hit.snippet || ''),
      displayed_link: String(hit.displayed_link || ''),
    };
  });
  return { query, gl, hl, results };
}

function blockText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const row = block as Record<string, unknown>;
  const own = [row.snippet, row.text].filter(v => typeof v === 'string').join(' ');
  const list = Array.isArray(row.list) ? row.list.map(blockText).filter(Boolean).join(' ') : '';
  return [own, list].filter(Boolean).join(' ').trim();
}

export async function googleAiMode(input: {
  query: string;
}): Promise<{ query: string; answer: string; references: { title: string; link: string; snippet: string }[] }> {
  const query = input.query.trim();
  if (!query) throw new Error('query is empty');
  const json = await search({ engine: 'google_ai_mode', q: query });
  const blocks = Array.isArray(json.text_blocks) ? json.text_blocks : [];
  const answer = blocks.map(blockText).filter(Boolean).join('\n\n');
  const refs = Array.isArray(json.references) ? json.references : [];
  const references = refs.slice(0, 8).map(row => {
    const ref = row as Record<string, unknown>;
    return {
      title: String(ref.title || ref.source || ''),
      link: String(ref.link || ''),
      snippet: String(ref.snippet || ''),
    };
  });
  return { query, answer, references };
}

/** Account check. Does not spend a search credit. */
export async function serpapiAccount(): Promise<{ plan: string; searchesLeft: number | null }> {
  const key = serpapiKey();
  if (!key) throw new Error('SERPAPI_KEY is empty. Add the SerpAPI key in Settings.');
  const url = new URL('https://serpapi.com/account.json');
  url.searchParams.set('api_key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json() as { error?: string; plan_name?: string; total_searches_left?: number };
  if (!res.ok || json.error) throw new Error(json.error || `SerpAPI account returned ${res.status}`);
  return {
    plan: json.plan_name || 'unknown',
    searchesLeft: typeof json.total_searches_left === 'number' ? json.total_searches_left : null,
  };
}
