import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { LineChart } from '../shared/LineChart';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  ALGORITHMS,
  ALGORITHM_NAME,
  DEFAULT_CONFIG,
  PATTERNS,
  burstsOf,
  edgeBoundaries,
  limiterDiagram,
  runRateSim,
  windowSec,
  type Algorithm,
  type Pattern,
  type RateSimConfig,
} from './logic';

type UiConfig = Pick<RateSimConfig, 'algorithm' | 'bucket' | 'refill' | 'pattern' | 'rate' | 'burst'>;

const X_TICKS = [0, 15, 30, 45, 60];

const ALGORITHM_HINT: Record<Algorithm, string> = {
  'token-bucket': 'Each request spends a token. The bucket refills at a steady rate, up to its size, and starts full.',
  'leaky-bucket': 'Requests wait in a line that empties at a steady rate. When the line is full, new requests are rejected.',
  'fixed-window': 'Counts requests in back-to-back windows and starts again from zero at each boundary.',
  'sliding-window': 'Counts the requests allowed in the last full window, measured back from each new request.',
};

const PATTERN_LABEL: Record<Pattern, string> = { steady: 'Steady', bursts: 'Bursts', edges: 'Edge bursts' };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const num = (key: string, fallback: number) => (typeof preset?.[key] === 'number' ? (preset[key] as number) : fallback);
  const algorithm = ALGORITHMS.find((a) => a === preset?.algorithm) ?? DEFAULT_CONFIG.algorithm;
  const pattern = PATTERNS.find((p) => p === preset?.pattern) ?? DEFAULT_CONFIG.pattern;
  return {
    algorithm,
    pattern,
    bucket: clamp(num('bucket', DEFAULT_CONFIG.bucket), 2, 40),
    refill: clamp(num('refill', DEFAULT_CONFIG.refill), 1, 10),
    rate: clamp(num('rate', DEFAULT_CONFIG.rate), 0, 20),
    burst: clamp(num('burst', DEFAULT_CONFIG.burst), 0, 60),
  };
}

/** A round axis maximum just above the data. */
function niceMax(v: number): number {
  for (const m of [5, 10, 20, 30, 40, 60, 80, 100, 150, 200]) if (v <= m * 0.95) return m;
  return Math.ceil(v / 100) * 100;
}

function seconds(v: number): string {
  const r = Math.round(v * 100) / 100;
  return `${Number.isInteger(r) ? r : r.toFixed(r * 10 === Math.round(r * 10) ? 1 : 2)} s`;
}

function levelTitle(a: Algorithm, w: number): string {
  switch (a) {
    case 'token-bucket':
      return 'Inside the limiter: tokens in the bucket';
    case 'leaky-bucket':
      return 'Inside the limiter: requests waiting in the bucket';
    case 'fixed-window':
      return 'Inside the limiter: requests counted in the current window';
    case 'sliding-window':
      return `Inside the limiter: requests allowed in the last ${seconds(w)}`;
  }
}

export default function RateLimiterSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const deferred = useDeferredValue(ui);
  const config = useMemo<RateSimConfig>(() => ({ ...DEFAULT_CONFIG, ...deferred }), [deferred]);
  const result = useMemo(() => runRateSim(config), [config]);
  const spec = useMemo(() => limiterDiagram(config, result), [config, result]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    setUi((u) => ({ ...u, ...patch }));
  };

  const w = windowSec(config);
  const isWindow = config.algorithm === 'fixed-window' || config.algorithm === 'sliding-window';
  const isLeaky = config.algorithm === 'leaky-bucket';
  const name = ALGORITHM_NAME[config.algorithm];

  const allowedPoints = useMemo(() => result.samples.map((s) => ({ x: s.t, y: s.allowedPerSec })), [result]);
  const rejectedPoints = useMemo(() => result.samples.map((s) => ({ x: s.t, y: s.rejectedPerSec })), [result]);
  const levelPoints = useMemo(() => result.samples.map((s) => ({ x: s.t, y: s.level })), [result]);

  const peakAllowed = Math.max(...result.samples.map((s) => s.allowedPerSec));
  const peakRejected = Math.max(...result.samples.map((s) => s.rejectedPerSec));
  const allowedMax = niceMax(Math.max(peakAllowed, config.refill * 1.5, 4));
  const rejectedMax = niceMax(Math.max(peakRejected, 4));
  const levelMax = niceMax(Math.max(config.bucket * 1.1, 4));

  const markers =
    config.pattern === 'edges'
      ? edgeBoundaries(config).map((b) => ({ x: b, label: `Window boundary at ${seconds(b)}: a burst just before it and one just after` }))
      : burstsOf(config).map((b) => ({ x: b.start, label: `A burst of ${formatInt(b.size)} requests at ${seconds(b.start)}` }));

  const rateName = config.algorithm === 'token-bucket' ? 'Refill rate' : isLeaky ? 'Leak rate' : 'Average limit';
  const rejectedShare = result.totals.sent ? result.totals.rejected / result.totals.sent : 0;
  const hot = result.busiestSecond > config.bucket + config.refill;

  const overloadPct = Math.round(100 * Math.max(0, 1 - config.refill / Math.max(1, config.rate)));
  const challenges: Challenge[] = [
    {
      id: 'burst',
      prompt: 'Pick the token bucket and send bursts bigger than the bucket. How many requests of each burst get through?',
      explanation: `When a burst arrives at a full bucket, the first ${formatInt(config.bucket)} requests each take a token and go straight through, and the rest find it empty and are rejected. The bucket refills at ${formatInt(config.refill)} tokens a second, so an empty bucket is full again after ${formatInt(config.bucket)} ÷ ${formatInt(config.refill)} = ${seconds(w)}. The bucket size sets the biggest burst you accept; the refill rate sets the long-run rate.`,
      attempted: config.algorithm === 'token-bucket' && config.pattern === 'bursts' && config.burst > config.bucket,
    },
    {
      id: 'edges',
      prompt: 'Switch to the fixed window and choose edge bursts, with bursts at least as big as the limit. What is the busiest second? Then try the sliding window.',
      explanation: `Each pair of bursts straddles a window boundary: one just before a window ends, one just after the next begins. The fixed window starts counting from zero at the boundary, so both bursts fit, and up to twice the limit, ${formatInt(2 * config.bucket)} requests, gets through in under a second. The sliding window counts back a full window from every request, so the second burst finds it already full, and most or all of it is turned away.`,
      attempted: config.algorithm === 'fixed-window' && config.pattern === 'edges' && config.burst >= config.bucket,
    },
    {
      id: 'leaky',
      prompt: 'Now try the leaky bucket with bursts bigger than the bucket. Why does the line of allowed requests go flat, and what do requests pay for it?',
      explanation: `The leaky bucket puts each burst in a line and lets requests out at ${formatInt(config.refill)} a second, so the photo service sees a flat line instead of spikes. The price is waiting: the last request in a full bucket waits about ${formatInt(config.bucket)} ÷ ${formatInt(config.refill)} = ${seconds(w)}, and once the bucket is full, the rest of the burst is rejected.`,
      attempted: config.algorithm === 'leaky-bucket' && config.pattern !== 'steady' && config.burst > config.bucket,
    },
    {
      id: 'overload',
      prompt: 'Choose steady traffic and set it to at least twice the refill rate, like the buggy app sending likes in a loop. Compare two algorithms.',
      explanation: `Whatever the algorithm, a client that keeps sending faster than the limit gets about the refill rate in the long run: ${formatInt(config.refill)} a second out of ${formatInt(config.rate)}, so about ${overloadPct}% are rejected. The algorithms differ in how they handle bursts and boundaries, not in the long-run rate.`,
      attempted: config.pattern === 'steady' && config.rate >= 2 * config.refill,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Rate limiter simulator"
          intro="One minute of requests from one partner’s key, checked at the gateway. Change the algorithm, the bucket and the traffic, and watch what gets through."
        />
      ) : null}

      <Diagram spec={spec} variant="plain" />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat label="Allowed" value={formatInt(result.totals.allowed)} note={`of ${formatInt(result.totals.sent)} sent`} />
          <Stat
            label="Rejected"
            value={formatInt(result.totals.rejected)}
            note={`${formatPercent(rejectedShare)}, sent 429`}
            tone={result.totals.rejected > 0 ? 'alert' : 'ink'}
          />
          <Stat label="Busiest second" value={formatInt(result.busiestSecond)} note="passed on in one second" tone={hot ? 'alert' : 'ink'} />
          <Stat
            label="Longest wait"
            value={seconds(result.maxWaitSec)}
            note={isLeaky ? 'in the leaky bucket’s line' : 'allowed requests go at once'}
            tone={result.maxWaitSec >= 2 ? 'alert' : 'ink'}
          />
        </div>
        <p className="tabular text-ui text-graphite">
          {name} with {isWindow ? `a limit of ${formatInt(config.bucket)} per ${seconds(w)} window` : `a bucket of ${formatInt(config.bucket)}`}
          {config.algorithm === 'token-bucket' ? ` refilled at ${formatInt(config.refill)} a second` : isLeaky ? ` that leaks ${formatInt(config.refill)} a second` : ''}. Over the
          minute it let through {formatInt(result.totals.allowed)} requests, about {(result.totals.allowed / config.durationSec).toFixed(1)} a second on average, and at
          most {formatInt(result.busiestSecond)} in any one second{isWindow ? ` and ${formatInt(result.busiestWindow)} in any ${seconds(w)}` : ''}.
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <LineChart
          title="Allowed: requests per second reaching the photo service"
          series={[{ id: 'allowed', label: 'Allowed', points: allowedPoints }]}
          xMax={config.durationSec}
          yMax={allowedMax}
          xTicks={X_TICKS}
          yTicks={[0, allowedMax / 2, allowedMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          thresholds={[{ y: config.refill, label: `${rateName}, ${formatInt(config.refill)} a second` }]}
          markers={markers}
          height={170}
          summary={`Counted over the last second. At most ${formatInt(result.busiestSecond)} requests reached the service in any one second; the long-run limit is ${formatInt(config.refill)} a second.`}
        />
        <LineChart
          title="Rejected: requests per second turned away"
          series={[{ id: 'rejected', label: 'Rejected', points: rejectedPoints, tone: 'alert' }]}
          xMax={config.durationSec}
          yMax={rejectedMax}
          xTicks={X_TICKS}
          yTicks={[0, rejectedMax / 2, rejectedMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          markers={markers}
          height={140}
          summary={`${formatInt(result.totals.rejected)} requests were rejected in total${
            result.firstRejectSec !== null ? `, the first at ${seconds(result.firstRejectSec)}` : ''
          }.`}
        />
        <LineChart
          title={levelTitle(config.algorithm, w)}
          series={[{ id: 'level', label: 'Level', points: levelPoints, tone: 'graphite' }]}
          xMax={config.durationSec}
          yMax={levelMax}
          xTicks={X_TICKS}
          yTicks={[0, levelMax / 2, levelMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          thresholds={[{ y: config.bucket, label: isWindow ? `Limit, ${formatInt(config.bucket)}` : `Bucket size, ${formatInt(config.bucket)}` }]}
          markers={markers}
          height={150}
          summary={`The limiter’s level peaks at ${formatInt(result.peakLevel)}, against ${isWindow ? 'a limit' : 'a bucket size'} of ${formatInt(config.bucket)}.`}
        />
        {markers.length ? (
          <p className="text-small text-graphite">
            Red triangles along the top mark {config.pattern === 'edges' ? 'the window boundaries the bursts straddle' : 'when each burst arrives'}. Requests per second are counted over the
            last second, every tenth of a second.
          </p>
        ) : null}
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Algorithm</span>
          <Segmented<Algorithm>
            label="Algorithm"
            value={ui.algorithm}
            onChange={(algorithm) => update({ algorithm })}
            options={ALGORITHMS.map((a) => ({ value: a, label: ALGORITHM_NAME[a] }))}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">{ALGORITHM_HINT[ui.algorithm]}</p>
        </div>
        <Slider
          id="rl-bucket"
          label={ui.algorithm === 'fixed-window' || ui.algorithm === 'sliding-window' ? 'Limit per window' : 'Bucket size'}
          value={ui.bucket}
          min={2}
          max={40}
          onChange={(bucket) => update({ bucket })}
          format={(v) => (ui.algorithm === 'token-bucket' ? `${v} tokens` : `${v} requests`)}
          hint={
            ui.algorithm === 'token-bucket'
              ? 'The most tokens it holds: the biggest burst it lets through at once.'
              : ui.algorithm === 'leaky-bucket'
                ? 'How many requests can wait in line.'
                : 'How many requests each window allows.'
          }
        />
        <Slider
          id="rl-refill"
          label={ui.algorithm === 'token-bucket' ? 'Refill rate' : ui.algorithm === 'leaky-bucket' ? 'Leak rate' : 'Average rate'}
          value={ui.refill}
          min={1}
          max={10}
          onChange={(refill) => update({ refill })}
          format={(v) => `${v} a second`}
          hint={
            ui.algorithm === 'token-bucket'
              ? 'Tokens added each second: the long-run rate.'
              : ui.algorithm === 'leaky-bucket'
                ? 'Requests let out of the line each second.'
                : `Sets the window length: ${ui.bucket} ÷ ${ui.refill} = ${seconds(ui.bucket / ui.refill)}, so the long-run rate matches the other algorithms.`
          }
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Traffic from the partner’s script</span>
          <Segmented<Pattern>
            label="Traffic pattern"
            value={ui.pattern}
            onChange={(pattern) => update({ pattern })}
            options={PATTERNS.map((p) => ({ value: p, label: PATTERN_LABEL[p] }))}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">
            {ui.pattern === 'steady'
              ? 'Only the steady requests.'
              : ui.pattern === 'bursts'
                ? 'Steady requests plus a burst every 10 seconds, from the 5-second mark.'
                : 'Steady requests plus pairs of bursts: one just before a window boundary and one just after it.'}
          </p>
        </div>
        <Slider
          id="rl-rate"
          label="Steady requests"
          value={ui.rate}
          min={0}
          max={20}
          onChange={(rate) => update({ rate })}
          format={(v) => `${v} a second`}
          hint="Sent at an even pace, with a little randomness."
        />
        <Slider
          id="rl-burst"
          label="Burst size"
          value={ui.burst}
          min={0}
          max={60}
          onChange={(burst) => update({ burst })}
          format={(v) => `${v} requests`}
          hint={ui.pattern === 'steady' ? 'Used by the burst patterns.' : 'Each burst arrives within a fraction of a second.'}
        />
        <div className="sm:col-span-2">
          <Button size="sm" variant="ghost" onClick={() => setUi(initial)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="rate-limiter" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          One client and one limiter, deciding each request instantly. For the two window algorithms, the limit is the bucket size and each window lasts bucket size ÷
          refill rate, so all four allow the same long-run rate. The sliding window here keeps the time of every allowed request; large systems usually estimate it from
          two counters instead, and keep their counters in a shared store such as Redis.
        </p>
      </Callout>
    </div>
  );
}
