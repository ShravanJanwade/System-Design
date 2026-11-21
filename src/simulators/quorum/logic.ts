/**
 * Quorum explorer: one key of Snapgram's activity store, kept on N replicas with no leader.
 *
 * Each round, the app writes a new version of the key. The coordinator sends the write to every
 * replica that is up and confirms it once W of them have stored it; those first W are the write
 * quorum. The replicas outside it are still applying the write when the read arrives, which is
 * the moment a stale read is most likely. The read takes the first R replicas to answer (or, in
 * the worst case, the replicas the write has not reached) and returns the highest version it is
 * sent. If a replica it heard from was behind, the coordinator sends it the new version (read repair).
 *
 * Replicas that are down miss the write and cannot answer, so a write needs W replicas up and a
 * read needs R. Response times are seeded random draws, identical for every setting, so rounds
 * and the statistics over many rounds are reproducible and compare like for like.
 */
import { createRng, hashString, type Rng } from '@/lib/random';

export type ReadMode = 'random' | 'worst';

export const READ_MODES: ReadMode[] = ['random', 'worst'];

/** The explorer offers two to five replicas; the logic accepts one to nine. */
export const MIN_REPLICAS = 1;
export const MAX_REPLICAS = 9;

export type QuorumConfig = {
  /** Replicas that hold a copy of the key (N). */
  n: number;
  /** Replicas that must answer a read (R). */
  r: number;
  /** Replicas that must confirm a write (W). */
  w: number;
  /** 0-based replicas that are down for the whole round. */
  failed: number[];
  /** Which replicas answer the read: the first R to reply, or the ones the write has not reached. */
  readMode: ReadMode;
  /** The round shown in the diagram. */
  round: number;
  /** Rounds simulated for the statistics. */
  rounds: number;
  seed: number;
  /** Version every replica holds before the round's write. */
  startVersion: number;
  /** Response time of one replica (illustrative): base + exponential tail, plus a rare slow outlier. */
  baseMs: number;
  tailMeanMs: number;
  slowChance: number;
  slowMinMs: number;
  slowMaxMs: number;
};

export const DEFAULT_CONFIG: QuorumConfig = {
  n: 3,
  r: 2,
  w: 2,
  failed: [],
  readMode: 'random',
  round: 0,
  rounds: 1000,
  seed: 47,
  startVersion: 6,
  baseMs: 2,
  tailMeanMs: 3,
  slowChance: 0.03,
  slowMinMs: 30,
  slowMaxMs: 80,
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Fills in defaults and keeps every setting in range: 1 ≤ R, W ≤ N, failed replicas exist. */
export function normalizeConfig(partial: Partial<QuorumConfig> = {}): QuorumConfig {
  const c = { ...DEFAULT_CONFIG, ...partial };
  const n = clampInt(c.n, MIN_REPLICAS, MAX_REPLICAS);
  const failed = [...new Set((c.failed ?? []).map((i) => Math.round(i)).filter((i) => i >= 0 && i < n))].sort((a, b) => a - b);
  return {
    ...c,
    n,
    r: clampInt(c.r, 1, n),
    w: clampInt(c.w, 1, n),
    failed,
    readMode: c.readMode === 'worst' ? 'worst' : 'random',
    round: Math.max(0, Math.floor(c.round)),
    rounds: Math.max(1, Math.floor(c.rounds)),
  };
}

export const replicaName = (i: number) => `Replica ${i + 1}`;

/** "no replica", "Replica 2", "Replicas 1 and 3", "Replicas 1, 2 and 4". */
export function listReplicas(indexes: number[]): string {
  const nums = [...indexes].sort((a, b) => a - b).map((i) => String(i + 1));
  if (nums.length === 0) return 'no replica';
  if (nums.length === 1) return `Replica ${nums[0]}`;
  return `Replicas ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
}

/** The smallest majority of n: 2 of 3, 3 of 4, 3 of 5. */
export const majorityOf = (n: number) => Math.floor(n / 2) + 1;

/** Binomial coefficient: ways to pick k of n. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) v = (v * (n - i + 1)) / i;
  return Math.round(v);
}

/**
 * Chance that a read sent right after a write returns an old version, with `live` replicas up.
 * The write sits on W of them; a random read asks R. It is stale only if all R miss the W.
 * When the write or the read is refused, no read can be stale.
 */
export function staleChance(live: number, w: number, r: number, mode: ReadMode = 'random'): number {
  if (w > live || r > live) return 0;
  const behind = live - w;
  if (mode === 'worst') return r <= behind ? 1 : 0;
  return choose(behind, r) / choose(live, r);
}

export type QuorumMath = {
  n: number;
  r: number;
  w: number;
  /** Replicas that are up. */
  live: number;
  /** R + W − N, never below zero: replicas that every read set shares with every write set. */
  minOverlap: number;
  /** R + W > N: every read set overlaps every write set, whichever replicas they are. */
  guaranteed: boolean;
  writeAvailable: boolean;
  readAvailable: boolean;
  /** Failed replicas that writes and reads can survive: N − W and N − R. */
  writeTolerates: number;
  readTolerates: number;
  /** Chance that a random read right after a write misses it, with the replicas that are down now. */
  staleChance: number;
  /** The same in the worst case: 1 if the read can avoid the write entirely, else 0. */
  worstCaseStale: number;
};

export function quorumMath(config: QuorumConfig): QuorumMath {
  const { n, r, w } = config;
  const live = n - config.failed.length;
  return {
    n,
    r,
    w,
    live,
    minOverlap: Math.max(0, r + w - n),
    guaranteed: r + w > n,
    writeAvailable: live >= w,
    readAvailable: live >= r,
    writeTolerates: n - w,
    readTolerates: n - r,
    staleChance: staleChance(live, w, r, 'random'),
    worstCaseStale: staleChance(live, w, r, 'worst'),
  };
}

export type ReplicaRound = {
  index: number;
  down: boolean;
  /** Version the replica holds when the read arrives. */
  version: number;
  /** One of the first W replicas to store the write. */
  inWrite: boolean;
  /** Up, but the write has not reached it by the time the read arrives. */
  behind: boolean;
  inRead: boolean;
  /** Answered the read with an old version while the read returned the new one, so read repair updates it. */
  repaired: boolean;
  writeMs: number;
  readMs: number;
};

export type QuorumRound = {
  replicas: ReplicaRound[];
  /** Replicas that are up. */
  live: number[];
  writeOk: boolean;
  readOk: boolean;
  /** Version this round's write creates. */
  newVersion: number;
  /** Latest successfully written version: the new one if the write was accepted. */
  latest: number;
  /** Version the read returned, or null if the read was refused. */
  returned: number | null;
  /** Whether the read returned the latest version; null if the read was refused. */
  fresh: boolean | null;
  writeSet: number[];
  readSet: number[];
  /** Replicas in both the write quorum and the read quorum. */
  overlap: number[];
  repaired: number[];
  /** Time until the W-th confirmation, or null if the write was refused. */
  writeWaitMs: number | null;
  /** Time until the R-th answer, or null if the read was refused. */
  readWaitMs: number | null;
};

/** One replica's response time. Always three draws, so every round uses the same stream of numbers. */
function responseMs(rng: Rng, c: QuorumConfig): number {
  const tail = -c.tailMeanMs * Math.log(1 - rng.next());
  const slowRoll = rng.next();
  const slowExtra = rng.range(c.slowMinMs, c.slowMaxMs);
  return c.baseMs + tail + (slowRoll < c.slowChance ? slowExtra : 0);
}

/** Response times to the write and to the read for every possible replica, independent of N, R and W. */
function drawRound(c: QuorumConfig, round: number): { writeMs: number[]; readMs: number[] } {
  const rng = createRng(hashString(`quorum:${c.seed}:${round}`));
  const writeMs: number[] = [];
  const readMs: number[] = [];
  for (let i = 0; i < MAX_REPLICAS; i++) {
    writeMs.push(responseMs(rng, c));
    readMs.push(responseMs(rng, c));
  }
  return { writeMs, readMs };
}

/** Plays one write followed by one read. `config` must be normalized. */
export function playRound(config: QuorumConfig, round: number = config.round): QuorumRound {
  const c = config;
  const { writeMs, readMs } = drawRound(c, round);
  const down = new Set(c.failed);
  const live = Array.from({ length: c.n }, (_, i) => i).filter((i) => !down.has(i));

  const writeOk = live.length >= c.w;
  const writeSet = writeOk ? [...live].sort((a, b) => writeMs[a]! - writeMs[b]! || a - b).slice(0, c.w) : [];
  const inWrite = new Set(writeSet);
  const newVersion = c.startVersion + 1;
  const latest = writeOk ? newVersion : c.startVersion;
  const versionOf = (i: number) => (inWrite.has(i) ? newVersion : c.startVersion);

  const readOk = live.length >= c.r;
  let readSet: number[] = [];
  if (readOk) {
    const order = [...live].sort((a, b) => {
      if (c.readMode === 'worst') {
        const wa = inWrite.has(a) ? 1 : 0;
        const wb = inWrite.has(b) ? 1 : 0;
        if (wa !== wb) return wa - wb;
      }
      return readMs[a]! - readMs[b]! || a - b;
    });
    readSet = order.slice(0, c.r);
  }
  const inRead = new Set(readSet);
  const returned = readOk ? Math.max(...readSet.map(versionOf)) : null;
  const fresh = returned === null ? null : returned === latest;
  const overlap = readSet.filter((i) => inWrite.has(i)).sort((a, b) => a - b);
  const repaired = writeOk && fresh ? readSet.filter((i) => !inWrite.has(i)).sort((a, b) => a - b) : [];

  const replicas: ReplicaRound[] = Array.from({ length: c.n }, (_, i) => ({
    index: i,
    down: down.has(i),
    version: versionOf(i),
    inWrite: inWrite.has(i),
    behind: writeOk && !down.has(i) && !inWrite.has(i),
    inRead: inRead.has(i),
    repaired: repaired.includes(i),
    writeMs: writeMs[i]!,
    readMs: readMs[i]!,
  }));

  return {
    replicas,
    live,
    writeOk,
    readOk,
    newVersion,
    latest,
    returned,
    fresh,
    writeSet: [...writeSet].sort((a, b) => a - b),
    readSet: [...readSet].sort((a, b) => a - b),
    overlap,
    repaired,
    writeWaitMs: writeOk ? Math.max(...writeSet.map((i) => writeMs[i]!)) : null,
    readWaitMs: readOk ? Math.max(...readSet.map((i) => readMs[i]!)) : null,
  };
}

export type WaitStats = { median: number; p99: number };

export type QuorumStats = {
  rounds: number;
  /** Rounds whose read returned an older version than the latest accepted write. */
  staleReads: number;
  staleShare: number;
  /** Null when every write is refused. */
  writeWait: WaitStats | null;
  /** Null when every read is refused. */
  readWait: WaitStats | null;
};

/** Nearest-rank percentile of an ascending list. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/** Plays rounds 0 to rounds − 1 and summarizes them. */
export function runRounds(config: QuorumConfig): QuorumStats {
  const writes: number[] = [];
  const reads: number[] = [];
  let stale = 0;
  for (let k = 0; k < config.rounds; k++) {
    const rd = playRound(config, k);
    if (rd.writeWaitMs !== null) writes.push(rd.writeWaitMs);
    if (rd.readWaitMs !== null) reads.push(rd.readWaitMs);
    if (rd.fresh === false) stale++;
  }
  writes.sort((a, b) => a - b);
  reads.sort((a, b) => a - b);
  const summary = (list: number[]): WaitStats | null => (list.length ? { median: percentile(list, 0.5), p99: percentile(list, 0.99) } : null);
  return { rounds: config.rounds, staleReads: stale, staleShare: stale / config.rounds, writeWait: summary(writes), readWait: summary(reads) };
}

export type QuorumResult = { config: QuorumConfig; math: QuorumMath; round: QuorumRound; stats: QuorumStats };

export function simulateQuorum(partial: Partial<QuorumConfig> = {}): QuorumResult {
  const config = normalizeConfig(partial);
  return { config, math: quorumMath(config), round: playRound(config), stats: runRounds(config) };
}

/* ------------------------------------------------------------------ */
/* Challenges: when each counts as attempted                           */
/* ------------------------------------------------------------------ */

/** 1. Settings where a read can miss the latest write. */
export const staleReadPossible = (c: QuorumConfig) => c.r + c.w <= c.n;

/** 2. Majority quorums for both reads and writes, with at least one replica down. */
export const majorityUnderFailure = (c: QuorumConfig) => c.w === majorityOf(c.n) && c.r === majorityOf(c.n) && c.failed.length > 0;

/** 3. The fastest writes (W = 1) that still guarantee fresh reads. */
export const fastWritesFreshReads = (c: QuorumConfig) => c.w === 1 && c.r + c.w > c.n;

/** 4. Every replica must confirm each write, and one is down. */
export const writeAllWithFailure = (c: QuorumConfig) => c.w === c.n && c.failed.length > 0;
