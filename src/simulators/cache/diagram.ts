import type { DiagramSpec } from '@/content/types';
import { formatInt, formatPercent } from '@/lib/format';
import { DEFAULT_CONFIG } from './logic';

export type CacheDiagramInput = { capacity: number; policy: string; hitRatio: number; dbPerSec: number };

/** Profile views, the app server, the cache and the database, labeled with the run's hit ratio and database load. */
export function cacheDiagram({ capacity, policy, hitRatio, dbPerSec }: CacheDiagramInput): DiagramSpec {
  return {
    grid: { cols: 3, rows: 3 },
    nodes: [
      { id: 'users', type: 'client', label: 'Profile views', sublabel: `${formatInt(DEFAULT_CONFIG.rps)} per second`, x: 0, y: 1 },
      { id: 'app', type: 'service', label: 'App server', x: 1, y: 1 },
      { id: 'cache', type: 'cache', label: 'Cache', sublabel: `${capacity} profiles, ${policy}`, x: 2, y: 0 },
      { id: 'db', type: 'sqlDb', label: 'Database', sublabel: `${formatInt(dbPerSec)} reads/s`, x: 2, y: 2 },
    ],
    edges: [
      { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
      { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync', label: `${formatPercent(hitRatio)} hit` },
      { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: 'on a miss' },
    ],
    // Phones: requests run down the page, and the cache and database sit side by side under the app server.
    narrow: {
      grid: { cols: 3, rows: 3 },
      positions: { users: { x: 1, y: 0 }, app: { x: 1, y: 1 }, cache: { x: 0, y: 2 }, db: { x: 2, y: 2 } },
      sides: { 'app-cache': { fromSide: 'bottom', toSide: 'top' }, 'app-db': { fromSide: 'bottom', toSide: 'top' } },
    },
    description: `Profile views reach the app server, which checks the cache first and reads the database only on a miss. Currently ${formatPercent(hitRatio)} of requests hit the cache and the database serves about ${formatInt(dbPerSec)} reads per second.`,
  };
}
