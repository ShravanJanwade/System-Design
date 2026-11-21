import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarRange, Layers } from 'lucide-react';
import type { DiagramSpec, Lesson } from '@/content/types';
import { allLessonOutlines, getOutline, lessonPath, modules, moduleLabel } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { isProblemWritten } from '@/content/problems';
import { getProblem, problemList } from '@/content/problem-list';
import { problemStatus } from '@/features/problems/logic';
import { useProblems } from '@/state/problems';
import { ButtonLink } from '@/design/Button';
import { Chip, ProgressRing } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { useLesson } from '@/features/learn/useLesson';
import { MdInline } from '@/features/learn/Markdown';
import { StatusIcon } from '@/features/learn/StatusIcon';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { PlanItemList, WeekMeta, useWeekProgress } from '@/features/plan/PlanItems';
import { dueCards } from '@/state/leitner';
import { buildPlan, currentWeekIndex, usePlan, type StudyPlan } from '@/state/plan';
import { studyStreak, useAllStatuses, useProgress, statusLabel } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { toDay } from '@/lib/dates';
import { plural } from '@/lib/format';
import { Page } from '@/features/shared/PageHeader';

function firstAnimatedDiagram(lesson: Lesson): DiagramSpec | undefined {
  for (const b of lesson.body) if (b.kind === 'diagram' && b.spec.steps?.length) return b.spec;
  return undefined;
}

export default function HomePage() {
  const answers = usePlan((s) => s.answers);
  const startDay = usePlan((s) => s.startDay);
  const setAnswers = usePlan((s) => s.setAnswers);
  const lastLessonId = useProgress((s) => s.lastLessonId);
  const statusOf = useAllStatuses();
  const plan = useMemo(() => (answers ? buildPlan(answers) : null), [answers]);
  const workspaces = useProblems((s) => s.workspaces);
  const assessments = useProblems((s) => s.assessments);
  const activeMocks = useProblems((s) => s.activeMocks);

  if (!answers || !plan) {
    return (
      <Page>
        <div className="measure flex flex-col gap-2">
          <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Welcome to Blueprint</h1>
          <p className="text-ui-lg text-graphite">
            Three quick questions set up a weekly study plan. Every question is optional, and you can change your answers later.
          </p>
        </div>
        <Onboarding onDone={(a) => setAnswers(a)} />
      </Page>
    );
  }

  const week = currentWeekIndex(startDay ?? toDay(), toDay(), plan.weeks.length);
  // Continue where you left off; otherwise the first unfinished written lesson in the plan.
  const planned = plan.weeks.flatMap((w) => w.items).filter((i) => i.kind === 'lesson').map((i) => (i as { id: string }).id);
  const firstOpen = planned.find((id) => isLessonWritten(id) && !['done', 'mastered'].includes(statusOf(id)));
  const currentId = lastLessonId && isLessonWritten(lastLessonId) ? lastLessonId : firstOpen ?? allLessonOutlines.find((l) => isLessonWritten(l.id))?.id;
  const nextUp = planned.find((id) => id !== currentId && isLessonWritten(id) && !['done', 'mastered'].includes(statusOf(id)));
  // One recommended problem: the first in the plan not yet self-scored, else a flagship, else any.
  const scored = (id: string) => problemStatus(workspaces[id], assessments[id], activeMocks[id]).kind === 'scored';
  const plannedProblems = plan.weeks.flatMap((w) => w.items).filter((i) => i.kind === 'problem').map((i) => (i as { id: string }).id);
  const problemPick = [...plannedProblems, ...problemList.filter((p) => p.flagship).map((p) => p.id), ...problemList.map((p) => p.id)].find(
    (id) => isProblemWritten(id) && !scored(id),
  );
  const pick = problemPick ? getProblem(problemPick) : undefined;

  return (
    <Page>
      <h1 className="sr-only">Home</h1>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {currentId ? <ContinueCard lessonId={currentId} started={Boolean(lastLessonId)} /> : null}
          <WeekCard plan={plan} week={week} />
        </div>
        <div className="flex flex-col gap-6">
          <ReviewsCard />
          {nextUp ? (
            <section aria-labelledby="next-h" className="rounded-card border border-rule bg-paper p-5">
              <h2 id="next-h" className="text-ui font-semibold text-graphite">
                Recommended next
              </h2>
              <Link to={lessonPath(nextUp)} className="mt-1 block font-display text-h3 font-semibold text-ink hover:underline">
                {getOutline(nextUp)?.number} {getOutline(nextUp)?.title}
              </Link>
              <p className="mt-1 text-ui text-graphite">{getOutline(nextUp)?.minutes} min read</p>
            </section>
          ) : null}
          {pick ? (
            <section aria-labelledby="problem-h" className="rounded-card border border-rule bg-paper p-5">
              <h2 id="problem-h" className="text-ui font-semibold text-graphite">
                Recommended problem
              </h2>
              <Link to={`/problems/${pick.id}`} className="mt-1 block font-display text-h3 font-semibold text-ink hover:underline">
                {pick.title}
              </Link>
              <p className="mt-1 text-ui text-graphite">
                Tier {pick.tier}, {pick.minutes} minutes. Try it on your own first, then compare with the walkthrough.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="modules-h" className="flex flex-col gap-4">
        <h2 id="modules-h" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
          Progress by module
        </h2>
        <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
            const total = m.lessons.length;
            const done = m.lessons.filter((l) => ['done', 'mastered'].includes(statusOf(l.id))).length;
            return (
              <li key={m.id}>
                <Link to={`/learn#${m.id}`} className="flex items-center gap-3 rounded-card px-2 py-2 hover:bg-wash">
                  <ProgressRing value={done / total} label={`${done} of ${total} lessons done`} />
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-semibold text-ink">
                      {m.number}. {m.title}
                    </span>
                    <span className="tabular block text-small text-graphite">
                      {done} of {total} lessons done
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}

function ReviewsCard() {
  const deck = useProgress((s) => s.deck);
  const activeDays = useProgress((s) => s.activeDays);
  const showStreak = useSettings((s) => s.showStreak);
  const due = dueCards(deck, toDay()).length;
  const streak = studyStreak(activeDays ?? []);
  return (
    <section aria-labelledby="reviews-h" className="rounded-card border border-rule bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 id="reviews-h" className="text-ui font-semibold text-graphite">
          Today’s reviews
        </h2>
        {showStreak && streak > 0 ? <Chip tone="blueprint">{plural(streak, 'day')} in a row</Chip> : null}
      </div>
      {due > 0 ? (
        <>
          <p className="mt-1 font-display text-h2 font-semibold text-ink">{plural(due, 'card')} due</p>
          <p className="mt-1 text-ui text-graphite">A few minutes of recall now keeps the ideas for weeks.</p>
          <ButtonLink to="/practice/flashcards" variant="primary" className="mt-4">
            <Layers className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Review cards
          </ButtonLink>
        </>
      ) : (
        <p className="mt-2 text-ui-lg text-ink">No cards due today. Finish a lesson to add some.</p>
      )}
    </section>
  );
}

function WeekCard({ plan, week }: { plan: StudyPlan; week: number }) {
  const items = plan.weeks[week]?.items ?? [];
  const { done, total } = useWeekProgress(items);
  return (
    <section aria-labelledby="week-h" className="rounded-card border border-rule bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="week-h" className="font-display text-h3 font-semibold text-ink">
          This week: week {week + 1} of {plan.weeks.length}
        </h2>
        <span className="flex flex-wrap items-center gap-4">
          {total ? (
            <span className="tabular text-ui text-graphite">
              {done} of {total} lessons done
            </span>
          ) : null}
          <WeekMeta minutes={plan.weeks[week]?.minutes ?? 0} />
        </span>
      </div>
      <div className="mt-2">
        <PlanItemList items={items} limit={8} />
      </div>
      <Link to="/plan" className="mt-3 inline-flex items-center gap-1.5 text-ui font-semibold text-blueprint hover:underline">
        <CalendarRange className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        See the whole plan
      </Link>
    </section>
  );
}

function ContinueCard({ lessonId, started }: { lessonId: string; started: boolean }) {
  const state = useLesson(lessonId);
  const outline = getOutline(lessonId);
  const statusOf = useAllStatuses();
  const status = statusOf(lessonId);
  const lesson = state.status === 'ready' ? state.lesson : undefined;
  const spec = useMemo(() => (lesson ? firstAnimatedDiagram(lesson) : undefined), [lesson]);
  if (!outline) return null;
  return (
    <section aria-labelledby="continue-h" className="flex flex-col gap-5 rounded-card border border-rule bg-paper p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-ui font-semibold text-graphite">{started ? 'Continue where you left off' : 'Start here'}</p>
        <h2 id="continue-h" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
          {outline.number} {outline.title}
        </h2>
        <p className="text-ui text-graphite">{moduleLabel(outline.module)}</p>
        {lesson ? (
          <p className="measure text-ui-lg text-ink">
            <MdInline md={lesson.idea} />
          </p>
        ) : null}
      </div>
      {spec ? <Diagram spec={spec} variant="mini" /> : <div className="blueprint-grid h-48 rounded-panel" aria-hidden />}
      <div className="flex flex-wrap items-center gap-4">
        <ButtonLink to={lessonPath(lessonId)} variant="primary">
          {status === 'not-started' ? 'Start lesson' : 'Continue lesson'}
        </ButtonLink>
        <span className="inline-flex items-center gap-1.5 text-ui text-graphite">
          <StatusIcon status={status} />
          {statusLabel[status]}
        </span>
        <span className="text-ui text-graphite">{outline.minutes} min read</span>
      </div>
    </section>
  );
}
