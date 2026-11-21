/**
 * Load balancer simulator: one minute of Snapgram traffic spread across app servers.
 *
 * Time moves in 10 ms ticks. Requests arrive as a seeded random (Poisson) stream. Each one
 * has a client, which IP hash uses, and a duration. Every server works on up to `slots`
 * requests at once and queues the rest, up to twice that many; beyond that it turns new
 * requests away.
 *
 * One server can stop answering at 20 s and come back at 40 s. The balancer only finds out
 * through health checks: a probe every few seconds, two failures in a row to take a server
 * out of rotation, two passes in a row to put it back. Until it is taken out, requests sent
 * to the dead server hang until a timeout and then fail.
 */
import { createRng, hashString } from '@/lib/random';

export type Algorithm = 'round-robin' | 'weighted' | 'least-connections' | 'ip-hash';

export const ALGORITHMS: Algorithm[] = ['round-robin', 'weighted', 'least-connections', 'ip-hash'];

export const ALGORITHM_LABEL: Record<Algorithm, string> = {
  'round-robin': 'Round robin',
  weighted: 'Weighted round robin',
  'least-connections': 'Least connections',
  'ip-hash': 'IP hash',
};

export type LbConfig = {
  algorithm: Algorithm;
  /** Number of app servers, 2 to 6. */
  servers: number;
  /** Requests per second a full-size server finishes on average. Slots = capacity × 0.1 s. */
  capacity: number;
  /** Requests per second arriving at the balancer. */
  traffic: number;
  /** The last server is an older machine: every request takes twice as long there. */
  olderServer: boolean;
  /** One request in 20 is a slow upload (about 1 s); the rest take about 50 ms. The average stays 100 ms. */
  slowRequests: boolean;
  /** One client, behind one IP address, sends `busyShare` of all requests. */
  busyClient: boolean;
  /** 1-based server that stops answering at `killAtSec`; 0 for none. */
  killServer: number;
  /** The stopped server starts again at `reviveAtSec`. */
  revive: boolean;
  /** Seconds between health checks. */
  checkIntervalSec: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
  durationSec: number;
  killAtSec: number;
  reviveAtSec: number;
  /** How long a request sent to a dead server waits before it fails. */
  timeoutMs: number;
  /** Queue limit as a multiple of a server's slots. */
  queueFactor: number;
  tickMs: number;
  bucketMs: number;
  /** Ordinary clients, each with its own IP address. */
  clients: number;
  busyShare: number;
  seed: number;
};

/** Average time a request takes on a full-size server. Capacity follows from it. */
export const MEAN_SERVICE_MS = 100;
/** Share of requests that are slow uploads when slow requests are mixed in. */
export const SLOW_SHARE = 0.05;

export const DEFAULT_CONFIG: LbConfig = {
  algorithm: 'round-robin',
  servers: 4,
  capacity: 100,
  traffic: 280,
  olderServer: false,
  slowRequests: false,
  busyClient: false,
  killServer: 0,
  revive: true,
  checkIntervalSec: 5,
  unhealthyThreshold: 2,
  healthyThreshold: 2,
  durationSec: 60,
  killAtSec: 20,
  reviveAtSec: 40,
  timeoutMs: 1000,
  queueFactor: 2,
  tickMs: 10,
  bucketMs: 500,
  clients: 2000,
  busyShare: 0.3,
  seed: 20261117,
};

/** Requests a server works on at the same time. */
export function slotsFor(capacity: number): number {
  return Math.max(1, Math.round((capacity * MEAN_SERVICE_MS) / 1000));
}

export function serverName(index: number): string {
  return `App ${index + 1}`;
}

/**
 * Challenge 1: round robin overloads a server even though the fleet as a whole has room,
 * because of an older server or a pile-up of slow requests.
 */
export function roundRobinOverloads(r: LbResult): boolean {
  const c = r.config;
  return (
    c.algorithm === 'round-robin' &&
    (c.olderServer || c.slowRequests) &&
    c.traffic < r.totalCapacity &&
    r.servers.some((s) => s.turnedAway > 0)
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type ServerStats = {
  index: number;
  name: string;
  older: boolean;
  slots: number;
  queueLimit: number;
  /** Requests per second it finishes on average. */
  capacityRps: number;
  /** Requests the balancer sent it. */
  routed: number;
  /** Requests it finished within the minute. */
  completed: number;
  /** Requests lost when it died, plus requests sent to it while it was dead. */
  failed: number;
  /** Requests it refused because its queue was full. */
  turnedAway: number;
  /** Share of all requests the balancer sent it. */
  share: number;
  /** Most requests it held at once (working plus waiting). */
  peakOpen: number;
  /** Longest queue it had. */
  maxQueue: number;
};

export type Bucket = {
  /** Bucket start, in seconds. */
  t: number;
  /** Average requests each server held during the bucket (working plus waiting). A dead server holds none. */
  open: number[];
  /** Requests the balancer sent each server during the bucket. */
  routed: number[];
  /** Requests that failed because their server was dead. */
  failed: number;
  /** Requests turned away because a queue was full. */
  turnedAway: number;
};

export type LbEventKind = 'down' | 'check-failed' | 'removed' | 'up' | 'check-passed' | 'readded';

export type LbEvent = { t: number; server: number; kind: LbEventKind };

/** In milliseconds. */
export type Percentiles = { mean: number; p50: number; p95: number; p99: number };

export type LbResult = {
  config: LbConfig;
  servers: ServerStats[];
  buckets: Bucket[];
  totals: {
    requests: number;
    completed: number;
    /** Lost on the dead server plus sent to it before it was taken out. */
    failed: number;
    lostInFlight: number;
    sentToDead: number;
    turnedAway: number;
    /** Still working, waiting or hanging when the minute ended. */
    unfinished: number;
  };
  /** Time requests spent waiting in a server's queue before work started. */
  wait: Percentiles & { waitedShare: number };
  /** Total response time (waiting plus working). */
  response: Percentiles;
  events: LbEvent[];
  /** Index of the server that was stopped, or -1. */
  killed: number;
  /** When things happened to the stopped server, in seconds (null if they did not happen). */
  timeline: { down: number | null; removed: number | null; up: number | null; readded: number | null };
  /** Share of requests sent to the dead server between its failure and its removal. */
  deadShare: number;
  /** IP hash only: share of ordinary clients whose server changed when the dead server was removed. */
  clientsMoved: number | null;
  /** IP hash only: share of ordinary clients that were on the removed server. */
  clientsOnRemoved: number | null;
  /** IP hash with the busy client: the server its requests went to, or -1. */
  busyServer: number;
  /** Requests per second all the servers can finish together. */
  totalCapacity: number;
};

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

const BUSY = -1;

type Req = { arrive: number; client: number; base: number };

/**
 * The request stream. It depends only on traffic, the request mix, the busy client and the seed,
 * so every algorithm and server setup sees exactly the same requests.
 */
function makeRequests(c: LbConfig): Req[] {
  const rngTime = createRng(c.seed);
  const rngClient = createRng(c.seed ^ 0x51ed27);
  const rngCost = createRng(c.seed ^ 0x2545f491);
  const out: Req[] = [];
  const endMs = c.durationSec * 1000;
  let ms = 0;
  for (;;) {
    ms += (-Math.log(1 - rngTime.next()) / Math.max(1, c.traffic)) * 1000;
    if (ms >= endMs) break;
    const u = rngClient.next();
    const k = rngClient.int(c.clients);
    const cls = rngCost.next();
    const v = rngCost.next();
    let cost: number;
    if (c.slowRequests) cost = cls < SLOW_SHARE ? 700 + v * 680 : 20 + v * 60;
    else cost = 80 + v * 40;
    out.push({
      arrive: Math.floor(ms / c.tickMs),
      client: c.busyClient && u < c.busyShare ? BUSY : k,
      base: Math.max(1, Math.round(cost / c.tickMs)),
    });
  }
  return out;
}

/** Final mixing step from MurmurHash3, so similar IP addresses still spread evenly. */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The client's IP address, as the balancer sees it. */
export function clientIp(client: number): string {
  if (client === BUSY) return '198.51.100.7';
  return `10.${(client >> 16) & 255}.${(client >> 8) & 255}.${client & 255}`;
}

function clientHash(client: number): number {
  return mix32(hashString(clientIp(client)));
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

type Waiting = { arrive: number; dur: number };

type ServerState = {
  alive: boolean;
  inRotation: boolean;
  /** Finish ticks of the requests being worked on, earliest first. */
  running: number[];
  queue: Waiting[];
  /** Timeout ticks of requests sent while the server was dead, earliest first. */
  hanging: number[];
  fails: number;
  passes: number;
  weight: number;
  current: number;
  stats: ServerStats;
};

function insertSorted(list: number[], v: number) {
  let i = list.length;
  list.push(v);
  while (i > 0 && list[i - 1]! > v) {
    list[i] = list[i - 1]!;
    i--;
  }
  list[i] = v;
}

class Histogram {
  private bins: number[] = [];
  count = 0;
  sum = 0;
  add(v: number) {
    this.bins[v] = (this.bins[v] ?? 0) + 1;
    this.count++;
    this.sum += v;
  }
  percentiles(scale: number): Percentiles {
    if (this.count === 0) return { mean: 0, p50: 0, p95: 0, p99: 0 };
    const at = (q: number) => {
      const target = Math.ceil(q * this.count);
      let seen = 0;
      for (let i = 0; i < this.bins.length; i++) {
        seen += this.bins[i] ?? 0;
        if (seen >= target) return i * scale;
      }
      return (this.bins.length - 1) * scale;
    };
    return { mean: (this.sum / this.count) * scale, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
  }
}

export function runLbSim(partial: Partial<LbConfig> = {}): LbResult {
  const c: LbConfig = { ...DEFAULT_CONFIG, ...partial };
  const n = Math.max(1, Math.round(c.servers));
  const slots = slotsFor(c.capacity);
  const queueLimit = Math.round(slots * c.queueFactor);
  const ticks = Math.round((c.durationSec * 1000) / c.tickMs);
  const bucketTicks = Math.max(1, Math.round(c.bucketMs / c.tickMs));
  const bucketCount = Math.ceil(ticks / bucketTicks);
  const timeoutTicks = Math.max(1, Math.round(c.timeoutMs / c.tickMs));
  const killed = c.killServer >= 1 && c.killServer <= n ? c.killServer - 1 : -1;
  const killTick = Math.round((c.killAtSec * 1000) / c.tickMs);
  const reviveTick = Math.round((c.reviveAtSec * 1000) / c.tickMs);
  const checkTicks = Math.max(1, Math.round((c.checkIntervalSec * 1000) / c.tickMs));
  const sec = (tick: number) => (tick * c.tickMs) / 1000;

  const servers: ServerState[] = Array.from({ length: n }, (_, i) => {
    const older = c.olderServer && i === n - 1;
    return {
      alive: true,
      inRotation: true,
      running: [],
      queue: [],
      hanging: [],
      fails: 0,
      passes: 0,
      weight: older ? 1 : 2,
      current: 0,
      stats: {
        index: i,
        name: serverName(i),
        older,
        slots,
        queueLimit,
        capacityRps: older ? c.capacity / 2 : c.capacity,
        routed: 0,
        completed: 0,
        failed: 0,
        turnedAway: 0,
        share: 0,
        peakOpen: 0,
        maxQueue: 0,
      },
    };
  });

  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, b) => ({
    t: sec(b * bucketTicks),
    open: new Array<number>(n).fill(0),
    routed: new Array<number>(n).fill(0),
    failed: 0,
    turnedAway: 0,
  }));
  const bucketAt = (tick: number) => buckets[Math.min(bucketCount - 1, Math.floor(tick / bucketTicks))]!;

  const waits = new Histogram();
  const responses = new Histogram();
  let waited = 0;
  let lostInFlight = 0;
  let sentToDead = 0;
  let turnedAway = 0;

  const startWork = (s: ServerState, now: number, arrive: number, dur: number) => {
    insertSorted(s.running, now + dur);
    waits.add(now - arrive);
    responses.add(now - arrive + dur);
    if (now > arrive) waited++;
  };

  const events: LbEvent[] = [];
  const timeline: LbResult['timeline'] = { down: null, removed: null, up: null, readded: null };

  let rotation = servers.map((_, i) => i);

  // IP hash bookkeeping: how many clients change servers when the rotation shrinks.
  let clientsMoved: number | null = null;
  let clientsOnRemoved: number | null = null;
  const hashes = c.algorithm === 'ip-hash' ? Array.from({ length: c.clients }, (_, k) => clientHash(k)) : [];
  const busyHash = clientHash(BUSY);

  let rr = 0;
  let windowRouted = 0;
  let windowToDead = 0;

  const choose = (client: number): number => {
    const r = rotation.length;
    switch (c.algorithm) {
      case 'round-robin':
        return rotation[rr++ % r]!;
      case 'weighted': {
        // Smooth weighted round robin: big servers get more turns, spread out rather than in bursts.
        let total = 0;
        let best = -1;
        for (const i of rotation) {
          const s = servers[i]!;
          s.current += s.weight;
          total += s.weight;
          if (best < 0 || s.current > servers[best]!.current) best = i;
        }
        servers[best]!.current -= total;
        return best;
      }
      case 'least-connections': {
        // Fewest open requests wins; ties go round the servers so none is favored.
        const start = rr++ % r;
        let best = -1;
        let bestOpen = Infinity;
        for (let k = 0; k < r; k++) {
          const i = rotation[(start + k) % r]!;
          const s = servers[i]!;
          const open = s.running.length + s.queue.length + s.hanging.length;
          if (open < bestOpen) {
            bestOpen = open;
            best = i;
          }
        }
        return best;
      }
      case 'ip-hash': {
        const h = client === BUSY ? busyHash : hashes[client]!;
        return rotation[h % r]!;
      }
    }
  };

  const reqs = makeRequests(c);
  let reqIndex = 0;
  let nextCheck = Math.round(checkTicks / 2);

  for (let t = 0; t < ticks; t++) {
    const bucket = bucketAt(t);

    // 1. The stopped server fails, or comes back.
    if (killed >= 0 && t === killTick) {
      const s = servers[killed]!;
      const lost = s.running.length + s.queue.length;
      lostInFlight += lost;
      s.stats.failed += lost;
      bucket.failed += lost;
      s.running = [];
      s.queue = [];
      s.alive = false;
      s.passes = 0;
      events.push({ t: sec(t), server: killed, kind: 'down' });
      timeline.down = sec(t);
    }
    if (killed >= 0 && c.revive && t === reviveTick && reviveTick > killTick) {
      servers[killed]!.alive = true;
      events.push({ t: sec(t), server: killed, kind: 'up' });
      timeline.up = sec(t);
    }

    // 2. Health checks.
    if (t === nextCheck) {
      nextCheck += checkTicks;
      let changed = false;
      for (let i = 0; i < n; i++) {
        const s = servers[i]!;
        if (s.alive) {
          s.fails = 0;
          s.passes++;
          if (!s.inRotation) {
            events.push({ t: sec(t), server: i, kind: 'check-passed' });
            if (s.passes >= c.healthyThreshold) {
              s.inRotation = true;
              s.current = 0;
              changed = true;
              events.push({ t: sec(t), server: i, kind: 'readded' });
              if (i === killed) timeline.readded = sec(t);
            }
          }
        } else {
          s.passes = 0;
          s.fails++;
          if (s.inRotation) {
            events.push({ t: sec(t), server: i, kind: 'check-failed' });
            if (s.fails >= c.unhealthyThreshold) {
              s.inRotation = false;
              changed = true;
              events.push({ t: sec(t), server: i, kind: 'removed' });
              if (i === killed) timeline.removed = sec(t);
            }
          }
        }
      }
      if (changed) {
        const before = rotation;
        rotation = servers.flatMap((s, i) => (s.inRotation ? [i] : []));
        if (c.algorithm === 'ip-hash' && rotation.length < before.length && clientsMoved === null && rotation.length > 0) {
          let moved = 0;
          let onRemoved = 0;
          for (const h of hashes) {
            const was = before[h % before.length]!;
            if (was !== rotation[h % rotation.length]) moved++;
            if (!servers[was]!.inRotation) onRemoved++;
          }
          clientsMoved = moved / hashes.length;
          clientsOnRemoved = onRemoved / hashes.length;
        }
      }
    }

    // 3. Work finishes; waiting requests take the free slots.
    for (const s of servers) {
      if (!s.alive) continue;
      while (s.running.length && s.running[0]! <= t) {
        s.running.shift();
        s.stats.completed++;
      }
      while (s.running.length < slots && s.queue.length) {
        const w = s.queue.shift()!;
        startWork(s, t, w.arrive, w.dur);
      }
    }

    // 4. Requests sent to the dead server give up.
    for (const s of servers) {
      while (s.hanging.length && s.hanging[0]! <= t) {
        s.hanging.shift();
        sentToDead++;
        s.stats.failed++;
        bucket.failed++;
      }
    }

    // 5. New requests arrive.
    while (reqIndex < reqs.length && reqs[reqIndex]!.arrive === t) {
      const req = reqs[reqIndex++]!;
      if (rotation.length === 0) {
        turnedAway++;
        bucket.turnedAway++;
        continue;
      }
      const i = choose(req.client);
      const s = servers[i]!;
      s.stats.routed++;
      bucket.routed[i]!++;
      if (timeline.down !== null && timeline.removed === null) {
        windowRouted++;
        if (i === killed) windowToDead++;
      }
      if (!s.alive) {
        s.hanging.push(t + timeoutTicks);
        continue;
      }
      const dur = s.stats.older ? req.base * 2 : req.base;
      if (s.running.length < slots) startWork(s, t, t, dur);
      else if (s.queue.length < queueLimit) s.queue.push({ arrive: t, dur });
      else {
        s.stats.turnedAway++;
        turnedAway++;
        bucket.turnedAway++;
      }
    }

    // 6. Measure.
    for (let i = 0; i < n; i++) {
      const s = servers[i]!;
      const open = s.alive ? s.running.length + s.queue.length : 0;
      bucket.open[i]! += open;
      if (open > s.stats.peakOpen) s.stats.peakOpen = open;
      if (s.queue.length > s.stats.maxQueue) s.stats.maxQueue = s.queue.length;
    }
  }

  for (let b = 0; b < bucketCount; b++) {
    const len = Math.min(bucketTicks, ticks - b * bucketTicks);
    const bucket = buckets[b]!;
    bucket.open = bucket.open.map((v) => v / len);
  }

  const total = reqs.length;
  for (const s of servers) s.stats.share = total ? s.stats.routed / total : 0;
  const unfinished = servers.reduce((sum, s) => sum + s.running.length + s.queue.length + s.hanging.length, 0);

  return {
    config: c,
    servers: servers.map((s) => s.stats),
    buckets,
    totals: {
      requests: total,
      completed: servers.reduce((sum, s) => sum + s.stats.completed, 0),
      failed: lostInFlight + sentToDead,
      lostInFlight,
      sentToDead,
      turnedAway,
      unfinished,
    },
    wait: { ...waits.percentiles(c.tickMs), waitedShare: waits.count ? waited / waits.count : 0 },
    response: responses.percentiles(c.tickMs),
    events,
    killed,
    timeline,
    deadShare: windowRouted ? windowToDead / windowRouted : 0,
    clientsMoved,
    clientsOnRemoved,
    busyServer: c.busyClient && c.algorithm === 'ip-hash' ? busyHash % n : -1,
    totalCapacity: servers.reduce((sum, s) => sum + s.stats.capacityRps, 0),
  };
}
