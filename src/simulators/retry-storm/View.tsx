import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { LineChart } from '../shared/LineChart';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { DEFAULT_CONFIG, runRetrySim, stormDiagram, type RetryPolicy, type RetrySimConfig } from './logic';

type UiConfig = Pick<RetrySimConfig, 'clients' | 'policy' | 'outageSec'>;

const CLIENTS = { min: 200, max: 1600, step: 100 };
const STALL = { min: 5, max: 40, step: 5 };
const X_TICKS = [0, 30, 60, 90, 120];
const CAPACITY = DEFAULT_CONFIG.capacity;
const START = DEFAULT_CONFIG.outageStartSec;

const POLICIES: { value: RetryPolicy; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'backoff', label: 'Backoff' },
  { value: 'jitter', label: 'With jitter' },
];

const POLICY_HINT: Record<RetryPolicy, string> = {
  immediate: 'Each app sends the request again the moment it times out.',
  backoff: 'Each app waits 1, 2, 4, 8, then 16 seconds after each failure in a row.',
  jitter: 'Each app waits a random time between zero and 1, 2, 4, 8, then 16 seconds.',
};

function snap(v: number, lo: number, hi: number, step: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v / step) * step));
}

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const num = (key: string, fallback: number) => (typeof preset?.[key] === 'number' ? (preset[key] as number) : fallback);
  const p = preset?.policy;
  return {
    clients: snap(num('clients', DEFAULT_CONFIG.clients), CLIENTS.min, CLIENTS.max, CLIENTS.step),
    policy: p === 'immediate' || p === 'backoff' || p === 'jitter' ? p : DEFAULT_CONFIG.policy,
    outageSec: snap(num('outageSec', DEFAULT_CONFIG.outageSec), STALL.min, STALL.max, STALL.step),
  };
}

/** A round axis maximum just above the data. */
function niceMax(v: number): number {
  for (const m of [500, 1000, 1500, 2000, 2500, 3000]) if (v <= m * 0.95) return m;
  return Math.ceil(v / 1000) * 1000;
}

const seconds = (s: number) => `${formatInt(s)} ${Math.round(s) === 1 ? 'second' : 'seconds'}`;

export default function RetryStormSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [seenBackoff, setSeenBackoff] = useState(false);
  const deferred = useDeferredValue(ui);
  const config = useMemo<RetrySimConfig>(() => ({ ...DEFAULT_CONFIG, ...deferred }), [deferred]);
  const result = useMemo(() => runRetrySim(config), [config]);
  const spec = useMemo(() => stormDiagram(config, result), [config, result]);
  // With jitter on, the same run with plain backoff, for comparison.
  const plain = useMemo(() => (config.policy === 'jitter' ? runRetrySim({ ...config, policy: 'backoff' }) : null), [config]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    setUi((u) => ({ ...u, ...patch }));
  };

  useEffect(() => {
    if (config.policy === 'backoff') setSeenBackoff(true);
  }, [config.policy]);

  const sentPoints = useMemo(() => [{ x: 0, y: result.normalLoad }, ...result.samples.map((s) => ({ x: s.t, y: s.sent }))], [result]);
  const answeredPoints = useMemo(() => [{ x: 0, y: result.normalLoad }, ...result.samples.map((s) => ({ x: s.t, y: s.answered }))], [result]);
  const wastedPoints = useMemo(() => [{ x: 0, y: 0 }, ...result.samples.map((s) => ({ x: s.t, y: s.wasted }))], [result]);

  const peakSent = result.samples.reduce((m, s) => Math.max(m, s.sent), 0);
  const loadMax = niceMax(Math.max(peakSent, CAPACITY * 1.2));
  const end = result.outageEndSec;
  const recovered = result.recoveredAfterSec !== null;
  const afterWork = result.afterFix.answered + result.afterFix.wasted;
  const wastedShare = afterWork > 0 ? result.afterFix.wasted / afterWork : 0;
  const stallRatio = result.normalLoad > 0 ? result.outageLoad / result.normalLoad : 0;

  const markers = [
    { x: START, label: `${START} s: the service stalls, and every app’s request fails at once` },
    { x: end, label: `${end} s: the stall is fixed` },
  ];

  const recoveredSentence = recovered
    ? `Every app had an answer again ${seconds(result.recoveredAfterSec!)} after the fix.`
    : 'The service never recovered during the run.';

  const challenges: Challenge[] = [
    {
      id: 'storm',
      prompt: 'With immediate retries, shorten the stall to 10 seconds or less. Does the service recover once the stall is fixed?',
      explanation: `Not with 900 apps, however short the stall. During it, the service’s queue fills with requests nobody is waiting for, and apps that retry the moment they time out roughly triple the traffic, to more than the ${formatInt(CAPACITY)} requests a second it can answer. So every new request waits behind the backlog, times out and is retried: the service is busy all the time and answers almost nothing. The trigger is long gone, but the storm keeps itself going. This run: ${formatInt(result.outageLoad)} requests a second during the stall. ${recoveredSentence}`,
      attempted: config.policy === 'immediate' && config.outageSec <= 10,
    },
    {
      id: 'headroom',
      prompt: 'Keep immediate retries and lower the number of apps until the service recovers on its own.',
      explanation: `Retrying apps send about three times their normal traffic. Once that tripled traffic fits within the ${formatInt(CAPACITY)} requests a second the service can answer, at about 500 apps here, the backlog drains and the service recovers. But at 500 apps the normal load is only about a quarter of capacity: with immediate retries, a service needs that much spare room to survive a stall. This run: normal load ${formatInt(result.normalLoad)} a second (${formatPercent(result.normalLoad / CAPACITY)} of capacity), ${formatInt(result.outageLoad)} a second during the stall. ${recoveredSentence}`,
      attempted: config.policy === 'immediate' && recovered && result.outageLoad < CAPACITY,
    },
    {
      id: 'waves',
      prompt: 'Switch to exponential backoff. What shape does the load take, and what happens when the next wave reaches the fixed service?',
      explanation: `Every app failed at the same moment, and plain backoff gives every app the same schedule: wait 1, 2, 4, 8, then 16 seconds. So the apps retry in lockstep, and the whole crowd arrives within about a second, followed by silence until the next wave. After the fix, the service sits idle until the next wave arrives all at once; if that wave is more than it can answer in time, part of the crowd fails again and waits another 16 seconds. This run: the biggest second after the fix brought ${formatInt(result.peakAfterFix)} requests, ${formatPercent(result.peakAfterFixRatio)} of capacity. ${recoveredSentence}`,
      attempted: config.policy === 'backoff',
    },
    {
      id: 'jitter',
      prompt: 'Now add jitter. Compare the peak after the fix, and the shape of the load, with plain backoff.',
      explanation: `Each app now waits a random time between zero and its backoff, so apps that failed together drift apart, and the waves melt into a smooth curve. After the fix, the retries trickle in instead of landing as one wave, so the service is not asked for far more than it can answer at once.${
        plain ? ` This run peaked at ${formatInt(result.peakAfterFix)} requests a second after the fix, against ${formatInt(plain.peakAfterFix)} with plain backoff.` : ''
      } ${recoveredSentence}`,
      attempted: seenBackoff && config.policy === 'jitter',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Retry storm simulator"
          intro="Two minutes of Snapgram apps calling the profile service. At 10 seconds the service stalls and every app’s request fails at once. Pick how the apps retry and watch what reaches the service once the stall is fixed."
        />
      ) : null}

      <Diagram spec={spec} variant="plain" />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat
            label="Load during the stall"
            value={`${formatInt(result.outageLoad)}/s`}
            note={`${stallRatio.toFixed(1)}× the normal ${formatInt(result.normalLoad)}/s`}
            tone={result.outageLoad > CAPACITY ? 'alert' : 'ink'}
          />
          <Stat
            label="Peak after the fix"
            value={`${formatInt(result.peakAfterFix)}/s`}
            note={`${formatPercent(result.peakAfterFixRatio)} of capacity`}
            tone={result.peakAfterFix > CAPACITY ? 'alert' : 'ink'}
          />
          <Stat
            label="Back to normal"
            value={recovered ? `${formatInt(result.recoveredAfterSec!)} s` : 'Never'}
            note={recovered ? 'after the fix, every app answered' : 'not within the two minutes'}
            tone={recovered ? 'success' : 'alert'}
          />
          <Stat
            label="Wasted work after the fix"
            value={formatPercent(wastedShare)}
            note="answers nobody was waiting for"
            tone={wastedShare > 0.5 ? 'alert' : 'ink'}
          />
        </div>
        <p className="tabular text-ui text-graphite">
          The service can answer {formatInt(CAPACITY)} requests a second. Before the stall, {formatInt(config.clients)} apps send about {formatInt(result.normalLoad)} a
          second, {formatPercent(result.normalLoad / CAPACITY)} of that. {recoveredSentence}
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <LineChart
          title="Requests reaching the profile service each second"
          series={[{ id: 'sent', label: 'Requests arriving', points: sentPoints }]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={loadMax}
          xTicks={X_TICKS}
          yTicks={[0, loadMax / 2, loadMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          thresholds={[{ y: CAPACITY, label: `Capacity, ${formatInt(CAPACITY)} a second` }]}
          markers={markers}
          height={200}
          summary={`Before the stall, about ${formatInt(result.normalLoad)} requests arrive each second. During the stall, about ${formatInt(
            result.outageLoad,
          )}. After the fix, the busiest second brings ${formatInt(result.peakAfterFix)}, against a capacity of ${formatInt(CAPACITY)}. ${recoveredSentence}`}
        />
        <LineChart
          title="What the service’s work went to each second"
          series={[
            { id: 'answered', label: 'Answered in time', points: answeredPoints },
            { id: 'wasted', label: 'Wasted work', points: wastedPoints, tone: 'alert' },
          ]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={CAPACITY}
          xTicks={X_TICKS}
          yTicks={[0, CAPACITY / 2, CAPACITY]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          markers={markers}
          height={170}
          summary={`After the fix, ${formatPercent(wastedShare)} of the service’s work went to requests whose apps had already given up.`}
        />
        <p className="text-small text-graphite">
          Red triangles along the top mark when the stall starts and when it is fixed. Wasted work is time the service spends on requests whose apps had already timed
          out and moved on.
        </p>
      </div>

      <ControlPanel>
        <Slider
          id="rs-clients"
          label="Apps"
          value={ui.clients}
          min={CLIENTS.min}
          max={CLIENTS.max}
          step={CLIENTS.step}
          onChange={(clients) => update({ clients })}
          format={(v) => `${formatInt(v)} apps`}
          hint="Each app asks for a profile every few seconds, and waits one second for each answer."
        />
        <Slider
          id="rs-stall"
          label="Stall length"
          value={ui.outageSec}
          min={STALL.min}
          max={STALL.max}
          step={STALL.step}
          onChange={(outageSec) => update({ outageSec })}
          format={(v) => seconds(v)}
          hint={`From the ${START}-second mark, the service answers nothing.`}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Retry policy</span>
          <Segmented<RetryPolicy> label="Retry policy" size="sm" value={ui.policy} onChange={(policy) => update({ policy })} options={POLICIES} />
          <p className="text-small text-graphite">{POLICY_HINT[ui.policy]}</p>
        </div>
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

      <Challenges simId="retry-storm" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Every app fails at the same instant when the stall begins, as if it had dropped every connection; in real outages failures are more spread out, so real
          waves are blurrier. Apps retry until they get an answer, with no limit on attempts and no retry budget. The service answers requests strictly in order,
          never drops ones that have waited too long, and never adds servers. Real systems also shed load and use circuit breakers.
        </p>
      </Callout>
    </div>
  );
}
