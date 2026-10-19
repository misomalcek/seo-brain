'use client';

/**
 * ContextSearch — unified semantic search across all 6 sources of the
 * persistent Brain layer (memory + article + knowledge + agent + brand +
 * template).
 *
 * Originally lived as an admin-only standalone page at
 * `/admin/context-search/` (2026-04-28). 2026-05-26 — extracted into this
 * reusable component and demoted to all logged-in users via the new
 * `/api/search/context` endpoint (the underlying brain_embeddings table
 * is team-shared knowledge, not per-user, so no privacy gate is needed).
 *
 * Used by:
 *   - the dock `Hľadanie` overlay (FeatureOverlay wrapper)
 *   - the admin page `/admin/context-search/` (compact=false)
 *
 * Props:
 *   - apiPath: which endpoint to hit (admin page passes the admin variant
 *              so it stays admin-only there)
 *   - showHeader: hide the standalone heading when embedded in overlay
 */

import { useState } from 'react';

interface ContextHit {
  source: 'memory' | 'article' | 'knowledge' | 'agent' | 'brand' | 'template';
  id: string;
  title: string | null;
  preview: string;
  score: number;
  raw_score: number;
  meta?: any;
}

interface SearchResult {
  query: string;
  total_hits: number;
  by_source: Record<string, number>;
  results: ContextHit[];
  durationMs: number;
}

const SOURCE_COLORS: Record<string, string> = {
  memory:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  article:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  knowledge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  agent:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  brand:     'bg-pink-500/15 text-pink-400 border-pink-500/30',
  template:  'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const ALL_SOURCES = ['memory', 'article', 'knowledge', 'agent', 'brand', 'template'];

interface Props {
  /** Backend path. Defaults to /api/search/context (user-facing). */
  apiPath?: string;
  /** Hide the page-level heading when embedded inside FeatureOverlay. */
  showHeader?: boolean;
}

export function ContextSearch({ apiPath = '/api/search/context', showHeader = true }: Props) {
  const [query, setQuery] = useState('');
  const [enabledSources, setEnabledSources] = useState<string[]>(ALL_SOURCES);
  const [minScore, setMinScore] = useState(0.25);
  const [limit, setLimit] = useState(15);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        limit: String(limit),
        minScore: String(minScore),
      });
      if (enabledSources.length < ALL_SOURCES.length) {
        params.set('sources', enabledSources.join(','));
      }
      const res = await fetch(`${apiPath}?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (s: string) => {
    setEnabledSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className={showHeader ? 'p-4 sm:p-6 max-w-5xl mx-auto' : 'p-3 sm:p-4 max-w-5xl mx-auto'}>
      {showHeader && (
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1">Context Search</h1>
          <p className="text-sm text-muted-foreground">
            Unified semantic search across <strong>memories</strong> + <strong>articles</strong> (1079+) + <strong>knowledge</strong> + <strong>agents</strong> + <strong>brand</strong> + <strong>templates</strong>.
          </p>
        </div>
      )}

      {/* SEARCH FORM */}
      <div className="rounded-lg border border-border bg-card p-4 mb-5 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search(); }}
            placeholder='napr. "kybernetická bezpečnosť cloud" alebo "Example Org kariera"…'
            className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? '...' : 'Search'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-muted-foreground">Sources:</span>
          {ALL_SOURCES.map(s => (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={`px-2 py-1 rounded border ${enabledSources.includes(s) ? SOURCE_COLORS[s] : 'bg-muted text-muted-foreground border-border opacity-50'}`}
            >
              {s}
            </button>
          ))}
          <span className="ml-3 text-muted-foreground">minScore:</span>
          <input
            type="number" step="0.05" min="0" max="1"
            value={minScore}
            onChange={e => setMinScore(parseFloat(e.target.value))}
            className="w-16 px-2 py-1 rounded bg-background border border-border"
          />
          <span className="text-muted-foreground">limit:</span>
          <input
            type="number" min="1" max="50"
            value={limit}
            onChange={e => setLimit(parseInt(e.target.value, 10))}
            className="w-16 px-2 py-1 rounded bg-background border border-border"
          />
        </div>
      </div>

      {error && <div className="p-3 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-sm mb-4">{error}</div>}

      {/* RESULTS SUMMARY */}
      {result && (
        <div className="mb-3 flex items-center gap-3 text-sm flex-wrap">
          <span className="font-semibold">{result.total_hits} hits</span>
          <span className="text-muted-foreground">in {result.durationMs}ms</span>
          {Object.entries(result.by_source).map(([source, count]) => (
            <span key={source} className={`px-2 py-0.5 rounded text-xs border ${SOURCE_COLORS[source] || ''}`}>
              {source}: {count}
            </span>
          ))}
        </div>
      )}

      {/* RESULTS LIST */}
      {result && result.results.length === 0 && (
        <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded">
          0 hits — try lower minScore or broader query.
        </div>
      )}

      {result && result.results.length > 0 && (
        <div className="space-y-2">
          {result.results.map((hit, i) => (
            <div key={hit.id} className="rounded-lg border border-border bg-card p-3 hover:bg-card/80 transition-colors">
              <div className="flex items-start gap-3 mb-1.5">
                <span className="text-muted-foreground text-xs font-mono mt-1">#{i + 1}</span>
                <span className={`px-2 py-0.5 rounded text-xs border ${SOURCE_COLORS[hit.source]}`}>
                  {hit.source}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  score {hit.score.toFixed(3)}
                </span>
                {hit.meta?.is_anchor && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">⚓ anchor</span>}
                {hit.meta?.spirit_level !== undefined && <span className="text-xs text-muted-foreground">spirit {hit.meta.spirit_level}</span>}
                {hit.meta?.domain && <span className="text-xs text-muted-foreground">[{hit.meta.domain}]</span>}
              </div>
              {hit.title && <div className="font-semibold text-sm mb-1">{hit.title}</div>}
              <div className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{hit.preview}</div>
              {hit.meta?.url && (
                <a href={hit.meta.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                  {hit.meta.url} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {!result && !loading && (
        <div className="p-6 text-center text-muted-foreground">
          {showHeader
            ? 'Enter a query above to search the entire Brain knowledge base in one call.'
            : 'Zadaj otázku — vyhľadávanie spojí memories, články, knowledge, agentov, brand a šablóny do jedného poľa.'}
        </div>
      )}
    </div>
  );
}
