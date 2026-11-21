import { useEffect } from 'react';
import { Link } from 'react-router';
import { Printer, TextSearch } from 'lucide-react';
import { glossary } from '@/content/glossary';
import { cheatSheetGroups, cheatSheetList, cheatSheetPath } from '@/content/cheatsheets/list';
import { ButtonLink } from '@/design/Button';
import { Chip } from '@/design/primitives';
import { Page, PageHeader } from '@/features/shared/PageHeader';

/** Reference (blueprint section 11): the ten cheat sheets in a content column, the glossary in a rail beside them. */
export default function ReferencePage() {
  useEffect(() => {
    document.title = 'Reference — Blueprint';
  }, []);

  return (
    <Page>
      <PageHeader title="Reference" intro="Fast lookup, especially the night before an interview." />

      <div className="grid max-w-[1180px] items-start gap-x-16 gap-y-12 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="ref-sheets" className="flex min-w-0 flex-col gap-8">
          <div className="measure flex flex-col gap-1">
            <h2 id="ref-sheets" className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
              Cheat sheets
            </h2>
            <p className="text-ui-lg text-graphite">
              {cheatSheetList.length} one-page summaries. Each fits on one screen, prints on one page and links the lessons behind it.
            </p>
          </div>

          {cheatSheetGroups.map((g) => {
            const sheets = cheatSheetList.filter((s) => s.group === g.id);
            if (sheets.length === 0) return null;
            return (
              <div key={g.id} className="grid gap-x-8 gap-y-2 md:grid-cols-[168px_minmax(0,1fr)]">
                <h3 className="text-ui font-semibold text-graphite md:pt-4">{g.title}</h3>
                <ul className="divide-y divide-rule border-y border-rule">
                  {sheets.map((s) => (
                    <li key={s.id}>
                      <Link to={cheatSheetPath(s.id)} className="group flex flex-col gap-1 py-3.5">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-display text-h3 font-semibold text-ink underline-offset-4 group-hover:text-blueprint group-hover:underline">
                            {s.title}
                          </span>
                          {s.rough ? <Chip tone="signal">Rough numbers</Chip> : null}
                        </span>
                        <span className="measure text-ui-lg text-graphite">{s.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <aside className="flex flex-col gap-8 xl:sticky xl:top-12" aria-label="Glossary and printing">
          <section aria-labelledby="ref-glossary" className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-5">
            <h2 id="ref-glossary" className="inline-flex items-center gap-2 font-display text-h3 font-semibold text-ink">
              <TextSearch className="h-5 w-5 text-graphite" strokeWidth={1.5} aria-hidden />
              Glossary
            </h2>
            <p className="text-ui-lg text-graphite">
              {glossary.length} terms in plain English, each with a one-line example and the lessons that use it. Search it, or filter by module.
            </p>
            <ButtonLink to="/reference/glossary" variant="primary" className="w-fit">
              Open the glossary
            </ButtonLink>
          </section>

          <section aria-labelledby="ref-printing" className="flex flex-col gap-2 border-t border-rule pt-4">
            <h2 id="ref-printing" className="inline-flex items-center gap-2 text-ui font-semibold text-ink">
              <Printer className="h-4 w-4 text-graphite" strokeWidth={1.5} aria-hidden />
              On paper
            </h2>
            <p className="text-ui text-graphite">
              Open a sheet and choose Print this sheet. It prints on one page, black on white, without the app around it, and names the
              lessons it summarizes.
            </p>
          </section>
        </aside>
      </div>
    </Page>
  );
}
