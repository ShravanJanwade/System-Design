import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Flashcard } from '@/content/types';
import { loadLesson } from '@/content/lessons';
import { getOutline, lessonPath } from '@/content/modules';
import { Button } from '@/design/Button';
import { Kbd } from '@/design/primitives';
import { MdInline } from '@/features/learn/Markdown';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { dueCards, intervalDays, type CardState } from '@/state/leitner';
import { useProgress } from '@/state/progress';
import { toDay } from '@/lib/dates';
import { isTypingTarget } from '@/lib/hooks';
import { plural } from '@/lib/format';

type Loaded = { state: CardState; card: Flashcard };

/** Today's review queue: recall the answer, reveal it, then say honestly whether you remembered. */
export function FlashcardReview() {
  const deck = useProgress((s) => s.deck);
  const reviewCard = useProgress((s) => s.reviewCard);
  // The queue is fixed when the session starts, so reviewed cards do not reshuffle it.
  const [queue] = useState(() => dueCards(deck, toDay()));
  const [cards, setCards] = useState<Loaded[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  useEffect(() => {
    let alive = true;
    const lessonIds = [...new Set(queue.map((c) => c.lessonId))];
    Promise.all(lessonIds.map((id) => loadLesson(id).catch(() => null))).then((lessons) => {
      if (!alive) return;
      const byId = new Map(lessons.filter(Boolean).map((l) => [l!.id, l!]));
      const loaded: Loaded[] = [];
      for (const state of queue) {
        const idx = Number(state.id.split('#')[1]);
        const card = byId.get(state.lessonId)?.flashcards[idx];
        if (card) loaded.push({ state, card });
      }
      setCards(loaded);
    });
    return () => {
      alive = false;
    };
  }, [queue]);

  const current = cards?.[index];
  const answer = (recalled: boolean) => {
    if (!current) return;
    reviewCard(current.state.id, recalled);
    setResults((r) => [...r, recalled]);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && e.key === '1') answer(false);
      else if (revealed && e.key === '2') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remembered = results.filter(Boolean).length;
  const lesson = current ? getOutline(current.state.lessonId) : undefined;
  const nextInterval = useMemo(() => (current ? intervalDays(Math.min(5, current.state.box + 1)) : 0), [current]);

  return (
    <Page>
      <PageHeader title="Flashcards" intro="Say the answer out loud or in your head first, then reveal it." />
      {cards === null ? (
        <p className="text-ui text-graphite" role="status">
          Loading your cards
        </p>
      ) : cards.length === 0 ? (
        <div className="measure flex flex-col gap-3">
          <p className="text-ui-lg text-ink">No cards due today. Finish a lesson to add some.</p>
          <Link to="/learn" className="md-link text-ui-lg">
            Open the curriculum
          </Link>
        </div>
      ) : current ? (
        <div className="measure flex flex-col gap-4">
          <p className="tabular text-ui text-graphite">
            Card {index + 1} of {cards.length}
            {lesson ? (
              <>
                {', from '}
                <Link to={lessonPath(lesson.id)} className="md-link">
                  {lesson.number} {lesson.title}
                </Link>
              </>
            ) : null}
          </p>
          <div className="flex min-h-56 flex-col gap-4 rounded-card border border-rule bg-paper p-6">
            <p className="text-h3 font-bold text-ink">
              <MdInline md={current.card.front} />
            </p>
            {revealed ? (
              <div className="border-t border-rule pt-4 text-body text-ink" aria-live="polite">
                <MdInline md={current.card.back} />
              </div>
            ) : null}
          </div>
          {revealed ? (
            <div className="flex flex-col gap-2">
              <p className="text-ui text-graphite">Did you remember it?</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => answer(false)}>Not yet, show it tomorrow</Button>
                <Button variant="primary" onClick={() => answer(true)}>
                  I remembered, see it in {plural(nextInterval, 'day')}
                </Button>
              </div>
              <p className="text-small text-graphite">
                Keys: <Kbd>1</Kbd> not yet, <Kbd>2</Kbd> remembered
              </p>
            </div>
          ) : (
            <div>
              <Button variant="primary" onClick={() => setRevealed(true)}>
                Show answer
              </Button>
              <span className="ml-3 text-small text-graphite">
                or press <Kbd>Space</Kbd>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="measure flex flex-col gap-3" role="status">
          <p className="text-ui-lg text-ink">
            Review finished: you remembered {remembered} of {cards.length}. Cards you missed come back tomorrow; the rest come back later and later as
            you keep remembering them.
          </p>
          <div className="flex gap-2">
            <Link to="/" className="md-link text-ui-lg">
              Back to Home
            </Link>
          </div>
        </div>
      )}
    </Page>
  );
}
