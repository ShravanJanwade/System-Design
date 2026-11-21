import type { DiagramSpec, Problem } from '../types';

/** v1: two editors, one collab server that orders every edit, one database. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'alice', type: 'client', label: 'Alice', sublabel: 'browser', x: 0, y: 0 },
    { id: 'bob', type: 'client', label: 'Bob', sublabel: 'browser', x: 0, y: 2 },
    { id: 'server', type: 'service', label: 'Collab server', sublabel: 'doc in memory', x: 1, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'text and op log', x: 2, y: 1 },
  ],
  edges: [
    { id: 'alice-server', from: 'alice', to: 'server', kind: 'sync', label: 'WebSocket' },
    { id: 'bob-server', from: 'bob', to: 'server', kind: 'sync', label: 'WebSocket' },
    { id: 'server-db', from: 'server', to: 'db', kind: 'sync' },
  ],
  // Phones: Alice and Bob side by side on top, their sockets meeting at the server, the database below it.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: { alice: { x: 0, y: 0 }, bob: { x: 2, y: 0 }, server: { x: 1, y: 1 }, db: { x: 1, y: 2 } },
    sides: { 'alice-server': { fromSide: 'bottom', toSide: 'top' }, 'bob-server': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Alice and Bob open the same document. Each browser keeps a WebSocket open to the **collab server**, which loads the text and its revision number, 7, from the **database** and sends both down each socket.',
      flow: ['server-db', '<server-db', ['<alice-server', '<bob-server']],
      notes: [{ target: 'db', text: 'revision 7' }],
    },
    {
      caption:
        'Alice types five characters at position 10. Her editor shows them at once and sends one small operation: “insert at 10, based on revision 7”. The server applies it, saves it to the log as revision 8, acknowledges Alice and forwards it to Bob.',
      flow: ['alice-server', 'server-db', '<server-db', ['<alice-server', '<bob-server']],
      notes: [{ target: 'alice', text: 'insert at 10' }],
    },
    {
      caption:
        'At the same moment Bob typed at position 30, also based on revision 7. His operation arrives second, so the server transforms it against revision 8: Alice’s five characters came before position 30, so Bob’s insert moves to 35. It becomes revision 9, and both copies match.',
      flow: ['bob-server', 'server-db', '<server-db', ['<alice-server', '<bob-server']],
      notes: [{ target: 'bob', text: '30 becomes 35' }],
    },
    {
      caption:
        'Cursor moves travel on the same sockets. The server forwards Alice’s cursor to Bob but never writes it to the database, because it is out of date a second later.',
      flow: ['alice-server', '<bob-server'],
      notes: [{ target: 'bob', text: 'Alice’s cursor' }],
    },
  ],
};

/** v2: a router sends every editor of a document to the collab server that owns it; a log and snapshots behind. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Editors', sublabel: 'browsers', x: 0, y: 1 },
    { id: 'router', type: 'loadBalancer', label: 'Router', sublabel: 'hashes doc ID', x: 1, y: 1 },
    { id: 'collabA', type: 'service', label: 'Collab server A', sublabel: 'owns doc 42', x: 2, y: 0 },
    { id: 'collabB', type: 'service', label: 'Collab server B', sublabel: 'owns doc 77', x: 2, y: 2 },
    { id: 'snapshots', type: 'objectStore', label: 'Snapshots', sublabel: 'object storage', x: 3, y: 0 },
    { id: 'oplog', type: 'nosqlDb', label: 'Operation log', sublabel: 'by doc, revision', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-router', from: 'users', to: 'router', kind: 'sync', label: 'WebSocket' },
    { id: 'router-collabA', from: 'router', to: 'collabA', kind: 'sync' },
    { id: 'router-collabB', from: 'router', to: 'collabB', kind: 'sync' },
    { id: 'collabA-snapshots', from: 'collabA', to: 'snapshots', kind: 'sync' },
    { id: 'collabA-oplog', from: 'collabA', to: 'oplog', kind: 'sync' },
    { id: 'collabB-oplog', from: 'collabB', to: 'oplog', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every editor of document 42 must reach the same server, so the **router** hashes the document ID onto a ring of collab servers. **Collab server A** owns 42: it loads the latest **snapshot**, replays the few operations logged after it, and keeps the document in memory.',
      flow: ['users-router', 'router-collabA', 'collabA-snapshots', '<collabA-snapshots', 'collabA-oplog', '<collabA-oplog', '<router-collabA', '<users-router'],
      notes: [{ target: 'snapshots', text: 'revision 1,000' }],
    },
    {
      caption:
        'Each operation is appended to the **operation log** before it is acknowledged or forwarded, so an acknowledged edit survives any crash. The append is conditional: revision 1,043 is written only if the log ends at 1,042, so two writers can never fork a document’s history.',
      flow: ['users-router', 'router-collabA', 'collabA-oplog', '<collabA-oplog', '<router-collabA', '<users-router'],
      notes: [{ target: 'oplog', text: 'append 1,043' }],
    },
    {
      caption:
        'Every 500 operations or so (ballpark), A saves a fresh snapshot to object storage, in the background. Loading a document then never replays more than a few hundred operations.',
      flow: ['collabA-snapshots'],
      notes: [{ target: 'snapshots', text: 'revision 1,500' }],
    },
    {
      caption:
        'Editors of document 77 hash to **collab server B**, which works the same way. Each server owns thousands of open documents and keeps their cursors in memory; about 50 servers (ballpark) carry a million connected people at peak.',
      flow: ['users-router', 'router-collabB', 'collabB-oplog', '<collabB-oplog', '<router-collabB', '<users-router'],
    },
  ],
};

/** v3: history is snapshots plus the log; a compactor thins old history; restore is a new operation. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'editor', type: 'client', label: 'Editor', sublabel: 'history panel', x: 0, y: 0 },
    { id: 'history', type: 'service', label: 'History service', x: 1, y: 0 },
    { id: 'snapshots', type: 'objectStore', label: 'Snapshots', sublabel: 'and checkpoints', x: 2, y: 0 },
    { id: 'others', type: 'client', label: 'Other editors', x: 0, y: 1 },
    { id: 'collab', type: 'service', label: 'Collab server', sublabel: 'owns the doc', x: 1, y: 1 },
    { id: 'oplog', type: 'nosqlDb', label: 'Operation log', sublabel: 'last 30 days', x: 2, y: 1 },
    { id: 'compactor', type: 'worker', label: 'Compactor', sublabel: 'nightly', x: 3, y: 0.5 },
  ],
  edges: [
    { id: 'editor-history', from: 'editor', to: 'history', kind: 'sync' },
    { id: 'history-snapshots', from: 'history', to: 'snapshots', kind: 'sync' },
    { id: 'history-oplog', from: 'history', to: 'oplog', kind: 'sync' },
    { id: 'history-collab', from: 'history', to: 'collab', kind: 'sync' },
    { id: 'others-collab', from: 'others', to: 'collab', kind: 'sync' },
    { id: 'collab-oplog', from: 'collab', to: 'oplog', kind: 'sync' },
    { id: 'compactor-oplog', from: 'compactor', to: 'oplog', kind: 'sync' },
    { id: 'compactor-snapshots', from: 'compactor', to: 'snapshots', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Recent history is the **operation log** itself: every change from the last 30 days (ballpark), with its author and time. Each night the **compactor** folds older operations into checkpoints, one snapshot per hour of editing plus every version someone named, then deletes those raw operations.',
      flow: ['compactor-oplog', '<compactor-oplog', 'compactor-snapshots'],
      notes: [{ target: 'compactor', text: 'older than 30 days' }],
    },
    {
      caption:
        'An editor opens the history panel at Tuesday, 3:15 pm. The **history service** loads the nearest snapshot before that moment and replays the logged operations up to it. Comparing that version with the one before shows who changed what.',
      flow: ['editor-history', 'history-snapshots', '<history-snapshots', 'history-oplog', '<history-oplog', '<editor-history'],
      notes: [{ target: 'editor', text: 'Tuesday, 3:15 pm' }],
    },
    {
      caption:
        'Restoring that version rewrites nothing. The history service asks the document’s **collab server** to apply one new operation that turns today’s text into Tuesday’s, so other editors see the restore like any edit, and the restore itself can be undone.',
      flow: ['editor-history', 'history-collab', 'collab-oplog', '<collab-oplog', '<others-collab'],
      notes: [{ target: 'others', text: 'restore arrives' }],
    },
  ],
};

/** v4: a server list with leases, takeover by another server, and an owner number that fences off a frozen server. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Editors', sublabel: 'doc 42', x: 0, y: 1 },
    { id: 'router', type: 'loadBalancer', label: 'Router', x: 1, y: 1 },
    { id: 'collabA', type: 'service', label: 'Collab server A', sublabel: 'owner 13', x: 2, y: 0 },
    { id: 'members', type: 'nosqlDb', label: 'Server list', sublabel: 'etcd, leases', x: 2, y: 1 },
    { id: 'collabB', type: 'service', label: 'Collab server B', x: 2, y: 2 },
    { id: 'oplog', type: 'nosqlDb', label: 'Operation log', sublabel: 'checks owner', x: 3, y: 1 },
    { id: 'snapshots', type: 'objectStore', label: 'Snapshots', x: 3, y: 2 },
  ],
  edges: [
    { id: 'users-router', from: 'users', to: 'router', kind: 'sync' },
    { id: 'router-collabA', from: 'router', to: 'collabA', kind: 'sync' },
    { id: 'router-members', from: 'router', to: 'members', kind: 'sync' },
    { id: 'router-collabB', from: 'router', to: 'collabB', kind: 'sync' },
    { id: 'collabA-members', from: 'collabA', to: 'members', kind: 'sync' },
    { id: 'collabB-members', from: 'collabB', to: 'members', kind: 'sync' },
    { id: 'collabA-oplog', from: 'collabA', to: 'oplog', kind: 'sync' },
    { id: 'collabB-oplog', from: 'collabB', to: 'oplog', kind: 'sync' },
    { id: 'collabB-snapshots', from: 'collabB', to: 'snapshots', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each collab server holds a [[lease|lease]] in the **server list**, a small [[coordination service|coordination-service]] such as etcd, and renews it every few seconds. The **router** [[watches|watch]] the list and hashes document IDs over the servers on it.',
      flow: [['collabA-members', 'collabB-members'], '<router-members'],
    },
    {
      caption:
        '**Collab server A** crashes while people are editing document 42. Their sockets drop, but each editor keeps its unacknowledged operations in a local queue and lets its user keep typing. About 10 seconds later (ballpark), A’s lease expires and the list drops it.',
      fail: ['collabA'],
      flow: ['<router-members'],
      notes: [{ target: 'users', text: 'edits queued' }],
    },
    {
      caption:
        'The ring now maps 42 to **collab server B**. B raises the document’s owner number from 13 to 14 with a conditional write, loads the latest snapshot, replays the log after it and accepts the reconnecting editors. Each resends its queued operations tagged with a client ID and a [[sequence number|sequence-number]], so an operation A logged but never acknowledged is applied only once.',
      fail: ['collabA'],
      flow: ['users-router', 'router-collabB', 'collabB-oplog', '<collabB-oplog', 'collabB-snapshots', '<collabB-snapshots', '<router-collabB', { edge: 'users-router', reverse: true, tag: 'caught up' }],
    },
    {
      caption:
        'Suppose A was only frozen by a long [[garbage collection|garbage-collection]] pause and wakes up still thinking it owns 42. Its next append carries owner number 13, but the log now expects 14, so the append is rejected: the owner number is a [[fencing token|fencing-token]]. A drops the document and closes its sockets, and those editors reconnect to B.',
      flow: [{ edge: 'collabA-oplog', tag: 'rejected', tone: 'alert' }],
    },
  ],
};

const problem: Problem = {
  id: 'collaborative-editor',
  title: 'Collaborative document editor',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a collaborative document editor like Google Docs. Several people can open the same document, type at the same time and see each other’s cursors, and anyone can look back at or restore an earlier version.',
  concepts: [
    'back-of-the-envelope',
    'real-time-communication',
    'real-time-collaboration',
    'time-and-ordering',
    'consistent-hashing',
    'cqrs-event-sourcing',
    'distributed-locks',
    'storage-types',
  ],
  hints: [
    'Start with two people typing in the same sentence at the same moment. If each save replaces the whole document, [[last write wins|last-write-wins]] (LWW) and one person’s typing vanishes. What should travel over the network instead, and who decides the order?',
    'Each document needs exactly one place that puts its edits in order and remembers them. Think about how every editor of a document reaches the same server over a long-lived connection, what that server must save before it says “got it”, and how another server rebuilds the document if that one dies.',
    'One shape that works: browsers hold a [[WebSocket|websocket]] to a collab server chosen by hashing the document identifier (ID); that server orders edits with [[operational transformation|operational-transformation]] (OT) and appends each to a per-document operation log before acknowledging it, saving a [[snapshot|snapshot]] every few hundred operations. Cursors travel on the same socket but live only in memory, and history is the log plus older snapshots.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many people edit one document at the same time, and how large do documents get?',
      why: 'Most documents have one to three people in them at once, and a few have hundreds of viewers. Assume up to about 100 editors and a few megabytes of text per document (ballpark): one server can then hold a document in memory and order all its edits, so you split the work by document, not by user.',
    },
    {
      q: 'Must editing work offline for hours and merge later?',
      why: 'If a dropped connection of a few minutes is the worst case, a server that orders every edit is simplest. Long offline sessions favor a [[conflict-free replicated data type|crdt]] (CRDT), whose edits merge in any order without a server deciding.',
    },
    {
      q: 'Is it plain text, or rich text with formatting, comments, tables and images?',
      why: 'Formatting adds operations on ranges, and comments are anchored to text that keeps moving, so anchors need the same care as cursors. Images go to [[object storage|object-storage]], and the document holds only a reference to each.',
    },
    {
      q: 'How far back must version history go, and how fine-grained must it be?',
      why: 'Every keystroke forever means an operation log of hundreds of terabytes a year (ballpark). Full detail for a month, then hourly checkpoints and named versions kept forever, keeps history useful at a small fraction of that.',
    },
    {
      q: 'How quickly must other people see my typing?',
      why: 'A target of about 200 ms (ballpark) rules out [[polling|polling]] and calls for persistent connections and ordering in memory. Your own keystrokes must appear instantly, so the editor applies them locally before the server has seen them: an [[optimistic update|optimistic-update]].',
    },
    {
      q: 'Who can open a document, and can access change while it is open?',
      why: 'Roles such as viewer, commenter and editor are checked when a connection opens, and edits from viewers are refused. If access can be revoked, the server must close that person’s live connection at once rather than wait for the next reconnect.',
    },
  ],
  requirements: {
    functional: [
      'Create a document and edit it as rich text: typing, deleting and formatting.',
      'Several people edit at once; each sees the others’ changes within a fraction of a second, and no one’s keystrokes are lost.',
      'Every copy ends up identical once it has received the same edits ([[convergence|convergence]]), even when two people type in the same spot.',
      'Show who is in the document, with each person’s cursor and selection: [[presence|presence]].',
      'Version history: browse earlier versions by time, see who changed what, name a version and restore one.',
      'Keep typing through a dropped connection of a few minutes, then catch up on reconnect.',
    ],
    nonFunctional: [
      'Your own keystrokes appear instantly; other people’s appear within about 200 ms for 99% of edits on a good connection (ballpark).',
      'Durable: once the server acknowledges an edit, it is never lost, even if that server crashes a moment later.',
      'Available: a server failure pauses its documents for seconds, not minutes, and loses no acknowledged edit; around 99.9% for editing (a ballpark target).',
      'Scale: about 10 million daily users and 1 million people connected at peak (ballpark).',
    ],
    outOfScope: [
      'Accounts, login and billing: assume each connection arrives with a verified user identifier.',
      'Search across documents, spelling and grammar suggestions, and export to other file formats.',
      'Spreadsheets, slides, and voice or video calls inside a document.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily users', value: '10 million (ballpark)' },
      { label: 'Operations each user sends a day', value: 'about 600: ten minutes of typing, with keystrokes batched into roughly one operation a second' },
      { label: 'Other people who receive each operation', value: 'about 2 on average; most documents have one to three people in them' },
      { label: 'Bytes stored per operation', value: 'about 100: the change, its revision, author and time' },
      { label: 'People connected at the busiest moment', value: 'about 1 million, a tenth of daily users' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'In the calculator', value: '1,800 actions per user (600 operations sent, each delivered to 2 others), so 2 reads per write; its storage line is the raw log before compaction' },
    ],
    steps: [
      { label: 'Operations per second', math: '10⁷ users × 600 = 6 × 10⁹ a day; 6 × 10⁹ ÷ 10⁵ seconds', result: '≈ 60,000 a second, 120,000 at peak' },
      { label: 'Edits delivered to others', math: '120,000 × 2 other people', result: '≈ 240,000 messages a second at peak' },
      { label: 'Presence messages', math: '10⁶ connected × 1 in 5 moving a cursor × 2 updates a second × 2 people who see it', result: '≈ 800,000 a second: more than the edits, so throttle it and never store it' },
      { label: 'Collab servers', math: '10⁶ connections ÷ about 50,000 per server (ballpark)', result: '≈ 20 for connections alone; plan about 50 for processing and failover headroom' },
      { label: 'Operation log', math: '6 × 10⁹ × 100 bytes = 600 GB a day; × 30 days; × 365 days', result: '≈ 18 TB at full detail for 30 days, ≈ 220 TB a year if never compacted' },
      { label: 'Documents in memory', math: '500,000 open documents at peak × about 100 KB each', result: '≈ 50 GB across the fleet: about 1 GB per server' },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 1_800, readsPerWrite: 2, objectBytes: 100, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'POST /v1/docs  { title }  →  201 { docId }',
      description:
        'Creates an empty document at revision 0 and makes the caller its owner. The metadata database stores the title and sharing settings; the text itself lives in snapshots and the operation log.',
    },
    {
      signature: 'GET /v1/docs/{docId}/live  →  101 Switching Protocols (WebSocket)',
      description:
        'Opens the live session. The router sends it to the document’s collab server, which checks the caller’s role and replies with `{ type: "init", revision, content, people }`.',
    },
    {
      signature: 'send { type: "op", clientId, seq, baseRevision, ops }  →  { type: "ack", seq, revision }',
      description:
        'An edit, sent over the socket. `baseRevision` is the last revision the client had seen, so the server knows which operations to transform it against, and `clientId` with `seq` lets a resent operation be applied only once. The other people in the document receive `{ type: "op", revision, authorId, ops }`.',
    },
    {
      signature: 'send { type: "cursor", anchor, head }  (no reply)',
      description:
        'Presence: where this person’s cursor and selection are, sent at most a few times a second (ballpark). The server batches cursor changes and forwards them to everyone else in the document; nothing is stored.',
    },
    {
      signature: 'GET /v1/docs/{docId}/versions?before=…  →  200 { versions: [{ revision, time, authors, name? }] }',
      description: 'The history panel’s list. Recent entries come from the operation log, older ones from checkpoints.',
    },
    {
      signature: 'POST /v1/docs/{docId}/restore  { revision }  →  200 { newRevision }',
      description: 'Restores an old version by applying one new operation on top of the current text, so the restore is itself a version that can be undone.',
    },
  ],
  dataModel: [
    {
      entity: 'Document',
      fields: ['doc_id (primary key)', 'title', 'owner_id', 'created_at', 'updated_at'],
      store: 'Relational database such as PostgreSQL, sharded by document when it outgrows one machine',
      why: 'Small rows that rarely change, and queries such as “documents shared with me”, suit a relational database. Edits never touch this table on their way through.',
    },
    {
      entity: 'Permission',
      fields: ['doc_id', 'user_id', 'role: owner | editor | commenter | viewer'],
      store: 'The same relational database',
      why: 'Checked once when a connection opens and again whenever it changes: revoking a role closes that person’s live connection.',
    },
    {
      entity: 'Operation',
      fields: ['doc_id (partition key)', 'revision (sort key)', 'author_id', 'client_id, client_seq', 'ops: the encoded change', 'created_at'],
      store: 'Wide-column or key-value store with conditional writes, such as Cassandra or DynamoDB, three copies of each row',
      why: 'The log is append-only and read in order, one document at a time, so the document is the partition and the revision the sort key. About 600 GB a day arrive (ballpark), so it must spread across many machines.',
    },
    {
      entity: 'Log head',
      fields: ['doc_id (partition key)', 'head_revision', 'owner_number'],
      store: 'The same store, in the same partition as the document’s operations',
      why: 'Every append is one conditional write: add revision N + 1 only if the head is N and the owner number matches. That keeps one straight line of history per document, even if two servers both think they own it.',
    },
    {
      entity: 'Snapshot',
      fields: ['doc_id', 'revision', 'object_key', 'kind: periodic | hourly | named', 'name (or null)'],
      store: 'Index rows in the key-value store; document bodies in object storage such as S3',
      why: 'Bodies are written once and read whole, which is what object storage is for, and it costs less per gigabyte than database storage. The index finds the newest snapshot at or before any revision or time.',
    },
    {
      entity: 'Presence',
      fields: ['doc_id', 'user_id', 'cursor: { anchor, head }', 'color', 'last_seen'],
      store: 'Memory of the collab server that owns the document; never written to disk',
      why: 'It changes several times a second and is worthless seconds later. Every editor of a document already talks to its owner, so the owner keeps it, and an entry not refreshed within its [[time to live|ttl]] (TTL) of about 30 seconds (ballpark) is dropped.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Let two people edit one document at the same time without losing either person’s typing.',
      diagram: v1,
      explanation:
        'One server and one database are enough for a team. Sending small operations instead of whole documents, and letting one server put them in order, is the core idea, and it survives every later stage. What breaks first is scale: one machine holds only so many connections and open documents, and the log grows without end.',
    },
    {
      title: 'v2: It scales',
      solves: 'About a million connected people and 120,000 operations a second at peak (ballpark), with every editor of a document still meeting in one place.',
      diagram: v2,
      explanation:
        'Splitting by document keeps the hard part, ordering, on one machine per document, so collab servers never coordinate with each other about edits. The log is the source of truth and snapshots are a shortcut into it, which makes collab servers replaceable: any server can rebuild any document. Thanks to the hash ring, adding a server moves only a small share of documents.',
    },
    {
      title: 'v3: Version history',
      solves: 'People want to see the document as it was on Tuesday and bring it back, but keeping every keystroke forever would cost about 220 TB a year (ballpark).',
      diagram: v3,
      explanation:
        'History falls out of keeping the log: any past version is a snapshot plus a replay. Compaction trades detail for space as history ages, a product decision worth stating out loud. Because a restore is a new operation, history only ever grows forward, and live editing never fights with it.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A collab server can crash or freeze at any moment, holding hundreds of open documents and their editors’ unsaved typing.',
      diagram: v4,
      explanation:
        'Every acknowledged edit is in the log, every unacknowledged one is still queued in its editor, and the owner number stops a frozen server from writing after it has been replaced. Editors see a pause of 10 to 20 seconds (ballpark) and lose nothing. A shorter lease shortens the pause but risks replacing servers that were only slow.',
    },
  ],
  deepDives: [
    {
      title: 'Merging simultaneous edits: OT or CRDT',
      problem:
        'Two people type in the same paragraph within a few hundred milliseconds of each other. Both edits must survive, land where each author meant, and leave every copy identical. Positions shift under every insert and delete, so an edit described by position goes stale the moment someone types before it.',
      options: {
        caption: 'Four ways to handle simultaneous edits',
        rows: [
          {
            option: 'Whole document, last write wins',
            goodAt: 'Trivial: save the text with a timestamp.',
            badAt: 'Throws away one person’s typing whenever two saves overlap, and [[clock skew|clock-skew]] can even keep the older one.',
            pickWhen: 'Never for shared text; fine for a field one person edits at a time, such as the title.',
          },
          {
            option: 'Lock a paragraph while someone types',
            goodAt: 'No merging at all, and easy to explain.',
            badAt: 'Others wait, and a lock held by a laptop that went to sleep blocks everyone until it expires.',
            pickWhen: 'Content that can’t be merged, such as an embedded drawing.',
          },
          {
            option: 'Operational transformation, ordered by a server',
            goodAt:
              'Small operations and little extra data. With one server ordering each document, a client only transforms against operations it hasn’t seen yet, which keeps the rules manageable.',
            badAt: 'Rules for every pair of operation types, including formatting and undo, are hard to get right, and offline edits must be transformed against everything they missed.',
            pickWhen: 'Editors are online nearly all the time, and a server sits in the path anyway.',
          },
          {
            option: 'Sequence CRDT, such as Yjs or Automerge',
            goodAt: 'Every character has a permanent identity, so edits merge in any order: long offline sessions and peer-to-peer sync come naturally.',
            badAt:
              'Identities and [[tombstones|tombstone]] for deleted text add overhead, though good libraries store a run of characters typed together as one item. Rich text and undo still need care.',
            pickWhen: 'Offline-first apps, peer-to-peer sync, or no server in the merge path.',
          },
        ],
      },
      recommendation:
        'Use server-ordered OT here: every edit passes through the document’s owner anyway, for ordering, permissions and history, and most editing happens online. Name when the alternative wins: if hours of offline editing become a requirement, a CRDT is the better base, and a central server can still relay and store its updates. Either way, never trust device clocks to order edits, and transform cursors and comment anchors exactly like text.',
    },
    {
      title: 'One owner per document',
      problem:
        'Server-ordered editing needs exactly one server deciding the order of each document’s edits. Servers join, leave, crash and pause, so for a few seconds two of them may each believe they own the same document. If both accept edits, the history forks and the copies stop converging.',
      options: {
        caption: 'Ways to decide which server owns a document',
        rows: [
          {
            option: 'Any server, ordering through the database',
            goodAt: 'Collab servers stay [[stateless|stateless]]: each edit is a conditional write on the document’s head revision.',
            badAt:
              'Every keystroke becomes a database round trip that fails and retries under contention, and editors on different servers need a [[publish/subscribe|publish-subscribe]] channel to see each other’s edits.',
            pickWhen: 'Low edit rates, such as forms or task lists changed now and then.',
          },
          {
            option: '[[Consistent hashing|consistent-hashing]] on the document ID',
            goodAt:
              'No state per document: every router computes the same owner from the live server list, and adding a server moves only a small share of documents.',
            badAt: 'While the list is changing, two servers can briefly both claim a document, and one hot document can’t be moved off a busy server by itself.',
            pickWhen: 'The default for placing documents, paired with a fence in the log.',
          },
          {
            option: 'Directory of owners, with leases',
            goodAt: 'Exact control: hot documents can be moved, and a server can be drained one document at a time.',
            badAt: 'An entry for every open document sits on the connect path and must itself be highly available, and a lease alone doesn’t stop a paused server from writing.',
            pickWhen: 'Documents must be placed by load, not just by hash.',
          },
        ],
      },
      recommendation:
        'Place documents with consistent hashing over a server list kept in a coordination service, plus a small override table for moving the occasional hot document. Make the log the real guard: each takeover raises the document’s owner number with a [[compare-and-set|compare-and-set]] on the log head, and every append carries that number, so a paused or cut-off server’s late writes are rejected. Figma has described a similar shape: one server process per multiplayer document, with the server as the authority.',
    },
    {
      title: 'Storing documents and their history',
      problem:
        'Loading a document must be fast, every acknowledged edit must be durable, and history must reach back months. Keeping every keystroke forever costs about 220 TB a year (ballpark), while keeping only the latest text loses history altogether.',
      options: {
        caption: 'Four ways to store a living document',
        rows: [
          {
            option: 'Save the whole document on every change',
            goodAt: 'Simple, and loading reads one object.',
            badAt: 'Rewrites megabytes per keystroke, and history means keeping a full copy per save.',
            pickWhen: 'Small documents saved now and then; never for live editing.',
          },
          {
            option: 'Operation log only, kept forever',
            goodAt: 'Perfect history: this is [[event sourcing|event-sourcing]], where any version is a replay of the log.',
            badAt: 'Opening a years-old document replays millions of operations, and storage grows without end.',
            pickWhen: 'Short-lived documents, or audits that demand every change forever.',
          },
          {
            option: 'Snapshots plus a log, thinned with age',
            goodAt: 'Fast loads (a snapshot plus a few hundred operations), full detail where people look most, and bounded storage.',
            badAt: 'More moving parts: a snapshot writer, a compactor, and a decision about how coarse old history becomes.',
            pickWhen: 'The default for a collaborative editor.',
          },
          {
            option: 'Diffs between saved versions',
            goodAt: 'Compact history at the granularity people browse.',
            badAt: 'Loses who typed what between saves, and live edits still need a log for durability.',
            pickWhen: 'Wikis and documents edited by one person at a time.',
          },
        ],
      },
      recommendation:
        'Keep the log as the source of truth for the last 30 days, snapshot every 500 operations or so, and let a compactor fold older history into hourly checkpoints plus every named version, kept forever. Partition the log by document, so one document’s history is one sorted range. Keep snapshot bodies in object storage and only their index in the database.',
    },
    {
      title: 'Presence and very busy documents',
      problem:
        'Cursor updates outnumber edits: about 800,000 presence messages a second at peak against 240,000 edit deliveries (ballpark). A few documents, such as notes for a live event, may also have thousands of people in them, all served by one owner.',
      options: {
        caption: 'Ways to carry cursors and fan out edits',
        rows: [
          {
            option: 'Forward every cursor move to everyone',
            goodAt: 'Simplest, and cursors feel perfectly live.',
            badAt: 'Messages grow with the square of the people in a document: 100 people moving cursors means about 10,000 deliveries per round.',
            pickWhen: 'Small documents only.',
          },
          {
            option: 'Throttle and batch in the owner',
            goodAt: 'Clients send at most a few updates a second, and the owner sends one combined presence message per document every 100 ms or so (ballpark).',
            badAt: 'Cursors move in small jumps, and the owner still sends to every connection.',
            pickWhen: 'The default for documents of up to about 100 people (ballpark).',
          },
          {
            option: 'Read-only relays for viewers',
            goodAt: 'The owner sends each operation once per relay, and relays [[fan it out|fan-out]] to thousands of viewers.',
            badAt: 'Another tier to run, and viewers see changes a few milliseconds later.',
            pickWhen: 'Documents with hundreds or thousands of viewers.',
          },
          {
            option: 'A separate presence service',
            goodAt: 'Presence scales and fails on its own, and can show who is online across many documents.',
            badAt: 'An extra hop, and cursor positions still have to be transformed against edits that only the owner sees.',
            pickWhen: 'Presence spans many documents, such as a workspace-wide list of who is online.',
          },
        ],
      },
      recommendation:
        'Keep presence in the owner’s memory, throttled and batched, with [[heartbeats|heartbeat]] and a short expiry to catch people who vanish. Beyond about 100 people (ballpark), let new arrivals join as viewers on relays, show the first few dozen cursors and summarize the rest as a count. Presence is the first thing to [[shed|load-shedding]] under load: drop cursor updates long before edits.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 1.2 million operations a second and 10 million connected people at peak (ballpark).',
      impact: 'Collab servers run short of connections, memory and processing time, and the operation log must absorb ten times the appends.',
      mitigation:
        'Add collab servers, each of which takes over only a small share of documents, and add log partitions. Group appends: an owner can write all of a document’s operations from the last few milliseconds in one conditional write.',
    },
    {
      scenario: '100× load on one document: notes for a live event with 10,000 people in them.',
      impact: 'One owner must transform every edit and send it, plus every cursor, to 10,000 connections; its network and processors saturate.',
      mitigation:
        'Cap live editors at about 100 (ballpark), move everyone else to read-only relays, batch updates to viewers, and stop sending cursors beyond the first few dozen people.',
    },
    {
      scenario: 'A collab server crashes.',
      impact:
        'Its documents pause for 10 to 20 seconds (ballpark), the lease timeout plus loading time. Editors keep typing locally, and no acknowledged edit is lost, because each was logged first.',
      mitigation:
        'Takeover with a raised owner number, clients resending queued operations with sequence numbers, and recent snapshots so loads are quick. Alert on takeovers per minute: many at once points to a bigger problem.',
    },
    {
      scenario: 'A collab server freezes for 30 seconds, then wakes up.',
      impact: 'Its lease has expired and another server owns its documents, but some editors may still be connected to it and typing.',
      mitigation:
        'Its next append carries a stale owner number and is rejected, so it drops the document and closes those sockets. The editors reconnect, resend and lose nothing.',
    },
    {
      scenario: 'A partition of the operation log is slow or loses its leader.',
      impact:
        'Appends for the documents on that partition stall, so acknowledgments stop and editors’ queues grow, while editing everywhere else carries on.',
      mitigation:
        'Use a replicated store with automatic [[failover|failover]]. Owners hold a bounded queue and tell editors they are falling behind; past a limit, the document turns read-only with a clear message instead of accepting edits it can’t save.',
    },
    {
      scenario: 'The coordination service holding the server list goes down.',
      impact:
        'No server can join, leave or take over, but routers keep the last list they saw and every owner keeps serving, since the log, not the lease, guards its writes.',
      mitigation:
        'Run it as three or five nodes across [[availability zones|availability-zone]]. While it is down, the only cost is that a crash can’t be recovered from until it returns, so alert on it at once.',
    },
    {
      scenario: 'An editor’s laptop comes back online after a week with 2,000 queued operations.',
      impact: 'Transforming them against a week of other people’s edits is slow and may give a surprising result, because the text around them has changed.',
      mitigation:
        'Transform the queue in one batch on the server, not one operation at a time. Past a limit, such as a day offline, or if the log was compacted past their base revision, save the offline text as a copy for the user to merge, and say so on screen.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Sends edits as small operations over a persistent connection instead of saving the whole document, and explains why whole-document saves lose work.',
        'Shows local edits at once and sends cursors separately from document changes.',
        'Stores documents and their versions durably, with a clear way to load one.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Explains OT or a CRDT well enough to walk through two simultaneous inserts and show that both copies converge.',
        'Routes every editor of a document to one server and explains why one order per document makes merging tractable.',
        'Uses an operation log plus snapshots for loading and history, sized from the estimate.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Covers owner failure end to end: lease expiry, a fencing token checked by the log, resends deduplicated by sequence number, and what editors see meanwhile.',
        'Separates presence from document state and sizes it: cursor traffic outweighs edits, so it is throttled, batched and never stored.',
        'Plans for hot documents and long offline sessions, and compares OT with CRDTs in terms of the product: offline use, peer-to-peer sync and data overhead.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The collab server that owns a busy document just crashed. What do the editors see?',
      a: 'A “reconnecting” notice for 10 to 20 seconds (ballpark), while their typing keeps working, because each editor queues unacknowledged operations locally. When the lease expires, the next server on the ring raises the owner number, loads the latest snapshot and replays the log. Editors reconnect and resend with their sequence numbers, so nothing is lost or applied twice.',
    },
    {
      q: 'One person bolds a sentence while another deletes half of it. What happens?',
      a: 'The server orders the two operations and transforms the second against the first. If the delete came first, the bold applies only to the text that still exists; if the bold came first, the delete removes bold text. Either way every copy ends up the same, which is the real promise: convergence and no lost work, not a perfect guess at what both people wanted.',
    },
    {
      q: 'How does undo work when several people are editing?',
      a: 'Undo reverses only your own last operation, never someone else’s. The editor computes the inverse of that operation, transforms it against everything that happened after it, and sends the result as a new operation. Undoing by restoring an old snapshot would wipe out other people’s work.',
    },
    {
      q: 'Someone edited offline on a six-hour flight. How do you merge their changes?',
      a: 'The client sends its queue tagged with the revision it was based on, and the server transforms the whole queue in one batch against everything since. Six hours is fine while the log still holds that range; past a limit, I save their text as a copy and let them merge it. If long offline sessions are common, that is the argument for a CRDT, which merges in any order.',
    },
    {
      q: 'A document has 5,000 people watching live notes during a launch event. What breaks first?',
      a: 'The owner’s outgoing bandwidth and processors: every edit and every cursor move goes to 5,000 connections. I cap editors at about 100, move everyone else to read-only relays that receive each operation once and fan it out, batch updates to viewers every few hundred milliseconds, and show cursors for only the first few dozen people.',
    },
    {
      q: 'How would you serve editors on different continents?',
      a: 'Each document still needs one owner, so I place it in its [[home region|home-region]], the region of its most active editors, and route everyone there. Editors on another continent see others’ edits about 100 to 200 ms later (ballpark), while their own typing still appears at once. I copy the log to a second region asynchronously for disaster recovery, accepting that the last second or so of edits could be lost if a whole region fails.',
    },
  ],
  rubric: [
    { item: 'Asked about editors per document, offline needs and history depth, then estimated operations, connections and log size', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Sent small operations, not whole documents, and merged simultaneous edits with OT or a CRDT, showing how copies converge', weight: 25, lessonId: 'real-time-collaboration' },
    { item: 'Used persistent connections, applied local edits optimistically and resent queued edits after reconnecting', weight: 10, lessonId: 'real-time-communication' },
    { item: 'Gave each document one owner, routed by document ID, and explained what moves when servers join or leave', weight: 15, lessonId: 'consistent-hashing' },
    { item: 'Logged each operation before acknowledging it, with snapshots for loading and compaction for history', weight: 15, lessonId: 'cqrs-event-sourcing' },
    { item: 'Handled a crashed or frozen owner with leases, a fencing token on the log and deduplicated resends', weight: 15, lessonId: 'distributed-locks' },
    { item: 'Kept presence in memory, throttled and expiring, and planned for documents with thousands of viewers', weight: 10, lessonId: 'real-time-collaboration' },
  ],
};

export default problem;
