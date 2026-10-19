'use client';

import { useEffect, useRef, useCallback } from 'react';

interface FeatureOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: React.ReactNode;
}

/**
 * Brain One UI — panel overlay.
 * Takes ~70% of screen height, positioned above feature panel + chatbox.
 * Chat input remains always accessible at the bottom.
 */
export function FeatureOverlay({ isOpen, onClose, title, icon, children }: FeatureOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Focus first interactive element inside the panel (not close button)
    setTimeout(() => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const firstInput = overlay.querySelector<HTMLElement>('input, [role="tab"], button:not([aria-label="Zavrieť"])');
      if (firstInput) firstInput.focus();
      else firstFocusRef.current?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      // Focus trap — keep Tab within overlay
      if (e.key === 'Tab') {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const focusable = overlay.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 100) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="h-[70vh] max-h-[70vh] shrink-0 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex flex-col flex-1 min-h-0 bg-background/98 dark:bg-surface/95 backdrop-blur-2xl rounded-t-2xl border-t border-border shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-lg">{icon}</span>}
            <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          </div>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Zavrieť"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
