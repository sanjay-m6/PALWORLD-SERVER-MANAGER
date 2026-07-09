import React, { useMemo } from 'react';

interface DataPoint {
  value: number;
  timestamp: number;
}

interface PerformanceChartProps {
  data: DataPoint[];
  label: string;
  currentValue: string;
  unit: string;
  color: string; // e.g. '#06b6d4' for cyan
  maxPoints?: number;
  height?: number;
  maxValue?: number;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data,
  label,
  currentValue,
  unit,
  color,
  maxPoints = 60,
  height = 80,
  maxValue: externalMax,
}) => {
  const width = 280;
  const paddingTop = 4;
  const paddingBottom = 4;
  const chartHeight = height - paddingTop - paddingBottom;

  const { path, areaPath, maxVal, minVal, avgVal } = useMemo(() => {
    if (data.length < 2) {
      return { path: '', areaPath: '', maxVal: 0, minVal: 0, avgVal: 0 };
    }

    const points = data.slice(-maxPoints);
    const values = points.map((p) => p.value);
    const max = externalMax ?? Math.max(...values, 1);
    const min = Math.min(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const stepX = width / (points.length - 1);

    const coords = points.map((p, i) => {
      const x = i * stepX;
      const y = paddingTop + chartHeight - (p.value / max) * chartHeight;
      return { x, y };
    });

    // Build smooth bezier path
    let d = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpx1 = prev.x + stepX * 0.4;
      const cpx2 = curr.x - stepX * 0.4;
      d += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
    }

    // Area path (filled below the line)
    const areaD =
      d +
      ` L ${coords[coords.length - 1].x},${height} L ${coords[0].x},${height} Z`;

    return {
      path: d,
      areaPath: areaD,
      maxVal: max,
      minVal: min,
      avgVal: avg,
    };
  }, [data, maxPoints, height, externalMax, width, chartHeight, paddingTop]);

  return (
    <div className="glass-card border border-dark-750/30 bg-dark-900/60 p-4 rounded-xl space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-dark-400">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-black" style={{ color }}>
            {currentValue}
          </span>
          <span className="text-[9px] text-dark-500 font-bold uppercase">{unit}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {data.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-dark-600 uppercase tracking-wider font-semibold">
              Collecting data...
            </span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Gradient fill */}
            <defs>
              <linearGradient id={`grad-${label.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal guide lines */}
            {[0.25, 0.5, 0.75].map((frac) => (
              <line
                key={frac}
                x1={0}
                y1={paddingTop + chartHeight * (1 - frac)}
                x2={width}
                y2={paddingTop + chartHeight * (1 - frac)}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
            ))}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#grad-${label.replace(/\s+/g, '-')})`} />

            {/* Line */}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 3px ${color}60)` }}
            />

            {/* Current value dot */}
            {data.length >= 2 && (
              <circle
                cx={width}
                cy={
                  paddingTop +
                  chartHeight -
                  (data[data.length - 1].value / (externalMax ?? Math.max(...data.map((d) => d.value), 1))) *
                    chartHeight
                }
                r="3"
                fill={color}
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
            )}
          </svg>
        )}
      </div>

      {/* Footer stats */}
      {data.length >= 2 && (
        <div className="flex items-center justify-between text-[9px] text-dark-500 font-mono pt-1 border-t border-dark-850/40">
          <span>
            Min: <span className="text-dark-300">{minVal.toFixed(1)}</span>
          </span>
          <span>
            Avg: <span className="text-dark-300">{avgVal.toFixed(1)}</span>
          </span>
          <span>
            Max: <span className="text-dark-300">{maxVal.toFixed(1)}</span>
          </span>
        </div>
      )}
    </div>
  );
};
