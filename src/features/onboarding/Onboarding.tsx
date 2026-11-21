import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/design/Button';
import { cn } from '@/lib/cn';
import {
  DEFAULT_ANSWERS,
  buildPlan,
  experienceLabel,
  levelAdjective,
  levelLabel,
  type Experience,
  type Level,
  type PlanAnswers,
  type Weeks,
} from '@/state/plan';

type Question<K extends keyof PlanAnswers> = {
  key: K;
  title: string;
  help: string;
  options: { value: PlanAnswers[K]; label: string; detail: string }[];
};

const questions: [Question<'experience'>, Question<'weeks'>, Question<'level'>] = [
  {
    key: 'experience',
    title: 'How much backend experience do you have?',
    help: 'This sets the pace. Nothing is hidden: you can open any lesson at any time.',
    options: [
      { value: 'new' as Experience, label: experienceLabel.new, detail: 'You build apps or interfaces, or you are still studying.' },
      { value: 'some' as Experience, label: experienceLabel.some, detail: 'You have written an API or worked with a database.' },
      { value: 'experienced' as Experience, label: experienceLabel.experienced, detail: 'You run backend services; the basics will be a quick review.' },
    ],
  },
  {
    key: 'weeks',
    title: 'When is your interview?',
    help: 'The plan fits the time you have. Shorter timelines mean longer weeks.',
    options: [
      { value: 2 as Weeks, label: 'In 2 weeks', detail: 'An intensive plan: the essentials and the six core problems.' },
      { value: 4 as Weeks, label: 'In 4 weeks', detail: 'A focused plan with time for practice.' },
      { value: 8 as Weeks, label: 'In 8 weeks', detail: 'A steady plan of a few hours a week.' },
      { value: 12 as Weeks, label: 'In 12 weeks or more', detail: 'Room for the whole curriculum at a relaxed pace.' },
    ],
  },
  {
    key: 'level',
    title: 'What level are you interviewing for?',
    help: 'Level names differ by company; pick the closest.',
    options: [
      { value: 'entry' as Level, label: levelLabel.entry, detail: 'New grad or early career. Modules 0 to 3, the interview playbook, Tier 1 and 2 problems.' },
      { value: 'mid' as Level, label: levelLabel.mid, detail: 'A few years in. Adds the core of scaling data, resilience and architecture.' },
      { value: 'senior' as Level, label: levelLabel.senior, detail: 'Senior and above. All nine modules and Tier 3 problems.' },
    ],
  },
];

/**
 * Three tappable questions, all skippable, then a summary of the plan they produce.
 * Used on first visit (Home) and whenever the learner changes their plan.
 */
export function Onboarding({
  initial,
  onDone,
  onCancel,
  doneLabel = 'Start my plan',
}: {
  initial?: Partial<PlanAnswers>;
  onDone: (answers: PlanAnswers) => void;
  onCancel?: () => void;
  doneLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<PlanAnswers>>(initial ?? {});
  const complete: PlanAnswers = { ...DEFAULT_ANSWERS, ...answers };

  if (step === questions.length) {
    const plan = buildPlan(complete);
    const hours = Math.round((plan.totalMinutes / 60 / plan.weeks.length) * 2) / 2;
    const lessons = plan.weeks.flatMap((w) => w.items).filter((i) => i.kind === 'lesson').length;
    const problems = plan.weeks.flatMap((w) => w.items).filter((i) => i.kind === 'problem').length;
    const mocks = plan.weeks.flatMap((w) => w.items).filter((i) => i.kind === 'mock').length;
    return (
      <section aria-labelledby="ob-summary" className="flex max-w-[40rem] flex-col gap-5 rounded-card border border-rule bg-paper p-6">
        <div className="flex flex-col gap-1">
          <p className="text-ui font-semibold text-graphite">Your study plan</p>
          <h2 id="ob-summary" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
            {complete.weeks} weeks, about {hours} hours a week
          </h2>
          <p className="text-ui-lg text-graphite">
            {experienceLabel[complete.experience]}, preparing for {levelAdjective[complete.level]} interviews. The plan covers {lessons} lessons,{' '}
            {problems} interview problems and {mocks} mock {mocks === 1 ? 'interview' : 'interviews'}, with a few minutes of flashcards most
            days.
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 text-ui text-ink">
          {[
            'Lessons come first, in order, so nothing assumes an idea you have not met.',
            'Problems start once the building blocks are covered, mixed in with the remaining lessons.',
            'Mock interviews are spread through the second half, the last one just before your interview.',
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <p className="text-ui text-graphite">You can change your answers anytime in Settings.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => onDone(complete)}>
            {doneLabel}
          </Button>
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Back
          </Button>
        </div>
      </section>
    );
  }

  const q = questions[step]!;
  const current = answers[q.key];
  const choose = (value: PlanAnswers[typeof q.key]) => {
    setAnswers((a) => ({ ...a, [q.key]: value }));
    setStep(step + 1);
  };

  return (
    <section aria-labelledby="ob-q" className="flex max-w-[40rem] flex-col gap-5 rounded-card border border-rule bg-paper p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="tabular text-ui font-semibold text-graphite">
          Question {step + 1} of {questions.length}
        </p>
        <div className="flex gap-1" aria-hidden>
          {questions.map((_, i) => (
            <span key={i} className={cn('h-1 w-8 rounded-full', i <= step ? 'bg-blueprint' : 'bg-rule')} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h2 id="ob-q" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
          {q.title}
        </h2>
        <p className="text-ui-lg text-graphite">{q.help}</p>
      </div>
      <div role="radiogroup" aria-labelledby="ob-q" className="flex flex-col gap-2">
        {q.options.map((o) => {
          const selected = current === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(o.value as never)}
              className={cn(
                'flex flex-col items-start rounded-card border px-4 py-3 text-left transition-colors ease-ui',
                selected ? 'border-blueprint bg-blueprint-wash' : 'border-rule hover:border-graphite hover:bg-wash',
              )}
            >
              <span className="text-ui-lg font-semibold text-ink">{o.label}</span>
              <span className="text-ui text-graphite">{o.detail}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {step > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Back
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setStep(step + 1)}>
          Skip this question
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStep(questions.length)}>
          Skip the rest
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} className="ml-auto">
            Cancel
          </Button>
        ) : null}
      </div>
    </section>
  );
}
