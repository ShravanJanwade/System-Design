/**
 * Trace waterfall: one Snapgram home-feed request, traced across every service it touches.
 *
 * Pure and deterministic. The request is a fixed tree of spans with illustrative timings,
 * plus at most one fault: a dependency that replies slowly, or a reply that is lost so the
 * caller waits for its timeout, pauses, and retries. From that it computes when each span
 * starts and ends, its own time (time not covered by its child calls), its slack (how much
 * longer it could take before the whole request gets slower) and the critical path.
 */

export type SpanId = 'gateway' | 'auth' | 'feed' | 'timeline' | 'posts' | 'likes' | 'ranking' | 'features' | 'suggestions';

/** The calls the learner can break. All are leaves of the span tree. */
export type DependencyId = 'posts' | 'likes' | 'features' | 'suggestions';

export type FaultKind = 'none' | 'slow' | 'retry';

/** Maps to a component color: gateway (edge), service (compute), cache, database. */
export type SpanKind = 'gateway' | 'service' | 'cache' | 'database';

export type Fault = {
  kind: FaultKind;
  target: DependencyId;
  /** For a slow call, the extra delay; for a retry, the caller's timeout. In ms. */
  ms: number;
};

export type SpanDef = {
  id: SpanId;
  parent: SpanId | null;
  service: string;
  operation: string;
  kind: SpanKind;
  /** Own work before the first child call starts, in ms. */
  lead: number;
  /** Own work after the last child call returns, in ms. A span without children spends all its time here. */
  tail: number;
  /** Sibling spans that must finish before this one can start. */
  after: SpanId[];
  /** Time between being ready and starting, such as a network hop, in ms. */
  gap: number;
  note: string;
};

/**
 * The feed request, parents before children and every span after the siblings it waits for.
 * Healthy total: 104 ms. All timings are illustrative.
 */
export const SPANS: readonly SpanDef[] = [
  {
    id: 'gateway',
    parent: null,
    service: 'API gateway',
    operation: 'GET /feed',
    kind: 'gateway',
    lead: 2,
    tail: 3,
    after: [],
    gap: 0,
    note: 'The root span. The gateway checks the session, calls the feed service, then compresses and sends the response, so its bar is the latency the user feels.',
  },
  {
    id: 'auth',
    parent: 'gateway',
    service: 'Session store',
    operation: 'Check the session',
    kind: 'cache',
    lead: 0,
    tail: 3,
    after: [],
    gap: 0,
    note: 'A quick lookup of the login session. It is tiny, but the feed service cannot start until it finishes, so it sits on the critical path.',
  },
  {
    id: 'feed',
    parent: 'gateway',
    service: 'Feed service',
    operation: 'Build the feed',
    kind: 'service',
    lead: 2,
    tail: 8,
    after: ['auth'],
    gap: 1,
    note: 'Reads the list of post IDs, loads the posts and their like counts in parallel, has them ranked, and asks for suggestions alongside. Most of its bar is waiting on those calls.',
  },
  {
    id: 'timeline',
    parent: 'feed',
    service: 'Feed cache',
    operation: 'Get post IDs',
    kind: 'cache',
    lead: 0,
    tail: 4,
    after: [],
    gap: 0,
    note: 'Reads the IDs of the newest posts from the accounts Maya follows. The posts and like counts both need this list, so they wait for it.',
  },
  {
    id: 'posts',
    parent: 'feed',
    service: 'Posts database',
    operation: 'Load 20 posts',
    kind: 'database',
    lead: 0,
    tail: 25,
    after: ['timeline'],
    gap: 1,
    note: 'Loads captions and photo links for the posts. It runs in parallel with the like counts, and ranking waits for both.',
  },
  {
    id: 'likes',
    parent: 'feed',
    service: 'Like counter',
    operation: 'Count likes',
    kind: 'cache',
    lead: 0,
    tail: 10,
    after: ['timeline'],
    gap: 1,
    note: 'Fetches like counts for the same posts, in parallel with the posts query. Because the posts query takes longer, this call has room to slow down.',
  },
  {
    id: 'ranking',
    parent: 'feed',
    service: 'Ranking service',
    operation: 'Rank posts',
    kind: 'service',
    lead: 2,
    tail: 40,
    after: ['posts', 'likes'],
    gap: 1,
    note: 'Scores the posts for Maya. It first reads her features, then spends most of its time on its own work: running the ranking model.',
  },
  {
    id: 'features',
    parent: 'ranking',
    service: 'Feature store',
    operation: 'Read user features',
    kind: 'database',
    lead: 0,
    tail: 12,
    after: [],
    gap: 0,
    note: 'Reads what the ranking model knows about Maya, such as which accounts she interacts with most. It is nested two calls deep.',
  },
  {
    id: 'suggestions',
    parent: 'feed',
    service: 'Suggestions service',
    operation: 'Suggest accounts',
    kind: 'service',
    lead: 0,
    tail: 60,
    after: [],
    gap: 0,
    note: 'Picks accounts to suggest. It needs nothing from the other calls, so it starts at once and runs alongside them, and the feed waits for it only if it finishes last.',
  },
];

export const DEPENDENCIES: readonly { id: DependencyId; label: string }[] = [
  { id: 'posts', label: 'Posts database' },
  { id: 'likes', label: 'Like counter' },
  { id: 'features', label: 'Feature store' },
  { id: 'suggestions', label: 'Suggestions' },
];

export const FAULT_KINDS: readonly { id: FaultKind; label: string }[] = [
  { id: 'none', label: 'Nothing' },
  { id: 'slow', label: 'Slow replies' },
  { id: 'retry', label: 'Lost reply, retried' },
];

/** The pause between a timed-out attempt and the retry. */
export const RETRY_BACKOFF_MS = 10;
export const DELAY_RANGE = { min: 0, max: 400, step: 5, initial: 150 } as const;
export const TIMEOUT_RANGE = { min: 80, max: 400, step: 10, initial: 200 } as const;
export const HEALTHY: Fault = { kind: 'none', target: 'suggestions', ms: 0 };

export type SpanRow = {
  /** Unique per row: the span id, or `<id>:1` for a first attempt that timed out. */
  key: string;
  span: SpanId;
  parent: SpanId | null;
  depth: number;
  service: string;
  operation: string;
  kind: SpanKind;
  start: number;
  end: number;
  duration: number;
  /** Time not covered by this span's child calls. */
  self: number;
  status: 'ok' | 'timed-out';
  /** 0 when the call was not retried; otherwise 1 (timed out) or 2 (the retry). */
  attempt: 0 | 1 | 2;
  critical: boolean;
  /** How much longer this span could take before the whole request gets slower. */
  slack: number;
  /** Extra delay injected by the fault, in ms. */
  slowedBy: number;
  note: string;
};

export type Trace = {
  /** Depth first, children ordered by start time. */
  rows: SpanRow[];
  total: number;
  /** Spans on the critical path, in the order they appear. */
  critical: SpanId[];
  fault: Fault;
};

const EPS = 1e-9;

export function isDependencyId(v: unknown): v is DependencyId {
  return typeof v === 'string' && DEPENDENCIES.some((d) => d.id === v);
}

export function isFaultKind(v: unknown): v is FaultKind {
  return typeof v === 'string' && FAULT_KINDS.some((f) => f.id === v);
}

export function spanDef(id: SpanId): SpanDef {
  return SPANS.find((s) => s.id === id)!;
}

export function spanName(id: SpanId): string {
  return spanDef(id).service;
}

function childrenOf(id: SpanId | null): SpanDef[] {
  return SPANS.filter((s) => s.parent === id);
}

function activeFault(fault: Fault, id: SpanId): Fault | null {
  return fault.kind !== 'none' && fault.target === id ? fault : null;
}

/** Total length covered by a set of intervals, counting overlaps once. */
export function unionLength(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/** Lays out the trace for one fault (or none) and finds its critical path. */
export function buildTrace(fault: Fault = HEALTHY): Trace {
  const start = new Map<SpanId, number>();
  const end = new Map<SpanId, number>();
  /** Time from the last child's end (or the end of the lead work) to this span's end. */
  const closing = new Map<SpanId, number>();

  // Forward pass: earliest start and end of every span.
  const place = (def: SpanDef, at: number): number => {
    start.set(def.id, at);
    const base = at + def.lead;
    let lastChildEnd = base;
    for (const kid of childrenOf(def.id)) {
      const ready = Math.max(base, ...kid.after.map((a) => end.get(a) ?? base));
      lastChildEnd = Math.max(lastChildEnd, place(kid, ready + kid.gap));
    }
    const f = activeFault(fault, def.id);
    const slow = f?.kind === 'slow' ? Math.max(0, f.ms) : 0;
    const retry = f?.kind === 'retry' ? Math.max(0, f.ms) + RETRY_BACKOFF_MS : 0;
    const finish = lastChildEnd + retry + def.tail + slow;
    closing.set(def.id, finish - lastChildEnd);
    end.set(def.id, finish);
    return finish;
  };
  const root = childrenOf(null)[0]!;
  const total = place(root, 0);

  // Backward pass: the latest each span may end without delaying the root.
  const latestEnd = new Map<SpanId, number>();
  const back = (def: SpanDef, le: number) => {
    latestEnd.set(def.id, le);
    const kids = childrenOf(def.id);
    const limit = le - (closing.get(def.id) ?? 0);
    const latestStart = new Map<SpanId, number>();
    for (const kid of [...kids].reverse()) {
      let kidLe = limit;
      for (const d of kids) {
        if (d.after.includes(kid.id)) kidLe = Math.min(kidLe, (latestStart.get(d.id) ?? limit) - d.gap);
      }
      latestStart.set(kid.id, kidLe - (end.get(kid.id)! - start.get(kid.id)!));
      back(kid, kidLe);
    }
  };
  back(root, total);

  // Rows, depth first, with children in start order.
  const rows: SpanRow[] = [];
  const byStart = (a: SpanDef, b: SpanDef) => start.get(a.id)! - start.get(b.id)! || SPANS.indexOf(a) - SPANS.indexOf(b);
  const visit = (def: SpanDef, depth: number): [number, number][] => {
    const s = start.get(def.id)!;
    const e = end.get(def.id)!;
    const slack = Math.max(0, latestEnd.get(def.id)! - e);
    const f = activeFault(fault, def.id);
    const shared = {
      span: def.id,
      parent: def.parent,
      depth,
      service: def.service,
      operation: def.operation,
      kind: def.kind,
      critical: slack < EPS,
      slack: slack < EPS ? 0 : slack,
      note: def.note,
    };
    if (f?.kind === 'retry') {
      const firstEnd = s + Math.max(0, f.ms);
      const secondStart = firstEnd + RETRY_BACKOFF_MS;
      rows.push({ ...shared, key: `${def.id}:1`, start: s, end: firstEnd, duration: firstEnd - s, self: firstEnd - s, status: 'timed-out', attempt: 1, slowedBy: 0 });
      rows.push({ ...shared, key: def.id, start: secondStart, end: e, duration: e - secondStart, self: e - secondStart, status: 'ok', attempt: 2, slowedBy: 0 });
      return [
        [s, firstEnd],
        [secondStart, e],
      ];
    }
    const index = rows.length;
    rows.push({ ...shared, key: def.id, start: s, end: e, duration: e - s, self: e - s, status: 'ok', attempt: 0, slowedBy: f?.kind === 'slow' ? Math.max(0, f.ms) : 0 });
    const covered: [number, number][] = [];
    for (const kid of childrenOf(def.id).sort(byStart)) covered.push(...visit(kid, depth + 1));
    rows[index] = { ...rows[index]!, self: e - s - unionLength(covered) };
    return [[s, e]];
  };
  visit(root, 0);

  const critical: SpanId[] = [];
  for (const r of rows) if (r.critical && r.attempt !== 1 && !critical.includes(r.span)) critical.push(r.span);
  return { rows, total, critical, fault };
}

/** The critical-path span that spends the most time on its own work: usually where to look first. */
export function topCriticalSelf(t: Trace): SpanRow {
  const onPath = t.rows.filter((r) => r.critical);
  return onPath.reduce((best, r) => (r.self > best.self ? r : best), onPath[0] ?? t.rows[0]!);
}

/** Rounded milliseconds, such as "104 ms". */
export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

const TICK_STEPS = [10, 20, 25, 50, 100, 200, 250, 500];

/** A time axis from 0 that covers maxMs with at most maxTicks intervals of a round size. */
export function axisTicks(maxMs: number, maxTicks = 6): { domain: number; ticks: number[] } {
  const m = Math.max(1, maxMs);
  const step = TICK_STEPS.find((s) => Math.ceil(m / s) <= maxTicks) ?? Math.ceil(m / maxTicks / 1000) * 1000;
  const count = Math.max(1, Math.ceil(m / step));
  return { domain: count * step, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) };
}

/** The sentence under a selected span: what happened to it and whether it is on the critical path. */
export function rowStatus(r: SpanRow): string {
  if (r.status === 'timed-out') {
    return `Timed out: no reply came within ${formatMs(r.duration)}, so the caller gave up, paused ${formatMs(RETRY_BACKOFF_MS)} and tried again.`;
  }
  const parts: string[] = [];
  if (r.attempt === 2) parts.push('The retry. It answered at normal speed, but only after the timeout and the pause.');
  if (r.slowedBy > 0) parts.push(`Slowed by ${formatMs(r.slowedBy)} in this experiment.`);
  if (r.parent === null) parts.push('The root span: its length is the latency the user feels.');
  else if (r.critical) parts.push('On the critical path: any extra time here makes the whole request slower by the same amount.');
  else parts.push(`Off the critical path: it could take ${formatMs(r.slack)} longer before the request got any slower.`);
  return parts.join(' ');
}

/** Accessible name for a span's row. */
export function rowSummary(r: SpanRow): string {
  const name = r.attempt ? `${r.service}, attempt ${r.attempt}` : `${r.service}, ${r.operation.toLowerCase()}`;
  const outcome = r.status === 'timed-out' ? ', timed out' : '';
  const path = r.critical ? 'on the critical path' : `off the critical path with ${formatMs(r.slack)} of slack`;
  return `${name}: starts at ${formatMs(r.start)}, takes ${formatMs(r.duration)}${outcome}, ${path}.`;
}

/** Text alternative for the whole waterfall. */
export function describeTrace(t: Trace): string {
  const off = t.rows.filter((r) => !r.critical && r.attempt !== 1);
  const offText = off.length
    ? ` Off the critical path: ${off.map((r) => `${r.service} (${formatMs(r.slack)} of slack)`).join(', ')}.`
    : '';
  return (
    `Trace waterfall of one feed request: ${t.rows.length} spans, ${formatMs(t.total)} in total.` +
    ` Critical path: ${t.critical.map(spanName).join(', ')}.` +
    offText +
    ' Timings are illustrative.'
  );
}
