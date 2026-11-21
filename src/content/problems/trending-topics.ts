import type { DiagramSpec, Problem } from '../types';

/** v1: a scheduled query counts the last hour of stored hashtags. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Posts database', sublabel: 'one row per hashtag', x: 2, y: 0 },
    { id: 'trends', type: 'sqlDb', label: 'Trends table', x: 1, y: 1 },
    { id: 'job', type: 'worker', label: 'Trends job', sublabel: 'every 15 minutes', x: 2, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-trends', from: 'app', to: 'trends', kind: 'sync' },
    { id: 'job-db', from: 'job', to: 'db', kind: 'sync' },
    { id: 'job-trends', from: 'job', to: 'trends', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'People post. The **app server** saves each post in the **posts database**, with one row for every hashtag it uses, indexed by time.',
      flow: ['users-app', 'app-db', '<app-db', '<users-app'],
    },
    {
      caption:
        'Every 15 minutes, the **trends job** counts the last hour’s hashtag rows, grouped by hashtag and country, sorts them, and writes the top 10 for each country to the **trends table**.',
      flow: ['job-db', '<job-db', 'job-trends'],
      notes: [{ target: 'job', text: 'scans 36 million rows' }],
    },
    {
      caption:
        'Readers’ apps fetch the lists through the app server. They are up to 15 minutes old, and everyday tags such as #love sit on top every single hour.',
      flow: ['users-app', 'app-trends', '<app-trends', '<users-app'],
    },
  ],
};

/** v2: a stream job counts hashtags in one-minute windows; a merger keeps the last hour. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'posters', type: 'client', label: 'People posting', x: 0, y: 0 },
    { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
    { id: 'events', type: 'stream', label: 'Post events', x: 2, y: 0 },
    { id: 'counters', type: 'worker', label: 'Counters', sublabel: 'keyed by hashtag', x: 3, y: 0 },
    { id: 'readers', type: 'client', label: 'Readers', x: 0, y: 1 },
    { id: 'svc', type: 'service', label: 'Trends service', x: 1, y: 1 },
    { id: 'trends', type: 'cache', label: 'Trends cache', sublabel: 'one list per country', x: 2, y: 1 },
    { id: 'merger', type: 'worker', label: 'Merger', sublabel: 'last 60 minutes', x: 3, y: 1 },
  ],
  edges: [
    { id: 'posters-post', from: 'posters', to: 'post', kind: 'sync' },
    { id: 'post-events', from: 'post', to: 'events', kind: 'async' },
    { id: 'events-counters', from: 'events', to: 'counters', kind: 'async' },
    { id: 'counters-merger', from: 'counters', to: 'merger', kind: 'async', label: 'each minute' },
    { id: 'merger-trends', from: 'merger', to: 'trends', kind: 'sync' },
    { id: 'svc-trends', from: 'svc', to: 'trends', kind: 'sync' },
    { id: 'readers-svc', from: 'readers', to: 'svc', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each new post goes to the **post service**, which saves it and appends a small event (post, author, country, time, hashtags) to the **post events** stream: about 10,000 hashtag uses a second, 30,000 at peak (ballpark).',
      flow: ['posters-post', 'post-events'],
    },
    {
      caption:
        'The **counters** read the stream, normalize each hashtag (lowercase, no accents), and count every hashtag and country pair in one-minute [[tumbling windows|tumbling-window]] by [[event time|event-time]], the moment the post was made. The stream is keyed by hashtag, so each hashtag is counted on exactly one counter.',
      flow: ['events-counters'],
      notes: [{ target: 'counters', text: '1-minute windows' }],
    },
    {
      caption:
        'When a minute closes, each counter sends the counts of its busiest hashtags to the **merger**. The merger keeps the last 60 minutes, a [[sliding window|sliding-window]] that moves forward a minute at a time, and writes the top 10 for each country to the **trends cache**.',
      flow: ['counters-merger', 'merger-trends'],
    },
    {
      caption:
        'Readers’ apps ask the **trends service**, which reads one small key per country. Everyone in a country gets the same list, so it caches well, even for 30 seconds at the network edge.',
      flow: ['readers-svc', 'svc-trends', '<svc-trends', '<readers-svc'],
    },
  ],
};

/** v3: random partitions, a Count-Min Sketch per counter, and a merger that adds sketches and scores growth. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'events', type: 'stream', label: 'Post events', sublabel: 'random partitions', x: 0, y: 1 },
    { id: 'c1', type: 'worker', label: 'Counter 1', x: 1, y: 0.5 },
    { id: 'c2', type: 'worker', label: 'Counter 2', x: 1, y: 1.5 },
    { id: 'baselines', type: 'nosqlDb', label: 'Baselines', sublabel: 'built nightly', x: 2, y: 0 },
    { id: 'merger', type: 'worker', label: 'Merger', sublabel: 'every minute', x: 2, y: 1 },
    { id: 'trends', type: 'cache', label: 'Trends cache', x: 3, y: 1 },
  ],
  edges: [
    { id: 'events-c1', from: 'events', to: 'c1', kind: 'async' },
    { id: 'events-c2', from: 'events', to: 'c2', kind: 'async' },
    { id: 'c1-merger', from: 'c1', to: 'merger', kind: 'async' },
    { id: 'c2-merger', from: 'c2', to: 'merger', kind: 'async' },
    { id: 'merger-baselines', from: 'merger', to: 'baselines', kind: 'sync' },
    { id: 'merger-trends', from: 'merger', to: 'trends', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'During a final, #worldcup alone can reach tens of thousands of uses a second (ballpark). Keyed by hashtag, every one of them would land on one counter, a [[hot key|hot-key]], so events are now spread over the counters at random, and each counter sees a slice of every hashtag.',
      flow: [['events-c1', 'events-c2']],
    },
    {
      caption:
        'Each counter keeps a Count-Min Sketch for every country and minute, plus a list of its 200 strongest candidates. Its memory stays fixed however long the tail of one-off hashtags grows, and the sketch can overcount but never undercounts.',
      focus: ['c1', 'c2'],
    },
    {
      caption:
        'Every minute, the counters send their sketches and candidates to the **merger**. Sketches of the same shape simply add up, counter by counter, so the merger gets estimates for all the traffic without any hashtag ever living on one machine.',
      flow: [['c1-merger', 'c2-merger']],
    },
    {
      caption:
        'The merger adds the last 60 minute-sketches for the sliding hour, estimates each candidate, and divides by its usual level from the **baselines**. The 10 biggest jumps in each country go to the **trends cache**.',
      flow: ['merger-baselines', '<merger-baselines', 'merger-trends'],
      notes: [{ target: 'trends', text: 'top 10 per country' }],
    },
  ],
};

/** v4: checkpoints, a crashed counter, a stalled pipeline and a long backlog. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'events', type: 'stream', label: 'Post events', x: 0, y: 0 },
    { id: 'counters', type: 'worker', label: 'Counters', x: 1, y: 0 },
    { id: 'merger', type: 'worker', label: 'Merger', x: 2, y: 0 },
    { id: 'trends', type: 'cache', label: 'Trends cache', x: 3, y: 0 },
    { id: 'ckpt', type: 'objectStore', label: 'Checkpoints', sublabel: 'every minute', x: 1, y: 1 },
    { id: 'readers', type: 'client', label: 'Readers', x: 2, y: 1 },
    { id: 'svc', type: 'service', label: 'Trends service', x: 3, y: 1 },
  ],
  edges: [
    { id: 'events-counters', from: 'events', to: 'counters', kind: 'async' },
    { id: 'counters-merger', from: 'counters', to: 'merger', kind: 'async' },
    { id: 'merger-trends', from: 'merger', to: 'trends', kind: 'sync' },
    { id: 'counters-ckpt', from: 'counters', to: 'ckpt', kind: 'sync' },
    { id: 'readers-svc', from: 'readers', to: 'svc', kind: 'sync' },
    { id: 'svc-trends', from: 'svc', to: 'trends', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every minute, each counter saves a checkpoint to object storage: its sketches, its candidate lists and the stream [[offsets|offset]] they cover, all together.',
      flow: ['events-counters', 'counters-ckpt'],
    },
    {
      caption:
        'A counter crashes. Its replacement loads the last checkpoint and replays the stream from the saved offsets, about a minute of events. State and offsets were saved together, so no use is lost or counted twice: [[exactly-once|exactly-once]] counting inside the pipeline.',
      flow: ['<counters-ckpt', 'events-counters'],
      notes: [{ target: 'ckpt', text: 'restore, then replay' }],
    },
    {
      caption:
        'The merger stalls for ten minutes. The **trends cache** keeps serving the last lists with their time, and the **trends service** hides any list older than about 15 minutes rather than present stale trends as current.',
      fail: ['merger'],
      flow: ['readers-svc', 'svc-trends', '<svc-trends', '<readers-svc'],
      notes: [{ target: 'trends', text: 'list from 18:04' }],
    },
    {
      caption:
        'The stream backs up for hours. Trends don’t need the backlog: the counters skip ahead to recent events, and the nightly batch job counts the gap later. A billing system could never skip events; a list about right now can.',
      flow: ['events-counters'],
      notes: [{ target: 'events', text: 'skip to now' }],
    },
  ],
};

const problem: Problem = {
  id: 'trending-topics',
  title: 'Trending topics (top-K)',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design the trending topics list for a large social network: the top K hashtags people are posting about right now, worldwide and in each country, refreshed every minute or so.',
  concepts: ['back-of-the-envelope', 'queues-and-streams', 'batch-vs-stream', 'probabilistic-structures', 'sharding', 'caching', 'requirements'],
  hints: [
    'Start with the volume: how many hashtag uses arrive each second, and how many different hashtags appear in an hour? Then ask what trending means: the most used, or the most unusual?',
    'A database query every few minutes is slow and stale, so think about counting as posts arrive, in windows of time. Then ask how much memory exact counts need when most hashtags are used once, and what happens when one hashtag takes over the world.',
    'One shape that works: posts become events on a stream; [[stream processing|stream-processing]] workers, fed at random, count hashtags per minute and per country in a [[Count-Min Sketch|count-min-sketch]] with a short list of candidates; and every minute a merger adds the sketches, scores candidates by growth over their usual level, and writes the [[top K|top-k]] for each country to a cache everyone reads.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many posts arrive each day, and how many hashtags do they carry?',
      why: 'This sets the event rate. Assume about 500 million posts a day with two hashtags each on average (ballpark): about 10,000 uses a second and 30,000 at peak, spread over some 10 million distinct hashtags an hour, most of them used once.',
    },
    {
      q: 'Does trending mean the most used, or the fastest growing?',
      why: 'Most used is a plain top K by count, and the same everyday tags win all day. Fastest growing compares each tag with its usual level, which needs baselines from history and a minimum volume.',
    },
    {
      q: 'How fresh must the lists be, and what period do they cover?',
      why: 'A list refreshed every minute and covering the last hour needs stream processing with windows. A daily list could be a batch job over stored posts, which is far simpler.',
    },
    {
      q: 'Worldwide only, or per country, language or city?',
      why: 'Each scope is another set of counters, so lists per country multiply memory by about 200. Lists per city multiply it by thousands, which is where fixed-size summaries pay off.',
    },
    {
      q: 'Must the counts shown be exact?',
      why: 'If the app shows “52K posts”, a small overcount is invisible, and approximate counting in fixed memory is fine. Exact counts would force every use of a tag onto one machine.',
    },
    {
      q: 'How much do spam and manipulation matter?',
      why: 'A trends list is a target: bot networks post a tag together to push it onto the list. Counting distinct authors per candidate, and filtering flagged accounts and blocked terms, guards against that.',
    },
  ],
  requirements: {
    functional: [
      'Show the top 10 trending hashtags worldwide and for each country, each with a rounded count such as “52K posts”.',
      'Refresh the lists about every minute, covering roughly the last hour.',
      'Rank by how unusual a tag’s activity is, so a sudden spike can beat a large but steady tag.',
      'Keep blocked terms off the lists, and let staff remove a trend by hand.',
    ],
    nonFunctional: [
      'Fresh: a sudden spike appears within about 2 minutes (ballpark).',
      'Fast and cheap to read: lists come from a cache in a few milliseconds, however many people look.',
      'Approximate is fine: counts may be off by a fraction of a percent, as long as no real top trend goes missing.',
      'Posting must never wait on counting: all counting happens off the posting path.',
      'Scale: about 10,000 hashtag uses a second, 30,000 at peak, and tens of thousands for a single tag during a big event (ballpark).',
    ],
    outOfScope: [
      'Personal trends based on whom a user follows.',
      'Finding topics in text without hashtags, such as names and phrases, beyond noting that it adds a language-processing step.',
      'Spam detection itself: assume accounts arrive already flagged.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Posts per day', value: '500 million (ballpark)' },
      { label: 'Hashtags per post', value: 'about 2 on average' },
      { label: 'Distinct hashtags in an hour', value: 'about 10 million, most used once' },
      { label: 'Scopes', value: 'worldwide plus about 200 countries' },
      { label: 'Busiest hour compared with the daily average', value: '3×' },
      { label: 'In the calculator', value: '100 million daily users with 20 actions each: 10 hashtag uses (writes) and 10 list views (reads). The storage line is the raw event history.' },
    ],
    steps: [
      { label: 'Hashtag uses per second', math: '5 × 10⁸ posts × 2 = 10⁹ a day; ÷ 10⁵ seconds', result: '≈ 10,000 a second, 30,000 at peak' },
      { label: 'Uses in one hour', math: '10,000 a second × 3,600 seconds', result: '≈ 36 million, over about 10 million distinct hashtags' },
      { label: 'Exact counts for one hour', math: 'up to 3.6 × 10⁷ hashtag-minute entries × 2 (worldwide and country) × 50 bytes', result: '≈ 4 GB, growing with every new scope' },
      { label: 'One sketch', math: '5 rows × 27,200 counters × 4 bytes', result: '≈ 540 KB, overcounting by at most 0.01% of the total about 99% of the time' },
      { label: 'Sketches for the sliding hour', math: 'worldwide 60 × 540 KB; countries 60 × 200 × 54 KB, using smaller sketches', result: '≈ 32 MB + 650 MB: under 1 GB, whatever the traffic' },
      { label: 'List views per second', math: '10⁹ views a day ÷ 10⁵ seconds', result: '≈ 10,000 a second, nearly all cache hits' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 20, readsPerWrite: 1, objectBytes: 100, peakFactor: 3, retentionYears: 1 },
  },
  api: [
    {
      signature: 'GET /v1/trends?scope=country:JP  →  200 { asOf, trends: [{ rank, hashtag, postCount }] }',
      description:
        'The current list for one scope, read from the trends cache. The same answer serves everyone in that country, so it can be cached at the network edge for about 30 seconds.',
    },
    {
      signature: 'post event → stream: { postId, authorId, country, createdAt, hashtags: ["worldcup", "goal"] }',
      description:
        'Appended by the post service after a post is saved, so posting never waits on counting. Hashtags are normalized once, here: lowercased, with accents removed.',
    },
    {
      signature: 'merger → cache: SET trends:{scope} { asOf, trends }   once a minute',
      description: 'The merger replaces each scope’s list whole, in one write, so readers never see a half-built list.',
    },
    {
      signature: 'POST /v1/trends/blocklist  { term, reason }  →  201 Created',
      description: 'For staff. A blocked term never trends, and a trend can be pulled from the current lists at once.',
    },
  ],
  dataModel: [
    {
      entity: 'Post event',
      fields: ['post_id', 'author_id', 'country', 'created_at: event time', 'hashtags: normalized list'],
      store: 'Event stream such as Kafka, partitioned at random, kept for 7 days',
      why: 'About 10,000 hashtag uses a second (ballpark) arrive in bursts. The stream absorbs them, lets a counter replay after a crash, and feeds the nightly batch job as well.',
    },
    {
      entity: 'Minute sketch',
      fields: ['scope: worldwide or a country', 'minute', 'counters: 5 rows × 27,200 (2,720 for a country)'],
      store: 'In memory on each counter and on the merger, saved in every checkpoint',
      why: 'Fixed size whatever the traffic. Sketches of the same shape add up, so the merger sums the counters’ sketches for each minute and 60 minutes for the hour, then subtracts the minute that leaves the window.',
    },
    {
      entity: 'Candidate list',
      fields: ['scope', 'hashtag', 'estimated_count', 'distinct_authors: HyperLogLog'],
      store: 'In memory beside each sketch, a few hundred entries',
      why: 'A sketch can estimate any tag you name, but it can’t list its biggest ones, so each counter keeps its strongest candidates. The merger estimates their union from the summed sketch.',
    },
    {
      entity: 'Baseline',
      fields: ['hashtag', 'scope', 'hour_of_week', 'usual_count'],
      store: 'Key-value store, rebuilt nightly by a batch job over the archived events',
      why: 'Trending means unusual, so each candidate is compared with its usual level for this hour of the week. Only candidates are looked up: a few thousand reads a minute.',
    },
    {
      entity: 'Trends list',
      fields: ['key: trends:{scope}', 'as_of', 'entries: [{ rank, hashtag, rounded_count }]'],
      store: 'Cache such as Redis, written once a minute',
      why: 'About 200 small lists that everyone reads: an ideal cache entry. Each is rewritten whole every minute, so nothing ever needs invalidating.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Show the most used hashtags of the last hour, per country, with nothing new to run.',
      diagram: v1,
      explanation:
        'A scheduled query over stored posts works for a small network. At 10,000 hashtag uses a second it scans tens of millions of rows every run, lists per country multiply the work, and a trend that breaks at 9:01 appears at 9:15. Ranking by raw count also crowns the same everyday tags all day.',
    },
    {
      title: 'v2: It scales',
      solves: 'Lists about a minute old, from about 30,000 hashtag uses a second at peak (ballpark), without scanning stored posts.',
      diagram: v2,
      explanation:
        'Counting moves from a query over stored posts to a stream job that keeps running totals in memory, so lists are about a minute old instead of fifteen. Two weak spots remain: a hashtag that takes over the world lands on one counter, and the counters must remember millions of hashtags used once.',
    },
    {
      title: 'v3: Fixed memory, no hot keys',
      solves: 'One viral hashtag can swamp the counter that owns it, and exact counts for a long tail of one-off tags waste memory in every scope.',
      diagram: v3,
      explanation:
        'Memory no longer depends on how many hashtags exist, and no hashtag, however viral, lands on one machine. The price is approximation: counts can run slightly high, which nobody notices once they are rounded to “52K posts”. Scoring growth against a baseline turns a list of popular tags into a list of trends.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'Counters crash, the merger stalls and streams back up; the lists must stay honest, and counts must not drift.',
      diagram: v4,
      explanation:
        'Trends are disposable: if the pipeline breaks, the cost is a list a few minutes old, not lost data. Checkpoints make restarts cheap and exact, and since the posts themselves are stored elsewhere, any window can be recounted later.',
    },
  ],
  deepDives: [
    {
      title: 'Exact counts or a Count-Min Sketch',
      problem:
        'About 36 million hashtag uses arrive in an hour (ballpark), spread over some 10 million distinct hashtags, most used once. Counting each exactly, per minute and per country, means remembering all of them, yet trends need only the few hundred biggest.',
      options: {
        caption: 'Four ways to find the heavy hitters',
        rows: [
          {
            option: 'Exact counts in a hash map',
            goodAt: 'Exact and simple, and fine for one worldwide list at moderate volume.',
            badAt: 'Memory grows with every distinct hashtag, times every country and minute; the long tail of one-off tags costs the most.',
            pickWhen: 'Moderate volume, or a single scope.',
          },
          {
            option: 'Count-Min Sketch plus candidates',
            goodAt:
              'Fixed memory per scope and minute; sketches add up across machines and minutes, and a candidate list keeps the heavy hitters. It can overcount but never undercounts.',
            badAt: 'Counts are estimates, and the candidate lists must be long enough, a few hundred per counter, that no real trend falls off them.',
            pickWhen: 'Many scopes, a long tail, or counting spread over many machines: the default here.',
          },
          {
            option: 'Space-Saving counters',
            goodAt: 'A fixed set of, say, 1,000 counters; a new tag replaces the smallest, so heavy hitters survive with a known bound on their error.',
            badAt: 'Answers only for tags still in its list, and lists from different machines merge less cleanly than sketches.',
            pickWhen: 'One machine per scope, when only the top ever matters.',
          },
          {
            option: 'Sampling',
            goodAt: 'Count one post in ten and multiply: a tenth of the work.',
            badAt: 'Small countries and brand-new tags get too few samples, so their trends show up late or not at all.',
            pickWhen: 'A rough worldwide list at enormous volume.',
          },
        ],
      },
      recommendation:
        'Use a Count-Min Sketch for each scope and minute, with a candidate list of a few hundred tags beside it. Size it from the error you accept: 5 rows of 27,200 counters, about 540 KB, overcount by at most 0.01% of the window’s total about 99% of the time. Show rounded counts, such as “52K posts”, so a small overcount never matters.',
    },
    {
      title: 'Which window, and what counts as trending',
      problem:
        'Ranking by raw count puts everyday tags such as #love and #photography on top all day. Trending means unusual: a tag used far more right now than it normally is. That needs a window for “now” and a baseline for “normally”.',
      options: {
        caption: 'Ways to score a hashtag',
        rows: [
          {
            option: 'Raw count in hourly tumbling windows',
            goodAt: 'Simplest: one count per tag per hour.',
            badAt: 'Everyday tags win every hour, and the list jumps each time a new hour starts.',
            pickWhen: 'A most-used-today list, not trends.',
          },
          {
            option: 'Raw count in a sliding hour',
            goodAt: 'Moves smoothly: sixty one-minute buckets, adding the newest and dropping the oldest each minute.',
            badAt: 'Still rewards tags that are always popular.',
            pickWhen: 'As the input to a better score.',
          },
          {
            option: 'Decaying count',
            goodAt: 'One number per tag: every minute, multiply each count by, say, 0.95 and add the new uses, so recent uses weigh most.',
            badAt: 'Hard to explain, and it still favors big everyday tags.',
            pickWhen: 'Memory is so tight that one counter per tag is all you can keep.',
          },
          {
            option: 'Growth over a baseline',
            goodAt:
              'Divides the last hour’s count by the tag’s usual count for this hour of the week, so a tag ten times above normal beats a big but steady one.',
            badAt: 'Needs baselines from history, plus a minimum volume, or a tag going from 1 use to 12 looks like a twelvefold surge.',
            pickWhen: 'The default for trends.',
          },
        ],
      },
      recommendation:
        'Count in one-minute buckets, sum the last 60 for a sliding hour, and score each candidate by its growth over a baseline that a nightly [[batch processing|batch-processing]] job computes, with a minimum volume and a minimum number of distinct authors. Use event time with a [[watermark|watermark]] a minute behind, and close each minute after about two minutes of [[allowed lateness|allowed-lateness]]. Posts that arrive later still count in the nightly batch, just not in this hour’s trends.',
    },
    {
      title: 'Hot hashtags and how to split the work',
      problem:
        'Counting runs on many machines, so the stream is split into partitions. How you split it decides whether one viral hashtag can overload a single machine, and whether any machine ever sees a hashtag’s whole count.',
      options: {
        caption: 'Ways to spread about 30,000 uses a second (ballpark)',
        rows: [
          {
            option: 'Key by hashtag',
            goodAt: 'Each hashtag lives on one counter, so its count there is exact and complete.',
            badAt: 'A viral hashtag sends tens of thousands of uses a second to one counter, which falls minutes behind.',
            pickWhen: 'Traffic spreads evenly over many tags.',
          },
          {
            option: 'Random partitions, merged sketches',
            goodAt: 'Every counter gets an even share of everything, and sketches add up, so no counter ever sees a hot key.',
            badAt: 'Every counter ships its sketches to the merger each minute, a steady few megabytes a second (ballpark).',
            pickWhen: 'Counting with sketches: the default here.',
          },
          {
            option: 'Pre-aggregate, then key by hashtag',
            goodAt:
              'Each machine sums its random share for a few seconds, then sends one partial count per tag to the tag’s owner, like the combine step of [[MapReduce|mapreduce]]: 50,000 uses become a few records.',
            badAt: 'Two stages with a [[shuffle|shuffle]] between them, which add seconds and moving parts.',
            pickWhen: 'Exact counts are required.',
          },
          {
            option: 'Split known hot tags',
            goodAt: 'Turn #worldcup into #worldcup-1 to #worldcup-8, spread those over counters, and add them back together at the end.',
            badAt: 'You must know which tags will be hot before they are.',
            pickWhen: 'A few predictable hot tags, such as scheduled events.',
          },
        ],
      },
      recommendation:
        'With sketches, partition the stream at random and merge sketches every minute, and hot hashtags stop being a problem at all. If the product needs exact counts, pre-aggregate on random partitions for a few seconds and then key by hashtag. Either way, never key raw events by hashtag at this scale.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 300,000 hashtag uses a second at peak (ballpark).',
      impact: 'Counters fall behind and lists grow stale.',
      mitigation:
        'Add stream partitions and counters. A sketch stays the same size however many uses it counts, so memory and merge traffic grow with the number of counters, not with the traffic.',
    },
    {
      scenario: 'A world event: one hashtag is 30% of all uses for an hour.',
      impact: 'If events were keyed by hashtag, one counter would take 30% of all traffic and fall minutes behind.',
      mitigation: 'Random partitions with merged sketches, or pre-aggregation before keying, spread that tag over every counter.',
    },
    {
      scenario: 'A counter crashes.',
      impact: 'Its share of the counts stops for a minute or so.',
      mitigation: 'A replacement restores the last checkpoint and replays the stream from the saved offsets, so nothing is lost or counted twice.',
    },
    {
      scenario: 'The stream backs up for hours.',
      impact: '[[Consumer lag|consumer-lag]] grows, and the lists describe a moment that has passed.',
      mitigation:
        'Alert on lag. Once it passes about 15 minutes, skip ahead to recent events and let the nightly batch job count the gap, since trends from an hour ago are worth little.',
    },
    {
      scenario: 'The trends cache dies.',
      impact: 'The trends service can’t read the lists.',
      mitigation:
        'The lists are tiny, 10 tags for each of some 200 scopes, so every trends server keeps a copy in memory and the network edge holds them for 30 seconds. The merger rewrites them every minute anyway.',
    },
    {
      scenario: 'A bot network pushes a hashtag.',
      impact: 'Thousands of accounts post #freecoins together, and it starts to trend.',
      mitigation:
        'Count distinct authors per candidate with a [[HyperLogLog|hyperloglog]] and require a minimum, ignore accounts flagged as spam, and keep a blocklist of terms that may never trend.',
    },
    {
      scenario: 'Phones post with wrong clocks, or come back online with hours-old posts.',
      impact: 'Events claim times far in the past or the future, which puts them in the wrong windows.',
      mitigation:
        'Use the time the server received the post when a phone’s clock is more than a few minutes off, and leave anything later than the allowed lateness out of trends.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Counts hashtags with a scheduled query or a stream job, and returns the top K.',
        'Notices that querying every post every few minutes is slow and stale.',
        'Caches the finished lists, since everyone in a country sees the same one.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Counts in a stream with windows, and explains tumbling and sliding windows and event time.',
        'Uses a Count-Min Sketch with a candidate list to find the top K in fixed memory, and states its error.',
        'Defines trending as growth over a baseline, not raw volume.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Spots the hot-key problem and solves it with random partitions and mergeable sketches, or with pre-aggregation.',
        'Covers late events, watermarks, checkpoints and replay, and knows when to skip a backlog.',
        'Raises manipulation without being asked: distinct authors, spam accounts and blocklists.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A World Cup final is on, and #worldcup is 30% of all posts. What breaks?',
      a: 'In a design keyed by hashtag, the one counter that owns #worldcup takes 30% of all traffic and falls behind. In mine, events are spread at random, so every counter sees a share of #worldcup and adds it to its sketch, and the merger adds the sketches up. The hot tag costs no more than any other.',
    },
    {
      q: 'Why not count every hashtag exactly in a hash map?',
      a: 'For one worldwide list I could: tens of millions of entries, a few gigabytes (ballpark). But memory grows with every one-off tag, times every country and minute, and exact counts push each tag onto one machine. A sketch has a fixed size, adds up across machines, and its error, a small overcount, vanishes once counts are rounded for display.',
    },
    {
      q: '#love is always the most used tag. How do you stop it trending all day?',
      a: 'Trending is growth, not volume. I divide each candidate’s count over the last hour by its usual count for this hour of the week, from baselines a nightly batch job computes, and require a minimum volume so tiny tags can’t leap from 1 use to 12. #love is big but steady, so its ratio stays near one.',
    },
    {
      q: 'A thousand bot accounts start posting #freecoins. How do you keep it off the list?',
      a: 'I count distinct authors per candidate with a HyperLogLog of a few kilobytes and require a minimum, so a thousand accounts posting a million times still count as a thousand authors. Accounts flagged as spam are dropped before counting, and a blocklist keeps some terms from ever trending, with a person able to pull a trend by hand.',
    },
    {
      q: 'A phone posts from the subway, and its events arrive ten minutes late. Do they count?',
      a: 'For trends, mostly not. I count by event time with a watermark a minute behind and two minutes of allowed lateness, so events up to about three minutes late still update their minute and later ones are left out. They still reach the posts store and the nightly batch, and a list about right now loses little by missing them.',
    },
    {
      q: 'How would you add trends for every city?',
      a: 'Each city is one more scope, so each counter keeps a sketch per city per minute, smaller for small cities, since the error is a share of each scope’s own total. Thousands of cities multiply memory and merge traffic, so I’d use five-minute buckets for cities and require more volume before a city trend shows.',
    },
  ],
  rubric: [
    { item: 'Estimated hashtag uses per second, distinct hashtags and memory, and saw that the long tail drives memory', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Counted in a stream with windows instead of querying stored posts, using event time and handling late events', weight: 25, lessonId: 'batch-vs-stream' },
    { item: 'Used a Count-Min Sketch with a candidate list for the top K in fixed memory, and stated its overcounting error', weight: 20, lessonId: 'probabilistic-structures' },
    { item: 'Spread hashtags across partitions so a viral tag can’t overload one machine', weight: 15, lessonId: 'sharding' },
    { item: 'Defined trending as growth over a baseline, with guards against spam', weight: 10, lessonId: 'requirements' },
    { item: 'Served precomputed lists from a cache, the same for everyone in a country', weight: 5, lessonId: 'caching' },
    { item: 'Recovered from crashes with checkpoints and replay, and decided what to do with a backlog', weight: 10, lessonId: 'queues-and-streams' },
  ],
};

export default problem;
