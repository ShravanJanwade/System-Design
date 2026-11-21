/**
 * Build gate: `npm run check:content` (also part of `npm run build`).
 * Prints every problem and exits with code 1 if any lesson, interview problem, practice item,
 * cheat sheet or the glossary misses its definition of done.
 *
 * Check only some lessons or problems: `npm run check:content -- dns url-shortener`
 * (skips the whole-curriculum manifest check, the practice banks and the cheat sheets).
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lessonFiles, loadLessons, root } from './load-lessons';
import { loadProblems, problemFiles } from './load-problems';
import { checkContent, estimateMinutes } from '../src/content/check/check';
import { computeTermUsage } from '../src/content/check/manifest';
import { termUsage } from '../src/content/generated/manifest';
import { glossary } from '../src/content/glossary';
import { allLessonOutlines } from '../src/content/modules';
import { problemList } from '../src/content/problem-list';
import type { CheatSheet } from '../src/content/types';
import { checkPracticeItem } from '../src/content/check/practice';
import { checkCheatSheet, checkCheatSheetFiles } from '../src/content/check/cheatsheets';
import { practicePool } from '../src/content/generated/practice-pool';
import { bottleneckItems, toolItems } from '../src/content/practice';
import { cheatSheetList } from '../src/content/cheatsheets/list';

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const lessonIds = new Set(lessonFiles().map((f) => f.id));
const problemIds = new Set(problemFiles().map((f) => f.id));
const unknown = only.filter((id) => !lessonIds.has(id) && !problemIds.has(id));
if (unknown.length) {
  console.error(`No lesson or problem file found for: ${unknown.join(', ')}`);
  process.exit(1);
}
const lessons = await loadLessons(only.length ? only.filter((id) => lessonIds.has(id)) : undefined);
const problems = await loadProblems(only.length ? only.filter((id) => problemIds.has(id)) : undefined);
const report = checkContent(lessons, only.length ? undefined : { termUsage, computed: computeTermUsage(lessons) }, problems);

console.log(
  only.length
    ? `Content check for ${only.join(', ')} (${glossary.length} glossary terms loaded).`
    : `Content check: ${lessons.length} of ${allLessonOutlines.length} lessons and ${problems.length} of ${problemList.length} problems written, ${glossary.length} glossary terms.`,
);
const statusOf = (list: string[]) => (list.length ? `${list.length} problem${list.length === 1 ? '' : 's'}` : 'ok');
for (const l of lessons) {
  const found = report.lessons[l.id] ?? [];
  console.log(`  ${l.id.padEnd(32)} ${String(l.minutes).padStart(2)} min (estimated ${estimateMinutes(l).toFixed(1)})  ${statusOf(found)}`);
  for (const p of found) console.log(`      - ${p}`);
}
for (const pr of problems) {
  const found = report.problems[pr.id] ?? [];
  console.log(`  problem ${pr.id.padEnd(24)} tier ${pr.tier}${pr.flagship ? ', flagship' : ''}  ${statusOf(found)}`);
  for (const p of found) console.log(`      - ${p}`);
}
for (const p of report.glossary) console.log(`  - ${p}`);

// Practice banks and cheat sheets: whole-app checks, so only on a full run.
let extra = 0;
if (!only.length) {
  const practice = [...bottleneckItems, ...toolItems, ...practicePool].flatMap((item) => checkPracticeItem(item).map((p) => `${item.id}: ${p}`));
  console.log(
    `  practice: ${bottleneckItems.length} spot-the-bottleneck, ${toolItems.length} pick-the-tool and ${practicePool.length} lesson-quiz items  ${statusOf(practice)}`,
  );
  for (const p of practice) console.log(`      - ${p}`);

  const sheetDir = path.join(root, 'src/content/cheatsheets');
  const sheetIds = readdirSync(sheetDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'list.ts')
    .map((f) => f.replace(/\.ts$/, ''));
  const sheets: CheatSheet[] = [];
  for (const id of sheetIds) {
    const mod = (await import(pathToFileURL(path.join(sheetDir, `${id}.ts`)).href)) as { default?: CheatSheet };
    if (mod.default) sheets.push(mod.default);
  }
  const sheetProblems = [
    ...checkCheatSheetFiles(sheetIds),
    ...sheetIds.filter((id) => !sheets.some((x) => x.id === id)).map((id) => `${id}.ts has no default export`),
    ...sheets.flatMap((sheet) => checkCheatSheet(sheet).map((p) => `${sheet.id}: ${p}`)),
  ];
  console.log(`  cheat sheets: ${sheets.length} of ${cheatSheetList.length} listed  ${statusOf(sheetProblems)}`);
  for (const p of sheetProblems) console.log(`      - ${p}`);
  extra = practice.length + sheetProblems.length;
}

const total = report.total + extra;
if (total > 0) {
  console.error(`\nContent check failed with ${total} problem${total === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Content check passed.');
