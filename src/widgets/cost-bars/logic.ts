/**
 * Cost bars: the rough monthly bill of a Snapgram-like photo workload, line by line.
 *
 * Every price is a public list price from Amazon Web Services, checked on 18 November 2026.
 * - Compute, https://aws.amazon.com/ec2/pricing/on-demand/ : m7i.xlarge (4 vCPUs, 16 GiB), Linux, On-Demand,
 *   US West (Oregon): $0.2016 an hour.
 * - Storage, https://aws.amazon.com/s3/pricing/ : S3 Standard in US West (Oregon) $0.023, $0.022 and $0.021
 *   per GB-month (first 50 TB, next 450 TB, over 500 TB); S3 Glacier Instant Retrieval $0.004 per GB-month
 *   plus $0.03 per GB retrieved. In Asia Pacific (Singapore), for the replica: S3 Standard $0.025, $0.024 and
 *   $0.023; Glacier Instant Retrieval $0.005.
 * - Data transfer out of US West (Oregon), from the data transfer price list behind the EC2 and S3 pages:
 *   to the internet $0.09 (first 10 TB a month), $0.085 (next 40 TB), $0.07 (next 100 TB) and $0.05
 *   (over 150 TB) per GB; to Asia Pacific (Singapore) $0.02 per GB; to CloudFront free; in from the internet free.
 * - CDN, https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ : CloudFront, United States, Mexico and
 *   Canada: first 1 TB free, then $0.085 (next 9 TB), $0.080 (next 40 TB), $0.060 (next 100 TB), $0.040
 *   (next 350 TB), $0.030 (next 524 TB), $0.025 (next 4 PB) and $0.020 (over 5 PB) per GB.
 *
 * Tier boundaries follow the price lists, which count a terabyte as 1,024 GB. The workload is illustrative,
 * taken from the estimate in lesson 2.6. Request fees, account-wide free allowances, taxes and discounts are
 * left out, so the bars show relative sizes, not a real bill.
 */

export type Tier = { upToGb: number; usdPerGb: number };

/** Gigabytes in a price-list terabyte and petabyte. */
const TB = 1024;
const PB = 1024 * TB;

export const HOURS_PER_MONTH = 730; // 365 days × 24 hours ÷ 12 months

export const PRICES: {
  vmPerHour: number;
  standard: readonly Tier[];
  cold: number;
  coldRetrieval: number;
  internet: readonly Tier[];
  cdn: readonly Tier[];
  originToCdn: number;
  interRegion: number;
  replicaStandard: readonly Tier[];
  replicaCold: number;
} = {
  vmPerHour: 0.2016,
  standard: [
    { upToGb: 50 * TB, usdPerGb: 0.023 },
    { upToGb: 500 * TB, usdPerGb: 0.022 },
    { upToGb: Infinity, usdPerGb: 0.021 },
  ],
  cold: 0.004,
  coldRetrieval: 0.03,
  internet: [
    { upToGb: 10 * TB, usdPerGb: 0.09 },
    { upToGb: 50 * TB, usdPerGb: 0.085 },
    { upToGb: 150 * TB, usdPerGb: 0.07 },
    { upToGb: Infinity, usdPerGb: 0.05 },
  ],
  cdn: [
    { upToGb: 1 * TB, usdPerGb: 0 },
    { upToGb: 10 * TB, usdPerGb: 0.085 },
    { upToGb: 50 * TB, usdPerGb: 0.08 },
    { upToGb: 150 * TB, usdPerGb: 0.06 },
    { upToGb: 500 * TB, usdPerGb: 0.04 },
    { upToGb: 1 * PB, usdPerGb: 0.03 },
    { upToGb: 5 * PB, usdPerGb: 0.025 },
    { upToGb: Infinity, usdPerGb: 0.02 },
  ],
  originToCdn: 0,
  interRegion: 0.02,
  replicaStandard: [
    { upToGb: 50 * TB, usdPerGb: 0.025 },
    { upToGb: 500 * TB, usdPerGb: 0.024 },
    { upToGb: Infinity, usdPerGb: 0.023 },
  ],
  replicaCold: 0.005,
};

/** What Snapgram runs in a month. Sizes are decimal: 1,000,000 GB is about 1 PB. */
export type Workload = {
  /** Every app server, database, cache and worker, counted as machines of one general-purpose size. */
  machines: number;
  /** Photos stored. */
  storedGb: number;
  /** Share of stored photos that are more than a year old. */
  oldShare: number;
  /** Photos sent to users in a month. */
  servedGb: number;
  /** New photos uploaded in a month: what a second region has to copy. */
  newGbPerMonth: number;
};

/** One million daily users, from the estimate in lesson 2.6 (illustrative). */
export const SNAPGRAM: Workload = {
  machines: 100,
  storedGb: 2_000_000, // about 2 PB: five years at about 400 TB a year
  oldShare: 0.8, // four of those five years are more than a year old
  servedGb: 2_592_000, // about 1 GB a second for a 30-day month
  newGbPerMonth: 30_000, // about 1 TB of new photos a day
};

export type Choices = {
  /** Move photos older than a year to colder storage (Glacier Instant Retrieval). */
  coldStorage: boolean;
  /** Serve photos through a CDN instead of straight from storage. */
  cdn: boolean;
  /** Copy photos to a second region (Singapore). */
  secondRegion: boolean;
  /** Percent of bytes served that are photos older than a year: each is read from colder storage. */
  oldViewPercent: number;
};

export const MAX_OLD_VIEW_PERCENT = 50;

/** The plain design every bar is compared with: no CDN, every photo in standard storage, one region. */
export const PLAIN: Choices = { coldStorage: false, cdn: false, secondRegion: false, oldViewPercent: 5 };

export type LineId = 'compute' | 'standard' | 'cold' | 'retrieval' | 'transfer' | 'replica';

export type CostLine = {
  id: LineId;
  label: string;
  /** For narrow screens and readouts. */
  short: string;
  /** How the number is worked out, in one line. */
  detail: string;
  usd: number;
};

/** Cost of `gb` gigabytes under a tiered price: each slice of usage pays its own tier's rate. */
export function tieredCost(gb: number, tiers: readonly Tier[]): number {
  let cost = 0;
  let from = 0;
  for (const tier of tiers) {
    if (gb <= from) break;
    cost += (Math.min(gb, tier.upToGb) - from) * tier.usdPerGb;
    from = tier.upToGb;
  }
  return cost;
}

export function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return PLAIN.oldViewPercent;
  return Math.max(0, Math.min(MAX_OLD_VIEW_PERCENT, Math.round(p)));
}

function tb(gb: number): string {
  return Math.round(gb / 1000).toLocaleString('en-US');
}

/** Which photos sit in which class. */
export function storageSplit(c: Choices, w: Workload = SNAPGRAM): { hotGb: number; coldGb: number } {
  const coldGb = c.coldStorage ? w.storedGb * w.oldShare : 0;
  return { hotGb: w.storedGb - coldGb, coldGb };
}

/** Gigabytes read back from colder storage in a month: every view of an old photo, a pessimistic simplification. */
export function retrievedGb(c: Choices, w: Workload = SNAPGRAM): number {
  return c.coldStorage ? (clampPercent(c.oldViewPercent) / 100) * w.servedGb : 0;
}

/** The monthly bill, one line per meter, in a fixed order. */
export function costLines(c: Choices, w: Workload = SNAPGRAM): CostLine[] {
  const { hotGb, coldGb } = storageSplit(c, w);
  const readGb = retrievedGb(c, w);
  const compute = w.machines * HOURS_PER_MONTH * PRICES.vmPerHour;
  const standard = tieredCost(hotGb, PRICES.standard);
  const cold = coldGb * PRICES.cold;
  const retrieval = readGb * PRICES.coldRetrieval;
  const transfer = c.cdn
    ? tieredCost(w.servedGb, PRICES.cdn) + w.servedGb * PRICES.originToCdn
    : tieredCost(w.servedGb, PRICES.internet);
  const replica = c.secondRegion
    ? tieredCost(hotGb, PRICES.replicaStandard) + coldGb * PRICES.replicaCold + w.newGbPerMonth * PRICES.interRegion
    : 0;

  return [
    {
      id: 'compute',
      label: 'Compute',
      short: 'Compute',
      detail: `${w.machines} machines × ${HOURS_PER_MONTH} hours × $${PRICES.vmPerHour} an hour.`,
      usd: compute,
    },
    {
      id: 'standard',
      label: 'Standard storage',
      short: 'Standard storage',
      detail: `${tb(hotGb)} TB at $0.021 to $0.023 per GB-month.`,
      usd: standard,
    },
    {
      id: 'cold',
      label: 'Colder storage',
      short: 'Colder storage',
      detail: c.coldStorage ? `${tb(coldGb)} TB of photos over a year old at $0.004 per GB-month.` : 'Off: every photo stays in standard storage.',
      usd: cold,
    },
    {
      id: 'retrieval',
      label: 'Reads from colder storage',
      short: 'Cold reads',
      detail: c.coldStorage ? `${tb(readGb)} TB of old photos read back at $0.03 per GB.` : 'Off: nothing is in colder storage.',
      usd: retrieval,
    },
    {
      id: 'transfer',
      label: c.cdn ? 'Transfer out, through the CDN' : 'Transfer out, straight from storage',
      short: 'Transfer out',
      detail: c.cdn
        ? `${tb(w.servedGb)} TB at $0.085 falling to $0.02 per GB; fetches from storage to the CDN are free.`
        : `${tb(w.servedGb)} TB at $0.09 falling to $0.05 per GB.`,
      usd: transfer,
    },
    {
      id: 'replica',
      label: 'Second region',
      short: 'Second region',
      detail: c.secondRegion
        ? `${tb(w.newGbPerMonth)} TB of new photos copied at $0.02 per GB, and all ${tb(w.storedGb)} TB stored again in Singapore.`
        : 'Off: photos live in one region.',
      usd: replica,
    },
  ];
}

export function totalUsd(lines: readonly CostLine[]): number {
  return lines.reduce((sum, l) => sum + l.usd, 0);
}

export function biggestLine(lines: readonly CostLine[]): CostLine {
  return lines.reduce((best, l) => (l.usd > best.usd ? l : best));
}

/** The plain design's bill, for the dashed outlines and the comparison. */
export const PLAIN_LINES: readonly CostLine[] = costLines(PLAIN);
export const PLAIN_TOTAL = totalUsd(PLAIN_LINES);

/** Fractional change of the total against the plain design: −0.3 is 30% cheaper. */
export function changeVsPlain(c: Choices, w: Workload = SNAPGRAM): number {
  const plain = totalUsd(costLines(PLAIN, w));
  return (totalUsd(costLines(c, w)) - plain) / plain;
}

/**
 * The percent of views of old photos at which colder storage stops saving money, given the other choices.
 * Only the retrieval line depends on that percent, and it grows linearly, so this is where it eats the saving.
 */
export function breakEvenOldViewPercent(c: Choices, w: Workload = SNAPGRAM): number {
  const without = totalUsd(costLines({ ...c, coldStorage: false }, w));
  const withNoReads = totalUsd(costLines({ ...c, coldStorage: true, oldViewPercent: 0 }, w));
  return ((without - withNoReads) / (w.servedGb * PRICES.coldRetrieval)) * 100;
}

/** Every combination of the toggles, at both ends of the old-views range. */
export function allChoices(): Choices[] {
  const out: Choices[] = [];
  for (const coldStorage of [false, true])
    for (const cdn of [false, true])
      for (const secondRegion of [false, true])
        for (const oldViewPercent of [0, MAX_OLD_VIEW_PERCENT]) out.push({ coldStorage, cdn, secondRegion, oldViewPercent });
  return out;
}

const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** The smallest "round" number at or above v, such as 150,000 for 133,491. */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const m = NICE.find((n) => n * mag >= v - 1e-9) ?? 10;
  return m * mag;
}

/** Gridline values from zero to max: three to six round steps. */
export function scaleTicks(max: number): number[] {
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const s of [5, 2.5, 2, 1, 0.5, 0.25, 0.2, 0.1]) {
    const step = s * mag;
    const n = Math.round(max / step);
    if (n >= 3 && n <= 6 && Math.abs(n * step - max) < 1e-6 * max) return Array.from({ length: n + 1 }, (_, i) => i * step);
  }
  return [0, max];
}

/** A fixed scale that fits every bar in every combination, so bars never rescale while you click. */
export function scaleMaxUsd(w: Workload = SNAPGRAM): number {
  let max = 0;
  for (const c of allChoices()) for (const l of costLines(c, w)) max = Math.max(max, l.usd);
  return niceCeil(max);
}

export const SCALE_MAX = scaleMaxUsd();

export function formatUsd(v: number): string {
  if (v < 0.5) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1_000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

export function formatChange(fraction: number): string {
  const pct = Math.round(fraction * 100);
  if (pct === 0) return 'No change';
  return pct < 0 ? `−${-pct}%` : `+${pct}%`;
}

export function choicesFromProps(props?: Record<string, number | string | boolean>): Choices {
  const flag = (key: string, fallback: boolean) => (typeof props?.[key] === 'boolean' ? (props[key] as boolean) : fallback);
  const views = props?.oldViews;
  return {
    coldStorage: flag('cold', PLAIN.coldStorage),
    cdn: flag('cdn', PLAIN.cdn),
    secondRegion: flag('secondRegion', PLAIN.secondRegion),
    oldViewPercent: clampPercent(typeof views === 'number' ? views : PLAIN.oldViewPercent),
  };
}

/** Text alternative for the bars. */
export function describeBill(c: Choices, w: Workload = SNAPGRAM): string {
  const lines = costLines(c, w);
  const parts = lines.map((l) => `${l.label}: ${l.usd < 0.5 ? 'off' : formatUsd(l.usd)}`);
  return `Rough monthly cost by line, at list prices. ${parts.join('; ')}. Total ${formatUsd(totalUsd(lines))} a month, against ${formatUsd(
    totalUsd(costLines(PLAIN, w)),
  )} for the plain design.`;
}
