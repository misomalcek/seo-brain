'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getProfileStats } from '@/lib/api';
import type { UserStats } from '@/lib/types';
import { ThemeSelector } from './AppShell';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}

const PERSONA_NAMES: Record<string, string> = {
  pacifist: 'Pacifista',
  aggressor: 'Agresor',
  tactician: 'Taktik',
  strategist: 'Strateg',
  detailist: 'Detailista',
  visionary: 'Vizionar',
};

interface UserProfileProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfile({ isOpen, onClose }: UserProfileProps) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  // #12 (2026-04-29): editable displayed name in profile overlay
  const [nameEdit, setNameEdit] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getProfileStats()
        .then(data => { setStats(data); if (data?.name) setNameEdit(data.name); })
        .catch(err => console.error('Failed to load profile stats:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = nameEdit.trim();
    if (!t || t.length < 2 || t.length > 60) { setNameMsg({ k: 'err', t: 'Meno musí mať 2–60 znakov' }); return; }
    if (t === stats?.name) return;
    setNameSaving(true); setNameMsg(null);
    try {
      const r = await fetch('/api/profile/name', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setNameMsg({ k: 'err', t: d.error || 'Chyba pri ukladaní' });
      } else {
        setStats(s => s ? { ...s, name: t } : s);
        setNameMsg({ k: 'ok', t: 'Uložené ✓' });
        setTimeout(() => setNameMsg(null), 2000);
      }
    } catch { setNameMsg({ k: 'err', t: 'Sieťová chyba' }); }
    finally { setNameSaving(false); }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl font-bold text-background mx-auto mb-3">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-lg font-bold">{user.name}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
            {user.role}
          </span>
        </div>

        {/* Stats */}
        <div className="p-6">
          {loading ? (
            <div className="text-center text-muted-foreground py-4 animate-pulse">
              Nacitavam statistiky...
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard label="Konverzacie" value={stats.conversations} />
                <StatCard label="Spravy" value={stats.messages} />
                <StatCard label="Subory" value={stats.files} extra={formatSize(stats.filesSize)} />
                <StatCard label="Reporty" value={stats.reports} />
                <StatCard label="Deliberacie" value={stats.deliberations} />
                <StatCard
                  label="Oblubena Persona"
                  value={stats.favoritePersona ? (PERSONA_NAMES[stats.favoritePersona] || stats.favoritePersona) : '-'}
                  isText
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                <div>Clen od: {formatDate(stats.memberSince)}</div>
                {stats.lastLogin && <div>Posledne prihlasenie: {formatDate(stats.lastLogin)}</div>}
              </div>

              {/* #12 (2026-04-29): editable displayed name */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Zobrazované meno
                </h3>
                <form onSubmit={handleSaveName} className="flex gap-2">
                  <input
                    type="text" value={nameEdit} onChange={e => setNameEdit(e.target.value)}
                    placeholder="Tvoje meno" minLength={2} maxLength={60}
                    className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button type="submit" disabled={nameSaving || !nameEdit.trim() || nameEdit.trim() === stats?.name}
                    className="px-3 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed">
                    {nameSaving ? '…' : 'Uložiť'}
                  </button>
                </form>
                {nameMsg && <p className={`text-xs mt-1.5 ${nameMsg.k === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>{nameMsg.t}</p>}
                <p className="text-[11px] text-muted-foreground mt-1.5">Vidia ho ostatní v team chate aj v hlavičke aplikácie.</p>
              </div>

              {/* #11 (2026-04-29): Theme selector with prominent section heading */}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <circle cx="12" cy="12" r="4"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                  Vzhľad
                </h3>
                <ThemeSelector />
                <p className="text-[11px] text-muted-foreground mt-1.5">Auto sleduje systémové nastavenie.</p>
              </div>
            </>
          ) : null}

          {/* Actions */}
          <div className="flex gap-3 mt-4 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
            >
              Zavriet
            </button>
            <button
              onClick={logout}
              className="flex-1 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              Odhlasit sa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, extra, isText }: { label: string; value: number | string; extra?: string; isText?: boolean }) {
  return (
    <div className="rounded-xl bg-card/50 border border-border/50 p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`font-bold ${isText ? 'text-sm' : 'text-lg'}`}>{value}</div>
      {extra && <div className="text-xs text-muted-foreground">{extra}</div>}
    </div>
  );
}
