'use client';

/**
 * UsersBrowser — user management widget extracted from app/admin/users/page.tsx
 * (2026-05-26) so the same UI powers both /admin/users and the new
 * user-facing dock Users app. Dock icon visibility is admin-gated upstream
 * (FeaturePanel.tsx `adminOnly: true`).
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { AdminUser } from '@/lib/types';
import { getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } from '@/lib/api';

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'nikdy';
  const diff = Date.now() - new Date(dateStr).getTime();
  // Guard against clock skew (future dates)
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  if (mins < 1) return 'práve teraz';
  if (mins < 60) return `pred ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `pred ${hours} hod`;
  const days = Math.floor(hours / 24);
  return `pred ${days} d`;
}

function generatePassword(length = 16): string {
  const charset = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const charsetLen = charset.length; // 63
  // Rejection sampling to eliminate modulo bias (256 % 63 = 4)
  const maxUnbiased = 256 - (256 % charsetLen);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < maxUnbiased) {
        result.push(charset[b % charsetLen]);
        if (result.length === length) break;
      }
    }
  }
  return result.join('');
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  team_admin: 'Team Admin',
  member: 'Člen',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  team_admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  member: 'bg-muted text-muted-foreground',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function UsersBrowser() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit form state
  const [editRole, setEditRole] = useState<string>('member');
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordCopied, setEditPasswordCopied] = useState(false);
  const [origRole, setOrigRole] = useState<string>('member');

  // Add form state
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<string>('member');
  const [addPassword, setAddPassword] = useState('');
  const [addPasswordCopied, setAddPasswordCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getAdminUsers()
      .then(d => setUsers(d.users))
      .catch(() => setError('Nepodarilo sa načítať používateľov'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const selectUser = (u: AdminUser) => {
    setSelectedId(u.id);
    setMode('edit');
    setEditRole(u.role);
    setOrigRole(u.role);
    setEditPassword('');
    setEditPasswordCopied(false);
    setError(null);
    setConfirmDeleteId(null);
  };

  const openAdd = () => {
    setSelectedId(null);
    setMode('add');
    setAddName('');
    setAddEmail('');
    setAddRole('member');
    setAddPassword(generatePassword());
    setAddPasswordCopied(false);
    setError(null);
  };

  const cancel = () => {
    setMode('view');
    setSelectedId(null);
    setError(null);
  };

  // ── Save edit ──────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    const updates: { role?: string; password?: string } = {};
    if (editRole !== origRole) updates.role = editRole;
    if (editPassword) updates.password = editPassword;
    try {
      await updateAdminUser(selectedId, updates);
      load();
      setOrigRole(editRole);
      setEditPassword('');
      showSuccess('Zmeny uložené');
    } catch {
      setError('Uloženie zlyhalo');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggleActive = async (u: AdminUser) => {
    try {
      await updateAdminUser(u.id, { is_active: !u.is_active });
      load();
      showSuccess(u.is_active ? 'Používateľ deaktivovaný' : 'Používateľ aktivovaný');
      if (selectedId === u.id) {
        setMode('view');
        setSelectedId(null);
      }
    } catch {
      setError('Aktualizácia zlyhala');
    }
  };

  // ── Create user ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!addName.trim() || !addEmail.trim() || !addPassword) {
      setError('Vyplňte meno, email a heslo');
      return;
    }
    // Basic email format validation (WARN-7)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail.trim())) {
      setError('Neplatný formát emailu');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAdminUser({ name: addName.trim(), email: addEmail.trim(), password: addPassword, role: addRole });
      load();
      cancel();
      showSuccess('Používateľ vytvorený');
    } catch {
      setError('Vytvorenie zlyhalo — email môže byť obsadený');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await deleteAdminUser(id);
      setConfirmDeleteId(null);
      if (selectedId === id) cancel();
      load();
      showSuccess('Používateľ zmazaný');
    } catch {
      setError('Zmazanie zlyhalo');
    }
  };

  // ── Copy password ──────────────────────────────────────────────────────────
  const copyPassword = async (pw: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(pw);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === selectedId) ?? null;
  const isDirty = selectedUser ? (editRole !== origRole || editPassword.length > 0) : false;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Používatelia</h1>
          <p className="text-sm text-muted-foreground">{users.length} účtov</p>
        </div>
        <div className="flex items-center gap-2">
          {successMsg && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{successMsg} ✓</span>
          )}
          <button
            onClick={openAdd}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Pridať používateľa
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: User list ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 overflow-hidden">
          <input
            type="search"
            placeholder="Hľadať používateľov..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading && (
              <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">Načítavam...</div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">Žiadni používatelia</div>
            )}

            {filtered.map(u => {
              const isSelf = u.id === currentUser?.id;
              const isSelected = u.id === selectedId;

              return (
                <div
                  key={u.id}
                  onClick={() => !isSelf && selectUser(u)}
                  className={`rounded-xl border p-4 flex items-center gap-3 min-h-[72px] transition-colors ${
                    isSelf ? 'cursor-default' : 'cursor-pointer hover:bg-surface-hover'
                  } ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'} ${
                    !u.is_active ? 'opacity-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="rounded-full bg-primary/10 text-primary text-sm font-semibold w-9 h-9 flex items-center justify-center shrink-0">
                    {getInitials(u.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{u.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${ROLE_BADGE[u.role] ?? ROLE_BADGE.member}`}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                      {!u.is_active && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground shrink-0">
                          Neaktívny
                        </span>
                      )}
                      {u.must_change_password && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                          Zmena hesla
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground tabular-nums">
                      <span title="Celkové tokeny">{formatTokens(u.total_tokens)} tok</span>
                      <span>·</span>
                      <span title="Konverzácie za 30 dní">{u.conversations_30d} konv/mes</span>
                      <span>·</span>
                      <span title="Posledné prihlásenie">{formatRelativeTime(u.last_login_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground italic px-2">(váš účet)</span>
                    ) : (
                      <>
                        {/* Disable / Enable */}
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`text-xs rounded-lg px-2 py-1 transition-colors border ${
                            u.is_active
                              ? 'border-border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-300'
                              : 'border-emerald-300 text-emerald-600 hover:bg-emerald-500/10'
                          }`}
                          title={u.is_active ? 'Deaktivovať' : 'Aktivovať'}
                        >
                          {u.is_active ? 'Deaktivovať' : 'Aktivovať'}
                        </button>

                        {/* Delete */}
                        {confirmDeleteId === u.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="rounded px-2 py-1 text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-2 py-1 text-xs border border-border hover:bg-muted transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(u.id)}
                            className="text-xs rounded-lg px-2 py-1 text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            Zmazať
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Detail / Form panel ──────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-y-auto">

          {/* Empty state */}
          {mode === 'view' && (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-full bg-muted p-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-muted-foreground" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Žiadny používateľ vybraný</p>
                <p className="text-xs text-muted-foreground mt-1">Vyberte zo zoznamu alebo pridajte nového.</p>
              </div>
              <button
                onClick={openAdd}
                className="mt-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 transition-opacity"
              >
                + Pridať používateľa
              </button>
            </div>
          )}

          {/* Edit panel */}
          {mode === 'edit' && selectedUser && (
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 text-primary text-lg font-semibold w-12 h-12 flex items-center justify-center shrink-0">
                  {getInitials(selectedUser.name)}
                </div>
                <div>
                  <div className="font-semibold">{selectedUser.name}</div>
                  <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground mb-0.5">Tokeny celkovo</div>
                  <div className="font-mono font-semibold">{formatTokens(selectedUser.total_tokens)}</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground mb-0.5">Konverzácie (30 dní)</div>
                  <div className="font-mono font-semibold">{selectedUser.conversations_30d}</div>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Rola</label>
                {selectedUser.role === 'admin' ? (
                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    Admin — rolu nie je možné zmeniť
                  </div>
                ) : (
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="member">Člen</option>
                    <option value="team_admin">Team Admin</option>
                  </select>
                )}
              </div>

              {/* Password reset */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Reset hesla</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setEditPassword(generatePassword())}
                    className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
                  >
                    Generuj heslo
                  </button>
                  {editPassword && (
                    <button
                      onClick={() => setEditPassword(generatePassword())}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      title="Vygenerovať nové heslo"
                    >
                      ↺
                    </button>
                  )}
                </div>
                {editPassword && (
                  <>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={editPassword}
                        className="flex-1 font-mono text-sm rounded-lg border border-border bg-muted px-3 py-2 tracking-wider select-all"
                      />
                      <button
                        onClick={() => copyPassword(editPassword, setEditPasswordCopied)}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted transition-colors shrink-0"
                      >
                        {editPasswordCopied ? 'Skopírované ✓' : 'Kopírovať'}
                      </button>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Silné heslo — bezpečne odošlite používateľovi
                    </p>
                  </>
                )}
              </div>

              {/* Save bar */}
              {isDirty ? (
                <div className="flex items-center justify-between pt-3 border-t border-border mt-auto">
                  <span className="text-xs text-muted-foreground">Neuložené zmeny</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditRole(origRole); setEditPassword(''); }}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    >
                      Zrušiť
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {saving ? 'Ukladám...' : 'Uložiť zmeny'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-border mt-auto">
                  <button
                    onClick={cancel}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors w-full"
                  >
                    Zavrieť
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add panel */}
          {mode === 'add' && (
            <div className="p-5 flex flex-col gap-4">
              <h2 className="font-semibold text-base">Nový používateľ</h2>

              <div>
                <label className="block text-sm font-medium mb-1.5">Meno</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="Jana Novák"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="jana@example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Rola</label>
                <select
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="member">Člen</option>
                  <option value="team_admin">Team Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Heslo</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setAddPassword(generatePassword())}
                    className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
                  >
                    Generuj heslo
                  </button>
                  {addPassword && (
                    <button
                      onClick={() => setAddPassword(generatePassword())}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      title="Vygenerovať nové heslo"
                    >
                      ↺
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={addPassword}
                    placeholder="Kliknite 'Generuj heslo'"
                    className="flex-1 font-mono text-sm rounded-lg border border-border bg-muted px-3 py-2 tracking-wider select-all placeholder:font-sans placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => copyPassword(addPassword, setAddPasswordCopied)}
                    disabled={!addPassword}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-40 transition-colors shrink-0"
                  >
                    {addPasswordCopied ? 'Skopírované ✓' : 'Kopírovať'}
                  </button>
                </div>
                {addPassword && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    Silné heslo — bezpečne odošlite používateľovi
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-border mt-auto">
                <button
                  onClick={cancel}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Zrušiť
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Vytváram...' : 'Vytvoriť používateľa'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
