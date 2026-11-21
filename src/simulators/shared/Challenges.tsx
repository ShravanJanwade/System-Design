import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useProgress } from '@/state/progress';
import { MdInline } from '@/features/learn/Markdown';
import { cn } from '@/lib/cn';

/** Stable empty list, so the store selector does not return a new array on every render. */
const NONE: string[] = [];

export type Challenge = {
  id: string;
  prompt: string;
  explanation: string;
  /** True once the learner's settings show they attempted it. */
  attempted: boolean;
};

/**
 * "Try this" challenges. Each reveals its explanation once the simulator state shows
 * an attempt, or when the learner asks after changing at least one control.
 */
export function Challenges({ simId, challenges, touched }: { simId: string; challenges: Challenge[]; touched: boolean }) {
  const done = useProgress((s) => s.challenges[simId] ?? NONE);
  const markChallenge = useProgress((s) => s.markChallenge);
  const [revealed, setRevealed] = useState<string[]>([]);

  useEffect(() => {
    for (const c of challenges) if (c.attempted && !done.includes(c.id)) markChallenge(simId, c.id);
  }, [challenges, done, markChallenge, simId]);

  return (
    <section aria-label="Try this" className="flex flex-col gap-3">
      <h3 className="text-h3 font-bold text-ink">Try this</h3>
      <ol className="flex flex-col gap-3">
        {challenges.map((c, i) => {
          const complete = c.attempted || done.includes(c.id);
          const open = complete || revealed.includes(c.id);
          return (
            <li key={c.id} className={cn('rounded-card border bg-paper px-4 py-3', complete ? 'border-success' : 'border-rule')}>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-small font-bold',
                    complete ? 'bg-success text-paper' : 'bg-wash text-graphite',
                  )}
                  aria-hidden
                >
                  {complete ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-ui-lg text-ink">
                    <MdInline md={c.prompt} />
                  </p>
                  {open ? (
                    <p className="mt-2 text-ui text-graphite">
                      <strong className="text-ink">{complete ? 'Attempted. ' : ''}</strong>
                      <MdInline md={c.explanation} />
                    </p>
                  ) : touched ? (
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => [...r, c.id])}
                      className="mt-1 text-ui font-semibold text-blueprint hover:underline"
                    >
                      Show the explanation
                    </button>
                  ) : (
                    <p className="mt-1 text-small text-graphite">Change a control to try it; the explanation appears when you get there.</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
