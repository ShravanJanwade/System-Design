import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useParams } from 'react-router';
import { motion } from 'motion/react';
import { Check, Clock, Flag, ListTree, Maximize2, Minimize2, TableOfContents, X } from 'lucide-react';
import type { Lesson } from '@/content/types';
import { allLessonOutlines, getOutline, lessonPath, moduleLabel } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { glossaryById } from '@/content/glossary';
import { Button, ButtonLink, IconButton } from '@/design/Button';
import { Callout, Chip, CollapsibleCallout, SectionHeading } from '@/design/primitives';
import { Drawer } from '@/design/Dialog';
import { HighlightProvider } from '@/diagram/highlight';
import { Quiz } from '@/features/quiz/Quiz';
import { Term } from '@/features/reference/Term';
import { useProgress, useLessonStatus, statusLabel } from '@/state/progress';
import { useSettings, useReducedMotion } from '@/state/settings';
import { useInView, useMediaQuery, isTypingTarget } from '@/lib/hooks';
import { plural } from '@/lib/format';
import { cn } from '@/lib/cn';
import { BlockView, MdWithLead, READ, TradeoffView, WIDE } from './blocks';
import { Md, MdInline } from './Markdown';
import { CurriculumNav } from './CurriculumNav';
import { StatusIcon } from './StatusIcon';
import { useLesson } from './useLesson';

type SectionDef = { id: string; title: string };

function sectionsFor(lesson: Lesson): SectionDef[] {
  const s: SectionDef[] = [
    { id: 'why-it-matters', title: 'Why it matters' },
    { id: 'how-it-works', title: 'How it works' },
  ];
  if (lesson.tryIt?.length) s.push({ id: 'try-it', title: 'Try it' });
  if (lesson.tradeoffs) s.push({ id: 'trade-offs', title: 'Trade-offs' });
  if (lesson.realWorld) s.push({ id: 'in-the-real-world', title: 'In the real world' });
  s.push(
    { id: 'in-the-interview', title: 'In the interview' },
    { id: 'common-mistakes', title: 'Common mistakes' },
    { id: 'check-yourself', title: 'Check yourself' },
    { id: 'key-takeaways', title: 'Key takeaways' },
  );
  if (lesson.deeper?.length || lesson.related.length) s.push({ id: 'go-deeper', title: 'Go deeper' });
  return s;
}

export default function LessonPage() {
  const { lessonId } = useParams();
  const state = useLesson(lessonId);
  const outline = lessonId ? getOutline(lessonId) : undefined;

  if (state.status === 'loading') {
    return (
      <div className="px-4 py-16 sm:px-10" role="status">
        <p className="text-ui text-graphite">Loading the lesson</p>
      </div>
    );
  }
  if (state.status !== 'ready') {
    return (
      <div className="measure px-4 py-16 sm:px-10">
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">{outline ? outline.title : 'Lesson not found'}</h1>
        <p className="mt-3 text-ui-lg text-graphite">
          {outline
            ? `Lesson ${outline.number} is part of the curriculum but has not been written in this build yet.`
            : 'There is no lesson at this address.'}{' '}
          Pick another lesson from the curriculum.
        </p>
        <ButtonLink to="/learn" className="mt-6">
          Open the curriculum
        </ButtonLink>
      </div>
    );
  }
  return <LessonView key={state.lesson.id} lesson={state.lesson} />;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const openLesson = useProgress((s) => s.openLesson);
  const focusMode = useSettings((s) => s.focusMode);
  const toggleFocus = useSettings((s) => s.toggleFocusMode);
  const wide = useMediaQuery('(min-width: 80rem)');
  const [contentsOpen, setContentsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const sections = useMemo(() => sectionsFor(lesson), [lesson]);
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(sectionIds);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    openLesson(lesson.id);
    document.title = `${lesson.title} — Blueprint`;
  }, [lesson.id, lesson.title, openLesson]);

  // "f" toggles focus mode, outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) toggleFocus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFocus]);

  const howBlocks = lesson.body;
  const tryBlocks = lesson.tryIt ?? [];

  return (
    <>
      <ReadingProgress target={articleRef} />
      <div className={cn('flex min-w-0', focusMode && 'justify-center')}>
        <article ref={articleRef} className={cn('min-w-0 flex-1 px-4 pt-4 pb-24 sm:px-8 lg:px-12', focusMode && 'max-w-[960px]')}>
          <LessonToolbar
            focusMode={focusMode}
            onToggleFocus={toggleFocus}
            onOpenContents={() => setContentsOpen(true)}
            onOpenToc={() => setTocOpen(true)}
            showToc={!wide || focusMode}
          />
          <div className="flex flex-col gap-14 pt-6 sm:pt-10">
            <LessonHeader lesson={lesson} />

            <HighlightProvider>
              <Callout kind="intuition" className={READ}>
                <MdWithLead kind="intuition" lead={`Intuition: ${lesson.analogy.title.replace(/\.$/, '')}.`} md={lesson.analogy.body} />
              </Callout>
            </HighlightProvider>

            <Section id="why-it-matters" title="Why it matters">
              <Md md={lesson.whyItMatters} className={READ} />
            </Section>

            <Section id="how-it-works" title="How it works">
              {howBlocks.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </Section>

            {tryBlocks.length ? (
              <Section id="try-it" title="Try it">
                {tryBlocks.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </Section>
            ) : null}

            {lesson.tradeoffs ? (
              <Section id="trade-offs" title="Trade-offs">
                <TradeoffView table={lesson.tradeoffs} />
              </Section>
            ) : null}

            {lesson.realWorld ? (
              <Section id="in-the-real-world" title="In the real world">
                <h3 className={cn(READ, 'text-h3 font-bold text-ink')}>{lesson.realWorld.title}</h3>
                <Md md={lesson.realWorld.body} className={READ} />
                {lesson.realWorld.sourceUrl ? (
                  <p className={cn(READ, 'text-ui text-graphite')}>
                    Source:{' '}
                    <a href={lesson.realWorld.sourceUrl} target="_blank" rel="noreferrer" className="md-link">
                      {lesson.realWorld.sourceLabel ?? lesson.realWorld.sourceUrl}
                    </a>
                  </p>
                ) : null}
              </Section>
            ) : null}

            <Section id="in-the-interview" title="In the interview">
              <InterviewSection lesson={lesson} />
            </Section>

            <Section id="common-mistakes" title="Common mistakes">
              <ul className={cn(READ, 'flex flex-col gap-3')}>
                {lesson.mistakes.map((m, i) => (
                  <li key={i} className="flex gap-3 text-body text-ink">
                    <X className="mt-1.5 h-[18px] w-[18px] shrink-0 text-alert" strokeWidth={1.5} aria-hidden />
                    <span>
                      <MdInline md={m} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="check-yourself" title="Check yourself">
              <div className={READ}>
                <Quiz lessonId={lesson.id} questions={lesson.quiz} />
              </div>
            </Section>

            <Section id="key-takeaways" title="Key takeaways">
              <ul className={cn(READ, 'flex flex-col gap-3')}>
                {lesson.takeaways.map((t, i) => (
                  <li key={i} className="flex gap-3 text-body text-ink">
                    <span className="mt-[11px] h-2 w-2 shrink-0 rounded-[2px] bg-blueprint" aria-hidden />
                    <span>
                      <MdInline md={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {lesson.deeper?.length || lesson.related.length ? (
              <section id="go-deeper" aria-label="Go deeper" className="flex scroll-mt-24 flex-col gap-6">
                <HighlightProvider>
                  <div className={READ}>
                    <CollapsibleCallout title="Go deeper" summary="Optional detail. Skip it without losing the thread.">
                      <div className="flex flex-col gap-6">
                        {lesson.deeper?.map((b, i) => (
                          <BlockView key={i} block={b} />
                        ))}
                        {lesson.related.length ? <RelatedLessons ids={lesson.related} /> : null}
                      </div>
                    </CollapsibleCallout>
                  </div>
                </HighlightProvider>
              </section>
            ) : null}

            <LessonFooter lesson={lesson} />
          </div>
        </article>

        {!focusMode && wide ? (
          <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 overflow-y-auto border-l border-rule py-10 pr-6 pl-6 xl:block" aria-label="On this page">
            <OnThisPage sections={sections} active={active} />
            <KeyTerms ids={lesson.glossaryTerms} />
          </aside>
        ) : null}
      </div>

      <Drawer open={contentsOpen} onOpenChange={setContentsOpen} title="Curriculum" side="left">
        <CurriculumNav currentLessonId={lesson.id} onNavigate={() => setContentsOpen(false)} />
      </Drawer>
      <Drawer open={tocOpen} onOpenChange={setTocOpen} title="On this page" side="right">
        <OnThisPage sections={sections} active={active} onNavigate={() => setTocOpen(false)} />
        <KeyTerms ids={lesson.glossaryTerms} />
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-6">
      <HighlightProvider>
        <SectionHeading id={`${id}-h`} className={READ}>
          {title}
        </SectionHeading>
        {children}
      </HighlightProvider>
    </section>
  );
}

function LessonToolbar({
  focusMode,
  onToggleFocus,
  onOpenContents,
  onOpenToc,
  showToc,
}: {
  focusMode: boolean;
  onToggleFocus: () => void;
  onOpenContents: () => void;
  onOpenToc: () => void;
  showToc: boolean;
}) {
  return (
    <div className="no-print flex items-center justify-between gap-2">
      <Button size="sm" variant="ghost" onClick={onOpenContents} className={cn(!focusMode && 'lg:hidden')}>
        <ListTree className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Curriculum
      </Button>
      <span className={cn('hidden', !focusMode && 'lg:block')} />
      <div className="flex items-center gap-1">
        {showToc ? (
          <Button size="sm" variant="ghost" onClick={onOpenToc}>
            <TableOfContents className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            On this page
          </Button>
        ) : null}
        <IconButton label={focusMode ? 'Exit focus mode (F)' : 'Focus mode (F)'} onClick={onToggleFocus} tipSide="bottom">
          {focusMode ? <Minimize2 className="h-4 w-4" strokeWidth={1.5} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.5} />}
        </IconButton>
      </div>
    </div>
  );
}

function LessonHeader({ lesson }: { lesson: Lesson }) {
  const outline = getOutline(lesson.id);
  const status = useLessonStatus(lesson.id);
  return (
    <header className={cn(READ, 'flex flex-col gap-5')}>
      <Link to={`/learn#${lesson.module}`} className="text-ui font-semibold text-blueprint hover:underline">
        {moduleLabel(lesson.module)}
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">{lesson.title}</h1>
        <p className="text-lead text-graphite">
          <MdInline md={lesson.idea} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui text-graphite">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {lesson.minutes} min read
        </span>
        <span className="tabular">Lesson {outline?.number}</span>
        <span className="inline-flex items-center gap-1.5">
          <StatusIcon status={status} />
          {statusLabel[status]}
        </span>
      </div>
      {lesson.prerequisites.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ui text-graphite">Before this:</span>
          {lesson.prerequisites.map((id) => {
            const o = getOutline(id);
            if (!o) return null;
            return isLessonWritten(id) ? (
              <Link key={id} to={lessonPath(id)} className="rounded-full bg-blueprint-wash px-2.5 py-0.5 text-small font-semibold text-blueprint hover:underline">
                {o.number} {o.title}
              </Link>
            ) : (
              <Chip key={id}>
                {o.number} {o.title}
              </Chip>
            );
          })}
        </div>
      ) : null}
      <div className="rounded-card border border-rule bg-paper px-5 py-4">
        <p className="text-ui font-semibold text-ink">You’ll be able to:</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ui-lg text-ink marker:text-graphite">
          {lesson.outcomes.map((o, i) => (
            <li key={i}>
              <MdInline md={o} />
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

function InterviewSection({ lesson }: { lesson: Lesson }) {
  const iv = lesson.interview;
  return (
    <>
      <Callout kind="interview" className={READ}>
        <MdWithLead kind="interview" md={iv.whenToMention} />
      </Callout>
      <div className={cn(READ, 'flex flex-col gap-3')}>
        <h3 className="text-h3 font-bold text-ink">Say it like this</h3>
        {iv.sayItLikeThis.map((s, i) => (
          <blockquote key={i} className="rounded-card border border-rule bg-paper px-5 py-4 text-body text-ink">
            “<MdInline md={s} />”
          </blockquote>
        ))}
      </div>
      <div className={cn(READ, 'flex flex-col gap-3')}>
        <h3 className="text-h3 font-bold text-ink">Follow-up questions</h3>
        <p className="text-ui text-graphite">Answer each one out loud before you reveal the model answer.</p>
        {iv.followUps.map((f, i) => (
          <FollowUp key={i} q={f.q} a={f.a} />
        ))}
      </div>
      <div className={cn(READ, 'flex flex-col gap-3')}>
        <h3 className="text-h3 font-bold text-ink">Red flags</h3>
        <ul className="flex flex-col gap-2.5">
          {iv.redFlags.map((r, i) => (
            <li key={i} className="flex gap-3 text-body text-ink">
              <Flag className="mt-1.5 h-4 w-4 shrink-0 text-alert" strokeWidth={1.5} aria-hidden />
              <span>
                <MdInline md={r} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function FollowUp({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-rule bg-paper px-5 py-4">
      <p className="text-body font-semibold text-ink">
        <MdInline md={q} />
      </p>
      {open ? (
        <div className="mt-2 border-t border-rule pt-3">
          <Md md={a} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-ui font-semibold text-blueprint hover:underline" aria-expanded={false}>
          Show the model answer
        </button>
      )}
    </div>
  );
}

function RelatedLessons({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-h3 font-bold text-ink">Related lessons</h3>
      <ul className="flex flex-col gap-1.5">
        {ids.map((id) => {
          const o = getOutline(id);
          if (!o) return null;
          return (
            <li key={id} className="text-ui-lg">
              {isLessonWritten(id) ? (
                <Link to={lessonPath(id)} className="md-link">
                  {o.number} {o.title}
                </Link>
              ) : (
                <span className="text-graphite">
                  {o.number} {o.title}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OnThisPage({ sections, active, onNavigate }: { sections: SectionDef[]; active: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Sections of this lesson">
      <p className="mb-2 text-small font-semibold text-graphite">On this page</p>
      <ul className="flex flex-col border-l border-rule">
        {sections.map((s) => (
          <li key={s.id} className="-ml-px">
            <a
              href={`#${s.id}`}
              onClick={onNavigate}
              aria-current={active === s.id ? 'location' : undefined}
              className={cn(
                'block border-l-2 py-1 pl-3 text-ui transition-colors ease-ui',
                active === s.id ? 'border-blueprint font-semibold text-ink' : 'border-transparent text-graphite hover:text-ink',
              )}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const KEY_TERMS_SHOWN = 10;

function KeyTerms({ ids }: { ids: string[] }) {
  const [all, setAll] = useState(false);
  if (!ids.length) return null;
  const shown = all ? ids : ids.slice(0, KEY_TERMS_SHOWN);
  return (
    <div className="mt-8">
      <p className="mb-2 text-small font-semibold text-graphite">Key terms</p>
      <ul className="flex flex-col gap-1.5 text-ui text-ink">
        {shown.map((id) => {
          const t = glossaryById.get(id);
          if (!t) return null;
          return (
            <li key={id}>
              <Term id={id}>{t.term}</Term>
            </li>
          );
        })}
      </ul>
      {ids.length > KEY_TERMS_SHOWN ? (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-ui font-semibold text-blueprint hover:underline" aria-expanded={all}>
          {all ? 'Show fewer terms' : `Show all ${ids.length} terms`}
        </button>
      ) : null}
    </div>
  );
}

function LessonFooter({ lesson }: { lesson: Lesson }) {
  const markRead = useProgress((s) => s.markRead);
  const addCards = useProgress((s) => s.addCards);
  const rec = useProgress((s) => s.lessons[lesson.id]);
  const status = useLessonStatus(lesson.id);
  const reduced = useReducedMotion();
  const [needsQuiz, setNeedsQuiz] = useState(false);
  const [footerRef, footerVisible] = useInView<HTMLElement>(0.6);

  // Reaching the end of the lesson counts as reading it.
  useEffect(() => {
    if (footerVisible && !rec?.read) markRead(lesson.id);
  }, [footerVisible, rec?.read, markRead, lesson.id]);

  const index = allLessonOutlines.findIndex((l) => l.id === lesson.id);
  const prev = findWritten(index, -1);
  const next = findWritten(index, 1);
  const complete = status === 'done' || status === 'mastered';
  const cardsAdded = (rec?.cardCount ?? 0) > 0;

  return (
    <footer ref={footerRef} className={cn(WIDE, 'flex flex-col gap-6 border-t border-rule pt-8')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex flex-col gap-2">
          {complete ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-control bg-success-wash px-4 text-ui font-semibold text-success" role="status">
              <motion.span
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.18, ease: [0.22, 0.8, 0.24, 1] }}
                className="inline-flex"
              >
                <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </motion.span>
              Completed
            </span>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                markRead(lesson.id);
                if (!rec?.quiz?.attempts) setNeedsQuiz(true);
              }}
            >
              Mark complete
            </Button>
          )}
          {needsQuiz && !complete ? (
            <p className="max-w-[22rem] text-ui text-graphite" role="status">
              Marked as read. Answer the questions in{' '}
              <a href="#check-yourself" className="md-link">
                Check yourself
              </a>{' '}
              to complete this lesson.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {cardsAdded ? (
            <span className="inline-flex h-10 items-center gap-2 text-ui text-ink" role="status">
              <Check className="h-4 w-4 text-success" strokeWidth={1.5} aria-hidden />
              {plural(lesson.flashcards.length, 'card')} added to your review deck.
              <Link to="/practice/flashcards" className="md-link">
                Review cards
              </Link>
            </span>
          ) : (
            <Button onClick={() => addCards(lesson.id, lesson.flashcards.length)}>
              Add {plural(lesson.flashcards.length, 'flashcard')} to your review deck
            </Button>
          )}
        </div>
      </div>
      <nav aria-label="Lesson navigation" className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link to={lessonPath(prev.id)} className="group flex flex-col rounded-card border border-rule bg-paper px-4 py-3 hover:border-graphite">
            <span className="inline-flex items-center gap-1 text-small text-graphite">
              Previous lesson
            </span>
            <span className="text-ui-lg font-semibold text-ink">
              {prev.number} {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={lessonPath(next.id)} className="group flex flex-col items-end rounded-card border border-rule bg-paper px-4 py-3 text-right hover:border-graphite">
            <span className="inline-flex items-center gap-1 text-small text-graphite">
              Next lesson
            </span>
            <span className="text-ui-lg font-semibold text-ink">
              {next.number} {next.title}
            </span>
          </Link>
        ) : null}
      </nav>
    </footer>
  );
}

function findWritten(from: number, dir: 1 | -1) {
  for (let i = from + dir; i >= 0 && i < allLessonOutlines.length; i += dir) {
    const o = allLessonOutlines[i]!;
    if (isLessonWritten(o.id)) return o;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */

/** The section whose heading most recently scrolled past a line near the top of the window. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = Math.min(160, window.innerHeight * 0.3);
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ids]);
  return active;
}

function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = target.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      setP(total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [target]);
  return (
    <div className="no-print fixed top-0 right-0 left-0 z-30 h-[3px]" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <div className="h-full bg-blueprint" style={{ width: `${p * 100}%` }} />
    </div>
  );
}
