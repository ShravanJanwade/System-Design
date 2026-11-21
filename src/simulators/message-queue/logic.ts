/**
 * Message-queue simulator: Snapgram's thumbnail queue.
 *
 * Time moves in ticks of 100 ms. In each tick:
 *
 * 1. Producers create uploads, each one a "make thumbnails" job. The count is Poisson-distributed
 *    around the current rate, which triples during the spike. With broken photos on, one upload
 *    every 15 seconds is a poison message: a corrupted file that fails every time.
 * 2. Jobs enter the queue. With a length limit, a full queue pushes back on producers: new uploads
 *    are rejected, or producers hold them and retry every tick, which slows them to the workers' pace.
 * 3. Each consumer (a worker) spends 1000 / speed ms on the job at the front of the queue. A poison
 *    job fails instead of finishing, and goes straight back to the front of the queue, the way a
 *    negative acknowledgment with requeue works in many brokers. The next free worker, usually the
 *    same one, picks it up again. Without a dead-letter queue it fails forever, so it keeps one worker
 *    busy for good. With one, the job moves there after `maxAttempts` failures.
 *
 * In a strictly ordered log (a single Kafka partition, say) a failing message would instead block
 * everything behind it. This simulator models the more common queue behavior.
 */
import type { DiagramSpec, StepNote } from '@/content/types';
import { createRng, type Rng } from '@/lib/random';

export type WhenFull = 'reject' | 'wait';

export type QueueSimConfig = {
  /** Uploads per second, outside the spike. */
  rate: number;
  /** Multiply the rate by `spikeFactor` for `spikeSec` seconds from `spikeStartSec`. */
  spike: boolean;
  /** Number of workers. */
  consumers: number;
  /** Jobs per second one worker finishes. */
  speed: number;
  /** One broken photo every `poisonEverySec` seconds from `poisonStartSec`. */
  poison: boolean;
  /** Move a job to the dead-letter queue after `maxAttempts` failed attempts. */
  dlq: boolean;
  maxAttempts: number;
  /** Most jobs the queue holds. 0 means no limit. */
  maxDepth: number;
  /** What producers do when the queue is full. */
  whenFull: WhenFull;
  durationSec: number;
  tickMs: number;
  spikeStartSec: number;
  spikeSec: number;
  spikeFactor: number;
  poisonStartSec: number;
  poisonEverySec: number;
  seed: number;
};

export const DEFAULT_CONFIG: QueueSimConfig = {
  rate: 20,
  spike: false,
  consumers: 3,
  speed: 5,
  poison: false,
  dlq: true,
  maxAttempts: 3,
  maxDepth: 0,
  whenFull: 'reject',
  durationSec: 120,
  tickMs: 100,
  spikeStartSec: 15,
  spikeSec: 15,
  spikeFactor: 3,
  poisonStartSec: 10,
  poisonEverySec: 15,
  seed: 20261117,
};

/** One reading per second, taken at the end of that second. */
export type Sample = {
  /** Seconds since the start, at the end of this second. */
  t: number;
  /** Jobs waiting in the queue. */
  depth: number;
  /** Consumer lag: how long the oldest waiting job has waited, in seconds. 0 when nothing waits. */
  lagSec: number;
  /** Uploads producers are holding back because the queue is full ("wait" mode). */
  held: number;
  /** Jobs created during this second. */
  created: number;
  /** Jobs finished during this second. */
  processed: number;
  /** Uploads rejected during this second because the queue was full ("reject" mode). */
  rejected: number;
  /** Workers looping on a broken photo (only without a dead-letter queue). */
  stuck: number;
};

export type DeadLetter = { id: number; t: number; attempts: number };

export type QueueSimResult = {
  samples: Sample[];
  totals: {
    /** Every job producers created, broken photos included. */
    created: number;
    processed: number;
    rejected: number;
    deadLettered: number;
    failedAttempts: number;
    poisonSent: number;
  };
  end: { depth: number; lagSec: number; held: number; inFlight: number; stuck: number };
  peak: { depth: number; lagSec: number; held: number; stuck: number };
  /** Jobs per second all workers together can finish. */
  capacityPerSec: number;
  baseRatePerSec: number;
  spikeRatePerSec: number;
  /** With the spike on: the first second after it ends at which nothing is waiting. Null if that never happens. */
  drainedAtSec: number | null;
  /** First second at which the queue hit its limit. Null without a limit, or if it never filled. */
  firstFullAtSec: number | null;
  /** First second at which every worker was stuck on a broken photo. */
  allStuckAtSec: number | null;
  deadLetters: DeadLetter[];
};

type Job = { id: number; createdAt: number; poison: boolean; attempts: number };
type Worker = { job: Job | null; remaining: number };

/** Poisson-distributed count with the given mean (Knuth's method; normal approximation for large means). */
export function poisson(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 40) {
    const u = Math.max(rng.next(), 1e-12);
    const v = rng.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z));
  }
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > limit);
  return k - 1;
}

/** Uploads per second at time `ms`. */
export function rateAt(c: QueueSimConfig, ms: number): number {
  const inSpike = c.spike && ms >= c.spikeStartSec * 1000 && ms < (c.spikeStartSec + c.spikeSec) * 1000;
  return inSpike ? c.rate * c.spikeFactor : c.rate;
}

/** Times (ms) at which broken photos are uploaded. */
export function poisonTimes(c: QueueSimConfig): number[] {
  if (!c.poison || c.poisonEverySec <= 0) return [];
  const out: number[] = [];
  for (let s = c.poisonStartSec; s < c.durationSec; s += c.poisonEverySec) out.push(s * 1000);
  return out;
}

export function runQueueSim(partial: Partial<QueueSimConfig> = {}): QueueSimResult {
  const c: QueueSimConfig = { ...DEFAULT_CONFIG, ...partial };
  const rng = createRng(c.seed);
  const serviceMs = 1000 / Math.max(0.01, c.speed);
  const ticks = Math.round((c.durationSec * 1000) / c.tickMs);
  const ticksPerSecond = Math.round(1000 / c.tickMs);

  // The queue is an array with a moving head, so taking from the front is O(1)
  // and a failed job can go back to the front by stepping the head back.
  const queue: Job[] = [];
  let head = 0;
  const depth = () => queue.length - head;
  const held: Job[] = [];
  let heldHead = 0;
  const heldCount = () => held.length - heldHead;

  const workers: Worker[] = Array.from({ length: Math.max(0, Math.round(c.consumers)) }, () => ({ job: null, remaining: 0 }));
  const poisonAt = poisonTimes(c);
  let nextPoison = 0;
  let nextId = 1;

  const totals = { created: 0, processed: 0, rejected: 0, deadLettered: 0, failedAttempts: 0, poisonSent: 0 };
  const deadLetters: DeadLetter[] = [];
  const samples: Sample[] = [];
  let second = { created: 0, processed: 0, rejected: 0 };
  let firstFullAtSec: number | null = null;
  let allStuckAtSec: number | null = null;

  const full = () => c.maxDepth > 0 && depth() >= c.maxDepth;
  const stuckCount = () => (c.dlq ? 0 : workers.filter((w) => w.job?.poison).length);

  for (let tick = 0; tick < ticks; tick++) {
    const now = tick * c.tickMs;

    // 1. Producers create this tick's uploads.
    const fresh: Job[] = [];
    const n = poisson(rng, (rateAt(c, now) * c.tickMs) / 1000);
    for (let i = 0; i < n; i++) fresh.push({ id: nextId++, createdAt: now, poison: false, attempts: 0 });
    while (nextPoison < poisonAt.length && poisonAt[nextPoison]! < now + c.tickMs) {
      fresh.push({ id: nextId++, createdAt: now, poison: true, attempts: 0 });
      totals.poisonSent++;
      nextPoison++;
    }
    totals.created += fresh.length;
    second.created += fresh.length;

    // 2. Into the queue. Uploads held back earlier go first, so producers keep their order.
    while (heldCount() > 0 && !full()) queue.push(held[heldHead++]!);
    for (const job of fresh) {
      if (heldCount() === 0 && !full()) {
        queue.push(job);
      } else if (c.whenFull === 'wait') {
        held.push(job);
      } else {
        totals.rejected++;
        second.rejected++;
      }
    }
    if (firstFullAtSec === null && full()) firstFullAtSec = now / 1000;

    // 3. Workers spend the tick on jobs. A worker that frees up takes the next job at once,
    //    so a failed job that went back to the front is picked up again immediately.
    for (const w of workers) {
      let budget = c.tickMs;
      for (;;) {
        if (!w.job) {
          if (depth() === 0) break;
          const job = queue[head++]!;
          job.attempts++;
          w.job = job;
          w.remaining = serviceMs;
        }
        if (budget <= 0) break;
        const used = Math.min(budget, w.remaining);
        w.remaining -= used;
        budget -= used;
        if (w.remaining > 1e-9) break;
        const job = w.job;
        w.job = null;
        if (!job.poison) {
          totals.processed++;
          second.processed++;
        } else {
          totals.failedAttempts++;
          if (c.dlq && job.attempts >= c.maxAttempts) {
            totals.deadLettered++;
            deadLetters.push({ id: job.id, t: (now + c.tickMs - budget) / 1000, attempts: job.attempts });
          } else {
            // Back to the front of the queue.
            queue[--head] = job;
          }
        }
      }
    }

    if (allStuckAtSec === null && workers.length > 0 && stuckCount() === workers.length) allStuckAtSec = now / 1000;

    // 4. One sample at the end of each second.
    if ((tick + 1) % ticksPerSecond === 0) {
      const end = now + c.tickMs;
      const oldest = depth() > 0 ? queue[head]!.createdAt : heldCount() > 0 ? held[heldHead]!.createdAt : null;
      samples.push({
        t: end / 1000,
        depth: depth(),
        lagSec: oldest === null ? 0 : (end - oldest) / 1000,
        held: heldCount(),
        created: second.created,
        processed: second.processed,
        rejected: second.rejected,
        stuck: stuckCount(),
      });
      second = { created: 0, processed: 0, rejected: 0 };
    }

    // Keep the arrays from growing without bound on long runs.
    if (head > 4096 && head > queue.length / 2) {
      queue.splice(0, head);
      head = 0;
    }
    if (heldHead > 4096 && heldHead > held.length / 2) {
      held.splice(0, heldHead);
      heldHead = 0;
    }
  }

  const last = samples[samples.length - 1];
  const spikeEnd = c.spikeStartSec + c.spikeSec;
  const drained = c.spike ? samples.find((s) => s.t >= spikeEnd && s.depth === 0 && s.held === 0) : undefined;

  return {
    samples,
    totals,
    end: {
      depth: depth(),
      lagSec: last?.lagSec ?? 0,
      held: heldCount(),
      inFlight: workers.filter((w) => w.job).length,
      stuck: stuckCount(),
    },
    peak: {
      depth: samples.reduce((m, s) => Math.max(m, s.depth), 0),
      lagSec: samples.reduce((m, s) => Math.max(m, s.lagSec), 0),
      held: samples.reduce((m, s) => Math.max(m, s.held), 0),
      stuck: samples.reduce((m, s) => Math.max(m, s.stuck), 0),
    },
    capacityPerSec: workers.length * c.speed,
    baseRatePerSec: c.rate,
    spikeRatePerSec: c.rate * c.spikeFactor,
    drainedAtSec: drained ? drained.t : null,
    firstFullAtSec,
    allStuckAtSec,
    deadLetters,
  };
}

/* ------------------------------------------------------------------ */
/* The diagram the simulator draws                                     */
/* ------------------------------------------------------------------ */

const int = new Intl.NumberFormat('en-US');
const fmt = (n: number) => int.format(Math.round(n));

/** Producers, the queue, the workers and (when on) the dead-letter queue. Async edges are dashed. */
export function queueDiagram(c: QueueSimConfig, r: QueueSimResult): DiagramSpec {
  const notes: StepNote[] = [];
  if (r.totals.rejected > 0) notes.push({ target: 'upload', text: `${fmt(r.totals.rejected)} rejected`, tone: 'alert' });
  else if (r.peak.held > 0) notes.push({ target: 'upload', text: `${fmt(r.peak.held)} held back`, tone: 'alert' });
  if (r.end.stuck > 0) notes.push({ target: 'workers', text: `${r.end.stuck} of ${c.consumers} stuck`, tone: 'alert' });
  if (c.maxDepth > 0 && r.firstFullAtSec !== null) notes.push({ target: 'queue', text: 'hit its limit', tone: 'alert' });

  const allStuck = c.consumers > 0 && r.end.stuck === c.consumers;
  const rate = c.spike ? `${fmt(c.rate)}/s, ${fmt(c.rate * c.spikeFactor)}/s in spike` : `${fmt(c.rate)} uploads/s`;

  const nodes: DiagramSpec['nodes'] = [
    { id: 'upload', type: 'service', label: 'Upload service', sublabel: rate, x: 0, y: 0 },
    {
      id: 'queue',
      type: 'queue',
      label: 'Thumbnail queue',
      sublabel: c.maxDepth > 0 ? `${fmt(r.end.depth)} waiting, limit ${fmt(c.maxDepth)}` : `${fmt(r.end.depth)} waiting`,
      x: 1,
      y: 0,
    },
    {
      id: 'workers',
      type: 'worker',
      label: 'Thumbnail workers',
      sublabel: `${c.consumers} × ${fmt(c.speed)} jobs/s`,
      x: 2,
      y: 0,
    },
  ];
  const edges: DiagramSpec['edges'] = [
    { id: 'upload-queue', from: 'upload', to: 'queue', kind: 'async', label: 'enqueue' },
    { id: 'queue-workers', from: 'queue', to: 'workers', kind: 'async', label: 'deliver' },
  ];
  if (c.dlq) {
    nodes.push({
      id: 'dlq',
      type: 'queue',
      label: 'Dead-letter queue',
      sublabel: r.totals.deadLettered === 1 ? '1 message' : `${fmt(r.totals.deadLettered)} messages`,
      x: 1,
      y: 1,
    });
    edges.push({ id: 'queue-dlq', from: 'queue', to: 'dlq', kind: 'async', label: `after ${c.maxAttempts} failures` });
  }

  const parts = [
    c.spike
      ? `The upload service adds ${fmt(c.rate)} jobs per second to the thumbnail queue, and ${fmt(c.rate * c.spikeFactor)} per second during the spike.`
      : `The upload service adds ${fmt(c.rate)} jobs per second to the thumbnail queue.`,
    `${c.consumers} ${c.consumers === 1 ? 'worker takes' : 'workers take'} jobs from the queue, each finishing ${fmt(c.speed)} per second.`,
    `At the end of the run, ${fmt(r.end.depth)} jobs are waiting.`,
  ];
  if (c.dlq) parts.push(`Jobs that fail ${c.maxAttempts} times move to a dead-letter queue, which holds ${fmt(r.totals.deadLettered)}.`);
  if (r.end.stuck > 0) parts.push(`${r.end.stuck} of ${c.consumers} workers are stuck retrying broken photos.`);
  if (r.totals.rejected > 0) parts.push(`${fmt(r.totals.rejected)} uploads were rejected because the queue was full.`);

  return {
    grid: { cols: 3, rows: c.dlq ? 2 : 1 },
    nodes,
    edges,
    steps: [{ caption: parts.join(' '), notes, fail: allStuck ? ['workers'] : undefined }],
    description: parts.join(' '),
  };
}
