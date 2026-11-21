/**
 * Cache simulator: cache-aside reads of Snapgram profiles.
 *
 * Requests arrive at a steady rate. Each asks for a profile picked by Zipf popularity.
 * A hit is served from the cache. A miss reads the database, which takes `rebuildMs`;
 * only then is the result written to the cache. Requests for the same key that miss
 * during that window also go to the database (a stampede) unless coalescing is on.
 */
import { createRng, createZipf } from '@/lib/random';
import { createCache, type EvictionPolicy } from './caches';

export type CacheSimConfig = {
  capacity: number;
  policy: EvictionPolicy;
  /** Seconds a cached profile stays valid. 0 means no expiry. */
  ttlSec: number;
  /** Zipf exponent: 0 is even traffic, 1.2 is very skewed. */
  skew: number;
  /** Let only one request rebuild a missing key; the others wait for it. */
  coalesce: boolean;
  /** Randomize each TTL by up to ±20% so hot keys stop expiring together. */
  jitter: boolean;
  keys: number;
  rps: number;
  durationSec: number;
  rebuildMs: number;
  bucketMs: number;
  seed: number;
};

export const DEFAULT_CONFIG: CacheSimConfig = {
  capacity: 50,
  policy: 'LRU',
  ttlSec: 30,
  skew: 1.1,
  coalesce: false,
  jitter: false,
  keys: 200,
  rps: 1000,
  durationSec: 60,
  rebuildMs: 100,
  bucketMs: 100,
  seed: 20261117,
};

/** Reads per second the database handles comfortably in this scenario (illustrative). */
export const DB_COMFORT_LIMIT = 400;

export type Bucket = {
  /** Bucket start, in seconds. */
  t: number;
  requests: number;
  hits: number;
  dbReads: number;
  waits: number;
};

export type Stampede = { t: number; key: number; reads: number };

export type CacheSimResult = {
  buckets: Bucket[];
  totals: { requests: number; hits: number; dbReads: number; waits: number };
  /** Hit ratio once the cache has warmed up (the second half of the run). */
  steadyHitRatio: number;
  /** Database reads per second once warmed up. */
  steadyDbPerSec: number;
  /** Highest database reads per second after the first five seconds of warm-up. */
  peakDbPerSec: number;
  /** Bursts where ten or more requests rebuilt the same key at once. */
  stampedes: Stampede[];
  /** Popularity ranks (0 = most popular) cached at the end, sorted. */
  cachedRanks: number[];
};

const STAMPEDE_THRESHOLD = 10;

export function runCacheSim(partial: Partial<CacheSimConfig> = {}): CacheSimResult {
  const c: CacheSimConfig = { ...DEFAULT_CONFIG, ...partial };
  const requestRng = createRng(c.seed);
  const jitterRng = createRng(c.seed ^ 0x9e3779b9);
  const zipf = createZipf(c.keys, c.skew);
  const cache = createCache<number, true>(c.policy, c.capacity);

  const total = Math.round(c.rps * c.durationSec);
  const gap = 1000 / c.rps;
  const bucketCount = Math.ceil((c.durationSec * 1000) / c.bucketMs);
  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    t: (i * c.bucketMs) / 1000,
    requests: 0,
    hits: 0,
    dbReads: 0,
    waits: 0,
  }));

  // Pending cache fills, in time order (every fill takes the same rebuild time).
  const fills: { at: number; key: number }[] = [];
  let head = 0;
  // Keys with a rebuild in flight: when it finishes and how many reads it drew.
  const inflight = new Map<number, { until: number; start: number; reads: number }>();
  const stampedes: Stampede[] = [];

  const closeInflight = (key: number, now: number) => {
    const w = inflight.get(key);
    if (w && w.until <= now) {
      if (w.reads >= STAMPEDE_THRESHOLD) stampedes.push({ t: w.start / 1000, key, reads: w.reads });
      inflight.delete(key);
    }
  };

  for (let i = 0; i < total; i++) {
    const now = i * gap;
    while (head < fills.length && fills[head]!.at <= now) {
      const f = fills[head++]!;
      const ttlMs = c.ttlSec > 0 ? c.ttlSec * 1000 * (c.jitter ? 1 + jitterRng.range(-0.2, 0.2) : 1) : Infinity;
      cache.set(f.key, true, f.at + ttlMs);
      closeInflight(f.key, f.at);
    }

    const key = zipf.sample(requestRng);
    const b = buckets[Math.min(bucketCount - 1, Math.floor(now / c.bucketMs))]!;
    b.requests++;

    if (cache.get(key, now) !== undefined) {
      b.hits++;
      continue;
    }

    const w = inflight.get(key);
    if (w && w.until > now) {
      if (c.coalesce) {
        b.waits++;
        continue;
      }
      w.reads++;
      b.dbReads++;
      fills.push({ at: now + c.rebuildMs, key });
      continue;
    }

    b.dbReads++;
    inflight.set(key, { until: now + c.rebuildMs, start: now, reads: 1 });
    fills.push({ at: now + c.rebuildMs, key });
  }
  for (const key of [...inflight.keys()]) closeInflight(key, Infinity);

  const totals = buckets.reduce(
    (acc, b) => ({
      requests: acc.requests + b.requests,
      hits: acc.hits + b.hits,
      dbReads: acc.dbReads + b.dbReads,
      waits: acc.waits + b.waits,
    }),
    { requests: 0, hits: 0, dbReads: 0, waits: 0 },
  );

  const half = buckets.slice(Math.floor(bucketCount / 2));
  const halfReq = half.reduce((s, b) => s + b.requests, 0);
  const halfHits = half.reduce((s, b) => s + b.hits, 0);
  const halfDb = half.reduce((s, b) => s + b.dbReads, 0);
  const halfSec = (half.length * c.bucketMs) / 1000;
  const perSec = 1000 / c.bucketMs;
  const afterWarmup = buckets.filter((b) => b.t >= 5);

  return {
    buckets,
    totals,
    steadyHitRatio: halfReq ? halfHits / halfReq : 0,
    steadyDbPerSec: halfSec ? halfDb / halfSec : 0,
    peakDbPerSec: afterWarmup.reduce((m, b) => Math.max(m, b.dbReads * perSec), 0),
    stampedes,
    cachedRanks: cache.keys().sort((a, b) => a - b),
  };
}
