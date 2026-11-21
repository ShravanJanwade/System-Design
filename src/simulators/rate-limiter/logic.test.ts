import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import {
  ALGORITHMS,
  DEFAULT_CONFIG,
  arrivals,
  burstsOf,
  edgeBoundaries,
  fixedWindow,
  leakyBucket,
  limiterDiagram,
  maxInSpan,
  runRateSim,
  slidingWindow,
  tokenBucket,
  type Limiter,
  type RateSimConfig,
} from './logic';

/** Offer `n` requests at time t and count how many are allowed. */
function offerMany(l: Limiter, t: number, n: number): number {
  let ok = 0;
  for (let i = 0; i < n; i++) if (l.offer(t).allowed) ok++;
  return ok;
}

describe('traffic', () => {
  it('is deterministic for a seed', () => {
    expect(arrivals(DEFAULT_CONFIG)).toEqual(arrivals(DEFAULT_CONFIG));
    expect(arrivals({ ...DEFAULT_CONFIG, seed: 7 })).not.toEqual(arrivals(DEFAULT_CONFIG));
  });

  it('sends the steady rate for the whole minute, sorted and in range', () => {
    const list = arrivals({ ...DEFAULT_CONFIG, pattern: 'steady', rate: 8 });
    expect(list).toHaveLength(480);
    for (let i = 1; i < list.length; i++) expect(list[i]!.t).toBeGreaterThanOrEqual(list[i - 1]!.t);
    expect(list[0]!.t).toBeGreaterThanOrEqual(0);
    expect(list[list.length - 1]!.t).toBeLessThan(60);
  });

  it('places a burst every 10 seconds from 5 seconds', () => {
    const c = { ...DEFAULT_CONFIG, rate: 0, burst: 20 };
    expect(burstsOf(c).map((b) => b.start)).toEqual([5, 15, 25, 35, 45, 55]);
    expect(arrivals(c)).toHaveLength(120);
  });

  it('places edge bursts on both sides of window boundaries', () => {
    const c: RateSimConfig = { ...DEFAULT_CONFIG, pattern: 'edges', rate: 0 };
    // bucket 10 and refill 2 give 5-second windows.
    expect(edgeBoundaries(c)).toEqual([10, 30, 50]);
    const b = burstsOf(c);
    expect(b).toHaveLength(6);
    expect(b[0]!.start + 0.2).toBeLessThan(10);
    expect(b[1]!.start).toBeGreaterThan(10);
    expect(b[1]!.start + 0.25).toBeLessThan(10.5);
  });
});

describe('limiters', () => {
  it('token bucket: a full bucket allows one burst, then refills at the refill rate up to its size', () => {
    const l = tokenBucket(10, 2);
    expect(offerMany(l, 0, 25)).toBe(10);
    expect(l.level(1)).toBeCloseTo(2);
    expect(offerMany(l, 2, 25)).toBe(4);
    expect(l.level(100)).toBe(10);
  });

  it('leaky bucket: queues up to its size and lets requests out at a steady pace', () => {
    const l = leakyBucket(10, 2);
    const sent: number[] = [];
    for (let i = 0; i < 25; i++) {
      const v = l.offer(0);
      if (v.allowed) sent.push(v.sentAt!);
    }
    // One goes straight through, ten wait in line.
    expect(sent).toHaveLength(11);
    expect(sent).toEqual(Array.from({ length: 11 }, (_, i) => i * 0.5));
    expect(l.level(0)).toBe(10);
    expect(l.level(2.4)).toBe(6);
    expect(l.level(5)).toBe(0);
  });

  it('fixed window: twice the limit fits across a boundary', () => {
    const l = fixedWindow(10, 2);
    expect(offerMany(l, 4.8, 15)).toBe(10);
    expect(offerMany(l, 5.1, 15)).toBe(10);
    expect(l.level(5.2)).toBe(10);
    expect(l.level(10)).toBe(0);
  });

  it('sliding window: counts back a full window from every request', () => {
    const l = slidingWindow(10, 2);
    expect(offerMany(l, 4.8, 15)).toBe(10);
    expect(offerMany(l, 5.1, 15)).toBe(0);
    expect(l.level(9.7)).toBe(10);
    expect(offerMany(l, 9.81, 15)).toBe(10);
  });

  it('maxInSpan counts the most times in any half-open span', () => {
    expect(maxInSpan([0, 0.5, 1, 1.5], 1)).toBe(2);
    expect(maxInSpan([0, 0.1, 0.2, 5], 1)).toBe(3);
    expect(maxInSpan([], 1)).toBe(0);
  });
});

describe('runRateSim', () => {
  it('accounts for every request and samples every 0.1 seconds', () => {
    for (const algorithm of ALGORITHMS) {
      const r = runRateSim({ algorithm });
      expect(r.totals.allowed + r.totals.rejected).toBe(r.totals.sent);
      expect(r.samples).toHaveLength(601);
      expect(r.samples[600]!.t).toBe(60);
    }
  });

  it('never lets more than the bucket size wait in the leaky bucket', () => {
    const r = runRateSim({ algorithm: 'leaky-bucket', burst: 60 });
    expect(r.peakLevel).toBeLessThanOrEqual(10);
  });

  it('runs fast enough to recompute on every slider move', () => {
    const start = performance.now();
    for (const algorithm of ALGORITHMS) runRateSim({ algorithm, rate: 20, burst: 60, pattern: 'edges', bucket: 2, refill: 10 });
    expect(performance.now() - start).toBeLessThan(400);
  });
});

describe('challenge: a burst bigger than the token bucket', () => {
  it('lets exactly a bucketful of each burst through when the bucket has refilled', () => {
    const r = runRateSim({ algorithm: 'token-bucket', pattern: 'bursts', rate: 0, burst: 25 });
    expect(r.bursts.map((b) => b.allowed)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('lets about a bucketful through with the starting steady traffic too', () => {
    const r = runRateSim({ algorithm: 'token-bucket', pattern: 'bursts', burst: 25 });
    for (const b of r.bursts) {
      expect(b.allowed).toBeGreaterThanOrEqual(9);
      expect(b.allowed).toBeLessThanOrEqual(10);
    }
  });

  it('refills an empty bucket in bucket ÷ refill seconds', () => {
    const l = tokenBucket(10, 2);
    offerMany(l, 0, 10);
    expect(l.level(4.9)).toBeLessThan(10);
    expect(l.level(5)).toBe(10);
  });
});

describe('challenge: bursts at the window edges', () => {
  const edges = { pattern: 'edges' as const, rate: 0, burst: 20 };

  it('lets twice the limit through a fixed window in under a second', () => {
    const r = runRateSim({ algorithm: 'fixed-window', ...edges });
    expect(r.busiestSecond).toBe(20);
    expect(r.busiestWindow).toBe(20);
  });

  it('still lets more than the limit through with the starting steady traffic', () => {
    const r = runRateSim({ algorithm: 'fixed-window', pattern: 'edges', burst: 20 });
    expect(r.busiestSecond).toBeGreaterThan(10);
    expect(r.busiestSecond).toBeLessThanOrEqual(20);
  });

  it('rejects the second burst with a sliding window', () => {
    const r = runRateSim({ algorithm: 'sliding-window', ...edges });
    expect(r.busiestWindow).toBeLessThanOrEqual(10);
    const second = r.bursts.filter((_, i) => i % 2 === 1);
    expect(second.every((b) => b.allowed === 0)).toBe(true);
  });

  it('allows at most a bucket plus one second of refill with a token bucket', () => {
    const r = runRateSim({ algorithm: 'token-bucket', ...edges });
    expect(r.busiestSecond).toBeLessThanOrEqual(12);
  });
});

describe('challenge: the leaky bucket smooths bursts', () => {
  for (const refill of [2, 3]) {
    it(`never passes more than the leak rate in a second (leak rate ${refill})`, () => {
      const r = runRateSim({ algorithm: 'leaky-bucket', pattern: 'bursts', burst: 20, refill });
      expect(r.busiestSecond).toBeLessThanOrEqual(refill);
    });
  }

  it('makes the last request in a full bucket wait about bucket ÷ leak rate', () => {
    const r = runRateSim({ algorithm: 'leaky-bucket', pattern: 'bursts', burst: 20 });
    expect(r.maxWaitSec).toBeLessThanOrEqual(5 + 1e-6);
    expect(r.maxWaitSec).toBeGreaterThan(4.5);
    expect(r.bursts.every((b) => b.allowed < b.size)).toBe(true);
  });

  it('makes no one wait with the other algorithms', () => {
    for (const algorithm of ['token-bucket', 'fixed-window', 'sliding-window'] as const) expect(runRateSim({ algorithm }).maxWaitSec).toBe(0);
  });
});

describe('challenge: steady traffic far above the limit', () => {
  for (const algorithm of ALGORITHMS) {
    it(`settles at the refill rate with ${algorithm}`, () => {
      const r = runRateSim({ algorithm, pattern: 'steady', rate: 8 });
      expect(Math.abs(r.totals.allowed - 2 * 60)).toBeLessThanOrEqual(11);
      const rejectedShare = r.totals.rejected / r.totals.sent;
      expect(rejectedShare).toBeGreaterThan(0.7);
      expect(rejectedShare).toBeLessThan(0.76);
    });
  }

  it('rejects nothing when the client stays under the limit', () => {
    for (const algorithm of ALGORITHMS) expect(runRateSim({ algorithm, pattern: 'steady', rate: 1 }).totals.rejected).toBe(0);
  });
});

describe('limiterDiagram', () => {
  it('lays out cleanly in every mode', () => {
    const combos: Partial<RateSimConfig>[] = [
      {},
      { algorithm: 'leaky-bucket', pattern: 'steady', rate: 20 },
      { algorithm: 'fixed-window', pattern: 'edges', burst: 60, bucket: 40 },
      { algorithm: 'sliding-window', pattern: 'bursts', burst: 0, rate: 0 },
    ];
    for (const partial of combos) {
      const c = { ...DEFAULT_CONFIG, ...partial };
      const spec = limiterDiagram(c, runRateSim(c));
      for (const mode of ['wide', 'compact', 'narrow'] as const) expect(lintDiagram(spec, [mode])).toEqual([]);
      expect(phoneScale(spec)).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
    }
  });
});
