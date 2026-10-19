'use client';

import { useState, useEffect } from 'react';
import { getContentDashboard } from '@/lib/api';
import type { ContentDashboardData } from '@/lib/types';
import { BarChart } from '@/components/charts/BarChart';

export function ContentDashboard() {
  const [data, setData] = useState<ContentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getContentDashboard()
      .then(setData)
      .catch(err => console.error('Failed to load content dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Nacitavam content data...</div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">Nepodarilo sa nacitat data</div>;

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">Konverzacie</div>
          <div className="text-2xl font-bold text-foreground">{data.totalConversations}</div>
          <div className="text-xs text-muted-foreground mt-1">Celkovo</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">AI Odpovede</div>
          <div className="text-2xl font-bold text-foreground">{data.totalResponses}</div>
          <div className="text-xs text-muted-foreground mt-1">Celkovy pocet</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card/50">
          <div className="text-xs text-muted-foreground mb-1">Content Konverzacie</div>
          <div className="text-2xl font-bold text-foreground">{data.recentConversations.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Content-related</div>
        </div>
      </div>

      {/* Row 2: Tool Usage */}
      {data.toolUsage.length > 0 && (
        <div className="p-5 rounded-xl border border-border bg-card/50">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pouzitie nastrojov</h3>
          <BarChart
            data={data.toolUsage.map(t => ({
              label: t.type.replace(/_/g, ' '),
              value: t.count,
            }))}
            height={180}
            color="hsl(280 70% 50%)"
          />
        </div>
      )}

      {/* Row 3: Recent Content Conversations */}
      <div className="p-5 rounded-xl border border-border bg-card/50">
        <h3 className="text-sm font-semibold text-foreground mb-3">Posledne content konverzacie</h3>
        {data.recentConversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ziadne content konverzacie</p>
        ) : (
          <div className="space-y-2">
            {data.recentConversations.map(conv => (
              <div key={conv.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <div className="text-sm text-foreground">{conv.title || 'Bez nazvu'}</div>
                  <div className="text-xs text-muted-foreground">{conv.userName}</div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(conv.createdAt).toLocaleDateString('sk')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 4: Content Calendar Placeholder */}
      <div className="p-5 rounded-xl border border-border bg-card/50 border-dashed">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Content Kalendar</h3>
        <p className="text-xs text-muted-foreground">
          Coming soon — planovanie clankov, content pipeline, a editorial workflow.
        </p>
      </div>
    </div>
  );
}
