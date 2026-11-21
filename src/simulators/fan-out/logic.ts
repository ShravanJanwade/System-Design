/**
 * Feed fan-out (lesson 6.6): push, pull and hybrid compared on the same model of Snapgram.
 *
 * Write side: a seeded sample of posts, each from an author whose follower count is drawn from
 * the chosen distribution. Push writes one feed entry per follower; pull writes none; hybrid
 * pushes for authors below the threshold and skips the fan-out for authors at or above it.
 * The optional celebrity (30 million followers) posts once and is reported on its own.
 *
 * Read side: a seeded sample of feed loads. Each reader follows some number of accounts; a
 * followed account is "big" (at or above the threshold) with the probability that a follow
 * points at such an account, which is each account's share of all follows. A feed load reads
 * lists in rounds of parallel lookups; each round lasts as long as its slowest lookup, then the
 * lists are merged and the first screen of posts is fetched.
 *
 * Every constant is illustrative (ballpark), not a measurement.
 */
import { createRng, type Rng } from '@/lib/random';
import { formatMs } from '@/lib/format';

export type Strategy = 'push' | 'pull' | 'hybrid';
export const STRATEGIES: readonly Strategy[] = ['push', 'pull', 'hybrid'];
export const STRATEGY_LABEL: Record<Strategy, string> = { push: 'Push', pull: 'Pull', hybrid: 'Hybrid' };

export type Distribution = 'even' | 'skewed' | 'very-skewed';
export const DISTRIBUTIONS: readonly Distribution[] = ['even', 'skewed', 'very-skewed'];
export const DISTRIBUTION_LABEL: Record<Distribution, string> = { even: 'Even', skewed: 'Skewed', 'very-skewed': 'Very skewed' };

/** Hybrid thresholds the learner can pick: accounts with at least this many followers are pulled. */
export const THRESHOLDS = [10_000, 100_000, 1_000_000] as const;

export type FanOutConfig = {
  strategy: Strategy;
  distribution: Distribution;
  celebrity: boolean;
  threshold: number;
  seed: number;
  /** Sampled posts (write side). */
  posts: number;
  /** Sampled feed loads (read side). */
  readers: number;
};

export const DEFAULT_CONFIG: FanOutConfig = {
  strategy: 'push',
  distribution: 'skewed',
  celebrity: false,
  threshold: 100_000,
  seed: 7,
  posts: 20_000,
  readers: 5_000,
};

export const MODEL = {
  users: 50_000_000,
  celebrityFollowers: 30_000_000,
  /** Feed writes per second for one post's fan-out: about what 31 million followers in up to 5 minutes implies. */
  fanoutPerSecond: 100_000,
  /** Lookups one feed load sends at the same time. */
  parallelLookups: 100,
  lookupBaseMs: 1,
  /** Mean of the random extra time on each lookup. */
  lookupJitterMs: 0.5,
  /** One lookup in a hundred hits a slow moment, such as a busy server or a pause. */
  slowLookupChance: 0.01,
  slowLookupMs: 20,
  /** Recent posts read from each pulled account's list. */
  recentPerList: 10,
  /** Posts on the first screen, fetched after the feed is assembled. */
  feedPage: 20,
  mergeMsPerItem: 0.002,
  followingMedian: 150,
  followingSigma: 0.9,
  followingMin: 5,
  followingMax: 5_000,
} as const;

export type Shape = { kind: 'log-uniform'; min: number; max: number } | { kind: 'pareto'; alpha: number; xmin: number; cap: number };

export const SHAPES: Record<Distribution, Shape> = {
  even: { kind: 'log-uniform', min: 50, max: 500 },
  skewed: { kind: 'pareto', alpha: 1.5, xmin: 70, cap: 5_000_000 },
  'very-skewed': { kind: 'pareto', alpha: 1.2, xmin: 35, cap: 20_000_000 },
};

export function normalizeConfig(c: Partial<FanOutConfig>): FanOutConfig {
  const d = DEFAULT_CONFIG;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const threshold = num(c.threshold, d.threshold);
  return {
    strategy: STRATEGIES.includes(c.strategy as Strategy) ? (c.strategy as Strategy) : d.strategy,
    distribution: DISTRIBUTIONS.includes(c.distribution as Distribution) ? (c.distribution as Distribution) : d.distribution,
    celebrity: c.celebrity === true,
    threshold: THRESHOLDS.reduce((best, t) => (Math.abs(Math.log(t / threshold)) < Math.abs(Math.log(best / threshold)) ? t : best), THRESHOLDS[0] as number),
    seed: Math.round(num(c.seed, d.seed)),
    posts: Math.max(100, Math.round(num(c.posts, d.posts))),
    readers: Math.max(100, Math.round(num(c.readers, d.readers))),
  };
}

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

/** Follower count of a random account. Pareto shapes are truncated at their cap. */
export function sampleFollowers(shape: Shape, rng: Rng): number {
  const u = rng.next();
  if (shape.kind === 'log-uniform') return Math.round(shape.min * Math.pow(shape.max / shape.min, u));
  const { alpha, xmin, cap } = shape;
  const tail = Math.pow(xmin / cap, alpha);
  return Math.round(xmin * Math.pow(1 - u * (1 - tail), -1 / alpha));
}

/**
 * Share of all follows that point at accounts with at least `t` followers. A follow lands on an
 * account in proportion to its follower count, so this is the follower-weighted tail of the shape.
 */
export function followShareAbove(shape: Shape, t: number): number {
  if (shape.kind === 'log-uniform') {
    // Density ∝ 1/x, so follower-weighted density is flat between min and max.
    if (t >= shape.max) return 0;
    if (t <= shape.min) return 1;
    return (shape.max - t) / (shape.max - shape.min);
  }
  const { alpha, xmin, cap } = shape;
  if (t >= cap) return 0;
  if (t <= xmin) return 1;
  const g = (x: number) => Math.pow(x, 1 - alpha);
  return (g(cap) - g(t)) / (g(cap) - g(xmin));
}

function normal(rng: Rng): number {
  const u1 = Math.max(1e-12, rng.next());
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** How many accounts a reader follows: lognormal around the median, within bounds. */
export function sampleFollowing(rng: Rng): number {
  const f = Math.round(MODEL.followingMedian * Math.exp(MODEL.followingSigma * normal(rng)));
  return Math.min(MODEL.followingMax, Math.max(MODEL.followingMin, f));
}

/** Binomial(n, p): exact inversion for small means, a normal approximation for large ones. */
export function sampleBinomial(n: number, p: number, rng: Rng): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const mean = n * p;
  if (mean < 30) {
    const q = 1 - p;
    let prob = Math.pow(q, n);
    let cdf = prob;
    let k = 0;
    const u = rng.next();
    while (u > cdf && k < n) {
      prob *= ((n - k) / (k + 1)) * (p / q);
      k++;
      cdf += prob;
    }
    return k;
  }
  const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(rng));
  return Math.min(n, Math.max(0, k));
}

/** One round of k lookups sent at once: it lasts as long as the slowest of them. */
export function roundMs(k: number, rng: Rng): number {
  if (k <= 0) return 0;
  const anySlow = rng.next() < 1 - Math.pow(1 - MODEL.slowLookupChance, k);
  // The largest of k exponential delays, drawn directly from its distribution.
  const v = Math.min(rng.next(), 1 - 1e-12);
  const slowestJitter = -MODEL.lookupJitterMs * Math.log(1 - Math.pow(v, 1 / k));
  return MODEL.lookupBaseMs + slowestJitter + (anySlow ? MODEL.slowLookupMs : 0);
}

/** A feed load: read `lists` lists in rounds, merge `merged` candidate posts, fetch the first screen. */
export function feedLoadMs(lists: number, merged: number, rng: Rng): number {
  let ms = 0;
  for (let left = lists; left > 0; left -= MODEL.parallelLookups) ms += roundMs(Math.min(MODEL.parallelLookups, left), rng);
  ms += merged * MODEL.mergeMsPerItem;
  ms += roundMs(MODEL.feedPage, rng);
  return ms;
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

export type WriteStats = {
  /** Feed writes for the median post. */
  typical: number;
  /** Average feed writes per sampled post (the celebrity's post is reported separately). */
  average: number;
  /** The most feed writes any one post causes, the celebrity's included. */
  most: number;
  /** Followers of the account behind that post (0 when nothing is fanned out). */
  mostFollowers: number;
  /** Seconds until that post's fan-out finishes. */
  mostSeconds: number;
  /** Feed writes for the celebrity's post, or null without a celebrity. */
  celebrity: number | null;
};

export type ReadStats = { medianMs: number; p99Ms: number; medianLists: number; p99Lists: number };

export type StrategyResult = { strategy: Strategy; writes: WriteStats; reads: ReadStats };

export type FanOutResult = {
  config: FanOutConfig;
  byStrategy: Record<Strategy, StrategyResult>;
  /** Share of all follows that point at accounts at or above the hybrid threshold. */
  pulledShare: number;
  /** Median and largest follower count among the sampled posts' authors. */
  typicalFollowers: number;
  biggestFollowers: number;
  /** Accounts followed: median reader and the heaviest 1%. */
  typicalFollowing: number;
  heavyFollowing: number;
  /** Share of readers who follow the celebrity (0 without one). */
  celebrityReach: number;
};

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i]!;
}

/** Feed writes one post causes under a strategy. */
export function feedWrites(strategy: Strategy, followers: number, threshold: number): number {
  if (strategy === 'push') return followers;
  if (strategy === 'pull') return 0;
  return followers < threshold ? followers : 0;
}

export function runFanOut(partial: Partial<FanOutConfig> = {}): FanOutResult {
  const config = normalizeConfig({ ...DEFAULT_CONFIG, ...partial });
  const shape = SHAPES[config.distribution];

  // Write side.
  const postRng = createRng(config.seed);
  const followers = new Float64Array(config.posts);
  for (let i = 0; i < config.posts; i++) followers[i] = sampleFollowers(shape, postRng);
  const sortedFollowers = Float64Array.from(followers).sort();

  const writes = (strategy: Strategy): WriteStats => {
    const per = Float64Array.from(sortedFollowers, (f) => feedWrites(strategy, f, config.threshold)).sort();
    let sum = 0;
    for (const w of per) sum += w;
    let most = per[per.length - 1] ?? 0;
    let mostFollowers = 0;
    for (let i = sortedFollowers.length - 1; i >= 0; i--) {
      if (feedWrites(strategy, sortedFollowers[i]!, config.threshold) === most && most > 0) {
        mostFollowers = sortedFollowers[i]!;
        break;
      }
    }
    const celebrity = config.celebrity ? feedWrites(strategy, MODEL.celebrityFollowers, config.threshold) : null;
    if (celebrity !== null && celebrity > most) {
      most = celebrity;
      mostFollowers = MODEL.celebrityFollowers;
    }
    return {
      typical: percentile(per, 0.5),
      average: sum / per.length,
      most,
      mostFollowers,
      mostSeconds: most / MODEL.fanoutPerSecond,
      celebrity,
    };
  };

  // Read side: who each reader follows. The celebrity coin is always drawn, so turning the
  // celebrity on changes nothing else about the readers.
  const readerRng = createRng(config.seed + 1);
  const bigRng = createRng(config.seed + 2);
  const q = followShareAbove(shape, config.threshold);
  const reach = config.celebrity ? MODEL.celebrityFollowers / MODEL.users : 0;
  const celebrityPulled = config.celebrity && MODEL.celebrityFollowers >= config.threshold;
  const following = new Float64Array(config.readers);
  const big = new Float64Array(config.readers);
  for (let i = 0; i < config.readers; i++) {
    const f = sampleFollowing(readerRng);
    const followsCelebrity = readerRng.next() < reach;
    const ordinary = followsCelebrity ? f - 1 : f;
    following[i] = f;
    big[i] = sampleBinomial(ordinary, q, bigRng) + (followsCelebrity && celebrityPulled ? 1 : 0);
  }

  const reads = (strategy: Strategy): ReadStats => {
    // The same latency draws for every strategy, so differences come from the work, not luck.
    const rng = createRng(config.seed + 3);
    const ms = new Float64Array(config.readers);
    const lists = new Float64Array(config.readers);
    for (let i = 0; i < config.readers; i++) {
      const f = following[i]!;
      const b = big[i]!;
      let n: number;
      let merged: number;
      if (strategy === 'push') {
        n = 1;
        merged = 0;
      } else if (strategy === 'pull') {
        n = f;
        merged = f * MODEL.recentPerList;
      } else {
        n = 1 + b;
        merged = b > 0 ? MODEL.feedPage + b * MODEL.recentPerList : 0;
      }
      lists[i] = n;
      ms[i] = feedLoadMs(n, merged, rng);
    }
    ms.sort();
    lists.sort();
    return { medianMs: percentile(ms, 0.5), p99Ms: percentile(ms, 0.99), medianLists: percentile(lists, 0.5), p99Lists: percentile(lists, 0.99) };
  };

  const byStrategy = Object.fromEntries(STRATEGIES.map((s) => [s, { strategy: s, writes: writes(s), reads: reads(s) }])) as Record<Strategy, StrategyResult>;
  const sortedFollowing = Float64Array.from(following).sort();

  return {
    config,
    byStrategy,
    pulledShare: q,
    typicalFollowers: percentile(sortedFollowers, 0.5),
    biggestFollowers: sortedFollowers[sortedFollowers.length - 1] ?? 0,
    typicalFollowing: percentile(sortedFollowing, 0.5),
    heavyFollowing: percentile(sortedFollowing, 0.99),
    celebrityReach: reach,
  };
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** 0.0011 -> "1 ms", 0.51 -> "510 ms", 12 -> "12 s", 300 -> "5 min". */
export function formatSeconds(s: number): string {
  if (s < 1) return formatMs(s * 1000);
  if (s < 90) return `${s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)} s`;
  return `${Math.round(s / 60)} min`;
}
