'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { MentionItem, MentionCategory } from '@/lib/types';
import { getMentions } from '@/lib/api';

interface MentionsPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mentionId: string) => void;
  filter: string;
}

// Module-level cache (mentions don't change at runtime)
let mentionsCache: MentionCategory[] | null = null;

export function MentionsPalette({ isOpen, onClose, onSelect, filter }: MentionsPaletteProps) {
  const [categories, setCategories] = useState<MentionCategory[]>(mentionsCache || []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load mentions from API
  useEffect(() => {
    if (!isOpen) return;
    if (mentionsCache) {
      setCategories(mentionsCache);
      return;
    }
    getMentions()
      .then(data => {
        mentionsCache = data.categories;
        setCategories(data.categories);
      })
      .catch(err => console.error('Failed to load mentions:', err));
  }, [isOpen]);

  // All items flat (for search)
  const allItems = useMemo(() =>
    categories.flatMap(c => c.items),
    [categories]
  );

  // Filter logic
  const query = filter.toLowerCase().replace(/^@/, '');
  const isSearching = query.length >= 2;

  const filtered = useMemo(() => {
    if (!isSearching) return allItems;
    return allItems.filter(item =>
      item.id.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );
  }, [allItems, query, isSearching]);

  // Build display items
  type DisplayItem =
    | { type: 'item'; item: MentionItem }
    | { type: 'category'; category: MentionCategory };

  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];

    if (isSearching) {
      filtered.forEach(item => items.push({ type: 'item', item }));
      return items;
    }

    if (expandedCategory) {
      const cat = categories.find(c => c.id === expandedCategory);
      if (cat) {
        cat.items.forEach(item => items.push({ type: 'item', item }));
      }
      return items;
    }

    // Show categories
    categories.forEach(cat => {
      items.push({ type: 'category', category: cat });
    });
    return items;
  }, [categories, isSearching, expandedCategory, filtered]);

  // Reset on state changes
  useEffect(() => { setSelectedIndex(0); }, [displayItems.length, isSearching, expandedCategory]);
  useEffect(() => { if (isSearching) setExpandedCategory(null); }, [isSearching]);
  useEffect(() => { if (!isOpen) { setExpandedCategory(null); setSelectedIndex(0); } }, [isOpen]);

  const handleSelect = useCallback((item: DisplayItem) => {
    if (item.type === 'category') {
      setExpandedCategory(item.category.id);
    } else {
      onSelect(`@${item.item.id}`);
      onClose();
    }
  }, [onSelect, onClose]);

  // Keyboard nav — stable refs
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const displayRef = useRef(displayItems);
  displayRef.current = displayItems;
  const expandedRef = useRef(expandedCategory);
  expandedRef.current = expandedCategory;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const count = displayRef.current.length;
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
          e.stopPropagation();
          const item = displayRef.current[selectedIndexRef.current];
          if (item) handleSelect(item);
          break;
        }
        case 'Escape':
          e.preventDefault();
          if (expandedRef.current) {
            setExpandedCategory(null);
          } else {
            onClose();
          }
          break;
        case 'Backspace':
          if (expandedRef.current && filter === '@') {
            setExpandedCategory(null);
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleSelect, onClose, filter]);

  // Scroll to selected
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen || displayItems.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-xl max-h-64 overflow-hidden z-50">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)]">
          {expandedCategory
            ? `← ${categories.find(c => c.id === expandedCategory)?.icon} ${categories.find(c => c.id === expandedCategory)?.label}`
            : '@ Mention agent alebo persónu'
          }
        </span>
        {isSearching && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {filtered.length} výsledkov
          </span>
        )}
      </div>

      {/* Items */}
      <div ref={listRef} className="overflow-y-auto max-h-52" role="listbox">
        {displayItems.map((item, idx) => {
          const isSelected = idx === selectedIndex;

          if (item.type === 'category') {
            return (
              <div
                key={item.category.id}
                role="option"
                aria-selected={isSelected}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected ? 'bg-[var(--accent-color)] bg-opacity-20' : 'hover:bg-[var(--bg-tertiary)]'
                }`}
                onClick={() => handleSelect(item)}
              >
                <div className="flex items-center gap-2">
                  <span>{item.category.icon}</span>
                  <span className="text-sm font-medium">{item.category.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-tertiary)]">{item.category.items.length}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">→</span>
                </div>
              </div>
            );
          }

          // Mention item
          const colorDot = item.item.color ? (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.item.color }}
            />
          ) : null;

          return (
            <div
              key={item.item.id}
              role="option"
              aria-selected={isSelected}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                isSelected ? 'bg-[var(--accent-color)] bg-opacity-20' : 'hover:bg-[var(--bg-tertiary)]'
              }`}
              onClick={() => handleSelect(item)}
            >
              <div className="flex items-center gap-2">
                {colorDot}
                <span className="text-sm font-medium">@{item.item.id}</span>
                <span className="text-xs text-[var(--text-secondary)] truncate">{item.item.name}</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5 ml-4">
                {item.item.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
