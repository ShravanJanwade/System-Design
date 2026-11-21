import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_CONFIG,
  HOT_FACTOR,
  MAX_SHARDS,
  MIN_SHARDS,
  biggestCountryShare,
  countryDirectory,
  makePopulation,
  runShardSim,
  signupCuts,
  type ShardConfig,
  type ShardKey,
} from './logic';

const run = (c: Partial<ShardConfig> = {}) => runShardSim(c);
const KEYS: ShardKey[] = ['user-id', 'country', 'signup-date'];
const base = makePopulation(DEFAULT_CONFIG.users, DEFAULT_CONFIG.seed);

describe('the sample population', () => {
  it('is deterministic for a seed', () => {
    expect(makePopulation(500, 7).map((u) => u.photos)).toEqual(makePopulation(500, 7).map((u) => u.photos));
    expect(run().shards.map((s) => s.users)).toEqual(run().shards.map((s) => s.users));
  });

  it('has skewed countries: the United States holds about a third of users', () => {
    const us = biggestCountryShare(run());
    expect(us).toBeGreaterThan(0.31);
    expect(us).toBeLessThan(0.37);
    const canada = base.filter((u) => u.country === COUNTRIES.length - 1).length / base.length;
    expect(canada).toBeLessThan(0.02);
  });

  it('grows over time: more people signed up in the last year than in the two before it', () => {
    const lastYear = base.filter((u) => u.age < 12).length;
    const before = base.filter((u) => u.age >= 12 && u.age < 36).length;
    expect(lastYear).toBeGreaterThan(before);
  });

  it('has a few heavy users: the top 1% of writers do far more than 1% of writes', () => {
    const writes = base.map((u) => u.writes).sort((a, b) => b - a);
    const total = writes.reduce((s, w) => s + w, 0);
    const top = writes.slice(0, base.length / 100).reduce((s, w) => s + w, 0);
    expect(top / total).toBeGreaterThan(0.08);
  });
});

describe('runShardSim basics', () => {
  it('shares add up to one for every key and shard count', () => {
    for (const key of KEYS) {
      for (const shards of [2, 5, 16]) {
        const r = run({ key, shards, celebrity: true });
        for (const m of ['data', 'reads', 'writes', 'traffic'] as const) {
          expect(r.shards.reduce((s, x) => s + x[m], 0)).toBeCloseTo(1, 6);
        }
        expect(r.shards.reduce((s, x) => s + x.users, 0)).toBe(DEFAULT_CONFIG.users + 1);
      }
    }
  });

  it('keeps the shard count between 2 and 16', () => {
    expect(run({ shards: 1 }).shards).toHaveLength(MIN_SHARDS);
    expect(run({ shards: 40 }).shards).toHaveLength(MAX_SHARDS);
  });

  it('flags a hot spot at 1.3 times an even share', () => {
    const r = run({ key: 'country', shards: 8 });
    for (const s of r.shards) expect(s.hot.data).toBe(s.data >= HOT_FACTOR / 8);
  });

  it('puts the celebrity on exactly one shard, whatever the key', () => {
    for (const key of KEYS) {
      const r = run({ key, celebrity: true });
      expect(r.shards.filter((s) => s.celebrity)).toHaveLength(1);
      expect(r.celebrityShard).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('challenge 1: hashing the user ID spreads evenly', () => {
  it('no shard is a hot spot at any shard count, and the busiest is within about 20% of even', () => {
    for (let shards = MIN_SHARDS; shards <= MAX_SHARDS; shards++) {
      const r = run({ shards });
      expect(r.hotSpots, `${shards} shards`).toBe(0);
      expect(r.peak.data).toBeLessThan(1.2);
      expect(r.peak.reads).toBeLessThan(1.2);
      expect(r.peak.writes).toBeLessThan(1.2);
      expect(r.newUserShards).toBe(shards);
    }
  });
});

describe('challenge 2: country cannot be split', () => {
  it('looks even with two shards', () => {
    const r = run({ key: 'country', shards: 2 });
    expect(r.hotSpots).toBe(0);
    expect(r.peak.data).toBeLessThan(1.05);
  });

  it('at four shards the United States fills one shard on its own, a third of all users', () => {
    const r = run({ key: 'country', shards: 4 });
    const us = r.shards[r.busiest.data]!;
    expect(us.holds).toBe('United States');
    expect(us.data).toBeGreaterThan(0.31);
    expect(r.peak.data).toBeGreaterThan(HOT_FACTOR);
    expect(r.peak.data).toBeLessThan(1.5);
    expect(us.hot.data && us.hot.reads && us.hot.writes).toBe(true);
  });

  it('more shards never bring the busiest shard below the United States share', () => {
    const us = biggestCountryShare(run());
    for (let shards = 4; shards <= MAX_SHARDS; shards++) {
      const r = run({ key: 'country', shards });
      expect(r.shards[r.busiest.data]!.data).toBeGreaterThan(us - 0.01);
    }
    expect(run({ key: 'country', shards: 8 }).peak.data).toBeGreaterThan(2.5);
  });

  it('past twelve shards, the extra shards sit empty', () => {
    const r = run({ key: 'country', shards: 16 });
    expect(r.emptyShards).toBe(16 - COUNTRIES.length);
    expect(r.peak.data).toBeGreaterThan(5);
    expect(run({ key: 'country', shards: 12 }).emptyShards).toBe(0);
  });

  it('the lookup table places the biggest countries first, each on the emptiest shard', () => {
    const table = countryDirectory(base, 4);
    expect(table[0]).toBe(0);
    expect(table[1]).toBe(1);
    expect(new Set(table).size).toBe(4);
  });
});

describe('challenge 3: signup date sends every new user to the last shard', () => {
  it('the ranges were drawn so that each shard got the same number of users', () => {
    const cuts = signupCuts(base, 4);
    expect(cuts).toHaveLength(3);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]!).toBeLessThan(cuts[i - 1]!);
    const r = run({ key: 'signup-date', shards: 4 });
    const old = r.shards.map((s) => s.users - s.newUsers);
    expect(Math.max(...old) - Math.min(...old)).toBeLessThanOrEqual(2);
  });

  it('every new user lands on one shard, at any shard count', () => {
    for (let shards = MIN_SHARDS; shards <= MAX_SHARDS; shards++) {
      const r = run({ key: 'signup-date', shards });
      expect(r.newUserShards).toBe(1);
      expect(r.newUserTop).toBe(1);
      expect(r.shards[shards - 1]!.newUsers).toBeGreaterThan(0);
    }
  });

  it('the newest shard takes most of the writes, while the oldest holds most of the data', () => {
    const r = run({ key: 'signup-date', shards: 4 });
    const newest = r.shards[3]!;
    const oldest = r.shards[0]!;
    expect(newest.writes).toBeGreaterThan(0.4);
    expect(newest.hot.writes && newest.hot.reads).toBe(true);
    expect(r.busiest.writes).toBe(3);
    expect(oldest.data).toBeGreaterThan(0.4);
    expect(oldest.hot.data).toBe(true);
    expect(oldest.writes).toBeLessThan(r.even);
    expect(newest.data).toBeLessThan(r.even);
  });
});

describe('challenge 4: a celebrity makes one shard hot, and more shards do not help', () => {
  it('with four shards, the celebrity’s shard serves well over its share of reads', () => {
    const r = run({ celebrity: true });
    const s = r.shards[r.celebrityShard]!;
    expect(s.reads).toBeGreaterThan(0.35);
    expect(s.hot.reads).toBe(true);
    expect(r.busiest.reads).toBe(r.celebrityShard);
    expect(r.hotSpots).toBe(1);
  });

  it('with sixteen shards it still serves about a quarter of reads, four times an even share', () => {
    const r4 = run({ celebrity: true, shards: 4 });
    const r16 = run({ celebrity: true, shards: 16 });
    const share16 = r16.shards[r16.celebrityShard]!.reads;
    expect(share16).toBeGreaterThan(0.2);
    expect(r16.peak.reads).toBeGreaterThan(3.5);
    expect(r16.peak.reads).toBeGreaterThan(r4.peak.reads * 2);
  });

  it('without the celebrity the same shards are calm', () => {
    expect(run({ shards: 16 }).peak.reads).toBeLessThan(1.15);
  });
});
