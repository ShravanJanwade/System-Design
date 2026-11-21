import { Fragment, useEffect, useId, useState } from 'react';
import { Check, Circle, Hammer, ListPlus, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Chip, Slider } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  CORRECTION_AT,
  EVENT_LABEL,
  INITIAL_LOG,
  ORDER_NUMBER,
  STAGE_LABEL,
  STORED_DUPLICATE,
  append,
  describeStep,
  eventDetail,
  eventEffect,
  formatAt,
  formatDuration,
  money,
  orderPageProjection,
  orderProjection,
  replay,
  ruleProblems,
  timingsProjection,
  viewOrderPage,
  viewTimings,
  voidRefundRecord,
  type OrderEvent,
} from './logic';

/** Pause between events while a new read model is rebuilt, so the replay can be watched. */
const REBUILD_STEP_MS = 280;

function Tag({ children, tone }: { children: string; tone: 'signal' | 'repeat' | 'plain' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 text-small font-semibold whitespace-nowrap',
        tone === 'signal' ? 'bg-signal text-on-signal' : 'border text-card-ink',
      )}
      style={tone === 'repeat' ? { borderColor: 'var(--type-cache)' } : tone === 'plain' ? { borderColor: 'var(--card-muted)' } : undefined}
    >
      {children}
    </span>
  );
}

/** The event store's stream for one order, on the blueprint panel. Replayed events are white cards; the rest are outlines. */
function EventLog({ log, cursor, rebuildAt, reduced }: { log: readonly OrderEvent[]; cursor: number; rebuildAt: number | null; reduced: boolean }) {
  const voidedBy = new Map<number, number>();
  for (const e of log) if (e.kind === 'RefundRecordVoided') voidedBy.set(e.voids, e.seq);
  const dup = STORED_DUPLICATE;

  return (
    <div className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-ui font-semibold text-panel-text">Event store, order {ORDER_NUMBER}</span>
        <span className="text-small text-panel-muted">Append-only, oldest first</span>
      </div>
      <ol className="flex flex-col gap-2" aria-label={`Events of order ${ORDER_NUMBER}, oldest first`}>
        {log.map((e, i) => {
          const applied = i < cursor;
          const current = i === cursor - 1;
          const replaying = rebuildAt !== null && i === rebuildAt - 1;
          const voider = voidedBy.get(e.seq);
          const voidedNow = voider !== undefined && cursor >= voider;
          const repeat = applied && dup !== null && e.seq === dup.seq && !voidedNow;
          return (
            <li
              key={e.seq}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex flex-wrap items-start gap-x-3 gap-y-1 rounded-card border px-3 py-2',
                applied ? 'bg-card text-card-ink' : 'border-dashed text-panel-muted',
                current && 'outline-2 outline-offset-2 outline-signal',
                !reduced && 'transition-colors duration-200',
              )}
              style={{
                borderColor: applied ? (repeat ? 'var(--type-cache)' : 'var(--card)') : 'var(--panel-chip-border)',
                borderLeftWidth: repeat ? 4 : undefined,
              }}
            >
              <span
                className="tabular mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1.5 text-small font-semibold"
                style={{ borderColor: applied ? 'var(--type-messaging)' : 'var(--panel-chip-border)' }}
              >
                {e.seq}
              </span>
              <span className="flex min-w-[10rem] flex-1 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{EVENT_LABEL[e.kind]}</span>
                  <span className={cn('tabular text-small', applied ? 'text-card-muted' : 'text-panel-muted')}>{formatAt(e.at)}</span>
                </span>
                <span className={cn('text-small', applied ? 'text-card-muted' : 'text-panel-muted')}>{eventDetail(e)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
                <span className="tabular text-small font-semibold">{eventEffect(e)}</span>
                {replaying ? <Tag tone="signal">replaying</Tag> : null}
                {repeat ? <Tag tone="repeat">{`repeats event ${dup.of}`}</Tag> : null}
                {voidedNow ? <Tag tone="plain">{`voided by event ${voider}`}</Tag> : null}
                {applied && i >= INITIAL_LOG.length ? <Tag tone="plain">appended by you</Tag> : null}
              </span>
              <span className="sr-only">{current ? 'Just replayed.' : applied ? 'Replayed.' : 'Not replayed yet.'}</span>
            </li>
          );
        })}
        <li
          aria-hidden
          className="rounded-card border border-dashed px-3 py-2 text-small text-panel-muted"
          style={{ borderColor: 'var(--panel-chip-border)' }}
        >
          New events are added here. Nothing above ever changes.
        </li>
      </ol>
    </div>
  );
}

export default function EventReplayWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const ids = useId();
  const startAt = typeof props?.startAt === 'number' ? Math.max(0, Math.min(INITIAL_LOG.length, Math.round(props.startAt))) : 0;
  const [log, setLog] = useState<readonly OrderEvent[]>(INITIAL_LOG);
  const [cursor, setCursor] = useState(startAt);
  const [fixMessage, setFixMessage] = useState('');
  const [timingsBuilt, setTimingsBuilt] = useState(false);
  const [rebuildAt, setRebuildAt] = useState<number | null>(null);

  // Rebuilding the new read model replays the log one event at a time, up to the replay position.
  useEffect(() => {
    if (rebuildAt === null) return;
    const done = rebuildAt >= cursor;
    const timer = window.setTimeout(
      () => {
        if (done) {
          setRebuildAt(null);
          setTimingsBuilt(true);
        } else {
          setRebuildAt(rebuildAt + 1);
        }
      },
      done ? 0 : REBUILD_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [rebuildAt, cursor]);

  const dup = STORED_DUPLICATE;
  const state = replay(orderProjection, log, cursor);
  const problems = ruleProblems(state);
  const page = replay(orderPageProjection, log, cursor);
  const pageView = viewOrderPage(page);
  const building = rebuildAt !== null;
  const timingRows = viewTimings(replay(timingsProjection, log, building ? rebuildAt : cursor));
  const atEnd = cursor >= log.length;

  const build = () => {
    if (reduced) {
      setRebuildAt(null);
      setTimingsBuilt(true);
      return;
    }
    setTimingsBuilt(false);
    setRebuildAt(0);
  };

  const correct = () => {
    if (!dup) return;
    const r = voidRefundRecord(log, dup.seq, CORRECTION_AT);
    if (!r.ok) {
      setFixMessage(r.reason);
      return;
    }
    const next = append(log, r.event);
    setLog(next);
    setCursor(next.length);
    setFixMessage(
      `Appended event ${r.event.seq} on ${formatAt(r.event.at)}. Events ${dup.of} and ${dup.seq} are still in the log, and replaying all ${next.length} events now gives ${money(replay(orderProjection, next).refunded)} refunded.`,
    );
  };

  const reset = () => {
    setLog(INITIAL_LOG);
    setCursor(startAt);
    setFixMessage('');
    setTimingsBuilt(false);
    setRebuildAt(null);
  };

  const changed = log.length !== INITIAL_LOG.length || cursor !== startAt || timingsBuilt || building || fixMessage !== '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0}>
            Back
          </Button>
          <Button size="sm" variant="primary" onClick={() => setCursor((c) => Math.min(log.length, c + 1))} disabled={atEnd}>
            Replay the next event
          </Button>
        </div>
        <Slider
          id={`${ids}-cursor`}
          label="Events replayed"
          value={cursor}
          min={0}
          max={log.length}
          onChange={(v) => setCursor(Math.round(v))}
          format={(v) => `${v} of ${log.length}`}
        />
        <p aria-live="polite" className="min-h-[3.5rem] text-ui-lg text-ink">
          {describeStep(log, cursor)}
        </p>
      </div>

      <EventLog log={log} cursor={cursor} rebuildAt={rebuildAt} reduced={reduced} />

      <section aria-labelledby={`${ids}-state`} className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-0.5">
          <h4 id={`${ids}-state`} className="text-ui-lg font-semibold text-ink">
            Order state, derived by replaying
          </h4>
          <p className="text-small text-graphite">
            {cursor === 0
              ? 'Only the events are stored. With none replayed, there is no order.'
              : `Computed from events 1 to ${cursor}. It is not stored anywhere; replaying recomputes it.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <Stat label="Status" value={state.stage ? STAGE_LABEL[state.stage] : 'None'} note={`stream version ${state.version}`} />
          </div>
          <Stat label="Paid" value={money(state.paid)} note={state.total > 0 ? `of ${money(state.total)}` : 'nothing due'} />
          <Stat
            label="Refunded"
            value={money(state.refunded)}
            tone={problems.length ? 'alert' : 'ink'}
            note={state.requested > 0 ? `${money(state.requested)} requested` : 'nothing requested'}
          />
        </div>
        {problems.length ? (
          <p className="text-ui text-alert">
            <span className="font-semibold">A business rule is broken:</span> {problems[0]} One of the stored events must be wrong. Fix it below.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby={`${ids}-page`} className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id={`${ids}-page`} className="text-ui-lg font-semibold text-ink">
              Order page
            </h4>
            <Chip tone="blueprint">read model</Chip>
          </div>
          <p className="text-small text-graphite">What Maya sees. A projector updates it after each event, so a page view never replays anything.</p>
          <div className="flex flex-col gap-2.5 rounded-card border border-rule p-3">
            <p className="text-small text-graphite">
              Order {ORDER_NUMBER}, photo book of 30 photos
            </p>
            <p className="font-display text-[22px] leading-7 font-semibold text-ink">{pageView.headline}</p>
            <ol className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Order progress">
              {pageView.steps.map((s) => (
                <li key={s.stage} className={cn('inline-flex items-center gap-1 text-small', s.done ? 'font-semibold text-ink' : 'text-graphite')}>
                  {s.done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  )}
                  {s.label}
                  <span className="sr-only">{s.done ? ', done' : ', not yet'}</span>
                </li>
              ))}
            </ol>
            {pageView.lines.length ? (
              <ul className="tabular flex flex-col text-ui text-ink">
                {pageView.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="tabular text-small text-graphite">
            {page.version === 0 ? 'Empty: no events applied yet.' : `Up to date with event ${page.version}.`}
          </p>
        </section>

        <section aria-labelledby={`${ids}-timings`} className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id={`${ids}-timings`} className="text-ui-lg font-semibold text-ink">
              Print timings
            </h4>
            <Chip tone="blueprint">new read model</Chip>
          </div>
          <p className="text-small text-graphite">
            Operations wants to know how long each stage takes. Nobody planned this view, but every event has a time, so it can be built from the same
            log.
          </p>
          {timingsBuilt || building ? (
            <>
              <dl className="tabular grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-ui">
                {timingRows.map((r) => (
                  <Fragment key={r.label}>
                    <dt className="text-graphite">{r.label}</dt>
                    <dd className="text-right text-ink">{r.minutes === null ? '–' : formatDuration(r.minutes)}</dd>
                  </Fragment>
                ))}
              </dl>
              <p aria-live="polite" className="tabular text-small text-graphite">
                {building
                  ? rebuildAt === 0
                    ? 'Starting from an empty read model…'
                    : `Replaying event ${rebuildAt} of ${cursor}…`
                  : cursor === 0
                    ? 'Built, but no events are replayed yet, so every row is empty.'
                    : `Built from events 1 to ${cursor}. Stages that have not happened yet show a dash.`}
              </p>
              {!building ? (
                <div>
                  <Button size="sm" variant="ghost" onClick={build}>
                    <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    Throw it away and rebuild
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <Button onClick={build}>
                <Hammer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Build it by replaying the log
              </Button>
            </div>
          )}
        </section>
      </div>

      {dup ? (
        <section aria-labelledby={`${ids}-fix`} className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
          <h4 id={`${ids}-fix`} className="text-ui-lg font-semibold text-ink">
            Fix the mistake without editing history
          </h4>
          <p className="text-ui text-graphite">
            Maya’s bank shows one refund of $15, but events {dup.of} and {dup.seq} both record it: the support tool timed out and retried. An event store
            has no edit and no delete, so the fix is a command that checks the current state and appends a correcting event.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={correct}>
              <ListPlus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Append a correction for event {dup.seq}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={!changed}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Reset the demo
            </Button>
          </div>
          <p aria-live="polite" className="min-h-[2.5rem] text-ui text-ink">
            {fixMessage}
          </p>
        </section>
      ) : null}
    </div>
  );
}
