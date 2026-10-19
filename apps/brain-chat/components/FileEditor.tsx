'use client';

import { useState, useEffect, useRef } from 'react';
import { MarkdownEditor } from './MarkdownEditor';

interface FileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  fileType: 'brand' | 'template' | 'file' | 'agent';
  initialContent?: string;
}

/**
 * Brain One UI — Full-screen markdown editor (MVP).
 * Future: replace with HedgeDoc integration.
 */
export function FileEditor({ isOpen, onClose, fileId, fileName, fileType, initialContent }: FileEditorProps) {
  const [content, setContent] = useState(initialContent || '');
  const [loading, setLoading] = useState(!initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load content if not provided
  useEffect(() => {
    if (!isOpen || initialContent) return;
    setLoading(true);

    let endpoint = '';
    if (fileType === 'brand') endpoint = `/api/brand/assets/${fileId}`;
    else if (fileType === 'template') {
      const parts = fileId.split('/');
      endpoint = `/api/admin/frameworks/${parts[0]}/${parts[1]}`;
    }
    else if (fileType === 'agent') endpoint = `/api/admin/agents/${fileId}`;
    else endpoint = `/api/files/${fileId}/content`;

    fetch(endpoint, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        if (data) {
          setContent(data.content || data.body || data.raw || '');
        }
      })
      .catch(err => {
        console.error('FileEditor load failed:', err);
        setLoadError(String(err.message || err));
      })
      .finally(() => setLoading(false));
  }, [isOpen, fileId, fileType, initialContent]);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [isOpen, loading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let endpoint = '';
      let body: Record<string, string> = {};

      if (fileType === 'brand') {
        endpoint = `/api/brand/assets/${fileId}`;
        body = { content };
      } else if (fileType === 'agent') {
        endpoint = `/api/admin/agents/${fileId}`;
        body = { content };
      } else if (fileType === 'template') {
        const parts = fileId.split('/');
        endpoint = `/api/admin/frameworks/${parts[0]}/${parts[1]}`;
        body = { content };
      } else {
        endpoint = `/api/files/${fileId}/content`;
        body = { content };
      }

      const res = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        setSaveError(null);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(`Uloženie zlyhalo (${res.status})`);
      }
    } catch (err) {
      console.error('FileEditor save failed:', err);
      setSaveError(String((err as Error).message || err));
    }
    finally { setSaving(false); }
  };

  // Ctrl+S to save
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, content]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border glass-surface">
        <div className="flex items-center gap-3">
          <span className="text-lg">📝</span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{fileName}</h2>
            <span className="text-[11px] text-muted-foreground">{fileType} · Ctrl+S uloží</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs text-red-500 font-medium" title={saveError}>⚠ {saveError}</span>
          )}
          {saved && (
            <span className="text-xs text-green-500 font-medium">Uložené ✓</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer min-h-[44px]"
          >
            {saving ? 'Ukladám...' : 'Uložiť'}
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Zavrieť editor"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Načítavam...</div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm">
            <span className="text-red-500">Nepodarilo sa načítať súbor</span>
            <span className="text-xs text-muted-foreground">{loadError}</span>
          </div>
        ) : (
          /* Run V 2026-05-27 — markdown files get the WYSIWYG MarkdownEditor
             with toolbar (same as chat expand modal). Non-markdown stays plain
             textarea. Detection: filename ends in .md OR explicit fileType. */
          /\.md$/i.test(fileName) || fileType === 'brand' || fileType === 'template' || fileType === 'agent' ? (
            <div className="w-full h-full p-4 overflow-y-auto">
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Píš v markdown…"
                minHeight={400}
                autoFocus
              />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-full p-6 bg-background text-foreground text-sm font-mono leading-relaxed resize-none focus:outline-none"
              spellCheck={false}
            />
          )
        )}
      </div>
    </div>
  );
}
