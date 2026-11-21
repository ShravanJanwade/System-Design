import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/design/Button';
import { measureText } from '@/diagram/text';
import { useElementWidth } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { WidgetProps } from '../registry';
import { buildTimeline, minuteTicks, minuteToX, normalizeIndex, normalizeLength, segmentLayout } from './logic';

/** Space between segments, in pixels. */
const GAP = 3;
const LABEL_PX = 13;

function fits(text: string, width: number): boolean {
  return measureText(text, LABEL_PX, 'bold') + 14 <= width;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The six phases of a design interview as a bar sized by minutes, on paper (it is a chart).
 * Each segment is a tab; the panel below explains the selected phase.
 * Props: `length` (45 or 60, default 45) and `initial` (index of the phase selected first).
 */
export default function InterviewTimelineWidget({ props }: WidgetProps) {
  const length = normalizeLength(props?.length);
  const phases = useMemo(() => buildTimeline(length), [length]);
  const [selected, setSelected] = useState(() => normalizeIndex(props?.initial, phases.length));
  const [barRef, barWidth] = useElementWidth<HTMLDivElement>();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  const tabId = (i: number) => `${uid}-phase-${i}`;
  const panelId = `${uid}-panel`;

  const current = Math.min(selected, phases.length - 1);
  const phase = phases[current]!;
  const segments = useMemo(() => segmentLayout(phases, barWidth, GAP), [phases, barWidth]);
  const labelEvery = barWidth >= 560 ? 5 : 15;

  const select = (i: number, focus = false) => {
    const next = Math.max(0, Math.min(phases.length - 1, i));
    setSelected(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(phases.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = phases.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
      <p className="mb-3 text-ui font-semibold text-ink">A {length}-minute interview, drawn to scale</p>

      <div
        ref={barRef}
        role="tablist"
        aria-label={`The six phases of a ${length}-minute interview`}
        className="flex w-full"
        style={{ gap: GAP }}
      >
        {phases.map((p, i) => {
          const w = segments[i]?.w ?? 0;
          const showName = barWidth > 0 && fits(p.name, w);
          const showMinutes = barWidth > 0 && fits(`${p.minutes} min`, w);
          const active = i === current;
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={active}
              aria-controls={panelId}
              aria-label={`${i + 1}. ${p.name}, ${p.duration}, from minute ${p.start} to minute ${p.end}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex h-16 min-w-0 flex-col items-center justify-center overflow-hidden px-1 text-center transition-colors ease-ui',
                i === 0 && 'rounded-l-control',
                i === phases.length - 1 && 'rounded-r-control',
                active ? 'bg-signal text-on-signal ring-2 ring-ink ring-inset' : 'bg-wash text-ink hover:bg-wash-strong',
              )}
              style={{ flexGrow: p.minutes, flexBasis: 0 }}
            >
              <span className="text-small font-bold whitespace-nowrap tabular">{showName ? p.name : i + 1}</span>
              {showMinutes ? <span className="text-small whitespace-nowrap tabular">{p.minutes} min</span> : null}
            </button>
          );
        })}
      </div>

      {/* Minute marks, aligned with the segment edges */}
      <div className="relative mt-1 h-6" aria-hidden="true">
        {barWidth > 0
          ? minuteTicks(length).map((m) => {
              const x = minuteToX(phases, segments, m);
              const labeled = m % labelEvery === 0 || m === length;
              const shift = m === 0 ? '0' : m === length ? '-100%' : '-50%';
              return (
                <span key={m} className="absolute top-0 flex flex-col" style={{ left: x, transform: `translateX(${shift})` }}>
                  <span className={cn('block h-1.5 w-px bg-graphite', m === 0 ? 'self-start' : m === length ? 'self-end' : 'self-center')} />
                  {labeled ? <span className="text-small leading-4 text-graphite tabular">{m === length ? `${m} min` : m}</span> : null}
                </span>
              );
            })
          : null}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(current)} tabIndex={0} className="mt-4 border-t border-rule pt-4">
        <p className="text-small font-semibold text-graphite">
          Step {current + 1} of {phases.length}
        </p>
        <p className="text-h3 font-bold text-ink">{phase.name}</p>
        <p className="text-ui text-graphite tabular">
          {capitalize(phase.duration)}, from minute {phase.start} to minute {phase.end}
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-small font-semibold text-graphite">Goal</dt>
            <dd className="mt-1 text-ui-lg text-ink">{phase.goal}</dd>
          </div>
          <div>
            <dt className="text-small font-semibold text-graphite">What the interviewer looks for</dt>
            <dd className="mt-1 text-ui-lg text-ink">{phase.looksFor}</dd>
          </div>
          <div>
            <dt className="text-small font-semibold text-graphite">Try opening with</dt>
            <dd className="mt-1 border-l-[3px] border-success pl-3 text-ui-lg text-ink">“{phase.opener}”</dd>
          </div>
          <div>
            <dt className="text-small font-semibold text-graphite">Common mistake</dt>
            <dd className="mt-1 text-ui-lg text-ink">{phase.mistake}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => select(current - 1)} disabled={current === 0}>
            Previous phase
          </Button>
          <Button size="sm" onClick={() => select(current + 1)} disabled={current === phases.length - 1}>
            Next phase
          </Button>
        </div>
      </div>
    </div>
  );
}
