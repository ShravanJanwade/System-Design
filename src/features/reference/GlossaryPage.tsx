import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { Search } from 'lucide-react';
import { glossary } from '@/content/glossary';
import { getOutline, lessonPath, moduleLabel, modules } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import type { GlossaryTerm, ModuleId } from '@/content/types';
import { useReducedMotion } from '@/state/settings';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/features/shared/PageHeader';

type Entry = { term: GlossaryTerm; letter: string; modules: ReadonlySet<ModuleId>; haystack: string };

function letterOf(term: string): string {
  const c = term.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Every term in alphabetical order, with what filtering needs worked out once. */
const ENTRIES: Entry[] = [...glossary]
  .sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }))
  .map((t) => ({
    term: t,
    letter: letterOf(t.term),
    modules: new Set(t.lessons.flatMap((id) => getOutline(id)?.module ?? [])),
    haystack: [t.term, ...(t.aka ?? []), t.definition].join('\n').toLowerCase(),
  }));
const BY_ID = new Map(ENTRIES.map((e) => [e.term.id, e]));
const USED_MODULES = modules.filter((m) => ENTRIES.some((e) => e.modules.has(m.id)));
const INDEX_ID = 'glossary-index';
const MARK_MS = 2400;

const toWords = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const matches = (e: Entry, words: string[], mod: ModuleId | 'all') =>
  (mod === 'all' || e.modules.has(mod)) && words.every((w) => e.haystack.includes(w));
const letterId = (letter: string) => `glossary-letter-${letter === '#' ? 'numbers' : letter.toLowerCase()}`;
const letterName = (letter: string) => (letter === '#' ? 'Numbers and symbols' : letter);

export default function GlossaryPage() {
  const [query, setQuery] = useState('');
  const [mod, setMod] = useState<ModuleId | 'all'>('all');
  const deferredQuery = useDeferredValue(query);
  const reduced = useReducedMotion();
  const { hash, key } = useLocation();
  const initialKey = useRef(key);
  const target = useMemo(() => {
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return hash.slice(1);
    }
  }, [hash]);

  const shown = useMemo(() => {
    const words = toWords(deferredQuery);
    return ENTRIES.filter((e) => matches(e, words, mod));
  }, [deferredQuery, mod]);
  const groups = useMemo(() => {
    const byLetter = new Map<string, Entry[]>();
    for (const e of shown) {
      const list = byLetter.get(e.letter);
      if (list) list.push(e);
      else byLetter.set(e.letter, [e]);
    }
    return [...byLetter.entries()];
  }, [shown]);

  // Arriving at #term-id (from the palette or a lesson): clear any filter hiding the term, then mark it for a moment.
  const [marked, setMarked] = useState<string | null>(null);
  const [arrival, setArrival] = useState<{ id: string; key: string } | null>(null);
  useEffect(() => {
    if (!target) return;
    const entry = BY_ID.get(target);
    if (entry) {
      setQuery((q) => (matches(entry, toWords(q), 'all') ? q : ''));
      setMod((m) => (m === 'all' || entry.modules.has(m) ? m : 'all'));
      setMarked(target);
    }
    setArrival({ id: target, key });
  }, [target, key]);

  // Scroll once the target is in the list (a cleared filter can take one more render to show it).
  // This runs after the router's scroll restoration, which is a layout effect, so it has the last word.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!arrival || handled.current === arrival.key) return;
    const el = document.getElementById(arrival.id);
    if (!el) return;
    handled.current = arrival.key;
    const inPage = arrival.key !== initialKey.current;
    el.scrollIntoView({ block: 'start', behavior: inPage ? scrollBehavior(el, reduced) : 'auto' });
    el.focus({ preventScroll: true });
  }, [arrival, shown, reduced]);

  useEffect(() => {
    if (!marked) return;
    const timer = window.setTimeout(() => setMarked(null), MARK_MS);
    return () => window.clearTimeout(timer);
  }, [marked, key]);

  /** In-page jumps that also move keyboard focus, so Tab continues from the letter. */
  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ block: 'start', behavior: scrollBehavior(el, reduced) });
    el.focus({ preventScroll: true });
  };

  const total = glossary.length;
  const showIndex = groups.length > 1;
  const reset = () => {
    setQuery('');
    setMod('all');
  };

  return (
    <Page>
      <PageHeader title="Glossary" intro={`${total} terms in plain English, each with an example and the lessons that use it.`} />
      <div className="measure flex flex-col gap-3">
        <label htmlFor="glossary-search" className="sr-only">
          Search the glossary
        </label>
        <div className="focus-ring-within flex h-10 items-center gap-2 rounded-control border border-control bg-paper px-3">
          <Search className="h-4 w-4 shrink-0 text-graphite" strokeWidth={1.5} aria-hidden />
          <input
            id="glossary-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms and definitions"
            className="h-full min-w-0 flex-1 bg-transparent text-ui-lg text-ink outline-none placeholder:text-graphite"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by module">
          {[
            { id: 'all' as const, label: 'All modules', name: undefined },
            ...USED_MODULES.map((m) => ({ id: m.id, label: `Module ${m.number}`, name: moduleLabel(m.id) })),
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={mod === o.id}
              aria-label={o.name}
              title={o.name}
              onClick={() => setMod(o.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-small font-semibold transition-colors ease-ui',
                mod === o.id ? 'border-blueprint bg-blueprint-wash text-blueprint' : 'border-rule bg-paper text-graphite hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-ui text-graphite" aria-live="polite">
          {shown.length === total ? `Showing all ${total} terms.` : `Showing ${shown.length} of ${total} terms.`}
        </p>
        {showIndex ? (
          <nav id={INDEX_ID} tabIndex={-1} aria-label="Jump to a letter" className="outline-none">
            <ul className="flex flex-wrap gap-1">
              {groups.map(([letter, list]) => (
                <li key={letter}>
                  <a
                    href={`#${letterId(letter)}`}
                    onClick={jump(letterId(letter))}
                    aria-label={`${letterName(letter)}, ${list.length} ${list.length === 1 ? 'term' : 'terms'}`}
                    className="flex h-9 min-w-9 items-center justify-center rounded-control border border-rule bg-paper px-2 text-ui font-semibold text-blueprint transition-colors ease-ui hover:border-blueprint hover:bg-blueprint-wash"
                  >
                    {letter}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="measure flex flex-col items-start gap-3">
          <p className="text-ui-lg text-ink">
            {deferredQuery.trim() ? `No terms match “${deferredQuery.trim()}”.` : 'No terms match.'} Try a shorter word, or clear the module filter.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-control border border-rule bg-paper px-3 py-1.5 text-ui font-semibold text-ink transition-colors ease-ui hover:border-blueprint"
          >
            Show all terms
          </button>
        </div>
      ) : (
        <div className="measure flex flex-col gap-10">
          {groups.map(([letter, list]) => (
            <section key={letter} aria-labelledby={letterId(letter)}>
              <div className="mb-3 flex items-end justify-between gap-4 border-b border-rule pb-1">
                <h2 id={letterId(letter)} tabIndex={-1} className="font-display text-h2-sm font-semibold text-ink outline-none">
                  {letter === '#' ? (
                    <>
                      <span aria-hidden>#</span>
                      <span className="sr-only">{letterName(letter)}</span>
                    </>
                  ) : (
                    letter
                  )}
                </h2>
                {showIndex ? (
                  <a href={`#${INDEX_ID}`} onClick={jump(INDEX_ID)} className="mb-1 text-small text-graphite underline underline-offset-2 hover:text-ink">
                    Back to index
                  </a>
                ) : null}
              </div>
              <dl className="flex flex-col gap-6">
                {list.map((e) => (
                  <TermEntry key={e.term.id} term={e.term} marked={marked === e.term.id} />
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

/** One term. Its id is the stable anchor the palette and lesson popovers link to (#term-id). */
const TermEntry = memo(function TermEntry({ term: t, marked }: { term: GlossaryTerm; marked: boolean }) {
  return (
    <div
      id={t.id}
      tabIndex={-1}
      className={cn(
        '-mx-3 rounded-card px-3 py-2 outline-none transition-[background-color,box-shadow] ease-ui',
        marked && 'bg-blueprint-wash shadow-[inset_3px_0_0_var(--blueprint)]',
      )}
    >
      <dt className="text-h3 font-bold break-words text-ink">
        {t.term}
        {t.aka?.length ? <span className="ml-2 text-ui font-normal text-graphite">also {t.aka.join(', ')}</span> : null}
      </dt>
      <dd className="mt-1 text-body break-words text-ink">{t.definition}</dd>
      <dd className="mt-1 text-ui break-words text-graphite">
        <span className="font-semibold">Example:</span> {t.example}
      </dd>
      {t.lessons.length ? (
        <dd className="mt-1 text-ui text-graphite">
          <span className="font-semibold">Used in:</span>{' '}
          {t.lessons.map((id, i) => {
            const o = getOutline(id);
            if (!o) return null;
            return (
              <span key={id}>
                {i > 0 ? ', ' : ''}
                {isLessonWritten(id) ? (
                  <Link to={lessonPath(id)} className="md-link">
                    {o.number} {o.title}
                  </Link>
                ) : (
                  `${o.number} ${o.title}`
                )}
              </span>
            );
          })}
        </dd>
      ) : null}
    </div>
  );
});

/** Smooth for short hops when motion is allowed; long jumps land at once instead of scrolling for seconds. */
function scrollBehavior(el: Element, reduced: boolean): ScrollBehavior {
  return reduced || Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 2 ? 'auto' : 'smooth';
}
