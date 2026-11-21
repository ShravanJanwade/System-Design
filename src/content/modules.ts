import type { LessonOutline, ModuleId, ModuleInfo } from './types';

type Row = [id: string, title: string, minutes: number, prerequisites?: string[]];

function mod(id: ModuleId, number: number, title: string, summary: string, rows: Row[]): ModuleInfo {
  return {
    id,
    number,
    title,
    summary,
    lessons: rows.map(([lessonId, lessonTitle, minutes, prerequisites], i) => ({
      id: lessonId,
      module: id,
      order: i + 1,
      number: `${number}.${i + 1}`,
      title: lessonTitle,
      minutes,
      prerequisites: prerequisites ?? [],
    })),
  };
}

/** The full curriculum: nine modules, seventy lessons (blueprint section 6). */
export const modules: ModuleInfo[] = [
  mod('m0', 0, 'Start here', 'What system design is, how Blueprint works, and what the interview looks like.', [
    ['what-is-system-design', 'What system design is', 13],
    ['how-to-use-blueprint', 'How to use Blueprint', 12, ['what-is-system-design']],
    ['interview-at-a-glance', 'The interview at a glance', 13, ['what-is-system-design']],
  ]),
  mod('m1', 1, 'How the web works', 'Follow one request from a browser to a server and back, and meet the protocols on the way.', [
    ['life-of-a-request', 'The life of a request', 15],
    ['clients-servers-ips-ports', 'Clients, servers, IPs and ports', 12, ['life-of-a-request']],
    ['dns', 'DNS', 15, ['life-of-a-request', 'clients-servers-ips-ports']],
    ['tcp-vs-udp', 'TCP vs. UDP', 14, ['life-of-a-request']],
    ['http-essentials', 'HTTP essentials', 15, ['life-of-a-request', 'tcp-vs-udp']],
    ['api-styles', 'APIs: REST, GraphQL, gRPC', 15, ['http-essentials']],
    ['real-time-communication', 'Real-time communication', 15, ['http-essentials', 'tcp-vs-udp']],
  ]),
  mod('m2', 2, 'Thinking like a system designer', 'The vocabulary and numbers you use to reason about speed, reliability and scale.', [
    ['latency-throughput-bandwidth', 'Latency, throughput, bandwidth', 14, ['life-of-a-request']],
    ['percentiles-tail-latency', 'Percentiles and tail latency', 15, ['latency-throughput-bandwidth']],
    ['availability-nines', 'Availability and the nines', 14, ['life-of-a-request']],
    ['vertical-vs-horizontal-scaling', 'Vertical vs. horizontal scaling', 14, ['latency-throughput-bandwidth']],
    ['latency-numbers', 'Latency numbers to know', 13, ['latency-throughput-bandwidth']],
    ['back-of-the-envelope', 'Back-of-the-envelope estimation', 15, ['latency-throughput-bandwidth', 'latency-numbers']],
    ['tradeoffs-core-skill', 'Trade-offs: the core skill', 14, ['availability-nines', 'vertical-vs-horizontal-scaling']],
  ]),
  mod('m3', 3, 'The building blocks', 'Load balancers, caches, databases, queues and the other parts every design is built from.', [
    ['stateless-vs-stateful', 'Stateless vs. stateful services', 14, ['vertical-vs-horizontal-scaling', 'http-essentials']],
    ['load-balancers', 'Load balancers', 15, ['stateless-vs-stateful', 'availability-nines']],
    ['reverse-proxies-gateways', 'Reverse proxies and API gateways', 11, ['load-balancers', 'http-essentials']],
    ['caching', 'Caching', 15, ['life-of-a-request', 'latency-numbers', 'stateless-vs-stateful']],
    ['cdns', 'CDNs', 13, ['caching', 'dns']],
    ['databases-101', 'Databases 101', 14, ['stateless-vs-stateful']],
    ['sql-vs-nosql', 'SQL vs. NoSQL', 15, ['databases-101']],
    ['indexes', 'Indexes', 15, ['databases-101', 'latency-numbers']],
    ['storage-types', 'Block, file and object storage', 13, ['databases-101', 'cdns']],
    ['queues-and-streams', 'Message queues and event streams', 15, ['latency-throughput-bandwidth', 'stateless-vs-stateful']],
    ['search-inverted-indexes', 'Search and inverted indexes', 14, ['indexes']],
    ['unique-ids', 'Unique IDs at scale', 13, ['databases-101', 'indexes']],
  ]),
  mod('m4', 4, 'Scaling data', 'Copying and splitting data across machines, and what that does to consistency.', [
    ['replication', 'Replication', 15, ['databases-101', 'availability-nines']],
    ['replication-lag', 'Replication lag in practice', 15, ['replication']],
    ['sharding', 'Sharding', 14, ['replication', 'unique-ids']],
    ['consistent-hashing', 'Consistent hashing', 15, ['sharding', 'caching']],
    ['cap-pacelc', 'CAP and PACELC', 15, ['replication-lag', 'tradeoffs-core-skill']],
    ['consistency-models', 'Consistency models', 14, ['cap-pacelc']],
    ['quorums', 'Quorums', 14, ['replication', 'cap-pacelc']],
    ['distributed-transactions', 'Transactions across services', 14, ['databases-101', 'queues-and-streams']],
    ['denormalization', 'Denormalization and read models', 13, ['sql-vs-nosql', 'indexes']],
  ]),
  mod('m5', 5, 'Distributed systems survival kit', 'Timeouts, retries, idempotency and the other habits that keep systems working when parts fail.', [
    ['why-distributed-is-hard', 'Why distributed systems are hard', 15, ['latency-numbers', 'replication']],
    ['timeouts-retries-backoff', 'Timeouts, retries, backoff and jitter', 15, ['why-distributed-is-hard', 'percentiles-tail-latency']],
    ['idempotency', 'Idempotency', 14, ['timeouts-retries-backoff', 'http-essentials']],
    ['circuit-breakers', 'Circuit breakers and graceful degradation', 15, ['timeouts-retries-backoff']],
    ['rate-limiting', 'Rate limiting', 15, ['reverse-proxies-gateways', 'timeouts-retries-backoff']],
    ['time-and-ordering', 'Time and ordering', 15, ['why-distributed-is-hard', 'consistency-models']],
    ['consensus-leader-election', 'Consensus and leader election', 14, ['replication', 'quorums']],
    ['heartbeats-gossip', 'Heartbeats and gossip', 14, ['why-distributed-is-hard', 'timeouts-retries-backoff']],
    ['distributed-locks', 'Distributed locks and leases', 14, ['consensus-leader-election', 'time-and-ordering']],
    ['probabilistic-structures', 'Probabilistic data structures', 15, ['caching', 'back-of-the-envelope']],
  ]),
  mod('m6', 6, 'Architecture patterns', 'How services are organized and talk to each other, from monoliths to event-driven systems.', [
    ['monolith-vs-microservices', 'Monolith, modular monolith, microservices', 15, ['reverse-proxies-gateways', 'why-distributed-is-hard']],
    ['service-communication', 'How services find and talk to each other', 15, ['monolith-vs-microservices', 'api-styles']],
    ['event-driven', 'Event-driven architecture', 15, ['queues-and-streams', 'service-communication']],
    ['cqrs-event-sourcing', 'CQRS and event sourcing', 15, ['event-driven', 'denormalization']],
    ['batch-vs-stream', 'Batch vs. stream processing', 15, ['queues-and-streams', 'time-and-ordering']],
    ['feed-fanout', 'Feeds: fan-out on write vs. on read', 15, ['caching', 'denormalization']],
    ['geospatial-indexing', 'Geospatial indexing', 15, ['indexes', 'sharding']],
    ['real-time-collaboration', 'Real-time collaboration', 15, ['real-time-communication', 'time-and-ordering']],
  ]),
  mod('m7', 7, 'Production readiness', 'Observing, securing, deploying and paying for a system that real people depend on.', [
    ['observability', 'Observability', 15, ['availability-nines', 'percentiles-tail-latency']],
    ['security-essentials', 'Security essentials', 15, ['http-essentials', 'reverse-proxies-gateways']],
    ['zero-downtime-deploys', 'Deploying without downtime', 13, ['load-balancers', 'monolith-vs-microservices']],
    ['multi-region-dr', 'Multi-region and disaster recovery', 15, ['replication', 'cap-pacelc']],
    ['cost-awareness', 'Cost awareness', 14, ['back-of-the-envelope', 'storage-types']],
  ]),
  mod('m8', 8, 'The interview playbook', 'A repeatable framework for the 45-minute design interview, and how levels are judged.', [
    ['interview-framework', 'The framework', 15, ['interview-at-a-glance', 'back-of-the-envelope']],
    ['requirements', 'Requirements like a pro', 15, ['interview-framework']],
    ['estimation-in-the-room', 'Estimation in the room', 13, ['back-of-the-envelope', 'requirements']],
    ['api-and-data-model', 'API and data model', 15, ['api-styles', 'sql-vs-nosql']],
    ['high-level-design', 'Drawing the high-level design', 14, ['api-and-data-model', 'load-balancers']],
    ['deep-dives', 'Driving the deep dives', 15, ['high-level-design', 'why-distributed-is-hard']],
    ['talking-tradeoffs', 'Talking about trade-offs', 14, ['tradeoffs-core-skill', 'deep-dives']],
    ['level-expectations', 'What each level is expected to show', 14, ['interview-framework']],
    ['mistakes-that-sink', 'Mistakes that sink candidates', 14, ['interview-framework', 'talking-tradeoffs']],
  ]),
];

export const allLessonOutlines: LessonOutline[] = modules.flatMap((m) => m.lessons);

const outlineById = new Map(allLessonOutlines.map((l) => [l.id, l]));
const moduleById = new Map(modules.map((m) => [m.id, m]));

export function getOutline(lessonId: string): LessonOutline | undefined {
  return outlineById.get(lessonId);
}

export function getModule(moduleId: string): ModuleInfo | undefined {
  return moduleById.get(moduleId as ModuleId);
}

export function lessonPath(lessonId: string): string {
  const o = outlineById.get(lessonId);
  return o ? `/learn/${o.module}/${o.id}` : '/learn';
}

export function moduleLabel(moduleId: ModuleId): string {
  const m = moduleById.get(moduleId);
  return m ? `Module ${m.number}: ${m.title}` : '';
}
