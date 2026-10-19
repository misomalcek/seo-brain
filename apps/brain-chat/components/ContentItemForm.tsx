'use client';

import { useState, useEffect } from 'react';
import type { ContentItem, ContentStatus, ContentType, ContentAttachment, Site } from '@/lib/types';
import { createContent, updateContent, getPresence, listFiles, listSharedFiles, previewFile, getFileDownloadUrl } from '@/lib/api';
import { useToast } from './Toast';
import type { TeamUser, UserFile } from '@/lib/types';

interface ContentItemFormProps {
  item: ContentItem | null; // null = create, object = edit
  sites: Site[];
  onSave: () => void;
  onClose: () => void;
}

const STATUSES: { value: ContentStatus; label: string; icon: string }[] = [
  { value: 'idea', label: 'Napad', icon: '💡' },
  { value: 'brief', label: 'Brief', icon: '📋' },
  { value: 'draft', label: 'Draft', icon: '✏️' },
  { value: 'review', label: 'Review', icon: '🔍' },
  { value: 'published', label: 'Publikovane', icon: '✅' },
  { value: 'archived', label: 'Archivovane', icon: '📦' },
];

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'article', label: 'Clanok' },
  { value: 'landing-page', label: 'Landing Page' },
  { value: 'guide', label: 'Prirucka' },
  { value: 'case-study', label: 'Case Study' },
  { value: 'infographic', label: 'Infografika' },
  { value: 'video-script', label: 'Video Script' },
];

export function ContentItemForm({ item, sites, onSave, onClose }: ContentItemFormProps) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<TeamUser[]>([]);

  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState<ContentStatus>(item?.status || 'idea');
  const [contentType, setContentType] = useState<ContentType>(item?.contentType || 'article');
  const [siteId, setSiteId] = useState<string>(item?.siteId || '');
  const [assigneeId, setAssigneeId] = useState<string>(item?.assigneeId || '');
  const [deadline, setDeadline] = useState(item?.deadline ? item.deadline.slice(0, 16) : '');
  const [url, setUrl] = useState(item?.url || '');
  const [keywordsStr, setKeywordsStr] = useState(item?.keywords?.join(', ') || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [attachments, setAttachments] = useState<ContentAttachment[]>(item?.attachments || []);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [filePickerTab, setFilePickerTab] = useState<'mine' | 'shared'>('mine');
  const [availableFiles, setAvailableFiles] = useState<UserFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<UserFile[]>([]);
  const [previewingFile, setPreviewingFile] = useState<{ content: string; filename: string } | null>(null);

  // Load team members for assignee picker
  useEffect(() => {
    getPresence()
      .then(d => setUsers(d.users))
      .catch(() => {}); // ignore if team chat not set up
  }, []);

  const openFilePicker = async () => {
    setShowAttachPicker(true);
    if (availableFiles.length === 0) {
      const d = await listFiles(100);
      setAvailableFiles(d.files);
    }
    if (sharedFiles.length === 0) {
      const d = await listSharedFiles();
      setSharedFiles(d.files);
    }
  };

  const addAttachment = (a: ContentAttachment) => {
    if (!attachments.find(x => x.type === a.type && x.id === a.id)) {
      setAttachments(prev => [...prev, a]);
    }
    setShowAttachPicker(false);
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast('Nazov je povinny', 'error');
      return;
    }

    setSaving(true);
    try {
      const keywords = keywordsStr
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

      const data = {
        title: title.trim(),
        description: description || undefined,
        status,
        contentType,
        siteId: siteId || null,
        assigneeId: assigneeId || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        url: url || undefined,
        keywords,
        notes: notes || undefined,
        attachments,
      };

      if (item) {
        await updateContent(item.id, data);
        addToast('Polozka aktualizovana', 'success');
      } else {
        await createContent(data);
        addToast('Polozka vytvorena', 'success');
      }
      onSave();
    } catch {
      addToast('Ulozenie zlyhalo', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-bold text-foreground">
            {item ? 'Upravit polozku' : 'Nova polozka'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nazov *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nazov clanku alebo stranky"
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Status + Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ContentStatus)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Typ obsahu</label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value as ContentType)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CONTENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Site + Assignee row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Web</label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Vsetky --</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.domain}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prideleny</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Nikto --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Popis</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Kratky popis obsahu"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Keywords (ciarka oddelene)</label>
            <input
              type="text"
              value={keywordsStr}
              onChange={e => setKeywordsStr(e.target.value)}
              placeholder="seo, keyword research, content strategy"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Prilohy</label>
            {attachments.length > 0 && (
              <div className="space-y-1 mb-2">
                {attachments.map((a, i) => (
                  <div key={`${a.type}-${a.id}`} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <span>📄</span>
                    <span className="flex-1 truncate text-foreground">{a.title}</span>
                    {a.meta && <span className="text-muted-foreground">{a.meta}</span>}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const data = await previewFile(a.id);
                          if (data.preview) setPreviewingFile({ content: data.preview, filename: data.filename });
                          else addToast('Náhľad nie je dostupný pre tento typ súboru', 'error');
                        } catch { addToast('Nepodarilo sa načítať náhľad', 'error'); }
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Zobraziť"
                    >👁</button>
                    <a href={getFileDownloadUrl(a.id)} className="text-muted-foreground hover:text-foreground" title="Stiahnuť">⬇️</a>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-300" title="Odstrániť z príloh">×</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={openFilePicker} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground cursor-pointer">+ Súbor</button>
            {showAttachPicker && (
              <div className="mt-2 border border-border rounded-lg bg-background overflow-hidden">
                <div className="flex border-b border-border">
                  <button type="button" onClick={() => setFilePickerTab('mine')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium cursor-pointer ${filePickerTab === 'mine' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground'}`}>
                    Moje
                  </button>
                  <button type="button" onClick={() => setFilePickerTab('shared')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium cursor-pointer ${filePickerTab === 'shared' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground'}`}>
                    Tímové
                  </button>
                  <button type="button" onClick={() => setShowAttachPicker(false)} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">✕</button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {(filePickerTab === 'mine' ? availableFiles : sharedFiles).map(f => (
                    <button key={f.id} type="button" onClick={() => addAttachment({ type: 'file', id: f.id, title: f.originalName, meta: `${(f.size / 1024).toFixed(0)} KB` })}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-foreground cursor-pointer">
                      <span>📄</span>
                      <span className="truncate flex-1">{f.originalName}</span>
                      <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      {filePickerTab === 'shared' && f.userName && <span className="text-muted-foreground shrink-0">· {f.userName}</span>}
                    </button>
                  ))}
                  {(filePickerTab === 'mine' ? availableFiles : sharedFiles).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Žiadne súbory</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* File Preview Overlay */}
          {previewingFile && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewingFile(null)} />
              <div className="relative z-10 w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <h3 className="font-bold text-foreground text-sm truncate">{previewingFile.filename}</h3>
                  <button type="button" onClick={() => setPreviewingFile(null)} className="p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer" title="Späť">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-5 text-xs text-foreground whitespace-pre-wrap font-mono">{previewingFile.content}</pre>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Poznamky</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Interne poznamky..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Zrusit
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Ukladam...' : item ? 'Ulozit zmeny' : 'Vytvorit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
