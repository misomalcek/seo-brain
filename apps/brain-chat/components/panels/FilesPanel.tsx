'use client';

import { useState, useEffect, useCallback } from 'react';
import { listFiles, deleteFile, uploadFile, listSharedFiles, getFileDownloadUrl, listBrandAssets,
  getSnapshotContent, deleteSnapshot, getAdminFrameworks, getAdminUserFiles, deleteAdminUserFile,
  listDatasets, uploadDataset, deleteDataset,
  toggleFileShare, listSites, createBrandAsset, type SnapshotType } from '@/lib/api';
import type { ContextItem, Site, BrandAssetType } from '@/lib/types';
import { FileEditor } from '@/components/FileEditor';

// 'reports' tab removed 2026-06-10 — html_reports table is empty and HTML reports
// are already accessible as files in the Súbory tab (mime text/html).
type FileTab = 'files' | 'brand' | 'datasets' | 'templates' | 'snapshots';

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  date: string;
  source: FileTab;
  downloadUrl?: string;
  viewUrl?: string;
  isShared?: boolean;
  isOwn?: boolean;
  isEvery?: boolean;   // came from the admin "every files" view
}

interface FilesPanelProps {
  contextItems: ContextItem[];
  onAddToContext: (type: ContextItem['type'], content: string, label: string, icon: string) => void;
  onRemoveFromContext: (id: string) => void;
  isAdmin?: boolean;
}

const BRAND_ASSET_TYPES: { id: BrandAssetType; label: string }[] = [
  { id: 'voice-guide',             label: 'Voice Guide' },
  { id: 'writing-dna',             label: 'Writing DNA' },
  { id: 'style-guide',             label: 'Style Guide' },
  { id: 'topic-clusters',          label: 'Topic Clusters' },
  { id: 'seo-strategy',            label: 'SEO Strategy' },
  { id: 'web-architecture',        label: 'Web Architecture' },
  { id: 'sitemap',                 label: 'Sitemap' },
  { id: 'quality-checklist-seo',   label: 'SEO Checklist' },
  { id: 'quality-checklist-content', label: 'Content Checklist' },
  { id: 'custom',                  label: 'Vlastný' },
];

const TABS: { id: FileTab; label: string; icon: string }[] = [
  { id: 'files', label: 'Súbory', icon: '📄' },
  { id: 'brand', label: 'Brand', icon: '🎨' },
  { id: 'datasets', label: 'Datasety', icon: '📦' },
  { id: 'templates', label: 'Šablóny', icon: '📐' },
  { id: 'snapshots', label: 'Snímky', icon: '📸' },
];

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

// 'every' = ALL files across all users (admin / team_admin only — server-side fetch
// via /admin/user-files). 'all' = my own + files shared with me.
type FileScope = 'all' | 'mine' | 'shared' | 'every';

export function FilesPanel({ contextItems, onAddToContext, onRemoveFromContext, isAdmin }: FilesPanelProps) {
  const [tab, setTab] = useState<FileTab>('files');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingFile, setEditingFile] = useState<{ id: string; name: string; type: FileTab } | null>(null);
  const [fileScope, setFileScope] = useState<FileScope>('all');

  // Brand add form state
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandSites, setBrandSites] = useState<Site[]>([]);
  const [brandFormType, setBrandFormType] = useState<BrandAssetType>('voice-guide');
  const [brandFormSiteId, setBrandFormSiteId] = useState<string>('');  // '' = global
  const [brandFormTitle, setBrandFormTitle] = useState('');
  const [brandFormContent, setBrandFormContent] = useState('');
  const [brandFormSaving, setBrandFormSaving] = useState(false);
  const [brandFormError, setBrandFormError] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let fileItems: FileItem[] = [];

      if (tab === 'files') {
        if (isAdmin && fileScope === 'every') {
          // Admin / team_admin: every file across all users (server-side, up to 500)
          const res = await getAdminUserFiles(500);
          fileItems = (res.files || []).map(f => ({
            id: f.id, name: `${f.originalName || f.filename}${f.userName ? ` · ${f.userName}` : ''}`,
            type: f.mimeType || '', size: f.size || 0, date: f.createdAt, source: 'files' as const,
            downloadUrl: getFileDownloadUrl(f.id),
            isShared: f.isShared, isOwn: false, isEvery: true,
          }));
        } else {
          // Raised limit 50→500 so the default view isn't silently truncated.
          const [own, shared] = await Promise.all([listFiles(500), listSharedFiles()]);
          const ownIds = new Set((own.files || []).map(f => f.id));
          const all = [...(own.files || []).map(f => ({ ...f, isOwn: true })),
                       ...(shared.files || []).filter(f => !ownIds.has(f.id)).map(f => ({ ...f, isOwn: false }))];
          fileItems = all.map(f => ({
            id: f.id, name: f.originalName || f.filename, type: f.mimeType || '',
            size: f.size || 0, date: f.createdAt, source: 'files' as const,
            downloadUrl: getFileDownloadUrl(f.id),
            isShared: f.isShared, isOwn: (f as any).isOwn,
          }));
        }
      } else if (tab === 'brand') {
        const data = await listBrandAssets();
        fileItems = (data.assets || []).map((a: any) => ({
          id: a.id, name: a.title, type: a.assetType || a.asset_type || '',
          size: 0, date: a.createdAt || a.created_at || '', source: 'brand' as const,
        }));
      } else if (tab === 'datasets') {
        const data = await listDatasets();
        fileItems = (data.datasets || []).map((d: any) => ({
          id: d.id, name: d.originalName || d.filename, type: d.mimeType || 'dataset',
          size: d.sizeBytes || d.size || 0, date: d.createdAt || '', source: 'datasets' as const,
        }));
      } else if (tab === 'templates') {
        const data = await getAdminFrameworks();
        fileItems = (data.frameworks || []).map((f: any) => ({
          id: f.path, name: f.name || f.filename, type: f.category || 'template',
          size: f.size || 0, date: f.updatedAt || '', source: 'templates' as const,
        }));
      } else if (tab === 'snapshots') {
        const res = await fetch('/api/snapshots/all', { credentials: 'include' });
        const data = await res.json();
        // Show ALL snapshots (was .slice(0, 50) which silently hid older ones).
        fileItems = (data.snapshots || []).map((s: any) => {
          const m = s.metrics || {};
          const parts: string[] = [];
          if (m.clicks != null) parts.push(`${m.clicks} clicks`);
          if (m.impressions != null) parts.push(`${(m.impressions / 1000).toFixed(1)}k imp`);
          if (m.queries != null) parts.push(`${m.queries} kw`);
          if (m.dr != null) parts.push(`DR ${m.dr}`);
          if (m.keywords != null) parts.push(`${m.keywords} kw`);
          if (m.traffic != null) parts.push(`${m.traffic} traffic`);
          if (m.healthScore != null) parts.push(`health ${m.healthScore}`);
          if (m.critical) parts.push(`${m.critical} crit`);
          if (m.warnings) parts.push(`${m.warnings} warn`);
          if (m.lcp != null) parts.push(`LCP ${m.lcp}`);
          if (m.cls != null) parts.push(`CLS ${m.cls}`);
          if (m.inp != null) parts.push(`INP ${m.inp}`);
          if (m.urls != null) parts.push(`${m.urls} URLs`);
          if (m.indexable != null) parts.push(`${m.indexable} indexable`);
          const summary = parts.length ? ` · ${parts.join(' · ')}` : '';
          return {
            id: String(s.id), name: `${s.type} — ${s.domain}${summary}`, type: s.type,
            size: 0, date: s.snapshotDate || s.createdAt, source: 'snapshots' as const,
            downloadUrl: `/api/snapshots/${s.type}/${s.id}/download`,
          };
        });
      }

      setItems(fileItems);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, [tab, fileScope, isAdmin]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Load sites when brand tab is activated (needed for the web selector)
  useEffect(() => {
    if (tab === 'brand' && isAdmin && brandSites.length === 0) {
      listSites().then(r => setBrandSites(r.sites)).catch(() => {});
    }
  }, [tab, isAdmin, brandSites.length]);

  const handleBrandAdd = async () => {
    if (!brandFormTitle.trim() || !brandFormContent.trim()) return;
    setBrandFormSaving(true);
    setBrandFormError('');
    try {
      await createBrandAsset({
        siteId: brandFormSiteId || null,
        assetType: brandFormType,
        title: brandFormTitle.trim(),
        content: brandFormContent.trim(),
      });
      setShowBrandForm(false);
      setBrandFormTitle('');
      setBrandFormContent('');
      setBrandFormType('voice-guide');
      setBrandFormSiteId('');
      loadItems();
    } catch (err: any) {
      setBrandFormError(err.message || 'Chyba pri ukladaní');
    } finally {
      setBrandFormSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (tab === 'datasets') await uploadDataset(file);
      else await uploadFile(file);
      loadItems();
    } catch { /* ignore */ }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Vymazať ${item.name}?`)) return;
    try {
      if (item.source === 'files') {
        // Files from the admin "every" view may belong to another user → admin delete.
        if (item.isEvery && !item.isOwn) await deleteAdminUserFile(item.id);
        else await deleteFile(item.id);
      }
      else if (item.source === 'datasets') await deleteDataset(item.id);
      else if (item.source === 'snapshots') await deleteSnapshot(item.type as SnapshotType, parseInt(item.id));
      loadItems();
    } catch { /* ignore */ }
  };

  const handleShare = async (item: FileItem) => {
    if (item.source === 'files') {
      try { await toggleFileShare(item.id); loadItems(); } catch { /* ignore */ }
    }
  };

  const isInContext = (name: string) => contextItems.some(c => c.label === name);

  const handleContextToggle = async (item: FileItem) => {
    if (isInContext(item.name)) {
      const ctx = contextItems.find(c => c.label === item.name);
      if (ctx) onRemoveFromContext(ctx.id);
    } else {
      try {
        if (item.source === 'snapshots') {
          const data = await getSnapshotContent(item.type as SnapshotType, parseInt(item.id));
          onAddToContext('file', data.content, item.name, '📊');
        } else {
          onAddToContext('file', `[File: ${item.name}]`, item.name, '📄');
        }
      } catch { /* ignore */ }
    }
  };

  const canUpload = tab === 'files' || tab === 'datasets';
  const canAddBrand = tab === 'brand' && isAdmin;
  const canDelete = (item: FileItem) => {
    if (isAdmin) return true;
    if (item.isOwn) return true;
    return false;
  };
  const canShare = (item: FileItem) => item.source === 'files';

  // 'every' is already the full server set (no client filter). 'mine'/'shared'
  // filter the own+shared set client-side. 'all' shows everything fetched.
  const scoped = tab === 'files' && (fileScope === 'mine' || fileScope === 'shared')
    ? items.filter(i => fileScope === 'mine' ? i.isOwn : !i.isOwn)
    : items;
  const filtered = search ? scoped.filter(i => i.name.toLowerCase().includes(search.toLowerCase())) : scoped;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSearch(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] dark:bg-white/[0.06] text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {tab === t.id && items.length > 0 && <span className="text-[10px] opacity-75">({items.length})</span>}
          </button>
        ))}
      </div>

      {/* Scope filter — only on files tab. #19 (2026-04-29): scroll-x on narrow screens */}
      {tab === 'files' && (
        <div className="flex gap-1 px-4 pb-2 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none">
          {([
            { id: 'all' as FileScope, label: 'Všetky' },
            { id: 'mine' as FileScope, label: 'Moje' },
            { id: 'shared' as FileScope, label: 'Zdielané' },
            // Admin / team_admin: every file across ALL users
            ...(isAdmin ? [{ id: 'every' as FileScope, label: '👁 Všetci používatelia' }] : []),
          ]).map(s => (
            <button
              key={s.id}
              onClick={() => setFileScope(s.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                fileScope === s.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Search + Upload / Brand Add */}
      <div className="flex gap-2 px-4 pb-2 shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" placeholder="Hľadať..." aria-label="Hľadať súbory" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {canUpload && (
          <label className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 cursor-pointer whitespace-nowrap">
            + {uploading ? '...' : 'Nahrať'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
        {canAddBrand && (
          <button
            onClick={() => { setShowBrandForm(v => !v); setBrandFormError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90 cursor-pointer whitespace-nowrap"
          >
            ➕ Pridať
          </button>
        )}
      </div>

      {/* Brand inline add form — admin only, brand tab only */}
      {canAddBrand && showBrandForm && (
        <div className="mx-4 mb-2 p-3 rounded-xl border border-border bg-surface shrink-0 space-y-2">
          <div className="text-xs font-medium text-foreground mb-1">Nový brand súbor</div>

          {/* Type select */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-0.5">Typ</label>
            <select
              value={brandFormType}
              onChange={e => setBrandFormType(e.target.value as BrandAssetType)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {BRAND_ASSET_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Web / site selector */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-0.5">Web</label>
            <select
              value={brandFormSiteId}
              onChange={e => setBrandFormSiteId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">🌐 Všetky weby (globálny)</option>
              {brandSites.map(s => (
                <option key={s.id} value={s.id}>{s.isPrimary ? '⭐' : '🌐'} {s.domain}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-0.5">Názov</label>
            <input
              type="text"
              value={brandFormTitle}
              onChange={e => setBrandFormTitle(e.target.value)}
              placeholder="napr. Brand Voice Guide pre example.com"
              className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-0.5">Obsah (Markdown)</label>
            <textarea
              value={brandFormContent}
              onChange={e => setBrandFormContent(e.target.value)}
              rows={6}
              placeholder={'# Brand Voice Guide\n\n## Tón komunikácie\n...'}
              className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground font-mono placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {brandFormError && (
            <div className="text-[11px] text-red-500">{brandFormError}</div>
          )}

          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleBrandAdd}
              disabled={brandFormSaving || !brandFormTitle.trim() || !brandFormContent.trim()}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {brandFormSaving ? 'Ukladám...' : 'Uložiť'}
            </button>
            <button
              onClick={() => { setShowBrandForm(false); setBrandFormError(''); }}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer"
            >
              Zrušiť
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1 min-h-0">
        {loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Načítavam...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">{search ? 'Žiadne výsledky' : 'Žiadne súbory'}</div>
        ) : (
          filtered.map(item => (
            /* Mobile-first 2026-04-28: gap-2 on small (was 3), padding 2 on small, action icons w-9 h-9 on mobile (was w-11 h-11) — title gets more room. */
            <div key={`${item.source}-${item.id}`} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl hover:bg-surface-hover transition-colors group">
              {/* Context checkbox */}
              <button onClick={() => handleContextToggle(item)} title={isInContext(item.name) ? 'Odstrániť z kontextu' : 'Pridať do kontextu'}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                  isInContext(item.name) ? 'bg-primary border-primary text-white' : 'border-gray-300 dark:border-gray-600 hover:border-primary/50'
                }`}>
                {isInContext(item.name) && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{item.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {item.type && <span>{item.type}</span>}
                  {item.size > 0 && <span> · {formatSize(item.size)}</span>}
                  {item.date && <span> · {formatDate(item.date)}</span>}
                  {item.isShared && <span> · zdieľané</span>}
                </div>
              </div>

              {/* Action icons — always visible */}
              <div className="flex items-center gap-0.5">
                {/* View (reports) */}
                {item.viewUrl && (
                  <a href={item.viewUrl} target="_blank" rel="noopener" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-active transition-colors min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center" title="Zobraziť">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </a>
                )}
                {/* Edit (.md files, brand, templates, agents) */}
                {(item.source === 'brand' || item.source === 'templates' || (item.name.endsWith('.md') && canDelete(item))) && (
                  <button onClick={() => setEditingFile({ id: item.id, name: item.name, type: item.source })} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-active transition-colors cursor-pointer min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center" title="Upraviť">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </button>
                )}
                {/* Download */}
                {item.downloadUrl && (
                  <a href={item.downloadUrl} download className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-active transition-colors min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center" title="Stiahnuť">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  </a>
                )}
                {/* Share */}
                {canShare(item) && (
                  <button onClick={() => handleShare(item)} className={`p-2 rounded-lg transition-colors cursor-pointer ${item.isShared ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-surface-active'}`} title={item.isShared ? 'Zrušiť zdieľanie' : 'Zdieľať'}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                  </button>
                )}
                {/* Delete */}
                {canDelete(item) && (
                  <button onClick={() => handleDelete(item)} className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center" title="Vymazať">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Context bar at bottom */}
      {contextItems.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-2 bg-surface/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            V kontexte ({contextItems.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {contextItems.map(item => (
              <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px]">
                {item.label}
                <button onClick={() => onRemoveFromContext(item.id)} className="hover:text-red-500 cursor-pointer">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* File Editor overlay */}
      {editingFile && (
        <FileEditor
          isOpen={true}
          onClose={() => { setEditingFile(null); loadItems(); }}
          fileId={editingFile.id}
          fileName={editingFile.name}
          fileType={editingFile.type === 'brand' ? 'brand' : editingFile.type === 'templates' ? 'template' : 'file'}
        />
      )}
    </div>
  );
}
