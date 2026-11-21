import type { DiagramSpec, Problem } from '../types';

/** v1: one app server and one database; the text sits in a column next to the expiry time. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: 'browser or script', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'pastes table', x: 2, y: 0 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'To create a paste, the **app server** picks a random eight-character key, such as `x7Kp2qWz`, and inserts one row into the **database**: the key, the text itself and the time it expires. The user gets back `paste.example/x7Kp2qWz`.',
      flow: ['users-app', 'app-db', '<app-db', '<users-app'],
      notes: [{ target: 'db', text: 'text in a column' }],
    },
    {
      caption:
        'A reader opens the link. The app server reads the row by its key, checks that `expires_at` has not passed and sends back the page; an expired paste gets `404 Not Found` even while its row still exists.',
      flow: ['users-app', 'app-db', '<app-db', { edge: 'users-app', reverse: true, tag: '200' }],
    },
    {
      caption:
        'This is fine for the first few million pastes. But the table grows by about 10 GB of text a day (ballpark), so the disk, backups and every copy grow with it, and each read of a popular paste comes back to this one server.',
      focus: ['db'],
      notes: [{ target: 'db', text: '+10 GB a day', tone: 'alert' }],
    },
  ],
};

/** v2: text in object storage, metadata in a key-value store, reads through a CDN and a cache. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'cdn', type: 'cdn', label: 'CDN edge', sublabel: 'near each reader', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'Paste service', sublabel: 'stateless copies', x: 2, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'hot pastes', x: 2, y: 0 },
    { id: 'meta', type: 'nosqlDb', label: 'Metadata store', sublabel: 'one row per paste', x: 3, y: 1 },
    { id: 'blob', type: 'objectStore', label: 'Object storage', sublabel: 'paste text', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-cdn', from: 'users', to: 'cdn', kind: 'sync' },
    { id: 'cdn-app', from: 'cdn', to: 'app', kind: 'sync', label: 'misses' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-meta', from: 'app', to: 'meta', kind: 'sync' },
    { id: 'app-blob', from: 'app', to: 'blob', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A create passes through the **CDN edge** to the **paste service**, which compresses the text and writes it to **object storage** under `1d/x7Kp2qWz`: its expiry class, then its key. Only after that write succeeds does it insert the small row in the **metadata store**, so a row never points at missing text.',
      flow: ['users-cdn', 'cdn-app', 'app-blob', '<app-blob', 'app-meta', '<app-meta', '<cdn-app', '<users-cdn'],
      notes: [{ target: 'blob', text: 'text first' }],
    },
    {
      caption:
        'The first reader near an edge misses there. The paste service checks the **cache**, reads the row to confirm the paste exists, may be shown and has not expired, then fetches the text and keeps a copy in the cache ([[cache-aside|cache-aside]]).',
      flow: [{ edge: 'users-cdn', tag: 'miss' }, 'cdn-app', { edge: 'app-cache', tag: 'miss' }, '<app-cache', 'app-meta', '<app-meta', 'app-blob', '<app-blob', '<cdn-app', '<users-cdn'],
    },
    {
      caption:
        'The next readers near that edge get the edge’s copy ([[cache hits|cache-hit]]), so a popular paste costs the paste service one request per edge, not one per reader. The page’s [[Cache-Control header|cache-control]] lets the edge keep it until the paste expires, and never longer than an hour.',
      flow: [{ edge: 'users-cdn', tag: 'hit' }, '<users-cdn'],
    },
    {
      caption:
        'Each tier now grows on its own. Paste services keep nothing between requests ([[stateless|stateless]]), object storage grows without limit at a fraction of a database’s price per gigabyte, and the metadata store holds about 200 bytes per paste.',
      focus: ['app', 'blob', 'meta'],
      notes: [
        { target: 'blob', text: '≈ 18 TB in 5 years' },
        { target: 'meta', text: '≈ 370 GB' },
      ],
    },
  ],
};

/** v3: expiry checked on every read; a cleanup job and lifecycle rules reclaim the space. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN edge', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'Paste service', x: 2, y: 0 },
    { id: 'meta', type: 'nosqlDb', label: 'Metadata store', sublabel: 'with expiry index', x: 3, y: 0 },
    { id: 'blob', type: 'objectStore', label: 'Object storage', sublabel: 'lifecycle rules', x: 2, y: 1 },
    { id: 'cleaner', type: 'worker', label: 'Cleanup job', sublabel: 'every 5 minutes', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-cdn', from: 'users', to: 'cdn', kind: 'sync' },
    { id: 'cdn-app', from: 'cdn', to: 'app', kind: 'sync' },
    { id: 'app-meta', from: 'app', to: 'meta', kind: 'sync' },
    { id: 'app-blob', from: 'app', to: 'blob', kind: 'sync' },
    { id: 'cleaner-meta', from: 'cleaner', to: 'meta', kind: 'sync', label: 'due rows' },
    { id: 'cleaner-blob', from: 'cleaner', to: 'blob', kind: 'sync', label: 'delete' },
  ],
  steps: [
    {
      caption:
        'A one-day paste expires at 14:00, and at 14:00:01 someone asks for it. The **paste service** reads its row, sees that `expires_at` has passed and answers `404 Not Found`, though the text is still in object storage. Expiry is decided on every read, so it is exact to the second.',
      flow: ['users-cdn', 'cdn-app', 'app-meta', '<app-meta', '<cdn-app', { edge: 'users-cdn', reverse: true, tag: '404' }],
      notes: [{ target: 'meta', text: 'expired 14:00' }],
    },
    {
      caption:
        'Every five minutes the **cleanup job** reads the expiry index for hours that have passed, deletes each paste’s row and then its text. A crash between the two leaves the paste invisible but its text behind, an orphan that something else must catch.',
      flow: ['cleaner-meta', '<cleaner-meta', 'cleaner-blob'],
      notes: [{ target: 'cleaner', text: '≈ 20,000 an hour' }],
    },
    {
      caption:
        'That something is the bucket’s lifecycle rules: delete anything under `1d/` older than two days, under `1m/` older than 32 days, and so on. They run inside **object storage** with no code of yours, so a bug in the cleanup job becomes annoying rather than expensive.',
      focus: ['blob'],
      notes: [{ target: 'blob', text: '1d/ gone in 2 days' }],
    },
    {
      caption:
        'An owner deletes a paste by hand. The service deletes the row first, so the paste disappears at once, then asks the CDN to purge its copies, which were allowed to live for up to an hour, and removes the text last.',
      flow: ['users-cdn', 'cdn-app', 'app-meta', '<app-meta', { edge: 'cdn-app', reverse: true, tag: 'purge' }, 'app-blob'],
    },
  ],
};

/** v4: what each failure does to reads. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'cdn', type: 'cdn', label: 'CDN edge', sublabel: 'stale if error', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'Paste service', sublabel: 'three zones', x: 2, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 2, y: 0 },
    { id: 'meta', type: 'nosqlDb', label: 'Metadata store', sublabel: 'three copies', x: 3, y: 1 },
    { id: 'blob', type: 'objectStore', label: 'Object storage', sublabel: 'home region', x: 2, y: 2 },
    { id: 'copy', type: 'objectStore', label: 'Bucket copy', sublabel: 'second region', x: 3, y: 2 },
  ],
  edges: [
    { id: 'users-cdn', from: 'users', to: 'cdn', kind: 'sync' },
    { id: 'cdn-app', from: 'cdn', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-meta', from: 'app', to: 'meta', kind: 'sync' },
    { id: 'app-blob', from: 'app', to: 'blob', kind: 'sync' },
    { id: 'blob-copy', from: 'blob', to: 'copy', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'Every tier runs in three [[availability zones|availability-zone]]. The metadata store keeps three copies of each row, object storage keeps its own copies across zones, and the bucket also copies each new paste to a **bucket copy** in a second region, within minutes (ballpark).',
      focus: ['meta', 'blob', 'copy', 'blob-copy'],
      flow: ['blob-copy'],
    },
    {
      caption:
        'A bad deploy takes the paste service down everywhere. The **CDN edge** keeps serving the public pastes it holds, even past their `max-age`, through a `stale-if-error` window that also ends at each paste’s expiry. Creates and edge misses fail until the rollback.',
      fail: ['app'],
      flow: [{ edge: 'users-cdn', tag: 'stale' }, '<users-cdn'],
      notes: [{ target: 'users', text: 'popular pastes still load' }],
    },
    {
      caption:
        'The cache dies. Every edge miss now reads the metadata store and object storage, about 200 reads a second at peak (ballpark), which both handle easily; reads just take tens of milliseconds longer.',
      fail: ['cache'],
      flow: ['users-cdn', 'cdn-app', 'app-meta', '<app-meta', 'app-blob', '<app-blob', '<cdn-app', '<users-cdn'],
    },
    {
      caption:
        'Object storage has an outage in the home region. Pastes in the edge or the cache keep loading; other reads and all creates fail fast with a clear error. If it lasts, traffic moves to the second region, which serves from its own copy and lacks at most the last few minutes of pastes.',
      fail: ['blob'],
      flow: ['users-cdn', 'cdn-app', { edge: 'app-cache', tag: 'hit' }, '<app-cache', '<cdn-app', '<users-cdn'],
      notes: [{ target: 'copy', text: 'ready to serve', tone: 'signal' }],
    },
  ],
};

const problem: Problem = {
  id: 'pastebin',
  title: 'Pastebin',
  tier: 1,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a text-sharing service like Pastebin. A user pastes some text or code and gets a short link back; anyone with the link can read the paste until it expires.',
  concepts: ['back-of-the-envelope', 'storage-types', 'cdns', 'caching', 'unique-ids', 'sql-vs-nosql', 'rate-limiting'],
  hints: [
    'Ask which number keeps growing. Requests per second are modest for a service like this, so look for the thing that piles up every day, and think about where it should live.',
    'A paste is really two things: a blob of text that is written once and never edited, and a few small facts about it, such as its owner and when it expires. Store each where it is cheapest and fastest to use, and decide who makes sure an expired paste is never shown.',
    'One shape that works: a stateless paste service writes the text to [[object storage|object-storage]] under a random key and a small row to a [[key-value store|key-value-store]]; reads go through a [[content delivery network|cdn]] (CDN) whose copies never outlive the paste; expiry is checked on every read, and a cleanup job plus [[lifecycle rules|lifecycle-rule]] reclaim the space.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many pastes are created each day, and how often is each one read?',
      why: 'This sets the scale and the [[read/write ratio|read-write-ratio]]. Assume about a million new pastes and ten million reads a day (ballpark): traffic is modest, so storage and expiry shape the design more than load does.',
    },
    {
      q: 'How big can a paste be, and how big is a typical one?',
      why: 'Typical pastes are small, around 10 KB (ballpark), but a cap such as 10 MB decides whether text fits in a database row or belongs in object storage, and whether uploads should go around your servers.',
    },
    {
      q: 'Which expiry times can users pick, and must a paste vanish at the exact second?',
      why: 'Choices such as 10 minutes, a day, a month or never decide how much data you keep. If an expired paste must never be shown, the check happens on every read, while freeing the storage can happen later in the background.',
    },
    {
      q: 'Are some pastes private, or are they all public or unlisted?',
      why: 'Public and unlisted pastes can be cached at the CDN edge and served to anyone with the link. Private pastes need the signed-in owner on every read, so they skip the shared cache and always reach your servers.',
    },
    {
      q: 'Can a paste be edited or deleted after it is created?',
      why: 'If pastes never change, every cached copy is correct until the paste expires or is deleted, which makes caching easy. Edits would need versions or [[cache invalidation|cache-invalidation]]; deletion alone needs only a [[purge|purge]] of cached copies.',
    },
    {
      q: 'Do people find pastes by searching, or only through their links?',
      why: 'Link-only access means every read is a lookup by key. Search would need an index over all the text, a separate system with its own cost, so most designs leave it out.',
    },
  ],
  requirements: {
    functional: [
      'Create a paste of up to 10 MB of text, with an optional title, syntax language and expiry (10 minutes, an hour, a day, a month or never), and get back a link such as `paste.example/x7Kp2qWz`.',
      'Anyone with the link can read the paste, as a formatted page or as raw text, until it expires.',
      'Each paste is public, unlisted (readable only with its link) or private (readable only by its signed-in owner).',
      'The owner can delete a paste at any time; deleted and expired pastes return “not found”.',
    ],
    nonFunctional: [
      'Fast reads worldwide: popular pastes start arriving within about 100 ms (ballpark), served from an edge near the reader.',
      'Durable: a paste is never lost or corrupted before it expires, since losing someone’s notes or code is worse than a slow page.',
      'Exact expiry for readers: nobody sees a paste after its expiry time, even if its bytes are not deleted yet.',
      'Highly available reads, around 99.9% (a ballpark target); creating pastes can tolerate short outages.',
      'Unlisted links can’t be guessed or listed.',
      'Scale: about a million new pastes and ten million reads a day (ballpark), with storage planned five years ahead.',
    ],
    outOfScope: [
      'Accounts, login and billing: assume each request arrives with an optional user token.',
      'Searching the text of pastes, and public lists of recent pastes.',
      'Editing pastes and keeping version history.',
      'Deciding whether a paste holds malware or leaked passwords, beyond calling an outside scanning service.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'People who read or create a paste each day', value: '2 million (ballpark)' },
      { label: 'Requests per person per day', value: '5, mostly reads' },
      { label: 'Reads per new paste', value: 'about 10' },
      { label: 'Average paste', value: 'about 10 KB of text, plus about 200 bytes of metadata' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'Planning horizon', value: '5 years; about half of pastes never expire (ballpark)' },
      { label: 'In the calculator', value: 'each paste is one stored object, and storage assumes nothing expires: an upper bound' },
    ],
    steps: [
      { label: 'Pastes created per second', math: '2 × 10⁶ people × 5 = 10⁷ requests a day; 1 in 11 is a create ≈ 10⁶ pastes a day; 10⁶ ÷ 10⁵ seconds a day', result: '≈ 10 a second, 20 at peak' },
      { label: 'Reads per second', math: '10⁷ requests − 10⁶ creates ≈ 9 × 10⁶ reads a day; ÷ 10⁵ seconds', result: '≈ 100 a second, 200 at peak: small' },
      { label: 'New text per day', math: '10⁶ pastes × 10 KB', result: '≈ 10 GB a day' },
      { label: 'Text over five years', math: '10 GB × 365 ≈ 3.7 TB a year; × 5 years', result: '≈ 18 TB if nothing expired, about 9 TB if half expire early' },
      { label: 'Metadata over five years', math: '10⁶ × 365 × 5 ≈ 1.8 × 10⁹ rows × 200 bytes', result: '≈ 370 GB: billions of small rows' },
      { label: 'Key length', math: '1.8 × 10⁹ pastes; 62⁸ ≈ 2.2 × 10¹⁴ possible eight-character keys', result: '8 random characters: about 1 new key in 100,000 collides, and simply retries' },
      { label: 'Cache for hot pastes', math: '20% of a day’s 9 × 10⁶ reads × 10 KB', result: '≈ 18 GB: one cache node' },
      { label: 'Outgoing bandwidth at the origin', math: '200 reads a second × 10 KB', result: '≈ 2 MB a second at peak, before the CDN takes most of it' },
    ],
    calculator: { dau: 2_000_000, actionsPerUser: 5, readsPerWrite: 10, objectBytes: 10_000, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'POST /v1/pastes  { text, title?, syntax?, expiresIn, visibility }  →  201 { key, link, expiresAt }',
      description:
        'Creates a paste. Text over 10 MB gets `413 Content Too Large`, callers are [[rate-limited|rate-limiting]] per account or [[Internet Protocol (IP) address|ip-address]], and an [[idempotency key|idempotency-key]] header makes a retried create return the same paste instead of a second one.',
    },
    {
      signature: 'GET /{key}  →  200 page, or 404 Not Found',
      description:
        'The paste page, served through the CDN. Expired, deleted and unknown keys all get `404 Not Found`, and the response says how long caches may keep it.',
    },
    {
      signature: 'GET /raw/{key}  →  200 text/plain',
      description: 'The bare text, for scripts and command-line tools. The same rules apply, and a private paste needs its owner’s token.',
    },
    {
      signature: 'DELETE /v1/pastes/{key}  →  204 No Content',
      description:
        'Deletes a paste for its owner. The metadata row goes first, so the paste disappears at once; then the CDN copies are purged and the text is removed from object storage.',
    },
  ],
  dataModel: [
    {
      entity: 'Paste metadata',
      fields: ['key: 8 characters (partition key)', 'owner_id (or null)', 'title, syntax', 'visibility: public | unlisted | private', 'size_bytes', 'created_at', 'expires_at (or null)', 'object_key: "1d/x7Kp2qWz"'],
      store: 'Key-value store such as DynamoDB or Cassandra, partitioned by key, three copies of each row',
      why: 'Every read is a lookup by one key, rows are small, and there will be billions of them, so a store that partitions by key fits. A conditional insert ([[compare-and-set|compare-and-set]]: write only if the key is new) settles the rare collision between random keys.',
    },
    {
      entity: 'Paste text',
      fields: ['object key: "<expiry class>/<paste key>"', 'body: compressed text', 'content type: text/plain'],
      store: 'Object storage such as Amazon S3 or Google Cloud Storage, one bucket with a prefix per expiry class',
      why: 'Text is written once, read whole and never edited, which is what object storage is built for, at a fraction of a database’s price per gigabyte. Prefixes such as `1d/` and `1m/` let a lifecycle rule delete each expiry class in bulk.',
    },
    {
      entity: 'Expiry index',
      fields: ['expires_hour (partition key)', 'key (sort key)'],
      store: 'The same key-value store, as a second table',
      why: 'The cleanup job needs “every paste that expired in the last hour” without scanning billions of rows, so each paste with an expiry also gets a row under its hour, about 20,000 per hour (ballpark). Pastes that never expire get none.',
    },
    {
      entity: 'Pastes by owner',
      fields: ['owner_id (partition key)', 'created_at (sort key)', 'key', 'title'],
      store: 'The same key-value store, as a third table',
      why: 'The main table is keyed by paste key, so the “my pastes” page needs a copy keyed by owner. It is written once, at creation, and deleted with the paste.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Store a paste, hand back a link, and show the paste to anyone with the link until it expires, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One app server and one relational database cover the early days, and checking `expires_at` on every read already makes expiry exact. It stops working as the text piles up: about 18 TB over five years (ballpark) is a lot of expensive, replicated database disk for data that is never queried, only fetched whole.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 10 GB of new text a day (ballpark) and readers on every continent: the text needs cheaper storage, and popular pastes should be served near their readers.',
      diagram: v2,
      explanation:
        'Text and metadata now live where each is cheapest: [[metadata|metadata]] in a key-value store, the text in object storage. Writing the text before the row means a crash leaves at worst an unused object, never a row with nothing behind it. The CDN takes most reads off the origin, which is why the origin traffic stays small.',
    },
    {
      title: 'v3: Expiry and cleanup',
      solves: 'Expired pastes must never be shown, and their space must come back, without scanning billions of rows or trusting a single job to never fail.',
      diagram: v3,
      explanation:
        'Three layers, each with one job: the read-time check makes expiry exact, the cleanup job reclaims space within minutes, and lifecycle rules catch whatever the job misses. Bounding each edge copy’s lifetime by the paste’s expiry means expiry needs no purge; only manual deletes do.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead paste service, cache or object store must not take down popular pastes, and a regional outage must not lose any.',
      diagram: v4,
      explanation:
        'Reads fail toward working: the edge and the cache keep popular pastes alive through most outages, and nothing is lost while object storage keeps copies in several zones and a second region. Creates are the part that pauses, which users tolerate far better than broken links.',
    },
  ],
  deepDives: [
    {
      title: 'Where the paste text lives',
      problem:
        'The text is the bulk of the data, about 18 TB over five years (ballpark), and it is never queried, only fetched whole by key. Where you keep it decides your storage bill, your read latency and how hard expiry is.',
      options: {
        caption: 'Four homes for the text',
        rows: [
          {
            option: 'In the database row',
            goodAt: 'One read returns everything, and there is only one system to run and back up.',
            badAt:
              'The database grows by about 10 GB a day (ballpark) on costly, replicated disks, and big rows slow backups and new replicas. Many key-value stores also cap item size, such as 400 KB in DynamoDB.',
            pickWhen: 'Small scale, or pastes capped at a few kilobytes.',
          },
          {
            option: 'Object storage, metadata in a database',
            goodAt: 'Cheapest per gigabyte, built for very high [[durability|durability]], no practical size limit, and lifecycle rules can delete whole expiry classes.',
            badAt: 'Two calls per uncached read, and object storage takes tens of milliseconds (ballpark) to return the first byte. Each request also carries a small fee, which adds up for tiny objects.',
            pickWhen: 'The default once the text reaches terabytes.',
          },
          {
            option: 'Small pastes inline, large ones in object storage',
            goodAt: 'Most pastes are small, so most reads take one call, while the big ones still go to cheap storage.',
            badAt: 'Two code paths to write, test and clean up, and a size threshold to tune.',
            pickWhen: 'Read latency matters and most pastes are a few kilobytes.',
          },
          {
            option: 'Pack many pastes into large files',
            goodAt: 'Fewer, bigger objects: lower request fees and less overhead per paste.',
            badAt: 'A deleted paste leaves a hole that [[compaction|compaction]] must reclaim later; you are now building a storage system.',
            pickWhen: 'Request fees for billions of tiny objects dominate the bill.',
          },
        ],
      },
      recommendation:
        'Keep the text in object storage and the metadata in a key-value store, and compress the text first, since plain text often shrinks to a third of its size or less (ballpark). The CDN and the cache serve most reads, which hides the object store’s first-byte time. If tiny pastes later dominate, inline those under about 4 KB (a ballpark threshold) in the metadata row.',
    },
    {
      title: 'Making pastes expire on time',
      problem:
        'A paste set to expire must never be shown after its time, and its space should come back soon after. Half a million pastes expire on a normal day (ballpark), and the text and the metadata live in two different systems that must both be cleaned.',
      options: {
        caption: 'Four ways to expire pastes, best combined',
        rows: [
          {
            option: 'Check expiry on every read',
            goodAt: 'Exact to the second, and free: the read already fetches the row.',
            badAt: 'Frees no storage, so expired pastes pile up forever.',
            pickWhen: 'Always, as the correctness layer under any cleanup.',
          },
          {
            option: 'The database’s own row expiry ([[time to live|ttl]])',
            goodAt: 'Built in: Cassandra and DynamoDB can delete rows once their time to live runs out.',
            badAt:
              'DynamoDB deletes expired items in the background, typically within a few days, and serves them until then; Cassandra hides them at once but frees the space later. Neither touches the text in object storage.',
            pickWhen: 'Reclaiming metadata space, with the read-time check still in place.',
          },
          {
            option: 'Cleanup job over an expiry index',
            goodAt: 'Deletes the row and the text together, on a schedule you control, and can purge cached copies or log as it goes.',
            badAt: 'One more table and job to run, and a crash between the two deletes leaves an orphan.',
            pickWhen: 'Space must come back within minutes or hours, from both stores.',
          },
          {
            option: 'Bucket lifecycle rules by prefix',
            goodAt: 'No code: object storage deletes objects older than a set age under a prefix, such as `1d/`, by itself.',
            badAt: 'It knows only an object’s age, so it works per expiry class, in whole days, and can’t handle a paste deleted early.',
            pickWhen: 'As a backstop that guarantees short-lived text can’t linger.',
          },
        ],
      },
      recommendation:
        'Layer them. The read-time check makes expiry exact, the cleanup job deletes the row and then the text within minutes, and a lifecycle rule on each expiry prefix catches anything the job misses. Pastes that never expire live under their own prefix with no rule, and a weekly sweep compares that prefix with the metadata to remove orphans.',
    },
    {
      title: 'Caching pastes at the edge without breaking expiry or deletes',
      problem:
        'A CDN makes reads fast everywhere and soaks up viral pastes, but a copy at the edge is served without asking you. A paste must not outlive its expiry at any edge, a deleted one must disappear quickly, and private pastes must never be served to strangers.',
      options: {
        caption: 'How long may an edge keep a paste?',
        rows: [
          {
            option: 'A long time, purged on every change',
            goodAt: 'The highest [[hit ratio|hit-ratio]]: popular pastes almost never reach you.',
            badAt: 'Every expiry needs a purge, about 20,000 an hour (ballpark), and one failed purge shows a paste after it should be gone.',
            pickWhen: 'Files that never expire, such as versioned scripts and stylesheets.',
          },
          {
            option: '`max-age` bounded by the paste’s expiry',
            goodAt: 'Expired pastes leave every edge on their own, with no purge. Capping it at an hour bounds how long a deleted paste can linger if a purge fails.',
            badAt: 'Pastes that expire soon get short cache lifetimes, and deletes still need a purge.',
            pickWhen: 'The default for public and unlisted pastes.',
          },
          {
            option: 'Not cached at the edge',
            goodAt: 'Simple: every read sees the current state.',
            badAt: 'Every read crosses the world to your servers, and one viral paste hits them in full.',
            pickWhen: 'Private and “burn after reading” pastes, sent with `Cache-Control: private, no-store`.',
          },
          {
            option: 'Signed edge links for private pastes',
            goodAt: 'Private pastes get edge speed: your server checks the owner, then hands out a link that expires in minutes.',
            badAt: 'Anyone holding the signed link can read until it expires, and the CDN must be set up to check signatures.',
            pickWhen: 'Private pastes are large or read often.',
          },
        ],
      },
      recommendation:
        'Send `Cache-Control: public, max-age=N`, where N is the smaller of the paste’s remaining lifetime and one hour, purge on delete, and keep private pastes out of shared caches. Put an [[origin shield|origin-shield]] between the edges and the paste service, so a viral paste is fetched from you about once per hour, not once per edge. Say the trade-off aloud: the one-hour cap means a failed purge leaves a deleted paste up for at most an hour.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 2,000 reads and 200 creates a second at peak (ballpark).',
      impact: 'Paste services and the cache run out of [[headroom|headroom]], the metadata store sees ten times the lookups, and the text grows by about 100 GB a day.',
      mitigation:
        'Add paste service copies and cache nodes; the metadata store adds nodes and spreads keys across them. Object storage scales by itself, so watch the bill and move pastes older than a few months to a cheaper [[storage class|storage-class]].',
    },
    {
      scenario: 'A viral paste: 50,000 reads a second for one key, from every continent.',
      impact:
        'Each edge misses once, and if its copy has a short lifetime, a [[cache stampede|cache-stampede]] of concurrent misses can land on the paste service and on the one cache node that holds the key, a [[hot key|hot-key]].',
      mitigation: 'An origin shield in front of the paste service and [[request coalescing|request-coalescing]] at the shield and in the service, so the paste is fetched about once per cache lifetime.',
    },
    {
      scenario: '100× the normal create rate: a script uploads millions of 10 MB pastes.',
      impact: 'Terabytes of storage in hours, a bill to match, and paste services busy receiving uploads instead of serving reads.',
      mitigation: 'Rate limits per account and per IP address, a lower size cap and a short default expiry for anonymous pastes, and an alert on storage growth per hour.',
    },
    {
      scenario: 'The cache cluster dies.',
      impact: 'Every edge miss reaches the metadata store and object storage. At about 200 reads a second at peak (ballpark), both cope; reads take tens of milliseconds longer.',
      mitigation: 'Nothing urgent: restart it and let it refill. Size the stores so that losing the cache is a slowdown, never an outage.',
    },
    {
      scenario: 'Object storage is unavailable in the home region.',
      impact: 'Uncached reads and all creates fail. Pastes held at the edge or in the cache keep loading.',
      mitigation: 'Fail creates fast with a clear error, let edges serve stale copies within each paste’s expiry, and copy the bucket to a second region so reads can move there.',
    },
    {
      scenario: 'A metadata store node dies.',
      impact: 'Its rows have two other copies, so reads and writes carry on, a little slower while the store copies the rows to a replacement.',
      mitigation: 'Three copies spread across zones, and an alert whenever any range of keys drops to fewer than two healthy copies.',
    },
    {
      scenario: 'The cleanup job stops for a week.',
      impact: 'Readers notice nothing, because expiry is checked on every read. Storage stops shrinking: about 3.5 million expired pastes (ballpark) linger.',
      mitigation: 'Lifecycle rules still remove short-lived text. Alert on the age of the oldest unprocessed hour in the expiry index, and let the job catch up hour by hour.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Produces a working design: a create endpoint, a read endpoint, a random key per paste and a table from key to text with an expiry time.',
        'Checks expiry when a paste is read, so expired pastes return “not found”.',
        'Notices that reads outnumber writes and adds a cache or a CDN.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Separates the text in object storage from the metadata in a database, and explains the order of the two writes.',
        'Estimates storage over years and sees that storage, not traffic, drives the design.',
        'Bounds edge cache lifetimes by expiry, and purges on delete.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Layers expiry: exact at read time, reclaimed by a job, backstopped by lifecycle rules, with orphans accounted for.',
        'Raises the product’s sharp edges unprompted: private and “burn after reading” pastes, abuse, and deleted pastes lingering in caches and backups.',
        'States trade-offs in one breath, such as “capping edge copies at an hour means a failed purge leaves a deleted paste up for an hour at most.”',
      ],
    },
  ],
  followUps: [
    {
      q: 'A paste just went viral: 50,000 reads a second from every continent. What happens?',
      a: 'Almost nothing reaches me: the CDN edges answer, and the origin shield means I serve about one fetch per cache lifetime. If the paste expires soon, its short `max-age` means more fetches, so I coalesce concurrent misses for the same key at the shield and in the paste service. Object storage never sees the spike.',
    },
    {
      q: 'How would you build “burn after reading”, where the first read deletes the paste?',
      a: 'Those pastes skip every cache, with `Cache-Control: no-store`. A read does a conditional delete of the metadata row that succeeds for exactly one caller; that caller fetches the text, returns it and deletes the object, while a second reader at the same moment gets `404`. If my server crashes in between, the paste is lost unread, which beats showing it twice.',
    },
    {
      q: 'Someone pasted a password by mistake and deleted the paste. Is it really gone?',
      a: 'The row goes first, so my servers return `404` at once. Then I purge the CDN, which takes seconds to a minute or so (ballpark), and delete the cache entry and the object. Bucket versions and backups can keep copies longer, so I set them to expire within days, and nothing can undo a copy someone already read.',
    },
    {
      q: 'Why not use a hash of the text as the key, so identical pastes are stored once?',
      a: 'Identical pastes are rare, so the savings are small. A hash key also leaks: anyone can hash a guessed text and check whether it exists. Shared text complicates deletes and expiry too, since one owner’s delete must not remove another’s paste, so I keep random keys and one object per paste.',
    },
    {
      q: 'How do you stop people from using the service to host malware or spam?',
      a: 'Rate limits per account and IP address, a lower size cap and a short default expiry for anonymous pastes, and an asynchronous scan of new pastes that disables bad ones. Abuse reports use the delete path: row first, then purge. Keys are random, so nobody can crawl the list of pastes.',
    },
    {
      q: 'How would you make reads faster for users in Europe and Asia?',
      a: 'Most reads are already answered at an edge near them. For misses, I copy the bucket and the metadata to a region near them and read locally; creation stays in the home region, and a brand-new paste that hasn’t arrived yet falls back to the home region, so it never fails.',
    },
  ],
  rubric: [
    { item: 'Estimated create and read rates and storage over years, and saw that storage drives the design', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Kept the text in object storage and the metadata in a database, with a safe order of writes', weight: 20, lessonId: 'storage-types' },
    { item: 'Generated random, unguessable keys and handled collisions', weight: 10, lessonId: 'unique-ids' },
    { item: 'Served reads through a CDN with cache lifetimes bounded by expiry, and purged on delete', weight: 20, lessonId: 'cdns' },
    { item: 'Made expiry exact at read time and reclaimed space with a cleanup job and lifecycle rules', weight: 20, lessonId: 'caching' },
    { item: 'Explained what readers see when the cache, object storage or the paste service fails', weight: 15, lessonId: 'replication' },
  ],
};

export default problem;
