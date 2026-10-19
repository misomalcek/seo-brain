'use client';

import { useState, useEffect } from 'react';
import { getPersonas, deliberate } from '@/lib/api';
import type { Persona } from '@/lib/types';
import { MessageContent } from './MessageContent';

interface DeliberationViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeliberationView({ isOpen, onClose }: DeliberationViewProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{
    personaId: string;
    name: string;
    nameLocalized: string;
    icon: string;
    color: string;
    content: string;
  }> | null>(null);

  useEffect(() => {
    if (isOpen && personas.length === 0) {
      getPersonas()
        .then(data => setPersonas(data.personas))
        .catch(err => console.error('Failed to load personas:', err));
    }
  }, [isOpen, personas.length]);

  if (!isOpen) return null;

  const togglePersona = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : prev.length < 4
          ? [...prev, id]
          : prev
    );
  };

  const handleDeliberate = async () => {
    if (!question.trim() || selectedIds.length < 2) return;
    setLoading(true);
    setResults(null);
    try {
      const res = await deliberate(question, selectedIds);
      setResults(res.responses);
    } catch (err) {
      console.error('Deliberation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-background border border-border rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">🎭 Multi-persona Deliberacia</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Vyber 2-4 persony a poloz otazku. Kazda odpovie zo svojej perspektivy.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Persona selection */}
        <div className="p-5 border-b border-border">
          <div className="flex flex-wrap gap-2">
            {personas.map(p => {
              const selected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePersona(p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    selected
                      ? 'border-2 shadow-lg'
                      : 'border border-border hover:border-primary/30 bg-card'
                  }`}
                  style={selected ? {
                    borderColor: p.color,
                    backgroundColor: `${p.color}15`,
                    boxShadow: `0 4px 12px ${p.color}20`,
                  } : undefined}
                >
                  <span className="text-base">{p.icon}</span>
                  <span>{p.nameLocalized}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-4">
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Poloz otazku pre deliberaciu..."
              rows={2}
              className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <button
              onClick={handleDeliberate}
              disabled={loading || selectedIds.length < 2 || !question.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-background font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer self-end"
            >
              {loading ? 'Deliberujem...' : 'Spustit'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="text-center py-12">
              <div className="text-2xl animate-pulse mb-3">🎭</div>
              <div className="text-muted-foreground">
                {selectedIds.length} persony premyslaju...
              </div>
            </div>
          )}

          {results && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map(r => (
                <div
                  key={r.personaId}
                  className="rounded-xl border p-4 overflow-y-auto max-h-80"
                  style={{ borderColor: `${r.color}40` }}
                >
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                    <span className="text-lg">{r.icon}</span>
                    <span className="font-semibold text-sm" style={{ color: r.color }}>
                      {r.nameLocalized}
                    </span>
                  </div>
                  <div className="text-sm">
                    <MessageContent content={r.content} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !results && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-4xl mb-3">🎭</div>
              <p className="text-sm">
                Vyber aspon 2 persony, napls otazku a spusti deliberaciu.
              </p>
              <p className="text-xs mt-2">
                Kazda persona odpovie nezavisle zo svojej perspektivy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
