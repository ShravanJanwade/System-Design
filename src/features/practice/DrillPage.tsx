import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import type { ModuleId, PracticeItem } from '@/content/types';
import { getOutline, lessonPath } from '@/content/modules';
import { Button } from '@/design/Button';
import { QuestionView, type QuestionResult } from '@/features/quiz/QuestionView';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { plural } from '@/lib/format';
import { usePractice, type DrillMode } from '@/state/practice';
import { useProgress } from '@/state/progress';
import { usePracticeContent } from './data';
import {
  filterItems,
  itemStatus,
  matchCount,
  matchDetail,
  modeSummary,
  modulesWithItems,
  readLessonCount,
  remainingCount,
  roundState,
  scoreLine,
  sessionAnswer,
  sessionNewRound,
  sessionNext,
  sessionPick,
  sessionRestart,
  sessionScore,
  sessionSetFilters,
  sessionSkip,
  summaryLine,
  type DrillSession,
  type PracticeFilters,
} from './logic';
import { DRILLS } from './modes';
import { ItemStatusChip, PracticeTrail } from './parts';
import { useDrillSession, useDrillSessions } from './session';

/** /practice/estimation, /practice/bottleneck and /practice/tools: one question at a time, with a running score. */
export default function DrillPage({ mode }: { mode: DrillMode }) {
  const info = DRILLS[mode];
  const { state, retry } = usePracticeContent();
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <PracticeTrail />
        <PageHeader title={info.title} intro={info.intro} />
      </div>
      {state.status === 'ready' ? (
        <Drill mode={mode} items={state.content[mode]} />
      ) : state.status === 'error' ? (
        <div className="measure flex flex-col items-start gap-3" role="alert">
          <p className="text-ui-lg text-ink">The questions did not load. Check your connection, then try again.</p>
          <Button variant="primary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        <p className="text-ui text-graphite" role="status">
          Loading questions
        </p>
      )}
    </Page>
  );
}

/** Moves focus once the next render has painted, so a key press that caused it cannot also activate the target. */
function focusSoon(ref: RefObject<HTMLElement | null>) {
  requestAnimationFrame(() => ref.current?.focus());
}

function Drill({ mode, items }: { mode: DrillMode; items: PracticeItem[] }) {
  const info = DRILLS[mode];
  const session = useDrillSession(mode);
  const update = useDrillSessions((s) => s.update);
  const records = usePractice((s) => s.items);
  const tally = usePractice((s) => s.modes[mode]);
  const recordAnswer = usePractice((s) => s.recordAnswer);
  const lessons = useProgress((s) => s.lessons);
  const isRead = useCallback((lessonId: string) => lessons[lessonId]?.read === true, [lessons]);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const candidates = useMemo(() => filterItems(items, session.filters, isRead), [items, session.filters, isRead]);
  const round = roundState(session, candidates);
  const current = session.currentId ? byId.get(session.currentId) : undefined;
  const remaining = remainingCount(session, candidates);
  const score = sessionScore(session);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const ids = useId();

  // Coming back after answering (say, from "Review the lesson"): start with a fresh question.
  useEffect(() => {
    update(mode, sessionNext);
  }, [mode, update]);

  // Put a question on screen when none is there, or when the one shown is no longer in the content.
  useEffect(() => {
    if (session.currentId && !byId.has(session.currentId)) update(mode, (s) => ({ ...s, currentId: null, checked: false }));
    else if (round === 'pending') update(mode, (s) => sessionPick(s, candidates, records));
  }, [round, session.currentId, byId, candidates, records, mode, update]);

  const act = (fn: (s: DrillSession) => DrillSession, list: PracticeItem[] = candidates) => {
    update(mode, (s) => sessionPick(fn(s), list, records));
    setAnnouncement('');
    focusSoon(headingRef);
  };

  const onChecked = ({ correct }: QuestionResult) => {
    if (!current || session.checked) return;
    recordAnswer(mode, current.id, correct);
    update(mode, (s) => sessionAnswer(s, correct));
    const after = { ...score, answered: score.answered + 1, correct: score.correct + (correct ? 1 : 0) };
    setAnnouncement(`${correct ? 'Correct' : 'Not quite'}. This session: ${scoreLine(after)}`);
    focusSoon(nextRef);
  };

  const setFilters = (filters: PracticeFilters) => {
    const list = filterItems(items, filters, isRead);
    update(mode, (s) => sessionPick(sessionSetFilters(s, filters), list, records));
  };

  if (!items.length) {
    return (
      <div className="measure flex flex-col gap-3">
        <p className="text-ui-lg text-ink">No questions are available in this mode.</p>
        <Link to="/practice" className="md-link text-ui-lg">
          See all practice modes
        </Link>
      </div>
    );
  }

  const moduleOptions = modulesWithItems(items);
  const readCount = readLessonCount(items, isRead);
  const summary = modeSummary(items, records);

  return (
    <div className="flex flex-col gap-10">
      <Filters
        filters={session.filters}
        onChange={setFilters}
        moduleOptions={moduleOptions}
        countLine={matchCount(candidates.length, items.length)}
        detailLine={matchDetail(candidates, records)}
      />

      <div className="grid gap-10 xl:grid-cols-[minmax(0,52rem)_18rem] xl:gap-12">
        <section aria-labelledby={`${ids}-heading`} className="flex min-w-0 flex-col gap-6">
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          {round === 'question' && current ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 id={`${ids}-heading`} ref={headingRef} tabIndex={-1} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
                  Question {session.shown}
                </h2>
                {!session.checked ? <ItemStatusChip status={itemStatus(records[current.id])} /> : null}
              </div>
              <QuestionView key={`${current.id}:${session.shown}`} question={current.question} onChecked={onChecked} />
              {session.checked ? (
                <AfterAnswer item={current} nextRef={nextRef} last={remaining === 0} onNext={() => act(sessionNext)} />
              ) : (
                <div>
                  <Button variant="ghost" onClick={() => act(sessionSkip)}>
                    Skip this question
                  </Button>
                </div>
              )}
            </>
          ) : round === 'complete' ? (
            <div className="measure flex flex-col items-start gap-4">
              <h2 id={`${ids}-heading`} ref={headingRef} tabIndex={-1} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
                Round complete
              </h2>
              <p className="text-ui-lg text-ink">
                You have been through all {plural(candidates.length, 'question')} that match these filters. This session: {scoreLine(score)}
              </p>
              <p className="text-ui text-graphite">Another round brings every matching question back, starting with the ones you missed. Or change the filters to practice a different set.</p>
              <Button variant="primary" onClick={() => act(sessionNewRound)}>
                Start another round
              </Button>
            </div>
          ) : round === 'empty' ? (
            <div className="measure flex flex-col items-start gap-4">
              <h2 id={`${ids}-heading`} ref={headingRef} tabIndex={-1} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
                No questions match
              </h2>
              <p className="text-ui-lg text-ink">
                {session.filters.readOnly && readCount.read === 0
                  ? 'You have not finished reading any of the lessons these questions come from. Show questions from all lessons, or read a lesson first.'
                  : session.filters.readOnly
                    ? 'None of the lessons you have read in this module have questions here. Show questions from all lessons, or choose another module.'
                    : 'Choose another module to see its questions.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                {session.filters.readOnly ? (
                  <Button variant="primary" onClick={() => setFilters({ ...session.filters, readOnly: false })}>
                    Show questions from all lessons
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setFilters({ ...session.filters, module: 'all' })}>
                    Show all modules
                  </Button>
                )}
                <Link to="/learn" className="md-link text-ui-lg">
                  Open the curriculum
                </Link>
              </div>
            </div>
          ) : (
            <p id={`${ids}-heading`} className="text-ui text-graphite" role="status">
              Choosing a question
            </p>
          )}
        </section>

        <aside aria-label="Your score" className="flex min-w-0 flex-col gap-8 lg:border-l lg:border-rule lg:pl-8">
          <div className="flex flex-col items-start gap-2">
            <h2 className="text-h3 font-bold text-ink">This session</h2>
            <p className="tabular text-ui-lg text-ink">{scoreLine(score)}</p>
            {score.answered || score.skipped ? (
              <Button size="sm" onClick={() => act(sessionRestart)}>
                Start a new session
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-h3 font-bold text-ink">Your record</h2>
            <p className="tabular text-ui text-graphite">{summaryLine(summary)}</p>
            {tally.attempts ? (
              <p className="tabular text-ui text-graphite">
                All time: {plural(tally.attempts, 'answer')}, {tally.correct} correct.
              </p>
            ) : null}
            <p className="text-ui text-graphite">
              You have read {readCount.read} of the {plural(readCount.total, 'lesson')} these questions come from.
            </p>
          </div>
          <p className="text-ui text-graphite">{info.tip}</p>
        </aside>
      </div>
    </div>
  );
}

function Filters({
  filters,
  onChange,
  moduleOptions,
  countLine,
  detailLine,
}: {
  filters: PracticeFilters;
  onChange: (f: PracticeFilters) => void;
  moduleOptions: { id: ModuleId; label: string }[];
  countLine: string;
  detailLine: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Choose questions">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-80">
          <label htmlFor={`${id}-module`} className="text-ui font-semibold text-ink">
            Module
          </label>
          <select
            id={`${id}-module`}
            value={filters.module}
            onChange={(e) => onChange({ ...filters, module: e.target.value as PracticeFilters['module'] })}
            className="h-10 w-full min-w-0 rounded-control border border-control bg-paper px-3 text-ui-lg text-ink"
          >
            <option value="all">All modules</option>
            {moduleOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor={`${id}-read`} className="flex min-h-10 cursor-pointer items-center gap-2 text-ui-lg text-ink">
          <input
            id={`${id}-read`}
            type="checkbox"
            checked={filters.readOnly}
            onChange={(e) => onChange({ ...filters, readOnly: e.target.checked })}
            className="h-4 w-4 shrink-0 accent-[var(--blueprint)]"
          />
          Only lessons I have read
        </label>
      </div>
      <p className="text-ui text-graphite">
        <span aria-live="polite">{countLine}</span> {detailLine}
      </p>
    </div>
  );
}

function AfterAnswer({ item, nextRef, last, onNext }: { item: PracticeItem; nextRef: RefObject<HTMLButtonElement | null>; last: boolean; onNext: () => void }) {
  const lesson = getOutline(item.lessonId);
  const flow = item.flowchartLessonId ? getOutline(item.flowchartLessonId) : undefined;
  const sameLesson = Boolean(flow && lesson && flow.id === lesson.id);
  const name = (o: { number: string; title: string }) => `${o.number} ${o.title}`;
  return (
    <div className="flex flex-col items-start gap-4 border-t border-rule pt-5">
      <ul className="flex flex-col gap-2 text-ui-lg">
        <li>
          <Link to={lessonPath(item.lessonId)} className="md-link">
            {sameLesson ? 'Review the lesson and its decision flowchart' : 'Review the lesson'}
            {lesson ? `: ${name(lesson)}` : ''}
          </Link>
        </li>
        {flow && !sameLesson ? (
          <li>
            <Link to={lessonPath(flow.id)} className="md-link">
              See the decision flowchart in {name(flow)}
            </Link>
          </li>
        ) : null}
      </ul>
      <Button ref={nextRef} variant="primary" onClick={onNext}>
        {last ? 'Finish this round' : 'Next question'}
      </Button>
    </div>
  );
}
