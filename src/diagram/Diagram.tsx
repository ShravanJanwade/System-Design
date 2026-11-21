import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { DiagramSpec } from '@/content/types';
import { useElementWidth, useInView, isTypingTarget } from '@/lib/hooks';
import { useReducedMotion } from '@/state/settings';
import { cn } from '@/lib/cn';
import { Md, MdInline } from '@/features/learn/Markdown';
import { layoutDiagram } from './layout';
import { chooseLayout, type Fit } from './fit';
import { stepView } from './steps';
import { useFlowPlayback } from './useFlowPlayback';
import { DiagramSvg, type NodeInteraction } from './DiagramSvg';
import { StepControls } from './StepControls';
import { describeDiagram, connectionList } from './describe';
import { matchNodes, useHighlight } from './highlight';
import { DescribeToggle } from './DescribeToggle';

const PANEL_PAD = 8;
export type { Fit } from './fit';

/** Pick the layout that reads best in the available width. */
export function useFittedLayout(spec: DiagramSpec, available: number): Fit {
  const layouts = useMemo(
    () => ({
      wide: layoutDiagram(spec, 'wide'),
      compact: layoutDiagram(spec, 'compact'),
      narrow: layoutDiagram(spec, 'narrow'),
    }),
    [spec],
  );
  return useMemo(() => chooseLayout(layouts, available), [layouts, available]);
}

type DiagramProps = {
  spec: DiagramSpec;
  /** Figure caption (markdown). For stepped diagrams it shows above the panel; step captions show below. */
  caption?: string;
  title?: string;
  /** "mini" autoplays without controls (Home). "plain" draws only the panel. */
  variant?: 'figure' | 'mini' | 'plain';
  interaction?: NodeInteraction;
  className?: string;
  /** Extra content rendered under the panel, inside the figure. */
  footer?: ReactNode;
  /** Controlled step, for simulators that show the same step elsewhere. */
  step?: number;
  onStepChange?: (step: number) => void;
};

export function Diagram({
  spec,
  caption,
  title,
  variant = 'figure',
  interaction,
  className,
  footer,
  step: controlledStep,
  onStepChange,
}: DiagramProps) {
  const instance = useId();
  const reduced = useReducedMotion();
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>(0.35);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      measureRef(el);
      viewRef(el);
    },
    [measureRef, viewRef],
  );
  const { layout, scale } = useFittedLayout(spec, Math.max(0, width - PANEL_PAD * 2));

  const steps = spec.steps ?? [];
  const stepped = steps.length > 0;
  const [ownStep, setOwnStep] = useState(0);
  const step = Math.min(controlledStep ?? ownStep, Math.max(0, steps.length - 1));
  const setStep = (i: number) => {
    if (controlledStep === undefined) setOwnStep(i);
    onStepChange?.(i);
  };
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const view = useMemo(() => stepView(spec, step), [spec, step]);

  const { dots, tags, done } = useFlowPlayback(layout, view.flow, `${step}:${run}`, inView, reduced);

  // Prose-to-diagram highlighting.
  const highlight = useHighlight();
  const register = highlight?.register;
  useEffect(() => register?.(instance, spec.nodes), [register, instance, spec.nodes]);
  const highlighted = highlight?.term ? matchNodes(highlight.term, spec.nodes) : [];

  const setStepRef = useRef(setStep);
  setStepRef.current = setStep;
  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(steps.length - 1, i));
      setStepRef.current(next);
      setRun((r) => r + 1);
    },
    [steps.length],
  );

  // Autoplay: wait for the dots to arrive, give the caption time to be read, then advance.
  const caption_ = steps[step]?.caption ?? '';
  useEffect(() => {
    const auto = variant === 'mini' ? inView : playing;
    if (!stepped || !auto || !done) return;
    const words = caption_.split(/\s+/).length;
    const dwell = variant === 'mini' ? 1700 : Math.min(6500, Math.max(1900, 700 + words * 190));
    const t = window.setTimeout(() => {
      if (step < steps.length - 1) go(step + 1);
      else if (variant === 'mini') go(0);
      else setPlaying(false);
    }, dwell);
    return () => window.clearTimeout(t);
  }, [variant, inView, playing, done, step, stepped, steps.length, caption_, go]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!stepped || variant !== 'figure' || isTypingTarget(e.target)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPlaying(false);
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPlaying(false);
      go(step - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(steps.length - 1);
    }
  };

  const label = `${title ? `${title}. ` : ''}${describeDiagram(spec)}`;

  const panel = (
    <div
      ref={setRefs}
      className={cn('on-panel blueprint-grid relative overflow-x-auto rounded-panel', variant === 'mini' && 'pointer-events-none')}
      style={{ padding: PANEL_PAD }}
      tabIndex={variant === 'figure' && stepped ? 0 : undefined}
      role={variant === 'figure' && stepped ? 'group' : undefined}
      aria-roledescription={variant === 'figure' && stepped ? 'step-by-step diagram' : undefined}
      aria-label={variant === 'figure' && stepped ? `${title ?? 'Diagram'}: use the left and right arrow keys to step` : undefined}
    >
      <div className="mx-auto w-max">
        {width > 0 ? (
          <DiagramSvg
            layout={layout}
            view={view}
            highlighted={highlighted}
            dots={dots}
            tags={tags}
            reduced={reduced}
            scale={scale}
            label={label}
            interaction={interaction}
          />
        ) : (
          <div style={{ height: 160 }} />
        )}
      </div>
    </div>
  );

  if (variant !== 'figure') return <div className={className}>{panel}</div>;

  return (
    <figure className={cn('flex flex-col gap-3', className)} onKeyDown={onKeyDown}>
      {stepped && (title || caption) ? (
        <div className="measure">
          {title ? <p className="text-ui font-semibold text-ink">{title}</p> : null}
          {caption ? (
            <p className="text-ui text-graphite">
              <MdInline md={caption} />
            </p>
          ) : null}
        </div>
      ) : null}
      {panel}
      {stepped ? (
        <div className="flex flex-col gap-3">
          <StepControls
            step={step}
            total={steps.length}
            playing={playing}
            onPrev={() => {
              setPlaying(false);
              go(step - 1);
            }}
            onNext={() => {
              setPlaying(false);
              go(step + 1);
            }}
            onTogglePlay={() => {
              if (playing) setPlaying(false);
              else {
                if (step === steps.length - 1) go(0);
                setPlaying(true);
              }
            }}
            onRestart={() => {
              setPlaying(false);
              go(0);
            }}
            onJump={(i) => {
              setPlaying(false);
              go(i);
            }}
          />
          <div aria-live="polite" className="measure min-h-[3.75rem] text-ui-lg text-ink">
            <MdInline md={caption_} />
          </div>
        </div>
      ) : caption ? (
        <figcaption className="measure text-ui text-graphite">
          {title ? <span className="font-semibold text-ink">{title}. </span> : null}
          <MdInline md={caption} />
        </figcaption>
      ) : null}
      {footer}
      <DescribeToggle>
        {stepped ? (
          <ol className="list-decimal space-y-1 pl-5">
            {steps.map((s, i) => (
              <li key={i} className={i === step ? 'font-semibold text-ink' : undefined}>
                <MdInline md={s.caption} />
              </li>
            ))}
          </ol>
        ) : (
          <>
            {spec.description ? <Md md={spec.description} /> : null}
            <ul className="list-disc space-y-1 pl-5">
              {connectionList(spec).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </DescribeToggle>
    </figure>
  );
}
