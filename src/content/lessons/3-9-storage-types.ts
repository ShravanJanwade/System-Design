import type { DiagramSpec, Lesson } from '../types';

/** Who can reach each kind of storage. */
const threeKinds: DiagramSpec = {
  grid: { cols: 2, rows: 4 },
  nodes: [
    { id: 'dbServer', type: 'service', label: 'Database server', x: 0, y: 0 },
    { id: 'volume', type: 'blockStore', label: 'Block volume', sublabel: 'attached to one server', x: 1, y: 0 },
    { id: 'app1', type: 'service', label: 'App server 1', x: 0, y: 1 },
    { id: 'app2', type: 'service', label: 'App server 2', x: 0, y: 2 },
    { id: 'share', type: 'fileStore', label: 'File share', sublabel: 'shared over NFS', x: 1, y: 1.5 },
    { id: 'clients', type: 'client', label: 'Phones and servers', x: 0, y: 3 },
    { id: 'objects', type: 'objectStore', label: 'Object storage', sublabel: 'any client, over the web', x: 1, y: 3 },
  ],
  edges: [
    { id: 'db-volume', from: 'dbServer', to: 'volume', kind: 'sync' },
    { id: 'app1-share', from: 'app1', to: 'share', kind: 'sync' },
    { id: 'app2-share', from: 'app2', to: 'share', kind: 'sync' },
    { id: 'clients-objects', from: 'clients', to: 'objects', kind: 'sync' },
  ],
  description:
    'A database server reads and writes a block volume attached only to it. Two app servers share one file share over the network. Phones and servers of any kind reach object storage over the web.',
};

/** The signature diagram: an upload with a pre-signed URL, then a view through the CDN. */
const upload: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'photo metadata', x: 2, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Object storage', sublabel: 'snapgram-photos', x: 1, y: 2 },
    { id: 'cdn', type: 'cdn', label: 'CDN edge', x: 2, y: 2 },
    { id: 'viewer', type: 'client', label: 'Ana’s phone', x: 3, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'phone-store', from: 'phone', to: 'store', kind: 'sync' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync' },
    { id: 'viewer-cdn', from: 'viewer', to: 'cdn', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya picks a photo. Her phone asks the **app server** for permission to upload a 3 MB JPEG; the request itself is tiny.',
      flow: ['phone-app'],
      focus: ['phone', 'app'],
    },
    {
      caption:
        'The app checks that Maya is logged in, picks the key `photos/42/9f3c.jpg` and signs a link that permits uploading that object for the next 15 minutes. Signing needs only the app’s secret key, not a call to the storage service.',
      flow: [{ edge: 'phone-app', reverse: true, tag: 'signed link' }],
      focus: ['phone', 'app'],
    },
    {
      caption: 'The phone sends the bytes straight to **object storage** with a `PUT` request. The app server never touches the 3 MB, however slow the connection.',
      flow: [{ edge: 'phone-store', tag: '3 MB' }],
      focus: ['phone', 'store'],
    },
    {
      caption: 'The store checks the signature and the expiry time, saves the object and answers `200 OK`. The phone then tells the app that the upload is done.',
      flow: ['<phone-store', 'phone-app'],
      focus: ['phone', 'store', 'app'],
    },
    {
      caption: 'The app records the photo in the **database**: owner, key, size, type and upload time. Only now does the photo exist as far as Snapgram is concerned.',
      flow: ['app-db', '<app-db', '<phone-app'],
      focus: ['phone', 'app', 'db'],
    },
    {
      caption:
        'Later, Ana opens Maya’s profile. Her phone fetches the image through a nearby **CDN edge**, which pulls it from object storage once and then serves it from its cache.',
      add: ['cdn', 'viewer', 'cdn-store', 'viewer-cdn'],
      flow: ['viewer-cdn', 'cdn-store', '<cdn-store', '<viewer-cdn'],
      focus: ['viewer', 'cdn', 'store'],
    },
  ],
  description:
    'Maya’s phone asks the app server for a signed upload link, uploads the photo directly to object storage, then confirms with the app server, which records the metadata in the database. Ana’s phone later loads the photo through a CDN edge that fetches it from object storage.',
};

/** Quiz: uploads proxied through the app servers at the evening peak. */
const proxied: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', sublabel: '2,000 slow uploads', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: 'relaying every byte', x: 1, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Object storage', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'one row per photo', x: 1, y: 1 },
  ],
  edges: [
    { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
    { id: 'app-store', from: 'app', to: 'store', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'storage-types',
  module: 'm3',
  order: 9,
  title: 'Block, file and object storage',
  idea: 'Block storage is a raw disk for one server, file storage is a shared folder on the network, and object storage keeps whole files under keys you fetch over the web, which makes it the usual home for photos and videos.',
  minutes: 13,
  prerequisites: ['databases-101', 'cdns'],
  outcomes: [
    'Tell block, file and object storage apart, and name a typical use for each.',
    'Design a photo upload that sends the bytes straight to object storage and keeps the metadata in a database.',
    'Explain why app servers should stay out of the path of large uploads.',
  ],
  analogy: {
    title: 'A hard drive, a shared folder and a valet ticket',
    body: 'Block storage is like the hard drive inside your laptop. It is fast and yours alone, and your computer decides how to arrange it into folders and files. Nobody else can use it while it sits in your machine.\n\nFile storage is the shared folder on the office network: everyone sees the same folders, which is handy until thousands of people hunt through them at once. Object storage is valet parking. You hand over your car and get a ticket; you never learn which level it is on, the garage can be enormous, and the ticket alone gets your car back.',
  },
  whyItMatters:
    'Since day one, Snapgram has saved every photo on its app server’s own disk. Users now upload about 500,000 photos a day, roughly 1 TB with the smaller copies, and the 8 TB disk is nearly full. Worse, the second app server cannot see photos saved on the first, so some users see broken images.\n\nUploads hurt too. A 3 MB photo over a slow phone connection can tie up an app server for ten seconds, and at the evening peak, uploads crowd out everything else. The founders need somewhere else to put the bytes.',
  body: [
    { kind: 'heading', text: 'Three ways to store bytes' },
    {
      kind: 'prose',
      md: 'Storage comes in three shapes, and the difference is what you ask for. With [[block storage|block-storage]], you ask for block number 12,345 of a disk. With [[file storage|file-storage]], you ask for a file by its path, such as `/photos/42/beach.jpg`. With [[object storage|object-storage]], you ask for a whole object by its key, over the web.',
    },
    {
      kind: 'table',
      columns: ['Kind', 'You ask for', 'Shared by', 'Typical use', 'Ballpark latency'],
      rows: [
        ['Block', 'Numbered blocks of a disk', 'One server at a time', 'Database files, the operating system', 'Under a millisecond to a few'],
        ['File', 'Files by path, in folders', 'Many servers', 'Shared documents, older apps', 'A few milliseconds'],
        ['Object', 'Whole objects by key, over the web', 'Anyone with permission', 'Photos, videos, backups', 'Tens of milliseconds'],
      ],
      caption: 'Ballpark [[latencies|latency]] vary with the product and the network.',
    },
    {
      kind: 'diagram',
      title: 'Who can reach each kind',
      caption: 'A block volume belongs to one server, a file share to a group of servers, and object storage to any client with permission.',
      spec: threeKinds,
    },
    { kind: 'heading', text: 'Block storage: a raw disk' },
    {
      kind: 'prose',
      md: 'Block storage looks to a server exactly like a disk plugged into it: a long row of numbered blocks. The operating system formats it with a file system and decides what goes where, which makes it fast and flexible. Databases keep their files on block storage, and a cloud volume such as Amazon EBS (Elastic Block Store) attaches to one server at a time, apart from special multi-attach modes.',
    },
    { kind: 'heading', text: 'File storage: a shared folder' },
    {
      kind: 'prose',
      md: 'File storage puts a file system on the network, so many servers can open the same folders at once, using protocols such as NFS (Network File System) or SMB (Server Message Block). It suits shared documents and older apps that expect a disk. At very large scale it struggles, because every lookup walks folders and reads per-file records, as Facebook found with billions of photos.',
    },
    { kind: 'heading', text: 'Object storage: a valet ticket' },
    {
      kind: 'prose',
      md: 'Object storage drops folders altogether. Each object is a whole file plus its [[metadata|metadata]], stored in a [[bucket|bucket]] under a key such as `photos/42/9f3c.jpg`, and you read and write it with plain web requests in the [[Hypertext Transfer Protocol|http]] (HTTP): `PUT` to store, `GET` to fetch. There is no editing in place; you replace the whole object.',
    },
    {
      kind: 'prose',
      md: 'In return, it scales almost without limit and is cheap per gigabyte. Amazon S3, the best-known service, stores each object on several devices in at least three separate data centers, and AWS (Amazon Web Services) says it is designed for 99.999999999% durability. Small requests often take tens of milliseconds, so popular objects are served through a [[content delivery network|cdn]] (CDN).',
    },
    { kind: 'heading', text: 'Snapgram’s upload flow' },
    {
      kind: 'prose',
      md: 'Snapgram moves its photos to object storage and keeps a small row per photo in its database. The trick is that the bytes never pass through the app server. The app hands the phone a [[pre-signed URL|pre-signed-url]]: a web address (a URL, short for uniform resource locator) carrying a signature that allows uploading one specific object, and only until it expires.',
    },
    {
      kind: 'diagram',
      title: 'Uploading a photo',
      caption: 'The app server signs, object storage receives, and the database remembers. Step through one upload and one view.',
      spec: upload,
    },
    {
      kind: 'prose',
      md: 'Three things make this design work. The app server stays [[stateless|stateless]] and light, because the bytes bypass it. Object storage absorbs any number of slow uploads in parallel. And the database holds only small rows, so “Maya’s photos, newest first” never touches a single image byte.',
    },
    { kind: 'heading', text: 'Metadata lives in the database' },
    {
      kind: 'annotated',
      title: 'One row per photo',
      lines: [
        { code: 'id          9001', note: 'Snapgram’s own number for the photo.' },
        { code: 'owner_id    42', note: 'Who uploaded it, so the profile query can find it with an index.' },
        { code: "object_key  'photos/42/9f3c.jpg'", note: 'Where the bytes live in the bucket.' },
        { code: 'size_bytes  3145728', note: 'Checked against the upload limit.' },
        { code: "created_at  '2026-11-17 09:14'", note: 'Lets the feed sort photos by time.' },
      ],
      caption: 'The database answers questions about photos; object storage holds the bytes.',
    },
    {
      kind: 'prose',
      md: 'Keep the two in step. If an upload succeeds but the phone never confirms it, the bucket holds an orphan; if a row points to a key that was never uploaded, the photo is broken. Teams handle both with a cleanup job, or have the storage service announce each new object to the app.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real upload flows add more: limits on file size and type built into the signature, big videos uploaded in parts, checks on the content, and thumbnails made after the upload. [Message queues and event streams](lesson:queues-and-streams) covers that last step.',
    },
  ],
  tradeoffs: {
    caption: 'Where to keep files, and what each choice costs.',
    rows: [
      {
        option: 'Block storage',
        goodAt: 'The lowest latency and full control; databases and operating systems expect it.',
        badAt: 'Attached to one server at a time, sized up front, and you manage the file system.',
        pickWhen: 'A database’s data files, or a server’s own disk.',
      },
      {
        option: 'File storage',
        goodAt: 'Many servers share the same folders, using ordinary file operations.',
        badAt: 'Folder and per-file overhead slows it at billions of files, and it costs more per gigabyte than object storage.',
        pickWhen: 'Shared files for a few servers, or apps written for a disk.',
      },
      {
        option: 'Object storage',
        goodAt: 'Nearly unlimited, cheap per gigabyte, highly durable, and reachable by any client over the web.',
        badAt: 'Tens of milliseconds per request, and no editing in place: you replace whole objects.',
        pickWhen: 'Photos, videos, backups and other files written once and read many times.',
      },
      {
        option: 'Files inside the database',
        goodAt: 'One system to run, and a file and its row change together in one transaction.',
        badAt: 'Bloats the database, its backups and its memory, and every image download loads the database.',
        pickWhen: 'A few small files at small scale, such as icons in a prototype.',
      },
    ],
  },
  realWorld: {
    title: 'Facebook’s photos outgrow a shared file system',
    body: 'In 2010, Facebook engineers described Haystack, the object store they built for Facebook’s photos. At the time, Facebook stored over 260 billion images, more than 20 petabytes, and users uploaded one billion new photos, about 60 terabytes, each week. The earlier design kept photos as files on network-attached storage (NAS) appliances, mounted over NFS.\n\nThe paper explains that reading one photo that way took several disk operations: one or more to translate the file name into its on-disk record, another to read that record, and a final one to read the file. Haystack packs many photos into large files and keeps the small amount of metadata it needs in memory, so a read takes at most one disk operation. The paper describes photos as written once, read often, never modified and rarely deleted, which is exactly the workload object storage suits.',
    sourceUrl: 'https://www.usenix.org/conference/osdi10/finding-needle-haystack-facebooks-photo-storage',
    sourceLabel: 'Beaver et al., “Finding a needle in Haystack: Facebook’s photo storage,” USENIX OSDI 2010',
  },
  interview: {
    whenToMention:
      'In any design with user uploads: photos, videos, documents or attachments. Say it in one breath: bytes in object storage, metadata in the database, uploads straight from the client with pre-signed URLs, and downloads through a CDN.',
    sayItLikeThis: [
      'Photos go to object storage such as S3, and the database keeps one small row per photo with the owner, key, size and timestamps.',
      'Clients upload directly to the bucket with a short-lived pre-signed URL, so our app servers never carry the bytes.',
      'Reads go through a CDN in front of the bucket, so popular photos are served from edges near users.',
    ],
    followUps: [
      {
        q: 'Why not store the images in the database?',
        a: 'Databases are built for small rows and fast queries. Images would bloat the tables, backups and memory, and every download would load the database. Object storage is far cheaper per gigabyte and serves files directly or through a CDN, while the database keeps the small metadata row.',
      },
      {
        q: 'How do you stop people uploading huge files or the wrong kind?',
        a: 'Sign only what you mean to allow: one key, a short expiry and, where the service supports it, a content type and a size limit. After the upload, check the real file before marking it ready, and keep the bucket private so only signed requests get in.',
      },
      {
        q: 'What if the upload succeeds but the client never confirms it?',
        a: 'The bucket now holds an object with no database row. Have the storage service send an event for each new object so the app records it anyway, or run a cleanup job that deletes unconfirmed objects older than a day. Writing a pending row before the upload makes both easy.',
      },
    ],
    redFlags: [
      'Sending every upload through the app servers.',
      'Storing images as rows in the main database at scale.',
      'A public, writable bucket, or upload links that never expire.',
      'Forgetting the metadata: with only a bucket, you cannot answer “Maya’s newest photos”.',
    ],
  },
  mistakes: [
    '**Relaying uploads.** Streaming every byte through the app servers ties them up and adds a hop for nothing.',
    '**Treating object storage like a disk.** You cannot change part of an object, and each request takes tens of milliseconds, so keep database files on block storage.',
    '**Long-lived links.** A pre-signed URL works for anyone who has it until it expires, so keep the expiry short.',
    '**Letting metadata and objects drift apart.** Without cleanup, failed uploads leave orphaned objects and broken photo rows.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put Snapgram’s upload flow in order.',
      items: [
        'The phone asks the app server for permission to upload',
        'The app signs a pre-signed URL and returns it',
        'The phone uploads the photo straight to object storage',
        'The phone tells the app the upload finished',
        'The app records the photo’s metadata in the database',
      ],
      why: 'The app must allow the upload before any bytes move, and it records the metadata only once it knows the object exists.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s database server needs a disk for its data files. Which storage fits?',
      options: [
        {
          text: 'Block storage',
          correct: true,
          why: 'A database makes many small reads and writes inside its files, and a disk-like block volume serves them with the lowest latency.',
        },
        {
          text: 'File storage',
          correct: false,
          why: 'Some databases can run on a network file system, but the extra network hop and file locking make it a poor default.',
        },
        {
          text: 'Object storage',
          correct: false,
          why: 'Objects are replaced whole and each request takes tens of milliseconds, far too slow for a database’s small reads and writes.',
        },
        { text: 'A CDN', correct: false, why: 'A CDN caches content for readers. It is not where a database keeps its files.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these belong in the photos table rather than in object storage?',
      options: [
        { text: 'Who uploaded the photo', correct: true, why: 'Queries like “Maya’s photos” filter on the owner, so it belongs in an indexed column.' },
        { text: 'The object key in the bucket', correct: true, why: 'The row must say where the bytes live.' },
        { text: 'The upload time', correct: true, why: 'Feeds sort by it, which is a database job.' },
        { text: 'The JPEG bytes', correct: false, why: 'The bytes live in object storage. The row only points to them.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram stores about 500,000 photos a day at about 2 MB each. Roughly how many terabytes is that per year?',
      answer: 365,
      unit: 'TB',
      tolerance: 1.1,
      solution: [
        'Per day: 500,000 × 2 MB = 1,000,000 MB, about 1 TB.',
        'Per year: 1 TB × 365 ≈ 365 TB.',
        'That is far beyond any single disk, which is why photos live in object storage that grows without limit.',
      ],
    },
    {
      kind: 'bottleneck',
      prompt: 'At the evening peak, 2,000 phones are uploading photos over slow connections, and the app servers relay every byte to object storage. What runs out first?',
      diagram: proxied,
      answerNodeId: 'app',
      why: 'Each upload holds an app server connection and memory for seconds while the bytes trickle in, so the app servers run out of capacity. Pre-signed URLs (uniform resource locators) send the bytes straight to object storage instead.',
      others: {
        phones: 'The phones are slow, but each one only carries its own upload.',
        store: 'Object storage is built to take huge numbers of uploads in parallel.',
        db: 'The database receives only one small row per photo.',
      },
    },
  ],
  takeaways: [
    'Block storage is a raw disk for one server, file storage is a shared folder, and object storage keeps whole files by key over the web.',
    'Keep photos and videos in object storage and their metadata in a database, and serve them through a CDN.',
    'Let clients upload straight to object storage with short-lived pre-signed URLs, so app servers never carry the bytes.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Multipart uploads.** Large files such as videos are uploaded in parts, often in parallel, and the service joins them at the end. A failed part is retried on its own instead of restarting the whole upload.',
    },
    {
      kind: 'prose',
      md: '**Storage classes.** Object stores offer cheaper classes for data that is rarely read, such as old backups. Lifecycle rules move objects between classes as they age, or delete them.',
    },
    {
      kind: 'prose',
      md: '**Signed downloads.** The same trick works for reading: a private bucket can serve a photo only to someone holding a short-lived signed link, which suits private albums.',
    },
  ],
  flashcards: [
    { front: 'What is block storage?', back: 'A raw disk of numbered blocks that one server formats and uses, such as a cloud volume holding a database’s files.' },
    { front: 'What is file storage?', back: 'A shared file system on the network, such as NFS, where many servers open the same folders and files.' },
    { front: 'What is object storage?', back: 'Storage for whole files, kept as objects under keys in a bucket and read or written over the web.' },
    { front: 'Where do photo bytes and photo metadata go?', back: 'The bytes go in object storage; metadata such as owner, key, size and time goes in the database.' },
    { front: 'What is a pre-signed URL?', back: 'A link signed with the app’s secret key that lets its holder upload or download one object until it expires.' },
    {
      front: 'Why upload straight to object storage instead of through the app server?',
      back: 'Slow uploads would tie up the app servers. Object storage is built to absorb them, so the app servers stay light.',
    },
    { front: 'Why serve photos through a CDN?', back: 'Object storage takes tens of milliseconds per request; edges near users cache popular photos and answer faster.' },
  ],
  related: ['databases-101', 'cdns', 'stateless-vs-stateful', 'queues-and-streams', 'security-essentials', 'cost-awareness'],
  glossaryTerms: ['block-storage', 'file-storage', 'object-storage', 'latency', 'metadata', 'bucket', 'http', 'cdn', 'pre-signed-url', 'stateless'],
};

export default lesson;
