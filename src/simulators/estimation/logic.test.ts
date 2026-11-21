import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import {
  ONE_SERVER_MEMORY,
  SNAPGRAM_INPUTS,
  STEPS,
  challengeStatus,
  estimate,
  estimateDiagram,
  explain,
  formatBits,
  formatBytes,
  formatExact,
  formatRough,
  inputsFromPreset,
  powerOfTen,
  roughly,
  withValue,
  type EstimationInputs,
  type Numbers,
} from './logic';

const S = SNAPGRAM_INPUTS;
const base = estimate(S);
const KEYS = Object.keys(base.exact) as (keyof Numbers)[];

describe('roughly', () => {
  it('keeps one significant figure, or two when the first digit is 1', () => {
    expect(roughly(99_009_901)).toBe(1e8);
    expect(roughly(990_099)).toBe(1e6);
    expect(roughly(1_146)).toBe(1_100);
    expect(roughly(3.65e14)).toBe(4e14);
    expect(roughly(1.5)).toBe(1.5);
    expect(roughly(250)).toBe(300);
    expect(roughly(0)).toBe(0);
  });
});

describe('Snapgram at one million daily users (the lesson’s worked example)', () => {
  it('rounds the way the lesson does', () => {
    const r = base.rough;
    expect(r.actionsPerDay).toBe(1e8);
    expect(r.readsPerDay).toBe(1e8);
    expect(r.writesPerDay).toBe(1e6);
    expect(r.avgReads).toBe(1_000);
    expect(r.avgWrites).toBe(10);
    expect(r.peakReads).toBe(2_000);
    expect(r.peakWrites).toBe(20);
    expect(r.storagePerDay).toBe(1e12);
    expect(r.storagePerYear).toBe(4e14);
    expect(r.storageTotal).toBe(2e15);
    expect(r.inAvg).toBe(1e7);
    expect(r.outAvg).toBe(1e9);
    expect(r.outPeak).toBe(2e9);
    expect(r.cacheBytes).toBe(2e13);
  });

  it('matches the exact numbers the lesson quotes', () => {
    const x = base.exact;
    expect(formatExact(x.avgReads)).toBe('1,146');
    expect(formatExact(x.avgWrites)).toBe('11.5');
    expect(formatBytes(x.storagePerDay)).toBe('990 GB');
    expect(formatBytes(x.storagePerYear)).toBe('361 TB');
    expect(formatBytes(x.storageTotal)).toBe('1.81 PB');
    expect(formatBytes(x.cacheBytes)).toBe('19.8 TB');
  });

  it('writes the rough math the way the lesson does', () => {
    const reads = explain(base).find((m) => m.id === 'avgReads')!;
    expect(reads.roughMath[0]).toBe('1 million users × 100 actions = 100 million actions a day (10⁸)');
    expect(reads.roughMath[2]).toBe('A day is about 100,000 seconds (10⁵): 100 million ÷ 100,000 = 1,000 reads per second');
    expect(reads.exactMath[2]).toBe('A day is 86,400 seconds: 99,009,901 ÷ 86,400 = 1,146 reads per second');
    const total = explain(base).find((m) => m.id === 'storageTotal')!;
    expect(total.roughMath).toEqual(['1 TB a day × 365 days ≈ 400 TB a year', '400 TB × 5 years = 2 PB']);
  });
});

describe('rough estimates stay within 2× of the exact answer', () => {
  it('for every combination of the control steps', () => {
    let worst = 1;
    for (const dau of STEPS.dau)
      for (const actionsPerUser of STEPS.actionsPerUser)
        for (const readsPerWrite of STEPS.readsPerWrite)
          for (const objectBytes of [100, 1e3, 2e5, 5e5, 1e6, 2e6])
            for (const peakFactor of [1, 1.5, 3])
              for (const retentionYears of [1, 3, 5]) {
                const e = estimate({ dau, actionsPerUser, readsPerWrite, objectBytes, peakFactor, retentionYears });
                for (const k of KEYS) {
                  const ratio = e.rough[k] / e.exact[k];
                  worst = Math.max(worst, ratio, 1 / ratio);
                }
              }
    expect(worst).toBeLessThan(2);
  });
});

describe('the challenges’ claims', () => {
  it('ten times the users gives ten times every result (challenge 1)', () => {
    const big = estimate({ ...S, dau: S.dau * 10 });
    for (const k of KEYS) expect(big.exact[k] / base.exact[k]).toBeCloseTo(10, 9);
  });

  it('doubling the object size doubles storage, bandwidth and cache, but not requests (challenge 2)', () => {
    const big = estimate({ ...S, objectBytes: S.objectBytes * 2 });
    for (const k of ['avgReads', 'avgWrites', 'peakReads', 'peakWrites', 'cacheObjects'] as const) expect(big.exact[k]).toBeCloseTo(base.exact[k], 9);
    for (const k of ['storagePerDay', 'storageTotal', 'inAvg', 'outAvg', 'cacheBytes'] as const) expect(big.exact[k] / base.exact[k]).toBeCloseTo(2, 9);
  });

  it('one read per write makes storage about 50 times bigger at the same request rate (challenge 3)', () => {
    const even = estimate({ ...S, readsPerWrite: 1 });
    expect(even.exact.storagePerDay / base.exact.storagePerDay).toBeCloseTo(50.5, 6);
    expect(even.exact.avgRps).toBeCloseTo(base.exact.avgRps, 9);
  });

  it('caching 1 KB records instead of 1 MB photos fits one server’s memory (challenge 4)', () => {
    const small = estimate({ ...S, objectBytes: 1_000 });
    expect(small.exact.cacheBytes).toBeLessThan(ONE_SERVER_MEMORY);
    expect(formatBytes(small.rough.cacheBytes)).toBe('20 GB');
    expect(base.exact.cacheBytes).toBeGreaterThan(ONE_SERVER_MEMORY * 100);
  });

  it('marks each challenge only when its settings are reached', () => {
    expect(Object.values(challengeStatus(S, S)).some(Boolean)).toBe(false);
    expect(challengeStatus({ ...S, dau: 1e7 }, S).growth).toBe(true);
    expect(challengeStatus({ ...S, objectBytes: 2e6 }, S).size).toBe(true);
    expect(challengeStatus({ ...S, readsPerWrite: 1 }, S).ratio).toBe(true);
    expect(challengeStatus({ ...S, objectBytes: 1e3 }, S)['small-cache']).toBe(true);
  });
});

describe('formatting', () => {
  it('formats numbers, sizes and rates', () => {
    expect(formatRough(1e8)).toBe('100 million');
    expect(formatRough(2_000)).toBe('2,000');
    expect(formatRough(1.5)).toBe('1.5');
    expect(formatExact(990_099.0099)).toBe('990,099');
    expect(formatExact(0.991)).toBe('0.99');
    expect(formatBytes(100)).toBe('100 bytes');
    expect(formatBytes(2e15)).toBe('2 PB');
    expect(formatBits(1e9)).toBe('8 Gbps');
    expect(formatBits(2e7)).toBe('160 Mbps');
    expect(powerOfTen(1e8)).toBe('10⁸');
    expect(powerOfTen(2e6)).toBe('2 × 10⁶');
    expect(powerOfTen(1_500)).toBe('');
  });

  it('never prints NaN, Infinity or undefined in the worked math', () => {
    const samples: EstimationInputs[] = [
      S,
      { dau: 1e4, actionsPerUser: 1, readsPerWrite: 1, objectBytes: 100, peakFactor: 1, retentionYears: 1 },
      { dau: 1e9, actionsPerUser: 500, readsPerWrite: 1000, objectBytes: 1e8, peakFactor: 10, retentionYears: 10 },
      { dau: 3e6, actionsPerUser: 7, readsPerWrite: 3, objectBytes: 250_000, peakFactor: 1.5, retentionYears: 2 },
    ];
    for (const inputs of samples) {
      const metrics = explain(estimate(inputs));
      expect(metrics).toHaveLength(9);
      for (const m of metrics) {
        expect(m.roughMath.length).toBeGreaterThan(0);
        expect(m.exactMath.length).toBeGreaterThan(0);
        const text = [m.label, m.rough, m.exact, m.note ?? '', ...m.roughMath, ...m.exactMath].join(' ');
        expect(text).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});

describe('presets and steps', () => {
  it('reads positive numbers from a preset and ignores the rest', () => {
    const i = inputsFromPreset({ dau: 5e6, objectBytes: 1_000, actionsPerUser: -3, readsPerWrite: 'lots', peakFactor: 0.5 });
    expect(i).toEqual({ ...S, dau: 5e6, objectBytes: 1_000, peakFactor: 1 });
    expect(inputsFromPreset(undefined)).toEqual(S);
  });

  it('inserts a preset value into a step list in order', () => {
    expect(withValue([1, 2, 5], 3)).toEqual([1, 2, 3, 5]);
    expect(withValue([1, 2, 5], 2)).toEqual([1, 2, 5]);
  });
});

describe('estimateDiagram', () => {
  it('lays out cleanly for small, typical and huge systems', () => {
    const cases: EstimationInputs[] = [
      S,
      { dau: 1e4, actionsPerUser: 1, readsPerWrite: 1, objectBytes: 100, peakFactor: 1, retentionYears: 1 },
      { dau: 1e9, actionsPerUser: 500, readsPerWrite: 1000, objectBytes: 1e8, peakFactor: 10, retentionYears: 10 },
    ];
    for (const inputs of cases) {
      for (const mode of ['wide', 'compact', 'narrow'] as const) {
        expect(lintDiagram(estimateDiagram(estimate(inputs)), [mode])).toEqual([]);
        expect(phoneScale(estimateDiagram(estimate(inputs)))).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });
});
