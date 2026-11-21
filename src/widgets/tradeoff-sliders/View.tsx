import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Chip, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { cn } from '@/lib/cn';
import { ControlPanel } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import { AXES, MAX_WEIGHT, OPTIONS, fit, optionDiagram, verdict, weightsFromProps, type Axis, type Weights } from './logic';

const CARE = ['Not at all', 'A little', 'Somewhat', 'Matters', 'Matters a lot', 'Critical'];

function Pips({ score }: { score: number }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn('h-2.5 w-4 rounded-[2px]', i < score ? 'bg-blueprint' : 'bg-wash-strong')} />
      ))}
    </span>
  );
}

/** Snapgram's like counter: set priorities, see how three designs score and which fits best. */
export default function TradeoffSliders({ props }: WidgetProps) {
  const start = useMemo(() => weightsFromProps(props), [props]);
  const [weights, setWeights] = useState<Weights>(start);
  const v = useMemo(() => verdict(weights), [weights]);
  const spec = useMemo(() => optionDiagram(v.best.id), [v.best.id]);

  const set = (axis: Axis, value: number) => setWeights((w) => ({ ...w, [axis]: value }));

  return (
    <div className="flex flex-col gap-5">
      <ControlPanel>
        {AXES.map((a) => (
          <Slider
            key={a.id}
            id={`tradeoff-${a.id}`}
            label={a.label}
            value={weights[a.id]}
            min={0}
            max={MAX_WEIGHT}
            onChange={(value) => set(a.id, value)}
            format={(value) => CARE[value] ?? String(value)}
            hint={a.question}
          />
        ))}
        <div className="sm:col-span-2">
          <Button size="sm" variant="ghost" onClick={() => setWeights(start)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to Snapgram’s priorities
          </Button>
        </div>
      </ControlPanel>

      <ul className="grid gap-3 md:grid-cols-3" aria-label="How each option scores">
        {OPTIONS.map((o) => {
          const best = o.id === v.best.id;
          const score = fit(o, weights);
          return (
            <li key={o.id} className={cn('flex flex-col gap-3 rounded-card border bg-paper p-4', best ? 'border-success' : 'border-rule')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-ui-lg font-semibold text-ink">{o.name}</h4>
                {best ? <Chip tone="success">Best fit</Chip> : null}
              </div>
              <p className="text-small text-graphite">{o.how}</p>
              <dl className="flex flex-col gap-1.5">
                {AXES.map((a) => (
                  <div key={a.id} className="grid grid-cols-[6.5rem_auto_1fr] items-center gap-x-2">
                    <dt className="text-small text-graphite">{a.label}</dt>
                    <dd>
                      <Pips score={o.scores[a.id]} />
                    </dd>
                    <dd className="tabular text-right text-small text-ink">{o.scores[a.id]} of 5</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-auto border-t border-rule pt-2 text-ui text-ink">
                Fit for your priorities: <strong className="tabular">{score.toFixed(1)}</strong> of 5
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-ui font-semibold text-ink">How the best fit works: {v.best.name.toLowerCase()}</p>
        <Diagram spec={spec} variant="plain" />
      </div>

      <div aria-live="polite" className="flex flex-col gap-4">
        <p className="text-ui-lg text-ink">
          <strong>What you give up.</strong> {v.giveUpSentence}
          {v.closeCall ? ` It is a close call: ${v.runnerUp.name.toLowerCase()} fits almost as well.` : ''}
        </p>
        <Callout kind="interview">
          <p className="text-ui-lg text-ink">
            <CalloutLead kind="interview" text="Say it like this." />
            {v.sentence}
          </p>
        </Callout>
      </div>
    </div>
  );
}
