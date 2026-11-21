import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a boost moves 50 credits from Maya to Leo, fails, rolls back, then succeeds. */
const boost: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 1 },
    { id: 'maya', type: 'sqlDb', label: 'Maya’s row', sublabel: 'users table', x: 2, y: 0 },
    { id: 'leo', type: 'sqlDb', label: 'Leo’s row', sublabel: 'users table', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-maya', from: 'app', to: 'maya', kind: 'sync', label: 'debit 50' },
    { id: 'app-leo', from: 'app', to: 'leo', kind: 'sync', label: 'credit 50' },
  ],
  // Phones: the phone and app server down the middle, with Maya’s and Leo’s rows side by side below.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: { phone: { x: 1, y: 0 }, app: { x: 1, y: 1 }, maya: { x: 0, y: 2 }, leo: { x: 2, y: 2 } },
    sides: { 'app-maya': { fromSide: 'bottom', toSide: 'top' }, 'app-leo': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption: 'Maya taps Boost on Leo’s photo. The app server sends `BEGIN`: from here until `COMMIT`, every change counts as one.',
      flow: ['phone-app'],
      notes: [
        { target: 'maya', text: '120 credits', tone: 'plain' },
        { target: 'leo', text: '80 credits', tone: 'plain' },
      ],
    },
    {
      caption: 'First statement: take 50 credits from Maya. Inside the transaction her balance is now 70, but nobody else can see that yet.',
      flow: ['app-maya', '<app-maya'],
      notes: [
        { target: 'maya', text: '70, not committed', tone: 'signal' },
        { target: 'leo', text: '80 credits', tone: 'plain' },
      ],
    },
    {
      caption: 'Next statement: give Leo 50. It fails, say because the database times out under a sudden load. Half a transfer is now sitting in the transaction.',
      flow: [
        { edge: 'app-leo', tag: 'error', tone: 'alert' },
        { edge: 'app-leo', reverse: true, tone: 'alert' },
      ],
      notes: [{ target: 'maya', text: '70, not committed', tone: 'signal' }],
    },
    {
      caption: 'So the app sends `ROLLBACK`. The database undoes every change since `BEGIN`: Maya has her 120 credits back, as if the boost never started, and her phone shows an error.',
      flow: [{ edge: 'app-maya', tag: 'undone' }, '<app-maya', '<phone-app'],
      notes: [
        { target: 'maya', text: '120 again', tone: 'plain' },
        { target: 'leo', text: '80 credits', tone: 'plain' },
      ],
    },
    {
      caption: 'A minute later Maya tries again, and both statements succeed. `COMMIT` makes them permanent and visible at the same moment; a crash before that line would have undone both.',
      flow: ['phone-app', ['app-maya', 'app-leo'], ['<app-maya', '<app-leo'], '<phone-app'],
      notes: [
        { target: 'maya', text: '70 credits', tone: 'signal' },
        { target: 'leo', text: '130 credits', tone: 'signal' },
      ],
    },
  ],
};

/** Isolation: two app servers read the same balance, and one boost goes unpaid. */
const lostUpdate: SequenceSpec = {
  actors: [
    { id: 'a', type: 'service', label: 'App server 1' },
    { id: 'db', type: 'sqlDb', label: 'Database' },
    { id: 'b', type: 'service', label: 'App server 2' },
  ],
  messages: [
    {
      from: 'a',
      to: 'db',
      label: 'read Maya’s credits',
      kind: 'sync',
      caption: 'Maya has 60 credits and taps Boost twice, quickly. App server 1 handles the first tap and reads her balance.',
    },
    { from: 'db', to: 'a', label: '60', kind: 'reply', caption: 'Sixty credits: enough for a 50-credit boost.' },
    {
      from: 'b',
      to: 'db',
      label: 'read Maya’s credits',
      kind: 'sync',
      caption: 'App server 2 handles the second tap a moment later and reads the balance too.',
    },
    {
      from: 'db',
      to: 'b',
      label: '60',
      kind: 'reply',
      caption: 'Still 60, because server 1 has not written anything yet. Both servers now believe the boost is affordable.',
    },
    { from: 'a', to: 'db', label: 'set credits to 10', kind: 'sync', caption: 'Server 1 subtracts 50 in its own code and writes 10.' },
    {
      from: 'b',
      to: 'db',
      label: 'set credits to 10',
      kind: 'sync',
      caption: 'Server 2 also writes 10, right over the first write. Two boosts went out, but Maya paid for one: a lost update.',
    },
  ],
};

const lesson: Lesson = {
  id: 'databases-101',
  module: 'm3',
  order: 6,
  title: 'Databases 101',
  idea: 'A relational [[database|database]] stores data in tables with strict rules, links the tables with keys, and groups related changes into transactions that happen completely or not at all.',
  minutes: 14,
  prerequisites: ['stateless-vs-stateful'],
  outcomes: [
    'Model data as tables with primary and foreign keys, and combine them with a join.',
    'Explain the four promises of a transaction with a money transfer, including what a rollback undoes.',
    'Spot where an app needs a transaction, and what goes wrong without one.',
  ],
  analogy: {
    title: 'A spreadsheet with strict rules',
    body: 'Picture a shared spreadsheet for a club, with one tab for members and one for payments. Now give it rules that nobody can break. Every member needs a unique number, the amount column only accepts numbers, and a payment must name a member who exists.\n\nAdd one more rule: when money moves between two members, both cells change together or neither does. If the power cuts out between the two edits, the sheet snaps back to how it was. That is a relational database: the tabs become tables, and the rules are enforced for you.',
  },
  whyItMatters:
    'Snapgram’s users, photos, likes and comments all live in its database, each kind of thing in its own table. Now the founders launch boosts: users buy credits and spend them to push a friend’s photo up everyone’s feed, and the friend earns the credits. When Maya boosts Leo’s photo, 50 credits should leave her account and land in his.\n\nOn launch day, an app server crashes in the middle of a boost. Maya’s account is 50 credits lighter, and Leo’s never changed: the credits have vanished. The code ran two separate updates and the crash landed between them, so nobody can tell which other boosts half-happened.',
  body: [
    {
      kind: 'prose',
      md: 'Most apps keep their important data in a relational database, the kind you talk to in [[SQL|sql]] (Structured Query Language). Relational means the data sits in tables that point at each other. The database is not a passive file: it enforces rules on every change, which is what makes it the [[source of truth|source-of-truth]] that every cache copies from.',
    },
    { kind: 'heading', text: 'Tables, rows and columns' },
    {
      kind: 'prose',
      md: 'A [[table|table]] holds one kind of thing, such as users or photos. Each [[row|row]] is one item, and each [[column|column]] is one attribute with a fixed type. The [[schema|schema]] declares all of this up front, and the database refuses data that does not fit, such as text in a number column or a missing value where one is required.',
    },
    {
      kind: 'table',
      columns: ['id', 'name', 'city', 'credits'],
      rows: [
        ['42', 'Maya', 'Singapore', '120'],
        ['77', 'Leo', 'Lisbon', '80'],
        ['91', 'Ana', 'São Paulo', '35'],
      ],
      caption: 'Three rows of the users table. Every row has a value of the right type in every column.',
    },
    {
      kind: 'annotated',
      title: 'Part of Snapgram’s schema',
      lines: [
        { code: 'CREATE TABLE users (' },
        { code: '  id      BIGINT PRIMARY KEY,', note: 'Every user gets a unique number that never changes.' },
        { code: '  name    TEXT NOT NULL,', note: 'Required: a user without a name is rejected.' },
        { code: '  credits INTEGER NOT NULL CHECK (credits >= 0)', note: 'A rule: no change may leave a balance below zero.' },
        { code: ');' },
        { code: 'CREATE TABLE photos (' },
        { code: '  id      BIGINT PRIMARY KEY,' },
        { code: '  user_id BIGINT NOT NULL REFERENCES users (id),', note: 'Must match a user who exists.' },
        { code: '  caption TEXT' },
        { code: ');' },
      ],
    },
    { kind: 'heading', text: 'Keys connect the tables' },
    {
      kind: 'prose',
      md: 'A [[primary key|primary-key]] names exactly one row: `users.id = 42` is Maya and nobody else. A [[foreign key|foreign-key]] is a column that holds another table’s primary key, like `photos.user_id`. The database checks it on every write, so a photo can never belong to a user who does not exist.',
    },
    {
      kind: 'prose',
      md: 'Keys can also enforce product rules. The likes table stores one row per like, and its primary key is the pair (`user_id`, `photo_id`). A second like from the same person on the same photo would repeat that key, so the database rejects it, whatever bug the app has. Rules like these are called [[constraints|constraint]].',
    },
    { kind: 'heading', text: 'Joins put the pieces back together' },
    {
      kind: 'prose',
      md: 'Each fact lives in exactly one place: Maya’s name is stored once, in users, not copied into every photo. To show a photo with its owner’s name, a [[join|join]] matches rows from two tables wherever the keys agree.',
    },
    {
      kind: 'code',
      code: 'SELECT photos.caption, users.name\nFROM photos\nJOIN users ON users.id = photos.user_id\nWHERE photos.id = 123;\n\n-- caption              | name\n-- Sunset over the bay  | Maya',
      caption: 'One photo with its owner’s name, built from two tables. Matching keys stays fast thanks to an [[index|index]], the subject of [Indexes](lesson:indexes).',
    },
    { kind: 'heading', text: 'Transactions: all or nothing' },
    {
      kind: 'prose',
      md: 'Back to boosts. The bug was two separate updates with a gap between them, and a [[transaction|transaction]] closes the gap. ==A transaction makes several changes happen together or not at all.== Wrap both updates between `BEGIN` and `COMMIT`; if anything fails before the [[commit|commit]], a [[rollback|rollback]] undoes everything since `BEGIN`.',
    },
    {
      kind: 'code',
      code: 'BEGIN;\nUPDATE users SET credits = credits - 50 WHERE id = 42;  -- Maya\nUPDATE users SET credits = credits + 50 WHERE id = 77;  -- Leo\nCOMMIT;',
      caption: 'A boost as one transaction. Either both updates are saved, or neither is.',
    },
    {
      kind: 'diagram',
      title: 'A boost, rolled back and retried',
      caption: 'The **app server** moves 50 credits from Maya to Leo. Watch both balances on every step.',
      spec: boost,
    },
    { kind: 'heading', text: 'ACID: four promises' },
    {
      kind: 'prose',
      md: 'Databases sum up what a transaction guarantees in four letters, [[ACID|acid]]: atomicity, consistency, isolation and durability. A boost needs all four.',
    },
    {
      kind: 'table',
      columns: ['Promise', 'What it means', 'In a boost'],
      rows: [
        ['[[Atomicity|atomicity]]', 'All of the transaction happens, or none of it.', 'The debit never survives without the credit.'],
        ['Consistency', 'Every commit leaves the data obeying its rules.', 'The check on credits rejects a boost that would go below zero.'],
        ['[[Isolation|isolation]]', 'Transactions running at the same time do not trip over each other.', 'Two boosts at once cannot both spend the same 60 credits.'],
        ['[[Durability|durability]]', 'Once committed, a change survives crashes.', 'After Maya sees that her boost went through, a power cut cannot undo it.'],
      ],
      caption: 'The four promises, using Snapgram’s boosts.',
    },
    {
      kind: 'prose',
      md: 'Isolation is the subtle one. Without it, two requests can interleave and both act on the same old value, a bug called a [[race condition|race-condition]].',
    },
    {
      kind: 'sequence',
      title: 'Two boosts at the same moment',
      caption: 'Maya taps Boost twice in quick succession, and two app servers handle the taps.',
      spec: lostUpdate,
    },
    {
      kind: 'prose',
      md: 'The fix is to let the **database** check and subtract in one statement: `UPDATE users SET credits = credits - 50 WHERE id = 42 AND credits >= 50`. The database locks Maya’s row while it changes it, so the second update waits, then finds only 10 credits and changes nothing. The check on credits backs this up: no update can ever push a balance below zero.',
    },
    {
      kind: 'prose',
      md: 'Durability comes from a [[write-ahead log|write-ahead-log]]. Before the database reports a commit, it writes the change to a log on disk; after a crash, it replays the log, so every committed boost survives and every unfinished one is rolled back.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real databases let you choose how strict isolation is, and many default to a weaker level than the full promise, for speed; [Go deeper](#go-deeper) explains. Indexes, replication and splitting data across machines come in later lessons.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to protect Snapgram’s credits, from least to most careful.',
    rows: [
      {
        option: 'Separate updates, no transaction',
        goodAt: 'Simplest code, and nothing waits on locks.',
        badAt: 'An error or crash between the updates leaves half a transfer, with no record of which half.',
        pickWhen: 'Never for money; only for writes that stand alone, such as a view counter.',
      },
      {
        option: 'One transaction',
        goodAt: 'All or nothing, with a rollback on any error.',
        badAt: 'It locks the rows it changes, so a long transaction makes other requests wait.',
        pickWhen: 'Several changes must agree, like a debit and a credit.',
      },
      {
        option: 'Conditional update',
        goodAt: 'One statement checks and changes a balance, so concurrent boosts cannot overspend.',
        badAt: 'It protects one row at a time; a transfer still needs a transaction around it.',
        pickWhen: 'A balance or stock count must never cross a limit.',
      },
      {
        option: 'Strictest isolation level',
        goodAt: 'Transactions behave as if they ran one after another.',
        badAt: 'Slower, and the database may abort transactions that the app must then retry.',
        pickWhen: 'A rule spans many rows and is hard to protect with locks, such as a total across accounts.',
      },
    ],
  },
  realWorld: {
    title: 'A race condition that emptied an exchange',
    body: 'In the “ACIDRain” paper (SIGMOD 2017), Stanford researchers Todd Warszawski and Peter Bailis describe what happened to the Flexcoin bitcoin exchange on March 2, 2014. An attacker sent thousands of simultaneous requests to move coins between Flexcoin accounts, overdrawing the sending account before balances were updated. Repeated across many accounts, the trick snowballed until the attacker withdrew the coins: all bitcoins stored at Flexcoin were stolen, and the exchange shut down.\n\nThe paper shows that wrapping code in a transaction is not always enough: at the weaker isolation levels many databases use by default, a read-check-write transaction can still be overdrawn unless it locks the rows it reads. Testing 12 popular self-hosted online store applications, the authors found and confirmed 22 such attacks, from overspent gift cards to corrupted inventory.',
    sourceUrl: 'https://www.bailis.org/papers/acidrain-sigmod2017.pdf',
    sourceLabel: 'Warszawski and Bailis, “ACIDRain: Concurrency-Related Attacks on Database-Backed Web Applications,” SIGMOD 2017',
  },
  interview: {
    whenToMention:
      'When you sketch the data model, and whenever money, stock or anything countable changes hands. Name the tables and their keys, then point at the operations that must happen together and say they run in one transaction.',
    sayItLikeThis: [
      'I’ll store users, photos and likes in a relational database. Likes get a primary key of user and photo together, so a double like is impossible by construction.',
      'A boost debits one account and credits another, so both updates run in one transaction. The debit also checks the balance in the same statement, so two boosts at once cannot overspend.',
    ],
    followUps: [
      {
        q: 'Why not keep the credit balance in the cache for speed?',
        a: 'A cache can be stale, and it can lose data when it restarts, while a balance must be exact. Read and change balances in the database, inside a transaction, and cache only what may be a little out of date, such as the number of likes on a photo.',
      },
      {
        q: 'What if a transfer has to touch two different databases?',
        a: 'One database’s transaction cannot cover both. You need a cross-service pattern, such as a saga with compensating steps, which [Transactions across services](lesson:distributed-transactions) covers. When you can, keep data that must change together in one database.',
      },
      {
        q: 'Does a transaction alone stop two boosts from spending the same credits?',
        a: 'Not always. At the default isolation level of many databases, two transactions can both read 60 credits before either writes. Use a conditional update, lock the row, or raise the isolation level, and keep the check on credits as a last line of defense.',
      },
    ],
    redFlags: [
      'Moving money with separate updates and no transaction.',
      'Reading a balance, checking it in app code and writing it back, with no lock or condition.',
      'Saying the database is ACID, so concurrency is handled, without knowing its isolation level.',
    ],
  },
  mistakes: [
    '**Splitting one change into separate writes.** A crash between them leaves the data half-updated, and nothing records which half happened.',
    '**Checking in the app, then writing.** Reading a balance, deciding, then writing it back lets two requests act on the same old value. Let the database check and update in one statement.',
    '**Copying data instead of linking it.** Storing Maya’s name in every photo row means a rename must touch thousands of rows, and some will be missed. Store it once and join.',
    '**Skipping constraints.** Without foreign keys and checks, every bug in the app can write bad data that nobody notices for months.',
    '**Long transactions.** A transaction that waits on a slow network call holds its locks the whole time, and other requests pile up behind it.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'What does a foreign key do?',
      options: [
        {
          text: 'It makes sure a value in one table matches an existing primary key in another',
          correct: true,
          why: 'That is how `photos.user_id` stays tied to a real user: the database rejects anything else.',
        },
        { text: 'It encrypts a column so only the owner can read it', correct: false, why: 'Keys here are about identity and links, not secrecy.' },
        {
          text: 'It gives each row a unique number',
          correct: false,
          why: 'That is the primary key’s job. A foreign key points at another table’s primary key.',
        },
        {
          text: 'It speeds up every query on the table',
          correct: false,
          why: 'Speed comes from indexes. A foreign key is a rule about which values are allowed.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put what happens in order when the credit to Leo fails.',
      items: [
        '`BEGIN` starts the transaction',
        'Maya’s balance drops to 70, visible only inside the transaction',
        'The next statement, the credit to Leo, fails',
        'The app sends `ROLLBACK`',
        'Maya’s balance is 120 again, as if nothing happened',
      ],
      why: 'The transaction starts first, and the debit is applied but not committed. When the credit fails, the rollback undoes everything since `BEGIN`, so Maya ends where she started.',
    },
    {
      kind: 'single',
      prompt: 'The app server crashes after the debit but before the credit, inside a transaction that never reached `COMMIT`. What does the database hold once it is running again?',
      options: [
        {
          text: 'Both balances as they were before the boost',
          correct: true,
          why: 'Atomicity: an unfinished transaction is rolled back, and the debit disappears with it.',
        },
        { text: 'Maya’s debit, but not Leo’s credit', correct: false, why: 'That is exactly the half-transfer that transactions prevent.' },
        { text: 'Both changes, because the debit had already run', correct: false, why: 'Nothing in a transaction is permanent until the commit.' },
        {
          text: 'A damaged table that must be restored from a backup',
          correct: false,
          why: 'The write-ahead log lets the database recover cleanly by itself; no backup is needed.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these does isolation protect against?',
      options: [
        {
          text: 'Two boosts at once both reading 60 credits and both spending 50',
          correct: true,
          why: 'That is a race between concurrent transactions, which isolation exists to stop.',
        },
        {
          text: 'Another request seeing Maya at 70 credits before the boost commits',
          correct: true,
          why: 'Isolation hides a transaction’s unfinished changes from everyone else.',
        },
        { text: 'Losing a committed boost in a power cut', correct: false, why: 'That is durability, which the write-ahead log provides.' },
        { text: 'A photo whose owner does not exist', correct: false, why: 'That is a foreign key rule, part of consistency.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Maya has 60 credits and sends Leo two 50-credit boosts at the same moment. Both app servers read her balance before either writes, each writes back its own result of 60 − 50, and both credits to Leo go through. How many credits were created out of thin air?',
      answer: 50,
      unit: 'credits',
      tolerance: 1.1,
      solution: [
        'Each server wrote 60 − 50 = 10, so Maya lost only 50 credits in total.',
        'Leo received 50 + 50 = 100 credits.',
        '100 − 50 = 50 credits appeared from nowhere: one boost went unpaid.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Why does the photos table store `user_id` instead of a copy of the owner’s name?',
      options: [
        {
          text: 'So each fact lives in one place: a rename changes one row, and a join fetches the current name',
          correct: true,
          why: 'Copies drift apart when one is updated and another is missed. A key always leads to the current value.',
        },
        { text: 'Because tables cannot hold text', correct: false, why: 'They can: `name` is a text column in users.' },
        {
          text: 'To make every query faster',
          correct: false,
          why: 'A join is a little more work than reading a copy. The reason is correctness, not speed.',
        },
        {
          text: 'Because the photos table has no room for more columns',
          correct: false,
          why: 'Tables can have many columns. The point is to avoid storing the same fact twice.',
        },
      ],
    },
  ],
  takeaways: [
    'A relational database stores data in tables of rows and columns, and keys link the tables together.',
    'A transaction makes several changes happen together or not at all, rolling back when anything fails.',
    'ACID names four promises, atomicity, consistency, isolation and durability, and isolation needs the most care.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Isolation levels.** The SQL standard defines four [[isolation levels|isolation-level]], from read uncommitted to serializable, and PostgreSQL, for example, uses read committed by default. Serializable makes transactions behave as if they ran one after another, at some cost in speed and retries. Weaker levels allow anomalies such as the lost update above, unless you lock rows or use conditional updates.',
    },
    {
      kind: 'prose',
      md: '**Locking a row on purpose.** Inside a transaction, `SELECT ... FOR UPDATE` reads a row and locks it, so another transaction that wants the same row waits until the first one finishes. It is the explicit locking the ACIDRain paper points to for read-then-write code.',
    },
    {
      kind: 'prose',
      md: '**Deadlocks.** If one transaction locks Maya’s row and waits for Leo’s, while another holds Leo’s and waits for Maya’s, neither can finish. Databases detect this and abort one of them, which the app should retry. Locking rows in a fixed order, such as by `id`, avoids most deadlocks.',
    },
  ],
  flashcards: [
    {
      front: 'What are a table, a row and a column?',
      back: 'A table holds one kind of thing, each row is one item, and each column is one attribute with a fixed type.',
    },
    {
      front: 'What is the difference between a primary key and a foreign key?',
      back: 'A primary key identifies one row in its own table. A foreign key holds another table’s primary key, linking the rows.',
    },
    { front: 'What does a join do?', back: 'It combines rows from two tables wherever their keys match, such as each photo with its owner’s name.' },
    { front: 'What is a transaction?', back: 'A group of changes that succeed or fail as one: committed together, or rolled back together.' },
    {
      front: 'What do the four letters of ACID stand for?',
      back: 'Atomicity (all or nothing), consistency (rules hold), isolation (concurrent transactions do not interfere) and durability (commits survive crashes).',
    },
    {
      front: 'What is a lost update?',
      back: 'Two transactions read the same value and both write a result based on it, so one change silently overwrites the other.',
    },
    {
      front: 'How does a database keep committed data safe through a crash?',
      back: 'It writes each change to a write-ahead log on disk before confirming the commit, and replays the log when it restarts.',
    },
  ],
  related: ['sql-vs-nosql', 'indexes', 'unique-ids', 'distributed-transactions', 'caching', 'replication'],
  glossaryTerms: [
    'database',
    'sql',
    'source-of-truth',
    'table',
    'row',
    'column',
    'schema',
    'primary-key',
    'foreign-key',
    'constraint',
    'join',
    'index',
    'transaction',
    'commit',
    'rollback',
    'acid',
    'atomicity',
    'isolation',
    'durability',
    'race-condition',
    'write-ahead-log',
    'isolation-level',
  ],
};

export default lesson;
