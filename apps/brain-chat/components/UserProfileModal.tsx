'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ThemeSelector } from './AppShell';

interface ProfileStats {
  conversations: number;
  messages: number;
  files: number;
  filesSize: number;
  reports: number;
  deliberations: number;
  memberSince: string;
  lastLogin: string | null;
  email: string;
  name: string;
  role: string;
  totalTokens: number;
}

interface UserProfileModalProps {
  onClose: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatBytes(b: number): string {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${Math.round(b / 1_024)} KB`;
  return `${b} B`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  team_admin: 'Team Admin',
  member: 'Člen',
};

const ROLE_CLASS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  team_admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  member: 'bg-muted text-muted-foreground',
};

export function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // #12 (2026-04-29): editable displayed name
  const [nameEdit, setNameEdit] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { if (stats?.name && !nameEdit) setNameEdit(stats.name); }, [stats?.name]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameEdit.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 60) {
      setNameMessage({ kind: 'err', text: 'Meno musí mať 2–60 znakov' });
      return;
    }
    if (trimmed === stats?.name) return;
    setNameSaving(true);
    setNameMessage(null);
    try {
      const res = await fetch('/api/profile/name', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNameMessage({ kind: 'err', text: data.error || 'Chyba pri ukladaní' });
      } else {
        setStats(s => s ? { ...s, name: trimmed } : s);
        setNameMessage({ kind: 'ok', text: 'Uložené ✓' });
        setTimeout(() => setNameMessage(null), 2000);
      }
    } catch {
      setNameMessage({ kind: 'err', text: 'Sieťová chyba' });
    } finally {
      setNameSaving(false);
    }
  };

  useEffect(() => {
    fetch('/api/profile/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError('Nové heslá sa nezhodujú');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('Heslo musí mať aspoň 8 znakov');
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPwSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwError(data.error || 'Zmena hesla zlyhala');
      }
    } catch {
      setPwError('Sieťová chyba');
    } finally {
      setPwLoading(false);
    }
  };

  const initials = (user?.name || 'U').charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Profil</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-muted-foreground transition-colors cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Avatar + identity */}
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xl font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">{stats?.name || user?.name}</div>
              <div className="text-sm text-muted-foreground truncate">{stats?.email || '—'}</div>
              <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASS[stats?.role || user?.role || 'member']}`}>
                {ROLE_LABEL[stats?.role || user?.role || 'member'] || 'Člen'}
              </span>
            </div>
          </div>

          {/* Stats grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3 animate-pulse h-16" />
              ))}
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Konverzácie" value={stats.conversations} />
                <StatCard label="Tokeny celkom" value={formatTokens(stats.totalTokens)} />
                <StatCard label="Správy" value={stats.messages} />
                <StatCard label="Súbory" value={`${stats.files} (${formatBytes(stats.filesSize)})`} />
                <StatCard label="Reporty" value={stats.reports} />
                <StatCard label="Deliberácie" value={stats.deliberations} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Člen od: <span className="text-foreground">{formatDate(stats.memberSince)}</span></div>
                <div>Posledné prihlásenie: <span className="text-foreground">{formatDate(stats.lastLogin)}</span></div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Štatistiky sa nepodarilo načítať.</p>
          )}

          {/* #12 (2026-04-29): editable displayed name. Shown to teammates in chat + UI. */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Zobrazované meno
            </h3>
            <form onSubmit={handleSaveName} className="flex gap-2">
              <input
                type="text" value={nameEdit}
                onChange={e => setNameEdit(e.target.value)}
                placeholder="Tvoje meno"
                minLength={2} maxLength={60}
                className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                disabled={nameSaving || !nameEdit.trim() || nameEdit.trim() === stats?.name}
                className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >{nameSaving ? '…' : 'Uložiť'}</button>
            </form>
            {nameMessage && (
              <p className={`text-xs mt-2 ${nameMessage.kind === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>{nameMessage.text}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Vidia ho ostatní v team chate aj v hlavičke aplikácie.</p>
          </div>

          {/* Theme — #11 (2026-04-29): added prominent section icon + bumped ThemeSelector
              icons for visibility (was reported as "not visible"). */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="4"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
              Vzhľad
            </h3>
            <ThemeSelector />
            <p className="text-[11px] text-muted-foreground mt-2">Auto sleduje systémové nastavenie (prefers-color-scheme).</p>
          </div>

          {/* Change password */}
          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold mb-3">Zmena hesla</h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                placeholder="Aktuálne heslo"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <input
                type="password"
                placeholder="Nové heslo (min. 8 znakov)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              <input
                type="password"
                placeholder="Potvrďte nové heslo"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">Heslo úspešne zmenené ✓</p>}
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {pwLoading ? 'Mením heslo...' : 'Zmeniť heslo'}
              </button>
            </form>
          </div>

          {/* Logout */}
          <div className="border-t border-border pt-4">
            <button
              onClick={async () => { await logout(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Odhlásiť sa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
