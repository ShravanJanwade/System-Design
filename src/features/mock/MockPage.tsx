import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ChevronLeft, Flag, Pause, Play, Timer } from 'lucide-react';
import type { Problem } from '@/content/types';
import { getProblem } from '@/content/problem-list';
import { Button, ButtonLink } from '@/design/Button';
import { Dialog } from '@/design/Dialog';
import { Segmented } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { Page } from '@/features/shared/PageHeader';
import { MdInline } from '@/features/learn/Markdown';
import { ArchitectureBuilder } from '@/features/builder/Builder';
import { describeDesign, toDiagramSpec } from '@/features/builder/model';
import { loadProfile, type CheckContext } from '@/features/builder/rules';
import { useProblem } from '@/features/problems/source';
import { FollowUpItem, NotesField, ReviewNextList, useNow, usePauseOnLeave } from '@/features/problems/parts';
import { RubricChecklist, ScoreReadout } from '@/features/problems/SelfAssessment';
import { finalDesignSpec, formatClock, formatDay, formatMinutes, missedWithoutLesson, reviewNext, rubricScore, stageTitle } from '@/features/problems/logic';
import { buildTimeline, normalizeLength, PHASES, type InterviewLength } from '@/widgets/interview-timeline/logic';
import { cn } from '@/lib/cn';
import { timerElapsed, useProblems, type MockSession } from '@/state/problems';
import { MINUTE, followUpCount, interviewerLog, mockClock, pickFollowUps, type MockClock } from './logic';

export default function MockPage() {
  const { problemId } = useParams();
  const load = useProblem(problemId);
  const summary = problemId ? getProblem(problemId) : undefined;

  if (load.status === 'loading') {
    return (
      <div className="px-4 py-16 sm:px-10" role="status">
        <p className="text-ui text-graphite">Loading the problem</p>
      </div>
    );
  }
  if (load.status !== 'ready') {
    return (
      <Page>
        <div className="measure flex flex-col gap-3">
          <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Mock interview</h1>
          <p className="text-ui-lg text-graphite">
            {summary
              ? `${summary.title} has not been written in this build yet, so it cannot be used for a mock interview. Pick a written problem instead.`
              : 'There is no problem at this address. Pick one from the problem list.'}
          </p>
          <div>
            <ButtonLink to="/problems">Open the problem list</ButtonLink>
          </div>
        </div>
      </Page>
    );
  }
  return <MockView key={load.problem.id} problem={load.problem} />;
}

function MockView({ problem }: { problem: Problem }) {
  const [params, setParams] = useSearchParams();
  const reviewId = params.get('session');
  const length = normalizeLength(params.get('length') ?? problem.minutes);
  const active = useProblems((s) => s.activeMocks[problem.id]);
  const sessions = useProblems((s) => s.sessions);
  const reviewSession = reviewId ? sessions.find((s) => s.id === reviewId && s.problemId === problem.id) : undefined;

  useEffect(() => {
    document.title = `Mock interview: ${problem.title} — Blueprint`;
  }, [problem.title]);

  if (reviewSession) return <Review problem={problem} session={reviewSession} />;
  if (active?.stage === 'score') return <ScoreSession problem={problem} session={active} />;
  if (active) return <Interview problem={problem} session={active} />;
  return <Setup problem={problem} length={length} onLength={(l) => setParams({ length: String(l) }, { replace: true })} />;
}

function BackLink({ problem }: { problem: Problem }) {
  return (
    <Link to={`/problems/${problem.id}`} className="inline-flex w-fit items-center gap-1 text-ui text-graphite hover:text-ink">
      <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      {problem.title}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function Setup({ problem, length, onLength }: { problem: Problem; length: InterviewLength; onLength: (l: InterviewLength) => void }) {
  const startMock = useProblems((s) => s.startMock);
  const timeline = useMemo(() => buildTimeline(length), [length]);
  const asks = followUpCount(length, problem.followUps.length);

  return (
    <Page>
      <header className="measure flex flex-col gap-3">
        <BackLink problem={problem} />
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Mock interview: {problem.title}</h1>
        <p className="text-ui-lg text-graphite">
          A timed run through the whole interview. A phase timer keeps you moving, the interviewer opens each phase, and you score yourself at the end.
        </p>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="mock-how" className="measure flex flex-col gap-3">
            <h2 id="mock-how" className="font-display text-h2-sm font-semibold text-ink">
              How it works
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-ink marker:text-graphite">
              <li>The timer follows the six phases of the interview framework. Each phase opens with a short prompt from the interviewer.</li>
              <li>
                During the deep dives, the interviewer asks {asks} follow-up {asks === 1 ? 'question' : 'questions'}.
              </li>
              <li>Write requirements and estimates in the notes panel, and draw your design on the canvas.</li>
              <li>At the end, score yourself against the rubric and compare your work with the reference walkthrough.</li>
            </ul>
            <p className="text-ui text-graphite">The timer pauses if you leave this page. Your practice notes and design for this problem stay separate.</p>
          </section>

          <section aria-labelledby="mock-plan" className="flex flex-col gap-3">
            <h2 id="mock-plan" className="font-display text-h2-sm font-semibold text-ink">
              The plan for {length} minutes
            </h2>
            <ol className="flex max-w-[960px] flex-col divide-y divide-rule border-y border-rule">
              {timeline.map((p) => (
                <li key={p.id} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <div className="flex flex-col">
                    <span className="text-ui-lg font-semibold text-ink">{p.name}</span>
                    <span className="tabular text-small text-graphite">
                      Minutes {p.start} to {p.end}
                    </span>
                  </div>
                  <p className="text-ui-lg text-ink">{p.goal}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-5 xl:sticky xl:top-8">
          <h2 className="text-ui-lg font-semibold text-ink">Ready when you are</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-ui font-semibold text-ink">Length</span>
            <Segmented
              value={String(length) as '45' | '60'}
              onChange={(v) => onLength(normalizeLength(v))}
              label="Interview length"
              options={[
                { value: '45', label: '45 minutes' },
                { value: '60', label: '60 minutes' },
              ]}
            />
            <p className="text-small text-graphite">At 60 minutes the extra time goes to the high-level design and the deep dives.</p>
          </div>
          <Button variant="primary" onClick={() => startMock(problem.id, length, pickFollowUps(problem.followUps.length, length, Date.now() >>> 0))}>
            <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Start mock interview
          </Button>
          <PastSessions problemId={problem.id} />
        </aside>
      </div>
    </Page>
  );
}

function PastSessions({ problemId }: { problemId: string }) {
  const sessions = useProblems((s) => s.sessions);
  const mine = useMemo(() => sessions.filter((s) => s.problemId === problemId).reverse().slice(0, 5), [sessions, problemId]);
  if (!mine.length) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <p className="text-ui font-semibold text-ink">Your past sessions</p>
      <ul className="flex flex-col gap-1.5">
        {mine.map((s) => (
          <li key={s.id} className="flex items-baseline justify-between gap-3 text-ui">
            <Link to={`/problems/${problemId}/mock?session=${s.id}`} className="md-link">
              {formatDay(s.finishedAt)}, {s.length} minutes
            </Link>
            <span className="tabular font-semibold text-ink">{s.score}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interview                                                           */
/* ------------------------------------------------------------------ */

function Interview({ problem, session }: { problem: Problem; session: MockSession }) {
  const id = problem.id;
  const updateMock = useProblems((s) => s.updateMock);
  const pauseMock = useProblems((s) => s.pauseMock);
  const resumeMock = useProblems((s) => s.resumeMock);
  const endMock = useProblems((s) => s.endMock);
  const discardMock = useProblems((s) => s.discardMock);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const running = session.timer.runningSince !== null;
  const now = useNow(running, 1000);
  const elapsed = timerElapsed(session.timer, now);
  const clock = mockClock(session.length, elapsed);
  const log = interviewerLog(session.length, elapsed, session.followUps);
  const context = useMemo<CheckContext>(() => ({ concepts: problem.concepts, load: loadProfile(problem.estimation.calculator) }), [problem]);

  // The clock pauses when you leave the page; resume when you are back.
  usePauseOnLeave(() => useProblems.getState().pauseMock(id));

  // Announce each new interviewer message to screen readers.
  const [announce, setAnnounce] = useState('');
  const seen = useRef(log.length);
  const latest = log[log.length - 1];
  const latestText = !latest
    ? ''
    : latest.kind === 'phase'
      ? `${latest.phaseName}. The interviewer asks: ${latest.text}`
      : `Follow-up question: ${problem.followUps[latest.followUp]?.q ?? ''}`;
  useEffect(() => {
    if (log.length > seen.current) setAnnounce(latestText);
    seen.current = log.length;
  }, [log.length, latestText]);

  const phaseGoal = PHASES.find((p) => p.id === clock.phase.id)?.goal ?? '';
  const newestFirst = [...log].reverse();

  return (
    <div className="flex flex-col">
      <PhaseBar clock={clock} running={running} onPause={() => pauseMock(id)} onResume={() => resumeMock(id)} onEnd={() => endMock(id)} title={problem.title} />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <Page>
        {!running && !clock.overtime ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule bg-paper px-4 py-3">
            <p className="text-ui-lg text-ink">
              <span className="font-semibold">Paused</span> at {formatClock(elapsed)}. The interviewer is waiting.
            </p>
            <Button variant="primary" size="sm" onClick={() => resumeMock(id)}>
              <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Resume
            </Button>
          </div>
        ) : null}
        {clock.overtime ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule bg-paper px-4 py-3">
            <p className="text-ui-lg text-ink">
              <span className="font-semibold">Time is up.</span> Finish your sentence, then score your session.
            </p>
            <Button variant="primary" size="sm" onClick={() => endMock(id)}>
              Score my session
            </Button>
          </div>
        ) : null}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-start-1">
            <section aria-labelledby="iv-h" className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
              <h2 id="iv-h" className="text-ui-lg font-semibold text-ink">
                Interviewer
              </h2>
              <ol className="flex flex-col gap-4">
                {newestFirst.map((m, i) => (
                  <li key={m.key} className={cn('border-l-[3px] pl-3', i === 0 ? 'border-blueprint' : 'border-rule')}>
                    <p className="tabular text-small text-graphite">
                      {m.kind === 'phase' ? m.phaseName : `Follow-up ${m.order + 1}`}, at {formatClock(m.atMs)}
                    </p>
                    <p className={cn(i === 0 ? 'text-ui-lg text-ink' : 'text-ui text-graphite')}>
                      {m.kind === 'phase' ? m.text : <MdInline md={problem.followUps[m.followUp]?.q ?? ''} />}
                    </p>
                  </li>
                ))}
                <li className="border-l-[3px] border-rule pl-3">
                  <p className="text-small text-graphite">The problem</p>
                  <p className="text-ui-lg text-ink">
                    <MdInline md={problem.prompt} />
                  </p>
                </li>
              </ol>
              <div className="border-t border-rule pt-3">
                <p className="text-small font-semibold text-graphite">What to cover in this phase</p>
                <p className="text-ui text-ink">{phaseGoal}</p>
              </div>
            </section>

            <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
              <NotesField
                id={`${id}-mock-notes`}
                value={session.notes}
                onChange={(notes) => updateMock(id, { notes })}
                hint="Requirements, estimates, the API and the decisions you make."
                rows={10}
              />
            </div>
          </div>

          <section aria-labelledby="mock-design" className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">
            <h2 id="mock-design" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
              Your design
            </h2>
            <ArchitectureBuilder design={session.design} onChange={(design) => updateMock(id, { design })} context={context} label="Your design" />
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-rule pt-6">
          <Button variant="primary" onClick={() => endMock(id)}>
            <Flag className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            End the interview and score it
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
            Discard this session
          </Button>
        </div>
      </Page>

      <Dialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this session?"
        description="Your notes and design from this mock interview are deleted, and nothing is saved to your history."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => {
              discardMock(id);
              setConfirmDiscard(false);
            }}
          >
            Discard session
          </Button>
          <Button onClick={() => setConfirmDiscard(false)}>Keep going</Button>
        </div>
      </Dialog>
    </div>
  );
}

function PhaseBar({
  clock,
  running,
  onPause,
  onResume,
  onEnd,
  title,
}: {
  clock: MockClock;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  title: string;
}) {
  return (
    <div className="sticky top-14 z-10 border-b border-rule bg-paper px-4 py-3 sm:px-8 lg:top-0 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-small text-graphite">
            Mock interview: {title}, phase {clock.index + 1} of {clock.phases.length}
          </p>
          <p className="text-ui-lg font-semibold text-ink">
            {clock.overtime ? 'Time is up' : clock.phase.name}
            {!clock.overtime ? <span className="tabular ml-2 font-normal text-graphite">{formatClock(clock.phaseRemainingMs)} left in this phase</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p role="timer" aria-label={`Elapsed ${formatMinutes(clock.elapsedMs)} of ${formatMinutes(clock.totalMs)}`} className="tabular text-ui-lg font-semibold text-ink">
            {formatClock(clock.elapsedMs)} <span className="font-normal text-graphite">/ {formatClock(clock.totalMs)}</span>
          </p>
          {running ? (
            <Button size="sm" onClick={onPause}>
              <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Pause
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onResume}>
              <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEnd}>
            End interview
          </Button>
        </div>
      </div>
      <ol className="mt-2.5 flex gap-1" aria-label="Interview phases">
        {clock.phases.map((p, i) => {
          const done = i < clock.index || clock.overtime;
          const current = i === clock.index && !clock.overtime;
          const fill = current ? Math.min(1, clock.phaseElapsedMs / (p.minutes * MINUTE)) : done ? 1 : 0;
          return (
            <li key={p.id} className="flex min-w-0 flex-col gap-1" style={{ flexGrow: p.minutes, flexBasis: 0 }}>
              <span className="sr-only">
                {p.name}, {p.minutes} minutes{current ? ', under way' : done ? ', done' : ''}
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-wash-strong" aria-hidden>
                <span className="block h-full rounded-full bg-blueprint" style={{ width: `${fill * 100}%` }} />
              </span>
              <span aria-hidden className={cn('hidden truncate text-small md:block', current ? 'font-semibold text-ink' : 'text-graphite')}>
                {p.name}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

function ScoreSession({ problem, session }: { problem: Problem; session: MockSession }) {
  const navigate = useNavigate();
  const finishMock = useProblems((s) => s.finishMock);
  const backToInterview = useProblems((s) => s.backToInterview);
  const [checked, setChecked] = useState<string[]>([]);
  const score = rubricScore(problem.rubric, checked);
  const spec = useMemo(() => toDiagramSpec(session.design), [session.design]);

  const save = () => {
    const sid = finishMock(problem.id, { score, checked });
    if (sid) navigate(`/problems/${problem.id}/mock?session=${sid}`, { replace: true });
  };

  return (
    <Page>
      <header className="measure flex flex-col gap-3">
        <BackLink problem={problem} />
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Score your session</h1>
        <p className="text-ui-lg text-graphite">
          You used {formatClock(session.usedMs ?? session.timer.elapsedMs)} of {session.length} minutes. Tick each rubric item your answer covered, as strictly as an interviewer would.
        </p>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <section aria-label="Rubric" className="flex min-w-0 flex-col gap-6">
          <RubricChecklist rubric={problem.rubric} checked={checked} onChange={setChecked} />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ScoreReadout score={score} label="Your score" />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => backToInterview(problem.id)}>
                Back to the interview
              </Button>
              <Button variant="primary" onClick={save}>
                Save session
              </Button>
            </div>
          </div>
        </section>

        <aside aria-label="Your work" className="flex min-w-0 flex-col gap-4">
          <h2 className="text-ui-lg font-semibold text-ink">Your work, for reference</h2>
          <NotesView notes={session.notes} />
          {spec ? <Diagram spec={spec} variant="plain" /> : <p className="text-ui text-graphite">You did not draw a design in this session.</p>}
        </aside>
      </div>
    </Page>
  );
}

function NotesView({ notes }: { notes: string }) {
  return notes.trim() ? (
    <div className="max-h-80 overflow-y-auto rounded-card border border-rule bg-paper px-4 py-3 text-ui-lg break-words whitespace-pre-wrap text-ink">{notes}</div>
  ) : (
    <p className="text-ui text-graphite">You did not take notes in this session.</p>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

function Review({ problem, session }: { problem: Problem; session: MockSession }) {
  const [, setParams] = useSearchParams();
  const updateWorkspace = useProblems((s) => s.updateWorkspace);
  const checked = session.checked ?? [];
  const links = reviewNext(problem.rubric, checked);
  const missedOther = missedWithoutLesson(problem.rubric, checked);
  const yourSpec = useMemo(() => toDiagramSpec(session.design), [session.design]);
  const finalSpec = useMemo(() => finalDesignSpec(problem), [problem]);
  const lastStage = problem.stages[problem.stages.length - 1];
  const asked = session.followUps.map((i) => problem.followUps[i]).filter((f): f is Problem['followUps'][number] => Boolean(f));

  return (
    <Page>
      <header className="flex flex-col gap-3">
        <BackLink problem={problem} />
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Session review: {problem.title}</h1>
        <p className="text-ui-lg text-graphite">
          {formatDay(session.finishedAt)}. {session.length}-minute interview, {formatClock(session.usedMs ?? session.timer.elapsedMs)} used.
        </p>
        <ScoreReadout score={session.score ?? 0} label="Your score" />
      </header>

      <section aria-labelledby="rv-next" className="measure flex flex-col gap-3">
        <h2 id="rv-next" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
          Review next
        </h2>
        <ReviewNextList links={links} missedOther={missedOther} />
      </section>

      <section aria-labelledby="rv-compare" className="flex flex-col gap-6">
        <div className="measure flex flex-col gap-1">
          <h2 id="rv-compare" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
            Your work next to the reference
          </h2>
          <p className="text-ui-lg text-graphite">Look for what the reference covers that you did not, and for choices you made differently. Different is fine when you can defend it.</p>
        </div>

        <CompareRow
          title="Requirements and numbers"
          yours={<NotesView notes={session.notes} />}
          reference={
            <div className="flex flex-col gap-3 text-ui-lg text-ink">
              <div>
                <p className="text-ui font-semibold text-ink">Functional</p>
                <ul className="list-disc pl-5 marker:text-graphite">
                  {problem.requirements.functional.map((r, i) => (
                    <li key={i}>
                      <MdInline md={r} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-ui font-semibold text-ink">Non-functional</p>
                <ul className="list-disc pl-5 marker:text-graphite">
                  {problem.requirements.nonFunctional.map((r, i) => (
                    <li key={i}>
                      <MdInline md={r} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-ui font-semibold text-ink">Estimates</p>
                <ul className="flex flex-col gap-1">
                  {problem.estimation.steps.map((s, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        <MdInline md={s.label} />
                      </span>
                      <span className="tabular font-semibold">
                        <MdInline md={s.result} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          }
        />

        <CompareRow
          title="Design"
          yours={
            yourSpec ? (
              <div className="flex flex-col gap-2">
                <Diagram spec={yourSpec} variant="plain" />
                <p className="sr-only">{describeDesign(session.design)}</p>
              </div>
            ) : (
              <p className="text-ui text-graphite">You did not draw a design in this session.</p>
            )
          }
          reference={
            finalSpec && lastStage ? (
              <div className="flex flex-col gap-2">
                <Diagram spec={finalSpec} variant="plain" />
                <p className="text-ui text-graphite">
                  <MdInline md={`${stageTitle(lastStage.title, problem.stages.length - 1)}. ${lastStage.explanation}`} />
                </p>
              </div>
            ) : null
          }
        />

        <div className="flex flex-col gap-3">
          <h3 className="text-h3 font-bold text-ink">The reference deep dives</h3>
          <ul className="measure flex flex-col divide-y divide-rule border-y border-rule">
            {problem.deepDives.map((d, i) => (
              <li key={i} className="flex flex-col gap-1 py-3">
                <p className="text-ui-lg font-semibold text-ink">
                  <MdInline md={d.title} />
                </p>
                <p className="text-ui-lg text-ink">
                  <MdInline md={d.recommendation} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {asked.length ? (
        <section aria-labelledby="rv-follow" className="measure flex flex-col gap-3">
          <h2 id="rv-follow" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
            The follow-ups you were asked
          </h2>
          {asked.map((f, i) => (
            <FollowUpItem key={i} q={f.q} a={f.a} label={`Follow-up ${i + 1}`} />
          ))}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-rule pt-6">
        <ButtonLink to={`/problems/${problem.id}`} variant="primary" onClick={() => updateWorkspace(problem.id, { view: 'walkthrough' })}>
          Open the full walkthrough
        </ButtonLink>
        <Button onClick={() => setParams({ length: String(session.length) }, { replace: false })}>Retry this problem</Button>
        <ButtonLink to="/problems" variant="ghost">
          Choose another problem
        </ButtonLink>
      </div>
    </Page>
  );
}

function CompareRow({ title, yours, reference }: { title: string; yours: ReactNode; reference: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3 font-bold text-ink">{title}</h3>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-small font-semibold text-graphite">Your work</p>
          {yours}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-small font-semibold text-graphite">Reference walkthrough</p>
          {reference}
        </div>
      </div>
    </div>
  );
}

