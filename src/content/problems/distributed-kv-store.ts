import type { DiagramSpec, Problem } from '../types';

/** v1: one node with a log-structured storage engine. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'client', type: 'client', label: 'Client', x: 0, y: 0 },
    { id: 'server', type: 'service', label: 'Store server', x: 1, y: 0 },
    { id: 'mem', type: 'cache', label: 'Memtable', sublabel: 'sorted, in memory', x: 2, y: 0 },
    { id: 'log', type: 'blockStore', label: 'Commit log', sublabel: 'append-only', x: 1, y: 1 },
    { id: 'files', type: 'blockStore', label: 'Sorted files', sublabel: 'never edited', x: 2, y: 1 },
  ],
  edges: [
    { id: 'client-server', from: 'client', to: 'server', kind: 'sync' },
    { id: 'server-log', from: 'server', to: 'log', kind: 'sync', label: 'append' },
    { id: 'server-mem', from: 'server', to: 'mem', kind: 'sync' },
    { id: 'mem-files', from: 'mem', to: 'files', kind: 'async', label: 'flush' },
    { id: 'server-files', from: 'server', to: 'files', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A `put` arrives. The **store server** appends it to the **commit log**, a fast sequential write, then adds it to the **memtable** and replies. After a crash, the log is replayed, so an acknowledged write is never lost.',
      flow: ['client-server', 'server-log', 'server-mem', '<client-server'],
    },
    {
      caption:
        'When the memtable reaches about 64 MB (ballpark), it is written out in one go as a new **sorted file**, and that part of the log can be deleted. In the background, compaction merges files and drops overwritten values.',
      flow: ['mem-files'],
    },
    {
      caption:
        'A `get` checks the memtable first, then the sorted files from newest to oldest. Each file’s Bloom filter answers “definitely not here” for most files, so a read usually opens just one.',
      flow: ['client-server', 'server-mem', '<server-mem', 'server-files', '<server-files', '<client-server'],
    },
  ],
};

/** v2: keys placed on a hash ring with three replicas each; quorum writes and reads. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'client', type: 'client', label: 'Client', x: 0, y: 1 },
    { id: 'a', type: 'nosqlDb', label: 'Node A', sublabel: 'coordinator', x: 1, y: 1 },
    { id: 'b', type: 'nosqlDb', label: 'Node B', sublabel: 'zone 1', x: 2, y: 0 },
    { id: 'c', type: 'nosqlDb', label: 'Node C', sublabel: 'zone 2', x: 2, y: 1 },
    { id: 'd', type: 'nosqlDb', label: 'Node D', sublabel: 'zone 3', x: 2, y: 2 },
    { id: 'e', type: 'nosqlDb', label: 'Node E', sublabel: 'new', x: 3, y: 1 },
  ],
  edges: [
    { id: 'client-a', from: 'client', to: 'a', kind: 'sync' },
    { id: 'a-b', from: 'a', to: 'b', kind: 'sync' },
    { id: 'a-c', from: 'a', to: 'c', kind: 'sync' },
    { id: 'a-d', from: 'a', to: 'd', kind: 'sync' },
    { id: 'b-e', from: 'b', to: 'e', kind: 'replication' },
    { id: 'c-e', from: 'c', to: 'e', kind: 'replication' },
    { id: 'd-e', from: 'd', to: 'e', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'Every node owns about 128 positions on the hash ring (ballpark), and every node knows the whole ring. A key’s position is a hash of the key; its N = 3 replicas are the next three distinct nodes clockwise, each in a different zone. The client can send a request to any node, here **node A**, which coordinates it.',
      flow: ['client-a'],
      notes: [{ target: 'client', text: 'put(cart:42)' }],
    },
    {
      caption:
        'For a `put`, node A sends the write to **node B**, **node C** and **node D** at once and replies as soon as two confirm: W = 2. The third copy lands a moment later.',
      flow: ['client-a', ['a-b', 'a-c', 'a-d'], ['<a-b', '<a-c'], '<client-a'],
    },
    {
      caption:
        'For a `get`, node A asks two replicas: R = 2. Because R + W = 4 is more than N = 3, at least one of the two holds the latest completed write, and since every value carries a version, node A returns the newer one.',
      flow: ['client-a', ['a-b', 'a-c'], ['<a-b', '<a-c'], '<client-a'],
    },
    {
      caption:
        '**Node E** joins. Its 128 positions split ranges owned by many nodes, so it streams a slice from each of them in parallel, about 1 TB in all (ballpark). Only about one key in 61 moves.',
      add: ['e', 'b-e', 'c-e', 'd-e'],
      flow: [['b-e', 'c-e', 'd-e']],
    },
  ],
};

/** v3: gossip, a sloppy quorum with a hint, read repair and Merkle-tree repair. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'client', type: 'client', label: 'Client', x: 0, y: 1 },
    { id: 'a', type: 'nosqlDb', label: 'Node A', sublabel: 'coordinator', x: 1, y: 1 },
    { id: 'b', type: 'nosqlDb', label: 'Node B', x: 2, y: 0 },
    { id: 'c', type: 'nosqlDb', label: 'Node C', x: 2, y: 1 },
    { id: 'd', type: 'nosqlDb', label: 'Node D', x: 2, y: 2 },
    { id: 'e', type: 'nosqlDb', label: 'Node E', sublabel: 'next on the ring', x: 3, y: 0 },
  ],
  edges: [
    { id: 'client-a', from: 'client', to: 'a', kind: 'sync' },
    { id: 'a-b', from: 'a', to: 'b', kind: 'sync' },
    { id: 'a-c', from: 'a', to: 'c', kind: 'sync' },
    { id: 'a-d', from: 'a', to: 'd', kind: 'sync' },
    { id: 'a-e', from: 'a', to: 'e', kind: 'sync' },
    { id: 'e-c', from: 'e', to: 'c', kind: 'async' },
    { id: 'c-d', from: 'c', to: 'd', kind: 'replication', label: 'hash trees' },
  ],
  // Phones: the client over node A, with node E beside A so the hint and the hash trees run straight down C and D.
  narrow: {
    grid: { cols: 2, rows: 4 },
    positions: {
      client: { x: 0, y: 0 },
      a: { x: 0, y: 1 },
      e: { x: 1, y: 1 },
      b: { x: 0, y: 2 },
      c: { x: 1, y: 2 },
      d: { x: 1, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'Every second, each node swaps heartbeat counters with a few peers picked at random, so news reaches all 60 nodes within seconds. A [[phi accrual failure detector|phi-accrual-failure-detector]] on each node turns missing heartbeats into a rising suspicion, and **node C** is marked down.',
      fail: ['c'],
      focus: ['b', 'c', 'd', 'e'],
      notes: [{ target: 'c', text: 'no heartbeats' }],
    },
    {
      caption:
        'A write arrives for a key whose replicas are B, C and D. Node A sends C’s copy to the next healthy node on the ring, **node E**, tagged with a hint that it belongs to C: a [[sloppy quorum|sloppy-quorum]]. B and E confirm, W = 2 is met, and the client never notices.',
      fail: ['c'],
      flow: ['client-a', ['a-b', 'a-d', 'a-e'], ['<a-b', '<a-e'], '<client-a'],
      notes: [{ target: 'e', text: 'hint for C' }],
    },
    {
      caption:
        'Node C returns, and gossip spreads the news. Node E replays the hint to C and deletes it, so C has the write it missed.',
      flow: ['e-c'],
      notes: [{ target: 'c', text: 'catching up', tone: 'signal' }],
    },
    {
      caption:
        'A read asks B and C, and C answers with an older version of some other key it missed. Node A returns B’s newer value and writes it back to C: [[read repair|read-repair]].',
      flow: ['client-a', ['a-b', 'a-c'], ['<a-b', '<a-c'], '<client-a', { edge: 'a-c', tag: 'repair' }],
    },
    {
      caption:
        'Keys nobody reads would stay stale, so replicas also run [[anti-entropy|anti-entropy]] repair. **Node C** and **node D** compare Merkle trees of a shared range from the root down and copy only the slices whose hashes differ.',
      flow: ['c-d', '<c-d'],
    },
  ],
};

/** v4: two sides of a network split update one key; version vectors expose the conflict. */
const v4: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone', x: 0, y: 0 },
    { id: 'b', type: 'nosqlDb', label: 'Node B', sublabel: 'zone 1', x: 1, y: 0 },
    { id: 'laptop', type: 'client', label: 'Laptop', x: 0, y: 2 },
    { id: 'd', type: 'nosqlDb', label: 'Node D', sublabel: 'zone 3', x: 1, y: 2 },
  ],
  edges: [
    { id: 'phone-b', from: 'phone', to: 'b', kind: 'sync' },
    { id: 'laptop-d', from: 'laptop', to: 'd', kind: 'sync' },
    { id: 'b-d', from: 'b', to: 'd', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'A network fault cuts zone 3 off from the others. On one side, a phone adds a book to a shopping cart through **node B**; on the other, a laptop adds a lamp to the same cart through **node D**. Each side accepts its write.',
      flow: [['phone-b', 'laptop-d']],
      notes: [{ target: 'b-d', text: 'cut', tone: 'alert' }],
    },
    {
      caption:
        'Each version carries a [[version vector|version-vector]], one counter per node that coordinated a write. Both devices started from {B: 2}; the phone’s write made {B: 3} and the laptop’s made {B: 2, D: 1}. Neither includes the other, so the store knows the writes were [[concurrent|concurrent-events]].',
      notes: [
        { target: 'b', text: '{B: 3}' },
        { target: 'd', text: '{B: 2, D: 1}' },
      ],
    },
    {
      caption:
        'The network heals and the replicas exchange data. Neither version replaces the other, so both are kept as siblings, and the next `get` returns both.',
      flow: ['b-d', '<b-d'],
    },
    {
      caption:
        'The cart service merges them into one cart holding the book and the lamp, and writes it back with a context covering both versions. The new version, {B: 4, D: 1}, descends from both; under last write wins, one item would have vanished without a trace.',
      flow: ['phone-b', '<phone-b', { edge: 'phone-b', tag: 'merged' }],
      notes: [{ target: 'b', text: '{B: 4, D: 1}', tone: 'signal' }],
    },
  ],
};

const problem: Problem = {
  id: 'distributed-kv-store',
  title: 'Distributed key-value store',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a distributed [[key-value store|key-value-store]]. Clients call `put(key, value)` and `get(key)`, the data is far too big for one machine, and the store must keep working when machines fail.',
  concepts: ['sharding', 'consistent-hashing', 'replication', 'quorums', 'cap-pacelc', 'time-and-ordering', 'heartbeats-gossip', 'indexes'],
  hints: [
    'Two decisions shape everything: how keys are split across machines, and how many copies each key gets. Then ask what a read should return while those copies disagree.',
    'At this size, machines join, leave and fail every week. Look for a way to place keys so that adding a machine moves only a small share of them, and a way for every node to learn who is alive without a central list that could itself fail.',
    'One shape that works: a [[hash ring|hash-ring]] with [[virtual nodes|virtual-node]] puts each key on three nodes; any node can act as [[coordinator|coordinator]], waiting for two of three on writes and two of three on reads; versions settle disagreements; [[hinted handoff|hinted-handoff]] and background repair bring stragglers up to date; and nodes [[gossip|gossip-protocol]] to share who is alive.',
  ],
  clarifyingQuestions: [
    {
      q: 'How much data, how many requests a second, and what is the read/write mix?',
      why: 'This sets the node count. Assume about 20 TB of data, a million requests a second at peak and four reads for every write (ballpark): disk and traffic together point to about 60 nodes.',
    },
    {
      q: 'After a successful write, must every read see it, or can a read be a moment stale?',
      why: 'If every read must see the latest write, you need overlapping quorums or a leader per range, and some requests fail during network trouble. If a moment of staleness is fine, any one replica can answer, which is faster and survives more failures: the trade-off [[PACELC|pacelc]] names, since even without a partition you choose between latency and consistency.',
    },
    {
      q: 'During a [[network partition|network-partition]], must both sides keep accepting writes?',
      why: 'If yes, two clients can update the same key on opposite sides, and the store must detect and resolve the conflict afterwards. If no, the smaller side refuses writes, and one leader per range can keep every key’s history in a single order.',
    },
    {
      q: 'How large are values, and do clients need range scans or only lookups by key?',
      why: 'Lookups by key alone allow hashing keys onto the ring, which spreads load evenly. Range scans need keys kept in sorted ranges instead, which invites hot spots, and values of many megabytes belong in object storage with only a pointer kept here.',
    },
    {
      q: 'What should happen when two clients update the same key at the same moment?',
      why: '[[Last write wins|last-write-wins]] is simple but silently drops one update, which is fine for a session token and wrong for a shopping cart. Keeping both versions for the client to merge needs version tracking on every value.',
    },
    {
      q: 'One data center, or several regions?',
      why: 'A quorum that waits on another continent adds tens of milliseconds to every request (ballpark). That points to quorums counted within the local region, with copies sent to other regions in the background.',
    },
  ],
  requirements: {
    functional: [
      '`put(key, value)`, `get(key)` and `delete(key)`, with keys up to a few hundred bytes and values up to about 1 MB.',
      'Each request can choose its consistency: wait for one replica, a majority, or all of them.',
      'An optional expiry per key, after which reads no longer return it.',
      'Add or remove nodes while the store keeps serving, with data moving automatically.',
    ],
    nonFunctional: [
      'Highly available: reads and writes keep working when any node, or a whole availability zone, fails, around 99.99% of the time (a ballpark target).',
      'Fast: about 10 ms at the 99th [[percentile|percentile]] for reads and writes within one region (ballpark).',
      'Durable: an acknowledged write survives the loss of any one node, and of any one zone.',
      'Scales out: capacity and throughput grow roughly in proportion to the number of nodes, up to hundreds.',
      'Tunable consistency: with overlapping read and write quorums, reads see the latest completed write while no replica is down; with smaller quorums, the store is [[eventually consistent|eventual-consistency]].',
    ],
    outOfScope: [
      'Transactions across several keys, and secondary indexes.',
      'Range scans and a query language.',
      'Authentication, per-tenant quotas and billing.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Data stored', value: '20 billion keys × about 1 KB each (ballpark)' },
      { label: 'Copies of each key', value: '3, one in each of three availability zones' },
      { label: 'Peak traffic', value: '1 million requests a second, 4 reads per write (ballpark)' },
      { label: 'Usable disk per node', value: 'about 2 TB: half of a 4 TB solid-state drive (SSD), leaving room for compaction and moving data' },
      { label: 'What one node serves comfortably', value: 'about 40,000 replica reads or writes a second (ballpark)' },
      {
        label: 'In the calculator',
        value: '100 million people using the apps built on the store, 500 requests each a day, 4 reads per write, 1 KB objects; ignore the storage lines, since most writes overwrite a key that already exists',
      },
    ],
    steps: [
      { label: 'Requests per second', math: '10⁸ people × 500 = 5 × 10¹⁰ a day; ÷ 10⁵ seconds', result: '≈ 500,000 a second, 1 million at peak' },
      { label: 'Data on disk', math: '2 × 10¹⁰ keys × 1 KB = 20 TB; × 3 copies', result: '≈ 60 TB' },
      { label: 'Nodes for disk', math: '60 TB ÷ 2 TB per node', result: '≈ 30 nodes' },
      {
        label: 'Nodes for traffic',
        math: '800,000 reads × 2 replicas + 200,000 writes × 3 replicas ≈ 2.2 million replica operations a second; ÷ 40,000 per node',
        result: '≈ 55 nodes, so traffic decides: plan for about 60',
      },
      { label: 'Adding one node', math: '60 TB ÷ 61 nodes ≈ 1 TB moves to it; at about 100 MB a second', result: '≈ 3 hours, streamed from many peers at once' },
      {
        label: 'Hints while a node is down for an hour',
        math: '600,000 replica writes a second ÷ 60 nodes = 10,000 a second; × 3,600 seconds × 1 KB',
        result: '≈ 36 GB of hints, spread over its neighbors',
      },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 500, readsPerWrite: 4, objectBytes: 1_000, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'put(key, value, context?, w = 2)  →  ok',
      description:
        'Stores a value. `context` is the opaque version token from an earlier `get`, telling the store which versions this write replaces; `w` is how many replicas must confirm before the call returns.',
    },
    {
      signature: 'get(key, r = 2)  →  { values: [value, …], context }',
      description:
        'Usually returns one value. If concurrent writes left versions the store cannot order, it returns all of them, called siblings, with one context covering them all; the next `put` with that context replaces them.',
    },
    {
      signature: 'delete(key, context)  →  ok',
      description:
        'Writes a [[tombstone|tombstone]], a marker saying the key was deleted, which replicates like any other write. Compaction removes it after a grace period of about 10 days (ballpark), once every replica has surely seen it.',
    },
    {
      signature: 'POST /admin/nodes  { address, zone }  →  202 Accepted',
      description:
        'Adds a node. It picks its positions on the ring, announces itself by gossip, and streams its share of data from its neighbors before it serves reads.',
    },
  ],
  dataModel: [
    {
      entity: 'Stored item',
      fields: ['key: bytes', 'value: bytes, up to about 1 MB', 'version: a version vector, or a timestamp under last write wins', 'expires_at (optional)', 'deleted: tombstone flag'],
      store: 'Each node’s local storage engine, a log-structured merge (LSM) tree such as RocksDB',
      why: 'An [[LSM tree|lsm-tree]] turns every write into a sequential append to a [[write-ahead log|write-ahead-log]] plus an insert into an in-memory [[memtable|memtable]], which suits a write-heavy store. Full memtables become sorted, unchangeable files ([[SSTables|sstable]]) that [[compaction|compaction]] merges, and a [[Bloom filter|bloom-filter]] per file lets reads skip files that cannot hold the key.',
    },
    {
      entity: 'Ring membership',
      fields: ['node_id, address, zone', 'tokens: the node’s positions on the ring', 'status: joining, up, suspected, down, leaving', 'heartbeat: generation and counter'],
      store: 'Every node keeps its own full copy, kept in step by gossip',
      why: 'Any node must route any key without asking a central service, so each node holds the whole [[membership list|membership-list]]: about 60 nodes × 128 positions (ballpark), a few hundred kilobytes. Gossip spreads a change to every node within seconds.',
    },
    {
      entity: 'Hint',
      fields: ['target_node', 'key, value, version', 'created_at'],
      store: 'The local disk of the node that stood in for the target, kept for a few hours (ballpark)',
      why: 'Hints let writes succeed while a replica is briefly down, then hand the missed writes over when it returns. After a few hours they are dropped, because a long outage is cheaper to fix with a full repair than with a mountain of hints.',
    },
    {
      entity: 'Merkle tree',
      fields: ['range: a slice of the ring', 'leaf: hash of the keys and versions in a small part of the range', 'parent: hash of its children'],
      store: 'Built by each replica during repair, then thrown away',
      why: 'A Merkle tree is a tree of hashes: if two replicas’ root hashes match, the whole range agrees, and if not, they walk down only the branches that differ. Finding a few stale keys among millions costs a few kilobytes of hashes instead of shipping every key.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Store and fetch values by key, quickly, without ever losing an acknowledged write, before worrying about more machines.',
      diagram: v1,
      explanation:
        'One node with a log-structured storage engine serves tens of thousands of requests a second (ballpark) and survives a crash, because the log is replayed on restart. It misses the requirements in three ways: 20 TB doesn’t fit, one machine can’t serve a million requests a second, and when it dies, everything is down.',
    },
    {
      title: 'v2: It scales',
      solves: '20 TB and a million requests a second at peak (ballpark) need about 60 machines, and every key needs copies on several of them.',
      diagram: v2,
      explanation:
        'Keys spread evenly because their positions are hashes, and virtual nodes scatter each machine’s share around the ring, so a new machine takes a little from many others instead of a lot from one. With N = 3, W = 2 and R = 2 ([[quorums|quorum]] that overlap), any one replica can be slow or down and requests still succeed.',
    },
    {
      title: 'v3: It survives failures',
      solves:
        'Every week some node is slow, restarting or gone, and now and then a network split cuts zones apart. Writes must still succeed, and replicas that missed writes must catch up on their own.',
      diagram: v3,
      explanation:
        'Each mechanism covers a different gap: gossip finds failures within seconds, hints cover outages of minutes to hours, read repair fixes the keys people read, and Merkle-tree repair fixes everything else. With a sloppy quorum, R + W > N no longer guarantees a fresh read during an outage; that is the price of accepting every write.',
    },
    {
      title: 'v4: Conflicts after a split',
      solves:
        'During a network split, both sides may accept writes to the same key. When it heals, the store must notice that the writes conflict, and must not quietly drop either one.',
      diagram: v4,
      explanation:
        'Version vectors tell “this write replaced that one” apart from “these two happened at the same time”. The store keeps concurrent versions and lets the application merge them, since only the application knows how; data types that merge themselves, such as counters and sets, skip that round trip.',
    },
  ],
  deepDives: [
    {
      title: 'Placing keys on nodes',
      problem:
        'Sixty nodes today, a hundred next year, and a few replaced every month. Each key needs a home that any node can compute, the load must stay even, and adding a node must move as little data as possible.',
      options: {
        caption: 'Four ways to map keys to nodes',
        rows: [
          {
            option: 'Hash [[modulo|modulo]] the node count',
            goodAt: 'Trivial, node = hash(key) mod 60, and the load is even.',
            badAt: 'Going from 60 to 61 nodes moves almost every key, which means streaming nearly all 60 TB.',
            pickWhen: 'Never for a store that grows; only for a fixed set of machines.',
          },
          {
            option: 'Consistent hashing, one position per node',
            goodAt: 'Adding a node moves only the keys between it and its neighbor, about 1/N of the data.',
            badAt: 'With one position each, ranges come out uneven, and a new node takes its whole share from one neighbor, which must stream all of it.',
            pickWhen: 'Small clusters, or as a first step in the interview.',
          },
          {
            option: 'Consistent hashing with virtual nodes',
            goodAt:
              'Each node owns many small ranges scattered round the ring, so loads even out, and a new or dead node shares its work with dozens of peers at once. A bigger machine can simply take more positions.',
            badAt: 'A bigger ring map to gossip, and repair works across many small ranges.',
            pickWhen: 'The default for a leaderless store.',
          },
          {
            option: '[[Range partitioning|range-partitioning]]',
            goodAt: 'Keys stay sorted, so a range scan reads one or two partitions; ranges split and move as they grow.',
            badAt: 'Sequential keys such as timestamps all land in the newest range, a [[hot spot|hot-spot]], and a directory of ranges must live somewhere.',
            pickWhen: 'Clients need range scans, as in Bigtable and HBase.',
          },
        ],
      },
      recommendation:
        'Use consistent hashing with virtual nodes, about 128 per node (ballpark), and pick each key’s three replicas as the next three distinct nodes clockwise that sit in different zones. Hash the keys, so even sequential keys spread out. A single [[hot key|hot-key]] is beyond any placement scheme: cache it in front, or split it in the application.',
    },
    {
      title: 'Quorums, or a leader per range?',
      problem:
        'Three copies of every key must agree well enough for the clients. One family of designs lets any replica take any write and relies on overlapping quorums; the other elects a leader per range that orders every write. The choice decides latency, behavior during a split, and whether conflicts can happen at all.',
      options: {
        caption: 'How the three copies stay in step',
        rows: [
          {
            option: 'Leaderless, strict quorums (R + W > N)',
            goodAt: 'Any replica can serve, so one slow or dead node is simply skipped; with N = 3, W = 2 and R = 2, every read overlaps the latest completed write.',
            badAt:
              'Concurrent writes can still conflict, and a read during a write in progress may see the new value on one replica and the old one on the next read: not [[linearizability|linearizability]].',
            pickWhen: 'Availability and steady latency matter most, and the application can handle the odd conflict.',
          },
          {
            option: 'Leaderless, sloppy quorums',
            goodAt: 'Writes succeed while any W healthy nodes are reachable, even if the key’s own replicas are not.',
            badAt: 'During an outage, the nodes a write reached may not overlap the nodes a later read asks, so reads can be stale until hints arrive.',
            pickWhen: 'Writes must never be refused, as for a shopping cart.',
          },
          {
            option: 'A leader per range, using [[Raft|raft]]',
            goodAt:
              'One leader per range orders all writes, and a write commits once a majority has it, so reads from the leader are up to date and conflicts can’t happen.',
            badAt:
              'Every write goes through the leader, a failed leader’s ranges pause for an election of a second or two (ballpark), and the smaller side of a split can’t write.',
            pickWhen: 'Clients need compare-and-set or strictly fresh reads, as etcd, TiKV and CockroachDB provide.',
          },
          {
            option: 'One leader with asynchronous followers',
            goodAt: 'Simple, and reads from followers scale.',
            badAt: 'Losing the leader can lose writes that hadn’t been copied yet, and failover needs care to avoid two leaders.',
            pickWhen: 'Smaller stores, where losing a few writes after a failover is acceptable.',
          },
        ],
      },
      recommendation:
        'For an always-available store, go leaderless with N = 3 and per-request W and R, defaulting to W = 2 and R = 2, and allow sloppy quorums only for data whose owners accept briefly stale reads. Say out loud that quorums alone don’t give linearizable reads. If some keys need compare-and-set, run consensus for just those operations, as Cassandra does with its Paxos-based lightweight transactions.',
    },
    {
      title: 'Resolving conflicting writes',
      problem:
        'With leaderless replication, two clients can update the same key on different replicas at the same moment, most often during a split. The store must decide what a later read returns. Choosing badly loses data quietly, and nobody notices until a customer does.',
      options: {
        caption: 'What a read returns after two concurrent writes',
        rows: [
          {
            option: 'Last write wins',
            goodAt: 'Simple: every value carries a timestamp and the highest wins, so a read always returns one value.',
            badAt: 'One of two concurrent writes silently disappears, and [[clock skew|clock-skew]] can let an older write beat a newer one.',
            pickWhen: 'Values are replaced whole and losing a concurrent update is harmless, such as a session token or a cached page.',
          },
          {
            option: 'Version vectors with siblings',
            goodAt:
              'Each value carries a counter per coordinating node, so the store can tell “replaces” from “concurrent” and keeps concurrent versions for the client to merge.',
            badAt: 'Every client must handle several values and write back a merge, and vectors grow with the number of nodes that have coordinated writes.',
            pickWhen: 'Losing an update is unacceptable and the application knows how to merge, as with a cart.',
          },
          {
            option: '[[Conflict-free replicated data types|crdt]] (CRDTs)',
            goodAt: 'Counters, sets and maps that merge automatically and reach the same result whatever order updates arrive in.',
            badAt: 'Only some data fits their rules, and removed items leave metadata behind that must be cleaned up.',
            pickWhen: 'The data is naturally a counter, a set or a flag, such as likes or tags.',
          },
        ],
      },
      recommendation:
        'Default to last write wins, since most keys are replaced whole, but keep a version on every value from day one. Let a key space opt into version vectors with siblings, or into counter and set types, when lost updates matter. Because last write wins trusts timestamps, have the coordinator stamp each write rather than the client, and keep server clocks closely synchronized.',
    },
    {
      title: 'Finding out who is alive',
      problem:
        'With 60 nodes, a crash, a long garbage-collection pause or a failing disk happens most weeks (ballpark). Every node must learn quickly which peers are down, without a central service that could fail itself, and without declaring a slow-but-healthy node dead, which would set off needless data movement.',
      options: {
        caption: 'Three ways to track membership',
        rows: [
          {
            option: 'A central coordinator such as ZooKeeper or etcd',
            goodAt: 'One clear, consistent view of membership that every node watches.',
            badAt: 'Another system to run, and a dependency whose outage freezes membership changes.',
            pickWhen: 'You already run one, or need membership that every node agrees on exactly.',
          },
          {
            option: 'Every node sends heartbeats to every other',
            goodAt: 'Simple, and each node sees failures directly.',
            badAt: 'Messages grow with the square of the node count: about 3,500 a second for 60 nodes, about 250,000 for 500.',
            pickWhen: 'A handful of nodes.',
          },
          {
            option: 'Gossip with a phi accrual detector',
            goodAt:
              'Each node talks to a few random peers a second, news reaches everyone in about log₂ N rounds, and suspicion rises gradually with missed heartbeats instead of tripping at one fixed [[timeout|timeout]].',
            badAt: 'Views differ for a few seconds, and the suspicion threshold trades fast detection against false alarms.',
            pickWhen: 'The default for a leaderless store, and the approach Cassandra takes.',
          },
        ],
      },
      recommendation:
        'Gossip heartbeats and membership every second (ballpark), and feed heartbeat arrival times into a phi accrual detector on each node. Treat “down” as a routing decision only: stop sending requests to the node and start writing hints. Remove a node from the ring, which moves data, only on an operator’s command, so a 30-second pause never triggers terabytes of streaming.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 10 million requests a second (ballpark).',
      impact: 'Nodes run out of disk throughput and processor time, latency climbs, and compaction falls behind, which slows reads further as files pile up.',
      mitigation:
        'Add nodes, each of which takes a little from everyone thanks to virtual nodes. Add them before the crunch, since streaming to new nodes uses capacity too, and watch pending compactions as an early warning.',
    },
    {
      scenario: '100× load on a single key: 100,000 requests a second.',
      impact: 'All of it lands on that key’s three replicas, however many nodes the cluster has.',
      mitigation:
        'Cache the key in front of the store, read it from any one replica (R = 1) if a slightly stale value is fine, or split it in the application, such as `counter#0` to `counter#9`, summed on read.',
    },
    {
      scenario: 'One node dies.',
      impact: 'Its keys still have two replicas each, so W = 2 and R = 2 succeed, but the dead node misses writes.',
      mitigation:
        'Hints cover a few hours. Beyond that, an operator replaces the node, and the new one streams its ranges from the surviving replicas, about 1 TB from dozens of peers (ballpark).',
    },
    {
      scenario: 'A whole availability zone goes down.',
      impact: 'Each key loses exactly one of its three copies, because replicas are placed in different zones.',
      mitigation: 'Quorums of two still succeed everywhere. Hints pile up for the dead zone, and when it returns they are replayed and a full repair runs.',
    },
    {
      scenario: 'A network split isolates one zone.',
      impact: 'Clients stuck on the isolated side reach only one replica of each key, so W = 2 and R = 2 fail there.',
      mitigation:
        'Clients that can, retry against the larger side. Where the data allows, sloppy quorums keep the isolated side writable, and version vectors sort out the conflicts once the split heals.',
    },
    {
      scenario: 'A node is slow rather than dead, with a failing disk or long pauses.',
      impact: 'Requests that wait on it drag up [[tail latency|tail-latency]], and the failure detector may not flag it.',
      mitigation:
        'Coordinators track each replica’s latency and send reads to the fastest ones. A [[hedged request|hedged-request]] to another replica after a few milliseconds caps the wait.',
    },
    {
      scenario: 'A node returns after being down longer than the tombstone grace period.',
      impact:
        'It still holds values whose tombstones the other replicas have already compacted away, so repair would copy deleted data back to life.',
      mitigation: 'Wipe and rebuild any node gone longer than the grace period, and run a full repair of every range more often than the grace period.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Splits keys across nodes by hashing and keeps several copies of each.',
        'Describes `get` and `put`, and insists that a node failure must not lose an acknowledged write.',
        'Knows that adding a node shouldn’t move most keys, and names consistent hashing.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Picks N, W and R, shows that R + W > N makes reads overlap writes, and says how many failures each side survives.',
        'Explains virtual nodes and why they even out load and speed up recovery.',
        'Describes hinted handoff and read repair, and how a returning node catches up.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Chooses between leaderless quorums and a leader per range on purpose, and says what each does during a split.',
        'Resolves conflicts deliberately: last write wins where losses are harmless, version vectors or CRDTs where they are not, with clock skew in mind.',
        'Covers operations: Merkle-tree repair, tombstones and their grace period, gossip with a phi accrual detector, and never moving data because of a short pause.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A node just died. What happens to reads and writes for its keys?',
      a: 'Each of its keys has two more replicas in other zones, so W = 2 and R = 2 still succeed, and coordinators stop sending it requests once gossip marks it down. Writes it misses are kept as hints on other nodes for a few hours. If it doesn’t come back, an operator replaces it, and the new node streams its ranges from dozens of peers at once, thanks to virtual nodes.',
    },
    {
      q: 'Does R + W > N make this store strongly consistent?',
      a: 'Not quite. It guarantees that a read overlaps the latest completed write, but a read during a write in progress can see the new value on one replica and the old one on the next, and sloppy quorums break the overlap during outages. For strictly fresh reads and compare-and-set, I would run a consensus protocol for those keys.',
    },
    {
      q: 'Two people edit the same shopping cart during a network split. What does the next read return?',
      a: 'Each side accepted its write, and each write carries a version vector. When the split heals, neither vector includes the other, so the store keeps both versions as siblings, and the next read returns both. The cart service merges them, taking the union of the items, and writes the merge back with a context covering both; under last write wins, one item would simply vanish.',
    },
    {
      q: 'You add ten nodes to a 60-node cluster. How much data moves, and does anything slow down?',
      a: 'About a seventh of the data, roughly 9 TB (ballpark), since the new nodes take their share of the ring. With virtual nodes, each new node streams from dozens of peers, so no one node is swamped, but streaming uses disk and network that requests need too. I throttle it and add nodes a couple at a time, off-peak.',
    },
    {
      q: 'A node was down for two weeks and comes back. What can go wrong?',
      a: 'Deleted data can come back. While it was away, the other replicas wrote tombstones and then compacted them after the grace period of about 10 days (ballpark), so the returning node holds values that nobody remembers deleting, and repair would copy them back. A node gone longer than the grace period must be wiped and rebuilt from its peers.',
    },
    {
      q: 'One key gets 100,000 reads a second. What do you do?',
      a: 'More nodes don’t help, since every one of those reads lands on the same three replicas. I cache the key in front of the store or in the client, read it at R = 1 if a slightly stale value is fine, and if writes are hot too, split it into several keys in the application, such as ten counter pieces summed on read.',
    },
    {
      q: 'How would you run this across three regions?',
      a: 'Place three replicas in every region and count quorums within the local region, so no request waits on another continent, while writes reach the other regions in the background. Conflicts across regions become more likely, so the conflict strategy matters even more. A region outage is then just a long partition that hints and repair clean up afterwards.',
    },
  ],
  rubric: [
    { item: 'Estimated data size, request rate and node count, with headroom for compaction and moving data', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Partitioned keys with consistent hashing and virtual nodes, and said what moves when a node joins', weight: 20, lessonId: 'consistent-hashing' },
    { item: 'Replicated each key across zones and chose N, W and R, with the failures each setting survives', weight: 20, lessonId: 'quorums' },
    { item: 'Handled concurrent writes on purpose, with last write wins, version vectors or CRDTs, and what each loses', weight: 15, lessonId: 'time-and-ordering' },
    { item: 'Detected failures with heartbeats and gossip, and repaired replicas with hints, read repair and Merkle trees', weight: 15, lessonId: 'heartbeats-gossip' },
    { item: 'Explained the consistency trade-off, including what each side of a network split can do', weight: 10, lessonId: 'cap-pacelc' },
    { item: 'Described each node’s storage engine: log, memtable, sorted files and compaction', weight: 10, lessonId: 'indexes' },
  ],
};

export default problem;
