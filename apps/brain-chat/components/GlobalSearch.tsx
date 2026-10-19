'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { globalSearch, type SearchResult } from '@/lib/api';

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  conversation: { icon: '💬', label: 'Konverzácia', color: 'text-blue-400' },
  file: { icon: '📁', label: 'Súbor', color: 'text-green-400' },
  content: { icon: '📅', label: 'Content', color: 'text-purple-400' },
  report: { icon: '📄', label: 'Report', color: 'text-orange-400' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation?: (id: string) => void;
}

export function GlobalSearch({ isOpen, onClose, onSelectConversation }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await globalSearch(q);
      setResults(data.results);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'conversation' && onSelectConversation) {
      onSelectConversation(result.id);
    }
    // For other types, could navigate to panels in the future
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Vyhľadávanie" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <svg className="h-5 w-5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hľadať v konverzáciách, súboroch, obsahu..."
            className="flex-1 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-card border border-border text-xs text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground animate-pulse">
              Hľadám...
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Žiadne výsledky pre &quot;{query}&quot;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((result, i) => {
                const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.file;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                      i === selectedIndex ? 'bg-primary/10' : 'hover:bg-card'
                    }`}
                  >
                    <span className="text-lg shrink-0" aria-hidden="true">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{result.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{result.snippet}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                      <div className="text-[10px] text-muted-foreground">{formatDate(result.date)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Zadajte aspoň 2 znaky pre vyhľadávanie
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 rounded bg-card border border-border">↑↓</kbd> Navigácia</span>
          <span><kbd className="px-1 py-0.5 rounded bg-card border border-border">Enter</kbd> Otvoriť</span>
          <span><kbd className="px-1 py-0.5 rounded bg-card border border-border">Esc</kbd> Zavrieť</span>
        </div>
      </div>
    </div>
  );
}
