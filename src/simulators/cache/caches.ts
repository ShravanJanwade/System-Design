/**
 * Real cache implementations with time-based expiry. All operations are O(1).
 * `now` and `expiresAt` are in milliseconds; expiresAt = Infinity means no TTL.
 */

export type EvictionPolicy = 'LRU' | 'LFU' | 'FIFO';

export interface ExpiringCache<K, V> {
  readonly capacity: number;
  readonly size: number;
  /** Returns the value, or undefined on a miss. Expired entries are removed and count as a miss. */
  get(key: K, now: number): V | undefined;
  /** Inserts or replaces a value. Returns the key evicted to make room, if any. */
  set(key: K, value: V, expiresAt: number): K | undefined;
  has(key: K, now: number): boolean;
  delete(key: K): boolean;
  keys(): K[];
}

type Entry<V> = { value: V; expiresAt: number };

/** Least recently used: a Map keeps insertion order, so re-inserting on read moves a key to the back. */
export class LruCache<K, V> implements ExpiringCache<K, V> {
  private map = new Map<K, Entry<V>>();
  constructor(readonly capacity: number) {}
  get size() {
    return this.map.size;
  }
  get(key: K, now: number): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  has(key: K, now: number): boolean {
    const e = this.map.get(key);
    return Boolean(e && e.expiresAt > now);
  }
  set(key: K, value: V, expiresAt: number): K | undefined {
    if (this.capacity <= 0) return undefined;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt });
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
      return oldest;
    }
    return undefined;
  }
  delete(key: K): boolean {
    return this.map.delete(key);
  }
  keys(): K[] {
    return [...this.map.keys()];
  }
}

/** First in, first out: reads do not change the order, so popular keys still age out. */
export class FifoCache<K, V> implements ExpiringCache<K, V> {
  private map = new Map<K, Entry<V>>();
  constructor(readonly capacity: number) {}
  get size() {
    return this.map.size;
  }
  get(key: K, now: number): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }
  has(key: K, now: number): boolean {
    const e = this.map.get(key);
    return Boolean(e && e.expiresAt > now);
  }
  set(key: K, value: V, expiresAt: number): K | undefined {
    if (this.capacity <= 0) return undefined;
    const existing = this.map.get(key);
    if (existing) {
      // Replacing a value keeps its place in line.
      existing.value = value;
      existing.expiresAt = expiresAt;
      return undefined;
    }
    this.map.set(key, { value, expiresAt });
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
      return oldest;
    }
    return undefined;
  }
  delete(key: K): boolean {
    return this.map.delete(key);
  }
  keys(): K[] {
    return [...this.map.keys()];
  }
}

/**
 * Least frequently used, with least-recently-used tie-breaking inside a frequency.
 * Classic O(1) design: a Set per frequency (Sets keep insertion order) and a pointer to the lowest one.
 */
export class LfuCache<K, V> implements ExpiringCache<K, V> {
  private entries = new Map<K, Entry<V> & { freq: number }>();
  private byFreq = new Map<number, Set<K>>();
  private minFreq = 0;
  constructor(readonly capacity: number) {}
  get size() {
    return this.entries.size;
  }
  private bump(key: K, e: Entry<V> & { freq: number }) {
    const bucket = this.byFreq.get(e.freq)!;
    bucket.delete(key);
    if (bucket.size === 0) {
      this.byFreq.delete(e.freq);
      if (this.minFreq === e.freq) this.minFreq = e.freq + 1;
    }
    e.freq += 1;
    let next = this.byFreq.get(e.freq);
    if (!next) {
      next = new Set();
      this.byFreq.set(e.freq, next);
    }
    next.add(key);
  }
  private remove(key: K): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    this.entries.delete(key);
    const bucket = this.byFreq.get(e.freq);
    if (bucket) {
      bucket.delete(key);
      if (bucket.size === 0) {
        this.byFreq.delete(e.freq);
        if (this.minFreq === e.freq) this.recomputeMin();
      }
    }
    return true;
  }
  private recomputeMin() {
    let min = Infinity;
    for (const f of this.byFreq.keys()) if (f < min) min = f;
    this.minFreq = Number.isFinite(min) ? min : 0;
  }
  get(key: K, now: number): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.remove(key);
      return undefined;
    }
    this.bump(key, e);
    return e.value;
  }
  has(key: K, now: number): boolean {
    const e = this.entries.get(key);
    return Boolean(e && e.expiresAt > now);
  }
  set(key: K, value: V, expiresAt: number): K | undefined {
    if (this.capacity <= 0) return undefined;
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.bump(key, existing);
      return undefined;
    }
    let evicted: K | undefined;
    if (this.entries.size >= this.capacity) {
      const bucket = this.byFreq.get(this.minFreq);
      const victim = bucket?.values().next().value as K | undefined;
      if (victim !== undefined) {
        this.remove(victim);
        evicted = victim;
      }
    }
    const entry = { value, expiresAt, freq: 1 };
    this.entries.set(key, entry);
    let ones = this.byFreq.get(1);
    if (!ones) {
      ones = new Set();
      this.byFreq.set(1, ones);
    }
    ones.add(key);
    this.minFreq = 1;
    return evicted;
  }
  delete(key: K): boolean {
    return this.remove(key);
  }
  keys(): K[] {
    return [...this.entries.keys()];
  }
}

export function createCache<K, V>(policy: EvictionPolicy, capacity: number): ExpiringCache<K, V> {
  switch (policy) {
    case 'LRU':
      return new LruCache<K, V>(capacity);
    case 'LFU':
      return new LfuCache<K, V>(capacity);
    case 'FIFO':
      return new FifoCache<K, V>(capacity);
  }
}
