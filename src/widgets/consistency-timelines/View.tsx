import { useId, useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Segmented } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  MODEL_INFO,
  MODEL_ORDER,
  PEOPLE,
  SCENARIOS,
  SCENARIO_ORDER,
  describeTimeline,
  formatTime,
  judgementsUpTo,
  type Judgement,
  type ModelId,
  type Scenario,
  type ScenarioEvent,
  type ScenarioId,
} from './logic';

/* Timeline geometry, in viewBox units. The SVG scales to the card's width. */
const W = 320;
const LEFT = 74;
const RIGHT = 14;
const TOP = 22;
const LANE = 30;

function xOf(s: Scenario, t: number): number {
  return LEFT + (t / s.duration) * (W - LEFT - RIGHT);
}

function laneY(i: number): number {
  return TOP + 12 + i * LANE;
}

function Timeline({ scenario, model, stepIndex, reduced }: { scenario: Scenario; model: ModelId; stepIndex: number; reduced: boolean }) {
  const lanes = scenario.lanes;
  const axisY = laneY(lanes.length - 1) + 22;
  const height = axisY + 22;
  const current = scenario.events[stepIndex]!;
  const sync = scenario.events.find((e) => e.kind === 'sync');
  const shown = (i: number) => i <= stepIndex;
  const ticks = Array.from({ length: scenario.duration + 1 }, (_, t) => t);
  const laneOf = (e: ScenarioEvent) => (e.kind === 'write' || e.kind === 'read' ? lanes.indexOf(e.by) : -1);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={describeTimeline(scenario, model, stepIndex)} className="block">
      {lanes.map((p, i) => (
        <g key={p}>
          <text x={8} y={laneY(i) - 1} fontSize={12} fontWeight={600} fill="var(--panel-text)">
            {PEOPLE[p].name}
          </text>
          <text x={8} y={laneY(i) + 11} fontSize={11} fill="var(--panel-muted)">
            {PEOPLE[p].region}
          </text>
          <line x1={xOf(scenario, 0)} x2={xOf(scenario, scenario.duration)} y1={laneY(i)} y2={laneY(i)} stroke="var(--panel-line)" strokeWidth={1} />
        </g>
      ))}

      {sync ? (
        <g>
          {/* Events still ahead fade their marks; their labels switch to the muted color so they stay readable. */}
          <line
            x1={xOf(scenario, sync.at)}
            x2={xOf(scenario, sync.at)}
            y1={TOP - 4}
            y2={axisY}
            stroke="var(--panel-success)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={shown(scenario.events.indexOf(sync)) ? 1 : 0.3}
          />
          <text
            x={xOf(scenario, sync.at)}
            y={TOP - 9}
            fontSize={11}
            textAnchor="middle"
            fill={shown(scenario.events.indexOf(sync)) ? 'var(--panel-success)' : 'var(--panel-muted)'}
          >
            copies caught up
          </text>
        </g>
      ) : null}

      <line x1={xOf(scenario, 0)} x2={xOf(scenario, scenario.duration)} y1={axisY} y2={axisY} stroke="var(--panel-muted)" strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xOf(scenario, t)} x2={xOf(scenario, t)} y1={axisY} y2={axisY + 4} stroke="var(--panel-muted)" strokeWidth={1} />
          <text x={xOf(scenario, t)} y={axisY + 15} fontSize={11} textAnchor="middle" fill="var(--panel-muted)" className="tabular">
            {formatTime(t)}
          </text>
        </g>
      ))}

      <line
        x1={0}
        x2={0}
        y1={TOP - 4}
        y2={axisY}
        stroke="var(--signal)"
        strokeWidth={2}
        style={{ transform: `translateX(${xOf(scenario, current.at)}px)`, transition: reduced ? 'none' : 'transform 240ms ease-out' }}
      />

      {scenario.events.map((e, i) => {
        const lane = laneOf(e);
        if (lane < 0) return null;
        const x = xOf(scenario, e.at);
        const y = laneY(lane);
        const isCurrent = i === stepIndex;
        const opacity = shown(i) ? 1 : 0.3;
        if (e.kind === 'write') {
          return (
            <g key={e.id}>
              <rect x={x - 5} y={y - 5} width={10} height={10} rx={2} fill="var(--signal)" stroke={isCurrent ? 'var(--panel-text)' : 'none'} strokeWidth={1.5} opacity={opacity} />
              <text x={x} y={y - 9} fontSize={11} textAnchor="middle" fill={shown(i) ? 'var(--panel-text)' : 'var(--panel-muted)'}>
                {e.short}
              </text>
            </g>
          );
        }
        if (e.kind !== 'read') return null;
        return (
          <g key={e.id}>
            <circle
              cx={x}
              cy={y}
              r={isCurrent ? 6 : 5}
              fill="var(--panel)"
              stroke={isCurrent ? 'var(--signal)' : 'var(--panel-text)'}
              strokeWidth={isCurrent ? 2.5 : 1.5}
              opacity={opacity}
            />
            <text x={x} y={y + 16} fontSize={11} fontWeight={isCurrent ? 700 : 400} textAnchor="middle" fill={isCurrent ? 'var(--signal)' : 'var(--panel-muted)'}>
              R{e.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ValueChip({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-small font-semibold',
        allowed ? 'bg-success-wash text-success' : 'bg-wash text-graphite',
      )}
    >
      {allowed ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden /> : <X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />}
      <span className="sr-only">{allowed ? 'may return' : 'never returns'} </span>
      <span className={allowed ? '' : 'line-through'}>{label}</span>
    </span>
  );
}

function ReadRow({ j, current }: { j: Judgement; current: boolean }) {
  const banned = j.verdicts.filter((v) => !v.allowed);
  return (
    <li className={cn('flex flex-col gap-1.5 rounded-control px-2 py-2', current ? 'bg-blueprint-wash' : '')}>
      <p className="text-small font-semibold text-ink">
        <span className="tabular">R{j.read.n}</span>: {PEOPLE[j.read.by].name}, {formatTime(j.read.at)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {j.verdicts.map((v) => (
          <ValueChip key={v.value.key} label={v.value.label} allowed={v.allowed} />
        ))}
      </div>
      {current ? (
        <div className="flex flex-col gap-1 text-small text-graphite">
          <p>{j.summary}</p>
          {banned.length ? (
            <ul className="flex flex-col gap-1">
              {banned.map((v) => (
                <li key={v.value.key}>
                  <span className="font-semibold text-ink">Never {v.value.label}.</span> {v.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ModelCard({ scenario, model, stepIndex, reduced }: { scenario: Scenario; model: ModelId; stepIndex: number; reduced: boolean }) {
  const headingId = useId();
  const judgements = useMemo(() => judgementsUpTo(scenario, model, stepIndex), [scenario, model, stepIndex]);
  const current = scenario.events[stepIndex]!;
  const info = MODEL_INFO[model];
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper p-3 sm:p-4">
      <div>
        <h4 id={headingId} className="text-ui-lg font-semibold text-ink">
          {info.title}
        </h4>
        <p className="text-small text-graphite">{info.promise}</p>
      </div>
      <div className="on-panel blueprint-grid rounded-panel px-1 py-2">
        <Timeline scenario={scenario} model={model} stepIndex={stepIndex} reduced={reduced} />
      </div>
      {judgements.length ? (
        <ol className="flex flex-col gap-1" aria-label={`Reads so far under ${info.title.toLowerCase()} consistency`}>
          {judgements.map((j) => (
            <ReadRow key={j.read.id} j={j} current={current.kind === 'read' && current.id === j.read.id} />
          ))}
        </ol>
      ) : (
        <p className="text-small text-graphite">No reads yet. Step forward to see what this model allows.</p>
      )}
    </section>
  );
}

export default function ConsistencyTimelinesWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const start: ScenarioId = props?.scenario === 'thread' ? 'thread' : 'caption';
  const [scenarioId, setScenarioId] = useState<ScenarioId>(start);
  const [stepIndex, setStepIndex] = useState(0);
  const scenario = SCENARIOS[scenarioId];
  const last = scenario.events.length - 1;
  const event = scenario.events[stepIndex]!;

  const choose = (id: ScenarioId) => {
    setScenarioId(id);
    setStepIndex(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<ScenarioId>
            label="Story"
            value={scenarioId}
            onChange={choose}
            options={SCENARIO_ORDER.map((id) => ({ value: id, label: SCENARIOS[id].title }))}
            className="flex-wrap"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
              Back
            </Button>
            <span className="tabular text-small text-graphite" aria-live="off">
              Step {stepIndex + 1} of {last + 1}
            </span>
            <Button size="sm" variant="primary" onClick={() => setStepIndex((i) => Math.min(last, i + 1))} disabled={stepIndex === last}>
              Next
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStepIndex(0)} disabled={stepIndex === 0}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Start over
            </Button>
          </div>
        </div>
        <p aria-live="polite" className="text-ui-lg text-ink">
          <span className="tabular font-semibold">{formatTime(event.at)}.</span> {event.caption}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MODEL_ORDER.map((m) => (
          <ModelCard key={m} scenario={scenario} model={m} stepIndex={stepIndex} reduced={reduced} />
        ))}
      </div>

      <p className="text-small text-graphite">
        A square marks a write and a circle a read. Ticked values are ones the model allows the read to return; struck-out values are ones it never
        returns. The story fixes what each read actually returned, so later reads can build on it.
      </p>
    </div>
  );
}
