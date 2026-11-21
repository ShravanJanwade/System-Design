import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider, Toggle } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { LineChart } from '../shared/LineChart';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { DEFAULT_CONFIG, queueDiagram, runQueueSim, type QueueSimConfig, type WhenFull } from './logic';

type UiConfig = Pick<QueueSimConfig, 'rate' | 'spike' | 'consumers' | 'speed' | 'poison' | 'dlq' | 'maxDepth' | 'whenFull'>;

const LIMIT_STEPS = [0, 100, 200, 300, 500, 1000];
const SPIKE_END = DEFAULT_CONFIG.spikeStartSec + DEFAULT_CONFIG.spikeSec;
const X_TICKS = [0, 30, 60, 90, 120];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function nearestIndex(steps: number[], v: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i]! - v) < Math.abs(steps[best]! - v)) best = i;
  return best;
}

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const num = (key: string, fallback: number) => (typeof preset?.[key] === 'number' ? (preset[key] as number) : fallback);
  const bool = (key: string, fallback: boolean) => (typeof preset?.[key] === 'boolean' ? (preset[key] as boolean) : fallback);
  return {
    rate: clamp(num('rate', DEFAULT_CONFIG.rate), 5, 60),
    spike: bool('spike', DEFAULT_CONFIG.spike),
    consumers: clamp(num('consumers', DEFAULT_CONFIG.consumers), 1, 12),
    speed: clamp(num('speed', DEFAULT_CONFIG.speed), 1, 10),
    poison: bool('poison', DEFAULT_CONFIG.poison),
    dlq: bool('dlq', DEFAULT_CONFIG.dlq),
    maxDepth: LIMIT_STEPS[nearestIndex(LIMIT_STEPS, num('maxDepth', DEFAULT_CONFIG.maxDepth))]!,
    whenFull: preset?.whenFull === 'wait' ? 'wait' : 'reject',
  };
}

/** A round axis maximum just above the data. */
function niceMax(v: number): number {
  for (const m of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) if (v <= m * 0.95) return m;
  return Math.ceil(v / 10000) * 10000;
}

function formatSeconds(s: number): string {
  return `${s.toFixed(s < 10 ? 1 : 0)} s`;
}

type Seen = { poisonNoDlq: boolean; poisonDlq: boolean; rejectFull: boolean; waitFull: boolean };

export default function MessageQueueSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [seen, setSeen] = useState<Seen>({ poisonNoDlq: false, poisonDlq: false, rejectFull: false, waitFull: false });
  const deferred = useDeferredValue(ui);
  const config = useMemo<QueueSimConfig>(() => ({ ...DEFAULT_CONFIG, ...deferred }), [deferred]);
  const result = useMemo(() => runQueueSim(config), [config]);
  const spec = useMemo(() => queueDiagram(config, result), [config, result]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    setUi((u) => ({ ...u, ...patch }));
  };

  // Remember which poison and backpressure situations the learner has actually seen.
  useEffect(() => {
    setSeen((s) => {
      const filled = config.maxDepth > 0 && result.firstFullAtSec !== null;
      const next: Seen = {
        poisonNoDlq: s.poisonNoDlq || (config.poison && !config.dlq),
        poisonDlq: s.poisonDlq || (config.poison && config.dlq),
        rejectFull: s.rejectFull || (filled && config.whenFull === 'reject'),
        waitFull: s.waitFull || (filled && config.whenFull === 'wait'),
      };
      return next.poisonNoDlq === s.poisonNoDlq && next.poisonDlq === s.poisonDlq && next.rejectFull === s.rejectFull && next.waitFull === s.waitFull
        ? s
        : next;
    });
  }, [config, result]);

  const depthPoints = useMemo(() => [{ x: 0, y: 0 }, ...result.samples.map((s) => ({ x: s.t, y: s.depth }))], [result]);
  const heldPoints = useMemo(() => [{ x: 0, y: 0 }, ...result.samples.map((s) => ({ x: s.t, y: s.held }))], [result]);
  const lagPoints = useMemo(() => [{ x: 0, y: 0 }, ...result.samples.map((s) => ({ x: s.t, y: s.lagSec }))], [result]);

  const showHeld = config.maxDepth > 0 && config.whenFull === 'wait' && result.peak.held > 0;
  const depthMax = niceMax(Math.max(result.peak.depth, showHeld ? result.peak.held : 0, config.maxDepth, 8));
  const lagMax = niceMax(Math.max(result.peak.lagSec, 4));

  const markers = [
    ...(config.spike
      ? [
          { x: DEFAULT_CONFIG.spikeStartSec, label: `${DEFAULT_CONFIG.spikeStartSec} s: the spike starts, uploads triple` },
          { x: SPIKE_END, label: `${SPIKE_END} s: the spike ends` },
        ]
      : []),
    ...(result.allStuckAtSec !== null ? [{ x: result.allStuckAtSec, label: `${Math.round(result.allStuckAtSec)} s: every worker is stuck on a broken photo` }] : []),
  ];

  const sampleAt = (t: number) => result.samples.find((s) => s.t === t)?.depth ?? 0;
  const growing = result.end.depth > 50 && result.end.depth > sampleAt(90) + 20;
  const lastSecondProcessed = result.samples[result.samples.length - 1]?.processed ?? 0;

  const spikeExplanation = `For 15 seconds, uploads arrive three times as fast, faster than the workers can go. Nothing is turned away: the extra jobs wait in line, and the queue peaked at ${formatInt(result.peak.depth)}. ${
    result.drainedAtSec !== null
      ? `It was empty again ${Math.round(result.drainedAtSec - SPIKE_END)} seconds after the spike ended.`
      : `It still had ${formatInt(result.end.depth)} waiting at the end of the run.`
  } Workers gain on the backlog only by what they finish beyond the normal rate, so spare capacity decides how fast a spike drains.`;

  const challenges: Challenge[] = [
    {
      id: 'drain',
      prompt: 'Add workers until the queue stops growing.',
      explanation:
        'Three workers finish 15 jobs a second while 20 arrive, so about 5 more pile up every second and the wait grows with them. Four workers exactly match the rate and leave no slack for bursts. Five finish 25 a second, and the queue stays nearly empty. A queue absorbs bursts, but over time the workers must beat the average rate.',
      attempted: !config.spike && config.consumers > initial.consumers && result.capacityPerSec > config.rate && result.end.depth < 20,
    },
    {
      id: 'spike',
      prompt: 'With enough workers to keep up, turn on the celebrity spike. Where do the extra uploads go, and how long does the queue take to drain?',
      explanation: spikeExplanation,
      attempted: config.spike && result.capacityPerSec > config.rate,
    },
    {
      id: 'poison',
      prompt: 'Turn on broken photos with the dead-letter queue off. Then turn the dead-letter queue back on.',
      explanation:
        'Without a dead-letter queue, a broken photo goes back to the front of the queue after each failure, and the same worker picks it up again, forever. Every broken photo that reaches a worker takes it out of action, so capacity drains away and the backlog grows faster and faster. With the dead-letter queue, each one fails three times, moves aside for an engineer to inspect, and the workers carry on.',
      attempted: seen.poisonNoDlq && seen.poisonDlq,
    },
    {
      id: 'backpressure',
      prompt: 'Limit the queue to 300 messages, turn on the spike, and try both ways of handling a full queue.',
      explanation:
        'Once the queue is full, something has to give. Rejecting fails new uploads fast, so the app can ask people to try again later; waiting holds uploads at the producers, which slows them to the workers’ pace. Either way the queue, and the wait inside it, stays bounded: overload becomes visible to producers instead of piling up unseen.',
      attempted: seen.rejectFull && seen.waitFull,
    },
  ];

  const backpressureStat =
    config.maxDepth === 0
      ? { value: 'Off', note: 'no queue limit', tone: 'ink' as const }
      : config.whenFull === 'reject'
        ? { value: formatInt(result.totals.rejected), note: 'uploads rejected', tone: result.totals.rejected > 0 ? ('alert' as const) : ('ink' as const) }
        : { value: formatInt(result.peak.held), note: 'uploads held back at the peak', tone: result.peak.held > 0 ? ('alert' as const) : ('ink' as const) };

  const dlqStat = config.dlq
    ? { value: formatInt(result.totals.deadLettered), note: `${formatInt(result.totals.failedAttempts)} failed attempts`, tone: 'ink' as const }
    : {
        value: 'Off',
        note: result.end.stuck > 0 ? `${result.end.stuck} of ${config.consumers} workers stuck` : 'no broken photos so far',
        tone: result.end.stuck > 0 ? ('alert' as const) : ('ink' as const),
      };

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Message queue simulator"
          intro="Two minutes of Snapgram uploads, each one a thumbnail job on a queue. Change one thing at a time and watch the queue, the wait and the dead-letter queue."
        />
      ) : null}

      <Diagram spec={spec} variant="plain" />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat label="Waiting now" value={formatInt(result.end.depth)} note={`peak ${formatInt(result.peak.depth)}`} tone={growing ? 'alert' : 'ink'} />
          <Stat
            label="Consumer lag"
            value={formatSeconds(result.end.lagSec)}
            note={`oldest wait; peak ${formatSeconds(result.peak.lagSec)}`}
            tone={result.end.lagSec > 10 ? 'alert' : 'ink'}
          />
          <Stat label="Backpressure" value={backpressureStat.value} note={backpressureStat.note} tone={backpressureStat.tone} />
          <Stat label="Dead-letter queue" value={dlqStat.value} note={dlqStat.note} tone={dlqStat.tone} />
        </div>
        <p className="tabular text-ui text-graphite">
          Uploads arrive at {formatInt(config.rate)} a second{config.spike ? ` (${formatInt(config.rate * DEFAULT_CONFIG.spikeFactor)} during the spike)` : ''}. The workers can
          finish {formatInt(result.capacityPerSec)} a second, and finished {formatInt(lastSecondProcessed)} in the last second.
          {growing ? ' The queue is still growing.' : ''}
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <LineChart
          title="Messages waiting in the queue"
          series={[
            { id: 'depth', label: 'In the queue', points: depthPoints },
            ...(showHeld ? [{ id: 'held', label: 'Held back by producers', points: heldPoints, tone: 'graphite' as const }] : []),
          ]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={depthMax}
          xTicks={X_TICKS}
          yTicks={[0, depthMax / 2, depthMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          thresholds={config.maxDepth > 0 ? [{ y: config.maxDepth, label: `Queue limit, ${formatInt(config.maxDepth)}` }] : []}
          markers={markers}
          height={180}
          summary={`The queue peaks at ${formatInt(result.peak.depth)} messages and ends with ${formatInt(result.end.depth)} waiting.${
            showHeld ? ` Producers held back up to ${formatInt(result.peak.held)} uploads.` : ''
          }`}
        />
        <LineChart
          title="Consumer lag: how long the oldest message has waited"
          series={[{ id: 'lag', label: 'Oldest wait', points: lagPoints, tone: 'graphite' }]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={lagMax}
          xTicks={X_TICKS}
          yTicks={[0, lagMax / 2, lagMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => `${v} s`}
          markers={markers}
          height={160}
          summary={`The oldest message waits up to ${formatSeconds(result.peak.lagSec)}, and ${formatSeconds(result.end.lagSec)} at the end.`}
        />
        {markers.length ? (
          <p className="text-small text-graphite">
            Red triangles along the top mark {config.spike ? 'when the spike starts and ends' : ''}
            {config.spike && result.allStuckAtSec !== null ? ', and ' : ''}
            {result.allStuckAtSec !== null ? 'the moment every worker got stuck' : ''}.
          </p>
        ) : null}
      </div>

      <ControlPanel>
        <Slider
          id="mq-rate"
          label="Uploads per second"
          value={ui.rate}
          min={5}
          max={60}
          onChange={(rate) => update({ rate })}
          format={(v) => `${v} per second`}
          hint="Each upload adds one thumbnail job to the queue."
        />
        <Toggle
          id="mq-spike"
          label="Celebrity spike"
          description={`Uploads triple for 15 seconds, from the ${DEFAULT_CONFIG.spikeStartSec}-second mark.`}
          checked={ui.spike}
          onChange={(spike) => update({ spike })}
        />
        <Slider
          id="mq-consumers"
          label="Workers"
          value={ui.consumers}
          min={1}
          max={12}
          onChange={(consumers) => update({ consumers })}
          format={(v) => (v === 1 ? '1 worker' : `${v} workers`)}
          hint={`Together they finish ${formatInt(ui.consumers * ui.speed)} jobs per second.`}
        />
        <Slider
          id="mq-speed"
          label="Worker speed"
          value={ui.speed}
          min={1}
          max={10}
          onChange={(speed) => update({ speed })}
          format={(v) => `${v} jobs/s each`}
          hint={`${formatInt(1000 / ui.speed)} ms per thumbnail job.`}
        />
        <Toggle
          id="mq-poison"
          label="Broken photos"
          description="Every 15 seconds, one upload is a corrupted file that fails every time."
          checked={ui.poison}
          onChange={(poison) => update({ poison })}
        />
        <Toggle
          id="mq-dlq"
          label="Dead-letter queue"
          description={`Move a job aside after ${DEFAULT_CONFIG.maxAttempts} failed attempts.`}
          checked={ui.dlq}
          onChange={(dlq) => update({ dlq })}
        />
        <Slider
          id="mq-limit"
          label="Queue limit"
          value={nearestIndex(LIMIT_STEPS, ui.maxDepth)}
          min={0}
          max={LIMIT_STEPS.length - 1}
          onChange={(i) => update({ maxDepth: LIMIT_STEPS[i]! })}
          format={(i) => (LIMIT_STEPS[i] === 0 ? 'No limit' : `${formatInt(LIMIT_STEPS[i]!)} messages`)}
          hint="The most jobs the queue will hold."
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">When the queue is full</span>
          <Segmented<WhenFull>
            label="When the queue is full"
            value={ui.whenFull}
            onChange={(whenFull) => update({ whenFull })}
            options={[
              { value: 'reject', label: 'Reject uploads' },
              { value: 'wait', label: 'Make producers wait' },
            ]}
          />
          <p className="text-small text-graphite">
            {ui.maxDepth === 0
              ? 'Applies once you set a queue limit.'
              : ui.whenFull === 'reject'
                ? 'New uploads fail fast while the queue is full.'
                : 'Producers hold uploads and retry, slowing to the workers’ pace.'}
          </p>
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

      <Challenges simId="message-queue" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Time moves in steps of {DEFAULT_CONFIG.tickMs} ms, uploads arrive at random around the chosen rate, and every job takes exactly the same time. A failed job
          goes straight back to the front of the queue, so the same worker picks it up again. In a strictly ordered log, such as one Kafka partition, a failing
          message would instead block everything behind it. Real systems also add retry delays, visibility timeouts and autoscaling.
        </p>
      </Callout>
    </div>
  );
}
