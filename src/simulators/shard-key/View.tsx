import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider, Toggle } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { formatInt, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  COUNTRIES,
  DEFAULT_CONFIG,
  HOT_FACTOR,
  MAX_SHARDS,
  METHOD_LABEL,
  METRICS,
  MIN_SHARDS,
  PEAK_READS,
  PEAK_WRITES,
  SHARD_KEYS,
  SHARD_KEY_LABEL,
  TOTAL_DATA_TB,
  biggestCountryShare,
  runShardSim,
  type Metric,
  type ShardKey,
  type ShardResult,
  type ShardStats,
} from './logic';

type Ui = { key: ShardKey; shards: number; celebrity: boolean };

const HINT: Record<ShardKey, string> = {
  'user-id': 'Hash partitioning: each user goes to shard hash(user ID) % N, so users scatter at random, whatever their country or signup date.',
  country:
    'A lookup table puts each country on one shard: the biggest countries first, each on the shard with the fewest users so far.',
  'signup-date':
    'Range partitioning: each shard holds a range of signup dates. The ranges were drawn a month ago, so that each shard got the same number of users.',
};

const METRIC_LABEL: Record<Metric, string> = { data: 'Data', reads: 'Reads', writes: 'Writes' };

function fromPreset(preset: SimulatorProps['preset']): Ui {
  const p = preset ?? {};
  const shards = typeof p.shards === 'number' && Number.isFinite(p.shards) ? p.shards : DEFAULT_CONFIG.shards;
  return {
    key: SHARD_KEYS.includes(p.key as ShardKey) ? (p.key as ShardKey) : DEFAULT_CONFIG.key,
    shards: Math.min(MAX_SHARDS, Math.max(MIN_SHARDS, Math.round(shards))),
    celebrity: p.celebrity === true,
  };
}

/** "1.4×" */
function times(v: number): string {
  return `${v.toFixed(1)}×`;
}

function amount(s: ShardStats, m: Metric): string {
  if (m === 'data') return `${s.dataTb < 1 ? s.dataTb.toFixed(2) : s.dataTb.toFixed(1)} TB`;
  return `${formatInt(m === 'reads' ? s.readsPerSec : s.writesPerSec)}/s`;
}

function Meter({ s, m, scale, even }: { s: ShardStats; m: Metric; scale: number; even: number }) {
  const hot = s.hot[m];
  const at = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-small">
        <span className={hot ? 'font-bold text-card-ink' : 'text-card-muted'}>
          {METRIC_LABEL[m]}
          {hot ? ', hot' : ''}
        </span>
        <span className="tabular text-card-ink">
          <span className="font-semibold">{formatPercent(s[m])}</span> <span className="text-card-muted">{amount(s, m)}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[color-mix(in_srgb,var(--card-muted)_18%,transparent)]" aria-hidden>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: at(s[m]), background: hot ? 'var(--alert)' : 'var(--type-database)' }}
        />
        <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-card-ink" style={{ left: at(even) }} />
      </div>
    </div>
  );
}

function ShardCard({ s, scale, even, takesNewUsers }: { s: ShardStats; scale: number; even: number; takesNewUsers: boolean }) {
  const hot = s.hot.data || s.hot.reads || s.hot.writes;
  return (
    <li className={cn('flex min-w-0 flex-col gap-2 rounded-card bg-card p-3 text-card-ink', hot && 'ring-2 ring-panel-alert')}>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-display text-ui-lg font-semibold">{s.name}</span>
        {hot ? <span className="rounded-full bg-card-ink px-2 py-0.5 text-small font-semibold text-card">Hot spot</span> : null}
        {s.empty ? <span className="rounded-full border border-card-muted px-2 py-0.5 text-small text-card-muted">Empty</span> : null}
      </div>
      <p className="text-small text-card-muted">{s.holds}</p>
      {s.celebrity || takesNewUsers ? (
        <div className="flex flex-wrap gap-1">
          {s.celebrity ? <span className="rounded-full bg-signal px-2 py-0.5 text-small font-semibold text-on-signal">The celebrity</span> : null}
          {takesNewUsers ? <span className="rounded-full bg-signal px-2 py-0.5 text-small font-semibold text-on-signal">Every new user</span> : null}
        </div>
      ) : null}
      {METRICS.map((m) => (
        <Meter key={m} s={s} m={m} scale={scale} even={even} />
      ))}
    </li>
  );
}

/** One or two sentences on the split; also the text alternative for the shard cards. */
function summarize(r: ShardResult): string {
  const c = r.config;
  const n = r.shards.length;
  const lead = `${SHARD_KEY_LABEL[c.key]} as the shard key (${METHOD_LABEL[c.key].toLowerCase()}) across ${n} shards${c.celebrity ? ', with the celebrity' : ''}.`;
  if (r.hotSpots === 0) return `${lead} No hot spots: the busiest shard handles ${times(r.peak.traffic)} an even share of requests.`;
  return `${lead} ${r.hotSpots} hot spot${r.hotSpots === 1 ? '' : 's'}: the busiest shard handles ${times(r.peak.traffic)} an even share of requests, and the largest holds ${times(r.peak.data)} an even share of the data.`;
}

export default function ShardKeySimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<Ui>(initial);
  const [touched, setTouched] = useState(false);

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runShardSim(deferred), [deferred]);
  const n = result.shards.length;

  // The runs each challenge explanation quotes, so it always describes the case it is about.
  const hashRun = useMemo(
    () => (deferred.key === 'user-id' && !deferred.celebrity ? result : runShardSim({ key: 'user-id', shards: deferred.shards })),
    [deferred, result],
  );
  const countryRun = useMemo(
    () =>
      deferred.key === 'country' && !deferred.celebrity
        ? result
        : runShardSim({ key: 'country', shards: deferred.key === 'country' ? deferred.shards : 8 }),
    [deferred, result],
  );
  const signupRun = useMemo(
    () => (deferred.key === 'signup-date' && !deferred.celebrity ? result : runShardSim({ key: 'signup-date', shards: deferred.shards })),
    [deferred, result],
  );
  const celeb = useMemo(() => {
    const share = (shards: number) => {
      const r = runShardSim({ key: 'user-id', shards, celebrity: true });
      return r.shards[r.celebrityShard]!.reads;
    };
    return { four: share(4), sixteen: share(16) };
  }, []);

  const update = (patch: Partial<Ui>) => {
    setTouched(true);
    setUi((u) => ({ ...u, ...patch }));
  };
  const reset = () => setUi(initial);

  const scale = Math.min(1, Math.max(2 * result.even, ...result.shards.flatMap((s) => METRICS.map((m) => s[m]))) * 1.04);
  const busiest = result.shards[result.busiest.traffic]!;
  const largest = result.shards[result.busiest.data]!;
  const oneTakesAll = result.newUserTop === 1;
  const us = biggestCountryShare(result);
  const newest = signupRun.shards[signupRun.shards.length - 1]!;
  const oldest = signupRun.shards[0]!;

  const challenges: Challenge[] = [
    {
      id: 'even',
      prompt: 'Find the shard key that spreads data, reads and writes evenly. Does it still work with 16 shards?',
      explanation: `Hashing the user ID scatters users at random, whatever their country or signup date, so every shard gets close to an even share: at ${hashRun.shards.length} shards, the busiest handles ${times(hashRun.peak.traffic)} an even share of requests. The catch is questions about a range, such as everyone who joined last week, which now have to ask every shard.`,
      attempted: result.config.key === 'user-id' && !result.config.celebrity && n >= 8,
    },
    {
      id: 'country',
      prompt: 'Shard by country, then keep adding shards. Why does the busiest shard stop getting smaller?',
      explanation: `There are only ${COUNTRIES.length} countries here, and the biggest, the United States, has ${formatPercent(us)} of the users. A lookup table can put a country on any shard but cannot split one, so at ${countryRun.shards.length} shards that shard holds ${times(countryRun.peak.data)} an even share of the data. ${
        countryRun.emptyShards > 0
          ? `${countryRun.emptyShards} shards get no country at all and sit empty.`
          : `Past ${COUNTRIES.length} shards, the extra ones would sit empty.`
      }`,
      attempted: result.config.key === 'country' && n >= 8,
    },
    {
      id: 'signup',
      prompt: 'Shard by signup date. Where do new users go, and which shard does the most work?',
      explanation: `Everyone who signed up after the ranges were drawn lands on ${newest.name}, the shard for the newest dates. New accounts are also the busiest, so it takes ${formatPercent(newest.writes)} of the writes and ${formatPercent(newest.reads)} of the reads. ${oldest.name} holds ${formatPercent(oldest.data)} of the photos, piled up over years, yet sees little traffic. Ranges that start out even drift as the app grows.`,
      attempted: result.config.key === 'signup-date',
    },
    {
      id: 'celebrity',
      prompt: 'Add the celebrity, then try to cool their shard down by adding more shards.',
      explanation: `The celebrity is one user, so every read of their posts goes to the one shard that holds their user ID. Hashing the user ID across 4 shards, that shard serves ${formatPercent(celeb.four)} of all reads, ${times(celeb.four * 4)} an even share; across 16 it still serves ${formatPercent(celeb.sixteen)}, now ${times(celeb.sixteen * 16)} an even share. More shards cannot split one key. Cache the celebrity’s posts, add read replicas for that shard, or spread their data over several keys on purpose.`,
      attempted: result.config.celebrity && n >= 8,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Shard-key visualizer"
          intro="About 20,000 sample users stand in for Snapgram’s 10 million. Pick a shard key and a number of shards, and see where the data, reads and writes land."
        />
      ) : null}

      <section aria-label="Shards" className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-4">
        <p className="text-ui text-panel-text">{summarize(result)}</p>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {result.shards.map((s) => (
            <ShardCard key={s.index} s={s} scale={scale} even={result.even} takesNewUsers={oneTakesAll && s.newUsers > 0} />
          ))}
        </ul>
        <p className="text-small text-panel-muted">
          The dark tick on each bar marks an even share, 1 in {n}. A shard is a hot spot when its data, reads or writes reach{' '}
          {HOT_FACTOR} times an even share. In all: {TOTAL_DATA_TB} TB of photo data and {formatInt(PEAK_READS + PEAK_WRITES)} requests
          per second before the celebrity (illustrative).
        </p>
      </section>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Busiest shard"
          value={times(result.peak.traffic)}
          note={`${busiest.name}: ${formatPercent(busiest.traffic)} of requests`}
          tone={result.peak.traffic >= HOT_FACTOR ? 'alert' : 'ink'}
        />
        <Stat
          label="Largest shard"
          value={times(result.peak.data)}
          note={`${largest.name}: ${formatPercent(largest.data)} of the data`}
          tone={result.peak.data >= HOT_FACTOR ? 'alert' : 'ink'}
        />
        <Stat
          label="Hot spots"
          value={formatInt(result.hotSpots)}
          note={`of ${n} shards`}
          tone={result.hotSpots > 0 ? 'alert' : 'success'}
        />
        <Stat
          label="New users land on"
          value={`${result.newUserShards} of ${n}`}
          note={oneTakesAll ? 'one shard takes every new user' : 'shards'}
          tone={oneTakesAll ? 'alert' : 'ink'}
        />
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Shard key</span>
          <Segmented<ShardKey>
            label="Shard key"
            value={ui.key}
            onChange={(key) => update({ key })}
            options={SHARD_KEYS.map((k) => ({ value: k, label: SHARD_KEY_LABEL[k] }))}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">{HINT[ui.key]}</p>
        </div>
        <Slider
          id="shard-count"
          label="Shards"
          value={ui.shards}
          min={MIN_SHARDS}
          max={MAX_SHARDS}
          onChange={(shards) => update({ shards })}
          format={(v) => `${v} shards`}
          hint={`An even share is ${formatPercent(1 / ui.shards)} each.`}
        />
        <Toggle
          id="shard-celebrity"
          label="Add a celebrity"
          description="A new account with millions of followers. Their posts draw a fifth of all reads."
          checked={ui.celebrity}
          onChange={(celebrity) => update({ celebrity })}
        />
        <div className="sm:col-span-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="shard-key" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Each shard here is a single database, and the users are a seeded sample with made-up habits: a few countries hold most of
          them, sign-ups grow about 8% a month, and new accounts are busier than old ones. Real shards also have replicas, and real
          traffic rises and falls with the time of day. All numbers are illustrative.
        </p>
      </Callout>
    </div>
  );
}
