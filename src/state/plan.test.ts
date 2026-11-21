import { describe, expect, it } from 'vitest';
import { getOutline } from '@/content/modules';
import { getProblem } from '@/content/problem-list';
import { buildPlan, currentWeekIndex, type PlanAnswers, type PlanItem } from './plan';

const lessonIds = (items: PlanItem[]) => items.filter((i) => i.kind === 'lesson').map((i) => (i as { id: string }).id);
const problemIds = (items: PlanItem[]) => items.filter((i) => i.kind === 'problem').map((i) => (i as { id: string }).id);
const all = (a: PlanAnswers) => buildPlan(a).weeks.flatMap((w) => w.items);

describe('buildPlan', () => {
  it('has exactly as many weeks as the timeline', () => {
    for (const weeks of [2, 4, 8, 12] as const) {
      expect(buildPlan({ experience: 'new', weeks, level: 'entry' }).weeks).toHaveLength(weeks);
    }
  });

  it('entry level covers Modules 0 to 3 and Module 8, with Tier 1 and 2 problems only', () => {
    const items = all({ experience: 'new', weeks: 8, level: 'entry' });
    const modules = new Set(lessonIds(items).map((id) => getOutline(id)!.module));
    expect([...modules].sort()).toEqual(['m0', 'm1', 'm2', 'm3', 'm8']);
    expect(problemIds(items).every((id) => getProblem(id)!.tier <= 2)).toBe(true);
  });

  it('senior level adds all of Modules 4 to 7 and Tier 3 problems', () => {
    const items = all({ experience: 'new', weeks: 12, level: 'senior' });
    const modules = new Set(lessonIds(items).map((id) => getOutline(id)!.module));
    expect(modules.size).toBe(9);
    expect(problemIds(items).some((id) => getProblem(id)!.tier === 3)).toBe(true);
  });

  it('mid level sits between entry and senior', () => {
    const count = (level: 'entry' | 'mid' | 'senior') => lessonIds(all({ experience: 'new', weeks: 8, level })).length;
    expect(count('mid')).toBeGreaterThan(count('entry'));
    expect(count('senior')).toBeGreaterThan(count('mid'));
  });

  it('keeps lessons in curriculum order and puts a mock interview in the last week', () => {
    const plan = buildPlan({ experience: 'new', weeks: 4, level: 'entry' });
    const ids = lessonIds(plan.weeks.flatMap((w) => w.items));
    const numbers = ids.map((id) => getOutline(id)!.number.split('.').map(Number));
    for (let i = 1; i < numbers.length; i++) {
      const [am, al] = numbers[i - 1]!;
      const [bm, bl] = numbers[i]!;
      expect(am! < bm! || (am === bm && al! < bl!)).toBe(true);
    }
    expect(plan.weeks.at(-1)!.items.some((i) => i.kind === 'mock')).toBe(true);
  });

  it('spreads the work so no week is wildly heavier than the average', () => {
    for (const weeks of [4, 8, 12] as const) {
      const plan = buildPlan({ experience: 'new', weeks, level: 'senior' });
      const avg = plan.totalMinutes / weeks;
      for (const w of plan.weeks) expect(w.minutes).toBeLessThan(avg * 1.6);
    }
  });

  it('experienced learners skim the opening modules', () => {
    const items = all({ experience: 'experienced', weeks: 8, level: 'mid' });
    const first = items.find((i) => i.kind === 'lesson' && i.id === 'life-of-a-request');
    expect(first && first.kind === 'lesson' && first.skim).toBe(true);
    const cachingItem = items.find((i) => i.kind === 'lesson' && i.id === 'caching');
    expect(cachingItem && cachingItem.kind === 'lesson' && cachingItem.skim).toBe(false);
  });

  it('a shorter timeline schedules fewer problems', () => {
    const short = problemIds(all({ experience: 'new', weeks: 2, level: 'entry' })).length;
    const long = problemIds(all({ experience: 'new', weeks: 12, level: 'entry' })).length;
    expect(short).toBeLessThan(long);
  });
});

describe('currentWeekIndex', () => {
  it('counts whole weeks from the start and stops at the last week', () => {
    expect(currentWeekIndex('2026-11-17', '2026-11-17', 4)).toBe(0);
    expect(currentWeekIndex('2026-11-17', '2026-11-23', 4)).toBe(0);
    expect(currentWeekIndex('2026-11-17', '2026-11-24', 4)).toBe(1);
    expect(currentWeekIndex('2026-11-17', '2027-03-01', 4)).toBe(3);
  });
});
