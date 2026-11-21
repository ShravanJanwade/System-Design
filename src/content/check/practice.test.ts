import { describe, expect, it } from 'vitest';
import type { PracticeItem } from '../types';
import { loadAllLessons } from '../lessons';
import { practicePool } from '../generated/practice-pool';
import { bottleneckItems, toolItems } from '../practice';
import { checkPracticeItem } from './practice';

const banks: [name: string, items: PracticeItem[]][] = [
  ['spot-the-bottleneck', bottleneckItems],
  ['pick-the-tool', toolItems],
  ['lesson quiz pool', practicePool],
];

describe('practice banks', () => {
  it('hold at least 15 bottleneck scenarios and 20 pick-the-tool scenarios', () => {
    expect(bottleneckItems.length).toBeGreaterThanOrEqual(15);
    expect(toolItems.length).toBeGreaterThanOrEqual(20);
  });

  // Lays out every bottleneck diagram in three modes, so it needs more than the default 5 seconds.
  for (const [name, items] of banks) {
    it(`every item in the ${name} bank meets the checks`, { timeout: 60_000 }, () => {
      const lines = items.flatMap((item) =>
        checkPracticeItem(item).map((p) => `${item.id}: ${p}`),
      );
      expect(lines).toEqual([]);
    });
  }

  it('ids are unique across all three banks', () => {
    const ids = banks.flatMap(([, items]) => items.map((item) => item.id));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('flowchart links point at lessons that have a decision flowchart', { timeout: 60_000 }, async () => {
    const lessons = new Map((await loadAllLessons()).map((l) => [l.id, l]));
    const broken = toolItems
      .filter((item) => item.flowchartLessonId)
      .filter((item) => {
        const lesson = lessons.get(item.flowchartLessonId!);
        return !lesson || ![...lesson.body, ...(lesson.tryIt ?? []), ...(lesson.deeper ?? [])].some((b) => b.kind === 'decision');
      })
      .map((item) => `${item.id} -> ${item.flowchartLessonId}`);
    expect(broken).toEqual([]);
  });

  it('flags a broken item', () => {
    const broken: PracticeItem = {
      id: 'Bad_ID',
      title: 'A Title In Title Case.',
      lessonId: 'no-such-lesson',
      flowchartLessonId: 'caching',
      question: {
        kind: 'single',
        prompt: 'Pick a CDN. One. Two. Three. Four? This is a robust choice.',
        options: [
          { text: 'A', correct: true, why: 'Because.' },
          { text: 'B', correct: true, why: '' },
        ],
      },
    };
    const problems = checkPracticeItem(broken, 'bottleneck').join('\n');
    for (const expected of ['kebab-case', 'sentence case', 'ends without punctuation', 'no-such-lesson', 'only pick-the-tool items', 'cannot be a "single"', 'at least three options', 'exactly one correct', 'no explanation', 'does not spell out "CDN"', 'the limit is four', 'avoid "robust"']) {
      expect(problems).toContain(expected);
    }
  });

  it('pick-the-tool answers are not always in the same position', () => {
    const positions = new Set(
      toolItems.flatMap((item) => (item.question.kind === 'single' ? [item.question.options.findIndex((o) => o.correct)] : [])),
    );
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
});
