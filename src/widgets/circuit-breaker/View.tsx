import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, StepForward, Timer, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Segmented } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { useElementWidth } from '@/lib/hooks';
import { Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  DEFAULT_BREAKER,
  advance,
  coolDownLeftMs,
  createBreaker,
  failuresIn,
  recentWaitMs,
  type BreakerConfig,
  type BreakerSim,
  type BreakerState,
  type Dependency,
  type Outcome,
  type Reason,
  type RequestRecord,
} from './logic';

type Box = { x: number; y: number; w: number; h: number };
type ArrowKey = 'trip' | 'cooldown' | 'success' | 'failure';
type Layout = { w: number; h: number; boxes: Record<BreakerState, Box>; arrows: Record<ArrowKey, { d: string; lx: number; ly: number }> };

/** Closed and open side by side, half-open below them. */
const WIDE: Layout = {
  w: 640,
  h: 330,
  boxes: {
    closed: { x: 40, y: 50, w: 180, h: 70 },
    open: { x: 420, y: 50, w: 180, h: 70 },
    'half-open': { x: 230, y: 240, w: 180, h: 70 },
  },
  arrows: {
    trip: { d: 'M 220 85 H 420', lx: 320, ly: 85 },
    cooldown: { d: 'M 490 120 L 370 240', lx: 430, ly: 180 },
    failure: { d: 'M 410 290 H 560 V 120', lx: 560, ly: 205 },
    success: { d: 'M 230 290 H 80 V 120', lx: 80, ly: 205 },
  },
};

/** The three states in a column, for phones. */
const NARROW: Layout = {
  w: 370,
  h: 410,
  boxes: {
    closed: { x: 120, y: 20, w: 150, h: 64 },
    open: { x: 120, y: 172, w: 150, h: 64 },
    'half-open': { x: 120, y: 324, w: 150, h: 64 },
  },
  arrows: {
    trip: { d: 'M 195 84 V 172', lx: 195, ly: 128 },
    cooldown: { d: 'M 195 236 V 324', lx: 195, ly: 280 },
    failure: { d: 'M 270 356 H 318 V 204 H 270', lx: 318, ly: 280 },
    success: { d: 'M 120 356 H 62 V 52 H 120', lx: 62, ly: 204 },
  },
};

const STATE_TITLE: Record<BreakerState, string> = { closed: 'Closed', open: 'Open', 'half-open': 'Half-open' };
const STATE_NOTE: Record<BreakerState, string> = { closed: 'calls go through', open: 'calls fail fast', 'half-open': 'one trial call' };
const ARROW_OF: Record<Reason, ArrowKey> = { tripped: 'trip', 'cool-down over': 'cooldown', 'trial succeeded': 'success', 'trial failed': 'failure' };

const DEPENDENCY_NOTE: Record<Dependency, string> = {
  healthy: 'Answers in about 80 ms.',
  failing: 'Returns an error in about 40 ms.',
  slow: 'Takes 3 seconds to answer, and the feed service gives up after its timeout.',
};

function configFrom(props: WidgetProps['props']): BreakerConfig {
  const num = (key: string, lo: number, hi: number, fallback: number) =>
    typeof props?.[key] === 'number' ? Math.max(lo, Math.min(hi, Math.round(props[key] as number))) : fallback;
  const windowSize = num('windowSize', 4, 20, DEFAULT_BREAKER.windowSize);
  return {
    ...DEFAULT_BREAKER,
    windowSize,
    threshold: Math.min(windowSize, num('threshold', 1, 20, DEFAULT_BREAKER.threshold)),
    coolDownMs: num('coolDownSec', 2, 30, DEFAULT_BREAKER.coolDownMs / 1000) * 1000,
    timeoutMs: num('timeoutMs', 200, 2500, DEFAULT_BREAKER.timeoutMs),
  };
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function reasonText(reason: Reason, c: BreakerConfig): string {
  switch (reason) {
    case 'tripped':
      return `${c.threshold} of the last ${c.windowSize} calls failed`;
    case 'cool-down over':
      return `the ${secs(c.coolDownMs)} cool-down is over`;
    case 'trial succeeded':
      return 'the trial call succeeded';
    case 'trial failed':
      return 'the trial call failed';
  }
}

function describeRequest(r: RequestRecord): { text: string; tone: 'ok' | 'bad' | 'fast' | 'wait' } {
  if (r.kind === 'fast') {
    return {
      text: r.state === 'half-open' ? 'Half-open, trial still out: failed fast, showed popular accounts' : 'Open: failed fast, showed popular accounts',
      tone: 'fast',
    };
  }
  const lead = r.kind === 'trial' ? 'Trial call' : 'Called suggestions';
  if (r.outcome === null) return { text: `${lead}: waiting for an answer`, tone: 'wait' };
  if (r.outcome === 'success') return { text: `${lead}: suggestions shown`, tone: 'ok' };
  if (r.outcome === 'error') return { text: `${lead}: error, showed popular accounts`, tone: 'bad' };
  return { text: `${lead}: timed out, showed popular accounts`, tone: 'bad' };
}

function chipWidth(text: string): number {
  return Math.round(text.length * 6.6 + 16);
}

function StateMachine({ sim, config, layout, reduced }: { sim: BreakerSim; config: BreakerConfig; layout: Layout; reduced: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const lit = new Set(sim.lastStep.map((t) => ARROW_OF[t.reason]));
  const ease = reduced ? undefined : 'stroke 240ms ease-out, opacity 240ms ease-out, fill 240ms ease-out';
  const labels: Record<ArrowKey, string> = {
    trip: `${config.threshold} of last ${config.windowSize} failed`,
    cooldown: 'cool-down over',
    success: 'trial succeeds',
    failure: 'trial fails',
  };
  const last = sim.lastStep[sim.lastStep.length - 1];
  const label = [
    'Circuit breaker state machine with three states.',
    `Closed goes to open when ${config.threshold} of the last ${config.windowSize} calls fail.`,
    'Open goes to half-open when the cool-down is over.',
    'Half-open goes to closed when the trial call succeeds, or back to open when it fails.',
    `The breaker is now ${STATE_TITLE[sim.state].toLowerCase()}.`,
    last ? `Last change: ${STATE_TITLE[last.from].toLowerCase()} to ${STATE_TITLE[last.to].toLowerCase()}, because ${reasonText(last.reason, config)}.` : '',
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 ${layout.w} ${layout.h}`}
      width="100%"
      role="img"
      aria-label={label}
      className="mx-auto block"
      style={{ maxWidth: layout === WIDE ? 680 : 420 }}
    >
      <defs>
        {(['plain', 'lit'] as const).map((k) => (
          <marker
            key={k}
            id={`${uid}-${k}`}
            viewBox="0 0 10 10"
            refX={10}
            refY={5}
            markerWidth={k === 'lit' ? 12 : 10}
            markerHeight={k === 'lit' ? 12 : 10}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={k === 'lit' ? 'var(--signal)' : 'var(--panel-line)'} />
          </marker>
        ))}
      </defs>

      {(Object.keys(layout.arrows) as ArrowKey[]).map((key) => {
        const a = layout.arrows[key];
        const on = lit.has(key);
        return (
          <path
            key={key}
            d={a.d}
            fill="none"
            stroke={on ? 'var(--signal)' : 'var(--panel-line)'}
            strokeWidth={on ? 3 : 1.5}
            strokeLinejoin="round"
            opacity={on ? 1 : 0.75}
            markerEnd={`url(#${uid}-${on ? 'lit' : 'plain'})`}
            style={{ transition: ease }}
          />
        );
      })}

      {(Object.keys(layout.arrows) as ArrowKey[]).map((key) => {
        const a = layout.arrows[key];
        const on = lit.has(key);
        const w = chipWidth(labels[key]);
        return (
          <g key={`label-${key}`}>
            <rect
              x={a.lx - w / 2}
              y={a.ly - 11}
              width={w}
              height={22}
              rx={11}
              fill="var(--panel)"
              stroke={on ? 'var(--signal)' : 'var(--panel-chip-border)'}
              strokeWidth={on ? 1.5 : 1}
              style={{ transition: ease }}
            />
            <text
              x={a.lx}
              y={a.ly + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={on ? 700 : 500}
              fill={on ? 'var(--signal)' : 'var(--panel-text)'}
              style={{ transition: ease }}
            >
              {labels[key]}
            </text>
          </g>
        );
      })}

      {(Object.keys(layout.boxes) as BreakerState[]).map((state) => {
        const b = layout.boxes[state];
        const current = sim.state === state;
        return (
          <g key={state}>
            {/* The current state is a white card; the others recede as dark cards whose text stays readable. */}
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={8}
              fill={current ? 'var(--card)' : 'var(--panel-raised)'}
              stroke={current ? 'var(--signal)' : 'var(--panel-chip-border)'}
              strokeWidth={current ? 3 : 1}
              style={{ transition: ease }}
            />
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 - 3}
              textAnchor="middle"
              fontSize={17}
              fontWeight={700}
              fill={current ? 'var(--card-ink)' : 'var(--panel-text)'}
              style={{ transition: ease }}
            >
              {STATE_TITLE[state]}
            </text>
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 + 16}
              textAnchor="middle"
              fontSize={12}
              fill={current ? 'var(--card-muted)' : 'var(--panel-muted)'}
              style={{ transition: ease }}
            >
              {STATE_NOTE[state]}
            </text>
            {current ? (
              <g>
                <rect x={b.x + b.w - 48} y={b.y - 12} width={44} height={22} rx={11} fill="var(--signal)" />
                <text x={b.x + b.w - 26} y={b.y + 3.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="var(--on-signal)">
                  now
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

const SLOT_STYLE: Record<Outcome, string> = {
  success: 'border-panel-success text-panel-success',
  error: 'border-panel-alert text-panel-alert',
  timeout: 'border-panel-alert text-panel-alert',
};

function RollingWindow({ results, config }: { results: Outcome[]; config: BreakerConfig }) {
  const slots: (Outcome | null)[] = [...results, ...Array.from({ length: Math.max(0, config.windowSize - results.length) }, () => null)];
  const failed = failuresIn(results);
  const counts = `${results.filter((o) => o === 'success').length} succeeded, ${results.filter((o) => o === 'error').length} errors, ${results.filter((o) => o === 'timeout').length} timeouts`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-small font-semibold text-panel-text">Rolling window: the last {config.windowSize} results while closed, oldest first</span>
        <span className="tabular text-small text-panel-muted">
          {failed} failed; trips at {config.threshold}
        </span>
      </div>
      <ol className="flex flex-wrap gap-1.5" aria-label={results.length ? `Rolling window: ${counts}.` : 'Rolling window: empty.'}>
        {slots.map((o, i) => (
          <li
            key={i}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-[4px] border',
              o === null ? 'border-dashed border-panel-muted opacity-50' : SLOT_STYLE[o],
            )}
            aria-hidden
          >
            {o === 'success' ? (
              <Check className="h-4 w-4" strokeWidth={1.5} />
            ) : o === 'error' ? (
              <X className="h-4 w-4" strokeWidth={1.5} />
            ) : o === 'timeout' ? (
              <Timer className="h-4 w-4" strokeWidth={1.5} />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-small text-panel-muted">
        <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-panel-success" strokeWidth={1.5} aria-hidden />
        success
        <X className="mr-1 ml-3 inline h-3.5 w-3.5 align-[-2px] text-panel-alert" strokeWidth={1.5} aria-hidden />
        error
        <Timer className="mr-1 ml-3 inline h-3.5 w-3.5 align-[-2px] text-panel-alert" strokeWidth={1.5} aria-hidden />
        timeout
      </p>
    </div>
  );
}

export default function CircuitBreakerWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const config = useMemo(() => configFrom(props), [props]);
  const [sim, setSim] = useState<BreakerSim>(() => createBreaker());
  const [dependency, setDependency] = useState<Dependency>('healthy');
  const [playing, setPlaying] = useState(false);
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const layout = width >= 560 ? WIDE : NARROW;

  const depRef = useRef<Dependency>(dependency);
  useEffect(() => {
    depRef.current = dependency;
  }, [dependency]);

  const step = useCallback(() => setSim((s) => advance(s, depRef.current, config)), [config]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(step, 800);
    return () => window.clearInterval(id);
  }, [playing, step]);

  const reset = () => {
    setPlaying(false);
    setSim(createBreaker());
  };

  const lastRequest = sim.requests[sim.requests.length - 1];
  const left = coolDownLeftMs(sim, config);
  const avgWait = recentWaitMs(sim, 10);
  const recent = sim.requests.slice(-8).reverse();

  const status =
    sim.state === 'closed'
      ? `Closed: every request calls the suggestions service. ${failuresIn(sim.window)} of the last ${sim.window.length || config.windowSize} results failed; ${config.threshold} failures trip the breaker.`
      : sim.state === 'open'
        ? left && left > 0
          ? `Open: requests fail fast and get the fallback, popular accounts, with no call and no wait. The first request after ${secs(left)} becomes the trial.`
          : 'Open: the cool-down is over, so the next request becomes the trial call.'
        : sim.trialInFlight
          ? 'Half-open: the trial call is out. Other requests fail fast until it answers.'
          : 'Half-open: the next request is the trial call.';

  const changes = sim.lastStep.map((t) => `${STATE_TITLE[t.from]} to ${STATE_TITLE[t.to].toLowerCase()}: ${reasonText(t.reason, config)}.`);

  return (
    <div className="flex flex-col gap-5">
      <div ref={boxRef} className="on-panel blueprint-grid flex flex-col gap-5 rounded-panel p-3 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-small font-semibold text-panel-text">The feed service calls the suggestions service through a circuit breaker</span>
          <span className="tabular text-small text-panel-muted">{lastRequest ? `request ${formatInt(lastRequest.id)} at ${secs(lastRequest.atMs)}` : 'no requests yet'}</span>
        </div>

        <StateMachine sim={sim} config={config} layout={layout} reduced={reduced} />

        {sim.state === 'open' && left !== null ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-raised" aria-hidden>
              <div
                className="h-full rounded-full bg-signal"
                style={{ width: `${Math.round(100 * (1 - left / config.coolDownMs))}%`, transition: reduced ? undefined : 'width 240ms ease-out' }}
              />
            </div>
            <span className="tabular text-small text-panel-muted">
              Cool-down: {secs(config.coolDownMs - left)} of {secs(config.coolDownMs)}
            </span>
          </div>
        ) : null}

        <RollingWindow results={sim.window} config={config} />

        <div aria-live="polite" className="flex flex-col gap-1">
          <p className="text-ui text-panel-text">{status}</p>
          {changes.length ? <p className="text-ui font-semibold text-signal">Just now: {changes.join(' Then ')}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Requests" value={formatInt(sim.totals.requests)} note="one every half second" />
        <Stat label="Calls to suggestions" value={formatInt(sim.totals.calls)} note={`${formatInt(sim.totals.fast)} failed fast instead`} />
        <Stat label="Fallbacks shown" value={formatInt(sim.totals.fallbacks)} note="popular accounts" tone={sim.totals.fallbacks > 0 ? 'alert' : 'ink'} />
        <Stat
          label="Average wait"
          value={avgWait === null ? '–' : `${formatInt(avgWait)} ms`}
          note="last 10 answered requests"
          tone={avgWait !== null && avgWait >= 500 ? 'alert' : 'ink'}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">The suggestions service is</span>
          <Segmented<Dependency>
            label="The suggestions service is"
            value={dependency}
            onChange={setDependency}
            options={[
              { value: 'healthy', label: 'Healthy' },
              { value: 'failing', label: 'Failing' },
              { value: 'slow', label: 'Slow' },
            ]}
            className="self-start"
          />
          <p className="text-small text-graphite">
            {DEPENDENCY_NOTE[dependency]} The timeout is {formatInt(config.timeoutMs)} ms, and the cool-down {secs(config.coolDownMs)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={step}>
            <StepForward className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Send the next request
          </Button>
          <Button onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
            {playing ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Start over
          </Button>
        </div>
        {recent.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-ui font-semibold text-ink">Recent requests, newest first</p>
            <ul className="flex flex-col divide-y divide-rule">
              {recent.map((r) => {
                const d = describeRequest(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                    <span className="text-ui text-ink">
                      <span className="tabular text-graphite">
                        Request {formatInt(r.id)} at {secs(r.atMs)}:
                      </span>{' '}
                      <span className={cn(d.tone === 'bad' && 'text-alert', d.tone === 'ok' && 'text-success')}>{d.text}</span>
                    </span>
                    <span className="tabular text-small text-graphite">
                      {r.answeredAtMs === null ? 'waiting' : `${formatInt(r.answeredAtMs - r.atMs)} ms`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-ui text-graphite">Send a few requests while the service is healthy, then make it fail or slow down.</p>
        )}
      </div>
    </div>
  );
}
