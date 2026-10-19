'use client';

/**
 * ToolsBrowser — overlay browser exposing all Brain tools to users.
 * Transparency feature per Brain Pt II focus area #4.
 * Mirrors AgentBrowser/PersonaBrowser pattern.
 *
 * Read-only view: shows what tools exist, their descriptions, which categories,
 * input schema preview. Future: invoke tool directly with parameter helper.
 */

import { useState, useEffect, useMemo } from 'react';
import { getTools } from '@/lib/api';
import type { ToolInfo, ToolCategory } from '@/lib/api';

interface ToolsBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  seo: '#F97316',         // orange
  gsc: '#10B981',         // emerald
  search: '#64748B',      // gray
  ahrefs: '#F97316',
  utility: '#64748B',
  uncategorized: '#64748B',
};

function categoryOfTool(toolName: string, categories: Record<string, ToolCategory>): string {
  for (const [catKey, cat] of Object.entries(categories)) {
    if (cat.tools.includes(toolName)) return catKey;
  }
  return 'uncategorized';
}

export function ToolsBrowser({ isOpen, onClose, embedded }: ToolsBrowserProps) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [categories, setCategories] = useState<Record<string, ToolCategory>>({});
  const [ahrefsStatus, setAhrefsStatus] = useState<string>('unknown');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen && tools.length === 0) {
      setLoading(true);
      getTools()
        .then(data => {
          setTools(data.tools);
          setCategories(data.categories);
          setAhrefsStatus(data.status?.ahrefs ?? 'unknown');
        })
        .catch(err => console.error('Failed to load tools:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, tools.length]);

  const filtered = useMemo(() => {
    return tools.filter(t => {
      if (categoryFilter !== 'all') {
        const cat = categoryOfTool(t.name, categories);
        if (cat !== categoryFilter) return false;
      }
      if (filter) {
        const q = filter.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [tools, categories, filter, categoryFilter]);

  // Group filtered tools by category
  const grouped = useMemo(() => {
    const map: Record<string, ToolInfo[]> = {};
    for (const t of filtered) {
      const cat = categoryOfTool(t.name, categories);
      (map[cat] ??= []).push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, categories]);

  const content = (
    <div className="flex flex-col h-full">
      {/* Header / filters */}
      <div className="px-4 py-3 border-b border-border/40 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Hľadať nástroj (meno, popis)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 h-9 px-3 bg-foreground/[0.05] dark:bg-white/[0.06] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label="Hľadať nástroj"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} z {tools.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Kategória:</span>
          <button
            onClick={() => setCategoryFilter('all')}
            className={`h-7 px-2.5 rounded-full transition-colors ${
              categoryFilter === 'all' ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground'
            }`}
          >
            Všetky
          </button>
          {Object.entries(categories).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`h-7 px-2.5 rounded-full transition-colors inline-flex items-center gap-1 ${
                categoryFilter === key ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground'
              }`}
            >
              <span aria-hidden>{cat.icon}</span> {cat.name}
            </button>
          ))}
          {ahrefsStatus !== 'unknown' && (
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${ahrefsStatus === 'configured' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-rose-500/15 text-rose-600'}`}>
              Ahrefs: {ahrefsStatus}
            </span>
          )}
        </div>
      </div>

      {/* Tool list grouped by category */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Načítavam nástroje...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground text-sm mb-2">Žiadne nástroje pre tento filter.</p>
            <button onClick={() => { setFilter(''); setCategoryFilter('all'); }} className="text-xs text-primary hover:underline">
              Vyčistiť filtre
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([catKey, catTools]) => {
              const catMeta = categories[catKey];
              const color = CATEGORY_COLORS[catKey] ?? '#64748B';
              return (
                <div key={catKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-xs uppercase tracking-[0.12em] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${color}1F`, color }}
                    >
                      <span aria-hidden>{catMeta?.icon ?? '🛠️'}</span>
                      {catMeta?.name ?? catKey}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{catTools.length} {catTools.length === 1 ? 'nástroj' : catTools.length < 5 ? 'nástroje' : 'nástrojov'}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {catTools.map(t => (
                      <details
                        key={t.name}
                        className="group rounded-xl border border-border/40 bg-foreground/[0.02] hover:bg-foreground/[0.04] transition-colors"
                        style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                      >
                        <summary className="cursor-pointer px-4 py-3 list-none flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-xs font-semibold text-foreground truncate">{t.name}</div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.description}</p>
                          </div>
                          <svg className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </summary>
                        <div className="px-4 pb-3 pt-1 border-t border-border/30 mt-2">
                          <p className="text-xs text-muted-foreground mb-2 whitespace-pre-line">{t.description}</p>
                          {t.inputSchema && (
                            <div className="mt-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Vstupné parametre</div>
                              <pre className="text-[10px] bg-foreground/[0.04] rounded-lg p-2 overflow-x-auto font-mono text-muted-foreground max-h-48">{JSON.stringify(t.inputSchema, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border/40 shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <h2 className="font-semibold">Tools</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-foreground/[0.05]" aria-label="Zatvoriť">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
