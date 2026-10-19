'use client';

import { useState } from 'react';

interface FreshnessInfo {
  source: 'mcp_cache' | 'file_snapshot';
  cachedAt?: string | Date;
  expiresAt?: string | Date;
  ageHours?: number;
}

interface ToolResultDisplayProps {
  data: any;
  toolType: string;
}

export function ToolResultDisplay({ data, toolType }: ToolResultDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  if (!data) return null;

  // Extract and strip _freshness so it never leaks into renderers
  const freshness: FreshnessInfo | null =
    data && typeof data === 'object' && !Array.isArray(data) && '_freshness' in data
      ? (data._freshness as FreshnessInfo)
      : null;
  const cleanData = freshness
    ? (({ _freshness, ...rest }) => rest)(data as Record<string, unknown>)
    : data;

  const content = renderContent(cleanData, toolType, expanded, setExpanded);

  return (
    <>
      {content}
      {freshness && <FreshnessChip freshness={freshness} />}
    </>
  );
}

function renderContent(
  data: any,
  toolType: string,
  expanded: boolean,
  setExpanded: (v: boolean) => void
) {
  if (data.error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
        <div className="font-semibold mb-1">Error</div>
        <div className="text-sm">{data.message || data.error}</div>
      </div>
    );
  }

  // Domain Rating
  if (toolType === 'domain' && data.domain_rating) {
    const dr = data.domain_rating;
    return (
      <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-400">{dr.domain_rating}</div>
            <div className="text-xs text-muted-foreground mt-1">Domain Rating</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-purple-400">#{dr.ahrefs_rank?.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Ahrefs Rank</div>
          </div>
        </div>
      </div>
    );
  }

  // SERP Results
  if (toolType === 'serp' && data.positions) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground mb-2">SERP Results (Top 10)</div>
        {data.positions.slice(0, 10).map((pos: any, idx: number) => (
          <div key={idx} className="flex items-center gap-3 p-2 bg-card/50 rounded-lg border border-border/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
              {pos.position}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{pos.title}</div>
              <div className="text-xs text-muted-foreground truncate">{pos.url}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-blue-400">DR {pos.domain_rating}</div>
              <div className="text-xs text-muted-foreground">{pos.traffic?.toLocaleString()} traffic</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Organic Keywords
  if (toolType === 'keywords' && Array.isArray(data.keywords)) {
    return <KeywordTable keywords={data.keywords} />;
  }
  // Alternative: keywords might be at top level as array
  if (Array.isArray(data) && data.length > 0 && data[0].keyword) {
    return <KeywordTable keywords={data} />;
  }

  // Backlinks
  if (toolType === 'backlinks' && (data.backlinks || Array.isArray(data))) {
    const links = data.backlinks || data;
    return <BacklinkTable backlinks={Array.isArray(links) ? links : []} />;
  }

  // Top Pages
  if (toolType === 'top_pages' && (data.pages || Array.isArray(data))) {
    const pages = data.pages || data;
    return <TopPagesTable pages={Array.isArray(pages) ? pages : []} />;
  }

  // Competitors
  if (toolType === 'competitors' && (data.competitors || Array.isArray(data))) {
    const comps = data.competitors || data;
    return <CompetitorsTable competitors={Array.isArray(comps) ? comps : []} />;
  }

  // GSC Search Analytics / Top Queries
  if ((toolType === 'gsc_search_analytics' || toolType === 'gsc_top_queries') && (data.rows || Array.isArray(data))) {
    const rows = data.rows || data;
    return <GSCTable rows={Array.isArray(rows) ? rows : []} />;
  }

  // GSC Top Pages
  if (toolType === 'gsc_top_pages' && (data.rows || Array.isArray(data))) {
    const rows = data.rows || data;
    return <GSCPagesTable rows={Array.isArray(rows) ? rows : []} />;
  }

  // GSC Quick Wins
  if (toolType === 'gsc_quick_wins' && (data.rows || Array.isArray(data))) {
    const rows = data.rows || data;
    return (
      <div>
        <div className="text-sm font-semibold text-lime-400 mb-2">🎯 Quick Wins</div>
        <GSCTable rows={Array.isArray(rows) ? rows : []} />
      </div>
    );
  }

  // Generic object with interesting keys - try to render as key-value
  if (typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length <= 12 && keys.every(k => typeof data[k] !== 'object' || data[k] === null)) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {keys.map(key => (
            <div key={key} className="bg-card/50 rounded-lg p-3 border border-border/50">
              <div className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</div>
              <div className="text-sm font-semibold mt-0.5">
                {typeof data[key] === 'number' ? data[key].toLocaleString() : String(data[key] ?? '—')}
              </div>
            </div>
          ))}
        </div>
      );
    }
  }

  // Default: collapsible raw JSON
  const json = JSON.stringify(data, null, 2);
  const isLong = json.length > 500;

  return (
    <div>
      <pre className="bg-card/50 rounded-lg p-3 text-xs overflow-x-auto max-h-60 overflow-y-auto">
        {isLong && !expanded ? json.slice(0, 500) + '\n...' : json}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:text-primary/80 mt-1 cursor-pointer"
        >
          {expanded ? 'Zobrazit menej' : 'Zobrazit vsetko'}
        </button>
      )}
    </div>
  );
}

// ─── Freshness chip ─────────────────────────────────

function FreshnessChip({ freshness }: { freshness: FreshnessInfo }) {
  if (freshness.source === 'file_snapshot') {
    return (
      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
        <span className="opacity-60">📸 snapshot</span>
      </div>
    );
  }

  const ageHours = freshness.ageHours ?? null;
  let label = 'cache';
  let colorClass = 'text-green-400/70';

  if (ageHours !== null) {
    if (ageHours < 1) {
      label = `< 1h ago`;
      colorClass = 'text-green-400/80';
    } else if (ageHours < 6) {
      label = `${ageHours.toFixed(1)}h ago`;
      colorClass = 'text-green-400/70';
    } else if (ageHours < 24) {
      label = `${Math.round(ageHours)}h ago`;
      colorClass = 'text-yellow-400/70';
    } else {
      const days = Math.round(ageHours / 24);
      label = `${days}d ago`;
      colorClass = 'text-orange-400/70';
    }
  }

  return (
    <div className={`flex items-center gap-1 mt-1.5 text-xs ${colorClass}`}>
      <span>⏱</span>
      <span>{label} (cache)</span>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────

function KeywordTable({ keywords }: { keywords: any[] }) {
  const [sortBy, setSortBy] = useState<string>('volume');
  const [asc, setAsc] = useState(false);

  const sorted = [...keywords].sort((a, b) => {
    const va = a[sortBy] ?? 0;
    const vb = b[sortBy] ?? 0;
    return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const toggleSort = (key: string) => {
    if (sortBy === key) setAsc(!asc);
    else { setSortBy(key); setAsc(false); }
  };

  const SortIcon = ({ k }: { k: string }) => (
    <span className="ml-1 opacity-50">{sortBy === k ? (asc ? '↑' : '↓') : ''}</span>
  );

  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-green-400 mb-2">🔑 Keywords ({keywords.length})</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('keyword')}>
              Keyword<SortIcon k="keyword" />
            </th>
            <th className="text-right py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('volume')}>
              Volume<SortIcon k="volume" />
            </th>
            <th className="text-right py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('keyword_difficulty')}>
              KD<SortIcon k="keyword_difficulty" />
            </th>
            <th className="text-right py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('position')}>
              Pos<SortIcon k="position" />
            </th>
            <th className="text-right py-2 px-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('traffic')}>
              Traffic<SortIcon k="traffic" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 20).map((kw: any, i: number) => (
            <tr key={i} className="border-b border-border/30 hover:bg-card/50">
              <td className="py-1.5 px-2 font-medium">{kw.keyword}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{kw.volume?.toLocaleString() ?? '—'}</td>
              <td className="py-1.5 px-2 text-right">
                <KDBadge value={kw.keyword_difficulty} />
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{kw.position ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{kw.traffic?.toLocaleString() ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {keywords.length > 20 && (
        <div className="text-xs text-muted-foreground mt-2 text-center">
          Zobrazuje 20 z {keywords.length} keywords
        </div>
      )}
    </div>
  );
}

function KDBadge({ value }: { value?: number }) {
  if (value == null) return <span>—</span>;
  const color = value <= 30 ? 'text-green-400' : value <= 60 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`tabular-nums font-medium ${color}`}>{value}</span>;
}

function BacklinkTable({ backlinks }: { backlinks: any[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-purple-400 mb-2">🔗 Backlinks ({backlinks.length})</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2">Source</th>
            <th className="text-left py-2 px-2">Anchor</th>
            <th className="text-right py-2 px-2">DR</th>
            <th className="text-right py-2 px-2">Traffic</th>
          </tr>
        </thead>
        <tbody>
          {backlinks.slice(0, 15).map((bl: any, i: number) => (
            <tr key={i} className="border-b border-border/30 hover:bg-card/50">
              <td className="py-1.5 px-2 truncate max-w-[200px]">{bl.url_from || bl.referring_page || '—'}</td>
              <td className="py-1.5 px-2 truncate max-w-[150px] text-muted-foreground">{bl.anchor || '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-blue-400">{bl.domain_rating ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{bl.traffic?.toLocaleString() ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopPagesTable({ pages }: { pages: any[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-yellow-400 mb-2">📄 Top Pages ({pages.length})</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2">URL</th>
            <th className="text-right py-2 px-2">Traffic</th>
            <th className="text-right py-2 px-2">Keywords</th>
            <th className="text-right py-2 px-2">Value</th>
          </tr>
        </thead>
        <tbody>
          {pages.slice(0, 15).map((p: any, i: number) => (
            <tr key={i} className="border-b border-border/30 hover:bg-card/50">
              <td className="py-1.5 px-2 truncate max-w-[250px] font-medium">{p.url || '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{(p.traffic ?? p.organic_traffic)?.toLocaleString() ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{(p.keywords ?? p.organic_keywords)?.toLocaleString() ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">${((p.value ?? p.traffic_value ?? 0) / 100).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompetitorsTable({ competitors }: { competitors: any[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-red-400 mb-2">⚔️ Competitors ({competitors.length})</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2">Domain</th>
            <th className="text-right py-2 px-2">Common KW</th>
            <th className="text-right py-2 px-2">Traffic</th>
            <th className="text-right py-2 px-2">DR</th>
          </tr>
        </thead>
        <tbody>
          {competitors.slice(0, 10).map((c: any, i: number) => (
            <tr key={i} className="border-b border-border/30 hover:bg-card/50">
              <td className="py-1.5 px-2 font-medium">{c.domain || c.target || '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.common_keywords?.toLocaleString() ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.organic_traffic?.toLocaleString() ?? '—'}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-blue-400">{c.domain_rating ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GSCTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-emerald-400 mb-2">📊 Search Console ({rows.length} queries)</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2">Query</th>
            <th className="text-right py-2 px-2">Clicks</th>
            <th className="text-right py-2 px-2">Impr.</th>
            <th className="text-right py-2 px-2">CTR</th>
            <th className="text-right py-2 px-2">Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r: any, i: number) => {
            const query = r.keys?.[0] || r.query || '—';
            return (
              <tr key={i} className="border-b border-border/30 hover:bg-card/50">
                <td className="py-1.5 px-2 font-medium truncate max-w-[200px]">{query}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.clicks?.toLocaleString() ?? '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.impressions?.toLocaleString() ?? '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.ctr != null ? (r.ctr * 100).toFixed(1) + '%' : '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.position?.toFixed(1) ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GSCPagesTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold text-teal-400 mb-2">📄 GSC Top Pages ({rows.length})</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2">Page</th>
            <th className="text-right py-2 px-2">Clicks</th>
            <th className="text-right py-2 px-2">Impr.</th>
            <th className="text-right py-2 px-2">CTR</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map((r: any, i: number) => {
            const page = r.keys?.[0] || r.page || '—';
            const shortPage = page.replace(/^https?:\/\/[^/]+/, '');
            return (
              <tr key={i} className="border-b border-border/30 hover:bg-card/50">
                <td className="py-1.5 px-2 truncate max-w-[250px]" title={page}>{shortPage || '/'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.clicks?.toLocaleString() ?? '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.impressions?.toLocaleString() ?? '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.ctr != null ? (r.ctr * 100).toFixed(1) + '%' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
