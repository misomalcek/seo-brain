'use client';

/**
 * AgentsPanel — Sprint G (2026-05-22)
 *
 * Sprint E: 6 specialist hero cards + sub-agent list
 * Sprint G additions:
 *   • "+ Agent" button → AgentForm create mode
 *   • "✏️" per specialist → AgentForm extend mode
 *   • Custom agents section (DB-managed, loaded from /agents)
 *   • Delete for custom agents
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSpecialistCards, getAgents, listAllAgents, deleteAgent } from '@/lib/api';
import type { AgentInfo, SpecialistCard, CustomAgentCard } from '@/lib/types';
import { PanelError } from '@/components/ui/PanelError';
import { AgentForm } from '@/components/AgentForm';

interface AgentsPanelProps {
  onInvoke: (agent: AgentInfo) => void;
}

// Convert SpecialistCard → AgentInfo for the shared onInvoke callback
function specialistToAgentInfo(card: SpecialistCard): AgentInfo {
  return {
    id: card.id,
    name: card.nameLocalized,
    description: card.descriptionLocalized,
    tools: card.toolCount === 'ALL' ? ['*'] : [],
    model: card.model,
    type: 'master',
    color: card.color,
  };
}

// Convert CustomAgentCard → AgentInfo
function customToAgentInfo(card: CustomAgentCard): AgentInfo {
  return {
    id: card.slug,
    name: card.name,
    description: card.description,
    tools: card.tools_list,
    model: card.model,
    type: 'sub-agent',
    color: card.color,
  };
}

const MODEL_BADGE: Record<string, string> = {
  haiku: 'Haiku ⚡',
  sonnet: 'Sonnet',
  'sonnet-high': 'Sonnet+ 🧠',
};

// ── Specialist hero card ──────────────────────────────────────────────────────

function SpecialistCard({
  card,
  onInvoke,
  onEdit,
}: {
  card: SpecialistCard;
  onInvoke: (card: SpecialistCard) => void;
  onEdit: (card: SpecialistCard) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-2xl border bg-surface overflow-hidden transition-all hover:shadow-md"
      style={{ borderColor: `${card.color}35` }}
    >
      {/* Top color accent */}
      <div className="h-[3px]" style={{ backgroundColor: card.color }} />

      <div className="p-3.5">
        {/* Icon + name + edit */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[22px] leading-none">{card.icon}</span>
            <div>
              <div className="font-bold text-sm leading-tight">{card.nameLocalized}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {MODEL_BADGE[card.model] || card.model}
              </div>
            </div>
          </div>
          <button
            onClick={() => onEdit(card)}
            title="Rozšíriť špecialistu"
            className={`text-sm p-1 rounded-md transition-colors cursor-pointer ${
              card.hasExtension
                ? 'text-primary/70 hover:text-primary hover:bg-primary/10'
                : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-foreground/5'
            }`}
          >
            ✏️
          </button>
        </div>

        {/* Description — custom if extension set */}
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
          {card.descriptionLocalized}
          {card.hasExtension && (
            <span className="ml-1 text-[9px] text-primary/60 font-medium">• upravený</span>
          )}
        </p>

        {/* Stats chips */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${card.color}18`, color: card.color }}
          >
            {card.toolCount === 'ALL' ? '∞' : card.toolCount} nástrojov
          </span>
          {card.absorbs.length > 0 && (
            <button
              onClick={() => setExpanded(p => !p)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-foreground/[0.06] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {card.absorbs.length} sub-agentov {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>

        {/* Absorbs list */}
        {expanded && (
          <div className="mb-3 -mx-1">
            <div className="flex flex-wrap gap-1">
              {card.absorbs.map(id => (
                <span
                  key={id}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground font-mono"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Use button */}
        <button
          onClick={() => onInvoke(card)}
          className="w-full py-1.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: card.color }}
        >
          Použiť
        </button>
      </div>
    </div>
  );
}

// ── Custom agent card ─────────────────────────────────────────────────────────

function CustomAgentCardItem({
  card,
  onInvoke,
  onDelete,
}: {
  card: CustomAgentCard;
  onInvoke: (card: CustomAgentCard) => void;
  onDelete: (slug: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="rounded-2xl border bg-surface overflow-hidden transition-all hover:shadow-md"
      style={{ borderColor: `${card.color}35` }}
    >
      <div className="h-[3px]" style={{ backgroundColor: card.color }} />
      <div className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[22px] leading-none">{card.icon}</span>
            <div>
              <div className="font-bold text-sm leading-tight">{card.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                {MODEL_BADGE[card.model] || card.model}
                <span className="text-[8px] px-1 py-0.5 rounded bg-foreground/[0.06] font-mono">{card.slug}</span>
              </div>
            </div>
          </div>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => onDelete(card.slug)}
                className="text-[10px] px-2 py-1 bg-red-500 text-white rounded-lg cursor-pointer hover:bg-red-600"
              >
                Áno
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] px-2 py-1 bg-foreground/10 text-muted-foreground rounded-lg cursor-pointer hover:bg-foreground/20"
              >
                Nie
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Deaktivovať agenta"
              className="text-xs p-1 text-muted-foreground/30 hover:text-red-400 transition-colors cursor-pointer"
            >
              🗑️
            </button>
          )}
        </div>

        {card.description && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
            {card.description}
          </p>
        )}

        <button
          onClick={() => onInvoke(card)}
          className="w-full py-1.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: card.color }}
        >
          Použiť
        </button>
      </div>
    </div>
  );
}

// ── Sub-agent row ─────────────────────────────────────────────────────────────

function SubAgentRow({
  agent,
  dotColor,
  onInvoke,
}: {
  agent: AgentInfo;
  dotColor?: string;
  onInvoke: (agent: AgentInfo) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors group">
      <div
        className="w-2 h-2 rounded-full shrink-0 mt-0.5"
        style={{ backgroundColor: dotColor || '#6B7280' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
        {agent.description && (
          <div className="text-xs text-muted-foreground truncate">{agent.description}</div>
        )}
      </div>
      <button
        onClick={() => onInvoke(agent)}
        // Run S 2026-05-26 (qa-brain-4) — was opacity-0 group-hover:opacity-100,
        // invisible to keyboard nav + touch. Baseline 50% so the affordance
        // is visible while still de-emphasised at rest.
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-opacity cursor-pointer opacity-50 group-hover:opacity-100 focus-visible:opacity-100"
      >
        Použiť
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AgentsPanel({ onInvoke }: AgentsPanelProps) {
  const [specialists, setSpecialists] = useState<SpecialistCard[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgentCard[]>([]);
  const [allAgents, setAllAgents] = useState<AgentInfo[]>([]);
  const [loadingSpecialists, setLoadingSpecialists] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'specialists' | 'all'>('specialists');

  // Form state: null = hidden, 'create' = create form, SpecialistCard = extend form
  const [formMode, setFormMode] = useState<null | 'create' | SpecialistCard>(null);

  const loadSpecialists = useCallback(async () => {
    try {
      // Use /agents endpoint to get specialists with extensions + custom agents
      const data = await listAllAgents();
      setSpecialists(data.specialists);
      setCustomAgents(data.custom);
    } catch {
      // Fallback to /knowledge/agents/specialists if /agents not yet available
      try {
        const fallback = await getSpecialistCards();
        setSpecialists(fallback.specialists);
      } catch {
        setError('Nepodarilo sa načítať agentov');
      }
    } finally {
      setLoadingSpecialists(false);
    }
  }, []);

  useEffect(() => {
    loadSpecialists();
  }, [loadSpecialists]);

  useEffect(() => {
    getAgents()
      .then(data => setAllAgents(data.agents))
      .catch(() => { /* non-critical */ })
      .finally(() => setLoadingAll(false));
  }, []);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of specialists) {
      m[s.id] = s.color;
      for (const id of s.absorbs) m[id] = s.color;
    }
    return m;
  }, [specialists]);

  const subAgents = useMemo(() => {
    const q = search.toLowerCase();
    return allAgents.filter(a => {
      if (a.type === 'master' || a.type === 'utility') return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q)
      );
    });
  }, [allAgents, search]);

  const filteredSpecialists = useMemo(() => {
    if (!search) return specialists;
    const q = search.toLowerCase();
    return specialists.filter(s =>
      s.nameLocalized.toLowerCase().includes(q) ||
      s.descriptionLocalized.toLowerCase().includes(q) ||
      s.absorbs.some(id => id.includes(q))
    );
  }, [specialists, search]);

  const filteredCustom = useMemo(() => {
    if (!search) return customAgents;
    const q = search.toLowerCase();
    return customAgents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  }, [customAgents, search]);

  const handleDeleteCustom = async (slug: string) => {
    try {
      await deleteAgent(slug);
      await loadSpecialists(); // refresh
    } catch (err) {
      console.error('[AgentsPanel] delete failed:', err);
    }
  };

  const handleFormSuccess = () => {
    setFormMode(null);
    loadSpecialists();
  };

  if (error && loadingSpecialists) {
    return <PanelError message={error} onRetry={() => window.location.reload()} />;
  }

  // ── Form view ────────────────────────────────────────────────────────────
  if (formMode !== null) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {formMode === 'create' ? (
          <AgentForm
            mode="create"
            onSuccess={handleFormSuccess}
            onCancel={() => setFormMode(null)}
          />
        ) : (
          <AgentForm
            mode="extend"
            specialist={formMode}
            onSuccess={handleFormSuccess}
            onCancel={() => setFormMode(null)}
          />
        )}
      </div>
    );
  }

  // ── Main panel view ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Search */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Hľadaj agenta alebo schopnosť..."
            aria-label="Hľadať agentov"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* View tabs + Add Agent */}
      <div className="flex items-center gap-1.5 px-4 pb-3 shrink-0">
        <button
          onClick={() => setView('specialists')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            view === 'specialists'
              ? 'bg-primary text-primary-foreground'
              : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground'
          }`}
        >
          ⚡ Špecialisti
        </button>
        <button
          onClick={() => setView('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            view === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground'
          }`}
        >
          Sub-agenti
        </button>
        {/* Sprint G: now active */}
        <button
          onClick={() => setFormMode('create')}
          className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-primary/40 text-primary/70 hover:text-primary hover:border-primary/60 transition-colors cursor-pointer"
        >
          + Agent
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* ── Specialist cards ─────────────────────────────────────────── */}
        {view === 'specialists' && (
          <>
            {loadingSpecialists ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-40 rounded-2xl bg-foreground/[0.04] animate-pulse" />
                ))}
              </div>
            ) : filteredSpecialists.length === 0 && filteredCustom.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                {search ? `Žiadni agenti pre „${search}"` : 'Žiadni agenti'}
              </div>
            ) : (
              <>
                {filteredSpecialists.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    {filteredSpecialists.map(s => (
                      <SpecialistCard
                        key={s.id}
                        card={s}
                        onInvoke={card => onInvoke(specialistToAgentInfo(card))}
                        onEdit={card => setFormMode(card)}
                      />
                    ))}
                  </div>
                )}

                {/* Custom agents section */}
                {filteredCustom.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-1">
                      Vlastní agenti ({filteredCustom.length})
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {filteredCustom.map(a => (
                        <CustomAgentCardItem
                          key={a.slug}
                          card={a}
                          onInvoke={card => onInvoke(customToAgentInfo(card))}
                          onDelete={handleDeleteCustom}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Sub-agents ────────────────────────────────────────────────── */}
        {view === 'all' && (
          <>
            {loadingAll ? (
              <div className="space-y-1">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-foreground/[0.04] animate-pulse" />
                ))}
              </div>
            ) : subAgents.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                {search ? `Žiadni sub-agenti pre „${search}"` : 'Žiadni sub-agenti'}
              </div>
            ) : (
              <div className="space-y-1">
                {subAgents.map(a => (
                  <SubAgentRow
                    key={a.id}
                    agent={a}
                    dotColor={colorMap[a.id]}
                    onInvoke={onInvoke}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
