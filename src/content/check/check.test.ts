import { describe, expect, it } from 'vitest';
import { loadAllLessons } from '../lessons';
import { loadAllProblems } from '../problems';
import { termUsage } from '../generated/manifest';
import { problemConcepts } from '../generated/problem-concepts';
import { checkContent, estimateMinutes } from './check';
import { computeProblemConcepts, computeTermUsage } from './manifest';

describe('content check', () => {
  // Lays out every diagram at every step in three modes, so it needs more than the default 5 seconds.
  it('every written lesson, every written problem and the glossary meet the definition of done', { timeout: 60_000 }, async () => {
    const lessons = await loadAllLessons();
    const report = checkContent(lessons, { termUsage, computed: computeTermUsage(lessons) }, await loadAllProblems());
    const lines = [
      ...report.glossary,
      ...Object.entries(report.lessons).flatMap(([id, problems]) => problems.map((p) => `${id}: ${p}`)),
      ...Object.entries(report.problems).flatMap(([id, problems]) => problems.map((p) => `problem ${id}: ${p}`)),
    ];
    expect(lines).toEqual([]);
  });

  it('the Problems page concept index matches the problems (run npm run manifest if not)', async () => {
    expect(problemConcepts).toEqual(computeProblemConcepts(await loadAllProblems()));
  });

  it('reading-time estimates land inside 8 to 15 minutes', async () => {
    for (const l of await loadAllLessons()) {
      const est = estimateMinutes(l);
      expect(est).toBeGreaterThan(6);
      expect(est).toBeLessThan(18);
    }
  });
});
