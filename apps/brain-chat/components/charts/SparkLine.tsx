'use client';

interface SparkLineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  showEndDot?: boolean;
}

export function SparkLine({ values, width = 80, height = 24, color = 'hsl(186 100% 50%)', showEndDot = true }: SparkLineProps) {
  if (values.length < 2) return null;

  const pad = 2;
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const points = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - minVal) / range) * (height - pad * 2),
  }));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const last = points[points.length - 1];
  const trend = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showEndDot && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={trend ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)'} />
      )}
    </svg>
  );
}
