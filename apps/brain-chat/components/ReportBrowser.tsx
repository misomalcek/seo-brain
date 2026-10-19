'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { getLatestDashboard, generateDashboard, getDashboardSnapshotUrl, getDashboardHistory } from '@/lib/api';
import type { DashboardSnapshot } from '@/lib/api';
import { HtmlDocumentViewer } from './HtmlDocumentViewer';
import { useToast } from './Toast';

const DASHBOARD_TYPES = [
  { type: 'seo', label: 'SEO', icon: '📈' },
  { type: 'content', label: 'Content', icon: '✏️' },
  { type: 'ceo', label: 'CEO', icon: '👔' },
  { type: 'keywords', label: 'Kľúčové slová', icon: '🔑' },
  { type: 'audit', label: 'Site Audit', icon: '🔍' },
  { type: 'links', label: 'Link Profil', icon: '🔗' },
  { type: 'visibility', label: 'Viditeľnosť', icon: '👁' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface ReportBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export function ReportBrowser({ isOpen, onClose, embedded }: ReportBrowserProps) {
  const stableOnClose = useCallback(onClose, [onClose]);
  const modalRef = useModalA11y(isOpen, stableOnClose);
  const { addToast } = useToast();

  const [dashboards, setDashboards] = useState<Record<string, DashboardSnapshot | null>>({});
  const [dashLoading, setDashLoading] = useState(false);
  const [viewingDashboard, setViewingDashboard] = useState<DashboardSnapshot | null>(null);
  const [generatingDash, setGeneratingDash] = useState<string | null>(null);
  const [dashHistory, setDashHistory] = useState<Record<string, DashboardSnapshot[]>>({});
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const loadDashboards = async () => {
    setDashLoading(true);
    try {
      const results = await Promise.all(
        DASHBOARD_TYPES.map(async d => {
          try {
            const data = await getLatestDashboard(d.type);
            return { type: d.type, snapshot: data.snapshot };
          } catch {
            return { type: d.type, snapshot: null };
          }
        })
      );
      const map: Record<string, DashboardSnapshot | null> = {};
      for (const r of results) map[r.type] = r.snapshot;
      setDashboards(map);
    } catch (err) {
      console.error('Failed to load dashboards:', err);
    } finally {
      setDashLoading(false);
    }
  };

  const handleGenerateDash = async (type: string) => {
    setGeneratingDash(type);
    try {
      const data = await generateDashboard(type);
      if (data.snapshot) {
        setDashboards(prev => ({ ...prev, [type]: data.snapshot }));
        addToast(`${type.toUpperCase()} dashboard vygenerovaný`, 'success');
      }
    } catch {
      addToast('Generovanie zlyhalo', 'error');
    } finally {
      setGeneratingDash(null);
    }
  };

  const handleLoadHistory = async (type: string) => {
    if (showHistory === type) { setShowHistory(null); return; }
    try {
      const data = await getDashboardHistory(type);
      setDashHistory(prev => ({ ...prev, [type]: data.snapshots }));
      setShowHistory(type);
    } catch {
      addToast('Nepodarilo sa načítať históriu', 'error');
    }
  };

  useEffect(() => {
    if (isOpen) loadDashboards();
  }, [isOpen]);

  if (!isOpen) return null;

  const innerContent = (
    <div className={embedded ? "flex flex-col h-full min-h-0" : "relative w-full max-w-lg h-full bg-background border-l border-border overflow-hidden flex flex-col animate-in slide-in-from-right"}
      onClick={e => e.stopPropagation()}
    >
      {/* Header — skip in embedded mode */}
      {!embedded && <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
            <h2 id="dashboard-browser-title" className="text-lg font-bold flex items-center gap-2"><span aria-hidden="true">📊</span> Dashboardy</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer" aria-label="Zavrieť">✕</button>
          </div>
        </div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewingDashboard ? (
            <div className="flex flex-col h-full">
              <button onClick={() => setViewingDashboard(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer shrink-0">
                ← Späť
              </button>
              <HtmlDocumentViewer
                srcUrl={getDashboardSnapshotUrl(viewingDashboard.id)}
                title={viewingDashboard.title}
                subtitle={formatDate(viewingDashboard.createdAt)}
                mode="panel"
              />
            </div>
          ) : dashLoading ? (
            <div className="text-center text-muted-foreground py-8 animate-pulse">Načítavam dashboardy...</div>
          ) : (
            <div className="space-y-3">
              {DASHBOARD_TYPES.map(dt => {
                const snap = dashboards[dt.type];
                const isGenerating = generatingDash === dt.type;
                const history = dashHistory[dt.type] || [];
                const isHistoryOpen = showHistory === dt.type;
                return (
                  <div key={dt.type} className="p-4 rounded-xl border border-border bg-card/50 hover:border-border transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{dt.icon}</span>
                        <span className="text-sm font-semibold">{dt.label} Dashboard</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {snap && (
                          <button onClick={() => handleLoadHistory(dt.type)} className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer">
                            {isHistoryOpen ? '▲' : '▼'} História
                          </button>
                        )}
                        <button
                          onClick={() => handleGenerateDash(dt.type)}
                          disabled={isGenerating}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isGenerating ? 'Generujem...' : 'Obnoviť'}
                        </button>
                      </div>
                    </div>
                    {snap ? (
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">{snap.title} · {formatDate(snap.createdAt)}</div>
                        {snap.dataSummary && (
                          <div className="flex gap-3 mb-2 flex-wrap">
                            {Object.entries(snap.dataSummary).slice(0, 4).map(([key, val]) => (
                              typeof val === 'number' && (
                                <div key={key} className="text-xs">
                                  <span className="text-muted-foreground">{key}: </span>
                                  <span className="font-semibold">{val > 1000 ? `${(val / 1000).toFixed(1)}K` : val}</span>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        <button onClick={() => setViewingDashboard(snap)} className="w-full py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5 transition-colors cursor-pointer">
                          Zobraziť dashboard
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Zatiaľ žiadny snapshot. Kliknite na Obnoviť.</div>
                    )}
                    {isHistoryOpen && history.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        {history.slice(0, 5).map(h => (
                          <button key={h.id} onClick={() => setViewingDashboard(h)} className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer">
                            {formatDate(h.createdAt)} — {h.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );

  if (embedded) return innerContent;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose} role="dialog" aria-modal="true" ref={modalRef}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      {innerContent}
    </div>
  );
}
