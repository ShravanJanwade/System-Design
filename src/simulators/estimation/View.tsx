import { useMemo, useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  STEPS,
  challengeStatus,
  estimate,
  estimateDiagram,
  explain,
  formatBits,
  formatBytes,
  formatRate,
  formatRough,
  inputsFromPreset,
  withValue,
  type EstimationInputs,
} from './logic';

type Field = keyof EstimationInputs;

const FIELDS: { key: Field; label: string; hint: string; format: (v: number) => string }[] = [
  { key: 'dau', label: 'Daily active users', hint: 'People who use the app on a typical day.', format: (v) => formatRough(v) },
  { key: 'actionsPerUser', label: 'Actions per user per day', hint: 'Every request a user makes: views and uploads together.', format: (v) => formatRough(v) },
  { key: 'readsPerWrite', label: 'Read/write ratio', hint: 'Reads for every write. Photo and social apps read far more than they write.', format: (v) => `${formatRough(v)} to 1` },
  { key: 'objectBytes', label: 'Object size', hint: 'One photo, post or record, as stored and as downloaded.', format: (v) => formatBytes(v) },
  { key: 'peakFactor', label: 'Peak factor', hint: 'Traffic in the busiest hour compared with the daily average.', format: (v) => `${formatRough(v)}×` },
  { key: 'retentionYears', label: 'Retention', hint: 'How long you keep what users upload.', format: (v) => `${v} year${v === 1 ? '' : 's'}` },
];

export default function EstimationSimulator({ preset, embedded }: SimulatorProps) {
  const start = useMemo(() => inputsFromPreset(preset), [preset]);
  const steps = useMemo(() => {
    const out = {} as Record<Field, number[]>;
    for (const f of FIELDS) out[f.key] = withValue(STEPS[f.key], start[f.key]);
    return out;
  }, [start]);
  const [inputs, setInputs] = useState<EstimationInputs>(start);
  const [touched, setTouched] = useState(false);

  const est = useMemo(() => estimate(inputs), [inputs]);
  const metrics = useMemo(() => explain(est), [est]);
  const spec = useMemo(() => estimateDiagram(est), [est]);
  const R = est.rough;
  const status = challengeStatus(inputs, start);

  const set = (key: Field, value: number) => {
    setTouched(true);
    setInputs((i) => ({ ...i, [key]: value }));
  };

  const challenges: Challenge[] = [
    {
      id: 'growth',
      prompt: 'The founders ask what happens with ten times the users. Raise daily active users tenfold. Which results grow ten times?',
      explanation:
        'All of them. Every result here is users times something, so ten times the users means ten times the requests, storage, bandwidth and cache. Once one estimate is written down, a question about ten times the traffic takes seconds.',
      attempted: status.growth,
    },
    {
      id: 'size',
      prompt: 'Double the object size. Which results change, and which stay the same?',
      explanation:
        'Storage, bandwidth and cache size double, but requests per second do not move. How many requests arrive depends on what users do, not on how big each object is, so heavy objects and heavy traffic need different fixes.',
      attempted: status.size,
    },
    {
      id: 'ratio',
      prompt: 'Set the read/write ratio to 1 to 1. What happens to storage, and why?',
      explanation:
        'Storage jumps about 50 times while total requests per second stay the same. Only writes create data: at 100 reads per write, 1 action in 101 is an upload, while at 1 to 1 every second action is.',
      attempted: status.ratio,
    },
    {
      id: 'small-cache',
      prompt: 'Snapgram would cache photo details, about 1 KB each, rather than the photos. Set the object size to 1 KB. Does the cache fit in one server’s memory now?',
      explanation:
        'Yes: about 20 GB instead of 20 TB, small enough for the memory of one large server. That is the usual design: a content delivery network serves the photos, and the cache keeps the small records every page needs.',
      attempted: status['small-cache'],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Estimation calculator"
          intro="State your assumptions, and the calculator works out requests per second, storage, bandwidth and cache size. Every result shows the rounded interview math and the exact math, line by line."
        />
      ) : null}

      <ControlPanel>
        {FIELDS.map((f) => {
          const list = steps[f.key];
          const index = Math.max(0, list.indexOf(inputs[f.key]));
          return (
            <Slider
              key={f.key}
              id={`estimation-${f.key}`}
              label={f.label}
              value={index}
              min={0}
              max={list.length - 1}
              onChange={(i) => set(f.key, list[i]!)}
              format={(i) => f.format(list[i]!)}
              hint={f.hint}
            />
          );
        })}
        <div className="sm:col-span-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setInputs(start);
            }}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting assumptions
          </Button>
        </div>
      </ControlPanel>

      <Diagram spec={spec} variant="plain" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Requests at peak" value={`${formatRough(R.peakRps)}/s`} note="reads and writes" />
        <Stat label={`Storage, ${inputs.retentionYears} year${inputs.retentionYears === 1 ? '' : 's'}`} value={formatBytes(R.storageTotal)} note={`${formatBytes(R.storagePerDay)} a day`} />
        <Stat label="Bandwidth out at peak" value={formatRate(R.outPeak)} note={`about ${formatBits(R.outPeak)}`} />
        <Stat label="Cache (80/20 rule)" value={formatBytes(R.cacheBytes)} note="20% of a day’s reads" />
      </div>

      <section aria-label="Results with their math" className="flex flex-col gap-2">
        <h3 className="text-h3 font-bold text-ink">Every result, with its math</h3>
        <p className="text-ui text-graphite">The big number is the interview estimate: a day is about 100,000 seconds and each step is rounded. Open a row for the math.</p>
        <ul className="divide-y divide-rule rounded-card border border-rule bg-paper">
          {metrics.map((m) => (
            <li key={m.id}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-control [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2 text-ui text-ink">
                    <ChevronRight className="h-4 w-4 shrink-0 text-graphite transition-transform ease-ui group-open:rotate-90" strokeWidth={1.5} aria-hidden />
                    {m.label}
                  </span>
                  <span className="tabular flex flex-col items-end text-right">
                    <span className="text-ui-lg font-semibold text-ink">{m.rough}</span>
                    <span className="text-small text-graphite">exact {m.exact}</span>
                    {m.note ? <span className="text-small text-graphite">{m.note}</span> : null}
                  </span>
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-small font-semibold text-graphite">Interview math</p>
                    <ol className="tabular mt-1 list-decimal space-y-1 pl-5 text-ui text-ink">
                      {m.roughMath.map((line, i) => (
                        <li key={i}>
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="text-small font-semibold text-graphite">Exact math</p>
                    <ol className="tabular mt-1 list-decimal space-y-1 pl-5 text-ui text-ink">
                      {m.exactMath.map((line, i) => (
                        <li key={i}>
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <Challenges simId="estimation" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Every read and write here moves one whole object, and the cache rule counts every read as a different object, so it overestimates.
          Real photo apps also store several sizes of each upload, send phones the small ones, and serve most of them from a content delivery
          network.
        </p>
      </Callout>
    </div>
  );
}
