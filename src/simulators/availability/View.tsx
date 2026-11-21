import { useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { SimHeader, Stat } from '../shared/SimParts';
import {
  AVAILABILITY_STEPS,
  DEFAULT_STAGES,
  KINDS,
  KIND_ORDER,
  MAX_COPIES,
  MAX_STAGES,
  addStage,
  chainDiagram,
  chainUnavailability,
  challengeProgress,
  downtimeSeconds,
  formatAvailability,
  formatDuration,
  ninesCount,
  parseStages,
  removeStage,
  stageUnavailability,
  updateStage,
  weakestStageIds,
  type ComponentKind,
  type Stage,
} from './logic';

const COPY_OPTIONS = Array.from({ length: MAX_COPIES }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function stepIndex(a: number): number {
  let best = 0;
  AVAILABILITY_STEPS.forEach((s, i) => {
    if (Math.abs(s - a) < Math.abs(AVAILABILITY_STEPS[best]! - a)) best = i;
  });
  return best;
}

export default function AvailabilitySimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => parseStages(typeof preset?.stages === 'string' ? preset.stages : undefined) ?? DEFAULT_STAGES, [preset]);
  const [stages, setStages] = useState<Stage[]>(initial);
  const [touched, setTouched] = useState(false);

  const change = (next: Stage[]) => {
    setTouched(true);
    setStages(next);
  };

  const u = chainUnavailability(stages);
  const nines = ninesCount(u);
  const spec = useMemo(() => chainDiagram(stages), [stages]);
  const weakest = weakestStageIds(stages);
  const progress = challengeProgress(stages);
  const yearly = downtimeSeconds(u, 'year');

  const challenges: Challenge[] = [
    {
      id: 'series',
      prompt: 'Chain three single components in series. Is the chain better or worse than its weakest part?',
      explanation:
        'Worse. Three 99.9% parts in series give 0.999 × 0.999 × 0.999 ≈ 99.7%: about 26 hours of downtime a year instead of 8.8. A request needs every stage, so each one adds its own chance of failure, like a string of old holiday lights.',
      attempted: progress.series,
    },
    {
      id: 'parallel',
      prompt: 'How many 99% copies in parallel does it take to beat one 99.99% component?',
      explanation:
        'Three. Two copies are both down only 1% × 1% = 0.01% of the time, which ties at exactly 99.99%; three copies reach 99.9999%. Cheap parts become reliable in parallel, as long as they fail independently.',
      attempted: progress.parallel,
    },
    {
      id: 'four-nines',
      prompt: 'Reach four nines (99.99%) with a chain of two or more stages, using only 99.9% components.',
      explanation:
        'Every stage needs a second copy, because a single 99.9% part caps the whole chain at 99.9%. Two copies make each stage 99.9999%, so even three stages in series stay above 99.999%.',
      attempted: progress.fourNines,
    },
    {
      id: 'weakest-link',
      prompt: 'Put a 99.999% component in the same chain as a 99% one. Is the chain closer to 99.999% or to 99%?',
      explanation:
        'Closer to 99%: 0.99999 × 0.99 ≈ 98.99%. A chain can never beat its weakest stage, so improve that one before polishing the others.',
      attempted: progress.weakestLink,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Availability calculator"
          intro="Snapgram’s request path as a chain. Every stage must work, and a stage works while any one of its copies does. Swap parts, add copies and watch the downtime."
        />
      ) : null}

      <Diagram spec={spec} variant="plain" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Combined availability"
          value={formatAvailability(u)}
          note={stages.length === 1 ? 'One stage' : `${stages.length} stages in series`}
        />
        <Stat
          label="Nines"
          value={nines > 9 ? '9+' : String(nines)}
          note={nines >= 1 && nines <= 9 ? `At least ${formatAvailability(Math.pow(10, -nines))}` : 'Fewer than two'}
        />
        <Stat label="Downtime per year" value={formatDuration(yearly)} tone={yearly > 86_400 ? 'alert' : 'ink'} />
        <Stat label="Downtime per month" value={formatDuration(downtimeSeconds(u, 'month'))} note="A 30-day month" />
      </div>

      <section aria-label="Stages in the chain" className="flex flex-col gap-4">
        <div className="measure flex flex-col gap-1">
          <h3 className="text-h3 font-bold text-ink">The chain, in series</h3>
          <p className="text-ui text-graphite">A request passes through every stage in order. Add copies to a stage to put them in parallel.</p>
        </div>
        <ol className="grid gap-4 md:grid-cols-2">
          {stages.map((s, i) => (
            <StageCard
              key={s.id}
              stage={s}
              index={i}
              weakest={weakest.includes(s.id)}
              canRemove={stages.length > 1}
              onChange={(patch) => change(updateStage(stages, s.id, patch))}
              onRemove={() => change(removeStage(stages, s.id))}
            />
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" onClick={() => change(addStage(stages))} disabled={stages.length >= MAX_STAGES}>
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Add a component in series
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStages(initial)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting chain
          </Button>
          {stages.length >= MAX_STAGES ? <span className="text-small text-graphite">Six stages is the most this calculator shows.</span> : null}
        </div>
      </section>

      <Challenges simId="availability" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          The maths assumes copies fail independently and that switching to a working copy is instant. Real failures are often shared:
          a power cut, a bad deploy or a cloud region outage can take every copy down at once. Real numbers also include planned
          maintenance and partial failures, such as a server that answers slowly instead of not at all.
        </p>
      </Callout>
    </div>
  );
}

function StageCard({
  stage,
  index,
  weakest,
  canRemove,
  onChange,
  onRemove,
}: {
  stage: Stage;
  index: number;
  weakest: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Omit<Stage, 'id'>>) => void;
  onRemove: () => void;
}) {
  const kindId = `avail-kind-${stage.id}`;
  const stageU = stageUnavailability(stage);
  return (
    <li className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={kindId} className="text-ui font-semibold text-ink">
            Stage {index + 1}
          </label>
          <select
            id={kindId}
            value={stage.kind}
            onChange={(e) => {
              const kind = e.target.value as ComponentKind;
              onChange({ kind, availability: KINDS[kind].availability });
            }}
            className="h-8 rounded-control border border-control bg-paper px-2 text-ui text-ink"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={!canRemove} aria-label={`Remove stage ${index + 1}`}>
          <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Remove
        </Button>
      </div>
      <Slider
        id={`avail-a-${stage.id}`}
        label="Availability of each copy"
        value={stepIndex(stage.availability)}
        min={0}
        max={AVAILABILITY_STEPS.length - 1}
        onChange={(i) => onChange({ availability: AVAILABILITY_STEPS[i] ?? stage.availability })}
        format={(i) => formatAvailability(1 - (AVAILABILITY_STEPS[i] ?? stage.availability))}
        hint={`On its own, down about ${formatDuration(downtimeSeconds(1 - stage.availability, 'year'))} a year.`}
      />
      <div className="flex flex-col gap-2">
        <span className="text-ui font-semibold text-ink">Copies in parallel</span>
        <Segmented
          label={`Copies in parallel for stage ${index + 1}`}
          value={String(stage.copies)}
          onChange={(v) => onChange({ copies: Number(v) })}
          options={COPY_OPTIONS}
          className="self-start"
        />
      </div>
      <p className="text-small text-graphite">
        This stage is up <span className="tabular font-semibold text-ink">{formatAvailability(stageU)}</span> of the time
        {weakest ? ': the weakest link in the chain.' : '.'}
      </p>
    </li>
  );
}
