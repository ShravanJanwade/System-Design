import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, Layers, Pause, Play, SlidersHorizontal, Target } from 'lucide-react';
import { IconButton } from '@/design/Button';
import { useElementWidth, useInView } from '@/lib/hooks';
import { useReducedMotion } from '@/state/settings';
import { cn } from '@/lib/cn';
import { STATIONS, arrowFraction, loopGeometry, nextIndex, pointOnLoop, prevIndex, type StationId } from './logic';

const ICONS: Record<StationId, typeof BookOpen> = { learn: BookOpen, try: SlidersHorizontal, recall: Layers, apply: Target };

/** One lap of the dot, in milliseconds: slow enough to read the stations as it passes. */
const LAP_MS = 9000;
const PLACEHOLDER_HEIGHT = 256;

/**
 * The learning loop: four stations on the blueprint panel, joined by arrows into a loop.
 * The stations are tabs; the panel below says which parts of Blueprint serve the selected one.
 * A signal-yellow dot travels the loop when motion is allowed, and can be paused.
 */
export default function LearningLoopWidget() {
  const reduced = useReducedMotion();
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>(0.3);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      measureRef(el);
      viewRef(el);
    },
    [measureRef, viewRef],
  );
  const geom = useMemo(() => (width > 0 ? loopGeometry(width) : null), [width]);

  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dotRef = useRef<SVGGElement | null>(null);
  const uid = useId();
  const tabId = (i: number) => `${uid}-station-${i}`;
  const panelId = `${uid}-panel`;
  const descId = `${uid}-desc`;

  // The dot's position as a fraction of the loop. It moves in a ref, without re-rendering,
  // and is copied to state when the motion stops so the dot stays where it was.
  const tRef = useRef(0);
  const [restT, setRestT] = useState(0);
  const animate = !reduced && !paused && inView && geom !== null;

  useEffect(() => {
    if (!animate || !geom) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      tRef.current = (tRef.current + (now - last) / LAP_MS) % 1;
      last = now;
      const p = pointOnLoop(geom, tRef.current);
      dotRef.current?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setRestT(tRef.current);
    };
  }, [animate, geom]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = nextIndex(i);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = prevIndex(i);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = STATIONS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  const station = STATIONS[selected]!;
  const following = STATIONS[nextIndex(selected)]!;
  // With reduced motion, the dot rests on the arrow leaving the selected station: where this step leads.
  const dot = geom ? pointOnLoop(geom, reduced ? arrowFraction(geom, selected) : restT) : { x: 0, y: 0 };
  const center = geom
    ? {
        x: (geom.cards[0]!.x + geom.cards[0]!.w + geom.cards[1]!.x) / 2,
        y: (geom.cards[0]!.y + geom.cards[0]!.h + geom.cards[3]!.y) / 2,
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={setRefs}
        className="on-panel blueprint-grid relative overflow-hidden rounded-panel"
        style={{ height: geom ? geom.height : PLACEHOLDER_HEIGHT }}
      >
        {geom ? (
          <>
            <svg
              width={geom.width}
              height={geom.height}
              viewBox={`0 0 ${geom.width} ${geom.height}`}
              className="absolute inset-0 block"
              aria-hidden="true"
            >
              <path d={geom.path} fill="none" stroke="var(--panel-line)" strokeWidth={1.5} strokeLinejoin="round" />
              {geom.arrows.map((a, i) => (
                <polygon key={i} points="-5,-5 5,0 -5,5" fill="var(--panel-line)" transform={`translate(${a.x} ${a.y}) rotate(${a.angle})`} />
              ))}
              <g ref={dotRef} transform={`translate(${dot.x.toFixed(1)} ${dot.y.toFixed(1)})`}>
                <circle r={10} fill="var(--signal)" opacity={0.22} />
                <circle r={5.5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
              </g>
            </svg>

            <div role="tablist" aria-label="The learning loop" aria-describedby={descId}>
              {STATIONS.map((s, i) => {
                const card = geom.cards[i]!;
                const Icon = ICONS[s.id];
                const active = i === selected;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={tabId(i)}
                    aria-selected={active}
                    aria-controls={panelId}
                    aria-label={`${s.name}, step ${i + 1} of ${STATIONS.length}: ${s.short}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelected(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={cn(
                      'absolute flex flex-col justify-center gap-1.5 rounded-card bg-card px-3 text-left text-card-ink transition-shadow ease-ui sm:px-4',
                      active ? 'ring-[3px] ring-signal' : 'hover:ring-2 hover:ring-panel-muted',
                    )}
                    style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-small font-bold tabular',
                          active ? 'border-signal bg-signal text-on-signal' : 'border-card-muted text-card-muted',
                        )}
                      >
                        {i + 1}
                      </span>
                      <Icon className="hidden h-5 w-5 shrink-0 text-card-muted sm:block" strokeWidth={1.5} aria-hidden="true" />
                      <span className={cn('font-display text-[20px] leading-6 font-semibold', active && 'underline decoration-2 underline-offset-4')}>
                        {s.name}
                      </span>
                    </span>
                    <span className="text-small text-card-muted">{s.short}</span>
                  </button>
                );
              })}
            </div>

            {!reduced && center ? (
              <div className="absolute" style={{ left: center.x - 16, top: center.y - 16 }}>
                <IconButton
                  label={paused ? 'Play the moving dot' : 'Pause the moving dot'}
                  tone="panel"
                  size="sm"
                  tipSide="bottom"
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> : <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
                </IconButton>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <p id={descId} className="sr-only">
        Four stations joined in a loop: Learn, then Try, then Recall, then Apply, and back to Learn. Use the arrow keys to move between them.
      </p>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)} tabIndex={0} className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        <p className="text-small font-semibold text-graphite">
          Step {selected + 1} of {STATIONS.length}
        </p>
        <p className="text-h3 font-bold text-ink">{station.headline}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-small font-semibold text-graphite">Where it lives in Blueprint</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ui-lg text-ink">
              {station.serves.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-small font-semibold text-graphite">Why it matters</p>
            <p className="mt-1 text-ui-lg text-ink">{station.why}</p>
          </div>
        </div>
        <p className="mt-4 text-ui text-graphite">
          <strong className="font-semibold text-ink">Try this. </strong>
          {station.tip}
        </p>
        <p className="mt-2 text-small text-graphite">
          Next on the loop: {following.name}
          {selected === STATIONS.length - 1 ? ', which starts it again.' : '.'}
        </p>
      </div>
    </div>
  );
}
