'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import {
  listFiles, listSharedFiles, uploadFile, deleteFile, previewFile, getFileDownloadUrl, toggleFileShare,
  listDatasets, getDatasetPreview, getDatasetContent, listAllSnapshots, getSnapshotContent, listMyDatasets, uploadDataset, deleteDataset as deleteDatasetApi,
  getFrameworks, getFrameworkContent,
} from '@/lib/api';
import type { UserFile, DatasetInfo, FrameworkInfo } from '@/lib/types';
import type { SnapshotItem } from '@/lib/api';
import { MessageContent } from './MessageContent';
import { HtmlDocumentViewer } from './HtmlDocumentViewer';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';

// ─── Helpers ───

const FILE_ICONS: Record<string, string> = {
  '.md': '📝', '.txt': '📄', '.html': '🌐', '.xlsx': '📊',
  '.docx': '📃', '.pptx': '📽️', '.pdf': '📕', '.csv': '📋', '.json': '🔧',
};

function getFileIcon(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return FILE_ICONS[ext] || '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

const CATEGORY_ICONS: Record<string, string> = {
  'article-structures': '📝', 'landing-page-templates': '🖥️',
  'meta-templates': '📐', 'workflow': '🔄',
};
const CATEGORY_LABELS: Record<string, string> = {
  'article-structures': 'Štruktúry článkov', 'landing-page-templates': 'Landing pages',
  'meta-templates': 'Meta šablóny', 'workflow': 'Pracovné postupy',
};

// ─── Types ───

type MainTab = 'files' | 'reports' | 'snapshots' | 'datasets' | 'templates';
type FileSubTab = 'mine' | 'shared';
type DatasetSubTab = 'custom' | 'approved';

interface UnifiedBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  initialTab?: MainTab;
  onInsertFile?: (file: UserFile, content: string) => void;
  onInsertFramework?: (content: string) => void;
  onAddToContext?: (content: string, label: string, icon: string) => void;
}

export function UnifiedBrowser({
  isOpen, onClose, initialTab = 'files',
  onInsertFile, onInsertFramework, onAddToContext, embedded,
}: UnifiedBrowserProps) {
  const stableOnClose = useCallback(onClose, [onClose]);
  const modalRef = useModalA11y(isOpen, stableOnClose);
  const [tab, setTab] = useState<MainTab>(initialTab);
  const { addToast } = useToast();

  // ─── Files state ───
  const [fileSubTab, setFileSubTab] = useState<FileSubTab>('mine');
  const [files, setFiles] = useState<UserFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<UserFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filePreview, setFilePreview] = useState<{ content: string; filename: string; fileId: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Snapshots state ───
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [selectedSnap, setSelectedSnap] = useState<SnapshotItem | null>(null);
  const [snapPreview, setSnapPreview] = useState<string | null>(null);
  const [addingSnap, setAddingSnap] = useState(false);

  // ─── Datasets state ───
  const [dataSubTab, setDataSubTab] = useState<DatasetSubTab>('approved');
  const [myDatasets, setMyDatasets] = useState<Array<DatasetInfo & { isApproved: boolean }>>([]);
  const [myDsLoading, setMyDsLoading] = useState(false);
  const [dsUploading, setDsUploading] = useState(false);
  const dsInputRef = useRef<HTMLInputElement>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDs, setSelectedDs] = useState<DatasetInfo | null>(null);
  const [dsPreview, setDsPreview] = useState<string | null>(null);
  const [dsLoading, setDsLoading] = useState(false);

  // ─── Reports state (HTML files filtered from user_files) ───
  const [reportSubTab, setReportSubTab] = useState<FileSubTab>('mine');
  const [reportFiles, setReportFiles] = useState<UserFile[]>([]);
  const [sharedReportFiles, setSharedReportFiles] = useState<UserFile[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [viewingHtmlReport, setViewingHtmlReport] = useState<UserFile | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [reportTemplates, setReportTemplates] = useState<FrameworkInfo[]>([]);
  const [rtLoading, setRtLoading] = useState(false);

  // ─── Templates state ───
  const [frameworks, setFrameworks] = useState<FrameworkInfo[]>([]);
  const [grouped, setGrouped] = useState<Record<string, FrameworkInfo[]>>({});
  const [fwLoading, setFwLoading] = useState(false);
  const [fwPreview, setFwPreview] = useState<{ content: string; name: string; path: string } | null>(null);

  // ─── Data loaders ───

  const loadFiles = async () => {
    setFilesLoading(true);
    try {
      const data = await listFiles();
      setFiles(data.files);
    } catch { /* ignore */ }
    finally { setFilesLoading(false); }
  };

  const loadSharedFiles = async () => {
    setFilesLoading(true);
    try {
      const data = await listSharedFiles();
      setSharedFiles(data.files);
    } catch { /* ignore */ }
    finally { setFilesLoading(false); }
  };

  const isHtmlFile = (name: string) => name.toLowerCase().endsWith('.html') || name.toLowerCase().endsWith('.htm');

  const loadReportFiles = async () => {
    setReportsLoading(true);
    try {
      const data = await listFiles();
      setReportFiles(data.files.filter((f: UserFile) => isHtmlFile(f.originalName)));
    } catch { /* ignore */ }
    finally { setReportsLoading(false); }
  };

  const loadSharedReportFiles = async () => {
    setReportsLoading(true);
    try {
      const data = await listSharedFiles();
      setSharedReportFiles(data.files.filter((f: UserFile) => isHtmlFile(f.originalName)));
    } catch { /* ignore */ }
    finally { setReportsLoading(false); }
  };

  const loadReportTemplates = async () => {
    setRtLoading(true);
    try {
      const data = await getFrameworks();
      setReportTemplates(data.grouped['report-templates'] || []);
    } catch { /* ignore */ }
    finally { setRtLoading(false); }
  };

  const handleSelectReportTemplate = async (template: FrameworkInfo) => {
    try {
      const fwPath = `report-templates/${template.id}.md`;
      const data = await getFrameworkContent(fwPath);
      if (data.content && onInsertFramework) {
        onInsertFramework(data.content);
        onClose();
      }
    } catch { /* ignore */ }
  };

  const loadMyDatasets = () => {
    setMyDsLoading(true);
    listMyDatasets().then(d => setMyDatasets(d.datasets)).finally(() => setMyDsLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'files') {
      if (fileSubTab === 'mine') loadFiles();
      else loadSharedFiles();
    }
    if (tab === 'reports') {
      if (reportSubTab === 'mine') loadReportFiles();
      else loadSharedReportFiles();
    }
    if (tab === 'snapshots') {
      setSnapLoading(true);
      listAllSnapshots().then(d => setSnapshots(d.snapshots)).finally(() => setSnapLoading(false));
    }
    if (tab === 'datasets') {
      if (dataSubTab === 'approved') {
        setDsLoading(true);
        listDatasets().then(d => setDatasets(d.datasets)).finally(() => setDsLoading(false));
      } else {
        loadMyDatasets();
      }
    }
    if (tab === 'templates') {
      setFwLoading(true);
      getFrameworks()
        .then(data => { setFrameworks(data.frameworks); setGrouped(data.grouped); })
        .finally(() => setFwLoading(false));
    }
  }, [isOpen, tab, fileSubTab, reportSubTab, dataSubTab]);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // ─── File handlers ───

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) await uploadFile(file);
      await loadFiles();
      addToast('Súbory úspešne nahrané', 'success');
    } catch { addToast('Nahranie zlyhalo', 'error'); }
    finally { setUploading(false); }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      await deleteFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setReportFiles(prev => prev.filter(f => f.id !== fileId));
      if (filePreview?.fileId === fileId) setFilePreview(null);
      if (viewingHtmlReport?.id === fileId) setViewingHtmlReport(null);
      addToast('Súbor vymazaný', 'success');
    } catch { addToast('Vymazanie zlyhalo', 'error'); }
  };

  const handleFilePreview = async (file: UserFile) => {
    try {
      const data = await previewFile(file.id);
      if (data.preview) setFilePreview({ content: data.preview, filename: data.filename, fileId: file.id });
    } catch { /* ignore */ }
  };

  const handleToggleShare = async (file: UserFile) => {
    try {
      const result = await toggleFileShare(file.id);
      const updater = (prev: UserFile[]) => prev.map(f => f.id === file.id ? { ...f, isShared: result.isShared } : f);
      setFiles(updater);
      setReportFiles(updater);
      addToast(result.isShared ? 'Súbor zdieľaný' : 'Zdieľanie zrušené', 'success');
    } catch { addToast('Zdieľanie zlyhalo', 'error'); }
  };

  // ─── Snapshot handlers ───

  const groupByDomain = (items: SnapshotItem[]) =>
    items.reduce((acc, s) => { if (!acc[s.domain]) acc[s.domain] = []; acc[s.domain].push(s); return acc; }, {} as Record<string, SnapshotItem[]>);

  const gscSnaps = snapshots.filter(s => s.type === 'gsc');
  const ahrefsSnaps = snapshots.filter(s => s.type === 'ahrefs');
  const kwSnaps = snapshots.filter(s => s.type === 'ahrefs-keywords');
  const linkSnaps = snapshots.filter(s => s.type === 'ahrefs-links');
  const auditSnaps = snapshots.filter(s => s.type === 'ahrefs-audit');
  const compSnaps = snapshots.filter(s => s.type === 'ahrefs-competitors');
  const cruxSnaps = snapshots.filter(s => s.type === 'crux');
  const sitemapSnaps = snapshots.filter(s => s.type === 'sitemap');

  const tieredSections = [
    { key: 'gsc', label: '🔍 Google Search Console', color: 'text-blue-400', byDomain: groupByDomain(gscSnaps), metricFn: (s: SnapshotItem) => `${s.metrics.clicks?.toLocaleString() || 0} clicks` },
    { key: 'ahrefs', label: '📊 Ahrefs (DR)', color: 'text-orange-400', byDomain: groupByDomain(ahrefsSnaps), metricFn: (s: SnapshotItem) => `DR: ${s.metrics.dr || 'N/A'}, KW: ${s.metrics.keywords || 'N/A'}, Traffic: ${s.metrics.traffic || 'N/A'}` },
    { key: 'kw', label: '🔑 Ahrefs Keywords', color: 'text-orange-400', byDomain: groupByDomain(kwSnaps), metricFn: (s: SnapshotItem) => `${s.metrics.keywords || 0} kľúč. slov` },
    { key: 'link', label: '🔗 Ahrefs Links', color: 'text-orange-400', byDomain: groupByDomain(linkSnaps), metricFn: () => 'link profil' },
    { key: 'audit', label: '🔍 Ahrefs Audit', color: 'text-orange-400', byDomain: groupByDomain(auditSnaps), metricFn: (s: SnapshotItem) => `health: ${s.metrics.healthScore || 'N/A'}` },
    { key: 'comp', label: '🏆 Ahrefs Competitors', color: 'text-orange-400', byDomain: groupByDomain(compSnaps), metricFn: () => 'konkurenti' },
    { key: 'crux', label: '🌐 Core Web Vitals', color: 'text-green-400', byDomain: groupByDomain(cruxSnaps), metricFn: (s: SnapshotItem) => `LCP: ${s.metrics.lcp ? (s.metrics.lcp / 1000).toFixed(1) + 's' : 'N/A'} CLS: ${s.metrics.cls?.toFixed(3) || 'N/A'}` },
    { key: 'sitemap', label: '🗺️ Sitemap', color: 'text-purple-400', byDomain: groupByDomain(sitemapSnaps), metricFn: (s: SnapshotItem) => `${s.metrics.urls || 0} URLs, ${s.metrics.indexable || 0} indexable` },
  ];

  const handleSelectSnap = async (snap: SnapshotItem) => {
    setSelectedSnap(snap);
    setSnapPreview(null);
    try {
      const data = await getSnapshotContent(snap.type, snap.id);
      setSnapPreview(data.content);
    } catch { setSnapPreview('Preview nie je dostupný'); }
  };

  const handleAddSnapToContext = async () => {
    if (!selectedSnap || !onAddToContext) return;
    setAddingSnap(true);
    try {
      const data = await getSnapshotContent(selectedSnap.type, selectedSnap.id);
      if (data.content) {
        onAddToContext(data.content, data.label || `${selectedSnap.type.toUpperCase()} ${selectedSnap.domain}`, '📊');
        onClose();
      }
    } catch { addToast('Nepodarilo sa načítať snapshot', 'error'); }
    finally { setAddingSnap(false); }
  };

  // ─── Dataset handlers ───

  const handleDsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDsUploading(true);
    try { await uploadDataset(file); loadMyDatasets(); }
    catch { /* ignore */ }
    finally { setDsUploading(false); if (dsInputRef.current) dsInputRef.current.value = ''; }
  };

  const handleDeleteDs = async (id: string) => {
    if (!confirm('Vymazať dataset?')) return;
    try { await deleteDatasetApi(id); setMyDatasets(prev => prev.filter(d => d.id !== id)); }
    catch { /* ignore */ }
  };

  const handleSelectDs = async (ds: DatasetInfo) => {
    setSelectedDs(ds);
    setDsPreview(null);
    try {
      const data = await getDatasetPreview(ds.id);
      setDsPreview(data.preview);
    } catch { /* ignore */ }
  };

  const handleAddDsToContext = async () => {
    if (!selectedDs || !onAddToContext) return;
    try {
      const data = await getDatasetContent(selectedDs.id);
      if (data.content) { onAddToContext(data.content, selectedDs.originalName, '📊'); onClose(); }
    } catch { addToast('Nepodarilo sa načítať dataset', 'error'); }
  };

  // ─── Framework handler ───

  const handleFwPreview = async (fw: FrameworkInfo) => {
    try {
      const fwPath = `${fw.category}/${fw.id}.md`;
      const data = await getFrameworkContent(fwPath);
      setFwPreview({ content: data.content, name: data.framework.name, path: fwPath });
    } catch { /* ignore */ }
  };

  // ─── Tab counts ───

  const tabItems: { id: MainTab; label: string; icon: string }[] = [
    { id: 'files', label: `Súbory`, icon: '📁' },
    { id: 'reports', label: `Reporty`, icon: '📋' },
    { id: 'snapshots', label: `Snímky`, icon: '📊' },
    { id: 'datasets', label: `Datasety`, icon: '📊' },
    { id: 'templates', label: `Šablóny`, icon: '📐' },
  ];

  const currentFiles = fileSubTab === 'mine' ? files : sharedFiles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="unified-browser-title" ref={modalRef}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-[calc(100vw-16px)] sm:max-w-4xl max-h-[85vh] flex flex-col mx-2 sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <h2 id="unified-browser-title" className="text-base sm:text-lg font-bold text-foreground shrink-0">Prehliadač</h2>
            <div className="flex gap-0.5 sm:gap-1 bg-card/50 p-0.5 rounded-lg overflow-x-auto">
              {tabItems.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                    tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span aria-hidden="true">{t.icon}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover text-muted-foreground transition-colors cursor-pointer" aria-label="Zavrieť">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">

          {/* ═══ FILES TAB ═══ */}
          {tab === 'files' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sub-tabs + upload */}
              <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-card/50 p-0.5 rounded-lg">
                    {([{ id: 'mine' as FileSubTab, label: 'Moje súbory' }, { id: 'shared' as FileSubTab, label: 'Zdieľané' }]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setFileSubTab(t.id); setFilePreview(null); }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          fileSubTab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">({currentFiles.length})</span>
                </div>
                {fileSubTab === 'mine' && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
                    className={`border-2 border-dashed rounded-xl p-2.5 text-center transition-all cursor-pointer ${
                      dragOver ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-border'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input ref={fileInputRef} type="file" multiple accept=".md,.txt,.html,.xlsx,.docx,.pptx,.pdf,.csv,.json" onChange={e => handleFileUpload(e.target.files)} className="hidden" />
                    {uploading ? (
                      <div className="text-sm text-primary animate-pulse">Nahrávam...</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Pretiahnite súbory sem alebo kliknite
                        <span className="text-[10px] ml-1">.md .xlsx .docx .pptx .pdf .csv .json</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* File list or preview */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {filePreview ? (
                  <div>
                    <button onClick={() => setFilePreview(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer">
                      ← Späť na zoznam
                    </button>
                    <div className="text-sm font-medium mb-2">{filePreview.filename}</div>
                    <div className="rounded-xl border border-border p-4 bg-card/50 text-sm max-h-[400px] overflow-y-auto">
                      <MessageContent content={filePreview.content} />
                    </div>
                    <div className="flex gap-2 mt-3">
                      {onInsertFile && (
                        <button
                          onClick={() => { const file = files.find(f => f.id === filePreview.fileId); if (file) onInsertFile(file, filePreview.content); }}
                          className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                          Vložiť do chatu
                        </button>
                      )}
                      {onAddToContext && (
                        <button
                          onClick={() => { onAddToContext(filePreview.content, filePreview.filename, getFileIcon(filePreview.filename)); onClose(); }}
                          className="px-4 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5 transition-colors cursor-pointer"
                        >
                          + Do kontextu
                        </button>
                      )}
                    </div>
                  </div>
                ) : filesLoading ? (
                  <div className="text-center text-muted-foreground py-8 animate-pulse">Načítavam súbory...</div>
                ) : currentFiles.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <div className="text-3xl mb-3">{fileSubTab === 'mine' ? '📁' : '👥'}</div>
                    <p className="text-sm">{fileSubTab === 'mine' ? 'Zatiaľ žiadne súbory' : 'Zatiaľ žiadne zdieľané súbory'}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {currentFiles.map(file => {
                      const icon = getFileIcon(file.originalName);
                      const isPreviewable = ['.md', '.txt', '.html', '.csv', '.json'].some(ext => file.originalName.toLowerCase().endsWith(ext));
                      return (
                        <div key={file.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all group">
                          <span className="text-lg" aria-hidden="true">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                              {file.originalName}
                              {file.isShared && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">zdieľané</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatSize(file.size)} · {formatDate(file.createdAt)}
                              {file.userName && <span> · {file.userName}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            {isPreviewable && (
                              <button onClick={() => handleFilePreview(file)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs cursor-pointer" title="Náhľad">
                                👁
                              </button>
                            )}
                            {onAddToContext && isPreviewable && (
                              <button
                                onClick={async () => {
                                  try {
                                    const data = await previewFile(file.id);
                                    if (data.preview) { onAddToContext(data.preview, file.originalName, icon); addToast('Pridané do kontextu', 'success'); }
                                  } catch { addToast('Nepodarilo sa pridať do kontextu', 'error'); }
                                }}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary text-xs cursor-pointer" title="Pridať do kontextu"
                              >
                                +
                              </button>
                            )}
                            <a href={getFileDownloadUrl(file.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs cursor-pointer" title="Stiahnuť">
                              ⬇️
                            </a>
                            {fileSubTab === 'mine' && (
                              <>
                                <button onClick={() => handleToggleShare(file)} className={`p-1.5 rounded-lg hover:bg-muted text-xs cursor-pointer ${file.isShared ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'}`} title={file.isShared ? 'Zrušiť zdieľanie' : 'Zdieľať'}>
                                  🔗
                                </button>
                                <button onClick={() => setConfirmDeleteId(file.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-xs cursor-pointer" title="Vymazať">
                                  🗑
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ REPORTS TAB (HTML files) ═══ */}
          {tab === 'reports' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sub-tabs */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-card/50 p-0.5 rounded-lg">
                    {([{ id: 'mine' as FileSubTab, label: 'Moje reporty' }, { id: 'shared' as FileSubTab, label: 'Tímové' }]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setReportSubTab(t.id); setViewingHtmlReport(null); }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          reportSubTab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">({(reportSubTab === 'mine' ? reportFiles : sharedReportFiles).length})</span>
                  <div className="ml-auto relative">
                    <button
                      onClick={() => { if (!showTemplatePicker) loadReportTemplates(); setShowTemplatePicker(!showTemplatePicker); }}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    >
                      + Vytvoriť report
                    </button>
                    {showTemplatePicker && (
                      <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                        <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground">Vybrať šablónu</div>
                        {rtLoading ? (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center animate-pulse">Načítavam...</div>
                        ) : reportTemplates.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Žiadne report šablóny</div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto">
                            {reportTemplates.map(t => (
                              <button
                                key={t.id}
                                onClick={() => { handleSelectReportTemplate(t); setShowTemplatePicker(false); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-card transition-colors cursor-pointer"
                              >
                                <div className="font-medium">{t.name}</div>
                                {t.description && <div className="text-xs text-muted-foreground truncate">{t.description}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Report list or viewer */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {viewingHtmlReport ? (
                  <div className="flex flex-col h-full">
                    <button onClick={() => setViewingHtmlReport(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer shrink-0">
                      ← Späť na zoznam
                    </button>
                    <HtmlDocumentViewer
                      srcUrl={`/api/files/${viewingHtmlReport.id}/view`}
                      title={viewingHtmlReport.originalName}
                      subtitle={`${formatSize(viewingHtmlReport.size)} · ${formatDate(viewingHtmlReport.createdAt)}`}
                      mode="panel"
                    />
                  </div>
                ) : reportsLoading ? (
                  <div className="text-center text-muted-foreground py-8 animate-pulse">Načítavam reporty...</div>
                ) : (reportSubTab === 'mine' ? reportFiles : sharedReportFiles).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <div className="text-3xl mb-3" aria-hidden="true">📋</div>
                    <p className="text-sm">{reportSubTab === 'mine' ? 'Zatiaľ žiadne HTML reporty' : 'Zatiaľ žiadne tímové reporty'}</p>
                    <p className="text-xs mt-2 max-w-xs mx-auto text-muted-foreground">
                      Požiadajte Braina v chate o vytvorenie reportu alebo použite šablónu.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(reportSubTab === 'mine' ? reportFiles : sharedReportFiles).map(file => (
                      <div key={file.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all group">
                        <span className="text-lg" aria-hidden="true">🌐</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            {file.originalName}
                            {file.isShared && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">zdieľané</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatSize(file.size)} · {formatDate(file.createdAt)}
                            {file.userName && <span> · {file.userName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button onClick={() => setViewingHtmlReport(file)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs cursor-pointer" title="Zobraziť">
                            👁
                          </button>
                          <a href={getFileDownloadUrl(file.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs cursor-pointer" title="Stiahnuť">
                            ⬇️
                          </a>
                          {reportSubTab === 'mine' && (
                            <>
                              <button onClick={() => handleToggleShare(file)} className={`p-1.5 rounded-lg hover:bg-muted text-xs cursor-pointer ${file.isShared ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'}`} title={file.isShared ? 'Zrušiť zdieľanie' : 'Zdieľať'}>
                                🔗
                              </button>
                              <button onClick={() => setConfirmDeleteId(file.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-xs cursor-pointer" title="Vymazať">
                                🗑
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SNAPSHOTS TAB ═══ */}
          {tab === 'snapshots' && (
            <>
              <div className="w-full sm:w-1/2 border-b sm:border-b-0 sm:border-r border-border-subtle overflow-y-auto p-3 space-y-3 max-h-[40vh] sm:max-h-none">
                {snapLoading ? (
                  <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">Načítavam...</div>
                ) : snapshots.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Žiadne snímky</div>
                ) : (
                  tieredSections.map(sec => Object.keys(sec.byDomain).length > 0 && (
                    <div key={sec.key}>
                      <div className={`text-xs font-semibold ${sec.color} mb-2`}>{sec.label}</div>
                      {Object.entries(sec.byDomain).map(([domain, items]) => (
                        <div key={`${sec.key}-${domain}`} className="mb-3">
                          <div className="text-xs font-medium text-foreground mb-1">{domain} <span className="text-muted-foreground">({items.length})</span></div>
                          <div className="space-y-0.5">
                            {items.slice(0, 5).map(snap => (
                              <button
                                key={`${snap.type}-${snap.id}`}
                                onClick={() => handleSelectSnap(snap)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                  selectedSnap?.id === snap.id && selectedSnap?.type === snap.type
                                    ? 'bg-primary-soft border border-primary/15'
                                    : 'hover:bg-surface-hover border border-transparent'
                                }`}
                              >
                                <span className="font-medium">{shortDate(snap.snapshotDate)}</span>
                                <span className="text-muted-foreground ml-2">{sec.metricFn(snap)}</span>
                              </button>
                            ))}
                            {items.length > 5 && <div className="text-[10px] text-muted-foreground px-2.5">+{items.length - 5} starších</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <div className="w-full sm:w-1/2 overflow-y-auto p-4">
                {selectedSnap ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-sm">{selectedSnap.domain}</h3>
                        <div className="text-xs text-muted-foreground mt-0.5">{selectedSnap.type.toUpperCase()} · {shortDate(selectedSnap.snapshotDate)}</div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`/api/snapshots/${selectedSnap.type}/${selectedSnap.id}/download`}
                          download
                          className="px-3 py-1.5 rounded-lg bg-surface-hover text-foreground text-xs font-medium hover:bg-border cursor-pointer"
                        >⬇ Download</a>
                        {onAddToContext && (
                          <button onClick={handleAddSnapToContext} disabled={addingSnap} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50">
                            {addingSnap ? '...' : 'Pridať do kontextu'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 mb-3 flex-wrap">
                      {selectedSnap.type === 'gsc' && (
                        <>
                          <div className="text-xs"><span className="text-muted-foreground">Clicks:</span> <strong className="text-blue-400">{selectedSnap.metrics.clicks?.toLocaleString()}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Impr:</span> <strong>{selectedSnap.metrics.impressions?.toLocaleString()}</strong></div>
                        </>
                      )}
                      {selectedSnap.type === 'ahrefs' && (
                        <>
                          <div className="text-xs"><span className="text-muted-foreground">DR:</span> <strong className="text-orange-400">{selectedSnap.metrics.dr || 'N/A'}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">KW:</span> <strong>{selectedSnap.metrics.keywords}</strong></div>
                        </>
                      )}
                      {selectedSnap.type === 'ahrefs-keywords' && (
                        <div className="text-xs"><span className="text-muted-foreground">Keywords:</span> <strong className="text-orange-400">{selectedSnap.metrics.keywords?.toLocaleString()}</strong></div>
                      )}
                      {selectedSnap.type === 'ahrefs-audit' && (
                        <>
                          <div className="text-xs"><span className="text-muted-foreground">Health:</span> <strong className="text-orange-400">{selectedSnap.metrics.healthScore || 'N/A'}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Critical:</span> <strong className="text-red-400">{selectedSnap.metrics.critical || 0}</strong></div>
                        </>
                      )}
                      {selectedSnap.type === 'crux' && (
                        <>
                          <div className="text-xs"><span className="text-muted-foreground">LCP:</span> <strong className="text-green-400">{selectedSnap.metrics.lcp ? (selectedSnap.metrics.lcp / 1000).toFixed(1) + 's' : 'N/A'}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">CLS:</span> <strong>{selectedSnap.metrics.cls?.toFixed(3) || 'N/A'}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">INP:</span> <strong>{selectedSnap.metrics.inp ? selectedSnap.metrics.inp + 'ms' : 'N/A'}</strong></div>
                        </>
                      )}
                      {selectedSnap.type === 'sitemap' && (
                        <>
                          <div className="text-xs"><span className="text-muted-foreground">URLs:</span> <strong className="text-purple-400">{selectedSnap.metrics.urls}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Indexable:</span> <strong className="text-green-400">{selectedSnap.metrics.indexable}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Errors:</span> <strong className="text-red-400">{selectedSnap.metrics.errors}</strong></div>
                        </>
                      )}
                    </div>
                    {snapPreview ? (
                      <pre className="text-[11px] font-mono text-muted-foreground bg-background rounded-lg p-3 border border-border overflow-x-auto whitespace-pre max-h-[400px]">
                        {snapPreview}
                      </pre>
                    ) : (
                      <div className="text-xs text-muted-foreground py-4 animate-pulse">Načítavam...</div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Vyberte snímku pre zobrazenie
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ DATASETS TAB ═══ */}
          {tab === 'datasets' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-card/50 p-0.5 rounded-lg">
                    {([{ id: 'approved' as DatasetSubTab, label: `Schválené (${datasets.length})` }, { id: 'custom' as DatasetSubTab, label: `Vlastné (${myDatasets.length})` }]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setDataSubTab(t.id); setSelectedDs(null); setDsPreview(null); }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          dataSubTab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {dataSubTab === 'approved' ? (
                <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
                  <div className="w-full sm:w-1/2 border-b sm:border-b-0 sm:border-r border-border-subtle overflow-y-auto p-3 space-y-1 max-h-[40vh] sm:max-h-none">
                    {dsLoading ? (
                      <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">Načítavam...</div>
                    ) : datasets.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">Žiadne schválené datasety</div>
                    ) : (
                      datasets.map(ds => (
                        <button
                          key={ds.id}
                          onClick={() => handleSelectDs(ds)}
                          className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                            selectedDs?.id === ds.id ? 'bg-primary-soft border border-primary/15' : 'hover:bg-surface-hover border border-transparent'
                          }`}
                        >
                          <div className="font-medium text-sm truncate">{ds.originalName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {ds.fileType.toUpperCase()} · {formatSize(ds.sizeBytes)}
                            {ds.rowCount !== null && ` · ${ds.rowCount} riadkov`}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="w-full sm:w-1/2 overflow-y-auto p-4">
                    {selectedDs ? (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-sm">{selectedDs.originalName}</h3>
                            <div className="text-xs text-muted-foreground mt-0.5">{selectedDs.fileType.toUpperCase()} · {formatSize(selectedDs.sizeBytes)}</div>
                          </div>
                          {onAddToContext && (
                            <button onClick={handleAddDsToContext} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 cursor-pointer">
                              Pridať do kontextu
                            </button>
                          )}
                        </div>
                        {selectedDs.columnNames && selectedDs.columnNames.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Stĺpce</div>
                            <div className="flex flex-wrap gap-1">
                              {selectedDs.columnNames.map(c => <span key={c} className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">{c}</span>)}
                            </div>
                          </div>
                        )}
                        {dsPreview ? (
                          <pre className="text-[11px] font-mono text-muted-foreground bg-background rounded-lg p-3 border border-border overflow-x-auto whitespace-pre max-h-[400px]">
                            {dsPreview}
                          </pre>
                        ) : (
                          <div className="text-xs text-muted-foreground py-4 animate-pulse">Načítavam...</div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        Vyberte dataset pre zobrazenie
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <div className="mb-4">
                    <input ref={dsInputRef} type="file" accept=".csv,.xlsx,.md" onChange={handleDsUpload} className="hidden" />
                    <button
                      onClick={() => dsInputRef.current?.click()}
                      disabled={dsUploading}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground text-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {dsUploading ? 'Nahrávam...' : '+ Nahrať dataset (.csv, .xlsx, .md)'}
                    </button>
                  </div>
                  {myDsLoading ? (
                    <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">Načítavam...</div>
                  ) : myDatasets.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <div className="text-2xl mb-2" aria-hidden="true">📁</div>
                      <p>Zatiaľ žiadne vlastné datasety</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {myDatasets.map(ds => (
                        <div key={ds.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all group">
                          <span className="text-lg" aria-hidden="true">📄</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{ds.originalName}</div>
                            <div className="text-xs text-muted-foreground">
                              {ds.fileType.toUpperCase()} · {formatSize(ds.sizeBytes)}
                              {ds.rowCount !== null && ` · ${ds.rowCount} riadkov`}
                              {ds.isApproved
                                ? <span className="text-green-400 ml-1">· Schválený</span>
                                : <span className="text-yellow-400 ml-1">· Čaká na schválenie</span>
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            {ds.isApproved && onAddToContext && (
                              <button
                                onClick={async () => {
                                  try {
                                    const data = await getDatasetContent(ds.id);
                                    if (data.content) { onAddToContext(data.content, ds.originalName, '📊'); onClose(); }
                                  } catch { /* ignore */ }
                                }}
                                className="p-1.5 rounded-lg hover:bg-muted text-xs text-primary cursor-pointer" title="Pridať do kontextu"
                              >
                                ➕
                              </button>
                            )}
                            <button onClick={() => handleDeleteDs(ds.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-xs cursor-pointer" title="Vymazať">
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ TEMPLATES TAB ═══ */}
          {tab === 'templates' && (
            <div className="flex-1 overflow-y-auto p-4">
              {fwPreview ? (
                <div>
                  <button onClick={() => setFwPreview(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer">
                    ← Späť na zoznam
                  </button>
                  <div className="text-sm font-medium mb-2">{fwPreview.name}</div>
                  <div className="rounded-xl border border-border p-4 bg-card/50 text-sm max-h-[400px] overflow-y-auto">
                    <MessageContent content={fwPreview.content} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    {onInsertFramework && (
                      <button
                        onClick={() => { onInsertFramework(fwPreview.content); onClose(); }}
                        className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        Vložiť do chatu
                      </button>
                    )}
                    {onAddToContext && (
                      <button
                        onClick={() => { onAddToContext(fwPreview.content, fwPreview.name, '📐'); onClose(); }}
                        className="px-4 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        + Do kontextu
                      </button>
                    )}
                  </div>
                </div>
              ) : fwLoading ? (
                <div className="text-center text-muted-foreground py-8 animate-pulse">Načítavam šablóny...</div>
              ) : frameworks.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <div className="text-3xl mb-3" aria-hidden="true">📐</div>
                  <p className="text-sm">Zatiaľ žiadne šablóny</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(grouped).map(([category, fws]) => (
                    <div key={category}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span aria-hidden="true">{CATEGORY_ICONS[category] || '📄'}</span>
                        {CATEGORY_LABELS[category] || category.replace(/-/g, ' ')}
                      </h3>
                      <div className="space-y-1">
                        {fws.map(fw => (
                          <button
                            key={fw.id}
                            onClick={() => handleFwPreview(fw)}
                            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{fw.name}</div>
                              {fw.description && <div className="text-xs text-muted-foreground truncate">{fw.description}</div>}
                            </div>
                            <span className="text-muted-foreground text-xs">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title="Vymazať súbor?"
        message="Naozaj chcete vymazať tento súbor? Táto akcia sa nedá vrátiť."
        onConfirm={() => { if (confirmDeleteId) handleFileDelete(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
