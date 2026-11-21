import type { ComponentType } from 'react';
import type { SimulatorId, SimulatorPreset } from '@/content/types';

export type SimulatorProps = {
  preset?: SimulatorPreset;
  /** Embedded in a lesson (compact header) or on its own Playground page. */
  embedded?: boolean;
};

type ViewModule = { default: ComponentType<SimulatorProps> };

/** Every simulator folder with a View.tsx is picked up automatically. */
const views = import.meta.glob<ViewModule>('./*/View.tsx');

export type SimulatorMeta = {
  id: SimulatorId;
  title: string;
  lessonId: string;
  summary: string;
  /** Present once the simulator is built (its folder has a View.tsx). */
  load?: () => Promise<ViewModule>;
};

type MetaInput = Omit<SimulatorMeta, 'load'>;

/** All seventeen simulators from blueprint section 9. Each is built in the phase of its lesson. */
const list: MetaInput[] = [
  {
    id: 'request-journey',
    title: 'Request journey',
    lessonId: 'life-of-a-request',
    summary: 'Step through every hop of loading a page, and see what a DNS cache and a CDN save.',
  },
  { id: 'availability', title: 'Availability calculator', lessonId: 'availability-nines', summary: 'Combine components in series and in parallel and see the downtime per year.' },
  { id: 'latency-ladder', title: 'Latency ladder', lessonId: 'latency-numbers', summary: 'Place common operations on a log scale, then zoom across nine orders of magnitude.' },
  { id: 'estimation', title: 'Estimation calculator', lessonId: 'back-of-the-envelope', summary: 'Turn daily users into requests per second, storage, bandwidth and cache size.' },
  { id: 'load-balancer', title: 'Load balancer', lessonId: 'load-balancers', summary: 'Compare balancing algorithms, then kill a server and watch health checks react.' },
  {
    id: 'cache',
    title: 'Cache',
    lessonId: 'caching',
    summary: 'Tune capacity, eviction, TTL and traffic skew, and watch hit ratio and database load.',
  },
  { id: 'message-queue', title: 'Message queue', lessonId: 'queues-and-streams', summary: 'Balance producers and consumers, and send a poison message to the dead-letter queue.' },
  { id: 'replication', title: 'Replication', lessonId: 'replication', summary: 'Add lag between leader and follower, cause a stale read, then fix it.' },
  { id: 'shard-key', title: 'Shard-key visualizer', lessonId: 'sharding', summary: 'Pick a shard key and see how data and traffic spread, celebrities included.' },
  { id: 'hash-ring', title: 'Consistent hashing ring', lessonId: 'consistent-hashing', summary: 'Add and remove nodes and count how many keys move, compared with hash mod N.' },
  { id: 'partition', title: 'Partition playground', lessonId: 'cap-pacelc', summary: 'Cut the link between replicas and choose consistency or availability.' },
  { id: 'quorum', title: 'Quorum explorer', lessonId: 'quorums', summary: 'Set N, R and W, fail nodes, and check whether reads see the latest write.' },
  { id: 'retry-storm', title: 'Retry storm', lessonId: 'timeouts-retries-backoff', summary: 'Compare immediate retries, exponential backoff and jitter after an outage.' },
  { id: 'rate-limiter', title: 'Rate limiter', lessonId: 'rate-limiting', summary: 'Run token bucket, leaky bucket and window limiters against bursts.' },
  { id: 'bloom-filter', title: 'Bloom filter', lessonId: 'probabilistic-structures', summary: 'Add and check items, and compare observed and expected false positives.' },
  { id: 'fan-out', title: 'Fan-out', lessonId: 'feed-fanout', summary: 'Compare push, pull and hybrid feeds, with and without a celebrity.' },
  { id: 'geo-map', title: 'Geospatial map', lessonId: 'geospatial-indexing', summary: 'Drop points and watch geohash cells or quadtree nodes subdivide.' },
];

export const simulators: SimulatorMeta[] = list.map((m) => ({ ...m, load: views[`./${m.id}/View.tsx`] }));

export function getSimulator(id: string): SimulatorMeta | undefined {
  return simulators.find((s) => s.id === id);
}

export const builtSimulators = simulators.filter((s) => s.load);
