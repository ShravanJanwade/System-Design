/**
 * Replication simulator: one Snapgram photo database, with a leader and two followers in Oregon,
 * replayed over 12 seconds.
 *
 * Every write goes to the leader, which commits it to its log and ships it to both followers.
 * Each follower applies the writes in log order after a delay, the replication lag, which drifts
 * slowly around its average. Follower 2 also serves the analytics team, so it runs about twice as
 * far behind as Follower 1.
 *
 * Asynchronous: the leader confirms a write as soon as it has committed it.
 * Synchronous: the leader confirms only once Follower 1 has applied the write too. Follower 2
 * stays asynchronous, the usual semi-synchronous setup.
 *
 * Maya saves a new caption, and her app reloads her profile. Meanwhile a comment arrives on Sam’s
 * beach photo, and she refreshes that photo six times. Each read goes to a follower (spread across
 * both, or pinned to one by hashing her user name), or to the leader for her own profile in the
 * minute after she changes it. Every read is checked against two guarantees: read-your-writes and
 * monotonic reads.
 *
 * Optionally, the leader’s disk dies at 7 s. Writes fail until the most up-to-date follower is
 * promoted 3 s later. Confirmed writes that follower had not applied when the leader died are lost.
 * A follower is treated as having a write only once it has applied it.
 */
import { createRng, hashString } from '@/lib/random';

export type Mode = 'async' | 'sync';
export type Follower = 'f1' | 'f2';
/** Where a read is served from. */
export type Copy = 'leader' | Follower;

export const MODES: Mode[] = ['async', 'sync'];
export const FOLLOWERS: Follower[] = ['f1', 'f2'];
export const COPY_NAME: Record<Copy, string> = { leader: 'the leader', f1: 'Follower 1', f2: 'Follower 2' };

/** The user whose reads the simulation follows. Her name hashes to Follower 2. */
export const MAYA = 'maya';

/** Choices on the lag slider, in ms. */
export const LAG_STEPS = [5, 50, 200, 500, 1000, 2000, 4000];

export type ReplicationConfig = {
  /** Average time for a write to reach and be applied on Follower 1, in ms. */
  lagMs: number;
  mode: Mode;
  /** For a minute after Maya changes her profile, her reads of it go to the leader. */
  readFromLeader: boolean;
  /** Each user’s follower reads go to one follower, picked by hashing the user name. */
  sticky: boolean;
  /** The leader’s disk dies at `failAtMs`. */
  failLeader: boolean;
  /** Follower 2’s lag as a multiple of Follower 1’s. */
  slowFactor: number;
  /** How far each follower’s lag drifts around its average, as a fraction. */
  wobble: number;
  wobblePeriodMs: number;
  /** Likes per second from other users. */
  writesPerSec: number;
  /** Time for the leader to commit a write to its own log. */
  commitMs: number;
  /** Time for a follower’s confirmation to reach the leader. */
  ackMs: number;
  durationMs: number;
  failAtMs: number;
  /** Time from the leader’s failure until a follower is promoted and takes writes. */
  failoverMs: number;
  /** How long after a change Maya’s profile reads go to the leader. */
  leaderWindowMs: number;
  /** Time from the caption’s confirmation to the app reloading her profile. */
  reloadDelayMs: number;
  captionAtMs: number;
  commentAtMs: number;
  /** When Maya refreshes Sam’s photo, counted from the moment the comment is sent. */
  refreshOffsetsMs: number[];
  seed: number;
};

export const DEFAULT_CONFIG: ReplicationConfig = {
  lagMs: 1000,
  mode: 'async',
  readFromLeader: false,
  sticky: false,
  failLeader: false,
  slowFactor: 2,
  wobble: 0.08,
  wobblePeriodMs: 6000,
  writesPerSec: 200,
  commitMs: 5,
  ackMs: 1,
  durationMs: 12_000,
  failAtMs: 7000,
  failoverMs: 3000,
  leaderWindowMs: 60_000,
  reloadDelayMs: 300,
  captionAtMs: 1000,
  commentAtMs: 2500,
  refreshOffsetsMs: [600, 1200, 1600, 1700, 2400, 2600],
  seed: 20261118,
};

export type WriteKind = 'like' | 'caption' | 'comment';

export type Write = {
  /** Position in the leader’s log, from 1. */
  pos: number;
  kind: WriteKind;
  /** Arrival at the leader, ms. */
  at: number;
  /** Committed by the leader; null if no leader could take it. */
  committed: number | null;
  /** When each follower applied it; null if it never did before the leader died. */
  applied: Record<Follower, number | null>;
  /** When the client was told it succeeded; null if it got an error instead. */
  confirmed: number | null;
  /** Arrived while there was no leader, or while the leader was dying. */
  failed: boolean;
  /** Taken by the promoted follower after a failover. */
  afterFailover: boolean;
  /** Confirmed to the client, but missing from the promoted follower. */
  lost: boolean;
};

export type ReadKind = 'profile' | 'photo';
/** spread: the next follower in turn. pinned: Maya’s follower. leader: her own recent change. */
export type Route = 'spread' | 'pinned' | 'leader';
/**
 * fresh: nothing confirmed was missing. own-edit-missing: her own confirmed change was missing
 * (read-your-writes broken). went-back: older than something she had already seen (monotonic reads
 * broken). behind: missing a confirmed change she had not seen yet (allowed, if not ideal).
 */
export type Verdict = 'fresh' | 'own-edit-missing' | 'went-back' | 'behind';

export type Read = {
  /** Order in Maya’s script: 1 is the profile reload, 2 to 7 the photo refreshes. */
  n: number;
  kind: ReadKind;
  at: number;
  copy: Copy;
  route: Route;
  /** The new caption (profile) or the new comment (photo) was there. */
  sawNew: boolean;
  verdict: Verdict;
};

export type Failover = {
  at: number;
  promotedAt: number;
  promoted: Follower;
  /** Age of the newest write the promoted follower had when the leader died, ms. */
  behindMs: number;
  /** Confirmed writes the promoted follower never received. */
  lost: number;
  /** Writes the leader committed but never confirmed, because it died first. */
  unconfirmed: number;
  /** Writes that got an error because no leader could take them. */
  failed: number;
  /** Writes the new leader took afterwards. */
  accepted: number;
};

export type ReplicationResult = {
  config: ReplicationConfig;
  writes: Write[];
  caption: Write;
  comment: Write;
  /** Maya’s reads, in time order. */
  reads: Read[];
  pinned: Follower;
  counts: Record<Verdict, number>;
  /** Mean time from arrival to confirmation, over the writes the original leader confirmed. */
  writeMs: number;
  /** Mean measured lag of each follower, ms. */
  meanLag: Record<Follower, number>;
  failover: Failover | null;
};

/** The follower a user’s reads are pinned to: the user name’s hash, modulo the number of followers. */
export function pinnedFollower(user: string): Follower {
  return FOLLOWERS[hashString(user) % FOLLOWERS.length]!;
}

/** A follower’s lag for a write committed at `t`: its average, drifting slowly by ± `wobble`. */
export function lagAt(c: ReplicationConfig, f: Follower, t: number, phase: number): number {
  const base = c.lagMs * (f === 'f1' ? 1 : c.slowFactor);
  return base * (1 + c.wobble * Math.sin((2 * Math.PI * t) / c.wobblePeriodMs + phase));
}

/** Whether a copy had a write at time t. The leader is gone once it has failed. */
export function hasWrite(copy: Copy, w: Write, t: number, failAt: number): boolean {
  if (copy === 'leader') return w.committed !== null && w.committed <= t && t < failAt && !w.afterFailover;
  const a = w.applied[copy];
  return a !== null && a <= t;
}

export function runReplication(partial: Partial<ReplicationConfig> = {}): ReplicationResult {
  const c: ReplicationConfig = { ...DEFAULT_CONFIG, ...partial };
  const rng = createRng(c.seed);
  const phase: Record<Follower, number> = { f1: rng.range(0, 2 * Math.PI), f2: rng.range(0, 2 * Math.PI) };

  // The leader's log: likes at random (Poisson) times, plus Maya's caption and the new comment.
  const arrivals: { at: number; kind: WriteKind }[] = [];
  for (let t = 0; ; ) {
    t += (-Math.log(1 - rng.next()) * 1000) / c.writesPerSec;
    if (t >= c.durationMs) break;
    arrivals.push({ at: t, kind: 'like' });
  }
  arrivals.push({ at: c.captionAtMs, kind: 'caption' }, { at: c.commentAtMs, kind: 'comment' });
  arrivals.sort((a, b) => a.at - b.at);

  const failAt = c.failLeader ? c.failAtMs : Infinity;
  const promotedAt = failAt + c.failoverMs;
  const last: Record<Follower, number> = { f1: 0, f2: 0 };

  const writes: Write[] = arrivals.map((a, i) => {
    const w: Write = {
      pos: i + 1,
      kind: a.kind,
      at: a.at,
      committed: null,
      applied: { f1: null, f2: null },
      confirmed: null,
      failed: false,
      afterFailover: false,
      lost: false,
    };
    if (a.at >= promotedAt) {
      w.afterFailover = true;
      return w;
    }
    if (a.at + c.commitMs > failAt) {
      w.failed = true;
      return w;
    }
    const committed = a.at + c.commitMs;
    w.committed = committed;
    // Followers apply in log order: a write never overtakes the one before it.
    for (const f of FOLLOWERS) {
      const t = Math.max(last[f], committed + lagAt(c, f, committed, phase[f]));
      last[f] = t;
      w.applied[f] = t <= failAt ? t : null;
    }
    if (c.mode === 'async') {
      w.confirmed = committed;
    } else {
      const ack = w.applied.f1 === null ? Infinity : w.applied.f1 + c.ackMs;
      w.confirmed = ack <= failAt ? ack : null;
    }
    return w;
  });

  // Failover: promote the follower with the most writes, and count what it is missing.
  let failover: Failover | null = null;
  if (c.failLeader) {
    const held = (f: Follower) => writes.filter((w) => w.applied[f] !== null).length;
    const promoted: Follower = held('f1') >= held('f2') ? 'f1' : 'f2';
    let newest = 0;
    let lost = 0;
    let unconfirmed = 0;
    for (const w of writes) {
      if (w.afterFailover) {
        w.committed = w.at + c.commitMs;
        w.applied[promoted] = w.committed;
        w.confirmed = w.committed;
        continue;
      }
      if (w.committed === null) continue;
      if (w.applied[promoted] !== null) newest = Math.max(newest, w.committed);
      if (w.confirmed === null) unconfirmed++;
      else if (w.applied[promoted] === null) {
        w.lost = true;
        lost++;
      }
    }
    failover = {
      at: failAt,
      promotedAt,
      promoted,
      behindMs: failAt - newest,
      lost,
      unconfirmed,
      failed: writes.filter((w) => w.failed).length,
      accepted: writes.filter((w) => w.afterFailover).length,
    };
  }

  const caption = writes.find((w) => w.kind === 'caption')!;
  const comment = writes.find((w) => w.kind === 'comment')!;
  const pinned = pinnedFollower(MAYA);

  // Maya's script: reload her profile once the caption is saved, and refresh Sam's photo six times.
  const script: { kind: ReadKind; at: number }[] = [];
  if (caption.confirmed !== null) script.push({ kind: 'profile', at: caption.confirmed + c.reloadDelayMs });
  for (const off of c.refreshOffsetsMs) script.push({ kind: 'photo', at: c.commentAtMs + off });

  const reads: Read[] = script.map((s, i) => {
    let copy: Copy;
    let route: Route;
    const recentChange = caption.confirmed !== null && s.at - caption.confirmed < c.leaderWindowMs;
    if (c.readFromLeader && s.kind === 'profile' && recentChange && s.at < failAt) {
      copy = 'leader';
      route = 'leader';
    } else if (c.sticky) {
      copy = pinned;
      route = 'pinned';
    } else {
      // Spread across the followers, as a load balancer in front of them would.
      copy = i % 2 === 0 ? 'f2' : 'f1';
      route = 'spread';
    }
    const target = s.kind === 'profile' ? caption : comment;
    return { n: i + 1, kind: s.kind, at: s.at, copy, route, sawNew: hasWrite(copy, target, s.at, failAt), verdict: 'fresh' };
  });

  // Judge each read in time order, against what Maya wrote and what she had already seen.
  reads.sort((a, b) => a.at - b.at || a.n - b.n);
  let seenComment = false;
  for (const r of reads) {
    if (r.kind === 'profile') {
      r.verdict = !r.sawNew && caption.confirmed !== null && caption.confirmed <= r.at ? 'own-edit-missing' : 'fresh';
      continue;
    }
    if (!r.sawNew && seenComment) r.verdict = 'went-back';
    else if (!r.sawNew && comment.confirmed !== null && comment.confirmed <= r.at) r.verdict = 'behind';
    else r.verdict = 'fresh';
    if (r.sawNew) seenComment = true;
  }

  const counts: Record<Verdict, number> = { fresh: 0, 'own-edit-missing': 0, 'went-back': 0, behind: 0 };
  for (const r of reads) counts[r.verdict]++;

  const confirmedByLeader = writes.filter((w) => !w.afterFailover && w.confirmed !== null);
  const writeMs = confirmedByLeader.reduce((s, w) => s + (w.confirmed! - w.at), 0) / Math.max(1, confirmedByLeader.length);
  const meanLag = { f1: 0, f2: 0 };
  for (const f of FOLLOWERS) {
    const copied = writes.filter((w) => !w.afterFailover && w.committed !== null && w.applied[f] !== null);
    meanLag[f] = copied.reduce((s, w) => s + (w.applied[f]! - w.committed!), 0) / Math.max(1, copied.length);
  }

  return { config: c, writes, caption, comment, reads, pinned, counts, writeMs, meanLag, failover };
}

/** The profile reload after the caption is saved. */
export function reloadRead(r: ReplicationResult): Read | undefined {
  return r.reads.find((x) => x.kind === 'profile');
}

export function photoReads(r: ReplicationResult): Read[] {
  return r.reads.filter((x) => x.kind === 'photo');
}

/** The first refresh that shows the new comment. */
export function firstSeen(r: ReplicationResult): Read | undefined {
  return photoReads(r).find((x) => x.sawNew);
}

/** The first refresh where the comment, already seen, is gone again. */
export function firstVanish(r: ReplicationResult): Read | undefined {
  return photoReads(r).find((x) => x.verdict === 'went-back');
}
