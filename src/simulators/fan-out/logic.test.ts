import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import { createRng } from '@/lib/random';
import { fanOutDiagram } from './diagram';
import {
  DISTRIBUTIONS,
  MODEL,
  SHAPES,
  STRATEGIES,
  THRESHOLDS,
  feedWrites,
  followShareAbove,
  formatSeconds,
  normalizeConfig,
  runFanOut,
  sampleBinomial,
  sampleFollowers,
} from './logic';

describe('the model', () => {
  const base = runFanOut();

  it('is deterministic for a seed', () => {
    expect(runFanOut().byStrategy).toEqual(base.byStrategy);
  });

  it('samples follower counts inside each distribution’s range, with the expected medians', () => {
    for (const d of DISTRIBUTIONS) {
      const shape = SHAPES[d];
      const rng = createRng(1);
      const xs = Array.from({ length: 5000 }, () => sampleFollowers(shape, rng)).sort((a, b) => a - b);
      const [lo, hi] = shape.kind === 'log-uniform' ? [shape.min, shape.max] : [shape.xmin, shape.cap];
      expect(xs[0]).toBeGreaterThanOrEqual(lo);
      expect(xs[xs.length - 1]).toBeLessThanOrEqual(hi);
      const median = xs[2500]!;
      const expected = shape.kind === 'log-uniform' ? Math.sqrt(shape.min * shape.max) : shape.xmin * Math.pow(2, 1 / shape.alpha);
      expect(median / expected).toBeGreaterThan(0.9);
      expect(median / expected).toBeLessThan(1.1);
    }
  });

  it('the share of follows pointing at big accounts shrinks as the threshold rises, and is zero for the even distribution', () => {
    for (const t of THRESHOLDS) expect(followShareAbove(SHAPES.even, t)).toBe(0);
    for (const d of ['skewed', 'very-skewed'] as const) {
      const shares = THRESHOLDS.map((t) => followShareAbove(SHAPES[d], t));
      expect(shares[0]!).toBeGreaterThan(shares[1]!);
      expect(shares[1]!).toBeGreaterThan(shares[2]!);
      expect(shares[2]!).toBeGreaterThan(0);
    }
    for (const t of THRESHOLDS) expect(followShareAbove(SHAPES['very-skewed'], t)).toBeGreaterThan(followShareAbove(SHAPES.skewed, t));
  });

  it('samples binomial counts with the right mean', () => {
    const rng = createRng(3);
    for (const [n, p] of [
      [150, 0.02],
      [1000, 0.27],
    ] as const) {
      const draws = Array.from({ length: 4000 }, () => sampleBinomial(n, p, rng));
      const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
      expect(mean / (n * p)).toBeGreaterThan(0.95);
      expect(mean / (n * p)).toBeLessThan(1.05);
    }
  });

  it('push writes one feed entry per follower, pull none, hybrid only below the threshold', () => {
    expect(feedWrites('push', 300, 100_000)).toBe(300);
    expect(feedWrites('pull', 300, 100_000)).toBe(0);
    expect(feedWrites('hybrid', 300, 100_000)).toBe(300);
    expect(feedWrites('hybrid', 250_000, 100_000)).toBe(0);
    expect(base.byStrategy.pull.writes).toMatchObject({ typical: 0, average: 0, most: 0, mostSeconds: 0 });
  });

  it('a push feed load always reads exactly one list; a pull load reads one per followed account', () => {
    expect(base.byStrategy.push.reads.medianLists).toBe(1);
    expect(base.byStrategy.push.reads.p99Lists).toBe(1);
    expect(base.byStrategy.pull.reads.medianLists).toBe(base.typicalFollowing);
    expect(base.byStrategy.pull.reads.p99Lists).toBe(base.heavyFollowing);
  });

  it('snaps preset values to the offered thresholds', () => {
    expect(normalizeConfig({ threshold: 90_000 }).threshold).toBe(100_000);
    expect(normalizeConfig({ threshold: 3_000_000 }).threshold).toBe(1_000_000);
  });
});

describe('challenge 1: a celebrity under push', () => {
  const r = runFanOut({ celebrity: true });

  it('one post costs 30 million feed writes and about 5 minutes to reach the last follower', () => {
    expect(r.byStrategy.push.writes.most).toBe(30_000_000);
    expect(r.byStrategy.push.writes.mostSeconds).toBe(300);
    expect(formatSeconds(r.byStrategy.push.writes.mostSeconds)).toBe('5 min');
  });

  it('hybrid skips the fan-out for the celebrity at every threshold, and pull never fans out', () => {
    for (const threshold of THRESHOLDS) {
      const h = runFanOut({ celebrity: true, threshold }).byStrategy.hybrid.writes;
      expect(h.celebrity).toBe(0);
      expect(h.most).toBeLessThan(threshold);
    }
    expect(r.byStrategy.pull.writes.celebrity).toBe(0);
  });

  it('about 60% of readers follow the celebrity, and under push their feed loads do not change at all', () => {
    expect(r.celebrityReach).toBeCloseTo(0.6);
    expect(r.byStrategy.push.reads).toEqual(runFanOut().byStrategy.push.reads);
  });
});

describe('challenge 2: pull pays on every read', () => {
  for (const distribution of DISTRIBUTIONS) {
    it(`with the ${distribution} distribution, pull's slowest 1% of loads are far slower than push's`, () => {
      const r = runFanOut({ distribution });
      const push = r.byStrategy.push.reads;
      const pull = r.byStrategy.pull.reads;
      expect(pull.p99Ms).toBeGreaterThan(5 * push.p99Ms);
      expect(pull.medianMs).toBeGreaterThan(4 * push.medianMs);
      expect(pull.p99Lists).toBeGreaterThan(1000);
    });
  }

  it('a load that sends more lookups waits longer, because each round waits for its slowest lookup', () => {
    const r = runFanOut();
    expect(r.byStrategy.pull.reads.p99Ms).toBeGreaterThan(r.byStrategy.pull.reads.medianMs * 3);
  });
});

describe('challenge 3: the even distribution', () => {
  it('without a celebrity, hybrid behaves exactly like push at every threshold', () => {
    for (const threshold of THRESHOLDS) {
      const r = runFanOut({ distribution: 'even', threshold });
      expect(r.pulledShare).toBe(0);
      expect(r.byStrategy.hybrid.writes).toEqual(r.byStrategy.push.writes);
      expect(r.byStrategy.hybrid.reads).toEqual(r.byStrategy.push.reads);
    }
  });

  it('with the celebrity, hybrid differs only for that account: no feed writes, one extra list for its followers', () => {
    const r = runFanOut({ distribution: 'even', celebrity: true });
    expect(r.byStrategy.hybrid.writes.typical).toBe(r.byStrategy.push.writes.typical);
    expect(r.byStrategy.hybrid.writes.celebrity).toBe(0);
    expect(r.byStrategy.hybrid.reads.medianLists).toBe(2);
  });
});

describe('challenge 4: the hybrid threshold trades write cost for read cost', () => {
  const low = runFanOut({ distribution: 'very-skewed', threshold: 10_000 }).byStrategy.hybrid;
  const high = runFanOut({ distribution: 'very-skewed', threshold: 1_000_000 }).byStrategy.hybrid;

  it('a low threshold caps the biggest pushed post below 10,000 writes', () => {
    expect(low.writes.most).toBeLessThan(10_000);
    expect(high.writes.most).toBeGreaterThan(low.writes.most * 3);
  });

  it('but each feed load pulls more lists, and the slowest loads get slower', () => {
    expect(low.reads.medianLists).toBeGreaterThan(2 * high.reads.medianLists);
    expect(low.reads.p99Ms).toBeGreaterThan(high.reads.p99Ms);
  });

  it('either way, hybrid stays far cheaper than push to write and far faster than pull to read', () => {
    const r = runFanOut({ distribution: 'very-skewed', threshold: 100_000 });
    expect(r.byStrategy.hybrid.writes.most).toBeLessThan(r.byStrategy.push.writes.most / 10);
    expect(r.byStrategy.hybrid.reads.p99Ms).toBeLessThan(r.byStrategy.pull.reads.p99Ms / 2);
  });
});

describe('formatSeconds', () => {
  it('reads naturally across scales', () => {
    expect(formatSeconds(0.0011)).toBe('1 ms');
    expect(formatSeconds(0.36)).toBe('360 ms');
    expect(formatSeconds(12)).toBe('12 s');
    expect(formatSeconds(300)).toBe('5 min');
  });
});

describe('fanOutDiagram', () => {
  const combos = DISTRIBUTIONS.flatMap((distribution) =>
    THRESHOLDS.flatMap((threshold) => [false, true].map((celebrity) => ({ distribution, threshold, celebrity }))),
  );

  it('lays out cleanly for every strategy and setting, in all three modes', () => {
    for (const c of combos) {
      const r = runFanOut(c);
      for (const s of STRATEGIES) {
        expect(lintDiagram(fanOutDiagram(r, s)), `${s} ${JSON.stringify(c)}`).toEqual([]);
        expect(phoneScale(fanOutDiagram(r, s)), `${s} ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });

  it('every flow hop and note uses an edge or node that exists, and every step has three steps', () => {
    for (const c of combos.slice(0, 6)) {
      const r = runFanOut(c);
      for (const s of STRATEGIES) {
        const spec = fanOutDiagram(r, s);
        const nodes = new Set(spec.nodes.map((n) => n.id));
        const edges = new Set(spec.edges.map((e) => e.id));
        expect(spec.steps).toHaveLength(3);
        for (const step of spec.steps ?? []) {
          for (const item of step.flow ?? []) {
            for (const hop of Array.isArray(item) ? item : [item]) {
              const id = typeof hop === 'string' ? hop.replace(/^</, '') : hop.edge;
              expect(edges.has(id), `${s}: ${id}`).toBe(true);
            }
          }
          for (const n of step.notes ?? []) expect(nodes.has(n.target) || edges.has(n.target)).toBe(true);
        }
      }
    }
  });

  it('pull has no fan-out workers and no feed cache', () => {
    const ids = fanOutDiagram(runFanOut(), 'pull').nodes.map((n) => n.id);
    expect(ids).not.toContain('fanout');
    expect(ids).not.toContain('cache');
  });

  it('the push story names the celebrity’s 30 million writes', () => {
    const spec = fanOutDiagram(runFanOut({ celebrity: true }), 'push');
    expect(spec.steps?.[1]?.caption).toContain(`${(30_000_000).toLocaleString('en-US')} writes`);
    expect(MODEL.celebrityFollowers / MODEL.fanoutPerSecond).toBe(300);
  });
});
