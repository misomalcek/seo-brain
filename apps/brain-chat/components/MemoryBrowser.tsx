'use client';

/**
 * MemoryBrowser — full-featured memory management widget (2026-05-26).
 * Extracted from app/admin/memory/page.tsx so the rich UI (filters, sort,
 * pin/edit/delete, anchor, decay, auto-activate, plus admin inbox &
 * knowledge tabs) is available from the user-facing dock Pamäť overlay
 * AND the admin route. The isAdmin prop hides the inbox+knowledge tabs
 * and the admin-only decay/auto-activate buttons when false.
 */

import { useState, useEffect, useCallback } from 'react';

type Tab = 'brain' | 'inbox' | 'knowledge';

interface MemoryBrowserProps {
  /** Show inbox + knowledge tabs and admin-only buttons (decay, auto-activate). */
  isAdmin: boolean;
}

// --- Brain Memory types ---
interface BrainMemory {
  id: string;
  content: string;
  category: string;
  domains: string[];
  use_count: number;
  last_used_at: string | null;
  source_type: string;
  source_quote: string | null;
  is_active: boolean;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoryStats {
  total: number;
  active: number;
  pending: number;
  pinned: number;
  byCategory: Record<string, number>;
  totalChars: number;
  budgetUsed: string;
  extractions_attempted_24h: number;
  extractions_succeeded_24h: number;
  extraction_errors_24h: number;
}

// --- Inbox/Knowledge types ---
interface InboxFile {
  filename: string;
  preview: string;
  size: number;
  createdAt: string;
}

interface KnowledgeFile {
  filename: string;
  size: number;
  updatedAt: string;
}

interface KnowledgeDetail {
  filename: string;
  content: string;
  size: number;
  updatedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  domain: 'text-blue-400 bg-blue-400/10',
  preference: 'text-purple-400 bg-purple-400/10',
  pattern: 'text-amber-400 bg-amber-400/10',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  remember: '/remember',
  extracted: 'Auto-extracted',
  admin: 'Admin',
};

export function MemoryBrowser({ isAdmin }: MemoryBrowserProps) {
  const [tab, setTab] = useState<Tab>('brain');

  // === Brain Memory state ===
  const [memories, setMemories] = useState<BrainMemory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainFilter, setBrainFilter] = useState<'all' | 'active' | 'pending'>('all');
  const [brainCategory, setBrainCategory] = useState<string>('');
  const [brainSearch, setBrainSearch] = useState('');
  // #5 (2026-04-29) — sort tabs: newest / most-used (mine) / most-used (all)
  const [brainSort, setBrainSort] = useState<'newest' | 'used_mine' | 'used_all'>('newest');
  const [editingMemory, setEditingMemory] = useState<BrainMemory | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDomains, setEditDomains] = useState('');
  const [creatingMemory, setCreatingMemory] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('domain');
  const [newDomains, setNewDomains] = useState('');

  // === Inbox state ===
  const [inboxFiles, setInboxFiles] = useState<InboxFile[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedInbox, setSelectedInbox] = useState<{ filename: string; content: string } | null>(null);

  // === Knowledge state ===
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [totalChars, setTotalChars] = useState(0);
  const [maxPerFile, setMaxPerFile] = useState(2000);
  const [maxTotal, setMaxTotal] = useState(8000);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<KnowledgeDetail | null>(null);
  const [editFileContent, setEditFileContent] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  // === Brain Memory API ===
  const loadMemories = useCallback(async () => {
    setBrainLoading(true);
    try {
      const params = new URLSearchParams();
      if (brainFilter === 'active') params.set('active', 'true');
      if (brainFilter === 'pending') params.set('active', 'false');
      if (brainCategory) params.set('category', brainCategory);
      if (brainSearch) params.set('search', brainSearch);
      // #5 (2026-04-29) — sort + scope mapping:
      //   newest    → sort=created_at desc, all users
      //   used_mine → sort=use_count desc, only my-created memories (mine=true)
      //   used_all  → sort=use_count desc, all users
      if (brainSort === 'newest') {
        params.set('sort', 'created_at');
      } else {
        params.set('sort', 'use_count');
        if (brainSort === 'used_mine') params.set('mine', 'true');
      }
      params.set('order', 'desc');

      const res = await fetch(`/api/brain-memory?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch { /* ignore */ }
    setBrainLoading(false);
  }, [brainFilter, brainCategory, brainSearch, brainSort]);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/brain-memory/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ }
  };

  const toggleActive = async (id: string) => {
    try {
      await fetch(`/api/brain-memory/${id}/toggle`, { method: 'PATCH', credentials: 'include' });
      loadMemories();
      loadStats();
    } catch { /* ignore */ }
  };

  const togglePin = async (id: string) => {
    try {
      await fetch(`/api/brain-memory/${id}/pin`, { method: 'PATCH', credentials: 'include' });
      loadMemories();
    } catch { /* ignore */ }
  };

  const deleteMemory = async (id: string) => {
    if (!confirm('Naozaj vymazat tuto pamat?')) return;
    try {
      await fetch(`/api/brain-memory/${id}`, { method: 'DELETE', credentials: 'include' });
      setEditingMemory(null);
      loadMemories();
      loadStats();
    } catch { /* ignore */ }
  };

  const saveMemory = async () => {
    if (!editingMemory) return;
    try {
      const res = await fetch(`/api/brain-memory/${editingMemory.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
          category: editCategory,
          domains: editDomains ? editDomains.split(',').map(d => d.trim()) : [],
        }),
      });
      if (res.ok) {
        setEditingMemory(null);
        loadMemories();
      }
    } catch { /* ignore */ }
  };

  const createMemory = async () => {
    try {
      const res = await fetch('/api/brain-memory', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          category: newCategory,
          domains: newDomains ? newDomains.split(',').map(d => d.trim()) : [],
          source_type: 'admin',
        }),
      });
      if (res.ok) {
        setCreatingMemory(false);
        setNewContent('');
        setNewDomains('');
        loadMemories();
        loadStats();
      }
    } catch { /* ignore */ }
  };

  const runAutoActivate = async () => {
    try {
      const res = await fetch('/api/brain-memory/auto-activate', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        alert(`Auto-aktivovanych: ${data.activated}`);
        loadMemories();
        loadStats();
      }
    } catch { /* ignore */ }
  };

  const runDecay = async () => {
    if (!confirm('Spustit decay? Deaktivuje stare nepouzivane pamate.')) return;
    try {
      const res = await fetch('/api/brain-memory/decay', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        alert(`Deaktivovanych: ${data.deactivated}`);
        loadMemories();
        loadStats();
      }
    } catch { /* ignore */ }
  };

  // === Inbox API ===
  const loadInbox = async () => {
    setInboxLoading(true);
    try {
      const res = await fetch('/api/admin/memory/inbox', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setInboxFiles(data.files || []);
      }
    } catch { /* ignore */ }
    setInboxLoading(false);
  };

  const viewInboxFile = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/memory/inbox/${encodeURIComponent(filename)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSelectedInbox({ filename, content: data.content });
      }
    } catch { /* ignore */ }
  };

  const approveInbox = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/memory/inbox/${encodeURIComponent(filename)}/approve`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        setSelectedInbox(null);
        loadInbox();
      } else {
        const data = await res.json();
        alert(data.error || 'Approve failed');
      }
    } catch { /* ignore */ }
  };

  const deleteInbox = async (filename: string) => {
    if (!confirm(`Naozaj vymazat "${filename}"?`)) return;
    try {
      await fetch(`/api/admin/memory/inbox/${encodeURIComponent(filename)}`, {
        method: 'DELETE', credentials: 'include',
      });
      setSelectedInbox(null);
      loadInbox();
    } catch { /* ignore */ }
  };

  // === Knowledge API ===
  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const res = await fetch('/api/admin/knowledge', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setKnowledgeFiles(data.files || []);
        setTotalChars(data.totalChars || 0);
        if (data.maxPerFile) setMaxPerFile(data.maxPerFile);
        if (data.maxTotal) setMaxTotal(data.maxTotal);
      }
    } catch { /* ignore */ }
    setKnowledgeLoading(false);
  };

  const openKnowledgeFile = async (filename: string) => {
    try {
      const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(filename)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEditingFile(data);
        setEditFileContent(data.content);
        setCreatingFile(false);
      }
    } catch { /* ignore */ }
  };

  const saveKnowledge = async () => {
    if (!editingFile) return;
    try {
      const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(editingFile.filename)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editFileContent }),
      });
      if (res.ok) {
        loadKnowledge();
        setEditingFile({ ...editingFile, content: editFileContent, size: editFileContent.length });
      } else {
        const data = await res.json();
        alert(data.error || 'Save failed');
      }
    } catch { /* ignore */ }
  };

  const deleteKnowledge = async (filename: string) => {
    if (!confirm(`Naozaj vymazat "${filename}" z knowledge base?`)) return;
    try {
      await fetch(`/api/admin/knowledge/${encodeURIComponent(filename)}`, {
        method: 'DELETE', credentials: 'include',
      });
      setEditingFile(null);
      loadKnowledge();
    } catch { /* ignore */ }
  };

  const createKnowledgeFile = async () => {
    const fn = newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`;
    try {
      const res = await fetch('/api/admin/knowledge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fn, content: newFileContent }),
      });
      if (res.ok) {
        setCreatingFile(false);
        setNewFilename('');
        setNewFileContent('');
        loadKnowledge();
      } else {
        const data = await res.json();
        alert(data.error || 'Create failed');
      }
    } catch { /* ignore */ }
  };

  // === Effects ===
  useEffect(() => {
    if (tab === 'brain') { loadMemories(); loadStats(); }
    if (tab === 'inbox') loadInbox();
    if (tab === 'knowledge') loadKnowledge();
  }, [tab, loadMemories]);

  // Debounced search
  useEffect(() => {
    if (tab !== 'brain') return;
    const timer = setTimeout(() => loadMemories(), 300);
    return () => clearTimeout(timer);
  }, [brainSearch, brainFilter, brainCategory, tab, loadMemories]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🧠 Memory
        </h1>
        <div className="flex gap-1 bg-card/50 p-1 rounded-xl">
          <button
            onClick={() => setTab('brain')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === 'brain' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🧠 Brain Memory {stats ? `(${stats.active})` : ''}
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setTab('inbox')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === 'inbox' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📥 Inbox {inboxFiles.length > 0 && `(${inboxFiles.length})`}
              </button>
              <button
                onClick={() => setTab('knowledge')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  tab === 'knowledge' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📚 Knowledge
              </button>
            </>
          )}
        </div>
      </div>

      {/* ======================== BRAIN MEMORY TAB ======================== */}
      {tab === 'brain' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Stats bar */}
          {stats && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground" role="status" aria-label="Statistiky pamati">
              <span>Celkom: <strong className="text-foreground">{stats.total}</strong></span>
              <span>Aktiv.: <strong className="text-emerald-400">{stats.active}</strong></span>
              <span>Cakajuce: <strong className="text-amber-400">{stats.pending}</strong></span>
              <span>Pripnute: <strong className="text-blue-400">{stats.pinned}</strong></span>
              <span className="sm:ml-auto">Budget: <strong className="text-foreground">{stats.budgetUsed}</strong> znakov</span>
              <span className={stats.extractions_succeeded_24h === 0 && stats.extractions_attempted_24h === 0 ? 'text-amber-400' : ''}>
                Dnes extrah.: <strong>{stats.extractions_succeeded_24h}</strong>{stats.extractions_succeeded_24h === 0 && stats.extractions_attempted_24h === 0 ? ' (neaktivne)' : ''}
              </span>
            </div>
          )}

          {/* Toolbar — #5 (2026-04-29) added sort tabs (Najnovšie / Najpoužívanejšie moje|celkovo) */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex gap-1 bg-card/50 p-0.5 rounded-lg" role="group" aria-label="Filter pamati">
              {(['all', 'active', 'pending'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setBrainFilter(f)}
                  aria-pressed={brainFilter === f}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    brainFilter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'Vsetky' : f === 'active' ? 'Aktivne' : 'Cakajuce'}
                </button>
              ))}
            </div>
            {/* Sort tabs — #5 */}
            <div className="flex gap-1 bg-card/50 p-0.5 rounded-lg" role="group" aria-label="Zoradenie pamati">
              {([
                { id: 'newest' as const, label: 'Najnovšie', icon: '🆕' },
                { id: 'used_mine' as const, label: 'Najpoužívanejšie (moje)', icon: '👤' },
                { id: 'used_all' as const, label: 'Najpoužívanejšie (celkovo)', icon: '🌍' },
              ]).map(s => (
                <button
                  key={s.id}
                  onClick={() => setBrainSort(s.id)}
                  aria-pressed={brainSort === s.id}
                  title={s.label}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    brainSort === s.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="mr-1">{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
            <select
              value={brainCategory}
              onChange={e => setBrainCategory(e.target.value)}
              aria-label="Kategoria"
              className="bg-card border border-border/50 rounded-lg px-2 py-1 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Vsetky kategorie</option>
              <option value="domain">Domena</option>
              <option value="preference">Preferencia</option>
              <option value="pattern">Vzor</option>
            </select>
            <input
              type="text"
              placeholder="Hladat..."
              value={brainSearch}
              onChange={e => setBrainSearch(e.target.value)}
              aria-label="Hladat v pamatiach"
              className="flex-1 min-w-[120px] bg-card border border-border/50 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => setCreatingMemory(true)}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors cursor-pointer"
            >
              + Nova
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={runAutoActivate}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                  title="Auto-aktivovat pending pamate starsie ako 7 dni"
                >
                  Auto-aktivovat
                </button>
                <button
                  onClick={runDecay}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                  title="Deaktivovat stare nepouzivane pamate"
                >
                  Decay
                </button>
              </>
            )}
          </div>

          {/* Create form */}
          {creatingMemory && (
            <div className="mb-3 p-3 border border-primary/30 rounded-xl bg-card/50">
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="bg-card border border-border/50 rounded-lg px-2 py-1 text-xs cursor-pointer"
                >
                  <option value="domain">Domain</option>
                  <option value="preference">Preference</option>
                  <option value="pattern">Pattern</option>
                </select>
                <input
                  type="text"
                  placeholder="Domeny (volitelne, ciarkou: example.com, example-dev.com)"
                  value={newDomains}
                  onChange={e => setNewDomains(e.target.value)}
                  className="flex-1 bg-card border border-border/50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Obsah pamati (max 300 znakov)..."
                rows={2}
                className="w-full bg-card border border-border/50 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${newContent.length > 300 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {newContent.length}/300
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setCreatingMemory(false)} className="px-3 py-1 rounded-lg border border-border text-xs hover:bg-card cursor-pointer">Zrusit</button>
                  <button
                    onClick={createMemory}
                    disabled={!newContent.trim() || newContent.length > 300}
                    className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    Vytvorit (aktivna)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Memory list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {brainLoading ? (
              <div className="text-center text-muted-foreground py-8 animate-pulse">Nacitavam...</div>
            ) : memories.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <div className="text-3xl mb-2">🧠</div>
                <p className="text-sm">Ziadne pamate</p>
              </div>
            ) : (
              memories.map(m => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl border transition-colors ${
                    editingMemory?.id === m.id
                      ? 'border-primary bg-primary/5'
                      : m.is_active
                        ? 'border-border bg-card/50 hover:bg-card'
                        : 'border-border/50 bg-card/20 hover:bg-card/30 opacity-70'
                  }`}
                >
                  {editingMemory?.id === m.id ? (
                    /* Edit mode */
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={editCategory}
                          onChange={e => setEditCategory(e.target.value)}
                          className="bg-card border border-border/50 rounded-lg px-2 py-1 text-xs cursor-pointer"
                        >
                          <option value="domain">Domain</option>
                          <option value="preference">Preference</option>
                          <option value="pattern">Pattern</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Domeny"
                          value={editDomains}
                          onChange={e => setEditDomains(e.target.value)}
                          className="flex-1 bg-card border border-border/50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={2}
                        className="w-full bg-card border border-border/50 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs ${editContent.length > 300 ? 'text-red-400' : 'text-muted-foreground'}`}>{editContent.length}/300</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingMemory(null)} className="px-3 py-1 rounded-lg border border-border text-xs hover:bg-card cursor-pointer">Zrusit</button>
                          <button onClick={() => deleteMemory(m.id)} className="px-3 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 cursor-pointer">Vymazat</button>
                          <button
                            onClick={saveMemory}
                            disabled={editContent.length > 300}
                            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
                          >
                            Ulozit
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[m.category] || 'text-gray-400 bg-gray-400/10'}`}>
                            {m.category}
                          </span>
                          {m.domains.length > 0 && m.domains.map(d => (
                            <span key={d} className="px-2 py-0.5 rounded-full text-xs bg-card border border-border/50 text-muted-foreground">{d}</span>
                          ))}
                          {m.is_pinned && <span className="text-xs" title="Pinned">📌</span>}
                          {!m.is_active && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-400/10 text-amber-400">cakajuce</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => togglePin(m.id)}
                            className={`p-1 rounded-md text-xs transition-colors cursor-pointer ${m.is_pinned ? 'text-blue-400 hover:text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}
                            title={m.is_pinned ? 'Odopnut' : 'Pripnut'}
                            aria-label={m.is_pinned ? 'Odopnut pamat' : 'Pripnut pamat'}
                          >
                            📌
                          </button>
                          <button
                            onClick={() => toggleActive(m.id)}
                            className={`p-1 rounded-md text-xs transition-colors cursor-pointer ${m.is_active ? 'text-emerald-400 hover:text-emerald-300' : 'text-amber-400 hover:text-amber-300'}`}
                            title={m.is_active ? 'Deaktivovat' : 'Aktivovat'}
                            aria-label={m.is_active ? 'Deaktivovat pamat' : 'Aktivovat pamat'}
                          >
                            {m.is_active ? '✅' : '⏳'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingMemory(m);
                              setEditContent(m.content);
                              setEditCategory(m.category);
                              setEditDomains(m.domains.join(', '));
                            }}
                            className="p-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="Upravit"
                            aria-label="Upravit pamat"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteMemory(m.id)}
                            className="p-1 rounded-md text-xs text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                            title="Vymazat"
                            aria-label="Vymazat pamat"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground mt-1.5">{m.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{SOURCE_LABELS[m.source_type] || m.source_type}</span>
                        <span>Pouzite: {m.use_count}x</span>
                        {m.last_used_at && <span>Naposledy: {new Date(m.last_used_at).toLocaleDateString('sk')}</span>}
                        <span>{new Date(m.created_at).toLocaleDateString('sk')}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================== INBOX TAB ======================== */}
      {tab === 'inbox' && (
        <div className="flex-1 flex flex-col sm:flex-row gap-4 min-h-0">
          <div className="sm:w-1/2 overflow-y-auto border border-border rounded-xl p-3 space-y-2">
            {inboxLoading ? (
              <div className="text-center text-muted-foreground py-8 animate-pulse">Nacitavam...</div>
            ) : inboxFiles.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <div className="text-3xl mb-2">📥</div>
                <p className="text-sm">Inbox je prazdny</p>
                <p className="text-xs mt-1">Nove zaznamy sa objavia po pouziti /remember</p>
              </div>
            ) : (
              inboxFiles.map(f => (
                <button
                  key={f.filename}
                  onClick={() => viewInboxFile(f.filename)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    selectedInbox?.filename === f.filename
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30 hover:bg-card'
                  }`}
                >
                  <div className="text-sm font-medium truncate">{f.preview}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {f.size} znakov · {new Date(f.createdAt).toLocaleDateString('sk')}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="sm:w-1/2 border border-border rounded-xl p-4 overflow-y-auto">
            {selectedInbox ? (
              <div>
                <div className="text-xs text-muted-foreground mb-2">{selectedInbox.filename}</div>
                <pre className="text-sm whitespace-pre-wrap bg-card rounded-lg p-3 border border-border/50 mb-4 max-h-[50vh] overflow-y-auto">
                  {selectedInbox.content}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveInbox(selectedInbox.filename)}
                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors cursor-pointer"
                  >
                    Schvalit
                  </button>
                  <button
                    onClick={() => deleteInbox(selectedInbox.filename)}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Vymazat
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">Vyber zaznam zo zoznamu</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================== KNOWLEDGE TAB ======================== */}
      {tab === 'knowledge' && (
        <div className="flex-1 flex flex-col sm:flex-row gap-4 min-h-0">
          <div className="sm:w-1/3 overflow-y-auto border border-border rounded-xl p-3 space-y-2">
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Celkovo</span>
                <span>{totalChars} / {maxTotal} znakov</span>
              </div>
              <div className="h-2 bg-card rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${totalChars > maxTotal * 0.8 ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (totalChars / maxTotal) * 100)}%` }}
                />
              </div>
            </div>
            {knowledgeLoading ? (
              <div className="text-center text-muted-foreground py-8 animate-pulse">Nacitavam...</div>
            ) : (
              <>
                {knowledgeFiles.map(f => (
                  <button
                    key={f.filename}
                    onClick={() => openKnowledgeFile(f.filename)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      editingFile?.filename === f.filename
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30 hover:bg-card'
                    }`}
                  >
                    <div className="text-sm font-medium">{f.filename}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {f.size} / {maxPerFile} znakov
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { setCreatingFile(true); setEditingFile(null); }}
                  className="w-full text-center p-3 rounded-xl border border-dashed border-border hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  + Novy subor
                </button>
              </>
            )}
          </div>
          <div className="sm:w-2/3 border border-border rounded-xl p-4 flex flex-col">
            {creatingFile ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="nazov-suboru.md"
                    value={newFilename}
                    onChange={e => setNewFilename(e.target.value)}
                    className="flex-1 bg-card border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <textarea
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  className="flex-1 bg-card border border-border/50 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Obsah knowledge suboru..."
                />
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs ${newFileContent.length > maxPerFile ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {newFileContent.length} / {maxPerFile} znakov
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setCreatingFile(false)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-card transition-colors cursor-pointer">Zrusit</button>
                    <button
                      onClick={createKnowledgeFile}
                      disabled={!newFilename || !newFileContent || newFileContent.length > maxPerFile}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      Vytvorit
                    </button>
                  </div>
                </div>
              </>
            ) : editingFile ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">{editingFile.filename}</span>
                  <button
                    onClick={() => deleteKnowledge(editingFile.filename)}
                    className="px-3 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    Vymazat
                  </button>
                </div>
                <textarea
                  value={editFileContent}
                  onChange={e => setEditFileContent(e.target.value)}
                  className="flex-1 bg-card border border-border/50 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs ${editFileContent.length > maxPerFile ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {editFileContent.length} / {maxPerFile} znakov
                  </span>
                  <button
                    onClick={saveKnowledge}
                    disabled={editFileContent === editingFile.content || editFileContent.length > maxPerFile}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    Ulozit
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">Vyber subor alebo vytvor novy</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
