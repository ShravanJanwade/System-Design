import { describe, expect, it } from 'vitest';
import {
  BloomFilter,
  DEFAULTS,
  MAX_HASHES,
  PROBE_COUNT,
  analyze,
  bestHashes,
  bitsPerItemFor,
  buildFilter,
  checkUnseen,
  expectedFalsePositiveRate,
  optimalHashesExact,
  positionsFor,
  seenPhoto,
  unseenPhoto,
} from './logic';

const photos = (n: number) => Array.from({ length: n }, (_, i) => seenPhoto(i));

describe('BloomFilter', () => {
  it('starts with every bit at 0 and answers definitely not', () => {
    const f = new BloomFilter(128, 3);
    expect(f.setCount).toBe(0);
    const r = f.check('photo-12345');
    expect(r.maybe).toBe(false);
    expect(r.zeros.length).toBeGreaterThan(0);
  });

  it('maps an item to k positions inside the array, the same ones every time', () => {
    const a = positionsFor('photo-12345', 256, 5);
    expect(a).toHaveLength(5);
    expect(a.every((p) => Number.isInteger(p) && p >= 0 && p < 256)).toBe(true);
    expect(positionsFor('photo-12345', 256, 5)).toEqual(a);
    expect(positionsFor('photo-12346', 256, 5)).not.toEqual(a);
  });

  it('sets at most k bits per item', () => {
    const f = new BloomFilter(1024, 7);
    f.add('photo-1');
    expect(f.setCount).toBeGreaterThan(0);
    expect(f.setCount).toBeLessThanOrEqual(7);
    f.add('photo-1');
    expect(f.setCount).toBeLessThanOrEqual(7);
  });

  it('never gives a false negative: every added item checks maybe', () => {
    for (const bits of [32, 256, 1024]) {
      for (const hashes of [1, 3, 7, 12]) {
        const items = photos(150);
        const f = buildFilter(items, bits, hashes);
        expect(items.every((item) => f.check(item).maybe)).toBe(true);
      }
    }
  });

  it('spreads positions evenly across the array', () => {
    const counts = new Array<number>(64).fill(0);
    for (let i = 0; i < 6400; i++) for (const p of positionsFor(unseenPhoto(i), 64, 1)) counts[p]!++;
    // 100 per bucket on average; a fair hash keeps every bucket well inside 60 to 140.
    expect(Math.min(...counts)).toBeGreaterThan(60);
    expect(Math.max(...counts)).toBeLessThan(140);
  });
});

describe('the expected rate', () => {
  it('matches the 1% rule: about 9.6 bits and 7 hash functions per item', () => {
    expect(bitsPerItemFor(0.01)).toBeCloseTo(9.585, 2);
    expect(Math.round(optimalHashesExact(9.585, 1))).toBe(7);
    const n = 1000;
    const rate = expectedFalsePositiveRate(Math.round(9.585 * n), 7, n);
    expect(rate).toBeGreaterThan(0.009);
    expect(rate).toBeLessThan(0.011);
  });

  it('about 4.8 more bits per item cut the rate tenfold', () => {
    expect(bitsPerItemFor(0.001) - bitsPerItemFor(0.01)).toBeCloseTo(4.79, 1);
  });

  it('a filter sized for 1% reaches about 16% at twice its items and 83% at five times', () => {
    const n = 1000;
    const bits = Math.round(9.585 * n);
    expect(expectedFalsePositiveRate(bits, 7, 2 * n)).toBeGreaterThan(0.14);
    expect(expectedFalsePositiveRate(bits, 7, 2 * n)).toBeLessThan(0.18);
    expect(expectedFalsePositiveRate(bits, 7, 5 * n)).toBeGreaterThan(0.8);
    expect(expectedFalsePositiveRate(bits, 7, 5 * n)).toBeLessThan(0.86);
  });

  it('is zero for an empty filter', () => {
    expect(expectedFalsePositiveRate(256, 3, 0)).toBe(0);
  });
});

describe('the observed rate', () => {
  it('stays close to the expected rate', () => {
    const cases: [number, number, number][] = [
      [256, 3, 20],
      [512, 7, 50],
      [128, 4, 30],
      [1024, 5, 150],
      [64, 2, 40],
    ];
    for (const [bits, hashes, n] of cases) {
      const a = analyze(photos(n), bits, hashes);
      expect(Math.abs(a.observed.rate - a.expected)).toBeLessThan(Math.max(0.012, a.expected * 0.25));
    }
  });

  it('checks every probe photo, leaving out any that were added', () => {
    expect(analyze(photos(20), 256, 3).observed.checked).toBe(PROBE_COUNT);
    const typed = Array.from({ length: 10 }, (_, i) => unseenPhoto(i));
    expect(analyze([...photos(20), ...typed], 256, 3).observed.checked).toBe(PROBE_COUNT - 10);
  });

  it('is deterministic', () => {
    expect(analyze(photos(37), 384, 4).observed).toEqual(analyze(photos(37), 384, 4).observed);
  });

  it('counts duplicates once', () => {
    expect(analyze([...photos(10), ...photos(10)], 256, 3).items).toBe(10);
  });

  it('the starting filter (128 bits, 3 hash functions, 20 photos) expects about 5% false positives', () => {
    expect(expectedFalsePositiveRate(DEFAULTS.bits, DEFAULTS.hashes, DEFAULTS.photos)).toBeCloseTo(0.052, 2);
  });
});

describe('challenges', () => {
  it('1: checking unseen photos at the starting settings soon finds a false positive', () => {
    const items = photos(DEFAULTS.photos);
    const f = buildFilter(items, DEFAULTS.bits, DEFAULTS.hashes);
    const added = new Set(items);
    let start = 0;
    let found = 0;
    for (let batch = 0; batch < 10; batch++) {
      const r = checkUnseen(f, added, start, 10);
      expect(r.results).toHaveLength(10);
      expect(r.results.every((c) => !added.has(c.item))).toBe(true);
      found += r.results.filter((c) => c.maybe).length;
      start = r.next;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('2: with 128 bits and 3 hash functions, about 65 photos push the observed rate past 50%', () => {
    let crossing = 0;
    for (let n = 40; n <= 120; n += 2) {
      if (analyze(photos(n), 128, 3).observed.rate >= 0.5) {
        crossing = n;
        break;
      }
    }
    expect(crossing).toBeGreaterThanOrEqual(56);
    expect(crossing).toBeLessThanOrEqual(84);
    // By then about four bits in five are set.
    const fill = analyze(photos(70), 128, 3).fillRatio;
    expect(fill).toBeGreaterThan(0.75);
    expect(fill).toBeLessThan(0.86);
  });

  it('3: with 512 bits and 50 photos, about 7 hash functions is best, and fewer or more do worse', () => {
    expect(optimalHashesExact(512, 50)).toBeCloseTo(7.1, 1);
    expect(bestHashes(512, 50)).toBe(7);
    const a = analyze(photos(50), 512, 7);
    const observed = (k: number) => a.curve[k - 1]!.observed;
    const expected = (k: number) => a.curve[k - 1]!.expected;
    expect(observed(7)).toBeLessThan(observed(1));
    expect(observed(7)).toBeLessThan(observed(2));
    expect(observed(7)).toBeLessThan(observed(MAX_HASHES));
    expect(expected(7)).toBeLessThan(expected(6));
    expect(expected(7)).toBeLessThan(expected(8));
  });

  it('4: 50 photos need 512 bits to get under 1%; 384 bits cannot', () => {
    const lowest = (bits: number) => Math.min(...Array.from({ length: MAX_HASHES }, (_, i) => expectedFalsePositiveRate(bits, i + 1, 50)));
    expect(lowest(384)).toBeGreaterThan(0.02);
    expect(expectedFalsePositiveRate(512, 7, 50)).toBeLessThan(0.008);
    expect(analyze(photos(50), 512, 7).observed.rate).toBeLessThan(0.015);
  });
});
