/**
 * Event-time windows over a small stream of Snapgram posts (lesson 6.5).
 *
 * Every post has two times: its event time (when the phone posted it) and its arrival time
 * (when the stream processor received it). Windows group posts by event time.
 *
 * The watermark is the processor's estimate of how far event time has got. In a busy stream,
 * new posts arrive every moment, so the newest event time seen tracks the clock closely; the
 * model therefore keeps the watermark a fixed delay behind the arrival clock. When the
 * watermark passes a window's end, the window emits its first result. It then stays open for
 * the allowed lateness: a post for it that arrives in that time updates the result, and a post
 * that arrives later still is dropped (a batch job over the archive would still count it).
 *
 * Times are minutes after 18:00.
 */

export type Tag = 'sunset' | 'beach' | 'coffee';
export const TAGS: readonly Tag[] = ['sunset', 'beach', 'coffee'];

export type Post = {
  id: string;
  tag: Tag;
  /** Event time: when the phone posted it. */
  eventTime: number;
  /** Arrival time: when the stream processor received it. */
  arrival: number;
};

/**
 * Twenty-six posts from 18:00 to 18:30. Most arrive a few seconds after they are posted; six
 * are delayed: by about a minute, by a subway ride, by a phone that was offline for a while.
 * No time falls exactly on a whole or half minute, so no post ties with a window boundary.
 */
export const POSTS: readonly Post[] = [
  { id: 'p1', tag: 'sunset', eventTime: 0.6, arrival: 0.8 },
  { id: 'p2', tag: 'coffee', eventTime: 1.7, arrival: 1.9 },
  { id: 'p3', tag: 'beach', eventTime: 2.4, arrival: 2.6 },
  { id: 'p4', tag: 'sunset', eventTime: 3.3, arrival: 3.6 },
  { id: 'p5', tag: 'beach', eventTime: 4.7, arrival: 5.8 },
  { id: 'p6', tag: 'coffee', eventTime: 5.4, arrival: 5.6 },
  { id: 'p7', tag: 'sunset', eventTime: 6.8, arrival: 7.1 },
  { id: 'p8', tag: 'sunset', eventTime: 8.2, arrival: 41.6 },
  { id: 'p9', tag: 'beach', eventTime: 9.1, arrival: 9.3 },
  { id: 'p10', tag: 'sunset', eventTime: 10.4, arrival: 10.7 },
  { id: 'p11', tag: 'coffee', eventTime: 11.6, arrival: 14.2 },
  { id: 'p12', tag: 'sunset', eventTime: 12.3, arrival: 12.6 },
  { id: 'p13', tag: 'beach', eventTime: 13.2, arrival: 13.4 },
  { id: 'p14', tag: 'sunset', eventTime: 14.3, arrival: 16.9 },
  { id: 'p15', tag: 'beach', eventTime: 15.8, arrival: 16.1 },
  { id: 'p16', tag: 'sunset', eventTime: 16.6, arrival: 16.8 },
  { id: 'p17', tag: 'coffee', eventTime: 17.9, arrival: 18.2 },
  { id: 'p18', tag: 'sunset', eventTime: 18.7, arrival: 18.9 },
  { id: 'p19', tag: 'sunset', eventTime: 19.4, arrival: 27.3 },
  { id: 'p20', tag: 'sunset', eventTime: 21.2, arrival: 21.4 },
  { id: 'p21', tag: 'beach', eventTime: 22.6, arrival: 22.9 },
  { id: 'p22', tag: 'sunset', eventTime: 23.8, arrival: 24.1 },
  { id: 'p23', tag: 'sunset', eventTime: 24.6, arrival: 29.1 },
  { id: 'p24', tag: 'sunset', eventTime: 26.1, arrival: 26.3 },
  { id: 'p25', tag: 'coffee', eventTime: 27.7, arrival: 27.9 },
  { id: 'p26', tag: 'sunset', eventTime: 28.9, arrival: 29.2 },
];

export const START_HOUR = 18;
/** Windows cover event times from 18:00 to 18:30. */
export const HORIZON = 30;
/** The timeline runs to 18:45, after the last late post has arrived. */
export const AXIS_END = 45;
/** A post this many minutes behind its event time counts as delayed in the widget's list. */
export const DELAYED_AFTER = 1;

export const WINDOW_SIZES = [3, 5, 10, 15] as const;
export const DELAY_MAX = 3;
export const DELAY_STEP = 0.5;
export const LATENESS_MAX = 15;

export type WindowKind = 'tumbling' | 'sliding';
export const WINDOW_KINDS: readonly WindowKind[] = ['tumbling', 'sliding'];

export type StreamConfig = {
  kind: WindowKind;
  /** Window length in minutes. */
  size: number;
  /** How far the watermark trails the arrival clock, in minutes. */
  watermarkDelay: number;
  /** How long a window is kept after its first result, in minutes. */
  allowedLateness: number;
};

export const DEFAULT_CONFIG: StreamConfig = { kind: 'tumbling', size: 5, watermarkDelay: 1, allowedLateness: 0 };

/** What happened to a post in one window. */
export type Fate = 'on-time' | 'updated' | 'dropped';

export type Counts = Record<Tag, number>;

export type WindowSpan = { index: number; start: number; end: number; row: number };

export type Update = { at: number; post: Post; before: number; after: number };

export type WindowResult = WindowSpan & {
  /** Arrival-clock time when the watermark passes the window's end: the first result goes out. */
  emitAt: number;
  /** Arrival-clock time when the window's state is discarded; later posts for it are dropped. */
  closeAt: number;
  /** Every post whose event time falls in the window, in arrival order. */
  members: { post: Post; fate: Fate }[];
  first: Counts;
  firstTotal: number;
  /** Late posts that arrived while the window was still kept, each updating the result. */
  updates: Update[];
  final: Counts;
  finalTotal: number;
  dropped: Post[];
  /** What a batch job over every post, late ones included, would count. */
  exact: Counts;
  exactTotal: number;
};

export type PostOutcome = {
  post: Post;
  /** Arrival minus event time, in minutes, to one decimal. */
  delay: number;
  fates: { window: number; fate: Fate }[];
  /** The worst fate across the post's windows: dropped, then updated, then on time. */
  worst: Fate;
};

export type StreamRun = {
  config: StreamConfig;
  windows: WindowResult[];
  posts: PostOutcome[];
  totals: Record<Fate, number>;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

function zero(): Counts {
  return { sunset: 0, beach: 0, coffee: 0 };
}

export function total(c: Counts): number {
  return c.sunset + c.beach + c.coffee;
}

/** Snap a value to the nearest allowed option. */
function nearest(options: readonly number[], v: number): number {
  return options.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), options[0]!);
}

export function normalizeConfig(c: Partial<StreamConfig>): StreamConfig {
  const d = DEFAULT_CONFIG;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    kind: c.kind === 'sliding' ? 'sliding' : c.kind === 'tumbling' ? 'tumbling' : d.kind,
    size: nearest(WINDOW_SIZES, num(c.size, d.size)),
    watermarkDelay: Math.min(DELAY_MAX, Math.max(0, Math.round(num(c.watermarkDelay, d.watermarkDelay) / DELAY_STEP) * DELAY_STEP)),
    allowedLateness: Math.min(LATENESS_MAX, Math.max(0, Math.round(num(c.allowedLateness, d.allowedLateness)))),
  };
}

/** Tumbling windows start one after another; sliding windows start every half window. */
export function slideFor(kind: WindowKind, size: number): number {
  return kind === 'tumbling' ? size : size / 2;
}

/** The windows that cover 18:00 to 18:30. Sliding windows alternate between two rows so their overlap shows. */
export function windowsFor(kind: WindowKind, size: number): WindowSpan[] {
  const slide = slideFor(kind, size);
  const spans: WindowSpan[] = [];
  for (let i = 0; i * slide + size <= HORIZON + 1e-9; i++) {
    spans.push({ index: i, start: i * slide, end: i * slide + size, row: kind === 'tumbling' ? 0 : i % 2 });
  }
  return spans;
}

/** The fate of a post that arrives at `arrival` for a window that emits at `emitAt` and is discarded at `closeAt`. */
export function fateOf(arrival: number, emitAt: number, closeAt: number): Fate {
  if (arrival < emitAt) return 'on-time';
  if (arrival < closeAt) return 'updated';
  return 'dropped';
}

export function runStream(partial: Partial<StreamConfig> = {}): StreamRun {
  const config = normalizeConfig({ ...DEFAULT_CONFIG, ...partial });
  const windows: WindowResult[] = windowsFor(config.kind, config.size).map((span) => {
    const emitAt = span.end + config.watermarkDelay;
    const closeAt = emitAt + config.allowedLateness;
    const members = POSTS.filter((p) => p.eventTime >= span.start && p.eventTime < span.end)
      .slice()
      .sort((a, b) => a.arrival - b.arrival)
      .map((post) => ({ post, fate: fateOf(post.arrival, emitAt, closeAt) }));
    const first = zero();
    const exact = zero();
    for (const m of members) {
      exact[m.post.tag]++;
      if (m.fate === 'on-time') first[m.post.tag]++;
    }
    const final = { ...first };
    const updates: Update[] = [];
    let running = total(first);
    for (const m of members) {
      if (m.fate !== 'updated') continue;
      final[m.post.tag]++;
      updates.push({ at: m.post.arrival, post: m.post, before: running, after: running + 1 });
      running++;
    }
    return {
      ...span,
      emitAt,
      closeAt,
      members,
      first,
      firstTotal: total(first),
      updates,
      final,
      finalTotal: total(final),
      dropped: members.filter((m) => m.fate === 'dropped').map((m) => m.post),
      exact,
      exactTotal: members.length,
    };
  });

  const posts: PostOutcome[] = POSTS.map((post) => {
    const fates = windows.flatMap((w) => {
      const m = w.members.find((x) => x.post.id === post.id);
      return m ? [{ window: w.index, fate: m.fate }] : [];
    });
    const worst: Fate = fates.some((f) => f.fate === 'dropped') ? 'dropped' : fates.some((f) => f.fate === 'updated') ? 'updated' : 'on-time';
    return { post, delay: round1(post.arrival - post.eventTime), fates, worst };
  });

  const totals: Record<Fate, number> = { 'on-time': 0, updated: 0, dropped: 0 };
  for (const p of posts) totals[p.worst]++;
  return { config, windows, posts, totals };
}

/* ------------------------------------------------------------------ */
/* The stream at a moment of the arrival clock                         */
/* ------------------------------------------------------------------ */

/** collecting: no result yet. open: result emitted, late posts still update it. closed: final. */
export type WindowPhase = 'collecting' | 'open' | 'closed';

export type WindowView = { window: WindowResult; phase: WindowPhase; count: number; updates: number; dropped: number };

export function watermarkAt(config: StreamConfig, now: number): number {
  return now - config.watermarkDelay;
}

export function windowAt(w: WindowResult, now: number): WindowView {
  const arrived = (p: Post) => p.arrival <= now;
  if (now < w.emitAt) {
    const count = w.members.filter((m) => m.fate === 'on-time' && arrived(m.post)).length;
    return { window: w, phase: 'collecting', count, updates: 0, dropped: 0 };
  }
  const updates = w.updates.filter((u) => u.at <= now).length;
  return {
    window: w,
    phase: now < w.closeAt ? 'open' : 'closed',
    count: w.firstTotal + updates,
    updates,
    dropped: w.dropped.filter(arrived).length,
  };
}

/** Posts that have arrived by `now`, counted by their worst fate. */
export function totalsAt(run: StreamRun, now: number): Record<Fate, number> & { arrived: number } {
  const t = { 'on-time': 0, updated: 0, dropped: 0, arrived: 0 };
  for (const p of run.posts) {
    if (p.post.arrival > now) continue;
    t.arrived++;
    t[p.worst]++;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes after 18:00 as a clock time: 4.7 -> "18:04:42", 15 -> "18:15". */
export function formatClock(t: number): string {
  const secs = Math.round(t * 60);
  const h = START_HOUR + Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return s === 0 ? `${h}:${pad(m)}` : `${h}:${pad(m)}:${pad(s)}`;
}

/** "1 minute", "2.5 minutes", "0 minutes". */
export function formatMinutes(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)} ${m === 1 ? 'minute' : 'minutes'}`;
}

export function windowLabel(w: WindowSpan): string {
  return `${formatClock(w.start)}–${formatClock(w.end)}`;
}

/** "3 sunset, 1 beach": the non-zero hashtag counts, biggest first. */
export function formatCounts(c: Counts): string {
  const parts = TAGS.filter((t) => c[t] > 0)
    .slice()
    .sort((a, b) => c[b] - c[a])
    .map((t) => `${c[t]} #${t}`);
  return parts.length ? parts.join(', ') : 'none';
}

/** One sentence per window a delayed post belongs to, saying what happened to it there. */
export function explainPost(run: StreamRun, outcome: PostOutcome): string[] {
  const lateness = run.config.allowedLateness;
  return outcome.fates.map(({ window, fate }) => {
    const w = run.windows[window]!;
    const label = windowLabel(w);
    if (fate === 'on-time') {
      return `Window ${label}: it arrived before the result went out at ${formatClock(w.emitAt)}, so it counted on time.`;
    }
    if (fate === 'updated') {
      const u = w.updates.find((x) => x.post.id === outcome.post.id)!;
      return `Window ${label}: its result went out at ${formatClock(w.emitAt)}, but the window was kept until ${formatClock(w.closeAt)}, so the post updated the count from ${u.before} to ${u.after}.`;
    }
    return lateness > 0
      ? `Window ${label}: it was kept only until ${formatClock(w.closeAt)}, so the post was dropped.`
      : `Window ${label}: its result went out at ${formatClock(w.emitAt)} and allowed lateness is zero, so the post was dropped.`;
  });
}

const SIZE_WORD: Record<number, string> = { 3: 'Three', 5: 'Five', 10: 'Ten', 15: 'Fifteen' };

/** Plain-text description of the stream at `now`, for screen readers. */
export function describeAt(run: StreamRun, now: number): string {
  const c = run.config;
  const t = totalsAt(run, now);
  const kind =
    c.kind === 'tumbling'
      ? `${SIZE_WORD[c.size] ?? c.size}-minute tumbling windows`
      : `${SIZE_WORD[c.size] ?? c.size}-minute sliding windows that start every ${formatMinutes(slideFor(c.kind, c.size))}`;
  const emitted = run.windows.filter((w) => now >= w.emitAt).length;
  return `${kind}. The watermark trails the clock by ${formatMinutes(c.watermarkDelay)}, and windows are kept ${formatMinutes(
    c.allowedLateness,
  )} after their first result. At ${formatClock(now)}, ${t.arrived} of ${POSTS.length} posts have arrived: ${t['on-time']} counted on time, ${
    t.updated
  } updated a result already published, and ${t.dropped} were dropped. ${emitted} of ${run.windows.length} windows have published a result.`;
}
