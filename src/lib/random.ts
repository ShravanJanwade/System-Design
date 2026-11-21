/**
 * Deterministic randomness for simulators. Same seed, same sequence, on every machine,
 * so simulations are reproducible and testable.
 */

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
};

/** mulberry32: a small, fast, well-distributed 32-bit generator. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    chance: (p) => next() < p,
  };
}

/** 32-bit FNV-1a hash of a string. Stable across runs; useful for hashing keys. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Zipf = {
  /** Number of distinct items (ranks 0..n-1). */
  n: number;
  /** Draw a rank; rank 0 is the most popular. */
  sample(rng: Rng): number;
  /** Probability of a rank. */
  probability(rank: number): number;
  /** Share of all requests that go to the top k ranks. */
  topShare(k: number): number;
};

/**
 * Zipf popularity: item k gets weight 1 / (k + 1)^s.
 * s = 0 is perfectly even traffic; s around 1 matches many real workloads (a few hot items, a long tail).
 */
export function createZipf(n: number, s: number): Zipf {
  const cumulative = new Float64Array(n);
  let total = 0;
  for (let k = 0; k < n; k++) {
    total += 1 / Math.pow(k + 1, s);
    cumulative[k] = total;
  }
  for (let k = 0; k < n; k++) cumulative[k] = cumulative[k]! / total;
  return {
    n,
    sample(rng) {
      const u = rng.next();
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulative[mid]! < u) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
    probability(rank) {
      if (rank < 0 || rank >= n) return 0;
      return cumulative[rank]! - (rank === 0 ? 0 : cumulative[rank - 1]!);
    },
    topShare(k) {
      if (k <= 0) return 0;
      return cumulative[Math.min(k, n) - 1]!;
    },
  };
}
