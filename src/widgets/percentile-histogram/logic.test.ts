import { describe, expect, it } from 'vitest';
import {
  MAX_PERCENTILE,
  MIN_PERCENTILE,
  SAMPLE_COUNT,
  cdfAt,
  formatLatency,
  formatShare,
  gappedLine,
  generateLatencies,
  histogram,
  mean,
  nearestStepIndex,
  pageMean,
  pageQuantile,
  pageShareSlowerThan,
  percentileAt,
  percentileLabel,
  percentileValue,
  quantile,
  slowPageChance,
  stepPercentile,
} from './logic';

const calls = generateLatencies();

describe('quantile maths', () => {
  const small = [10, 20, 30, 40, 50];

  it('interpolates linearly between ranks', () => {
    expect(quantile(small, 0)).toBe(10);
    expect(quantile(small, 0.25)).toBe(20);
    expect(quantile(small, 0.5)).toBe(30);
    expect(quantile(small, 0.1)).toBeCloseTo(14);
    expect(quantile(small, 1)).toBe(50);
    expect(percentileValue(small, 50)).toBe(30);
  });

  it('cdfAt counts values at or below x', () => {
    expect(cdfAt(small, 5)).toBe(0);
    expect(cdfAt(small, 30)).toBeCloseTo(0.6);
    expect(cdfAt(small, 99)).toBe(1);
  });

  it('the mean of a skewed list sits far from its middle', () => {
    expect(mean([100, 100, 100, 100, 3000])).toBe(680);
    expect(quantile([100, 100, 100, 100, 3000], 0.5)).toBe(100);
  });
});

describe('the seeded latencies', () => {
  it('are deterministic, sorted and 10,000 strong', () => {
    const again = generateLatencies();
    expect(again).toEqual(calls);
    expect(calls).toHaveLength(SAMPLE_COUNT);
    for (let i = 1; i < calls.length; i++) expect(calls[i]!).toBeGreaterThanOrEqual(calls[i - 1]!);
  });

  it('most calls take about 100 ms, and 1.2% take a second or more', () => {
    expect(percentileValue(calls, 50)).toBeGreaterThan(95);
    expect(percentileValue(calls, 50)).toBeLessThan(105);
    expect(1 - cdfAt(calls, 999.999)).toBeCloseTo(0.012, 5);
  });

  it('the mean (about 119 ms) looks healthy while p99 is past one second', () => {
    const avg = mean(calls);
    const p95 = percentileValue(calls, 95);
    const p99 = percentileValue(calls, 99);
    expect(avg).toBeGreaterThan(110);
    expect(avg).toBeLessThan(125);
    expect(p95).toBeGreaterThan(160);
    expect(p95).toBeLessThan(180);
    expect(p99).toBeGreaterThan(1000);
    expect(p99 / avg).toBeGreaterThan(8);
    expect(percentileValue(calls, 99.9)).toBeGreaterThan(2000);
  });

  it('there is a cliff between p98 and p99: no calls between about 0.3 and 1 s', () => {
    expect(percentileValue(calls, 98)).toBeLessThan(250);
    expect(cdfAt(calls, 999)).toBeCloseTo(cdfAt(calls, 400), 10);
  });
});

describe('fan-out', () => {
  it('1 − 0.99^N: one call 1%, ten calls about 10%, a hundred calls about 63%', () => {
    expect(slowPageChance(1)).toBeCloseTo(0.01);
    expect(slowPageChance(10)).toBeCloseTo(0.0956, 3);
    expect(slowPageChance(100)).toBeCloseTo(0.634, 3);
  });

  it('matches the story: calls slow one time in a thousand make a ten-call page slow about 1% of the time', () => {
    expect(slowPageChance(10, 99.9)).toBeCloseTo(0.00995, 4);
  });

  it('matches The Tail at Scale: 1-in-10,000 slow calls across 2,000 servers slow almost one request in five', () => {
    expect(slowPageChance(2000, 99.99)).toBeGreaterThan(0.18);
    expect(slowPageChance(2000, 99.99)).toBeLessThan(0.2);
  });

  it('with one call, the page is the call', () => {
    expect(pageQuantile(calls, 0.5, 1)).toBe(quantile(calls, 0.5));
    expect(pageMean(calls, 1)).toBeCloseTo(mean(calls), 6);
  });

  it('with ten calls, the median page is still fast but the slowest 1% of pages take about two seconds', () => {
    expect(pageQuantile(calls, 0.5, 10)).toBeLessThan(200);
    expect(pageQuantile(calls, 0.99, 10)).toBeGreaterThan(2000);
    expect(pageMean(calls, 10)).toBeGreaterThan(mean(calls) * 2);
  });

  it('with about 70 calls or more, half of all pages wait on a timed-out call', () => {
    expect(pageQuantile(calls, 0.5, 50)).toBeLessThan(1000);
    expect(pageQuantile(calls, 0.5, 70)).toBeGreaterThan(1000);
    expect(pageShareSlowerThan(calls, 1000, 100)).toBeGreaterThan(0.6);
  });
});

describe('histogram', () => {
  it('counts every call once', () => {
    const h = histogram(calls);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(SAMPLE_COUNT, 6);
  });

  it('page histograms also sum to the number of pages, and shift toward the tail', () => {
    const one = histogram(calls, 1);
    const ten = histogram(calls, 10);
    expect(ten.reduce((a, b) => a + b, 0)).toBeCloseTo(SAMPLE_COUNT, 6);
    const tail = (h: number[]) => h.slice(50).reduce((a, b) => a + b, 0);
    expect(tail(ten)).toBeGreaterThan(tail(one) * 5);
  });
});

describe('the marker', () => {
  it('maps a latency back to its percentile, within the marker range', () => {
    expect(Math.abs(percentileAt(calls, percentileValue(calls, 90)) - 90)).toBeLessThan(0.05);
    expect(percentileAt(calls, 0)).toBe(MIN_PERCENTILE);
    expect(percentileAt(calls, 99_999)).toBe(MAX_PERCENTILE);
  });

  it('steps through the list and snaps the slider to the nearest step', () => {
    expect(stepPercentile(50, 1)).toBe(75);
    expect(stepPercentile(99, 1)).toBe(99.5);
    expect(stepPercentile(97.3, -1)).toBe(95);
    expect(stepPercentile(99.99, 1)).toBe(MAX_PERCENTILE);
    expect(stepPercentile(1, -1)).toBe(MIN_PERCENTILE);
    expect(nearestStepIndex(99)).toBe(9);
  });

  it('formats labels and values', () => {
    expect(percentileLabel(99.9)).toBe('p99.9');
    expect(percentileLabel(50)).toBe('p50');
    expect(formatLatency(103.4)).toBe('103 ms');
    expect(formatLatency(1075.3)).toBe('1.08 s');
    expect(formatShare(0.0956)).toBe('9.6%');
    expect(formatShare(0.634)).toBe('63%');
    expect(formatShare(0.001)).toBe('0.1%');
  });
});

describe('gappedLine', () => {
  const label = { x0: 50, x1: 120, y0: 22, y1: 36 };
  it('draws one unbroken line when no label is in the way', () => {
    expect(gappedLine(200, 20, 230, [label])).toEqual([[20, 230]]);
  });
  it('leaves a gap around a label the line would cross', () => {
    expect(gappedLine(60, 10, 230, [label])).toEqual([
      [10, 20],
      [38, 230],
    ]);
  });
  it('merges gaps for labels stacked in rows, and starts below a label at the top', () => {
    const below = { x0: 55, x1: 130, y0: 39, y1: 53 };
    expect(gappedLine(60, 20, 230, [below, label])).toEqual([[55, 230]]);
  });
});
