import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Printer } from 'lucide-react';
import type { CheatSheet } from '@/content/types';
import { getLoadedCheatSheet, loadCheatSheet } from '@/content/cheatsheets';
import { getCheatSheetInfo } from '@/content/cheatsheets/list';
import { getOutline, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { Button, ButtonLink } from '@/design/Button';
import { Chip } from '@/design/primitives';
import { BlockView } from '@/features/learn/blocks';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import './cheatsheet.css';

/**
 * One cheat sheet (blueprint section 11): fits one screen at 1440 × 900, reads on a phone,
 * and prints on one page, black on white, without the app around it.
 */
export default function CheatSheetPage() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const info = getCheatSheetInfo(id);
  const [loaded, setLoaded] = useState<Record<string, CheatSheet>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sheet = getLoadedCheatSheet(id) ?? loaded[id];

  useEffect(() => {
    if (!info || getLoadedCheatSheet(id)) return;
    let live = true;
    loadCheatSheet(id).then(
      (s) => {
        if (live) setLoaded((m) => ({ ...m, [id]: s }));
      },
      () => {
        if (live) setFailed(id);
      },
    );
    return () => {
      live = false;
    };
  }, [id, info, attempt]);

  useEffect(() => {
    document.title = info ? `${info.title} cheat sheet — Blueprint` : 'Cheat sheet not found — Blueprint';
  }, [info]);

  if (!info) {
    return (
      <Page>
        <PageHeader title="Cheat sheet not found" intro={`There is no cheat sheet called “${id}”. Pick one from the Reference page.`} />
        <ButtonLink to="/reference" className="w-fit">
          See all cheat sheets
        </ButtonLink>
      </Page>
    );
  }

  const lessons = (sheet?.lessons ?? []).flatMap((lessonId) => {
    const outline = getOutline(lessonId);
    return outline ? [outline] : [];
  });

  return (
    <article className="cs-sheet flex max-w-[1600px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8 lg:px-12" aria-labelledby="cs-title">
      <header className="cs-head flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="measure flex min-w-0 flex-col gap-1">
          <h1 id="cs-title" className="font-display text-title-sm font-semibold text-ink">
            {info.title}
          </h1>
          <p className="text-ui-lg text-graphite">{info.summary}</p>
          {info.rough ? (
            <p className="cs-rough mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-ink">
              <Chip tone="signal">Rough numbers</Chip>
              <span>Ballparks for estimates and sanity checks, not measurements.</span>
            </p>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <ButtonLink to="/reference" variant="ghost">
            All cheat sheets
          </ButtonLink>
          <Button onClick={() => window.print()} disabled={!sheet}>
            <Printer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Print this sheet
          </Button>
        </div>
      </header>

      {sheet ? (
        <>
          <div className="cs-sections">
            {sheet.sections.map((s, i) => (
              <section key={s.title} className="cs-section" aria-labelledby={`cs-section-${i}`}>
                <h2 id={`cs-section-${i}`} className="cs-section-title font-display text-h3 font-semibold text-ink">
                  {s.title}
                </h2>
                <div className="flex flex-col gap-3">
                  {s.blocks.map((b, j) => (
                    <BlockView key={j} block={b} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <footer className="cs-foot flex flex-col gap-1 border-t border-rule pt-3 text-ui text-graphite">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <h2 className="font-semibold text-ink">From the lessons</h2>
              <ul className="flex flex-wrap gap-x-6 gap-y-1">
                {lessons.map((o) => (
                  <li key={o.id}>
                    {isLessonWritten(o.id) ? (
                      <Link to={lessonPath(o.id)} className="md-link">
                        {o.number} {o.title}
                      </Link>
                    ) : (
                      `${o.number} ${o.title}`
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <p className="hidden print:block">
              A Blueprint cheat sheet, online at {window.location.host}
              {pathname}
            </p>
          </footer>
        </>
      ) : failed === id ? (
        <div role="alert" className="measure flex flex-col items-start gap-3">
          <p className="text-ui-lg text-ink">This cheat sheet did not load. Check your connection, then try again.</p>
          <Button
            onClick={() => {
              setFailed(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <p role="status" className="text-ui text-graphite">
          Loading the sheet
        </p>
      )}
    </article>
  );
}
