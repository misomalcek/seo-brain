'use client';

import { useState, useEffect } from 'react';
import type { Persona } from '@/lib/types';
import { getPersonas } from '@/lib/api';

interface PersonaSelectorProps {
  activePersonaId: string | null;
  onSelect: (personaId: string | null) => void;
}

export function PersonaSelector({ activePersonaId, onSelect }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    getPersonas()
      .then(data => setPersonas(data.personas))
      .catch(err => console.error('Failed to load personas:', err));
  }, []);

  if (personas.length === 0) return null;

  const active = personas.find(p => p.id === activePersonaId);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border border-border hover:border-primary/50 bg-surface cursor-pointer"
        title="Vyber personu"
      >
        <span className="text-base">{active ? active.icon : '🧠'}</span>
        <span className="text-muted-foreground hidden sm:inline">
          {active ? active.nameLocalized : 'Neutralny'}
        </span>
        <svg className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - opens UPWARD, full width on mobile */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="fixed left-0 right-0 bottom-0 z-50 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 sm:w-72 rounded-t-2xl sm:rounded-xl border border-border bg-surface shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Persona</div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground sm:hidden cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
              {/* Neutral option */}
              <button
                onClick={() => { onSelect(null); setIsOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                  !activePersonaId
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-surface-hover'
                }`}
              >
                <span className="text-xl">🧠</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">Brain</div>
                  <div className="text-xs text-muted-foreground truncate">Neutralny asistent bez persony</div>
                </div>
              </button>

              {/* Persona options */}
              {personas.map(persona => (
                <button
                  key={persona.id}
                  onClick={() => { onSelect(persona.id); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                    activePersonaId === persona.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-surface-hover'
                  }`}
                >
                  <span className="text-xl">{persona.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{persona.nameLocalized}</div>
                    <div className="text-xs text-muted-foreground truncate">{persona.description}</div>
                  </div>
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: persona.color }}
                    title={persona.traits.focusArea}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
