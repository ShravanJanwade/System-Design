/**
 * Estimation calculator: back-of-the-envelope capacity numbers from a few stated assumptions.
 *
 * Every result is computed twice. The exact path uses 86,400 seconds a day and 365 days a year.
 * The rough path is how you would do it in an interview: a day is about 10⁵ seconds, and each
 * step is rounded to one significant figure (two when the first digit is 1). Both come with
 * their math, line by line. Sizes use decimal units: 1 KB = 1,000 bytes, 1 MB = 10⁶ bytes.
 */
import type { DiagramSpec } from '@/content/types';

export type EstimationInputs = {
  /** Daily active users. */
  dau: number;
  /** Requests each user makes in a day, reads and writes together. */
  actionsPerUser: number;
  /** Read/write ratio as reads per write: 100 means 100 reads for every write. */
  readsPerWrite: number;
  /** Size of one object, such as a photo, in bytes. */
  objectBytes: number;
  /** Traffic in the busiest hour divided by the daily average. */
  peakFactor: number;
  /** Years the data is kept. */
  retentionYears: number;
};

/** Snapgram planning for one million daily users (lesson 2.6). */
export const SNAPGRAM_INPUTS: EstimationInputs = {
  dau: 1_000_000,
  actionsPerUser: 100,
  readsPerWrite: 100,
  objectBytes: 1_000_000,
  peakFactor: 2,
  retentionYears: 5,
};

export const SECONDS_PER_DAY = 86_400;
export const ROUGH_SECONDS_PER_DAY = 100_000;
export const DAYS_PER_YEAR = 365;
/** The 80/20 rule: about 20% of objects get about 80% of reads, so cache 20% of a day's reads. */
export const CACHE_SHARE = 0.2;

/* ------------------------------------------------------------------ */
/* Control steps                                                       */
/* ------------------------------------------------------------------ */

export const STEPS: Record<keyof EstimationInputs, number[]> = {
  dau: [1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9],
  actionsPerUser: [1, 2, 5, 10, 20, 50, 100, 200, 500],
  readsPerWrite: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
  objectBytes: [100, 1e3, 1e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 1e8],
  peakFactor: [1, 1.5, 2, 3, 5, 10],
  retentionYears: [1, 2, 3, 5, 10],
};

/** The step list with an extra value (such as a preset's) inserted in order. */
export function withValue(steps: number[], value: number): number[] {
  return steps.includes(value) ? steps : [...steps, value].sort((a, b) => a - b);
}

/** Starting inputs: Snapgram's, overridden by any positive numbers in a preset. */
export function inputsFromPreset(preset?: Record<string, string | number | boolean>, base: EstimationInputs = SNAPGRAM_INPUTS): EstimationInputs {
  const out: EstimationInputs = { ...base };
  if (!preset) return out;
  for (const key of Object.keys(base) as (keyof EstimationInputs)[]) {
    const v = preset[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
  }
  if (out.peakFactor < 1) out.peakFactor = 1;
  return out;
}

/* ------------------------------------------------------------------ */
/* Arithmetic                                                          */
/* ------------------------------------------------------------------ */

/** Round the way you would in your head: one significant figure, or two when the first digit is 1. */
export function roughly(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const lead = Math.abs(x) / 10 ** exp;
  return Number(x.toPrecision(lead < 2 ? 2 : 1));
}

export type Numbers = {
  actionsPerDay: number;
  readsPerDay: number;
  writesPerDay: number;
  avgRps: number;
  avgReads: number;
  avgWrites: number;
  peakRps: number;
  peakReads: number;
  peakWrites: number;
  storagePerDay: number;
  storagePerYear: number;
  storageTotal: number;
  /** Bytes per second. */
  inAvg: number;
  inPeak: number;
  outAvg: number;
  outPeak: number;
  cacheObjects: number;
  cacheBytes: number;
};

export type Estimate = { inputs: EstimationInputs; exact: Numbers; rough: Numbers };

export function estimate(inputs: EstimationInputs): Estimate {
  const { dau, actionsPerUser, readsPerWrite: r, objectBytes: size, peakFactor: pf, retentionYears: years } = inputs;
  const readShare = r / (r + 1);

  const exactActions = dau * actionsPerUser;
  const exactReads = exactActions * readShare;
  const exactWrites = exactActions / (r + 1);
  const ex = {
    avgRps: exactActions / SECONDS_PER_DAY,
    avgReads: exactReads / SECONDS_PER_DAY,
    avgWrites: exactWrites / SECONDS_PER_DAY,
  };
  const exactStorageDay = exactWrites * size;
  const exactStorageYear = exactStorageDay * DAYS_PER_YEAR;
  const exact: Numbers = {
    actionsPerDay: exactActions,
    readsPerDay: exactReads,
    writesPerDay: exactWrites,
    ...ex,
    peakRps: ex.avgRps * pf,
    peakReads: ex.avgReads * pf,
    peakWrites: ex.avgWrites * pf,
    storagePerDay: exactStorageDay,
    storagePerYear: exactStorageYear,
    storageTotal: exactStorageYear * years,
    inAvg: ex.avgWrites * size,
    inPeak: ex.avgWrites * pf * size,
    outAvg: ex.avgReads * size,
    outPeak: ex.avgReads * pf * size,
    cacheObjects: exactReads * CACHE_SHARE,
    cacheBytes: exactReads * CACHE_SHARE * size,
  };

  const actionsPerDay = roughly(exactActions);
  const readsPerDay = roughly(actionsPerDay * readShare);
  const writesPerDay = roughly(actionsPerDay / (r + 1));
  const avgRps = roughly(actionsPerDay / ROUGH_SECONDS_PER_DAY);
  const avgReads = roughly(readsPerDay / ROUGH_SECONDS_PER_DAY);
  const avgWrites = roughly(writesPerDay / ROUGH_SECONDS_PER_DAY);
  const peakReads = roughly(avgReads * pf);
  const peakWrites = roughly(avgWrites * pf);
  const storagePerDay = roughly(writesPerDay * size);
  const storagePerYear = roughly(storagePerDay * DAYS_PER_YEAR);
  const cacheObjects = roughly(readsPerDay * CACHE_SHARE);
  const rough: Numbers = {
    actionsPerDay,
    readsPerDay,
    writesPerDay,
    avgRps,
    avgReads,
    avgWrites,
    peakRps: roughly(avgRps * pf),
    peakReads,
    peakWrites,
    storagePerDay,
    storagePerYear,
    storageTotal: roughly(storagePerYear * years),
    inAvg: roughly(avgWrites * size),
    inPeak: roughly(peakWrites * size),
    outAvg: roughly(avgReads * size),
    outPeak: roughly(peakReads * size),
    cacheObjects,
    cacheBytes: roughly(cacheObjects * size),
  };

  return { inputs, exact, rough };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function sig(v: number, digits = 3): number {
  return Number(v.toPrecision(digits));
}

/** Plain number for the exact path: 990099 -> "990,099", 11.459 -> "11.5", 0.991 -> "0.99". */
export function formatExact(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-9 || n >= 100) return grouped.format(Math.round(n));
  if (n >= 10) return grouped.format(Number(n.toFixed(1)));
  return grouped.format(sig(n, 2));
}

/** Rounded number in words: 1e8 -> "100 million", 2000 -> "2,000", 1.5 -> "1.5". */
export function formatRough(n: number): string {
  if (n >= 1e12) return `${grouped.format(sig(n / 1e12))} trillion`;
  if (n >= 1e9) return `${grouped.format(sig(n / 1e9))} billion`;
  if (n >= 1e6) return `${grouped.format(sig(n / 1e6))} million`;
  return grouped.format(sig(n));
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Powers-of-ten form for round numbers of 10,000 or more: 1e8 -> "10⁸", 2e6 -> "2 × 10⁶". Otherwise "". */
export function powerOfTen(n: number): string {
  if (n < 1e4) return '';
  const exp = Math.floor(Math.log10(n) + 1e-9);
  const mantissa = n / 10 ** exp;
  if (Math.abs(mantissa - Math.round(mantissa)) > 1e-9) return '';
  const e = String(exp)
    .split('')
    .map((d) => SUP[d] ?? d)
    .join('');
  return Math.round(mantissa) === 1 ? `10${e}` : `${Math.round(mantissa)} × 10${e}`;
}

const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB'];
const BIT_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps', 'Ebps'];

function scaled(n: number, units: string[]): string {
  let k = 0;
  let v = n;
  while (v >= 1000 && k < units.length - 1) {
    v /= 1000;
    k++;
  }
  return `${grouped.format(sig(v))} ${units[k]}`;
}

/** Decimal byte sizes: 990099000000 -> "990 GB", 2e15 -> "2 PB". */
export function formatBytes(n: number): string {
  return scaled(n, BYTE_UNITS);
}

/** Bytes per second as a rate: "1 GB/s". */
export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Bytes per second in network units (bits): 1e9 -> "8 Gbps". */
export function formatBits(bytesPerSec: number): string {
  return scaled(bytesPerSec * 8, BIT_UNITS);
}

/* ------------------------------------------------------------------ */
/* Results with their worked math                                      */
/* ------------------------------------------------------------------ */

export type MetricId = 'avgReads' | 'avgWrites' | 'peakReads' | 'peakWrites' | 'storageDay' | 'storageTotal' | 'bandwidthIn' | 'bandwidthOut' | 'cache';

export type Metric = {
  id: MetricId;
  label: string;
  rough: string;
  exact: string;
  /** Extra context under the value, such as the peak bandwidth. */
  note?: string;
  roughMath: string[];
  exactMath: string[];
};

function eq(raw: number, shown: number): string {
  return Math.abs(raw - shown) <= Math.abs(shown) * 1e-9 ? '=' : '≈';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** All results, each with its rough and exact math, line by line. */
export function explain(e: Estimate): Metric[] {
  const { dau, actionsPerUser, readsPerWrite: r, objectBytes: size, peakFactor: pf, retentionYears: years } = e.inputs;
  const R = e.rough;
  const X = e.exact;
  const sz = formatBytes(size);
  const p10 = (n: number) => (powerOfTen(n) ? ` (${powerOfTen(n)})` : '');

  const roughActions = `${formatRough(roughly(dau))} users × ${formatRough(actionsPerUser)} actions ${eq(dau * actionsPerUser, R.actionsPerDay)} ${formatRough(R.actionsPerDay)} actions a day${p10(R.actionsPerDay)}`;
  const exactActions = `${formatExact(dau)} users × ${formatExact(actionsPerUser)} actions = ${formatExact(X.actionsPerDay)} actions a day`;
  const roughReadsDay = `Reads are ${formatRough(r)} of every ${formatRough(r + 1)} actions: ${formatRough(R.actionsPerDay)} × ${r}/${r + 1} ${eq(R.actionsPerDay * (r / (r + 1)), R.readsPerDay)} ${formatRough(R.readsPerDay)} reads a day${p10(R.readsPerDay)}`;
  const exactReadsDay = `${formatExact(X.actionsPerDay)} × ${r}/${r + 1} = ${formatExact(X.readsPerDay)} reads a day`;
  const roughWritesDay = `Writes are 1 of every ${formatRough(r + 1)} actions: ${formatRough(R.actionsPerDay)} ÷ ${formatRough(r + 1)} ${eq(R.actionsPerDay / (r + 1), R.writesPerDay)} ${formatRough(R.writesPerDay)} writes a day${p10(R.writesPerDay)}`;
  const exactWritesDay = `${formatExact(X.actionsPerDay)} ÷ ${formatExact(r + 1)} = ${formatExact(X.writesPerDay)} writes a day`;
  const perSecond = (n: number, avg: number, what: string) =>
    `A day is about 100,000 seconds (10⁵): ${formatRough(n)} ÷ 100,000 ${eq(n / ROUGH_SECONDS_PER_DAY, avg)} ${formatRough(avg)} ${what} per second`;
  const perSecondExact = (n: number, avg: number, what: string) =>
    `A day is 86,400 seconds: ${formatExact(n)} ÷ 86,400 = ${formatExact(avg)} ${what} per second`;
  const peak = (avg: number, pk: number, what: string, exact: boolean) =>
    `Peak factor ${formatRough(pf)}: ${exact ? formatExact(avg) : formatRough(avg)} × ${formatRough(pf)} ${exact ? '=' : eq(avg * pf, pk)} ${exact ? formatExact(pk) : formatRough(pk)} ${what} per second in the busiest hour`;
  const yearsText = plural(years, 'year');

  return [
    {
      id: 'avgReads',
      label: 'Reads per second, average',
      rough: `${formatRough(R.avgReads)}/s`,
      exact: `${formatExact(X.avgReads)}/s`,
      roughMath: [roughActions, roughReadsDay, perSecond(R.readsPerDay, R.avgReads, 'reads')],
      exactMath: [exactActions, exactReadsDay, perSecondExact(X.readsPerDay, X.avgReads, 'reads')],
    },
    {
      id: 'avgWrites',
      label: 'Writes per second, average',
      rough: `${formatRough(R.avgWrites)}/s`,
      exact: `${formatExact(X.avgWrites)}/s`,
      roughMath: [roughActions, roughWritesDay, perSecond(R.writesPerDay, R.avgWrites, 'writes')],
      exactMath: [exactActions, exactWritesDay, perSecondExact(X.writesPerDay, X.avgWrites, 'writes')],
    },
    {
      id: 'peakReads',
      label: 'Reads per second, peak',
      rough: `${formatRough(R.peakReads)}/s`,
      exact: `${formatExact(X.peakReads)}/s`,
      roughMath: [`Average: ${formatRough(R.avgReads)} reads per second`, peak(R.avgReads, R.peakReads, 'reads', false)],
      exactMath: [`Average: ${formatExact(X.avgReads)} reads per second`, peak(X.avgReads, X.peakReads, 'reads', true)],
    },
    {
      id: 'peakWrites',
      label: 'Writes per second, peak',
      rough: `${formatRough(R.peakWrites)}/s`,
      exact: `${formatExact(X.peakWrites)}/s`,
      roughMath: [`Average: ${formatRough(R.avgWrites)} writes per second`, peak(R.avgWrites, R.peakWrites, 'writes', false)],
      exactMath: [`Average: ${formatExact(X.avgWrites)} writes per second`, peak(X.avgWrites, X.peakWrites, 'writes', true)],
    },
    {
      id: 'storageDay',
      label: 'New storage per day',
      rough: formatBytes(R.storagePerDay),
      exact: formatBytes(X.storagePerDay),
      roughMath: [roughWritesDay, `Each write stores one object: ${formatRough(R.writesPerDay)} × ${sz} ${eq(R.writesPerDay * size, R.storagePerDay)} ${formatBytes(R.storagePerDay)} a day`],
      exactMath: [exactWritesDay, `${formatExact(X.writesPerDay)} × ${sz} = ${formatBytes(X.storagePerDay)} a day`],
    },
    {
      id: 'storageTotal',
      label: `Storage over ${yearsText}`,
      rough: formatBytes(R.storageTotal),
      exact: formatBytes(X.storageTotal),
      note: `${formatBytes(R.storagePerYear)} a year`,
      roughMath: [
        `${formatBytes(R.storagePerDay)} a day × 365 days ${eq(R.storagePerDay * DAYS_PER_YEAR, R.storagePerYear)} ${formatBytes(R.storagePerYear)} a year`,
        `${formatBytes(R.storagePerYear)} × ${yearsText} ${eq(R.storagePerYear * years, R.storageTotal)} ${formatBytes(R.storageTotal)}`,
      ],
      exactMath: [
        `${formatBytes(X.storagePerDay)} a day × 365 days = ${formatBytes(X.storagePerYear)} a year`,
        `${formatBytes(X.storagePerYear)} × ${yearsText} = ${formatBytes(X.storageTotal)}`,
      ],
    },
    {
      id: 'bandwidthIn',
      label: 'Bandwidth in (uploads), average',
      rough: formatRate(R.inAvg),
      exact: formatRate(X.inAvg),
      note: `${formatRate(R.inPeak)} at peak`,
      roughMath: [
        `${formatRough(R.avgWrites)} writes per second × ${sz} ${eq(R.avgWrites * size, R.inAvg)} ${formatRate(R.inAvg)}, about ${formatBits(R.inAvg)}`,
        `At peak: ${formatRough(R.peakWrites)} × ${sz} ${eq(R.peakWrites * size, R.inPeak)} ${formatRate(R.inPeak)}, about ${formatBits(R.inPeak)}`,
      ],
      exactMath: [
        `${formatExact(X.avgWrites)} writes per second × ${sz} = ${formatRate(X.inAvg)}, ${formatBits(X.inAvg)}`,
        `At peak: ${formatExact(X.peakWrites)} × ${sz} = ${formatRate(X.inPeak)}, ${formatBits(X.inPeak)}`,
      ],
    },
    {
      id: 'bandwidthOut',
      label: 'Bandwidth out (downloads), average',
      rough: formatRate(R.outAvg),
      exact: formatRate(X.outAvg),
      note: `${formatRate(R.outPeak)} at peak`,
      roughMath: [
        `${formatRough(R.avgReads)} reads per second × ${sz} ${eq(R.avgReads * size, R.outAvg)} ${formatRate(R.outAvg)}, about ${formatBits(R.outAvg)}`,
        `At peak: ${formatRough(R.peakReads)} × ${sz} ${eq(R.peakReads * size, R.outPeak)} ${formatRate(R.outPeak)}, about ${formatBits(R.outPeak)}`,
      ],
      exactMath: [
        `${formatExact(X.avgReads)} reads per second × ${sz} = ${formatRate(X.outAvg)}, ${formatBits(X.outAvg)}`,
        `At peak: ${formatExact(X.peakReads)} × ${sz} = ${formatRate(X.outPeak)}, ${formatBits(X.outPeak)}`,
      ],
    },
    {
      id: 'cache',
      label: 'Cache size (80/20 rule)',
      rough: formatBytes(R.cacheBytes),
      exact: formatBytes(X.cacheBytes),
      roughMath: [
        'About 20% of objects get about 80% of reads, so cache 20% of a day’s reads',
        `0.2 × ${formatRough(R.readsPerDay)} reads ${eq(R.readsPerDay * CACHE_SHARE, R.cacheObjects)} ${formatRough(R.cacheObjects)} objects`,
        `${formatRough(R.cacheObjects)} × ${sz} ${eq(R.cacheObjects * size, R.cacheBytes)} ${formatBytes(R.cacheBytes)}`,
      ],
      exactMath: [
        `0.2 × ${formatExact(X.readsPerDay)} reads = ${formatExact(X.cacheObjects)} objects`,
        `${formatExact(X.cacheObjects)} × ${sz} = ${formatBytes(X.cacheBytes)}`,
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Diagram and challenges                                              */
/* ------------------------------------------------------------------ */

/** The system the numbers describe, labeled with the rough results. */
export function estimateDiagram(e: Estimate): DiagramSpec {
  const R = e.rough;
  return {
    grid: { cols: 3, rows: 2 },
    nodes: [
      { id: 'users', type: 'client', label: 'Users', sublabel: `${formatRough(roughly(e.inputs.dau))} a day`, x: 0, y: 0 },
      { id: 'app', type: 'service', label: 'App servers', sublabel: `${formatRough(R.peakRps)} req/s at peak`, x: 1, y: 0 },
      { id: 'cache', type: 'cache', label: 'Cache', sublabel: formatBytes(R.cacheBytes), x: 2, y: 0 },
      { id: 'store', type: 'objectStore', label: 'Storage', sublabel: `${formatBytes(R.storageTotal)} in ${plural(e.inputs.retentionYears, 'year')}`, x: 1, y: 1 },
    ],
    edges: [
      { id: 'users-app', from: 'users', to: 'app', kind: 'sync', label: `${formatRate(R.outPeak)} out` },
      { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
      { id: 'app-store', from: 'app', to: 'store', kind: 'sync', label: `${formatRate(R.inPeak)} in` },
    ],
    description: `Users send about ${formatRough(R.peakRps)} requests per second at peak to the app servers, which download about ${formatRate(R.outPeak)} at peak and upload about ${formatRate(R.inPeak)} into storage. Storage grows to about ${formatBytes(R.storageTotal)}, and the cache needs about ${formatBytes(R.cacheBytes)}.`,
  };
}

export type ChallengeId = 'growth' | 'size' | 'ratio' | 'small-cache';

/** One server's memory, for the cache challenge (ballpark). */
export const ONE_SERVER_MEMORY = 100e9;

export function challengeStatus(current: EstimationInputs, start: EstimationInputs): Record<ChallengeId, boolean> {
  return {
    growth: current.dau >= start.dau * 10,
    size: current.objectBytes >= start.objectBytes * 2,
    ratio: current.readsPerWrite === 1,
    'small-cache': current.objectBytes <= 1_000,
  };
}
