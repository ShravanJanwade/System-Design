import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import {
  AXES,
  EQUAL_WEIGHTS,
  OPTIONS,
  SNAPGRAM_WEIGHTS,
  fit,
  giveUpAxis,
  optionDiagram,
  rank,
  verdict,
  weightsFromProps,
  type OptionId,
  type Weights,
} from './logic';

const get = (id: OptionId) => OPTIONS.find((o) => o.id === id)!;
const w = (freshness: number, latency: number, cost: number, simplicity: number): Weights => ({ freshness, latency, cost, simplicity });

describe('options', () => {
  it('no option beats another on every axis: each pair is a real trade-off', () => {
    for (const a of OPTIONS) {
      for (const b of OPTIONS) {
        if (a === b) continue;
        expect(AXES.some((ax) => a.scores[ax.id] > b.scores[ax.id])).toBe(true);
      }
    }
  });

  it('every option is the best fit for some priorities', () => {
    const winners = new Set<string>();
    for (let f = 0; f <= 5; f++)
      for (let l = 0; l <= 5; l++)
        for (let c = 0; c <= 5; c++)
          for (let s = 0; s <= 5; s++) {
            const weights = w(f, l, c, s);
            winners.add(rank(weights)[0]!.option.id);
            for (const o of OPTIONS) {
              expect(fit(o, weights)).toBeGreaterThanOrEqual(1);
              expect(fit(o, weights)).toBeLessThanOrEqual(5);
            }
          }
    expect(winners.size).toBe(OPTIONS.length);
  });
});

describe('best fit', () => {
  it('with equal priorities, caching the count is the middle ground that wins', () => {
    expect(fit(get('update-every-like'), EQUAL_WEIGHTS)).toBeCloseTo(3.5, 9);
    expect(fit(get('cache-count'), EQUAL_WEIGHTS)).toBeCloseTo(3.75, 9);
    expect(fit(get('batch-in-memory'), EQUAL_WEIGHTS)).toBeCloseTo(3.5, 9);
    expect(rank(EQUAL_WEIGHTS)[0]!.option.id).toBe('cache-count');
  });

  it('caring only about freshness, or only about simplicity, picks updating on every like', () => {
    expect(rank(w(5, 0, 0, 0))[0]!.option.id).toBe('update-every-like');
    expect(rank(w(0, 0, 0, 5))[0]!.option.id).toBe('update-every-like');
  });

  it('caring about latency and cost picks batching in memory', () => {
    expect(rank(w(0, 5, 5, 0))[0]!.option.id).toBe('batch-in-memory');
    expect(rank(w(1, 5, 1, 1))[0]!.option.id).toBe('batch-in-memory');
  });

  it('with every slider at zero, all axes count equally', () => {
    expect(rank(w(0, 0, 0, 0))[0]!.option.id).toBe('cache-count');
  });
});

describe('what you give up', () => {
  it('caching gives up freshness', () => {
    expect(giveUpAxis(get('cache-count'), EQUAL_WEIGHTS)).toBe('freshness');
  });

  it('updating on every like gives up whichever of speed and cost you care about more', () => {
    expect(giveUpAxis(get('update-every-like'), w(3, 5, 1, 3))).toBe('latency');
    expect(giveUpAxis(get('update-every-like'), w(3, 1, 5, 3))).toBe('cost');
  });

  it('batching gives up freshness or simplicity', () => {
    expect(['freshness', 'simplicity']).toContain(giveUpAxis(get('batch-in-memory'), w(0, 5, 5, 0)));
    expect(giveUpAxis(get('batch-in-memory'), w(1, 5, 5, 4))).toBe('simplicity');
  });
});

describe('the trade-off sentence', () => {
  it('fills in the interview template for Snapgram’s priorities', () => {
    const v = verdict(SNAPGRAM_WEIGHTS);
    expect(v.best.id).toBe('cache-count');
    expect(v.runnerUp.id).toBe('batch-in-memory');
    expect(v.giveUpSentence).toBe('You give up freshness: a count can be a few seconds behind the real number.');
    expect(v.sentence).toBe(
      'We could cache the count and refresh it every few seconds or count likes in memory and write them in batches. ' +
        'Caching the count gives us a design with only one extra piece but costs us counts that can be a few seconds behind. ' +
        'Because the team is small, I’d go with caching the count, and if likes had to feel instant, I’d switch to batching the writes in memory.',
    );
  });

  it('always names two different options and never claims a cost of "nothing"', () => {
    for (let f = 0; f <= 5; f++)
      for (let l = 0; l <= 5; l++)
        for (let c = 0; c <= 5; c++)
          for (let s = 0; s <= 5; s++) {
            const v = verdict(w(f, l, c, s));
            expect(v.best.id).not.toBe(v.runnerUp.id);
            expect(v.sentence).not.toMatch(/nothing on|undefined/);
            expect(v.giveUpSentence).not.toMatch(/nothing on/);
          }
  });
});

describe('props and diagrams', () => {
  it('reads weights from widget props, clamped to 0..5', () => {
    expect(weightsFromProps({ freshness: 9, latency: -2, cost: 2.6 })).toEqual({ ...SNAPGRAM_WEIGHTS, freshness: 5, latency: 0, cost: 3 });
    expect(weightsFromProps(undefined)).toEqual(SNAPGRAM_WEIGHTS);
  });

  it('every option’s diagram lays out cleanly', () => {
    for (const o of OPTIONS) {
      for (const mode of ['wide', 'compact', 'narrow'] as const) {
        expect(lintDiagram(optionDiagram(o.id), [mode])).toEqual([]);
      }
    }
  });
});
