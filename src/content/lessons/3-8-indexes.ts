import type { DiagramSpec, Lesson } from '../types';

/** The signature diagram: one B-tree lookup on Snapgram's 50-million-row photos table. */
const lookup: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'query', type: 'client', label: 'Query', sublabel: 'user_id = 42', x: 0, y: 0 },
    { id: 'root', type: 'sqlDb', label: 'Root page', sublabel: '1 page', x: 1, y: 0 },
    { id: 'l2', type: 'sqlDb', label: 'Level 2 page', sublabel: '1 of 7', x: 1, y: 1 },
    { id: 'l3', type: 'sqlDb', label: 'Level 3 page', sublabel: '1 of 1,250', x: 1, y: 2 },
    { id: 'leaf', type: 'sqlDb', label: 'Leaf page', sublabel: '1 of 250,000', x: 1, y: 3 },
    { id: 'table', type: 'sqlDb', label: 'Photos table', sublabel: '50 million rows', x: 2, y: 3 },
  ],
  edges: [
    { id: 'query-root', from: 'query', to: 'root', kind: 'sync' },
    { id: 'root-l2', from: 'root', to: 'l2', kind: 'sync' },
    { id: 'l2-l3', from: 'l2', to: 'l3', kind: 'sync' },
    { id: 'l3-leaf', from: 'l3', to: 'leaf', kind: 'sync' },
    { id: 'leaf-table', from: 'leaf', to: 'table', kind: 'sync' },
  ],
  // Phones: the lookup runs straight down the tree, then across to the table.
  narrow: {
    grid: { cols: 2, rows: 5 },
    positions: {
      query: { x: 0, y: 0 },
      root: { x: 0, y: 1 },
      l2: { x: 0, y: 2 },
      l3: { x: 0, y: 3 },
      leaf: { x: 0, y: 4 },
      table: { x: 1, y: 4 },
    },
  },
  steps: [
    {
      caption:
        'The query wants `user_id = 42`. The database reads the **root page**, whose few hundred keys split all users into ranges, and follows the pointer for the range that holds 42.',
      flow: ['query-root'],
      focus: ['query', 'root'],
      notes: [{ target: 'root', text: 'read 1', tone: 'plain' }],
    },
    {
      caption: 'That pointer leads to one page on level 2, which splits its range into a few hundred smaller ones. Second read.',
      flow: ['root-l2'],
      focus: ['root', 'l2'],
      notes: [{ target: 'l2', text: 'read 2', tone: 'plain' }],
    },
    {
      caption: 'Level 3 narrows it again. Each read rules out all but about a two-hundredth of what was left.',
      flow: ['l2-l3'],
      focus: ['l2', 'l3'],
      notes: [{ target: 'l3', text: 'read 3', tone: 'plain' }],
    },
    {
      caption: 'The **leaf page** holds sorted entries for user 42, one per photo, newest first, each pointing to its row.',
      flow: ['l3-leaf'],
      focus: ['l3', 'leaf'],
      notes: [{ target: 'leaf', text: 'read 4', tone: 'plain' }],
    },
    {
      caption:
        'Last, the database fetches Maya’s rows from the **photos table**. A handful of page reads replaced 500,000, and the query drops from seconds to a few milliseconds.',
      flow: ['leaf-table'],
      focus: ['leaf', 'table'],
      notes: [{ target: 'table', text: 'a few ms', tone: 'signal' }],
    },
  ],
  description:
    'A query for user 42 reads the root page of a B-tree index, then one page on each of levels 2 and 3, then a leaf page, which points to the matching rows in the 50-million-row photos table.',
};

/** Why indexes slow down writes: one insert fans out to the table and every index. */
const oneInsert: DiagramSpec = {
  grid: { cols: 2, rows: 4 },
  nodes: [
    { id: 'insert', type: 'client', label: 'New photo', sublabel: 'one insert', x: 0, y: 1.5 },
    { id: 'table', type: 'sqlDb', label: 'Photos table', x: 1, y: 0 },
    { id: 'byUser', type: 'sqlDb', label: 'Index: user, time', x: 1, y: 1 },
    { id: 'byPlace', type: 'sqlDb', label: 'Index: location', x: 1, y: 2 },
    { id: 'byAlbum', type: 'sqlDb', label: 'Index: album', x: 1, y: 3 },
  ],
  edges: [
    { id: 'insert-table', from: 'insert', to: 'table', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'insert-user', from: 'insert', to: 'byUser', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'insert-place', from: 'insert', to: 'byPlace', kind: 'sync', fromSide: 'right', toSide: 'left' },
    { id: 'insert-album', from: 'insert', to: 'byAlbum', kind: 'sync', fromSide: 'right', toSide: 'left' },
  ],
  steps: [
    {
      caption: 'Maya posts a photo. With no indexes, that is one write: the new row goes into the **photos table**.',
      flow: ['insert-table'],
      focus: ['insert', 'table'],
    },
    {
      caption: 'With three indexes, the same insert also adds a sorted entry to each one: four writes instead of one.',
      add: ['byUser', 'byPlace', 'byAlbum', 'insert-user', 'insert-place', 'insert-album'],
      flow: [['insert-table', 'insert-user', 'insert-place', 'insert-album']],
    },
    {
      caption: 'New entries land in the middle of sorted pages. When a page is full, it splits in two, which costs even more writes, and every index takes disk space and memory.',
      focus: ['byUser', 'byPlace', 'byAlbum'],
      notes: [{ target: 'byUser', text: 'page split', tone: 'alert' }],
    },
  ],
  description: 'One new photo is written to the photos table and to each of its three indexes: by user and time, by location and by album.',
};

/** An LSM tree: writes go to memory, flush to sorted files, and files merge in the background. */
const lsm: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'writes', type: 'client', label: 'New writes', x: 0, y: 0 },
    { id: 'mem', type: 'cache', label: 'Memtable', sublabel: 'sorted, in memory', x: 1, y: 0 },
    { id: 'f1', type: 'sqlDb', label: 'Newer file', sublabel: 'sorted, on disk', x: 2, y: 0 },
    { id: 'f2', type: 'sqlDb', label: 'Older file', sublabel: 'sorted, on disk', x: 2, y: 1 },
    { id: 'merged', type: 'sqlDb', label: 'Merged file', sublabel: 'after compaction', x: 3, y: 0.5 },
  ],
  edges: [
    { id: 'writes-mem', from: 'writes', to: 'mem', kind: 'sync' },
    { id: 'mem-f1', from: 'mem', to: 'f1', kind: 'async' },
    { id: 'f1-merged', from: 'f1', to: 'merged', kind: 'async' },
    { id: 'f2-merged', from: 'f2', to: 'merged', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'A write goes into the [[memtable|memtable]], a sorted structure in memory, and is also appended to a log on disk so a crash cannot lose it. Both are fast.',
      flow: ['writes-mem'],
      focus: ['writes', 'mem'],
    },
    {
      caption:
        'When the memtable fills, it is written to disk in one go as a sorted file that never changes, an [[SSTable|sstable]] (sorted string table). One big sequential write replaces thousands of small scattered ones.',
      flow: ['mem-f1'],
      focus: ['mem', 'f1'],
    },
    {
      caption: 'Reads pay for this design: a lookup checks the memtable first, then each file from newest to oldest, until it finds the key.',
      focus: ['mem', 'f1', 'f2'],
      notes: [
        { target: 'mem', text: '1st', tone: 'signal' },
        { target: 'f1', text: '2nd', tone: 'signal' },
        { target: 'f2', text: '3rd', tone: 'signal' },
      ],
    },
    {
      caption:
        'So in the background, [[compaction|compaction]] merges files into one, keeping only the newest version of each key. Fewer files means fewer places for a read to check.',
      add: ['merged', 'f1-merged', 'f2-merged'],
      flow: [['f1-merged', 'f2-merged']],
    },
  ],
  description:
    'New writes go into an in-memory memtable, which is flushed to disk as a sorted file. Reads check the memtable, then files from newest to oldest. Compaction merges the newer and older files into one merged file.',
};

const lesson: Lesson = {
  id: 'indexes',
  module: 'm3',
  order: 8,
  title: 'Indexes',
  idea: 'An index is a sorted lookup structure kept beside a table, so the database can jump straight to the rows you want instead of checking every row, at the price of extra work on every write.',
  minutes: 15,
  prerequisites: ['databases-101', 'latency-numbers'],
  outcomes: [
    'Explain why a query without an index checks every row, and how a B-tree finds one in a few page reads.',
    'Compare B-trees with log-structured merge (LSM) trees, and say which workloads each suits.',
    'Decide which columns to index, and explain why every index slows down writes.',
  ],
  analogy: {
    title: 'The index at the back of a book',
    body: 'Say you want every page of a 400-page cookbook that mentions sourdough. Without help, you would leaf through all 400 pages. The index at the back lists topics alphabetically with page numbers, so you find “sourdough” in seconds and turn straight to pages 112, 113 and 287.\n\nThe index has costs, though. It takes extra pages to print, and every time the author adds a recipe, someone must update it. It also helps only with what it lists: it cannot find “recipes under 20 minutes” unless someone indexed that too.',
  },
  whyItMatters:
    'Snapgram’s photos table has grown to 50 million rows. Opening a profile runs one simple query: Maya’s 30 newest photos. It used to feel instant; now it takes about five seconds, and at the evening peak, profile pages time out.\n\nNothing about the query is complicated. The problem is how the database answers it: to find Maya’s few hundred photos, it reads all 50 million rows, every time someone opens her profile.',
  body: [
    {
      kind: 'code',
      code: 'SELECT * FROM photos\nWHERE user_id = 42\nORDER BY created_at DESC\nLIMIT 30;',
      caption: 'Maya’s 30 newest photos. Simple to write, slow to answer without help.',
    },
    { kind: 'heading', text: 'The full table scan' },
    {
      kind: 'prose',
      md: 'With no index on `user_id`, the database has one option: a [[full table scan|full-table-scan]]. It reads the table from start to finish and checks every row against `user_id = 42`. It cannot stop early, because Maya’s photos could be anywhere, and it has no idea how many there are.',
    },
    {
      kind: 'prose',
      md: 'Databases move data in fixed-size blocks called [[pages|disk-page]], often 8 KB, holding around a hundred rows each. So the scan reads about 500,000 pages to return 30 rows. At a ballpark 10 million rows checked per second, that is five seconds, on every profile view.',
    },
    { kind: 'heading', text: 'An index is a sorted shortcut' },
    {
      kind: 'prose',
      md: 'An [[index|index]] is a separate structure, kept sorted by one or more columns, where every entry points to its row. Because the entries are sorted, the database never looks at most of them, just as you skip straight to the S section of a book’s index. The PostgreSQL manual explains indexes with exactly that comparison.',
    },
    {
      kind: 'annotated',
      title: 'Creating the index',
      lines: [
        { code: 'CREATE INDEX photos_by_user', note: 'A new structure with its own name, stored beside the table.' },
        { code: 'ON photos (user_id, created_at);', note: 'Sorted by user, then by time, so all of Maya’s photos sit together, newest at one end.' },
      ],
    },
    { kind: 'heading', text: 'How a B-tree finds a row' },
    {
      kind: 'prose',
      md: 'Most databases store indexes as a [[B-tree|b-tree]]: a tree of pages in which each page holds a few hundred sorted keys, each pointing to a page one level down. The root splits all the keys into a few hundred ranges, each page below splits its range again, and the bottom level, the leaves, points at the rows. With 200 entries per page, every level multiplies the reach by 200.',
    },
    {
      kind: 'diagram',
      title: 'One lookup, a few page reads',
      caption: 'The index on `(user_id, created_at)` finds Maya’s photos among 50 million rows. Step through the descent.',
      spec: lookup,
    },
    {
      kind: 'numbers',
      caption: 'How far a B-tree reaches with 200 entries per page. Real trees hold a few hundred per page, depending on key size, so treat these as ballpark.',
      items: [
        { label: '1 level', value: '200 rows' },
        { label: '2 levels', value: '40,000 rows' },
        { label: '3 levels', value: '8 million rows' },
        { label: '4 levels', value: '1.6 billion rows' },
      ],
    },
    {
      kind: 'prose',
      md: 'That is why indexed lookups stay fast as tables grow: a table a thousand times bigger needs only one or two more page reads. The top levels are read so often that they nearly always sit in memory. And because the leaves are sorted, a range such as “Maya’s 30 newest” is just a walk along neighboring entries.',
    },
    { kind: 'heading', text: 'The price: every write updates every index' },
    {
      kind: 'prose',
      md: 'An index is a second, sorted copy of some of the table’s data, and it must stay in step with the table. Every insert and delete, and every update to an indexed column, also changes each index. That extra work is called [[write amplification|write-amplification]]: one logical write becomes several physical ones.',
    },
    {
      kind: 'diagram',
      title: 'One insert, four writes',
      caption: 'The photos table with three indexes. Step through one new photo.',
      spec: oneInsert,
    },
    {
      kind: 'prose',
      md: 'So index the columns your important queries filter or sort on, and little else. A table read thousands of times for every write can afford several indexes; a table that mostly receives writes, like a log of every like, should have as few as possible.',
    },
    { kind: 'heading', text: 'LSM trees: built for writes' },
    {
      kind: 'prose',
      md: 'A B-tree changes pages in place: each write finds its page on disk and rewrites it. Some databases flip that around with a [[log-structured merge (LSM) tree|lsm-tree]], which never changes a file once it is written. Cassandra, RocksDB and many other write-heavy stores work this way.',
    },
    {
      kind: 'diagram',
      title: 'How an LSM tree writes and reads',
      caption: 'Writes collect in memory and reach disk as whole sorted files, which are merged later.',
      spec: lsm,
    },
    {
      kind: 'prose',
      md: 'To keep reads quick, LSM stores keep small summaries in memory, such as [Bloom filters](lesson:probabilistic-structures), that say which files cannot hold a key. The result is a different balance: LSM trees take writes faster and store data more compactly, while B-trees usually answer reads with less work.',
    },
    {
      kind: 'table',
      columns: ['Aspect', 'B-tree', 'LSM tree'],
      rows: [
        ['Writes', 'Rewrite pages in place, with occasional page splits', 'Collect in memory, then write whole sorted files'],
        ['Reads', 'One path from the root to a leaf', 'May check several files; summaries in memory help'],
        ['Background work', 'Little', 'Compaction uses disk and processor time'],
        ['Found in', 'PostgreSQL, MySQL and most relational databases', 'Cassandra, RocksDB and many write-heavy stores'],
      ],
      caption: 'General tendencies. Real engines tune both designs heavily.',
    },
    { kind: 'heading', text: 'Choosing indexes' },
    {
      kind: 'prose',
      md: 'Start from the queries, not the columns. For each important query, index the columns it filters on, then the ones it sorts by. A [[composite index|composite-index]] on `(user_id, created_at)` serves “Maya’s newest photos” in one walk, and it also serves any query on the user column alone, because that column comes first.',
    },
    {
      kind: 'prose',
      md: 'Order matters, though. The same index cannot help a query on `created_at` alone, just as a phone book sorted by last name cannot find everyone named Ana. And an index on a column with few distinct values, such as a true-or-false flag, rarely helps, since each value matches half the table.',
    },
    {
      kind: 'prose',
      md: 'Finally, check rather than guess: `EXPLAIN` shows the [[query plan|query-plan]], the steps the database chose, including whether it used your index or fell back to a scan.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real databases add details this lesson skips: pages are rarely full, many engines store the table inside its primary-key index, and the planner may scan anyway when a query matches a large share of the rows. The intuition holds: a sorted structure turns a search through everything into a few steps.',
    },
  ],
  tryIt: [
    {
      kind: 'prose',
      md: 'Start at Snapgram’s 50 million rows and press Play: the index finishes after five page reads while the scan is still counting. Then drag the table down to 1,000 rows. At that size the scan is just as quick or quicker, which is why databases often skip indexes on tiny tables.',
    },
    {
      kind: 'widget',
      id: 'index-scan',
      title: 'Full scan vs. index lookup',
      caption:
        'Ballpark costs: a scan checks about 10 million rows per second, and each index page read takes about 0.1 ms from a solid-state drive. The animation is not to scale; the numbers are.',
      props: { rows: 50_000_000 },
    },
  ],
  tradeoffs: {
    caption: 'Ways to find rows, and what each one costs.',
    rows: [
      {
        option: 'No index (full scan)',
        goodAt: 'No extra storage or write cost, and fine when a query reads most of the rows anyway.',
        badAt: 'The work grows with the table, so the query gets slower every day.',
        pickWhen: 'Tables of a few thousand rows, or rare reports that read everything.',
      },
      {
        option: 'B-tree index',
        goodAt: 'Fast lookups and ranges that stay fast as the table grows.',
        badAt: 'Every write also updates the index, which takes disk space and memory.',
        pickWhen: 'Columns your frequent queries filter or sort on. The default in relational databases.',
      },
      {
        option: 'LSM tree',
        goodAt: 'Very high write rates and compact storage.',
        badAt: 'Reads may check several files, and compaction uses background disk and processor time.',
        pickWhen: 'Write-heavy data such as feeds, events, metrics and logs.',
      },
      {
        option: 'Composite index',
        goodAt: 'Serves a filter and a sort in one walk, such as user, then time.',
        badAt: 'Helps only queries that use its leading columns.',
        pickWhen: 'A frequent query filters on one column and sorts or filters on another.',
      },
    ],
  },
  realWorld: {
    title: 'Facebook moves a database to an LSM tree',
    body: 'Facebook’s user database, which serves likes, comments and shares, ran on MySQL with the InnoDB storage engine. In 2016, Facebook’s Yoshinori Matsunobu described MyRocks: MySQL on RocksDB, a storage engine built on log-structured merge trees. The post explains that in InnoDB, updating one row takes several page reads and dirties several pages, which InnoDB writes to storage twice, while RocksDB uses fewer, sequential reads and writes.\n\nAfter moving the user database tier in one region to MyRocks, the team reported using 50 percent less storage for the same data than compressed InnoDB. The post adds that lower write amplification lets them use more affordable flash storage. Same data, a different structure, and a smaller hardware bill.',
    sourceUrl: 'https://engineering.fb.com/2016/08/31/core-infra/myrocks-a-space-and-write-optimized-mysql-database/',
    sourceLabel: 'Meta Engineering, “MyRocks: A space- and write-optimized MySQL database” (2016)',
  },
  interview: {
    whenToMention:
      'When you write down the data model and its main queries. For each frequent query, name the index that serves it, and when a read path is slow, check the indexes before adding caches or machines.',
    sayItLikeThis: [
      'The profile page runs “newest photos by user”, so I’d add a composite index on `(user_id, created_at)`. That turns a scan of 50 million rows into a few page reads.',
      'Likes are written far more often than they are looked up one by one, so I’d keep that table to one or two indexes.',
      'The event log is almost all writes, so I’d put it in an LSM-based store such as Cassandra.',
    ],
    followUps: [
      {
        q: 'Why not index every column?',
        a: 'Each index adds work to every write, takes disk space and competes for memory. Indexes on rarely queried or low-variety columns pay that cost and are seldom used. I index what the frequent queries need, and I check the query plans.',
      },
      {
        q: 'When would you pick an LSM-based store over a B-tree one?',
        a: 'When writes dominate, as with feeds, events, metrics and logs. LSM trees turn writes into fast sequential appends and compress well. For read-heavy data with many lookups and ranges, a B-tree database is usually the better default.',
      },
      {
        q: 'The query is still slow with an index. What do you check?',
        a: 'Run EXPLAIN to see whether the index is used at all. Common culprits are a composite index whose first column the query skips, a function wrapped around the column, or a query that matches so many rows that the planner prefers a scan. Then consider a covering index that holds every column the query needs.',
      },
    ],
    redFlags: [
      'Adding an index to every column “just in case”.',
      'Not knowing that indexes slow down writes.',
      'Expecting an index on `(a, b)` to speed up a query that filters only on `b`.',
    ],
  },
  mistakes: [
    '**Indexing everything.** Every index slows every write and uses memory, and an unused index is pure cost.',
    '**Wrong column order.** A composite index helps only queries that use its leading columns.',
    '**Indexing low-variety columns.** A flag with two values matches half the table, so the database scans anyway.',
    '**Guessing instead of checking.** Read the query plan with EXPLAIN before and after adding an index.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'With no index on `user_id`, why does the database read all 50 million rows to find Maya’s photos?',
      options: [
        {
          text: 'It cannot know where her rows are or how many there are, so it checks every one',
          correct: true,
          why: 'Matches could be anywhere, including the very last row, so stopping early could miss some.',
        },
        {
          text: 'Rows are stored in random order on purpose',
          correct: false,
          why: 'Rows are usually stored roughly in the order they arrived, which still says nothing about which user they belong to.',
        },
        { text: 'Reading the whole table warms up its cache', correct: false, why: 'The scan happens because nothing narrows the search, not to warm a cache.' },
        { text: 'Every query has to read every row', correct: false, why: 'With an index, the same query reads only a few pages.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A B-tree holds 200 entries per page. How many levels does it need to index 8 million rows?',
      answer: 3,
      unit: 'levels',
      tolerance: 1.1,
      solution: [
        'One level reaches 200 rows; two reach 200 × 200 = 40,000.',
        'Three reach 40,000 × 200 = 8,000,000.',
        'So 3 levels: a lookup reads 3 index pages, then the row.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram has an index on `(user_id, created_at)`. Which queries can use it to avoid a full scan?',
      options: [
        { text: 'Maya’s photos, newest first', correct: true, why: 'It filters on the first column and sorts by the second: the ideal case.' },
        { text: 'Every photo by user 42', correct: true, why: 'The first column alone is enough to walk the index.' },
        { text: 'Maya’s photos from last week', correct: true, why: 'Find her section of the index, then read one time range inside it.' },
        {
          text: 'Every photo posted yesterday, by anyone',
          correct: false,
          why: 'The index is sorted by user first, so yesterday’s photos are scattered across every user’s section.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of an indexed lookup in order.',
      items: [
        'Read the root page and pick the range that holds the key',
        'Follow the pointer to a page on the next level down',
        'Reach the leaf page with the matching entries',
        'Fetch the matching rows from the table',
      ],
      why: 'A B-tree lookup runs from the top down, one page per level, and only then reads the rows that the leaf entries point to.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram logs every like in an append-only table that is rarely read row by row. What should guide its indexes?',
      options: [
        {
          text: 'Keep them to a minimum, because every index adds work to every write',
          correct: true,
          why: 'A write-heavy, rarely read table pays the index cost constantly and gets little back.',
        },
        { text: 'Index every column so any future report is fast', correct: false, why: 'That multiplies the cost of every insert for queries that may never run.' },
        { text: 'Add indexes to make the inserts faster', correct: false, why: 'Indexes never speed up inserts; they add work to each one.' },
        {
          text: 'Avoid LSM-based stores, because they cannot sort data',
          correct: false,
          why: 'LSM trees are sorted structures, and write-heavy logs are exactly what they suit.',
        },
      ],
    },
  ],
  takeaways: [
    'Without an index, a query checks every row, so its cost grows with the table.',
    'A B-tree finds any row in a few page reads, because each level multiplies its reach by a few hundred.',
    'Every index slows down writes, so index what your frequent queries need, and reach for LSM-based stores when writes dominate.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Covering indexes.** If an index holds every column a query needs, the database answers from the index alone and never touches the table. Some databases let you add extra columns to an index just for this.',
    },
    {
      kind: 'prose',
      md: '**Clustered indexes.** Some engines, such as MySQL’s InnoDB, store the rows inside the primary-key index itself, so a lookup by primary key ends at the row. Other indexes then point to primary-key values instead of disk locations.',
    },
    {
      kind: 'prose',
      md: '**Hash indexes.** A hash index jumps straight to an exact key, but hashing scrambles the order, so it cannot answer ranges or sorts. That is one reason B-trees are the usual default.',
    },
  ],
  flashcards: [
    { front: 'What is a full table scan?', back: 'Reading every row of a table to answer a query, because no index narrows the search. Its cost grows with the table.' },
    { front: 'What is a database index?', back: 'A sorted structure beside a table, with entries pointing to rows, so the database can find matches without checking every row.' },
    {
      front: 'How many levels does a B-tree with 200 entries per page need for 50 million rows?',
      back: 'Four. Three levels reach only 8 million rows; four reach 1.6 billion.',
    },
    { front: 'Why do indexes slow down writes?', back: 'Every insert or delete, and every update to an indexed column, must also change each index: write amplification.' },
    { front: 'B-tree or LSM tree for a write-heavy event log?', back: 'An LSM tree: it collects writes in memory and writes whole sorted files sequentially.' },
    { front: 'What does an LSM tree give up for its fast writes?', back: 'Reads may check the memtable and several files, and compaction uses background disk and processor time.' },
    {
      front: 'Which queries can use an index on (user_id, created_at)?',
      back: 'Queries that filter on user_id, with or without a time filter or sort. Not queries that filter on created_at alone.',
    },
  ],
  related: ['databases-101', 'latency-numbers', 'sql-vs-nosql', 'search-inverted-indexes', 'unique-ids', 'probabilistic-structures'],
  glossaryTerms: [
    'full-table-scan',
    'disk-page',
    'index',
    'b-tree',
    'write-amplification',
    'lsm-tree',
    'memtable',
    'sstable',
    'compaction',
    'composite-index',
    'query-plan',
  ],
};

export default lesson;
