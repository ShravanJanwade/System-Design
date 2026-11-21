import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import {
  DEFAULT_CONFIG,
  FOLLOWERS,
  LAG_STEPS,
  MAYA,
  MODES,
  firstSeen,
  firstVanish,
  photoReads,
  pinnedFollower,
  reloadRead,
  runReplication,
  type ReplicationConfig,
} from './logic';
import { replicationDiagram } from './diagram';

const run = (c: Partial<ReplicationConfig> = {}) => runReplication(c);
const { commitMs, ackMs, writesPerSec, failoverMs, failAtMs } = DEFAULT_CONFIG;

describe('runReplication basics', () => {
  const base = run();

  it('is deterministic for a seed', () => {
    const again = run();
    expect(again.writes.map((w) => w.applied.f2)).toEqual(base.writes.map((w) => w.applied.f2));
    expect(again.reads).toEqual(base.reads);
  });

  it('sends about the configured write rate', () => {
    const expected = (writesPerSec * DEFAULT_CONFIG.durationMs) / 1000;
    expect(base.writes.length).toBeGreaterThan(expected * 0.93);
    expect(base.writes.length).toBeLessThan(expected * 1.07);
  });

  it('followers apply writes in log order, and Follower 2 is always behind Follower 1', () => {
    for (const lagMs of LAG_STEPS) {
      const r = run({ lagMs });
      for (const f of FOLLOWERS) {
        for (let i = 1; i < r.writes.length; i++) expect(r.writes[i]!.applied[f]!).toBeGreaterThanOrEqual(r.writes[i - 1]!.applied[f]!);
      }
      for (const w of r.writes) expect(w.applied.f2!).toBeGreaterThanOrEqual(w.applied.f1!);
    }
  });

  it('measured lag matches the setting: about 1x for Follower 1 and 2x for Follower 2', () => {
    for (const lagMs of LAG_STEPS) {
      const r = run({ lagMs });
      expect(r.meanLag.f1 / lagMs).toBeGreaterThan(0.92);
      expect(r.meanLag.f1 / lagMs).toBeLessThan(1.08);
      expect(r.meanLag.f2 / lagMs).toBeGreaterThan(1.84);
      expect(r.meanLag.f2 / lagMs).toBeLessThan(2.16);
    }
  });

  it('pins Maya to Follower 2, by the hash of her user name', () => {
    expect(pinnedFollower(MAYA)).toBe('f2');
    expect(run({ sticky: true }).pinned).toBe('f2');
  });

  it('makes all seven of Maya’s reads before the leader can fail', () => {
    for (const lagMs of LAG_STEPS) {
      for (const mode of MODES) {
        const r = run({ lagMs, mode, failLeader: true });
        expect(r.reads).toHaveLength(7);
        for (const x of r.reads) expect(x.at).toBeLessThan(failAtMs);
      }
    }
  });

  it('at the starting settings, Maya sees both problems: her own edit missing and a comment going backwards', () => {
    expect(base.counts['own-edit-missing']).toBe(1);
    expect(base.counts['went-back']).toBe(1);
    expect(base.failover).toBeNull();
  });
});

describe('challenge 1: read-your-writes', () => {
  it('the reload goes to Follower 2, which applies the caption only after the reload', () => {
    const r = run();
    const x = reloadRead(r)!;
    expect(x.copy).toBe('f2');
    expect(x.verdict).toBe('own-edit-missing');
    expect(r.caption.applied.f2!).toBeGreaterThan(x.at);
  });

  it('without the fix, the reload is stale whenever the lag is 200 ms or more (asynchronous)', () => {
    for (const lagMs of LAG_STEPS) expect(run({ lagMs }).counts['own-edit-missing']).toBe(lagMs >= 200 ? 1 : 0);
  });

  it('reading her own profile from the leader fixes it at any lag, in either mode, pinned or not', () => {
    for (const lagMs of LAG_STEPS) {
      for (const mode of MODES) {
        for (const sticky of [false, true]) {
          for (const failLeader of [false, true]) {
            const r = run({ lagMs, mode, sticky, failLeader, readFromLeader: true });
            expect(reloadRead(r)!.copy).toBe('leader');
            expect(r.counts['own-edit-missing']).toBe(0);
          }
        }
      }
    }
  });

  it('the leader rule does not change the photo refreshes', () => {
    for (const lagMs of LAG_STEPS) expect(photoReads(run({ lagMs, readFromLeader: true }))).toEqual(photoReads(run({ lagMs })));
  });
});

describe('challenge 2: monotonic reads', () => {
  it('spread reads show the comment from Follower 1, then lose it on Follower 2', () => {
    const r = run();
    const seen = firstSeen(r)!;
    const gone = firstVanish(r)!;
    expect(seen.copy).toBe('f1');
    expect(gone.copy).toBe('f2');
    expect(gone.at).toBeGreaterThan(seen.at);
    expect(r.comment.applied.f1!).toBeLessThanOrEqual(seen.at);
    expect(r.comment.applied.f2!).toBeGreaterThan(gone.at);
  });

  it('the comment vanishes at 1 s and 2 s of lag, in both modes, but never at 500 ms or less', () => {
    for (const mode of MODES) {
      for (const lagMs of LAG_STEPS) {
        const back = run({ lagMs, mode }).counts['went-back'];
        if (lagMs === 1000 || lagMs === 2000) expect(back, `${mode} ${lagMs}`).toBeGreaterThan(0);
        if (lagMs <= 500) expect(back, `${mode} ${lagMs}`).toBe(0);
      }
    }
  });

  it('pinning reads to one follower means nothing Maya has seen ever disappears', () => {
    for (const lagMs of LAG_STEPS) {
      for (const mode of MODES) {
        for (const readFromLeader of [false, true]) {
          const r = run({ lagMs, mode, readFromLeader, sticky: true });
          expect(r.counts['went-back']).toBe(0);
          for (const x of photoReads(r)) expect(x.copy).toBe('f2');
        }
      }
    }
  });

  it('pinned to the slower follower, the comment appears later than it can elsewhere, but stays', () => {
    const spread = run();
    const pinned = run({ sticky: true });
    expect(firstSeen(pinned)!.at).toBeGreaterThan(firstSeen(spread)!.at);
    const after = photoReads(pinned).filter((x) => x.at >= firstSeen(pinned)!.at);
    expect(after.every((x) => x.sawNew)).toBe(true);
  });

  it('at 4 s of lag the comment never shows up, so nothing vanishes: the refreshes are only behind', () => {
    const r = run({ lagMs: 4000 });
    expect(firstSeen(r)).toBeUndefined();
    expect(r.counts['went-back']).toBe(0);
    expect(r.counts.behind).toBe(6);
  });
});

describe('challenge 3: synchronous replication', () => {
  it('asynchronous writes are confirmed after the leader’s own commit', () => {
    for (const lagMs of LAG_STEPS) expect(run({ lagMs }).writeMs).toBeCloseTo(commitMs, 6);
  });

  it('synchronous writes wait for Follower 1, so each takes about the lag', () => {
    for (const lagMs of LAG_STEPS) {
      const ms = run({ lagMs, mode: 'sync' }).writeMs;
      expect(ms).toBeGreaterThan(lagMs * 0.92 + commitMs + ackMs);
      expect(ms).toBeLessThan(lagMs * 1.08 + commitMs + ackMs);
    }
  });

  it('every confirmed write is already on Follower 1, but not always on Follower 2', () => {
    const r = run({ mode: 'sync' });
    for (const w of r.writes) expect(w.applied.f1!).toBeLessThanOrEqual(w.confirmed!);
    expect(r.writes.some((w) => w.applied.f2! > w.confirmed!)).toBe(true);
  });

  it('the reload still goes to asynchronous Follower 2, so it is stale at 500 ms or more', () => {
    for (const lagMs of LAG_STEPS) {
      const x = reloadRead(run({ lagMs, mode: 'sync' }))!;
      expect(x.copy).toBe('f2');
      expect(x.verdict === 'own-edit-missing').toBe(lagMs >= 500);
    }
  });
});

describe('challenge 4: failover', () => {
  it('asynchronous: the confirmed writes Follower 1 had not received are lost, about the rate times the lag', () => {
    for (const lagMs of [500, 1000, 2000, 4000]) {
      const fo = run({ lagMs, failLeader: true }).failover!;
      expect(fo.promoted).toBe('f1');
      expect(fo.behindMs / lagMs).toBeGreaterThan(0.88);
      expect(fo.behindMs / lagMs).toBeLessThan(1.15);
      const expected = (writesPerSec * fo.behindMs) / 1000;
      expect(fo.lost).toBeGreaterThan(expected * 0.75);
      expect(fo.lost).toBeLessThan(expected * 1.25);
    }
    expect(run({ lagMs: 200, failLeader: true }).failover!.lost).toBeGreaterThan(0);
    expect(run({ lagMs: 5, failLeader: true }).failover!.lost).toBeLessThanOrEqual(5);
  });

  it('the lost writes were confirmed before the failure, and exist only on the old leader', () => {
    const r = run({ failLeader: true });
    const lost = r.writes.filter((w) => w.lost);
    expect(lost.length).toBe(r.failover!.lost);
    for (const w of lost) {
      expect(w.confirmed!).toBeLessThanOrEqual(failAtMs);
      expect(w.applied.f1).toBeNull();
      expect(w.applied.f2).toBeNull();
    }
  });

  it('synchronous: no confirmed write is lost; the writes still waiting get an error instead', () => {
    for (const lagMs of LAG_STEPS) {
      const fo = run({ lagMs, mode: 'sync', failLeader: true }).failover!;
      expect(fo.lost).toBe(0);
      if (lagMs >= 200) expect(fo.unconfirmed).toBeGreaterThan(0);
    }
  });

  it('either way, writes fail for the 3 seconds before the promotion, then flow again', () => {
    for (const mode of MODES) {
      const fo = run({ mode, failLeader: true }).failover!;
      const expected = (writesPerSec * failoverMs) / 1000;
      expect(fo.failed).toBeGreaterThan(expected * 0.85);
      expect(fo.failed).toBeLessThan(expected * 1.15);
      expect(fo.accepted).toBeGreaterThan(0);
    }
  });
});

describe('replicationDiagram', () => {
  it('lays out cleanly in every mode, for every setting', () => {
    for (const failLeader of [false, true]) {
      for (const mode of MODES) {
        for (const lagMs of [5, 1000, 4000]) {
          const spec = replicationDiagram(run({ lagMs, mode, failLeader }));
          for (const m of ['wide', 'compact', 'narrow'] as const) {
            expect(lintDiagram(spec, [m]), `${mode} ${lagMs} ms, fail ${failLeader}, ${m}`).toEqual([]);
            expect(phoneScale(spec), `${mode} ${lagMs} ms, fail ${failLeader}`).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
          }
        }
      }
    }
  });

  it('tells the starting story in five steps, and adds two for the failover', () => {
    expect(replicationDiagram(run()).steps).toHaveLength(5);
    expect(replicationDiagram(run({ failLeader: true })).steps).toHaveLength(7);
  });

  it('shows the stale reload and the vanished comment as alerts', () => {
    const steps = replicationDiagram(run()).steps!;
    expect(steps[1]!.caption).toContain('old caption');
    expect(JSON.stringify(steps[1]!.flow)).toContain('alert');
    expect(JSON.stringify(steps[4]!.flow)).toContain('comment gone');
  });

  it('every flow hop, note, focus and failed node refers to something that exists', () => {
    for (const mode of MODES) {
      for (const lagMs of LAG_STEPS) {
        for (const flags of [{}, { sticky: true, readFromLeader: true, failLeader: true }, { failLeader: true }]) {
          const spec = replicationDiagram(run({ lagMs, mode, ...flags }));
          const ids = new Set([...spec.nodes.map((n) => n.id), ...spec.edges.map((e) => e.id)]);
          for (const step of spec.steps ?? []) {
            for (const item of step.flow ?? []) {
              for (const hop of Array.isArray(item) ? item : [item]) expect(ids.has(typeof hop === 'string' ? hop.replace(/^</, '') : hop.edge)).toBe(true);
            }
            for (const note of step.notes ?? []) expect(ids.has(note.target)).toBe(true);
            for (const id of [...(step.fail ?? []), ...(step.focus ?? []), ...(step.add ?? [])]) expect(ids.has(id)).toBe(true);
          }
        }
      }
    }
  });
});
