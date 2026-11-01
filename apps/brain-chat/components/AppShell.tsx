'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Theme system 2026-04-28 — 3-state (light/dark/auto):
 * - 'auto' (default when no localStorage): follows prefers-color-scheme
 * - 'light' / 'dark': explicit override saved to localStorage
 *
 * ThemeSelector — used in UserProfileModal (header rework moved theme off top-bar into user menu).
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const v = localStorage.getItem('theme');
  return v === 'dark' || v === 'light' ? v : 'auto';
}

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    localStorage.removeItem('theme');
  } else {
    root.classList.toggle('dark', mode === 'dark');
    localStorage.setItem('theme', mode);
  }
}

/** ThemeSelector — 3-button row (Light / Dark / Auto). Used in UserProfileModal. */
export function ThemeSelector() {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const { t } = useI18n();

  useEffect(() => {
    setMode(getStoredThemeMode());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (getStoredThemeMode() === 'auto') applyThemeMode('auto'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const select = (m: ThemeMode) => {
    setMode(m);
    applyThemeMode(m);
  };

  // #11 (2026-04-29): icons bumped h-4→h-[18px] + strokeWidth 2→2.2 for visibility
  const opts: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: t('light'), icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        <circle cx="12" cy="12" r="4"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ) },
    { id: 'dark', label: t('dark'), icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ) },
    { id: 'auto', label: t('auto'), icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        <rect x="2" y="4" width="20" height="14" rx="2"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4"/>
      </svg>
    ) },
  ];

  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => select(o.id)}
          aria-pressed={mode === o.id}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs transition-colors cursor-pointer ${
            mode === o.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-surface-hover'
          }`}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** ThemeToggle — backward compat (kept for ChatSidebar.tsx import); not used in header anymore. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
      title={dark ? 'Svetlý režim' : 'Tmavý režim'}
      aria-label={dark ? 'Prepnúť na svetlý režim' : 'Prepnúť na tmavý režim'}
    >
      {dark ? (
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  onOpenProfile?: () => void;
}

export function AppShell({ children }: AppShellProps) {
  // Apply stored theme on mount (auto-default if no preference saved)
  useEffect(() => { applyThemeMode(getStoredThemeMode()); }, []);
  return (
    <div className="h-dvh flex overflow-hidden bg-background">
      {children}
    </div>
  );
}
