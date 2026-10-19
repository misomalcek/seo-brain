'use client';

import { useState, useEffect } from 'react';
import { getCEODashboard } from '@/lib/api';
import type { CEODashboardData } from '@/lib/types';
import { BarChart } from '@/components/charts/BarChart';
import { SparkLine } from '@/components/charts/SparkLine';

export function CEODashboard() {
  const [data, setData] = useState<CEODashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCEODashboard()
      .then(setData)
      .catch(err => console.error('Failed to load CEO dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Nacitavam CEO dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">Nepodarilo sa nacitat data</div>;

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  };

  const activityValues = data.activity.map(a => a.messages);

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">Aktivni useri</div>
          <div className="text-2xl font-bold text-foreground">{data.kpis.totalUsers}</div>
          <div className="text-xs text-muted-foreground mt-1">Registrovanych</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">Konverzacie</div>
          <div className="text-2xl font-bold text-foreground">{data.kpis.totalConversations}</div>
          <div className="text-xs text-muted-foreground mt-1">Celkovo</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">Domain Rating</div>
          <div className="text-2xl font-bold text-foreground">{data.kpis.domainRating ?? '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">example.com</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">System</div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-lg font-bold text-foreground">OK</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Uptime {formatUptime(data.system.uptime)} | {data.system.memoryMB}MB RAM
          </div>
        </div>
      </div>

      {/* Row 2: Activity Chart */}
      {data.activity.length > 0 && (
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Aktivita (poslednych 14 dni)</h3>
            {activityValues.length > 1 && (
              <SparkLine values={activityValues} width={100} height={28} />
            )}
          </div>
          <BarChart
            data={data.activity.map(a => ({
              label: new Date(a.date).toLocaleDateString('sk', { month: 'short', day: 'numeric' }),
              value: a.messages,
            }))}
            height={180}
            showValues
          />
        </div>
      )}

      {/* Row 3: Users table + Feature Usage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Users */}
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-3">Clenovia timu</h3>
          <div className="space-y-3">
            {data.users.map(u => (
              <div key={u.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-background">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.role}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-foreground">{u.conversations} konv.</div>
                  <div className="text-xs text-muted-foreground">{u.messages} sprav</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Usage */}
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-3">Pouzitie funkcii</h3>
          <div className="space-y-3">
            <FeatureRow label="Deliberacie (Personas)" value={data.featureUsage.deliberations} icon="🎭" />
            <FeatureRow label="MCP Reporty" value={data.featureUsage.reports} icon="📋" />
            <FeatureRow label="Subory" value={data.featureUsage.files} icon="📁" />
            <FeatureRow label="Workspace polozky" value={data.featureUsage.workspaceItems} icon="👥" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <span>{icon}</span> {label}
      </div>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
