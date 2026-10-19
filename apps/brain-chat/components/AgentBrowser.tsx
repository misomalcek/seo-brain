'use client';

/**
 * AgentBrowser — Sprint E (2026-05-22)
 *
 * Rebuilt from 50+ cluttered cards → 6 specialist hero cards + searchable sub-agents.
 *
 * Data:
 *   /knowledge/agents/specialists → 6 SpecialistCard objects (fast, cached)
 *   /knowledge/agents             → all AgentInfo objects (lazy, loaded on sub-agent expand)
 *
 * Layout:
 *   ┌─ Header: title + Add Agent (Sprint G placeholder) + search + type filter ─┐
 *   │  ŠPECIALISTS — 2-col grid, hero cards with icon/color/tools/modes/absorbs  │
 *   │  SUB-AGENTI  — compact list, grouped under parent specialist               │
 *   └──────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useMemo } from 'react';
import { getSpecialistCards, getAgents } from '@/lib/api';
import type { SpecialistCard, AgentInfo } from '@/lib/types';

interface AgentBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoke: (agent: AgentInfo | SpecialistCard) => void;
  embedded?: boolean;
}

type ViewFilter = 'all' | 'specialists' | 'sub-agents';

// ── Model badge ───────────────────────────────────────────────────────────────

const MODEL_LABEL: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  'sonnet-high': 'Sonnet+',
};

// ── Specialist hero card ───────────────────────────────────────────────────────

function SpecialistHeroCard({
  card,
  onInvoke,
}: {
  card: SpecialistCard;
  onInvoke: (card: SpecialistCard) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolCount = card.toolCount === 'ALL' ? '∞' : card.toolCount;

  return (
    <div
      className="rounded-2xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:shadow-black/10"
      style={{ borderColor: `${card.color}30` }}
    >
      {/* Color accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: card.color }} />

      <div className="p-4">
        {/* Icon + name row */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">{card.icon}</span>
            <div>
              <h3 className="font-bold text-sm leading-tight">{card.nameLocalized}</h3>
              <span className="text-[10px] text-muted-foreground">{MODEL_LABEL[card.model] || card.model}</span>
            </div>
          </div>
          {/* Edit placeholder — Sprint G */}
          <button
            disabled
            title="Úprava agentov — Sprint G"
            className="p-1.5 rounded-lg text-muted-foreground/30 cursor-not-allowed text-xs"
            aria-label="Upraviť agenta (pripravujeme)"
          >
            ✏️
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
          {card.descriptionLocalized}
        </p>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
            style={{
              backgroundColor: `${card.color}15`,
              color: card.color,
              borderColor: `${card.color}30`,
            }}
          >
            {toolCount} nástrojov
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {card.absorbs.length} sub-agentov
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onInvoke(card)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-white"
            style={{ backgroundColor: card.color }}
          >
            Použiť
          </button>
          {card.absorbs.length > 0 && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>

        {/* Absorbs list — collapsible */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">
              Zahŕňa
            </div>
            <div className="flex flex-wrap gap-1">
              {card.absorbs.map(id => (
                <span
                  key={id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-agent compact card ─────────────────────────────────────────────────────

function SubAgentCard({
  agent,
  specialistColor,
  onInvoke,
}: {
  agent: AgentInfo;
  specialistColor?: string;
  onInvoke: (agent: AgentInfo) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-border/80 hover:bg-muted/30 transition-all group">
      {/* Parent color dot */}
      {specialistColor && (
        <span
          className="w-2 h-2 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: specialistColor }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{agent.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{agent.description || agent.id}</div>
      </div>
      <button
        onClick={() => onInvoke(agent)}
        className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
      >
        Použiť
      </button>
    </div>
  );
}

// ── Main browser ───────────────────────────────────────────────────────────────

export function AgentBrowser({ isOpen, onClose, onInvoke, embedded }: AgentBrowserProps) {
  const [specialists, setSpecialists] = useState<SpecialistCard[]>([]);
  const [allAgents, setAllAgents] = useState<AgentInfo[]>([]);
  const [loadingSpecialists, setLoadingSpecialists] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [filter, setFilter] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  // Load specialists eagerly when opened
  useEffect(() => {
    if (!isOpen || specialists.length > 0) return;
    setLoadingSpecialists(true);
    getSpecialistCards()
      .then(data => setSpecialists(data.specialists))
      .catch(err => console.error('[AgentBrowser] Failed to load specialists:', err))
      .finally(() => setLoadingSpecialists(false));
  }, [isOpen, specialists.length]);

  // Load sub-agents when "all" or "sub-agents" view is selected
  useEffect(() => {
    if (!isOpen || allAgents.length > 0) return;
    if (viewFilter === 'specialists') return;
    setLoadingAll(true);
    getAgents()
      .then(data => setAllAgents(data.agents))
      .catch(err => console.error('[AgentBrowser] Failed to load agents:', err))
      .finally(() => setLoadingAll(false));
  }, [isOpen, viewFilter, allAgents.length]);

  // Build a color map from specialists for sub-agent dots
  const specialistColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of specialists) {
      map[s.id] = s.color;
      for (const absorbed of s.absorbs) map[absorbed] = s.color;
    }
    return map;
  }, [specialists]);

  // Sub-agents = non-master entries, grouped by parent specialist
  const subAgentGroups = useMemo(() => {
    const q = filter.toLowerCase();
    const subs = allAgents.filter(a => {
      if (a.type === 'master' || a.type === 'utility') return false;
      if (q) return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
      return true;
    });

    // Group by parent (use specialistColorMap key lookup)
    const groups: Record<string, AgentInfo[]> = {};
    for (const a of subs) {
      const parent = a.parent || '_other';
      if (!groups[parent]) groups[parent] = [];
      groups[parent].push(a);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [allAgents, filter]);

  // Filtered specialists for search
  const filteredSpecialists = useMemo(() => {
    if (!filter) return specialists;
    const q = filter.toLowerCase();
    return specialists.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.nameLocalized.toLowerCase().includes(q) ||
      s.descriptionLocalized.toLowerCase().includes(q) ||
      s.absorbs.some(id => id.includes(q))
    );
  }, [specialists, filter]);

  const showSpecialists = viewFilter !== 'sub-agents';
  const showSubAgents = viewFilter !== 'specialists';

  if (!isOpen) return null;

  const innerContent = (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            🤖 Agenti
            <span className="text-sm font-normal text-muted-foreground">
              ({specialists.length} špecialistov)
            </span>
          </h2>
          <div className="flex items-center gap-1.5">
            {/* Add Agent — Sprint G placeholder */}
            <button
              disabled
              title="Pridanie vlastných agentov — Sprint G"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground/40 cursor-not-allowed border border-dashed border-border/40"
            >
              + Agent
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Hľadať agenta alebo schopnosť..."
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />

        {/* View filter */}
        <div className="flex gap-1.5 mt-2">
          {([
            { id: 'all' as ViewFilter, label: 'Všetci' },
            { id: 'specialists' as ViewFilter, label: '⚡ Špecialisti' },
            { id: 'sub-agents' as ViewFilter, label: 'Sub-agenti' },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setViewFilter(f.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewFilter === f.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-6">

        {/* Specialist hero grid */}
        {showSpecialists && (
          <section>
            {!filter && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Špecialisti
              </div>
            )}
            {loadingSpecialists ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredSpecialists.length === 0 && filter ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Žiadny špecialista pre „{filter}"
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredSpecialists.map(s => (
                  <SpecialistHeroCard
                    key={s.id}
                    card={s}
                    onInvoke={onInvoke as (c: SpecialistCard) => void}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Sub-agents */}
        {showSubAgents && (
          <section>
            {!filter && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Sub-agenti
              </div>
            )}
            {loadingAll ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : subAgentGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {filter ? `Žiadni sub-agenti pre „${filter}"` : 'Žiadni sub-agenti'}
              </p>
            ) : (
              <div className="space-y-4">
                {subAgentGroups.map(([parent, group]) => (
                  <div key={parent}>
                    <div
                      className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
                      style={{ color: specialistColorMap[parent] || undefined }}
                    >
                      {parent !== '_other' ? parent : 'Ostatné'}
                      <span className="text-muted-foreground font-normal normal-case tracking-normal">
                        ({group.length})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {group.map(a => (
                        <SubAgentCard
                          key={a.id}
                          agent={a}
                          specialistColor={specialistColorMap[a.id]}
                          onInvoke={onInvoke as (a: AgentInfo) => void}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );

  if (embedded) return innerContent;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md h-full bg-background border-l border-border overflow-y-auto animate-in slide-in-from-right"
        onClick={e => e.stopPropagation()}
      >
        {innerContent}
      </div>
    </div>
  );
}
