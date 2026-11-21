import type { DiagramSpec, Problem } from '../types';

/** v1: one app server and one database; auto-increment numbers written in base 62. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: 'browser or app', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'links table', x: 2, y: 0 },
    { id: 'dest', type: 'external', label: 'Original site', x: 0, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'users-dest', from: 'users', to: 'dest', kind: 'sync', label: 'follows Location' },
  ],
  steps: [
    {
      caption:
        'To create a link, the **app server** inserts the long URL into the **database**, whose [[auto-increment|auto-increment]] column numbers the row: say 1,000,000. Written in base 62 (the digits, then a to z, then A to Z), that number is `4c92`, so the short link is `tiny.example/4c92`.',
      flow: ['users-app', 'app-db', '<app-db', '<users-app'],
      notes: [{ target: 'app', text: '1,000,000 → 4c92' }],
    },
    {
      caption:
        'Someone opens `tiny.example/4c92`. The app server decodes `4c92` back to 1,000,000, reads that row by its key, and answers with the [[status code|status-code]] `302 Found` and a `Location` header holding the long URL.',
      flow: ['users-app', 'app-db', '<app-db', { edge: 'users-app', reverse: true, tag: '302' }],
    },
    {
      caption:
        'The browser follows `Location` to the **original site**. For the shortener, the click cost one database read and a few hundred bytes of response.',
      flow: ['users-dest'],
    },
  ],
};

/** v2: reads and writes split, a cache on the read path, blocks of numbers on the write path. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes: [
    { id: 'dest', type: 'external', label: 'Original site', x: 0, y: 0 },
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'Redis, LRU', x: 2, y: 0 },
    { id: 'redirect', type: 'service', label: 'Redirect service', sublabel: 'many copies', x: 2, y: 1 },
    { id: 'store', type: 'nosqlDb', label: 'Link store', sublabel: 'sharded by code', x: 3, y: 1 },
    { id: 'create', type: 'service', label: 'Create service', x: 2, y: 2 },
    { id: 'ids', type: 'sqlDb', label: 'ID counter', sublabel: 'hands out blocks', x: 2, y: 3 },
  ],
  edges: [
    { id: 'users-dest', from: 'users', to: 'dest', kind: 'sync' },
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-redirect', from: 'lb', to: 'redirect', kind: 'sync', label: 'clicks' },
    { id: 'lb-create', from: 'lb', to: 'create', kind: 'sync' },
    { id: 'redirect-cache', from: 'redirect', to: 'cache', kind: 'sync' },
    { id: 'redirect-store', from: 'redirect', to: 'store', kind: 'sync', label: 'misses' },
    { id: 'create-store', from: 'create', to: 'store', kind: 'sync' },
    { id: 'create-ids', from: 'create', to: 'ids', kind: 'sync' },
  ],
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 1, y: 0 },
      dest: { x: 2, y: 0 },
      lb: { x: 1, y: 1 },
      cache: { x: 0, y: 2 },
      redirect: { x: 1, y: 2 },
      create: { x: 2, y: 2 },
      store: { x: 1, y: 3 },
      ids: { x: 2, y: 3 },
    },
    sides: { 'lb-create': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Clicks and creates now go to separate services behind a [[load balancer|load-balancer]], so each scales on its own: about 20,000 redirects a second at peak against about 200 creates (ballpark). To start, each server of the **create service** asks the **ID counter** for a block of 10,000 numbers.',
      flow: ['create-ids', '<create-ids'],
      notes: [{ target: 'ids', text: 'next 10,000' }],
    },
    {
      caption:
        'Each create spends the next number from its block, with no network call, and writes the code and its long URL to the **link store**. The store is split into shards by a hash of the code ([[sharding|sharding]]), since about 18 TB (ballpark) is too much for one machine to hold and serve comfortably.',
      flow: ['users-lb', 'lb-create', 'create-store', '<create-store', '<lb-create', '<users-lb'],
    },
    {
      caption:
        'A click goes to the **redirect service**, which checks the **cache** first. A small share of links gets most of the clicks, so most lookups are [[cache hits|cache-hit]], answered in about a millisecond (ballpark).',
      flow: ['users-lb', 'lb-redirect', 'redirect-cache', { edge: 'redirect-cache', reverse: true, tag: 'hit' }, '<lb-redirect', { edge: 'users-lb', reverse: true, tag: '302' }],
    },
    {
      caption:
        'On a miss, the service reads the **link store** and copies the answer into the cache with a [[time to live|ttl]] (TTL) of a day: the [[cache-aside|cache-aside]] pattern. If 80 to 90% of lookups hit (ballpark), the store sees only 2,000 to 4,000 reads a second at peak.',
      flow: ['users-lb', 'lb-redirect', { edge: 'redirect-cache', tag: 'miss' }, 'redirect-store', '<redirect-store', 'redirect-cache'],
      notes: [{ target: 'store', text: 'read by code' }],
    },
    {
      caption:
        'The browser follows the `Location` header to the **original site**. Redirect servers keep nothing of their own ([[stateless|stateless]]), so handling more clicks means starting more copies.',
      flow: ['users-dest'],
    },
  ],
};

/** v3: click events go to a stream and are counted in batches, off the redirect path. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Visitors', x: 0, y: 0 },
    { id: 'redirect', type: 'service', label: 'Redirect service', x: 1, y: 0 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 2, y: 0 },
    { id: 'stream', type: 'stream', label: 'Click stream', sublabel: 'kept 7 days', x: 1, y: 1 },
    { id: 'counter', type: 'worker', label: 'Click counter', x: 2, y: 1 },
    { id: 'counts', type: 'nosqlDb', label: 'Click counts', sublabel: 'per link, per minute', x: 3, y: 1 },
    { id: 'owner', type: 'client', label: 'Link owner', x: 0, y: 2 },
    { id: 'stats', type: 'service', label: 'Stats API', x: 1, y: 2 },
  ],
  edges: [
    { id: 'users-redirect', from: 'users', to: 'redirect', kind: 'sync' },
    { id: 'redirect-cache', from: 'redirect', to: 'cache', kind: 'sync' },
    { id: 'redirect-stream', from: 'redirect', to: 'stream', kind: 'async', label: 'click event' },
    { id: 'stream-counter', from: 'stream', to: 'counter', kind: 'async', label: 'batches' },
    { id: 'counter-counts', from: 'counter', to: 'counts', kind: 'sync' },
    { id: 'owner-stats', from: 'owner', to: 'stats', kind: 'sync' },
    { id: 'stats-counts', from: 'stats', to: 'counts', kind: 'sync' },
  ],
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 1, y: 0 },
      owner: { x: 2, y: 0 },
      cache: { x: 0, y: 1 },
      redirect: { x: 1, y: 1 },
      stats: { x: 2, y: 1 },
      stream: { x: 1, y: 2 },
      counter: { x: 1, y: 3 },
      counts: { x: 2, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'After sending the redirect, the **redirect service** appends a small click event (code, time, country, referring site) to the **click stream** and moves on. It never waits for analytics, so a slow analytics system can’t slow a click.',
      flow: ['users-redirect', 'redirect-cache', '<redirect-cache', { edge: 'users-redirect', reverse: true, tag: '302' }, 'redirect-stream'],
      notes: [{ target: 'stream', text: '10,000 events/s' }],
    },
    {
      caption:
        'The **click counter** reads events in batches, adds them up per link per minute in memory, and writes one row per link per minute. A viral link’s 5,000 clicks in a minute become a single write.',
      flow: ['stream-counter', 'counter-counts'],
      notes: [{ target: 'counter', text: 'sums per minute' }],
    },
    {
      caption:
        'A link owner opens the stats page. The **stats API** reads that link’s rows for the chosen dates from **click counts**: one partition, already sorted by time.',
      flow: ['owner-stats', 'stats-counts', '<stats-counts', '<owner-stats'],
    },
    {
      caption:
        'If the click counter crashes, events simply wait in the stream, which keeps them for about seven days (ballpark). When it restarts, it resumes from its last saved [[offset|offset]], so counts arrive late but none are lost.',
      fail: ['counter'],
      flow: ['redirect-stream'],
      notes: [{ target: 'stream', text: 'events wait' }],
    },
  ],
};

/** v4: what each failure does to redirects. One shard of the store is drawn. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'several nodes', x: 2, y: 0 },
    { id: 'redirect', type: 'service', label: 'Redirect service', sublabel: 'three zones', x: 2, y: 1 },
    { id: 'stream', type: 'stream', label: 'Click stream', x: 2, y: 2 },
    { id: 'leader', type: 'nosqlDb', label: 'Store leader', sublabel: 'takes writes', x: 3, y: 0 },
    { id: 'follower', type: 'nosqlDb', label: 'Store follower', sublabel: 'serves reads', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-redirect', from: 'lb', to: 'redirect', kind: 'sync' },
    { id: 'redirect-cache', from: 'redirect', to: 'cache', kind: 'sync' },
    { id: 'redirect-follower', from: 'redirect', to: 'follower', kind: 'sync', label: 'misses' },
    { id: 'redirect-stream', from: 'redirect', to: 'stream', kind: 'async', label: 'clicks' },
    { id: 'leader-follower', from: 'leader', to: 'follower', kind: 'replication' },
  ],
  narrow: {
    grid: { cols: 3, rows: 5 },
    positions: {
      users: { x: 1, y: 0 },
      lb: { x: 1, y: 1 },
      cache: { x: 0, y: 2 },
      redirect: { x: 1, y: 2 },
      leader: { x: 0, y: 3 },
      follower: { x: 1, y: 3 },
      stream: { x: 2, y: 4 },
    },
    sides: { 'redirect-stream': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Every tier runs several copies across three [[availability zones|availability-zone]]. Each shard of the store has a **store leader** that takes writes and [[followers|follower]] that copy them and serve reads; one follower is drawn.',
      focus: ['leader', 'leader-follower'],
      flow: ['users-lb', 'lb-redirect', { edge: 'redirect-cache', tag: 'miss' }, 'redirect-follower', '<redirect-follower', '<lb-redirect', '<users-lb'],
    },
    {
      caption:
        'The cache goes down, and every lookup lands on the followers: up to 20,000 reads a second at peak (ballpark). Followers sized for that keep redirects working, only slower, and [[request coalescing|request-coalescing]] turns a burst of misses for one viral code into a single read.',
      fail: ['cache'],
      flow: ['users-lb', 'lb-redirect', 'redirect-follower', '<redirect-follower', '<lb-redirect', '<users-lb'],
      notes: [{ target: 'follower', text: 'every read', tone: 'alert' }],
    },
    {
      caption:
        'The store leader dies. Redirects carry on, because they read only from followers, and within seconds a follower is promoted to leader ([[failover|failover]]). Creating links pauses for those seconds; the create service retries, so users see a short delay at worst.',
      fail: ['leader'],
      flow: ['users-lb', 'lb-redirect', 'redirect-cache', '<redirect-cache', '<lb-redirect', '<users-lb'],
      notes: [{ target: 'follower', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        'The click stream goes down. The redirect service still answers every click: it holds events in a small in-memory buffer and drops the oldest if the outage outlasts it. Analytics get a gap, and that is the right trade, since a click counted late or not at all beats a link that doesn’t open.',
      fail: ['stream'],
      flow: ['users-lb', 'lb-redirect', 'redirect-cache', '<redirect-cache', '<lb-redirect', { edge: 'users-lb', reverse: true, tag: '302' }],
      notes: [{ target: 'redirect', text: 'buffering events' }],
    },
  ],
};

const problem: Problem = {
  id: 'url-shortener',
  title: 'URL shortener',
  tier: 1,
  flagship: true,
  minutes: 45,
  prompt:
    'Design a URL shortener like TinyURL or Bitly. A user pastes a long web address, a [[uniform resource locator|url]] (URL), and gets back a short link; anyone who opens the short link lands on the original page.',
  concepts: ['back-of-the-envelope', 'unique-ids', 'http-essentials', 'caching', 'sql-vs-nosql', 'sharding', 'queues-and-streams'],
  hints: [
    'Start with the [[read/write ratio|read-write-ratio]]: how often is a link opened compared with how often links are created? That one number tells you which path deserves most of your design.',
    'Every link needs a short code that never repeats, made by many servers at once. Think about where unique identifiers (IDs) can come from without a round trip per link, and how to write a big number in very few characters.',
    'One shape that works: create servers take blocks of numbers from a counter and write each as seven base-62 characters; a [[key-value store|key-value-store]] sharded by code maps each code to its long URL; redirect servers check a cache first and answer `302`; and every click goes onto a stream that a separate job counts.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many links are created each day, and how often is each one opened?',
      why: 'This sets the scale and the read/write ratio. Assume about 10 million new links and a billion clicks a day (ballpark): reads outnumber writes 100 to 1, so the redirect path gets the cache and most of your time.',
    },
    {
      q: 'Do link owners need click analytics, and how fresh must they be?',
      why: 'If owners need counts, every click must reach your servers, which rules out letting browsers remember a permanent redirect. If a few minutes of delay is fine, counting moves off the redirect path into a stream and a batch job.',
    },
    {
      q: 'Can users choose a custom alias, change where a link points, or set an expiry date?',
      why: 'Custom aliases need a uniqueness check when they are saved. Changing or expiring links means the decision is made on every click and cached copies must be cleared, which again favors a temporary redirect.',
    },
    {
      q: 'How long do links live, and how short must the code be?',
      why: 'Lifetime times creation rate gives the number of codes you need: about 36 billion over ten years here (ballpark). That fixes the code length at seven characters and the storage plan at tens of terabytes.',
    },
    {
      q: 'Can anyone create links, or only signed-in users and partners?',
      why: 'Anonymous creation invites spam and phishing, which calls for [[rate limits|rate-limiting]] per [[Internet Protocol (IP) address|ip-address]] and a link-scanning step. Partners who create links in bulk need an application programming interface (API) with keys.',
    },
    {
      q: 'Must codes be hard to guess?',
      why: 'If people shorten links to private documents, sequential codes would let anyone walk through every link ever made. That rules out using raw counter values as codes, or adds a scrambling step before encoding.',
    },
  ],
  requirements: {
    functional: [
      'Create a short link for a long URL and return a seven-character code, such as `tiny.example/aZ3kP9x`.',
      'Opening a short link redirects the browser to the long URL.',
      'Optionally choose a custom alias, such as `tiny.example/spring-sale`, or an expiry date; expired or disabled links stop redirecting.',
      'Show a link’s owner its clicks over time, by day, country and referring site.',
    ],
    nonFunctional: [
      'Fast redirects: about 10 ms at the server for 99% of clicks (ballpark), because a redirect sits in front of every page it points to.',
      'Highly available redirects, around 99.99% (a ballpark target): a broken short link breaks every email, page and poster that uses it. Creating links can tolerate a little more downtime.',
      'Durable: once created, a code is never lost and never points somewhere else.',
      'Analytics may lag a few minutes and be very slightly approximate, but must never slow a redirect.',
      'Scale: about 10 million new links and 1 billion redirects a day (ballpark), kept for ten years.',
    ],
    outOfScope: [
      'Accounts, login and billing: assume each create request arrives with a user identifier or an API key.',
      'Deciding whether a link is malicious, beyond calling an outside scanning service.',
      'Marketing extras such as A/B tests, link-in-bio pages and campaign dashboards.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'People who open or create a short link each day', value: '100 million (ballpark)' },
      { label: 'Requests per person per day', value: '10, almost all of them clicks' },
      { label: 'Clicks per new link', value: 'about 100, so 100 reads for every write' },
      { label: 'Bytes stored per link', value: 'about 500: the long URL, code, owner, dates and index overhead' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'How long links are kept', value: '10 years' },
    ],
    steps: [
      { label: 'Redirects per second', math: '10⁸ people × 10 ≈ 10⁹ clicks a day; 10⁹ ÷ 10⁵ seconds a day', result: '≈ 10,000 a second, 20,000 at peak' },
      { label: 'New links per second', math: '10⁹ requests ÷ 101 ≈ 10⁷ links a day; 10⁷ ÷ 10⁵ seconds', result: '≈ 100 a second, 200 at peak' },
      { label: 'Storage over ten years', math: '10⁷ links × 500 bytes ≈ 5 GB a day; × 365 ≈ 1.8 TB a year; × 10 years', result: '≈ 18 TB, so the store is sharded' },
      { label: 'Code length', math: '10⁷ × 365 × 10 ≈ 3.7 × 10¹⁰ codes; 62⁶ ≈ 5.7 × 10¹⁰ and 62⁷ ≈ 3.5 × 10¹²', result: '7 characters, with about 100× headroom' },
      { label: 'Cache size', math: '20% of a day’s 10⁹ reads × 500 bytes', result: '≈ 100 GB at most: a few cache nodes' },
      { label: 'Outgoing bandwidth', math: '20,000 redirects a second × 500 bytes', result: '≈ 10 MB a second at peak: small' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 10, readsPerWrite: 100, objectBytes: 500, peakFactor: 2, retentionYears: 10 },
  },
  api: [
    {
      signature: 'POST /v1/links  { longUrl, alias?, expiresAt? }  →  201 { code, shortUrl }',
      description:
        'Creates a link. It needs a user token or an API key and is rate-limited per caller. It returns `409 Conflict` if the alias is taken, and an [[idempotency key|idempotency-key]] header makes a retried create return the same code instead of a second one.',
    },
    {
      signature: 'GET /{code}  →  302 Found, Location: <long URL>',
      description:
        'The redirect itself, served by the redirect service. Unknown codes get `404 Not Found` and expired or disabled ones `410 Gone`; it never waits on analytics.',
    },
    {
      signature: 'GET /v1/links/{code}/stats?from=…&to=…  →  200 { days: [{ date, clicks, countries, referrers }] }',
      description: 'Click counts for the link’s owner, read from the analytics store. They can be a minute or two behind (ballpark).',
    },
    {
      signature: 'DELETE /v1/links/{code}  →  204 No Content',
      description: 'Disables a link. The store marks it disabled and its cache entry is deleted, so the next click gets `410 Gone`.',
    },
  ],
  dataModel: [
    {
      entity: 'Link',
      fields: ['code: 7 characters (partition key)', 'long_url: up to about 2,000 characters', 'owner_id', 'created_at', 'expires_at (or null)', 'disabled: boolean'],
      store: 'Key-value store such as DynamoDB or Cassandra, partitioned by code, three copies of each row',
      why: 'Every redirect is a lookup by one key, with no joins, and the table grows to tens of billions of rows, so a store that partitions by key and adds machines easily fits best. A conditional write ([[compare-and-set|compare-and-set]]: insert only if the code is new) keeps custom aliases unique. A sharded relational database would also work; the access pattern matters more than the brand.',
    },
    {
      entity: 'Links by owner',
      fields: ['owner_id (partition key)', 'created_at (sort key)', 'code'],
      store: 'The same store, as a second table',
      why: 'The main table is keyed by code, so the “my links” page needs a copy keyed by owner. It is written once, when the link is created, so keeping two copies is cheap.',
    },
    {
      entity: 'Number blocks',
      fields: ['name: "link-numbers"', 'next_block_start: integer'],
      store: 'A small, strongly consistent store such as etcd, or one row in a replicated relational database',
      why: 'It hands each create server a block of 10,000 numbers every 15 minutes or so (ballpark), and must never hand out the same block twice. That calls for strong consistency, not speed.',
    },
    {
      entity: 'Click event',
      fields: ['code', 'timestamp', 'country', 'referrer', 'browser_family'],
      store: 'Event stream such as Kafka, partitioned randomly, kept about 7 days (ballpark)',
      why: 'Clicks are append-only and arrive at about 10,000 a second, roughly 200 GB a day at 200 bytes each (ballpark). An [[event stream|event-stream]] absorbs bursts and lets the counting job replay after a bug.',
    },
    {
      entity: 'Click counts',
      fields: ['code (partition key)', 'minute (sort key)', 'clicks', 'clicks_by_country: map'],
      store: 'Wide-column store such as Cassandra, or a column-oriented analytics database',
      why: 'Owners ask for one link’s clicks over a date range: one partition, read in time order. Summing per minute turns a viral link’s thousands of clicks into one row a minute.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Turn a long URL into a short code and send each click to the right page, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One app server and one relational database are plenty for the first few million links. The auto-increment column makes every number unique, and base 62 makes it short. It stops working at scale: every click is a database read, and the only counter lives on one machine.',
    },
    {
      title: 'v2: It scales',
      solves:
        'About 20,000 redirects a second at peak, a hundred times the create rate, and about 18 TB of links over ten years (ballpark): more than one server or one database can handle.',
      diagram: v2,
      explanation:
        'Reads and writes now scale separately, and the cache takes most of the read load off the store. Blocks of numbers keep the counter off the write path, and because numbers never repeat, codes need no uniqueness check. A create server that crashes wastes at most the rest of one block, a rounding error against 3.5 trillion possible codes.',
    },
    {
      title: 'v3: Clicks counted off the hot path',
      solves: 'Owners want click counts, but a database write on every click would slow each redirect and pound one row whenever a link goes viral.',
      diagram: v3,
      explanation:
        'The redirect’s only new work is one append, done after the response has gone out. Counts lag by a minute or two (ballpark), which owners accept, and redirects never wait for them. Because the stream keeps raw events for days, a bug in the counter can be fixed and the counts rebuilt by replaying.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead cache, database leader or stream must not break redirects, because a broken short link breaks every page, email and poster that uses it.',
      diagram: v4,
      explanation:
        'Each dependency fails toward keeping redirects working: a redirect needs only the cache or a follower, while creation and analytics can pause without anyone clicking a link noticing. A second region with its own redirect servers, caches and followers covers a regional outage, with creation paused there until the home region returns.',
    },
  ],
  deepDives: [
    {
      title: 'Generating short codes',
      problem:
        'Every link needs a code that is short, never reused, and made by many create servers at once without them talking on every request. If links can point at private documents, codes also shouldn’t be guessable from one another.',
      options: {
        caption: 'Four ways to make the code',
        rows: [
          {
            option: 'Hash the long URL',
            goodAt: 'No coordination, and the same URL can map to the same code, so repeats cost nothing.',
            badAt:
              'Seven characters of a [[hash function|hash-function]] collide as often as random codes, so every insert still needs a check and a retry. Users who shorten the same URL also end up sharing one link and its stats.',
            pickWhen: 'Reusing one code per URL matters more than per-user links.',
          },
          {
            option: 'Random code, insert if absent',
            goodAt:
              'No coordination, and codes can’t be guessed. With about 36 billion of 3.5 trillion codes used after ten years, about 1 insert in 100 collides even then, and simply tries again.',
            badAt: 'Every create needs a conditional write, and collisions slowly grow as the space fills.',
            pickWhen: 'Codes must be unguessable and you’d rather not run a counter.',
          },
          {
            option: 'Counter in blocks, base 62',
            goodAt:
              'Unique by construction, so no checks or retries. Each create server takes 10,000 numbers at a time, and seven characters last for centuries at 10 million links a day.',
            badAt: 'Consecutive numbers give consecutive codes, so anyone can walk through every link unless you scramble them. A crashed server wastes the rest of its block.',
            pickWhen: 'The default: high volume, guaranteed uniqueness, no retries.',
          },
          {
            option: 'Snowflake-style ID',
            goodAt: 'Unique with no shared counter at all, and sorted by time.',
            badAt:
              'A 64-bit [[Snowflake ID|snowflake-id]] needs 11 base-62 characters, too long for a short link; a 128-bit universally unique identifier ([[UUID|uuid]]) needs 22.',
            pickWhen: 'Never for the code itself; fine as an internal row key.',
          },
        ],
      },
      recommendation:
        'Use a counter handed out in blocks, encoded in base 62, and start it at 62⁶ (about 57 billion) so every code is exactly seven characters. If codes must not be guessable, pass each number through a reversible scramble keyed with a secret, such as a small block cipher, before encoding: codes look random but still never collide. Custom aliases skip the counter, use the insert-if-absent write, and must be at least eight characters, so they can never clash with a generated code.',
    },
    {
      title: '301 or 302: which redirect?',
      problem:
        'Both status codes send the browser to the long URL, but they make different promises. A permanent redirect lets browsers remember it and skip you next time; a temporary one sends every click back to you. The choice decides your load, your analytics and whether you can ever change or kill a link.',
      options: {
        caption: 'The redirect decides who sees each click',
        rows: [
          {
            option: '`301 Moved Permanently`',
            goodAt:
              'Browsers may keep it in the [[browser cache|browser-cache]] and go straight to the destination on repeat clicks, so you serve less traffic and repeat clicks are faster.',
            badAt:
              'You stop seeing repeat clicks, and you can’t change or disable the link for browsers that cached it, which hurts when a link turns out to be phishing.',
            pickWhen: 'Links never change, nobody needs click counts, and saving load matters most.',
          },
          {
            option: '`302 Found` (or `307`)',
            goodAt: 'Not cached unless you allow it, so every click reaches you: complete analytics, and edits or takedowns work at once.',
            badAt: 'Every click costs you a request, and repeat visitors wait for a round trip to you each time.',
            pickWhen: 'Analytics, editing, expiry or takedowns are part of the product: the usual case.',
          },
          {
            option: 'Either, with an explicit max-age',
            goodAt:
              'The [[Cache-Control header|cache-control]] sets the trade-off directly: for example, browsers may reuse the answer for five minutes, so takedowns still land within minutes.',
            badAt: 'Clicks inside that window go uncounted, and a long-lived 301 can’t be called back once browsers have it.',
            pickWhen: 'Load matters, but takedowns must still land within minutes.',
          },
        ],
      },
      recommendation:
        'Answer `302 Found` by default, because analytics and the power to disable a bad link are much of what a shortener is for, and send an explicit `Cache-Control` header so no browser or proxy keeps the answer longer than you intend. Use a 301 with a bounded max-age only if the product promises permanent links without stats. Say the trade-off out loud: a 302 spends one request per click to buy complete analytics and instant takedowns.',
    },
    {
      title: 'Keeping redirects fast',
      problem:
        'At about 20,000 redirects a second at peak (ballpark), and far more when a link goes viral, reading the store on every click wastes money and adds latency. Clicks are very uneven: a small share of links gets most of them, which is exactly what a cache is for.',
      options: {
        caption: 'Where to keep hot links',
        rows: [
          {
            option: 'Shared cache, such as Redis or Memcached',
            goodAt: 'One copy of each hot link for every redirect server; about 100 GB (ballpark) holds some 200 million links, spread over a few nodes.',
            badAt: 'A network hop per lookup, and a viral link becomes a [[hot key|hot-key]] on one cache node.',
            pickWhen: 'The default home for the bulk of lookups.',
          },
          {
            option: 'In-process cache on each redirect server',
            goodAt: 'No network hop at all: microseconds for the hottest few thousand links.',
            badAt: 'Every server holds its own copy, so memory is duplicated and a disabled link lingers until its short expiry.',
            pickWhen: 'In front of the shared cache, for viral links, with an expiry of a few seconds.',
          },
          {
            option: '[[Content delivery network|cdn]] (CDN) edge',
            goodAt: 'Answers clicks close to the user and soaks up viral spikes before they reach you.',
            badAt: 'Clicks answered at the edge must be counted from the edge’s logs, and takedowns wait for the edge copy to expire or be purged.',
            pickWhen: 'Traffic is global and very spiky, and the CDN can send you its logs.',
          },
          {
            option: 'Read replicas only',
            goodAt: 'Nothing new to run: store followers serve the reads.',
            badAt: 'Each lookup is a database read, slower and costlier than a lookup in memory.',
            pickWhen: 'Early on, before reads outgrow a few followers.',
          },
        ],
      },
      recommendation:
        'Use the shared cache with cache-aside, evict the [[least recently used|lru]] (LRU) links when it fills, and give entries a day’s expiry, since links almost never change. Add a small in-process cache with a few seconds’ expiry for viral links, and cache “not found” answers briefly too, so scanners guessing random codes never reach the store. When a link is disabled, delete its shared cache entry; the short in-process expiry bounds how long it lingers anywhere else.',
    },
    {
      title: 'Counting clicks without slowing redirects',
      problem:
        'Owners want clicks per day, by country and referring site. A database write per click would add latency to every redirect and turn a viral link into one row updated thousands of times a second. Analytics can be minutes late and very slightly off; redirects can’t.',
      options: {
        caption: 'Ways to count about 10,000 clicks a second (ballpark)',
        rows: [
          {
            option: 'Update a counter row on every click',
            goodAt: 'Simplest, and counts are always current.',
            badAt: 'Adds a write to every redirect, and a viral link’s row becomes a [[hot spot|hot-spot]] that slows to a crawl.',
            pickWhen: 'Low traffic, or a prototype.',
          },
          {
            option: 'Append events to a stream, count in batches',
            goodAt: 'The redirect only appends and moves on; the stream absorbs bursts, a job sums clicks per minute, and events can be replayed after a bug.',
            badAt: 'More moving parts, and counts lag by a minute or so (ballpark).',
            pickWhen: 'The default at this scale.',
          },
          {
            option: 'Increment counters in Redis',
            goodAt: 'Fast, with live counts.',
            badAt: 'Still a network call per click; memory grows with links times time buckets; a crash can lose counts.',
            pickWhen: 'Live counters for a small set of links, such as one campaign.',
          },
          {
            option: 'Process server logs every night',
            goodAt: 'Cheapest: nothing new on the redirect path.',
            badAt: 'Counts arrive up to a day late, and the logs must be shipped reliably.',
            pickWhen: 'Daily reports are all anyone needs.',
          },
        ],
      },
      recommendation:
        'Append one small event per click to a partitioned stream such as Kafka, and let a job sum clicks per link per minute before writing them. Delivery is [[at-least-once|at-least-once]], so a crash can replay a batch: make the write [[idempotent|idempotent]] by storing each batch’s totals with the stream position they cover, or accept a tiny overcount. For unique visitors, keep a [[HyperLogLog|hyperloglog]] per link per day, a few kilobytes instead of a list of every visitor.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 200,000 redirects a second at peak (ballpark).',
      impact: 'Redirect servers and cache nodes run out of [[headroom|headroom]], and the cache holds a smaller share of the links people click, so more reads fall through to the store.',
      mitigation:
        'Both tiers scale out: add redirect servers and cache nodes, with [[consistent hashing|consistent-hashing]] so most keys stay put when the cache grows. Watch the [[hit ratio|hit-ratio]]; a falling hit ratio is the first sign the cache is too small.',
    },
    {
      scenario: '100× load, or one viral link at 100,000 clicks a second.',
      impact: 'One code is a hot key on a single cache node, and if click events are partitioned by code, they all pile onto one stream partition.',
      mitigation:
        'Serve the hottest codes from each redirect server’s memory or the CDN edge for a few seconds, and partition click events by a random key, not the code; the counting job adds them up anyway.',
    },
    {
      scenario: 'The cache cluster dies.',
      impact: 'Every lookup goes to the store: up to 20,000 reads a second at peak, with a [[cache stampede|cache-stampede]] on popular codes the moment it happens.',
      mitigation: 'Size the followers to carry the full read load for a while, coalesce concurrent misses for the same code, and warm the cache gradually as it returns.',
    },
    {
      scenario: 'A store shard’s leader dies.',
      impact: 'Redirects keep working from followers. Creates whose new code belongs to that shard fail for a few seconds, until a follower is promoted.',
      mitigation: 'Automatic failover. Meanwhile the create service can skip that number and take the next one, which almost certainly belongs to another shard.',
    },
    {
      scenario: 'The ID counter is unreachable.',
      impact: 'Nothing at first: each create server still has the rest of its block, roughly 15 minutes of numbers (ballpark). Redirects never touch the counter.',
      mitigation: 'Run the counter on a small replicated, strongly consistent store such as etcd, so a new leader takes over in seconds, and alert long before blocks run out.',
    },
    {
      scenario: 'The click stream or the counting job fails.',
      impact:
        'Redirects are unaffected. With the stream down, events wait in a small in-memory buffer and the oldest are dropped; with only the job down, events wait in the stream and counts arrive late.',
      mitigation: 'Alert on [[consumer lag|consumer-lag]] and on dropped events, and replay from the stream after a fix.',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'If every link lives in one region, every short link in the world stops working at once.',
      mitigation:
        'Run redirect servers, caches and store followers in a second region, with [[Domain Name System (DNS) failover|dns-failover]] in front. Redirects keep working there while creation waits for the home region or a promoted leader.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Produces a working design: a create endpoint, a redirect endpoint and a table from code to long URL, with the redirect as a lookup by key.',
        'Explains base 62 and shows that seven characters give trillions of codes.',
        'Notices that clicks far outnumber creates and adds a cache.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Picks a way to generate codes and defends it with numbers: counter blocks, or random codes with a conditional insert and their collision rate.',
        'Chooses between 301 and 302 on purpose and ties the choice to analytics and takedowns.',
        'Moves click counting off the redirect path with a stream, and sizes the cache from the estimate.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Leads the deep dives without being asked: viral links, a cache failure and the read load the store must then survive, enumeration and phishing.',
        'States trade-offs in one breath, such as “a 302 costs a request per click and buys complete analytics and instant takedowns.”',
        'Plans for operations: reads in several regions, failover for each component, and alerts on redirect latency, hit ratio and consumer lag.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The cache cluster just went down. What happens?',
      a: 'Every lookup misses and goes to the store, up to about 20,000 reads a second at peak (ballpark). I size the followers to carry that for a while and coalesce concurrent misses, so a viral code is read once, not thousands of times. If the store still struggles, I shed the least important traffic, such as stats pages, before redirects; redirects get slower but keep working.',
    },
    {
      q: 'A link just went viral: 100,000 clicks a second on one code. What breaks first?',
      a: 'The cache node that holds that code, since one key lives on one node, and the stream partition, if clicks are partitioned by code. I keep the hottest codes in each redirect server’s memory for a few seconds, or let the CDN edge answer them with a short max-age, and spread click events by a random key.',
    },
    {
      q: 'Could someone download every link you have ever shortened?',
      a: 'With raw counter codes, yes: they are consecutive, so a script can walk through them. I scramble each number with a secret-keyed reversible function before encoding, and rate-limit lookups per IP address, because a scanner mostly hits codes that don’t exist. Owners of sensitive links can also ask for longer random codes.',
    },
    {
      q: 'How do you support custom aliases without two people getting the same one?',
      a: 'A custom alias skips the counter. The create service writes it with a conditional insert that succeeds only if the alias is free, so the store settles any race and the loser gets `409 Conflict`. Aliases must be at least eight characters, so they can never collide with a generated seven-character code.',
    },
    {
      q: 'Someone shortened a phishing page. How fast can you take it down?',
      a: 'With 302 redirects, as fast as the caches clear: I mark the link disabled in the store and delete its cache entry, and the next click gets a warning page or `410 Gone`. In-process caches expire within seconds. Browsers that cached a 301 would keep going to the phishing page, which is one more reason to use 302, and new links pass a safe-browsing check before they work.',
    },
    {
      q: 'How would you make redirects fast for users in Europe and Asia?',
      a: 'Redirects read data that almost never changes, so they replicate well. I run redirect servers, caches and store followers in each region and send users to the nearest one; creation stays in the home region, and a new link reaches the others within a second or so (ballpark) of [[replication lag|replication-lag]]. A miss in a far region falls back to the home region, so a brand-new link never fails.',
    },
  ],
  rubric: [
    { item: 'Asked about scale and the read/write ratio, then estimated redirects per second, storage and code length', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Generated unique codes without coordinating on every request, and encoded them in base 62 with a justified length', weight: 20, lessonId: 'unique-ids' },
    { item: 'Chose between 301 and 302 on purpose, tied to analytics, takedowns and caching', weight: 10, lessonId: 'http-essentials' },
    { item: 'Put a cache in front of the store, sized it, and handled misses, viral links and stampedes', weight: 20, lessonId: 'caching' },
    { item: 'Picked a store keyed by code and explained how it is sharded and replicated', weight: 10, lessonId: 'sharding' },
    { item: 'Counted clicks off the redirect path with a stream, aggregated in batches', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Explained what users see when the cache, the store leader or the stream fails', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
