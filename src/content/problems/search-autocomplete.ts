import type { DiagramSpec, Problem } from '../types';

/** v1: one table of queries and counts, scanned and sorted on every keystroke. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 1 },
  nodes: [
    { id: 'user', type: 'client', label: 'Browser', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'queries and counts', x: 2, y: 0 },
  ],
  edges: [
    { id: 'user-app', from: 'user', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The user types `n`. The **app server** asks the **database** for the 10 most-searched queries that start with `n`. An index on the query text finds the matches quickly, but ranking them by count means reading and sorting every one of them: millions of rows.',
      flow: ['user-app', 'app-db', '<app-db', '<user-app'],
      notes: [{ target: 'db', text: 'millions of rows', tone: 'alert' }],
    },
    {
      caption:
        'Each keystroke repeats the work for `ne`, `new` and `new y`. People press a key every 200 ms or so (ballpark), so any answer slower than that arrives after the user has moved on.',
      flow: ['user-app', 'app-db', '<app-db', '<user-app'],
      notes: [{ target: 'user', text: 'a key every 200 ms' }],
    },
    {
      caption:
        'When the user submits a search, the server adds one to that query’s count. The most popular queries become single rows updated thousands of times a second, which is the second place v1 breaks.',
      flow: ['user-app', 'app-db', '<app-db', '<user-app'],
      notes: [{ target: 'app', text: '+1 per search' }],
    },
  ],
};

/** v2: a trie with the top 10 stored at every prefix, in memory on identical servers, behind caches. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'snapshots', type: 'objectStore', label: 'Index snapshots', x: 3, y: 0 },
    { id: 'user', type: 'client', label: 'Browser', sublabel: 'waits for a pause', x: 0, y: 1 },
    { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'short prefixes', x: 1, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 2, y: 1 },
    { id: 'suggest', type: 'service', label: 'Suggestion servers', sublabel: 'trie in memory', x: 3, y: 1 },
  ],
  edges: [
    { id: 'user-cdn', from: 'user', to: 'cdn', kind: 'sync' },
    { id: 'cdn-lb', from: 'cdn', to: 'lb', kind: 'sync', label: 'misses' },
    { id: 'lb-suggest', from: 'lb', to: 'suggest', kind: 'sync' },
    { id: 'suggest-snapshots', from: 'suggest', to: 'snapshots', kind: 'sync', label: 'load at start' },
  ],
  steps: [
    {
      caption:
        'Ahead of time, a build job turns query counts into a trie: a tree with one node per prefix, where each node also stores the 10 best completions of that prefix. The **suggestion servers** load the whole tree from **index snapshots** into memory when they start, about 30 GB (ballpark).',
      flow: ['suggest-snapshots', '<suggest-snapshots'],
      notes: [{ target: 'snapshots', text: 'one file per version' }],
    },
    {
      caption:
        'The user types `new y`, and the browser asks only once typing pauses for about 50 ms (ballpark). A miss at the **CDN** goes through the **load balancer** to any suggestion server, which walks five nodes down the tree and returns the list stored there: no scanning, no sorting.',
      flow: [{ edge: 'user-cdn', tag: 'miss' }, 'cdn-lb', 'lb-suggest', '<lb-suggest', '<cdn-lb', '<user-cdn'],
      notes: [{ target: 'lb', text: 'any copy will do' }],
    },
    {
      caption:
        'Short prefixes such as `n` or `ne` are typed by nearly everyone, and their answers are the same for everyone. So the CDN keeps each answer for up to an hour, its time to live ([[TTL|ttl]]), and most short prefixes never reach your servers.',
      flow: ['user-cdn', { edge: 'user-cdn', reverse: true, tag: 'hit' }],
    },
    {
      caption:
        'The **browser** keeps answers too, so backspacing from `new y` to `new` costs no request at all. Since every server holds the whole index, more traffic means more identical copies, not a cleverer split.',
      focus: ['user', 'suggest'],
      notes: [{ target: 'user', text: 'answered locally' }],
    },
  ],
};

/** v3: searches flow into a log; an hourly batch rebuilds the index, and a stream catches trends. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'search', type: 'service', label: 'Search service', x: 0, y: 0 },
    { id: 'log', type: 'stream', label: 'Search log', sublabel: 'kept 7 days', x: 1, y: 0 },
    { id: 'trend', type: 'worker', label: 'Trending counter', x: 2, y: 0 },
    { id: 'counter', type: 'worker', label: 'Counting job', sublabel: 'hourly', x: 1, y: 1 },
    { id: 'suggest', type: 'service', label: 'Suggestion servers', x: 3, y: 1 },
    { id: 'counts', type: 'objectStore', label: 'Query counts', sublabel: 'decayed scores', x: 1, y: 2 },
    { id: 'builder', type: 'worker', label: 'Index builder', x: 2, y: 2 },
    { id: 'snapshots', type: 'objectStore', label: 'Index snapshots', sublabel: 'versioned', x: 3, y: 2 },
  ],
  edges: [
    { id: 'search-log', from: 'search', to: 'log', kind: 'async', label: 'searches' },
    { id: 'log-trend', from: 'log', to: 'trend', kind: 'async' },
    { id: 'log-counter', from: 'log', to: 'counter', kind: 'async' },
    { id: 'counter-counts', from: 'counter', to: 'counts', kind: 'sync' },
    { id: 'counts-builder', from: 'counts', to: 'builder', kind: 'sync' },
    { id: 'builder-snapshots', from: 'builder', to: 'snapshots', kind: 'sync' },
    { id: 'suggest-snapshots', from: 'suggest', to: 'snapshots', kind: 'sync' },
    { id: 'trend-suggest', from: 'trend', to: 'suggest', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'Every submitted search is appended to the **search log** with its query, time and language. Nothing on the search path waits for counting.',
      flow: ['search-log'],
      notes: [{ target: 'search', text: '≈ 10,000 a second' }],
    },
    {
      caption:
        'Every hour the **counting job** reads the new events in one batch ([[batch processing|batch-processing]]) and updates **query counts**, giving recent days more weight so last year’s favorites fade. Queries searched by only a handful of people are dropped, which also keeps out rare searches that could identify someone.',
      flow: ['log-counter', 'counter-counts'],
    },
    {
      caption:
        'The **index builder** reads the counts, removes blocked phrases, builds a new trie with the top 10 completions stored at every prefix, and writes it to **index snapshots** as a new version.',
      flow: ['counts-builder', 'builder-snapshots'],
      notes: [{ target: 'builder', text: 'top 10 per prefix' }],
    },
    {
      caption:
        'The **suggestion servers** load the new version in the background and switch to it in one step, a few servers at a time, so a bad build can be stopped before it reaches them all.',
      flow: ['suggest-snapshots', '<suggest-snapshots'],
    },
    {
      caption:
        'An hourly rebuild is too slow for breaking news. The **trending counter** reads the same log as a stream ([[stream processing|stream-processing]]), counts the last few minutes of queries in a small, fixed-size [[Count-Min Sketch|count-min-sketch]], and sends the fastest risers to the servers every minute, which merge them into matching prefixes.',
      flow: ['log-trend', 'trend-suggest'],
      notes: [{ target: 'trend', text: 'last 10 minutes' }],
    },
  ],
};

/** v4: what each failure does to suggestions. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'blocklist', type: 'nosqlDb', label: 'Blocklist', sublabel: 'pushed to servers', x: 3, y: 0 },
    { id: 'user', type: 'client', label: 'Browsers', x: 0, y: 1 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 1, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 2, y: 1 },
    { id: 'suggest', type: 'service', label: 'Suggestion servers', sublabel: 'two regions', x: 3, y: 1 },
    { id: 'builder', type: 'worker', label: 'Index builder', x: 2, y: 2 },
    { id: 'snapshots', type: 'objectStore', label: 'Index snapshots', sublabel: 'last 5 versions', x: 3, y: 2 },
  ],
  edges: [
    { id: 'user-cdn', from: 'user', to: 'cdn', kind: 'sync' },
    { id: 'cdn-lb', from: 'cdn', to: 'lb', kind: 'sync' },
    { id: 'lb-suggest', from: 'lb', to: 'suggest', kind: 'sync' },
    { id: 'blocklist-suggest', from: 'blocklist', to: 'suggest', kind: 'async' },
    { id: 'suggest-snapshots', from: 'suggest', to: 'snapshots', kind: 'sync' },
    { id: 'builder-snapshots', from: 'builder', to: 'snapshots', kind: 'sync' },
    { id: 'user-lb', from: 'user', to: 'lb', kind: 'sync', fromSide: 'top', toSide: 'top' },
  ],
  steps: [
    {
      caption:
        'All the **suggestion servers** hold full copies of the indexes, in at least two [[regions|region]], and the **load balancer** sends each request to any healthy one. When a server dies, [[health checks|health-check]] take it out of rotation within seconds and the others absorb its share.',
      flow: ['user-cdn', 'cdn-lb', 'lb-suggest', '<lb-suggest', '<cdn-lb', '<user-cdn'],
      notes: [{ target: 'lb', text: 'skips dead servers' }],
    },
    {
      caption:
        'The **index builder** produces a broken index, say with half the queries missing after a bad input. Checks that compare it with the previous version refuse to publish it, so the servers keep the last good snapshot; if a bad one slips through, rolling back means loading the previous version.',
      fail: ['builder'],
      flow: ['suggest-snapshots', '<suggest-snapshots'],
      notes: [{ target: 'snapshots', text: 'last good version' }],
    },
    {
      caption:
        'A harmful phrase starts showing up as a suggestion. An operator adds it to the **blocklist**, which is pushed to every server within seconds; servers drop it from every answer, and the CDN copies of the affected prefixes are purged.',
      flow: ['blocklist-suggest'],
      notes: [{ target: 'blocklist', text: 'live in seconds' }],
    },
    {
      caption:
        'The **CDN** has an outage, so browsers go straight to the load balancer and every keystroke reaches the servers, several times the usual load (ballpark). [[Autoscaling|autoscaling]] adds copies, which start in a minute or two because they only load a snapshot, and the servers skip the trending merge until they catch up.',
      fail: ['cdn'],
      add: ['user-lb'],
      flow: ['user-lb', 'lb-suggest', '<lb-suggest', '<user-lb'],
      notes: [{ target: 'lb', text: 'every keystroke', tone: 'alert' }],
    },
  ],
};

const problem: Problem = {
  id: 'search-autocomplete',
  title: 'Search autocomplete',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design the autocomplete for a search box, like the suggestions Google shows as you type. With each keystroke, the user should see the most popular searches that start with what they have typed so far.',
  concepts: ['search-inverted-indexes', 'caching', 'cdns', 'batch-vs-stream', 'probabilistic-structures', 'sharding', 'back-of-the-envelope'],
  hints: [
    'Count the work per keystroke. Finding every past query that starts with `s` and sorting them by popularity is far too slow to do while someone types, so what could you work out before anyone types at all?',
    'The answer for a given prefix is the same for everyone and changes slowly. That suggests storing the finished answer for each prefix ([[precomputation|precomputation]]) and caching it as close to the user as possible.',
    'One shape that works: log every search to a stream; rebuild an index every hour from decayed counts as a trie that stores the [[top-K|top-k]] completions at every prefix; load it into the memory of identical suggestion servers; and cache answers in the browser and on a [[content delivery network|cdn]] (CDN), with a small streaming path for trending queries.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many people search, and how fast do they type?',
      why: 'Assume 100 million daily users with 10 searches each and about 6 suggestion requests per search (ballpark): about 60,000 requests a second. A key press every 200 ms or so sets the latency budget, since suggestions slower than that arrive after the user has moved on.',
    },
    {
      q: 'What ranks the suggestions: popularity only, or also freshness and the user’s own history?',
      why: 'Popularity alone makes answers the same for everyone, so they can be computed ahead and cached at the edge. Personal history must be merged for each user, which keeps that part out of shared caches.',
    },
    {
      q: 'How fresh must suggestions be?',
      why: 'If counts from the last hour or day are fine, a batch rebuild is enough. If breaking news must appear within minutes, you add a streaming path for trending queries on top.',
    },
    {
      q: 'Do we match only the start of the query, or words in the middle, or typos?',
      why: 'Matching the start fits a trie with answers worked out ahead. Matching any word or fixing typos needs an [[inverted index|inverted-index]] or fuzzy matching, which costs much more per keystroke.',
    },
    {
      q: 'Which languages and regions, and must some suggestions never appear?',
      why: 'A separate index per language or region keeps each one small and relevant. A blocklist for hateful, dangerous or personal suggestions has to apply both when the index is built and instantly when answers are served.',
    },
    {
      q: 'How many suggestions do we show, and on which devices?',
      why: 'Usually up to 10 on the web and fewer on phones (ballpark). That number sets the size of every stored list, and so the memory the index needs.',
    },
  ],
  requirements: {
    functional: [
      'As the user types, show up to 10 suggestions that start with the typed text, ranked by popularity.',
      'Refresh the suggestions with every keystroke, including backspaces.',
      'Follow what people search for: counts refresh at least hourly, and fast-rising queries appear within minutes.',
      'Never show blocked suggestions, and remove a newly blocked one everywhere within minutes.',
      'Log each submitted search, and which suggestion was picked, to improve future rankings.',
    ],
    nonFunctional: [
      'Fast: suggestions arrive within about 100 ms at the 99th [[percentile|percentile]], with under 10 ms spent on the server (ballpark).',
      'Available, but failing quietly: if suggestions fail, the search box still works, so about 99.9% (a ballpark target) is enough.',
      'Scale: about 60,000 suggestion requests a second, 120,000 at peak, and 10,000 logged searches a second (ballpark).',
      'Slightly stale is fine: counts may be an hour old and approximate.',
      'Private: never suggest a query so rare that it could reveal what one person searched for.',
    ],
    outOfScope: [
      'Spelling correction, and matching words in the middle of a query.',
      'Suggestions from the user’s own history, beyond noting where they would be merged in.',
      'The search results page itself.',
      'Ranking suggestions with machine-learned models.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '100 million (ballpark)' },
      { label: 'Searches per user per day', value: '10' },
      { label: 'Suggestion requests per search', value: 'about 6, after waiting for pauses in typing' },
      { label: 'Bytes logged per search', value: 'about 100: query text, time and language' },
      { label: 'Response size', value: 'about 1 KB: 10 suggestions plus headers' },
      { label: 'Queries kept in the index', value: 'the 50 million most popular, about 20 characters each' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'In the calculator', value: 'a suggestion request is a read and a logged search a write. Multiply its outgoing bandwidth by 10, since responses are 1 KB, and divide its yearly storage by 12, since raw logs are kept 30 days' },
    ],
    steps: [
      { label: 'Suggestion requests per second', math: '10⁸ users × 10 searches × 6 = 6 × 10⁹ a day; ÷ 10⁵ seconds a day', result: '≈ 60,000 a second, 120,000 at peak' },
      { label: 'Searches logged per second', math: '10⁸ × 10 = 10⁹ a day; ÷ 10⁵ seconds', result: '≈ 10,000 a second, 20,000 at peak' },
      { label: 'Raw log storage', math: '10⁹ searches × 100 bytes = 100 GB a day; × 30 days', result: '≈ 3 TB' },
      { label: 'Prefixes in the trie', math: '5 × 10⁷ queries × 20 characters = 10⁹ at most; shared prefixes cut that to maybe a third', result: '≈ 3 × 10⁸ nodes (ballpark)' },
      { label: 'Index memory', math: '3 × 10⁸ nodes × (10 suggestions × 4-byte identifiers (IDs) + about 50 bytes of node overhead), plus 1 GB of query text', result: '≈ 30 GB: fits in one server’s memory' },
      { label: 'Suggestion servers', math: '120,000 requests a second ÷ about 20,000 per server (ballpark)', result: '≈ 6, so about 10 per region with headroom' },
      { label: 'Outgoing bandwidth', math: '120,000 a second × 1 KB = 120 MB a second; × 8 bits per byte', result: '≈ 1 gigabit a second at peak: small' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 70, readsPerWrite: 6, objectBytes: 100, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'GET /v1/suggest?q=new%20y&lang=en&limit=10  →  200 { suggestions: ["new york weather", "new year", …] }',
      description:
        'The whole public application programming interface (API) for typing: it returns the stored list for that prefix, after lowercasing it and trimming extra spaces. The response carries a [[Cache-Control header|cache-control]] of up to an hour, so browsers and the CDN can reuse it.',
    },
    {
      signature: 'POST /v1/search-events  { query, typedPrefix, pickedSuggestion?, lang }  →  202 Accepted',
      description: 'Logs a submitted search. The search page sends it once per search, not per keystroke, and never waits for it.',
    },
    {
      signature: 'loadSnapshot(version, location)  →  ok | rejected',
      description:
        'Internal: tells a suggestion server to load a new index version in the background, check it, and switch to it in one step. Rolling back is loading an older version.',
    },
    {
      signature: 'POST /v1/admin/blocklist  { phrase, reason }  →  201 Created',
      description: 'Adds a phrase to the blocklist. Every suggestion server applies it within seconds, and the CDN copies of affected prefixes are purged.',
    },
  ],
  dataModel: [
    {
      entity: 'Search event',
      fields: ['query: normalized text', 'typed_prefix', 'picked_suggestion (or null)', 'lang, country', 'timestamp'],
      store: 'Event stream such as Kafka, then files in object storage kept 30 days',
      why: 'Searches arrive at about 10,000 a second (ballpark) and are only ever read in bulk by jobs. An [[event stream|event-stream]] separates searching from counting, and the files let you recount after a bug.',
    },
    {
      entity: 'Query count',
      fields: ['lang (partition key)', 'query', 'score: decayed count', 'distinct_users', 'last_seen'],
      store: 'Files in object storage, rewritten by the counting job',
      why: 'The counting job rewrites every score each hour and the index builder reads them all at once. Nothing reads one row at a time, so cheap bulk storage fits.',
    },
    {
      entity: 'Trie node',
      fields: ['children: map from next character to node', 'top: up to 10 (query_id, score), best first'],
      store: 'Memory of each suggestion server, loaded from a snapshot file',
      why: 'Finding a prefix walks one node per character, and the answer is already stored at that node, so a lookup takes microseconds. Lists hold query IDs rather than text, which keeps the index near 30 GB (ballpark).',
    },
    {
      entity: 'Query text',
      fields: ['query_id', 'text'],
      store: 'The same snapshot',
      why: 'A popular query appears in up to 20 lists, one for each of its prefixes, so storing its text once and pointing to it saves most of the memory.',
    },
    {
      entity: 'Index snapshot',
      fields: ['version', 'lang', 'built_at', 'file location, checksum'],
      store: 'Object storage, with the last few versions kept',
      why: 'A [[snapshot|snapshot]] never changes once written, so a server can load any version, and rolling back means loading the previous one.',
    },
    {
      entity: 'Blocklist entry',
      fields: ['phrase or pattern', 'reason', 'added_by, added_at'],
      store: 'A small replicated store whose changes are pushed to every server',
      why: 'The builder applies it to every new index and the servers apply it to every answer, so a new entry takes effect in seconds without waiting for a rebuild.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Show the most popular earlier searches that start with what the user typed, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One table of queries and counts works for a small site. It breaks on short prefixes, where each keystroke reads and sorts millions of rows, and on popular queries, whose count rows are updated thousands of times a second.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 120,000 suggestion requests a second at peak (ballpark), each answered before the next key press.',
      diagram: v2,
      explanation:
        'All the expensive work, counting and sorting, now happens before anyone types, and a request is a short walk down a tree in memory. The whole index fits in one machine’s memory, so the service grows by adding identical copies, while browsers and the CDN absorb the most common prefixes.',
    },
    {
      title: 'v3: Fresh suggestions',
      solves: 'Popularity changes: new products, events and news must appear in suggestions, and stale ones must fade.',
      diagram: v3,
      explanation:
        'Counting moves to batches read from a log, so the search path never waits for it, and each hourly build produces a complete new index that servers swap in at once. A small streaming path catches breaking news within minutes, and decay lets old favorites fade.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead server, a bad index build, a harmful suggestion or a CDN outage must not break the search box or embarrass anyone.',
      diagram: v4,
      explanation:
        'Serving depends only on a snapshot in memory, so failures elsewhere make suggestions stale, never missing. Builds are checked and versioned, and the blocklist acts in seconds. If everything fails, the search box simply shows no suggestions while search itself still works ([[graceful degradation|graceful-degradation]]).',
    },
  ],
  deepDives: [
    {
      title: 'Finding the top suggestions for a prefix',
      problem:
        'The prefix `s` matches millions of past queries, and the user wants the 10 most popular within a few milliseconds of server time. Sorting every match on every keystroke is far too slow, so the question is how much to work out ahead.',
      options: {
        caption: 'Four ways to answer “top 10 starting with this”',
        rows: [
          {
            option: 'Database range scan and sort',
            goodAt: 'Nothing to build: an index on the query text finds the matches, and counts are always current.',
            badAt: 'Short prefixes match millions of rows that must be read and sorted on every keystroke.',
            pickWhen: 'A small catalog, such as a few thousand product names.',
          },
          {
            option: 'Trie, searched at request time',
            goodAt: 'Walking to the prefix node is fast, and the tree stores each shared prefix once.',
            badAt: 'Collecting and sorting everything below a short prefix still visits millions of nodes.',
            pickWhen: 'Long prefixes only, or small trees.',
          },
          {
            option: 'Trie with the top 10 stored at every node',
            goodAt: 'A lookup walks one node per character and returns a ready list: microseconds, whatever the prefix.',
            badAt: 'Every node stores a list, so memory grows, and changing one count means rebuilding lists all the way up the tree.',
            pickWhen: 'The default: answers worked out ahead and rebuilt in batches.',
          },
          {
            option: 'Prefix table in a key-value store',
            goodAt: 'Every prefix up to a length limit maps straight to its list, which is easy to shard by hashing the prefix.',
            badAt: 'Stores every prefix’s list in full with no shared structure, so it needs more memory.',
            pickWhen: 'The index outgrows one machine’s memory.',
          },
        ],
      },
      recommendation:
        'Build a trie offline with the top 10 suggestions stored at every node, for prefixes up to about 20 characters (ballpark); longer inputs are rare and can fall back to searching below the node. Store query IDs in the lists and each text once, which keeps the index near 30 GB. If it outgrows memory, switch to a prefix table sharded by a hash of the prefix: the same lists, spread over machines.',
    },
    {
      title: 'Keeping suggestions fresh',
      problem:
        'Counts change constantly, but rebuilding a 30 GB index (ballpark) is a big job. Most suggestions stay the same for days, while a few, such as breaking news, rise in minutes.',
      options: {
        caption: 'How often to update the index',
        rows: [
          {
            option: 'Daily batch rebuild',
            goodAt: 'Simple and cheap, and every build can be checked before it ships.',
            badAt: 'News takes up to a day to appear.',
            pickWhen: 'Catalogs that change slowly, such as product names.',
          },
          {
            option: 'Hourly batch rebuild',
            goodAt: 'Fresh enough for most searches, with the same checks before each build ships.',
            badAt: 'More computing, and still too slow for events that take off in minutes.',
            pickWhen: 'The default for the main index.',
          },
          {
            option: 'Streaming trending overlay',
            goodAt: 'Counts the last few minutes in a small sketch and pushes the fastest risers to servers every minute.',
            badAt: 'Approximate counts, a merge at serving time, and a faster route for unsafe queries to slip in.',
            pickWhen: 'On top of the batch index, for breaking news.',
          },
          {
            option: 'Update the live trie on every search',
            goodAt: 'Always current.',
            badAt: 'Every search writes to every server’s tree, popular nodes are rewritten constantly, and nothing is checked before users see it.',
            pickWhen: 'Rarely: small indexes with little traffic.',
          },
        ],
      },
      recommendation:
        'Rebuild the main index hourly from decayed counts, so a query’s score halves every few days (ballpark) and old favorites fade. Add the streaming overlay for fast risers over the last 10 minutes, filtered by the blocklist and a minimum number of distinct users, and merge it into matching prefixes when serving. This is the [[lambda architecture|lambda-architecture]] in miniature: an exact batch path plus a fast, approximate one.',
    },
    {
      title: 'Answering before the next keystroke',
      problem:
        'With a key press every 200 ms or so (ballpark), a suggestion that takes longer is useless. Distance dominates: the lookup itself takes microseconds, but a round trip across a continent takes tens of milliseconds.',
      options: {
        caption: 'Ways to cut latency and load',
        rows: [
          {
            option: 'Wait for a pause in typing',
            goodAt: 'Asking only after typing pauses for about 50 ms (ballpark) skips requests for letters typed in a burst.',
            badAt: 'Adds that pause to every suggestion.',
            pickWhen: 'Always, with a short pause.',
          },
          {
            option: '[[Browser cache|browser-cache]]',
            goodAt: 'Backspacing and retyping cost nothing, since answers stay in the browser for minutes.',
            badAt: 'Helps only one user, and only for prefixes they have already typed.',
            pickWhen: 'Always: give every response a cache lifetime.',
          },
          {
            option: 'CDN edge cache',
            goodAt: 'Answers short, common prefixes near the user, for everyone, without touching your servers.',
            badAt: 'Works only for answers that are the same for everyone, and a blocked suggestion lingers until it is purged.',
            pickWhen: 'Suggestions ranked by popularity alone, with traffic from around the world.',
          },
          {
            option: 'Prefetch on page load',
            goodAt: 'Sends the lists for every one- and two-letter prefix with the page, so the first keystrokes need no request.',
            badAt: 'A heavier page for visitors who never type.',
            pickWhen: 'A search box that most visitors use.',
          },
        ],
      },
      recommendation:
        'Combine them: wait for a short pause, cache every response in the browser and at the CDN for up to an hour with the language plus the normalized prefix as the [[cache key|cache-key]], and run suggestion servers in several regions near users. Keep personal suggestions out of shared caches by merging the user’s own history in the browser. With most short prefixes answered at the edge, servers mainly handle longer, rarer prefixes.',
    },
    {
      title: 'Scaling the index: copy or split',
      problem:
        'Each request must be answered for any prefix. Whether one machine can hold the whole index decides whether you add copies or split the data.',
      options: {
        caption: 'Ways to spread the index over machines',
        rows: [
          {
            option: 'Full copy on every server',
            goodAt: 'Any server answers any request, so adding copies adds capacity, and losing one costs nothing.',
            badAt: 'Works only while the index fits in one machine’s memory, and every copy must load each new version.',
            pickWhen: 'The index is tens of gigabytes: the default here.',
          },
          {
            option: 'Shard by first letters',
            goodAt: 'Each request goes to exactly one shard, chosen from the prefix.',
            badAt: 'Very uneven: far more queries start with s than with x, so a few shards get most of the traffic ([[hot spot|hot-spot]]).',
            pickWhen: 'Rarely, unless the ranges are drawn from measured traffic.',
          },
          {
            option: 'Shard by a hash of the prefix',
            goodAt: 'Spreads data and traffic evenly, and each prefix’s list lives on one shard.',
            badAt: 'Needs the prefix-table form, since a tree can’t be split by hash, and more machines to run.',
            pickWhen: 'The index outgrows memory, such as many languages in one index.',
          },
          {
            option: 'Split by language or region',
            goodAt: 'Each index stays small and relevant, and its servers sit near their users.',
            badAt: 'More indexes to build and check.',
            pickWhen: 'Always, before any other split.',
          },
        ],
      },
      recommendation:
        'Build one index per language or region and give each suggestion server a full copy, adding copies as traffic grows: at about 30 GB (ballpark), the index fits comfortably in memory. Only if an index outgrows one machine, move to a prefix table sharded by hash, with each shard replicated. Hot prefixes are no problem either way, since every copy can answer them and the CDN absorbs most of them.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 1.2 million suggestion requests a second at peak (ballpark).',
      impact: 'Servers run out of headroom and latency climbs past the gap between keystrokes, so suggestions arrive too late to use.',
      mitigation:
        'Add copies, since every server is identical, and lengthen browser and CDN cache lifetimes. Under pressure, servers return shorter lists or skip the trending merge ([[load shedding|load-shedding]]).',
    },
    {
      scenario: '100× on one prefix: millions type the same new name within minutes.',
      impact: 'The hourly index doesn’t know the name yet, so suggestions miss the very thing everyone is looking for.',
      mitigation: 'The streaming overlay catches it within a minute or two, and the CDN’s short cache lifetime lets the new answer reach the edges quickly.',
    },
    {
      scenario: 'A suggestion server dies.',
      impact: 'Requests in flight fail, and those users see no suggestions for a keystroke or two.',
      mitigation: 'Health checks take it out within seconds while the others, holding full copies, take its share. A replacement starts by loading the latest snapshot, in a minute or two (ballpark).',
    },
    {
      scenario: 'The index build produces a broken index.',
      impact: 'If it shipped, every user could see missing, wrong or offensive suggestions at once.',
      mitigation:
        'Compare each build with the last before publishing: its size, and the top suggestions for common prefixes. Ship it to a few servers first ([[canary release|canary-release]]), and roll back by loading the previous snapshot.',
    },
    {
      scenario: 'The search log or the counting job stops.',
      impact: 'Suggestions slowly go stale but keep working from the last snapshot.',
      mitigation: 'Alert on the age of the newest snapshot and on [[consumer lag|consumer-lag]]. When the job recovers, it catches up from the log, which keeps a week of events.',
    },
    {
      scenario: 'A harmful or defamatory phrase becomes a popular suggestion.',
      impact: 'Everyone who types the prefix sees it, and copies sit in browser and CDN caches.',
      mitigation:
        'Add it to the blocklist, which servers apply within seconds, [[purge|purge]] the affected prefixes from the CDN, and keep browser cache lifetimes short enough that the remaining copies expire within minutes.',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'Users there lose suggestions until their traffic moves.',
      mitigation:
        'Send them to the next region with failover in the Domain Name System ([[DNS failover|dns-failover]]). Each region holds full copies of every index, so suggestions keep working, just a little slower.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates collecting counts from serving suggestions, and returns the most popular completions of a prefix.',
        'Knows that a trie, or an index on the query text, finds matches by prefix.',
        'Adds a cache for popular prefixes.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Stores the top 10 at every prefix so a lookup does no sorting, and estimates the index size.',
        'Moves counting to a batch job fed by a log, with a rebuild schedule and versioned snapshots.',
        'Uses typing pauses, browser caching and a CDN to keep each request within the keystroke budget.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Chooses between copying and sharding from the memory estimate, and splits by language or region first.',
        'Adds a streaming path for trending queries with decay, and weighs freshness against checking each build.',
        'Raises safety and privacy unprompted: a blocklist that acts in seconds, minimum counts so rare queries never surface, and rollback for a bad build.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A name starts trending, but your index rebuilds hourly. How do suggestions catch up?',
      a: 'A streaming job counts the last few minutes of searches in a Count-Min Sketch and pushes the fast risers to servers every minute, after the blocklist and a minimum count. The servers merge them into the lists for matching prefixes, and the CDN’s short cache lifetime lets the edges pick them up within minutes too.',
    },
    {
      q: 'How much memory does the index need, and what if it doesn’t fit on one machine?',
      a: 'About 300 million prefixes with 10 IDs each, plus node overhead and the query text, is about 30 GB (ballpark): one machine’s memory, so I copy it to every server. If it grew several times larger, I’d first split by language, then switch to a prefix table sharded by a hash of the prefix, with each shard replicated.',
    },
    {
      q: 'Someone reports an offensive suggestion. How fast can you remove it?',
      a: 'Within seconds on the servers: the phrase goes into the blocklist, which every server applies to each answer. I purge the affected prefixes from the CDN, browser copies expire within their short lifetime, and the next build drops it at the source.',
    },
    {
      q: 'Could autocomplete leak what one person searched for?',
      a: 'Yes, if rare queries become suggestions, such as a name next to a medical condition. I include only queries searched by many distinct users, say at least 50 (ballpark), drop anything that looks like an email address or phone number, and keep personal history out of shared caches.',
    },
    {
      q: 'How would you add the user’s own recent searches?',
      a: 'Keep them on the device, or fetch them once per session from a small per-user store, and merge them above the shared suggestions in the browser. The shared answers stay identical for everyone, so the CDN can still cache them.',
    },
    {
      q: 'The CDN just went down. What happens?',
      a: 'Every keystroke now reaches the servers, several times the usual load (ballpark). Browser caches still help, and autoscaling adds copies that start in a minute or two by loading a snapshot. Meanwhile the servers can skip the trending merge and return fewer suggestions, and the search box keeps working even if suggestions vanish.',
    },
  ],
  rubric: [
    { item: 'Estimated requests per second and index memory, and set a latency budget from typing speed', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Stored the top suggestions at every prefix instead of sorting on each request', weight: 25, lessonId: 'search-inverted-indexes' },
    { item: 'Built the index offline from logged searches, as versioned snapshots the servers swap in', weight: 15, lessonId: 'batch-vs-stream' },
    { item: 'Cached answers in the browser and at the CDN, and waited for pauses in typing', weight: 20, lessonId: 'caching' },
    { item: 'Kept suggestions fresh with decay and a streaming path for trending queries', weight: 10, lessonId: 'probabilistic-structures' },
    { item: 'Chose copies or shards from the index size, after splitting by language or region', weight: 10, lessonId: 'sharding' },
    { item: 'Handled safety and failure: a blocklist that acts in seconds, rollback of bad builds, search that works without suggestions', weight: 10, lessonId: 'zero-downtime-deploys' },
  ],
};

export default problem;
