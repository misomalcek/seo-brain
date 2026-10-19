'use client';

/**
 * PersonaBrowser — overlay browser for selecting active persona.
 * Mirrors AgentBrowser pattern. Replaces persona <select> in ChatFooter.
 *
 * Per Brain Pt II focus area #1 (persona browser + expand + remove bottom select).
 */

import { useState, useEffect, useMemo } from 'react';
import { getPersonas } from '@/lib/api';
import type { Persona } from '@/lib/types';

interface PersonaBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  activePersonaId: string | null;
  onSelect: (personaId: string | null) => void;
  embedded?: boolean;
}

type RiskFilter = 'all' | 'low' | 'medium' | 'high';
type HorizonFilter = 'all' | 'short' | 'medium' | 'long';

function riskBucket(r: number): 'low' | 'medium' | 'high' {
  if (r <= 0.4) return 'low';
  if (r <= 0.6) return 'medium';
  return 'high';
}

const RISK_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'Konzervatívne',
  medium: 'Vyvážené',
  high: 'Odvážne',
};

const HORIZON_LABEL: Record<'short' | 'medium' | 'long', string> = {
  short: 'Krátkodobé',
  medium: 'Strednodobé',
  long: 'Dlhodobé',
};

export function PersonaBrowser({ isOpen, onClose, activePersonaId, onSelect, embedded }: PersonaBrowserProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [horizonFilter, setHorizonFilter] = useState<HorizonFilter>('all');

  useEffect(() => {
    if (isOpen && personas.length === 0) {
      setLoading(true);
      getPersonas()
        .then(data => setPersonas(data.personas))
        .catch(err => console.error('Failed to load personas:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, personas.length]);

  const filtered = useMemo(() => {
    return personas.filter(p => {
      if (riskFilter !== 'all' && riskBucket(p.traits.riskTolerance) !== riskFilter) return false;
      if (horizonFilter !== 'all' && p.traits.timeHorizon !== horizonFilter) return false;
      if (filter) {
        const q = filter.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.nameLocalized.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.traits.focusArea.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [personas, filter, riskFilter, horizonFilter]);

  const content = (
    <div className="flex flex-col h-full">
      {/* Header / filters */}
      <div className="px-4 py-3 border-b border-border/40 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Hľadať personu (meno, popis, focus area)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 h-9 px-3 bg-foreground/[0.05] dark:bg-white/[0.06] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label="Hľadať personu"
          />
          {activePersonaId && (
            <button
              onClick={() => { onSelect(null); }}
              className="h-9 px-3 rounded-lg text-xs font-medium bg-foreground/[0.05] hover:bg-foreground/[0.10] transition-colors"
              title="Zrušiť aktívnu personu"
            >
              Reset (Neutrálny)
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Risk:</span>
          {(['all', 'low', 'medium', 'high'] as RiskFilter[]).map(r => (
            <button
              key={r}
              onClick={() => setRiskFilter(r)}
              className={`h-7 px-2.5 rounded-full transition-colors ${
                riskFilter === r ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground'
              }`}
            >
              {r === 'all' ? 'Všetky' : RISK_LABEL[r]}
            </button>
          ))}
          <span className="text-muted-foreground ml-2">Horizont:</span>
          {(['all', 'short', 'medium', 'long'] as HorizonFilter[]).map(h => (
            <button
              key={h}
              onClick={() => setHorizonFilter(h)}
              className={`h-7 px-2.5 rounded-full transition-colors ${
                horizonFilter === h ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.04] hover:bg-foreground/[0.08] text-muted-foreground'
              }`}
            >
              {h === 'all' ? 'Všetky' : HORIZON_LABEL[h]}
            </button>
          ))}
          <span className="ml-auto text-muted-foreground">{filtered.length} z {personas.length}</span>
        </div>
      </div>

      {/* Grid of personas */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Načítavam personas...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground text-sm mb-2">Žiadne persony pre tento filter.</p>
            <button onClick={() => { setFilter(''); setRiskFilter('all'); setHorizonFilter('all'); }} className="text-xs text-primary hover:underline">
              Vyčistiť filtre
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(p => {
              const isActive = p.id === activePersonaId;
              const risk = riskBucket(p.traits.riskTolerance);
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); onClose(); }}
                  className={`text-left p-4 rounded-xl border transition-all hover:shadow-md group ${
                    isActive
                      ? 'border-primary/40 bg-primary/5 shadow-[0_0_16px_rgba(197,0,68,0.15)]'
                      : 'border-border/40 bg-foreground/[0.02] hover:bg-foreground/[0.05]'
                  }`}
                  style={isActive ? undefined : { borderLeftColor: p.color, borderLeftWidth: '3px' }}
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${p.color}20`, color: p.color }}
                    >
                      {p.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                        {p.nameLocalized}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{p.name}</div>
                    </div>
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium uppercase tracking-wide">
                        aktívna
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{p.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/[0.05] text-muted-foreground">
                      {RISK_LABEL[risk]}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/[0.05] text-muted-foreground">
                      {HORIZON_LABEL[p.traits.timeHorizon]}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/[0.05] text-muted-foreground truncate max-w-[160px]" title={p.traits.focusArea}>
                      {p.traits.focusArea}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border/40 shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎭</span>
            <h2 className="font-semibold">Personas</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-foreground/[0.05]" aria-label="Zatvoriť">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
