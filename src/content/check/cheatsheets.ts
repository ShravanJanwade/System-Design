/**
 * Content check for the cheat sheets (blueprint sections 11, 13 and 18).
 * A sheet must match its entry in content/cheatsheets/list.ts, link the lessons it summarizes,
 * follow the writing rules, and stay small enough to fit one screen and print on one page.
 */
import type { Block, CheatSheet } from '../types';
import { cheatSheetList } from '../cheatsheets/list';
import { getOutline } from '../modules';
import { glossaryById } from '../glossary';
import { countSentences, linkHrefs, mdToPlain, termIds } from '../../lib/md';
import { PHONE_COMPARE_PANEL, acronymProblems, blockSegs, checkDiagram, sentenceProblems, wordingProblems, type Seg } from './check';

/** Blocks that need a screen to make sense (a simulator, a widget, a clickable flowchart, a quiz), so they cannot print. */
const SCREEN_ONLY: ReadonlySet<Block['kind']> = new Set<Block['kind']>(['simulator', 'widget', 'decision', 'quickCheck']);

/** Word limits that keep text short: sheets use tables, numbers and annotated lines rather than prose. */
const MAX_PROSE_WORDS = 40;
const MAX_CALLOUT_WORDS = 60;
/** Tables print in a half-page column, so they stay narrow. */
const MAX_TABLE_COLUMNS = 4;
/**
 * Every word a reader sees, code included. The ten sheets run 250 to 375 words, and the densest
 * of them just fill one screen at 1440 × 900 (a printed page has more room). Past this, cut the sheet down.
 */
export const MAX_SHEET_WORDS = 400;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Every piece of text a reader sees, in reading order, for the writing checks. */
export function cheatSheetSegments(sheet: CheatSheet): Seg[] {
  const segs: Seg[] = [
    { where: 'title', md: sheet.title, prose: false },
    { where: 'summary', md: sheet.summary, prose: true },
  ];
  sheet.sections.forEach((s, i) => {
    const at = `section ${i + 1} ("${s.title}")`;
    segs.push({ where: `${at} title`, md: s.title, prose: false });
    s.blocks.forEach((b, j) => segs.push(...blockSegs(b, `${at} block ${j + 1} (${b.kind})`)));
  });
  return segs;
}

/** Text the writing checks skip but a reader still sees: table headers and annotated code. */
function extraText(b: Block): string[] {
  if (b.kind === 'table') return b.columns;
  if (b.kind === 'annotated') return b.lines.map((l) => l.code);
  if (b.kind === 'code') return [b.code];
  return [];
}

/** Words a reader sees on the sheet, counting code and column headers. */
export function cheatSheetWords(sheet: CheatSheet): number {
  const texts = [
    ...cheatSheetSegments(sheet).map((s) => mdToPlain(s.md)),
    ...sheet.sections.flatMap((s) => s.blocks.flatMap(extraText)),
  ];
  return texts.reduce((n, t) => n + words(t), 0);
}

function checkBlock(b: Block, where: string): string[] {
  const out: string[] = [];
  if (SCREEN_ONLY.has(b.kind)) out.push(`${where}: a ${b.kind} block needs a screen and does not print; use a table or numbers block instead`);
  switch (b.kind) {
    case 'table':
      if (b.columns.length < 2 || b.columns.length > MAX_TABLE_COLUMNS) out.push(`${where}: tables need 2 to ${MAX_TABLE_COLUMNS} columns to fit a printed column; found ${b.columns.length}`);
      b.rows.forEach((r, i) => {
        if (r.length !== b.columns.length) out.push(`${where}: row ${i + 1} has ${r.length} cells for ${b.columns.length} columns`);
        if (r.some((c) => !c.trim())) out.push(`${where}: row ${i + 1} has an empty cell`);
      });
      if (b.rows.length === 0) out.push(`${where}: the table has no rows`);
      break;
    case 'numbers':
      if (b.items.length === 0) out.push(`${where}: the numbers block is empty`);
      b.items.forEach((it, i) => (!it.label.trim() || !it.value.trim()) && out.push(`${where}: item ${i + 1} needs a label and a value`));
      break;
    case 'annotated':
      if (b.lines.length === 0) out.push(`${where}: the annotated block has no lines`);
      break;
    case 'prose': {
      const n = words(mdToPlain(b.md));
      if (n > MAX_PROSE_WORDS) out.push(`${where}: ${n} words of prose; keep it under ${MAX_PROSE_WORDS}, or turn it into a table`);
      break;
    }
    case 'callout': {
      const n = words(mdToPlain(b.md));
      if (n > MAX_CALLOUT_WORDS) out.push(`${where}: a ${n}-word callout; keep callouts under ${MAX_CALLOUT_WORDS} words`);
      break;
    }
    case 'diagram':
      out.push(...checkDiagram(b.spec, where));
      break;
    case 'compare':
      for (const side of [b.left, b.right]) if (side.diagram) out.push(...checkDiagram(side.diagram, `${where} ("${side.title}")`, PHONE_COMPARE_PANEL));
      break;
    default:
      break;
  }
  return out;
}

/** Problems with one cheat sheet; an empty list means it is ready to ship. */
export function checkCheatSheet(sheet: CheatSheet): string[] {
  const out: string[] = [];

  const info = cheatSheetList.find((x) => x.id === sheet.id);
  if (!info) out.push('is not in content/cheatsheets/list.ts');
  else {
    if (info.title !== sheet.title) out.push(`title "${sheet.title}" disagrees with the list ("${info.title}")`);
    if (info.summary !== sheet.summary) out.push('summary disagrees with the list');
    if (Boolean(info.rough) !== Boolean(sheet.rough)) out.push(`rough is ${Boolean(sheet.rough)} here but ${Boolean(info.rough)} in the list`);
  }
  if (!sheet.title.trim()) out.push('needs a title');
  const sentences = countSentences(mdToPlain(sheet.summary));
  if (sentences !== 1) out.push(`the summary must be one sentence; found ${sentences}`);

  if (sheet.lessons.length === 0) out.push('must link at least one lesson it summarizes');
  const seenLessons = new Set<string>();
  for (const id of sheet.lessons) {
    if (!getOutline(id)) out.push(`links unknown lesson "${id}"`);
    if (seenLessons.has(id)) out.push(`lists lesson "${id}" twice`);
    seenLessons.add(id);
  }

  if (sheet.sections.length < 2) out.push(`needs at least two sections; found ${sheet.sections.length}`);
  const seenTitles = new Set<string>();
  sheet.sections.forEach((s, i) => {
    const at = `section ${i + 1} ("${s.title}")`;
    if (!s.title.trim()) out.push(`section ${i + 1} needs a title`);
    if (seenTitles.has(s.title)) out.push(`${at}: another section has the same title`);
    seenTitles.add(s.title);
    if (s.blocks.length === 0) out.push(`${at}: has no blocks`);
    s.blocks.forEach((b, j) => out.push(...checkBlock(b, `${at} block ${j + 1} (${b.kind})`)));
  });

  const total = cheatSheetWords(sheet);
  if (total > MAX_SHEET_WORDS) out.push(`has ${total} words; more than ${MAX_SHEET_WORDS} will not fit one screen or one printed page`);

  const segs = cheatSheetSegments(sheet);
  const allMd = segs.map((x) => x.md);
  for (const href of allMd.flatMap(linkHrefs)) {
    if (href.startsWith('lesson:') && !getOutline(href.slice(7))) out.push(`links to unknown lesson "${href}"`);
  }
  for (const id of new Set(allMd.flatMap(termIds))) if (!glossaryById.has(id)) out.push(`links glossary term "${id}", which does not exist`);
  out.push(...acronymProblems(segs), ...sentenceProblems(segs), ...wordingProblems(segs));
  return out;
}

/** The list and the sheet files must name the same sheets. */
export function checkCheatSheetFiles(fileIds: Iterable<string>): string[] {
  const files = new Set(fileIds);
  const listed = new Set(cheatSheetList.map((s) => s.id));
  const out: string[] = [];
  if (listed.size !== cheatSheetList.length) out.push('content/cheatsheets/list.ts names a sheet twice');
  for (const id of listed) if (!files.has(id)) out.push(`list.ts names "${id}", but content/cheatsheets/${id}.ts does not exist`);
  for (const id of files) if (!listed.has(id)) out.push(`content/cheatsheets/${id}.ts is not in list.ts`);
  return out;
}
