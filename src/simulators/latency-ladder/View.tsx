import { useMemo, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Toggle } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/state/settings';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  OPERATIONS,
  ZOOMS,
  ZOOM_ORDER,
  challengeStatus,
  compare,
  formatDuration,
  formatRatio,
  getOperation,
  humanDuration,
  place,
  stateFromPreset,
  ticks,
  toggleSelection,
  type LadderState,
  type OperationId,
  type ScaleMode,
  type ZoomId,
} from './logic';

/** Label column and plot column; on phones the label sits above its plot. */
const ROW_GRID = 'grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]';

export default function LatencyLadderSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => stateFromPreset(preset), [preset]);
  const [state, setState] = useState<LadderState>(initial);
  const [touched, setTouched] = useState(false);
  const reduced = useReducedMotion();

  const change = (patch: Partial<LadderState>) => {
    setTouched(true);
    setState((s) => ({ ...s, ...patch }));
  };
  const select = (id: OperationId) => {
    setTouched(true);
    setState((s) => ({ ...s, selected: toggleSelection(s.selected, id) }));
  };

  const shown = (ns: number) => (state.human ? humanDuration(ns) : formatDuration(ns));
  const other = (ns: number) => (state.human ? `${formatDuration(ns)} in real time` : `${humanDuration(ns)} on the human scale`);
  const axis = ticks(state.zoom, state.scale, state.human);
  const zoom = ZOOMS[state.zoom];
  const status = challengeStatus(state);
  const motion: CSSProperties | undefined = reduced
    ? undefined
    : { transitionProperty: 'left, right, width', transitionDuration: '200ms', transitionTimingFunction: 'var(--ease-out)' };

  const rangeText =
    state.scale === 'log'
      ? `${formatDuration(zoom.minNs)} to ${formatDuration(zoom.maxNs)}`
      : `0 to ${formatDuration(zoom.maxNs)}`;
  const humanRange = state.scale === 'log' ? `${humanDuration(zoom.minNs)} to ${humanDuration(zoom.maxNs)}` : `0 to ${humanDuration(zoom.maxNs)}`;

  const selected = state.selected.map(getOperation);
  const comparison = selected.length === 2 ? compare(selected[0]!.id, selected[1]!.id) : null;
  const single = selected.length === 1 ? selected[0]! : null;

  const challenges: Challenge[] = [
    {
      id: 'human',
      prompt: 'Turn on human scale, where 1 ns lasts 1 second. How long would a round trip across continents take?',
      explanation:
        'About 4.8 years, while a main memory reference takes 1.7 minutes and a disk seek almost four months. Crossing an ocean is the slowest thing on the ladder by far, which is why designs work so hard to avoid it.',
      attempted: status.human,
    },
    {
      id: 'network-vs-disk',
      prompt: 'Compare a round trip within one data center with a disk seek. Which is faster, and by how much?',
      explanation:
        'The round trip, by about 20 times: 0.5 ms against 10 ms. Asking another machine for data it keeps in memory beats seeking on your own spinning disk, which is why a cache server such as Redis pays off.',
      attempted: status['network-vs-disk'],
    },
    {
      id: 'linear',
      prompt: 'Switch to a linear scale with everything in view. What happened to the memory and cache rows?',
      explanation:
        'They collapsed onto zero. On a ruler that ends at one second, 100 ns is a ten-millionth of the width, far thinner than a pixel. A log scale gives every factor of ten the same room, which is the only way to see all of these numbers at once.',
      attempted: status.linear,
    },
    {
      id: 'cache-levels',
      prompt: 'Zoom into the nanoseconds and compare an L1 cache reference with a main memory reference. How many times slower is memory?',
      explanation:
        'About 200 times: 100 ns against 0.5 ns. Even inside one machine, distance costs time. The L1 cache sits inside the processor core, while main memory is centimeters away on the board.',
      attempted: status['cache-levels'],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Latency ladder"
          intro="Thirteen common operations, from a processor’s own cache to a packet crossing the world, on one scale. Select two rows to compare them, and zoom in to read the details."
        />
      ) : null}

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Zoom</span>
          <Segmented<ZoomId>
            label="Zoom"
            size="sm"
            className="flex-wrap self-start"
            value={state.zoom}
            onChange={(z) => change({ zoom: z })}
            options={ZOOM_ORDER.map((z) => ({ value: z, label: ZOOMS[z].label }))}
          />
          <p className="tabular text-small text-graphite">
            Showing {rangeText}
            {state.human ? `, which on the human scale is ${humanRange}` : ''}.
          </p>
        </div>
        <Toggle
          id="ladder-human"
          label="Human scale"
          description="Stretch time so that 1 ns lasts 1 second."
          checked={state.human}
          onChange={(human) => change({ human })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Scale</span>
          <Segmented<ScaleMode>
            label="Scale"
            size="sm"
            className="self-start"
            value={state.scale}
            onChange={(scale) => change({ scale })}
            options={[
              { value: 'log', label: 'Log' },
              { value: 'linear', label: 'Linear' },
            ]}
          />
          <p className="text-small text-graphite">
            {state.scale === 'log' ? 'Each gridline is ten times the one before.' : 'Equal steps of time, like a ruler.'}
          </p>
        </div>
      </ControlPanel>

      <figure className="on-panel blueprint-grid flex flex-col gap-2 rounded-panel p-2 sm:p-4">
        <div className={cn(ROW_GRID, 'px-2')} aria-hidden>
          <span className="hidden sm:block" />
          <span className="relative block h-5 text-[12px] leading-5 text-panel-muted">
            {axis
              .filter((t) => t.label)
              .map((t) => (
                <span
                  key={`${t.at}-${t.label}`}
                  className="tabular absolute top-0 whitespace-nowrap"
                  style={{
                    left: `${t.at * 100}%`,
                    transform: t.at <= 0.02 ? 'none' : t.at >= 0.98 ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {t.label}
                </span>
              ))}
          </span>
        </div>

        <ol className="flex flex-col gap-0.5" aria-label="Operations, fastest first. Select up to two to compare.">
          {OPERATIONS.map((op) => {
            const p = place(op.ns, state.zoom, state.scale);
            const isSelected = state.selected.includes(op.id);
            const pct = p.at * 100;
            const textOnLeft = p.clipped === 'above' || (p.clipped === null && p.at > 0.72);
            const textStyle: CSSProperties = textOnLeft
              ? { right: p.clipped === 'above' ? '20px' : `calc(${100 - pct}% + 10px)` }
              : { left: p.clipped === 'below' ? '20px' : `calc(${pct}% + 10px)` };
            const where = p.clipped === 'below' ? ', below this range' : p.clipped === 'above' ? ', above this range' : '';
            return (
              <li key={op.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${op.label}: about ${formatDuration(op.ns)}, or ${humanDuration(op.ns)} on the human scale${where}`}
                  onClick={() => select(op.id)}
                  className={cn(
                    ROW_GRID,
                    'w-full items-center gap-y-1 rounded-control px-2 py-1.5 text-left transition-colors ease-ui',
                    isSelected ? 'bg-panel-raised' : 'hover:bg-panel-raised',
                    p.clipped && !isSelected && 'opacity-60',
                  )}
                >
                  <span className="flex min-w-0 items-start gap-1.5 text-small text-panel-text">
                    {isSelected ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" strokeWidth={1.5} aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className={cn(isSelected && 'font-bold')}>{op.label}</span>
                  </span>
                  <span className="relative block h-6" aria-hidden>
                    {axis.map((t) => (
                      <span
                        key={`${t.at}`}
                        className="absolute inset-y-0 w-px"
                        style={{ left: `${t.at * 100}%`, background: 'var(--panel-grid-major)' }}
                      />
                    ))}
                    {p.clipped !== 'below' ? (
                      <span
                        className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full"
                        style={{ ...motion, width: `${pct}%`, background: 'var(--panel-line)' }}
                      />
                    ) : null}
                    {p.clipped === null ? (
                      <span
                        className={cn('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full', isSelected ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5')}
                        style={{
                          ...motion,
                          left: `${pct}%`,
                          background: 'var(--signal)',
                          boxShadow: isSelected ? '0 0 0 2px var(--panel-line)' : undefined,
                        }}
                      />
                    ) : p.clipped === 'above' ? (
                      <ChevronRight className="absolute top-1/2 right-0 h-4 w-4 -translate-y-1/2 text-panel-text" strokeWidth={1.5} />
                    ) : (
                      <ChevronLeft className="absolute top-1/2 left-0 h-4 w-4 -translate-y-1/2 text-panel-text" strokeWidth={1.5} />
                    )}
                    <span className="tabular absolute top-0 text-[12px] leading-6 whitespace-nowrap text-panel-text" style={{ ...motion, ...textStyle }}>
                      {shown(op.ns)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <figcaption className="px-2 text-small text-panel-muted">
          {state.scale === 'log'
            ? 'Log scale: every gridline is ten times the one before, so each factor of ten gets the same room.'
            : 'Linear scale: equal distances are equal amounts of time.'}{' '}
          Arrows mark operations outside the zoomed range. Ballpark values; select a row for details.
        </figcaption>
      </figure>

      <section aria-live="polite" aria-label="Selected operations" className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        {comparison ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Stat label={comparison.slow.label} value={shown(comparison.slow.ns)} note={other(comparison.slow.ns)} />
              <Stat label={comparison.fast.label} value={shown(comparison.fast.ns)} note={other(comparison.fast.ns)} />
              <Stat label="How many times longer" value={formatRatio(comparison.ratio).replace(' times', '×')} />
            </div>
            <p className="text-ui-lg text-ink">{comparison.sentence}</p>
            <p className="text-ui text-graphite">{comparison.humanSentence}</p>
          </>
        ) : single ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Stat label={single.label} value={formatDuration(single.ns)} note="ballpark" />
              <Stat label="On the human scale" value={humanDuration(single.ns)} note="1 ns lasts 1 second" />
            </div>
            <p className="text-ui text-ink">{single.detail}</p>
            <p className="text-small text-graphite">Select a second row to compare the two.</p>
          </>
        ) : (
          <p className="text-ui text-graphite">Select a row to see what the operation is, or select two rows to compare them.</p>
        )}
        <div>
          <Button size="sm" variant="ghost" onClick={() => setState(initial)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset the ladder
          </Button>
        </div>
      </section>

      <Challenges simId="latency-ladder" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          These are ballpark figures from about 2012, from the widely shared table attributed to Jeff Dean and Peter Norvig. Newer solid-state
          drives and memory are several times faster on some rows, and real systems vary with load. The gaps between the rows, which are what you
          reason with, still hold.
        </p>
      </Callout>
    </div>
  );
}
