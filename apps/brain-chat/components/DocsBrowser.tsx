'use client';

import { useState, useEffect } from 'react';

interface DocFile {
  path: string;
  name: string;
  category: string;
  size: number;
  updatedAt: string;
}

interface DocContent {
  path: string;
  name: string;
  category: string;
  content: string;
  size: number;
  updatedAt: string;
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  user: { label: 'Pre používateľov', icon: '👤', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  admin: { label: 'Pre adminov', icon: '🔧', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  dev: { label: 'Pre vývojárov', icon: '💻', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

interface DocsBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export function DocsBrowser({ isOpen, onClose, embedded }: DocsBrowserProps) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  useEffect(() => {
    if (isOpen && files.length === 0) {
      setLoading(true);
      fetch('/api/docs', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.files) setFiles(data.files);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const loadDoc = async (docPath: string) => {
    setDocLoading(true);
    try {
      const res = await fetch(`/api/docs/${docPath}`, { credentials: 'include' });
      if (res.ok) {
        const doc = await res.json();
        setActiveDoc(doc);
      }
    } catch { /* ignore */ }
    setDocLoading(false);
  };

  if (!isOpen) return null;

  const grouped = files.reduce<Record<string, DocFile[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  // Escape HTML to prevent XSS — content is from admin-controlled server .md files
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatInline = (s: string) => {
    return escHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-card px-1 py-0.5 rounded text-xs font-mono">$1</code>');
  };

  // Render markdown to HTML — same approach as docs/page.tsx
  // Content source: admin-controlled .md files from /opt/team-brain/docs/
  // All text content is escaped via escHtml() before insertion
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const html: string[] = [];
    let inCodeBlock = false;
    let inTable = false;

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          html.push('</code></pre>');
          inCodeBlock = false;
        } else {
          html.push('<pre class="bg-card rounded-lg p-4 overflow-x-auto my-3 text-sm border border-border/50"><code>');
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        html.push(escHtml(line));
        html.push('\n');
        continue;
      }

      if (line.includes('|') && line.trim().startsWith('|')) {
        if (!inTable) {
          html.push('<div class="overflow-x-auto my-3"><table class="min-w-full text-sm border-collapse">');
          inTable = true;
        }
        if (line.replace(/[|\s-]/g, '') === '') continue;
        const cells = line.split('|').filter(c => c.trim() !== '');
        const tag = html.filter(h => h.includes('<tr')).length === 0 ? 'th' : 'td';
        html.push('<tr>' + cells.map(c => `<${tag} class="border border-border px-3 py-1.5 text-left">${formatInline(c.trim())}</${tag}>`).join('') + '</tr>');
        continue;
      } else if (inTable) {
        html.push('</table></div>');
        inTable = false;
      }

      if (line.trim() === '') { html.push('<br/>'); continue; }
      if (line.startsWith('# ')) { html.push(`<h1 class="text-xl font-bold mt-5 mb-2 text-foreground">${formatInline(line.slice(2))}</h1>`); continue; }
      if (line.startsWith('## ')) { html.push(`<h2 class="text-lg font-semibold mt-4 mb-2 text-foreground">${formatInline(line.slice(3))}</h2>`); continue; }
      if (line.startsWith('### ')) { html.push(`<h3 class="text-base font-medium mt-3 mb-1.5 text-foreground">${formatInline(line.slice(4))}</h3>`); continue; }
      if (line.match(/^---+$/)) { html.push('<hr class="my-4 border-border"/>'); continue; }
      if (line.match(/^[-*]\s/)) { html.push(`<li class="ml-4 list-disc text-foreground text-sm">${formatInline(line.slice(2))}</li>`); continue; }
      if (line.match(/^\d+\.\s/)) { html.push(`<li class="ml-4 list-decimal text-foreground text-sm">${formatInline(line.replace(/^\d+\.\s/, ''))}</li>`); continue; }
      html.push(`<p class="my-1 text-foreground text-sm">${formatInline(line)}</p>`);
    }
    if (inTable) html.push('</table></div>');
    return html.join('\n');
  };

  const docsContent = (
    <div className={embedded ? "flex flex-col h-full min-h-0" : "relative w-full max-w-lg h-full bg-background border-l border-border overflow-hidden flex flex-col animate-in slide-in-from-right"}
      onClick={e => e.stopPropagation()}
    >
      {/* Header — skip in embedded */}
      {!embedded && <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            📖 Dokumentácia
            <span className="text-sm font-normal text-muted-foreground">({files.length})</span>
          </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeDoc ? (
            <div>
              <button
                onClick={() => setActiveDoc(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer"
              >
                ← Späť na zoznam
              </button>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_META[activeDoc.category]?.color || ''}`}>
                  {CATEGORY_META[activeDoc.category]?.icon} {activeDoc.category}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(activeDoc.updatedAt).toLocaleDateString('sk')}
                </span>
              </div>
              {docLoading ? (
                <div className="text-center text-muted-foreground py-8 animate-pulse">Načítavam...</div>
              ) : (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activeDoc.content) }}
                />
              )}
            </div>
          ) : loading ? (
            <div className="text-center text-muted-foreground py-8 animate-pulse">
              Načítavam dokumentáciu...
            </div>
          ) : files.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <div className="text-3xl mb-3">📖</div>
              <p className="text-sm">Žiadne dokumenty</p>
              <p className="text-xs mt-1">Pridajte .md súbory do /docs/</p>
            </div>
          ) : (
            <div className="space-y-5">
              {['user', 'admin', 'dev'].map(cat => {
                const catFiles = grouped[cat] || [];
                if (catFiles.length === 0) return null;
                const meta = CATEGORY_META[cat];
                return (
                  <div key={cat}>
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium mb-2 ${meta.color}`}>
                      <span>{meta.icon}</span> {meta.label}
                    </div>
                    <div className="space-y-1">
                      {catFiles.map(f => (
                        <button
                          key={f.path}
                          onClick={() => loadDoc(f.path)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{f.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(f.size / 1024).toFixed(1)} KB · {new Date(f.updatedAt).toLocaleDateString('sk')}
                            </div>
                          </div>
                          <span className="text-muted-foreground text-xs">→</span>
                        </button>
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

  if (embedded) return docsContent;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      {docsContent}
    </div>
  );
}
