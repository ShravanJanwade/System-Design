/**
 * Writes src/content/generated/search-index.ts, the full-text index behind the command palette:
 * - lessons: number, title, path, idea, section headings, takeaways and key terms;
 * - problems: title, path, prompt and concepts;
 * - cheat sheets (whichever exist in src/content/cheatsheets): title, path, summary and section titles.
 * The palette loads the file lazily the first time it opens, so it never adds to the main bundle.
 * Run it after adding or editing lessons, problems or cheat sheets:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-search-index.ts
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Block, CheatSheet } from '../src/content/types';
import { getOutline, lessonPath } from '../src/content/modules';
import { glossaryById } from '../src/content/glossary';
import { problemList } from '../src/content/problem-list';
import { loadLessons, root } from './load-lessons';
import { loadProblems } from './load-problems';

/** Markdown to plain text: term links, links, code, bold and italics keep only their words. */
function plain(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|[^\]]*\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(“"])[*_]([^*_\n]+)[*_](?=[\s).,;:!?”"]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops empty and repeated strings, ignoring case, and keeps the first spelling. */
function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function headingsOf(blocks: Block[] | undefined): string[] {
  return (blocks ?? []).flatMap((b) => (b.kind === 'heading' ? [plain(b.text)] : []));
}

function isCheatSheet(x: unknown): x is CheatSheet {
  if (!x || typeof x !== 'object') return false;
  const c = x as Partial<CheatSheet>;
  return typeof c.id === 'string' && typeof c.title === 'string' && typeof c.summary === 'string' && Array.isArray(c.sections);
}

/**
 * Every cheat sheet exported from src/content/cheatsheets, in the order list.ts gives them.
 * index.ts is skipped: it finds the sheets with import.meta.glob, which only Vite provides.
 */
async function loadCheatSheets(): Promise<CheatSheet[]> {
  const dir = path.join(root, 'src/content/cheatsheets');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith('.d.ts') && !f.startsWith('index.'))
    .sort();
  const found = new Map<string, CheatSheet>();
  const collect = (value: unknown, depth = 0) => {
    if (isCheatSheet(value)) {
      if (!found.has(value.id)) found.set(value.id, value);
    } else if (depth < 2 && value && typeof value === 'object') {
      const items = Array.isArray(value) ? value : value instanceof Map ? [...value.values()] : Object.values(value);
      for (const item of items) collect(item, depth + 1);
    }
  };
  let order: string[] = [];
  for (const f of files) {
    try {
      const mod = (await import(pathToFileURL(path.join(dir, f)).href)) as Record<string, unknown>;
      collect(Object.values(mod));
      const list = mod.cheatSheetList;
      if (f.startsWith('list.') && Array.isArray(list)) order = list.flatMap((c: { id?: unknown }) => (typeof c?.id === 'string' ? [c.id] : []));
    } catch (err) {
      console.warn(`Skipped cheatsheets/${f}: ${(err as Error).message}`);
    }
  }
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...found.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

const lessons = (await loadLessons()).map((l) => {
  const o = getOutline(l.id);
  return {
    id: l.id,
    number: o?.number ?? '',
    title: o?.title ?? l.title,
    path: lessonPath(l.id),
    idea: plain(l.idea),
    headings: unique([...headingsOf(l.body), ...headingsOf(l.tryIt), ...headingsOf(l.deeper), ...(l.realWorld ? [plain(l.realWorld.title)] : [])]),
    takeaways: l.takeaways.map(plain),
    terms: unique(
      l.glossaryTerms.flatMap((id) => {
        const t = glossaryById.get(id);
        return t ? [t.term, ...(t.aka ?? [])] : [];
      }),
    ),
  };
});

const listed = new Map(problemList.map((p) => [p.id, p]));
const problems = (await loadProblems()).map((p) => {
  const row = listed.get(p.id);
  return {
    id: p.id,
    title: row?.title ?? p.title,
    path: `/problems/${p.id}`,
    prompt: plain(p.prompt),
    concepts: unique([...(row?.concepts.split(/,\s*/) ?? []), ...p.concepts.flatMap((id) => getOutline(id)?.title ?? [])]),
  };
});

const cheatSheets = (await loadCheatSheets()).map((c) => ({
  id: c.id,
  title: c.title,
  path: `/reference/cheatsheets/${c.id}`,
  summary: plain(c.summary),
  sections: unique(c.sections.map((s) => plain(s.title))),
}));

const rows = (items: object[]) => items.map((x) => `    ${JSON.stringify(x)},`).join('\n');

const source = `/**
 * Generated by scripts/generate-search-index.ts. Do not edit by hand.
 * The command palette's full-text index. The palette imports it lazily, the first time it opens.
 */

export type SearchLesson = {
  id: string;
  number: string;
  title: string;
  path: string;
  idea: string;
  headings: string[];
  takeaways: string[];
  /** Names (and other spellings) of the glossary terms the lesson teaches. */
  terms: string[];
};

export type SearchProblem = { id: string; title: string; path: string; prompt: string; concepts: string[] };

export type SearchCheatSheet = { id: string; title: string; path: string; summary: string; sections: string[] };

export type SearchIndex = { lessons: SearchLesson[]; problems: SearchProblem[]; cheatSheets: SearchCheatSheet[] };

export const searchIndex: SearchIndex = {
  lessons: [
${rows(lessons)}
  ],
  problems: [
${rows(problems)}
  ],
  cheatSheets: [
${rows(cheatSheets)}
  ],
};
`;

const out = path.join(root, 'src/content/generated/search-index.ts');
writeFileSync(out, source);
const kb = (Buffer.byteLength(source) / 1024).toFixed(1);
console.log(
  `Wrote ${path.relative(root, out)} (${kb} KB): ${lessons.length} lessons, ${problems.length} problems, ${cheatSheets.length} cheat sheets.`,
);
