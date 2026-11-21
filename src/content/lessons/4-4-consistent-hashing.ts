import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: adding a fifth cache node with hash % N, then with a ring. */
const growth: DiagramSpec = {
  grid: { cols: 3, rows: 5 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 2 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 2 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 1, y: 4 },
    { id: 'c1', type: 'cache', label: 'Cache 1', x: 2, y: 0 },
    { id: 'c2', type: 'cache', label: 'Cache 2', x: 2, y: 1 },
    { id: 'c3', type: 'cache', label: 'Cache 3', x: 2, y: 2 },
    { id: 'c4', type: 'cache', label: 'Cache 4', x: 2, y: 3 },
    { id: 'c5', type: 'cache', label: 'Cache 5', sublabel: 'new', x: 2, y: 4 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-c1', from: 'app', to: 'c1', kind: 'sync' },
    { id: 'app-c2', from: 'app', to: 'c2', kind: 'sync' },
    { id: 'app-c3', from: 'app', to: 'c3', kind: 'sync' },
    { id: 'app-c4', from: 'app', to: 'c4', kind: 'sync' },
    { id: 'app-c5', from: 'app', to: 'c5', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  // Phones: users above the app server and the database below it; the cache nodes stay in a column.
  narrow: {
    grid: { cols: 2, rows: 5 },
    positions: {
      users: { x: 0, y: 0 },
      app: { x: 0, y: 2 },
      db: { x: 0, y: 4 },
      c1: { x: 1, y: 0 },
      c2: { x: 1, y: 1 },
      c3: { x: 1, y: 2 },
      c4: { x: 1, y: 3 },
      c5: { x: 1, y: 4 },
    },
  },
  steps: [
    {
      caption: 'The app sends each read to cache node `hash(key) % 4`. Nearly every read is a hit, and the **database** sees only a trickle of misses.',
      flow: [
        'users-app',
        [
          { edge: 'app-c1', tag: 'hit' },
          { edge: 'app-c2', tag: 'hit' },
          { edge: 'app-c3', tag: 'hit' },
          { edge: 'app-c4', tag: 'hit' },
        ],
      ],
    },
    {
      caption:
        'The team adds Cache 5, a [[cold cache|cold-cache]], and the app now divides by 5. About four keys in five now point at a different node, one that has never stored them.',
      add: ['c5', 'app-c5'],
      flow: [
        'users-app',
        [
          { edge: 'app-c1', tag: 'miss', tone: 'alert' },
          { edge: 'app-c2', tag: 'hit' },
          { edge: 'app-c3', tag: 'miss', tone: 'alert' },
          { edge: 'app-c4', tag: 'miss', tone: 'alert' },
          { edge: 'app-c5', tag: 'miss', tone: 'alert' },
        ],
      ],
    },
    {
      caption: 'Every one of those misses goes to the database at once. It was sized for a trickle, not a flood, so it slows down for everyone.',
      flow: ['users-app', { edge: 'app-db', tone: 'alert' }],
      notes: [{ target: 'db', text: 'overloaded', tone: 'alert' }],
    },
    {
      caption:
        'With consistent hashing, Cache 5 takes over only about a fifth of the keys. The other four-fifths still hit, and the database barely notices.',
      flow: [
        'users-app',
        [
          { edge: 'app-c1', tag: 'hit' },
          { edge: 'app-c2', tag: 'hit' },
          { edge: 'app-c3', tag: 'hit' },
          { edge: 'app-c4', tag: 'hit' },
          { edge: 'app-c5', tag: 'miss', tone: 'alert' },
        ],
      ],
    },
  ],
};

/** A node fails on the toy ring: only its keys move, to the next node clockwise. */
const failure: SequenceSpec = {
  actors: [
    { id: 'app', type: 'service', label: 'App server' },
    { id: 'cc', type: 'cache', label: 'Cache C' },
    { id: 'cd', type: 'cache', label: 'Cache D' },
    { id: 'db', type: 'sqlDb', label: 'Database' },
  ],
  messages: [
    {
      from: 'app',
      to: 'cc',
      label: 'get photo:7',
      caption: 'On the toy ring, `photo:7` sits at position 55, and the first node clockwise is Cache C at 60. Every app server does the same math, so they all ask C.',
    },
    { from: 'cc', to: 'app', label: 'hit', kind: 'reply', caption: 'Cache C has the photo and answers in about a millisecond (ballpark).' },
    {
      from: 'app',
      to: 'cc',
      label: 'get photo:7',
      lost: true,
      caption: 'Then Cache C crashes. The request [[times out|timeout]], and the app drops C from its copy of the ring.',
    },
    {
      from: 'app',
      to: 'cd',
      label: 'get photo:7',
      caption: 'Walking clockwise from 55 now passes the empty spot at 60 and reaches Cache D at 85. Keys owned by A, B and D are untouched.',
    },
    {
      from: 'cd',
      to: 'app',
      label: 'miss',
      kind: 'reply',
      caption: 'Cache D has never stored `photo:7`, so it misses. So do the other keys C used to hold, about a quarter of all keys, and only those.',
    },
    { from: 'app', to: 'db', label: 'read photo:7', caption: 'The app reads the photo from the **database** once.' },
    { from: 'app', to: 'cd', label: 'set photo:7', caption: 'Then it stores the photo in Cache D, so the next read is a hit again.' },
  ],
  groups: [
    { label: 'Normal read', from: 1, to: 2 },
    { label: 'Cache C is gone', from: 3, to: 7 },
  ],
};

const lesson: Lesson = {
  id: 'consistent-hashing',
  module: 'm4',
  order: 4,
  title: 'Consistent hashing',
  idea: 'Consistent hashing places servers and keys on the same ring, so adding or removing a server moves only the keys next to it instead of reshuffling almost everything.',
  minutes: 15,
  prerequisites: ['sharding', 'caching'],
  outcomes: [
    'Explain why `hash % N` moves most keys when N changes, and work out how many.',
    'Find which node owns a key on a hash ring, and say which keys move when a node joins or leaves.',
    'Use virtual nodes to even out the load and to give bigger servers a bigger share.',
  ],
  analogy: {
    title: 'Seats around a round table',
    body: 'Picture a big round table at a family dinner. Dishes sit at fixed spots around it, and each dish is served by the first person sitting clockwise from it. When a cousin arrives late and pulls up a chair, they take over only the dishes between their chair and the person before them; everyone else keeps serving exactly what they were.\n\nNow imagine a different rule: number the dishes, divide by the number of people, and the remainder says who serves. One more chair changes almost every remainder, so nearly every dish gets passed to someone new. The round table is consistent hashing, and the remainder rule is `hash % N`.',
  },
  whyItMatters:
    'Snapgram’s [[cache|cache]] from [Caching](lesson:caching) now runs on four nodes, and each app server picks the node for a key with `hash(key) % 4`. Before a big holiday, the team adds a fifth node for headroom. The moment it goes live, the [[hit ratio|hit-ratio]] collapses: dividing by 5 instead of 4 sends about four keys in five to a node that has never seen them.\n\nEvery one of those [[cache misses|cache-miss]] goes to the [[database|database]] at the same moment, and the database, sized for the few misses a healthy cache lets through, slows to a crawl. The team only wanted more capacity. They need a way to add a node that moves just the keys it should take, about a fifth.',
  body: [
    {
      kind: 'prose',
      md: 'Plain hashing picks a node for each [[cache key|cache-key]] with the remainder after division, the [[modulo|modulo]] operation: `hash(key) % N`. A [[hash function|hash-function]] spreads keys evenly, so each node gets its share, until N changes. A key keeps its node only if its hash leaves the same remainder for the old N and the new one, and for 4 and 5 that happens for just 4 of every 20 hash values.',
    },
    {
      kind: 'numbers',
      items: [
        { label: '4 to 5 nodes', value: '80% of keys move', note: 'only 20% had to' },
        { label: '10 to 11 nodes', value: '91% move', note: 'only 9% had to' },
        { label: '100 to 101 nodes', value: '99% move', note: 'only 1% had to' },
      ],
      caption: 'With `hash % N`, going from N to N + 1 nodes moves about N out of every N + 1 keys. The bigger the cluster, the worse it gets.',
    },
    {
      kind: 'diagram',
      title: 'Adding a fifth cache node',
      caption: 'Snapgram’s cache in front of its database. Step through adding a node with `hash % N`, then with a ring.',
      spec: growth,
    },
    { kind: 'heading', text: 'The ring' },
    {
      kind: 'prose',
      md: 'Consistent hashing changes what the hash points at. Picture every possible hash value, from 0 to about 4.3 billion, bent into a circle: a [[hash ring|hash-ring]]. Each node is hashed by its name to a position on the ring, and each key is hashed to a position too. A key belongs to the first node you reach walking clockwise from it, wrapping past the top.\n\nWhen a node joins, it takes over only the keys between it and the node before it, and every other key still reaches the same node as before. When a node leaves, its keys carry on clockwise to the next one. Either way, about 1/N of the keys move: the share that had to move anyway.',
    },
    {
      kind: 'table',
      columns: ['Key', 'Position', 'Owner', 'After Cache E joins at 50'],
      rows: [
        ['`user:maya`', '5', 'Cache A (10)', 'Cache A'],
        ['`photo:42`', '47', 'Cache C (60)', '**Cache E**'],
        ['`photo:7`', '55', 'Cache C (60)', 'Cache C'],
        ['`feed:sam`', '72', 'Cache D (85)', 'Cache D'],
        ['`profile:ana`', '93', 'Cache A, past the top', 'Cache A'],
      ],
      caption:
        'A toy ring numbered 0 to 99, with Cache A at 10, B at 35, C at 60 and D at 85. When Cache E joins at 50, only keys from 36 to 50 change owner, all from C to E.',
    },
    { kind: 'heading', text: 'When a node fails' },
    {
      kind: 'sequence',
      title: 'Cache C fails',
      caption: 'The same toy ring, without Cache E: when Cache C dies, only its keys move, each to the next node clockwise.',
      spec: failure,
    },
    { kind: 'heading', text: 'Virtual nodes' },
    {
      kind: 'prose',
      md: 'One position per node has two flaws. The positions are random, so the gaps between nodes are uneven, and one node can own several times as much of the ring as another. And when a node fails, all of its keys land on a single neighbor, which can double that neighbor’s load.\n\nThe fix is to give each server many positions, called [[virtual nodes|virtual-node]], anywhere from dozens to a few hundred per server (ballpark). Many small gaps average out, so every server ends up close to a fair share. A failed server’s keys scatter over all the others, a new server takes a small slice from each, and a bigger machine simply gets more virtual nodes.',
    },
    { kind: 'heading', text: 'Where you will meet it' },
    {
      kind: 'prose',
      md: 'Cache clients use consistent hashing to pick a [[Memcached|memcached]] or [[Redis|redis]] node, as Snapgram now does. Amazon’s Dynamo and Apache Cassandra place data on a ring, and [[load balancers|load-balancer]] use the same idea to keep each user on one server. For a database, moving keys means copying data before the new owner can serve it, so the steps from [Sharding](lesson:sharding) still apply.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Every app server needs the same list of nodes, delivered by a [[coordination service|coordination-service]] or spread by [[gossip|gossip-protocol]], and during a change two servers may briefly disagree. Databases on a ring also keep copies of each key on the next nodes clockwise. And no ring can split one [[hot key|hot-key]]: it still lands on one node.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'hash-ring',
      preset: { servers: 4, vnodes: 200 },
      intro:
        'Run Snapgram’s cache ring yourself. Add a fifth node and compare how many keys move on the ring and with `hash % N`. Then remove a node, and drop to one virtual node per server to watch the load go lopsided.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to map keys to nodes, compared.',
    rows: [
      {
        option: '`hash % N`',
        goodAt: 'Simple, stateless and even with a good hash.',
        badAt: 'Changing N moves about N/(N + 1) of the keys, close to a full reshuffle.',
        pickWhen: 'N never changes, or a full reshuffle is cheap.',
      },
      {
        option: 'Ring, one position per node',
        goodAt: 'A change moves only about 1/N of the keys.',
        badAt: 'Uneven gaps, and a failed node’s keys all land on one neighbor.',
        pickWhen: 'Rarely in production; it is the idea to sketch first.',
      },
      {
        option: 'Ring with virtual nodes',
        goodAt: 'Moves about 1/N of the keys, keeps the load even and weights servers by size.',
        badAt: 'A bigger table to search, and every client must agree on the node list.',
        pickWhen: 'Nodes come and go: cache clusters and Dynamo-style stores.',
      },
      {
        option: 'Logical shards with a directory',
        goodAt: 'Moves whole shards on a plan, with full control over placement.',
        badAt: 'Needs a lookup table, and the shard count must be chosen up front.',
        pickWhen: 'Databases where every move is a planned copy, as in the Notion example from [Sharding](lesson:sharding).',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s Dynamo',
    body: 'Amazon’s 2007 Dynamo paper describes the key-value store behind core services such as the shopping cart. Dynamo treats the output of its hash function as a ring: each node takes a random position, and each key belongs to the first node clockwise from the key’s own position. The paper’s main point about this design is that a node joining or leaving affects only its immediate neighbors.\n\nThe paper also names the weaknesses of the basic ring: random positions spread data and load unevenly, and the scheme ignores that some machines are more powerful than others. Its answer is virtual nodes. When a machine fails, its load spreads evenly over the rest; when one joins, it takes a roughly equal share from each; and a bigger machine can be given more virtual nodes.',
    sourceUrl: 'https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html',
    sourceLabel: 'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store,” 2007',
  },
  interview: {
    whenToMention:
      'Whenever keys are spread over nodes that come and go: a cache cluster, a key-value store, or sticky routing to servers. Say it as soon as you are tempted to write `hash % N`, and mention virtual nodes in the same breath.',
    sayItLikeThis: [
      'I’ll put the cache nodes on a consistent-hash ring with a couple of hundred virtual nodes each, so adding a node moves only about 1/N of the keys.',
      'With plain `hash % N`, going from 4 to 5 nodes would remap about 80% of keys, and those misses would hit the database at once.',
    ],
    followUps: [
      {
        q: 'What happens to a node’s keys when it dies?',
        a: 'They now belong to the next node clockwise or, with virtual nodes, to many nodes that each take a small share. In a cache, those keys miss once and refill from the database. In a database, the next nodes must already hold copies, or that data is unavailable until the node returns.',
      },
      {
        q: 'How many virtual nodes would you use?',
        a: 'Enough to keep the busiest node within a few percent of a fair share, often a few hundred per server (ballpark). The ring is still only thousands of entries in memory, and bigger machines get proportionally more.',
      },
      {
        q: 'How do all the app servers agree on the ring?',
        a: 'They share the same node list and the same hash function. The list comes from a coordination service or a config push, or spreads by gossip in Dynamo-style stores. During a change, clients may briefly disagree, which a cache tolerates as a few extra misses.',
      },
    ],
    redFlags: [
      'Using `hash % N` for a cluster that will grow or lose nodes.',
      'Drawing a ring with one position per server and assuming the load is even.',
      'Forgetting that a database on a ring must copy data before a new owner can serve it.',
    ],
  },
  mistakes: [
    '**Modulo with a changing N.** Each resize remaps most keys: for a cache that is a flood of misses, for a database a huge migration.',
    '**One position per server.** Random gaps leave some nodes with several times the keys of others, and a failure dumps a node’s whole load on one neighbor.',
    '**Clients that disagree.** If two app servers use different node lists or hash functions, they look for the same key in different places.',
    '**Expecting the ring to fix hot keys.** It spreads keys, not requests, so one celebrity’s key still lands on one node.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'A cache uses `hash(key) % N` and grows from 10 nodes to 11. About what share of keys now maps to a different node?',
      answer: 91,
      unit: '%',
      tolerance: 1.1,
      solution: [
        'A key stays put only if `hash % 10` equals `hash % 11`.',
        'Over any 110 hash values in a row, that holds for just 10 of them: those whose remainder after dividing by 110 is 0 to 9.',
        'So about 10 ÷ 110 ≈ 9% stay, and about 91% move.',
      ],
    },
    {
      kind: 'single',
      prompt: 'On a toy ring numbered 0 to 99, Cache A sits at 10, B at 40 and C at 70. A key hashes to 55. Which node owns it?',
      options: [
        { text: 'Cache C', correct: true, why: 'Walking clockwise from 55, the first node you reach is C at 70.' },
        { text: 'Cache B', correct: false, why: 'B at 40 is behind the key, and you only ever walk clockwise.' },
        { text: 'Cache A', correct: false, why: 'You would reach A only after passing C and wrapping past 99.' },
        { text: 'Whichever node has the fewest keys', correct: false, why: 'The ring never looks at load: the key’s position alone decides.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'On that ring, Cache D joins at position 60. Which keys move?',
      options: [
        {
          text: 'Keys from 41 to 60, from C to D',
          correct: true,
          why: 'Those keys used to walk on to C at 70; now D at 60 comes first. No other key is affected.',
        },
        { text: 'About four keys in five, from every node', correct: false, why: 'That is what `hash % N` does; on the ring only one stretch changes owner.' },
        { text: 'Keys from 61 to 70, from C to D', correct: false, why: 'Those keys still reach C at 70 first, because D at 60 is behind them.' },
        {
          text: 'A quarter of each node’s keys',
          correct: false,
          why: 'With one position per node, only the next node clockwise gives up keys; spreading the cost needs virtual nodes.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'What do virtual nodes give you? Select all that apply.',
      options: [
        { text: 'A more even spread of keys across servers', correct: true, why: 'Many small gaps average out, where one random gap per server does not.' },
        {
          text: 'When a server fails, its keys spread over many servers',
          correct: true,
          why: 'Its positions have many different neighbors, so no single server takes the whole load.',
        },
        { text: 'A way to give a bigger server a bigger share', correct: true, why: 'Give it more positions, in proportion to its capacity.' },
        {
          text: 'A hot key split across several servers',
          correct: false,
          why: 'One key still hashes to one position and one owner; virtual nodes spread keys, not the requests for one key.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of finding a key’s node on a ring in order.',
      items: [
        'Hash the key to a position on the ring',
        'Walk clockwise from that position',
        'Stop at the first virtual node',
        'Look up which server owns that virtual node',
        'Send the request to that server',
      ],
      why: 'The key’s hash says where to start, and the first virtual node clockwise names the server. In code, the walk is a binary search over a sorted list of positions.',
    },
  ],
  takeaways: [
    'With `hash % N`, changing N remaps about N/(N + 1) of the keys, which is close to a full reshuffle.',
    'Consistent hashing puts servers and keys on a ring, and each key belongs to the first server clockwise, so a change moves only about 1/N of the keys.',
    'Virtual nodes give each server many places on the ring, which evens out the load, spreads a failed server’s keys and lets bigger servers take more.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Replicas on the ring.** Dynamo-style stores keep each key on its owner and on the next few distinct servers clockwise, so a failed node’s data is already elsewhere. That is [[leaderless replication|leaderless-replication]], and [Quorums](lesson:quorums) builds on it.',
    },
    {
      kind: 'prose',
      md: '**Rendezvous hashing.** Each key scores every server with a hash of the key and the server’s name, and picks the top score. Only the keys that must move do, with no ring or virtual nodes, but each lookup checks every server, so it suits small clusters.',
    },
    {
      kind: 'prose',
      md: '**Jump consistent hash.** A tiny algorithm published by Google maps a key to one of N numbered buckets with almost no memory and a nearly perfect spread. Buckets can only be added or removed at the end, so it suits numbered shards better than caches whose nodes fail in the middle.',
    },
    {
      kind: 'prose',
      md: '**Bounded loads.** Even with virtual nodes, a hot key overloads its node. Consistent hashing with bounded loads caps each node at a set amount above the average, such as 25%, and sends extra keys on to the next node clockwise that has room.',
    },
  ],
  flashcards: [
    {
      front: 'Why does hash % N move most keys when N changes?',
      back: 'A key stays only if its remainder is the same for both values of N; going from N to N + 1 moves about N/(N + 1) of the keys.',
    },
    { front: 'How does a hash ring find a key’s node?', back: 'Hash the key to a position on the ring and walk clockwise to the first node.' },
    {
      front: 'What moves when a node joins a ring?',
      back: 'Only the keys between the new node and the node before it, which move from the next node clockwise to the new one.',
    },
    {
      front: 'What are virtual nodes?',
      back: 'Many positions per server on the ring, which even out the load and spread a failed server’s keys over many others.',
    },
    { front: 'How do you give a bigger server more keys on a ring?', back: 'Give it more virtual nodes, in proportion to its capacity.' },
    {
      front: 'Why is a resize harder for a database on a ring than for a cache?',
      back: 'A cache can just miss and refill; a database must copy the moved data before the new owner can serve it.',
    },
  ],
  related: ['sharding', 'caching', 'load-balancers', 'quorums', 'replication', 'heartbeats-gossip'],
  glossaryTerms: [
    'cache',
    'hit-ratio',
    'cache-miss',
    'database',
    'cache-key',
    'modulo',
    'hash-function',
    'cold-cache',
    'hash-ring',
    'timeout',
    'virtual-node',
    'memcached',
    'redis',
    'load-balancer',
    'coordination-service',
    'gossip-protocol',
    'hot-key',
    'leaderless-replication',
  ],
};

export default lesson;
