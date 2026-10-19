'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getVectorArticles, getVectorArticle, searchVector, getRelatedArticles,
  getCannibalization, getVectorStats, deleteVectorArticle, refreshVectorArticle,
  triggerScrape,
  type VectorArticle, type VectorSearchResult, type CannibalizationPair,
} from '../lib/api';

// Domain colors — auto-assign from palette. Domains loaded dynamically from stats.
const DOMAIN_COLOR_PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
];
function getDomainColor(domain: string, allDomains: string[]): string {
  const idx = allDomains.indexOf(domain);
  return DOMAIN_COLOR_PALETTE[idx >= 0 ? idx % DOMAIN_COLOR_PALETTE.length : 0];
}

interface VectorBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  onAddToContext?: (content: string, title: string) => void;
}

type Tab = 'articles' | 'knowledge' | 'search' | 'connections';

export function VectorBrowser({ isOpen, onClose, onAddToContext, embedded }: VectorBrowserProps) {
  const [tab, setTab] = useState<Tab>('articles');
  const [articles, setArticles] = useState<VectorArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Search tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'semantic' | 'lexical'>('hybrid');
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Connections tab
  const [selectedArticle, setSelectedArticle] = useState<VectorArticle | null>(null);
  const [related, setRelated] = useState<VectorSearchResult[]>([]);
  const [cannibalization, setCannibalization] = useState<CannibalizationPair[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Stats
  const [stats, setStats] = useState<{ totalArticles: number; byDomain: Record<string, number>; embeddedCount: number; lastScrape: string | null } | null>(null);

  // Add URL
  const [addUrlInput, setAddUrlInput] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);

  // Scrape status
  const [scraping, setScraping] = useState(false);

  // Znalosti (brain_embeddings)
  const [brainItems, setBrainItems] = useState<any[]>([]);
  const [brainLoading, setBrainLoading] = useState(false);

  const PAGE_SIZE = 20;

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVectorArticles({
        domain: domainFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        sort: 'title',
      });
      setArticles(data.articles);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load articles:', err);
    } finally {
      setLoading(false);
    }
  }, [domainFilter, page]);

  useEffect(() => {
    if (isOpen) {
      loadArticles();
      getVectorStats().then(setStats).catch(console.error);
    }
  }, [isOpen, loadArticles]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await searchVector(searchQuery, searchMode, domainFilter || undefined);
      setSearchResults(data.results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchMode, domainFilter]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedContent(null);
      return;
    }
    setExpandedId(id);
    try {
      const data = await getVectorArticle(id);
      setExpandedContent(data.article.content_md || '');
    } catch {
      setExpandedContent('(nepodarilo sa načítať)');
    }
  }, [expandedId]);

  const handleShowConnections = useCallback(async (article: VectorArticle) => {
    setTab('connections');
    setSelectedArticle(article);
    setLoadingRelated(true);
    try {
      const [relData, cannData] = await Promise.all([
        getRelatedArticles(article.id),
        getCannibalization(article.domain),
      ]);
      setRelated(relData.related);
      setCannibalization(cannData.pairs.filter(
        p => p.article1.id === article.id || p.article2.id === article.id
      ));
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoadingRelated(false);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Vymazať článok z indexu?')) return;
    await deleteVectorArticle(id);
    loadArticles();
  }, [loadArticles]);

  const handleRefresh = useCallback(async (id: string) => {
    await refreshVectorArticle(id);
    loadArticles();
  }, [loadArticles]);

  const handleScrape = useCallback(async () => {
    if (!confirm(`Spustiť scrape${domainFilter ? ` pre ${domainFilter}` : ' všetkých domén'}? Trvá 2-10 minút.`)) return;
    setScraping(true);
    try {
      await triggerScrape(domainFilter || undefined);
      // Poll for completion
      setTimeout(async () => {
        await loadArticles();
        const newStats = await getVectorStats();
        setStats(newStats);
        setScraping(false);
        alert('Scrape dokončený!');
      }, 5000);
    } catch {
      setScraping(false);
      alert('Scrape zlyhal.');
    }
  }, [domainFilter, loadArticles]);

  const handleAddUrl = useCallback(async () => {
    if (!addUrlInput.trim()) return;
    setAddingUrl(true);
    try {
      // Call scrape endpoint with single URL
      const res = await fetch('/api/vector/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: addUrlInput.trim() }),
      });
      if (res.ok) {
        setAddUrlInput('');
        loadArticles();
        alert('URL pridané a zaindexované.');
      } else {
        alert('Nepodarilo sa pridať URL.');
      }
    } catch {
      alert('Chyba pri pridávaní URL.');
    } finally {
      setAddingUrl(false);
    }
  }, [addUrlInput, loadArticles]);

  const loadBrainItems = useCallback(async () => {
    setBrainLoading(true);
    try {
      const res = await fetch('/api/vector/brain-items', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBrainItems(data.items || []);
      }
    } catch { /* ignore */ }
    finally { setBrainLoading(false); }
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!isOpen) return null;

  const content = (
    <div className={embedded ? "flex flex-col h-full min-h-0" : "bg-background rounded-xl shadow-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden"}>
      {/* Header — skip in embedded mode (FeatureOverlay provides header) */}
      {!embedded && <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧲</span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Vektory</h2>
              {stats && (
                <p className="text-xs text-muted-foreground">
                  {stats.totalArticles} článkov · {stats.embeddedCount} embeddovaných
                  {stats.lastScrape && ` · posledný scrape ${new Date(stats.lastScrape).toLocaleDateString('sk-SK')}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              {scraping ? '⏳ Prebieha...' : '↻ Scrape'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-surface-hover rounded-lg transition-colors" aria-label="Zavrieť">✕</button>
          </div>
        </div>}

        {/* Tabs — Mobile-first 2026-04-28: overflow-x-auto + smaller padding so all 4 tabs reachable on narrow screens (was truncating "Spojenia"). */}
        <div className="flex gap-1 px-3 sm:px-6 py-2 border-b border-border overflow-x-auto whitespace-nowrap scrollbar-none">
          {([
            { id: 'articles' as Tab, label: 'Články', icon: '📄' },
            { id: 'knowledge' as Tab, label: 'Znalosti', icon: '🧠' },
            { id: 'search' as Tab, label: 'Hľadanie', icon: '🔍' },
            { id: 'connections' as Tab, label: 'Spojenia', icon: '🔗' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                  : 'text-muted-foreground hover:bg-surface-hover'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}

          {/* Domain filter select */}
          <select
            value={domainFilter || ''}
            onChange={e => { setDomainFilter(e.target.value || null); setPage(0); }}
            className="ml-auto px-2 py-1 text-xs rounded-lg border border-border bg-surface text-foreground"
          >
            <option value="">Všetky ({stats?.totalArticles || 0})</option>
            {Object.entries(stats?.byDomain || {}).map(([d, count]) => (
              <option key={d} value={d}>{d} ({count})</option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'articles' && (
            <div className="space-y-2">
              {/* Add URL */}
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={addUrlInput}
                  onChange={e => setAddUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
                  placeholder="Pridať URL na scrape + index (napr. https://example.com/clanky/...)"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground"
                />
                <button
                  onClick={handleAddUrl}
                  disabled={addingUrl || !addUrlInput.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {addingUrl ? '...' : '+ Pridať'}
                </button>
              </div>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Načítavam...</p>
              ) : articles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Žiadne články. Spustite scrape.</p>
              ) : (
                <>
                  {articles.map(a => (
                    <div key={a.id} className="border border-border rounded-lg overflow-hidden">
                      {/* Mobile-first 2026-04-28: stack badge+title on row 1, meta on row 2. Title gets full width on narrow. */}
                      <div
                        className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-3 cursor-pointer hover:bg-surface-hover transition-colors"
                        onClick={() => handleExpand(a.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`px-2 py-0.5 text-[10px] sm:text-xs rounded-full shrink-0 max-w-[80px] sm:max-w-none truncate ${getDomainColor(a.domain, Object.keys(stats?.byDomain || {})) || 'bg-muted'}`}>
                            {a.domain.replace('.sk', '')}
                          </span>
                          <span className="flex-1 text-sm font-medium text-foreground truncate min-w-0">{a.title}</span>
                          <span className="text-muted-foreground sm:hidden shrink-0">{expandedId === a.id ? '▾' : '▸'}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-muted-foreground shrink-0 sm:ml-auto pl-[24px] sm:pl-0">
                          <span>{a.word_count} slov</span>
                          <span>{new Date(a.scraped_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' })}</span>
                          <span className="hidden sm:inline">{expandedId === a.id ? '▾' : '▸'}</span>
                        </div>
                      </div>
                      {expandedId === a.id && (
                        <div className="px-4 pb-4 border-t border-border">
                          <div className="flex gap-2 py-2">
                            <a href={a.url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">{a.url}</a>
                          </div>
                          <div className="bg-surface-hover rounded-lg p-3 max-h-60 overflow-y-auto text-xs text-foreground whitespace-pre-wrap font-mono">
                            {expandedContent || 'Načítavam...'}
                          </div>
                          <div className="flex gap-2 mt-2">
                            {onAddToContext && (
                              <button
                                onClick={() => onAddToContext(expandedContent || '', a.title)}
                                className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 dark:bg-primary/20 dark:text-primary"
                              >+ Kontext</button>
                            )}
                            <button
                              onClick={() => handleShowConnections(a)}
                              className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400"
                            >🔗 Spojenia</button>
                            <button
                              onClick={() => handleRefresh(a.id)}
                              className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-surface-active"
                            >↻ Refresh</button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                            >🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 pt-4">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-3 py-1 text-sm rounded-lg bg-muted disabled:opacity-30"
                      >←</button>
                      <span className="px-3 py-1 text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-3 py-1 text-sm rounded-lg bg-muted disabled:opacity-30"
                      >→</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'knowledge' && (
            <div className="space-y-3">
              {brainItems.length === 0 && !brainLoading && (
                <div className="text-center py-8">
                  <button onClick={loadBrainItems} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                    Načítať znalosti
                  </button>
                </div>
              )}
              {brainLoading && <p className="text-center text-muted-foreground py-8">Načítavam...</p>}
              {brainItems.length > 0 && (
                <>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {['agent', 'knowledge', 'brand', 'memory', 'template'].map(type => {
                      const count = brainItems.filter(i => i.source_type === type).length;
                      if (!count) return null;
                      return (
                        <span key={type} className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground dark:text-muted-foreground">
                          {type}: {count}
                        </span>
                      );
                    })}
                  </div>
                  {brainItems.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 border border-border rounded-lg">
                      <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                        item.source_type === 'agent' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        item.source_type === 'knowledge' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        item.source_type === 'brand' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                        item.source_type === 'memory' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-muted text-muted-foreground'
                      }`}>{item.source_type}</span>
                      <span className="text-sm text-foreground truncate flex-1">{item.title}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Hľadaj sémanticky... napr. 'ako zmeniť kariéru v IT'"
                  className="flex-1 px-4 py-2 text-sm rounded-lg border border-border bg-surface text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
                <select
                  value={searchMode}
                  onChange={e => setSearchMode(e.target.value as any)}
                  className="px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground"
                >
                  <option value="hybrid">Hybrid</option>
                  <option value="semantic">Sémantický</option>
                  <option value="lexical">Lexikálny</option>
                </select>
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {searching ? '...' : 'Hľadať'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map(r => (
                    <div key={r.id} className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-surface-hover transition-colors">
                      <span className={`mt-0.5 px-2 py-0.5 text-xs rounded-full font-bold ${
                        r.score > 0.7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        r.score > 0.4 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {(r.score * 100).toFixed(0)}%
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${getDomainColor(r.domain, Object.keys(stats?.byDomain || {})) || ''}`}>{r.domain.replace('.sk', '')}</span>
                          <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
                        </div>
                        {r.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.snippet}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleShowConnections(r)}
                          className="p-1 text-xs text-purple-600 hover:bg-purple-50 rounded dark:hover:bg-purple-900/20"
                          title="Spojenia"
                        >🔗</button>
                        {onAddToContext && (
                          <button
                            onClick={async () => {
                              const data = await getVectorArticle(r.id);
                              onAddToContext(data.article.content_md || '', r.title);
                            }}
                            className="p-1 text-xs text-primary hover:bg-primary/10 rounded"
                            title="Pridať do kontextu"
                          >+</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="text-center text-muted-foreground py-8">Žiadne výsledky pre &quot;{searchQuery}&quot;</p>
              )}
            </div>
          )}

          {tab === 'connections' && (
            <div className="space-y-4">
              {!selectedArticle ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Vyberte článok z karty Články alebo Hľadanie</p>
                  <p className="text-muted-foreground text-sm mt-1">kliknite na 🔗 ikonu pri článku</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getDomainColor(selectedArticle.domain, Object.keys(stats?.byDomain || {})) || ''}`}>{selectedArticle.domain}</span>
                      <span className="font-medium text-sm text-foreground">{selectedArticle.title}</span>
                    </div>
                    <a href={selectedArticle.url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">{selectedArticle.url}</a>
                  </div>

                  {/* Cannibalization warnings */}
                  {cannibalization.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">⚠️ Kanibalizácia ({cannibalization.length})</h3>
                      {cannibalization.map((pair, i) => {
                        const other = pair.article1.id === selectedArticle.id ? pair.article2 : pair.article1;
                        return (
                          <div key={i} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200 font-bold">
                              {(pair.similarity * 100).toFixed(0)}%
                            </span>
                            <span className="text-sm text-foreground truncate flex-1">{other.title}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] rounded ${getDomainColor(other.domain, Object.keys(stats?.byDomain || {})) || ''}`}>{other.domain.replace('.sk', '')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Related articles */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      🔗 Súvisiace články {loadingRelated && '...'}
                    </h3>
                    {related.map(r => (
                      <div key={r.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-surface-hover">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                          r.score > 0.7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          r.score > 0.4 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {(r.score * 100).toFixed(0)}%
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${getDomainColor(r.domain, Object.keys(stats?.byDomain || {})) || ''}`}>{r.domain.replace('.sk', '')}</span>
                        <span className="text-sm text-foreground truncate flex-1">{r.title}</span>
                        <button
                          onClick={() => handleShowConnections(r)}
                          className="p-1 text-xs text-purple-600 hover:bg-purple-50 rounded dark:hover:bg-purple-900/20"
                        >🔗</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
  );

  // In embedded mode, return content directly (no modal wrapper)
  if (embedded) return content;

  // Standalone mode: wrap in fixed modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {content}
    </div>
  );
}
