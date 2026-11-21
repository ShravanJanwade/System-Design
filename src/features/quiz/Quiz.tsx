import { useState } from 'react';
import type { Question } from '@/content/types';
import { Button } from '@/design/Button';
import { useProgress } from '@/state/progress';
import { QuestionView } from './QuestionView';
import { formatPercent } from '@/lib/format';

/**
 * "Check yourself": every question shows its explanations once checked.
 * The score counts first tries; finishing all questions records an attempt.
 */
export function Quiz({ lessonId, questions }: { lessonId: string; questions: Question[] }) {
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const best = useProgress((s) => s.lessons[lessonId]?.quiz?.best);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Record<number, boolean>>({});

  const answered = Object.keys(results).length;
  const correct = Object.values(results).filter(Boolean).length;
  const finished = answered === questions.length;

  const onChecked = (i: number, ok: boolean) => {
    if (i in results) return;
    const next = { ...results, [i]: ok };
    setResults(next);
    if (Object.keys(next).length === questions.length) {
      recordQuiz(lessonId, Object.values(next).filter(Boolean).length, questions.length);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {questions.map((q, i) => (
        <QuestionView key={`${attempt}-${i}`} question={q} number={i + 1} onChecked={(r) => onChecked(i, r.correct)} />
      ))}
      <div className="flex flex-col gap-3 border-t border-rule pt-6" aria-live="polite">
        {finished ? (
          <>
            <p className="text-ui-lg text-ink">
              You answered <strong className="tabular">{correct} of {questions.length}</strong> correctly on the first try
              {correct / questions.length >= 0.8 ? '. That counts toward mastering this lesson.' : '. Mastery needs 80%, so review the explanations and try again later.'}
            </p>
            <div>
              <Button
                onClick={() => {
                  setResults({});
                  setAttempt((a) => a + 1);
                }}
              >
                Try the questions again
              </Button>
            </div>
          </>
        ) : (
          <p className="text-ui text-graphite">
            {answered} of {questions.length} answered.
            {best !== undefined ? ` Your best score so far is ${formatPercent(best)}.` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
