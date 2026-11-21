import type { DiagramSpec, Problem } from '../types';

/** v1: whole files through one server; the other device polls. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'paths and versions', x: 1, y: 0 },
    { id: 'laptop', type: 'client', label: 'Laptop', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 1 },
    { id: 'phone', type: 'client', label: 'Phone', x: 2, y: 1 },
    { id: 'store', type: 'objectStore', label: 'File storage', sublabel: 'one object per file', x: 1, y: 2 },
  ],
  edges: [
    { id: 'laptop-app', from: 'laptop', to: 'app', kind: 'sync' },
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-store', from: 'app', to: 'store', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The user edits one slide of a 20 MB deck on the laptop. The sync app uploads the whole file to the **app server**, which saves it in **file storage** and records its path, size and new version number in the **database**.',
      flow: ['laptop-app', 'app-store', '<app-store', 'app-db', '<app-db', '<laptop-app'],
      notes: [{ target: 'store', text: 'whole 20 MB' }],
    },
    {
      caption:
        'Meanwhile the phone asks the app server “anything new since version 41?” every 30 seconds ([[polling|polling]]). Almost every answer is “no”, which adds up to a lot of wasted requests across millions of devices.',
      flow: ['phone-app', 'app-db', '<app-db', '<phone-app'],
      notes: [{ target: 'phone', text: 'every 30 s' }],
    },
    {
      caption:
        'This time there is news, and the phone downloads the whole 20 MB file again, though only one slide changed. Whole files in both directions and constant polling are where v1 breaks.',
      flow: ['phone-app', 'app-store', '<app-store', '<phone-app'],
      notes: [{ target: 'app', text: '20 MB each way', tone: 'alert' }],
    },
  ],
};

/** v2: chunks named by hash, a metadata service with a change log, and long polls for notices. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'laptop', type: 'client', label: 'Laptop', x: 0, y: 0 },
    { id: 'chunkStore', type: 'objectStore', label: 'Chunk storage', sublabel: 'named by hash', x: 1, y: 0 },
    { id: 'meta', type: 'service', label: 'Metadata service', x: 1, y: 1 },
    { id: 'phone', type: 'client', label: 'Phone', x: 2, y: 1 },
    { id: 'metaDb', type: 'sqlDb', label: 'Metadata store', sublabel: 'sharded by namespace', x: 1, y: 2 },
    { id: 'notify', type: 'service', label: 'Notification service', sublabel: 'holds long polls', x: 2, y: 2 },
  ],
  edges: [
    { id: 'laptop-meta', from: 'laptop', to: 'meta', kind: 'sync' },
    { id: 'laptop-chunkStore', from: 'laptop', to: 'chunkStore', kind: 'sync', label: 'new chunks' },
    { id: 'meta-metaDb', from: 'meta', to: 'metaDb', kind: 'sync' },
    { id: 'metaDb-notify', from: 'metaDb', to: 'notify', kind: 'async', label: 'changes' },
    { id: 'phone-notify', from: 'phone', to: 'notify', kind: 'sync' },
    { id: 'phone-meta', from: 'phone', to: 'meta', kind: 'sync' },
    { id: 'phone-chunkStore', from: 'phone', to: 'chunkStore', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The laptop splits the edited 20 MB deck into 4 MB chunks (ballpark) and hashes each one. It sends the five hashes to the **metadata service**, which checks them against the user’s chunks and answers that only one is new: the chunk holding the changed slide.',
      flow: ['laptop-meta', 'meta-metaDb', '<meta-metaDb', '<laptop-meta'],
      notes: [{ target: 'laptop', text: '5 chunks, 1 new' }],
    },
    {
      caption:
        'The laptop uploads just that chunk to **chunk storage**, under a name that is its own hash, so identical chunks are stored once. 4 MB moves instead of 20 MB.',
      flow: ['laptop-chunkStore', '<laptop-chunkStore'],
    },
    {
      caption:
        'Then it commits the new version: the path, the list of five chunk hashes and the version it started from. The **metadata store** saves the version and appends an entry to the folder’s change log in the same [[transaction|transaction]], so the two can never disagree.',
      flow: ['laptop-meta', 'meta-metaDb', '<meta-metaDb', '<laptop-meta'],
      notes: [{ target: 'metaDb', text: 'version 42' }],
    },
    {
      caption:
        'The phone keeps a request open at the **notification service**. The new change log entry wakes it, and the phone gets a short answer: “this folder changed”, with no file data at all.',
      flow: ['metaDb-notify', { edge: 'phone-notify', reverse: true, tag: 'changed' }],
    },
    {
      caption:
        'The phone asks the metadata service for every change since its saved cursor, sees one file at version 42, and downloads only the chunk it lacks. It rebuilds the file locally, then opens a new long poll.',
      flow: ['phone-meta', '<phone-meta', 'phone-chunkStore', '<phone-chunkStore', 'phone-notify'],
    },
  ],
};

/** v3: two devices commit against the same base version; the metadata store referees. */
const v3: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'laptop', type: 'client', label: 'Laptop', sublabel: 'was offline', x: 0, y: 0 },
    { id: 'meta', type: 'service', label: 'Metadata service', x: 1, y: 0 },
    { id: 'metaDb', type: 'sqlDb', label: 'Metadata store', x: 2, y: 0 },
    { id: 'phone', type: 'client', label: 'Phone', x: 0, y: 1 },
  ],
  edges: [
    { id: 'laptop-meta', from: 'laptop', to: 'meta', kind: 'sync' },
    { id: 'meta-metaDb', from: 'meta', to: 'metaDb', kind: 'sync' },
    { id: 'phone-meta', from: 'phone', to: 'meta', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Both devices start from version 42 of `budget.xlsx`. The laptop is offline on a plane; the phone edits the file and commits first, and since the version it started from is still current, the commit succeeds as version 43.',
      flow: ['phone-meta', 'meta-metaDb', '<meta-metaDb', '<phone-meta'],
      notes: [{ target: 'metaDb', text: 'now version 43' }],
    },
    {
      caption:
        'The laptop lands and commits its own edit, also based on 42. The **metadata store** applies a commit only if the file is still at the version it names ([[compare-and-set|compare-and-set]]), so it refuses, and the laptop gets `409 Conflict` with the current version.',
      flow: ['laptop-meta', 'meta-metaDb', { edge: 'meta-metaDb', reverse: true, tag: 'refused' }, { edge: 'laptop-meta', reverse: true, tag: '409' }],
    },
    {
      caption:
        'Neither edit may be lost. The laptop downloads version 43 and commits its own edit beside it as a new file, `budget (laptop’s conflicted copy).xlsx`. Its chunks are already uploaded, so the copy costs one metadata write.',
      flow: ['laptop-meta', 'meta-metaDb', '<meta-metaDb', '<laptop-meta'],
      notes: [{ target: 'laptop', text: 'keeps both' }],
    },
    {
      caption:
        'On its next sync the phone receives the conflicted copy as a new file, so the person sees both versions and merges them. Every version stays in history for 30 days (ballpark) as a list of chunk hashes, so either can be restored without uploading anything.',
      flow: ['phone-meta', '<phone-meta'],
      notes: [{ target: 'phone', text: 'sees both files' }],
    },
  ],
};

/** v4: what each failure does to sync. One metadata shard is drawn. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'notify', type: 'service', label: 'Notification servers', sublabel: 'many copies', x: 1, y: 0 },
    { id: 'devices', type: 'client', label: 'Devices', x: 0, y: 1 },
    { id: 'meta', type: 'service', label: 'Metadata service', x: 1, y: 1 },
    { id: 'leader', type: 'sqlDb', label: 'Metadata leader', sublabel: 'takes commits', x: 2, y: 1 },
    { id: 'chunkStore', type: 'objectStore', label: 'Chunk storage', sublabel: 'three zones', x: 0, y: 2 },
    { id: 'follower', type: 'sqlDb', label: 'Metadata follower', sublabel: 'copies commits', x: 2, y: 2 },
  ],
  edges: [
    { id: 'devices-notify', from: 'devices', to: 'notify', kind: 'sync' },
    { id: 'devices-meta', from: 'devices', to: 'meta', kind: 'sync' },
    { id: 'devices-chunkStore', from: 'devices', to: 'chunkStore', kind: 'sync' },
    { id: 'meta-leader', from: 'meta', to: 'leader', kind: 'sync' },
    { id: 'leader-follower', from: 'leader', to: 'follower', kind: 'replication' },
    { id: 'leader-notify', from: 'leader', to: 'notify', kind: 'async' },
    { id: 'meta-follower', from: 'meta', to: 'follower', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every tier runs in several [[availability zones|availability-zone]]. **Chunk storage** keeps each chunk in three zones, and each metadata shard has a **metadata leader** that takes commits and a follower that copies them.',
      focus: ['chunkStore', 'leader-follower'],
      flow: ['devices-meta', 'meta-leader', '<meta-leader', '<devices-meta'],
    },
    {
      caption:
        'One of the **notification servers** dies and drops the long polls it held. Each device reconnects to another server and first asks for every change since its saved cursor, so nothing that changed during the gap is missed. The change log, not the notice, is the source of truth.',
      fail: ['notify'],
      flow: ['devices-meta', 'meta-leader', '<meta-leader', '<devices-meta'],
      notes: [{ target: 'devices', text: 'catch up by cursor' }],
    },
    {
      caption:
        'A shard’s metadata leader dies mid-commit, and within seconds its follower is promoted ([[failover|failover]]). The laptop’s commit timed out, so it retries with the same commit identifier (ID); if the first attempt landed, the new leader returns that version instead of reporting a conflict with itself.',
      fail: ['leader'],
      add: ['meta-follower'],
      flow: ['devices-meta', 'meta-follower', '<meta-follower', '<devices-meta'],
      notes: [{ target: 'follower', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        'Someone adds 500 files to a folder shared by 10,000 people, and every member’s devices are told at once. Each waits a random delay of up to a few seconds before pulling ([[jitter|jitter]]), so the metadata service sees a ramp instead of a spike.',
      flow: ['leader-notify', '<devices-notify', 'devices-meta', '<devices-meta'],
      notes: [{ target: 'notify', text: '10,000 wake-ups' }],
    },
  ],
};

const problem: Problem = {
  id: 'file-sync',
  title: 'File sync',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a file sync service like Dropbox. People keep files in a folder on their laptops and phones, and every change they make on one device shows up on their other devices and in folders they share.',
  concepts: ['storage-types', 'time-and-ordering', 'real-time-communication', 'idempotency', 'consistency-models', 'sharding', 'back-of-the-envelope'],
  hints: [
    'Most edits change a small part of a file, and many files exist in identical copies. What if the unit you upload, store and compare were a piece of a file rather than the whole file?',
    'Keep the bytes apart from the description of a file ([[metadata|metadata]]): a file version can be a list of fingerprints of its pieces, each made with a [[hash function|hash-function]]. Then ask how a device learns that something changed without asking every few seconds, and what happens when two devices change the same file while one is offline.',
    'One shape that works: clients split files into 4 MB chunks named by their hash, upload only chunks the server lacks to [[object storage|object-storage]], and commit each new version, a list of hashes, to a strongly consistent metadata store with a change log per folder. Devices hold a [[long polling|long-polling]] request open to hear about changes, fetch everything since their cursor, and a commit based on an old version becomes a conflicted copy instead of overwriting anyone.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many users and devices, and how much do they change each day?',
      why: 'Assume 50 million daily users with two or three devices each, changing about 10 files a day (ballpark). That gives about 5,000 commits a second and about 250 TB of new data a day, which sizes both the metadata store and the bytes.',
    },
    {
      q: 'How big can files get, and what kinds are common?',
      why: 'Mostly small documents, with some videos and disk images of up to, say, 50 GB (ballpark). Large files force chunked uploads that resume, and edits inside big files are the reason chunks beat whole-file uploads.',
    },
    {
      q: 'Can people share folders and edit the same files?',
      why: 'Sharing turns personal sync into group sync: one change must reach every member’s devices, and two people can edit one file at once. It also makes the folder, often called a namespace, the natural unit of ordering and storage, rather than the user.',
    },
    {
      q: 'What should happen when two devices edit the same file while one is offline?',
      why: 'This sets the conflict policy. Keeping whichever save arrived last silently loses someone’s work, so sync products usually keep both versions and let the person merge them.',
    },
    {
      q: 'How quickly must a change show up on other devices?',
      why: 'Within a few seconds for a device that is online (ballpark) rules out slow polling and calls for a push channel. Offline devices simply catch up from where they left off when they reconnect.',
    },
    {
      q: 'Do we keep old versions and deleted files?',
      why: 'Version history and undelete for 30 days (ballpark) mean old chunk lists must be kept, and a chunk can be deleted only when no version refers to it. That shapes garbage collection and the storage estimate.',
    },
  ],
  requirements: {
    functional: [
      'Files added to the sync folder on one device appear on the user’s other devices, and later edits, renames and deletes follow.',
      'Large files upload and download in pieces that resume after a dropped connection, and an edit uploads only the parts that changed.',
      'Share a folder with other users, whose devices then sync the same files.',
      'When two devices edit the same file before seeing each other’s change, keep both versions and tell the user.',
      'Browse version history, and restore an old version or a deleted file from the last 30 days.',
    ],
    nonFunctional: [
      'Never lose or corrupt a file: every chunk is checked against its hash, and committed data survives the loss of a disk, a server or a zone.',
      'A change appears on other online devices within a few seconds (ballpark).',
      'Efficient: upload only new chunks, and store identical chunks once per user.',
      'Works offline: a device keeps working without a connection and catches up when it reconnects.',
      'Each folder’s metadata is [[strongly consistent|strong-consistency]], so every device applies its changes in the same order.',
      'Scale: about 50 million daily users, 500 million commits and 250 TB of new data a day (ballpark).',
    ],
    outOfScope: [
      'Editing one document together in real time, as an online document editor does.',
      'Previews, search inside files, and the web interface.',
      'Accounts, billing and storage quotas: assume each request arrives with a user identity.',
      'Syncing directly between devices on the same local network.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '50 million (ballpark), with 2 to 3 devices each' },
      { label: 'File changes per user per day', value: '10' },
      { label: 'New data per change, after chunking and deduplication', value: 'about 500 KB on average, since most changed files are small documents' },
      { label: 'Downloads per change', value: 'about 4: the user’s other devices plus people sharing the folder' },
      { label: 'Chunk size', value: '4 MB' },
      { label: 'Files per account', value: 'about 1,000, with about 1 KB of metadata each, across 200 million accounts' },
      { label: 'Devices online at the busiest time', value: 'about 50 million' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'In the calculator', value: 'a commit is a write and a download a read, each moving 500 KB; its storage line counts new chunks only, before copies and old versions' },
    ],
    steps: [
      { label: 'Commits per second', math: '5 × 10⁷ users × 10 = 5 × 10⁸ changes a day; ÷ 10⁵ seconds a day', result: '≈ 5,000 a second, 10,000 at peak' },
      { label: 'Downloads per second', math: '5 × 10⁸ changes × 4 = 2 × 10⁹ a day; ÷ 10⁵ seconds', result: '≈ 20,000 a second, 40,000 at peak' },
      { label: 'New data stored', math: '5 × 10⁸ changes × 500 KB = 250 TB a day; × 365', result: '≈ 90 petabytes a year, before copies and old versions' },
      { label: 'Upload bandwidth', math: '250 TB ÷ 10⁵ seconds = 2.5 GB a second; × 2 for the peak; × 8 bits per byte', result: '≈ 40 gigabits a second in at peak' },
      { label: 'Download bandwidth', math: '4 downloads per change × 40 gigabits a second', result: '≈ 160 gigabits a second out at peak' },
      { label: 'Metadata', math: '2 × 10⁸ accounts × 1,000 files × 1 KB', result: '≈ 200 TB: sharded across many machines' },
      { label: 'Notification servers', math: '5 × 10⁷ open connections ÷ about 100,000 idle connections per server (ballpark)', result: '≈ 500 servers, plus headroom' },
    ],
    calculator: { dau: 50_000_000, actionsPerUser: 50, readsPerWrite: 4, objectBytes: 500_000, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'POST /v1/chunks/check  { namespaceId, hashes: [h1, h2, …] }  →  200 { missing: [h2] }',
      description:
        'Asks which chunks this user has never stored, so the client uploads only those. The answer covers the caller’s own data only; the deduplication deep dive explains why.',
    },
    {
      signature: 'PUT /v1/chunks/{hash}  (up to 4 MB of bytes)  →  201 Created',
      description:
        'Uploads one chunk. The server recomputes the hash and rejects bytes that don’t match, and sending the same chunk twice is harmless because the name is the content ([[idempotent|idempotent]]).',
    },
    {
      signature: 'POST /v1/commit  { namespaceId, path, baseRev, chunkHashes, size, commitId }  →  200 { rev, cursor } | 409 { currentRev }',
      description:
        'Commits a new version of a file as its list of chunk hashes. It succeeds only if the file is still at `baseRev`, and otherwise returns `409 Conflict`. The `commitId` is an [[idempotency key|idempotency-key]], so a retry after a timeout gets the first result.',
    },
    {
      signature: 'GET /v1/changes?namespaceId=…&cursor=…  →  200 { entries: [{ path, rev, chunkHashes, deleted }], cursor, hasMore }',
      description: 'Lists every change in a folder since the device’s cursor, in order. A device that was offline for a week calls it page by page until `hasMore` is false.',
    },
    {
      signature: 'GET /v1/notify?cursors=…  (held open up to 60 s)  →  200 { changed: [namespaceId, …] }',
      description:
        'The long poll. The server answers as soon as any of the device’s folders moves past its cursor, or after about 60 seconds (ballpark) with an empty list. It carries no file data, so a lost answer costs nothing.',
    },
    {
      signature: 'GET /v1/chunks/{hash}  →  200 (bytes)',
      description: 'Downloads one chunk. A chunk never changes, so any cache may keep it for as long as it likes, and the client checks the bytes against the hash.',
    },
  ],
  dataModel: [
    {
      entity: 'Namespace',
      fields: ['namespace_id (shard key)', 'owner_id', 'kind: personal | shared', 'latest_seq: integer'],
      store: 'Relational database such as MySQL, sharded by namespace_id',
      why: 'A namespace is a user’s own root folder or one shared folder, and it is the unit of ordering and of sharding. Keeping everything about one namespace on one shard lets a commit update the file and the change log in a single transaction.',
    },
    {
      entity: 'File version',
      fields: ['namespace_id, path (key)', 'file_id', 'rev: integer', 'chunk_hashes: list of 32-byte hashes', 'size, modified_at', 'deleted: boolean'],
      store: 'The same shard, one row per version, with the latest marked current',
      why: 'A version is just a list of chunk hashes, so a new version of a 1 GB file with one changed chunk costs one 4 MB upload and a row of hashes. Restoring an old version means making its list current again.',
    },
    {
      entity: 'Change log entry',
      fields: ['namespace_id (partition key)', 'seq: increasing integer (sort key)', 'path, rev, operation'],
      store: 'The same shard, appended in the same transaction as the version',
      why: 'A device’s cursor is the last `seq` it applied, so “changes since my cursor” is one range read, in order. Because each namespace’s numbers come from one shard, every device sees that folder’s changes in the same order.',
    },
    {
      entity: 'Chunk',
      fields: ['hash: SHA-256 of the bytes (key)', 'size', 'ref_count', 'storage location'],
      store: 'Bytes in object storage keyed by hash; the index in a key-value store',
      why: 'Naming a chunk by its hash stores identical chunks once ([[deduplication|deduplication]]) and lets any reader verify what it downloaded. The reference count, or a periodic sweep, tells garbage collection when no version uses a chunk anymore.',
    },
    {
      entity: 'Device cursor',
      fields: ['device_id', 'namespace_id', 'cursor: last seq applied'],
      store: 'On the device itself, with a copy on the server',
      why: 'The device decides what it has applied, so after a crash or a week offline it resumes from its own cursor. The server copy tells the notification service which folders each device watches.',
    },
    {
      entity: 'Membership',
      fields: ['namespace_id', 'user_id', 'role: owner | editor | viewer'],
      store: 'The relational database, indexed both ways',
      why: 'Each device watches its user’s own namespace plus every shared one, and every request is checked against this table. Memberships change rarely, so they cache well.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Get a file saved on one device onto another, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One server, one database and one storage bucket are enough for a prototype. It breaks as it grows: every edit moves the whole file both ways, every device polls whether or not anything changed, and two devices saving the same file overwrite each other.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 10,000 commits a second at peak, 250 TB of new data a day and 50 million connected devices (ballpark), without moving whole files or polling.',
      diagram: v2,
      explanation:
        'Chunks named by their hash mean an edit uploads only what changed, and identical data is stored once. The metadata service handles only small requests, while bytes go straight between devices and chunk storage. Devices learn about changes from a long poll and fetch them by cursor, so an idle device costs one open connection.',
    },
    {
      title: 'v3: Edits that collide',
      solves: 'Two devices edit the same file before either sees the other’s change, often because one was offline, and neither edit may be lost.',
      diagram: v3,
      explanation:
        'The metadata store is the single referee: each commit names the version it started from, and only one commit can move a file past that version. The loser keeps its work as a conflicted copy, which is cheap because its chunks are already uploaded.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'Dropped connections, a dead notification server or a dead metadata leader must never lose, duplicate or reorder a change.',
      diagram: v4,
      explanation:
        'Each failure is safe because the truth lives in one place: committed versions and change logs in the metadata store, chunk bytes in replicated storage. Notices are only hints, devices resume from their own cursors, and every retry is idempotent, so the worst case is a delay of seconds.',
    },
  ],
  deepDives: [
    {
      title: 'Chunking: what unit to sync',
      problem:
        'A user edits one slide of a 20 MB deck or appends a line to a 1 GB log file. Uploading the whole file each time wastes bandwidth and time, and storing every version in full wastes space.',
      options: {
        caption: 'Four units of sync',
        rows: [
          {
            option: 'Whole files',
            goodAt: 'Simplest: one upload, one object, nothing to reassemble.',
            badAt: 'Any change sends the whole file again, a failed upload restarts from zero, and versions share nothing.',
            pickWhen: 'Small files only, or a prototype.',
          },
          {
            option: 'Fixed-size chunks, say 4 MB',
            goodAt: 'Easy to compute; an edit in place sends one chunk, uploads resume chunk by chunk, and versions share unchanged chunks.',
            badAt: 'Inserting a few bytes near the start shifts every later boundary, so every later chunk looks new.',
            pickWhen: 'The default for most files, especially ones edited in place.',
          },
          {
            option: 'Content-defined chunks',
            goodAt: 'Boundaries are chosen by a rolling hash of the content itself, so an insertion changes only the chunks around it.',
            badAt: 'More computing on the device, and chunk sizes vary between a minimum and a maximum.',
            pickWhen: 'Large files that grow or change in the middle, such as logs and archives.',
          },
          {
            option: 'Byte-level differences',
            goodAt: 'Sends the smallest possible change, as the rsync tool does.',
            badAt: 'Needs the old version at both ends to compute the difference, and stored versions still need a chunk scheme underneath.',
            pickWhen: 'On top of chunks, for big files with tiny edits.',
          },
        ],
      },
      recommendation:
        'Use chunks of about 4 MB (ballpark) named by a cryptographic hash of their content: fixed-size to start, content-defined if many large files change in the middle. A file version is the ordered list of its chunk hashes, so uploads resume chunk by chunk, versions share unchanged chunks, and the client verifies every chunk it downloads. A small file is a single chunk, which keeps the scheme uniform.',
    },
    {
      title: 'Deduplication: how widely to share chunks',
      problem:
        'Chunks named by hash can be shared, so a chunk that appears in many places is stored once. The question is how widely to share: within one file’s versions, across one user’s files, or across every user.',
      options: {
        caption: 'Three scopes for deduplication',
        rows: [
          {
            option: 'Per file only',
            goodAt: 'No privacy questions, and garbage collection is simple.',
            badAt: 'Saves little: copies of the same file in two folders are stored twice.',
            pickWhen: 'Rarely, since sharing per user costs almost nothing more.',
          },
          {
            option: 'Per user or namespace',
            goodAt: 'Catches copies, moves and old versions, and the client can skip uploading chunks the user already has.',
            badAt: 'Two users who store the same file both pay for it.',
            pickWhen: 'The default: most of the savings, with no leaks between users.',
          },
          {
            option: 'Across all users',
            goodAt: 'The most savings: one copy of a popular file however many users store it.',
            badAt:
              'If “do you already have this hash?” is answered across users, anyone can test whether someone else stores a given file, and a widely shared chunk becomes a [[hot spot|hot-spot]].',
            pickWhen: 'Only inside storage, invisible to clients, and only if the savings justify it.',
          },
        ],
      },
      recommendation:
        'Deduplicate per user or namespace on the client side, so uploads skip chunks the user already has, and answer “missing” only about the caller’s own data. If savings across users matter, deduplicate inside storage where clients can’t observe it, and still make every client upload the bytes. Track a reference count per chunk, or sweep periodically, so unused chunks are deleted after a grace period.',
    },
    {
      title: 'Telling devices about changes',
      problem:
        'About 50 million devices are online at peak (ballpark), and each should hear about a change within seconds. Most of the time nothing has changed, so any design that costs a request per device every few seconds wastes almost all of its work.',
      options: {
        caption: 'Four ways to deliver a change notice',
        rows: [
          {
            option: 'Polling every 30 seconds',
            goodAt: 'Simplest, and works through every network and proxy.',
            badAt: 'At 50 million devices, about 1.7 million requests a second (ballpark), nearly all answered “nothing new”, and changes still take up to 30 seconds.',
            pickWhen: 'Few devices, or as the fallback when nothing else gets through.',
          },
          {
            option: 'Long polling',
            goodAt: 'One open request per device that the server answers the moment something changes; it is a plain web request, so it passes firewalls.',
            badAt: 'Each device reconnects every minute or so, and servers must hold millions of idle connections.',
            pickWhen: 'Desktop clients: a simple default that gets through.',
          },
          {
            option: '[[WebSocket|websocket]]',
            goodAt: 'One long-lived two-way connection with the lowest cost per message.',
            badAt: 'Some networks drop or block long-lived connections, and servers must track which device is on which connection.',
            pickWhen: 'Clients that also need other live features, such as presence or comments.',
          },
          {
            option: 'Mobile [[push notifications|push-notification]]',
            goodAt: 'Reach a phone that is asleep, without keeping the app running.',
            badAt: 'Delivered by the phone maker’s service, with no promise about speed or delivery.',
            pickWhen: 'Phones in the background: a nudge to sync, never the data itself.',
          },
        ],
      },
      recommendation:
        'Hold a long poll or WebSocket open from each desktop client to a notification service, and use mobile push to wake phones. Send only “folder X changed”, never the change itself, and let the device fetch everything since its cursor from the metadata service. Notices are hints: if one is lost or arrives twice, the next sync by cursor still applies every change once, in order.',
    },
    {
      title: 'Detecting and settling conflicts',
      problem:
        'Two devices change the same file before either sees the other’s change, most often because one was offline. The system must notice, and must not lose either edit.',
      options: {
        caption: 'Four conflict policies',
        rows: [
          {
            option: '[[Last write wins|last-write-wins]]',
            goodAt: 'Simple, and the file always has exactly one version.',
            badAt: 'Silently throws away one of two concurrent edits, and comparing device clocks makes it worse ([[clock skew|clock-skew]]).',
            pickWhen: 'Data nobody edits by hand, such as caches or settings.',
          },
          {
            option: 'Version check on commit, keep both',
            goodAt: 'The server is the referee: a commit must name the version it started from, and the loser becomes a conflicted copy, so nothing is lost.',
            badAt: 'The person has to merge the two copies by hand.',
            pickWhen: 'The default for a sync service with one central metadata store.',
          },
          {
            option: '[[Version vectors|version-vector]]',
            goodAt: 'Detect concurrent edits with no central referee, by keeping one counter per device or replica.',
            badAt: 'More metadata per file, and the app still has to settle each conflict it finds.',
            pickWhen: 'Replicas accept writes independently, as when devices sync directly with each other.',
          },
          {
            option: 'Automatic merge',
            goodAt: 'No conflicted copies at all.',
            badAt:
              'Works only for formats the system understands, and needs a merge method built for them, such as a conflict-free replicated data type ([[CRDT|crdt]]).',
            pickWhen: 'Specific formats, such as notes edited inside the product.',
          },
        ],
      },
      recommendation:
        'With one strongly consistent metadata store, give each file a version number and commit with compare-and-set: the first commit wins and the second gets `409 Conflict`. The losing client saves its edit as a conflicted copy beside the winner and tells the user, so no work is lost. Version vectors earn their cost only when replicas accept writes independently, such as devices syncing over a local network.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 100,000 commits a second at peak (ballpark).',
      impact: 'The metadata shards that hold the busiest namespaces run out of write capacity first, and one huge shared folder can’t be split across shards.',
      mitigation: 'Add shards and move namespaces between them, and cap the size of a namespace or split huge team folders into several. Commit a device’s burst of changes in one transaction instead of one per file.',
    },
    {
      scenario: '100× on one folder: a folder shared by 10,000 people changes.',
      impact: 'All the members’ devices wake at once and pull the same change list and the same chunks, a spike of identical requests.',
      mitigation:
        'Devices wait a random delay before pulling, the change list for a folder is cached for a few seconds, and popular chunks are served from a cache or a content delivery network (CDN), which works because a chunk never changes.',
    },
    {
      scenario: 'A notification server dies.',
      impact: 'Its devices’ long polls drop, and changes reach those devices late until they reconnect.',
      mitigation: 'Devices reconnect to another server with [[exponential backoff|exponential-backoff]] and jitter, then sync from their cursors. Nothing is lost, because notices are only hints.',
    },
    {
      scenario: 'A metadata shard’s leader dies.',
      impact: 'Commits to that shard’s namespaces fail for a few seconds, though reads can continue from followers.',
      mitigation: 'Automatic failover, and clients retry commits with the same commit ID, so a commit that landed before the crash is neither applied twice nor reported as a conflict with itself.',
    },
    {
      scenario: 'An upload dies halfway through a 10 GB file.',
      impact: 'Some chunks are stored, but no version points to them yet.',
      mitigation:
        'The client resumes by asking which chunks are still missing. Chunks that no version uses after a grace period, say a week (ballpark), are deleted by [[garbage collection|garbage-collection]].',
    },
    {
      scenario: 'A bad disk or a bug corrupts a stored chunk.',
      impact: 'Every file version that contains that chunk is damaged, possibly across many files at once because of deduplication.',
      mitigation: 'Storage keeps copies in several zones and checks them against their hashes in the background, clients verify every chunk they download, and a bad copy is repaired from a good one.',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'Namespaces whose metadata leader lives there can’t commit, though devices keep working offline.',
      mitigation: 'Replicate metadata and chunks to a second [[region|region]] and fail over. Devices queue their local changes and commit them when service returns, turning any collisions into conflicted copies.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates file bytes from metadata, keeps bytes in object storage, and draws upload and download paths that work.',
        'Notices that re-sending whole files is wasteful and suggests splitting files into chunks.',
        'Gives devices some way to learn about changes, even if it starts as polling.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Names chunks by hash, uploads only missing chunks, and describes a version as a list of chunk hashes.',
        'Uses a change log with a cursor per device, and long polling or WebSockets instead of tight polling.',
        'Detects conflicts with a version check on commit and keeps both copies instead of overwriting.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Explains why metadata must be strongly consistent per folder, shards it by namespace, and deals with the huge shared folder.',
        'Treats notices as hints and makes commits and chunk uploads idempotent, so retries and reconnects are always safe.',
        'Raises the privacy cost of deduplicating across users, garbage collection of unused chunks, and checking chunks end to end.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A user inserts one paragraph at the start of a 500 MB file. How much do you upload?',
      a: 'With fixed-size chunks, every boundary after the insertion shifts, so nearly all 125 chunks look new and most of the file goes up again. With content-defined chunks, boundaries follow the content, so only the chunk or two around the insertion change. That is why I’d use content-defined chunks for large files that change in the middle.',
    },
    {
      q: 'Two people edit the same spreadsheet in a shared folder at the same time. What happens?',
      a: 'Both commits name version 42 as their base. The first to reach the metadata store becomes version 43, and the second fails the version check with `409 Conflict`. That client saves its edit as a conflicted copy next to the file and tells its user, so both edits survive.',
    },
    {
      q: 'A laptop was offline for a month. How does it catch up?',
      a: 'It asks for changes since its saved cursor and pages through them in order, then downloads only the chunks it lacks. If its cursor is older than the change log keeps, the server tells it to resync fully by comparing its whole local tree with the current listing. Edits it made offline are committed afterwards, and any that collide become conflicted copies.',
    },
    {
      q: 'Can deduplication leak information between users?',
      a: 'Yes, if the server tells a client that a chunk already exists because another user uploaded it: anyone could then test whether a specific file is stored by someone. I deduplicate per user on the client side and, if I deduplicate across users at all, do it inside storage, where clients can’t observe it.',
    },
    {
      q: 'The notification service has been down for ten minutes. What do users notice?',
      a: 'Changes reach other devices late, because nothing tells them to sync. Devices fall back to polling every few minutes with jitter, so changes still arrive, and when the service returns they reconnect and sync from their cursors. Nothing is lost, because notices carry no data.',
    },
    {
      q: 'How do you delete chunks safely when people delete files?',
      a: 'A chunk can go only when no version anywhere refers to it, including versions kept for 30 days of history. I keep a reference count per chunk, or periodically mark every chunk still in use and sweep the rest. A grace period makes sure an upload still in progress isn’t swept before it commits.',
    },
  ],
  rubric: [
    { item: 'Estimated commits, data volume and connected devices, and sized the metadata store, storage and notification servers from them', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Split files into chunks named by hash, uploaded only missing chunks, and kept the bytes in object storage', weight: 20, lessonId: 'storage-types' },
    { item: 'Kept metadata in a strongly consistent store sharded by namespace, with versions as chunk lists and an ordered change log', weight: 15, lessonId: 'consistency-models' },
    { item: 'Pushed change notices over long polls or WebSockets, with devices syncing by cursor', weight: 15, lessonId: 'real-time-communication' },
    { item: 'Detected conflicting edits with a version check and kept both instead of overwriting', weight: 20, lessonId: 'time-and-ordering' },
    { item: 'Made chunk uploads and commits safe to retry, and resumed after dropped connections', weight: 10, lessonId: 'idempotency' },
    { item: 'Covered failures: dead notification servers, leader failover, orphaned and corrupt chunks', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
