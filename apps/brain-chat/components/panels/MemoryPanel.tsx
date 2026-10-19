'use client';

/**
 * MemoryPanel — dock Pamäť overlay (2026-05-26 rewrite).
 *
 * Now delegates the entire UI to the reusable <MemoryBrowser /> so the
 * user-facing Pamäť tab gains parity with /admin/memory: filters, sort,
 * pin/edit/delete, anchor, and (for admins) the inbox + knowledge tabs
 * plus the decay/auto-activate batch buttons.
 */

import { useAuth } from '@/lib/auth-context';
import { MemoryBrowser } from '@/components/MemoryBrowser';

export function MemoryPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'team_admin';
  return <MemoryBrowser isAdmin={isAdmin} />;
}
