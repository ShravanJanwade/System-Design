import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Chip, Segmented } from '@/design/primitives';
import type { WidgetProps } from '../registry';
import { MODE_INFO, MODE_ORDER, PEOPLE, buildStory, describeStep, type CopyView, type Message, type Mode, type Outcome, type User } from './logic';

/** Each person's color, plus a line style so color is never the only cue. */
const COLOR: Record<User, string> = { maya: 'var(--type-cache)', sam: 'var(--type-messaging)' };
const LINE: Record<User, 'solid' | 'dashed'> = { maya: 'solid', sam: 'dashed' };
const USERS: User[] = ['maya', 'sam'];

/** Where a cursor's name tag sits: above, extending right (the default) or left, or below the line. */
type TagPlace = 'right' | 'left' | 'below';
const TAG_PLACE: Record<TagPlace, string> = {
  right: 'bottom-full left-0 mb-0.5',
  left: 'bottom-full right-0 mb-0.5',
  below: 'top-full left-0 mt-0.5',
};

function CursorMark({ user, own, place }: { user: User; own: boolean; place: TagPlace }) {
  return (
    <span className="relative mx-px inline-block w-0.5 self-stretch" style={{ background: COLOR[user] }}>
      <span
        className={`absolute ${TAG_PLACE[place]} rounded-[3px] px-1 font-sans text-[10px] leading-4 font-bold whitespace-nowrap`}
        style={{ background: 'var(--card)', color: 'var(--card-ink)', border: `1.5px ${LINE[user]} ${COLOR[user]}` }}
      >
        {own ? `${PEOPLE[user].name} (you)` : PEOPLE[user].name}
      </span>
    </span>
  );
}

function Editor({ copy }: { copy: CopyView }) {
  const headingId = useId();
  const items: ReactNode[] = [];
  // Two cursors a few characters apart would stack their name tags on top of each other, so the
  // left one's tag extends left instead, or drops below the line when there is no room on the left.
  const placeOf = (c: { user: User; index: number }): TagPlace => {
    const other = copy.cursors.find((o) => o.user !== c.user);
    if (!other || Math.abs(other.index - c.index) >= 9) return 'right';
    const isLeft = c.index < other.index || (c.index === other.index && c.user === 'maya');
    if (!isLeft) return 'right';
    return c.index >= 6 ? 'left' : 'below';
  };
  const cursorsAt = (i: number) =>
    copy.cursors
      .filter((c) => c.index === i)
      .map((c) => <CursorMark key={`cursor-${c.user}`} user={c.user} own={c.user === copy.owner} place={placeOf(c)} />);
  copy.tiles.forEach((t, i) => {
    items.push(<Fragment key={`before-${t.key}`}>{cursorsAt(i)}</Fragment>);
    const by = t.author === 'base' ? null : t.author;
    items.push(
      <span key={t.key} className="inline-flex flex-col items-center">
        <span className="px-px" style={by ? { borderBottom: `2px ${LINE[by]} ${COLOR[by]}` } : { borderBottom: '2px solid transparent' }}>
          {t.ch === ' ' ? ' ' : t.ch}
        </span>
        {t.label ? <span className="tabular font-sans text-[9px] leading-3 text-card-muted">{t.label}</span> : null}
      </span>,
    );
  });
  items.push(<Fragment key="end">{cursorsAt(copy.tiles.length)}</Fragment>);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-1 rounded-card bg-card p-3 text-card-ink sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="text-ui font-semibold">
          {PEOPLE[copy.owner].name}’s {PEOPLE[copy.owner].device}
        </h4>
        <ul className="flex items-center gap-1.5" aria-label="Who is here">
          {USERS.map((u) => (
            <li key={u} className="flex items-center">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ border: `2px ${LINE[u]} ${COLOR[u]}`, color: 'var(--card-ink)' }}
                aria-hidden
              >
                {PEOPLE[u].initial}
              </span>
              <span className="sr-only">{PEOPLE[u].name} is here</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="flex flex-wrap items-stretch gap-y-5 pt-5 font-mono text-[15px] leading-6" aria-hidden>
        {items}
      </p>
      <p className="sr-only">
        {PEOPLE[copy.owner].name}’s copy reads “{copy.text}”.
      </p>
    </section>
  );
}

function MessageRow({ m }: { m: Message }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card px-3 py-2 text-small text-panel-text" style={{ border: '1px solid var(--panel-chip-border)' }}>
      <span className="font-semibold">{PEOPLE[m.from].name}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-label="sends to" />
      <span className="font-semibold">{m.to === 'server' ? 'the server' : PEOPLE[m.to].name}:</span>
      <span className="font-mono">{m.what}</span>
      <span className="text-panel-muted">({m.note})</span>
    </li>
  );
}

function OutcomeChip({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <Chip tone={ok ? 'success' : 'alert'}>
      {ok ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> : <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />}
      {ok ? yes : no}
    </Chip>
  );
}

function Outcomes({ outcome }: { outcome: Outcome }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="What survived">
      <OutcomeChip ok={outcome.mayaKept} yes="Maya’s edit kept" no="Maya’s edit lost" />
      <OutcomeChip ok={outcome.samKept} yes="Sam’s edit kept" no="Sam’s edit lost" />
      <OutcomeChip ok={outcome.same} yes="Both copies match" no="The copies differ" />
    </div>
  );
}

export default function CollabEditingWidget({ props }: WidgetProps) {
  const start: Mode = MODE_ORDER.includes(props?.mode as Mode) ? (props?.mode as Mode) : 'lww';
  const [mode, setMode] = useState<Mode>(start);
  const [stepIndex, setStepIndex] = useState(0);
  const story = useMemo(() => buildStory(mode), [mode]);
  const last = story.steps.length - 1;
  const step = story.steps[stepIndex]!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">How the copies merge</span>
          <Segmented<Mode>
            label="How the copies merge"
            value={mode}
            onChange={setMode}
            options={MODE_ORDER.map((m) => ({ value: m, label: MODE_INFO[m].tab }))}
            className="flex-wrap self-start"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
            Back
          </Button>
          <span className="tabular text-small text-graphite">
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
        <p aria-live="polite" className="text-ui-lg text-ink">
          <span className="font-semibold">{step.title}.</span> {step.caption}
        </p>
      </div>

      <section aria-label={`${MODE_INFO[mode].title}: step ${stepIndex + 1}`} className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-4">
        <p className="sr-only">{describeStep(step)}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Editor copy={step.maya} />
          <Editor copy={step.sam} />
        </div>
        {step.messages.length ? (
          <ul className="flex flex-col gap-2" aria-label="Edits on their way">
            {step.messages.map((m) => (
              <MessageRow key={m.from} m={m} />
            ))}
          </ul>
        ) : null}
      </section>

      {step.outcome ? <Outcomes outcome={step.outcome} /> : null}

      <p className="text-small text-graphite">
        Underlines show who typed what: solid for Maya, dashed for Sam. Each cursor carries its owner’s name, the way presence shows who is editing
        where. {MODE_INFO[mode].labels} Edits really travel through Snapgram’s server; here you see only what each copy receives. Switch the merge
        rule at any step to compare.
      </p>
    </div>
  );
}
