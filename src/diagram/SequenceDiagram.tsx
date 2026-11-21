import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { SequenceSpec } from '@/content/types';
import { cn } from '@/lib/cn';
import { useElementWidth, useInView, isTypingTarget } from '@/lib/hooks';
import { useReducedMotion } from '@/state/settings';
import { MdInline } from '@/features/learn/Markdown';
import { Glyph } from './glyphs';
import { colorFor } from './types-style';
import { labelWidth, sequenceFit, type SequenceFit, type SequenceLayout } from './sequenceLayout';
import { StepControls } from './StepControls';
import { DescribeToggle } from './DescribeToggle';
import { describeSequence } from './describe';

const PANEL_PAD = 8;

function useSequenceFit(spec: SequenceSpec, available: number): SequenceFit {
  return useMemo(() => sequenceFit(spec, available), [spec, available]);
}

export function SequenceDiagram({ spec, caption, title }: { spec: SequenceSpec; caption: string; title?: string }) {
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
  const fit = useSequenceFit(spec, Math.max(0, width - PANEL_PAD * 2));
  const total = spec.messages.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(1);

  const go = useCallback(
    (i: number) => {
      setStep(Math.max(0, Math.min(total - 1, i)));
      setRun((r) => r + 1);
    },
    [total],
  );

  // Animate the current message's dot.
  useEffect(() => {
    if (reduced || !inView) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let raf = 0;
    const start = performance.now() + 100;
    const dur = 650;
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / dur));
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, run, reduced, inView]);

  const caption_ = spec.messages[step]?.caption ?? '';
  useEffect(() => {
    if (!playing || progress < 1) return;
    const words = caption_.split(/\s+/).length;
    const t = window.setTimeout(
      () => {
        if (step < total - 1) go(step + 1);
        else setPlaying(false);
      },
      Math.min(6000, Math.max(1800, 700 + words * 190)),
    );
    return () => window.clearTimeout(t);
  }, [playing, progress, step, total, caption_, go]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPlaying(false);
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPlaying(false);
      go(step - 1);
    }
  };

  const label = `${title ? `${title}. ` : ''}${describeSequence(spec)}`;

  return (
    <figure className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      {title || caption ? (
        <div className="measure">
          {title ? <p className="text-ui font-semibold text-ink">{title}</p> : null}
          <p className="text-ui text-graphite">
            <MdInline md={caption} />
          </p>
        </div>
      ) : null}
      <div
        ref={setRefs}
        className="on-panel blueprint-grid overflow-x-auto rounded-panel"
        style={{ padding: PANEL_PAD }}
        tabIndex={0}
        role="group"
        aria-roledescription="step-by-step sequence diagram"
        aria-label={`${title ?? 'Sequence diagram'}: use the left and right arrow keys to step`}
      >
        {width <= 0 ? (
          <div style={{ height: 200 }} />
        ) : fit.kind === 'list' ? (
          <SequenceList spec={spec} step={step} label={label} />
        ) : (
          <div className="mx-auto w-max">
            <SequenceSvg layout={fit.layout} scale={fit.scale} step={step} progress={progress} label={label} />
          </div>
        )}
      </div>
      <StepControls
        step={step}
        total={total}
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
            if (step === total - 1) go(0);
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
      <DescribeToggle>
        <ol className="list-decimal space-y-1 pl-5">
          {spec.messages.map((m, i) => (
            <li key={i} className={i === step ? 'font-semibold text-ink' : undefined}>
              {spec.actors.find((a) => a.id === m.from)?.label} to {spec.actors.find((a) => a.id === m.to)?.label}: {m.label}
              {m.lost ? ' (lost)' : ''}. <MdInline md={m.caption} />
            </li>
          ))}
        </ol>
      </DescribeToggle>
    </figure>
  );
}

function SequenceSvg({
  layout,
  scale,
  step,
  progress,
  label,
}: {
  layout: SequenceLayout;
  scale: number;
  step: number;
  progress: number;
  label: string;
}) {
  return (
    <svg
      width={layout.width * scale}
      height={layout.height * scale}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={label}
      className="block max-w-none"
    >
      {/* Groups */}
      {layout.groups.map((g, i) => {
        const visible = step >= g.from - 1;
        return (
          <g key={i}>
            {/* A later phase's bracket waits faintly; its label stays readable (section 18 contrast). */}
            <path
              d={`M${g.x + 10} ${g.y1} H${g.x} V${g.y2} H${g.x + 10}`}
              fill="none"
              stroke="var(--panel-muted)"
              strokeWidth={1.5}
              opacity={visible ? 1 : 0.35}
              style={{ transition: 'opacity 200ms var(--ease-out)' }}
            />
            <text
              transform={`translate(${g.x - 6} ${(g.y1 + g.y2) / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={12}
              fontWeight={visible ? 600 : 400}
              fill="var(--panel-muted)"
            >
              {g.label}
            </text>
          </g>
        );
      })}

      {/* Lifelines */}
      {layout.actors.map((a) => (
        <line
          key={`life-${a.id}`}
          x1={a.cx}
          x2={a.cx}
          y1={layout.lifelineTop}
          y2={layout.lifelineBottom}
          stroke="var(--panel-line)"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeDasharray="4 5"
        />
      ))}

      {/* Actor cards */}
      {layout.actors.map((a) => {
        const color = colorFor(a.type);
        return (
          <g key={a.id} transform={`translate(${a.box.x} ${a.box.y})`}>
            <rect width={a.box.w} height={a.box.h} rx={8} fill="var(--card)" />
            <rect width={4} height={a.box.h} rx={2} fill={color} />
            <Glyph type={a.type} x={a.box.w / 2 - 10} y={12} color={color} />
            {a.lines.map((l, i) => (
              <text key={i} x={a.box.w / 2} y={53 + i * 17} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--card-ink)">
                {l}
              </text>
            ))}
          </g>
        );
      })}

      {/* Messages */}
      {layout.messages.map((m) => {
        if (m.index > step) return null;
        const current = m.index === step;
        const dir = Math.sign(m.x2 - m.x1) || 1;
        const end = m.lost ? m.x1 + (m.x2 - m.x1) * 0.62 : m.x2 - dir * 2;
        const color = current ? 'var(--signal)' : 'var(--panel-line)';
        const dashed = m.kind !== 'sync';
        const w = labelWidth(m.lines);
        const dotX = m.x1 + (end - m.x1) * progress;
        return (
          <g key={m.index}>
            <line
              x1={m.x1}
              y1={m.y}
              x2={m.lost ? end : end - dir * 8}
              y2={m.y}
              stroke={color}
              strokeWidth={current ? 2 : 1.5}
              strokeDasharray={dashed ? '6 5' : undefined}
            />
            {m.lost ? (
              <g stroke="var(--panel-alert)" strokeWidth={2.5} strokeLinecap="round">
                <line x1={end - 6} y1={m.y - 6} x2={end + 6} y2={m.y + 6} />
                <line x1={end - 6} y1={m.y + 6} x2={end + 6} y2={m.y - 6} />
              </g>
            ) : (
              <polygon
                points={`${end},${m.y} ${end - dir * 8},${m.y - 4.5} ${end - dir * 8},${m.y + 4.5}`}
                fill={color}
              />
            )}
            <rect
              x={m.labelX - w / 2 - 6}
              y={m.labelTop - 2}
              width={w + 12}
              height={m.lines.length * 17 + 4}
              rx={4}
              fill="var(--panel)"
              opacity={0.85}
            />
            {m.lines.map((l, i) => (
              <text
                key={i}
                x={m.labelX}
                y={m.labelTop + 12 + i * 17}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill={current ? 'var(--signal)' : 'var(--panel-text)'}
              >
                {l}
              </text>
            ))}
            <g transform={`translate(${m.x1 + dir * 14} ${m.y})`}>
              <circle r={9} fill={current ? 'var(--signal)' : 'var(--panel-raised)'} stroke="var(--panel)" strokeWidth={2} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={current ? 'var(--on-signal)' : 'var(--panel-text)'}>
                {m.index + 1}
              </text>
            </g>
            {current && progress < 1 ? (
              <g transform={`translate(${dotX} ${m.y})`}>
                <circle r={10} fill="var(--signal)" opacity={0.22} />
                <circle r={5.5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The phone version of a sequence diagram too wide for its columns to read: one row per message so far, each naming
 * both actors with the arrow drawn in the diagram's line style, the message at full size and the current one ringed.
 */
function SequenceList({ spec, step, label }: { spec: SequenceSpec; step: number; label: string }) {
  const actor = (id: string) => spec.actors.find((a) => a.id === id);
  return (
    <div role="img" aria-label={label}>
      <ol className="flex flex-col gap-2 p-1">
        {spec.messages.map((m, i) => {
          if (i > step) return null;
          const group = spec.groups?.find((g) => g.from - 1 === i);
          const current = i === step;
          const from = actor(m.from);
          const to = actor(m.to);
          return (
            <Fragment key={i}>
              {group ? <li className="px-1 pt-1 text-small font-semibold text-panel-muted">{group.label}</li> : null}
              <li className={cn('flex gap-2.5 rounded-card bg-panel-raised px-2.5 py-2', current && 'ring-2 ring-signal')}>
                <span
                  className={cn(
                    'tabular mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-small font-bold',
                    current ? 'bg-signal text-on-signal' : 'bg-panel text-panel-text',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {from ? <ActorChip label={from.label} color={colorFor(from.type)} /> : null}
                    <MessageArrow kind={m.kind ?? 'sync'} lost={Boolean(m.lost)} current={current} />
                    {to ? <ActorChip label={to.label} color={colorFor(to.type)} /> : null}
                  </span>
                  <span className={cn('text-ui font-semibold', current ? 'text-signal' : 'text-panel-text')}>{m.label}</span>
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function ActorChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-control bg-card text-small font-semibold text-card-ink">
      <span className="w-[3px] shrink-0" style={{ background: color }} aria-hidden />
      <span className="px-2 py-0.5">{label}</span>
    </span>
  );
}

/** The message's arrow, drawn like the column version: solid for a request, dashed for a reply or an async message. */
function MessageArrow({ kind, lost, current }: { kind: 'sync' | 'reply' | 'async'; lost: boolean; current: boolean }) {
  const color = current ? 'var(--signal)' : 'var(--panel-line)';
  const end = lost ? 20 : 30;
  return (
    <svg width={34} height={14} viewBox="0 0 34 14" aria-hidden className="shrink-0">
      <line x1={1} y1={7} x2={lost ? end : end - 7} y2={7} stroke={color} strokeWidth={current ? 2 : 1.5} strokeDasharray={kind === 'sync' ? undefined : '4 3'} />
      {lost ? (
        <g stroke="var(--panel-alert)" strokeWidth={2} strokeLinecap="round">
          <line x1={end - 4} y1={3} x2={end + 4} y2={11} />
          <line x1={end - 4} y1={11} x2={end + 4} y2={3} />
        </g>
      ) : (
        <polygon points={`${end + 2},7 ${end - 7},2.5 ${end - 7},11.5`} fill={color} />
      )}
    </svg>
  );
}
