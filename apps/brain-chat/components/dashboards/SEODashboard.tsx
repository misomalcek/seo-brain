'use client';

import { useState, useEffect } from 'react';
import { getSEODashboard } from '@/lib/api';
import type { SEODashboardData } from '@/lib/types';
import { SparkLine } from '@/components/charts/SparkLine';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';

export function SEODashboard() {
  const [data, setData] = useState<SEODashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSEODashboard()
      .then(setData)
      .catch(err => console.error('Failed to load SEO dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Nacitavam SEO data...</div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">Nepodarilo sa nacitat data</div>;

  const drValues = data.domainRating.history.map(h => h.value);

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Domain Rating"
          value={data.domainRating.current ?? '—'}
          subtitle={data.domainRating.rank ? `Rank #${data.domainRating.rank.toLocaleString()}` : undefined}
          sparkValues={drValues}
        />
        <StatCard
          title="Keywords"
          value={data.keywords.total}
          subtitle={`Top 10 tracked`}
        />
        <StatCard
          title="Backlinks"
          value={data.backlinks.total}
          subtitle="Referring pages"
        />
        <StatCard
          title="Reports"
          value={data.reportCount}
          subtitle="MCP report files"
        />
      </div>

      {/* Row 2: DR History chart */}
      {data.domainRating.history.length > 1 && (
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-4">Domain Rating - Historia</h3>
          <LineChart
            data={data.domainRating.history.map(h => ({ x: h.date, y: h.value }))}
            height={180}
            showArea
            formatValue={v => v.toFixed(1)}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{data.domainRating.history[0]?.date}</span>
            <span>{data.domainRating.history[data.domainRating.history.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Row 3: Top Keywords + Quick Wins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.keywords.top10.length > 0 && (
          <div className="p-5 rounded-xl border border-border bg-card/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top Keywords</h3>
            <div className="space-y-2">
              {data.keywords.top10.map((kw: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1 mr-2">{kw.keyword || kw.query || kw[0] || '—'}</span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    pos {kw.position ?? kw.pos ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.quickWins.length > 0 && (
          <div className="p-5 rounded-xl border border-border bg-card/50">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Wins (GSC)</h3>
            <div className="space-y-2">
              {data.quickWins.map((qw: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1 mr-2">{qw.query || qw.keyword || '—'}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {qw.clicks != null ? `${qw.clicks} clicks` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Competitors */}
      {data.competitors.length > 0 && (
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-4">Konkurencia</h3>
          <BarChart
            data={data.competitors.slice(0, 8).map((c: any) => ({
              label: (c.domain || c.competitor || '').replace(/^www\./, '').slice(0, 20),
              value: c.traffic || c.organic_traffic || c.common_keywords || 0,
            }))}
            height={200}
            formatValue={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />
        </div>
      )}

      {/* Row 5: Top Queries from GSC */}
      {data.topQueries.length > 0 && (
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Queries (Google Search Console)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4">Query</th>
                  <th className="pb-2 pr-4 text-right">Clicks</th>
                  <th className="pb-2 pr-4 text-right">Impressions</th>
                  <th className="pb-2 text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {data.topQueries.map((q: any, i: number) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-foreground">{q.query || q.keys?.[0] || '—'}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{q.clicks ?? '—'}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{q.impressions ?? '—'}</td>
                    <td className="py-2 text-right text-muted-foreground">{q.position != null ? Number(q.position).toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, sparkValues }: {
  title: string;
  value: string | number;
  subtitle?: string;
  sparkValues?: number[];
}) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card/50">
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {sparkValues && sparkValues.length > 1 && <SparkLine values={sparkValues} />}
      </div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}
