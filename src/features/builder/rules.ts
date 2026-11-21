/**
 * The architecture builder's checker: rule-based feedback, no AI. Three kinds of rules:
 * - structural rules that hold for any design (a client wired straight to a database, one database with no replica),
 * - load rules from the problem's estimation calculator ("One database is handling 50,000 writes per second"),
 * - expectations from the problem's concepts (lesson ids): a caching problem expects a cache.
 * Feedback is phrased as an interviewer's question, so the learner still does the thinking.
 */
import type { NodeType, SimulatorPreset } from '@/content/types';
import { estimate, formatBytes, formatRate, formatRough, inputsFromPreset } from '@/simulators/estimation/logic';
import { displayLabel, type BuilderDesign, type BuilderEdge, type BuilderNode } from './model';

export type Finding = {
  /** Rule id, stable for tests. */
  id: string;
  /** Findings about the same thing share a topic; only the first one per topic is kept. */
  topic: string;
  tone: 'issue' | 'good';
  text: string;
  lessonId?: string;
  /** Components the finding is about. */
  nodeIds?: string[];
};

/** Peak load from the problem's estimation calculator inputs. */
export type LoadProfile = {
  peakRps: number;
  peakReads: number;
  peakWrites: number;
  storageTotal: number;
  retentionYears: number;
  /** Only when the calculator states an object size. */
  objectBytes?: number;
  /** Peak download bandwidth in bytes per second, only when the calculator states an object size. */
  outPeak?: number;
};

export type CheckContext = { concepts?: readonly string[]; load?: LoadProfile };

/** Ballparks the checker compares against. Rough, like the lessons' numbers: real capacity depends on hardware and queries. */
export const BALLPARK = {
  /** Requests per second one app server handles (lesson 2.6's placeholder). */
  serverRps: 500,
  /** Writes per second one database primary takes before you split it. */
  dbWrites: 10_000,
  /** Reads per second you would not send to one database without a cache. */
  dbReads: 10_000,
  /** Objects this size or larger are media files, not rows. */
  mediaBytes: 100_000,
  /** Peak download bandwidth worth serving from a CDN. */
  cdnOutBytes: 1e9,
  /** Data that no longer fits comfortably on one database server. */
  dbStorageBytes: 10e12,
};

/** Turn the problem's calculator preset into peak numbers, using the same math as the estimation calculator. */
export function loadProfile(calculator?: SimulatorPreset): LoadProfile | undefined {
  if (!calculator || typeof calculator.dau !== 'number') return undefined;
  const e = estimate(inputsFromPreset(calculator));
  const sized = typeof calculator.objectBytes === 'number' && calculator.objectBytes > 0;
  return {
    peakRps: e.rough.peakRps,
    peakReads: e.rough.peakReads,
    peakWrites: e.rough.peakWrites,
    storageTotal: e.rough.storageTotal,
    retentionYears: e.inputs.retentionYears,
    objectBytes: sized ? e.inputs.objectBytes : undefined,
    outPeak: sized ? e.rough.outPeak : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Graph helpers                                                       */
/* ------------------------------------------------------------------ */

const DATABASES = new Set<NodeType>(['sqlDb', 'nosqlDb']);
const STORES = new Set<NodeType>(['sqlDb', 'nosqlDb', 'cache', 'search', 'objectStore', 'blockStore', 'fileStore', 'queue', 'stream']);
/** What a client should never reach directly. Object storage is fine: uploads often go straight to it with a signed URL. */
const CLIENT_FORBIDDEN = new Set<NodeType>(['sqlDb', 'nosqlDb', 'cache', 'search', 'blockStore', 'fileStore', 'queue', 'stream']);
const FRONT_DOORS = new Set<NodeType>(['loadBalancer', 'gateway']);
const MESSAGING = new Set<NodeType>(['queue', 'stream']);

const REPLICA_NAME = /replica|follower|secondary|standby|read[- ]?only/i;
const SHARD_NAME = /shard|partition/i;
const MEDIA_NAME = /video|photo|image|media|upload|thumbnail|picture|movie/i;
const NOTIFY_NAME = /email|e-mail|sms|text message|push|notif|webhook|mail/i;
/** A box that stands for a group of machines, such as "App servers" or "Worker pool". */
const FLEET_NAME = /servers|instances|fleet|pool|cluster|nodes|\bx\s*\d+|\d+\s*x\b|×\s*\d+/i;

type Graph = {
  design: BuilderDesign;
  byId: Map<string, BuilderNode>;
  out: Map<string, BuilderEdge[]>;
  inc: Map<string, BuilderEdge[]>;
};

function graph(design: BuilderDesign): Graph {
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const out = new Map<string, BuilderEdge[]>();
  const inc = new Map<string, BuilderEdge[]>();
  for (const e of design.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    inc.set(e.to, [...(inc.get(e.to) ?? []), e]);
  }
  return { design, byId, out, inc };
}

function ofType(g: Graph, ...types: NodeType[]): BuilderNode[] {
  return g.design.nodes.filter((n) => types.includes(n.type));
}

function has(g: Graph, ...types: NodeType[]): boolean {
  return g.design.nodes.some((n) => types.includes(n.type));
}

function named(g: Graph, re: RegExp, types?: NodeType[]): boolean {
  return g.design.nodes.some((n) => (!types || types.includes(n.type)) && re.test(displayLabel(n)));
}

function degree(g: Graph, id: string): number {
  return (g.out.get(id)?.length ?? 0) + (g.inc.get(id)?.length ?? 0);
}

function databases(g: Graph): BuilderNode[] {
  return g.design.nodes.filter((n) => DATABASES.has(n.type));
}

/** A database copy: named like a replica, or on the receiving end of a replication connection from another database. */
function isReplicaNode(g: Graph, n: BuilderNode): boolean {
  if (REPLICA_NAME.test(displayLabel(n))) return true;
  return (g.inc.get(n.id) ?? []).some((e) => e.kind === 'replication' && DATABASES.has(g.byId.get(e.from)!.type));
}

/** Some database in the design has a copy. */
function replicated(g: Graph): boolean {
  const dbs = databases(g);
  if (g.design.edges.some((e) => e.kind === 'replication' && dbs.some((d) => d.id === e.from || d.id === e.to))) return true;
  return dbs.some((d) => REPLICA_NAME.test(displayLabel(d))) && dbs.length >= 2;
}

function primaries(g: Graph): BuilderNode[] {
  return databases(g).filter((n) => !isReplicaNode(g, n));
}

/** The same data split over two or more primaries of one kind, or a database named as shards. */
function sharded(g: Graph): boolean {
  const counts = new Map<NodeType, number>();
  for (const p of primaries(g)) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.values()].some((c) => c >= 2) || named(g, SHARD_NAME, ['sqlDb', 'nosqlDb']);
}

/** A box that stands for several machines: named as a group ("App servers", "Worker pool"), or a plural name. */
function isFleet(n: BuilderNode): boolean {
  const label = displayLabel(n);
  if (FLEET_NAME.test(label)) return true;
  const last = label.trim().split(/\s+/).pop() ?? '';
  return last.length > 3 && /s$/i.test(last) && !/(ss|us|is)$/i.test(last);
}

/** Something such as a load balancer or gateway sends traffic to this box, which implies several machines behind it. */
function fronted(g: Graph, n: BuilderNode): boolean {
  return (g.inc.get(n.id) ?? []).some((e) => FRONT_DOORS.has(g.byId.get(e.from)!.type));
}

/** "App server 2" and "App server" are the same tier; "Feed service" and "Post service" are not. */
function tierKey(n: BuilderNode): string {
  return `${n.type}:${displayLabel(n)
    .toLowerCase()
    .replace(/\s+(\d+|[a-z])$/, '')
    .trim()}`;
}

/** Client-facing app servers grouped into tiers; a tier has several servers when it has two boxes or a group box. */
function crowdedTiers(nodes: readonly BuilderNode[]): BuilderNode[][] {
  const tiers = new Map<string, BuilderNode[]>();
  for (const n of nodes) tiers.set(tierKey(n), [...(tiers.get(tierKey(n)) ?? []), n]);
  return [...tiers.values()].filter((t) => t.length >= 2 || t.some(isFleet));
}

/* ------------------------------------------------------------------ */
/* Expectations from the problem's concepts                            */
/* ------------------------------------------------------------------ */

type Expectation = { topic: string; test: (g: Graph) => boolean; missing: string; good: string };

const E = {
  cache: {
    topic: 'cache',
    test: (g) => has(g, 'cache'),
    missing: 'Most requests here are repeated reads. What keeps them off the database? Add a cache.',
    good: 'Repeated reads can come from the cache instead of the database.',
  },
  cdn: {
    topic: 'cdn',
    test: (g) => has(g, 'cdn'),
    missing: 'Who serves popular content close to users? Nothing in your design caches at the edge yet.',
    good: 'A CDN serves content close to users.',
  },
  object: {
    topic: 'object',
    test: (g) => has(g, 'objectStore'),
    missing: 'Where do the large files live? Add object storage, and keep only metadata in the database.',
    good: 'Large files live in object storage, not in the database.',
  },
  queue: {
    topic: 'queue',
    test: (g) => has(g, 'queue', 'stream') || g.design.edges.some((e) => e.kind === 'async'),
    missing: 'Which work can happen after you reply to the user? Nothing in your design is sent asynchronously yet.',
    good: 'Work that can wait is sent asynchronously, off the user’s request.',
  },
  stream: {
    topic: 'stream',
    test: (g) => has(g, 'stream') || (has(g, 'queue') && has(g, 'worker')),
    missing: 'How do events reach the code that processes them? Add an event stream and the workers that read it.',
    good: 'Events flow through a stream to the workers that process them.',
  },
  lb: {
    topic: 'lb',
    test: (g) => has(g, 'loadBalancer', 'gateway'),
    missing: 'What sits in front of your app servers to spread traffic and route around a server that dies?',
    good: 'A load balancer spreads traffic across your app servers.',
  },
  gateway: {
    topic: 'gateway',
    test: (g) => has(g, 'gateway', 'loadBalancer'),
    missing: 'Where do shared concerns such as sign-in checks and limits live? Put an API gateway or reverse proxy in front of your services.',
    good: 'A gateway in front of your services handles shared concerns in one place.',
  },
  limiter: {
    topic: 'limiter',
    test: (g) => has(g, 'gateway') || named(g, /limit/i),
    missing: 'Where is the limit enforced? Name the component that counts requests, such as an API gateway or a limiter service.',
    good: 'Your design shows where limits are enforced.',
  },
  counters: {
    topic: 'counters',
    test: (g) => has(g, 'cache'),
    missing: 'Where do the counters live, so every server sees the same count? A shared in-memory store is the usual answer.',
    good: 'Counters live in a shared store that every server can reach.',
  },
  replica: {
    topic: 'replica',
    test: (g) => replicated(g),
    missing: 'What happens to your data when the database machine dies? Add a replica.',
    good: 'Your data has a replica, so losing one machine does not lose it.',
  },
  shards: {
    topic: 'shards',
    test: (g) => sharded(g) || primaries(g).some((p) => p.type === 'nosqlDb'),
    missing: 'How is the data split once it outgrows one machine? Show the shards.',
    good: 'Your design splits the data across machines.',
  },
  spread: {
    topic: 'spread',
    test: (g) => ofType(g, 'cache').length >= 2 || primaries(g).length >= 2 || named(g, SHARD_NAME),
    missing: 'How are keys spread across machines? Draw more than one node, so you can show how a key finds its node.',
    good: 'Keys are spread across several nodes.',
  },
  quorum: {
    topic: 'quorum',
    test: (g) => ofType(g, 'sqlDb', 'nosqlDb').length >= 3,
    missing: 'How many copies does each key have? Draw at least three storage nodes, so you can talk through read and write quorums.',
    good: 'Several storage nodes hold copies of each key.',
  },
  search: {
    topic: 'search',
    test: (g) => has(g, 'search'),
    missing: 'How do you find things by their words quickly? Add a search index next to the database.',
    good: 'A search index answers text queries.',
  },
  realtime: {
    topic: 'realtime',
    test: (g) => named(g, /socket|connection|real.?time|presence|push|chat|live/i, ['service', 'gateway', 'worker']),
    missing: 'Which servers hold the long-lived connections that push updates to users? Name them, for example a WebSocket gateway.',
    good: 'Your design names the servers that hold live connections.',
  },
  fanout: {
    topic: 'fanout',
    test: (g) => has(g, 'queue', 'stream') && has(g, 'worker') && has(g, 'cache'),
    missing: 'Who builds each feed? Fan-out usually means a queue, workers, and a feed cache they write into.',
    good: 'Workers fan posts out through a queue into feed caches.',
  },
  geo: {
    topic: 'geo',
    test: (g) => has(g, 'search') || named(g, /geo|location|quad|spatial|nearby|places|\bmap\b/i),
    missing: 'Where is the location index that answers "what is near me?" Name it in your design.',
    good: 'A location index answers nearby searches.',
  },
  db: {
    topic: 'db',
    test: (g) => databases(g).length > 0,
    missing: 'Where does the data live? Add a database.',
    good: 'A database holds the core data.',
  },
  dns: {
    topic: 'dns',
    test: (g) => has(g, 'dns'),
    missing: 'How does a client find your servers? Add DNS in front.',
    good: 'DNS points clients at your servers.',
  },
} satisfies Record<string, Expectation>;

/** Which components a problem's concepts (lesson ids) lead you to expect. */
export const CONCEPT_EXPECTATIONS: Record<string, Expectation[]> = {
  caching: [E.cache],
  cdns: [E.cdn],
  'storage-types': [E.object],
  'queues-and-streams': [E.queue],
  'event-driven': [E.queue],
  'batch-vs-stream': [E.stream],
  'cqrs-event-sourcing': [E.stream],
  'load-balancers': [E.lb],
  'vertical-vs-horizontal-scaling': [E.lb],
  'reverse-proxies-gateways': [E.gateway],
  'rate-limiting': [E.limiter, E.counters],
  replication: [E.replica],
  'replication-lag': [E.replica],
  sharding: [E.shards],
  'consistent-hashing': [E.spread],
  quorums: [E.quorum],
  'search-inverted-indexes': [E.search],
  'real-time-communication': [E.realtime],
  'real-time-collaboration': [E.realtime],
  'feed-fanout': [E.fanout],
  'geospatial-indexing': [E.geo],
  'databases-101': [E.db],
  'sql-vs-nosql': [E.db],
  dns: [E.dns],
};

/* ------------------------------------------------------------------ */
/* The checker                                                         */
/* ------------------------------------------------------------------ */

function issue(id: string, topic: string, text: string, lessonId?: string, nodeIds?: string[]): Finding {
  return { id, topic, tone: 'issue', text, lessonId, nodeIds };
}

function good(id: string, topic: string, text: string): Finding {
  return { id, topic, tone: 'good', text };
}

/** Keep the first finding per topic: specific findings come first, so they win over general ones. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (seen.has(f.topic)) continue;
    seen.add(f.topic);
    out.push(f);
  }
  return [...out.filter((f) => f.tone === 'issue'), ...out.filter((f) => f.tone === 'good')];
}

function years(n: number): string {
  return `${n} year${n === 1 ? '' : 's'}`;
}

export function checkDesign(design: BuilderDesign, ctx: CheckContext = {}): Finding[] {
  if (!design.nodes.length) {
    return [issue('empty', 'empty', 'Your canvas is empty. Place a client and an app server first, then add where the data lives.')];
  }
  const g = graph(design);
  const out: Finding[] = [];
  const load = ctx.load;
  const services = ofType(g, 'service');
  const dbs = databases(g);
  const label = (id: string) => displayLabel(g.byId.get(id)!);

  // 1. Something has to send requests.
  if (!has(g, 'client')) {
    out.push(issue('no-client', 'client', 'Nothing sends requests yet. Add a client, so you can walk one request through the design.', 'life-of-a-request'));
  }

  // 2. A client wired straight to a data store.
  for (const e of design.edges) {
    const from = g.byId.get(e.from);
    const to = g.byId.get(e.to);
    if (!from || !to || from.type !== 'client' || !CLIENT_FORBIDDEN.has(to.type)) continue;
    out.push(
      issue(
        'client-to-store',
        `client-store:${to.id}`,
        `The client talks to ${displayLabel(to)} directly. Who checks who the user is and what they may do? Put an app server or API gateway in between.`,
        'reverse-proxies-gateways',
        [from.id, to.id],
      ),
    );
  }

  // 3. Load from the problem's estimate.
  // A relational primary takes every write itself; a NoSQL store is assumed to partition by key across its nodes.
  const prim = primaries(g);
  const sqlOnly = prim.length > 0 && prim.every((p) => p.type === 'sqlDb');
  const nosql = prim.find((p) => p.type === 'nosqlDb');
  if (load) {
    if (sqlOnly && load.peakWrites > BALLPARK.dbWrites && !sharded(g)) {
      out.push(
        issue(
          'write-load',
          'shards',
          `One database is handling about ${formatRough(load.peakWrites)} writes per second at peak. What happens?`,
          'sharding',
          prim.map((d) => d.id),
        ),
      );
    } else if (nosql && load.peakWrites > BALLPARK.dbWrites && !sharded(g)) {
      out.push(
        good(
          'nosql-partitions',
          'shards',
          `${displayLabel(nosql)} spreads about ${formatRough(load.peakWrites)} writes per second across its nodes by key. Be ready to name the partition key.`,
        ),
      );
    }
    if (dbs.length && load.peakReads > BALLPARK.dbReads && !has(g, 'cache')) {
      out.push(
        issue(
          'read-load',
          'cache',
          `About ${formatRough(load.peakReads)} reads per second reach your database at peak. What absorbs the repeats?`,
          'caching',
          dbs.map((d) => d.id),
        ),
      );
    }
    if (services.length === 1 && !isFleet(services[0]!) && !fronted(g, services[0]!) && load.peakRps > BALLPARK.serverRps) {
      out.push(
        issue(
          'server-load',
          'scale-out',
          `At about ${formatRough(load.peakRps)} requests per second at peak, one app server is not enough (one handles roughly ${BALLPARK.serverRps} a second). How many do you need, and what spreads the traffic?`,
          'vertical-vs-horizontal-scaling',
          [services[0]!.id],
        ),
      );
    }
    if (sqlOnly && !has(g, 'objectStore') && load.storageTotal > BALLPARK.dbStorageBytes && !sharded(g)) {
      out.push(
        issue(
          'storage-load',
          'shards',
          `You will store about ${formatBytes(load.storageTotal)} over ${years(load.retentionYears)}. Does that fit on one database server?`,
          'sharding',
          prim.map((d) => d.id),
        ),
      );
    }
  }

  // 4. A single database with no copy.
  if (prim.length === 1 && !replicated(g)) {
    out.push(
      issue('single-database', 'replica', `${displayLabel(prim[0]!)} is the only copy of your data. What happens when it fails?`, 'replication', [prim[0]!.id]),
    );
  }

  // 5. Several app servers that clients reach directly, with no load balancer anywhere.
  const frontDoor = design.nodes.some((n) => FRONT_DOORS.has(n.type));
  const clientFacing = services.filter((s) => (g.inc.get(s.id) ?? []).some((e) => ['client', 'cdn', 'dns'].includes(g.byId.get(e.from)!.type)));
  const crowded = frontDoor ? [] : crowdedTiers(clientFacing);
  if (crowded.length) {
    out.push(
      issue(
        'no-load-balancer',
        'lb',
        'Clients reach your app servers directly, with nothing in front of them. Who spreads the traffic, and who stops sending requests to a server that dies?',
        'load-balancers',
        crowded.flat().map((s) => s.id),
      ),
    );
  }

  // 6. Slow work done synchronously, with no queue.
  const messaging = design.nodes.some((n) => MESSAGING.has(n.type));
  for (const e of design.edges) {
    const from = g.byId.get(e.from);
    const to = g.byId.get(e.to);
    if (!from || !to || !['service', 'gateway'].includes(from.type)) continue;
    if (to.type === 'worker' && e.kind === 'sync') {
      out.push(
        issue(
          'sync-worker',
          'queue',
          `${displayLabel(from)} calls ${displayLabel(to)} and waits for it. Slow work belongs behind a queue, so the user gets a reply right away.`,
          'queues-and-streams',
          [from.id, to.id],
        ),
      );
    } else if (to.type === 'worker' && !messaging) {
      out.push(
        issue(
          'direct-worker',
          'queue',
          `${displayLabel(to)} gets jobs straight from ${displayLabel(from)}. What holds the jobs while the worker is busy or restarting? Put a queue between them.`,
          'queues-and-streams',
          [from.id, to.id],
        ),
      );
    } else if (to.type === 'external' && e.kind === 'sync' && !messaging && NOTIFY_NAME.test(displayLabel(to))) {
      out.push(
        issue(
          'sync-external',
          'queue',
          `${displayLabel(from)} waits on ${displayLabel(to)} inside the request. What happens when that provider is slow or down? A queue lets you reply now and retry later.`,
          'queues-and-streams',
          [from.id, to.id],
        ),
      );
    }
  }

  // 7. Media with no object storage or CDN.
  const bigObjects = load?.objectBytes !== undefined && load.objectBytes >= BALLPARK.mediaBytes;
  const mediaNamed = design.nodes.some((n) => !['objectStore', 'cdn', 'fileStore', 'blockStore'].includes(n.type) && MEDIA_NAME.test(displayLabel(n)));
  if ((bigObjects || mediaNamed) && !has(g, 'objectStore')) {
    out.push(
      issue(
        'media-storage',
        'object',
        bigObjects
          ? `Each object is about ${formatBytes(load!.objectBytes!)}. Where do those files live? A database is a poor home for large files; object storage is built for them.`
          : 'Where do the media files live? A database is a poor home for large files; object storage is built for them.',
        'storage-types',
      ),
    );
  }
  const heavyOut = load?.outPeak !== undefined && load.outPeak >= BALLPARK.cdnOutBytes;
  if ((bigObjects || mediaNamed) && has(g, 'objectStore') && !has(g, 'cdn') && (heavyOut || !load || load.outPeak === undefined)) {
    out.push(
      issue(
        'media-cdn',
        'cdn',
        heavyOut
          ? `Your storage sends about ${formatRate(load!.outPeak!)} at peak, and users far away wait on every file. What could serve popular files near them?`
          : 'Every download comes from your own storage, so users far away wait on each file. What could serve popular files near them?',
        'cdns',
        ofType(g, 'objectStore').map((n) => n.id),
      ),
    );
  }

  // 8. Nowhere to keep data.
  if (design.nodes.length >= 2 && !design.nodes.some((n) => STORES.has(n.type))) {
    out.push(issue('no-storage', 'db', 'Where does the data live? Nothing in your design stores anything yet.', 'databases-101'));
  }

  // 9. What the problem's concepts lead you to expect.
  const concepts = [...new Set(ctx.concepts ?? [])];
  const met: Finding[] = [];
  for (const c of concepts) {
    for (const exp of CONCEPT_EXPECTATIONS[c] ?? []) {
      if (exp.test(g)) met.push(good(`concept:${c}`, exp.topic, exp.good));
      else out.push(issue(`concept:${c}`, exp.topic, exp.missing, c));
    }
  }

  // 10. Loose parts.
  if (design.nodes.length >= 2) {
    for (const n of design.nodes) {
      if (degree(g, n.id) > 0) continue;
      out.push(
        issue('disconnected', `disconnected:${n.id}`, `${label(n.id)} is not connected to anything. Connect it, or remove it if it has no job yet.`, undefined, [n.id]),
      );
    }
  }

  // What works.
  const several = crowdedTiers(services).length > 0 || services.some((s) => fronted(g, s));
  if (frontDoor && services.length) out.push(good('good-lb', 'lb', 'A load balancer or gateway spreads traffic across your app servers.'));
  if (ofType(g, 'cache').some((c) => degree(g, c.id) > 0)) out.push(good('good-cache', 'cache', 'Repeated reads can come from the cache instead of the database.'));
  if (dbs.length && replicated(g)) out.push(good('good-replica', 'replica', 'Your data has a replica, so losing one machine does not lose it.'));
  if (messaging && has(g, 'worker')) out.push(good('good-queue', 'queue', 'Slow work goes through a queue to workers, so users do not wait for it.'));
  if (has(g, 'objectStore')) out.push(good('good-object', 'object', 'Large files live in object storage, not in the database.'));
  if (has(g, 'cdn')) out.push(good('good-cdn', 'cdn', 'A CDN serves content close to users.'));
  if (dbs.length && sharded(g)) out.push(good('good-shards', 'shards', 'The data is split across more than one database.'));
  if (several) out.push(good('good-scale-out', 'scale-out', 'Several app servers share the load, so one can fail.'));
  out.push(...met);

  return dedupe(out);
}

/** Short tally for headings: "3 questions to think about, 2 things that work". */
export function summarizeFindings(findings: Finding[]): { issues: number; goods: number } {
  return { issues: findings.filter((f) => f.tone === 'issue').length, goods: findings.filter((f) => f.tone === 'good').length };
}
