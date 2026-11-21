import type { DiagramSpec, Problem } from '../types';

/** v1: one machine. An indexer builds the inverted index and stores page text; a search service merges lists and ranks. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'crawler', type: 'external', label: 'Crawler', sublabel: 'fetched pages', x: 0, y: 0 },
    { id: 'indexer', type: 'worker', label: 'Indexer', x: 1, y: 0 },
    { id: 'index', type: 'search', label: 'Inverted index', sublabel: 'word → pages', x: 1, y: 1 },
    { id: 'docs', type: 'nosqlDb', label: 'Document store', sublabel: 'page text', x: 2, y: 1 },
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 2 },
    { id: 'search', type: 'service', label: 'Search service', x: 1, y: 2 },
  ],
  edges: [
    { id: 'crawler-indexer', from: 'crawler', to: 'indexer', kind: 'async' },
    { id: 'indexer-index', from: 'indexer', to: 'index', kind: 'sync' },
    { id: 'indexer-docs', from: 'indexer', to: 'docs', kind: 'sync' },
    { id: 'users-search', from: 'users', to: 'search', kind: 'sync' },
    { id: 'search-index', from: 'search', to: 'index', kind: 'sync' },
    { id: 'search-docs', from: 'search', to: 'docs', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The **crawler** hands over each fetched page. The **indexer** strips the markup, splits the text into words, lowercases and stems them, and saves the page’s text in the **document store** for snippets.',
      flow: ['crawler-indexer', 'indexer-docs'],
    },
    {
      caption:
        'For each word, the indexer adds the page’s ID to that word’s posting list in the **inverted index**, with how often and where the word appears. Lists stay sorted by page ID, so two lists can be merged in one pass.',
      flow: ['crawler-indexer', 'indexer-index'],
      notes: [{ target: 'crawler', text: 'page 7' }],
    },
    {
      caption:
        'Someone searches “tide tables”. The **search service** fetches both lists, walks them side by side to keep the pages on both, and scores each match with BM25, which rewards words that are frequent in a page and rare across the collection.',
      flow: ['users-search', 'search-index', '<search-index'],
    },
    {
      caption:
        'For the ten best pages it reads titles and text from the **document store**, cuts a snippet around the query words, and returns the results page.',
      flow: ['search-docs', '<search-docs', { edge: 'users-search', reverse: true, tag: 'top 10' }],
    },
  ],
};

/** v2: the index split by page into 200 shards; a query root checks a cache, scatters, merges and fetches snippets. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'cache', type: 'cache', label: 'Results cache', sublabel: 'minutes', x: 1, y: 0 },
    { id: 'shard1', type: 'search', label: 'Index shard 1', sublabel: '50 million pages', x: 2, y: 0 },
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'root', type: 'service', label: 'Query root', sublabel: 'scatter, merge', x: 1, y: 1 },
    { id: 'shard2', type: 'search', label: 'Index shard 2', x: 2, y: 1 },
    { id: 'docs', type: 'nosqlDb', label: 'Document store', sublabel: 'snippets', x: 1, y: 2 },
    { id: 'shardN', type: 'search', label: 'Index shard 200', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-root', from: 'users', to: 'root', kind: 'sync' },
    { id: 'root-cache', from: 'root', to: 'cache', kind: 'sync' },
    { id: 'root-shard1', from: 'root', to: 'shard1', kind: 'sync' },
    { id: 'root-shard2', from: 'root', to: 'shard2', kind: 'sync' },
    { id: 'root-shardN', from: 'root', to: 'shardN', kind: 'sync' },
    { id: 'root-docs', from: 'root', to: 'docs', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Ten billion pages make an index of about 20 TB (ballpark), far more than one machine can search quickly. It is split by page into 200 shards: each **index shard** holds the complete posting lists for its own 50 million pages, chosen by a hash of each page’s address.',
      focus: ['shard1', 'shard2', 'shardN'],
    },
    {
      caption:
        'A query reaches the **query root**, which first checks the **results cache**. Popular queries repeat, and an answer a few minutes old is fine for most of them.',
      flow: ['users-root', 'root-cache', { edge: 'root-cache', reverse: true, tag: 'miss' }],
    },
    {
      caption:
        'On a miss, the root sends the query to every shard at once, a [[scatter-gather|scatter-gather]]. Each shard finds and scores its own matches and returns only its best 50 or so; the root merges about 10,000 candidates and re-ranks the best few hundred with a costlier model.',
      flow: ['users-root', ['root-shard1', 'root-shard2', 'root-shardN'], ['<root-shard1', '<root-shard2', '<root-shardN']],
    },
    {
      caption:
        'The root fetches snippets for the final ten from the **document store** and answers. Every shard sees every query, so each shard runs about 50 copies (ballpark) to share 100,000 queries a second at peak.',
      flow: ['root-docs', '<root-docs', { edge: 'users-root', reverse: true, tag: 'top 10' }],
    },
  ],
};

/** v3: freshness. A weekly batch rebuild of the base index, plus fresh segments every minute from a stream of changed pages. */
const v3: DiagramSpec = {
  grid: { cols: 5, rows: 3 },
  nodes: [
    { id: 'archive', type: 'objectStore', label: 'Page archive', sublabel: 'every fetched page', x: 1, y: 0 },
    { id: 'batch', type: 'worker', label: 'Batch indexer', sublabel: 'weekly rebuild', x: 2, y: 0 },
    { id: 'crawler', type: 'external', label: 'Crawler', x: 0, y: 1 },
    { id: 'shards', type: 'search', label: 'Index shards', sublabel: 'base + fresh', x: 3, y: 1 },
    { id: 'root', type: 'service', label: 'Query root', x: 4, y: 1 },
    { id: 'stream', type: 'stream', label: 'Changed pages', x: 1, y: 2 },
    { id: 'fresh', type: 'worker', label: 'Fresh indexer', sublabel: 'every minute', x: 2, y: 2 },
  ],
  edges: [
    { id: 'crawler-archive', from: 'crawler', to: 'archive', kind: 'async' },
    { id: 'crawler-stream', from: 'crawler', to: 'stream', kind: 'async' },
    { id: 'archive-batch', from: 'archive', to: 'batch', kind: 'async' },
    { id: 'stream-fresh', from: 'stream', to: 'fresh', kind: 'async' },
    { id: 'batch-shards', from: 'batch', to: 'shards', kind: 'async' },
    { id: 'fresh-shards', from: 'fresh', to: 'shards', kind: 'async' },
    { id: 'root-shards', from: 'root', to: 'shards', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The **crawler** stores every fetched page in the **page archive** and publishes each new or changed one to the **changed pages** stream: about a billion a day, or 10,000 a second (ballpark).',
      flow: [['crawler-archive', 'crawler-stream']],
    },
    {
      caption:
        'About once a week (ballpark), the **batch indexer** rebuilds every shard’s base index from the whole archive, computing link-based quality scores such as PageRank on the way. New shard files replace old ones one group of copies at a time, so serving never stops.',
      flow: ['archive-batch', 'batch-shards'],
    },
    {
      caption:
        'Meanwhile the **fresh indexer** turns each minute’s changed pages into small index segments and ships each to the shard that owns those pages. A query searches its shard’s big base index and the few fresh segments, then merges the results.',
      flow: ['stream-fresh', 'fresh-shards', 'root-shards', '<root-shards'],
    },
    {
      caption:
        'When a page changes or disappears, its old copy in the base index isn’t rewritten: a bit in a per-shard bitmap marks it deleted, and queries skip it. Small segments merge into larger ones in the background, and the next weekly rebuild drops deleted copies for good.',
      flow: ['stream-fresh', 'fresh-shards'],
      notes: [{ target: 'fresh', text: 'marks old copy' }],
    },
  ],
};

/** v4: slow and failed shards. Deadlines, a hedged request to another copy, and partial results. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 's1a', type: 'search', label: 'Shard 1, copy A', x: 2, y: 0 },
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'root', type: 'service', label: 'Query root', sublabel: '150 ms deadline', x: 1, y: 1 },
    { id: 's1b', type: 'search', label: 'Shard 1, copy B', x: 2, y: 1 },
    { id: 'rest', type: 'search', label: 'Shards 2 to 200', sublabel: 'many copies each', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-root', from: 'users', to: 'root', kind: 'sync' },
    { id: 'root-s1a', from: 'root', to: 's1a', kind: 'sync' },
    { id: 'root-s1b', from: 'root', to: 's1b', kind: 'sync' },
    { id: 'root-rest', from: 'root', to: 'rest', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each query goes to one copy of every shard, and the answer waits for the slowest. If each shard is slow one time in a hundred, about 87% of queries meet at least one slow shard, so the **query root** gives every shard a deadline, here 150 ms (ballpark).',
      flow: ['users-root', ['root-s1a', 'root-rest'], ['<root-s1a', '<root-rest'], '<users-root'],
    },
    {
      caption:
        'Copy A of shard 1 is slow, perhaps paused for garbage collection. When it hasn’t answered by the time 95% of shard requests usually take, the root sends the same request to **copy B**, a [[hedged request|hedged-request]], and uses whichever answer comes first.',
      flow: ['users-root', ['root-s1a', 'root-rest'], '<root-rest', 'root-s1b', '<root-s1b', '<users-root'],
      notes: [{ target: 's1a', text: 'slow', tone: 'alert' }],
    },
    {
      caption:
        'Copy A crashes. [[Health checks|health-check]] take it out of rotation within seconds, and the other copies of shard 1 share its queries; with about 50 copies per shard (ballpark), losing one costs 2% of that shard’s capacity.',
      fail: ['s1a'],
      flow: ['users-root', ['root-s1b', 'root-rest'], ['<root-s1b', '<root-rest'], '<users-root'],
    },
    {
      caption:
        'If every copy of shard 1 is down or late, the root returns what the other 199 shards found, missing half a percent of the web, instead of an error page. It marks the answer as partial so it isn’t cached as complete.',
      fail: ['s1a', 's1b'],
      flow: ['users-root', 'root-rest', '<root-rest', { edge: 'users-root', reverse: true, tag: 'partial' }],
    },
  ],
};

const problem: Problem = {
  id: 'search-engine',
  title: 'Search engine',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a web search engine like Google or Bing. Someone types a few words, and within a fraction of a second gets the ten most relevant pages out of billions, including pages published minutes ago.',
  concepts: ['back-of-the-envelope', 'search-inverted-indexes', 'sharding', 'replication', 'caching', 'batch-vs-stream', 'percentiles-tail-latency'],
  hints: [
    'Start with the data structure that makes text search fast: instead of reading pages at query time, record ahead of time which pages contain each word, an [[inverted index|inverted-index]]. How big is that index for billions of pages, and can one machine hold it?',
    'The index has to be split across many machines, and there are two natural ways to split it. Think about how many machines each query must touch under each, what happens to a very common word, and how a page published a minute ago gets in without rebuilding everything.',
    'One shape that works: split the index by page into a few hundred [[shards|sharding]], each with many copies; a query root checks a results cache, sends the query to every shard with a deadline, merges their top matches and re-ranks the best few hundred with a costlier model; and freshness comes from a weekly batch rebuild plus small segments added every minute from a stream of changed pages.',
  ],
  clarifyingQuestions: [
    {
      q: 'Is this web search across billions of pages, or search within one site?',
      why: 'Web scale changes everything. Assume 10 billion pages (ballpark) and a crawler that already fetches them; a site with a few million documents fits on one ordinary [[search engine|search-engine]] cluster such as Elasticsearch.',
    },
    {
      q: 'How many searches, and how fast must results appear?',
      why: 'Assume 5 billion searches a day, 100,000 a second at peak, and about 200 ms at the server for 99% of queries (ballpark). That budget forces a deadline on every stage and an index held in memory or on fast solid-state drives (SSD).',
    },
    {
      q: 'How fresh must results be?',
      why: 'Breaking news needs minutes, while most pages can wait days. That splits indexing in two: a slow, complete batch rebuild and a fast path for new and changed pages.',
    },
    {
      q: 'What makes a result good: matching words only, or also page quality, freshness and what people click?',
      why: 'Word matching alone ranks spam and copied pages highly. Quality signals, such as links between pages, are computed offline in batch jobs, and the costliest ranking models can afford only a few hundred candidates per query.',
    },
    {
      q: 'Do we need exact phrases, spelling correction and many languages?',
      why: 'Exact phrases need each word’s positions in the index, which makes it larger. Spelling fixes and synonyms rewrite the query before lookup, and each language needs its own [[tokenization|tokenization]] and [[stemming|stemming]].',
    },
    {
      q: 'Are results personalized, for example by location?',
      why: 'Personal results can’t be shared from a cache, which lowers the [[hit ratio|hit-ratio]], and location-dependent results need the location in the cache key. Assume light personalization only: language and country.',
    },
  ],
  requirements: {
    functional: [
      'Answer a text query with the ten most relevant pages, each with a title, web address and a snippet showing the query words in context.',
      'Support exact phrases in quotes and fix obvious spelling mistakes in the query.',
      'Add new and changed pages from the crawler, and drop removed ones, without taking search offline.',
      'Page through further results.',
    ],
    nonFunctional: [
      'Fast: about 200 ms at the server for 99% of queries (ballpark).',
      'Highly available, around 99.99% (a ballpark target): losing a machine, or even a whole shard, makes results slightly less complete rather than failing them.',
      'Fresh: important new pages, such as news, searchable within minutes; everything else within a few days (ballpark).',
      'Scale: about 10 billion pages and 100,000 queries a second at peak (ballpark).',
    ],
    outOfScope: [
      'Crawling the web: assume a crawler delivers fetched pages with their links, since that is its own problem.',
      'Ads, suggestions as you type, and image or video search.',
      'Fighting spam in depth, beyond a spam score that ranking can use.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Pages in the index', value: '10 billion (ballpark)' },
      { label: 'Text per page once markup is stripped', value: 'about 10 KB, roughly 1,000 words' },
      { label: 'Index bytes per word occurrence', value: 'about 2 after compression, positions included (ballpark)' },
      { label: 'Searches per day', value: '5 billion (ballpark)' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'New or changed pages per day', value: 'about 1 billion (ballpark)' },
      { label: 'Queries one copy of a shard can serve', value: 'about 2,000 a second (ballpark)' },
      {
        label: 'In the calculator',
        value: 'a search counts as a read and a changed page as a write: 1 billion users with 6 actions each gives 5 billion searches and 1 billion page updates; ignore the yearly storage line, since changed pages replace old copies',
      },
    ],
    steps: [
      { label: 'Queries per second', math: '5 × 10⁹ ÷ 10⁵ seconds', result: '≈ 50,000 a second, 100,000 at peak' },
      { label: 'Stored text', math: '10¹⁰ pages × 10 KB', result: '≈ 100 TB, read only for snippets' },
      { label: 'Index size', math: '10¹⁰ pages × 1,000 words × 2 bytes', result: '≈ 20 TB' },
      { label: 'Shards', math: '20 TB ÷ about 100 GB per shard, held in memory or on fast drives', result: '≈ 200 shards of 50 million pages each' },
      { label: 'Copies of each shard', math: '100,000 queries a second ÷ 2,000 per copy', result: '≈ 50 copies: about 10,000 index servers in all' },
      { label: 'Indexing rate', math: '10⁹ changed pages ÷ 10⁵ seconds', result: '≈ 10,000 pages a second into fresh segments' },
    ],
    calculator: { dau: 1_000_000_000, actionsPerUser: 6, readsPerWrite: 5, objectBytes: 10_000, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'GET /search?q=tide+tables&page=1&lang=en  →  200 { results: [{ title, address, snippet }], partial }',
      description:
        'The search itself. `partial` is true when a shard missed its deadline; such answers are shown but never cached.',
    },
    {
      signature: 'searchShard(query, k = 50, deadlineMs)  →  [{ pageId, score }]',
      description:
        'What the root sends every shard: return your best `k` matches by the first-stage score before the deadline. Every shard runs the same code over its own pages.',
    },
    {
      signature: 'indexPage({ pageId, address, text, links, fetchedAt })  →  accepted',
      description: 'How the fresh indexer takes in a new or changed page. The page is searchable once the next fresh segment ships, about a minute later (ballpark).',
    },
    {
      signature: 'removePage(pageId, reason)  →  ok',
      description:
        'Removes a page at once, for example after a legal request: the root filters it from every answer, cached results containing it are purged, and shards mark it deleted.',
    },
  ],
  dataModel: [
    {
      entity: 'Posting list',
      fields: ['term (key)', 'page_ids: sorted, stored as gaps', 'frequencies', 'positions, for phrases'],
      store: 'Index shard files, held in memory or on fast solid-state drives on every copy of the shard',
      why: 'Each word maps to the pages that contain it, as a [[posting list|posting-list]] sorted by page identifier (ID), so two lists intersect in one pass and compress well as small gaps. Positions make exact phrases possible, at the cost of a larger index.',
    },
    {
      entity: 'Page',
      fields: ['page_id', 'address', 'title', 'text, compressed', 'language', 'fetched_at'],
      store: 'A wide-column store such as Bigtable or Cassandra, sharded by page ID like the index',
      why: 'Snippets need the stored text of only ten pages per query, each a lookup by key. Sharding it the same way as the index keeps a page’s text near its postings.',
    },
    {
      entity: 'Page signals',
      fields: ['page_id', 'pagerank', 'spam_score', 'freshness', 'language, country'],
      store: 'Arrays inside each index shard, one entry per page, rebuilt by batch jobs',
      why: 'Ranking reads these for every candidate, so they sit in memory next to the postings. They change slowly enough to compute offline, the link graph being a classic [[batch processing|batch-processing]] job.',
    },
    {
      entity: 'Fresh segment',
      fields: ['segment_id', 'shard_id', 'min_fetched_at, max_fetched_at', 'postings', 'deleted_bitmap'],
      store: 'Memory and local disk on every copy of its shard',
      why: 'Small, recent indexes are searched next to the base and merged into bigger ones in the background, so new pages appear within minutes without rewriting the base.',
    },
    {
      entity: 'Cached result',
      fields: ['key: normalized query, language, country, page', 'results: top 10 with snippets', 'expires_at'],
      store: 'A distributed in-memory cache such as Memcached',
      why: 'Popular queries repeat, so a cached answer skips 200 shards of work. Lifetimes of a few minutes keep results fresh, and shorter ones apply to trending queries.',
    },
    {
      entity: 'Changed page event',
      fields: ['page_id', 'address', 'change: new | updated | removed', 'fetched_at'],
      store: 'An [[event stream|event-stream]] such as Kafka, partitioned by page ID and kept for a few days',
      why: 'It feeds the fresh indexer and can be replayed after a failure. Partitioning by page ID keeps each page’s changes in order.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Find the pages that contain a query’s words and rank them, without reading any page at query time.',
      diagram: v1,
      explanation:
        'One machine with an inverted index answers in milliseconds for millions of pages, because the work depends on how many pages match, not how many exist. It stops at one machine’s memory and disk, a few hundred million pages at most, and one machine can’t carry 100,000 queries a second.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 20 TB of index and 100,000 queries a second at peak (ballpark), with answers in about 200 ms.',
      diagram: v2,
      explanation:
        'Splitting by page makes each shard a small, complete search engine, so adding pages adds shards and adding traffic adds copies. The price is fan-out: every query touches every shard, so the cache in front and the cost of each shard’s work matter enormously. Shards return only their best few, which keeps the merge cheap.',
    },
    {
      title: 'v3: Fresh results',
      solves: 'A billion pages change every day (ballpark), and news must be searchable within minutes, but rebuilding a 20 TB index takes hours.',
      diagram: v3,
      explanation:
        'The batch path makes the base index complete, compact and well ranked; the fresh path makes it current. Marking deletions instead of rewriting keeps both paths simple, and background merges keep the number of segments per query small, the same pattern a log-structured merge (LSM) tree uses.',
    },
    {
      title: 'v4: It survives slow and failed shards',
      solves: 'With 200 shards per query, some shard is always slow or failing, and users must not feel it.',
      diagram: v4,
      explanation:
        'Deadlines bound every query, hedged requests turn one slow copy into a non-event, and partial results turn a lost shard into slightly less complete answers instead of errors. Whole copies of the index in several regions cover the loss of a data center.',
    },
  ],
  deepDives: [
    {
      title: 'Splitting the index: by page or by word',
      problem:
        'At about 20 TB (ballpark) the index must be split across machines, and how you split it decides how many machines each query touches and how load and updates spread. The two classic choices fail in opposite ways.',
      options: {
        caption: 'Two ways to split an inverted index, and a refinement',
        rows: [
          {
            option: 'By page',
            goodAt: 'Each shard is a complete small search engine over its own pages: adding a page touches one shard, load spreads evenly, and losing a shard loses only its pages.',
            badAt: 'Every query goes to every shard, so the cost per query grows with the number of shards, and the slowest shard sets the response time.',
            pickWhen: 'The default for search at web scale.',
          },
          {
            option: 'By word',
            goodAt: 'A two-word query touches only the shards that hold those two words.',
            badAt:
              'A common word’s list is enormous and lives on one shard, a [[hot spot|hot-spot]]; intersecting lists means shipping them across the network; and indexing one page updates hundreds of shards.',
            pickWhen: 'Rarely: small collections with very selective queries.',
          },
          {
            option: 'By page, in tiers',
            goodAt: 'A small first tier holding the highest-quality pages answers most queries; the full index is searched only when that tier finds too little.',
            badAt: 'Two indexes to build and keep consistent, and some queries pay for two rounds.',
            pickWhen: 'Most traffic is satisfied by a small share of pages.',
          },
        ],
      },
      recommendation:
        'Split by page, with shards chosen by a hash of each page’s address so they stay even, and serve each shard from many copies. Google described this layout, index shards that each hold a random subset of documents and are served by a pool of machines, in its 2003 paper “Web Search for a Planet”. Add a first tier of the best pages once traffic is high enough that most queries never need the rest.',
    },
    {
      title: 'Ranking in stages',
      problem:
        'A common query can match 50 million pages (ballpark), and the best ranking models are far too slow to run on all of them. Yet the final ten must reflect many signals: how well the words match, how trusted the page is, how fresh it is and what people chose for similar queries.',
      options: {
        caption: 'Ways to rank the matching pages',
        rows: [
          {
            option: 'Word matching only, with BM25',
            goodAt:
              'Fast and well understood: BM25, a refined form of term frequency–inverse document frequency (TF-IDF), rewards query words that are frequent in a page and rare across the collection, giving each match a [[relevance score|relevance-score]].',
            badAt: 'Easy to game by stuffing words into a page, and blind to quality: a copied page scores as well as the original.',
            pickWhen: 'Site search over trusted documents.',
          },
          {
            option: 'Word matching plus quality scores',
            goodAt: 'Adds scores computed offline for each page, such as PageRank from the links pointing at it, a spam score and freshness, all cheap to read at query time.',
            badAt: 'Still a hand-tuned formula, which can’t weigh hundreds of signals well.',
            pickWhen: 'The first stage, on every shard.',
          },
          {
            option: 'A learned model on every match',
            goodAt: 'The best ordering, trained on people’s ratings and on clicks.',
            badAt: 'Hundreds of features for millions of matches per query blows the time budget many times over.',
            pickWhen: 'Never on all matches.',
          },
          {
            option: 'A cascade of stages',
            goodAt: 'Each stage scores fewer pages with more care: cheap scores on millions, a learned model on a few hundred, then the final ten.',
            badAt: 'A page cut early never comes back, so the early stages must keep enough candidates.',
            pickWhen: 'The default for large-scale search.',
          },
        ],
      },
      recommendation:
        'Rank in a cascade. Each shard walks its posting lists in an order that puts high-quality pages first, scores matches with BM25 plus quality scores, stops once its best results can no longer change, and returns its top 50 or so. The root merges about 10,000 candidates (ballpark), runs the learned model on the best few hundred, and builds snippets only for the final ten; scores such as PageRank are [[precomputed|precomputation]] by batch jobs over the link graph.',
    },
    {
      title: 'Keeping the index fresh',
      problem:
        'About a billion pages change every day (ballpark), and news must be searchable within minutes. But an inverted index is built for reading: adding one page touches the lists of every word on it, and rewriting 20 TB of lists for every change is impossible.',
      options: {
        caption: 'Ways to get new pages into the index',
        rows: [
          {
            option: 'Rebuild everything in batches',
            goodAt: 'Simple, efficient and easy to check: a [[MapReduce|mapreduce]]-style job turns all pages into compact shard files.',
            badAt: 'New pages wait for the next rebuild, days away.',
            pickWhen: 'The bulk of the index, which changes slowly.',
          },
          {
            option: 'Update the big index in place',
            goodAt: 'Every change is visible at once.',
            badAt: 'Each page rewrites hundreds of compressed posting lists while queries read them, which is slow and fragments the index.',
            pickWhen: 'Small indexes only.',
          },
          {
            option: 'Base index plus fresh segments',
            goodAt: 'New pages go into small segments built every minute or so, searched next to the base and merged into bigger ones in the background.',
            badAt: 'Each query searches several segments, and scores must be comparable across them.',
            pickWhen: 'The default: freshness in minutes at modest cost.',
          },
          {
            option: 'A separate real-time index for news',
            goodAt: 'A small in-memory index of the last day or two of news, updated within seconds.',
            badAt: 'One more system, and its results must be blended into the main ranking.',
            pickWhen: 'Breaking news and fast-moving topics.',
          },
        ],
      },
      recommendation:
        'Rebuild the base index about once a week (ballpark), add fresh segments every minute from the stream of changed pages, and merge small segments in the background. When a page changes or disappears, mark its old copy deleted in a per-shard bitmap, a [[tombstone|tombstone]] the next merge removes, instead of rewriting anything. Keep a small real-time tier for news, and give trending queries a short cache lifetime so stale cached answers can’t hide fresh pages.',
    },
    {
      title: 'Fast answers from 200 shards',
      problem:
        'Every query waits for all 200 shards, so the slowest one sets the response time. If each shard is slow one time in a hundred, 1 − 0.99²⁰⁰ ≈ 87% of queries hit at least one slow shard.',
      options: {
        caption: 'Ways to tame the slowest shard',
        rows: [
          {
            option: 'Wait for every shard',
            goodAt: 'Complete results every time.',
            badAt: 'The response time is the slowest of 200, so [[tail latency|tail-latency]] becomes the typical latency.',
            pickWhen: 'Never at this fan-out.',
          },
          {
            option: 'Deadlines and partial results',
            goodAt: 'The root answers when its deadline passes, using the shards that replied; a missing shard costs half a percent of the index.',
            badAt: 'Results are now and then slightly incomplete, and must be marked so they aren’t cached as complete.',
            pickWhen: 'Always, as the backstop.',
          },
          {
            option: 'Hedged requests',
            goodAt: 'If a copy hasn’t answered by the time 95% of requests usually would, ask a second copy and take the first answer.',
            badAt: 'A few percent more load, plus a cancel message to stop the slower copy.',
            pickWhen: 'Fan-out queries with many copies of each shard.',
          },
          {
            option: 'A results cache',
            goodAt: 'A repeated query skips the shards entirely.',
            badAt: 'Cached answers go stale, and personal or rare queries don’t repeat.',
            pickWhen: 'Popular queries, with lifetimes of minutes.',
          },
        ],
      },
      recommendation:
        'Use them together: a results cache with short lifetimes in front, [[deadline propagation|deadline-propagation]] so every shard knows how long it has, hedged requests after the 95th-percentile wait, and partial results when a shard misses its deadline. Send each request to the least busy copy rather than in strict rotation, so a copy that is merging segments or pausing gets fewer queries. Measure the 99th [[percentile|percentile]] at the root, since that is what people feel.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a million queries a second at peak (ballpark).',
      impact: 'Every shard sees every query, so every shard needs ten times the copies: about 100,000 index servers.',
      mitigation:
        'Add copies of each shard, raise the cache’s hit ratio, and answer most queries from a small first tier of top pages, so the full index sees only the queries that need it.',
    },
    {
      scenario: '100× load on one query: a breaking-news search everyone types at once.',
      impact: 'Identical queries arrive by the thousand each second, and when the cached answer expires, all of them reach the shards together: a [[cache stampede|cache-stampede]].',
      mitigation:
        'Collapse identical queries in flight at the root so one computes and the rest wait, which is [[request coalescing|request-coalescing]], and refresh popular entries just before they expire.',
    },
    {
      scenario: 'A copy of a shard crashes.',
      impact: 'Queries sent to it time out until health checks remove it, within seconds, and its shard has one copy fewer.',
      mitigation: 'Retry on another copy within the deadline; with about 50 copies per shard (ballpark), one loss costs 2% of that shard’s capacity.',
    },
    {
      scenario: 'Every copy of one shard fails, say after a bad index file was pushed to all of them.',
      impact: 'Half a percent of pages vanish from results.',
      mitigation:
        'Return partial results instead of errors, and roll out index files the way you roll out code: one group of copies first as a [[canary|canary-release]], with the previous files kept for a quick rollback.',
    },
    {
      scenario: 'The fresh indexing path stops.',
      impact: 'Search keeps working, but new pages stop appearing and results slowly go stale.',
      mitigation:
        'Alert on the age of the newest indexed page in each shard, and after the fix replay the changed-pages stream from its last [[offset|offset]].',
    },
    {
      scenario: 'The results cache cluster dies.',
      impact: 'Every query reaches the shards, possibly more than their copies can carry.',
      mitigation:
        'Keep headroom in shard copies, [[degrade gracefully|graceful-degradation]] by searching only the first tier of top pages for a while, and warm the cache back up gradually.',
    },
    {
      scenario: 'A whole region fails.',
      impact: 'Every shard copy in that region is gone at once.',
      mitigation:
        'Keep complete copies of the index, all 200 shards, in several regions, and send users to the nearest healthy one, so any region can serve the whole web.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Builds an inverted index from words to pages and answers a query by merging posting lists.',
        'Ranks matches with a relevance score and returns snippets from stored page text.',
        'Notices that the index is too big for one machine and splits it.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Splits the index by page, explains why every query visits every shard, and sizes shards and copies from the estimate.',
        'Adds a results cache and explains how its lifetime trades freshness for load.',
        'Separates a batch-built base index from fresh updates, with deletions marked instead of rewritten.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Ranks in a cascade, with quality signals computed offline, early stopping on each shard and a costly model only on a few hundred candidates.',
        'Treats tail latency at 200-way fan-out as the central problem, with deadlines, hedged requests and partial results.',
        'Rolls out index builds as carefully as code, with canaries and rollback, and keeps whole copies of the index in several regions.',
      ],
    },
  ],
  followUps: [
    {
      q: 'One copy of a shard keeps pausing every few seconds. What do users see?',
      a: 'Almost nothing. When that copy hasn’t answered by the time 95% of shard requests usually do, the root asks another copy of the same shard and takes the first answer. Choosing copies by load then sends fewer queries to the struggling one, and if it keeps failing health checks it is replaced.',
    },
    {
      q: 'A major news story breaks. How quickly can its pages show up?',
      a: 'Within a minute or two of being crawled: news sites are crawled often, changed pages flow into fresh segments every minute, and a small real-time tier covers the last day or two of news. Trending queries get short cache lifetimes, so a stale cached answer can’t hide the new pages for long.',
    },
    {
      q: 'Why not split the index by word, so a query only touches the shards for its words?',
      a: 'Common words would put huge lists on single shards, which would become hot spots, and intersecting “weather” with “paris” would mean shipping lists of hundreds of millions of entries across the network. Indexing one page would also touch hundreds of shards. Splitting by page keeps each shard self-contained and the load even, at the price of asking every shard, which copies and deadlines make affordable.',
    },
    {
      q: 'A query matches 50 million pages. How do you find the best ten in 200 ms?',
      a: 'No shard runs an expensive model on all its matches. Posting lists put high-quality pages first, so each shard scores with BM25 plus quality scores and stops once its top 50 can no longer improve. The root merges about 10,000 candidates, re-ranks a few hundred with the learned model, and builds snippets for ten.',
    },
    {
      q: 'A court orders a page removed from results. How do you make sure it never appears again?',
      a: 'I add it to a removal list the root checks on every answer, which takes effect within seconds, and purge cached results that contain it. The shards mark it deleted in their bitmaps, the next rebuild drops it for good, and the crawler is told not to index it again.',
    },
    {
      q: 'The results cache just went down. What happens?',
      a: 'Every query reaches the shards, raising their load by however much the cache was absorbing. Copies sized with headroom take it, and if they can’t, the root searches only the first tier of top pages for a while, which keeps popular queries fast and good. The cache returns empty, so I let it fill gradually rather than all at once.',
    },
    {
      q: 'How would you test a new ranking model safely?',
      a: 'First offline, against a set of queries whose results people have rated, then live on a small share of traffic, comparing what people click with the old model. I ship it only if it wins clearly, and keep the old model one switch away.',
    },
  ],
  rubric: [
    { item: 'Clarified scale, latency and freshness, then estimated index size, shards and copies', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Built an inverted index with tokenizing, stemming and positions, and merged posting lists to answer queries', weight: 15, lessonId: 'search-inverted-indexes' },
    { item: 'Split the index by page, explained the fan-out to every shard, and added copies for query load', weight: 20, lessonId: 'sharding' },
    { item: 'Ranked in stages: a cheap score on every match, a costly model on the best few hundred, quality signals computed offline', weight: 15, lessonId: 'search-inverted-indexes' },
    { item: 'Kept results fresh with a batch-built base index plus fresh segments, and handled deletions', weight: 15, lessonId: 'batch-vs-stream' },
    { item: 'Controlled tail latency with deadlines, hedged requests and partial results', weight: 10, lessonId: 'percentiles-tail-latency' },
    { item: 'Cached results with short lifetimes, and explained what happens when copies, shards or the cache fail', weight: 15, lessonId: 'caching' },
  ],
};

export default problem;
