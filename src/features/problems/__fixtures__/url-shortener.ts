import type { Problem } from '@/content/types';

/**
 * Test fixture, not content: a compact problem in the shape of src/content/problems/<id>.ts,
 * used by the unit tests and, in development only, by the problem pages before the real file exists
 * (see ../source.ts). The real URL shortener problem lives in src/content/problems.
 */
const fixture: Problem = {
  id: 'url-shortener',
  title: 'URL shortener',
  tier: 1,
  flagship: true,
  minutes: 45,
  prompt: 'Design a service like TinyURL that turns long links into short ones. People click the short link and land on the original page.',
  concepts: ['unique-ids', 'caching', 'http-essentials', 'queues-and-streams', 'replication'],
  hints: [
    'Start with the two paths: creating a short link, and following one. Which happens far more often?',
    'The short code is the key to everything. How do you make one that never collides with another, without checking every time?',
    'A counter turned into base62 gives short unique codes. Reads are hot and repeat, so a cache in front of the database carries most of the load.',
  ],
  clarifyingQuestions: [
    { q: 'How many new links a day, and how many clicks?', why: 'The read-to-write ratio decides whether caching or write throughput is the main problem.' },
    { q: 'Can users choose a custom alias?', why: 'Custom aliases need a uniqueness check on write, which a counter alone does not give you.' },
    { q: 'Do links expire?', why: 'Expiry adds a cleanup job and changes how long you keep data, which changes storage.' },
    { q: 'Do we need click analytics?', why: 'Counting clicks on the redirect path slows every click; it pushes you toward async processing.' },
  ],
  requirements: {
    functional: ['Create a short link for a long URL', 'Redirect a short link to its long URL', 'Count clicks per link'],
    nonFunctional: ['Redirects in under 100 ms at the 99th percentile (ballpark)', 'Highly available: a broken link is a broken page', 'Short codes never collide'],
    outOfScope: ['User accounts and link editing', 'Spam and malware scanning'],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '10 million' },
      { label: 'Actions per user per day', value: '10' },
      { label: 'Reads per write', value: '100 to 1' },
      { label: 'One stored link', value: 'about 500 bytes' },
    ],
    steps: [
      { label: 'Requests a day', math: '10 million × 10', result: '100 million' },
      { label: 'Redirects per second', math: '100 million ÷ 100,000 seconds', result: 'about 1,000 a second, 2,000 at peak' },
      { label: 'New links per second', math: '1 million a day ÷ 100,000 seconds', result: 'about 10 a second' },
      { label: 'Storage over 5 years', math: '1 million × 500 bytes × 365 × 5', result: 'about 1 TB' },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 10, readsPerWrite: 100, objectBytes: 500, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    { signature: 'POST /v1/links { url } -> { code }', description: 'Creates a short link and returns its code.' },
    { signature: 'GET /:code -> 302 Location: <url>', description: 'Redirects to the long URL.' },
  ],
  dataModel: [
    { entity: 'Link', fields: ['code (primary key)', 'url', 'created_at'], store: 'Relational database', why: 'Simple rows, looked up by one key; a relational database is plenty at about 10 writes a second.' },
    { entity: 'Click count', fields: ['code', 'day', 'clicks'], store: 'Wide-column store', why: 'Many small counter updates, written by background workers.' },
  ],
  stages: [
    {
      title: 'It works',
      solves: 'Turn a long URL into a code, and a code back into a redirect.',
      explanation: 'One app server and one database. Every redirect reads the database.',
      diagram: {
        grid: { cols: 3, rows: 1 },
        nodes: [
          { id: 'client', type: 'client', label: 'Browser', x: 0, y: 0 },
          { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Links database', x: 2, y: 0 },
        ],
        edges: [
          { id: 'c-app', from: 'client', to: 'app', kind: 'sync' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
        ],
        steps: [
          { caption: 'A user sends a long URL. The app server makes a code and stores the pair.', flow: ['c-app', 'app-db'] },
          { caption: 'A visitor opens the short link. The app server looks up the code and answers with a redirect.', flow: ['c-app', 'app-db', '<app-db', '<c-app'] },
        ],
      },
    },
    {
      title: 'It scales',
      solves: 'Reads outnumber writes about 100 to 1, and one server cannot take them all.',
      explanation: 'A load balancer spreads traffic over stateless app servers, and a cache answers popular codes.',
      diagram: {
        grid: { cols: 4, rows: 2 },
        nodes: [
          { id: 'client', type: 'client', label: 'Browser', x: 0, y: 0 },
          { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0 },
          { id: 'app', type: 'service', label: 'App servers', x: 2, y: 0 },
          { id: 'cache', type: 'cache', label: 'Cache', x: 3, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Links database', x: 2, y: 1 },
        ],
        edges: [
          { id: 'c-lb', from: 'client', to: 'lb', kind: 'sync' },
          { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
          { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
        ],
        steps: [
          { caption: 'The load balancer spreads redirects over several app servers.', flow: ['c-lb', 'lb-app'] },
          { caption: 'Popular codes come from the cache; only misses reach the database.', flow: ['c-lb', 'lb-app', 'app-cache'], add: ['cache', 'app-cache'] },
        ],
      },
    },
    {
      title: 'It survives failures',
      solves: 'A database failure loses links, and counting clicks slows every redirect.',
      explanation: 'A replica keeps a copy of every link. Click events go on a queue, and workers count them later.',
      diagram: {
        grid: { cols: 4, rows: 3 },
        nodes: [
          { id: 'client', type: 'client', label: 'Browser', x: 0, y: 0 },
          { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0 },
          { id: 'app', type: 'service', label: 'App servers', x: 2, y: 0 },
          { id: 'cache', type: 'cache', label: 'Cache', x: 3, y: 0 },
          { id: 'db', type: 'sqlDb', label: 'Links database', x: 2, y: 1 },
          { id: 'replica', type: 'sqlDb', label: 'Replica', x: 3, y: 1 },
          { id: 'queue', type: 'queue', label: 'Click queue', x: 1, y: 1 },
          { id: 'worker', type: 'worker', label: 'Click workers', x: 1, y: 2 },
          { id: 'clicks', type: 'nosqlDb', label: 'Click counts', x: 2, y: 2 },
        ],
        edges: [
          { id: 'c-lb', from: 'client', to: 'lb', kind: 'sync' },
          { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
          { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
          { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
          { id: 'db-replica', from: 'db', to: 'replica', kind: 'replication' },
          { id: 'app-queue', from: 'app', to: 'queue', kind: 'async' },
          { id: 'queue-worker', from: 'queue', to: 'worker', kind: 'async' },
          { id: 'worker-clicks', from: 'worker', to: 'clicks', kind: 'sync' },
        ],
        steps: [
          { caption: 'Every write is copied to a replica, so a failed primary loses nothing.', focus: ['db', 'replica', 'db-replica'], add: ['replica', 'db-replica'] },
          {
            caption: 'Each redirect drops a click event on a queue and returns at once. Workers count clicks in the background.',
            flow: ['c-lb', 'lb-app', 'app-queue', 'queue-worker', 'worker-clicks'],
            add: ['queue', 'worker', 'clicks', 'app-queue', 'queue-worker', 'worker-clicks'],
          },
        ],
      },
    },
  ],
  deepDives: [
    {
      title: 'Making short codes',
      problem: 'Codes must be short and must never collide, even with many app servers creating them at once.',
      options: {
        rows: [
          { option: 'Hash the URL', goodAt: 'No coordination', badAt: 'Collisions need a check and a retry', pickWhen: 'The same URL should always get the same code' },
          { option: 'Counter plus base62', goodAt: 'Never collides, very short', badAt: 'Codes are guessable; the counter must be shared', pickWhen: 'Short codes matter most' },
          { option: 'Pre-made key ranges', goodAt: 'Fast, no shared counter per request', badAt: 'Unused ranges are lost when a server dies', pickWhen: 'Write volume is high' },
        ],
      },
      recommendation: 'Give each app server a range from a counter and encode in base62. Seven characters cover trillions of links.',
    },
    {
      title: '301 or 302',
      problem: 'The redirect status decides whether browsers come back to you on every click.',
      options: {
        rows: [
          { option: '301 permanent', goodAt: 'Browsers cache it, so less load', badAt: 'You stop seeing repeat clicks', pickWhen: 'Analytics do not matter' },
          { option: '302 temporary', goodAt: 'Every click reaches you', badAt: 'More traffic', pickWhen: 'You count clicks' },
        ],
      },
      recommendation: 'Use 302, because the product counts clicks, and let the cache absorb the extra reads.',
    },
  ],
  failureModes: [
    { scenario: '10× traffic', impact: 'Cache misses pile onto the database.', mitigation: 'Grow the cache and add read replicas.' },
    { scenario: '100× traffic', impact: 'One database cannot hold the write and read load.', mitigation: 'Shard links by code.' },
    { scenario: 'Cache cluster down', impact: 'Every redirect hits the database, which slows or falls over.', mitigation: 'Replicate the cache and limit load on the database while it warms.' },
    { scenario: 'Primary database down', impact: 'New links fail; redirects still work from cache and replica.', mitigation: 'Promote the replica.' },
  ],
  levelSignals: [
    { level: 'entry', signals: ['Gets a working create and redirect path', 'Picks a sensible code length'] },
    { level: 'mid', signals: ['Sizes the read load and adds a cache', 'Explains why the counter cannot collide'] },
    { level: 'senior', signals: ['Moves analytics off the hot path', 'Plans for cache and database failure'] },
  ],
  followUps: [
    { q: 'The cache cluster just went down. What happens?', a: 'Every redirect falls through to the database. Replicate the cache and protect the database while it warms.' },
    { q: 'How would you add custom aliases?', a: 'Check the alias is free with a unique constraint, and keep aliases out of the counter range.' },
    { q: 'A link goes viral. What changes?', a: 'One hot key. Keep it in every cache node or in a local cache on each app server.' },
    { q: 'How do you expire links?', a: 'Store an expiry time, check it on read, and delete expired rows in a background job.' },
    { q: 'How do you stop people guessing codes?', a: 'Shuffle the counter with a reversible mix before encoding, or add random characters.' },
  ],
  rubric: [
    { item: 'Asked about scale, custom aliases and expiry before designing', weight: 10, lessonId: 'requirements' },
    { item: 'Estimated reads and writes per second, and storage', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Chose a code scheme that cannot collide', weight: 20, lessonId: 'unique-ids' },
    { item: 'Put a cache in front of the database for hot codes', weight: 20, lessonId: 'caching' },
    { item: 'Explained 301 versus 302 and what it means for analytics', weight: 15, lessonId: 'http-essentials' },
    { item: 'Moved click counting off the redirect path', weight: 10, lessonId: 'queues-and-streams' },
    { item: 'Covered what happens when the database or cache fails', weight: 10 },
  ],
};

export default fixture;
