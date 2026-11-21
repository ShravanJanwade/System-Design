import { describe, expect, it } from 'vitest';
import {
  CAPTIONS,
  CLAIMANT,
  LOCAL_MS,
  RTT_MS,
  START_CAPTION,
  TIMEOUT_MS,
  copiesAgree,
  differences,
  firstRefusal,
  formatClock,
  initialState,
  lastConflictMerge,
  lastDivergedRead,
  run,
  snapshot,
  step,
  totalLikes,
  totals,
  writesWithLinkUp,
  type Action,
  type Region,
} from './logic';

const like = (from: Region): Action => ({ kind: 'write', write: 'like', from });
const caption = (from: Region): Action => ({ kind: 'write', write: 'caption', from });
const claim = (from: Region): Action => ({ kind: 'write', write: 'claim', from });
const read = (from: Region): Action => ({ kind: 'read', from });
const CUT: Action = { kind: 'cut' };
const HEAL: Action = { kind: 'heal' };

describe('starting state', () => {
  const s = initialState();

  it('has two identical copies, the link up, and nothing logged', () => {
    expect(s.linkUp).toBe(true);
    expect(copiesAgree(s)).toBe(true);
    expect(snapshot(s.replicas.oregon)).toEqual({ caption: START_CAPTION, likes: 120, username: null });
    expect(s.log).toHaveLength(0);
  });

  it('formats the simulated clock', () => {
    expect(formatClock(0)).toBe('12:00:00');
    expect(formatClock(7)).toBe('12:00:07');
    expect(formatClock(75)).toBe('12:01:15');
  });

  it('no challenge is complete before the learner does anything', () => {
    expect(firstRefusal(s)).toBeUndefined();
    expect(lastDivergedRead(s)).toBeUndefined();
    expect(lastConflictMerge(s)).toBeUndefined();
    expect(writesWithLinkUp(s)).toEqual({});
  });

  it('is deterministic', () => {
    const actions = [like('oregon'), CUT, caption('singapore'), read('oregon'), HEAL];
    expect(run(actions, 'availability')).toEqual(run(actions, 'availability'));
  });
});

describe('while the link is up, the copies always agree', () => {
  for (const mode of ['consistency', 'availability'] as const) {
    it(`in ${mode} mode`, () => {
      let s = initialState(mode);
      for (const a of [like('oregon'), caption('singapore'), claim('oregon'), like('singapore'), caption('oregon'), claim('singapore')]) {
        s = step(s, a);
        expect(copiesAgree(s)).toBe(true);
      }
      expect(totalLikes(s.replicas.singapore)).toBe(122);
      expect(s.replicas.oregon.caption.text).toBe(CAPTIONS.oregon[0]);
      // The second sign-up finds the name taken, in either mode.
      expect(s.log[s.log.length - 1]!.outcome).toBe('taken');
      expect(s.replicas.singapore.username?.owner).toBe(CLAIMANT.oregon);
    });
  }
});

describe('challenge 1: consistency first refuses writes during a partition', () => {
  const s = run([CUT, caption('singapore'), like('oregon'), claim('singapore'), read('singapore'), read('oregon')], 'consistency');

  it('refuses every write, after waiting for the timeout', () => {
    const writes = s.log.filter((e) => e.action.kind === 'write');
    expect(writes.map((e) => e.outcome)).toEqual(['refused', 'refused', 'refused']);
    for (const e of writes) expect(e.latencyMs).toBe(TIMEOUT_MS);
    expect(totals(s).refused).toBe(3);
    expect(firstRefusal(s)?.action).toEqual(caption('singapore'));
  });

  it('keeps both copies identical and unchanged, so reads stay correct', () => {
    expect(copiesAgree(s)).toBe(true);
    expect(snapshot(s.replicas.singapore)).toEqual(snapshot(initialState().replicas.singapore));
    const reads = s.log.filter((e) => e.outcome === 'read');
    expect(reads).toHaveLength(2);
    for (const r of reads) {
      expect(r.read?.diverged).toBe(false);
      expect(r.read?.behind).toEqual([]);
      expect(r.latencyMs).toBe(LOCAL_MS);
    }
  });

  it('has nothing to merge when the link heals', () => {
    const healed = step(s, HEAL);
    const merge = healed.log[healed.log.length - 1]!.merge!;
    expect(merge.changed).toBe(false);
    expect(lastConflictMerge(healed)).toBeUndefined();
  });

  it('does not let the mode change while the link is cut', () => {
    expect(step(s, { kind: 'mode', mode: 'availability' })).toBe(s);
  });
});

describe('challenge 2: availability first lets the copies drift apart', () => {
  const s = run(
    [CUT, like('singapore'), like('singapore'), caption('singapore'), like('oregon'), like('oregon'), like('oregon'), caption('oregon'), read('singapore'), read('oregon')],
    'availability',
  );

  it('accepts every write locally, at once', () => {
    const writes = s.log.filter((e) => e.action.kind === 'write');
    expect(writes.every((e) => e.outcome === 'accepted' && e.latencyMs === LOCAL_MS)).toBe(true);
    expect(totals(s).refused).toBe(0);
  });

  it('leaves the copies disagreeing on likes and caption', () => {
    expect(differences(s)).toEqual(['caption', 'likes']);
    expect(totalLikes(s.replicas.singapore)).toBe(122);
    expect(totalLikes(s.replicas.oregon)).toBe(123);
    expect(s.replicas.singapore.caption.text).toBe(CAPTIONS.singapore[0]);
    expect(s.replicas.oregon.caption.text).toBe(CAPTIONS.oregon[0]);
  });

  it('answers each read from what that region knows, and records what it is missing', () => {
    const r = lastDivergedRead(s)!;
    expect(r.action).toEqual(read('oregon'));
    expect(r.read?.snapshot.likes).toBe(123);
    expect(r.read?.behind).toEqual(['2 likes', 'a caption change']);
    const sg = s.log.find((e) => e.action.kind === 'read' && e.action.from === 'singapore')!;
    expect(sg.read?.snapshot.caption).toBe(CAPTIONS.singapore[0]);
    expect(sg.read?.behind).toEqual(['3 likes', 'a caption change']);
  });
});

describe('challenge 3: healing merges likes, drops one caption and splits a username', () => {
  const before = run([CUT, like('singapore'), like('oregon'), like('oregon'), caption('oregon'), caption('singapore'), claim('oregon'), claim('singapore')], 'availability');
  const s = step(before, HEAL);
  const report = s.log[s.log.length - 1]!.merge!;

  it('adds up the likes from both sides, losing none', () => {
    expect(report.likesBefore).toEqual({ oregon: 122, singapore: 121 });
    expect(report.likesAfter).toBe(123);
    expect(totalLikes(s.replicas.oregon)).toBe(123);
    expect(totalLikes(s.replicas.singapore)).toBe(123);
  });

  it('keeps the later caption and silently drops the other (last write wins)', () => {
    expect(report.caption.conflict).toBe(true);
    expect(report.caption.kept.text).toBe(CAPTIONS.singapore[0]);
    expect(report.caption.kept.from).toBe('singapore');
    expect(report.caption.discarded?.text).toBe(CAPTIONS.oregon[0]);
    expect(s.replicas.oregon.caption.text).toBe(CAPTIONS.singapore[0]);
  });

  it('gives @sunset to the earlier claim and marks the other account for renaming', () => {
    expect(report.username.conflict).toBe(true);
    expect(report.username.keeper?.owner).toBe(CLAIMANT.oregon);
    expect(report.username.renamed?.owner).toBe(CLAIMANT.singapore);
    expect(s.replicas.singapore.username?.owner).toBe(CLAIMANT.oregon);
  });

  it('leaves the copies identical with nothing queued', () => {
    expect(copiesAgree(s)).toBe(true);
    expect(s.queued.oregon).toEqual({ likes: 0, captions: 0, claims: 0 });
    expect(s.queued.singapore).toEqual({ likes: 0, captions: 0, claims: 0 });
    expect(lastConflictMerge(s)).toBe(report);
  });

  it('is not a conflict when only one side changed the caption', () => {
    const one = run([CUT, caption('oregon'), like('singapore'), HEAL], 'availability');
    const m = one.log[one.log.length - 1]!.merge!;
    expect(m.caption.conflict).toBe(false);
    expect(m.caption.discarded).toBeNull();
    expect(one.replicas.singapore.caption.text).toBe(CAPTIONS.oregon[0]);
    expect(lastConflictMerge(one)).toBeUndefined();
  });
});

describe('challenge 4: with no partition, consistency costs a round trip per write (PACELC)', () => {
  const s = run([caption('singapore'), { kind: 'mode', mode: 'availability' }, caption('singapore'), read('oregon')], 'consistency');
  const both = writesWithLinkUp(s);

  it('a consistent write waits for the other region; an available one does not', () => {
    expect(both.consistency?.latencyMs).toBe(LOCAL_MS + RTT_MS);
    expect(both.availability?.latencyMs).toBe(LOCAL_MS);
  });

  it('the available write still reaches the other region while the link is up', () => {
    expect(s.replicas.oregon.caption.text).toBe(CAPTIONS.singapore[1]);
    expect(s.log[s.log.length - 1]!.read?.diverged).toBe(false);
  });

  it('a refused write is not counted as a write with the link up', () => {
    const cut = run([CUT, caption('singapore')], 'consistency');
    expect(writesWithLinkUp(cut)).toEqual({});
  });
});
