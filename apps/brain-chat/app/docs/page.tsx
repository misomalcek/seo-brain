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

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  user: { label: 'Pre pouzivatelov', icon: '👤', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  admin: { label: 'Pre adminov', icon: '🔧', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  dev: { label: 'Pre vyvojarov', icon: '💻', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export default function DocsPage() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);

  useEffect(() => {
    fetch('/api/docs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.files) setFiles(data.files);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

  // Group files by category
  const grouped = files.reduce<Record<string, DocFile[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  // Simple markdown to HTML — content is admin-controlled server files, sanitized via escHtml
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
          html.push('<pre class="bg-surface-secondary rounded-lg p-4 overflow-x-auto my-3 text-sm"><code>');
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        html.push(escHtml(line));
        html.push('\n');
        continue;
      }

      // Table detection
      if (line.includes('|') && line.trim().startsWith('|')) {
        if (!inTable) {
          html.push('<div class="overflow-x-auto my-3"><table class="min-w-full text-sm border-collapse">');
          inTable = true;
        }
        if (line.replace(/[|\s-]/g, '') === '') continue; // separator row
        const cells = line.split('|').filter(c => c.trim() !== '');
        const tag = html.filter(h => h.includes('<tr')).length === 0 ? 'th' : 'td';
        html.push('<tr>' + cells.map(c => `<${tag} class="border border-border px-3 py-1.5 text-left">${formatInline(c.trim())}</${tag}>`).join('') + '</tr>');
        continue;
      } else if (inTable) {
        html.push('</table></div>');
        inTable = false;
      }

      if (line.trim() === '') { html.push('<br/>'); continue; }
      if (line.startsWith('# ')) { html.push(`<h1 class="text-2xl font-bold mt-6 mb-3 text-foreground">${formatInline(line.slice(2))}</h1>`); continue; }
      if (line.startsWith('## ')) { html.push(`<h2 class="text-xl font-semibold mt-5 mb-2 text-foreground">${formatInline(line.slice(3))}</h2>`); continue; }
      if (line.startsWith('### ')) { html.push(`<h3 class="text-lg font-medium mt-4 mb-2 text-foreground">${formatInline(line.slice(4))}</h3>`); continue; }
      if (line.match(/^---+$/)) { html.push('<hr class="my-4 border-border"/>'); continue; }
      if (line.match(/^[-*]\s/)) { html.push(`<li class="ml-4 list-disc text-foreground">${formatInline(line.slice(2))}</li>`); continue; }
      if (line.match(/^\d+\.\s/)) { html.push(`<li class="ml-4 list-decimal text-foreground">${formatInline(line.replace(/^\d+\.\s/, ''))}</li>`); continue; }
      html.push(`<p class="my-1 text-foreground">${formatInline(line)}</p>`);
    }
    if (inTable) html.push('</table></div>');
    return html.join('\n');
  };

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatInline = (s: string) => {
    return escHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-surface-secondary px-1 py-0.5 rounded text-sm font-mono">$1</code>');
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Nacitavam dokumentaciu...</div>;
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div className="w-64 shrink-0">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Dokumentacia</h2>
        {['user', 'admin', 'dev'].map(cat => {
          const catFiles = grouped[cat] || [];
          if (catFiles.length === 0) return null;
          const meta = CATEGORY_LABELS[cat];
          return (
            <div key={cat} className="mb-4">
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium mb-2 ${meta.color}`}>
                <span>{meta.icon}</span> {meta.label}
              </div>
              <div className="space-y-1">
                {catFiles.map(f => (
                  <button
                    key={f.path}
                    onClick={() => loadDoc(f.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      activeDoc?.path === f.path
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Content area — content is from admin-controlled .md files, sanitized via escHtml */}
      <div className="flex-1 min-w-0">
        {docLoading ? (
          <div className="text-center py-12 text-muted-foreground">Nacitavam...</div>
        ) : activeDoc ? (
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_LABELS[activeDoc.category]?.color || ''}`}>
                {CATEGORY_LABELS[activeDoc.category]?.icon} {activeDoc.category}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(activeDoc.updatedAt).toLocaleDateString('sk')} | {(activeDoc.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              // Safe: content from admin-controlled server files, all text escaped via escHtml()
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activeDoc.content) }}
            />
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📖</div>
            <p className="text-muted-foreground">Vyber dokument z menu vlavo</p>
          </div>
        )}
      </div>
    </div>
  );
}
