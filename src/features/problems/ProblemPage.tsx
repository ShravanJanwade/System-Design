import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Check, ChevronLeft, Clock, Timer } from 'lucide-react';
import type { Problem } from '@/content/types';
import { getProblem } from '@/content/problem-list';
import { Button, ButtonLink } from '@/design/Button';
import { Dialog } from '@/design/Dialog';
import { Chip, Tabs } from '@/design/primitives';
import { Page } from '@/features/shared/PageHeader';
import { MdInline } from '@/features/learn/Markdown';
import { ArchitectureBuilder } from '@/features/builder/Builder';
import { loadProfile, type CheckContext } from '@/features/builder/rules';
import { cn } from '@/lib/cn';
import { BLANK_WORKSPACE, useProblems, type ProblemView as View } from '@/state/problems';
import { problemStatus } from './logic';
import { ConceptLinks, FlagshipMark, HintList, NotesField, PracticeTimer, StatusChip, usePauseOnLeave } from './parts';
import { useProblem } from './source';
import { Walkthrough } from './Walkthrough';

export default function ProblemPage() {
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
          <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">{summary ? summary.title : 'Problem not found'}</h1>
          <p className="text-ui-lg text-graphite">
            {load.status === 'error'
              ? `The problem could not be loaded (${load.message}). Reload the page to try again.`
              : summary
                ? 'This problem is part of the bank but has not been written in this build yet. Pick a written problem from the list.'
                : 'There is no problem at this address. Pick one from the problem list.'}
          </p>
          <div>
            <ButtonLink to="/problems">Open the problem list</ButtonLink>
          </div>
        </div>
      </Page>
    );
  }
  return <ProblemView key={load.problem.id} problem={load.problem} />;
}

function ProblemView({ problem }: { problem: Problem }) {
  const id = problem.id;
  const ws = useProblems((s) => s.workspaces[id]) ?? BLANK_WORKSPACE;
  const assessments = useProblems((s) => s.assessments[id]);
  const activeMock = useProblems((s) => s.activeMocks[id]);
  const updateWorkspace = useProblems((s) => s.updateWorkspace);
  const revealHint = useProblems((s) => s.revealHint);
  const markAttemptDone = useProblems((s) => s.markAttemptDone);
  const openWalkthrough = useProblems((s) => s.openWalkthrough);
  const resetWorkspace = useProblems((s) => s.resetWorkspace);
  const [confirmReset, setConfirmReset] = useState(false);

  const context = useMemo<CheckContext>(() => ({ concepts: problem.concepts, load: loadProfile(problem.estimation.calculator) }), [problem]);
  const status = problemStatus(ws === BLANK_WORKSPACE ? undefined : ws, assessments, activeMock);

  useEffect(() => {
    document.title = `${problem.title} — Blueprint`;
  }, [problem.title]);

  // The practice timer pauses when you leave the page, and resumes when you choose.
  usePauseOnLeave(() => useProblems.getState().pauseTimer(id));

  const toTabs = () => document.getElementById('problem-modes')?.scrollIntoView({ block: 'start' });

  const finish = (
    <FinishPanel
      attemptDone={ws.attemptDone}
      onDone={() => {
        markAttemptDone(id);
        toTabs();
      }}
      onOpen={() => {
        openWalkthrough(id);
        toTabs();
      }}
      onStartOver={() => setConfirmReset(true)}
    />
  );

  const tryIt = (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section aria-labelledby={`${id}-prompt`} className="flex flex-col gap-2 xl:col-start-1 xl:row-start-1">
        <h2 id={`${id}-prompt`} className="text-ui font-semibold text-graphite">
          The interviewer says
        </h2>
        <p className="measure text-lead text-ink">
          <MdInline md={problem.prompt} />
        </p>
        <p className="measure text-ui-lg text-graphite">
          Clarify the scope, size it, then sketch your design. Take notes as you go: they stay here, as does your design.
        </p>
      </section>

      <div className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <PracticeTimer problemId={id} minutes={problem.minutes} />
        <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
          <NotesField
            id={`${id}-notes`}
            value={ws.notes}
            onChange={(notes) => updateWorkspace(id, { notes })}
            hint="Requirements, estimates and decisions. Saved as you type."
          />
        </div>
        <HintList problemId={id} hints={problem.hints} shown={ws.hintsShown} onReveal={() => revealHint(id)} />
        <div className="hidden xl:block">{finish}</div>
      </div>

      <section aria-labelledby={`${id}-design`} className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-2">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-design`} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
            Your design
          </h2>
          <p className="measure text-ui-lg text-graphite">Place the components, connect them, then check the design against simple rules for this problem.</p>
        </div>
        <ArchitectureBuilder design={ws.design} onChange={(design) => updateWorkspace(id, { design })} context={context} label="Your design" />
      </section>

      <div className="xl:hidden">{finish}</div>
    </div>
  );

  const gate = (
    <div className="measure flex flex-col gap-4 rounded-card border border-rule bg-paper p-5">
      <p className="text-ui-lg text-ink">
        The walkthrough is the full answer, from clarifying questions to the rubric. You will remember more of it after an attempt, even a rough one.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => updateWorkspace(id, { view: 'try' })}>
          Try it first
        </Button>
        <Button onClick={() => openWalkthrough(id)}>Show the walkthrough</Button>
      </div>
    </div>
  );

  return (
    <Page>
      <header className="flex flex-col gap-3">
        <Link to="/problems" className="inline-flex w-fit items-center gap-1 text-ui text-graphite hover:text-ink">
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          All problems
        </Link>
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chip>Tier {problem.tier}</Chip>
          {problem.flagship ? <FlagshipMark withText /> : null}
          <span className="inline-flex items-center gap-1 text-ui text-graphite">
            <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {problem.minutes} minutes
          </span>
          <StatusChip status={status} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-graphite">Lessons it uses</p>
          <ConceptLinks ids={problem.concepts} />
        </div>
        <div className="pt-1">
          <ButtonLink to={`/problems/${id}/mock?length=${problem.minutes}`} variant="secondary">
            <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {activeMock ? 'Resume the mock interview' : 'Start a mock interview'}
          </ButtonLink>
        </div>
      </header>

      <div id="problem-modes" className="scroll-mt-20">
        <Tabs
          label="Problem modes"
          value={ws.view}
          onValueChange={(v) => updateWorkspace(id, { view: v as View })}
          items={[
            { value: 'try', label: 'Try it first', content: tryIt },
            { value: 'walkthrough', label: 'Walkthrough', content: ws.walkthroughOpen ? <Walkthrough problem={problem} design={ws.design} /> : gate },
          ]}
        />
      </div>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Start over?"
        description="This clears your notes, design, hints and timer for this problem. Your saved scores stay."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => {
              resetWorkspace(id);
              setConfirmReset(false);
            }}
          >
            Start over
          </Button>
          <Button onClick={() => setConfirmReset(false)}>Keep my work</Button>
        </div>
      </Dialog>
    </Page>
  );
}

function FinishPanel({ attemptDone, onDone, onOpen, onStartOver }: { attemptDone: boolean; onDone: () => void; onOpen: () => void; onStartOver: () => void }) {
  return (
    <section aria-label="Finish the attempt" className={cn('flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5')}>
      {attemptDone ? (
        <p className="flex items-center gap-2 text-ui-lg font-semibold text-success">
          <Check className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
          Attempt done
        </p>
      ) : (
        <p className="text-ui-lg font-semibold text-ink">Finished, or out of ideas?</p>
      )}
      <p className="text-ui text-graphite">
        {attemptDone
          ? 'Compare your answer with the walkthrough, then score it against the rubric.'
          : 'Mark the attempt done to open the walkthrough and score your answer against the rubric. You can also look at the walkthrough now.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {attemptDone ? (
          <Button variant="primary" onClick={onOpen}>
            Open the walkthrough
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={onDone}>
              <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Mark attempt done
            </Button>
            <Button onClick={onOpen}>Show the walkthrough</Button>
          </>
        )}
        <Button variant="ghost" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </section>
  );
}
