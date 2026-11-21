import { describe, expect, it } from 'vitest';
import {
  DEPENDENCIES,
  HEALTHY,
  RETRY_BACKOFF_MS,
  SPANS,
  axisTicks,
  buildTrace,
  describeTrace,
  formatMs,
  isDependencyId,
  isFaultKind,
  rowStatus,
  rowSummary,
  topCriticalSelf,
  unionLength,
  type DependencyId,
  type Trace,
} from './logic';

const healthy = buildTrace();
const row = (t: Trace, key: string) => t.rows.find((r) => r.key === key)!;
const slow = (target: DependencyId, ms: number) => buildTrace({ kind: 'slow', target, ms });
const retry = (target: DependencyId, ms: number) => buildTrace({ kind: 'retry', target, ms });

describe('the healthy feed request', () => {
  it('takes 104 ms in total, the length of the root span', () => {
    expect(healthy.total).toBe(104);
    expect(row(healthy, 'gateway').duration).toBe(104);
    expect(buildTrace(HEALTHY).total).toBe(104);
  });

  it('runs posts and likes in parallel after the feed cache, and suggestions from the start', () => {
    expect(row(healthy, 'timeline')).toMatchObject({ start: 8, end: 12 });
    expect(row(healthy, 'posts')).toMatchObject({ start: 13, end: 38 });
    expect(row(healthy, 'likes')).toMatchObject({ start: 13, end: 23 });
    expect(row(healthy, 'suggestions')).toMatchObject({ start: 8, end: 68 });
    expect(row(healthy, 'ranking')).toMatchObject({ start: 39, end: 93 });
    expect(row(healthy, 'features')).toMatchObject({ start: 41, end: 53 });
  });

  it('has a critical path through the cache, the posts query and ranking', () => {
    expect(healthy.critical).toEqual(['gateway', 'auth', 'feed', 'timeline', 'posts', 'ranking', 'features']);
    expect(row(healthy, 'likes').critical).toBe(false);
    expect(row(healthy, 'suggestions').critical).toBe(false);
  });

  it('gives the calls off the critical path some slack', () => {
    expect(row(healthy, 'likes').slack).toBe(15);
    expect(row(healthy, 'suggestions').slack).toBe(25);
    for (const id of healthy.critical) expect(row(healthy, id).slack).toBe(0);
  });

  it('computes own time as the time not covered by child calls', () => {
    expect(row(healthy, 'gateway').self).toBe(6);
    expect(row(healthy, 'feed').self).toBe(10);
    expect(row(healthy, 'ranking').self).toBe(42);
    expect(row(healthy, 'suggestions').self).toBe(60);
  });

  it('points at ranking as the biggest own time on the critical path, not the longer suggestions call', () => {
    expect(topCriticalSelf(healthy).span).toBe('ranking');
    expect(row(healthy, 'suggestions').duration).toBeGreaterThan(row(healthy, 'ranking').self);
  });

  it('lists parents before children, ordered by start time', () => {
    expect(healthy.rows.map((r) => r.key)).toEqual(['gateway', 'auth', 'feed', 'timeline', 'suggestions', 'posts', 'likes', 'ranking', 'features']);
    expect(healthy.rows.map((r) => r.depth)).toEqual([0, 1, 1, 2, 2, 2, 2, 2, 3]);
  });
});

describe('slowing one call down', () => {
  it('changes nothing while the extra delay fits in the slack', () => {
    expect(slow('suggestions', 20).total).toBe(104);
    expect(slow('suggestions', 25).total).toBe(104);
    expect(slow('likes', 15).total).toBe(104);
  });

  it('adds only the delay beyond the slack', () => {
    expect(slow('suggestions', 26).total).toBe(105);
    expect(slow('suggestions', 200).total).toBe(279);
    expect(slow('likes', 50).total).toBe(139);
  });

  it('moves the critical path when a parallel call becomes the slowest', () => {
    const t = slow('suggestions', 200);
    expect(t.critical).toEqual(['gateway', 'auth', 'feed', 'suggestions']);
    expect(row(t, 'posts').critical).toBe(false);
    expect(row(t, 'ranking').slack).toBe(175);
    expect(topCriticalSelf(t).span).toBe('suggestions');
  });

  it('adds every millisecond of delay on the critical path to the total', () => {
    for (const ms of [5, 50, 400]) {
      expect(slow('posts', ms).total).toBe(104 + ms);
      expect(slow('features', ms).total).toBe(104 + ms);
    }
  });

  it('stretches the parents of a slow nested call without changing their own time', () => {
    const t = slow('features', 100);
    expect(row(t, 'features').self).toBe(112);
    expect(row(t, 'ranking').duration).toBe(154);
    expect(row(t, 'ranking').self).toBe(42);
    expect(row(t, 'feed').self).toBe(10);
    expect(row(t, 'features').slowedBy).toBe(100);
  });
});

describe('a lost reply and a retry', () => {
  it('splits the call into a timed-out attempt and a retry after the backoff', () => {
    const t = retry('posts', 200);
    const first = row(t, 'posts:1');
    const second = row(t, 'posts');
    expect(first).toMatchObject({ status: 'timed-out', attempt: 1, start: 13, duration: 200 });
    expect(second).toMatchObject({ status: 'ok', attempt: 2, start: 13 + 200 + RETRY_BACKOFF_MS, duration: 25 });
  });

  it('costs the timeout plus the backoff on the critical path', () => {
    expect(retry('posts', 200).total).toBe(104 + 200 + RETRY_BACKOFF_MS);
    expect(retry('features', 200).total).toBe(314);
  });

  it('costs less with a shorter timeout', () => {
    expect(retry('posts', 100).total).toBe(214);
    expect(retry('posts', 100).total).toBeLessThan(retry('posts', 300).total);
  });

  it('is partly absorbed by slack off the critical path', () => {
    expect(retry('suggestions', 100).total).toBe(104 + 100 + RETRY_BACKOFF_MS - 25);
    expect(retry('likes', 200).total).toBe(104 + 200 + RETRY_BACKOFF_MS - 15);
  });

  it('counts the backoff pause as the caller’s own time', () => {
    expect(row(retry('features', 200), 'ranking').self).toBe(42 + RETRY_BACKOFF_MS);
  });

  it('keeps attempts next to each other and lists the critical span once', () => {
    const t = retry('posts', 200);
    const keys = t.rows.map((r) => r.key);
    expect(keys.indexOf('posts')).toBe(keys.indexOf('posts:1') + 1);
    expect(t.critical.filter((id) => id === 'posts')).toHaveLength(1);
  });
});

describe('every trace the widget can build', () => {
  const faults = DEPENDENCIES.flatMap((d) => [slow(d.id, 0), slow(d.id, 150), slow(d.id, 400), retry(d.id, 80), retry(d.id, 400)]);

  it('keeps every span inside its parent and never negative', () => {
    for (const t of [healthy, ...faults]) {
      for (const r of t.rows) {
        expect(r.duration).toBeGreaterThanOrEqual(0);
        expect(r.self).toBeGreaterThanOrEqual(0);
        expect(r.self).toBeLessThanOrEqual(r.duration);
        if (r.parent) {
          const p = row(t, r.parent);
          expect(r.start).toBeGreaterThanOrEqual(p.start);
          expect(r.end).toBeLessThanOrEqual(p.end);
        }
      }
    }
  });

  it('agrees with the slack: growing a span by its slack keeps the total, one more millisecond does not', () => {
    for (const d of DEPENDENCIES) {
      const s = row(healthy, d.id).slack;
      expect(slow(d.id, s).total).toBe(healthy.total);
      expect(slow(d.id, s + 1).total).toBe(healthy.total + 1);
    }
  });

  it('is deterministic', () => {
    expect(buildTrace({ kind: 'retry', target: 'likes', ms: 120 })).toEqual(buildTrace({ kind: 'retry', target: 'likes', ms: 120 }));
  });

  it('has a root and a parent for every other span', () => {
    expect(SPANS.filter((s) => s.parent === null)).toHaveLength(1);
    for (const s of SPANS) if (s.parent) expect(SPANS.some((p) => p.id === s.parent)).toBe(true);
  });
});

describe('helpers', () => {
  it('measures the union of intervals', () => {
    expect(unionLength([])).toBe(0);
    expect(
      unionLength([
        [0, 10],
        [5, 20],
        [30, 40],
      ]),
    ).toBe(30);
  });

  it('builds a round axis that covers the total', () => {
    expect(axisTicks(104)).toEqual({ domain: 120, ticks: [0, 20, 40, 60, 80, 100, 120] });
    for (const ms of [1, 104, 279, 514, 2000]) {
      const { domain, ticks } = axisTicks(ms);
      expect(domain).toBeGreaterThanOrEqual(ms);
      expect(ticks.length).toBeLessThanOrEqual(7);
      expect(ticks.at(-1)).toBe(domain);
    }
  });

  it('formats and validates', () => {
    expect(formatMs(104.4)).toBe('104 ms');
    expect(isDependencyId('posts')).toBe(true);
    expect(isDependencyId('gateway')).toBe(false);
    expect(isFaultKind('retry')).toBe(true);
    expect(isFaultKind(3)).toBe(false);
  });

  it('describes spans and the trace in words', () => {
    expect(rowStatus(row(healthy, 'likes'))).toContain('15 ms longer');
    expect(rowStatus(row(healthy, 'posts'))).toContain('On the critical path');
    expect(rowStatus(row(retry('posts', 200), 'posts:1'))).toContain('200 ms');
    expect(rowSummary(row(healthy, 'suggestions'))).toContain('25 ms of slack');
    expect(describeTrace(healthy)).toContain('104 ms in total');
    expect(describeTrace(healthy)).toContain('Critical path: API gateway, Session store, Feed service');
  });
});
