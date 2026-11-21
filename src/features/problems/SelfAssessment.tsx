import { useId, useState } from 'react';
import type { Problem } from '@/content/types';
import { Button } from '@/design/Button';
import { MdInline } from '@/features/learn/Markdown';
import { useProblems, type Assessment } from '@/state/problems';
import { formatDay, keepKnown, missedWithoutLesson, reviewNext, rubricScore } from './logic';
import { LessonLink, ReviewNextList } from './parts';

/** The problem's rubric as a checklist with weights. Unchecked items point to the lesson that teaches them. */
export function RubricChecklist({
  rubric,
  checked,
  onChange,
}: {
  rubric: Problem['rubric'];
  checked: string[];
  onChange: (checked: string[]) => void;
}) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const on = new Set(checked);
  const toggle = (item: string) => onChange(keepKnown(rubric, on.has(item) ? checked.filter((c) => c !== item) : [...checked, item]));
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Rubric items your answer covered</legend>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {rubric.map((r, i) => {
          const id = `${prefix}-${i}`;
          const met = on.has(r.item);
          return (
            <li key={r.item} className="flex gap-3 py-3">
              <input id={id} type="checkbox" checked={met} onChange={() => toggle(r.item)} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--blueprint)]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={id} className="cursor-pointer text-ui-lg text-ink">
                  <MdInline md={r.item} />
                </label>
                {!met && r.lessonId ? (
                  <p className="text-small text-graphite">
                    Taught in <LessonLink id={r.lessonId} />
                  </p>
                ) : null}
              </div>
              <span className="tabular shrink-0 pt-0.5 text-ui text-graphite">
                {r.weight} {r.weight === 1 ? 'point' : 'points'}
              </span>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function ScoreReadout({ score, label = 'Score' }: { score: number; label?: string }) {
  return (
    <p className="flex flex-col">
      <span className="text-small text-graphite">{label}</span>
      <span>
        <span className="tabular font-display text-[40px] leading-[44px] font-semibold text-ink">{score}</span>
        <span className="ml-1.5 text-ui-lg text-graphite">out of 100</span>
      </span>
    </p>
  );
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

const NO_ASSESSMENTS: Assessment[] = [];

/** Walkthrough section 11: score this attempt against the rubric, then see which lessons to review. */
export function SelfAssessment({ problem }: { problem: Problem }) {
  const list = useProblems((s) => s.assessments[problem.id]) ?? NO_ASSESSMENTS;
  const saveAssessment = useProblems((s) => s.saveAssessment);
  const lastPractice = [...list].reverse().find((a) => a.source === 'practice');
  const [checked, setChecked] = useState<string[]>(() => keepKnown(problem.rubric, lastPractice?.checked ?? []));
  const score = rubricScore(problem.rubric, checked);
  const saved = Boolean(lastPractice && sameItems(keepKnown(problem.rubric, lastPractice.checked), checked));

  return (
    <div className="flex flex-col gap-6">
      <p className="measure text-ui-lg text-graphite">
        Tick each item your answer covered, as strictly as an interviewer would. The weights add up to 100. Items you missed link to the lessons that teach them.
      </p>
      <div className="max-w-[960px]">
        <RubricChecklist rubric={problem.rubric} checked={checked} onChange={setChecked} />
      </div>
      <div className="flex max-w-[960px] flex-wrap items-end justify-between gap-4">
        <ScoreReadout score={score} label="Your score" />
        <Button variant="primary" onClick={() => saveAssessment(problem.id, { score, checked })} disabled={saved}>
          {saved ? 'Score saved' : 'Save score'}
        </Button>
      </div>

      {saved ? (
        <section aria-labelledby={`${problem.id}-review-next`} className="measure flex flex-col gap-3">
          <h3 id={`${problem.id}-review-next`} className="text-h3 font-bold text-ink">
            Review next
          </h3>
          <ReviewNextList links={reviewNext(problem.rubric, checked)} missedOther={missedWithoutLesson(problem.rubric, checked)} />
        </section>
      ) : null}

      {list.length ? <ScoreHistory list={list} /> : null}
    </div>
  );
}

export function ScoreHistory({ list }: { list: readonly Assessment[] }) {
  const recent = [...list].reverse().slice(0, 6);
  const best = Math.max(...list.map((a) => a.score));
  return (
    <section aria-label="Your scores on this problem" className="measure flex flex-col gap-2">
      <p className="text-ui font-semibold text-ink">
        Your scores on this problem <span className="font-normal text-graphite">(best {best}%)</span>
      </p>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {recent.map((a, i) => (
          <li key={`${a.at}-${i}`} className="flex items-baseline justify-between gap-4 py-2 text-ui">
            <span className="text-ink">
              {formatDay(a.at)} <span className="text-graphite">{a.source === 'mock' ? 'Mock interview' : 'Practice'}</span>
            </span>
            <span className="tabular font-semibold text-ink">{a.score}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
