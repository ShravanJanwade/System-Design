import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Lightbulb, Lock, Pause, Play, RotateCcw, Star } from 'lucide-react';
import type { Problem } from '@/content/types';
import { getOutline, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { Button } from '@/design/Button';
import { Chip } from '@/design/primitives';
import { Md, MdInline } from '@/features/learn/Markdown';
import { cn } from '@/lib/cn';
import { IDLE_TIMER, timerElapsed, useProblems } from '@/state/problems';
import { formatClock, statusText, type ProblemStatus, type ReviewLink } from './logic';

/** The current time, ticking once a second while `active`. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

/**
 * Calls `pause` when the learner leaves: the page is hidden for good (closed or reloaded) or the component unmounts.
 * The unmount check waits a tick, because development mode unmounts and remounts every component once on purpose.
 */
export function usePauseOnLeave(pause: () => void): void {
  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  const mounted = useRef(0);
  useEffect(() => {
    mounted.current += 1;
    const onHide = () => pauseRef.current();
    window.addEventListener('pagehide', onHide);
    return () => {
      mounted.current -= 1;
      window.removeEventListener('pagehide', onHide);
      window.setTimeout(() => {
        if (mounted.current === 0) pauseRef.current();
      }, 0);
    };
  }, []);
}

/** A paper panel with a small heading, used for the workspace's side tools. */
export function Panel({ title, id, children, className, note }: { title: string; id: string; children: ReactNode; className?: string; note?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-ui-lg font-semibold text-ink">
          {title}
        </h2>
        {note ? <span className="text-small text-graphite">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export function FlagshipMark({ withText = false }: { withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-ui text-graphite" title="Flagship problem">
      <Star className="h-4 w-4 shrink-0 text-blueprint" strokeWidth={1.5} aria-hidden />
      {withText ? <span>Flagship</span> : <span className="sr-only">Flagship problem</span>}
    </span>
  );
}

export function StatusChip({ status }: { status: ProblemStatus }) {
  const tone = status.kind === 'scored' ? 'success' : status.kind === 'attempted' ? 'blueprint' : 'neutral';
  return <Chip tone={tone}>{statusText(status)}</Chip>;
}

export function lessonText(id: string): string {
  const o = getOutline(id);
  return o ? `${o.number} ${o.title}` : id;
}

/** A link to a lesson, or plain text while the lesson is not written. */
export function LessonLink({ id, className, children }: { id: string; className?: string; children?: ReactNode }) {
  const o = getOutline(id);
  if (!o) return null;
  const label = children ?? `Lesson ${o.number}: ${o.title}`;
  if (!isLessonWritten(id)) return <span className={cn('text-graphite', className)}>{label}</span>;
  return (
    <Link to={lessonPath(id)} className={cn('md-link', className)}>
      {label}
    </Link>
  );
}

/** The lessons a problem exercises, as an inline list of links. */
export function ConceptLinks({ ids }: { ids: readonly string[] }) {
  const known = ids.filter((id) => getOutline(id));
  if (!known.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ui">
      {known.map((id) => (
        <li key={id}>
          <LessonLink id={id}>{lessonText(id)}</LessonLink>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace tools                                                     */
/* ------------------------------------------------------------------ */

export function PracticeTimer({ problemId, minutes }: { problemId: string; minutes: number }) {
  const timer = useProblems((s) => s.workspaces[problemId]?.timer ?? IDLE_TIMER);
  const startTimer = useProblems((s) => s.startTimer);
  const pauseTimer = useProblems((s) => s.pauseTimer);
  const resetTimer = useProblems((s) => s.resetTimer);
  const running = timer.runningSince !== null;
  const now = useNow(running);
  const elapsed = timerElapsed(timer, now);
  const limit = minutes * 60_000;
  const over = elapsed > limit;
  const pct = Math.min(1, elapsed / limit);

  return (
    <Panel title="Timer" id={`${problemId}-timer`} note={`${minutes} minutes`}>
      <p role="timer" aria-label={`Time spent: ${formatClock(elapsed)}`} className="tabular font-display text-[40px] leading-[44px] font-semibold text-ink">
        {formatClock(elapsed)}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-wash-strong" aria-hidden>
        <div className={cn('h-full rounded-full', over ? 'bg-alert' : 'bg-blueprint')} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className={cn('text-small', over ? 'font-semibold text-alert' : 'text-graphite')}>
        {over
          ? `${formatClock(elapsed - limit)} over. Wrap up, then mark the attempt done.`
          : running
            ? `${formatClock(limit - elapsed)} left`
            : elapsed > 0
              ? `Paused with ${formatClock(limit - elapsed)} left`
              : 'Start the timer when you start thinking.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button size="sm" onClick={() => pauseTimer(problemId)}>
            <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Pause
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => startTimer(problemId)}>
            <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {elapsed > 0 ? 'Resume' : 'Start timer'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => resetTimer(problemId)} disabled={elapsed === 0 && !running}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Reset
        </Button>
      </div>
    </Panel>
  );
}

export function NotesField({
  id,
  value,
  onChange,
  label = 'Notes',
  hint,
  rows = 9,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ui-lg font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-small text-graphite">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-control border border-control bg-paper px-3 py-2.5 text-ui-lg text-ink placeholder:text-graphite focus:border-blueprint"
        placeholder="Requirements, numbers, decisions"
      />
    </div>
  );
}

export function HintList({ problemId, hints, shown, onReveal }: { problemId: string; hints: Problem['hints']; shown: number; onReveal: () => void }) {
  const refs = useRef<(HTMLParagraphElement | null)[]>([]);
  const revealed = useRef<number | null>(null);
  useEffect(() => {
    if (revealed.current === null) return;
    refs.current[revealed.current]?.focus();
    revealed.current = null;
  }, [shown]);

  return (
    <Panel title="Hints" id={`${problemId}-hints`} note={`${Math.min(shown, hints.length)} of ${hints.length} shown`}>
      <p className="text-small text-graphite">Each hint gives away a little more. Give yourself a few minutes before the first one.</p>
      <ol className="flex flex-col gap-3">
        {hints.map((h, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule text-small font-semibold text-graphite"
              aria-hidden
            >
              {i + 1}
            </span>
            {i < shown ? (
              <p
                ref={(el) => {
                  refs.current[i] = el;
                }}
                tabIndex={-1}
                className="text-ui-lg text-ink"
              >
                <span className="sr-only">Hint {i + 1}: </span>
                <MdInline md={h} />
              </p>
            ) : i === shown ? (
              <Button
                size="sm"
                onClick={() => {
                  revealed.current = i;
                  onReveal();
                }}
              >
                <Lightbulb className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Show hint {i + 1}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-ui text-graphite">
                <Lock className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                Unlocks after hint {i}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Walkthrough and review pieces                                       */
/* ------------------------------------------------------------------ */

export function FollowUpItem({ q, a, label }: { q: string; a: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-rule bg-paper px-5 py-4">
      {label ? <p className="text-small text-graphite">{label}</p> : null}
      <p className="text-body font-semibold text-ink">
        <MdInline md={q} />
      </p>
      {open ? (
        <div className="mt-2 border-t border-rule pt-3">
          <Md md={a} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-ui font-semibold text-blueprint hover:underline" aria-expanded={false}>
          Show the model answer
        </button>
      )}
    </div>
  );
}

/** The lessons behind missed rubric items. */
export function ReviewNextList({ links, missedOther = [] }: { links: ReviewLink[]; missedOther?: string[] }) {
  if (!links.length && !missedOther.length) {
    return <p className="text-ui-lg text-ink">You met every rubric item. Try a harder problem next, or the same one as a timed mock interview.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {links.map((l) => (
        <li key={l.lessonId} className="flex flex-col gap-1 py-3">
          <LessonLink id={l.lessonId} className="text-ui-lg font-semibold" />
          <p className="text-ui text-graphite">
            Missed: <MdInline md={l.items.join('; ')} />
          </p>
        </li>
      ))}
      {missedOther.map((item) => (
        <li key={item} className="py-3 text-ui text-graphite">
          Missed: <MdInline md={item} />
        </li>
      ))}
    </ul>
  );
}
