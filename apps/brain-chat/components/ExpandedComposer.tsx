'use client';

/**
 * ExpandedComposer — modal markdown editor for chat input.
 *
 * Run V (2026-05-27). Opened from ChatInput's expand button. Wraps the
 * reusable MarkdownEditor + a Save/Load row for per-user snippets, and
 * a "Použiť" button that pushes the markdown back into chat input.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Save, FolderOpen, ChevronDown, X, Send } from 'lucide-react';
import { MarkdownEditor } from './MarkdownEditor';

interface ExpandedComposerProps {
  initial: string;
  onClose: () => void;
  /** Push the composed text back to the chat input + close. */
  onApply: (text: string) => void;
  /** Optional immediate send instead of return to input. */
  onSend?: (text: string) => void;
}

interface SnippetMeta { slug: string; title: string; updated_at: string; }

export function ExpandedComposer({ initial, onClose, onApply, onSend }: ExpandedComposerProps) {
  const [title, setTitle] = useState<string>(() => defaultTitle());
  const [body, setBody] = useState<string>(initial || '');
  const [loadOpen, setLoadOpen] = useState(false);
  const [snippets, setSnippets] = useState<SnippetMeta[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const loadRef = useRef<HTMLDivElement>(null);

  // Snippets list — lazy fetch when Load popover opens.
  const refreshSnippets = useCallback(async () => {
    try {
      const r = await fetch('/api/snippets', { credentials: 'include' });
      const d = await r.json();
      setSnippets(Array.isArray(d?.snippets) ? d.snippets : []);
    } catch { setSnippets([]); }
  }, []);
  useEffect(() => { if (loadOpen) void refreshSnippets(); }, [loadOpen, refreshSnippets]);

  const handleSave = useCallback(async () => {
    if (!body.trim()) { setStatus('nič na uloženie'); setTimeout(() => setStatus(null), 2000); return; }
    try {
      const r = await fetch('/api/snippets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: body }),
      });
      const d = await r.json();
      if (d?.ok) setStatus(`✓ uložené → ${d.slug}`);
      else setStatus(`✗ ${d?.error ?? 'save failed'}`);
    } catch (e: any) { setStatus(`✗ ${e?.message ?? e}`); }
    setTimeout(() => setStatus(null), 3500);
  }, [title, body]);

  const handleLoad = useCallback(async (slug: string) => {
    try {
      const r = await fetch(`/api/snippets/${encodeURIComponent(slug)}`, { credentials: 'include' });
      const d = await r.json();
      if (d?.content !== undefined) {
        setBody(d.content);
        setTitle(d.title || slug);
      }
    } catch { /* silent */ }
    setLoadOpen(false);
  }, []);

  // Close Load popover on outside click.
  useEffect(() => {
    if (!loadOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!loadRef.current?.contains(e.target as Node)) setLoadOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [loadOpen]);

  // ESC closes the modal.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const charCount = body.length;
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const composed = title && title !== defaultTitle() ? `**${title.trim()}**\n\n${body}` : body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 bg-background border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Title row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-foreground text-base font-semibold border-none outline-none placeholder:text-muted-foreground"
            placeholder="Brain Dump title…"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            title="Zavrieť (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 p-3">
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Píš v markdown — ⌘/Ctrl+Enter pre odoslanie."
            onSubmit={() => onSend ? onSend(composed) : onApply(composed)}
            minHeight={320}
            autoFocus
          />
        </div>

        {/* Footer — Save/Load on left, counters in middle, Apply/Send on right */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
          <button
            onClick={handleSave}
            disabled={charCount === 0}
            title="Uložiť ako šablónu"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-foreground/5 hover:bg-foreground/10 border border-border font-mono text-[11px] text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={11} strokeWidth={1.8} />
            uložiť
          </button>

          <div className="relative" ref={loadRef}>
            <button
              onClick={() => setLoadOpen((v) => !v)}
              title="Načítať uloženú šablónu"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-foreground/5 hover:bg-foreground/10 border border-border font-mono text-[11px] text-muted-foreground transition-colors"
            >
              <FolderOpen size={11} strokeWidth={1.8} />
              načítať
              <ChevronDown size={9} className="opacity-60" />
            </button>
            {loadOpen && (
              <div className="absolute z-30 bottom-full left-0 mb-1 bg-card border border-border rounded-md shadow-lg p-1 flex flex-col gap-0.5 min-w-[260px] max-h-[300px] overflow-y-auto">
                {snippets.length === 0 ? (
                  <span className="px-2 py-3 font-mono text-[11px] text-muted-foreground text-center">
                    Žiadne uložené šablóny.
                  </span>
                ) : (
                  snippets.map((s) => (
                    <button
                      key={s.slug}
                      onClick={() => handleLoad(s.slug)}
                      className="text-left px-2 py-1.5 rounded font-mono text-[11px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors truncate"
                    >
                      {s.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {status && (
            <span className={`font-mono text-[10px] ${status.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
              {status}
            </span>
          )}

          <div className="flex-1" />

          <span className="font-mono text-[11px] text-muted-foreground">
            {wordCount} slov · {charCount} znakov
          </span>
          {charCount > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground ml-2">⌘↵</span>
          )}

          <button
            onClick={() => onApply(composed)}
            disabled={charCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 border border-border font-mono text-[11px] text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Vložiť do chat inputu"
          >
            použiť
          </button>
          {onSend && (
            <button
              onClick={() => onSend(composed)}
              disabled={charCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-mono text-[12px] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={11} strokeWidth={2} />
              odoslať
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function defaultTitle(): string {
  const d = new Date();
  return `Brain dump #${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
