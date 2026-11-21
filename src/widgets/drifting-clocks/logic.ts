/**
 * Two server clocks, one in Oregon and one in Singapore. Each runs fast or slow at a steady
 * drift (parts per million) and is snapped back to true time at every sync, as NTP would do.
 * Then an ordering demo: Maya comments in Singapore, a friend replies from Oregon a little
 * later, and the thread is sorted either by wall-clock timestamp or by a logical (Lamport) clock.
 */

export const MINUTE_MS = 60_000;
/** The simulated window: two hours. */
export const WINDOW_MIN = 120;
export const WINDOW_MS = WINDOW_MIN * MINUTE_MS;
/** True time at the start of the window, 09:00:00.000, as milliseconds after midnight. */
export const START_MS = 9 * 60 * MINUTE_MS;
export const DAY_MS = 24 * 60 * MINUTE_MS;

export const MAX_DRIFT_PPM = 200;
/** Minutes between syncs; null means the clocks are never corrected inside the window. */
export type SyncEvery = number | null;
export const SYNC_CHOICES: readonly SyncEvery[] = [1, 15, 60, null];

export const DEFAULTS = {
  oregonPpm: -20,
  singaporePpm: 80,
  syncMin: 15 as SyncEvery,
  atMin: 44,
  gapMs: 100,
};

/** Milliseconds since the last sync. Both clocks are synced at the start of the window and then every interval. */
export function sinceSync(tMs: number, syncMin: SyncEvery): number {
  const t = Math.max(0, tMs);
  if (syncMin === null) return t;
  return t % (syncMin * MINUTE_MS);
}

/** How far a clock is from true time, t ms into the window. Positive means the clock is ahead (fast). */
export function offsetAt(tMs: number, driftPpm: number, syncMin: SyncEvery): number {
  return (driftPpm * sinceSync(tMs, syncMin)) / 1_000_000;
}

/** Singapore’s clock minus Oregon’s: positive when Singapore is ahead. */
export function skewAt(tMs: number, oregonPpm: number, singaporePpm: number, syncMin: SyncEvery): number {
  return offsetAt(tMs, singaporePpm, syncMin) - offsetAt(tMs, oregonPpm, syncMin);
}

/** The largest skew inside the window, reached just before each sync (or at the end, with no sync). */
export function maxSkew(oregonPpm: number, singaporePpm: number, syncMin: SyncEvery): number {
  const span = syncMin === null ? WINDOW_MS : Math.min(WINDOW_MS, syncMin * MINUTE_MS);
  return (Math.abs(singaporePpm - oregonPpm) * span) / 1_000_000;
}

/** How far two clocks drifting at these rates move apart in one minute, in ms. */
export function apartPerMinute(oregonPpm: number, singaporePpm: number): number {
  return (Math.abs(singaporePpm - oregonPpm) * MINUTE_MS) / 1_000_000;
}

/** How far a clock with this drift is off after a day without any sync, in ms. */
export function offsetPerDay(driftPpm: number): number {
  return (driftPpm * DAY_MS) / 1_000_000;
}

/** Sync times inside the window, in minutes (not counting the start). */
export function syncTimes(syncMin: SyncEvery): number[] {
  if (syncMin === null) return [];
  const out: number[] = [];
  for (let s = syncMin; s < WINDOW_MIN - 1e-9; s += syncMin) out.push(s);
  return out;
}

/**
 * Points for a sawtooth line: x in minutes, y in ms. Each sync adds a vertical drop back to zero.
 * The last point is the value just before the end of the window.
 */
export function offsetSeries(driftPpm: number, syncMin: SyncEvery): { x: number; y: number }[] {
  const pts = [{ x: 0, y: 0 }];
  const syncs = syncTimes(syncMin);
  for (const s of syncs) {
    pts.push({ x: s, y: (driftPpm * syncMin! * MINUTE_MS) / 1_000_000 });
    pts.push({ x: s, y: 0 });
  }
  const last = syncs.length ? syncs[syncs.length - 1]! : 0;
  pts.push({ x: WINDOW_MIN, y: (driftPpm * (WINDOW_MIN - last) * MINUTE_MS) / 1_000_000 });
  return pts;
}

/* ------------------------------------------------------------------ */
/* Logical (Lamport) clock                                             */
/* ------------------------------------------------------------------ */

/** A local event, such as saving a comment: add one. */
export function tick(counter: number): number {
  return counter + 1;
}

/** A message arrives carrying another server’s counter: jump to at least that value. */
export function receive(counter: number, carried: number): number {
  return Math.max(counter, carried);
}

/** Each server’s counter just before Maya comments. */
export const SINGAPORE_COUNTER_BEFORE = 41;
export const OREGON_COUNTER_BEFORE = 17;

/* ------------------------------------------------------------------ */
/* The comment thread                                                  */
/* ------------------------------------------------------------------ */

export type Region = 'Oregon' | 'Singapore';

export type Post = {
  id: 'comment' | 'reply';
  author: string;
  region: Region;
  text: string;
  /** True time the post was saved, ms after midnight. */
  trueMs: number;
  /** Timestamp from the saving server’s own clock, ms after midnight. */
  stampMs: number;
  /** Logical clock value. */
  counter: number;
};

export type Thread = {
  comment: Post;
  reply: Post;
  /** Sorted by wall-clock timestamp; ties go to the region whose name sorts first. */
  byTime: Post[];
  /** Sorted by logical counter; ties go to the region whose name sorts first. */
  byCounter: Post[];
  /** True when the timestamps put the reply above the comment it answers. */
  replyFirst: boolean;
  /** Reply timestamp minus comment timestamp: negative when the order is flipped. */
  stampGapMs: number;
  /** Singapore’s clock minus Oregon’s when the comment was saved. */
  skewMs: number;
};

const byRegion = (a: Post, b: Post) => (a.region < b.region ? -1 : a.region > b.region ? 1 : 0);

/**
 * Maya comments from Singapore `atMin` minutes into the window; a friend replies from Oregon `gapMs` later.
 * Each post is stamped by its own region’s clock, and carries a Lamport counter.
 */
export function thread(atMin: number, gapMs: number, oregonPpm: number, singaporePpm: number, syncMin: SyncEvery): Thread {
  const tComment = atMin * MINUTE_MS;
  const tReply = tComment + Math.max(0, gapMs);
  const commentCounter = tick(SINGAPORE_COUNTER_BEFORE);
  const oregonAfter = receive(OREGON_COUNTER_BEFORE, commentCounter);
  const comment: Post = {
    id: 'comment',
    author: 'Maya',
    region: 'Singapore',
    text: 'Where was this taken?',
    trueMs: START_MS + tComment,
    stampMs: START_MS + tComment + offsetAt(tComment, singaporePpm, syncMin),
    counter: commentCounter,
  };
  const reply: Post = {
    id: 'reply',
    author: 'Her friend',
    region: 'Oregon',
    text: 'Sentosa, last Sunday.',
    trueMs: START_MS + tReply,
    stampMs: START_MS + tReply + offsetAt(tReply, oregonPpm, syncMin),
    counter: tick(oregonAfter),
  };
  const byTime = [comment, reply].sort((a, b) => a.stampMs - b.stampMs || byRegion(a, b));
  const byCounter = [comment, reply].sort((a, b) => a.counter - b.counter || byRegion(a, b));
  return {
    comment,
    reply,
    byTime,
    byCounter,
    replyFirst: byTime[0]!.id === 'reply',
    stampGapMs: reply.stampMs - comment.stampMs,
    skewMs: skewAt(tComment, oregonPpm, singaporePpm, syncMin),
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Milliseconds after midnight as "HH:MM:SS.mmm", wrapping around the day. */
export function formatClock(msOfDay: number): string {
  const t = ((Math.round(msOfDay) % DAY_MS) + DAY_MS) % DAY_MS;
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / MINUTE_MS);
  const s = Math.floor((t % MINUTE_MS) / 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${String(t % 1000).padStart(3, '0')}`;
}

/** A signed offset: "+211 ms", "−48 ms", "0 ms", "+1.25 s". Uses a true minus sign. */
export function formatOffset(ms: number): string {
  const r = Math.round(ms);
  if (r === 0) return '0 ms';
  const sign = r > 0 ? '+' : '−';
  const abs = Math.abs(r);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10_000 ? 1 : 2)} s`;
  return `${sign}${abs} ms`;
}

/** An unsigned amount of time: "90 ms", "1.25 s". */
export function formatSpan(ms: number): string {
  const abs = Math.abs(Math.round(ms));
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10_000 ? 1 : 2)} s`;
  return `${abs} ms`;
}

/** Drift in ppm with its sign and direction, for slider readouts. */
export function formatDrift(ppm: number): string {
  if (ppm === 0) return '0 ppm, exact';
  return `${ppm > 0 ? '+' : '−'}${Math.abs(ppm)} ppm, ${ppm > 0 ? 'fast' : 'slow'}`;
}
