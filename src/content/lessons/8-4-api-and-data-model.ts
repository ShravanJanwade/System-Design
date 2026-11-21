import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The signature diagram: each kind of Snapgram data, the store it lives in, and the reason. */
const stores: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'files', type: 'objectStore', label: 'Object storage', sublabel: 'photo files', x: 0, y: 0 },
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 1 },
    { id: 'api', type: 'service', label: 'API servers', x: 1, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Main database', sublabel: 'users, photos, follows', x: 2, y: 1 },
    { id: 'feed', type: 'nosqlDb', label: 'Feed store', sublabel: 'one list per reader', x: 1, y: 2 },
  ],
  edges: [
    { id: 'phone-files', from: 'phone', to: 'files', kind: 'sync', label: 'photo bytes' },
    { id: 'phone-api', from: 'phone', to: 'api', kind: 'sync', label: 'API calls' },
    { id: 'api-db', from: 'api', to: 'db', kind: 'sync', label: 'rows' },
    { id: 'api-feed', from: 'api', to: 'feed', kind: 'sync', label: 'feed pages' },
  ],
  // Phones: the app on top, object storage and the API servers below it, and the two stores the API reads below those.
  narrow: {
    grid: { cols: 2, rows: 3 },
    positions: {
      phone: { x: 0.5, y: 0 },
      files: { x: 0, y: 1 },
      api: { x: 1, y: 1 },
      feed: { x: 0, y: 2 },
      db: { x: 1, y: 2 },
    },
  },
  steps: [
    {
      caption:
        'Photo files are large, about 2 MB each (ballpark), and never change once uploaded. They go to **object storage**, which is cheap, durable and built for whole files.',
      flow: ['phone-files'],
      focus: ['phone', 'files'],
      notes: [{ target: 'files', text: '≈ 2 MB each', tone: 'plain' }],
    },
    {
      caption:
        'Users, follows and photo [[metadata|metadata]] are small rows that point at each other, and every username must be unique. They go in the **main database**, a [[relational database|sql]] that enforces those rules with keys and constraints, and is small enough for one machine at first.',
      flow: ['phone-api', 'api-db', '<api-db', '<phone-api'],
      notes: [{ target: 'db', text: 'small, related rows', tone: 'plain' }],
    },
    {
      caption:
        'The home feed is the hottest read, and it is always fetched by one key: the reader. The **feed store**, a [[wide-column store|wide-column-store]], keeps a ready-made list of photo identifiers for each reader, newest first, so one page is one lookup.',
      flow: ['phone-api', 'api-feed', '<api-feed', '<phone-api'],
      notes: [{ target: 'feed', text: '1 lookup a page', tone: 'signal' }],
    },
    {
      caption:
        'Three stores, each with a reason you can say in one breath. With 100 users, the feed would simply be a query on the main database; the feed store earns its place only because of the feed rate in the estimate.',
      focus: ['files', 'db', 'feed'],
      notes: [
        { target: 'files', text: 'large, unchanging', tone: 'plain' },
        { target: 'db', text: 'rules and links', tone: 'plain' },
        { target: 'feed', text: 'hot, one key', tone: 'plain' },
      ],
    },
  ],
  description:
    'Maya’s phone uploads photo bytes straight to object storage and sends its other calls to the API servers. The API servers keep users, photos and follows in a main relational database, and read ready-made feed pages from a feed store, one list per reader.',
};

/** The hottest access pattern, walked through the stores and keys. */
const feedLoad: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Snapgram app' },
    { id: 'api', type: 'service', label: 'API server' },
    { id: 'feed', type: 'nosqlDb', label: 'Feed store' },
    { id: 'db', type: 'sqlDb', label: 'Main database' },
  ],
  groups: [{ label: 'One partition', from: 2, to: 3 }],
  messages: [
    {
      from: 'phone',
      to: 'api',
      label: 'GET /v1/feed',
      kind: 'sync',
      caption: 'Maya opens Snapgram. The app sends one call with her login token, and no user identifier in the path.',
    },
    {
      from: 'api',
      to: 'feed',
      label: 'Newest 20 for user 42',
      kind: 'sync',
      caption: 'The server reads the first 20 entries of Maya’s list. The list is one partition, already sorted, so this is a single lookup.',
    },
    {
      from: 'feed',
      to: 'api',
      label: '20 photo IDs',
      kind: 'reply',
      caption: 'Only identifiers come back. Because feeds hold no captions, editing a caption never means rewriting millions of feeds.',
    },
    {
      from: 'api',
      to: 'db',
      label: 'Rows for 20 IDs',
      kind: 'sync',
      caption: 'One batched query fetches the 20 photo rows by primary key: captions, authors and storage keys. One round trip, not 20.',
    },
    {
      from: 'api',
      to: 'phone',
      label: 'Page + nextCursor',
      kind: 'reply',
      caption: 'The page goes back with a cursor, the identifier of its last photo. The next call asks for the entries after it.',
    },
  ],
};

const lesson: Lesson = {
  id: 'api-and-data-model',
  module: 'm8',
  order: 4,
  title: 'API and data model',
  idea: 'In about five minutes, you write the few [[application programming interface|api]] (API) calls that cover the agreed features, then choose where each kind of data lives and how it is keyed, saying the reason for every choice out loud.',
  minutes: 15,
  prerequisites: ['api-styles', 'sql-vs-nosql'],
  outcomes: [
    'Write a minimum API for a prompt: one endpoint per agreed feature, with its method, path, key fields and pagination.',
    'Turn endpoints into access patterns, and use them to choose a store, keys and indexes for each kind of data.',
    'Justify each choice in one sentence, tied to a requirement or a number from your estimate.',
  ],
  analogy: {
    title: 'The counter and the stockroom',
    body: 'A small hardware shop agrees with its customers on what they can ask for at the counter: buy an item, return one, or check whether something is in stock. Three requests, each with a clear form. Nobody at the counter needs to know how the back room is arranged.\n\nThe back room, though, is arranged around those requests. The fastest sellers sit nearest the counter, and bolts are sorted by size because customers ask by size. In an interview, the counter is your API, and the stockroom is your data model.',
  },
  whyItMatters:
    'Maya’s next practice interview starts well. By minute 10, the requirements and a quick estimate are on the board: 10 million daily users, and far more views than uploads. Then she writes `POST /createPhoto`, `GET /getUserPhotos` and nineteen more endpoints, including password resets and settings nobody asked for, and says the data goes in “a NoSQL database, because it scales”.\n\nHer practice interviewer asks which query each table serves, and why NoSQL. Maya has used Snapgram since its first weeks and knows exactly what it does, but she has no answer beyond the slogan. Fifteen minutes are gone, and the design has not started.',
  body: [
    {
      kind: 'prose',
      md: 'This step follows the estimate and gets about five minutes of a 45-minute interview. It turns the [[functional requirements|functional-requirement]] into two concrete things the rest of the session builds on: the calls the app makes, and the [[data model|data-model]] those calls read and write.',
    },
    { kind: 'heading', text: 'The minimum API' },
    {
      kind: 'prose',
      md: 'Start from the feature list and write one [[endpoint|endpoint]] per feature, no more. For Snapgram, the agreed features are posting a photo, viewing a profile, following someone and reading a home feed; likes, comments and search were scoped out. Use the [[REST|rest]] (representational state transfer) style unless the prompt calls for something else, because every interviewer can read it at a glance.',
    },
    {
      kind: 'prose',
      md: 'Minimum does not mean vague. Each call gets a method such as `GET` or `POST`, a path, its key fields and, for any list, a page size and a [[cursor|cursor-pagination]]. Posting takes two calls, because the photo bytes should never pass through the app servers.',
    },
    {
      kind: 'annotated',
      title: 'Snapgram’s minimum API',
      caption: 'Five calls for four features. Paths name things; the method is the verb.',
      lines: [
        {
          code: 'POST /v1/uploads',
          note: 'Posting, step one. Returns a [[pre-signed upload link|pre-signed-url]] and a `photoKey`, so the phone sends the bytes straight to [[object storage|object-storage]].',
        },
        {
          code: 'POST /v1/photos  {photoKey, caption}',
          note: 'Posting, step two, once the bytes are stored. Returns `201 Created` and the new photo’s identifier.',
        },
        {
          code: 'GET  /v1/users/{id}/photos?cursor=',
          note: 'A profile grid, newest first, one page at a time. Each response carries `nextCursor` for the page after it.',
        },
        {
          code: 'PUT  /v1/users/{id}/followers/me',
          note: 'Follow someone. It is [[idempotent|idempotent]]: doing it twice leaves one follow, so a retry is safe.',
        },
        {
          code: 'GET  /v1/feed?cursor=',
          note: 'Maya’s home feed, newest first. The path has no user identifier (ID): the server takes it from her login token, so nobody can read someone else’s feed.',
        },
      ],
    },
    {
      kind: 'prose',
      md: 'Notice what is missing. There is no call for likes, password resets or settings: say in one sentence that they exist and were scoped out, then move on. Five lines like these take about two minutes to write, and the interviewer can see exactly what the system must do.',
    },
    { kind: 'heading', text: 'From endpoints to access patterns' },
    {
      kind: 'prose',
      md: 'Before drawing any table, turn each endpoint into an [[access pattern|access-pattern]]: one way the data is read or written, found by which key, in what order and how often. Take the rates from your estimate. They show which pattern is hot and deserves the cheapest possible lookup.',
    },
    {
      kind: 'table',
      columns: ['Access pattern', 'Serves', 'Rate (ballpark)', 'Found by'],
      rows: [
        ['Read a home feed, newest first', '`GET /v1/feed`', 'Thousands a second at peak', 'The reader’s user ID'],
        ['Read one user’s photos, newest first', '`GET .../photos`', 'Hundreds a second', 'The owner’s user ID'],
        ['Add a photo', '`POST /v1/photos`', 'About 6 a second', 'A new photo ID'],
        ['Find everyone who follows the author', 'Updating feeds after a post', 'About 6 a second, hundreds of rows each', 'The author’s user ID'],
        ['Follow someone', '`PUT .../followers/me`', 'Tens a second', 'Both user IDs'],
      ],
      caption: 'For 10 million daily users posting about 500,000 photos a day.',
    },
    {
      kind: 'prose',
      md: 'Two patterns stand out: reading a feed, by far the most frequent, and finding an author’s followers, which runs once per post but touches every follower. A good data model makes these two cheap and keeps the rest simple.',
    },
    { kind: 'heading', text: 'Where each kind of data lives' },
    {
      kind: 'prose',
      md: 'Now choose stores, one kind of data at a time, with a reason you can say in a sentence. Start from one relational database, the safe default, and add another store only when a requirement or a number says the first cannot do the job. That is [[polyglot persistence|polyglot-persistence]] with a reason for every store, not a collection of logos.',
    },
    {
      kind: 'diagram',
      title: 'Where Snapgram’s data lives',
      caption: 'One kind of data per step, with the reason for its store. Use Play, or the arrow keys.',
      spec: stores,
    },
    { kind: 'heading', text: 'The schema, with its keys' },
    {
      kind: 'prose',
      md: 'The [[entities|entity]] are already in your API paths: users, photos, follows and feeds. Write a table for each, but spend your care on the keys, not the columns. The [[primary key|primary-key]] and the indexes decide whether each access pattern is one lookup or a scan of millions of rows.',
    },
    {
      kind: 'annotated',
      title: 'The core schema',
      caption: 'Photo identifiers are [[Snowflake-style IDs|snowflake-id]] that sort by time, so “newest first” simply means the largest identifier first.',
      lines: [
        {
          code: 'users(id PK, username UNIQUE, name)',
          note: 'The unique constraint rejects a second account with the same name, even if both sign up at once.',
        },
        {
          code: 'photos(id PK, user_id, photo_key, caption)',
          note: 'Metadata only. `photo_key` says where the file lives in object storage.',
        },
        {
          code: 'INDEX photos(user_id, id DESC)',
          note: 'A [[composite index|composite-index]] for the profile grid: one user’s photos, newest first, read in order straight from the index.',
        },
        {
          code: 'follows(follower_id, followee_id) PK',
          note: 'One row per follow, with [[foreign keys|foreign-key]] to `users`. Using both columns as the primary key makes a duplicate follow impossible.',
        },
        {
          code: 'INDEX follows(followee_id)',
          note: 'Finds everyone who follows Maya, which the feed needs after each of her posts.',
        },
        {
          code: 'feed(user_id, photo_id DESC)',
          note: 'In the feed store, the reader’s user ID is the [[partition key|partition-key]], and photo IDs sort newest first inside it. Only IDs are stored, so editing a caption never touches millions of feeds.',
        },
      ],
    },
    {
      kind: 'prose',
      md: 'Then say each reason out loud, in one sentence. “Photos go to object storage because they are large files that never change.” “Users and follows go in a relational database because usernames must be unique and a follow links two users.” “The feed gets its own store, keyed by reader, because it is our hottest read and is always fetched by one key.”',
    },
    { kind: 'heading', text: 'Check the model against the hottest pattern' },
    {
      kind: 'prose',
      md: 'Finally, walk the hottest access pattern through the model to show that it works. If any step needs a scan, or one query per item, fix the keys now rather than in the deep dive.',
    },
    {
      kind: 'sequence',
      title: 'One page of Maya’s feed',
      caption: 'The hottest access pattern, walked through the stores and keys. Use Play, or the arrow keys.',
      spec: feedLoad,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real APIs also need authentication, rate limits, error formats and versioning rules, and Snapgram’s real data model has likes, comments, hashtags and more. In an interview, name these in a sentence and skip them unless asked. This lesson also leaves out how the feed store gets filled, which [Feeds: fan-out on write vs. on read](lesson:feed-fanout) covers.',
    },
  ],
  tradeoffs: {
    caption: 'Where to keep the data for a photo-sharing app.',
    rows: [
      {
        option: 'One relational database for everything',
        goodAt: 'Simple to run, with joins, transactions and unique usernames built in.',
        badAt: 'Building every feed with a query gets slow, and one machine eventually cannot keep up.',
        pickWhen: 'The numbers are small, and as the starting point you grow from.',
      },
      {
        option: 'Relational database plus a feed store',
        goodAt: 'The hottest read becomes one key lookup, while rules and relationships stay in the database.',
        badAt: 'Two stores to run and keep in step, and every post must be copied into followers’ feeds.',
        pickWhen: 'Feed reads dominate and the estimate says one database cannot serve them.',
      },
      {
        option: 'A NoSQL store for everything',
        goodAt: 'Spreads across many machines and answers key lookups quickly at huge scale.',
        badAt: 'Unique usernames and other rules are harder to enforce, and each new kind of query needs a new table.',
        pickWhen: 'Every access pattern is a simple key lookup and the scale is very large.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s advice: know the questions first',
    body: 'Amazon’s developer guide for DynamoDB, its NoSQL database, contrasts two ways of designing data. For a relational database, it says, you can build a [[normalized|normalization]] model without thinking about access patterns and extend it later, because queries are flexible. For DynamoDB, you should not start designing the schema until you know the questions it will need to answer.\n\nIts first step is to identify the query patterns the system must satisfy, including how much data each reads at once and the peak load. It then advises keeping related data together and spreading keys evenly to avoid [[hot spots|hot-spot]]. Access patterns first, then the store and the keys: the same order as this lesson.',
    sourceUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html',
    sourceLabel: 'Amazon DynamoDB Developer Guide, “NoSQL design for DynamoDB”',
  },
  interview: {
    whenToMention:
      'Right after the estimate, around minute 8 to 10 of a 45-minute interview. Say you will spend about five minutes here, write one endpoint per agreed feature, list the hottest access patterns, then pick stores and keys for them. Keep it brisk: it only has to make the high-level design concrete.',
    sayItLikeThis: [
      'Four features, so five calls: two to post a photo, one for a profile, one to follow and one for the feed. Likes were scoped out, so they get no endpoint.',
      'The hottest access pattern is reading a feed, newest first, thousands of times a second. So I’d keep a ready-made list per reader in a wide-column store, partitioned by user ID and sorted by photo ID.',
      'Users and follows go in a relational database, because usernames must be unique and a follow links two users. Photo files go to object storage, with only their keys in the database.',
    ],
    followUps: [
      {
        q: 'Why not store the photos in the database?',
        a: 'Photos are large, never change and are always read whole, which is what object storage is built for: cheap, durable and easy to serve through a [[content delivery network|cdn]] (CDN). Multi-megabyte values in database rows bloat backups and replicas, so the database keeps only each photo’s key and metadata.',
      },
      {
        q: 'Why a cursor instead of page numbers for the feed?',
        a: 'New posts arrive at the top all the time, so page numbers shift and show the same photo twice. A cursor marks the last photo seen, so the next page starts right after it, and the store jumps straight there using the key.',
      },
      {
        q: 'How would this change at 100 times the users?',
        a: 'I’d [[shard|sharding]] the relational tables by user ID, so each user’s photos and follows stay together, and keep generating IDs that sort by time. The feed store already spreads by reader. The hard case becomes a celebrity with millions of followers, which pushes the feed toward [[hybrid fan-out|hybrid-fan-out]].',
      },
    ],
    redFlags: [
      'Twenty endpoints for a four-feature prompt, including features that were scoped out.',
      'Picking a database by fashion, such as “NoSQL scales”, without naming an access pattern.',
      'A schema with no keys or indexes, so nobody can tell how the main queries run.',
    ],
  },
  mistakes: [
    '**Designing every endpoint.** Settings, password resets and admin tools use up the clock. Write calls for the agreed features and mention the rest in one sentence.',
    '**Tables before access patterns.** A schema drawn first often cannot serve the hottest query cheaply, and you find out only in the deep dive.',
    '**Stores without reasons.** One database is the right start. Adding a second store with no number behind it, or a store per table, makes the design harder to defend.',
    '**Photos in the database.** Large files in rows bloat backups and replicas. Keep files in object storage and store their keys.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'The agreed features are posting a photo, following someone and reading a home feed. Which is the best minimum API?',
      options: [
        {
          text: 'Request an upload link, create the post, follow, and get the feed with a cursor',
          correct: true,
          why: 'One call per feature, plus the upload link that keeps photo bytes off the app servers, and nothing that was scoped out.',
        },
        {
          text: 'Fifteen calls covering accounts, settings, likes, comments and search',
          correct: false,
          why: 'Most of them serve features nobody agreed on, and writing them uses minutes the design needs.',
        },
        {
          text: 'One call, `POST /v1/action`, with the operation named in the body',
          correct: false,
          why: 'It hides what each operation does, so nobody can see the shape of the API, and every read loses caching.',
        },
        {
          text: 'Upload a photo, and get all photos in one unpaginated list',
          correct: false,
          why: 'There is no way to follow anyone, and one list of every photo breaks as soon as there are many.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which are good reasons to keep Snapgram’s users and follows in a relational database?',
      options: [
        { text: 'Usernames must be unique, and the database can enforce it', correct: true, why: 'A unique constraint holds even when two sign-ups race for the same name.' },
        {
          text: 'A follow links two users, which keys and foreign keys model directly',
          correct: true,
          why: 'Relationships between rows are what relational databases are built around.',
        },
        {
          text: 'The data is small enough for one machine at first',
          correct: true,
          why: 'Ten million users and their follows fit on one database server (ballpark), so there is no need to spread them yet.',
        },
        {
          text: 'Relational databases are always faster than NoSQL stores',
          correct: false,
          why: 'Neither is always faster. A key lookup in a NoSQL store is very fast too, and the choice depends on the access pattern.',
        },
        {
          text: 'NoSQL stores cannot hold user accounts',
          correct: false,
          why: 'They can. The reasons that matter are rules and relationships, not whether storing users is possible.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of the API and data model phase in order.',
      items: [
        'List the features agreed in the requirements',
        'Write one endpoint per feature',
        'Turn each endpoint into an access pattern with a rough rate',
        'Choose a store for each kind of data',
        'Write the key tables with their keys and indexes',
      ],
      why: 'Each step feeds the next: endpoints serve features, endpoints imply access patterns, and the access patterns decide the stores and keys.',
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram adds about 500,000 photo rows a day, each with about 500 bytes of metadata. Roughly how many gigabytes of metadata is that per year?',
      answer: 90,
      unit: 'GB',
      tolerance: 1.2,
      solution: [
        '500,000 × 500 bytes = 250,000,000 bytes, about 250 MB a day.',
        '250 MB × 365 ≈ 91,000 MB, about 90 GB a year.',
        'One database machine holds that for years. The photo files, at about 2 MB each, are the number that calls for object storage.',
      ],
    },
    {
      kind: 'single',
      prompt: 'How should the feed store be keyed so that `GET /v1/feed` is one lookup?',
      options: [
        {
          text: 'Partition by the reader’s user ID, with photo IDs sorted newest first',
          correct: true,
          why: 'The call always asks for one reader’s newest items, so a single partition returns them already in order.',
        },
        {
          text: 'Partition by photo ID',
          correct: false,
          why: 'A reader’s feed would be scattered across every partition, so one page would mean asking many machines.',
        },
        {
          text: 'Partition by the author’s user ID',
          correct: false,
          why: 'That groups posts by who wrote them, which suits a profile, not a feed that mixes hundreds of authors.',
        },
        {
          text: 'Partition by the date of the post',
          correct: false,
          why: 'Every new post would land in today’s partition, a hot spot, and each feed would still need filtering by reader.',
        },
      ],
    },
  ],
  takeaways: [
    'Write the minimum API: one endpoint per agreed feature, with method, path, key fields and cursor pagination, and nothing for features you scoped out.',
    'Let access patterns shape the data model: list how each endpoint reads and writes, then pick stores and keys that make the hottest pattern one cheap lookup.',
    'Say a reason with every choice, tied to a requirement or a number from your estimate.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Safe retries for posting.** A flaky connection can send `POST /v1/photos` twice. Have the app send an [[idempotency key|idempotency-key]] with it, or treat `photoKey` as one, so a retry returns the first post instead of creating a second. [Idempotency](lesson:idempotency) covers the details.',
    },
    {
      kind: 'prose',
      md: '**Counts live with the photo.** If likes are in scope, keep a like count on the photo row and update it on each like, rather than counting rows on every view. [Denormalization and read models](lesson:denormalization) shows how, and how such counts drift.',
    },
    {
      kind: 'prose',
      md: '**One API, several screens.** If the interviewer asks about a screen that needs many resources at once, mention a GraphQL layer for the app. Keep the interview API in REST anyway: it is faster to write and to read on a whiteboard.',
    },
  ],
  flashcards: [
    {
      front: 'What is a minimum API in an interview?',
      back: 'The smallest set of endpoints that covers the agreed features: one per feature, with method, path, key fields and pagination.',
    },
    { front: 'What is an access pattern?', back: 'One way the system reads or writes data: which records, found by which key, in what order and how often.' },
    {
      front: 'Why do access patterns come before the schema?',
      back: 'The hottest queries decide the keys, the indexes and even the store. A schema drawn first may not serve them cheaply.',
    },
    { front: 'Where do Snapgram’s photo files go, and why?', back: 'Object storage, because they are large and never change. The database keeps only their keys and metadata.' },
    { front: 'How is the feed store keyed?', back: 'By the reader’s user ID, with photo IDs sorted newest first, so one lookup returns a page in order.' },
    { front: 'Why does the feed call have no user ID in its path?', back: 'The server takes the user from the login token, so nobody can ask for someone else’s feed.' },
    { front: 'How long should the API and data model take?', back: 'About five minutes of a 45-minute interview.' },
  ],
  related: ['api-styles', 'sql-vs-nosql', 'storage-types', 'indexes', 'unique-ids', 'feed-fanout', 'interview-framework', 'high-level-design'],
  glossaryTerms: [
    'api',
    'functional-requirement',
    'data-model',
    'endpoint',
    'rest',
    'cursor-pagination',
    'pre-signed-url',
    'object-storage',
    'idempotent',
    'access-pattern',
    'polyglot-persistence',
    'metadata',
    'sql',
    'wide-column-store',
    'entity',
    'primary-key',
    'snowflake-id',
    'composite-index',
    'foreign-key',
    'partition-key',
    'normalization',
    'hot-spot',
    'cdn',
    'sharding',
    'hybrid-fan-out',
    'idempotency-key',
  ],
};

export default lesson;
