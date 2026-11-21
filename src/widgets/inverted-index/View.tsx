import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/design/Button';
import { StepControls } from '@/diagram/StepControls';
import { cn } from '@/lib/cn';
import { isTypingTarget } from '@/lib/hooks';
import type { WidgetProps } from '../registry';
import { CAPTIONS, DEFAULT_QUERY, buildSteps, entries, type BuildStep, type TokenTrace } from './logic';

const SUGGESTIONS = ['sunset beach', 'coffee sunset', 'Maya at the beach', 'sunsets'];

function list(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function photos(ids: readonly number[]): string {
  return ids.length === 1 ? `photo ${ids[0]}` : `photos ${list(ids.map(String))}`;
}

function repeated(trace: TokenTrace): string[] {
  return [...new Set(trace.tokens.filter((t, i) => trace.tokens.indexOf(t) !== i))];
}

function captionFor(step: BuildStep): string {
  switch (step.kind) {
    case 'start':
      return 'Four photos, four captions. To search them without reading every caption, build an index of their words, one caption at a time.';
    case 'tokenize': {
      const { trace, doc } = step;
      const dropped = [...new Set(trace.dropped)];
      const drop = dropped.length ? `, and drop the stop word${dropped.length > 1 ? 's' : ''} ${list(dropped.map((w) => `“${w}”`))}` : '';
      return `Photo ${doc.id}: lowercase the caption, split it on spaces and punctuation${drop}. That leaves ${list(trace.tokens)}.`;
    }
    case 'add': {
      const twice = repeated(step.trace);
      const parts = [`Add photo ${step.doc.id} to the index.`];
      if (step.newTerms.length) parts.push(`New entries: ${list(step.newTerms)}.`);
      if (step.extendedTerms.length) parts.push(`Photo ${step.doc.id} joins the existing lists for ${list(step.extendedTerms)}.`);
      if (twice.length) parts.push(`“${twice[0]}” appears twice in this caption, but its list names the photo once; real indexes also keep the count, which helps ranking.`);
      return parts.join(' ');
    }
    case 'lookup': {
      const { search } = step;
      if (search.lists.length === 0) return `Every word in “${search.query}” is a stop word, so there is nothing to look up.`;
      const lookups = search.lists.map((l) => (l.docs.length ? `${l.term} is on ${photos(l.docs)}` : `${l.term} is not in the index`));
      const dropped = search.trace.dropped.length ? ` (${list([...new Set(search.trace.dropped)].map((w) => `“${w}”`))} dropped as stop words)` : '';
      return `Search for “${search.query}”: tokenize it the same way${dropped}, then look up each word. ${lookups.join('; ')}.`;
    }
    case 'intersect': {
      const { search } = step;
      if (search.lists.length === 0) return 'No words to look up means no results.';
      if (search.lists.length === 1) {
        return search.result.length ? `With one word, the answer is its whole list: ${photos(search.result)}.` : 'That word is not in the index, so nothing matches.';
      }
      const found = search.result.length ? `${photos(search.result)} ${search.result.length === 1 ? 'is' : 'are'} on every list` : 'no photo is on every list';
      return `Keep only the photos on every list: ${found}. The index read ${search.lists.length} short lists; a LIKE scan would have read all ${CAPTIONS.length} captions.`;
    }
  }
}

export default function InvertedIndexWidget({ props }: WidgetProps) {
  const initialQuery = typeof props?.query === 'string' && props.query.trim() ? props.query : DEFAULT_QUERY;
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const steps = useMemo(() => buildSteps(CAPTIONS, query), [query]);
  const current = steps[Math.min(step, steps.length - 1)]!;
  const caption = captionFor(current);
  const lookupStep = steps.findIndex((s) => s.kind === 'lookup');

  const go = (i: number) => setStep(Math.max(0, Math.min(steps.length - 1, i)));

  // Play: give each caption time to be read, then move on; stop at the end.
  useEffect(() => {
    if (!playing) return;
    if (step >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const words = caption.split(/\s+/).length;
    const t = window.setTimeout(() => setStep((s) => Math.min(steps.length - 1, s + 1)), Math.min(6000, 1400 + words * 160));
    return () => window.clearTimeout(t);
  }, [playing, step, steps.length, caption]);

  const runSearch = (q: string) => {
    const clean = q.trim().slice(0, 40);
    if (!clean) return;
    setDraft(clean);
    setQuery(clean);
    setPlaying(false);
    setStep(lookupStep);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPlaying(false);
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPlaying(false);
      go(step - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(steps.length - 1);
    }
  };

  const indexRows = entries(current.index);
  const querying = current.kind === 'lookup' || current.kind === 'intersect';
  const search = querying ? current.search : null;
  const queryTerms = new Set(search?.lists.map((l) => l.term) ?? []);
  const matches = new Set(current.kind === 'intersect' ? current.search.result : []);
  const missing = search?.lists.filter((l) => l.docs.length === 0).map((l) => l.term) ?? [];

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      <div
        className="on-panel blueprint-grid rounded-panel p-3 sm:p-5"
        tabIndex={0}
        role="group"
        aria-roledescription="step-by-step widget"
        aria-label="Inverted index builder: use the left and right arrow keys to step"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <section aria-label="Captions" className="flex flex-col gap-2">
            <h4 className="text-ui font-semibold text-panel-text">Captions</h4>
            <ul className="flex flex-col gap-2">
              {CAPTIONS.map((doc) => {
                const active = (current.kind === 'tokenize' || current.kind === 'add') && current.doc.id === doc.id;
                const indexed = current.indexed.includes(doc.id);
                const matched = matches.has(doc.id);
                const trace = active && (current.kind === 'tokenize' || current.kind === 'add') ? current.trace : null;
                return (
                  <li
                    key={doc.id}
                    className={cn('rounded-card bg-card px-3 py-2.5 text-card-ink', (active || matched) && 'ring-2 ring-signal ring-offset-2 ring-offset-panel')}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-small font-semibold text-card-muted">Photo {doc.id}</span>
                      {matched ? (
                        <span className="rounded-full bg-signal px-2 text-small font-semibold text-on-signal">Match</span>
                      ) : indexed && !active ? (
                        <span className="inline-flex items-center gap-1 text-small text-card-muted">
                          <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                          Indexed
                        </span>
                      ) : null}
                    </div>
                    <p className="text-ui-lg">{doc.text}</p>
                    {trace ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Tokens of photo ${doc.id}`}>
                        {trace.pieces.map((piece, i) => {
                          const dropped = trace.dropped.includes(piece);
                          return (
                            <li
                              key={`${piece}-${i}`}
                              className={cn(
                                'rounded-full border px-2 text-small',
                                dropped ? 'border-card-muted/30 text-card-muted line-through' : 'border-card-muted/60 font-semibold text-card-ink',
                              )}
                            >
                              {piece}
                              {dropped ? <span className="sr-only"> (stop word, dropped)</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Inverted index" className="flex flex-col gap-2">
            <h4 className="text-ui font-semibold text-panel-text">Inverted index</h4>
            <div className="rounded-card bg-card px-3 py-2 text-card-ink">
              {indexRows.length === 0 ? (
                <p className="py-2 text-ui text-card-muted">Empty. Words appear here as captions are added.</p>
              ) : (
                <dl className="divide-y divide-card-muted/20">
                  {indexRows.map((row) => {
                    const isNew = current.kind === 'add' && current.newTerms.includes(row.term);
                    const extended = current.kind === 'add' && current.extendedTerms.includes(row.term);
                    const asked = queryTerms.has(row.term);
                    return (
                      <div key={row.term} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5', asked && 'rounded-control bg-signal/25 px-1.5')}>
                        <dt className="min-w-[6.5rem] text-ui font-semibold">
                          <span className={cn(isNew && 'rounded-full bg-signal px-1.5 text-on-signal')}>{row.term}</span>
                          {isNew ? <span className="sr-only"> (new)</span> : null}
                          {asked ? <span className="sr-only"> (in the search)</span> : null}
                        </dt>
                        <dd className="flex flex-wrap gap-1">
                          {row.docs.map((id) => {
                            const fresh = (isNew || extended) && current.kind === 'add' && current.doc.id === id;
                            const hit = asked && matches.has(id);
                            return (
                              <span
                                key={id}
                                className={cn(
                                  'tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-small font-semibold',
                                  fresh || hit ? 'border-transparent bg-signal text-on-signal' : 'border-card-muted/40 text-card-ink',
                                )}
                              >
                                <span className="sr-only">photo </span>
                                {id}
                              </span>
                            );
                          })}
                        </dd>
                      </div>
                    );
                  })}
                  {missing.map((term) => (
                    <div key={`missing-${term}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-signal/25 px-1.5 py-1.5">
                      <dt className="min-w-[6.5rem] text-ui font-semibold">{term}</dt>
                      <dd className="text-small text-card-muted">not in the index</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        </div>
      </div>

      <StepControls
        step={step}
        total={steps.length}
        playing={playing}
        onPrev={() => {
          setPlaying(false);
          go(step - 1);
        }}
        onNext={() => {
          setPlaying(false);
          go(step + 1);
        }}
        onTogglePlay={() => {
          if (playing) setPlaying(false);
          else {
            if (step >= steps.length - 1) setStep(0);
            setPlaying(true);
          }
        }}
        onRestart={() => {
          setPlaying(false);
          setStep(0);
        }}
        onJump={(i) => {
          setPlaying(false);
          go(i);
        }}
      />
      <p aria-live="polite" className="measure min-h-[3.75rem] text-ui-lg text-ink">
        {caption}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4">
        <label htmlFor="inverted-index-query" className="text-ui font-semibold text-ink">
          Search the four captions
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="inverted-index-query"
            type="text"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-control border border-control bg-paper px-3 text-ui text-ink"
            aria-describedby="inverted-index-hint"
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Run the search
          </Button>
        </div>
        <p id="inverted-index-hint" className="text-small text-graphite">
          Every word must match. The search jumps to the lookup step; step forward to see the intersection.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Example searches">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => runSearch(s)}
              aria-pressed={query === s}
              className={cn(
                'rounded-full border px-3 py-1 text-small font-semibold transition-colors ease-ui',
                query === s ? 'border-blueprint bg-blueprint-wash text-blueprint' : 'border-rule text-graphite hover:text-ink',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
