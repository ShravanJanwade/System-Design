import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import {
  DEFAULT_CONFIG,
  READ_MODES,
  choose,
  fastWritesFreshReads,
  listReplicas,
  majorityOf,
  majorityUnderFailure,
  normalizeConfig,
  playRound,
  simulateQuorum,
  staleChance,
  staleReadPossible,
  writeAllWithFailure,
  type QuorumConfig,
} from './logic';
import { quorumDiagram, replicaEdge, replicaId } from './diagram';

const sim = (c: Partial<QuorumConfig> = {}) => simulateQuorum(c);

/** Every subset of 0..n-1, as lists of indexes. */
function subsets(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) out.push(Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i)));
  return out;
}

describe('basics', () => {
  const base = sim();

  it('is deterministic for a seed', () => {
    const again = sim();
    expect(again.stats).toEqual(base.stats);
    expect(again.round).toEqual(base.round);
  });

  it('keeps settings in range', () => {
    const c = normalizeConfig({ n: 3, r: 7, w: 0, failed: [5, 1, 1, -1] });
    expect(c.r).toBe(3);
    expect(c.w).toBe(1);
    expect(c.failed).toEqual([1]);
  });

  it('counts combinations and names replicas', () => {
    expect(choose(3, 1)).toBe(3);
    expect(choose(5, 2)).toBe(10);
    expect(choose(2, 3)).toBe(0);
    expect(majorityOf(3)).toBe(2);
    expect(majorityOf(4)).toBe(3);
    expect(majorityOf(5)).toBe(3);
    expect(listReplicas([2])).toBe('Replica 3');
    expect(listReplicas([2, 0])).toBe('Replicas 1 and 3');
    expect(listReplicas([0, 1, 3])).toBe('Replicas 1, 2 and 4');
  });

  it('starts at N = 3, W = 2, R = 2: overlap guaranteed, both available, no stale reads', () => {
    expect(base.config).toMatchObject({ n: 3, w: 2, r: 2 });
    expect(base.math.guaranteed).toBe(true);
    expect(base.math.minOverlap).toBe(1);
    expect(base.math.writeAvailable && base.math.readAvailable).toBe(true);
    expect(base.stats.staleReads).toBe(0);
    expect(base.round.fresh).toBe(true);
  });

  it('no challenge is already complete at the starting settings', () => {
    const c = base.config;
    expect(staleReadPossible(c)).toBe(false);
    expect(majorityUnderFailure(c)).toBe(false);
    expect(fastWritesFreshReads(c)).toBe(false);
    expect(writeAllWithFailure(c)).toBe(false);
  });

  it('draws the same response times whatever N, R and W are', () => {
    const a = playRound(normalizeConfig({ n: 5, w: 1, r: 4 }), 3);
    const b = playRound(normalizeConfig({ n: 3, w: 3, r: 1 }), 3);
    for (let i = 0; i < 3; i++) {
      expect(a.replicas[i]!.writeMs).toBe(b.replicas[i]!.writeMs);
      expect(a.replicas[i]!.readMs).toBe(b.replicas[i]!.readMs);
    }
  });

  it('a write confirms with the first W replicas to answer and waits for the W-th', () => {
    for (let k = 0; k < 50; k++) {
      const rd = playRound(normalizeConfig({ n: 5, w: 3, r: 3 }), k);
      expect(rd.writeSet).toHaveLength(3);
      for (const x of rd.replicas) {
        if (x.inWrite) expect(x.writeMs).toBeLessThanOrEqual(rd.writeWaitMs!);
        else expect(x.writeMs).toBeGreaterThanOrEqual(rd.writeWaitMs!);
      }
    }
  });
});

describe('why R + W > N works', () => {
  it('every read overlaps the write by at least R + W − N replicas and sees the latest version, whatever is down', () => {
    for (let n = 1; n <= 5; n++) {
      for (let w = 1; w <= n; w++) {
        for (let r = 1; r <= n; r++) {
          if (r + w <= n) continue;
          for (const failed of subsets(n)) {
            for (const readMode of READ_MODES) {
              const c = normalizeConfig({ n, w, r, failed, readMode });
              for (let k = 0; k < 12; k++) {
                const rd = playRound(c, k);
                if (!rd.writeOk || !rd.readOk) continue;
                expect(rd.overlap.length).toBeGreaterThanOrEqual(r + w - n);
                expect(rd.fresh).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('a read that returns the new version repairs the replicas that answered with the old one', () => {
    let repairedSome = false;
    for (let k = 0; k < 100; k++) {
      const rd = playRound(normalizeConfig({ n: 3, w: 2, r: 2 }), k);
      for (const i of rd.repaired) {
        expect(rd.readSet).toContain(i);
        expect(rd.writeSet).not.toContain(i);
        repairedSome = true;
      }
    }
    expect(repairedSome).toBe(true);
  });
});

describe('challenge 1: R + W ≤ N allows stale reads', () => {
  it('in the worst case every read misses the write', () => {
    for (const [n, w, r] of [
      [3, 1, 1],
      [3, 1, 2],
      [3, 2, 1],
      [5, 2, 3],
    ] as const) {
      const res = sim({ n, w, r, readMode: 'worst' });
      expect(staleReadPossible(res.config)).toBe(true);
      expect(res.math.guaranteed).toBe(false);
      expect(res.stats.staleReads).toBe(res.stats.rounds);
      expect(res.round.overlap).toEqual([]);
      expect(res.round.repaired).toEqual([]);
    }
  });

  it('random reads miss it about as often as the exact formula says', () => {
    const cases: [number, number, number, number][] = [
      [3, 1, 1, 2 / 3],
      [3, 2, 1, 1 / 3],
      [4, 2, 2, 1 / 6],
      [5, 2, 2, 3 / 10],
    ];
    for (const [n, w, r, exact] of cases) {
      expect(staleChance(n, w, r)).toBeCloseTo(exact, 10);
      const res = sim({ n, w, r });
      expect(res.math.staleChance).toBeCloseTo(exact, 10);
      expect(Math.abs(res.stats.staleShare - exact)).toBeLessThan(0.05);
    }
  });

  it('a stale read never happens when the write or the read is refused', () => {
    const res = sim({ n: 3, w: 1, r: 1, failed: [0, 1, 2] });
    expect(res.math.staleChance).toBe(0);
    expect(res.stats.staleReads).toBe(0);
  });
});

describe('challenge 2: majority quorums under failure', () => {
  it('N = 3, W = 2, R = 2 survives one failed replica, not two', () => {
    const one = sim({ failed: [2] });
    expect(majorityUnderFailure(one.config)).toBe(true);
    expect(one.math.writeAvailable && one.math.readAvailable).toBe(true);
    expect(one.stats.staleReads).toBe(0);
    expect(one.math.writeTolerates).toBe(1);
    expect(one.math.readTolerates).toBe(1);

    const two = sim({ failed: [1, 2] });
    expect(two.math.writeAvailable).toBe(false);
    expect(two.math.readAvailable).toBe(false);
    expect(two.round.writeOk || two.round.readOk).toBe(false);
  });

  it('N = 5 with majorities of 3 survives two failed replicas, not three', () => {
    expect(sim({ n: 5, w: 3, r: 3, failed: [0, 4] }).math).toMatchObject({ writeAvailable: true, readAvailable: true, guaranteed: true });
    expect(sim({ n: 5, w: 3, r: 3, failed: [0, 2, 4] }).math).toMatchObject({ writeAvailable: false, readAvailable: false });
  });
});

describe('challenge 3: fast writes with W = 1', () => {
  it('only R = N guarantees fresh reads', () => {
    for (let r = 1; r <= 3; r++) {
      const res = sim({ w: 1, r });
      expect(res.math.guaranteed).toBe(r === 3);
      expect(fastWritesFreshReads(res.config)).toBe(r === 3);
    }
  });

  it('writes wait less than with a majority, reads wait for the slowest replica, and one failure blocks reads', () => {
    for (let n = 3; n <= 5; n++) {
      const m = majorityOf(n);
      const fast = sim({ n, w: 1, r: n });
      const balanced = sim({ n, w: m, r: m });
      expect(fast.stats.writeWait!.median, `N = ${n}`).toBeLessThan(balanced.stats.writeWait!.median);
      expect(fast.stats.readWait!.p99, `N = ${n}`).toBeGreaterThan(2 * balanced.stats.readWait!.p99);
      const down = sim({ n, w: 1, r: n, failed: [1] });
      expect(down.math.readAvailable).toBe(false);
      expect(down.math.writeAvailable).toBe(true);
    }
  });
});

describe('challenge 4: W = N', () => {
  it('R = 1 sees the latest write, but one failed replica refuses every write', () => {
    const all = sim({ w: 3, r: 1 });
    expect(all.math.guaranteed).toBe(true);
    expect(all.stats.staleReads).toBe(0);
    const down = sim({ w: 3, r: 1, failed: [0] });
    expect(writeAllWithFailure(down.config)).toBe(true);
    expect(down.math.writeAvailable).toBe(false);
    expect(down.round.writeOk).toBe(false);
    expect(down.math.readAvailable).toBe(true);
    expect(down.math.readTolerates).toBe(2);
    expect(down.round.fresh).toBe(true);
  });

  it('every write waits for the slowest replica, so the slowest writes are much slower', () => {
    for (let n = 3; n <= 5; n++) {
      const m = majorityOf(n);
      const all = sim({ n, w: n, r: 1 });
      const balanced = sim({ n, w: m, r: m });
      expect(all.stats.writeWait!.median, `N = ${n}`).toBeGreaterThan(balanced.stats.writeWait!.median);
      expect(all.stats.writeWait!.p99, `N = ${n}`).toBeGreaterThan(2 * balanced.stats.writeWait!.p99);
      expect(sim({ n, w: n, r: 1, failed: [n - 1] }).math.writeAvailable).toBe(false);
    }
  });
});

describe('diagram', () => {
  const configs: Partial<QuorumConfig>[] = [];
  for (let n = 1; n <= 5; n++) {
    configs.push({ n, w: majorityOf(n), r: majorityOf(n) });
    configs.push({ n, w: 1, r: 1, readMode: 'worst' });
    configs.push({ n, w: n, r: 1, failed: [0] });
    configs.push({ n, w: 1, r: n, failed: [n - 1] });
  }

  it('lays out cleanly in every mode', () => {
    for (const c of configs) {
      const spec = quorumDiagram(sim(c));
      for (const mode of ['wide', 'compact', 'narrow'] as const) {
        expect(lintDiagram(spec, [mode]), `${JSON.stringify(c)}, ${mode}`).toEqual([]);
        expect(phoneScale(spec), `${JSON.stringify(c)}`).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });

  it('always has four steps, and every flow hop and note uses an edge or node that exists', () => {
    for (const c of configs) {
      const spec = quorumDiagram(sim(c));
      expect(spec.steps).toHaveLength(4);
      const ids = new Set([...spec.nodes.map((x) => x.id), ...spec.edges.map((e) => e.id)]);
      for (const step of spec.steps ?? []) {
        for (const item of step.flow ?? []) {
          for (const hop of Array.isArray(item) ? item : [item]) {
            expect(ids.has(typeof hop === 'string' ? hop.replace(/^</, '') : hop.edge)).toBe(true);
          }
          if (Array.isArray(item)) expect(item.length).toBeGreaterThan(0);
        }
        for (const note of step.notes ?? []) expect(ids.has(note.target)).toBe(true);
        for (const id of [...(step.fail ?? []), ...(step.focus ?? [])]) expect(ids.has(id)).toBe(true);
      }
    }
  });

  it('highlights the overlap when the read is fresh, and flags a stale read', () => {
    const fresh = quorumDiagram(sim());
    const res = sim();
    expect(fresh.steps![3]!.focus).toEqual(['app', 'coord', ...res.round.overlap.map(replicaId)]);
    expect(fresh.steps![3]!.notes!.filter((x) => x.text === 'in both')).toHaveLength(res.round.overlap.length);

    const stale = quorumDiagram(sim({ w: 1, r: 1, readMode: 'worst' }));
    expect(stale.steps![3]!.caption).toMatch(/stale/);
    expect(stale.steps![1]!.flow).toContainEqual(expect.arrayContaining([replicaEdge(0)]));
  });

  it('shows a refused write when too few replicas are up', () => {
    const spec = quorumDiagram(sim({ w: 3, r: 1, failed: [2] }));
    expect(spec.steps![1]!.caption).toMatch(/refuses the write/);
    expect(spec.steps![1]!.fail).toEqual(['r3']);
  });

  it('has a default config that matches the lesson preset', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ n: 3, w: 2, r: 2 });
  });
});
