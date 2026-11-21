import type { DecisionNode, DiagramSpec, Lesson } from '../types';

/** How a NoSQL store spreads data by partition key, and what a query without the key costs. */
const byKey: DiagramSpec = {
  grid: { cols: 2, rows: 4 },
  nodes: [
    { id: 'app', type: 'service', label: 'App server', x: 0, y: 1.5 },
    { id: 'n1', type: 'nosqlDb', label: 'Feed node 1', x: 1, y: 0 },
    { id: 'n2', type: 'nosqlDb', label: 'Feed node 2', x: 1, y: 1 },
    { id: 'n3', type: 'nosqlDb', label: 'Feed node 3', x: 1, y: 2 },
    { id: 'n4', type: 'nosqlDb', label: 'Feed node 4', x: 1, y: 3 },
  ],
  edges: [
    { id: 'app-n1', from: 'app', to: 'n1', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'app-n2', from: 'app', to: 'n2', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'app-n3', from: 'app', to: 'n3', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'app-n4', from: 'app', to: 'n4', kind: 'sync', fromSide: 'right', toSide: 'left' },
  ],
  steps: [
    {
      caption:
        'Maya opens her activity feed. Her user identifier (ID) is the partition key, and it alone decides which machine holds her items: node 2. One short read answers.',
      flow: [{ edge: 'app-n2', tag: 'user 42' }, '<app-n2'],
      focus: ['app', 'n2'],
    },
    {
      caption: 'Writes for different users land on different machines at the same time, so each node carries only its share of the load.',
      flow: [['app-n1', 'app-n2', 'app-n3']],
      focus: ['app', 'n1', 'n2', 'n3'],
    },
    {
      caption: 'Traffic grows, so the team adds a fourth node. The store moves some partitions onto it by itself, and the app does not change.',
      add: ['n4', 'app-n4'],
      flow: ['app-n4'],
      focus: ['app', 'n4'],
      notes: [{ target: 'n4', text: 'new', tone: 'signal' }],
    },
    {
      caption:
        'Now ask a question the partition key cannot answer, such as every feed item about photo 901. The store has to ask every node and merge the answers, a [[fan-out|fan-out]] that grows with the cluster.',
      flow: [['app-n1', 'app-n2', 'app-n3', 'app-n4']],
      notes: [{ target: 'app', text: 'asks all 4', tone: 'alert' }],
    },
  ],
  description:
    'An app server connects to four feed nodes of a NoSQL store. A read or write for one user goes to the single node that holds that user’s partition; a query without the partition key goes to every node.',
};

/** Snapgram splits its data across three stores, each matched to how the data is used. */
const snapgramStores: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone app', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'kv', type: 'nosqlDb', label: 'Session store', sublabel: 'key-value', x: 2, y: 0 },
    { id: 'sql', type: 'sqlDb', label: 'Main database', sublabel: 'relational', x: 2, y: 1 },
    { id: 'feed', type: 'nosqlDb', label: 'Activity feed', sublabel: 'wide-column', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-kv', from: 'app', to: 'kv', kind: 'sync' },
    { id: 'app-sql', from: 'app', to: 'sql', kind: 'sync' },
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Every request carries a session ID. The app looks it up in the **session store**: one key in, one small value out, in about a millisecond.',
      flow: ['phone-app', { edge: 'app-kv', tag: 'session:7f3a' }, '<app-kv'],
      focus: ['phone', 'app', 'kv'],
    },
    {
      caption:
        'Opening Maya’s profile needs related data: her account, her photos and her follower count. The **main database** answers with joins, and it stays the [[source of truth|source-of-truth]].',
      flow: ['app-sql', '<app-sql'],
      focus: ['app', 'sql'],
    },
    {
      caption: 'Opening the **activity feed** reads one partition: Maya’s newest 50 items, already in time order.',
      flow: [{ edge: 'app-feed', tag: 'user 42' }, '<app-feed'],
      focus: ['app', 'feed'],
    },
    {
      caption:
        'When Ana likes Maya’s photo, the like goes into the main database, where it must count exactly once, and a feed item goes into Maya’s partition.',
      flow: ['phone-app', ['app-sql', 'app-feed']],
      focus: ['phone', 'app', 'sql', 'feed'],
    },
    {
      caption:
        'Each store now grows on its own terms. The feed store adds machines as writes climb, while the main database stays one large machine with [[read replicas|read-replica]].',
      notes: [{ target: 'feed', text: 'adds nodes', tone: 'plain' }],
    },
  ],
  description:
    'A phone app talks to app servers, which use three stores: a key-value session store, a relational main database, and a wide-column activity feed store.',
};

const whichDatabase: DecisionNode = {
  kind: 'question',
  id: 'connections',
  question: 'Are the important questions about connections, several hops deep?',
  help: 'Think “friends of friends” or “how is this account linked to that one”.',
  options: [
    {
      label: 'Yes, mostly connections',
      next: {
        kind: 'result',
        id: 'graph',
        title: 'Graph database',
        why: 'Following relationships hop by hop is what a graph database does best. Keep it beside a main database, which stays the source of truth.',
      },
    },
    {
      label: 'No',
      next: {
        kind: 'question',
        id: 'together',
        question: 'Must related changes succeed or fail together, like moving credits between accounts?',
        options: [
          {
            label: 'Yes, all or nothing',
            next: {
              kind: 'result',
              id: 'sql-transactions',
              title: 'Relational (SQL) database',
              why: 'Transactions make a group of changes all-or-nothing, and constraints keep the data valid. This is exactly what relational databases are built for.',
              lessonId: 'databases-101',
            },
          },
          {
            label: 'No',
            next: {
              kind: 'question',
              id: 'reads',
              question: 'How will you mostly read it?',
              options: [
                {
                  label: 'By one key',
                  next: {
                    kind: 'question',
                    id: 'shape',
                    question: 'Is it one small value, or a growing list of items read newest first?',
                    options: [
                      {
                        label: 'One small value',
                        next: {
                          kind: 'result',
                          id: 'key-value',
                          title: 'Key-value store',
                          why: 'Sessions, carts and counters are fetched by key and nothing else. A key-value store answers in about a millisecond and spreads across machines easily.',
                        },
                      },
                      {
                        label: 'A growing list',
                        next: {
                          kind: 'result',
                          id: 'wide-column',
                          title: 'Wide-column store',
                          why: 'Partition by the key you read by, such as the user ID, and keep items sorted by time inside each partition. Writes stay cheap even at huge volumes.',
                        },
                      },
                    ],
                  },
                },
                {
                  label: 'Whole records that vary in shape',
                  next: {
                    kind: 'result',
                    id: 'document',
                    title: 'Document store',
                    why: 'Each record is read and written as a whole, and records differ in shape. One document per thing avoids joins and schema changes.',
                  },
                },
                {
                  label: 'Many filters, sorts and joins',
                  next: {
                    kind: 'result',
                    id: 'sql-flexible',
                    title: 'Relational (SQL) database',
                    why: 'When you cannot list every question in advance, tables with [[indexes|index]] and joins answer new ones without a redesign. It is the safe default.',
                    lessonId: 'databases-101',
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
};

const lesson: Lesson = {
  id: 'sql-vs-nosql',
  module: 'm3',
  order: 7,
  title: 'SQL vs. NoSQL',
  idea: 'SQL (Structured Query Language) databases keep data in tables with strict rules and strong guarantees, while NoSQL databases trade some of that for simpler shapes that spread easily across machines, so the right choice depends on how your data is read and written.',
  minutes: 15,
  prerequisites: ['databases-101'],
  outcomes: [
    'Describe key-value, document, wide-column and graph stores, and what each is good and bad at.',
    'Choose a database for a feature from how its data is read, written and related.',
    'Explain why a relational database is a sensible default, and when to reach past it.',
  ],
  analogy: {
    title: 'A filing cabinet, labeled boxes and a corkboard',
    body: 'An office filing cabinet has strict rules. Every form in a drawer has the same fields, folders point to each other by number, and a patient clerk can answer almost any question, like “every invoice over $500 from March, with the customer’s address.” That is a relational database.\n\nA wall of labeled boxes is different: you find a box instantly by its label and can put anything inside, but asking which boxes hold red sweaters means opening them all. A corkboard with photos joined by string is perfect for one kind of question: how two people are connected. Each is the best tool for some jobs and the wrong one for others.',
  },
  whyItMatters:
    'Snapgram now has about three million daily users, and everything still lives in one [[relational database|sql]]. Every request starts by looking up a login [[session|session]] there. The activity table (“Ana liked your photo”) grows by tens of millions of rows a day and is read constantly, newest first.\n\nThe database spends its day on work that looks nothing like what it is best at: millions of tiny lookups by key and a flood of append-only writes. Meanwhile, the data that truly needs its strict rules, like accounts and paid boosts, competes for the same machine. Does all of this belong in one database?',
  body: [
    { kind: 'heading', text: 'The relational default' },
    {
      kind: 'prose',
      md: 'A relational database, the kind that speaks [[SQL|sql]], stores data in [[tables|table]] of [[rows|row]] that all follow one [[schema|schema]]: the same columns, each with a type. Records point to each other by key, and a query can combine tables on the fly with a [[join|join]]. [[Transactions|transaction]] make a group of changes all-or-nothing, which is why money, orders and accounts live here.',
    },
    {
      kind: 'annotated',
      title: 'One question, three tables',
      lines: [
        { code: 'SELECT u.username, p.caption, COUNT(l.user_id) AS likes', note: 'Ask for a username, a caption and a like count,' },
        { code: 'FROM photos p JOIN users u ON u.id = p.user_id', note: 'combining each photo with its owner' },
        { code: 'LEFT JOIN likes l ON l.photo_id = p.id', note: 'and with every like it received.' },
        { code: 'WHERE p.id = 901 GROUP BY u.username, p.caption;', note: 'You say what you want; the database works out how to fetch it.' },
      ],
    },
    {
      kind: 'prose',
      md: 'That flexibility is why relational databases are the default: you do not need to know every question in advance, and decades of tools come with them. Their weak spot is size. Writes go to one machine, and spreading a database across many machines, called [[sharding|sharding]], is work you mostly do yourself, giving up easy joins across the pieces.',
    },
    { kind: 'heading', text: 'What NoSQL changes' },
    {
      kind: 'prose',
      md: '[[NoSQL|nosql]] means “not only SQL”: a family of databases that drop the relational table for a simpler shape. Most are built to spread across many machines from day one, and many let each record carry its own fields. In return, they ask you to know your questions in advance, because they answer only a few kinds quickly.',
    },
    { kind: 'heading', text: 'Key-value stores' },
    {
      kind: 'prose',
      md: 'A [[key-value store|key-value-store]] is a giant dictionary: give it a key, get back a value. It cannot search inside values, but a lookup by key takes about a millisecond (ballpark) and keys spread easily across machines. Sessions, carts, counters and caches fit perfectly; [[Redis|redis]] and Amazon DynamoDB are common choices.',
    },
    {
      kind: 'code',
      code: 'session:7f3a9c   →  { "user": 42, "expires": "2026-11-18T09:00Z" }\nlikes:photo:901  →  1834',
      caption: 'Keys are plain strings, and the store never looks inside the values.',
    },
    { kind: 'heading', text: 'Document stores' },
    {
      kind: 'prose',
      md: 'A [[document store|document-store]] keeps self-contained documents, usually in JSON (JavaScript Object Notation), a text format with nested fields. Everything about one thing sits together, so a profile page needs one read instead of a join, and two documents can have different fields. The cost shows up with shared data: it gets copied into each document that needs it, which is called [[denormalization|denormalization]], and every copy must be kept up to date. MongoDB is the best-known example.',
    },
    {
      kind: 'code',
      code: '{\n  "_id": "user:42",\n  "username": "maya",\n  "city": "Singapore",\n  "settings": { "private": false, "language": "en" },\n  "pinned_photos": [901, 877]\n}',
      caption: 'One document holds Maya’s whole profile, nested settings included.',
    },
    { kind: 'heading', text: 'Wide-column stores' },
    {
      kind: 'prose',
      md: 'A [[wide-column store|wide-column-store]] groups rows by a [[partition key|partition-key]] and keeps them sorted inside each partition. All of one user’s feed items live together on one machine, already in time order, so “Maya’s newest 50 items” is a single short read. Writes are cheap and spread across many machines, which is why Apache Cassandra, Google’s Bigtable and HBase often hold feeds, messages and sensor data.',
    },
    {
      kind: 'code',
      code: 'partition: user 42                (sorted newest first)\n  2026-11-17 09:14   ana liked photo 901\n  2026-11-17 08:52   leo commented on photo 877\n  2026-11-16 22:03   kai started following you',
      caption: 'One partition per user. Reading the newest items is one short, sorted read.',
    },
    {
      kind: 'prose',
      md: 'The catch: the partition key is the only fast way in. “Every like on photo 901, from anyone” is not organized by user, so the store would have to ask every machine. Teams design one table per question, often copying the same data into several tables.',
    },
    { kind: 'heading', text: 'Graph databases' },
    {
      kind: 'prose',
      md: 'A [[graph database|graph-database]] stores things as nodes and relationships as edges, and walks those edges directly. “People Maya’s friends follow who also follow Ana” takes several joins of a table to itself in a relational database, while a graph database simply follows the string. Graphs are hard to split across machines, so a graph database such as Neo4j usually sits beside a main database rather than replacing it.',
    },
    {
      kind: 'code',
      code: "(maya)-[:FOLLOWS]->(ana)-[:FOLLOWS]->(leo)\n\nMATCH (me:User {name: 'maya'})-[:FOLLOWS]->()-[:FOLLOWS]->(suggestion)\nRETURN suggestion",
      caption: 'Data and a query in Cypher, the query language of Neo4j: follow two hops of “follows” from Maya.',
    },
    { kind: 'heading', text: 'How NoSQL stores spread out' },
    {
      kind: 'prose',
      md: 'Most NoSQL stores grow the way stateless app servers do, by [[horizontal scaling|horizontal-scaling]]: add machines, and the data spreads by key. Step through one feed store to see what that buys, and the one thing it costs.',
    },
    {
      kind: 'diagram',
      title: 'Spreading data by partition key',
      caption: 'A wide-column feed store on four machines. The partition key decides where every read and write goes.',
      spec: byKey,
    },
    { kind: 'heading', text: 'Snapgram picks a store per job' },
    {
      kind: 'prose',
      md: 'Snapgram keeps accounts, photos, likes and boosts in its relational database, and moves two workloads out. Using several kinds of database in one system, each for what it does best, is called [[polyglot persistence|polyglot-persistence]].',
    },
    {
      kind: 'diagram',
      title: 'Three stores, three jobs',
      caption: 'Sessions go to a key-value store and the activity feed to a wide-column store, while the relational database keeps everything that needs its rules.',
      spec: snapgramStores,
    },
    {
      kind: 'decision',
      title: 'Which database?',
      caption: 'Answer a few questions about one kind of data. When in doubt, the relational default is rarely wrong.',
      tree: whichDatabase,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'The line between SQL and NoSQL is blurrier than this lesson suggests. PostgreSQL can store and index JSON documents, many NoSQL stores offer SQL-like query languages and some transactions, and distributed SQL databases spread tables across machines. The four families describe each store’s main strength, not hard walls.',
    },
  ],
  tradeoffs: {
    caption: 'The relational default and the four NoSQL families, compared.',
    rows: [
      {
        option: 'Relational (SQL)',
        goodAt: 'Any question, even ones you think of later, with joins; transactions and constraints keep the data correct.',
        badAt: 'Writes go to one machine, and splitting it up is manual work that gives up easy joins.',
        pickWhen: 'By default, and always for money, orders and accounts.',
      },
      {
        option: 'Key-value',
        goodAt: 'Millisecond lookups by key, spread easily across machines.',
        badAt: 'Cannot search by anything but the key, and has no joins.',
        pickWhen: 'Sessions, carts, counters and caches.',
      },
      {
        option: 'Document',
        goodAt: 'A whole record in one read, and records can differ in shape.',
        badAt: 'Shared data is copied into many documents, and relationships are awkward.',
        pickWhen: 'Self-contained records such as profiles, product listings or settings.',
      },
      {
        option: 'Wide-column',
        goodAt: 'Huge write volumes, and fast sorted reads within one partition.',
        badAt: 'Fast only through the partition key, so you design a table per question.',
        pickWhen: 'Feeds, messages, time series and logs at large scale.',
      },
      {
        option: 'Graph',
        goodAt: 'Questions that follow connections several hops deep.',
        badAt: 'Hard to split across machines, and weak at scanning everything.',
        pickWhen: 'Recommendations, social graphs and fraud rings, beside a main database.',
      },
    ],
  },
  realWorld: {
    title: 'How Discord stores messages',
    body: 'In 2017, Discord described how it stores chat messages. Everything began in a single MongoDB replica set, a document store. Around November 2015, at 100 million stored messages, the data and its index no longer fit in memory, and response times became unpredictable.\n\nThe team chose Cassandra, a wide-column store, and keyed each message by its channel plus a time bucket of about ten days, with message IDs that sort by time. Reading a channel’s recent messages became a sorted read from that channel’s newest bucket. The post reports writes under a millisecond and reads under 5 milliseconds.',
    sourceUrl: 'https://discord.com/blog/how-discord-stores-billions-of-messages',
    sourceLabel: 'Discord, “How Discord Stores Billions of Messages” (2017)',
  },
  interview: {
    whenToMention:
      'When you sketch the data model, right after the API (application programming interface). List each kind of data with how it is written and read, then name a store for each and say why. Interviewers want the reasoning, not a brand name.',
    sayItLikeThis: [
      'Accounts, photos and boosts are relational and need transactions, so they go in PostgreSQL.',
      'The activity feed is write-heavy and always read per user, newest first, so I’d use a wide-column store like Cassandra, partitioned by user ID and sorted by time.',
      'Sessions are single-key lookups on every request, so they go in Redis with a time to live.',
    ],
    followUps: [
      {
        q: 'Why not keep everything in one database?',
        a: 'At first, you should: one relational database is simpler to run and keep consistent. Split only when a workload clearly fits another store and is hurting the main one, like a flood of feed writes. Every extra store adds operations work and data to keep in sync.',
      },
      {
        q: 'How would you choose the partition key for the feed?',
        a: 'Use the key you read by: the user ID, because the feed is always read per user. Add a time bucket, such as a month, so no partition grows forever. Then watch for hot partitions, since a very active account can overload one machine.',
      },
      {
        q: 'Can’t a relational database scale too?',
        a: 'Yes, further than many people think: one large machine with read replicas carries a lot. Past that, you can shard it yourself or use a distributed SQL database. The trade-off is that joins and transactions across shards get slower and harder.',
      },
    ],
    redFlags: [
      'Choosing NoSQL because it “scales”, without naming the access pattern it serves.',
      'Putting money, or any change that must never half-happen, in a store without transactions.',
      'Picking a wide-column store without saying what the partition key is.',
      'Claiming that relational databases cannot scale.',
    ],
  },
  mistakes: [
    '**Choosing by fashion.** A database fits an access pattern. Start from how the data is read and written, not from what is popular.',
    '**Ignoring the partition key.** In a wide-column or key-value store, a query that skips the key may have to ask every machine.',
    '**Copying data without a plan.** Denormalized copies speed up reads, but every copy must change when the original does.',
    '**Too many databases too soon.** Every extra store is another system to run, back up and keep in sync.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram looks up a session by its ID on every request. Which store fits best?',
      options: [
        { text: 'A key-value store', correct: true, why: 'One key in, one small value out, in about a millisecond. Nothing else is needed.' },
        { text: 'A graph database', correct: false, why: 'Sessions have no connections to follow.' },
        {
          text: 'A wide-column store',
          correct: false,
          why: 'It would work, but nothing here needs sorted partitions; a key-value store is simpler and faster.',
        },
        {
          text: 'The main relational database',
          correct: false,
          why: 'It works at small scale, but a lookup on every request adds heavy load to the database that matters most, when a simpler store fits.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are true of wide-column stores?',
      options: [
        { text: 'Rows are grouped by a partition key', correct: true, why: 'The partition key decides which machine stores each row.' },
        { text: 'Rows inside a partition are kept sorted', correct: true, why: 'That is what makes “newest 50 items” one short read.' },
        {
          text: 'Any query is fast, whatever it filters on',
          correct: false,
          why: 'Only queries through the partition key are fast. Others may have to ask every machine.',
        },
        { text: 'They handle very large write volumes', correct: true, why: 'Writes are cheap and spread across many machines.' },
        { text: 'They join tables like a relational database', correct: false, why: 'There are no joins. Teams copy data into one table per question instead.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Ana pays to boost a post: credits leave her account and the boost is recorded. How should Snapgram store this?',
      options: [
        {
          text: 'In the relational database, inside one transaction',
          correct: true,
          why: 'Both changes happen together or not at all, which is exactly what transactions guarantee.',
        },
        { text: 'In a graph database', correct: false, why: 'Nothing here is about following connections.' },
        {
          text: 'As two separate writes to a key-value store',
          correct: false,
          why: 'A crash between the two writes could take Ana’s credits without recording the boost.',
        },
        { text: 'In a cache with a short time to live', correct: false, why: 'A cache can evict or lose data at any time. Money needs the source of truth.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Each feed item is about 200 bytes, and an active Snapgram user gets about 500 new feed items a day. Roughly how many megabytes does one user’s feed partition grow in a year?',
      answer: 36.5,
      unit: 'MB',
      tolerance: 1.1,
      solution: [
        'Per day: 200 bytes × 500 items = 100,000 bytes, about 0.1 MB.',
        'Per year: 0.1 MB × 365 ≈ 36.5 MB.',
        'Fine for one partition, but an account 100 times as active would add about 3.65 GB a year, which is why feeds add a time bucket to the partition key.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Which question is a graph database best at?',
      options: [
        { text: 'Which people do Maya’s friends follow that she does not?', correct: true, why: 'It follows “follows” edges two hops out, which is what graphs do best.' },
        { text: 'How many likes did all photos get yesterday?', correct: false, why: 'Totals over everything suit a relational database or an analytics system.' },
        { text: 'Which user does session 7f3a belong to?', correct: false, why: 'That is a single lookup by key, a job for a key-value store.' },
        { text: 'What are Maya’s profile settings?', correct: false, why: 'One self-contained record fits a document or a row, not a graph walk.' },
      ],
    },
  ],
  takeaways: [
    'Relational databases are the default: they answer any question with joins and keep related changes together with transactions.',
    'Key-value, document, wide-column and graph stores each give up that flexibility to do one access pattern fast and at scale.',
    'Choose per kind of data, from how it is read, written and related, and add a store only when a workload clearly needs it.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Distributed SQL.** Databases such as Google Spanner and CockroachDB spread tables across many machines and still run transactions across them. The price is extra coordination between machines on every write.',
    },
    {
      kind: 'prose',
      md: '**One copy per question.** In wide-column stores, teams often keep several copies of the same data, each partitioned for one query, such as feed items by user and by photo. Every write updates every copy, so a failed write must be retried until the copies agree.',
    },
    {
      kind: 'prose',
      md: '**Tunable consistency.** Many NoSQL stores let you choose, per request, how many copies must answer before a read or write counts. [Quorums](lesson:quorums) explains how that choice trades freshness for speed.',
    },
  ],
  flashcards: [
    {
      front: 'What does SQL stand for, and which databases use it?',
      back: 'Structured Query Language. Relational databases use it; they store data in tables of rows that follow a schema.',
    },
    { front: 'What is a key-value store good and bad at?', back: 'Very fast lookups by key that spread easily across machines. It cannot search by anything but the key.' },
    { front: 'What is a document store?', back: 'A database of self-contained, JSON-like documents with nested fields, each read and written as a whole.' },
    { front: 'What does the partition key do in a wide-column store?', back: 'It decides which machine holds a row. Rows that share it are stored together, sorted.' },
    { front: 'When does a graph database shine?', back: 'When questions follow connections several hops deep, like the friends of your friends.' },
    {
      front: 'Why are relational databases the default choice?',
      back: 'They answer new questions with joins, keep related changes together with transactions, and scale further than most apps need.',
    },
    { front: 'What is polyglot persistence?', back: 'Using different databases for different data in one system, each matched to how its data is used.' },
  ],
  related: ['databases-101', 'indexes', 'vertical-vs-horizontal-scaling', 'sharding', 'consistency-models', 'denormalization'],
  glossaryTerms: [
    'sql',
    'session',
    'table',
    'row',
    'schema',
    'join',
    'transaction',
    'sharding',
    'nosql',
    'key-value-store',
    'redis',
    'document-store',
    'denormalization',
    'wide-column-store',
    'partition-key',
    'graph-database',
    'horizontal-scaling',
    'fan-out',
    'source-of-truth',
    'read-replica',
    'polyglot-persistence',
    'index',
  ],
};

export default lesson;
