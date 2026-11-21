import { describe, expect, it } from 'vitest';
import { problemList } from '@/content/problem-list';
import { newWorkspace, type Assessment, type MockSession } from '@/state/problems';
import fixture from './__fixtures__/url-shortener';
import {
  finalDesignSpec,
  formatClock,
  formatMinutes,
  stageTitle,
  keepKnown,
  matchesConcept,
  missedWithoutLesson,
  pickRandomProblem,
  problemStatus,
  reviewNext,
  rubricScore,
  scoreSeries,
  statusText,
  workspaceTouched,
} from './logic';

const rubric = fixture.rubric;
const items = rubric.map((r) => r.item);

describe('rubricScore', () => {
  it('adds the weights of the items met', () => {
    expect(rubricScore(rubric, items)).toBe(100);
    expect(rubricScore(rubric, [])).toBe(0);
    // 15 (estimation) + 20 (cache)
    expect(rubricScore(rubric, [items[1]!, items[3]!])).toBe(35);
  });

  it('ignores items that are not in the rubric', () => {
    expect(rubricScore(rubric, ['Something else', items[0]!])).toBe(10);
  });

  it('scales rubrics whose weights do not add up to 100', () => {
    const small = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
    ];
    expect(rubricScore(small, ['b'])).toBe(75);
    expect(rubricScore([], ['a'])).toBe(0);
  });
});

describe('reviewNext', () => {
  it('links missed items to their lessons, heaviest first', () => {
    const links = reviewNext(rubric, [items[3]!]);
    expect(links.map((l) => l.lessonId)).toEqual(['unique-ids', 'back-of-the-envelope', 'http-essentials', 'requirements', 'queues-and-streams']);
    expect(links[0]).toEqual({ lessonId: 'unique-ids', items: [items[2]], weight: 20 });
  });

  it('groups several missed items under one lesson', () => {
    const r = [
      { item: 'a', weight: 10, lessonId: 'caching' },
      { item: 'b', weight: 30, lessonId: 'cdns' },
      { item: 'c', weight: 25, lessonId: 'caching' },
    ];
    expect(reviewNext(r, [])).toEqual([
      { lessonId: 'caching', items: ['a', 'c'], weight: 35 },
      { lessonId: 'cdns', items: ['b'], weight: 30 },
    ]);
  });

  it('lists missed items without a lesson separately', () => {
    expect(missedWithoutLesson(rubric, [])).toEqual([items[6]]);
    expect(missedWithoutLesson(rubric, items)).toEqual([]);
    expect(reviewNext(rubric, items)).toEqual([]);
  });

  it('keeps checked items in rubric order and drops unknown ones', () => {
    expect(keepKnown(rubric, [items[4]!, 'gone', items[0]!])).toEqual([items[0], items[4]]);
  });
});

describe('problemStatus', () => {
  const scored: Assessment[] = [
    { at: '2026-11-01T10:00:00Z', score: 55, checked: [], source: 'practice' },
    { at: '2026-11-02T10:00:00Z', score: 80, checked: [], source: 'mock' },
    { at: '2026-11-03T10:00:00Z', score: 70, checked: [], source: 'practice' },
  ];

  it('is not started without any activity', () => {
    expect(problemStatus(undefined, undefined)).toEqual({ kind: 'not-started' });
    expect(workspaceTouched(newWorkspace())).toBe(false);
    expect(problemStatus(newWorkspace(), [])).toEqual({ kind: 'not-started' });
  });

  it('is attempted once the learner does anything', () => {
    expect(problemStatus({ ...newWorkspace(), notes: 'reads ≫ writes' }, undefined)).toEqual({ kind: 'attempted' });
    expect(problemStatus({ ...newWorkspace(), hintsShown: 1 }, undefined).kind).toBe('attempted');
    expect(problemStatus({ ...newWorkspace(), timer: { elapsedMs: 0, runningSince: 5 } }, undefined).kind).toBe('attempted');
    expect(problemStatus(undefined, undefined, { id: 'm' } as MockSession).kind).toBe('attempted');
  });

  it('reports the best and latest self-scores', () => {
    const s = problemStatus(undefined, scored);
    expect(s).toEqual({ kind: 'scored', best: 80, last: 70, count: 3 });
    expect(statusText(s)).toBe('Best score 80%');
  });
});

describe('pickRandomProblem', () => {
  const pool = problemList.map((p) => ({ id: p.id, tier: p.tier }));

  it('picks within the chosen tier', () => {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      expect(pickRandomProblem(pool, 3, () => r)?.tier).toBe(3);
    }
    expect(pickRandomProblem(pool, 1, () => 0)?.id).toBe('url-shortener');
    expect(pickRandomProblem(pool, 1, () => 0.9999)?.id).toBe('distributed-cache');
  });

  it('picks from every tier when asked for any', () => {
    expect(pickRandomProblem(pool, 'any', () => 0.9999)?.id).toBe('search-engine');
  });

  it('avoids the problem just used when there is a choice', () => {
    expect(pickRandomProblem(pool, 1, () => 0, 'url-shortener')?.id).toBe('pastebin');
    expect(pickRandomProblem([{ id: 'only', tier: 2 }], 2, () => 0, 'only')?.id).toBe('only');
  });

  it('returns nothing when the tier is empty', () => {
    expect(pickRandomProblem(pool.filter((p) => p.tier !== 2), 2, () => 0.5)).toBeUndefined();
  });

  it('stays in range for any random value', () => {
    expect(pickRandomProblem(pool, 1, () => 1)?.id).toBe('distributed-cache');
    expect(pickRandomProblem(pool, 1, () => -0.5)?.id).toBe('url-shortener');
  });
});

describe('formatting', () => {
  it('formats a clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(45 * 60_000)).toBe('45:00');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('formats minutes in words', () => {
    expect(formatMinutes(60_000)).toBe('1 minute');
    expect(formatMinutes(45 * 60_000)).toBe('45 minutes');
  });
});

describe('walkthrough helpers', () => {
  it('numbers a stage unless its title already does', () => {
    expect(stageTitle('It scales', 1)).toBe('Stage 2: It scales');
    expect(stageTitle('v2: It scales', 1)).toBe('v2: It scales');
    expect(stageTitle('Stage 3: It survives failures', 2)).toBe('Stage 3: It survives failures');
    expect(stageTitle('Vertical first', 0)).toBe('Stage 1: Vertical first');
  });

  it('shows the whole final design, without its steps', () => {
    const spec = finalDesignSpec(fixture)!;
    expect(spec.steps).toBeUndefined();
    expect(spec.nodes).toHaveLength(9);
    expect(finalDesignSpec({ ...fixture, stages: [] })).toBeNull();
  });
});

describe('scoreSeries', () => {
  it('orders finished sessions by when they finished', () => {
    const s = (id: string, finishedAt: string, score?: number) => ({ id, finishedAt, score }) as MockSession;
    expect(scoreSeries([s('b', '2026-11-03', 70), s('a', '2026-11-01', 40), s('c', '2026-11-02'), s('d', '2026-11-02', 55)])).toEqual([
      { x: 1, y: 40 },
      { x: 2, y: 55 },
      { x: 3, y: 70 },
    ]);
  });
});

describe('matchesConcept', () => {
  const text = 'Distributed cache. Consistent hashing, eviction, replication, hot keys. Caching. Message queues and event streams';

  it('matches word forms of the same idea', () => {
    expect(matchesConcept('caching', text)).toBe(true);
    expect(matchesConcept('caches', text)).toBe(true);
    expect(matchesConcept('queue', text)).toBe(true);
    expect(matchesConcept('streaming', text)).toBe(true);
    expect(matchesConcept('replica', text)).toBe(true);
  });

  it('needs every word, in any order, and ignores case and punctuation', () => {
    expect(matchesConcept('Hashing, consistent', text)).toBe(true);
    expect(matchesConcept('consistent sharding', text)).toBe(false);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesConcept('', text)).toBe(true);
    expect(matchesConcept('  ,  ', text)).toBe(true);
  });

  it('finds every problem that mentions caching in the bank', () => {
    const hits = problemList.filter((p) => matchesConcept('cache', `${p.title}. ${p.concepts}`)).map((p) => p.id);
    expect(hits).toEqual(expect.arrayContaining(['url-shortener', 'distributed-cache', 'search-autocomplete']));
  });
});
