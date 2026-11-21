import { describe, expect, it } from 'vitest';
import {
  MODEL_ORDER,
  SCENARIOS,
  SCENARIO_ORDER,
  allowedKeys,
  candidates,
  causalPast,
  dependencies,
  describeTimeline,
  getRead,
  judge,
  judgementsUpTo,
  type ModelId,
} from './logic';

const caption = SCENARIOS.caption;
const thread = SCENARIOS.thread;

const allowed = (scenario: typeof caption, readId: string, model: ModelId) => allowedKeys(judge(scenario, readId, model)).sort();

describe('the caption story (one value, replaced by each write)', () => {
  it('offers the old and the new caption to every read after the change', () => {
    expect(candidates(caption, getRead(caption, 'r1')).map((v) => v.label)).toEqual(['“Sunset”', '“Golden hour”']);
  });

  it('read 1, Maya right after her own change', () => {
    expect(allowed(caption, 'r1', 'strong')).toEqual(['w1']);
    expect(allowed(caption, 'r1', 'causal')).toEqual(['w1']);
    expect(allowed(caption, 'r1', 'read-your-writes')).toEqual(['w1']);
    expect(allowed(caption, 'r1', 'eventual')).toEqual(['w0', 'w1']);
  });

  it('read 2, Leo for the first time: only strong consistency rules out the old caption', () => {
    expect(allowed(caption, 'r2', 'strong')).toEqual(['w1']);
    expect(allowed(caption, 'r2', 'causal')).toEqual(['w0', 'w1']);
    expect(allowed(caption, 'r2', 'read-your-writes')).toEqual(['w0', 'w1']);
    expect(allowed(caption, 'r2', 'eventual')).toEqual(['w0', 'w1']);
  });

  it('read 3, Leo after seeing the new caption: causal never goes back, read-your-writes and eventual can', () => {
    expect(allowed(caption, 'r3', 'strong')).toEqual(['w1']);
    expect(allowed(caption, 'r3', 'causal')).toEqual(['w1']);
    expect(allowed(caption, 'r3', 'read-your-writes')).toEqual(['w0', 'w1']);
    expect(allowed(caption, 'r3', 'eventual')).toEqual(['w0', 'w1']);
    const why = judge(caption, 'r3', 'causal').verdicts.find((v) => !v.allowed)!.reason;
    expect(why).toContain('already seen “Golden hour”');
  });

  it('read 4, after every copy has caught up: all models agree', () => {
    for (const m of MODEL_ORDER) expect(allowed(caption, 'r4', m)).toEqual(['w1']);
  });

  it('tracks what each person has written or seen', () => {
    expect([...causalPast(caption, 'leo', 2)]).toEqual([]);
    expect([...causalPast(caption, 'leo', 3)].sort()).toEqual(['w0', 'w1']);
    expect([...dependencies(caption, 'w1')]).toEqual(['w0']);
  });
});

describe('the comment-and-reply story (each write adds a comment)', () => {
  it('lists every subset of the comments written so far', () => {
    expect(candidates(thread, getRead(thread, 'r2')).map((v) => v.label)).toEqual(['Nothing yet', 'Question only', 'Reply only', 'Question and reply']);
  });

  it('the reply depends on the question Maya read before answering', () => {
    expect([...dependencies(thread, 'a')]).toEqual(['q']);
    expect([...dependencies(thread, 'q')]).toEqual([]);
  });

  it('read 2, Priya: causal consistency never shows the reply without the question', () => {
    expect(allowed(thread, 'r2', 'strong')).toEqual(['q+a']);
    expect(allowed(thread, 'r2', 'causal')).toEqual(['none', 'q', 'q+a']);
    expect(allowed(thread, 'r2', 'read-your-writes')).toEqual(['a', 'none', 'q', 'q+a']);
    expect(allowed(thread, 'r2', 'eventual')).toEqual(['a', 'none', 'q', 'q+a']);
    const replyOnly = judge(thread, 'r2', 'causal').verdicts.find((v) => v.value.key === 'a')!;
    expect(replyOnly.allowed).toBe(false);
    expect(replyOnly.reason).toContain('without Leo’s question');
  });

  it('read 3, Maya: read-your-writes keeps her reply; causal also keeps the question she saw', () => {
    expect(allowed(thread, 'r3', 'strong')).toEqual(['q+a']);
    expect(allowed(thread, 'r3', 'causal')).toEqual(['q+a']);
    expect(allowed(thread, 'r3', 'read-your-writes')).toEqual(['a', 'q+a']);
    expect(allowed(thread, 'r3', 'eventual')).toEqual(['a', 'none', 'q', 'q+a']);
  });

  it('read 4, after every copy has caught up: all models agree', () => {
    for (const m of MODEL_ORDER) expect(allowed(thread, 'r4', m)).toEqual(['q+a']);
  });
});

describe('properties of every read in every story', () => {
  for (const id of SCENARIO_ORDER) {
    const s = SCENARIOS[id];
    const readIds = s.events.filter((e) => e.kind === 'read').map((e) => e.id);

    it(`${id}: each model allows a subset of what the next weaker model allows`, () => {
      for (const r of readIds) {
        for (let i = 0; i < MODEL_ORDER.length - 1; i++) {
          const stronger = allowedKeys(judge(s, r, MODEL_ORDER[i]!));
          const weaker = allowedKeys(judge(s, r, MODEL_ORDER[i + 1]!));
          for (const k of stronger) expect(weaker).toContain(k);
        }
      }
    });

    it(`${id}: strong consistency allows exactly one value, and eventual rules nothing out before the copies catch up`, () => {
      for (const r of readIds) {
        expect(allowedKeys(judge(s, r, 'strong'))).toHaveLength(1);
        const sync = s.events.find((e) => e.kind === 'sync')!.at;
        const j = judge(s, r, 'eventual');
        if (getRead(s, r).at < sync) expect(j.verdicts.every((v) => v.allowed)).toBe(true);
      }
    });

    it(`${id}: the story is possible under every model (each read's actual result is allowed)`, () => {
      for (const r of readIds) {
        const key = [...getRead(s, r).saw].join('+');
        for (const m of MODEL_ORDER) expect(allowedKeys(judge(s, r, m))).toContain(key);
      }
    });

    it(`${id}: every value a model rules out comes with a reason, and every judgement has a summary`, () => {
      for (const r of readIds) {
        for (const m of MODEL_ORDER) {
          const j = judge(s, r, m);
          expect(j.summary.length).toBeGreaterThan(10);
          for (const v of j.verdicts) if (!v.allowed) expect(v.reason.length).toBeGreaterThan(10);
        }
      }
    });

    it(`${id}: judgements and descriptions follow the steps`, () => {
      expect(judgementsUpTo(s, 'causal', 0)).toHaveLength(0);
      expect(judgementsUpTo(s, 'causal', s.events.length - 1)).toHaveLength(readIds.length);
      expect(describeTimeline(s, 'eventual', 0)).toContain('before anything happens');
      expect(describeTimeline(s, 'strong', s.events.length - 1)).toContain('every copy has caught up');
    });
  }
});
