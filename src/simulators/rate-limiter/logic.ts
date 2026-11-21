/**
 * Rate-limiter simulator: one minute of requests from one partner's API key, checked by one limiter.
 *
 * Two settings drive all four algorithms, so switching between them is a fair comparison:
 *
 * - Token bucket: holds up to `bucket` tokens and gains `refill` tokens a second. Each request
 *   spends one token; a request that finds less than one token is rejected. It starts full.
 * - Leaky bucket: a first-in, first-out queue that holds up to `bucket` waiting requests and lets
 *   one out every 1 / `refill` seconds. A request that arrives when the queue is empty and the
 *   last one left at least 1 / `refill` seconds ago goes straight through. A full queue rejects.
 * - Fixed window: at most `bucket` requests per window of `bucket / refill` seconds, counted
 *   from zero again at each window boundary (0 s, W, 2W, ...).
 * - Sliding window (log): keeps the time of every allowed request and allows a new one only if
 *   fewer than `bucket` were allowed in the last `bucket / refill` seconds.
 *
 * So every algorithm allows `bucket` requests at once and `refill` a second in the long run. They
 * differ in how they treat bursts and window boundaries, which is the point of the simulator.
 *
 * Traffic is steady requests (evenly spaced, nudged by a seeded random jitter) plus, depending on
 * the pattern, bursts every 10 seconds or pairs of bursts placed just before and just after a
 * window boundary. Everything is deterministic for a given seed.
 */
import type { DiagramSpec, StepNote } from '@/content/types';
import { formatInt } from '@/lib/format';
import { createRng } from '@/lib/random';

export type Algorithm = 'token-bucket' | 'leaky-bucket' | 'fixed-window' | 'sliding-window';
export type Pattern = 'steady' | 'bursts' | 'edges';

export const ALGORITHMS: readonly Algorithm[] = ['token-bucket', 'leaky-bucket', 'fixed-window', 'sliding-window'];
export const PATTERNS: readonly Pattern[] = ['steady', 'bursts', 'edges'];

export const ALGORITHM_NAME: Record<Algorithm, string> = {
  'token-bucket': 'Token bucket',
  'leaky-bucket': 'Leaky bucket',
  'fixed-window': 'Fixed window',
  'sliding-window': 'Sliding window',
};

export type RateSimConfig = {
  algorithm: Algorithm;
  /** Token bucket: most tokens held. Leaky bucket: most requests waiting. Windows: the limit per window. */
  bucket: number;
  /** Tokens added (token bucket) or requests let out (leaky bucket) per second. Windows last bucket / refill seconds. */
  refill: number;
  pattern: Pattern;
  /** Steady requests per second from the client. */
  rate: number;
  /** Requests in each burst. */
  burst: number;
  durationSec: number;
  burstEverySec: number;
  firstBurstSec: number;
  /** Each burst arrives spread evenly over this many seconds. */
  burstSpreadSec: number;
  /** Edge bursts stop this long before a window boundary and start this long after it. */
  edgeGapSec: number;
  /** Steady arrivals move by up to ± jitter / 2 of their spacing. */
  jitter: number;
  sampleSec: number;
  seed: number;
};

export const DEFAULT_CONFIG: RateSimConfig = {
  algorithm: 'token-bucket',
  bucket: 10,
  refill: 2,
  pattern: 'bursts',
  rate: 1,
  burst: 20,
  durationSec: 60,
  burstEverySec: 10,
  firstBurstSec: 5,
  burstSpreadSec: 0.2,
  edgeGapSec: 0.05,
  jitter: 0.6,
  sampleSec: 0.1,
  seed: 20261118,
};

const EPS = 1e-9;

/** Window length for the window algorithms, chosen so their long-run rate equals `refill`. */
export function windowSec(c: Pick<RateSimConfig, 'bucket' | 'refill'>): number {
  return c.bucket / c.refill;
}

/* ------------------------------------------------------------------ */
/* Traffic                                                             */
/* ------------------------------------------------------------------ */

export type Arrival = {
  t: number;
  /** -1 for steady traffic; otherwise the index of the burst this request belongs to. */
  group: number;
};

export type BurstInfo = { start: number; size: number };

/** Window boundaries targeted by edge bursts: the first boundary at or after 10, 30 and 50 seconds. */
export function edgeBoundaries(c: RateSimConfig): number[] {
  const w = windowSec(c);
  const spread = Math.min(c.burstSpreadSec, w * 0.3);
  const gap = Math.min(c.edgeGapSec, w * 0.1);
  const out: number[] = [];
  for (const from of [10, 30, 50]) {
    const b = Math.ceil(from / w - EPS) * w;
    if (b + gap + spread < c.durationSec && !out.some((x) => Math.abs(x - b) < EPS)) out.push(b);
  }
  return out;
}

/** The bursts of the current pattern, in time order. */
export function burstsOf(c: RateSimConfig): BurstInfo[] {
  if (c.burst <= 0 || c.pattern === 'steady') return [];
  if (c.pattern === 'bursts') {
    const out: BurstInfo[] = [];
    for (let s = c.firstBurstSec; s + c.burstSpreadSec < c.durationSec; s += c.burstEverySec) out.push({ start: s, size: c.burst });
    return out;
  }
  const w = windowSec(c);
  const spread = Math.min(c.burstSpreadSec, w * 0.3);
  const gap = Math.min(c.edgeGapSec, w * 0.1);
  return edgeBoundaries(c).flatMap((b) => [
    { start: b - gap - spread, size: c.burst },
    { start: b + gap, size: c.burst },
  ]);
}

/** Every request the client sends, sorted by time. */
export function arrivals(c: RateSimConfig): Arrival[] {
  const list: Arrival[] = [];
  if (c.rate > 0) {
    const rng = createRng(c.seed);
    const gap = 1 / c.rate;
    for (let k = 0; (k + 0.5) * gap < c.durationSec; k++) {
      const t = (k + 0.5) * gap + (rng.next() - 0.5) * c.jitter * gap;
      if (t >= 0 && t < c.durationSec) list.push({ t, group: -1 });
    }
  }
  const spread = c.pattern === 'edges' ? Math.min(c.burstSpreadSec, windowSec(c) * 0.3) : c.burstSpreadSec;
  burstsOf(c).forEach((b, g) => {
    for (let i = 0; i < b.size; i++) list.push({ t: b.start + (spread * i) / b.size, group: g });
  });
  return list.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ */
/* Limiters                                                            */
/* ------------------------------------------------------------------ */

export type Verdict = { allowed: boolean; /** When the request goes on to the service; null if rejected. */ sentAt: number | null };

export type Limiter = {
  /** Decide on a request arriving at time t. Requests must be offered in time order. */
  offer(t: number): Verdict;
  /**
   * What the limiter holds at time t (at or after the last offer): tokens in the bucket, requests
   * waiting in the leaky bucket, or allowed requests counted in the current window.
   */
  level(t: number): number;
};

const REJECT: Verdict = { allowed: false, sentAt: null };

export function tokenBucket(bucket: number, refill: number): Limiter {
  let tokens = bucket;
  let last = 0;
  const at = (t: number) => Math.min(bucket, tokens + (t - last) * refill);
  return {
    offer(t) {
      tokens = at(t);
      last = t;
      if (tokens < 1 - EPS) return REJECT;
      tokens -= 1;
      return { allowed: true, sentAt: t };
    },
    level: (t) => at(t),
  };
}

export function leakyBucket(bucket: number, refill: number): Limiter {
  const sends: number[] = [];
  let head = 0;
  let nextFree = 0;
  const gap = 1 / refill;
  const firstWaiting = (t: number, from: number) => {
    let i = from;
    while (i < sends.length && sends[i]! <= t + EPS) i++;
    return i;
  };
  return {
    offer(t) {
      head = firstWaiting(t, head);
      if (sends.length - head >= bucket) return REJECT;
      const sentAt = Math.max(t, nextFree);
      nextFree = sentAt + gap;
      sends.push(sentAt);
      return { allowed: true, sentAt };
    },
    level: (t) => sends.length - firstWaiting(t, head),
  };
}

export function fixedWindow(bucket: number, refill: number): Limiter {
  const w = bucket / refill;
  let index = -1;
  let count = 0;
  const windowOf = (t: number) => Math.floor(t / w + EPS);
  return {
    offer(t) {
      const k = windowOf(t);
      if (k !== index) {
        index = k;
        count = 0;
      }
      if (count >= bucket) return REJECT;
      count += 1;
      return { allowed: true, sentAt: t };
    },
    level: (t) => (windowOf(t) === index ? count : 0),
  };
}

export function slidingWindow(bucket: number, refill: number): Limiter {
  const w = bucket / refill;
  const log: number[] = [];
  let head = 0;
  const firstInside = (t: number, from: number) => {
    let i = from;
    while (i < log.length && log[i]! <= t - w + EPS) i++;
    return i;
  };
  return {
    offer(t) {
      head = firstInside(t, head);
      if (log.length - head >= bucket) return REJECT;
      log.push(t);
      return { allowed: true, sentAt: t };
    },
    level: (t) => log.length - firstInside(t, head),
  };
}

export function createLimiter(algorithm: Algorithm, bucket: number, refill: number): Limiter {
  switch (algorithm) {
    case 'token-bucket':
      return tokenBucket(bucket, refill);
    case 'leaky-bucket':
      return leakyBucket(bucket, refill);
    case 'fixed-window':
      return fixedWindow(bucket, refill);
    case 'sliding-window':
      return slidingWindow(bucket, refill);
  }
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export type Decision = Arrival & Verdict;

/** One reading every `sampleSec`. */
export type Sample = {
  t: number;
  /** Requests passed on to the service in the last second, (t - 1, t]. */
  allowedPerSec: number;
  /** Requests rejected in the last second. */
  rejectedPerSec: number;
  /** What the limiter holds at time t (see `Limiter.level`). */
  level: number;
};

export type RateSimResult = {
  samples: Sample[];
  decisions: Decision[];
  totals: {
    sent: number;
    /** Allowed, or accepted into the leaky bucket's queue. */
    allowed: number;
    rejected: number;
    /** Passed on to the service before the end of the run. */
    delivered: number;
  };
  /** Most requests passed on to the service in any one-second span. */
  busiestSecond: number;
  /** Most passed on in any span as long as one window. */
  busiestWindow: number;
  windowSec: number;
  /** Longest and average time an allowed request waited before going on (only the leaky bucket makes requests wait). */
  maxWaitSec: number;
  avgWaitSec: number;
  bursts: (BurstInfo & { allowed: number })[];
  peakLevel: number;
  firstRejectSec: number | null;
};

/** Most of the sorted times that fit in any half-open span [x, x + span). */
export function maxInSpan(times: number[], span: number): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (times[i]! - times[j]! >= span - EPS) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

export function runRateSim(partial: Partial<RateSimConfig> = {}): RateSimResult {
  const c: RateSimConfig = { ...DEFAULT_CONFIG, ...partial };
  const list = arrivals(c);
  const limiter = createLimiter(c.algorithm, c.bucket, c.refill);
  const decisions: Decision[] = [];
  const levels: { t: number; level: number }[] = [];
  const steps = Math.round(c.durationSec / c.sampleSec);
  let i = 0;
  for (let k = 0; k <= steps; k++) {
    const s = Math.round(k * c.sampleSec * 1000) / 1000;
    while (i < list.length && list[i]!.t <= s + EPS) {
      const a = list[i++]!;
      decisions.push({ ...a, ...limiter.offer(a.t) });
    }
    levels.push({ t: s, level: limiter.level(s) });
  }
  while (i < list.length) {
    const a = list[i++]!;
    decisions.push({ ...a, ...limiter.offer(a.t) });
  }

  const passes = decisions
    .filter((d) => d.allowed)
    .map((d) => d.sentAt!)
    .sort((a, b) => a - b);
  const rejects = decisions.filter((d) => !d.allowed).map((d) => d.t);

  // Rolling one-second counts at each sample time.
  let pHi = 0;
  let pLo = 0;
  let rHi = 0;
  let rLo = 0;
  const samples: Sample[] = levels.map(({ t, level }) => {
    while (pHi < passes.length && passes[pHi]! <= t + EPS) pHi++;
    while (pLo < passes.length && passes[pLo]! <= t - 1 + EPS) pLo++;
    while (rHi < rejects.length && rejects[rHi]! <= t + EPS) rHi++;
    while (rLo < rejects.length && rejects[rLo]! <= t - 1 + EPS) rLo++;
    return { t, allowedPerSec: pHi - pLo, rejectedPerSec: rHi - rLo, level };
  });

  const allowed = passes.length;
  const waits = decisions.filter((d) => d.allowed).map((d) => d.sentAt! - d.t);
  const info = burstsOf(c);
  const bursts = info.map((b, g) => ({ ...b, allowed: decisions.filter((d) => d.group === g && d.allowed).length }));
  const w = windowSec(c);

  return {
    samples,
    decisions,
    totals: {
      sent: decisions.length,
      allowed,
      rejected: decisions.length - allowed,
      delivered: passes.filter((t) => t < c.durationSec).length,
    },
    busiestSecond: maxInSpan(passes, 1),
    busiestWindow: maxInSpan(passes, w),
    windowSec: w,
    maxWaitSec: waits.length ? Math.max(...waits) : 0,
    avgWaitSec: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
    bursts,
    peakLevel: Math.max(0, ...samples.map((s) => s.level)),
    firstRejectSec: rejects.length ? rejects[0]! : null,
  };
}

/* ------------------------------------------------------------------ */
/* Diagram                                                             */
/* ------------------------------------------------------------------ */

function trafficLabel(c: RateSimConfig): string {
  if (c.pattern === 'steady' || c.burst <= 0) return `${formatInt(c.rate)} a second, steady`;
  if (c.pattern === 'bursts') return `bursts of ${formatInt(c.burst)}`;
  return 'bursts at window edges';
}

/** Client, limiter at the gateway, and the service behind it, labeled with the run's totals. */
export function limiterDiagram(c: RateSimConfig, r: RateSimResult): DiagramSpec {
  const notes: StepNote[] = [
    { target: 'gateway', text: `${formatInt(r.totals.rejected)} rejected`, tone: r.totals.rejected > 0 ? 'alert' : 'plain' },
    { target: 'service', text: `peak ${formatInt(r.busiestSecond)} in 1 s`, tone: 'plain' },
  ];
  const name = ALGORITHM_NAME[c.algorithm];
  const caption = [
    `The partner’s script sends ${formatInt(r.totals.sent)} requests in a minute (${trafficLabel(c)}).`,
    `The gateway checks each one with a ${name.toLowerCase()} and rejects ${formatInt(r.totals.rejected)} with 429 Too Many Requests.`,
    `The photo service receives ${formatInt(r.totals.delivered)}, at most ${formatInt(r.busiestSecond)} in any one second.`,
  ].join(' ');
  return {
    grid: { cols: 3, rows: 1 },
    nodes: [
      { id: 'client', type: 'client', label: 'Partner script', sublabel: trafficLabel(c), x: 0, y: 0 },
      { id: 'gateway', type: 'gateway', label: 'API gateway', sublabel: name, x: 1, y: 0 },
      { id: 'service', type: 'service', label: 'Photo service', sublabel: `${formatInt(r.totals.delivered)} received`, x: 2, y: 0 },
    ],
    edges: [
      { id: 'client-gateway', from: 'client', to: 'gateway', kind: 'sync', label: 'sent' },
      { id: 'gateway-service', from: 'gateway', to: 'service', kind: 'sync', label: 'allowed' },
    ],
    steps: [{ caption, notes }],
    description: caption,
  };
}
