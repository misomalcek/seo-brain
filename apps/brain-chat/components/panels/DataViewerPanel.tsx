'use client';

/**
 * DataViewerPanel — admin dock data app.
 * 2026-05-26 — added System tab pulling /api/admin/health + /api/admin/stats
 * (uptime, RAM, disk, DB, users, conversations, files, data pipeline,
 * persona usage, recent activity). Skips the Agents block — that area
 * is already better served elsewhere.
 */

import { useState, useEffect, useCallback } from 'react';
import { PanelError } from '@/components/ui/PanelError';
import { getAdminHealth, getAdminStats, type AdminHealth, type AdminStats } from '@/lib/api';

interface ObservabilitySummary {
  runs_24h: string;
  runs_7d: string;
  tool_calls_24h: string;
  tool_calls_7d: string;
  tokens_7d: string;
  failures_7d: string;
}

interface AgentRun {
  ran_at: string;
  agent_id: string;
  model_used: string;
  mode: string;
  tool_calls_count: number;
  iterations: number;
  input_tokens: number;
  output_tokens: number;
  total_duration_ms: number;
  success: boolean;
  error_message?: string;
}

interface ToolCall {
  called_at: string;
  tool_name: string;
  agent_id: string;
  duration_ms: number;
  output_size_bytes: number;
  success: boolean;
  error_code?: string;
}

interface ObservabilityData {
  summary: ObservabilitySummary;
  recent_runs: AgentRun[];
  recent_tool_calls: ToolCall[];
}

type Tab = 'runs' | 'tools' | 'system';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-semibold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('sk-SK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtNum(n: string | number) {
  return Number(n).toLocaleString('sk-SK');
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}GB`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`;
  return `${n}B`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function DataViewerPanel() {
  const [data, setData] = useState<ObservabilityData | null>(null);
  const [systemHealth, setSystemHealth] = useState<AdminHealth | null>(null);
  const [systemStats, setSystemStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('runs');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/admin/observability', { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`Observability HTTP ${r.status}`); return r.json(); }),
      getAdminHealth().catch(() => null),
      getAdminStats().catch(() => null),
    ])
      .then(([obs, health, stats]) => {
        setData(obs);
        setSystemHealth(health);
        setSystemStats(stats);
      })
      .catch(e => setError(e.message || 'Nepodarilo sa načítať dáta'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
      Načítavam...
    </div>
  );
  if (error) return <PanelError message={error} onRetry={load} />;
  if (!data) return null;

  const { summary, recent_runs, recent_tool_calls } = data;

  // Top tools by call count (7d)
  const toolCounts = recent_tool_calls.reduce<Record<string, number>>((acc, t) => {
    acc[t.tool_name] = (acc[t.tool_name] || 0) + 1;
    return acc;
  }, {});
  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxToolCount = topTools[0]?.[1] || 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-2 shrink-0">
        <StatCard label="Agent runs 24h" value={fmtNum(summary.runs_24h)} sub={`${fmtNum(summary.runs_7d)} za 7 dní`} />
        <StatCard label="Tool calls 24h" value={fmtNum(summary.tool_calls_24h)} sub={`${fmtNum(summary.tool_calls_7d)} za 7 dní`} />
        <StatCard label="Tokeny 7d" value={fmtNum(summary.tokens_7d)} sub={`${fmtNum(summary.failures_7d)} zlyhaní`} />
      </div>

      {/* Top tools bar chart */}
      {topTools.length > 0 && (
        <div className="px-4 pb-3 shrink-0">
          <div className="text-[11px] font-medium text-muted-foreground mb-2">Top nástroje (7d)</div>
          <div className="space-y-1.5">
            {topTools.map(([name, count]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="text-[11px] text-muted-foreground w-32 truncate shrink-0">{name}</div>
                <div className="flex-1 bg-foreground/5 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{ width: `${Math.round((count / maxToolCount) * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground w-6 text-right shrink-0">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1.5 px-4 pb-2 shrink-0">
        {([['runs', 'Agent runs'], ['tools', 'Tool calls'], ['system', 'Systém']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              tab === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-foreground/[0.05] dark:bg-white/[0.06] text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        {tab === 'runs' && (
          <div className="space-y-1.5">
            {recent_runs.slice(0, 30).map((r, i) => (
              <div key={i} className={`rounded-xl border p-2.5 ${r.success ? 'bg-card border-border' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-foreground">{r.agent_id || 'base'}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(r.ran_at)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                  <span className="text-blue-500/80">{r.model_used?.split('-').slice(-2).join('-') || '—'}</span>
                  {r.mode && <span>{r.mode}</span>}
                  <span>{r.tool_calls_count ?? 0} tools</span>
                  <span>{fmtNum((r.input_tokens || 0) + (r.output_tokens || 0))} tok</span>
                  <span>{fmt(r.total_duration_ms)}</span>
                  {!r.success && <span className="text-red-400">✗ {r.error_message?.slice(0, 40)}</span>}
                </div>
              </div>
            ))}
            {recent_runs.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">Žiadne runy za 7 dní</div>
            )}
          </div>
        )}
        {tab === 'tools' && (
          <div className="space-y-1.5">
            {recent_tool_calls.slice(0, 30).map((t, i) => (
              <div key={i} className={`rounded-xl border p-2.5 ${t.success ? 'bg-card border-border' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-foreground">{t.tool_name}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(t.called_at)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                  <span>{t.agent_id || '—'}</span>
                  <span>{fmt(t.duration_ms)}</span>
                  {t.output_size_bytes > 0 && <span>{(t.output_size_bytes / 1024).toFixed(1)} KB</span>}
                  {!t.success && <span className="text-red-400">✗ {t.error_code}</span>}
                </div>
              </div>
            ))}
            {recent_tool_calls.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">Žiadne tool calls za 7 dní</div>
            )}
          </div>
        )}
        {tab === 'system' && (
          <SystemTabContent health={systemHealth} stats={systemStats} />
        )}
      </div>
    </div>
  );
}

// ── System tab (admin Prehľad ported, minus Agents block) ──────────────────

function SystemTabContent({ health, stats }: { health: AdminHealth | null; stats: AdminStats | null }) {
  if (!health && !stats) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground space-y-1">
        <div>Systémové dáta nedostupné.</div>
        <div className="text-xs opacity-70">Skontroluj, že máš admin role + že /api/admin/health odpovedá.</div>
      </div>
    );
  }
  if (!health || !stats) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Niektoré dáta sa nepodarilo načítať — zobrazené to čo je dostupné.
      </div>
    );
  }
  const memPct = health.system?.memory?.usagePercent ?? 0;
  const diskTotal = health.system?.disk?.total ?? 0;
  const diskUsed = health.system?.disk?.used ?? 0;
  const diskPct = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
  const statusColor =
    health.status === 'healthy' ? 'text-emerald-400' :
    health.status === 'degraded' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Status + uptime */}
      <div className="flex items-center gap-3 text-xs">
        <span className={`font-semibold ${statusColor}`}>● {health.status?.toUpperCase()}</span>
        <span className="text-muted-foreground">uptime: {fmtUptime(health.uptime ?? 0)}</span>
        {health.system?.nodeVersion && <span className="text-muted-foreground">Node {health.system.nodeVersion}</span>}
      </div>

      {/* System health cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="RAM" value={`${memPct}%`} sub={`${fmtBytes(health.system?.memory?.used ?? 0)} / ${fmtBytes(health.system?.memory?.total ?? 0)}`} />
        <StatCard label="Disk" value={`${diskPct}%`} sub={`${fmtBytes(diskUsed)} / ${fmtBytes(diskTotal)}`} />
        <StatCard label="Database" value={health.database?.status || '—'} sub={health.database?.latency ? `${health.database.latency}ms` : ''} />
        <StatCard label="MCP Bridge" value={health.mcpBridge?.status || '—'} />
      </div>

      {/* Domain stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Používatelia" value={fmtNum(stats.users?.total ?? 0)} sub={(stats.users?.byRole ?? []).map(r => `${r.role}:${r.count}`).join(' · ')} />
        <StatCard label="Konverzácie" value={fmtNum(stats.conversations?.total ?? 0)} sub={`dnes ${stats.conversations?.today ?? 0} · 7d ${stats.conversations?.thisWeek ?? 0}`} />
        <StatCard label="Správy" value={fmtNum(stats.messages?.total ?? 0)} sub={`dnes ${stats.messages?.today ?? 0}`} />
        <StatCard label="Súbory" value={fmtNum(stats.files?.total ?? 0)} sub={stats.files?.totalSize ? fmtBytes(stats.files.totalSize) : ''} />
      </div>

      {/* Pending actions */}
      {((health.pendingActions?.memoryInbox ?? 0) > 0 || (health.pendingActions?.newFeedback ?? 0) > 0) && (
        <div className="flex gap-2 flex-wrap">
          {(health.pendingActions?.memoryInbox ?? 0) > 0 && (
            <span className="px-2 py-1 rounded text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
              📥 Inbox: {health.pendingActions!.memoryInbox}
            </span>
          )}
          {(health.pendingActions?.newFeedback ?? 0) > 0 && (
            <span className="px-2 py-1 rounded text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/30">
              📣 Feedback: {health.pendingActions!.newFeedback}
            </span>
          )}
        </div>
      )}

      {/* Data pipeline */}
      {health.dataPipeline && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-2">Dátový pipeline</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
            <Kv label="GSC snapshots" value={`${health.dataPipeline.gscSnapshots?.count ?? 0}${health.dataPipeline.gscSnapshots?.stale ? ' (stale)' : ''}`} />
            <Kv label="Ahrefs snapshots" value={`${health.dataPipeline.ahrefsSnapshots?.count ?? 0}${health.dataPipeline.ahrefsSnapshots?.stale ? ' (stale)' : ''}`} />
            <Kv label="MCP cache" value={fmtNum(health.dataPipeline.mcpCache?.entries ?? 0)} />
            {health.dataPipeline.dashboards && Object.entries(health.dataPipeline.dashboards).map(([k, v]) => (
              <Kv key={k} label={`Dashboard ${k}`} value={v ? new Date(v as string).toLocaleDateString('sk-SK') : '—'} />
            ))}
          </div>
        </div>
      )}

      {/* Persona usage */}
      {stats.personas?.usage && stats.personas.usage.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-2">Persona usage</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
            {stats.personas.usage.map(p => (
              <div key={p.personaId} className="rounded-lg bg-foreground/5 p-2">
                <div className="text-xs font-medium capitalize">{p.personaId}</div>
                <div className="text-lg font-bold tabular-nums">{p.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-2">Posledná aktivita</div>
          <div className="space-y-1.5">
            {stats.recentActivity.slice(0, 10).map(a => (
              <div key={a.id} className="rounded-lg bg-card border border-border p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium truncate">{a.title || 'Konverzácia'}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{fmtDate(a.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{a.userName || '—'}</span>
                  <span>·</span>
                  <span>{a.messageCount ?? 0} správ</span>
                  {a.personaId && <><span>·</span><span className="capitalize">{a.personaId}</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-medium tabular-nums shrink-0">{value}</span>
    </div>
  );
}
