import { describe, expect, it } from 'vitest';
import { FifoCache, LfuCache, LruCache, createCache } from './caches';
import { DEFAULT_CONFIG, runCacheSim } from './logic';

describe('LruCache', () => {
  it('evicts the least recently used key', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1, Infinity);
    c.set('b', 2, Infinity);
    c.get('a', 0); // a is now most recent
    expect(c.set('c', 3, Infinity)).toBe('b');
    expect(c.keys()).toEqual(['a', 'c']);
  });

  it('expires entries at their TTL', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1, 1000);
    expect(c.get('a', 999)).toBe(1);
    expect(c.get('a', 1000)).toBeUndefined();
    expect(c.size).toBe(0);
  });
});

describe('FifoCache', () => {
  it('evicts the oldest key even if it was read recently', () => {
    const c = new FifoCache<string, number>(2);
    c.set('a', 1, Infinity);
    c.set('b', 2, Infinity);
    c.get('a', 0);
    expect(c.set('c', 3, Infinity)).toBe('a');
  });
});

describe('LfuCache', () => {
  it('evicts the least frequently used key', () => {
    const c = new LfuCache<string, number>(2);
    c.set('a', 1, Infinity);
    c.set('b', 2, Infinity);
    c.get('a', 0);
    c.get('a', 0);
    c.get('b', 0);
    expect(c.set('c', 3, Infinity)).toBe('b');
    expect(c.keys().sort()).toEqual(['a', 'c']);
  });

  it('breaks frequency ties by recency', () => {
    const c = new LfuCache<string, number>(2);
    c.set('a', 1, Infinity);
    c.set('b', 2, Infinity);
    expect(c.set('c', 3, Infinity)).toBe('a');
  });

  it('keeps its bookkeeping straight through expiry and deletes', () => {
    const c = new LfuCache<string, number>(3);
    c.set('a', 1, 10);
    c.set('b', 2, Infinity);
    c.get('b', 0);
    expect(c.get('a', 10)).toBeUndefined();
    c.set('c', 3, Infinity);
    c.set('d', 4, Infinity);
    expect(c.size).toBe(3);
    expect(c.delete('b')).toBe(true);
    c.set('e', 5, Infinity);
    c.set('f', 6, Infinity);
    expect(c.size).toBe(3);
  });
});

describe('createCache', () => {
  it('never stores anything with capacity 0', () => {
    const c = createCache<string, number>('LRU', 0);
    c.set('a', 1, Infinity);
    expect(c.size).toBe(0);
  });
});

describe('runCacheSim', () => {
  const base = runCacheSim();

  it('is deterministic for a seed', () => {
    const again = runCacheSim();
    expect(again.totals).toEqual(base.totals);
  });

  it('accounts for every request', () => {
    const { requests, hits, dbReads, waits } = base.totals;
    expect(requests).toBe(DEFAULT_CONFIG.rps * DEFAULT_CONFIG.durationSec);
    expect(hits + dbReads + waits).toBe(requests);
  });

  it('starts cold: the first bucket is all misses', () => {
    expect(base.buckets[0]!.hits).toBe(0);
  });

  it('a bigger cache hits more and loads the database less', () => {
    const small = runCacheSim({ capacity: 10 });
    const big = runCacheSim({ capacity: 150 });
    expect(big.steadyHitRatio).toBeGreaterThan(base.steadyHitRatio);
    expect(base.steadyHitRatio).toBeGreaterThan(small.steadyHitRatio);
    expect(small.steadyDbPerSec).toBeGreaterThan(base.steadyDbPerSec);
  });

  it('shrinking the cache to 10 entries roughly doubles database load (challenge 1)', () => {
    expect(runCacheSim({ capacity: 10 }).steadyDbPerSec).toBeGreaterThanOrEqual(2 * base.steadyDbPerSec);
  });

  it('even traffic drops the hit rate below 50% (challenge 2)', () => {
    expect(runCacheSim({ skew: 0.5 }).steadyHitRatio).toBeLessThan(0.5);
  });

  it('with skewed traffic and no TTL, LFU beats LRU, and LRU beats FIFO (challenge 4)', () => {
    const lfu = runCacheSim({ policy: 'LFU', ttlSec: 0 });
    const lru = runCacheSim({ policy: 'LRU', ttlSec: 0 });
    const fifo = runCacheSim({ policy: 'FIFO', ttlSec: 0 });
    expect(lfu.steadyHitRatio).toBeGreaterThan(lru.steadyHitRatio);
    expect(lru.steadyHitRatio).toBeGreaterThan(fifo.steadyHitRatio);
  });

  it('a short TTL makes hot keys stampede when they expire (challenge 3)', () => {
    const r = runCacheSim({ ttlSec: 10 });
    const hot = r.stampedes.filter((s) => s.t >= 5);
    expect(hot.length).toBeGreaterThanOrEqual(4);
    expect(hot.some((s) => s.key === 0)).toBe(true);
  });

  it('coalescing removes stampedes and lowers database load', () => {
    const plain = runCacheSim({ ttlSec: 10 });
    const coalesced = runCacheSim({ ttlSec: 10, coalesce: true });
    expect(coalesced.stampedes).toHaveLength(0);
    expect(coalesced.peakDbPerSec).toBeLessThan(plain.peakDbPerSec);
    expect(coalesced.steadyDbPerSec).toBeLessThan(plain.steadyDbPerSec);
  });

  it('TTL jitter spreads expiries, lowering the worst spike', () => {
    const plain = runCacheSim({ ttlSec: 10 });
    const jittered = runCacheSim({ ttlSec: 10, jitter: true });
    expect(jittered.peakDbPerSec).toBeLessThan(plain.peakDbPerSec);
  });

  it('keeps the most popular profiles in the cache', () => {
    expect(base.cachedRanks).toContain(0);
    expect(base.cachedRanks).toContain(1);
  });
});

describe('cacheDiagram', () => {
  it('lays out cleanly in every mode and reads at phone size', async () => {
    const { lintDiagram } = await import('@/diagram/chips');
    const { PHONE_MIN_SCALE, phoneScale } = await import('@/diagram/phone');
    const { cacheDiagram } = await import('./diagram');
    for (const policy of ['LRU', 'LFU', 'FIFO']) {
      for (const [capacity, hitRatio, dbPerSec] of [
        [10, 0.12, 1760],
        [50, 0.72, 560],
        [200, 0.995, 10],
      ] as const) {
        const spec = cacheDiagram({ capacity, policy, hitRatio, dbPerSec });
        for (const mode of ['wide', 'compact', 'narrow'] as const) expect(lintDiagram(spec, [mode]), `${policy} ${capacity} ${mode}`).toEqual([]);
        expect(phoneScale(spec)).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });
});
