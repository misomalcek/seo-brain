'use client';

import { useState, useCallback } from 'react';

export type OverlayType =
  | 'chats'
  | 'agents'
  | 'files'
  | 'snapshots'
  | 'datasets'
  | 'templates'
  | 'reports'
  | 'calendar'
  | 'docs'
  | 'vectors'
  | 'memory'
  | 'search'
  | 'context'
  | 'profile'
  | 'team'
  | 'personas'
  | 'tools'
  | 'data-viewer'
  | 'graph'
  | 'users'
  | 'settings'
  | null;

/**
 * Manages overlay visibility — single active overlay at a time.
 * Replaces ~12 individual boolean states from page.tsx.
 */
export function useOverlays() {
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null);

  const openOverlay = useCallback((overlay: OverlayType) => {
    setActiveOverlay(prev => prev === overlay ? null : overlay);
  }, []);

  const closeOverlay = useCallback(() => {
    setActiveOverlay(null);
  }, []);

  const isOpen = useCallback((overlay: OverlayType) => {
    return activeOverlay === overlay;
  }, [activeOverlay]);

  return {
    activeOverlay,
    openOverlay,
    closeOverlay,
    isOpen,
  };
}
