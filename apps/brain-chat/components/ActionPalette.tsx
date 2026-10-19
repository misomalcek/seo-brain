'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ActionInfo, ActionCategory } from '@/lib/types';
import { getActions } from '@/lib/api';

interface ActionPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: string) => void;
  filter: string;
}

// Module-level cache (5 min TTL)
let actionsCache: { actions: ActionInfo[]; categories: ActionCategory[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// Recent actions (persisted in localStorage)
function getRecentActions(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('brain-action-history') || '[]').slice(0, 3);
  } catch { return []; }
}

function saveRecentAction(path: string) {
  if (typeof window === 'undefined') return;
  const recent = getRecentActions().filter(p => p !== path);
  recent.unshift(path);
  localStorage.setItem('brain-action-history', JSON.stringify(recent.slice(0, 5)));
}

// /remember is always available (handled separately in backend)
const REMEMBER_ACTION: ActionInfo = {
  path: '/remember',
  label: 'Remember',
  description: 'Ulož do Brain Memory',
  icon: '💾',
  category: 'brain',
  tier: 1,
};

export function ActionPalette({ isOpen, onClose, onSelect, filter }: ActionPaletteProps) {
  const [actions, setActions] = useState<ActionInfo[]>(actionsCache?.actions || []);
  const [categories, setCategories] = useState<ActionCategory[]>(actionsCache?.categories || []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load actions from API
  useEffect(() => {
    if (!isOpen) return;
    if (actionsCache && Date.now() - actionsCache.ts < CACHE_TTL) {
      setActions(actionsCache.actions);
      setCategories(actionsCache.categories);
      return;
    }
    getActions()
      .then(data => {
        actionsCache = { actions: data.actions, categories: data.categories, ts: Date.now() };
        setActions(data.actions);
        setCategories(data.categories);
      })
      .catch(err => console.error('Failed to load actions:', err));
  }, [isOpen]);

  // All actions including /remember
  const allActions = useMemo(() => [...actions, REMEMBER_ACTION], [actions]);

  // Filter logic: typing 2+ chars → flat fuzzy search; otherwise show categories
  const query = filter.toLowerCase().replace(/^\//, '');
  const isSearching = query.length >= 2;

  const filtered = useMemo(() => {
    if (!isSearching) return allActions;
    return allActions.filter(a =>
      a.path.toLowerCase().includes(query) ||
      a.label.toLowerCase().includes(query) ||
      a.description.toLowerCase().includes(query) ||
      a.category.toLowerCase().includes(query)
    );
  }, [allActions, query, isSearching]);

  // Build display items
  const displayItems = useMemo(() => {
    if (isSearching) {
      // Flat fuzzy-filtered list
      return filtered.map(a => ({ type: 'action' as const, action: a }));
    }

    // Category view with optional expansion
    const items: Array<
      | { type: 'recent-header' }
      | { type: 'action'; action: ActionInfo }
      | { type: 'category'; category: ActionCategory; count: number }
    > = [];

    // Recent actions (pinned at top)
    const recentPaths = getRecentActions();
    const recentActions = recentPaths
      .map(p => allActions.find(a => a.path === p))
      .filter((a): a is ActionInfo => !!a);

    if (recentActions.length > 0 && !expandedCategory) {
      items.push({ type: 'recent-header' });
      recentActions.forEach(a => items.push({ type: 'action', action: a }));
    }

    if (expandedCategory) {
      // Show sub-actions for expanded category
      allActions
        .filter(a => a.category === expandedCategory)
        .forEach(a => items.push({ type: 'action', action: a }));
    } else {
      // Show category rows
      categories.forEach(cat => {
        const count = allActions.filter(a => a.category === cat.id).length;
        if (count > 0) {
          items.push({ type: 'category', category: cat, count });
        }
      });
    }

    return items;
  }, [allActions, categories, isSearching, expandedCategory, filtered]);

  // Selectable items (for keyboard nav) — memoized to avoid recomputation
  const selectables = useMemo(
    () => displayItems.filter(i => i.type !== 'recent-header'),
    [displayItems]
  );
  const selectableCount = selectables.length;

  // Reset selection when display changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [displayItems.length, isSearching, expandedCategory]);

  // Reset expanded category when filter changes
  useEffect(() => {
    if (isSearching) setExpandedCategory(null);
  }, [isSearching]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setExpandedCategory(null);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleSelect = useCallback((item: typeof displayItems[number]) => {
    if (item.type === 'category') {
      setExpandedCategory(item.category.id);
    } else if (item.type === 'action') {
      saveRecentAction(item.action.path);
      onSelect(item.action.path);
    }
  }, [onSelect]);

  // Store volatile values in refs to avoid listener re-attachment on every keystroke
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const selectablesRef = useRef(selectables);
  selectablesRef.current = selectables;
  const expandedCategoryRef = useRef(expandedCategory);
  expandedCategoryRef.current = expandedCategory;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Keyboard navigation — stable listener, only re-attaches on open/close
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      const count = selectablesRef.current.length;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, count - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const item = selectablesRef.current[selectedIndexRef.current];
          if (item) handleSelect(item);
          break;
        }
        case 'Escape':
          e.preventDefault();
          if (expandedCategoryRef.current) {
            setExpandedCategory(null);
          } else {
            onClose();
          }
          break;
        case 'Backspace':
          if (filterRef.current === '/' && expandedCategoryRef.current) {
            setExpandedCategory(null);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  let selectableIdx = -1;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full mb-2 left-0 right-0 z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg shadow-black/40">
        {/* Back button when in category */}
        {expandedCategory && !isSearching && (
          <button
            onClick={() => setExpandedCategory(null)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-b border-border"
          >
            <span>←</span>
            <span>Späť na kategórie</span>
          </button>
        )}

        {displayItems.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Žiadna akcia pre &quot;{filter}&quot;
          </div>
        ) : (
          <div ref={listRef}>
            {displayItems.map((item, i) => {
              if (item.type === 'recent-header') {
                return (
                  <div key="recent-header" className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 sticky top-0">
                    Nedávne
                  </div>
                );
              }

              selectableIdx++;
              const isSelected = selectableIdx === selectedIndex;

              if (item.type === 'category') {
                return (
                  <button
                    key={item.category.id}
                    data-idx={selectableIdx}
                    onClick={() => handleSelect(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    <span className="text-lg w-6 text-center">{item.category.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.category.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.count} akcií →</span>
                  </button>
                );
              }

              // Action item
              return (
                <button
                  key={item.action.path}
                  data-idx={selectableIdx}
                  onClick={() => handleSelect(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <span className="text-base w-6 text-center">{item.action.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      <span className="text-muted-foreground">{item.action.path}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{item.action.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
