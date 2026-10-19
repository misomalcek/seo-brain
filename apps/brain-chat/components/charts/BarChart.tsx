'use client';

import { useState } from 'react';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  color?: string;
  showValues?: boolean;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 200, color, showValues = true, formatValue }: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!data.length) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(20, Math.min(60, 600 / data.length));
  const gap = Math.max(4, barWidth * 0.3);
  const totalWidth = data.length * (barWidth + gap) - gap;
  const padding = { top: 20, bottom: 40, left: 10, right: 10 };
  const chartHeight = height - padding.top - padding.bottom;

  const fmt = formatValue || ((v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={totalWidth + padding.left + padding.right}
        height={height}
        className="min-w-full"
        viewBox={`0 0 ${totalWidth + padding.left + padding.right} ${height}`}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line
            key={pct}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - pct)}
            x2={padding.left + totalWidth}
            y2={padding.top + chartHeight * (1 - pct)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}

        {data.map((d, i) => {
          const barH = (d.value / maxVal) * chartHeight;
          const x = padding.left + i * (barWidth + gap);
          const y = padding.top + chartHeight - barH;
          const barColor = d.color || color || 'hsl(186 100% 50%)';
          const isHovered = hoveredIdx === i;

          return (
            <g key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={4}
                fill={barColor}
                opacity={isHovered ? 1 : 0.75}
                className="transition-opacity duration-150"
              />
              {/* Value label */}
              {(showValues || isHovered) && (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize={10}
                  opacity={isHovered ? 1 : 0.6}
                >
                  {fmt(d.value)}
                </text>
              )}
              {/* X-axis label */}
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fill="currentColor"
                fontSize={9}
                opacity={0.5}
              >
                {d.label.length > 8 ? d.label.slice(0, 7) + '...' : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
