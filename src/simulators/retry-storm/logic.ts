/**
 * Retry-storm simulator: Snapgram's profile service and the phone apps that call it.
 *
 * Time moves in ticks of 100 ms. Each app runs a simple loop: it pauses for a few seconds (an
 * exponential "think time"), sends a request, and waits up to one second for the answer. An answer
 * in time is a success, and the app goes back to pausing. No answer in time is a failure, and the
 * app tries again according to the retry policy, as many times as it takes:
 *
 * - immediate: send again right away;
 * - backoff: wait 1, 2, 4, 8, then 16 seconds (the cap) after the 1st, 2nd, 3rd... failure in a row;
 * - jitter: wait a random time between zero and that backoff ("full jitter").
 *
 * Noticing a failure and sending again takes an app 100 to 200 ms, whatever the policy.
 *
 * The service answers up to `capacity` requests per second, first come, first served, from a queue
 * that holds at most `queueLimit` requests. When the queue is full, new requests are dropped, and
 * their apps simply time out. The service cannot tell when an app has given up on a request, so it
 * still spends time on requests nobody is waiting for any more: wasted work.
 *
 * At `outageStartSec` the service stalls for `outageSec` seconds. It answers nothing, though its
 * queue still fills up. At that moment every app's request fails at once, as if the stall had
 * dropped every connection, so every app starts retrying at the same time.
 */
import type { DiagramSpec, StepNote } from '@/content/types';
import { createRng, type Rng } from '@/lib/random';

export type RetryPolicy = 'immediate' | 'backoff' | 'jitter';

export type RetrySimConfig = {
  /** Phone apps calling the profile service. */
  clients: number;
  policy: RetryPolicy;
  /** How long the service stalls, in seconds. */
  outageSec: number;
  /** Requests per second the service can answer. */
  capacity: number;
  /** How long an app waits for an answer before it counts the request as failed. */
  timeoutMs: number;
  /** Average pause between an answer and the app's next request (exponentially distributed). */
  thinkSec: number;
  /** Wait before the first retry. It doubles after every failure in a row, up to `maxDelayMs`. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** Most requests the service holds waiting. When the queue is full, new requests are dropped. */
  queueLimit: number;
  outageStartSec: number;
  durationSec: number;
  tickMs: number;
  seed: number;
};

export const DEFAULT_CONFIG: RetrySimConfig = {
  clients: 900,
  policy: 'immediate',
  outageSec: 20,
  capacity: 500,
  timeoutMs: 1000,
  thinkSec: 3.5,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  queueLimit: 800,
  outageStartSec: 10,
  durationSec: 120,
  tickMs: 100,
  seed: 20261118,
};

/** One reading per second, covering that second. */
export type Sample = {
  /** Seconds since the start, at the end of this second. */
  t: number;
  /** Requests that reached the service: first tries and retries. This is the load. */
  sent: number;
  /** How many of `sent` were retries. */
  retries: number;
  /** Requests answered while their app was still waiting. */
  answered: number;
  /** Requests the service finished after their app had given up: wasted work. */
  wasted: number;
  /** Requests turned away because the queue was full. */
  dropped: number;
  /** Failures the apps noticed (timeouts, plus every app's failure when the outage starts). */
  failed: number;
  /** Requests waiting in the service's queue at the end of the second. */
  queue: number;
  /** Apps that have not had an answer since the outage began. */
  stillFailing: number;
};

export type RetrySimResult = {
  samples: Sample[];
  /** Average load before the outage, in requests per second. */
  normalLoad: number;
  /** Average load during the outage, leaving out its first two seconds. */
  outageLoad: number;
  outageEndSec: number;
  /** Highest load in any second after the outage ends. */
  peakAfterFix: number;
  /** Highest load in any second after the outage ends, as a multiple of capacity. */
  peakAfterFixRatio: number;
  /** When every app had had an answer again. Null if that never happened during the run. */
  recoveredAtSec: number | null;
  /** Seconds from the end of the outage until every app had had an answer. */
  recoveredAfterSec: number | null;
  /** After the outage: requests answered in time, wasted work, and failures. */
  afterFix: { sent: number; answered: number; wasted: number; failed: number };
  totals: { sent: number; retries: number; answered: number; wasted: number; dropped: number; failed: number; lost: number };
  /** Requests still in the queue when the run ends. */
  queueAtEnd: number;
  /** Requests the service can answer in one second. */
  capacity: number;
};

const THINKING = 0;
const WAITING = 1;
const BACKING_OFF = 2;

/** The longest wait before the retry that follows failure number `failures` (1, 2, 3...): base × 2^(failures − 1), capped. */
export function backoffCeilingMs(c: Pick<RetrySimConfig, 'baseDelayMs' | 'maxDelayMs'>, failures: number): number {
  return Math.min(c.maxDelayMs, c.baseDelayMs * 2 ** Math.max(0, failures - 1));
}

/** How long an app waits before retrying after failure number `failures`, in ms. Full jitter is uniform between 0 and the ceiling. */
export function retryDelayMs(c: Pick<RetrySimConfig, 'policy' | 'baseDelayMs' | 'maxDelayMs'>, failures: number, rng: Rng): number {
  if (c.policy === 'immediate') return 0;
  const ceiling = backoffCeilingMs(c, failures);
  return c.policy === 'backoff' ? ceiling : rng.range(0, ceiling);
}

export function runRetrySim(partial: Partial<RetrySimConfig> = {}): RetrySimResult {
  const c: RetrySimConfig = { ...DEFAULT_CONFIG, ...partial };
  const rng = createRng(c.seed);
  const n = Math.max(0, Math.round(c.clients));
  const ticks = Math.round((c.durationSec * 1000) / c.tickMs);
  const ticksPerSecond = Math.round(1000 / c.tickMs);
  const capacityPerTick = (c.capacity * c.tickMs) / 1000;
  const timeoutTicks = Math.max(1, Math.round(c.timeoutMs / c.tickMs));
  const outStart = Math.round((c.outageStartSec * 1000) / c.tickMs);
  const outEnd = outStart + Math.round((c.outageSec * 1000) / c.tickMs);
  const outageEndSec = c.outageStartSec + c.outageSec;

  // Per-app state, in typed arrays so thousands of apps stay fast.
  const state = new Uint8Array(n);
  const attempt = new Int32Array(n);
  const failures = new Int32Array(n);
  const version = new Int32Array(n);
  const hit = new Uint8Array(n);

  // A timing wheel: for each tick, pairs of (app, version). An entry whose version is stale is skipped,
  // so rescheduling an app (an answer arriving before its timeout, say) needs no removal.
  const wheel: number[][] = Array.from({ length: ticks }, () => []);
  const schedule = (a: number, at: number) => {
    version[a] = version[a]! + 1;
    if (at < ticks) wheel[at]!.push(a, version[a]!);
  };
  const thinkTicks = () => Math.max(1, Math.round((-Math.log(1 - rng.next()) * c.thinkSec * 1000) / c.tickMs));
  const noticeTicks = () => 1 + rng.int(2);
  const delayTicks = (k: number) => Math.round(retryDelayMs(c, k, rng) / c.tickMs);

  // The service's queue, a ring buffer of (app, attempt number).
  const limit = Math.max(1, Math.round(c.queueLimit));
  const qApp = new Int32Array(limit);
  const qAttempt = new Int32Array(limit);
  let qHead = 0;
  let qLen = 0;

  // Every app starts out pausing, part-way through its think time.
  for (let a = 0; a < n; a++) {
    state[a] = THINKING;
    schedule(a, Math.floor((-Math.log(1 - rng.next()) * c.thinkSec * 1000) / c.tickMs));
  }

  const totals = { sent: 0, retries: 0, answered: 0, wasted: 0, dropped: 0, failed: 0, lost: 0 };
  const samples: Sample[] = [];
  let sec = { sent: 0, retries: 0, answered: 0, wasted: 0, dropped: 0, failed: 0 };
  let stillFailing = 0;
  let recoveredAtTick: number | null = null;
  let credit = 0;

  for (let tick = 0; tick < ticks; tick++) {
    const down = tick >= outStart && tick < outEnd;

    // The outage begins: queued requests are lost, and every app's request fails at once.
    if (tick === outStart && outEnd > outStart) {
      totals.lost += qLen;
      qHead = 0;
      qLen = 0;
      for (let a = 0; a < n; a++) {
        state[a] = BACKING_OFF;
        failures[a] = 1;
        hit[a] = 1;
        schedule(a, tick + noticeTicks() + delayTicks(1));
      }
      stillFailing = n;
      sec.failed += n;
      totals.failed += n;
    }

    // 1. The service works through its queue, oldest first. Nothing gets done during the outage.
    credit += down ? 0 : capacityPerTick;
    let budget = Math.floor(credit);
    credit -= budget;
    while (budget > 0 && qLen > 0) {
      const a = qApp[qHead]!;
      const att = qAttempt[qHead]!;
      qHead = (qHead + 1) % limit;
      qLen--;
      budget--;
      if (state[a] === WAITING && attempt[a] === att) {
        // The app is still waiting for exactly this request: a success.
        state[a] = THINKING;
        failures[a] = 0;
        if (hit[a]) {
          hit[a] = 0;
          stillFailing--;
          if (stillFailing === 0) recoveredAtTick = tick;
        }
        schedule(a, tick + thinkTicks());
        sec.answered++;
        totals.answered++;
      } else {
        // The app gave up on this request long ago; the work is wasted.
        sec.wasted++;
        totals.wasted++;
      }
    }
    // 2. Apps act: timeouts become failures and retries are scheduled; pauses and waits end in a send.
    const list = wheel[tick]!;
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i]!;
      if (list[i + 1] !== version[a]) continue;
      if (state[a] === WAITING) {
        failures[a] = failures[a]! + 1;
        sec.failed++;
        totals.failed++;
        state[a] = BACKING_OFF;
        schedule(a, tick + noticeTicks() + delayTicks(failures[a]!));
      } else {
        const retry = state[a] === BACKING_OFF;
        attempt[a] = attempt[a]! + 1;
        sec.sent++;
        totals.sent++;
        if (retry) {
          sec.retries++;
          totals.retries++;
        }
        if (qLen < limit) {
          const at = (qHead + qLen) % limit;
          qApp[at] = a;
          qAttempt[at] = attempt[a]!;
          qLen++;
        } else {
          sec.dropped++;
          totals.dropped++;
        }
        state[a] = WAITING;
        schedule(a, tick + timeoutTicks);
      }
    }
    wheel[tick] = [];

    // 3. One sample at the end of each second.
    if ((tick + 1) % ticksPerSecond === 0) {
      samples.push({ t: ((tick + 1) * c.tickMs) / 1000, ...sec, queue: qLen, stillFailing });
      sec = { sent: 0, retries: 0, answered: 0, wasted: 0, dropped: 0, failed: 0 };
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const before = samples.filter((s) => s.t <= c.outageStartSec);
  const during = samples.filter((s) => s.t > c.outageStartSec + 2 && s.t <= outageEndSec);
  const after = samples.filter((s) => s.t > outageEndSec);
  const peakAfterFix = after.reduce((m, s) => Math.max(m, s.sent), 0);
  const recoveredAtSec = recoveredAtTick === null ? null : ((recoveredAtTick + 1) * c.tickMs) / 1000;

  return {
    samples,
    normalLoad: mean(before.map((s) => s.sent)),
    outageLoad: mean(during.map((s) => s.sent)),
    outageEndSec,
    peakAfterFix,
    peakAfterFixRatio: c.capacity > 0 ? peakAfterFix / c.capacity : 0,
    recoveredAtSec,
    recoveredAfterSec: recoveredAtSec === null ? null : Math.max(0, recoveredAtSec - outageEndSec),
    afterFix: {
      sent: after.reduce((s, x) => s + x.sent, 0),
      answered: after.reduce((s, x) => s + x.answered, 0),
      wasted: after.reduce((s, x) => s + x.wasted, 0),
      failed: after.reduce((s, x) => s + x.failed, 0),
    },
    totals,
    queueAtEnd: qLen,
    capacity: c.capacity,
  };
}

/**
 * How spiky the load is between two times: the busiest second divided by the average second.
 * Synchronized retries come in waves, so plain backoff scores high; jitter spreads them out.
 */
export function peakToMean(r: RetrySimResult, fromSec: number, toSec: number): number {
  const xs = r.samples.filter((s) => s.t > fromSec && s.t <= toSec).map((s) => s.sent);
  if (xs.length === 0) return 0;
  const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
  return avg > 0 ? Math.max(...xs) / avg : 0;
}

/* ------------------------------------------------------------------ */
/* The diagram the simulator draws                                     */
/* ------------------------------------------------------------------ */

const int = new Intl.NumberFormat('en-US');
const fmt = (v: number) => int.format(Math.round(v));

export const POLICY_SUMMARY: Record<RetryPolicy, string> = {
  immediate: 'retry at once',
  backoff: 'wait 1, 2, 4, 8, 16 s',
  jitter: 'random wait, up to 16 s',
};

/** The apps, the profile service, and how the run ended. */
export function stormDiagram(c: RetrySimConfig, r: RetrySimResult): DiagramSpec {
  const stuck = r.recoveredAtSec === null;
  // One note, on the apps card: the load they send. On the short edge it would collide with the
  // service's "Down" tag, and on the service card with the arrowhead; the readouts give the recovery time.
  const notes: StepNote[] = [
    {
      target: 'apps',
      text: `peak ${fmt(r.peakAfterFix)}/s after the fix`,
      tone: r.peakAfterFix > c.capacity ? 'alert' : 'plain',
    },
  ];
  const parts = [
    `${fmt(c.clients)} apps call the profile service, which can answer ${fmt(c.capacity)} requests per second.`,
    `It stalls for ${fmt(c.outageSec)} seconds, and the apps ${
      c.policy === 'immediate' ? 'retry at once' : c.policy === 'backoff' ? 'retry with exponential backoff' : 'retry with exponential backoff and jitter'
    }.`,
    `After the fix, the load peaks at ${fmt(r.peakAfterFix)} requests per second.`,
    stuck
      ? 'The service never recovers during the run.'
      : `Every app has an answer again ${fmt(r.recoveredAfterSec ?? 0)} seconds after the fix.`,
  ];
  return {
    grid: { cols: 2, rows: 1 },
    // On phones the cards stack; an empty middle row leaves room for the edge label and its note.
    narrow: { grid: { cols: 1, rows: 3 }, positions: { apps: { x: 0, y: 0 }, service: { x: 0, y: 2 } } },
    nodes: [
      { id: 'apps', type: 'client', label: `${fmt(c.clients)} apps`, sublabel: POLICY_SUMMARY[c.policy], x: 0, y: 0 },
      { id: 'service', type: 'service', label: 'Profile service', sublabel: `${fmt(c.capacity)} requests/s`, x: 1, y: 0 },
    ],
    edges: [{ id: 'apps-service', from: 'apps', to: 'service', kind: 'sync', label: 'requests' }],
    steps: [{ caption: parts.join(' '), notes, fail: stuck ? ['service'] : undefined }],
    description: parts.join(' '),
  };
}
