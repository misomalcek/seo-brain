'use client';

import { useState, useMemo } from 'react';
import type { ConversationSummary } from '@/lib/api';

interface ChatsPanelProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

function timeGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 1) return 'Dnes';
  if (days < 2) return 'Včera';
  if (days < 7) return 'Tento týždeň';
  if (days < 30) return 'Tento mesiac';
  return 'Staršie';
}

export function ChatsPanel({ conversations, activeConversationId, onSelect, onDelete, onNewChat }: ChatsPanelProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => c.title?.toLowerCase().includes(q));
  }, [conversations, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, ConversationSummary[]> = {};
    for (const c of filtered) {
      const group = timeGroup(c.updated_at || c.created_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(c);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search + New */}
      <div className="flex gap-2 p-4 shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Hľadať konverzácie..." aria-label="Hľadať konverzácie"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nový
        </button>
      </div>

      {/* Conversations grouped by time */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {Object.entries(grouped).map(([group, convos]) => (
          <div key={group}>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">{group}</div>
            <div className="space-y-0.5">
              {convos.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                    activeConversationId === c.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  <svg className="h-4 w-4 text-muted-foreground/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="text-sm text-foreground truncate flex-1">{c.title || 'Bez názvu'}</span>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                    className="p-1 rounded-lg text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Vymazať"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {search ? 'Žiadne výsledky' : 'Zatiaľ žiadne konverzácie'}
          </div>
        )}
      </div>
    </div>
  );
}
