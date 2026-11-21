import { Fragment, useMemo, type ReactElement, type ReactNode } from 'react';
import { Command, useCommandState } from 'cmdk';
import { Dialog as RDialog } from 'radix-ui';
import { useNavigate } from 'react-router';
import { BookOpen, Boxes, CornerDownLeft, FlaskConical, Layers, Maximize2, PencilRuler, ScrollText, Search, SunMoon, TextSearch } from 'lucide-react';
import { DRILLS } from '@/features/practice/modes';
import type { SearchCheatSheet, SearchIndex, SearchLesson, SearchProblem } from '@/content/generated/search-index';
import { allLessonOutlines, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { isProblemWritten } from '@/content/problems';
import { problemList } from '@/content/problem-list';
import { glossary } from '@/content/glossary';
import { builtSimulators } from '@/simulators/registry';
import { useSettings } from '@/state/settings';
import { Kbd } from '@/design/primitives';
import { sections } from '@/app/sections';
import { findSnippet, paletteFilter, wordsMissingFrom, type SnippetField } from './match';
import { useSearchIndex } from './useSearchIndex';

const itemClass =
  'flex cursor-pointer items-start gap-3 rounded-control px-3 py-2 text-ui text-ink data-[selected=true]:bg-blueprint-wash data-[disabled=true]:cursor-default data-[disabled=true]:text-graphite';
const groupClass =
  'mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-graphite';
const icon = 'h-4 w-4';

/** An item's searchable text: keyword strings in priority order, and the fields a snippet can quote. */
type ItemText = { keywords: string[]; fields: SnippetField[] };

const field =
  (label: string) =>
  (text: string): SnippetField => ({ label, text });

function lessonText(d: SearchLesson): ItemText {
  return {
    // A heading outranks a key term, which outranks the summary and takeaways.
    keywords: [d.headings.join('\n'), d.terms.join('\n'), [d.idea, ...d.takeaways].join('\n')],
    fields: [...d.headings.map(field('Section')), ...d.terms.map(field('Key term')), field('Summary')(d.idea), ...d.takeaways.map(field('Takeaway'))],
  };
}

function problemText(d: SearchProblem): ItemText {
  return { keywords: [d.concepts.join('\n'), d.prompt], fields: [...d.concepts.map(field('Concept')), field('Prompt')(d.prompt)] };
}

function cheatSheetText(d: SearchCheatSheet): ItemText {
  return { keywords: [d.sections.join('\n'), d.summary], fields: [...d.sections.map(field('Section')), field('Summary')(d.summary)] };
}

function textOf(index: SearchIndex) {
  return {
    lessons: new Map(index.lessons.map((d) => [d.id, lessonText(d)])),
    problems: new Map(index.problems.map((d) => [d.id, problemText(d)])),
    cheatSheets: index.cheatSheets.map((d) => ({ sheet: d, ...cheatSheetText(d) })),
  };
}

/** A palette group: what it matches on (for ordering groups) and its rendered element. */
type PaletteGroup = { id: string; entries: { value: string; keywords?: string[] }[]; element: ReactElement };

/**
 * ⌘K / Ctrl+K: search lessons, interview problems, cheat sheets, glossary terms, simulators and pages.
 * Titles match at once. The full-text index (lesson headings, key terms and takeaways; problem prompts and
 * concepts; cheat sheet sections) loads the first time the palette opens; its matches rank below title matches.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const toggleFocus = useSettings((s) => s.toggleFocusMode);
  const index = useSearchIndex(open);

  // Built once per index and theme, so typing re-orders these elements without re-rendering hundreds of items.
  const groups = useMemo((): PaletteGroup[] => {
    const text = index ? textOf(index) : null;
    const run = (fn: () => void) => {
      onOpenChange(false);
      fn();
    };
    const go = (to: string) => run(() => navigate(to));
    // cmdk reads an item's keywords only when the item mounts, so groups that gain text remount once the index arrives.
    const textKey = text ? 'text' : 'titles';

    const lessons = allLessonOutlines
      .filter((l) => isLessonWritten(l.id))
      .map((l) => ({ l, value: `lesson ${l.number} ${l.title}`, t: text?.lessons.get(l.id) }));
    const problems = problemList
      .filter((p) => isProblemWritten(p.id))
      .map((p) => {
        const t = text?.problems.get(p.id);
        return { p, value: `problem ${p.title}`, t, keywords: t?.keywords ?? [p.concepts] };
      });
    const sheets = (text?.cheatSheets ?? []).map((c) => ({ ...c, value: `cheat sheet ${c.sheet.title}` }));
    const terms = glossary.map((t) => ({ t, value: `term ${t.term} ${(t.aka ?? []).join(' ')}`, keywords: [t.definition] }));
    const sims = builtSimulators.map((s) => ({ s, value: `simulator ${s.title} ${s.summary}` }));
    const pages = [
      ...sections.map((s) => ({ value: `page ${s.label}`, to: s.to, label: s.label, Icon: s.icon })),
      { value: 'page glossary', to: '/reference/glossary', label: 'Glossary', Icon: Layers },
      { value: 'page flashcards review', to: '/practice/flashcards', label: 'Review flashcards', Icon: Layers },
      ...Object.values(DRILLS).map((d) => ({ value: `page practice ${d.title}`, to: d.path, label: d.title, Icon: d.icon })),
      { value: 'page practice architecture builder sandbox', to: '/practice/builder', label: 'Architecture builder', Icon: Boxes },
      { value: 'page study plan weeks', to: '/plan', label: 'Study plan', Icon: Layers },
      { value: 'page settings', to: '/settings', label: 'Settings', Icon: Layers },
    ];
    const actions = [
      {
        value: 'action switch theme dark light',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        onSelect: () => run(() => setTheme(theme === 'dark' ? 'light' : 'dark')),
        Icon: SunMoon,
      },
      { value: 'action focus mode reading', label: 'Toggle focus mode for lessons', onSelect: () => run(toggleFocus), Icon: Maximize2 },
    ];

    const list: PaletteGroup[] = [
      {
        id: 'lessons',
        entries: lessons.map(({ value, t }) => ({ value, keywords: t?.keywords })),
        element: (
          <Command.Group key={`lessons-${textKey}`} heading="Lessons" className={groupClass}>
            {lessons.map(({ l, value, t }) => (
              <Item key={l.id} value={value} keywords={t?.keywords} onSelect={() => go(lessonPath(l.id))} icon={<BookOpen className={icon} strokeWidth={1.5} />}>
                <span className="tabular w-8 shrink-0 text-graphite">{l.number}</span>
                <Stack title={l.title} value={value} fields={t?.fields} />
              </Item>
            ))}
          </Command.Group>
        ),
      },
      {
        id: 'problems',
        entries: problems.map(({ value, keywords }) => ({ value, keywords })),
        element: (
          <Command.Group key={`problems-${textKey}`} heading="Problems" className={groupClass}>
            {problems.map(({ p, value, t, keywords }) => (
              <Item key={p.id} value={value} keywords={keywords} onSelect={() => go(`/problems/${p.id}`)} icon={<PencilRuler className={icon} strokeWidth={1.5} />}>
                <Stack title={p.title} value={value} fields={t?.fields} />
                <span className="shrink-0 text-small leading-5 text-graphite">Tier {p.tier}</span>
              </Item>
            ))}
          </Command.Group>
        ),
      },
    ];
    if (sheets.length) {
      list.push({
        id: 'cheatsheets',
        entries: sheets.map(({ value, keywords }) => ({ value, keywords })),
        element: (
          <Command.Group key="cheatsheets" heading="Cheat sheets" className={groupClass}>
            {sheets.map(({ sheet, value, keywords, fields }) => (
              <Item key={sheet.id} value={value} keywords={keywords} onSelect={() => go(sheet.path)} icon={<ScrollText className={icon} strokeWidth={1.5} />}>
                <Stack title={sheet.title} value={value} fields={fields} />
              </Item>
            ))}
          </Command.Group>
        ),
      });
    }
    list.push(
      {
        id: 'glossary',
        entries: terms.map(({ value, keywords }) => ({ value, keywords })),
        element: (
          <Command.Group key="glossary" heading="Glossary" className={groupClass}>
            {terms.map(({ t, value, keywords }) => (
              <Item key={t.id} value={value} keywords={keywords} onSelect={() => go(`/reference/glossary#${t.id}`)} icon={<TextSearch className={icon} strokeWidth={1.5} />}>
                <span className="min-w-0">
                  <span className="font-semibold">{t.term}</span>
                  <span className="ml-2 truncate text-graphite">{t.definition}</span>
                </span>
              </Item>
            ))}
          </Command.Group>
        ),
      },
      {
        id: 'simulators',
        entries: sims.map(({ value }) => ({ value })),
        element: (
          <Command.Group key="simulators" heading="Simulators" className={groupClass}>
            {sims.map(({ s, value }) => (
              <Item key={s.id} value={value} onSelect={() => go(`/playground/${s.id}`)} icon={<FlaskConical className={icon} strokeWidth={1.5} />}>
                {s.title}
              </Item>
            ))}
          </Command.Group>
        ),
      },
      {
        id: 'pages',
        entries: pages.map(({ value }) => ({ value })),
        element: (
          <Command.Group key="pages" heading="Pages" className={groupClass}>
            {pages.map(({ value, to, label, Icon }) => (
              <Item key={value} value={value} onSelect={() => go(to)} icon={<Icon className={icon} strokeWidth={1.5} />}>
                {label}
              </Item>
            ))}
          </Command.Group>
        ),
      },
      {
        id: 'actions',
        entries: actions.map(({ value }) => ({ value })),
        element: (
          <Command.Group key="actions" heading="Actions" className={groupClass}>
            {actions.map(({ value, label, onSelect, Icon }) => (
              <Item key={value} value={value} onSelect={onSelect} icon={<Icon className={icon} strokeWidth={1.5} />}>
                {label}
              </Item>
            ))}
          </Command.Group>
        ),
      },
    );
    return list;
  }, [index, theme, navigate, onOpenChange, setTheme, toggleFocus]);

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <RDialog.Content
          aria-describedby={undefined}
          className="fixed top-[10vh] left-1/2 z-50 w-[min(40rem,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-card border border-rule bg-paper shadow-float focus-visible:outline-none"
        >
          <RDialog.Title className="sr-only">Search Blueprint</RDialog.Title>
          <Command label="Search Blueprint" loop filter={paletteFilter}>
            <div className="flex items-center gap-2 border-b border-rule px-4">
              <Search className="h-[18px] w-[18px] shrink-0 text-graphite" strokeWidth={1.5} aria-hidden />
              <Command.Input
                autoFocus
                placeholder="Search lessons, problems, terms and more"
                className="h-12 min-w-0 flex-1 bg-transparent text-ui-lg text-ink outline-none placeholder:text-graphite"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-ui text-graphite">No matches. Try a shorter word, such as “cache” or “DNS”.</Command.Empty>
              <OrderedGroups groups={groups} />
            </Command.List>
            <div className="flex items-center gap-4 border-t border-rule px-4 py-2 text-small text-graphite">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="h-3 w-3" strokeWidth={1.5} aria-label="Enter" />
                </Kbd>{' '}
                to open
              </span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/**
 * Puts the group holding the best match first (ties keep the usual order), so a glossary term or page whose
 * title matches comes before lessons that only mention the word. cmdk sorts items within groups itself.
 */
function OrderedGroups({ groups }: { groups: PaletteGroup[] }) {
  const search = useCommandState((s) => s.search);
  const ordered = useMemo(() => {
    if (!search.trim()) return groups;
    const best = new Map(groups.map((g) => [g.id, g.entries.reduce((m, e) => Math.max(m, paletteFilter(e.value, search, e.keywords)), 0)]));
    return [...groups].sort((a, b) => best.get(b.id)! - best.get(a.id)!);
  }, [groups, search]);
  return <>{ordered.map((g) => g.element)}</>;
}

function Item({
  value,
  keywords,
  onSelect,
  icon,
  children,
}: {
  value: string;
  keywords?: string[];
  onSelect: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className={itemClass}>
      <span className="flex h-5 shrink-0 items-center text-graphite" aria-hidden>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 items-start gap-2 truncate">{children}</span>
    </Command.Item>
  );
}

/** A title, and under it the snippet that explains a text match. */
function Stack({ title, value, fields }: { title: string; value: string; fields?: SnippetField[] }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{title}</span>
      {fields ? <MatchSnippet value={value} fields={fields} /> : null}
    </span>
  );
}

/** Shows why an item matched when some typed words are not in its title, such as "Key term: fencing token". */
function MatchSnippet({ value, fields }: { value: string; fields: SnippetField[] }) {
  const search = useCommandState((s) => s.search);
  const snippet = useMemo(() => findSnippet(fields, wordsMissingFrom(value, search)), [fields, value, search]);
  if (!snippet) return null;
  return (
    <span className="mt-0.5 line-clamp-2 text-small whitespace-normal text-graphite">
      <span className="font-semibold">{snippet.label}:</span>{' '}
      {snippet.parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-transparent px-0 font-semibold text-ink">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </span>
  );
}
