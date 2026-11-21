import type { DiagramEdge, DiagramNode, DiagramSpec, Problem } from '../types';

/* ------------------------------------------------------------------ */
/* Diagrams                                                            */
/* ------------------------------------------------------------------ */

/** v1: one app server and one relational database. Every feed load is a query (fan-out on read). */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'posts, follows', x: 2, y: 0 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'A user posts. The **app server** inserts one row into the posts table of a single relational **database** and answers.',
      flow: ['users-app', 'app-db', '<app-db', '<users-app'],
    },
    {
      caption:
        'A follower opens the app. The server asks the database for the newest posts by every account they follow, sorted by time: one query with a [[join|join]].',
      flow: ['users-app', 'app-db'],
      notes: [{ target: 'db', text: 'join + sort' }],
    },
    {
      caption: 'The first 20 posts come back. With a few thousand users and an [[index|index]] on author and time, this takes a few milliseconds (ballpark).',
      flow: ['<app-db', '<users-app'],
    },
    {
      caption:
        'At 200 million daily users, the same query runs about 40,000 times a second at peak, and each one reads posts from a few hundred authors. One database cannot keep up, and every feed load waits for its slowest lookup.',
      flow: ['users-app', { edge: 'app-db', tone: 'alert' }],
      notes: [{ target: 'db', text: '40,000 a second', tone: 'alert' }],
    },
  ],
};

/** v2 and v3 share one layout: the write path across the top, the read path below, stores in between. */
const nodes: DiagramNode[] = [
  { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
  { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
  { id: 'queue', type: 'queue', label: 'Fan-out queue', x: 2, y: 0 },
  { id: 'fanout', type: 'worker', label: 'Fan-out workers', x: 3, y: 0 },
  { id: 'posts', type: 'nosqlDb', label: 'Posts store', x: 1, y: 1 },
  { id: 'graph', type: 'nosqlDb', label: 'Follow graph', x: 2, y: 1 },
  { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 2 },
  { id: 'feedcache', type: 'cache', label: 'Feed cache', sublabel: 'a list per user', x: 3, y: 2 },
  { id: 'postcache', type: 'cache', label: 'Post cache', x: 1, y: 3 },
];

const edges: DiagramEdge[] = [
  { id: 'users-post', from: 'users', to: 'post', kind: 'sync' },
  { id: 'users-feed', from: 'users', to: 'feed', kind: 'sync' },
  { id: 'post-posts', from: 'post', to: 'posts', kind: 'sync' },
  { id: 'post-queue', from: 'post', to: 'queue', kind: 'async', label: 'new post' },
  { id: 'queue-fanout', from: 'queue', to: 'fanout', kind: 'async' },
  { id: 'fanout-graph', from: 'fanout', to: 'graph', kind: 'sync' },
  { id: 'fanout-feedcache', from: 'fanout', to: 'feedcache', kind: 'sync', label: 'append IDs' },
  { id: 'feed-feedcache', from: 'feed', to: 'feedcache', kind: 'sync' },
  { id: 'feed-postcache', from: 'feed', to: 'postcache', kind: 'sync' },
  { id: 'feed-posts', from: 'feed', to: 'posts', kind: 'sync' },
  { id: 'feed-graph', from: 'feed', to: 'graph', kind: 'sync' },
];

/** v2: fan-out on write through a queue, feeds as lists of post IDs, and a pull path for big accounts. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes,
  edges,
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 1, y: 0 },
      postcache: { x: 2, y: 0 },
      post: { x: 0, y: 1 },
      posts: { x: 1, y: 1 },
      feed: { x: 2, y: 1 },
      queue: { x: 0, y: 2 },
      graph: { x: 1, y: 2 },
      fanout: { x: 0, y: 3 },
      feedcache: { x: 2, y: 3 },
    },
    sides: { 'users-post': { fromSide: 'bottom', toSide: 'top' }, 'users-feed': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'A user posts. The **post service** saves the post once in the **posts store**, drops a job on the **fan-out queue** and answers right away, so the author never waits for followers’ feeds to be updated.',
      focus: [],
      flow: ['users-post', 'post-posts', '<post-posts', 'post-queue', '<users-post'],
    },
    {
      caption:
        'The **fan-out workers** take the job, page through the author’s followers in the **follow graph**, and add the post’s ID to the front of each follower’s list in the **feed cache**. With about 200 followers, that is 200 small writes.',
      focus: [],
      flow: ['queue-fanout', 'fanout-graph', '<fanout-graph', 'fanout-feedcache'],
      notes: [{ target: 'feedcache', text: '200 appends' }],
    },
    {
      caption: 'A follower opens the app. The **feed service** reads their ready-made list from the **feed cache**: one lookup, however many accounts they follow.',
      focus: [],
      flow: ['users-feed', 'feed-feedcache', '<feed-feedcache'],
      notes: [{ target: 'feed', text: '1 lookup' }],
    },
    {
      caption:
        'It turns the first 20 IDs into posts with one batched read from the **post cache**. The few misses go to the **posts store** and are copied into the cache on the way back, the [[cache-aside|cache-aside]] pattern.',
      focus: [],
      flow: [{ edge: 'feed-postcache', tag: 'hit' }, '<feed-postcache', { edge: 'feed-posts', tag: 'miss' }, '<feed-posts', '<users-feed'],
    },
    {
      caption:
        'Now an account with 30 million followers posts. Pushing it would take 30 million appends, about 5 minutes of the workers’ time (ballpark): the [[celebrity problem|celebrity-problem]]. Because the author is above the follower threshold, the post is saved once and no fan-out job is queued.',
      focus: ['queue'],
      flow: ['users-post', 'post-posts', '<post-posts', '<users-post'],
      notes: [{ target: 'queue', text: 'skipped' }],
    },
    {
      caption:
        'When a follower loads the feed, the **feed service** reads their list and, at the same time, the short list of big accounts they follow from the **follow graph**. It fetches those accounts’ newest posts from the **post cache** and merges everything by time: a few extra lookups instead of 30 million writes.',
      focus: [],
      add: ['feed-graph'],
      flow: ['users-feed', ['feed-feedcache', 'feed-graph'], ['<feed-feedcache', '<feed-graph'], 'feed-postcache', '<feed-postcache', '<users-feed'],
      notes: [{ target: 'feed', text: 'merge' }],
    },
  ],
};

/** v3: the same design, with replicas, a pull fallback, a replayable queue and request coalescing. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes,
  edges,
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 1, y: 0 },
      postcache: { x: 2, y: 0 },
      post: { x: 0, y: 1 },
      posts: { x: 1, y: 1 },
      feed: { x: 2, y: 1 },
      queue: { x: 0, y: 2 },
      graph: { x: 1, y: 2 },
      fanout: { x: 0, y: 3 },
      feedcache: { x: 2, y: 3 },
    },
    sides: { 'users-post': { fromSide: 'bottom', toSide: 'top' }, 'users-feed': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Every store keeps copies. Each **feed cache** shard has a replica, and the **posts store** keeps three copies of each post in different zones and acknowledges a post once two have it, a [[quorum|quorum]] write.',
      focus: ['feedcache', 'posts', 'postcache'],
      notes: [
        { target: 'feedcache', text: '+ replica' },
        { target: 'posts', text: '3 copies' },
      ],
    },
    {
      caption: 'A **feed cache** node dies, and feed loads for the users on that shard time out.',
      focus: [],
      fail: ['feedcache'],
      flow: ['users-feed', { edge: 'feed-feedcache', tag: 'timeout', tone: 'alert' }],
    },
    {
      caption:
        'Within seconds, its replica is promoted and the feed service retries there. A few appends from the last moment may be missing, which nobody notices in a feed.',
      focus: [],
      flow: ['users-feed', 'feed-feedcache', '<feed-feedcache', '<users-feed'],
      notes: [{ target: 'feedcache', text: 'replica promoted', tone: 'signal' }],
    },
    {
      caption:
        'If a shard loses both copies, the feed service falls back to pull for its users: it reads whom they follow from the **follow graph**, fetches those accounts’ recent posts and merges them. The page is slower but correct, and a background job rebuilds each lost list.',
      focus: [],
      fail: ['feedcache'],
      flow: ['users-feed', 'feed-graph', '<feed-graph', 'feed-postcache', '<feed-postcache', '<users-feed'],
      notes: [{ target: 'feed', text: 'pull fallback', tone: 'signal' }],
    },
    {
      caption:
        'The **fan-out workers** crash. Posting still works: jobs wait in the **fan-out queue**, and followers see new posts a little late while the backlog, the [[consumer lag|consumer-lag]], grows.',
      focus: [],
      fail: ['fanout'],
      flow: ['users-post', 'post-posts', '<post-posts', 'post-queue', '<users-post'],
      notes: [{ target: 'queue', text: 'backlog grows', tone: 'alert' }],
    },
    {
      caption:
        'Restarted workers resume from the last job they acknowledged, so a few jobs run twice. That is harmless: adding a post ID that is already in a list does nothing, which makes the append [[idempotent|idempotent]].',
      focus: [],
      flow: ['queue-fanout', 'fanout-graph', '<fanout-graph', 'fanout-feedcache'],
      notes: [{ target: 'fanout', text: 'catching up', tone: 'signal' }],
    },
    {
      caption:
        'A **post cache** node dies, so its share of lookups miss at once. The feed service merges identical misses into one read, [[request coalescing|request-coalescing]], while a replacement node warms up, so the **posts store** sees a bump rather than a stampede.',
      focus: [],
      fail: ['postcache'],
      flow: ['users-feed', 'feed-feedcache', '<feed-feedcache', { edge: 'feed-posts', tag: 'miss' }, '<feed-posts', '<users-feed'],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Problem                                                             */
/* ------------------------------------------------------------------ */

const problem: Problem = {
  id: 'news-feed',
  title: 'News feed',
  tier: 2,
  flagship: true,
  minutes: 45,
  prompt: 'Design the home feed for a social app. People follow other accounts, and when they open the app, they see recent posts from the accounts they follow.',
  concepts: ['feed-fanout', 'caching', 'denormalization', 'queues-and-streams', 'sharding', 'back-of-the-envelope', 'unique-ids'],
  hints: [
    'Compare how often people post with how often they open the feed. Which side, writing a post or reading the feed, can afford to do the heavy lifting?',
    'Try building each person’s feed ahead of time, which is called [[fan-out on write|fan-out-on-write]]: when someone posts, a background job adds the post’s identifier (ID) to a list kept in a cache for each follower. Then work out what that job costs when an account with 30 million followers posts.',
    'A strong answer pushes post IDs into a capped list per user in a sharded cache, through a queue, but skips the push for accounts above a follower threshold and merges their recent posts in at read time. The feed service then fetches the posts by ID from a post cache, ranks the merged candidates and pages through them with a cursor.',
  ],
  clarifyingQuestions: [
    {
      q: 'Is the feed in time order, or ranked by what each person is likely to care about?',
      why: 'Time order lets you merge lists by post ID and stop as soon as one page is full. A ranked feed needs a scoring step over a few hundred candidates instead of 20, with its own slice of the latency budget. Most interviewers are happy with time order first and ranking as a layer on top.',
    },
    {
      q: 'How uneven are follower counts? Are there accounts with millions of followers?',
      why: 'If everyone has a few hundred followers, copying each post into every follower’s feed is cheap. A handful of accounts with tens of millions of followers makes that copy take minutes per post, which pushes you to a [[hybrid|hybrid-fan-out]] design.',
    },
    {
      q: 'How many people use it each day, how often do they open the feed, and how often do they post?',
      why: 'These numbers set the [[read/write ratio|read-write-ratio]]. When feed loads outnumber posts by about 100 to 1, as assumed below, extra work at write time that makes reads cheap pays for itself many times over.',
    },
    {
      q: 'How fresh must the feed be? Is a delay of a few seconds acceptable before followers see a new post?',
      why: 'A few seconds of delay lets you build feeds in the background from a queue and accept [[eventual consistency|eventual-consistency]]. If every post had to appear everywhere instantly, you would lean toward assembling each feed when it is read, [[fan-out on read|fan-out-on-read]].',
    },
    {
      q: 'What is in a post: text only, or photos and videos too?',
      why: 'Media multiplies storage and bandwidth many times over, but it leaves the feed itself unchanged. The files go to [[object storage|object-storage]] behind a [[content delivery network|cdn]] (CDN), and the feed carries only IDs and links.',
    },
    {
      q: 'How far back do people scroll, and do inactive users matter?',
      why: 'If most sessions read only the newest posts, each precomputed feed can hold a few hundred entries, and deeper scrolling can take a slower path. Skipping users who have not opened the app in weeks saves a large share of the fan-out work.',
    },
  ],
  requirements: {
    functional: [
      'Users create posts with text and optional photos, and follow or unfollow other accounts.',
      'Users load a home feed of posts from the accounts they follow, newest or best first, one page at a time.',
      'A new post reaches followers’ feeds within a few seconds, and authors see their own posts at once.',
      'Deleted posts and unfollowed accounts disappear from the feed.',
    ],
    nonFunctional: [
      'Fast feed loads: under about 200 ms on the server at the [[99th percentile|percentile]], a ballpark target.',
      'Highly available: a feed that is a few seconds stale beats an error, so availability wins over strict consistency.',
      'Scales to hundreds of millions of daily users, and one celebrity’s post never slows down anyone else’s feed.',
      'Durable: once a post is acknowledged, it is never lost.',
    ],
    outOfScope: [
      'Ads, notifications, comments, search and direct messages.',
      'How the ranking model is trained. The design shows where ranking plugs in, not the machine learning inside it.',
      'Uploading and processing photos and videos, which the photo sharing problem covers. Posts here just carry links to them.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '200 million (ballpark)' },
      { label: 'Feed loads', value: '10 per user per day, each a page of 20 posts' },
      { label: 'Posts', value: 'one user in ten posts once a day: 0.1 per user, so about 100 feed loads for every post' },
      { label: 'Followers', value: 'about 200 per account on average; a few accounts have tens of millions' },
      { label: 'Post size', value: 'about 1 KB of text and metadata; photos and videos are stored separately' },
      { label: 'Peak', value: 'the busiest hour carries about 2× the daily average' },
      { label: 'Feed list', value: '500 entries per user, 16 bytes each (post ID and author ID)' },
      { label: 'In the calculator', value: '10 actions per user a day at 100 reads per write; one object is one post' },
    ],
    steps: [
      { label: 'Feed loads per second', math: '200 million × 10 ÷ 100,000 seconds in a day (86,400, rounded up)', result: '≈ 20,000 a second on average, 40,000 at peak' },
      { label: 'Posts per second', math: '200 million × 0.1 ÷ 100,000', result: '≈ 200 a second on average, 400 at peak' },
      { label: 'Fan-out writes', math: '200 posts a second × 200 followers', result: '≈ 40,000 list appends a second, 80,000 at peak' },
      { label: 'One celebrity post, pushed', math: '30 million followers ÷ 100,000 appends a second', result: '≈ 300 seconds: 5 minutes of fan-out for a single post' },
      { label: 'Post storage', math: '20 million posts a day × 1 KB', result: '≈ 20 GB a day, about 7 TB a year before replication' },
      { label: 'Feed cache memory', math: '200 million users × 500 entries × 16 bytes', result: '≈ 1.6 TB: a few dozen cache machines, plus replicas' },
      { label: 'Feed responses at peak', math: '40,000 loads a second × 20 posts × 1 KB', result: '≈ 800 MB a second, before media, which the CDN serves' },
    ],
    calculator: { dau: 200_000_000, actionsPerUser: 10, readsPerWrite: 100, objectBytes: 1_000, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'POST /v1/posts   { text, mediaIds[] }   →   201 { postId, createdAt }',
      description:
        'Saves the post and returns as soon as it is stored; fan-out to followers happens in the background. The client sends an [[idempotency key|idempotency-key]] header, so a retried request cannot post twice.',
    },
    {
      signature: 'GET /v1/feed?cursor=<opaque>&limit=20   →   200 { posts[], nextCursor }',
      description:
        'Returns one page of ready-to-show posts. The cursor marks where the last page ended, [[cursor pagination|cursor-pagination]], so new posts arriving at the top never shift the next page.',
    },
    {
      signature: 'POST /v1/follows   { followeeId }      DELETE /v1/follows/{followeeId}',
      description: 'Follows or unfollows an account. A follow also starts a small [[backfill|backfill]] that adds the account’s recent posts to the follower’s list.',
    },
    {
      signature: 'DELETE /v1/posts/{postId}',
      description:
        'Marks the post deleted in the posts store. Feed lists hold only IDs, so the post disappears from every feed at once: pages skip deleted posts when they are filled.',
    },
  ],
  dataModel: [
    {
      entity: 'Post',
      fields: ['post_id: bigint, time-sortable', 'author_id: bigint', 'text: string', 'media_urls: list<string>', 'created_at: timestamp', 'deleted: boolean'],
      store: 'Wide-column store such as Cassandra, partitioned by author_id and sorted by post_id, newest first',
      why: 'Posts are written once and read in two ways: by ID, to fill a page, and as an author’s newest posts, for the pull path. Partitioning by author in a [[wide-column store|wide-column-store]] makes the second a single-partition read, and feed entries carry the author ID, so the first is a single-key lookup too. [[Snowflake-style IDs|snowflake-id]] sort by time, so newest-first needs no extra index.',
    },
    {
      entity: 'Follow',
      fields: ['follower_id: bigint', 'followee_id: bigint', 'created_at: timestamp'],
      store: 'Wide-column store, written twice: followers partitioned by followee_id, following partitioned by follower_id',
      why: 'Fan-out asks who follows an author; the pull path asks whom a user follows. Storing each follow twice, once partitioned each way, makes both a single-partition read, a deliberate [[denormalization|denormalization]] of the [[social graph|social-graph]]. Huge follower lists are read in pages.',
    },
    {
      entity: 'Feed list',
      fields: ['user_id: bigint (key)', 'entries: list of (post_id, author_id), newest first, at most 500'],
      store: 'In-memory cache such as Redis, sharded by user_id, one replica per shard',
      why: 'Each list is a [[read model|read-model]] that can be rebuilt from posts and follows, so memory is a safe home for it. One key lookup returns a whole feed, and the cap of 500 entries keeps the total at about 1.6 TB.',
    },
    {
      entity: 'User',
      fields: ['user_id: bigint', 'follower_count: int', 'pull_only: boolean (above the threshold)', 'last_active_at: timestamp'],
      store: 'Relational database with a cache in front',
      why: 'The fan-out workers read the follower count to choose push or pull, and the last-active time to skip people who have not opened the app in weeks. The table is small and changes slowly, so a cached relational database is plenty.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Get a correct feed working end to end with the simplest possible design: one server and one database.',
      diagram: v1,
      explanation:
        'Nothing is prepared ahead of time, so every feed load does all the work: this is pure fan-out on read. It is correct, easy to build and fine for a few thousand users. At the assumed scale, it means 40,000 heavy queries a second at peak, which no single database can serve.',
    },
    {
      title: 'v2: It scales',
      solves: 'Make feed loads cheap by building each feed ahead of time, without letting one celebrity’s post flood the system.',
      diagram: v2,
      explanation:
        'Feeds are now built when posts are written, a form of [[precomputation|precomputation]], and the few big accounts are pulled in when a feed is read. A feed load costs one list lookup plus one batched post fetch, however many accounts someone follows. The **post service** and the **feed service** scale separately, because feed loads outnumber posts about 100 to 1.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'Keep feeds loading when cache nodes, workers or storage machines fail, and never lose a post.',
      diagram: v3,
      explanation:
        'Everything in the feed cache is [[derived data|derived-data]]: the posts store and the follow graph are the [[source of truth|source-of-truth]], so any list can be rebuilt. That is why the cache can afford to lose a few appends in a failover, while the posts store keeps three copies and acknowledges a post only once it is safe.',
    },
  ],
  deepDives: [
    {
      title: 'Push, pull or hybrid: the celebrity problem',
      problem:
        'Copying each post into every follower’s list makes reads cheap, but the cost of a post grows with its author’s follower count. One post from an account with 30 million followers means 30 million feed writes, an extreme case of [[write amplification|write-amplification]]: for minutes, some followers see it and others do not, and other authors’ posts wait behind it. Building feeds at read time avoids that, but then every feed load gathers from hundreds of accounts and waits for the slowest, so it inherits the [[tail latency|tail-latency]] of the whole storage tier.',
      options: {
        caption: 'Three ways to build a feed.',
        rows: [
          {
            option: 'Push (fan-out on write)',
            goodAt: 'Fast, predictable feed loads: one list lookup and one batched post fetch.',
            badAt: 'Write cost grows with followers, a celebrity post takes minutes to spread, and work is wasted on followers who never open the app.',
            pickWhen: 'Follower counts are modest and feed loads far outnumber posts.',
          },
          {
            option: 'Pull (fan-out on read)',
            goodAt: 'Cheap, instant posting; always fresh; nothing stored per follower.',
            badAt: 'Every feed load gathers from every followed account, so reads are slow and costly at scale.',
            pickWhen: 'The system is small, feeds are read rarely, or follow lists are short.',
          },
          {
            option: 'Hybrid',
            goodAt: 'Caps the write cost of any post and keeps reads to one list plus a few pulls.',
            badAt: 'Two code paths, a merge step, and a threshold to tune and watch.',
            pickWhen: 'Follower counts are skewed, with a few huge accounts, as on nearly every large social network.',
          },
        ],
      },
      recommendation:
        'Choose hybrid. Push posts from accounts under a follower threshold, say a million, pull the few above it at read time, and tune the threshold by watching fan-out delay against feed-load latency. Also stop pushing to users who have not opened the app in weeks, and rebuild their feed with a pull when they return. Twitter’s engineers have described this same hybrid in public talks on home timelines, covered in [Feeds: fan-out on write vs. on read](lesson:feed-fanout).',
    },
    {
      title: 'What the feed cache stores',
      problem:
        'The feed cache holds a list for every active user, so what each entry contains decides how much memory you need, what an edit or a delete costs, and how fast a feed loads. With 200 million users, even a few kilobytes each adds up to terabytes.',
      options: {
        rows: [
          {
            option: 'Full copies of posts',
            goodAt: 'One read returns everything the page shows.',
            badAt: 'Memory grows with followers times post size, and an edit, a delete or a new like count must update every copy.',
            pickWhen: 'Rarely at this scale; perhaps for tiny feeds of posts that never change.',
          },
          {
            option: 'Post IDs only, capped at a few hundred',
            goodAt: 'About 8 KB per user; an edit or delete changes one stored post; lists can be rebuilt from the source data.',
            badAt: 'Every load needs a second, batched fetch to turn IDs into posts, so you also run a post cache.',
            pickWhen: 'The default for large feeds where posts change and memory matters.',
          },
          {
            option: 'No lists; cache each assembled page briefly',
            goodAt: 'Little memory, and no work at all when someone posts.',
            badAt: 'Every expired page is a full pull, freshness is limited by the [[time to live|ttl]] (TTL), and people who return after a while always wait.',
            pickWhen: 'Small systems, or as the fallback for inactive users.',
          },
        ],
      },
      recommendation:
        'Store post IDs with their author IDs, newest first, capped at about 500 per user, and only for users active in the last few weeks. Turn IDs into posts through a separate post cache keyed by post ID; it also absorbs the [[hot key|hot-key]] reads of a viral post if you keep extra copies of the hottest entries. Spread the lists across cache nodes by user ID with [[consistent hashing|consistent-hashing]], so adding a node moves only a small share of them.',
    },
    {
      title: 'Ranking without slowing the feed',
      problem:
        'Newest-first is simple and easy to explain, but people who follow many accounts miss the posts they care about most. Ranking scores each candidate post by how likely this person is to engage with it, and that scoring has to fit inside the 200 ms budget.',
      options: {
        rows: [
          {
            option: 'Time order',
            goodAt: 'Cheapest and predictable; the merge is a sort by post ID, and everyone understands it.',
            badAt: 'Busy feeds bury the posts people care about.',
            pickWhen: 'At launch, or when users ask for a chronological view.',
          },
          {
            option: 'A simple score at read time',
            goodAt: 'Recency, likes and how often you interact with the author can score a few hundred candidates in a few milliseconds, and the result is explainable.',
            badAt: 'Hand-tuned weights and shallow personalization.',
            pickWhen: 'You want better than time order without running machine learning in production.',
          },
          {
            option: 'Two-stage ranking with a learned model',
            goodAt: 'Best relevance: a cheap pass trims the candidates, then a model scores the top 100 or so.',
            badAt: 'Needs a ranking service, features, training data and a strict time budget, and it is harder to debug and explain.',
            pickWhen: 'Engagement matters and the team can run and monitor models.',
          },
        ],
      },
      recommendation:
        'Keep ranking a separate step after candidate generation: push, pull or hybrid decides which posts are candidates, and ranking only reorders them. Give the ranking call a strict timeout, around 50 ms (ballpark), and fall back to time order when it misses. Rank once per session and page through that ranked snapshot with the cursor, so posts do not jump around while someone scrolls.',
    },
  ],
  failureModes: [
    {
      scenario: '10× read load, for example a major news event when everyone refreshes at once.',
      impact:
        'Feed loads jump to about 400,000 a second at peak. The feed service scales out easily because it is stateless, but the hottest feed cache shards and the ranking service saturate first.',
      mitigation:
        'Add read replicas to the busiest cache shards and let the feed service grow with [[autoscaling|autoscaling]]. If ranking falls behind, serve time order, a planned [[graceful degradation|graceful-degradation]], and use [[load shedding|load-shedding]] to drop extras such as suggested accounts.',
    },
    {
      scenario: '100× growth in users and posts.',
      impact: 'Fan-out writes reach millions a second, the feed lists need well over 100 TB of memory, and the queue’s backlog means posts reach followers minutes late.',
      mitigation:
        'Lower the hybrid threshold so fewer posts fan out, keep lists only for recently active users, partition the queue by author so workers scale out, and move the lists of less active users to a disk-based store. Redo the estimate with the new numbers before choosing.',
    },
    {
      scenario: 'A feed cache shard dies along with its replica.',
      impact: 'Users on that shard have no precomputed list, so their feed loads would fail.',
      mitigation:
        'Fall back to pull for them: read the follow list and recent posts, merge, and serve a slower page while a background job rebuilds each list. No data is lost, because lists are derived from posts and follows.',
    },
    {
      scenario: 'The fan-out workers stop or fall far behind.',
      impact: 'Posts are still saved, but followers see them late, and the oldest job in the queue keeps getting older.',
      mitigation:
        'Alert on the age of the oldest job, add workers, and keep appends idempotent so a restart that replays jobs is harmless. Authors still see their own posts at once, because those are merged in at read time.',
    },
    {
      scenario: 'A posts store machine dies.',
      impact: 'With three copies and quorum writes, reads and writes continue on the other two, and the post cache absorbs most reads anyway.',
      mitigation:
        'Replace the machine and let the store copy the missing data back in the background. A client whose post failed retries with the same idempotency key, so the retry cannot create a duplicate.',
    },
    {
      scenario: 'A celebrity’s post goes viral.',
      impact: 'Millions of feed loads fetch the same post ID, so the one post cache node that owns it is overwhelmed: a hot key.',
      mitigation:
        'Keep copies of the hottest posts on several cache nodes, or in a small in-memory cache inside each feed service instance that expires entries after a few seconds.',
    },
    {
      scenario: 'The ranking service is slow or down.',
      impact: 'Feed loads would wait for it and blow the latency budget.',
      mitigation:
        'Call it with a strict timeout and fall back to time order. A [[circuit breaker|circuit-breaker]] stops calling it entirely until it recovers, so a struggling ranker cannot slow every feed.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Draws a working design with a clear path for posting and for reading, and explains fan-out on read versus fan-out on write in plain words.',
        'Estimates feed loads and posts per second and notices that reads dominate.',
        'Puts a cache in front of the feed and can say what happens on a miss.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Chooses fan-out on write through a queue, stores post IDs rather than copies, and sizes the feed cache with arithmetic.',
        'Raises the celebrity problem without being asked and proposes a hybrid with a follower threshold.',
        'Uses cursor pagination and makes the fan-out idempotent, so retries are safe.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Quantifies the threshold trade-off and names the numbers to tune it with: fan-out delay, feed-load latency and cache memory.',
        'Designs for failure: lists as rebuildable derived data, a pull fallback, a time-order fallback for ranking, and extra copies of hot posts.',
        'Separates candidate generation from ranking with a latency budget, and talks about cost: skipping inactive users and capping list length.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A pop star with 50 million followers just posted. Walk me through what happens.',
      a: 'Their follower count is above the threshold, so the post service saves the post once and queues no fan-out. Each follower’s next feed load reads their list, fetches the newest posts of the few big accounts they follow, and merges by time. The post itself becomes a hot key in the post cache, so we keep copies of it on several nodes.',
    },
    {
      q: 'I post something and refresh right away, but my post isn’t in my feed. Why, and how would you fix it?',
      a: 'Fan-out runs in the background, so my own list may not have the post yet: the feed is eventually consistent. The fix is [[read-your-writes consistency|read-your-writes]] for the author: always merge the reader’s own recent posts into their feed at read time, or append to the author’s own list before answering the post request.',
    },
    {
      q: 'The feed cache just lost a shard, replica and all. What do those users see?',
      a: 'Slower feeds, not errors. The feed service notices the missing list, falls back to pull from the follow graph and the post cache, and queues a rebuild. Because lists are derived data, nothing is lost, and loads are fast again once the rebuild finishes.',
    },
    {
      q: 'How do you handle a deleted post?',
      a: 'Mark it deleted in the posts store. Feeds hold only IDs, so filling a page skips it everywhere at once; a background job can remove the stale IDs from lists later, but correctness never depends on that job.',
    },
    {
      q: 'Someone follows a new account. When do that account’s posts show up?',
      a: 'New posts show up right away, because the follower is now in the graph the workers read. For older posts, the follow triggers a small backfill that inserts the account’s last few dozen posts into the follower’s list. An unfollow is filtered at read time and cleaned out of the list lazily.',
    },
    {
      q: 'How would you add ranking without blowing the latency budget?',
      a: 'Generate candidates exactly as now, then call a ranking service with a strict timeout. A cheap scoring pass trims a few hundred candidates to about 100 for a heavier model. If the call times out, serve time order; people barely notice, and the feed stays up.',
    },
    {
      q: 'How do you paginate when new posts keep arriving at the top?',
      a: 'Use a cursor, not an offset: the cursor records the last post or score already shown, so new posts at the top never shift later pages. For a ranked feed, rank once per session and page through that snapshot, and show newer posts behind a “new posts” button.',
    },
  ],
  rubric: [
    { item: 'Asked about ranking, follower skew and freshness before designing', weight: 10, lessonId: 'requirements' },
    { item: 'Estimated feed loads and posts per second and showed that reads dominate', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Precomputed feeds with fan-out on write through a queue', weight: 15, lessonId: 'feed-fanout' },
    { item: 'Spotted the celebrity problem and proposed hybrid fan-out with a threshold', weight: 20, lessonId: 'feed-fanout' },
    { item: 'Cached feeds as capped lists of post IDs, filled from a post cache', weight: 15, lessonId: 'caching' },
    { item: 'Treated feed lists as rebuildable derived data, with fallbacks when parts fail', weight: 10, lessonId: 'denormalization' },
    { item: 'Placed ranking as a separate step with a time budget and a fallback', weight: 10, lessonId: 'feed-fanout' },
    { item: 'Sharded lists and posts, and handled hot keys', weight: 10, lessonId: 'sharding' },
  ],
};

export default problem;
