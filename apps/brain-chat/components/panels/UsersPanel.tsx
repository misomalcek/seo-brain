'use client';

/**
 * UsersPanel — dock Users overlay (2026-05-26).
 *
 * Wraps <UsersBrowser /> with a role guard. Dock icon is already gated
 * (adminOnly: true in FeaturePanel.tsx) but we double-check here so a
 * direct overlay open from URL or shortcut still refuses.
 */

import { useAuth } from '@/lib/auth-context';
import { UsersBrowser } from '@/components/UsersBrowser';

export function UsersPanel() {
  const { user } = useAuth();
  const allowed = user?.role === 'admin' || user?.role === 'team_admin';
  if (!allowed) {
    return <div className="p-6 text-muted-foreground">Iba pre administrátorov.</div>;
  }
  return <UsersBrowser />;
}
