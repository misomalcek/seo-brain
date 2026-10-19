'use client';

import { useState } from 'react';

interface LineChartProps {
  data: { x: string; y: number }[];
  height?: number;
  color?: string;
  showArea?: boolean;
  showDots?: boolean;
  formatValue?: (v: number) => string;
}

export function LineChart({ data, height = 200, color = 'hsl(186 100% 50%)', showArea = true, showDots = true, formatValue }: LineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (data.length < 2) return null;

  const padding = { top: 20, bottom: 40, left: 50, right: 20 };
  const chartWidth = Math.max(400, data.length * 60);
  const chartHeight = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.y), 1);
  const minVal = Math.min(...data.map(d => d.y), 0);
  const range = maxVal - minVal || 1;

  const fmt = formatValue || ((v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

  const points = data.map((d, i) => ({
    px: padding.left + (i / (data.length - 1)) * (chartWidth - padding.left - padding.right),
    py: padding.top + chartHeight - ((d.y - minVal) / range) * chartHeight,
    label: d.x,
    value: d.y,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].px} ${padding.top + chartHeight} L ${points[0].px} ${padding.top + chartHeight} Z`;

  const gradientId = `area-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const val = minVal + range * pct;
          const yPos = padding.top + chartHeight * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padding.left} y1={yPos} x2={chartWidth - padding.right} y2={yPos} stroke="currentColor" strokeOpacity={0.08} />
              <text x={padding.left - 8} y={yPos + 3} textAnchor="end" fill="currentColor" fontSize={9} opacity={0.5}>
                {fmt(val)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {showArea && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots and labels */}
        {points.map((p, i) => (
          <g key={i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <rect x={p.px - 20} y={padding.top} width={40} height={chartHeight} fill="transparent" />
            {(showDots || hoveredIdx === i) && (
              <circle cx={p.px} cy={p.py} r={hoveredIdx === i ? 5 : 3} fill={color} stroke="hsl(222 47% 6%)" strokeWidth={2} />
            )}
            {hoveredIdx === i && (
              <text x={p.px} y={p.py - 12} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight="bold">
                {fmt(p.value)}
              </text>
            )}
            {/* X-axis label - show every nth */}
            {(i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1) && (
              <text x={p.px} y={height - 8} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.5}>
                {p.label.length > 6 ? p.label.slice(0, 6) : p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
