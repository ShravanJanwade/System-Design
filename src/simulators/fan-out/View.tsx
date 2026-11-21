import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider, Toggle } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { cn } from '@/lib/cn';
import { formatCompact, formatInt, formatMs, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader } from '../shared/SimParts';
import { fanOutDiagram } from './diagram';
import {
  DISTRIBUTIONS,
  DISTRIBUTION_LABEL,
  MODEL,
  STRATEGIES,
  STRATEGY_LABEL,
  THRESHOLDS,
  formatSeconds,
  normalizeConfig,
  runFanOut,
  type Distribution,
  type FanOutConfig,
  type FanOutResult,
  type Strategy,
} from './logic';

type UiConfig = Pick<FanOutConfig, 'strategy' | 'distribution' | 'celebrity' | 'threshold'>;

const STRATEGY_HINT: Record<Strategy, string> = {
  push: 'Fan-out on write: each post is copied into every follower’s feed when it is posted.',
  pull: 'Fan-out on read: each feed load gathers recent posts from every followed account.',
  hybrid: 'Push for ordinary accounts; accounts at or above the threshold are pulled at read time and merged in.',
};

const DISTRIBUTION_HINT: Record<Distribution, string> = {
  even: 'Every account has between 50 and 500 followers.',
  skewed: 'Most accounts have under a few hundred followers; a rare few have hundreds of thousands or more.',
  'very-skewed': 'A heavier tail: fewer followers for most accounts, millions for the biggest.',
};

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const p = preset ?? {};
  const c = normalizeConfig({
    strategy: p.strategy as Strategy,
    distribution: p.distribution as Distribution,
    celebrity: p.celebrity === true,
    threshold: typeof p.threshold === 'number' ? p.threshold : undefined,
  });
  return { strategy: c.strategy, distribution: c.distribution, celebrity: c.celebrity, threshold: c.threshold };
}

type Row = { label: string; values: Record<Strategy, string>; bad?: Partial<Record<Strategy, boolean>> };

function comparisonRows(r: FanOutResult): Row[] {
  const by = r.byStrategy;
  const map = (f: (s: Strategy) => string) => Object.fromEntries(STRATEGIES.map((s) => [s, f(s)])) as Record<Strategy, string>;
  const flags = (f: (s: Strategy) => boolean) => Object.fromEntries(STRATEGIES.map((s) => [s, f(s)])) as Record<Strategy, boolean>;
  return [
    { label: 'Feed writes, typical post', values: map((s) => formatInt(by[s].writes.typical)) },
    {
      label: r.config.celebrity ? 'Most feed writes for one post (the celebrity’s, if pushed)' : 'Most feed writes for one post',
      values: map((s) => formatCompact(by[s].writes.most)),
      bad: flags((s) => by[s].writes.most >= 1_000_000),
    },
    {
      label: 'Time for that post to reach every feed',
      values: map((s) => (by[s].writes.most > 0 ? formatSeconds(by[s].writes.mostSeconds) : 'no fan-out')),
      bad: flags((s) => by[s].writes.mostSeconds >= 10),
    },
    { label: 'Lists read per feed load, typical', values: map((s) => formatInt(by[s].reads.medianLists)) },
    { label: 'Feed load time, median', values: map((s) => formatMs(by[s].reads.medianMs)) },
    {
      label: 'Feed load time, 99th percentile',
      values: map((s) => formatMs(by[s].reads.p99Ms)),
      bad: flags((s) => by[s].reads.p99Ms >= 100),
    },
  ];
}

/** The chosen strategy's column: a lighter blue wash, so red values in it keep 4.5:1. */
const SELECTED_COLUMN = 'bg-[color-mix(in_srgb,var(--blueprint-wash)_60%,var(--paper))]';

export default function FanOutSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [seenStrategies, setSeenStrategies] = useState<Strategy[]>([initial.strategy]);
  const [seenThresholds, setSeenThresholds] = useState<number[]>(initial.distribution === 'very-skewed' ? [initial.threshold] : []);
  const [step, setStep] = useState(0);

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runFanOut(deferred), [deferred]);
  const spec = useMemo(() => fanOutDiagram(result, deferred.strategy), [result, deferred.strategy]);

  // Runs at both ends of the threshold range, for the last challenge's explanation.
  const ends = useMemo(() => {
    if (deferred.distribution !== 'very-skewed') return null;
    const at = (threshold: number) => (deferred.threshold === threshold ? result : runFanOut({ ...deferred, threshold }));
    return { low: at(10_000).byStrategy.hybrid, high: at(1_000_000).byStrategy.hybrid };
  }, [deferred, result]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    const next = { ...ui, ...patch };
    if (patch.strategy && patch.strategy !== ui.strategy) setStep(0);
    setUi(next);
    setSeenStrategies((s) => (s.includes(next.strategy) ? s : [...s, next.strategy]));
    if (next.distribution === 'very-skewed') setSeenThresholds((t) => (t.includes(next.threshold) ? t : [...t, next.threshold]));
  };

  const reset = () => {
    setUi(initial);
    setStep(0);
  };

  const push = result.byStrategy.push;
  const pull = result.byStrategy.pull;
  const rows = comparisonRows(result);
  const thresholdIndex = Math.max(0, THRESHOLDS.indexOf(ui.threshold as (typeof THRESHOLDS)[number]));

  const challenges: Challenge[] = [
    {
      id: 'celebrity',
      prompt: 'Turn on the celebrity and stay with push. How long until the last of the 30 million followers sees the post?',
      explanation: `Push writes one feed entry per follower, so the celebrity’s single post costs ${formatInt(MODEL.celebrityFollowers)} feed writes. At about ${formatInt(
        MODEL.fanoutPerSecond,
      )} writes per second, the last follower sees it after about ${formatSeconds(
        MODEL.celebrityFollowers / MODEL.fanoutPerSecond,
      )}, while the first saw it at once. Switch to hybrid: the celebrity is above the threshold, so the post is saved once and each follower’s next feed load pulls it in.`,
      attempted: ui.celebrity && ui.strategy === 'push',
    },
    {
      id: 'pull',
      prompt: 'Switch to pull. How do its slowest 1% of feed loads compare with push’s?',
      explanation: `Pull adds no feed writes, but a feed load reads one list per followed account: ${formatInt(pull.reads.medianLists)} for a typical reader and ${formatInt(
        pull.reads.p99Lists,
      )} for the heaviest 1%. Lookups go out in rounds of ${MODEL.parallelLookups}, and each round waits for its slowest lookup, so the 99th-percentile load takes about ${formatMs(
        pull.reads.p99Ms,
      )} against ${formatMs(push.reads.p99Ms)} with push. Feeds are read far more often than posts are written, so pull pays its cost on the busier side.`,
      attempted: seenStrategies.includes('pull') && seenStrategies.includes('push') && ui.strategy === 'pull',
    },
    {
      id: 'even',
      prompt: 'Choose the even distribution and select hybrid. Does it behave any differently from push?',
      explanation: ui.celebrity
        ? `Only the celebrity is above the threshold, so hybrid matches push for every ordinary post. The celebrity’s post causes no feed writes, and the ${formatPercent(
            MODEL.celebrityFollowers / MODEL.users,
          )} of readers who follow it read one extra list. Turn the celebrity off and the two are identical.`
        : `With every account between 50 and 500 followers, nobody reaches the ${formatCompact(
            ui.threshold,
          )} threshold, so hybrid pushes every post: its writes and feed loads match push exactly. Hybrid changes nothing for ordinary accounts; it only steps in for the few big enough to hurt.`,
      attempted: ui.distribution === 'even' && ui.strategy === 'hybrid',
    },
    {
      id: 'threshold',
      prompt: 'Pick the very skewed distribution, then move hybrid’s threshold from 10K to 1M followers. What gets better, and what gets worse?',
      explanation: ends
        ? `At 10,000, no pushed post needs more than ${formatInt(ends.low.writes.most)} feed writes, but a typical feed load reads ${formatInt(
            ends.low.reads.medianLists,
          )} lists and the slowest 1% take ${formatMs(ends.low.reads.p99Ms)}. At 1,000,000, a typical load reads ${formatInt(ends.high.reads.medianLists)} lists (${formatMs(
            ends.high.reads.p99Ms,
          )} at the 99th percentile), but the biggest pushed post costs ${formatInt(ends.high.writes.most)} writes and takes ${formatSeconds(
            ends.high.writes.mostSeconds,
          )} to reach every feed. The threshold trades write cost for read cost.`
        : 'A low threshold pulls more accounts: posts never need a huge fan-out, but every feed load reads more lists. A high threshold pushes more: reads stay cheap, but the biggest pushed posts cost more writes. The threshold trades write cost for read cost.',
      attempted: seenThresholds.includes(10_000) && seenThresholds.includes(1_000_000),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Fan-out simulator"
          intro="A model of Snapgram’s home feed: 20,000 sampled posts and 5,000 sampled feed loads. Pick a strategy, change how followers are spread, add a celebrity, and compare all three strategies side by side."
        />
      ) : null}

      <Diagram
        spec={spec}
        title={`${STRATEGY_LABEL[deferred.strategy]}: one post and one feed load`}
        caption="Step through one post and one feed load. The table below compares all three strategies on the same run."
        step={step}
        onStepChange={setStep}
      />

      <section aria-label="Push, pull and hybrid compared" className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <h3 className="text-ui-lg font-semibold text-ink">Write cost per post and read latency per feed load</h3>
        <table className="w-full table-fixed border-collapse text-ui">
          <thead>
            <tr>
              <th scope="col" className="w-[40%] pb-2 text-left text-small font-normal text-graphite">
                <span className="sr-only">Measure</span>
              </th>
              {STRATEGIES.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className={cn('rounded-t-control px-1 pb-2 pt-1 text-right font-semibold text-ink', s === ui.strategy && SELECTED_COLUMN)}
                >
                  {STRATEGY_LABEL[s]}
                  {s === ui.strategy ? <span className="sr-only"> (selected)</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-rule align-top">
                <th scope="row" className="py-2 pr-2 text-left text-small font-normal text-graphite">
                  {row.label}
                </th>
                {STRATEGIES.map((s) => (
                  <td
                    key={s}
                    className={cn(
                      'tabular px-1 py-2 text-right font-semibold',
                      row.bad?.[s] ? 'text-alert' : 'text-ink',
                      s === ui.strategy && SELECTED_COLUMN,
                    )}
                  >
                    {row.values[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-small text-graphite">
          Typical post: the median author here has {formatInt(result.typicalFollowers)} followers. A typical reader follows {formatInt(result.typicalFollowing)} accounts, and
          the heaviest 1% follow {formatInt(result.heavyFollowing)} or more. One post’s fan-out writes about {formatInt(MODEL.fanoutPerSecond)} feed entries per second.
        </p>
      </section>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Strategy</span>
          <Segmented<Strategy>
            label="Strategy"
            value={ui.strategy}
            onChange={(strategy) => update({ strategy })}
            options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
            className="self-start"
          />
          <p className="text-small text-graphite">{STRATEGY_HINT[ui.strategy]}</p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Follower distribution</span>
          <Segmented<Distribution>
            label="Follower distribution"
            value={ui.distribution}
            onChange={(distribution) => update({ distribution })}
            options={DISTRIBUTIONS.map((d) => ({ value: d, label: DISTRIBUTION_LABEL[d] }))}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">{DISTRIBUTION_HINT[ui.distribution]}</p>
        </div>
        <Toggle
          id="fo-celebrity"
          label="Add a celebrity"
          description="One account with 30 million followers posts, and about 60% of readers follow it."
          checked={ui.celebrity}
          onChange={(celebrity) => update({ celebrity })}
        />
        <Slider
          id="fo-threshold"
          label="Hybrid threshold"
          value={thresholdIndex}
          min={0}
          max={THRESHOLDS.length - 1}
          onChange={(i) => update({ threshold: THRESHOLDS[i] })}
          format={(i) => `${formatCompact(THRESHOLDS[i] ?? ui.threshold)} followers`}
          hint={`Hybrid pulls accounts with at least this many followers. Here they receive ${formatPercent(result.pulledShare)} of all follows.`}
        />
        <div className="sm:col-span-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="fan-out" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Follower counts come from a power-law model, and every lookup takes about a millisecond, with one in a hundred hitting a 20 ms hiccup. Real feeds also
          rank posts, skip inactive followers, keep only a few hundred entries per feed and cache the celebrity’s posts. The numbers are illustrative.
        </p>
      </Callout>
    </div>
  );
}
