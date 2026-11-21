import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import { ALGORITHMS, DEFAULT_CONFIG, roundRobinOverloads, runLbSim, slotsFor, type LbConfig } from './logic';
import { appEdge, lbDiagram } from './diagram';

const run = (c: Partial<LbConfig> = {}) => runLbSim(c);

describe('runLbSim basics', () => {
  const base = run();

  it('is deterministic for a seed', () => {
    expect(run().totals).toEqual(base.totals);
  });

  it('accounts for every request', () => {
    for (const cfg of [{}, { killServer: 2 }, { olderServer: true }, { algorithm: 'ip-hash' as const, busyClient: true, killServer: 1 }]) {
      const r = run(cfg);
      const { requests, completed, failed, turnedAway, unfinished } = r.totals;
      expect(completed + failed + turnedAway + unfinished).toBe(requests);
      expect(r.servers.reduce((s, x) => s + x.routed, 0) + (r.totals.turnedAway - r.servers.reduce((s, x) => s + x.turnedAway, 0))).toBe(requests);
    }
  });

  it('sends about the configured traffic', () => {
    expect(base.totals.requests / DEFAULT_CONFIG.durationSec).toBeGreaterThan(DEFAULT_CONFIG.traffic * 0.95);
    expect(base.totals.requests / DEFAULT_CONFIG.durationSec).toBeLessThan(DEFAULT_CONFIG.traffic * 1.05);
  });

  it('derives workers from capacity: 100 requests/s at 100 ms each is 10 at a time', () => {
    expect(slotsFor(100)).toBe(10);
    expect(base.servers[0]!.slots).toBe(10);
    expect(base.servers[0]!.queueLimit).toBe(20);
  });

  it('at the starting settings nothing fails, nothing is turned away and shares are even', () => {
    expect(base.totals.failed).toBe(0);
    expect(base.totals.turnedAway).toBe(0);
    for (const s of base.servers) expect(s.share).toBeCloseTo(0.25, 2);
  });

  it('no challenge is already complete at the starting settings', () => {
    expect(roundRobinOverloads(base)).toBe(false);
    expect(base.killed).toBe(-1);
  });

  it('weighted round robin with equal servers is plain round robin', () => {
    expect(run({ algorithm: 'weighted' }).servers.map((s) => s.routed)).toEqual(base.servers.map((s) => s.routed));
  });

  it('more traffic than the whole fleet can handle overloads every server', () => {
    const r = run({ traffic: 500 });
    expect(r.servers.every((s) => s.turnedAway > 0)).toBe(true);
    expect(roundRobinOverloads(r)).toBe(false);
  });
});

describe('challenge 1: round robin overloads the older server', () => {
  const rr = run({ olderServer: true });
  const older = rr.servers[3]!;

  it('round robin gives the older server an equal share, which it cannot finish', () => {
    expect(older.older).toBe(true);
    expect(older.capacityRps).toBe(50);
    expect(older.share).toBeCloseTo(0.25, 2);
    expect(older.turnedAway).toBeGreaterThan(500);
    for (const s of rr.servers.slice(0, 3)) expect(s.turnedAway).toBe(0);
    expect(roundRobinOverloads(rr)).toBe(true);
  });

  it('weighted round robin sends it half as much, and nothing is turned away', () => {
    const w = run({ olderServer: true, algorithm: 'weighted' });
    expect(w.servers[3]!.share).toBeCloseTo(1 / 7, 2);
    expect(w.totals.turnedAway).toBe(0);
  });

  it('least connections adapts on its own, because the slow server holds requests longer', () => {
    const lc = run({ olderServer: true, algorithm: 'least-connections' });
    expect(lc.servers[3]!.share).toBeLessThan(0.18);
    expect(lc.totals.turnedAway).toBe(0);
  });

  it('a pile-up of slow requests also overloads a server under round robin', () => {
    expect(roundRobinOverloads(run({ slowRequests: true }))).toBe(true);
  });
});

describe('challenge 2: a server dies and health checks react', () => {
  const rr = run({ killServer: 2 });

  it('takes the dead server out after two failed checks, and back after two passes', () => {
    expect(rr.timeline).toEqual({ down: 20, removed: 27.5, up: 40, readded: 47.5 });
    expect(run({ killServer: 2, checkIntervalSec: 1 }).timeline).toEqual({ down: 20, removed: 21.5, up: 40, readded: 41.5 });
    expect(run({ killServer: 2, checkIntervalSec: 10 }).timeline).toEqual({ down: 20, removed: 35, up: 40, readded: 55 });
    const kinds = rr.events.filter((e) => e.server === 1).map((e) => e.kind);
    expect(kinds).toEqual(['down', 'check-failed', 'check-failed', 'removed', 'up', 'check-passed', 'check-passed', 'readded']);
  });

  it('until then round robin keeps sending it its quarter, and those requests fail', () => {
    expect(rr.deadShare).toBeCloseTo(0.25, 2);
    const expected = DEFAULT_CONFIG.traffic * 0.25 * (27.5 - 20);
    expect(rr.totals.failed).toBeGreaterThan(expected * 0.85);
    expect(rr.totals.failed).toBeLessThan(expected * 1.15);
    expect(rr.totals.lostInFlight).toBeGreaterThan(0);
  });

  it('sends it nothing between its removal and its return', () => {
    const quiet = rr.buckets.filter((b) => b.t >= 27.5 && b.t < 47.5);
    expect(quiet.every((b) => b.routed[1] === 0)).toBe(true);
    expect(rr.buckets.filter((b) => b.t >= 48).some((b) => b.routed[1]! > 0)).toBe(true);
  });

  it('checking more often means fewer failures', () => {
    const failed = [1, 2, 5, 10].map((s) => run({ killServer: 2, checkIntervalSec: s }).totals.failed);
    for (let i = 1; i < failed.length; i++) expect(failed[i]!).toBeGreaterThan(failed[i - 1]!);
    expect(failed[0]!).toBeLessThan(failed[2]! * 0.3);
  });

  it('without a restart, the server stays out', () => {
    const r = run({ killServer: 2, revive: false });
    expect(r.timeline.up).toBeNull();
    expect(r.timeline.readded).toBeNull();
    expect(r.buckets.filter((b) => b.t >= 27.5).every((b) => b.routed[1] === 0)).toBe(true);
  });

  it('least connections loses far fewer: hanging requests make the dead server look busy', () => {
    const lc = run({ killServer: 2, algorithm: 'least-connections' });
    expect(lc.deadShare).toBeLessThan(0.1);
    expect(lc.totals.failed).toBeLessThan(rr.totals.failed * 0.4);
  });

  it('with IP hash, removing one of four servers moves most clients, not just its own', () => {
    const r = run({ killServer: 2, algorithm: 'ip-hash' });
    expect(r.clientsOnRemoved!).toBeCloseTo(0.25, 1);
    expect(r.clientsMoved!).toBeGreaterThan(0.6);
  });
});

describe('challenge 3: IP hash and one very busy client', () => {
  const ip = run({ algorithm: 'ip-hash', busyClient: true });

  it('every request from the busy client lands on one server, which overflows', () => {
    const busy = ip.servers[ip.busyServer]!;
    expect(busy.share).toBeGreaterThan(0.4);
    expect(busy.turnedAway).toBeGreaterThan(0);
    for (const s of ip.servers) if (s.index !== busy.index) {
      expect(s.share).toBeLessThan(0.25);
      expect(s.turnedAway).toBe(0);
    }
  });

  it('round robin and least connections spread the same client evenly', () => {
    for (const algorithm of ['round-robin', 'least-connections'] as const) {
      const r = run({ algorithm, busyClient: true });
      expect(r.totals.turnedAway).toBe(0);
      for (const s of r.servers) expect(Math.abs(s.share - 0.25)).toBeLessThan(0.01);
    }
  });
});

describe('challenge 4: least connections against round robin', () => {
  it('with slow requests mixed in, least connections keeps queues short', () => {
    const rr = run({ slowRequests: true });
    const lc = run({ slowRequests: true, algorithm: 'least-connections' });
    expect(rr.wait.p99).toBeGreaterThanOrEqual(100);
    expect(lc.wait.p99).toBeLessThanOrEqual(20);
    expect(rr.wait.waitedShare).toBeGreaterThan(3 * lc.wait.waitedShare);
    expect(lc.totals.turnedAway).toBe(0);
  });

  it('with similar requests the two barely differ', () => {
    const rr = run();
    const lc = run({ algorithm: 'least-connections' });
    expect(rr.wait.p99).toBeLessThanOrEqual(20);
    expect(lc.wait.p99).toBeLessThanOrEqual(20);
  });
});

describe('lbDiagram', () => {
  it('lays out cleanly for every fleet size, with and without the busy client', () => {
    for (let servers = 2; servers <= 6; servers++) {
      for (const busyClient of [false, true]) {
        for (const olderServer of [false, true]) {
          const spec = lbDiagram(run({ servers, busyClient, olderServer, algorithm: 'ip-hash', durationSec: 10 }));
          for (const mode of ['wide', 'compact', 'narrow'] as const) {
            expect(lintDiagram(spec, [mode]), `${servers} servers, busy ${busyClient}, ${mode}`).toEqual([]);
            expect(phoneScale(spec), `${servers} servers, busy ${busyClient}`).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
          }
        }
      }
    }
  });

  it('shows one overview without a failure, and the failure story with one', () => {
    expect(lbDiagram(run()).steps).toHaveLength(1);
    expect(lbDiagram(run({ killServer: 2 })).steps).toHaveLength(5);
    expect(lbDiagram(run({ killServer: 2, revive: false })).steps).toHaveLength(3);
  });

  it('marks the dead server failed and stops sending it dots once it is removed', () => {
    const steps = lbDiagram(run({ killServer: 2 })).steps!;
    expect(steps[1]!.fail).toEqual(['app2']);
    expect(steps[2]!.fail).toEqual(['app2']);
    const removedFanOut = steps[2]!.flow![1] as unknown[];
    expect(removedFanOut).not.toContain(appEdge(1));
    expect(steps[3]!.fail ?? []).toEqual([]);
  });

  it('every flow hop and note uses an edge or node that exists', () => {
    for (const algorithm of ALGORITHMS) {
      const spec = lbDiagram(run({ algorithm, killServer: 3, busyClient: true, durationSec: 60 }));
      const ids = new Set([...spec.nodes.map((n) => n.id), ...spec.edges.map((e) => e.id)]);
      for (const step of spec.steps ?? []) {
        for (const item of step.flow ?? []) {
          for (const hop of Array.isArray(item) ? item : [item]) {
            expect(ids.has(typeof hop === 'string' ? hop.replace(/^</, '') : hop.edge)).toBe(true);
          }
        }
        for (const note of step.notes ?? []) expect(ids.has(note.target)).toBe(true);
        for (const id of [...(step.fail ?? []), ...(step.focus ?? [])]) expect(ids.has(id)).toBe(true);
      }
    }
  });
});
