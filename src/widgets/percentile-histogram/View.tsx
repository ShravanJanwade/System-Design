import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Segmented, Slider } from '@/design/primitives';
import { measureText } from '@/diagram/text';
import { useElementWidth } from '@/lib/hooks';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import {
  BIN_MS,
  MAX_CALLS,
  MAX_MS,
  MAX_PERCENTILE,
  MIN_PERCENTILE,
  PERCENTILE_STEPS,
  SAMPLE_COUNT,
  formatLatency,
  formatShare,
  gappedLine,
  generateLatencies,
  histogram,
  nearestStepIndex,
  pageMean,
  pageQuantile,
  percentileAt,
  percentileLabel,
  slowPageChance,
  stepPercentile,
  type Box,
} from './logic';

type Shown = 'call' | 'page';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Histogram of 10,000 call latencies with a draggable percentile marker, direct labels for
 * the mean, p50, p95 and p99, and a fan-out control that turns calls into pages.
 */
export default function PercentileHistogram({ props }: WidgetProps) {
  const latencies = useMemo(() => generateLatencies(), []);
  const [p, setP] = useState(() =>
    clamp(typeof props?.percentile === 'number' ? props.percentile : 99, MIN_PERCENTILE, MAX_PERCENTILE),
  );
  const [calls, setCalls] = useState(() => clamp(Math.round(typeof props?.calls === 'number' ? props.calls : 10), 1, MAX_CALLS));
  const [shown, setShown] = useState<Shown>(props?.view === 'page' ? 'page' : 'call');
  const [measureRef, width] = useElementWidth<HTMLDivElement>();

  const k = shown === 'page' ? calls : 1;
  const units = shown === 'page' ? 'pages' : 'calls';
  const stats = useMemo(
    () => ({
      mean: pageMean(latencies, k),
      p50: pageQuantile(latencies, 0.5, k),
      p95: pageQuantile(latencies, 0.95, k),
      p99: pageQuantile(latencies, 0.99, k),
      bins: histogram(latencies, k),
    }),
    [latencies, k],
  );
  const markerValue = pageQuantile(latencies, p / 100, k);
  const slower = formatShare(1 - p / 100);

  const summary =
    `Histogram of ${SAMPLE_COUNT.toLocaleString('en-US')} ${shown === 'page' ? `page latencies, each page waiting on ${calls} calls` : 'backend call latencies'}. ` +
    `Median ${formatLatency(stats.p50)}, mean ${formatLatency(stats.mean)}, p95 ${formatLatency(stats.p95)}, p99 ${formatLatency(stats.p99)}.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-ui font-semibold text-ink" id="pct-shown-label">
          Show the latency of
        </span>
        <Segmented<Shown>
          label="Show the latency of"
          value={shown}
          onChange={setShown}
          options={[
            { value: 'call', label: 'One backend call' },
            { value: 'page', label: calls === 1 ? 'A page of 1 call' : `A page of ${calls} calls` },
          ]}
          className="self-start"
        />
      </div>

      <div className="on-panel blueprint-grid rounded-panel p-3 sm:p-4">
        <div ref={measureRef} className="w-full">
          {width > 0 ? (
            <HistogramSvg
              width={width}
              bins={stats.bins}
              markers={[
                { key: 'mean', label: 'Mean', value: stats.mean, dashed: true },
                { key: 'p50', label: 'p50', value: stats.p50 },
                { key: 'p95', label: 'p95', value: stats.p95 },
                { key: 'p99', label: 'p99', value: stats.p99 },
              ]}
              p={p}
              markerValue={markerValue}
              units={units}
              summary={summary}
              onPick={(ms) => setP(percentileAt(latencies, ms, k))}
              onStep={setP}
            />
          ) : (
            <div style={{ height: 250 }} />
          )}
        </div>
      </div>
      <p className="measure text-small text-graphite">
        Bar heights use a log scale: each gridline is ten times the one below, so the rare slow {units} stay visible. Drag the yellow
        marker, or focus it and use the arrow keys.
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Marker" value={formatLatency(markerValue)} note={`${percentileLabel(p)}: ${slower} of ${units} are slower`} />
        <Stat label="Mean" value={formatLatency(stats.mean)} note="What an average hides" />
        <Stat label="Median (p50)" value={formatLatency(stats.p50)} note={`Half of ${units} are faster`} />
        <Stat label="p99" value={formatLatency(stats.p99)} note={`${Math.round(stats.p99 / stats.mean)} times the mean`} tone="alert" />
      </div>

      <ControlPanel>
        <Slider
          id="pct-marker"
          label="Marker"
          value={nearestStepIndex(p)}
          min={0}
          max={PERCENTILE_STEPS.length - 1}
          onChange={(i) => setP(PERCENTILE_STEPS[i] ?? 99)}
          format={(i) => (i === nearestStepIndex(p) ? percentileLabel(p) : percentileLabel(PERCENTILE_STEPS[i] ?? 99))}
          hint="Moves the yellow marker to a percentile."
        />
        <Slider
          id="pct-calls"
          label="Backend calls per page"
          value={calls}
          min={1}
          max={MAX_CALLS}
          onChange={setCalls}
          format={(v) => (v === 1 ? '1 call' : `${v} calls`)}
          hint="Calls run in parallel, and the page waits for the slowest one."
        />
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3 sm:col-span-2">
          <Stat
            label="Pages that hit a call slower than p99"
            value={formatShare(slowPageChance(calls))}
            note={`1 − 0.99 to the power ${calls}`}
            tone={slowPageChance(calls) >= 0.05 ? 'alert' : 'ink'}
          />
          <Stat label="Median page" value={formatLatency(pageQuantile(latencies, 0.5, calls))} note="Half of pages are slower" />
          <Stat label="Slowest 1% of pages" value={formatLatency(pageQuantile(latencies, 0.99, calls))} note="The page’s p99" />
        </div>
      </ControlPanel>
    </div>
  );
}

type Marker = { key: string; label: string; value: number; dashed?: boolean };

const ROW = 17;
const LABEL_FONT = 12;

/** Text baseline of a label row: row 0 holds the draggable marker, rows 1 to 3 the fixed markers. */
const baselineOf = (row: number) => 4 + row * ROW + 12;

function HistogramSvg({
  width,
  bins,
  markers,
  p,
  markerValue,
  units,
  summary,
  onPick,
  onStep,
}: {
  width: number;
  bins: number[];
  markers: Marker[];
  p: number;
  markerValue: number;
  units: string;
  summary: string;
  onPick: (ms: number) => void;
  onStep: (p: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focused, setFocused] = useState(false);
  const narrow = width < 520;
  const left = 44;
  const right = 14;
  const plotW = Math.max(120, width - left - right);
  const plotTop = 4 + 4 * ROW + 6;
  const plotH = narrow ? 130 : 160;
  const plotBottom = plotTop + plotH;
  const height = plotBottom + 28;

  const sx = (ms: number) => left + (Math.max(0, Math.min(ms, MAX_MS)) / MAX_MS) * plotW;
  const maxCount = Math.max(1, ...bins);
  const logMax = Math.log10(1 + maxCount);
  const sy = (count: number) => plotBottom - (Math.log10(1 + Math.max(0, count)) / logMax) * plotH;
  const binW = (BIN_MS / MAX_MS) * plotW;
  const grid = [1, 10, 100, 1000, 10000].filter((c) => c <= maxCount);
  const ticks = [0, 500, 1000, 1500, 2000];

  // Direct labels: the marker on row 0, the fixed markers on rows 1 to 3 without overlaps.
  const place = (x: number, text: string) => {
    const w = measureText(text, LABEL_FONT, 'semibold');
    const fitsRight = x + 4 + w <= left + plotW;
    return fitsRight
      ? { x: x + 4, anchor: 'start' as const, x0: x, x1: x + 4 + w, t0: x + 4, t1: x + 4 + w }
      : { x: x - 4, anchor: 'end' as const, x0: x - 4 - w, x1: x, t0: x - 4 - w, t1: x - 4 };
  };
  const rows: { x0: number; x1: number }[][] = [[], [], []];
  const placed = [...markers]
    .sort((a, b) => a.value - b.value)
    .map((m) => {
      const text = `${m.label} ${formatLatency(m.value)}`;
      const at = place(sx(m.value), text);
      let row = rows.findIndex((r) => r.every((o) => at.x1 + 6 <= o.x0 || at.x0 >= o.x1 + 6));
      if (row < 0) row = rows.length - 1;
      rows[row]!.push(at);
      return { ...m, text, at, row: row + 1 };
    });
  const labelBoxes: Box[] = placed.map((m) => ({ x0: m.at.t0, x1: m.at.t1, y0: baselineOf(m.row) - 11, y1: baselineOf(m.row) + 3 }));
  const mx = sx(markerValue);
  const markerText = `${percentileLabel(p)} ${formatLatency(markerValue)}`;
  const markerAt = place(mx, markerText);

  const pick = (e: PointerEvent<SVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    onPick(((e.clientX - box.left - left) / plotW) * MAX_MS);
  };
  const onPointerDown = (e: PointerEvent<SVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(e);
  };
  const onPointerMove = (e: PointerEvent<SVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepPercentile(p, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepPercentile(p, -1);
    else if (e.key === 'PageUp') next = stepPercentile(stepPercentile(stepPercentile(p, 1), 1), 1);
    else if (e.key === 'PageDown') next = stepPercentile(stepPercentile(stepPercentile(p, -1), -1), -1);
    else if (e.key === 'Home') next = MIN_PERCENTILE;
    else if (e.key === 'End') next = MAX_PERCENTILE;
    if (next !== null) {
      e.preventDefault();
      onStep(next);
    }
  };

  return (
    <svg ref={svgRef} width={width} height={height} role="group" aria-label={summary} className="block select-none">
      {/* Count gridlines (log scale) */}
      {grid.map((c) => (
        <g key={c}>
          <line x1={left} x2={left + plotW} y1={sy(c)} y2={sy(c)} stroke="var(--panel-line)" strokeOpacity={0.18} strokeDasharray="2 4" />
          <text x={left - 6} y={sy(c) + 4} textAnchor="end" fontSize={11} fill="var(--panel-muted)" className="tabular">
            {c.toLocaleString('en-US')}
          </text>
        </g>
      ))}
      <line x1={left} x2={left + plotW} y1={plotBottom} y2={plotBottom} stroke="var(--panel-line)" strokeWidth={1} />
      {ticks.map((t) => (
        <text key={t} x={sx(t)} y={plotBottom + 18} textAnchor="middle" fontSize={11} fill="var(--panel-muted)" className="tabular">
          {t === 0 ? '0' : `${t / 1000} s`}
        </text>
      ))}

      {/* Bars: anything slower than the marker is highlighted */}
      {bins.map((c, i) =>
        c < 0.05 ? null : (
          <rect
            key={i}
            x={sx(i * BIN_MS) + (binW >= 4 ? 0.5 : 0)}
            y={sy(c)}
            width={Math.max(1, binW - (binW >= 4 ? 1 : 0))}
            height={plotBottom - sy(c)}
            fill={(i + 0.5) * BIN_MS > markerValue ? 'var(--signal)' : 'var(--panel-line)'}
            fillOpacity={(i + 0.5) * BIN_MS > markerValue ? 1 : 0.85}
          />
        ),
      )}

      {/* Fixed markers with direct labels */}
      {placed.map((m) => {
        const x = sx(m.value);
        const baseline = baselineOf(m.row);
        return (
          <g key={m.key} aria-hidden>
            {gappedLine(x, baseline + 4, plotBottom, labelBoxes).map(([a, b]) => (
              <line
                key={a}
                x1={x}
                x2={x}
                y1={a}
                y2={b}
                stroke="var(--panel-line)"
                strokeWidth={1.25}
                strokeDasharray={m.dashed ? '4 3' : undefined}
                strokeOpacity={0.9}
              />
            ))}
            <text x={m.at.x} y={baseline} textAnchor={m.at.anchor} fontSize={LABEL_FONT} fontWeight={600} fill="var(--panel-text)" className="tabular">
              {m.text}
            </text>
          </g>
        );
      })}

      {/* Drag surface */}
      <rect
        x={left}
        y={plotTop - 8}
        width={plotW}
        height={plotH + 16}
        fill="transparent"
        style={{ cursor: 'ew-resize', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      />

      {/* The draggable percentile marker */}
      <g
        role="slider"
        tabIndex={0}
        aria-label="Percentile marker"
        aria-orientation="horizontal"
        aria-valuemin={MIN_PERCENTILE}
        aria-valuemax={MAX_PERCENTILE}
        aria-valuenow={p}
        aria-valuetext={`${percentileLabel(p)}: ${formatLatency(markerValue)}. ${formatShare(1 - p / 100)} of ${units} are slower.`}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{ cursor: 'ew-resize', touchAction: 'pan-y', outline: 'none' }}
      >
        <rect x={mx - 10} y={4} width={20} height={plotBottom - 4 + 10} fill="transparent" />
        {gappedLine(mx, 4 + 16, plotBottom, labelBoxes).map(([a, b]) => (
          <line key={a} x1={mx} x2={mx} y1={a} y2={b} stroke="var(--signal)" strokeWidth={2} />
        ))}
        <text x={markerAt.x} y={4 + 12} textAnchor={markerAt.anchor} fontSize={LABEL_FONT} fontWeight={700} fill="var(--signal)" className="tabular">
          {markerText}
        </text>
        {focused ? <circle cx={mx} cy={plotBottom} r={11} fill="none" stroke="var(--signal)" strokeWidth={2} /> : null}
        <circle cx={mx} cy={plotBottom} r={7} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
      </g>
    </svg>
  );
}
