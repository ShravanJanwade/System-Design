import { useEffect, useId, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Pause, Play, RotateCcw, Timer as TimerIcon, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Toggle } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  DRILLS,
  acceptedRange,
  clock,
  createTimer,
  finalMessage,
  formatNumber,
  grade,
  isExpired,
  offBy,
  parseNumber,
  pause,
  recordResult,
  resume,
  setEnabled,
  tally,
  tick,
  timerAnnouncement,
  timerOnFromProps,
  type DrillResult,
} from './logic';

/**
 * Timed estimation drills: a countdown per drill (pause it, or switch it off), an answer accepted
 * within 2× of the reference, the worked solution line by line, and a running tally.
 * Props: `timer` (false starts with the countdown switched off).
 */
export default function EstimationDrill({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const uid = useId();
  const [timerOn, setTimerOn] = useState(() => timerOnFromProps(props?.timer));
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [results, setResults] = useState<DrillResult[]>([]);
  const [timer, setTimer] = useState(() => createTimer(DRILLS[0]!.seconds, timerOn));

  const drill = DRILLS[index]!;
  const result = results.find((r) => r.drillId === drill.id);
  const finished = results.length === DRILLS.length;
  const value = parseNumber(text);
  const score = useMemo(() => tally(results), [results]);
  const range = acceptedRange(drill.answer);
  const expired = isExpired(timer);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setTimer((t) => tick(t, 1)), 1000);
    return () => window.clearInterval(id);
  }, [timer.running]);

  const check = (answer: number | null) => {
    if (result) return;
    setResults((rs) => [...rs, recordResult(drill, answer, timer)]);
    setTimer((t) => pause(t));
  };

  const goTo = (next: number) => {
    setIndex(next);
    setText('');
    setTimer(createTimer(DRILLS[next]!.seconds, timerOn));
  };

  const restart = () => {
    setResults([]);
    goTo(0);
  };

  const switchTimer = (on: boolean) => {
    setTimerOn(on);
    setTimer((t) => (result ? { ...t, enabled: on, running: false } : setEnabled(t, on)));
  };

  const g = result && result.value !== null ? grade(drill, result.value) : null;
  const pct = timer.limit > 0 ? (timer.remaining / timer.limit) * 100 : 0;
  const lowTime = timer.enabled && timer.remaining <= 10;

  return (
    <div className="flex flex-col gap-5 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-small font-semibold text-graphite tabular">
          Drill {index + 1} of {DRILLS.length}: {drill.title}
        </p>
        <p className="text-small text-graphite tabular">
          {score.correct} of {score.done} within 2×, {score.correctInTime} in time
        </p>
      </div>

      {/* Countdown */}
      <div className="flex flex-col gap-3 rounded-card border border-rule p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="timer" aria-live="off" aria-label="Time left">
            <TimerIcon className={cn('h-5 w-5', expired ? 'text-alert' : 'text-graphite')} strokeWidth={1.5} aria-hidden />
            <span className={cn('text-ui-lg font-semibold tabular', expired ? 'text-alert' : 'text-ink')}>
              {!timer.enabled ? 'Timer off' : expired ? 'Time is up' : `${clock(timer.remaining)} left`}
            </span>
          </div>
          {timer.enabled && !result && !expired ? (
            <Button size="sm" onClick={() => setTimer((t) => (t.running ? pause(t) : resume(t)))}>
              {timer.running ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              {timer.running ? 'Pause timer' : 'Resume timer'}
            </Button>
          ) : null}
        </div>
        {timer.enabled ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-wash-strong" aria-hidden>
            <div
              className={cn('h-full rounded-full', lowTime ? 'bg-alert' : 'bg-blueprint', !reduced && 'transition-[width] duration-1000 ease-linear')}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <Toggle
          id={`${uid}-timer`}
          label="Countdown"
          description="Switch it off to work without time pressure. Time then does not count."
          checked={timerOn}
          onChange={switchTimer}
        />
        <p className="sr-only" aria-live="polite">
          {timerAnnouncement(timer)}
        </p>
      </div>

      {/* The drill */}
      <div className="flex flex-col gap-3">
        <p className="text-ui-lg font-semibold text-ink">{drill.prompt}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-ink">
          {drill.givens.map((given) => (
            <li key={given}>{given}</li>
          ))}
        </ul>
        {expired && !result ? (
          <p className="text-ui text-alert">Time is up. In the room you would round harder and give an answer anyway, so answer now.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${uid}-answer`} className="sr-only">
            Your estimate, in {drill.unit}
          </label>
          <input
            id={`${uid}-answer`}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            disabled={Boolean(result)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value !== null) check(value);
            }}
            className="tabular h-10 w-40 rounded-control border border-control bg-paper px-3 text-ui-lg text-ink focus-visible:border-blueprint"
            aria-describedby={`${uid}-unit`}
          />
          <span id={`${uid}-unit`} className="text-ui text-graphite">
            {drill.unit}
          </span>
        </div>
        {text && value === null && !result ? <p className="text-ui text-alert">Enter a number, such as 5000, 5,000 or 5k.</p> : null}
        {!result ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={value === null} onClick={() => check(value)}>
              Check my estimate
            </Button>
            <Button variant="ghost" onClick={() => check(null)}>
              Show the solution
            </Button>
          </div>
        ) : null}
      </div>

      {/* Verdict and worked solution */}
      {result ? (
        <div aria-live="polite" className={cn('flex flex-col gap-3 border-l-[3px] pl-4', result.status === 'correct' ? 'border-success' : 'border-alert')}>
          <p className="flex items-start gap-2 text-ui-lg text-ink">
            {result.status === 'correct' ? (
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
            ) : (
              <X className="mt-0.5 h-5 w-5 shrink-0 text-alert" strokeWidth={1.5} aria-hidden />
            )}
            <span>
              <strong className="font-semibold">
                {result.status === 'correct' ? 'Within 2×.' : result.status === 'wrong' ? 'Not within 2×.' : 'Solution shown.'}
              </strong>{' '}
              {g ? `You said ${formatNumber(g.value)}, ${offBy(g)}. ` : ''}
              {result.inTime === null ? 'Untimed.' : result.inTime ? 'In time.' : 'Over time.'}
            </span>
          </p>
          <p className="text-ui text-ink">
            Reference: <strong className="tabular">{formatNumber(drill.answer)} {drill.unit}</strong>. Anything from{' '}
            <span className="tabular">{formatNumber(range.low)}</span> to <span className="tabular">{formatNumber(range.high)}</span> counts, because estimates only need the
            right order of magnitude.
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-ui text-ink">
            {drill.solution.map((line, i) => (
              <motion.li
                key={line}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { delay: 0.35 * i, duration: 0.25 }}
                className="tabular"
              >
                {line}
              </motion.li>
            ))}
          </ol>
          <p className="text-ui text-graphite">
            <strong className="font-semibold text-ink">What it decides:</strong> {drill.decision}
          </p>
          {index < DRILLS.length - 1 ? (
            <div>
              <Button variant="primary" onClick={() => goTo(index + 1)}>
                Next drill
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* End of the series */}
      {finished ? (
        <div className="flex flex-col gap-4 border-t border-rule pt-4">
          <div className="flex flex-wrap gap-5">
            <Stat label="Within 2×" value={`${score.correct} of ${DRILLS.length}`} tone={score.correct === DRILLS.length ? 'success' : 'ink'} />
            <Stat label="Within 2× and in time" value={score.timed > 0 ? `${score.correctInTime} of ${score.timed}` : 'Untimed'} />
            <Stat label="Solutions shown" value={String(score.revealed)} />
          </div>
          <p className="text-ui-lg text-ink">{finalMessage(score, DRILLS.length)}</p>
          <div>
            <Button onClick={restart}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Start the drills again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
