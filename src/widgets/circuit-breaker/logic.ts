/**
 * Circuit-breaker widget: Snapgram's feed service calling the suggestions service through a breaker.
 *
 * A request arrives every `intervalMs`. In the closed state each request calls the dependency, and
 * the breaker records the result when the call finishes: a success, an error, or a timeout when the
 * dependency takes longer than `timeoutMs`. The last `windowSize` results form a rolling window;
 * when `threshold` of them are failures, the breaker trips open.
 *
 * While open, requests fail fast: no call is made and the caller serves its fallback. The first
 * request after `coolDownMs` moves the breaker to half-open and becomes the trial call; requests
 * that arrive while the trial is in flight fail fast too. A successful trial closes the breaker and
 * clears the window; a failed one opens it again for another cool-down.
 *
 * Results of ordinary calls that finish after the breaker has left the closed state still reach
 * their users, but the breaker ignores them, as most libraries do.
 */

export type BreakerState = 'closed' | 'open' | 'half-open';
export type Dependency = 'healthy' | 'failing' | 'slow';
export type Outcome = 'success' | 'error' | 'timeout';
export type Reason = 'tripped' | 'cool-down over' | 'trial succeeded' | 'trial failed';

export type BreakerConfig = {
  /** Time between incoming requests. */
  intervalMs: number;
  /** How many recent results the rolling window keeps. */
  windowSize: number;
  /** Failures in the window that trip the breaker. */
  threshold: number;
  /** The caller gives up on a call after this long. */
  timeoutMs: number;
  /** How long the breaker stays open before it tries a trial call. */
  coolDownMs: number;
  /** How long the dependency takes to answer in each condition. */
  healthyMs: number;
  failingMs: number;
  slowMs: number;
};

export const DEFAULT_BREAKER: BreakerConfig = {
  intervalMs: 500,
  windowSize: 10,
  threshold: 5,
  timeoutMs: 1000,
  coolDownMs: 5000,
  healthyMs: 80,
  failingMs: 40,
  slowMs: 3000,
};

export type RequestRecord = {
  /** 1 for the first request. */
  id: number;
  atMs: number;
  /** The breaker's state when the request arrived, after any cool-down check. */
  state: BreakerState;
  /** call: sent to the dependency. trial: the half-open test call. fast: failed fast, no call made. */
  kind: 'call' | 'trial' | 'fast';
  /** The call's result once known; null while it is in flight, and for requests that failed fast. */
  outcome: Outcome | null;
  /** When the user got an answer, suggestions or the fallback; null while still waiting. */
  answeredAtMs: number | null;
  /** True when the user got the fallback instead of suggestions. */
  fallback: boolean;
};

export type Transition = { atMs: number; from: BreakerState; to: BreakerState; reason: Reason };

type Pending = { id: number; doneAtMs: number; outcome: Outcome; kind: 'call' | 'trial' };

export type BreakerSim = {
  /** Arrival time of the next request. */
  nowMs: number;
  state: BreakerState;
  /** Results recorded while closed, oldest first, at most `windowSize`. */
  window: Outcome[];
  /** When the breaker last opened. */
  openedAtMs: number | null;
  trialInFlight: boolean;
  /** Calls waiting on the dependency, by finish time. */
  pending: Pending[];
  /** The most recent requests, oldest first. */
  requests: RequestRecord[];
  transitions: Transition[];
  /** Transitions during the most recent step. */
  lastStep: Transition[];
  totals: {
    requests: number;
    /** Calls and trials sent to the dependency. */
    calls: number;
    /** Requests that failed fast without a call. */
    fast: number;
    /** Calls that ended in an error or a timeout. */
    failures: number;
    fallbacks: number;
    answered: number;
    /** Total time users waited for an answer. */
    waitedMs: number;
  };
};

/** How many requests the record keeps. */
export const HISTORY = 200;

export function createBreaker(): BreakerSim {
  return {
    nowMs: 0,
    state: 'closed',
    window: [],
    openedAtMs: null,
    trialInFlight: false,
    pending: [],
    requests: [],
    transitions: [],
    lastStep: [],
    totals: { requests: 0, calls: 0, fast: 0, failures: 0, fallbacks: 0, answered: 0, waitedMs: 0 },
  };
}

export function isFailure(o: Outcome | null): boolean {
  return o === 'error' || o === 'timeout';
}

export function failuresIn(window: Outcome[]): number {
  return window.filter(isFailure).length;
}

/** What one call to the dependency returns, and when the caller knows. */
export function callResult(dependency: Dependency, c: BreakerConfig = DEFAULT_BREAKER): { outcome: Outcome; durationMs: number } {
  switch (dependency) {
    case 'healthy':
      return { outcome: 'success', durationMs: c.healthyMs };
    case 'failing':
      return { outcome: 'error', durationMs: c.failingMs };
    case 'slow':
      return c.slowMs > c.timeoutMs ? { outcome: 'timeout', durationMs: c.timeoutMs } : { outcome: 'success', durationMs: c.slowMs };
  }
}

/** Time left before the open breaker will let a trial through, or null when it is not open. */
export function coolDownLeftMs(s: BreakerSim, c: BreakerConfig = DEFAULT_BREAKER): number | null {
  if (s.state !== 'open' || s.openedAtMs === null) return null;
  return Math.max(0, s.openedAtMs + c.coolDownMs - s.nowMs);
}

function move(s: BreakerSim, to: BreakerState, reason: Reason, atMs: number) {
  const t: Transition = { atMs, from: s.state, to, reason };
  s.transitions.push(t);
  s.lastStep.push(t);
  s.state = to;
}

/** Record every call that finishes by `limitMs` (inclusive or not), and react to it. */
function settle(s: BreakerSim, c: BreakerConfig, limitMs: number, inclusive: boolean) {
  while (s.pending.length && (inclusive ? s.pending[0]!.doneAtMs <= limitMs : s.pending[0]!.doneAtMs < limitMs)) {
    const p = s.pending.shift()!;
    const index = s.requests.findIndex((r) => r.id === p.id);
    const failed = isFailure(p.outcome);
    if (index >= 0) {
      const r = s.requests[index]!;
      s.requests[index] = { ...r, outcome: p.outcome, answeredAtMs: p.doneAtMs, fallback: failed };
      s.totals.waitedMs += p.doneAtMs - r.atMs;
    }
    s.totals.answered += 1;
    if (failed) {
      s.totals.failures += 1;
      s.totals.fallbacks += 1;
    }

    if (p.kind === 'trial') {
      s.trialInFlight = false;
      if (failed) {
        move(s, 'open', 'trial failed', p.doneAtMs);
        s.openedAtMs = p.doneAtMs;
      } else {
        move(s, 'closed', 'trial succeeded', p.doneAtMs);
        s.window = [];
      }
    } else if (s.state === 'closed') {
      s.window.push(p.outcome);
      if (s.window.length > c.windowSize) s.window.shift();
      if (failuresIn(s.window) >= c.threshold) {
        move(s, 'open', 'tripped', p.doneAtMs);
        s.openedAtMs = p.doneAtMs;
      }
    }
  }
}

/**
 * Handle the next request, with the dependency in the given condition, and every call that finishes
 * before the request after it. Pure: returns a new state and leaves `prev` untouched.
 */
export function advance(prev: BreakerSim, dependency: Dependency, c: BreakerConfig = DEFAULT_BREAKER): BreakerSim {
  const s: BreakerSim = {
    ...prev,
    window: [...prev.window],
    pending: [...prev.pending],
    requests: [...prev.requests],
    transitions: [...prev.transitions],
    lastStep: [],
    totals: { ...prev.totals },
  };
  const t = s.nowMs;
  settle(s, c, t, true);
  if (s.state === 'open' && s.openedAtMs !== null && t >= s.openedAtMs + c.coolDownMs) move(s, 'half-open', 'cool-down over', t);

  const id = s.totals.requests + 1;
  s.totals.requests = id;
  const kind: RequestRecord['kind'] = s.state === 'closed' ? 'call' : s.state === 'half-open' && !s.trialInFlight ? 'trial' : 'fast';
  if (kind === 'fast') {
    s.requests.push({ id, atMs: t, state: s.state, kind, outcome: null, answeredAtMs: t, fallback: true });
    s.totals.fast += 1;
    s.totals.fallbacks += 1;
    s.totals.answered += 1;
  } else {
    s.requests.push({ id, atMs: t, state: s.state, kind, outcome: null, answeredAtMs: null, fallback: false });
    s.totals.calls += 1;
    if (kind === 'trial') s.trialInFlight = true;
    const { outcome, durationMs } = callResult(dependency, c);
    s.pending.push({ id, doneAtMs: t + durationMs, outcome, kind });
    s.pending.sort((a, b) => a.doneAtMs - b.doneAtMs || a.id - b.id);
  }

  settle(s, c, t + c.intervalMs, false);
  s.nowMs = t + c.intervalMs;
  if (s.requests.length > HISTORY) s.requests = s.requests.slice(-HISTORY);
  return s;
}

/** Run a sequence of requests, one dependency condition per request. */
export function runBreaker(conditions: Dependency[], c: BreakerConfig = DEFAULT_BREAKER, start: BreakerSim = createBreaker()): BreakerSim {
  return conditions.reduce((s, d) => advance(s, d, c), start);
}

/** `n` copies of one condition, for building sequences. */
export function repeat(d: Dependency, n: number): Dependency[] {
  return Array.from({ length: n }, () => d);
}

/** Average wait, in ms, over the last `n` requests that have been answered. */
export function recentWaitMs(s: BreakerSim, n = 10): number | null {
  const done = s.requests.filter((r) => r.answeredAtMs !== null).slice(-n);
  if (!done.length) return null;
  return done.reduce((sum, r) => sum + (r.answeredAtMs! - r.atMs), 0) / done.length;
}
