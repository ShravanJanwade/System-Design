import { describe, expect, it } from 'vitest';
import {
  DOUBLINGS,
  DOWN,
  MAX_NODES,
  MIN_NODES,
  ORIGIN,
  averageRounds,
  clampFanout,
  clampNodes,
  gridLayout,
  knownAt,
  messagesUpTo,
  roundsBySize,
  roundsPerDoubling,
  runGossip,
} from './logic';

describe('one gossip run', () => {
  it('is deterministic for a seed', () => {
    const a = runGossip(128, 2, 42);
    const b = runGossip(128, 2, 42);
    expect(b.learnedAt).toEqual(a.learnedAt);
    expect(b.rounds).toEqual(a.rounds);
    const c = runGossip(128, 2, 43);
    expect(c.learnedAt).not.toEqual(a.learnedAt);
  });

  it('reaches every live node, never the node that is down', () => {
    for (const n of [16, 64, 200, 256]) {
      for (const fanout of [1, 2, 3, 4]) {
        const run = runGossip(n, fanout, 7);
        expect(run.roundsToAll).not.toBeNull();
        expect(run.learnedAt[ORIGIN]).toBe(0);
        expect(run.learnedAt[DOWN]).toBe(-1);
        expect(run.learnedAt.filter((r) => r >= 0)).toHaveLength(n - 1);
        expect(run.live).toBe(n - 1);
        expect(knownAt(run, run.roundsToAll!)).toBe(n - 1);
      }
    }
  });

  it('has every node that knew before a round tell `fanout` different other nodes', () => {
    const run = runGossip(64, 3, 11);
    run.rounds.forEach((messages, i) => {
      const round = i + 1;
      const senders = run.learnedAt.map((r, node) => ({ r, node })).filter(({ r }) => r >= 0 && r < round);
      expect(messages).toHaveLength(senders.length * 3);
      for (const { node } of senders) {
        const targets = messages.filter((m) => m.from === node).map((m) => m.to);
        expect(new Set(targets).size).toBe(3);
        expect(targets).not.toContain(node);
      }
      // A node that learns in this round waits for the next round to pass it on.
      for (const m of messages) expect(run.learnedAt[m.from]).toBeLessThan(round);
    });
  });

  it('marks exactly the first message a node receives as news', () => {
    const run = runGossip(96, 2, 5);
    const newsCount = run.rounds.flat().filter((m) => m.news).length;
    expect(newsCount).toBe(run.live - 1);
    for (const m of run.rounds.flat()) if (m.news) expect(run.learnedAt[m.to]).toBeGreaterThan(0);
  });

  it('only ever grows the number who know, and counts every message', () => {
    const run = runGossip(200, 2, 3);
    for (let i = 1; i < run.knownAfter.length; i++) expect(run.knownAfter[i]!).toBeGreaterThanOrEqual(run.knownAfter[i - 1]!);
    expect(run.knownAfter[0]).toBe(1);
    expect(messagesUpTo(run, run.rounds.length)).toBe(run.rounds.flat().length);
    expect(messagesUpTo(run, 1)).toBe(2);
  });
});

describe('how rounds grow with cluster size', () => {
  it('reaches 200 nodes with fanout 2 in about eight rounds, as the lesson says', () => {
    const avg = averageRounds(200, 2, 60);
    expect(avg).toBeGreaterThan(6.5);
    expect(avg).toBeLessThan(9.5);
  });

  it('adds rounds steadily as the cluster doubles, not in proportion to its size', () => {
    for (const fanout of [1, 2, 3]) {
      const rows = roundsBySize(fanout, 60);
      for (let i = 1; i < rows.length; i++) expect(rows[i]!.rounds).toBeGreaterThan(rows[i - 1]!.rounds);
      // 16 times the nodes costs a handful of extra rounds, nowhere near 16 times as many.
      const last = rows[rows.length - 1]!;
      expect(last.rounds / rows[0]!.rounds).toBeLessThan(3);
      expect(last.rounds).toBeLessThan(2.2 * last.log2);
    }
  });

  it('adds about one round per doubling at fanout 2, and more at fanout 1', () => {
    const two = roundsPerDoubling(roundsBySize(2, 60));
    const one = roundsPerDoubling(roundsBySize(1, 60));
    expect(two).toBeGreaterThan(0.6);
    expect(two).toBeLessThan(1.4);
    expect(one).toBeGreaterThan(two);
    expect(one).toBeLessThan(2.4);
  });

  it('needs fewer rounds with a bigger fanout', () => {
    const r = [1, 2, 3, 4].map((f) => averageRounds(128, f, 40));
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThan(r[i - 1]!);
  });
});

describe('inputs and layout', () => {
  it('clamps the controls', () => {
    expect(clampNodes(3)).toBe(MIN_NODES);
    expect(clampNodes(999)).toBe(MAX_NODES);
    expect(clampNodes(200)).toBe(200);
    expect(clampNodes('x')).toBe(64);
    expect(clampFanout(9)).toBe(4);
    expect(clampFanout(0)).toBe(1);
  });

  it('fits every node inside the width at phone and desktop sizes', () => {
    for (const width of [340, 700, 1100]) {
      for (const n of DOUBLINGS) {
        const g = gridLayout(n, width);
        expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
        expect(g.offsetX).toBeGreaterThanOrEqual(0);
        expect(g.offsetX + g.cols * g.cell).toBeLessThanOrEqual(width);
        expect(g.cell).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
