/**
 * Percentile histogram: 10,000 latencies of one backend call, from a seeded
 * distribution with a long tail, plus the maths of fan-out.
 *
 * Most calls take about 100 ms (a log-normal hump). One call in a hundred hits a
 * one-second timeout and is retried, so it takes a second plus a normal call; two
 * in a thousand time out twice. The counts are fixed rather than random, so the
 * 99th percentile always lands among the retried calls.
 *
 * A page that makes N calls in parallel waits for the slowest one. If one call's
 * latency has distribution F, the page's has F^N: that is all the fan-out maths.
 */
import { createRng } from '@/lib/random';

export const SAMPLE_COUNT = 10_000;
export const SEED = 20_260_222;
export const BODY_MEDIAN_MS = 100;
export const BODY_SIGMA = 0.3;
export const TIMEOUT_MS = 1000;
/** Share of calls that time out once and are retried. */
export const RETRY_SHARE = 0.01;
/** Share of calls that time out twice. */
export const DOUBLE_SHARE = 0.002;
/** Histogram range and bar width. */
export const MAX_MS = 2400;
export const BIN_MS = 20;
export const MAX_CALLS = 100;

/** Percentiles the marker steps through with the keyboard and the slider. */
export const PERCENTILE_STEPS = [1, 5, 10, 25, 50, 75, 90, 95, 98, 99, 99.5, 99.9, 99.99] as const;
export const MIN_PERCENTILE = 1;
export const MAX_PERCENTILE = 99.99;

/** 10,000 call latencies in milliseconds, sorted from fastest to slowest. Same seed, same values. */
export function generateLatencies(seed = SEED, n = SAMPLE_COUNT): Float64Array {
  const rng = createRng(seed);
  const normal = () => {
    const u1 = 1 - rng.next();
    const u2 = rng.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const call = () => Math.min(TIMEOUT_MS * 0.9, BODY_MEDIAN_MS * Math.exp(BODY_SIGMA * normal()));

  const doubles = Math.round(n * DOUBLE_SHARE);
  const retries = Math.round(n * RETRY_SHARE);
  const values = new Float64Array(n);
  let i = 0;
  for (; i < doubles; i++) values[i] = 2 * TIMEOUT_MS + call();
  for (; i < doubles + retries; i++) values[i] = TIMEOUT_MS + call();
  for (; i < n; i++) values[i] = call();
  return values.sort();
}

/** Value at quantile q (0 to 1), interpolating linearly between neighbours. `sorted` must be ascending. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const h = (n - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/** Value at percentile p (0 to 100). */
export function percentileValue(sorted: ArrayLike<number>, p: number): number {
  return quantile(sorted, p / 100);
}

export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  return values.length ? sum / values.length : NaN;
}

/** Share of values at or below x. */
export function cdfAt(sorted: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? lo / sorted.length : 0;
}

/* ------------------------------------------------------------------ */
/* Fan-out                                                             */
/* ------------------------------------------------------------------ */

/** Chance that at least one of `calls` independent calls is slower than percentile p: 1 − (p/100)^calls. */
export function slowPageChance(calls: number, p = 99): number {
  return 1 - Math.pow(p / 100, Math.max(1, calls));
}

/** Value at quantile q of a page that waits for the slowest of `calls` calls. */
export function pageQuantile(sorted: ArrayLike<number>, q: number, calls: number): number {
  return quantile(sorted, Math.pow(Math.max(0, Math.min(1, q)), 1 / Math.max(1, calls)));
}

/** Average page time when a page waits for the slowest of `calls` calls (exact for these samples). */
export function pageMean(sorted: ArrayLike<number>, calls: number): number {
  const n = sorted.length;
  const k = Math.max(1, calls);
  let sum = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = Math.pow((i + 1) / n, k);
    sum += sorted[i]! * (cur - prev);
    prev = cur;
  }
  return sum;
}

/** Share of pages, each waiting on `calls` calls, slower than x. */
export function pageShareSlowerThan(sorted: ArrayLike<number>, x: number, calls: number): number {
  return 1 - Math.pow(cdfAt(sorted, x), Math.max(1, calls));
}

/**
 * Bar heights: how many of `sorted.length` calls (or pages of `calls` calls) land in each
 * BIN_MS-wide bar from 0 to MAX_MS. Anything slower lands in the last bar.
 */
export function histogram(sorted: ArrayLike<number>, calls = 1, binMs = BIN_MS, maxMs = MAX_MS): number[] {
  const bins = Math.ceil(maxMs / binMs);
  const n = sorted.length;
  const k = Math.max(1, calls);
  const counts: number[] = [];
  let prev = 0;
  for (let b = 0; b < bins; b++) {
    const upper = b === bins - 1 ? 1 : Math.pow(cdfAt(sorted, (b + 1) * binMs), k);
    counts.push(n * (upper - prev));
    prev = upper;
  }
  return counts;
}

/** The percentile at a given latency for the shown distribution, clamped to the marker's range. */
export function percentileAt(sorted: ArrayLike<number>, ms: number, calls = 1): number {
  const p = 100 * Math.pow(cdfAt(sorted, ms), Math.max(1, calls));
  return Math.max(MIN_PERCENTILE, Math.min(MAX_PERCENTILE, Math.round(p * 100) / 100));
}

/** The next marker step above (dir 1) or below (dir −1) p. */
export function stepPercentile(p: number, dir: 1 | -1): number {
  if (dir > 0) return PERCENTILE_STEPS.find((s) => s > p + 1e-9) ?? MAX_PERCENTILE;
  return [...PERCENTILE_STEPS].reverse().find((s) => s < p - 1e-9) ?? MIN_PERCENTILE;
}

/** Index of the marker step closest to p, for the slider. */
export function nearestStepIndex(p: number): number {
  let best = 0;
  PERCENTILE_STEPS.forEach((s, i) => {
    if (Math.abs(s - p) < Math.abs(PERCENTILE_STEPS[best]! - p)) best = i;
  });
  return best;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** 99 -> "p99", 99.9 -> "p99.9", 50 -> "p50". */
export function percentileLabel(p: number): string {
  return `p${Number(p.toFixed(2))}`;
}

/** 103.4 -> "103 ms", 1084 -> "1.08 s". */
export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** 0.0956 -> "9.6%", 0.634 -> "63%", 0.001 -> "0.1%". */
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 0.1) return `${Number(pct.toFixed(1))}%`;
  return `${Number(pct.toFixed(2))}%`;
}

/** A label's box in the chart, in pixels. */
export type Box = { x0: number; x1: number; y0: number; y1: number };

/** A vertical line from y1 to y2, broken where it would run through a label, so no label is crossed out. */
export function gappedLine(x: number, y1: number, y2: number, labels: Box[]): [number, number][] {
  const hits = labels.filter((b) => x > b.x0 - 3 && x < b.x1 + 3 && b.y1 > y1 && b.y0 < y2).sort((a, b) => a.y0 - b.y0);
  const out: [number, number][] = [];
  let y = y1;
  for (const b of hits) {
    if (b.y0 - 2 > y) out.push([y, b.y0 - 2]);
    y = Math.max(y, b.y1 + 2);
  }
  if (y2 > y) out.push([y, y2]);
  return out;
}
