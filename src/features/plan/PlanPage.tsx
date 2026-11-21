import { useMemo, useState } from 'react';
import { Button } from '@/design/Button';
import { Dialog } from '@/design/Dialog';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { buildPlan, currentWeekIndex, experienceLabel, levelAdjective, usePlan } from '@/state/plan';
import { toDay } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { PlanItemList, WeekMeta, hoursLabel, useWeekProgress } from './PlanItems';
import type { PlanWeek } from '@/state/plan';

export default function PlanPage() {
  const answers = usePlan((s) => s.answers);
  const startDay = usePlan((s) => s.startDay);
  const setAnswers = usePlan((s) => s.setAnswers);
  const [editing, setEditing] = useState(false);
  const plan = useMemo(() => (answers ? buildPlan(answers) : null), [answers]);

  if (!answers || !plan) {
    return (
      <Page>
        <PageHeader title="Your study plan" intro="Answer three quick questions, or skip them, and Blueprint lays out your weeks." />
        <Onboarding onDone={(a) => setAnswers(a)} />
      </Page>
    );
  }

  const current = currentWeekIndex(startDay ?? toDay(), toDay(), plan.weeks.length);

  return (
    <Page>
      <PageHeader
        title="Your study plan"
        intro={`${plan.weeks.length} weeks to prepare for ${levelAdjective[answers.level]} interviews, ${experienceLabel[answers.experience].toLowerCase()}. About ${hoursLabel(plan.totalMinutes / plan.weeks.length).replace('about ', '')} a week.`}
      >
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}>Change my answers</Button>
        </div>
      </PageHeader>
      <ol className="flex max-w-[880px] flex-col gap-6">
        {plan.weeks.map((week, i) => (
          <WeekSection key={i} index={i} week={week} current={i === current} />
        ))}
      </ol>
      <p className="measure text-ui text-graphite">
        Each problem opens its try-it-first workspace, and mock interviews start from the Problems page, where you pick the problem and the length.
      </p>
      <Dialog open={editing} onOpenChange={setEditing} title="Change your study plan" description="Your new plan starts this week. Lessons you have finished stay finished." className="w-[min(44rem,calc(100vw-32px))]">
        <Onboarding
          initial={answers}
          doneLabel="Use this plan"
          onCancel={() => setEditing(false)}
          onDone={(a) => {
            setAnswers(a, true);
            setEditing(false);
          }}
        />
      </Dialog>
    </Page>
  );
}

function WeekSection({ index, week, current }: { index: number; week: PlanWeek; current: boolean }) {
  const { done, total } = useWeekProgress(week.items);
  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={cn('rounded-card border bg-paper p-5', current ? 'border-blueprint' : 'border-rule')}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-h3 font-semibold text-ink">
          Week {index + 1}
          {current ? <span className="ml-2 text-ui font-semibold text-blueprint">This week</span> : null}
        </h2>
        <span className="flex flex-wrap items-center gap-4">
          {total ? (
            <span className="tabular text-ui text-graphite">
              {done} of {total} lessons done
            </span>
          ) : null}
          <WeekMeta minutes={week.minutes} />
        </span>
      </div>
      <PlanItemList items={week.items} />
    </li>
  );
}
