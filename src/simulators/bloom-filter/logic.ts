import { hashString } from '@/lib/random';

/**
 * Bloom filter simulator (lesson 5.10). A real Bloom filter: an array of m bits and k hash
 * functions, each item setting k positions. The expected false-positive rate is the textbook
 * (1 − e^(−kn/m))^k; the observed rate comes from checking thousands of seeded photos that were
 * never added. Pure and deterministic: the same items, size and k always give the same bits.
 */

/** Bit-array sizes the slider offers. */
export const SIZE_STEPS: readonly number[] = [32, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
export const MIN_HASHES = 1;
export const MAX_HASHES = 12;
/** Never-added photos checked to measure the observed false-positive rate. */
export const PROBE_COUNT = 10_000;
/** The most items a learner can add. */
export const MAX_ITEMS = 400;
/** Starting settings: Maya's first 20 seen photos in 128 bits, with 3 hash functions (about 5% false positives). */
export const DEFAULTS = { bits: 128, hashes: 3, photos: 20 } as const;

/** murmur3's 32-bit finalizer: every input bit affects every output bit. FNV-1a alone mixes its low bits poorly. */
export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Spacing between the seeds of the k hash functions (the 32-bit golden ratio). */
const SEED_STEP = 0x9e3779b9;

/**
 * Hash function number i (0-based) of a seeded family, applied to an item's FNV-1a hash:
 * a position in an array of `bits` bits. Each i gives a different, independent-looking function.
 */
export function hashPosition(base: number, i: number, bits: number): number {
  return mix32((base + Math.imul(i + 1, SEED_STEP)) >>> 0) % bits;
}

/** The k positions an item maps to. As with any k independent hash functions, two can land on the same bit. */
export function positionsFor(item: string, bits: number, hashes: number): number[] {
  const base = hashString(item);
  return Array.from({ length: hashes }, (_, i) => hashPosition(base, i, bits));
}

export type CheckResult = {
  positions: number[];
  /** Positions whose bit is 0, without repeats. Any one of them proves the item was never added. */
  zeros: number[];
  /** True when every position is 1: the item may be in the set. */
  maybe: boolean;
};

export class BloomFilter {
  readonly array: Uint8Array;
  private ones = 0;

  constructor(
    readonly size: number,
    readonly hashes: number,
  ) {
    this.array = new Uint8Array(size);
  }

  /** Bits currently set to 1. */
  get setCount(): number {
    return this.ones;
  }

  /** Adds an item by its precomputed FNV-1a hash: sets its k bits to 1. */
  addBase(base: number): void {
    for (let i = 0; i < this.hashes; i++) {
      const p = hashPosition(base, i, this.size);
      if (this.array[p] === 0) {
        this.array[p] = 1;
        this.ones++;
      }
    }
  }

  add(item: string): void {
    this.addBase(hashString(item));
  }

  /** Membership test on a precomputed hash, stopping at the first 0 bit. */
  mightContainBase(base: number): boolean {
    for (let i = 0; i < this.hashes; i++) {
      if (this.array[hashPosition(base, i, this.size)] === 0) return false;
    }
    return true;
  }

  check(item: string): CheckResult {
    const positions = positionsFor(item, this.size, this.hashes);
    const zeros = [...new Set(positions.filter((p) => this.array[p] === 0))];
    return { positions, zeros, maybe: zeros.length === 0 };
  }
}

export function buildFilter(items: readonly string[], bits: number, hashes: number): BloomFilter {
  const filter = new BloomFilter(bits, hashes);
  for (const item of items) filter.add(item);
  return filter;
}

/** The textbook estimate of the false-positive rate: (1 − e^(−kn/m))^k. */
export function expectedFalsePositiveRate(bits: number, hashes: number, items: number): number {
  if (items <= 0) return 0;
  return Math.pow(1 - Math.exp((-hashes * items) / bits), hashes);
}

/** The number of hash functions that minimizes the expected rate, before rounding: (m ÷ n) × ln 2. */
export function optimalHashesExact(bits: number, items: number): number {
  return items > 0 ? (bits / items) * Math.LN2 : Infinity;
}

/** The whole number of hash functions, from 1 to 12, with the lowest expected rate. */
export function bestHashes(bits: number, items: number): number {
  let best = MIN_HASHES;
  let bestRate = Infinity;
  for (let k = MIN_HASHES; k <= MAX_HASHES; k++) {
    const rate = expectedFalsePositiveRate(bits, k, items);
    if (rate < bestRate) {
      best = k;
      bestRate = rate;
    }
  }
  return best;
}

/** Bits per item needed for a target false-positive rate, with the best k: −ln p ÷ (ln 2)². */
export function bitsPerItemFor(rate: number): number {
  return -Math.log(rate) / (Math.LN2 * Math.LN2);
}

/** The i-th photo Maya has seen (0-based): distinct five-digit IDs in a fixed, shuffled order. */
export function seenPhoto(i: number): string {
  return `photo-${10_000 + ((i * 7919) % 90_000)}`;
}

/** The i-th photo she has never seen: distinct six-digit IDs, so they never collide with seenPhoto. */
export function unseenPhoto(i: number): string {
  return `photo-${100_000 + ((i * 104_729) % 900_000)}`;
}

const PROBE_NAMES: readonly string[] = Array.from({ length: PROBE_COUNT }, (_, i) => unseenPhoto(i));
const PROBE_BASES = Uint32Array.from(PROBE_NAMES, (name) => hashString(name));
const PROBE_INDEX = new Map(PROBE_NAMES.map((name, i) => [name, i] as const));

export type Observed = { checked: number; falsePositives: number; rate: number };

/** Probes a learner actually added (they can type any name); these are left out of the observed rate. */
function addedProbes(added: ReadonlySet<string>): Set<number> {
  const out = new Set<number>();
  for (const item of added) {
    const i = PROBE_INDEX.get(item);
    if (i !== undefined) out.add(i);
  }
  return out;
}

function observe(filter: BloomFilter, skip: ReadonlySet<number>): Observed {
  let checked = 0;
  let falsePositives = 0;
  for (let i = 0; i < PROBE_COUNT; i++) {
    if (skip.size && skip.has(i)) continue;
    checked++;
    if (filter.mightContainBase(PROBE_BASES[i]!)) falsePositives++;
  }
  return { checked, falsePositives, rate: checked ? falsePositives / checked : 0 };
}

/** Checks every never-added probe photo; each "maybe" is a false positive. */
export function observedFalsePositiveRate(filter: BloomFilter, added: ReadonlySet<string>): Observed {
  return observe(filter, addedProbes(added));
}

export type UnseenCheck = { item: string; maybe: boolean };

/** Checks `count` photos that were never added, starting at probe `start` and wrapping around. */
export function checkUnseen(
  filter: BloomFilter,
  added: ReadonlySet<string>,
  start: number,
  count: number,
): { results: UnseenCheck[]; next: number } {
  const results: UnseenCheck[] = [];
  let i = ((start % PROBE_COUNT) + PROBE_COUNT) % PROBE_COUNT;
  for (let steps = 0; results.length < count && steps < PROBE_COUNT; steps++) {
    const name = PROBE_NAMES[i]!;
    if (!added.has(name)) results.push({ item: name, maybe: filter.mightContainBase(PROBE_BASES[i]!) });
    i = (i + 1) % PROBE_COUNT;
  }
  return { results, next: i };
}

export type CurvePoint = { hashes: number; expected: number; observed: number };

export type Analysis = {
  bits: number;
  hashes: number;
  /** Distinct items added. */
  items: number;
  filter: BloomFilter;
  setCount: number;
  fillRatio: number;
  expected: number;
  observed: Observed;
  /** The whole number of hash functions with the lowest expected rate. */
  best: number;
  /** (m ÷ n) × ln 2, before rounding. */
  bestExact: number;
  /** Expected and observed rates for every k from 1 to 12, at this size and item count. */
  curve: CurvePoint[];
};

/** Everything the view shows, for one set of items, array size and number of hash functions. */
export function analyze(items: readonly string[], bits: number, hashes: number): Analysis {
  const unique = [...new Set(items)];
  const skip = addedProbes(new Set(unique));
  const bases = unique.map((item) => hashString(item));
  const build = (k: number) => {
    const f = new BloomFilter(bits, k);
    for (const b of bases) f.addBase(b);
    return f;
  };
  const curve: CurvePoint[] = [];
  let filter: BloomFilter | undefined;
  let observed: Observed | undefined;
  for (let k = MIN_HASHES; k <= MAX_HASHES; k++) {
    const f = build(k);
    const o = observe(f, skip);
    curve.push({ hashes: k, expected: expectedFalsePositiveRate(bits, k, unique.length), observed: o.rate });
    if (k === hashes) {
      filter = f;
      observed = o;
    }
  }
  if (!filter || !observed) {
    filter = build(hashes);
    observed = observe(filter, skip);
  }
  return {
    bits,
    hashes,
    items: unique.length,
    filter,
    setCount: filter.setCount,
    fillRatio: filter.setCount / bits,
    expected: expectedFalsePositiveRate(bits, hashes, unique.length),
    observed,
    best: bestHashes(bits, unique.length),
    bestExact: optimalHashesExact(bits, unique.length),
    curve,
  };
}
