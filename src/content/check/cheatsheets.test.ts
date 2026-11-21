import { describe, expect, it } from 'vitest';
import type { CheatSheet } from '../types';
import { cheatSheetIds, loadAllCheatSheets } from '../cheatsheets';
import { cheatSheetList } from '../cheatsheets/list';
import { checkCheatSheet, checkCheatSheetFiles } from './cheatsheets';

/** The ten sheets blueprint section 11 asks for. */
const REQUIRED = [
  'latency-numbers',
  'powers-of-two',
  'estimation-formulas',
  'which-database',
  'caching-strategies',
  'consistency-models',
  'rate-limiting',
  'interview-framework',
  'tradeoff-phrases',
  'capacity-ballparks',
];

describe('cheat sheets', () => {
  it('ships the ten sheets, each in its own file and in list.ts', () => {
    expect(cheatSheetList.map((s) => s.id).sort()).toEqual([...REQUIRED].sort());
    expect(checkCheatSheetFiles(cheatSheetIds)).toEqual([]);
  });

  it('every sheet meets the definition of done', async () => {
    const loaded = await loadAllCheatSheets();
    expect(loaded).toHaveLength(REQUIRED.length);
    const lines = loaded.flatMap(({ file, sheet }) => [
      ...(sheet.id === file ? [] : [`${file}.ts: exports a sheet with id "${sheet.id}"; the id must match the file name`]),
      ...checkCheatSheet(sheet).map((p) => `${file}: ${p}`),
    ]);
    expect(lines).toEqual([]);
  });

  it('capacity ballparks is the one sheet marked rough', async () => {
    const loaded = await loadAllCheatSheets();
    expect(loaded.filter(({ sheet }) => sheet.rough).map(({ sheet }) => sheet.id)).toEqual(['capacity-ballparks']);
  });

  it('catches a sheet that breaks the rules', () => {
    const bad: CheatSheet = {
      id: 'not-listed',
      title: 'Not listed',
      summary: 'Two sentences here. That is one too many.',
      lessons: ['no-such-lesson'],
      sections: [
        {
          title: 'Only one',
          blocks: [
            { kind: 'callout', tone: 'intuition', md: 'We leverage the CDN for speed. ✨' },
            { kind: 'table', columns: ['A', 'B'], rows: [['one cell']] },
            { kind: 'simulator', id: 'cache' },
          ],
        },
      ],
    };
    const problems = checkCheatSheet(bad).join('\n');
    expect(problems).toMatch(/not in content\/cheatsheets\/list\.ts/);
    expect(problems).toMatch(/one sentence/);
    expect(problems).toMatch(/unknown lesson "no-such-lesson"/);
    expect(problems).toMatch(/at least two sections/);
    expect(problems).toMatch(/1 cells for 2 columns/);
    expect(problems).toMatch(/does not print/);
    expect(problems).toMatch(/avoid "leverage"/);
    expect(problems).toMatch(/emoji/);
    expect(problems).toMatch(/"CDN"/);
  });
});
