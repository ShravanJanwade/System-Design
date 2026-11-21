import type { DiagramSpec, Problem } from '../types';

/** v1: one cache server in front of the database, cache-aside, evicting the least recently used entries. */
const v1: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', x: 0, y: 0 },
    { id: 'cache', type: 'cache', label: 'Cache server', sublabel: '64 GB, LRU', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'source of truth', x: 1, y: 1 },
  ],
  edges: [
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'An app server needs `user:42` and asks the **cache server** first. On a hit, the value comes back from memory in well under a millisecond (ballpark).',
      flow: ['app-cache', { edge: 'app-cache', reverse: true, tag: 'hit' }],
    },
    {
      caption:
        'On a miss, it reads the **database** and writes the value into the cache with a time to live, so the next reader hits: the [[cache-aside|cache-aside]] pattern.',
      flow: [{ edge: 'app-cache', tag: 'miss' }, '<app-cache', 'app-db', '<app-db', 'app-cache'],
    },
    {
      caption:
        'When memory fills up, the cache evicts the entries used least recently. A hash table finds any key in one step, and a list kept in order of use says which entry goes next.',
      focus: ['cache'],
      notes: [{ target: 'cache', text: 'full: evict oldest' }],
    },
    {
      caption:
        'This holds 64 GB and one machine’s worth of traffic. When the machine dies, every read lands on the database at once.',
      fail: ['cache'],
      flow: ['app-db', '<app-db'],
      notes: [{ target: 'db', text: 'every read', tone: 'alert' }],
    },
  ],
};

/** v2: data spread over many nodes; clients find the owner with consistent hashing from a shared cluster map. */
const v2: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'map', type: 'nosqlDb', label: 'Cluster map', sublabel: 'etcd', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: 'cache client', x: 0, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 0, y: 2 },
    { id: 'a', type: 'cache', label: 'Cache node A', x: 1, y: 0 },
    { id: 'b', type: 'cache', label: 'Cache node B', x: 1, y: 1 },
    { id: 'c', type: 'cache', label: 'Cache node C', x: 1, y: 2 },
  ],
  edges: [
    { id: 'app-map', from: 'app', to: 'map', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-a', from: 'app', to: 'a', kind: 'sync' },
    { id: 'app-b', from: 'app', to: 'b', kind: 'sync' },
    { id: 'app-c', from: 'app', to: 'c', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The data is now spread over about 100 **cache nodes**; three are drawn. At startup, each app server’s cache client reads the **cluster map**, which lists every node and its points on a hash ring ([[consistent hashing|consistent-hashing]]), and watches it for changes.',
      flow: ['app-map', '<app-map'],
      notes: [{ target: 'map', text: '100 nodes on a ring' }],
    },
    {
      caption:
        'To read `user:42`, the client hashes the key, walks clockwise around the ring to the next node point, and goes straight to **cache node B**: one hop, with no router in between.',
      flow: ['app-b', '<app-b'],
      notes: [{ target: 'b', text: 'owns user:42' }],
    },
    {
      caption:
        'A miss reads the **database** and writes the value back to node B. Keys spread evenly, because each node owns a couple of hundred small slices of the ring rather than one big arc.',
      flow: ['app-b', '<app-b', 'app-db', '<app-db', 'app-b'],
    },
    {
      caption:
        'When a 101st node joins, it takes a small slice from every node, so only about 1% of keys move, and each moved key misses once. With `hash mod N`, almost every key would move at once and the database would take the whole load.',
      focus: ['a', 'b', 'c'],
      notes: [
        { target: 'a', text: '≈ 1% moves' },
        { target: 'c', text: '≈ 1% moves' },
      ],
    },
  ],
};

/** v3: every shard has an asynchronous replica in another zone; a cluster manager promotes it on failure. */
const v3: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', x: 0, y: 0 },
    { id: 'bp', type: 'cache', label: 'Node B primary', sublabel: 'zone 1', x: 1, y: 0 },
    { id: 'mgr', type: 'service', label: 'Cluster manager', sublabel: 'three nodes', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 0, y: 1 },
    { id: 'br', type: 'cache', label: 'Node B replica', sublabel: 'zone 2', x: 1, y: 1 },
  ],
  edges: [
    { id: 'app-bp', from: 'app', to: 'bp', kind: 'sync' },
    { id: 'bp-br', from: 'bp', to: 'br', kind: 'replication' },
    { id: 'mgr-bp', from: 'mgr', to: 'bp', kind: 'sync', label: 'heartbeats' },
    { id: 'mgr-br', from: 'mgr', to: 'br', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-br', from: 'app', to: 'br', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each shard now has a **primary** and a **replica** in another [[availability zone|availability-zone]]. Clients read and write the primary, which copies each write to the replica a moment later ([[asynchronous replication|asynchronous-replication]]).',
      flow: ['app-bp', '<app-bp', 'bp-br'],
    },
    {
      caption:
        'The **cluster manager** expects a [[heartbeat|heartbeat]] from every node each second. When node B’s primary misses them for about 5 seconds (ballpark), the manager promotes the replica and publishes a new cluster map ([[failover|failover]]).',
      fail: ['bp'],
      flow: ['mgr-bp', 'mgr-br'],
      notes: [{ target: 'mgr', text: 'B: replica promoted', tone: 'signal' }],
    },
    {
      caption:
        'Clients pick up the new map and send node B’s keys to the promoted replica. Writes the old primary had not yet copied are lost; for a cache, that means a few missing or older entries that time to live cleans up, not lost data.',
      fail: ['bp'],
      add: ['app-br'],
      flow: ['app-br', '<app-br'],
    },
    {
      caption:
        'If a shard loses both copies, its keys miss and fall through to the **database**: about 1% of reads with 100 nodes, roughly 10,000 extra reads a second at peak (ballpark). [[Request coalescing|request-coalescing]] in the clients keeps that to one database read per key.',
      fail: ['bp', 'br'],
      flow: ['app-db', '<app-db'],
      notes: [{ target: 'db', text: '+10,000 reads/s', tone: 'alert' }],
    },
  ],
};

/** v4: one viral key on one node, and three ways to spread it. */
const v4: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', sublabel: '1,000 of them', x: 0, y: 1 },
    { id: 'b', type: 'cache', label: 'Cache node B', x: 1, y: 0 },
    { id: 'br', type: 'cache', label: 'Node B replica', x: 1, y: 1 },
    { id: 'e', type: 'cache', label: 'Cache node E', x: 1, y: 2 },
  ],
  edges: [
    { id: 'app-b', from: 'app', to: 'b', kind: 'sync' },
    { id: 'app-br', from: 'app', to: 'br', kind: 'sync' },
    { id: 'app-e', from: 'app', to: 'e', kind: 'sync' },
    { id: 'b-br', from: 'b', to: 'br', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'A post goes viral, and its key `post:9` gets about 200,000 reads a second (ballpark), about twice what one node can serve. More nodes don’t help, because one key always lives on one node: **cache node B**.',
      flow: ['app-b', '<app-b'],
      notes: [{ target: 'b', text: '200,000 reads/s', tone: 'alert' }],
    },
    {
      caption:
        'Clients count reads per key and mark `post:9` hot. Each app server keeps it in a small in-process cache for two seconds, so 1,000 app servers send node B about 500 reads a second instead of 200,000.',
      focus: ['app', 'b'],
      notes: [{ target: 'app', text: 'local copy, 2 s', tone: 'signal' }],
    },
    {
      caption:
        'Where a two-second-old copy is too stale, clients can spread a hot key’s reads over the shard’s copies: the **node B replica** takes half, at the cost of reads that may lag the primary by a moment.',
      flow: [['app-b', 'app-br'], ['<app-b', '<app-br']],
    },
    {
      caption:
        'Or the writer stores the value under eight keys, `post:9#1` to `post:9#8`, which hash to different nodes such as **cache node E**, and each read picks one at random. Every update must now rewrite all eight, so only keys detected as hot get split.',
      flow: [['app-b', 'app-e'], ['<app-b', '<app-e']],
      notes: [{ target: 'e', text: 'holds post:9#2' }],
    },
  ],
};

const problem: Problem = {
  id: 'distributed-cache',
  title: 'Distributed cache',
  tier: 1,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a distributed in-memory cache, such as a [[Memcached|memcached]] or [[Redis|redis]] cluster, that many application servers share. It should hold more data than fits in one machine’s memory and keep answering quickly when machines fail.',
  concepts: ['caching', 'consistent-hashing', 'replication', 'heartbeats-gossip', 'sharding', 'back-of-the-envelope', 'latency-numbers'],
  hints: [
    'Start with one cache server and ask what breaks first as data and traffic grow: memory, request rate, or the machine itself failing.',
    'Once data lives on many nodes, every client must find a key’s node without asking anyone, and adding a node must not move most of the keys. Then ask what happens to a node’s keys when it dies, and to a node that holds one extremely popular key.',
    'One shape that works: clients hash each key onto a ring with [[virtual nodes|virtual-node]] and go straight to its node; each node evicts the [[least recently used|lru]] (LRU) entries when full; each shard has an asynchronous replica that is promoted on failure; and keys detected as hot are also cached briefly inside each app server.',
  ],
  clarifyingQuestions: [
    {
      q: 'Is this a cache in front of a database, or the only copy of some data?',
      why: 'If the database is the [[source of truth|source-of-truth]], losing cached data costs only misses, so replication can be asynchronous and simple. If some data lives only here, such as login sessions, losing a node loses data, and you need synchronous replication or persistence.',
    },
    {
      q: 'How much data, and how many operations a second?',
      why: 'Assume about 9 TB of hot data and a million operations a second at peak (ballpark). Memory, not request rate, then sets the number of nodes: about 100, each with roughly 100 GB of usable memory.',
    },
    {
      q: 'What do keys and values look like?',
      why: 'Small values around 1 KB (ballpark) suit a plain key-value interface; lists, counters and sorted sets would add data types on the server. Values of many megabytes need splitting, or a different store.',
    },
    {
      q: 'How stale may a cached value be after the database changes?',
      why: 'A few seconds of staleness allows a simple [[time to live|ttl]] (TTL) on every key plus asynchronous invalidation. Near-zero staleness needs an invalidation on every write and care with races, and may not be worth caching at all.',
    },
    {
      q: 'What latency do callers expect, and do they read many keys per request?',
      why: 'About a millisecond per lookup inside one data center (ballpark) leaves no room for extra hops on every read. Pages that read hundreds of keys need multi-get, grouped by node, so one page doesn’t wait on hundreds of round trips.',
    },
    {
      q: 'Is traffic skewed, with a few very hot keys?',
      why: 'Real traffic usually is: a small share of keys gets most reads, which is why caching works at all. But a single viral key can exceed what one node can serve, which partitioning alone can’t fix.',
    },
  ],
  requirements: {
    functional: [
      '`get`, `set` with a time to live, and `delete`, for string keys and values up to about 1 MB.',
      'Multi-get: read many keys in one call.',
      'When memory is full, evict entries by a policy, least recently used by default.',
      'Atomic operations on a single key: increment, and [[compare-and-set|compare-and-set]] for safe updates.',
    ],
    nonFunctional: [
      'Latency: about 1 ms (ballpark) for 99% of operations, measured at the client inside one data center.',
      'Scale: about 9 TB of data and a million operations a second at peak (ballpark), growing without downtime.',
      'Available: a failed node costs a few seconds of misses on its share of keys, never an outage.',
      'Even load: no node holds much more than its share of keys or traffic, even with hot keys.',
      'Data may be lost on failure, because the database holds the truth; the cache must never serve one key’s value for another.',
    ],
    outOfScope: [
      'Saving data to disk and backups: a restarted node starts empty.',
      'Transactions across keys, and queries other than by key.',
      'Rich data types such as sorted sets and streams.',
      'Replication across regions: each region runs its own cluster.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'People using the product each day', value: '100 million (ballpark)' },
      { label: 'Cache operations per person per day', value: '500: about 50 page views × 10 lookups each' },
      { label: 'Reads per write', value: 'about 10: most writes are refills after misses' },
      { label: 'Average value', value: 'about 1 KB, plus about 100 bytes of key and bookkeeping' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'Usable memory per node', value: 'about 100 GB (ballpark)' },
      { label: 'In the calculator', value: 'each lookup is a read and each set a write; the cache-size line is the hot data, and the yearly storage line doesn’t apply to a cache' },
    ],
    steps: [
      { label: 'Operations per second', math: '10⁸ people × 500 = 5 × 10¹⁰ a day; ÷ 10⁵ seconds a day', result: '≈ 500,000 a second, about a million at peak' },
      { label: 'Hot data to hold', math: '20% of a day’s 4.5 × 10¹⁰ reads × 1 KB', result: '≈ 9 TB' },
      { label: 'Nodes needed for memory', math: '9 TB ÷ 100 GB per node ≈ 90', result: 'about 100 primaries, 200 with one replica each' },
      { label: 'Load per node', math: '10⁶ operations a second ÷ 100 nodes', result: '≈ 10,000 a second each, against roughly 100,000 one node can serve (ballpark): memory sets the size, not traffic' },
      { label: 'Keys that move when a node joins', math: '1 ÷ 101 of 9 TB with consistent hashing; nearly all of it with hash mod N', result: '≈ 1%, about 90 GB, instead of nearly everything' },
      { label: 'Extra database reads if one shard is lost', math: '1% of about a million reads a second at peak', result: '≈ 10,000 extra reads a second' },
      { label: 'Network per node at peak', math: '10,000 operations a second × 1 KB', result: '≈ 10 MB a second: small' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 500, readsPerWrite: 10, objectBytes: 1_000, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'get(key)  →  value | miss',
      description:
        'The client hashes the key to find its node and reads it there in one round trip, about half a millisecond inside a data center (ballpark).',
    },
    {
      signature: 'set(key, value, ttlSeconds)  →  ok',
      description:
        'Stores or replaces the value on the key’s primary, which copies it to its replica asynchronously. A time to live is required, and the client adds random [[jitter|jitter]] so keys written together don’t expire together.',
    },
    {
      signature: 'getMulti(keys[])  →  { key: value, … }',
      description:
        'Groups the keys by node and sends one request per node in parallel, so a page that needs 100 keys waits for a handful of round trips, not 100.',
    },
    {
      signature: 'delete(key)  →  ok',
      description: 'Called after the database commits a change, so the next read refills the new value.',
    },
    {
      signature: 'cas(key, value, version)  →  ok | conflict',
      description: 'Writes only if the entry still has the version the caller read, which stops two updates from silently overwriting each other.',
    },
  ],
  dataModel: [
    {
      entity: 'Cache entry',
      fields: ['key: up to 250 bytes', 'value: bytes, up to 1 MB', 'expires_at', 'version: for compare-and-set', 'last_used or use count: for eviction'],
      store: 'Each node’s memory: a hash table plus eviction bookkeeping',
      why: 'A hash table finds any key in constant time. Bookkeeping of 16 bytes per entry across 9 billion entries (ballpark) is about 140 GB of the cluster’s memory, so keep it small.',
    },
    {
      entity: 'Cluster map',
      fields: ['version: 1,042', 'ring points or slots → node', 'node → address, zone, role (primary or replica)'],
      store: 'A [[coordination service|coordination-service]] such as etcd or ZooKeeper; clients cache it and watch for changes',
      why: 'Every client must agree on which node owns each key, and the map changes only when nodes join, leave or fail. A strongly consistent store with watches pushes each new version to every client within a second or so (ballpark).',
    },
    {
      entity: 'Node health',
      fields: ['node', 'last_heartbeat_at', 'suspected_by'],
      store: 'The cluster manager’s memory, rebuilt from heartbeats',
      why: 'Failure detection needs fresh signals, not history. Heartbeats every second and a timeout of about 5 seconds (ballpark) balance fast failover against false alarms during a long garbage-collection pause.',
    },
    {
      entity: 'Hot keys',
      fields: ['key', 'reads_per_second', 'hot_until'],
      store: 'Each client’s memory, from counting its own reads',
      why: 'Each client samples the keys it reads and marks any above a threshold, such as 1,000 reads a second from that client (ballpark), as hot for the next minute. No shared state is needed, because every client sees the same skew.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Answer repeated reads from memory instead of the database, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One cache server with cache-aside and least-recently-used eviction takes most reads off the database. It is limited by one machine’s memory and traffic, and it is a single point of failure: when it dies, the database takes every read at once.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 9 TB of hot data and a million operations a second at peak (ballpark): far more than one machine’s memory.',
      diagram: v2,
      explanation:
        'Consistent hashing lets every client find a key’s node by itself, in one hop, and keeps growth cheap: a new node takes about 1/N of the keys. The cluster map is the only shared state, and it changes only when membership does.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'With 200 nodes, a node failing or restarting is routine, and no single failure may turn into a flood of database reads.',
      diagram: v3,
      explanation:
        'A replica in another zone turns a dead node into a few seconds of errors instead of a cold shard. Asynchronous copying keeps writes fast and can lose the last moment of writes, which a cache can afford because the database still has them.',
    },
    {
      title: 'v4: Hot keys',
      solves: 'One viral key can get more reads than any single node can serve, and partitioning by key can never split one key.',
      diagram: v4,
      explanation:
        'Hot keys are fixed by making copies: briefly in each app server, on the shard’s replicas, or under several keys on different nodes. Each copy trades a little freshness for spread, so apply them only to keys measured as hot.',
    },
  ],
  deepDives: [
    {
      title: 'Finding the node that owns a key',
      problem:
        'Every client needs to map a key to a node in microseconds, with no central lookup, and every client must reach the same answer. Nodes join, leave and fail, and each change should move as few keys as possible, since every moved key is a miss.',
      options: {
        caption: 'Four ways to route keys',
        rows: [
          {
            option: '`hash(key) mod N`',
            goodAt: 'Simple and perfectly even.',
            badAt: 'Changing N remaps almost every key: going from 100 to 101 nodes moves about 99% of them, a near-total miss storm.',
            pickWhen: 'A cluster whose size never changes.',
          },
          {
            option: 'Consistent hashing with virtual nodes',
            goodAt: 'A change moves about 1/N of the keys, a couple of hundred points per node keep the load even, and bigger nodes get more points.',
            badAt: 'Every client needs the same ring, and moved keys still start cold.',
            pickWhen: 'Clients route by themselves, as Memcached clients do.',
          },
          {
            option: 'Fixed hash slots',
            goodAt: 'Keys hash into a fixed number of slots, 16,384 in Redis Cluster, and whole slots move between nodes, which is easy to plan and to copy before switching.',
            badAt: 'The slot map must stay in sync everywhere, and a busy slot moves as a unit.',
            pickWhen: 'The cluster rebalances itself and you want to warm slots before moving them.',
          },
          {
            option: 'A proxy tier that routes',
            goodAt: 'Clients stay simple, nodes see far fewer connections, and hot-key handling and metrics live in one place.',
            badAt: 'An extra hop of a fraction of a millisecond (ballpark) and another tier to run and scale.',
            pickWhen: 'Thousands of app servers or many programming languages.',
          },
        ],
      },
      recommendation:
        'Use consistent hashing with a couple of hundred virtual nodes each, or fixed slots, inside a client library that reads the cluster map from a coordination service and watches it. Version the map, so a node can reject a request routed with an old version. Add a proxy tier only when connection counts or languages multiply.',
    },
    {
      title: 'Choosing what to evict',
      problem:
        'A full node must decide which entry to drop on every new write, many thousands of times a second. The right choice keeps the [[hit ratio|hit-ratio]] high; the bookkeeping must cost little memory and almost no time per read.',
      options: {
        caption: 'Eviction policies for a shared cache',
        rows: [
          {
            option: 'Exact least recently used',
            goodAt: 'Evicts the entry unused for longest, which suits most workloads.',
            badAt: 'Two pointers per entry and a list update on every read, which contends under many threads; one big scan of rarely used keys flushes the popular ones.',
            pickWhen: 'Single-threaded nodes and typical web traffic.',
          },
          {
            option: 'Sampled least recently used',
            goodAt: 'Checks a handful of random entries and evicts the oldest of them: nearly as good, with almost no bookkeeping.',
            badAt: 'Sometimes evicts an entry that is a little warmer than the true oldest.',
            pickWhen: 'Large caches where memory per entry matters; Redis approximates its least-recently-used policies this way.',
          },
          {
            option: 'Least frequently used ([[LFU|lfu]]), with decay',
            goodAt: 'Keeps steadily popular keys through a burst of one-off reads.',
            badAt: 'Slow to forget keys that were popular yesterday unless counts decay, and new keys start at a disadvantage.',
            pickWhen: 'Stable popularity, such as a shop’s best sellers.',
          },
          {
            option: 'Time to live only, no eviction',
            goodAt: 'Predictable: entries leave only when they expire.',
            badAt: 'When memory fills before entries expire, writes fail.',
            pickWhen: 'Data that must not be dropped early, such as login sessions, with memory sized for the peak.',
          },
        ],
      },
      recommendation:
        'Default to sampled least-recently-used eviction, and switch a cluster to LFU with decay if measurements show scans flushing popular keys. Require a time to live on every key, with jitter, and expire entries lazily when read plus a small background sweep, so memory isn’t held by dead keys. Group values into size classes to limit memory fragmentation, as Memcached’s slab allocator does.',
    },
    {
      title: 'Replicas, or refill from the database?',
      problem:
        'Each node holds about 100 GB (ballpark). When one dies, its share of keys must come from somewhere: a copy kept ready, or the database, which then takes about 10,000 extra reads a second at peak plus a burst on that node’s hottest keys.',
      options: {
        caption: 'What happens to a dead node’s keys',
        rows: [
          {
            option: 'No replicas: refill from the database',
            goodAt: 'Half the memory bill, and nothing to keep in sync.',
            badAt: 'Each failure sends a spike to the database, and refilling 100 GB can take hours at a normal miss rate.',
            pickWhen: 'Small nodes, a database with plenty of [[headroom|headroom]], and rare failures.',
          },
          {
            option: 'An asynchronous replica, promoted on failure',
            goodAt: 'Failover in seconds with the data already warm; writes stay fast.',
            badAt: 'Twice the memory, and the last moment of writes can be lost on failover.',
            pickWhen: 'The default for large nodes.',
          },
          {
            option: 'Replicas that also serve reads',
            goodAt: 'Spreads read load and hot keys across copies.',
            badAt: 'Reads can return a value a moment older than the primary’s.',
            pickWhen: 'Read-heavy keys that tolerate slight staleness.',
          },
          {
            option: 'A small spare pool for failed nodes',
            goodAt: 'A few idle nodes take over a dead node’s keys with short lifetimes, shielding the database without doubling memory.',
            badAt: 'The spare starts cold, so the database still sees each key once.',
            pickWhen: 'Memory is expensive and brief extra misses are acceptable.',
          },
        ],
      },
      recommendation:
        'Give every shard an asynchronous replica in another zone, promoted by a cluster manager that has heard no heartbeats for about 5 seconds (ballpark). Let replicas serve reads only for keys marked hot. Accept that a failover can lose the last moment of writes, and protect against the dangerous case, a lost delete, with short times to live on keys that change often.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 10 million operations a second at peak (ballpark).',
      impact: 'Each node handles about 100,000 a second, its practical limit, and network traffic per node reaches about 100 MB a second.',
      mitigation: 'Add nodes, each moving about 1/N of the keys; let replicas serve reads for hot keys; and batch lookups with multi-get to cut round trips.',
    },
    {
      scenario: '100× on one key: a viral key at 200,000 reads a second or more.',
      impact: 'Its node saturates, and every other key on that node slows down with it.',
      mitigation: 'Detect hot keys in the clients and cache them in-process for a second or two; for fresher copies, read from replicas or split the key across nodes.',
    },
    {
      scenario: 'A node dies.',
      impact: 'Its keys, about 1% of the total, fail or miss for a few seconds until the replica is promoted; writes not yet copied are lost.',
      mitigation: 'Automatic failover, clients that retry once against the new map, and request coalescing on the misses.',
    },
    {
      scenario: 'A network partition hides a healthy primary from the cluster manager, but not from some clients.',
      impact: 'The replica is promoted while the old primary still takes writes: two primaries, a [[split brain|split-brain]], and some writes lost when it ends.',
      mitigation:
        'A primary that can’t reach a majority of the cluster stops accepting writes after the same timeout, and maps carry version numbers so nodes reject stale routing. Short times to live bound any stale value.',
    },
    {
      scenario: 'The whole cluster restarts cold after a bad deploy.',
      impact: 'Every read misses, and about a million reads a second hit the database, which falls over: a [[cascading failure|cascading-failure]].',
      mitigation:
        'Deploy one node at a time and wait for its hit ratio to recover; promote warm replicas before restarting primaries; and in an emergency, throttle reads to the database and serve stale values where allowed.',
    },
    {
      scenario: 'Ten nodes are added at once.',
      impact: 'About 10% of keys move and miss together, a sudden step in database load.',
      mitigation: 'Add nodes one or two at a time, or copy each slot’s keys to its new node before switching ownership.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Explains cache-aside: check the cache, read the database on a miss, store the value with a time to live.',
        'Spreads keys over nodes by hashing, and names an eviction policy such as least recently used.',
        'Notices that a failed cache node sends its reads to the database.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Uses consistent hashing or hash slots, and explains why `hash mod N` moves almost every key when a node joins.',
        'Adds replicas with automatic failover, and says what asynchronous replication can lose.',
        'Sizes the cluster and sees that memory, not request rate, sets the number of nodes.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Handles hot keys with in-process copies, replica reads or key splitting, and knows consistent hashing alone can’t.',
        'Plans for cold starts and stampedes: rolling restarts, warm replicas, request coalescing and protecting the database.',
        'Discusses consistency with the database: invalidation order, stale refills and how leases or versions prevent them.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A cache node just died. What do users notice?',
      a: 'For about 5 seconds (ballpark), reads for that node’s 1% of keys go to the database or fail, then the manager promotes the replica and clients follow the new map. Writes the old primary hadn’t copied are lost, which for a cache means a few misses or older values until their times to live run out. Users see a brief bump in latency, not an outage.',
    },
    {
      q: 'You need to grow the cluster from 100 to 200 nodes. How do you avoid hurting the database?',
      a: 'Add nodes a few at a time, so each step moves only a few percent of keys and the hit ratio recovers in between. With hash slots, I copy each slot’s keys to its new node before switching ownership, so nothing goes cold. I watch database load and the hit ratio and pause if either moves too far.',
    },
    {
      q: 'How do you stop the cache from holding a stale value after the database changes?',
      a: 'Writers update the database first, then delete the key, and readers refill on the next miss. The classic race is a slow reader that read the old value before the write and sets it after the delete; a lease token handed out on the miss and voided by the delete makes that late set fail, the approach described in Facebook’s Memcache paper. Times to live bound whatever slips through.',
    },
    {
      q: 'Why not use hash mod N? It is simpler.',
      a: 'Because changing N moves almost every key: going from 100 to 101 nodes remaps about 99% of them, which becomes a near-total miss storm on the database. Consistent hashing or fixed slots move about 1%, the share that had to move anyway.',
    },
    {
      q: 'One key is getting 200,000 reads a second. What do you do?',
      a: 'More nodes won’t help, since one key lives on one node. I detect it in the clients and cache it in each app server for a second or two, which cuts node traffic to about one read per app server per interval. If that is too stale, I read it from the shard’s replicas or split it into several keys on different nodes and read one at random.',
    },
    {
      q: 'Should routing live in a client library on each app server, or in a proxy tier?',
      a: 'A client library is one hop and cheapest, but every app server then connects to every node: 1,000 servers × 200 nodes is 200,000 connections. A proxy tier pools connections and centralizes routing, hot-key handling and metrics, for an extra hop of a fraction of a millisecond (ballpark). I start with the library and add proxies when connections or languages multiply.',
    },
  ],
  rubric: [
    { item: 'Estimated data size and operations a second, and sized the cluster from memory', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Explained cache-aside, time to live and eviction on a single node', weight: 15, lessonId: 'caching' },
    { item: 'Partitioned keys with consistent hashing or hash slots, and explained why mod N fails', weight: 20, lessonId: 'consistent-hashing' },
    { item: 'Added replicas with failover, and said what asynchronous replication can lose', weight: 20, lessonId: 'replication' },
    { item: 'Detected failures with heartbeats, and handled false alarms and split brain', weight: 10, lessonId: 'heartbeats-gossip' },
    { item: 'Handled hot keys with in-process copies, replica reads or key splitting', weight: 15, lessonId: 'sharding' },
    { item: 'Protected the database from stampedes and cold starts', weight: 10, lessonId: 'caching' },
  ],
};

export default problem;
