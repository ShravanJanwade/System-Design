import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider, Toggle } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { LineChart } from '../shared/LineChart';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import type { EvictionPolicy } from './caches';
import { DB_COMFORT_LIMIT, DEFAULT_CONFIG, runCacheSim, type CacheSimConfig } from './logic';
import { cacheDiagram } from './diagram';

const CAPACITY_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200];
const TTL_STEPS = [0, 5, 10, 15, 20, 30, 45, 60];
const POLICIES: EvictionPolicy[] = ['LRU', 'LFU', 'FIFO'];

type UiConfig = Pick<CacheSimConfig, 'capacity' | 'policy' | 'ttlSec' | 'skew' | 'coalesce' | 'jitter'>;

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const base: UiConfig = {
    capacity: DEFAULT_CONFIG.capacity,
    policy: DEFAULT_CONFIG.policy,
    ttlSec: DEFAULT_CONFIG.ttlSec,
    skew: DEFAULT_CONFIG.skew,
    coalesce: false,
    jitter: false,
  };
  if (!preset) return base;
  return {
    capacity: typeof preset.capacity === 'number' ? preset.capacity : base.capacity,
    policy: POLICIES.includes(preset.policy as EvictionPolicy) ? (preset.policy as EvictionPolicy) : base.policy,
    ttlSec: typeof preset.ttlSec === 'number' ? preset.ttlSec : base.ttlSec,
    skew: typeof preset.skew === 'number' ? preset.skew : base.skew,
    coalesce: preset.coalesce === true,
    jitter: preset.jitter === true,
  };
}

function nearestIndex(steps: number[], v: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i]! - v) < Math.abs(steps[best]! - v)) best = i;
  return best;
}

function skewLabel(s: number): string {
  if (s < 0.05) return 'Even';
  if (s < 0.75) return 'Mild';
  if (s < 1.15) return 'Skewed';
  return 'Very skewed';
}

export default function CacheSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState<{ policy: EvictionPolicy; skew: number }[]>([]);
  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runCacheSim(deferred), [deferred]);
  const baseline = useMemo(() => runCacheSim(initial), [initial]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    const next = { ...ui, ...patch };
    setUi(next);
    setTried((t) => [...t, { policy: next.policy, skew: next.skew }]);
  };

  const hitPoints = useMemo(() => {
    const b = result.buckets;
    const out: { x: number; y: number }[] = [];
    let req = 0;
    let hits = 0;
    for (let i = 0; i < b.length; i++) {
      req += b[i]!.requests;
      hits += b[i]!.hits;
      if (i >= 10) {
        req -= b[i - 10]!.requests;
        hits -= b[i - 10]!.hits;
      }
      out.push({ x: b[i]!.t + 0.1, y: req ? (hits / req) * 100 : 0 });
    }
    return out;
  }, [result]);

  const dbPoints = useMemo(() => result.buckets.map((b) => ({ x: b.t + 0.05, y: b.dbReads * (1000 / DEFAULT_CONFIG.bucketMs) })), [result]);

  const spec = useMemo(
    () => cacheDiagram({ capacity: ui.capacity, policy: ui.policy, hitRatio: result.steadyHitRatio, dbPerSec: result.steadyDbPerSec }),
    [ui.capacity, ui.policy, result],
  );

  const triedAllPolicies = POLICIES.every((p) => tried.some((t) => t.policy === p && t.skew >= 1.0));
  const challenges: Challenge[] = [
    {
      id: 'shrink',
      prompt: 'Shrink the cache until the database load doubles.',
      explanation:
        'With fewer slots, popular profiles get evicted before anyone reads them again, and every eviction becomes a future miss. Here, going from 50 entries to about 10 roughly doubles database reads. That is why you size a cache to the working set rather than guessing.',
      attempted: result.steadyDbPerSec >= 2 * baseline.steadyDbPerSec,
    },
    {
      id: 'below-half',
      prompt: 'Make the hit rate drop below 50%.',
      explanation:
        'A tiny cache does it, and so does even traffic. When every profile is equally popular, a cache holding 50 of 200 profiles serves only about a quarter of reads. Caches pay off when a small set of keys gets most of the traffic.',
      attempted: result.steadyHitRatio < 0.5,
    },
    {
      id: 'stampede',
      prompt: 'Set the TTL to 10 seconds and find the spikes in database reads. Then make them go away.',
      explanation:
        'The hottest profiles were cached in the same instant, so they also expire in the same instant. For the next 100 ms every request for them misses and goes to the database: a stampede. Letting one request rebuild each key removes the duplicates; jitter spreads the expiry times so they stop lining up.',
      attempted: ui.ttlSec > 0 && ui.ttlSec <= 15 && (ui.coalesce || ui.jitter),
    },
    {
      id: 'policies',
      prompt: 'With skewed traffic, compare LRU, LFU and FIFO. Which keeps the most hits, and why?',
      explanation:
        'LFU wins in this simulation because popularity never changes, so the all-time favorites deserve their slots. FIFO does worst: it evicts even the hottest profile once it becomes the oldest entry. Real popularity shifts over time, which is why LRU and its variants are the common default.',
      attempted: triedAllPolicies,
    },
  ];

  const overLimit = result.peakDbPerSec > DB_COMFORT_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      {!embedded ? null : (
        <SimHeader
          title="Cache simulator"
          intro="Snapgram profile views, read through a cache-aside layer. Change one thing at a time and watch the hit ratio and the database."
        />
      )}
      <Diagram spec={spec} variant="plain" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Hit ratio" value={formatPercent(result.steadyHitRatio)} note="after warm-up" />
        <Stat label="Database reads" value={`${formatInt(result.steadyDbPerSec)}/s`} note="after warm-up" />
        <Stat
          label="Peak database reads"
          value={`${formatInt(result.peakDbPerSec)}/s`}
          note={overLimit ? `above the ${DB_COMFORT_LIMIT}/s limit` : 'within the limit'}
          tone={overLimit ? 'alert' : 'ink'}
        />
        <Stat label="Stampedes" value={formatInt(result.stampedes.filter((s) => s.t >= 5).length)} note="10+ rebuilds of one key" />
      </div>

      <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <LineChart
          title="Hit ratio over time"
          series={[{ id: 'hit', label: 'Hit ratio', points: hitPoints }]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={100}
          xTicks={[0, 10, 20, 30, 40, 50, 60]}
          yTicks={[0, 50, 100]}
          formatX={(v) => `${v} s`}
          formatY={(v) => `${v}%`}
          height={150}
          summary={`Starts at zero while the cache is cold, then settles near ${formatPercent(result.steadyHitRatio)}.`}
        />
        <LineChart
          title="Database reads per second"
          series={[{ id: 'db', label: 'Reads per second', points: dbPoints, tone: 'graphite' }]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={DEFAULT_CONFIG.rps}
          xTicks={[0, 10, 20, 30, 40, 50, 60]}
          yTicks={[0, 500, 1000]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          thresholds={[{ y: DB_COMFORT_LIMIT, label: `Comfortable limit, ${DB_COMFORT_LIMIT}/s (illustrative)` }]}
          markers={result.stampedes
            .filter((s) => s.t >= 2)
            .map((s) => ({ x: s.t, label: `${s.t.toFixed(1)} s: ${s.reads} requests rebuilt profile ${s.key + 1} at once` }))}
          height={190}
          summary={`Peaks at ${formatInt(result.peakDbPerSec)} reads per second after warm-up. ${result.stampedes.length} stampedes marked along the top.`}
        />
        <p className="text-small text-graphite">
          Red triangles mark stampedes: moments when ten or more requests rebuilt the same profile at once.
        </p>
      </div>

      <ControlPanel>
        <Slider
          id="cache-capacity"
          label="Capacity"
          value={nearestIndex(CAPACITY_STEPS, ui.capacity)}
          min={0}
          max={CAPACITY_STEPS.length - 1}
          onChange={(i) => update({ capacity: CAPACITY_STEPS[i]! })}
          format={(i) => `${CAPACITY_STEPS[i]} profiles`}
          hint={`Of ${DEFAULT_CONFIG.keys} profiles in total.`}
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink" id="cache-policy-label">
            Eviction policy
          </span>
          <Segmented<EvictionPolicy>
            label="Eviction policy"
            value={ui.policy}
            onChange={(policy) => update({ policy })}
            options={POLICIES.map((p) => ({ value: p, label: p }))}
          />
          <p className="text-small text-graphite">
            {ui.policy === 'LRU'
              ? 'Evicts the profile unused for the longest time.'
              : ui.policy === 'LFU'
                ? 'Evicts the profile used the fewest times.'
                : 'Evicts the oldest profile, however popular.'}
          </p>
        </div>
        <Slider
          id="cache-ttl"
          label="Time to live (TTL)"
          value={nearestIndex(TTL_STEPS, ui.ttlSec)}
          min={0}
          max={TTL_STEPS.length - 1}
          onChange={(i) => update({ ttlSec: TTL_STEPS[i]! })}
          format={(i) => (TTL_STEPS[i] === 0 ? 'Off' : `${TTL_STEPS[i]} s`)}
          hint="How long a cached profile stays valid."
        />
        <Slider
          id="cache-skew"
          label="Traffic skew"
          value={Math.round(ui.skew * 10)}
          min={0}
          max={14}
          onChange={(v) => update({ skew: v / 10 })}
          format={(v) => `${skewLabel(v / 10)} (${(v / 10).toFixed(1)})`}
          hint="How much more popular the top profiles are than the rest."
        />
        <Toggle
          id="cache-coalesce"
          label="One rebuild per key"
          description="Other requests wait for the first one instead of all reading the database."
          checked={ui.coalesce}
          onChange={(coalesce) => update({ coalesce })}
        />
        <Toggle
          id="cache-jitter"
          label="Jitter the TTL"
          description="Randomize each expiry by up to 20% so hot keys stop expiring together."
          checked={ui.jitter}
          onChange={(jitter) => update({ jitter })}
        />
        <div className="sm:col-span-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setUi(initial);
            }}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="cache" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          The simulation uses {DEFAULT_CONFIG.keys} profiles and {formatInt(DEFAULT_CONFIG.rps)} requests per second, and each database read
          takes {DEFAULT_CONFIG.rebuildMs} ms: slow on purpose, so stampedes are easy to see. Real reads of a profile often take a few
          milliseconds, and real caches also deal with memory limits, serialization and replication.
        </p>
      </Callout>
    </div>
  );
}
