import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: routing a read to its shard, a hot spot, and a query that needs every shard. */
const routing: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1.5 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'knows the rule', x: 1, y: 1.5 },
    { id: 's1', type: 'sqlDb', label: 'Shard 1', x: 2, y: 0 },
    { id: 's2', type: 'sqlDb', label: 'Shard 2', x: 2, y: 1 },
    { id: 's3', type: 'sqlDb', label: 'Shard 3', x: 2, y: 2 },
    { id: 's4', type: 'sqlDb', label: 'Shard 4', x: 2, y: 3 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-s1', from: 'app', to: 's1', kind: 'sync' },
    { id: 'app-s2', from: 'app', to: 's2', kind: 'sync' },
    { id: 'app-s3', from: 'app', to: 's3', kind: 'sync' },
    { id: 'app-s4', from: 'app', to: 's4', kind: 'sync' },
  ],
  // Phones: users above the app server, with two shards beside it and two below.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: { users: { x: 1, y: 0 }, app: { x: 1, y: 1 }, s1: { x: 0, y: 1 }, s2: { x: 2, y: 1 }, s3: { x: 0, y: 2 }, s4: { x: 2, y: 2 } },
    sides: { 'app-s3': { fromSide: 'bottom', toSide: 'right' }, 'app-s4': { fromSide: 'bottom', toSide: 'left' } },
  },
  steps: [
    {
      caption: 'Maya opens her profile. Her photos live on exactly one of four shards, and the **app server** must work out which.',
      flow: ['users-app'],
    },
    {
      caption: 'It hashes Maya’s user ID, divides by 4 and keeps the remainder. The answer always points to Shard 3, on every app server.',
      flow: [{ edge: 'app-s3', tag: 'Maya' }],
    },
    {
      caption: 'Her photos, likes and comments all sit on Shard 3, so one query serves the whole page.',
      flow: ['app-s3', '<app-s3'],
    },
    {
      caption: 'A celebrity on Shard 2 posts, and a million fans open the same profile. All those requests land on Shard 2 while the others idle.',
      flow: ['users-app', { edge: 'app-s2', tone: 'alert' }],
      notes: [{ target: 's2', text: 'hot spot', tone: 'alert' }],
    },
    {
      caption: 'A search for #sunset has no single shard to go to, so the app asks all four, merges the answers and waits for the slowest.',
      flow: [
        ['app-s1', 'app-s2', 'app-s3', 'app-s4'],
        ['<app-s1', '<app-s2', '<app-s3', '<app-s4'],
      ],
    },
  ],
};

/** Moving half of a shard's users to a new shard while it keeps serving traffic. */
const move: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0.5 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0.5 },
    { id: 'old', type: 'sqlDb', label: 'Shard 1', sublabel: 'filling up', x: 2, y: 0 },
    { id: 'new', type: 'sqlDb', label: 'Shard 5', sublabel: 'new', x: 2, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-old', from: 'app', to: 'old', kind: 'sync' },
    { id: 'app-new', from: 'app', to: 'new', kind: 'sync' },
    { id: 'copy', from: 'old', to: 'new', kind: 'async', label: 'copy' },
  ],
  steps: [
    {
      caption: 'Shard 1 is filling up, so the team adds an empty Shard 5 for half of its users. For now, Shard 1 still serves them.',
      add: ['new'],
      flow: ['users-app', 'app-old'],
    },
    {
      caption: 'First, new writes for those users go to both shards, so nothing written from now on is missed.',
      add: ['app-new'],
      flow: ['users-app', ['app-old', 'app-new']],
    },
    {
      caption: 'Next, a background job copies their older rows to Shard 5 in small batches while Shard 1 keeps serving.',
      add: ['copy'],
      flow: ['copy'],
    },
    {
      caption: 'Once the two copies match, one routing change sends those users to Shard 5, and Shard 1 deletes its old rows.',
      flow: ['users-app', 'app-new', '<app-new'],
      notes: [{ target: 'new', text: 'live', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'sharding',
  module: 'm4',
  order: 3,
  title: 'Sharding',
  idea: 'Sharding splits one big dataset across several databases by a shard key, so each machine stores and serves only its slice, and the key you choose decides whether the load spreads evenly.',
  minutes: 14,
  prerequisites: ['replication', 'unique-ids'],
  outcomes: [
    'Compare range, hash and directory partitioning, and pick one for a workload.',
    'Choose a shard key that spreads data and writes evenly and keeps common queries on one shard.',
    'Explain hot spots, cross-shard queries and resharding, and how teams handle each.',
  ],
  analogy: {
    title: 'The phone book in volumes',
    body: 'A city’s phone book grew too thick to bind, so the publisher split it into volumes: A–F, G–M, N–S and T–Z. To find a number, you check the first letter of the last name and open one volume, never all four.\n\nThe split has quirks. The S volume is fatter than the Q one, finding everyone on Elm Street means reading every volume, and when the city outgrows four volumes, entries must be reprinted in new books. A sharded database has the same three problems.',
  },
  whyItMatters:
    'At about 10 million daily users, Snapgram’s photo data is split across four databases, each with its own [[followers|follower]]. In [Unique IDs at scale](lesson:unique-ids), photo identifiers (IDs) collided across them. Now the team must settle how the app knows which database holds Maya’s photos, a rule called [[sharding|sharding]].\n\nThe first idea is to split by signup date, oldest users on database 1 and newest on database 4. Then someone notices that every new user, and all their first uploads, would land on database 4. More worries follow: a celebrity with millions of fans, a search for #sunset that touches every database, and the day four is not enough.',
  body: [
    {
      kind: 'prose',
      md: '[Replication](lesson:replication) gives every follower a full copy, so it spreads reads, but every write still goes through one [[leader|leader]] and every copy holds everything. A bigger machine ([[vertical scaling|vertical-scaling]]) only buys time.\n\nSharding is [[horizontal scaling|horizontal-scaling]] for data: each shard is a separate database holding a slice of the rows, with its own followers. A [[shard key|partition-key]] decides which slice each row belongs to. For Snapgram, the key is the user, so Maya’s photos, likes and comments live together.',
    },
    {
      kind: 'diagram',
      title: 'Finding the right shard',
      caption: 'Four shards behind the app servers: a normal read, a hot spot and a query that needs every shard.',
      spec: routing,
    },
    { kind: 'heading', text: 'Three ways to split' },
    {
      kind: 'prose',
      md: 'Three rules cover almost every system:\n\n- **[[Range partitioning|range-partitioning]].** Each shard holds one continuous range of keys, like the phone book’s A–F, so a question about a range touches one or two shards.\n- **[[Hash partitioning|hash-partitioning]].** A [[hash function|hash-function]] turns the key into a random-looking number, and `hash % N` picks the shard. Keys scatter evenly, but so do neighbors, so a range question must ask every shard.\n- **[[Directory-based partitioning|directory-partitioning]].** A lookup table records where each key or group lives, such as each country. You can place and move data freely, but every request needs a lookup, and the table must never go down.',
    },
    { kind: 'heading', text: 'Choosing a shard key' },
    {
      kind: 'prose',
      md: 'The key matters more than the method. A good one passes three tests:\n\n1. **Many distinct values.** Data spreads over at most as many shards as the key has values, and one country may hold a third of your users.\n2. **New writes spread too.** A key that rises over time, such as a signup date or a time-ordered [[Snowflake ID|snowflake-id]], sends every new row to the last range.\n3. **Common queries stay on one shard.** Snapgram’s busiest pages are about one user, so keying by user keeps a profile together.\n\nA hash of the user ID passes all three, which makes it the usual default.',
    },
    { kind: 'heading', text: 'Hot spots' },
    {
      kind: 'prose',
      md: 'Even a good key leaves a [[hot spot|hot-spot]]: a shard that gets far more than its share. On Snapgram it is a celebrity, one [[hot key|hot-key]] whose reads all go to the shard holding their user ID. More shards cannot help, because the shard rule never splits a key.\n\nThe fixes work around the key: cache the celebrity’s posts ([Caching](lesson:caching)), give that shard extra [[read replicas|read-replica]], or split the hot data on purpose, such as storing one photo’s likes under several keys and adding them up on read.',
    },
    { kind: 'heading', text: 'Questions that span shards' },
    {
      kind: 'prose',
      md: '“All photos tagged #sunset” has no home shard, because tags are not the key. The app sends the query to every shard and merges the answers, which is called [[scatter-gather|scatter-gather]]. Every shard works on every such query, and the reply waits for the slowest, so [[tail latency|tail-latency]] grows with the shard count.\n\n[[Joins|join]] and [[transactions|transaction]] across shards are harder still; [Transactions across services](lesson:distributed-transactions) covers them. The usual fix is to store the data again under the other key, such as a tag table sharded by tag: that is [[denormalization|denormalization]].',
    },
    { kind: 'heading', text: 'Resharding' },
    {
      kind: 'prose',
      md: 'Sooner or later, four shards are not enough, and [[resharding|resharding]] means copying rows to new machines while Snapgram keeps running. With `hash % N`, going from 4 shards to 8 moves half the rows, since a row stays only if `hash % 8` equals `hash % 4`; going from 4 to 5 moves four in five.\n\nSo teams plan ahead. Some create a few hundred [[logical shards|logical-shard]] on a few databases and later move whole logical shards to new machines. Others use [[consistent hashing|consistent-hashing]], the next lesson. Either way, each move follows the same steps.',
    },
    {
      kind: 'diagram',
      title: 'Moving users to a new shard',
      caption: 'Half of Shard 1’s users move to Shard 5 without downtime.',
      spec: move,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real systems also replicate every shard, keep every app server’s routing map in agreement, and keep serving queries in the middle of a move. Databases such as Cassandra and DynamoDB move data between shards for you, but you still choose the key.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'shard-key',
      preset: { key: 'user-id', shards: 4, celebrity: false },
      intro: 'Split Snapgram’s users yourself: try each shard key, raise the shard count and add a celebrity. Watch which shards turn into hot spots, and why.',
    },
  ],
  tradeoffs: {
    caption: 'The three ways to split, compared.',
    rows: [
      {
        option: 'Range partitioning',
        goodAt: 'Range questions touch one or two shards, and a full range splits easily.',
        badAt: 'Keys that rise over time send every new write to the last shard.',
        pickWhen: 'You often read ranges, such as time windows, and writes land all over the key space.',
      },
      {
        option: 'Hash partitioning',
        goodAt: 'Spreads data and writes evenly, with nothing to look up.',
        badAt: 'Range questions ask every shard, and changing N with `hash % N` moves most of the data.',
        pickWhen: 'Most access goes through one key, such as the user ID. It is the usual default.',
      },
      {
        option: 'Directory-based partitioning',
        goodAt: 'Full control: move one customer or country at a time.',
        badAt: 'A lookup on every request, and one more service that must stay up.',
        pickWhen: 'Groups vary wildly in size, or rules decide placement, such as keeping data in its home country.',
      },
    ],
  },
  realWorld: {
    title: 'Notion splits its Postgres database',
    body: 'In 2021, Notion moved from one Postgres database to a sharded setup, after the database’s routine cleanup process, called vacuum, began to stall. It chose the workspace as the shard key: every block belongs to exactly one workspace, and people usually work inside one, so most queries stay on one shard.\n\nThe data went into 480 logical shards on 32 physical databases, with routing done in the application. The move took double writes, a backfill that ran for about three days and careful checks, then a switch-over with five minutes of scheduled downtime. Notion picked 480 because it divides evenly in many ways, so the fleet can grow from 32 machines to 40 or 48.',
    sourceUrl: 'https://www.notion.com/blog/sharding-postgres-at-notion',
    sourceLabel: 'Garrett Fidalgo, “Herding elephants: Lessons learned from sharding Postgres at Notion,” Notion blog, 2021',
  },
  interview: {
    whenToMention:
      'When your estimate shows more data or writes than one database can take, often several terabytes or tens of thousands of writes per second (ballpark). Name the key and why, say how requests find their shard, and raise hot keys and resharding yourself.',
    sayItLikeThis: [
      'I’ll shard photo data by a hash of the user ID, so one query serves a whole profile.',
      'A celebrity can still make one shard hot, so I’d cache their posts and add read replicas for that shard.',
      'Hashtag search would hit every shard, so I’ll keep a separate tag index, sharded by tag.',
    ],
    followUps: [
      {
        q: 'Why not shard by photo ID?',
        a: 'Writes would spread evenly, but a profile page would need photos from every shard, so every page view becomes a cross-shard query. And if photo IDs rise with time and are split by range, every new photo lands on the last shard.',
      },
      {
        q: 'How would you go from 8 shards to 16 without downtime?',
        a: 'Ideally I’d start with a few hundred logical shards and move whole ones to new machines. Each move writes to both places, copies the older rows in the background, verifies, then switches the routing, as Notion did.',
      },
      {
        q: 'How do you handle a query that needs every shard?',
        a: 'On a hot path, I store the data again under the key that query uses, such as a tag index sharded by tag. For rare queries, like a nightly report, scatter-gather is fine.',
      },
    ],
    redFlags: [
      'Sharding data that one database with replicas could handle.',
      'A shard key with few values, or one that rises over time, with no word about hot spots.',
      'Never saying how a request finds its shard, or how to add shards.',
    ],
  },
  mistakes: [
    '**Sharding too early.** Every query, join and transaction gets harder, and a bigger machine, replicas and a cache often buy years.',
    '**A key that rises over time.** With a range split on dates or time-ordered IDs, every new write lands on the last shard.',
    '**A key with few values.** Country can never use more shards than it has values, and the biggest country sets the floor.',
    '**Ignoring the queries.** A key that scatters each profile across every shard turns every page view into a cross-shard query.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram stores photos in ranges of photo ID, and photo IDs are Snowflake IDs that grow with time. What happens to writes?',
      options: [
        {
          text: 'Every new photo lands on the shard with the newest range, which takes almost all the writes',
          correct: true,
          why: 'Time-ordered IDs always fall at the top of the key space, so the last range gets every insert while the older ranges only serve reads.',
        },
        {
          text: 'Writes spread evenly, because every ID is unique',
          correct: false,
          why: 'Unique is not the same as spread out: these IDs arrive in order, so they all fall into the same range.',
        },
        {
          text: 'The first shard fills up, because it holds the oldest photos',
          correct: false,
          why: 'The oldest range holds old photos, but new inserts go to the newest range.',
        },
        {
          text: 'Reads of old photos start to fail',
          correct: false,
          why: 'Old photos are still on their shards and readable; the problem is where the new writes go.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which properties make a good shard key? Select all that apply.',
      options: [
        { text: 'It has many distinct values', correct: true, why: 'Data can only spread over as many shards as the key has values.' },
        {
          text: 'New writes spread across shards instead of piling onto one',
          correct: true,
          why: 'A key that spreads stored data but sends every new write to one shard still creates a hot spot.',
        },
        {
          text: 'The most common queries can be answered from one shard',
          correct: true,
          why: 'Otherwise every common request turns into a scatter-gather across all shards.',
        },
        {
          text: 'Its values rise over time, so the data stays sorted',
          correct: false,
          why: 'Rising values are the classic hot-spot trap with range splits: every new row goes to the last shard.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram places users with `hash(user ID) % 4` and grows to 8 shards using `hash % 8`. What share of users has to move?',
      answer: 50,
      unit: '%',
      tolerance: 1.1,
      solution: [
        'A user stays put only if `hash % 8` equals `hash % 4`.',
        '`hash % 8` is either `hash % 4` or `hash % 4 + 4`, each for half of all hashes.',
        'So half the users stay, and the other half move, each to one of the four new shards.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of moving users from Shard 1 to a new Shard 5 in order.',
      items: [
        'Add the empty Shard 5',
        'Send new writes for those users to both shards',
        'Copy their older rows in the background',
        'Compare the two copies',
        'Switch their reads and writes to Shard 5',
        'Delete the old copies from Shard 1',
      ],
      why: 'Writing to both shards first means nothing is missed while the copy runs, and checking before the switch means no user ever reads a half-copied shard.',
    },
    {
      kind: 'single',
      prompt: 'A celebrity joins, and their shard now serves 40% of all reads. Which fix actually helps?',
      options: [
        {
          text: 'Cache the celebrity’s posts and add read replicas for that shard',
          correct: true,
          why: 'Most reads are then answered by the cache or spread across replicas, without touching the shard key.',
        },
        {
          text: 'Double the number of shards',
          correct: false,
          why: 'The celebrity is one key, so their reads still go to one shard, which becomes an even bigger multiple of the average.',
        },
        {
          text: 'Switch the shard key to country',
          correct: false,
          why: 'The celebrity still lands on one shard, and now the biggest country does too.',
        },
        {
          text: 'Split the shards by signup date instead',
          correct: false,
          why: 'The celebrity just joined, so they would land on the newest shard, which already takes every new user.',
        },
      ],
    },
  ],
  takeaways: [
    'Sharding splits data across databases by a shard key, so each machine stores and serves only its slice.',
    'A good key has many values, spreads new writes and keeps common queries on one shard; a hash of the user ID is the usual choice.',
    'Sharding brings hot spots, cross-shard queries and resharding with it, so shard only when one database truly cannot cope.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Time buckets.** Discord stores messages partitioned by channel plus a window of about 10 days, so that even its busiest channels’ partitions stay small. Splitting a growing key by time, on top of the main key, keeps any one partition from growing forever. [How Discord stores billions of messages](https://discord.com/blog/how-discord-stores-billions-of-messages) explains the choice.',
    },
    {
      kind: 'prose',
      md: '**Salting a hot key.** To spread one celebrity photo’s likes, write them under several keys, such as `photo:42#1` to `photo:42#8`, which hash to different shards, and add the eight counts when reading. Writes spread out, and each read now touches eight places.',
    },
    {
      kind: 'prose',
      md: '**Routing layers.** Instead of putting the shard map in every app server, some teams put a proxy in front of the databases that routes each query for them. Vitess does this for MySQL and Citus for Postgres, and both help with resharding too.',
    },
    {
      kind: 'prose',
      md: '**Global secondary indexes.** Some databases keep a second index sharded by another key, such as photos by tag, and update it in the background. DynamoDB’s global secondary indexes work this way, so reads from them can lag slightly behind the main table.',
    },
  ],
  flashcards: [
    { front: 'What is sharding?', back: 'Splitting one dataset across several databases by a shard key, so each stores and serves only part of the data.' },
    {
      front: 'Range or hash partitioning: what is the difference?',
      back: 'Range keeps neighboring keys together, which helps range queries but piles new writes onto one shard when keys rise; hash scatters keys evenly but loses range queries.',
    },
    {
      front: 'What is directory-based partitioning?',
      back: 'A lookup table records which shard holds each key or group, so data can be placed and moved freely, at the cost of a lookup and one more critical service.',
    },
    { front: 'What makes a good shard key?', back: 'Many distinct values, new writes that spread across shards, and the most common queries answered from one shard.' },
    {
      front: 'Why can’t more shards fix a celebrity’s hot shard?',
      back: 'All of one key’s data lives on one shard. Cache it, add read replicas, or split that key on purpose.',
    },
    { front: 'What is a scatter-gather query?', back: 'A query sent to every shard whose answers are merged. Every shard does work, and the reply waits for the slowest.' },
    {
      front: 'Why does going from 4 to 8 shards with hash % N move half the rows?',
      back: 'A row stays put only if hash % 8 equals hash % 4, which is true for half of all hashes.',
    },
  ],
  related: ['replication', 'unique-ids', 'consistent-hashing', 'sql-vs-nosql', 'denormalization', 'distributed-transactions', 'caching', 'search-inverted-indexes'],
  glossaryTerms: [
    'follower',
    'sharding',
    'leader',
    'vertical-scaling',
    'horizontal-scaling',
    'partition-key',
    'range-partitioning',
    'hash-partitioning',
    'hash-function',
    'directory-partitioning',
    'snowflake-id',
    'hot-spot',
    'hot-key',
    'read-replica',
    'scatter-gather',
    'tail-latency',
    'join',
    'transaction',
    'denormalization',
    'resharding',
    'logical-shard',
    'consistent-hashing',
  ],
};

export default lesson;
