'use client';

import { useState, useCallback, useRef } from 'react';
import type { ContextItem } from '@/lib/types';

/**
 * Manages chat context items — files, brand assets, frameworks, datasets attached to chat.
 * Extracted from page.tsx context-related state + callbacks.
 */
export function useContextPanel() {
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const contextItemsRef = useRef<ContextItem[]>([]);
  contextItemsRef.current = contextItems;

  const addToContext = useCallback((type: ContextItem['type'], content: string, label: string, icon: string) => {
    const id = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setContextItems(prev => {
      if (prev.some(item => item.label === label && item.type === type)) return prev;
      return [...prev, { id, type, content, label, icon }];
    });
  }, []);

  const removeFromContext = useCallback((id: string) => {
    setContextItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return {
    contextItems,
    setContextItems,
    contextItemsRef,
    addToContext,
    removeFromContext,
  };
}
