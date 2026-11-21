import { useElementWidth } from '@/lib/hooks';

export type Series = {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  tone?: 'blueprint' | 'alert' | 'graphite';
};

type Props = {
  title: string;
  series: Series[];
  xMax: number;
  yMax: number;
  height?: number;
  xTicks: number[];
  yTicks: number[];
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  /** Horizontal reference lines, labeled directly. */
  thresholds?: { y: number; label: string }[];
  /** Vertical markers along the top, such as stampede events. */
  markers?: { x: number; label: string }[];
  /** Plain-language summary for screen readers. */
  summary: string;
};

const toneColor = { blueprint: 'var(--blueprint)', alert: 'var(--alert)', graphite: 'var(--graphite)' };

/** Minimal hand-built line chart: hairline axes, direct labels, no legend. */
export function LineChart({ title, series, xMax, yMax, height = 180, xTicks, yTicks, formatX, formatY, thresholds = [], markers = [], summary }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const left = 44;
  const right = 12;
  const top = markers.length ? 22 : 12;
  const bottom = 26;
  const w = Math.max(0, width - left - right);
  const h = height - top - bottom;
  const sx = (x: number) => left + (x / xMax) * w;
  const sy = (y: number) => top + h - (Math.min(y, yMax) / yMax) * h;

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-ui font-semibold text-ink">{title}</figcaption>
      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`${title}. ${summary}`} className="block overflow-visible">
            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line x1={left} x2={left + w} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={left - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} fill="var(--graphite)" className="tabular">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={`x${t}`} x={sx(t)} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--graphite)" className="tabular">
                {formatX(t)}
              </text>
            ))}
            {thresholds.map((t) => (
              <g key={`t${t.y}`}>
                <line x1={left} x2={left + w} y1={sy(t.y)} y2={sy(t.y)} stroke="var(--alert)" strokeWidth={1} strokeDasharray="5 4" />
                <text
                  x={left + w}
                  y={sy(t.y) - 6}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--alert)"
                  stroke="var(--paper)"
                  strokeWidth={5}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {t.label}
                </text>
              </g>
            ))}
            {markers.map((m, i) => (
              <g key={`m${i}`} transform={`translate(${sx(m.x)} ${top - 10})`}>
                <title>{m.label}</title>
                <path d="M-4.5 -4 L4.5 -4 L0 3 Z" fill="var(--alert)" />
              </g>
            ))}
            {series.map((s) => {
              if (s.points.length === 0) return null;
              const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
              const last = s.points[s.points.length - 1]!;
              return (
                <g key={s.id}>
                  <path d={d} fill="none" stroke={toneColor[s.tone ?? 'blueprint']} strokeWidth={1.75} strokeLinejoin="round" />
                  {series.length > 1 ? (
                    <text x={sx(last.x) - 4} y={sy(last.y) - 6} textAnchor="end" fontSize={12} fontWeight={600} fill={toneColor[s.tone ?? 'blueprint']}>
                      {s.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height }} />
        )}
      </div>
    </figure>
  );
}
