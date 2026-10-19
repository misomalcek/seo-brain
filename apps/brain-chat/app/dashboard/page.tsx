'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  generateDashboard,
  getLatestDashboard,
  getDashboardHistory,
  getDashboardSnapshotUrl,
  deleteDashboardSnapshot,
  type DashboardSnapshot,
} from '@/lib/api';
import { HtmlDocumentViewer } from '@/components/HtmlDocumentViewer';

const TABS = [
  { id: 'seo', label: 'SEO', icon: '📈' },
  { id: 'content', label: 'Content', icon: '✏️' },
  { id: 'ceo', label: 'CEO', icon: '👔' },
  { id: 'keywords', label: 'Keywords', icon: '🎯' },
  { id: 'audit', label: 'Audit', icon: '🔍' },
  { id: 'links', label: 'Links', icon: '🔗' },
  { id: 'visibility', label: 'Visibility', icon: '📊' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('seo');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [history, setHistory] = useState<DashboardSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const loadLatest = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const data = await getLatestDashboard(type);
      setSnapshot(data.snapshot);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (type: string) => {
    try {
      const data = await getDashboardHistory(type);
      setHistory(data.snapshots);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadLatest(activeTab);
    setShowHistory(false);
  }, [activeTab, loadLatest]);


  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateDashboard(activeTab);
      setSnapshot(data.snapshot);
      setIframeKey(k => k + 1);
      if (showHistory) loadHistory(activeTab);
    } catch (err) {
      console.error('Generate failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectSnapshot = (snap: DashboardSnapshot) => {
    setSnapshot(snap);
    setIframeKey(k => k + 1);
    setShowHistory(false);
  };

  const handleToggleHistory = () => {
    if (!showHistory) loadHistory(activeTab);
    setShowHistory(!showHistory);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Naozaj vymazat tento snapshot?')) return;
    try {
      await deleteDashboardSnapshot(id);
      setHistory(prev => prev.filter(s => s.id !== id));
      if (snapshot?.id === id) {
        loadLatest(activeTab);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleDownload = () => {
    if (!snapshot) return;
    const url = getDashboardSnapshotUrl(snapshot.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.dashboardType}-dashboard-${new Date(snapshot.createdAt).toISOString().slice(0, 10)}.html`;
    a.click();
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('sk-SK', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0" style={{ minHeight: 'calc(100dvh - 8rem)' }}>
      {/* Compact header */}
      <div className="flex flex-wrap items-center justify-between px-1 py-2 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-x-auto">
          <h1 className="text-lg font-bold text-foreground shrink-0">Dashboard</h1>
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
              >
                <span>{tab.icon}</span> <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggleHistory}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showHistory
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-card border border-border'
            }`}
          >
            Historia
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-primary text-background hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {generating ? 'Generujem...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main content - takes all remaining height */}
      <div className="flex-1 flex flex-col sm:flex-row gap-2 min-h-0">
        {/* Dashboard viewer - full remaining height */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 rounded-xl border border-border flex items-center justify-center text-muted-foreground text-sm bg-[#0f172a]">
              <div className="animate-pulse">Nacitavam dashboard...</div>
            </div>
          ) : !snapshot ? (
            <div className="flex-1 rounded-xl border border-border flex flex-col items-center justify-center text-center p-8 bg-[#0f172a]">
              <span className="text-5xl mb-4">{TABS.find(t => t.id === activeTab)?.icon}</span>
              <p className="text-muted-foreground text-sm mb-4">
                Ziadny {activeTab.toUpperCase()} dashboard snapshot.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-background hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {generating ? 'Generujem...' : 'Generovat prvy snapshot'}
              </button>
            </div>
          ) : (
            <HtmlDocumentViewer
              key={iframeKey}
              srcUrl={getDashboardSnapshotUrl(snapshot.id)}
              title={snapshot.title}
              subtitle={formatDate(snapshot.createdAt)}
              mode="page"
              onDownload={handleDownload}
              className="flex-1 h-full"
            />
          )}
        </div>

        {/* History sidebar */}
        {showHistory && (
          <div className="w-full sm:w-64 flex-shrink-0 border border-border rounded-xl bg-card overflow-y-auto max-h-[30vh] sm:max-h-none">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">Historia</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{history.length} snapshotov</p>
            </div>
            <div className="p-2 space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Ziadna historia</p>
              ) : (
                history.map(snap => (
                  <div
                    key={snap.id}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer group ${
                      snapshot?.id === snap.id
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                    onClick={() => handleSelectSnapshot(snap)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-foreground">
                        {formatDate(snap.createdAt)}
                      </span>
                      {snap.isLatest && (
                        <span className="text-[9px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded">Latest</span>
                      )}
                    </div>
                    {snap.generatedBy && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{snap.generatedBy}</div>
                    )}
                    <div className="flex items-center justify-end mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(snap.id); }}
                        className="text-[10px] text-red-400/0 group-hover:text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Zmazat
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
