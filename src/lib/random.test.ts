import { describe, expect, it } from 'vitest';
import { createRng, createZipf, hashString } from './random';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('stays within [0, 1) and is roughly uniform', () => {
    const rng = createRng(7);
    const buckets = new Array(10).fill(0);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 100_000; i++) {
      const v = rng.next();
      min = Math.min(min, v);
      max = Math.max(max, v);
      buckets[Math.floor(v * 10)]++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    }
  });

  it('int stays in range', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});

describe('hashString', () => {
  it('is stable and spreads similar keys apart', () => {
    expect(hashString('profile:42')).toBe(hashString('profile:42'));
    expect(hashString('profile:42')).not.toBe(hashString('profile:43'));
  });
});

describe('createZipf', () => {
  it('makes rank 0 the most likely and sums to 1', () => {
    const z = createZipf(100, 1);
    let total = 0;
    for (let k = 0; k < 100; k++) total += z.probability(k);
    expect(total).toBeCloseTo(1, 6);
    expect(z.probability(0)).toBeGreaterThan(z.probability(1));
    expect(z.probability(1)).toBeGreaterThan(z.probability(50));
  });

  it('is uniform when the exponent is 0', () => {
    const z = createZipf(10, 0);
    for (let k = 0; k < 10; k++) expect(z.probability(k)).toBeCloseTo(0.1, 9);
  });

  it('samples match the expected distribution', () => {
    const z = createZipf(50, 1.1);
    const rng = createRng(11);
    const counts = new Array(50).fill(0);
    const draws = 200_000;
    for (let i = 0; i < draws; i++) counts[z.sample(rng)]++;
    expect(counts[0] / draws).toBeCloseTo(z.probability(0), 2);
    expect(counts[5] / draws).toBeCloseTo(z.probability(5), 2);
  });

  it('reports the share of the top k items', () => {
    const z = createZipf(1000, 1);
    expect(z.topShare(1000)).toBeCloseTo(1, 9);
    expect(z.topShare(50)).toBeGreaterThan(0.5);
    expect(z.topShare(0)).toBe(0);
  });
});
