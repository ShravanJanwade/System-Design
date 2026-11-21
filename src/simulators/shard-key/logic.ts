/**
 * Shard-key visualizer: a seeded sample of Snapgram's users, split across shards three ways.
 *
 * Each sample user has a country (a few countries hold most users), a signup time (sign-ups grow
 * about 8% a month for three years), photos stored (older accounts have more), and reads and
 * writes (recent accounts are more active, and a few heavy users do far more than most).
 *
 * - User ID: hash partitioning. shard = hash(user ID) % N.
 * - Country: a lookup table (a directory), built by placing the biggest countries first, each on
 *   the shard with the fewest users so far. It can place a country anywhere, but never split one.
 * - Signup date: range partitioning. The ranges were drawn a month ago so that each shard got the
 *   same number of users; everyone who signed up since then lands on the last shard.
 *
 * The celebrity, when added, is a brand-new user whose posts draw a fifth of all reads.
 */
import { createRng, hashString, type Rng } from '@/lib/random';

export type ShardKey = 'user-id' | 'country' | 'signup-date';

export const SHARD_KEYS: ShardKey[] = ['user-id', 'country', 'signup-date'];

export const SHARD_KEY_LABEL: Record<ShardKey, string> = {
  'user-id': 'User ID',
  country: 'Country',
  'signup-date': 'Signup date',
};

/** How each key splits the data. */
export const METHOD_LABEL: Record<ShardKey, string> = {
  'user-id': 'Hash partitioning',
  country: 'A lookup table (directory)',
  'signup-date': 'Range partitioning',
};

/** Illustrative mix of Snapgram's users by country: a few countries hold most of them. */
export const COUNTRIES: readonly { name: string; share: number }[] = [
  { name: 'United States', share: 0.34 },
  { name: 'India', share: 0.2 },
  { name: 'Brazil', share: 0.11 },
  { name: 'Indonesia', share: 0.08 },
  { name: 'United Kingdom', share: 0.06 },
  { name: 'Japan', share: 0.05 },
  { name: 'Germany', share: 0.04 },
  { name: 'Mexico', share: 0.04 },
  { name: 'Singapore', share: 0.03 },
  { name: 'France', share: 0.02 },
  { name: 'Nigeria', share: 0.02 },
  { name: 'Canada', share: 0.01 },
];

export const MIN_SHARDS = 2;
export const MAX_SHARDS = 16;

/** A shard is a hot spot when it gets at least this many times an even share of data, reads or writes. */
export const HOT_FACTOR = 1.3;

/** Illustrative totals for Snapgram's photo databases at about 10 million daily users. */
export const TOTAL_DATA_TB = 4;
export const PEAK_READS = 16_000;
export const PEAK_WRITES = 4_000;

/** With the celebrity, their posts draw this share of all reads... */
export const CELEB_READ_SHARE = 0.2;
/** ...and likes and comments on those posts, stored with them, this share of all writes. */
export const CELEB_WRITE_SHARE = 0.1;
/** The celebrity's country. */
export const CELEB_COUNTRY = 2;

/** Months of sign-ups in the sample. The last month came after the shard ranges were drawn. */
export const MONTHS = 36;
/** Sign-ups each month, compared with the month before. */
export const GROWTH = 1.08;

export type ShardConfig = {
  key: ShardKey;
  shards: number;
  celebrity: boolean;
  /** Sample users, standing in for about 10 million real ones. */
  users: number;
  seed: number;
};

export const DEFAULT_CONFIG: ShardConfig = {
  key: 'user-id',
  shards: 4,
  celebrity: false,
  users: 20_000,
  seed: 20261118,
};

export type SampleUser = {
  id: string;
  hash: number;
  /** Index into COUNTRIES. */
  country: number;
  /** Months since the user signed up. Below 1: signed up after the shard ranges were drawn. */
  age: number;
  /** Photos stored, relative units. */
  photos: number;
  /** Reads of this user's photos and profile, relative units. */
  reads: number;
  /** Writes stored with this user (uploads, likes and comments on their posts), relative units. */
  writes: number;
  celebrity?: boolean;
};

/* ------------------------------------------------------------------ */
/* Hashing and the population                                          */
/* ------------------------------------------------------------------ */

/** Final mixing step from MurmurHash3, so similar IDs still spread evenly. */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function keyHash(key: string): number {
  return mix32(hashString(key));
}

/** Expected activity of an account by age in months: new accounts are busy, old ones go quiet. */
export function activity(age: number): number {
  return 0.3 + 0.6 * Math.exp(-age / 6);
}

/** Active months so far, which sets how many photos an account has piled up. */
export function activeMonths(age: number): number {
  return 0.3 * age + 3.6 * (1 - Math.exp(-age / 6));
}

/** Log-normal with mean 1: most values near 1, a long tail of big ones. */
function lognormal(rng: Rng, sigma: number): number {
  const u1 = 1 - rng.next();
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * z - (sigma * sigma) / 2);
}

function pickWeighted(rng: Rng, cumulative: number[]): number {
  const u = rng.next() * cumulative[cumulative.length - 1]!;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulative[mid]! <= u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const populations = new Map<string, SampleUser[]>();

/** The sample of users. It depends only on the size and the seed, so every shard key sees the same people. */
export function makePopulation(users: number, seed: number): SampleUser[] {
  const cacheKey = `${users}:${seed}`;
  const cached = populations.get(cacheKey);
  if (cached) return cached;

  const rng = createRng(seed);
  const monthCum: number[] = [];
  let total = 0;
  for (let m = 0; m <= MONTHS; m++) {
    total += GROWTH ** m;
    monthCum.push(total);
  }
  const countryCum: number[] = [];
  total = 0;
  for (const c of COUNTRIES) {
    total += c.share;
    countryCum.push(total);
  }

  const out: SampleUser[] = [];
  for (let i = 0; i < users; i++) {
    const month = pickWeighted(rng, monthCum);
    const age = MONTHS - month + rng.next();
    const country = pickWeighted(rng, countryCum);
    const heavy = rng.chance(0.005) ? 12 : 1;
    const rate = lognormal(rng, 0.8) * heavy;
    const popularity = Math.min(30, lognormal(rng, 1.2));
    const act = activity(age);
    const id = `user-${100_000 + i}`;
    out.push({
      id,
      hash: keyHash(id),
      country,
      age,
      photos: 8 * rate * activeMonths(age),
      reads: popularity * act,
      writes: rate * act,
    });
  }
  populations.set(cacheKey, out);
  return out;
}

/** The celebrity: a brand-new account whose posts draw CELEB_READ_SHARE of all reads. */
export function makeCelebrity(base: SampleUser[]): SampleUser {
  const reads = base.reduce((s, u) => s + u.reads, 0);
  const writes = base.reduce((s, u) => s + u.writes, 0);
  const photos = base.reduce((s, u) => s + u.photos, 0) / base.length;
  const id = 'user-celebrity';
  return {
    id,
    hash: keyHash(id),
    country: CELEB_COUNTRY,
    age: 0.2,
    photos,
    reads: (reads * CELEB_READ_SHARE) / (1 - CELEB_READ_SHARE),
    writes: (writes * CELEB_WRITE_SHARE) / (1 - CELEB_WRITE_SHARE),
    celebrity: true,
  };
}

/* ------------------------------------------------------------------ */
/* Placing users on shards                                             */
/* ------------------------------------------------------------------ */

export type Placement = {
  /** Shard index for each user, in the order given. */
  shardOf: number[];
  /** What each shard holds, in words. */
  holds: string[];
};

/** "3" for whole months from 3 up, "1.4" below that. */
function formatMonths(a: number): string {
  return a >= 3 ? String(Math.round(a)) : a.toFixed(1);
}

/**
 * The country lookup table: biggest countries first, each on the shard with the fewest users so far.
 * Built from the users who existed before the celebrity joined.
 */
export function countryDirectory(base: SampleUser[], n: number): number[] {
  const counts = COUNTRIES.map((_, c) => base.filter((u) => u.country === c).length);
  const order = COUNTRIES.map((_, c) => c).sort((a, b) => counts[b]! - counts[a]! || a - b);
  const load = new Array<number>(n).fill(0);
  const table = new Array<number>(COUNTRIES.length).fill(0);
  for (const c of order) {
    let best = 0;
    for (let s = 1; s < n; s++) if (load[s]! < load[best]!) best = s;
    table[c] = best;
    load[best]! += counts[c]!;
  }
  return table;
}

/**
 * Range boundaries by signup date, oldest shard first: the age (in months) where each shard after the
 * first begins. Drawn a month ago from the users who existed then, so each shard got the same number.
 */
export function signupCuts(base: SampleUser[], n: number): number[] {
  const ages = base
    .filter((u) => u.age >= 1)
    .map((u) => u.age)
    .sort((a, b) => b - a);
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) cuts.push(ages[Math.min(ages.length - 1, Math.round((k * ages.length) / n))]!);
  return cuts;
}

export function place(users: SampleUser[], base: SampleUser[], key: ShardKey, n: number): Placement {
  switch (key) {
    case 'user-id':
      return {
        shardOf: users.map((u) => u.hash % n),
        holds: Array.from({ length: n }, (_, s) => `Users with hash(user ID) % ${n} = ${s}`),
      };
    case 'country': {
      const table = countryDirectory(base, n);
      const holds = Array.from({ length: n }, (_, s) => {
        const names = COUNTRIES.flatMap((c, i) => (table[i] === s ? [c.name] : []));
        return names.length ? names.join(', ') : 'No countries: empty';
      });
      return { shardOf: users.map((u) => table[u.country]!), holds };
    }
    case 'signup-date': {
      const cuts = signupCuts(base, n);
      const shardOf = users.map((u) => {
        let s = 0;
        for (const cut of cuts) if (u.age < cut) s++;
        return s;
      });
      const holds = Array.from({ length: n }, (_, s) => {
        if (s === 0) return `Joined ${formatMonths(cuts[0]!)} or more months ago`;
        if (s === n - 1) return `Joined in the last ${formatMonths(cuts[n - 2]!)} months, plus every new user`;
        return `Joined ${formatMonths(cuts[s]!)} to ${formatMonths(cuts[s - 1]!)} months ago`;
      });
      return { shardOf, holds };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type Metric = 'data' | 'reads' | 'writes';
export const METRICS: Metric[] = ['data', 'reads', 'writes'];

export type ShardStats = {
  index: number;
  name: string;
  holds: string;
  /** Sample users on the shard, and how many of them signed up after the ranges were drawn. */
  users: number;
  newUsers: number;
  /** Shares of all photos stored, all reads and all writes. */
  data: number;
  reads: number;
  writes: number;
  /** Share of reads plus writes, in requests. */
  traffic: number;
  dataTb: number;
  readsPerSec: number;
  writesPerSec: number;
  hot: Record<Metric, boolean>;
  celebrity: boolean;
  empty: boolean;
};

export type ShardResult = {
  config: ShardConfig;
  shards: ShardStats[];
  /** An even share: 1 / N. */
  even: number;
  /** The busiest shard's share divided by an even share. */
  peak: Record<Metric | 'traffic', number>;
  busiest: Record<Metric | 'traffic', number>;
  /** Shards with at least one hot metric. */
  hotSpots: number;
  emptyShards: number;
  /** Shards that received at least one user who signed up after the ranges were drawn. */
  newUserShards: number;
  /** Share of those new users on the shard that got the most of them. */
  newUserTop: number;
  /** Share of all users who are new. */
  newUserShare: number;
  /** Index of the celebrity's shard, or -1. */
  celebrityShard: number;
  totalReadsPerSec: number;
  totalWritesPerSec: number;
};

export function shardName(index: number): string {
  return `Shard ${index + 1}`;
}

export function runShardSim(partial: Partial<ShardConfig> = {}): ShardResult {
  const c: ShardConfig = { ...DEFAULT_CONFIG, ...partial };
  const n = Math.min(MAX_SHARDS, Math.max(MIN_SHARDS, Math.round(c.shards)));
  const base = makePopulation(c.users, c.seed);
  const users = c.celebrity ? [...base, makeCelebrity(base)] : base;
  const { shardOf, holds } = place(users, base, c.key, n);

  const sum = { photos: 0, reads: 0, writes: 0 };
  const per = Array.from({ length: n }, () => ({ users: 0, newUsers: 0, photos: 0, reads: 0, writes: 0, celebrity: false }));
  let newUsers = 0;
  users.forEach((u, i) => {
    const s = per[shardOf[i]!]!;
    s.users++;
    s.photos += u.photos;
    s.reads += u.reads;
    s.writes += u.writes;
    if (u.age < 1) {
      s.newUsers++;
      newUsers++;
    }
    if (u.celebrity) s.celebrity = true;
    sum.photos += u.photos;
    sum.reads += u.reads;
    sum.writes += u.writes;
  });

  const totalReadsPerSec = c.celebrity ? PEAK_READS / (1 - CELEB_READ_SHARE) : PEAK_READS;
  const totalWritesPerSec = c.celebrity ? PEAK_WRITES / (1 - CELEB_WRITE_SHARE) : PEAK_WRITES;
  const even = 1 / n;
  const hotAt = HOT_FACTOR * even;

  const shards: ShardStats[] = per.map((s, i) => {
    const data = sum.photos ? s.photos / sum.photos : 0;
    const reads = sum.reads ? s.reads / sum.reads : 0;
    const writes = sum.writes ? s.writes / sum.writes : 0;
    const readsPerSec = reads * totalReadsPerSec;
    const writesPerSec = writes * totalWritesPerSec;
    return {
      index: i,
      name: shardName(i),
      holds: holds[i]!,
      users: s.users,
      newUsers: s.newUsers,
      data,
      reads,
      writes,
      traffic: (readsPerSec + writesPerSec) / (totalReadsPerSec + totalWritesPerSec),
      dataTb: data * TOTAL_DATA_TB,
      readsPerSec,
      writesPerSec,
      hot: { data: data >= hotAt, reads: reads >= hotAt, writes: writes >= hotAt },
      celebrity: s.celebrity,
      empty: s.users === 0,
    };
  });

  const top = (m: Metric | 'traffic') => shards.reduce((best, s) => (s[m] > shards[best]![m] ? s.index : best), 0);
  const busiest = { data: top('data'), reads: top('reads'), writes: top('writes'), traffic: top('traffic') };
  const peak = {
    data: shards[busiest.data]!.data / even,
    reads: shards[busiest.reads]!.reads / even,
    writes: shards[busiest.writes]!.writes / even,
    traffic: shards[busiest.traffic]!.traffic / even,
  };

  return {
    config: { ...c, shards: n },
    shards,
    even,
    peak,
    busiest,
    hotSpots: shards.filter((s) => s.hot.data || s.hot.reads || s.hot.writes).length,
    emptyShards: shards.filter((s) => s.empty).length,
    newUserShards: shards.filter((s) => s.newUsers > 0).length,
    newUserTop: newUsers ? Math.max(...shards.map((s) => s.newUsers)) / newUsers : 0,
    newUserShare: newUsers / users.length,
    celebrityShard: shards.findIndex((s) => s.celebrity),
    totalReadsPerSec,
    totalWritesPerSec,
  };
}

/** Share of all users in the biggest country of the sample. */
export function biggestCountryShare(r: ShardResult): number {
  const base = makePopulation(r.config.users, r.config.seed);
  return base.filter((u) => u.country === 0).length / base.length;
}
