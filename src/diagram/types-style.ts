import type { NodeType } from '@/content/types';

export type TypeCategory = 'client' | 'edge' | 'compute' | 'cache' | 'database' | 'object' | 'messaging' | 'external';

export const typeCategory: Record<NodeType, TypeCategory> = {
  client: 'client',
  dns: 'edge',
  cdn: 'edge',
  loadBalancer: 'edge',
  gateway: 'edge',
  service: 'compute',
  worker: 'compute',
  cache: 'cache',
  sqlDb: 'database',
  nosqlDb: 'database',
  search: 'database',
  objectStore: 'object',
  blockStore: 'object',
  fileStore: 'object',
  queue: 'messaging',
  stream: 'messaging',
  external: 'external',
};

export const categoryColor: Record<TypeCategory, string> = {
  client: 'var(--type-client)',
  edge: 'var(--type-edge)',
  compute: 'var(--type-compute)',
  cache: 'var(--type-cache)',
  database: 'var(--type-database)',
  object: 'var(--type-object)',
  messaging: 'var(--type-messaging)',
  external: 'var(--type-external)',
};

export const typeName: Record<NodeType, string> = {
  client: 'client',
  dns: 'DNS server',
  cdn: 'CDN edge',
  loadBalancer: 'load balancer',
  gateway: 'API gateway',
  service: 'service',
  worker: 'worker',
  cache: 'cache',
  sqlDb: 'SQL database',
  nosqlDb: 'NoSQL database',
  search: 'search index',
  objectStore: 'object storage',
  blockStore: 'block storage',
  fileStore: 'file storage',
  queue: 'queue',
  stream: 'event stream',
  external: 'external service',
};

export function colorFor(type: NodeType): string {
  return categoryColor[typeCategory[type]];
}

/** Words a learner might bold in prose to point at a component of this type. */
export const typeAliases: Record<NodeType, string[]> = {
  client: ['client', 'browser', 'phone', 'user', 'app'],
  dns: ['dns', 'dns resolver', 'resolver', 'dns server', 'name server'],
  cdn: ['cdn', 'edge', 'edge server', 'cdn edge'],
  loadBalancer: ['load balancer', 'balancer'],
  gateway: ['api gateway', 'gateway'],
  service: ['app server', 'application server', 'server', 'service', 'web server'],
  worker: ['worker'],
  cache: ['cache', 'redis', 'memcached', 'cache cluster'],
  sqlDb: ['database', 'db', 'sql database'],
  nosqlDb: ['database', 'db', 'nosql database'],
  search: ['search index', 'index'],
  objectStore: ['object storage', 'object store', 'blob store'],
  blockStore: ['block storage', 'block volume', 'volume', 'disk'],
  fileStore: ['file storage', 'file share', 'shared folder'],
  queue: ['queue', 'message queue'],
  stream: ['stream', 'event stream', 'log'],
  external: [],
};
