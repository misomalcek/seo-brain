'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { PanelError } from '@/components/ui/PanelError';

// ── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: 'memory' | 'category' | 'domain';
  group: string;
  size: number;
  active?: boolean;
  pinned?: boolean;
  detail?: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: { total_memories: number; active_memories?: number; categories: string[]; domains: string[] };
}

// Shape the library expects
interface FGNode {
  id: string;
  name: string;
  group: string;
  type: 'memory' | 'category' | 'domain';
  size: number;
  active?: boolean;
  pinned?: boolean;
  detail?: string;
  val: number;
  // react-force-graph adds x/y/vx/vy at runtime — allow them
  [key: string]: unknown;
}

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  [key: string]: unknown;
}

interface FGData {
  nodes: FGNode[];
  links: FGLink[];
}

// ── Color maps (unchanged from original) ─────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  domain:     '#3b82f6',
  pattern:    '#22c55e',
  preference: '#f59e0b',
  analysis:   '#a855f7',
  other:      '#6b7280',
};

// TYPE_STROKE kept for canvas rendering
const TYPE_STROKE: Record<string, string> = {
  category: '#fff',
  domain: '#e5e7eb',
  memory: 'transparent',
};

// ── Dynamic import (react-force-graph-2d uses canvas/window — SSR unsafe) ────

// The library's FCwithRef type accepts `ref` as a plain prop (not forwardRef).
// dynamic() strips generic params, so we re-cast to the correct type after loading.
import type { ForceGraphMethods, ForceGraphProps, NodeObject, LinkObject } from 'react-force-graph-2d';
import type { MutableRefObject, ReactElement } from 'react';

// Mirror the library's FCwithRef type signature (from its d.ts)
type FCwithRef = <N = {}, L = {}>(
  props: ForceGraphProps<NodeObject<N>, LinkObject<N, L>> & {
    ref?: MutableRefObject<ForceGraphMethods<NodeObject<N>, LinkObject<N, L>> | undefined>;
  }
) => ReactElement;

// Loaded lazily so the canvas/window accesses only run on the client
const ForceGraph2DLazy = dynamic(
  () => import('react-force-graph-2d').then(m => m.default as unknown as FCwithRef),
  { ssr: false }
);
// Cast once here so JSX usages are clean
const ForceGraph2D = ForceGraph2DLazy as unknown as FCwithRef;

// ── Main component ────────────────────────────────────────────────────────────

export function GraphPanel() {
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 500, height: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  // ── Data load ──────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/graph/data', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GraphData) => setRawData(d))
      .catch((e: Error) => setError(e.message || 'Nepodarilo sa načítať graf'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Container resize observer ──────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ width: Math.max(width, 300), height: Math.max(height, 300) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Stable mapped graphData (only rebuild when rawData / filters change) ───
  // react-force-graph MUTATES this object (adds x/y/vx/vy). A new object
  // reference every render resets the layout. We keep it in a ref and only
  // swap it when the filtered node/link set actually changes.

  const graphDataRef = useRef<FGData>({ nodes: [], links: [] });
  const [graphData, setGraphData] = useState<FGData>({ nodes: [], links: [] });

  const filteredIds = useMemo(() => {
    if (!rawData) return new Set<string>();
    const ids = new Set<string>();
    for (const n of rawData.nodes) {
      if (!showPending && n.type === 'memory' && n.active === false) continue;
      if (filter && n.group !== filter && n.type !== 'category' && n.type !== 'domain') continue;
      ids.add(n.id);
    }
    return ids;
  }, [rawData, filter, showPending]);

  useEffect(() => {
    if (!rawData) return;
    const nodes: FGNode[] = rawData.nodes
      .filter(n => filteredIds.has(n.id))
      .map(n => ({
        id: n.id,
        name: n.label,
        group: n.group,
        type: n.type,
        size: n.size,
        active: n.active,
        pinned: n.pinned,
        detail: n.detail,
        val: n.size,
      }));
    const links: FGLink[] = rawData.edges
      .filter(e => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map(e => ({ source: e.source, target: e.target }));

    graphDataRef.current = { nodes, links };
    setGraphData({ nodes, links });
  }, [rawData, filteredIds]);

  // ── Node canvas painter ────────────────────────────────────────────────────

  const nodeCanvasObject = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const r = (n.size || 6) + (n.id === selected?.id || n.id === hoveredId ? 2 : 0);
      const color = GROUP_COLORS[n.group] || GROUP_COLORS.other;
      const isPending = n.type === 'memory' && n.active === false;
      const isSelected = n.id === selected?.id;
      const isHovered = n.id === hoveredId;

      // Glow ring for category + selected
      if (n.type === 'category' || isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
        ctx.fillStyle = color + (isSelected ? '40' : '26');
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);

      if (n.type === 'memory') {
        ctx.fillStyle = color + (isPending ? '50' : '80');
      } else {
        ctx.fillStyle = color;
      }
      ctx.fill();

      // Stroke
      const strokeColor = isSelected ? color : (TYPE_STROKE[n.type] || 'transparent');
      if (strokeColor !== 'transparent') {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 2.5 : (n.type === 'category' ? 2 : 0);
        if (isPending) {
          ctx.setLineDash([2, 2]);
        }
        if (ctx.lineWidth > 0) ctx.stroke();
        ctx.setLineDash([]);
      }

      // Pin marker
      if (n.pinned) {
        ctx.beginPath();
        ctx.arc(node.x, node.y - r - 1, 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }

      // Label: always for category/domain; for memory only when zoomed in or hovered/selected
      const showLabel = n.type !== 'memory' || isHovered || isSelected || globalScale > 1.5;
      if (showLabel) {
        const label = n.name.length > 20 ? n.name.slice(0, 20) + '…' : n.name;
        const fontSize = n.type === 'category' ? 11 / globalScale : 10 / globalScale;
        ctx.font = `${n.type === 'category' ? '600' : '400'} ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = n.type === 'category' ? color : '#9ca3af';
        ctx.fillText(label, node.x, node.y - r - 4 / globalScale);
      }

      // Dim overlay for pending nodes
      if (isPending && !isHovered && !isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
      }
    },
    [selected, hoveredId]
  );

  // nodePointerAreaPaint — hit area matches the drawn circle
  const nodePointerAreaPaint = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as FGNode;
      const r = (n.size || 6) + 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  // ── Interaction handlers ───────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any) => {
    const n = node as FGNode;
    const original = rawData?.nodes.find(x => x.id === n.id) ?? null;
    setSelected(s => s?.id === n.id ? null : original);
  }, [rawData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeHover = useCallback((node: any | null) => {
    setHoveredId(node ? (node as FGNode).id : null);
  }, []);

  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40);
  }, []);

  const resetView = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
      Načítavam graf...
    </div>
  );
  if (error) return <PanelError message={error} onRetry={load} />;
  if (!rawData || rawData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2 text-center">
        <span className="text-3xl">🕸️</span>
        <div>Graf zatiaľ nemá žiadne uzly.</div>
        <div className="text-xs opacity-70">Pridaj pamäte (Pamäť → + Nová) alebo /remember v chate.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats + filter pills */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {rawData.meta.active_memories ?? rawData.meta.total_memories} aktívnych
          {typeof rawData.meta.active_memories === 'number' && rawData.meta.total_memories > rawData.meta.active_memories && (
            <span className="opacity-60"> · {rawData.meta.total_memories - rawData.meta.active_memories} čaká</span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">·</span>
        <button
          onClick={() => setFilter(null)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${!filter ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >Všetky</button>
        {rawData.meta.categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(filter === cat ? null : cat)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
              filter === cat ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={filter === cat ? { backgroundColor: GROUP_COLORS[cat] || GROUP_COLORS.other } : undefined}
          >
            {cat}
          </button>
        ))}
        <span className="text-muted-foreground text-xs">·</span>
        <button
          onClick={() => setShowPending(p => !p)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${showPending ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="Zobraziť aj čakajúce (neaktívne) pamäte"
        >{showPending ? '◐ Čakajúce' : '○ Čakajúce'}</button>
      </div>

      {/* Graph canvas + overlay controls */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <ForceGraph2D
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          graphData={graphData}
          backgroundColor="transparent"
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={() => 'rgba(148,163,184,0.25)'}
          linkWidth={0.7}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          cooldownTicks={100}
          onEngineStop={handleEngineStop}
          showPointerCursor
        />

        {/* Zoom / fit controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button
            onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 200)}
            className="w-7 h-7 rounded-lg bg-card/90 border border-border text-foreground text-sm font-medium hover:bg-surface-hover cursor-pointer flex items-center justify-center shadow-sm"
            title="Priblížiť"
          >+</button>
          <button
            onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 200)}
            className="w-7 h-7 rounded-lg bg-card/90 border border-border text-foreground text-sm font-medium hover:bg-surface-hover cursor-pointer flex items-center justify-center shadow-sm"
            title="Oddialiť"
          >−</button>
          <button
            onClick={resetView}
            className="w-7 h-7 rounded-lg bg-card/90 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer flex items-center justify-center shadow-sm"
            title="Resetovať pohľad"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Selected node detail panel */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-card border border-border p-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: GROUP_COLORS[selected.group] || GROUP_COLORS.other }}
                  />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {selected.type === 'memory' ? 'pamäť' : selected.type === 'category' ? 'kategória' : 'doména'} · {selected.group}
                  </span>
                  {selected.type === 'memory' && (
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${selected.active === false ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-green-500/15 text-green-600 dark:text-green-400'}`}>
                      {selected.active === false ? 'čaká na schválenie' : 'aktívna'}
                    </span>
                  )}
                  {selected.pinned && <span className="text-[9px]">📌</span>}
                </div>
                <p className="text-sm text-foreground leading-snug">{selected.detail || selected.label}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
