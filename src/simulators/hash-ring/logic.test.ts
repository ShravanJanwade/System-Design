import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VNODES,
  KEY_COUNT,
  MAX_SERVERS,
  RING_SIZE,
  buildRing,
  changedArcs,
  makeKeys,
  moduloOwner,
  moduloStayShare,
  nextServerId,
  ringOwner,
  runRing,
  sampleOwners,
  successorIndex,
  type VNode,
} from './logic';

const four = [1, 2, 3, 4];
const five = [1, 2, 3, 4, 5];

describe('the ring', () => {
  const ring: VNode[] = [
    { pos: 100, server: 1, replica: 0 },
    { pos: 200, server: 2, replica: 0 },
    { pos: 300, server: 3, replica: 0 },
  ];

  it('gives a key to the first server position clockwise, wrapping past the top', () => {
    expect(ringOwner(ring, 50)).toBe(1);
    expect(ringOwner(ring, 100)).toBe(1);
    expect(ringOwner(ring, 101)).toBe(2);
    expect(ringOwner(ring, 250)).toBe(3);
    expect(ringOwner(ring, 301)).toBe(1);
    expect(ringOwner(ring, RING_SIZE - 1)).toBe(1);
    expect(successorIndex(ring, 301)).toBe(0);
  });

  it('places every virtual node, sorted around the ring', () => {
    const r = buildRing(four, 50);
    expect(r).toHaveLength(200);
    for (let i = 1; i < r.length; i++) expect(r[i]!.pos).toBeGreaterThanOrEqual(r[i - 1]!.pos);
    expect(new Set(r.filter((v) => v.server === 3).map((v) => v.replica)).size).toBe(50);
  });

  it('hash % N picks from the servers in order', () => {
    expect(moduloOwner(four, 0)).toBe(1);
    expect(moduloOwner(four, 6)).toBe(3);
    expect(moduloOwner([1, 3, 4], 4)).toBe(3);
  });

  it('is deterministic, and every key has exactly one owner', () => {
    const a = runRing({ servers: four, previous: null, vnodes: 20 });
    const b = runRing({ servers: four, previous: null, vnodes: 20 });
    expect(a.loads).toEqual(b.loads);
    expect(a.loads.reduce((s, l) => s + l.keys, 0)).toBe(KEY_COUNT);
    expect(a.loads.reduce((s, l) => s + l.arc, 0)).toBeCloseTo(1, 9);
    expect(makeKeys()).toHaveLength(KEY_COUNT);
    expect(a.change).toBeNull();
  });

  it('gives a joining server the lowest free number', () => {
    expect(nextServerId(four)).toBe(5);
    expect(nextServerId([1, 3, 4])).toBe(2);
  });
});

describe('challenge 1: growing from four nodes to five', () => {
  const r = runRing({ servers: five, previous: four, vnodes: DEFAULT_VNODES });
  const c = r.change!;

  it('hash % N moves about four keys in five', () => {
    expect(moduloStayShare(4, 5)).toBeCloseTo(0.2, 9);
    expect(c.moduloMoved).toBeGreaterThan(0.77);
    expect(c.moduloMoved).toBeLessThan(0.83);
  });

  it('the ring moves about a fifth, every one of them to the new node', () => {
    expect(c.kind).toBe('add');
    expect(c.server).toBe(5);
    expect(c.ringMoved).toBeGreaterThan(0.17);
    expect(c.ringMoved).toBeLessThan(0.23);
    expect(c.ringMoved).toBeCloseTo(c.mustMove, 9);
    expect(c.ringMoved).toBeCloseTo(r.loads.find((l) => l.server === 5)!.share, 9);
  });

  it('only the stretches of ring the new node took over change owner', () => {
    expect(Math.abs(c.changedLength - c.ringMoved)).toBeLessThan(0.02);
    const keys = makeKeys();
    const before = buildRing(four, DEFAULT_VNODES);
    keys.forEach((k, i) => {
      if (c.movedRing[i]) expect(ringOwner(r.ring, k.pos)).toBe(5);
      else expect(ringOwner(r.ring, k.pos)).toBe(ringOwner(before, k.pos));
    });
  });

  it('the named sample keys report owners from both schemes', () => {
    const samples = sampleOwners(r);
    expect(samples).toHaveLength(6);
    for (const s of samples) {
      if (s.ring[0] !== s.ring[1]) expect(s.ring[1]).toBe(5);
    }
  });
});

describe('challenge 2: a node leaves', () => {
  it('only its own keys move, and with many virtual nodes they spread over every other node', () => {
    const before = runRing({ servers: four, previous: null, vnodes: DEFAULT_VNODES });
    const r = runRing({ servers: [1, 3, 4], previous: four, vnodes: DEFAULT_VNODES });
    const c = r.change!;
    expect(c.kind).toBe('remove');
    expect(c.server).toBe(2);
    expect(c.ringMoved).toBeCloseTo(c.mustMove, 9);
    expect(c.ringMoved).toBeCloseTo(before.loads.find((l) => l.server === 2)!.share, 9);
    expect(c.flows.map((f) => f.server).sort()).toEqual([1, 3, 4]);
    for (const f of c.flows) expect(f.share).toBeGreaterThan(0.15);
  });

  it('hash % N moves about three keys in four, though only a quarter had to', () => {
    const c = runRing({ servers: [1, 3, 4], previous: four, vnodes: DEFAULT_VNODES }).change!;
    expect(c.moduloMoved).toBeGreaterThan(0.7);
    expect(c.moduloMoved).toBeLessThan(0.8);
    expect(c.mustMove).toBeLessThan(0.3);
  });

  it('with one position per server, all of its keys land on a single neighbor', () => {
    const c = runRing({ servers: [1, 3, 4], previous: four, vnodes: 1 }).change!;
    expect(c.flows).toHaveLength(1);
    expect(c.flows[0]!.share).toBe(1);
  });
});

describe('challenge 3: virtual nodes even out the load', () => {
  it('with one position per server the load is lopsided', () => {
    const r = runRing({ servers: four, previous: null, vnodes: 1 });
    const shares = r.loads.map((l) => l.share);
    expect(Math.max(...shares) / Math.min(...shares)).toBeGreaterThan(3);
    expect(runRing({ servers: [1, 2, 3, 4, 5, 6, 7, 8], previous: null, vnodes: 1 }).peak).toBeGreaterThan(2);
  });

  it('with the default number of virtual nodes every node is close to a fair share', () => {
    for (let n = 2; n <= MAX_SERVERS; n++) {
      const servers = Array.from({ length: n }, (_, i) => i + 1);
      const r = runRing({ servers, previous: null, vnodes: DEFAULT_VNODES });
      expect(r.peak, `${n} servers`).toBeLessThan(1.15);
      for (const l of r.loads) expect(l.share / r.fair).toBeGreaterThan(0.85);
    }
  });
});

describe('challenge 4: one position per server takes keys from one neighbor', () => {
  it('a new node with one position takes keys from just one server', () => {
    const c = runRing({ servers: five, previous: four, vnodes: 1 }).change!;
    expect(c.flows).toHaveLength(1);
    expect(c.flows[0]!.share).toBe(1);
    expect(c.changedArcs).toHaveLength(1);
  });

  it('with many virtual nodes it takes a slice from every server', () => {
    const c = runRing({ servers: five, previous: four, vnodes: DEFAULT_VNODES }).change!;
    expect(c.flows).toHaveLength(4);
    for (const f of c.flows) {
      expect(f.share).toBeGreaterThan(0.15);
      expect(f.share).toBeLessThan(0.4);
    }
    expect(c.changedArcs.length).toBeGreaterThan(50);
  });
});

describe('hash % N in general', () => {
  it('going from N to N + 1 keeps only about 1 / (N + 1) of keys in place', () => {
    expect(moduloStayShare(10, 11)).toBeCloseTo(1 / 11, 9);
    const servers = Array.from({ length: 11 }, (_, i) => i + 1);
    const c = runRing({ servers, previous: servers.slice(0, 10), vnodes: DEFAULT_VNODES }).change!;
    expect(c.moduloMoved).toBeGreaterThan(0.89);
    expect(c.moduloMoved).toBeLessThan(0.93);
    expect(c.ringMoved).toBeLessThan(0.12);
  });

  it('doubling from 4 to 8 keeps half in place', () => {
    expect(moduloStayShare(4, 8)).toBe(0.5);
  });
});

describe('changedArcs', () => {
  it('finds no change between identical rings', () => {
    const r = buildRing(four, 5);
    expect(changedArcs(r, r)).toEqual({ arcs: [], length: 0 });
  });

  it('with one position each, a joining node takes over the single stretch that ends at its position', () => {
    const before = buildRing(four, 1);
    const after = buildRing(five, 1);
    const { arcs } = changedArcs(before, after);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.to).toBe(after.find((v) => v.server === 5)!.pos);
  });
});
