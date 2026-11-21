import { describe, expect, it } from 'vitest';
import fixture from '@/features/problems/__fixtures__/url-shortener';
import { EMPTY_DESIGN, connect, placeNode, renameNode, type BuilderDesign, type ConnectionKind } from './model';
import type { NodeType } from '@/content/types';
import { BALLPARK, CONCEPT_EXPECTATIONS, checkDesign, loadProfile, type Finding, type LoadProfile } from './rules';

/** Build a design from a compact description: [type, x, y, label?] and [from, to, kind] by index (1-based ids). */
function design(nodes: [NodeType, number, number, string?][], edges: [number, number, ConnectionKind?][] = []): BuilderDesign {
  let d = EMPTY_DESIGN;
  for (const [type, x, y, label] of nodes) {
    const r = placeNode(d, type, x, y);
    d = r.design;
    if (label) d = renameNode(d, r.id!, label);
  }
  for (const [a, b, kind] of edges) d = connect(d, `n${a}`, `n${b}`, kind ?? 'sync');
  return d;
}

const ids = (fs: Finding[]) => fs.map((f) => f.id);
const issues = (fs: Finding[]) => fs.filter((f) => f.tone === 'issue');
const find = (fs: Finding[], id: string) => fs.find((f) => f.id === id);

const quiet: LoadProfile = { peakRps: 100, peakReads: 90, peakWrites: 10, storageTotal: 1e9, retentionYears: 1 };

/** Client -> load balancer -> two app servers -> database with a replica. */
function solid(): BuilderDesign {
  return design(
    [
      ['client', 0, 0],
      ['loadBalancer', 1, 0],
      ['service', 2, 0],
      ['service', 2, 1],
      ['sqlDb', 3, 0],
      ['sqlDb', 4, 0, 'Replica'],
    ],
    [
      [1, 2],
      [2, 3],
      [2, 4],
      [3, 5],
      [4, 5],
      [5, 6, 'replication'],
    ],
  );
}

describe('structural rules', () => {
  it('asks for a first component on an empty canvas, and nothing else', () => {
    expect(ids(checkDesign(EMPTY_DESIGN))).toEqual(['empty']);
  });

  it('notices when nothing sends requests', () => {
    const fs = checkDesign(design([['service', 0, 0], ['sqlDb', 1, 0]], [[1, 2]]));
    expect(find(fs, 'no-client')?.lessonId).toBe('life-of-a-request');
  });

  it('flags a client wired straight to a database', () => {
    const fs = checkDesign(design([['client', 0, 0], ['sqlDb', 1, 0]], [[1, 2]]));
    const f = find(fs, 'client-to-store')!;
    expect(f.text).toContain('The client talks to SQL database directly');
    expect(f.lessonId).toBe('reverse-proxies-gateways');
    expect(f.nodeIds).toEqual(['n1', 'n2']);
  });

  it('allows a client to upload straight to object storage', () => {
    const fs = checkDesign(design([['client', 0, 0], ['objectStore', 1, 0]], [[1, 2]]));
    expect(find(fs, 'client-to-store')).toBeUndefined();
  });

  it('asks what happens when the only database fails, until it has a replica', () => {
    const one = checkDesign(design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0, 'Users']], [[1, 2], [2, 3]]));
    expect(find(one, 'single-database')?.text).toBe('Users is the only copy of your data. What happens when it fails?');
    expect(find(one, 'single-database')?.lessonId).toBe('replication');

    const fs = checkDesign(solid());
    expect(find(fs, 'single-database')).toBeUndefined();
    expect(find(fs, 'good-replica')).toBeDefined();
  });

  it('counts a database named as a replica as a copy', () => {
    const fs = checkDesign(
      design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0], ['sqlDb', 3, 0, 'Read replica']], [[1, 2], [2, 3], [2, 4]]),
    );
    expect(find(fs, 'single-database')).toBeUndefined();
  });

  it('wants a load balancer in front of several app servers', () => {
    const bare = design(
      [['client', 0, 0], ['service', 1, 0], ['service', 1, 1], ['sqlDb', 2, 0]],
      [[1, 2], [1, 3], [2, 4], [3, 4]],
    );
    expect(find(checkDesign(bare), 'no-load-balancer')?.lessonId).toBe('load-balancers');

    const fs = checkDesign(solid());
    expect(find(fs, 'no-load-balancer')).toBeUndefined();
    expect(find(fs, 'good-lb')).toBeDefined();
  });

  it('treats a box named as a group of servers as several servers', () => {
    const fleet = design([['client', 0, 0], ['service', 1, 0, 'App servers'], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    expect(find(checkDesign(fleet), 'no-load-balancer')).toBeDefined();
    expect(find(checkDesign(fleet, { load: { ...quiet, peakRps: 5_000 } }), 'server-load')).toBeUndefined();
    const plural = design([['client', 0, 0], ['service', 1, 0, 'API services'], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    expect(find(checkDesign(plural, { load: { ...quiet, peakRps: 5_000 } }), 'server-load')).toBeUndefined();
  });

  it('reads a load balancer in front of one box as several servers behind it', () => {
    const d = design([['client', 0, 0], ['loadBalancer', 1, 0], ['service', 2, 0, 'Redirect service'], ['sqlDb', 3, 0]], [[1, 2], [2, 3], [3, 4]]);
    const fs = checkDesign(d, { load: { ...quiet, peakRps: 20_000 } });
    expect(find(fs, 'server-load')).toBeUndefined();
    expect(find(fs, 'good-lb')).toBeDefined();
  });

  it('does not mistake two different services for one crowded tier', () => {
    const d = design(
      [['client', 0, 1], ['service', 1, 0, 'Post service'], ['service', 1, 2, 'Feed service'], ['nosqlDb', 2, 1]],
      [[1, 2], [1, 3], [2, 4], [3, 4]],
    );
    expect(find(checkDesign(d), 'no-load-balancer')).toBeUndefined();
  });

  it('flags slow work done synchronously, and is satisfied by a queue', () => {
    const sync = design([['client', 0, 0], ['service', 1, 0], ['worker', 2, 0, 'Transcoder']], [[1, 2], [2, 3]]);
    const f = find(checkDesign(sync), 'sync-worker')!;
    expect(f.text).toBe('App server calls Transcoder and waits for it. Slow work belongs behind a queue, so the user gets a reply right away.');
    expect(f.lessonId).toBe('queues-and-streams');

    const queued = design(
      [['client', 0, 0], ['service', 1, 0], ['queue', 2, 0], ['worker', 3, 0]],
      [[1, 2], [2, 3, 'async'], [3, 4, 'async']],
    );
    const fs = checkDesign(queued);
    expect(issues(fs).map((x) => x.topic)).not.toContain('queue');
    expect(find(fs, 'good-queue')).toBeDefined();
  });

  it('flags a notification provider called inside the request', () => {
    const d = design([['client', 0, 0], ['service', 1, 0], ['external', 2, 0, 'Email provider']], [[1, 2], [2, 3]]);
    expect(find(checkDesign(d), 'sync-external')).toBeDefined();
    const payment = design([['client', 0, 0], ['service', 1, 0], ['external', 2, 0, 'Card network']], [[1, 2], [2, 3]]);
    expect(find(checkDesign(payment), 'sync-external')).toBeUndefined();
  });

  it('asks where media files live, then who serves them near users', () => {
    const named = design([['client', 0, 0], ['service', 1, 0, 'Video upload'], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    expect(find(checkDesign(named), 'media-storage')?.lessonId).toBe('storage-types');

    const media: LoadProfile = { ...quiet, objectBytes: 2_000_000, outPeak: 5e9 };
    const noStore = design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    expect(find(checkDesign(noStore, { load: media }), 'media-storage')?.text).toContain('Each object is about 2 MB');

    const store = design([['client', 0, 0], ['service', 1, 0], ['objectStore', 2, 0]], [[1, 2], [2, 3]]);
    const fs = checkDesign(store, { load: media });
    expect(find(fs, 'media-cdn')?.text).toContain('about 5 GB/s at peak');
    expect(find(fs, 'media-storage')).toBeUndefined();

    const cdn = design([['client', 0, 0], ['cdn', 1, 0], ['objectStore', 2, 0]], [[1, 2], [2, 3]]);
    expect(find(checkDesign(cdn, { load: media }), 'media-cdn')).toBeUndefined();
  });

  it('asks where the data lives when nothing stores anything', () => {
    expect(find(checkDesign(design([['client', 0, 0], ['service', 1, 0]], [[1, 2]])), 'no-storage')).toBeDefined();
  });

  it('points out components that are not connected', () => {
    const fs = checkDesign(design([['client', 0, 0], ['service', 1, 0], ['cache', 3, 3]], [[1, 2]]));
    const loose = fs.filter((f) => f.id === 'disconnected');
    expect(loose.map((f) => f.nodeIds)).toEqual([['n3']]);
  });
});

describe('load rules', () => {
  const oneDb = design([['client', 0, 0], ['loadBalancer', 1, 0], ['service', 2, 0, 'App servers'], ['sqlDb', 3, 0]], [[1, 2], [2, 3], [3, 4]]);

  it('asks what happens to one database at 50,000 writes per second', () => {
    const f = find(checkDesign(oneDb, { load: { ...quiet, peakWrites: 50_000 } }), 'write-load')!;
    expect(f.text).toBe('One database is handling about 50,000 writes per second at peak. What happens?');
    expect(f.lessonId).toBe('sharding');
  });

  it('is satisfied by shards', () => {
    const sharded = design(
      [['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0, 'Shard 1'], ['sqlDb', 2, 1, 'Shard 2']],
      [[1, 2], [2, 3], [2, 4]],
    );
    const fs = checkDesign(sharded, { load: { ...quiet, peakWrites: 50_000 } });
    expect(find(fs, 'write-load')).toBeUndefined();
    expect(find(fs, 'good-shards')).toBeDefined();
  });

  it('does not call two different kinds of database shards', () => {
    const two = design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0], ['nosqlDb', 2, 1]], [[1, 2], [2, 3], [2, 4]]);
    expect(find(checkDesign(two, { load: { ...quiet, peakWrites: 50_000 } }), 'good-shards')).toBeUndefined();
  });

  it('trusts a NoSQL store to partition heavy writes by key, and says so', () => {
    const d = design([['client', 0, 0], ['service', 1, 0], ['nosqlDb', 2, 0, 'Message store']], [[1, 2], [2, 3]]);
    const fs = checkDesign(d, { load: { ...quiet, peakWrites: 100_000 } });
    expect(find(fs, 'write-load')).toBeUndefined();
    expect(find(fs, 'nosql-partitions')?.text).toBe(
      'Message store spreads about 100,000 writes per second across its nodes by key. Be ready to name the partition key.',
    );
  });

  it('asks what absorbs heavy reads when there is no cache', () => {
    const f = find(checkDesign(oneDb, { load: { ...quiet, peakReads: 200_000 } }), 'read-load')!;
    expect(f.text).toBe('About 200,000 reads per second reach your database at peak. What absorbs the repeats?');
    const cached = design(
      [['client', 0, 0], ['service', 1, 0], ['cache', 2, 0], ['sqlDb', 2, 1]],
      [[1, 2], [2, 3], [2, 4]],
    );
    expect(find(checkDesign(cached, { load: { ...quiet, peakReads: 200_000 } }), 'read-load')).toBeUndefined();
  });

  it('says one app server cannot take the peak', () => {
    const single = design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    const f = find(checkDesign(single, { load: { ...quiet, peakRps: 2_000 } }), 'server-load')!;
    expect(f.text).toContain('At about 2,000 requests per second at peak, one app server is not enough');
    expect(find(checkDesign(single, { load: { ...quiet, peakRps: BALLPARK.serverRps } }), 'server-load')).toBeUndefined();
  });

  it('asks whether years of data fit on one database', () => {
    const f = find(checkDesign(oneDb, { load: { ...quiet, storageTotal: 50e12, retentionYears: 5 } }), 'storage-load')!;
    expect(f.text).toBe('You will store about 50 TB over 5 years. Does that fit on one database server?');
  });

  it('keeps only the most specific finding per topic', () => {
    const fs = checkDesign(oneDb, { concepts: ['caching'], load: { ...quiet, peakReads: 200_000 } });
    const cache = fs.filter((f) => f.topic === 'cache');
    expect(cache.map((f) => f.id)).toEqual(['read-load']);
  });
});

describe('expectations from the problem’s concepts', () => {
  it('expects the components the problem’s lessons teach', () => {
    const d = design([['client', 0, 0], ['service', 1, 0], ['sqlDb', 2, 0]], [[1, 2], [2, 3]]);
    const fs = checkDesign(d, { concepts: ['caching', 'search-inverted-indexes', 'idempotency'] });
    expect(find(fs, 'concept:caching')).toMatchObject({ tone: 'issue', lessonId: 'caching' });
    expect(find(fs, 'concept:search-inverted-indexes')).toMatchObject({ tone: 'issue', lessonId: 'search-inverted-indexes' });
    expect(find(fs, 'concept:idempotency')).toBeUndefined();
  });

  it('counts an async connection as work taken off the request', () => {
    const d = design([['client', 0, 0], ['service', 1, 0], ['external', 2, 0, 'Push service']], [[1, 2], [2, 3, 'async']]);
    expect(find(checkDesign(d, { concepts: ['queues-and-streams'] }), 'concept:queues-and-streams')?.tone).toBe('good');
  });

  it('turns a met expectation into something that works', () => {
    const d = design([['client', 0, 0], ['gateway', 1, 0, 'Rate limiter'], ['service', 2, 0], ['cache', 3, 0, 'Counters']], [[1, 2], [2, 3], [2, 4]]);
    const fs = checkDesign(d, { concepts: ['rate-limiting'] });
    expect(fs.filter((f) => f.id === 'concept:rate-limiting').map((f) => f.tone)).toEqual(['good', 'good']);
  });

  it('lists every issue before anything that works', () => {
    const fs = checkDesign(solid(), { concepts: ['caching', 'load-balancers'] });
    const firstGood = fs.findIndex((f) => f.tone === 'good');
    expect(fs.slice(firstGood).every((f) => f.tone === 'good')).toBe(true);
  });

  it('only names lessons that exist', () => {
    for (const lessonId of Object.keys(CONCEPT_EXPECTATIONS)) expect(lessonId).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('the problem’s load', () => {
  it('turns calculator inputs into peak numbers with the estimation calculator’s math', () => {
    const load = loadProfile(fixture.estimation.calculator)!;
    expect(load.peakRps).toBe(2_000);
    expect(load.peakReads).toBe(2_000);
    expect(load.peakWrites).toBe(20);
    expect(load.objectBytes).toBe(500);
  });

  it('has no object size unless the calculator states one', () => {
    expect(loadProfile({ dau: 1_000_000, actionsPerUser: 10 })?.objectBytes).toBeUndefined();
    expect(loadProfile(undefined)).toBeUndefined();
    expect(loadProfile({ readsPerWrite: 10 })).toBeUndefined();
  });

  it('raises no structural false alarms on the reference design', () => {
    const last = fixture.stages[fixture.stages.length - 1]!.diagram;
    const d: BuilderDesign = {
      nodes: last.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, x: n.x, y: n.y })),
      edges: last.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
    };
    const fs = checkDesign(d, { concepts: fixture.concepts, load: loadProfile(fixture.estimation.calculator) });
    for (const id of ['single-database', 'no-load-balancer', 'server-load', 'client-to-store', 'sync-worker', 'direct-worker', 'disconnected', 'write-load', 'read-load']) {
      expect(find(fs, id), id).toBeUndefined();
    }
    expect(find(fs, 'good-queue')).toBeDefined();
  });
});
