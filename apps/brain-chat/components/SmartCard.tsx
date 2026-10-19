'use client';

import { useState } from 'react';
import { SparkLine } from './charts/SparkLine';

interface SmartCardProps {
  data: any;
}

export function SmartCard({ data }: SmartCardProps) {
  if (!data || !data.type) return null;

  switch (data.type) {
    case 'metric': return <MetricCard {...data} />;
    case 'metrics': return <MetricsRow items={data.items || []} />;
    case 'comparison': return <ComparisonCard {...data} />;
    case 'alert': return <AlertCard {...data} />;
    case 'table': return <TableCard {...data} />;
    case 'progress': return <ProgressCard {...data} />;
    case 'list': return <ListCard {...data} />;
    default: return null;
  }
}

// ─── Single KPI Metric ─────────────────

function MetricCard({ title, value, change, unit, trend, description }: {
  title: string; value: string | number; change?: string; unit?: string;
  trend?: number[]; description?: string;
}) {
  const isPositive = change && (change.startsWith('+') || change.startsWith('↑'));
  const isNegative = change && (change.startsWith('-') || change.startsWith('↓'));

  return (
    <div className="bg-gradient-to-br from-card to-muted/30 border border-border/50 rounded-xl p-4 inline-block min-w-0 sm:min-w-[160px]">
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-foreground">{value}{unit && <span className="text-sm ml-0.5 text-muted-foreground">{unit}</span>}</span>
        {change && (
          <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>
            {change}
          </span>
        )}
        {trend && trend.length > 1 && (
          <SparkLine values={trend} width={50} height={20} />
        )}
      </div>
      {description && <div className="text-xs text-muted-foreground mt-1">{description}</div>}
    </div>
  );
}

// ─── Row of Metrics ─────────────────

function MetricsRow({ items }: { items: any[] }) {
  return (
    <div className="flex flex-wrap gap-3 my-2">
      {items.map((item, i) => (
        <MetricCard key={i} {...item} />
      ))}
    </div>
  );
}

// ─── Comparison ─────────────────

function ComparisonCard({ title, items }: { title?: string; items: { label: string; values: Record<string, string | number> }[] }) {
  if (!items?.length) return null;
  const keys = Object.keys(items[0]?.values || {});

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden my-2">
      {title && <div className="px-4 py-2 text-sm font-semibold border-b border-border/30">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground"></th>
              {items.map((item, i) => (
                <th key={i} className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground">{item.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key} className="border-t border-border/20">
                <td className="py-1.5 px-3 text-muted-foreground text-xs">{key}</td>
                {items.map((item, i) => (
                  <td key={i} className="text-center py-1.5 px-3 font-medium">{String(item.values[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Alert/Callout ─────────────────

const ALERT_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  info: { bg: 'from-blue-500/10 to-blue-500/5', border: 'border-blue-500/30', icon: 'ℹ️' },
  warning: { bg: 'from-yellow-500/10 to-yellow-500/5', border: 'border-yellow-500/30', icon: '⚠️' },
  error: { bg: 'from-red-500/10 to-red-500/5', border: 'border-red-500/30', icon: '❌' },
  success: { bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/30', icon: '✅' },
};

function AlertCard({ severity = 'info', title, message }: { severity?: string; title?: string; message: string }) {
  const style = ALERT_STYLES[severity] || ALERT_STYLES.info;
  return (
    <div className={`bg-gradient-to-r ${style.bg} border ${style.border} rounded-xl p-4 my-2`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{style.icon}</span>
        <div>
          {title && <div className="font-semibold text-sm mb-1">{title}</div>}
          <div className="text-sm text-foreground/80">{message}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Enhanced Table ─────────────────

function TableCard({ title, headers, rows }: { title?: string; headers: string[]; rows: (string | number)[][] }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (col: number) => {
    if (sortCol === col) { setSortAsc(!sortAsc); }
    else { setSortCol(col); setSortAsc(true); }
  };

  const sortedRows = sortCol !== null
    ? [...rows].sort((a, b) => {
        const aVal = a[sortCol]; const bVal = b[sortCol];
        const cmp = typeof aVal === 'number' && typeof bVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
        return sortAsc ? cmp : -cmp;
      })
    : rows;

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden my-2">
      {title && <div className="px-4 py-2 text-sm font-semibold border-b border-border/30">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              {headers.map((h, i) => (
                <th key={i} onClick={() => handleSort(i)} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  {h} {sortCol === i && (sortAsc ? '↑' : '↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.slice(0, 20).map((row, ri) => (
              <tr key={ri} className="border-t border-border/20 hover:bg-muted/20">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1.5 px-3">{typeof cell === 'number' ? cell.toLocaleString() : cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 20 && (
          <div className="text-center text-xs text-muted-foreground py-2">+ {rows.length - 20} dalsich riadkov</div>
        )}
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────

function ProgressCard({ title, current, target, unit }: { title: string; current: number; target: number; unit?: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 my-2">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{current.toLocaleString()}{unit && ` ${unit}`} / {target.toLocaleString()}{unit && ` ${unit}`}</span>
      </div>
      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct >= 100 ? 'hsl(142 71% 45%)' : pct >= 70 ? 'hsl(186 100% 50%)' : 'hsl(270 91% 65%)',
          }}
        />
      </div>
      <div className="text-right text-xs text-muted-foreground mt-1">{pct}%</div>
    </div>
  );
}

// ─── Styled List ─────────────────

function ListCard({ title, items, ordered }: { title?: string; items: string[]; ordered?: boolean }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 my-2">
      {title && <div className="font-semibold text-sm mb-2">{title}</div>}
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-primary font-medium shrink-0">
              {ordered ? `${i + 1}.` : '•'}
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
