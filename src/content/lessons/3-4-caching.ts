import type { DecisionNode, DiagramSpec, Lesson } from '../types';

/** Cache-aside, animated: a hit, a miss, a fill and an invalidation. */
const cacheAside: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Browser', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'Redis', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'profiles', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'A request for Maya’s profile arrives at the app server.',
      flow: ['users-app'],
      focus: ['users', 'app'],
    },
    {
      caption:
        'The app asks the cache for the [[key|cache-key]] `profile:42`. It is there, a [[cache hit|cache-hit]], so the cache answers in about a millisecond and the app responds. The database never hears about it.',
      flow: [{ edge: 'app-cache', tag: 'hit' }, '<app-cache', '<users-app'],
      focus: ['users', 'app', 'cache'],
    },
    {
      caption: 'Next comes a request for `profile:77`, which is not cached: a [[cache miss|cache-miss]].',
      flow: ['users-app', { edge: 'app-cache', tag: 'miss' }, '<app-cache'],
      focus: ['users', 'app', 'cache'],
    },
    {
      caption: 'On a miss, the app reads the profile from the database. That takes a few milliseconds.',
      flow: ['app-db', '<app-db'],
      focus: ['app', 'db'],
    },
    {
      caption:
        'The app stores the result in the cache with a time to live, say 10 minutes, then responds. The next request for `profile:77` is a hit.',
      flow: ['app-cache', '<users-app'],
      focus: ['users', 'app', 'cache'],
      notes: [{ target: 'cache', text: 'TTL 10 min', tone: 'plain' }],
    },
    {
      caption:
        'When Maya edits her profile, the app writes the change to the database, then deletes `profile:42` from the cache. The next read misses and fetches the fresh copy.',
      flow: ['users-app', 'app-db', { edge: 'app-cache', tag: 'deleted' }],
    },
  ],
};

/** Caches at every layer of the stack. */
const layers: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'browser', type: 'client', label: 'Browser', sublabel: 'browser cache', x: 0, y: 0 },
    { id: 'edge', type: 'cdn', label: 'CDN edge', sublabel: 'edge cache', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'in-memory cache', x: 2, y: 0 },
    { id: 'cache', type: 'cache', label: 'Shared cache', sublabel: 'Redis', x: 3, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'memory cache', x: 2, y: 1 },
  ],
  edges: [
    { id: 'browser-edge', from: 'browser', to: 'edge', kind: 'sync' },
    { id: 'edge-app', from: 'edge', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

/** Quiz: the morning after a deploy. */
const coldStart: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: '50,000 reads/s', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: '10 instances', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache cluster', sublabel: 'empty after restart', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'max ≈ 5,000 reads/s', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const whichPattern: DecisionNode = {
  kind: 'question',
  id: 'reads',
  question: 'Is this data read much more often than it is written?',
  options: [
    {
      label: 'Yes, mostly reads',
      next: {
        kind: 'question',
        id: 'fresh',
        question: 'Must readers see a change the moment it is written?',
        options: [
          {
            label: 'Yes, right away',
            next: {
              kind: 'result',
              id: 'write-through',
              title: 'Write-through',
              why: 'Every write updates the cache and the database together, so reads stay fresh and fast. Writes are a little slower because they touch both stores.',
            },
          },
          {
            label: 'A short delay is fine',
            next: {
              kind: 'result',
              id: 'cache-aside',
              title: 'Cache-aside with a TTL',
              why: 'Delete the key on every write and let a short TTL clean up anything you miss. It is the simplest pattern that stays correct, and the default for read-heavy data.',
            },
          },
        ],
      },
    },
    {
      label: 'No, lots of writes',
      next: {
        kind: 'question',
        id: 'loss',
        question: 'Could you lose the last few seconds of writes if a cache node crashed?',
        help: 'Think view counters versus payments.',
        options: [
          {
            label: 'Yes, losing a little is fine',
            next: {
              kind: 'result',
              id: 'write-back',
              title: 'Write-back',
              why: 'Writes land in the cache and reach the database later in batches, which absorbs heavy write traffic. A crash loses whatever had not been saved yet.',
            },
          },
          {
            label: 'No, every write matters',
            next: {
              kind: 'result',
              id: 'write-around',
              title: 'Write-around',
              why: 'Send writes straight to the database and let the cache fill only on reads. Data that is written often but rarely read never crowds out useful entries.',
            },
          },
        ],
      },
    },
  ],
};

const lesson: Lesson = {
  id: 'caching',
  module: 'm3',
  order: 4,
  title: 'Caching',
  idea: 'A cache is a small, fast store that keeps copies of data you’ll probably need again, so you don’t pay for the slow trip every time.',
  minutes: 15,
  prerequisites: ['life-of-a-request', 'latency-numbers', 'stateless-vs-stateful'],
  outcomes: [
    'Explain cache-aside, the default caching pattern, step by step.',
    'Choose a write strategy, a [[time to live|ttl]] (TTL) and an eviction policy, and say what each one costs.',
    'Spot and prevent the classic failures: stale data, stampedes and cold caches.',
  ],
  analogy: {
    title: 'Spices on the counter',
    body: 'A chef keeps salt, oil and pepper on the counter, not in the basement pantry. The counter is small, so only the things used constantly earn a spot. When something new needs room, something else goes back downstairs.\n\nThe pantry still holds everything; the counter only holds copies of what is in use. And if the chef switches to a different salt, the jar on the counter is wrong until someone swaps it.',
  },
  whyItMatters:
    'Snapgram now has about two million daily users. Its profile pages are viewed millions of times a day, mostly the same few thousand popular profiles. Every view runs the same [[database|database]] query and gets the same answer.\n\nThe database is now 90% busy doing repeated work, and pages slow down at peak hours. A bigger database would buy a few months. The cheaper fix is to stop asking the same question millions of times.',
  body: [
    {
      kind: 'prose',
      md: 'A [[cache|cache]] sits between the app and the database. Before doing slow work, the app checks whether it already has the answer. The most common way to wire this up is [[cache-aside|cache-aside]]: the **app server** checks the **cache** itself, and fills it from the **database** when something is missing.',
    },
    {
      kind: 'diagram',
      title: 'Cache-aside, step by step',
      caption: 'The app server checks the cache first and reads the database only on a miss.',
      spec: cacheAside,
    },
    {
      kind: 'prose',
      md: 'Two numbers decide whether a cache pays off. The [[hit ratio|hit-ratio]] is the share of reads the cache answers: at 90%, the database sees only one read in ten. A miss costs slightly more than having no cache at all, because the app checked the cache first, so a cache that rarely hits is pure overhead.',
    },
    {
      kind: 'numbers',
      caption: 'Ballpark [[latencies|latency]] inside one data center. Real numbers vary with hardware and load.',
      items: [
        { label: 'Read from the app server’s own memory', value: '≈ 100 ns' },
        { label: 'Read from a shared cache over the network', value: '≈ 0.5–1 ms' },
        { label: 'Database query that uses an index', value: '≈ 1–10 ms' },
        { label: 'Query that scans or joins many rows', value: '≈ 50 ms or more' },
      ],
    },
    { kind: 'heading', text: 'Where caches live' },
    {
      kind: 'prose',
      md: 'Caches appear at every layer, and each one saves the trip to the layer behind it. The [[browser cache|browser-cache]] keeps files on the device, and a [[content delivery network|cdn]] (CDN) keeps copies near users. The **app server** can hold a small cache in its own memory, while a **shared cache** such as [[Redis|redis]] or [[Memcached|memcached]] serves every app server. Even the **database** keeps its hottest data in memory.',
    },
    {
      kind: 'diagram',
      title: 'Caches at every layer',
      caption: 'Each layer answers what it can and passes the rest along to the next.',
      spec: layers,
    },
    { kind: 'heading', text: 'Keeping the cache honest' },
    {
      kind: 'prose',
      md: 'Cached data goes stale the moment the real data changes. [[Cache invalidation|cache-invalidation]] is how you deal with that, and there are two basic tools. The first is a TTL, which caps how stale anything can get. The second is to delete or update the cached copy whenever you write, which keeps it fresh in the common case.',
    },
    {
      kind: 'prose',
      md: 'How writes reach the cache is a choice with real trade-offs. With [[write-through|write-through]], every write updates the cache and the database together. With [[write-back|write-back]], writes land in the cache and reach the database later, which is fast but can lose data. With [[write-around|write-around]], writes skip the cache entirely, and a [[read-through cache|read-through]] loads misses on the app’s behalf.',
    },
    {
      kind: 'decision',
      title: 'Which caching pattern fits?',
      caption: 'Answer two questions about your data.',
      tree: whichPattern,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real caches also handle serialization, memory limits and replication between cache nodes. Replication comes back in Module 4.',
    },
    { kind: 'heading', text: 'Choosing what to evict' },
    {
      kind: 'prose',
      md: 'A cache is small on purpose, so when it fills up, something must go. That choice is the [[eviction|eviction]] policy, and the three classics differ in what they remember about each entry.',
    },
    {
      kind: 'table',
      columns: ['Policy', 'Evicts', 'Works well when'],
      rows: [
        ['[[LRU|lru]] (least recently used)', 'The entry unused for the longest time', 'Recent use predicts the next use, as in most web traffic. The common default.'],
        ['[[LFU|lfu]] (least frequently used)', 'The entry used the fewest times', 'Popularity stays stable over time, such as a shop’s best sellers.'],
        ['[[FIFO|fifo]] (first in, first out)', 'The oldest entry, however popular', 'Simplicity matters more than hit ratio. It evicts hot entries too.'],
      ],
      caption: 'Most caches also drop entries when their TTL runs out, whatever the policy.',
    },
    { kind: 'heading', text: 'When caches go wrong' },
    {
      kind: 'prose',
      md: '**Stampedes.** When a popular key expires, every request for it misses at once, and all of them hit the database together. A [[cache stampede|cache-stampede]] can knock over the very database the cache was protecting. The fixes: let one request rebuild the value while the others wait ([[request coalescing|request-coalescing]]), add random [[jitter|jitter]] to TTLs, or refresh hot keys before they expire.',
    },
    {
      kind: 'prose',
      md: '**Cold starts.** A freshly restarted cache is empty, so every read misses. After a deploy, a [[cold cache|cold-cache]] can send the full read load to the database at once, so warm it up first or shift traffic over gradually.',
    },
    {
      kind: 'prose',
      md: '**Hot keys and stale reads.** A single [[hot key|hot-key]], like a celebrity’s profile, can overload one cache node. And a cached copy is never the [[source of truth|source-of-truth]]: if you cannot afford [[stale data|stale-data]] for a value, such as an account balance, read it from the database.',
    }
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'cache',
      preset: { capacity: 50, policy: 'LRU', skew: 1.1, ttlSec: 30 },
      intro:
        'The simulator replays a minute of Snapgram profile views through a cache-aside layer. It starts with room for 50 profiles, least recently used eviction, a 30-second TTL and skewed traffic. Watch the hit ratio climb as the cache warms up, then try the first challenge: shrink the cache until the database load doubles.',
    },
  ],
  tradeoffs: {
    caption: 'Five ways to wire a cache, compared on freshness, write speed, risk of losing data and complexity.',
    rows: [
      {
        option: 'Cache-aside',
        goodAt: 'Simple, and caches only what is read. If the cache fails, reads get slower, not wrong.',
        badAt: 'The first read of every key misses, and data can be stale until the TTL runs out or the key is deleted.',
        pickWhen: 'Data is read far more than it is written. The default choice.',
      },
      {
        option: 'Read-through',
        goodAt: 'App code only talks to the cache, and the loading logic lives in one place.',
        badAt: 'Needs a cache or library that supports loaders. First reads still miss.',
        pickWhen: 'Your cache library offers it and many services share the same loading logic.',
      },
      {
        option: 'Write-through',
        goodAt: 'The cache is fresh right after every write.',
        badAt: 'Every write pays for two stores, and data that is never read still fills the cache.',
        pickWhen: 'Data is read soon after it is written and must not be stale.',
      },
      {
        option: 'Write-back',
        goodAt: 'Very fast writes, and many updates become one database write.',
        badAt: 'Writes still in the cache are lost if a cache node crashes. Harder to reason about.',
        pickWhen: 'High-volume writes you can afford to lose a little of, such as view counters.',
      },
      {
        option: 'Write-around',
        goodAt: 'Rarely-read data never pushes useful entries out of the cache.',
        badAt: 'A read right after a write misses, or sees stale data unless the key is deleted.',
        pickWhen: 'Data is written often and read rarely, such as logs.',
      },
    ],
  },
  realWorld: {
    title: 'Facebook’s look-aside cache',
    body: 'In “Scaling Memcache at Facebook” (2013), Facebook engineers describe the caching layer in front of their databases. They use Memcached as a demand-filled look-aside cache, which is cache-aside under another name: on a read, the web server asks the cache first and, on a miss, fetches from the database and fills the cache.\n\nOn a write, the web server updates the database and then deletes the key from the cache instead of updating it, because a delete can safely be repeated. The paper also introduces leases, which stop stale values from being written back into the cache and tame [[thundering herds|cache-stampede]] when a hot key goes missing. It is the same design as this lesson, at billions of requests per second.',
    sourceUrl: 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala',
    sourceLabel: 'Nishtala et al., “Scaling Memcache at Facebook,” USENIX NSDI 2013',
  },
  interview: {
    whenToMention:
      'As soon as your estimates show a read-heavy workload, usually right after you sketch the high-level design. Point to the data that is read often and changes rarely, then say three things: what you cache, how it stays fresh, and what happens when the cache fails.',
    sayItLikeThis: [
      'We estimated that reads outnumber writes about 100 to 1, and profiles rarely change. So I’ll put a cache-aside layer in front of the profile database with a short TTL, and invalidate the key on every update. If the product needs fresher data, we can lower the TTL or switch to write-through.',
      'The working set is a few thousand popular profiles, so a modest cache should hit more than 90% of the time. At 100,000 reads per second, that leaves the database about 10,000.',
      'If the cache cluster restarts, I don’t want the database to take the full load cold, so I’d warm the cache before shifting traffic and keep rate limiting in front of the database.',
    ],
    followUps: [
      {
        q: 'What happens if the cache cluster goes down?',
        a: 'The database suddenly takes the full load, often ten times what it normally sees. Protect it with [[rate limiting|rate-limiting]] and [[read replicas|read-replica]], and bring the cache back with a gradual warm-up rather than all at once. If some data can be slightly stale, a small in-memory cache on each app server softens the blow.',
      },
      {
        q: 'How do you stop a stampede when a popular key expires?',
        a: 'Let one request rebuild the value while the others wait for it, add random jitter to TTLs so hot keys do not expire together, or refresh hot keys shortly before they expire. Facebook’s leases are a production version of the first idea.',
      },
      {
        q: 'How big should the cache be?',
        a: 'Estimate the [[working set|working-set]]: the data actually read in a typical period. Often the hottest 20% of data serves most reads, so size for that, measure the hit ratio, and grow the cache if misses stay high.',
      },
    ],
    redFlags: [
      'Adding a cache without saying how it is invalidated.',
      'Treating the cache as the source of truth, so a restart loses data.',
      'Caching everything, including data that is written more often than it is read.',
      'No plan for a cold cache or a cache outage.',
    ],
  },
  mistakes: [
    '**Caching everything.** Data that is rarely read or often written wastes memory and pushes useful entries out.',
    '**Forgetting invalidation.** Without a delete on every write, users see old data until the entry happens to expire or be evicted.',
    '**No TTL.** A missed invalidation then lives forever. A TTL caps how stale anything can get.',
    '**Ignoring the cold cache after a deploy.** An empty cache sends the full read load to the database at the worst moment.',
    '**Treating the cache as the source of truth.** Caches evict and restart; the database must hold the real data.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'In cache-aside, what does the app do on a cache miss?',
      options: [
        {
          text: 'Reads the database, stores the result in the cache, then responds',
          correct: true,
          why: 'That is the whole pattern: the app fills the cache on demand, so only data that is actually read gets cached.',
        },
        {
          text: 'Returns an error and asks the client to retry',
          correct: false,
          why: 'A miss is normal, not a failure. The data still exists in the database.',
        },
        {
          text: 'Waits for the cache to load the data from the database',
          correct: false,
          why: 'That describes read-through, where the cache loads misses itself. In cache-aside, the app does it.',
        },
        {
          text: 'Writes the data to the database, then to the cache',
          correct: false,
          why: 'A read never needs to write to the database. Writing to both stores is write-through, which is about writes.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram serves 50,000 profile reads per second with a 95% hit ratio. How many reads per second reach the database?',
      answer: 2500,
      unit: 'reads per second',
      tolerance: 1.1,
      solution: [
        'Misses are 100% − 95% = 5% of reads.',
        '50,000 × 0.05 = 2,500 reads per second.',
        'Raising the hit ratio to 99% would cut that to 500: small gains near the top matter a lot.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are good candidates for caching?',
      options: [
        {
          text: 'Profile pages that are read thousands of times between updates',
          correct: true,
          why: 'Read-heavy data that rarely changes is exactly what caches are for.',
        },
        {
          text: 'The result of an expensive query that many users run, like a trending list',
          correct: true,
          why: 'Computing it once and serving it many times saves real work, as long as a little staleness is fine.',
        },
        {
          text: 'An account balance shown just before a withdrawal',
          correct: false,
          why: 'Correctness matters more than speed here. Read it from the source of truth.',
        },
        {
          text: 'A one-time login code that is checked once and then thrown away',
          correct: false,
          why: 'It is read once, so the cache would never get a hit, only extra work.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a cache-aside read that misses in order.',
      items: [
        'The app asks the cache for the key',
        'The cache reports a miss',
        'The app reads the value from the database',
        'The app stores the value in the cache with a TTL',
        'The app returns the value to the client',
      ],
      why: 'The app goes to the database only after a miss, and it fills the cache before responding so the next read is a hit.',
    },
    {
      kind: 'bottleneck',
      prompt:
        'It is 9 a.m. and Snapgram has just deployed, which restarted the cache cluster. Traffic is 50,000 profile reads per second. Which component breaks first?',
      diagram: coldStart,
      answerNodeId: 'db',
      why: 'With an empty cache every read misses, so all 50,000 reads per second land on a database sized for about 5,000. Warm the cache before moving traffic over, or let traffic in gradually.',
      others: {
        users: 'Users only send requests. They do not run out of capacity.',
        app: 'App servers do little work per request and are easy to add. They mostly wait on the cache and the database.',
        cache: 'An empty cache is still fast; it just has nothing to return. Its misses push the load onto the database.',
      },
    },
  ],
  takeaways: [
    'Caches trade freshness for speed.',
    'Cache-aside is the default for read-heavy data.',
    'Every cache needs an invalidation plan and a plan for when it fails.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Early refresh.** Instead of waiting for a hot key to expire, refresh it a little early. A neat version lets each read decide at random whether to refresh, with the chance rising as expiry approaches, so one request refreshes while the rest keep using the cached copy.',
    },
    {
      kind: 'prose',
      md: '**Hot keys at large scale.** When one key is too hot for a single cache node, keep copies of it on several nodes and spread reads across them, or let each app server hold the hottest few keys in its own memory for a second or two.',
    },
    {
      kind: 'prose',
      md: '**A subtle race.** A slow reader can fetch an old value from the database and put it back into the cache just after a writer deleted the key. Short TTLs limit the damage; Facebook’s leases prevent it by refusing to store values from readers whose lease was invalidated.',
    },
  ],
  flashcards: [
    { front: 'What is a cache?', back: 'A small, fast store that keeps copies of data you will probably need again, so you skip the slow trip.' },
    { front: 'Cache-aside: what happens on a miss?', back: 'The app reads the database, stores the result in the cache with a TTL, and responds.' },
    { front: 'How do you keep a cache-aside cache fresh when data changes?', back: 'Write to the database, then delete the cache key. A TTL catches anything you miss.' },
    { front: 'With a 90% hit ratio and 10,000 reads per second, how many reads reach the database?', back: '1,000 per second. Only misses reach the database.' },
    { front: 'LRU, LFU and FIFO: what does each evict?', back: 'LRU evicts the least recently used entry, LFU the least frequently used, and FIFO the oldest, however popular.' },
    {
      front: 'What is a cache stampede, and two ways to prevent it?',
      back: 'Many requests miss the same expired hot key at once and all hit the database. Let one request rebuild it while others wait, or add jitter to TTLs.',
    },
    { front: 'What is the main risk of write-back caching?', back: 'Writes wait in the cache before reaching the database, so a crash can lose them.' },
  ],
  related: ['cdns', 'databases-101', 'replication', 'consistent-hashing', 'rate-limiting'],
  glossaryTerms: [
    'cache',
    'cache-aside',
    'cache-key',
    'cache-hit',
    'cache-miss',
    'hit-ratio',
    'ttl',
    'latency',
    'database',
    'browser-cache',
    'cdn',
    'redis',
    'memcached',
    'cache-invalidation',
    'write-through',
    'write-back',
    'write-around',
    'read-through',
    'eviction',
    'lru',
    'lfu',
    'fifo',
    'cache-stampede',
    'request-coalescing',
    'jitter',
    'cold-cache',
    'hot-key',
    'source-of-truth',
    'stale-data',
    'rate-limiting',
    'read-replica',
    'working-set',
  ],
};

export default lesson;
