import type { DiagramSpec, Lesson } from '../types';

/** Small diagrams for the compare block: the same profile read, two ways. */
const normalizedRead: DiagramSpec = {
  grid: { cols: 2, rows: 1 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Profile service', x: 0, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Main database', sublabel: '4 queries per view', x: 1, y: 0 },
  ],
  edges: [{ id: 'svc-db', from: 'svc', to: 'db', kind: 'sync' }],
};

const denormalizedRead: DiagramSpec = {
  grid: { cols: 2, rows: 1 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Profile service', x: 0, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Main database', sublabel: '1 row per view', x: 1, y: 0 },
  ],
  edges: [{ id: 'svc-db', from: 'svc', to: 'db', kind: 'sync' }],
};

/** The main step-through: counting, stored counts, then a read model fed by change events. */
const profileReads: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'app', type: 'client', label: 'Maya’s app', x: 0, y: 0.5 },
    { id: 'svc', type: 'service', label: 'Profile service', x: 1, y: 0.5 },
    { id: 'db', type: 'sqlDb', label: 'Main database', sublabel: 'source of truth', x: 2, y: 0 },
    { id: 'rm', type: 'nosqlDb', label: 'Profile read model', sublabel: 'one document per user', x: 2, y: 1 },
    { id: 'stream', type: 'stream', label: 'Change events', x: 3, y: 0 },
    { id: 'worker', type: 'worker', label: 'Read model updater', x: 3, y: 1 },
  ],
  edges: [
    { id: 'app-svc', from: 'app', to: 'svc', kind: 'sync' },
    { id: 'svc-db', from: 'svc', to: 'db', kind: 'sync' },
    { id: 'svc-rm', from: 'svc', to: 'rm', kind: 'sync' },
    { id: 'db-stream', from: 'db', to: 'stream', kind: 'async' },
    { id: 'stream-worker', from: 'stream', to: 'worker', kind: 'async' },
    { id: 'worker-rm', from: 'worker', to: 'rm', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Before: each profile view sends four queries to the **main database**, including counts over millions of rows.',
      flow: ['app-svc', 'svc-db', '<svc-db', '<app-svc'],
      notes: [{ target: 'db', text: '4 queries', tone: 'alert' }],
    },
    {
      caption: 'Stored counts: the same view now reads one row, because every follow already updated Maya’s count.',
      flow: ['app-svc', 'svc-db', '<svc-db', '<app-svc'],
      notes: [{ target: 'db', text: '1 row', tone: 'signal' }],
    },
    {
      caption:
        'Next, a read model. Every committed change, such as Leo following Maya, is also published as an event, for example through a [[transactional outbox|transactional-outbox]]. The **read model updater** applies it to Maya’s profile document.',
      add: ['stream', 'worker', 'rm', 'db-stream', 'stream-worker', 'worker-rm'],
      flow: ['db-stream', 'stream-worker', 'worker-rm'],
    },
    {
      caption: 'The profile page now reads one document from the **profile read model**: name, counts and latest photos in a single lookup.',
      add: ['svc-rm'],
      flow: ['app-svc', 'svc-rm', '<svc-rm', '<app-svc'],
      notes: [{ target: 'rm', text: '1 document', tone: 'signal' }],
    },
    {
      caption:
        'The read model trails the database by a moment. For a few seconds after Maya posts, her own profile reads from the main database, so she sees her new photo at once: [[read-your-writes consistency|read-your-writes]].',
      flow: ['app-svc', 'svc-db', '<svc-db', '<app-svc'],
      notes: [{ target: 'db', text: 'her own view', tone: 'plain' }],
    },
  ],
};

/** The nightly recount repairs a stored count that drifted. */
const recount: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'job', type: 'worker', label: 'Recount job', sublabel: 'nightly', x: 0, y: 0.5 },
    { id: 'follows', type: 'sqlDb', label: 'Follows table', sublabel: 'source of truth', x: 1, y: 0 },
    { id: 'counts', type: 'sqlDb', label: 'Stored counts', sublabel: 'on user rows', x: 1, y: 1 },
  ],
  edges: [
    { id: 'job-follows', from: 'job', to: 'follows', kind: 'sync' },
    { id: 'job-counts', from: 'job', to: 'counts', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'At 3 a.m., the **recount job** counts each user’s followers straight from the **follows table**.',
      flow: ['job-follows', '<job-follows'],
      notes: [{ target: 'follows', text: 'Maya: 2,412', tone: 'plain' }],
    },
    {
      caption: 'It compares them with the **stored counts**. Maya’s says 2,415: three follows were counted twice after a retried event (illustrative).',
      flow: ['job-counts', '<job-counts'],
      notes: [{ target: 'counts', text: '2,415, off by 3', tone: 'alert' }],
    },
    {
      caption: 'It writes the true number back. The error lasted at most a day, and nobody had to spot it first.',
      flow: [{ edge: 'job-counts', tag: 'fixed' }],
      notes: [{ target: 'counts', text: '2,412', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'denormalization',
  module: 'm4',
  order: 9,
  title: 'Denormalization and read models',
  idea: 'Denormalizing stores copies and precomputed results where reads need them, so a hot read touches one row instead of joining and counting, paid for with extra storage and extra work on every write.',
  minutes: 13,
  prerequisites: ['sql-vs-nosql', 'indexes'],
  outcomes: [
    'Explain the trade: faster reads for more storage and more complex writes.',
    'Choose between stored counts, materialized views and read models for a slow read.',
    'Keep copies in sync, and repair them when they drift.',
  ],
  analogy: {
    title: 'A number on every page',
    body: 'You keep a friend’s phone number in your contacts. Then you start copying it onto every page where you might need it: your calendar, your recipe book, the note on the fridge. Now you never have to look it up, wherever you are.\n\nThe catch comes when your friend gets a new number. You must find and update every copy, and if you miss one, that page is quietly wrong. Denormalization makes the same deal: faster reads, in exchange for more copies to keep in sync.',
  },
  whyItMatters:
    'Snapgram’s profile page shows three numbers under Maya’s name: followers, posts and likes. Snapgram’s tables are [[normalized|normalization]], with each fact in one place, so each number is computed when the page loads by counting rows in the follows, photos and likes tables. With an [[index|index]], counting Maya’s 2,000 followers is quick, but counting the 2 million followers of a celebrity is not, and the profile page is one of the most viewed pages in the app.\n\nEvery view repeats the same counting, and the answers change only when someone follows, posts or likes. At about 10 million daily users, the database spends much of its day recounting numbers it counted a second ago.',
  body: [
    {
      kind: 'prose',
      md: 'In a normalized [[schema|schema]], each fact is stored once, and reads put the pieces back together with a [[join|join]] or a count. Writes stay simple and nothing can disagree, but every read pays. [[Denormalization|denormalization]] flips that: you store copies and [[precomputed|precomputation]] results where reads need them, so a read becomes a single lookup and the writes do the extra work.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Normalized: count on every read',
        summary: 'Four queries per profile view',
        points: [
          'Read Maya’s user row, then count her followers, her posts and the likes on her photos.',
          'A celebrity’s follower count walks about 2 million index entries on every view.',
          'Writes stay small: a follow is a single insert.',
        ],
        diagram: normalizedRead,
      },
      right: {
        title: 'Denormalized: store the counts',
        summary: 'One row per profile view',
        points: [
          'The user row carries `follower_count`, `post_count` and `like_count`.',
          'A profile view reads one row by its key.',
          'Every follow, post and like also updates a count.',
        ],
        diagram: denormalizedRead,
      },
      caption: 'The same profile page, read two ways.',
    },
    {
      kind: 'numbers',
      items: [
        { label: 'Count 2 million index entries', value: '≈ 100 ms', note: 'ballpark, on every view of a celebrity profile' },
        { label: 'Read one row by its key', value: '≈ 1 ms', note: 'ballpark' },
        { label: 'Extra writes per follow', value: '1', note: 'add 1 to the followed user’s count' },
        { label: 'Extra storage for 100 million users', value: '2.4 GB', note: 'three 8-byte counters each' },
      ],
      caption: 'Rough costs of the two designs, for illustration.',
    },
    { kind: 'heading', text: 'Paying at write time' },
    {
      kind: 'prose',
      md: 'With stored counts, a follow becomes two writes: insert the follow row and add 1 to Maya’s `follower_count`. Do both in one [[transaction|transaction]], so a crash cannot leave them disagreeing. This extra work per write is a kind of [[write amplification|write-amplification]], and it pays off when reads far outnumber writes, as profile views outnumber follows.\n\nWrites get harder in a second way. A celebrity can gain thousands of followers a minute, and every one of them updates the same row, so those writes queue behind each other. Big systems split such a counter across several rows and add them up on read, or batch the increments and apply them every second.',
    },
    { kind: 'heading', text: 'Read models' },
    {
      kind: 'prose',
      md: 'Stored counts fix three numbers, but the whole profile page, with the name, avatar, counts and latest photos, still takes several queries. A [[read model|read-model]] goes further: a separate copy of the data shaped exactly like one screen, such as one document per user in a [[document store|document-store]], holding everything the profile page shows.',
    },
    {
      kind: 'diagram',
      title: 'From counting to a read model',
      caption: 'Step through the profile page as it moves from counting to stored counts to a read model.',
      spec: profileReads,
    },
    {
      kind: 'prose',
      md: 'The read model is [[derived data|derived-data]]. The main database stays the [[source of truth|source-of-truth]], and the read model can always be thrown away and rebuilt from it. It is [[eventually consistent|eventual-consistency]], usually by well under a second (ballpark), and keeping separate models for writing and reading is called [[command query responsibility segregation|cqrs]] (CQRS), covered in [CQRS and event sourcing](lesson:cqrs-event-sourcing).',
    },
    { kind: 'heading', text: 'Materialized views' },
    {
      kind: 'prose',
      md: 'Sometimes the database can do the precomputing for you. A [[materialized view|materialized-view]] stores the result of a query like a table, and you refresh it when you choose, for example every ten minutes. It suits results that are expensive to compute and fine to be a little old, such as Snapgram’s top hashtags of the week, and you can index it like any table. Between refreshes it is [[stale|stale-data]], and a full refresh reruns the whole query.',
    },
    {
      kind: 'code',
      code: "CREATE MATERIALIZED VIEW top_hashtags_week AS\nSELECT tag, COUNT(*) AS uses\nFROM photo_tags\nWHERE created_at > now() - interval '7 days'\nGROUP BY tag;\n\n-- run by a scheduled job every 10 minutes\nREFRESH MATERIALIZED VIEW top_hashtags_week;",
      caption: 'A PostgreSQL materialized view of the week’s top hashtags, refreshed on a schedule.',
    },
    { kind: 'heading', text: 'When copies drift' },
    {
      kind: 'prose',
      md: 'Every copy can drift from the truth. An update can run outside the transaction and fail, a bug can count a like twice, an event can be replayed. So denormalized data needs a repair path: a [[reconciliation|reconciliation]] job that recomputes the numbers from the source tables and fixes any that disagree. Snapgram runs one every night.',
    },
    {
      kind: 'diagram',
      title: 'The nightly recount',
      caption: 'A drifted follower count, found and fixed.',
      spec: recount,
    },
    {
      kind: 'prose',
      md: 'A brand-new copy needs the same care: when you add a counter column or a read model, a [[backfill|backfill]] fills it from the existing data before anyone reads it.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out how to keep a recount from racing with live writes, how to update a materialized view as rows change instead of rerunning it, and how document and wide-column stores make denormalization the default. Go deeper touches on all three.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to make a slow read fast.',
    rows: [
      {
        option: 'Normalized, computed on read',
        goodAt: 'One copy of every fact, simple writes, always correct.',
        badAt: 'Hot reads repeat the same joins and counts.',
        pickWhen: 'Reads are cheap to compute, or writes dominate.',
      },
      {
        option: 'Stored counts and copied columns',
        goodAt: 'One-row reads for the values pages show most.',
        badAt: 'Every write updates several places, hot rows contend, and copies can drift.',
        pickWhen: 'A few values are read far more often than they change, like profile counts.',
      },
      {
        option: 'Materialized view',
        goodAt: 'The database computes and stores the result for you.',
        badAt: 'Stale between refreshes, and a full refresh reruns the whole query.',
        pickWhen: 'Summaries and reports where minutes of staleness are fine.',
      },
      {
        option: 'Read model fed by events',
        goodAt: 'Shaped exactly for one screen, scaled on its own, and rebuildable.',
        badAt: 'Eventually consistent, with another store and pipeline to run.',
        pickWhen: 'Very hot screens at large scale, like Snapgram’s profile page.',
      },
    ],
  },
  realWorld: {
    title: 'PostgreSQL’s materialized views',
    body: 'PostgreSQL’s documentation describes a materialized view as a view whose results persist in a table-like form. Reading it is often much faster than reading the underlying tables, but the data is not always current: it changes only when you run `REFRESH MATERIALIZED VIEW`, and the docs suggest a job that refreshes a sales summary each night.\n\nThe docs also put an index on a materialized view. In their example, an exact-match lookup in a word list took about 188 ms when read from the original file, and about 0.12 ms from an indexed materialized view of the same words.',
    sourceUrl: 'https://www.postgresql.org/docs/current/rules-materializedviews.html',
    sourceLabel: 'PostgreSQL documentation, “Materialized Views”',
  },
  interview: {
    whenToMention:
      'When a read-heavy screen needs data from several tables or services, such as counts, feeds or dashboards, and your design joins or counts on every request. Say what you copy or precompute, how it stays up to date, and how stale it may be.',
    sayItLikeThis: [
      'Profile views far outnumber follows, so I’ll store follower and post counts on the user row and update them in the same transaction as the follow.',
      'The profile page reads a read model, one document per user, updated from change events; it can trail by a second, which is fine for counts.',
      'Counters drift, so a nightly job recounts from the source tables and repairs them.',
    ],
    followUps: [
      {
        q: 'How do you stop a celebrity’s follower count from becoming a hot row?',
        a: 'Thousands of follows a minute all updating one row means they wait on each other’s locks. Split the counter into, say, 16 rows that each take a share of the increments and add them up on read, or buffer increments and apply them in batches every second. The count lags slightly, which is fine for display.',
      },
      {
        q: 'What happens when the read model falls behind or gets corrupted?',
        a: 'While it lags, reads show slightly old data, so show people their own changes from the source. Because the read model is derived, you can throw it away and rebuild it by replaying the events or rescanning the source tables.',
      },
      {
        q: 'When would you not denormalize?',
        a: 'When writes dominate or the data changes constantly, when values must be exact and fresh, such as boost credit balances, or when an index or a cache already makes the read fast enough. Denormalize the few hot reads you have measured, not everything.',
      },
    ],
    redFlags: [
      'Denormalizing everything up front, before any read has been measured as slow.',
      'Copying data with no plan to keep the copies in sync or to repair them.',
      'Treating a counter or a read model as the source of truth, with no way to rebuild it.',
    ],
  },
  mistakes: [
    '**No single source of truth.** If you cannot say which copy wins, you cannot repair drift; keep the normalized tables as the truth and treat everything else as derived.',
    '**Updating copies outside the transaction.** Adding to the count in a separate call after the insert means a crash in between leaves them disagreeing.',
    '**Refreshing a materialized view too often.** A full refresh reruns the whole query, so refreshing every few seconds can cost more than the reads it saves.',
    '**Forgetting the backfill.** A new counter column starts at zero for existing users, so fill it from the source data before you show it.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Why does storing follower counts on the user row make profile views fast?',
      options: [
        {
          text: 'The count is updated once per follow instead of recounted on every view',
          correct: true,
          why: 'Views far outnumber follows, so moving the work to write time saves most of it.',
        },
        {
          text: 'It shrinks the follows table',
          correct: false,
          why: 'The follows table keeps every row; the count is an extra copy on top.',
        },
        {
          text: 'It removes the need for an index on follows',
          correct: false,
          why: 'Other queries, such as listing Maya’s followers, still need the index.',
        },
        {
          text: 'It makes follows faster',
          correct: false,
          why: 'Follows get slower, because each one now updates the count too.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram stores three 8-byte counters on each of 100 million user rows. Roughly how much extra storage is that, in gigabytes?',
      answer: 2.4,
      unit: 'GB',
      tolerance: 1.1,
      solution: [
        'Each user needs 3 × 8 = 24 bytes.',
        '24 bytes × 100,000,000 users = 2,400,000,000 bytes.',
        'That is about 2.4 GB, tiny next to the photos themselves.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which are real costs of storing a like count on each photo row?',
      options: [
        {
          text: 'Every like now writes two rows',
          correct: true,
          why: 'The like row and the photo’s count both change, ideally in one transaction.',
        },
        {
          text: 'The stored count can drift from the real number of likes',
          correct: true,
          why: 'A bug, a retried event or an update outside a transaction can leave it wrong until it is repaired.',
        },
        {
          text: 'A viral photo’s row receives many updates at once',
          correct: true,
          why: 'Thousands of likes on one photo all update the same row and wait on each other.',
        },
        {
          text: 'Reading a photo’s like count now needs a join',
          correct: false,
          why: 'The opposite: the count is read straight from the photo row, with no join or count.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the life of a follow in a read-model design in order.',
      items: [
        'The follow is committed to the main database',
        'A change event is published',
        'The read model updater receives it',
        'Maya’s profile document gets the new count',
        'The next profile view reads the new count',
      ],
      why: 'The main database commits first and stays the source of truth. The read model catches up from the event a moment later.',
    },
    {
      kind: 'single',
      prompt: 'A materialized view of the week’s top hashtags is refreshed every night at 3 a.m. What does a dashboard reading it at 3 p.m. show?',
      options: [
        {
          text: 'The results as of 3 a.m., about half a day old',
          correct: true,
          why: 'A materialized view changes only when it is refreshed, so it shows the last refresh.',
        },
        {
          text: 'Live results, because the query reruns on every read',
          correct: false,
          why: 'That describes an ordinary view. A materialized view stores its results.',
        },
        {
          text: 'An error until the next refresh',
          correct: false,
          why: 'Stale is not broken: reads succeed and return the stored results.',
        },
        {
          text: 'Results newer than the source tables',
          correct: false,
          why: 'The view is computed from the source tables, so it can never be ahead of them.',
        },
      ],
    },
  ],
  takeaways: [
    'Denormalizing copies or precomputes data so a hot read touches one row, paid for with extra storage and extra work on every write.',
    'Stored counts, materialized views and read models are all derived data, so keep one normalized source of truth and decide how fresh each copy must be.',
    'Copies drift, so update them in the same transaction or from reliable events, and run a recount or a rebuild to repair them.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Denormalized by default.** Document and wide-column stores have no joins, so their data is usually modeled per query: you design a table for each screen and accept the duplication. The trade-offs in this lesson are then the everyday cost of the model, not an optimization.',
    },
    {
      kind: 'prose',
      md: '**Refreshing without rerunning everything.** PostgreSQL can refresh a materialized view without blocking reads, using `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which needs a unique index on the view. Some databases and stream processors go further and update a view row by row as changes arrive.',
    },
    {
      kind: 'prose',
      md: '**Recounts that race.** A follow that lands while the job is counting can be missed or counted twice. Count up to a recorded point in the change log, or apply the correction as a difference instead of overwriting the count, so live increments are not lost.',
    },
  ],
  flashcards: [
    {
      front: 'What is denormalization?',
      back: 'Storing copies or precomputed results where reads need them, so reads skip joins and counts, at the cost of more storage and more work on writes.',
    },
    {
      front: 'What does a normalized schema optimize for?',
      back: 'Each fact is stored once, so writes are simple and copies never disagree; reads pay by joining and counting.',
    },
    {
      front: 'What is a materialized view?',
      back: 'A query result that the database stores like a table and refreshes on demand: fast to read, but stale between refreshes.',
    },
    { front: 'What is a read model?', back: 'A copy of the data shaped for one screen, kept up to date from change events and usually a moment behind.' },
    {
      front: 'Why run a nightly recount?',
      back: 'Stored counts drift through bugs, retries and partial failures, and recomputing them from the source tables repairs them.',
    },
    {
      front: 'Why must a denormalized design keep a source of truth?',
      back: 'So that derived copies can be checked against it and rebuilt from it when they drift or get corrupted.',
    },
  ],
  related: ['sql-vs-nosql', 'indexes', 'caching', 'distributed-transactions', 'cqrs-event-sourcing', 'feed-fanout', 'consistency-models'],
  glossaryTerms: [
    'normalization',
    'index',
    'schema',
    'join',
    'denormalization',
    'precomputation',
    'transaction',
    'write-amplification',
    'read-model',
    'document-store',
    'transactional-outbox',
    'read-your-writes',
    'derived-data',
    'source-of-truth',
    'eventual-consistency',
    'cqrs',
    'materialized-view',
    'stale-data',
    'reconciliation',
    'backfill',
  ],
};

export default lesson;
