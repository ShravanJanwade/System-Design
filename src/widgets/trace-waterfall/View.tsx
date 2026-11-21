import { useMemo, useState } from 'react';
import { Segmented, Slider } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  DELAY_RANGE,
  DEPENDENCIES,
  FAULT_KINDS,
  RETRY_BACKOFF_MS,
  TIMEOUT_RANGE,
  axisTicks,
  buildTrace,
  describeTrace,
  formatMs,
  isDependencyId,
  isFaultKind,
  rowStatus,
  rowSummary,
  spanName,
  topCriticalSelf,
  type DependencyId,
  type FaultKind,
  type SpanKind,
  type SpanRow,
  type Trace,
} from './logic';

const KIND_COLOR: Record<SpanKind, string> = {
  gateway: 'var(--type-edge)',
  service: 'var(--type-compute)',
  cache: 'var(--type-cache)',
  database: 'var(--type-database)',
};

/** Label column and time column. On phones the label sits above its bar. */
const COLS = 'grid grid-cols-1 gap-x-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]';

type Range = { min: number; max: number; step: number; initial: number };

function startValue(v: unknown, r: Range): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return r.initial;
  return Math.max(r.min, Math.min(r.max, Math.round(v / r.step) * r.step));
}

function signedMs(ms: number): string {
  return `${ms > 0 ? '+' : '−'}${formatMs(Math.abs(ms))}`;
}

/**
 * One Snapgram feed request as a trace waterfall. The learner picks a span to read its timing,
 * slows one dependency down or makes it lose a reply and retry, and watches the total latency
 * and the critical path change. Timings are illustrative.
 */
export default function TraceWaterfall({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const [target, setTarget] = useState<DependencyId>(() => (isDependencyId(props?.target) ? props.target : 'suggestions'));
  const [kind, setKind] = useState<FaultKind>(() => (isFaultKind(props?.fault) ? props.fault : 'none'));
  const [delay, setDelay] = useState(() => startValue(props?.delay, DELAY_RANGE));
  const [timeoutMs, setTimeoutMs] = useState(() => startValue(props?.timeout, TIMEOUT_RANGE));
  const [picked, setPicked] = useState<string>(() => (kind !== 'none' ? target : 'feed'));

  const healthy = useMemo(() => buildTrace(), []);
  const trace = useMemo(
    () => buildTrace({ kind, target, ms: kind === 'retry' ? timeoutMs : kind === 'slow' ? delay : 0 }),
    [kind, target, delay, timeoutMs],
  );
  const selected = trace.rows.find((r) => r.key === picked) ?? trace.rows.find((r) => r.key === picked.split(':')[0]) ?? trace.rows[0]!;
  const delta = trace.total - healthy.total;
  const top = topCriticalSelf(trace);

  const chooseTarget = (id: DependencyId) => {
    setTarget(id);
    if (kind !== 'none') setPicked(id);
  };
  const chooseKind = (k: FaultKind) => {
    setKind(k);
    if (k !== 'none') setPicked(target);
  };

  return (
    <div className="flex flex-col gap-5">
      <Waterfall trace={trace} healthyTotal={healthy.total} selectedKey={selected.key} onSelect={setPicked} reduced={reduced} />

      <div className="measure flex flex-col gap-1 text-small text-graphite">
        <p>
          <span className="font-semibold text-ink">Critical path:</span> {trace.critical.map(spanName).join(' → ')}.
        </p>
        <p>
          Yellow bars are on the critical path; white bars are not. A dashed red outline is an attempt that timed out, and the dashed outline after the
          selected bar is its slack.{delta !== 0 ? ' The dashed line marks the healthy total.' : ''} Select a span to read its timing. Timings are
          illustrative.
        </p>
      </div>

      <SpanDetails row={selected} />

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Call to break</span>
          <Segmented<DependencyId>
            label="Call to break"
            value={target}
            onChange={chooseTarget}
            options={DEPENDENCIES.map((d) => ({ value: d.id, label: d.label }))}
            size="sm"
            className="flex-wrap self-start"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">What goes wrong</span>
          <Segmented<FaultKind>
            label="What goes wrong"
            value={kind}
            onChange={chooseKind}
            options={FAULT_KINDS.map((f) => ({ value: f.id, label: f.label }))}
            size="sm"
            className="flex-wrap self-start"
          />
        </div>
        {kind === 'slow' ? (
          <Slider
            id="trace-delay"
            label="Extra delay"
            value={delay}
            min={DELAY_RANGE.min}
            max={DELAY_RANGE.max}
            step={DELAY_RANGE.step}
            onChange={setDelay}
            format={(v) => `+${v} ms`}
            hint={`Added to every reply from the ${spanName(target).toLowerCase()}.`}
          />
        ) : kind === 'retry' ? (
          <Slider
            id="trace-timeout"
            label="Timeout before the retry"
            value={timeoutMs}
            min={TIMEOUT_RANGE.min}
            max={TIMEOUT_RANGE.max}
            step={TIMEOUT_RANGE.step}
            onChange={setTimeoutMs}
            format={(v) => `${v} ms`}
            hint={`The first reply never arrives. The caller waits this long, pauses ${RETRY_BACKOFF_MS} ms, then tries again, and the second try answers normally.`}
          />
        ) : (
          <p className="self-center text-small text-graphite">Every call is healthy. Choose what goes wrong to change the trace.</p>
        )}
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:col-span-2">
          <Stat
            label="Total latency"
            value={formatMs(trace.total)}
            note={delta === 0 ? 'Same as the healthy request' : `${signedMs(delta)} vs. healthy (${formatMs(healthy.total)})`}
            tone={delta > 0 ? 'alert' : 'ink'}
          />
          <Stat label="Most own time on the critical path" value={top.service} note={`${formatMs(top.self)} of its own work`} />
        </div>
      </ControlPanel>
    </div>
  );
}

function Waterfall({
  trace,
  healthyTotal,
  selectedKey,
  onSelect,
  reduced,
}: {
  trace: Trace;
  healthyTotal: number;
  selectedKey: string;
  onSelect: (key: string) => void;
  reduced: boolean;
}) {
  const { domain, ticks } = axisTicks(Math.max(trace.total, healthyTotal));
  const pct = (ms: number) => (ms / domain) * 100;
  const motion = reduced ? undefined : 'left 240ms ease-out, width 240ms ease-out';
  const delta = trace.total - healthyTotal;

  return (
    <div role="group" aria-label={describeTrace(trace)} className="on-panel blueprint-grid flex flex-col gap-2 overflow-hidden rounded-panel p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1.5">
        <p className="text-ui font-semibold text-panel-text">One feed request, GET /feed</p>
        <p className="tabular text-ui text-panel-text">
          Total <span className="font-semibold">{formatMs(trace.total)}</span>
          {delta !== 0 ? <span className="text-panel-muted"> ({signedMs(delta)} vs. healthy)</span> : null}
        </p>
      </div>

      <div className="relative">
        {/* Gridlines, and the healthy total when it differs */}
        <div aria-hidden className={cn('pointer-events-none absolute inset-0 px-1.5', COLS)}>
          <div className="hidden sm:block" />
          <div className="relative">
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 bottom-0 w-px" style={{ left: `${pct(t)}%`, background: 'var(--panel-grid-major)' }} />
            ))}
            {delta !== 0 ? (
              <span className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${pct(healthyTotal)}%`, borderColor: 'var(--panel-muted)' }} />
            ) : null}
          </div>
        </div>

        {/* Time axis */}
        <div aria-hidden className={cn('relative px-1.5 pb-1', COLS)}>
          <div className="hidden sm:block" />
          <div className="relative h-4">
            {ticks.map((t, i) => (
              <span
                key={t}
                className="tabular absolute top-0 text-[11px] leading-4 whitespace-nowrap text-panel-muted"
                style={{ left: `${pct(t)}%`, transform: i === 0 ? undefined : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
              >
                {i === ticks.length - 1 ? `${t} ms` : t}
              </span>
            ))}
          </div>
        </div>

        <ul className="relative flex flex-col gap-0.5" aria-label="Spans, in the order they started">
          {trace.rows.map((r) => (
            <SpanBar key={r.key} row={r} pct={pct} selected={r.key === selectedKey} onSelect={onSelect} motion={motion} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SpanBar({
  row,
  pct,
  selected,
  onSelect,
  motion,
}: {
  row: SpanRow;
  pct: (ms: number) => number;
  selected: boolean;
  onSelect: (key: string) => void;
  motion: string | undefined;
}) {
  const timedOut = row.status === 'timed-out';
  const left = pct(row.start);
  const end = pct(row.end);
  const showSlack = selected && row.slack > 0 && !timedOut;
  const labelAt = showSlack ? pct(row.end + row.slack) : end;
  const text = timedOut ? `${formatMs(row.duration)}, timed out` : formatMs(row.duration);
  const room = timedOut ? 36 : 16;
  const placement = labelAt <= 100 - room ? 'after' : left >= room ? 'before' : 'inside';
  const labelStyle =
    placement === 'after'
      ? { left: `calc(${labelAt}% + 6px)`, color: 'var(--panel-text)' }
      : placement === 'before'
        ? { right: `calc(${100 - left}% + 6px)`, color: 'var(--panel-text)' }
        : { right: `calc(${100 - end}% + 6px)`, color: timedOut ? 'var(--panel-text)' : row.critical ? 'var(--on-signal)' : 'var(--card-ink)' };

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={rowSummary(row)}
        onClick={() => onSelect(row.key)}
        className={cn(COLS, 'w-full items-center gap-y-0.5 rounded-control px-1.5 py-1 text-left transition-colors', selected ? 'bg-panel-raised' : 'hover:bg-panel-raised')}
      >
        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: row.depth * 12 }}>
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: KIND_COLOR[row.kind] }} />
          <span className="truncate text-small font-semibold text-panel-text">{row.service}</span>
          {row.attempt ? <span className="shrink-0 text-small text-panel-muted">try {row.attempt}</span> : null}
        </span>
        <span aria-hidden className="relative block h-5">
          <span
            className={cn('absolute top-1 bottom-1 rounded-[3px]', timedOut && 'border-[1.5px] border-dashed')}
            style={{
              left: `${left}%`,
              width: `max(${pct(row.duration)}%, 3px)`,
              background: timedOut ? 'transparent' : row.critical ? 'var(--signal)' : 'var(--card)',
              borderColor: timedOut ? 'var(--panel-alert)' : undefined,
              outline: selected ? '2px solid var(--panel-text)' : undefined,
              outlineOffset: selected ? 1 : undefined,
              transition: motion,
            }}
          />
          {showSlack ? (
            <span
              className="absolute top-1 bottom-1 rounded-[3px] border border-dashed"
              style={{ left: `${end}%`, width: `${pct(row.slack)}%`, borderColor: 'var(--panel-muted)', transition: motion }}
            />
          ) : null}
          <span className="tabular absolute top-0 text-[11px] leading-5 font-semibold whitespace-nowrap" style={labelStyle}>
            {text}
          </span>
        </span>
      </button>
    </li>
  );
}

function SpanDetails({ row }: { row: SpanRow }) {
  const waiting = row.duration - row.self;
  return (
    <section aria-label="Selected span" className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h4 className="text-ui-lg font-semibold text-ink">
          {row.service}
          <span className="font-normal text-graphite">
            , {row.attempt ? `${row.operation}, attempt ${row.attempt}` : row.operation}
          </span>
        </h4>
        <p className="text-small text-graphite" aria-live="polite">
          {rowStatus(row)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Starts at" value={formatMs(row.start)} />
        <Stat label="Duration" value={formatMs(row.duration)} tone={row.status === 'timed-out' ? 'alert' : 'ink'} />
        <Stat label="Own time" value={formatMs(row.self)} note={waiting > 0 ? `${formatMs(waiting)} waiting on calls` : 'No calls of its own'} />
        <Stat
          label="Slack"
          value={formatMs(row.slack)}
          note={row.critical ? 'On the critical path' : 'Off the critical path'}
          tone={row.critical ? 'ink' : 'success'}
        />
      </div>
      <p className="measure text-ui text-ink">{row.note}</p>
    </section>
  );
}
