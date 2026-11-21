import { createRng } from '@/lib/random';

/**
 * Push gossip in synchronous rounds. One node learns a fact ("cache node 9 is down"). In every
 * round, each node that already knew at the start of the round tells `fanout` other nodes,
 * picked at random with a seeded generator. The node the fact is about is down: it never hears
 * or passes anything on, and messages sent to it are lost.
 */

export const MIN_NODES = 16;
export const MAX_NODES = 256;
export const NODE_STEP = 8;
export const MIN_FANOUT = 1;
export const MAX_FANOUT = 4;
/** Cluster sizes for the "rounds versus size" comparison: each is double the one before. */
export const DOUBLINGS = [16, 32, 64, 128, 256] as const;
/** Index of the node that notices first (shown as "cache node 4"). */
export const ORIGIN = 3;
/** Index of the node that is down (shown as "cache node 9"). */
export const DOWN = 8;
/** Safety stop; real runs finish far sooner. */
export const MAX_ROUNDS = 200;

export type Message = {
  from: number;
  to: number;
  /** True when this message was the first the target heard of the fact. */
  news: boolean;
};

export type GossipRun = {
  n: number;
  fanout: number;
  seed: number;
  /** The round in which each node learned the fact: 0 for the origin, -1 for never (the down node). */
  learnedAt: number[];
  /** Messages sent in each round; rounds[0] is round 1. */
  rounds: Message[][];
  /** How many nodes knew after each round; index 0 is before round 1. */
  knownAfter: number[];
  /** Nodes that are up, so can learn the fact. */
  live: number;
  /** Rounds until every live node knew, or null if the safety stop was hit. */
  roundsToAll: number | null;
};

export function clampNodes(v: unknown, fallback = 64): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round(n / NODE_STEP) * NODE_STEP));
}

export function clampFanout(v: unknown, fallback = 2): number {
  const f = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(MIN_FANOUT, Math.min(MAX_FANOUT, Math.round(f)));
}

/** Run gossip to completion. Same inputs, same run, on every machine. */
export function runGossip(nodes: number, fanout: number, seed: number, down: number | null = DOWN): GossipRun {
  const n = Math.max(2, Math.round(nodes));
  const k = Math.max(1, Math.min(Math.round(fanout), n - 1));
  const origin = Math.min(ORIGIN, n - 1);
  const dead = down !== null && down < n && down !== origin ? down : -1;
  const rng = createRng(seed);
  const learnedAt = new Array<number>(n).fill(-1);
  learnedAt[origin] = 0;
  const live = n - (dead >= 0 ? 1 : 0);
  let known = 1;
  const rounds: Message[][] = [];
  const knownAfter = [1];
  const picked: number[] = [];

  while (known < live && rounds.length < MAX_ROUNDS) {
    const round = rounds.length + 1;
    const messages: Message[] = [];
    for (let from = 0; from < n; from++) {
      const at = learnedAt[from]!;
      // Only nodes that knew before this round started pass the news on.
      if (at < 0 || at >= round) continue;
      picked.length = 0;
      while (picked.length < k) {
        const r = rng.int(n - 1);
        const to = r >= from ? r + 1 : r;
        if (!picked.includes(to)) picked.push(to);
      }
      for (const to of picked) {
        const news = to !== dead && learnedAt[to] === -1;
        if (news) {
          learnedAt[to] = round;
          known++;
        }
        messages.push({ from, to, news });
      }
    }
    rounds.push(messages);
    knownAfter.push(known);
  }

  return { n, fanout: k, seed, learnedAt, rounds, knownAfter, live, roundsToAll: known >= live ? rounds.length : null };
}

/** Messages sent in rounds 1 to `round`. */
export function messagesUpTo(run: GossipRun, round: number): number {
  let total = 0;
  for (let i = 0; i < Math.min(round, run.rounds.length); i++) total += run.rounds[i]!.length;
  return total;
}

/** Nodes that knew after `round` rounds. */
export function knownAt(run: GossipRun, round: number): number {
  return run.knownAfter[Math.max(0, Math.min(round, run.knownAfter.length - 1))]!;
}

/** Average rounds to reach every live node, over `runs` seeded runs. */
export function averageRounds(nodes: number, fanout: number, runs = 40, firstSeed = 1): number {
  let total = 0;
  for (let i = 0; i < runs; i++) total += runGossip(nodes, fanout, firstSeed + i).roundsToAll ?? MAX_ROUNDS;
  return total / runs;
}

export type SizeRow = { nodes: number; log2: number; rounds: number };

/** Average rounds for each size in DOUBLINGS. */
export function roundsBySize(fanout: number, runs = 40): SizeRow[] {
  return DOUBLINGS.map((nodes) => ({ nodes, log2: Math.log2(nodes), rounds: averageRounds(nodes, fanout, runs) }));
}

/** Rounds added per doubling of the cluster, from the smallest to the largest size in the table. */
export function roundsPerDoubling(rows: SizeRow[]): number {
  if (rows.length < 2) return 0;
  const a = rows[0]!;
  const b = rows[rows.length - 1]!;
  return (b.rounds - a.rounds) / (b.log2 - a.log2);
}

/** Where to draw the nodes: a grid that fits the width, with square cells. */
export function gridLayout(n: number, width: number): { cols: number; rows: number; cell: number; offsetX: number; height: number } {
  const pad = 8;
  const inner = Math.max(120, width - pad * 2);
  const targetHeight = width < 520 ? 260 : 220;
  let cols = Math.ceil(Math.sqrt((n * inner) / targetHeight));
  cols = Math.max(4, Math.min(cols, n, Math.floor(inner / 14)));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(48, inner / cols);
  const offsetX = pad + (inner - cell * cols) / 2;
  return { cols, rows, cell, offsetX, height: rows * cell + pad * 2 };
}
