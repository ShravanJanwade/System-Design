import type { DiagramSpec, Problem } from '../types';

/** v1: one app server carries every byte; one database holds users, photos and follows. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone app', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'users, photos, follows', x: 2, y: 0 },
    { id: 'disk', type: 'objectStore', label: 'Photo storage', sublabel: 'one bucket', x: 1, y: 1 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-disk', from: 'app', to: 'disk', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A user posts a photo. The phone sends the whole file, about 2 MB (ballpark), to the **app server**, which saves it in **photo storage** and adds a row with the caption and the file’s name to the **database**.',
      flow: ['phone-app', 'app-disk', '<app-disk', 'app-db', '<app-db', '<phone-app'],
      notes: [{ target: 'disk', text: '2 MB original' }],
    },
    {
      caption:
        'A follower opens the app. The app server asks the database for the newest photos from everyone they follow, a join of follows and photos sorted by time, and returns 20 of them. Building the feed when it is read like this is called [[fan-out on read|fan-out-on-read]].',
      flow: ['phone-app', 'app-db', '<app-db', '<phone-app'],
    },
    {
      caption:
        'The phone then asks the app server for each photo, and the server streams the full original out of storage. Twenty photos is 40 MB through one server for one screen of feed, and this is where v1 breaks.',
      flow: ['phone-app', 'app-disk', '<app-disk', '<phone-app'],
      notes: [{ target: 'app', text: 'carries every byte', tone: 'alert' }],
    },
  ],
};

/** v2: direct uploads, resizing from a queue, and a CDN in front of storage. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'uploader', type: 'client', label: 'Uploader', x: 0, y: 1 },
    { id: 'api', type: 'service', label: 'API servers', sublabel: 'stateless', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'Resize queue', x: 2, y: 0 },
    { id: 'db', type: 'nosqlDb', label: 'Photo metadata', sublabel: 'sharded', x: 1, y: 1 },
    { id: 'worker', type: 'worker', label: 'Resize workers', x: 2, y: 1 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', sublabel: 'originals and sizes', x: 1, y: 2 },
    { id: 'viewers', type: 'client', label: 'Viewers', x: 0, y: 3 },
    { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'edges near viewers', x: 1, y: 3 },
  ],
  edges: [
    { id: 'uploader-api', from: 'uploader', to: 'api', kind: 'sync' },
    { id: 'api-db', from: 'api', to: 'db', kind: 'sync' },
    { id: 'uploader-store', from: 'uploader', to: 'store', kind: 'sync' },
    { id: 'api-queue', from: 'api', to: 'queue', kind: 'async', label: 'resize job' },
    { id: 'queue-worker', from: 'queue', to: 'worker', kind: 'async' },
    { id: 'worker-store', from: 'worker', to: 'store', kind: 'sync' },
    { id: 'worker-db', from: 'worker', to: 'db', kind: 'sync', label: 'ready' },
    { id: 'viewers-cdn', from: 'viewers', to: 'cdn', kind: 'sync' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync', label: 'misses' },
  ],
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      uploader: { x: 0, y: 0 },
      api: { x: 0, y: 1 },
      db: { x: 1, y: 1 },
      store: { x: 2, y: 1 },
      queue: { x: 0, y: 2 },
      worker: { x: 1, y: 2 },
      cdn: { x: 2, y: 2 },
      viewers: { x: 2, y: 3 },
    },
    sides: { 'uploader-store': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'To post, the phone first asks the **API servers** for permission. They create a photo row marked `uploading` in **photo metadata** and return a pre-signed URL that allows one upload of up to 20 MB to one key, valid for about 15 minutes (ballpark).',
      flow: ['uploader-api', 'api-db', '<api-db', '<uploader-api'],
      notes: [{ target: 'db', text: 'status: uploading' }],
    },
    {
      caption:
        'The phone sends the 2 MB original straight to **photo storage**, so no app server holds the bytes while they trickle in over a slow mobile network. It then tells the API servers the upload is done, and they put a job on the **resize queue** and answer at once.',
      flow: ['uploader-store', '<uploader-store', 'uploader-api', 'api-queue', '<uploader-api'],
    },
    {
      caption:
        'One of the **resize workers** takes the job, reads the original, and writes three copies back: a 150-pixel thumbnail and 640-pixel and 1080-pixel versions, about 0.5 MB together (ballpark). Then it marks the photo `ready`, and only now can followers see it.',
      flow: ['queue-worker', 'worker-store', '<worker-store', 'worker-db'],
      notes: [{ target: 'worker', text: '3 sizes per photo' }],
    },
    {
      caption:
        'A follower’s phone asks the **CDN** for the 640-pixel copy. The first request at each edge misses, so the edge fetches the file from storage and keeps it, since the file at that key never changes.',
      flow: [{ edge: 'viewers-cdn', tag: 'miss' }, 'cdn-store', '<cdn-store', '<viewers-cdn'],
    },
    {
      caption:
        'Every later viewer near that edge is a [[cache hit|cache-hit]], answered in tens of milliseconds (ballpark) without touching storage. With most views served at the edges, storage and app servers see only a small share of the 200,000 views a second at peak.',
      flow: ['viewers-cdn', { edge: 'viewers-cdn', reverse: true, tag: 'hit' }],
    },
  ],
};

/** v3: posts are pushed into ready-made feed lists; big accounts are pulled at read time. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'poster', type: 'client', label: 'Poster', x: 0, y: 0 },
    { id: 'postSvc', type: 'service', label: 'Post service', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'Fan-out queue', x: 2, y: 0 },
    { id: 'posts', type: 'nosqlDb', label: 'Photo metadata', sublabel: 'posts by author', x: 1, y: 1 },
    { id: 'fanout', type: 'worker', label: 'Fan-out workers', x: 2, y: 1 },
    { id: 'follows', type: 'nosqlDb', label: 'Follow graph', x: 3, y: 1 },
    { id: 'viewer', type: 'client', label: 'Follower', x: 0, y: 2 },
    { id: 'feedSvc', type: 'service', label: 'Feed service', x: 1, y: 2 },
    { id: 'feedCache', type: 'cache', label: 'Feed cache', sublabel: 'a list per user', x: 2, y: 2 },
  ],
  edges: [
    { id: 'poster-postSvc', from: 'poster', to: 'postSvc', kind: 'sync' },
    { id: 'postSvc-posts', from: 'postSvc', to: 'posts', kind: 'sync' },
    { id: 'postSvc-queue', from: 'postSvc', to: 'queue', kind: 'async', label: 'new post' },
    { id: 'queue-fanout', from: 'queue', to: 'fanout', kind: 'async' },
    { id: 'fanout-follows', from: 'fanout', to: 'follows', kind: 'sync', label: 'followers' },
    { id: 'fanout-feedCache', from: 'fanout', to: 'feedCache', kind: 'sync' },
    { id: 'viewer-feedSvc', from: 'viewer', to: 'feedSvc', kind: 'sync' },
    { id: 'feedSvc-feedCache', from: 'feedSvc', to: 'feedCache', kind: 'sync' },
    { id: 'feedSvc-posts', from: 'feedSvc', to: 'posts', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A user shares a photo that is already uploaded and resized. The **post service** saves the post in **photo metadata**, puts a “new post” message on the **fan-out queue** and answers, so the poster never waits for followers’ feeds to update.',
      flow: ['poster-postSvc', 'postSvc-posts', '<postSvc-posts', 'postSvc-queue', '<poster-postSvc'],
    },
    {
      caption:
        'One of the **fan-out workers** takes the message, pages through the poster’s followers in the **follow graph**, and adds the post’s ID to the front of each follower’s list in the **feed cache**. A poster with 200 followers costs 200 small writes.',
      flow: ['queue-fanout', 'fanout-follows', '<fanout-follows', 'fanout-feedCache'],
      notes: [{ target: 'feedCache', text: 'newest 500 per user' }],
    },
    {
      caption:
        'A follower opens the app. The **feed service** reads their list from the feed cache in one read, fetches the details of the first 20 posts from photo metadata in one batch, and returns them with CDN addresses for each size.',
      flow: ['viewer-feedSvc', 'feedSvc-feedCache', '<feedSvc-feedCache', 'feedSvc-posts', '<feedSvc-posts', '<viewer-feedSvc'],
    },
    {
      caption:
        'Accounts with more than about a million followers (ballpark) skip the fan-out. At read time the feed service pulls their recent posts from photo metadata and merges them into the list by time. This is [[hybrid fan-out|hybrid-fan-out]], and it keeps one post from turning into millions of writes.',
      flow: ['viewer-feedSvc', 'feedSvc-feedCache', '<feedSvc-feedCache', { edge: 'feedSvc-posts', tag: 'pull' }, '<feedSvc-posts', '<viewer-feedSvc'],
    },
  ],
};

/** v4: what each failure does to viewing and to the feed. One metadata shard is drawn. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'many edges', x: 1, y: 0 },
    { id: 'shield', type: 'cdn', label: 'Origin shield', x: 2, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', sublabel: 'three zones', x: 3, y: 0 },
    { id: 'viewers', type: 'client', label: 'Phones', x: 0, y: 1 },
    { id: 'feedSvc', type: 'service', label: 'Feed service', x: 1, y: 1 },
    { id: 'feedCache', type: 'cache', label: 'Feed cache', sublabel: 'sharded by user', x: 2, y: 1 },
    { id: 'follower', type: 'nosqlDb', label: 'Metadata follower', sublabel: 'serves reads', x: 1, y: 2 },
    { id: 'leader', type: 'nosqlDb', label: 'Metadata leader', sublabel: 'takes writes', x: 2, y: 2 },
  ],
  edges: [
    { id: 'viewers-cdn', from: 'viewers', to: 'cdn', kind: 'sync' },
    { id: 'cdn-shield', from: 'cdn', to: 'shield', kind: 'sync', label: 'misses' },
    { id: 'shield-store', from: 'shield', to: 'store', kind: 'sync' },
    { id: 'viewers-feedSvc', from: 'viewers', to: 'feedSvc', kind: 'sync' },
    { id: 'feedSvc-feedCache', from: 'feedSvc', to: 'feedCache', kind: 'sync' },
    { id: 'feedSvc-follower', from: 'feedSvc', to: 'follower', kind: 'sync' },
    { id: 'leader-follower', from: 'leader', to: 'follower', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'Every tier runs in at least three [[availability zones|availability-zone]]. **Photo storage** keeps copies of every object in several zones, and each metadata shard has a **metadata leader** that takes writes and [[followers|follower]] that copy them and serve reads; one follower is drawn.',
      focus: ['store', 'leader', 'leader-follower'],
      flow: ['viewers-feedSvc', 'feedSvc-feedCache', '<feedSvc-feedCache', '<viewers-feedSvc'],
    },
    {
      caption:
        'A photo goes viral, and hundreds of CDN edges miss at the same moment. They all ask the **origin shield**, a layer of the CDN in front of storage ([[origin shield|origin-shield]]), which fetches each size once and hands the answer to every edge that asked. This is [[request coalescing|request-coalescing]]: storage sees a handful of reads, not hundreds.',
      flow: [{ edge: 'viewers-cdn', tag: 'miss' }, 'cdn-shield', 'shield-store', '<shield-store', '<cdn-shield', '<viewers-cdn'],
      notes: [{ target: 'store', text: 'one read per size' }],
    },
    {
      caption:
        'A **feed cache** node dies, and the lists it held are gone. The feed service rebuilds each affected feed on demand by pulling recent posts from the accounts the user follows, read from a **metadata follower**: a few hundred milliseconds instead of a few (ballpark), but correct. It writes each rebuilt list back for next time.',
      fail: ['feedCache'],
      flow: ['viewers-feedSvc', 'feedSvc-follower', '<feedSvc-follower', '<viewers-feedSvc'],
      notes: [{ target: 'follower', text: 'rebuilding feeds', tone: 'alert' }],
    },
    {
      caption:
        'The metadata leader of one shard dies. Feeds keep loading, because reads come from followers, and within seconds a follower is promoted to leader ([[failover|failover]]). New posts on that shard fail for those seconds; the app retries them in the background, so the poster sees a short delay at worst.',
      fail: ['leader'],
      flow: ['viewers-feedSvc', 'feedSvc-feedCache', '<feedSvc-feedCache', '<viewers-feedSvc'],
      notes: [{ target: 'follower', text: 'promoted', tone: 'signal' }],
    },
  ],
};

const problem: Problem = {
  id: 'photo-sharing',
  title: 'Photo sharing',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a photo-sharing app like Instagram. People upload photos from their phones, follow other people, and scroll a home feed of the newest photos from the accounts they follow.',
  concepts: ['storage-types', 'cdns', 'queues-and-streams', 'feed-fanout', 'caching', 'sharding', 'replication', 'back-of-the-envelope', 'cost-awareness'],
  hints: [
    'Split each photo into two very different things: the bytes, a few megabytes that never change, and the facts about them ([[metadata|metadata]]), a few hundred bytes that are read constantly. Where should each live, and do the bytes need to pass through your servers at all?',
    'Views outnumber uploads by something like a thousand to one (ballpark), and a phone screen never needs a 12-megapixel original. Think about which sizes of each photo you make, when you make them, and what sits between a viewer and your storage.',
    'One shape that works: phones upload originals straight to [[object storage|object-storage]] with a [[pre-signed URL|pre-signed-url]], a short-lived signed uniform resource locator (URL); a [[message queue|message-queue]] hands each new photo to workers that make a few resized copies; a [[content delivery network|cdn]] (CDN) serves those copies; and each user’s feed is a ready-made list of photo identifiers (IDs), filled by [[fan-out on write|fan-out-on-write]] for all but the biggest accounts.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many people use it each day, and how many photos do they post and view?',
      why: 'This sets the scale and the [[read/write ratio|read-write-ratio]]. Assume 100 million daily users who post 10 million photos and view about 10 billion a day (ballpark): views outnumber uploads 1,000 to 1, so serving photos cheaply matters more than anything on the write side.',
    },
    {
      q: 'Do we keep the full-size original forever, or only the sizes we show?',
      why: 'Originals are about 80% of the bytes (ballpark), so dropping them cuts storage about five times. Keeping them lets you make new sizes and formats later, which is why most designs keep them in a cheaper [[storage class|storage-class]].',
    },
    {
      q: 'How quickly must a new post appear in followers’ feeds?',
      why: 'If a few seconds is fine, resizing and feed updates can run in the background from a queue, and the poster gets an answer as soon as the upload lands. If it had to be instant everywhere, every post would wait on its slowest follower.',
    },
    {
      q: 'Is the feed strictly newest first, or ranked?',
      why: 'Newest first makes a feed a list sorted by time, cheap to build ahead and to page through. Ranking adds a scoring step at read time on top of the same lists, so you can design the time-ordered feed and leave room for ranking.',
    },
    {
      q: 'Can accounts be private, and can photos be deleted?',
      why: 'Private photos need access checks on viewing, so image addresses must be signed or unguessable and must expire. Deletion means removing a photo from feeds, storage and cached copies, which shapes the keys and cache lifetimes you choose.',
    },
    {
      q: 'Are some accounts followed by millions of people?',
      why: 'If so, copying each of their posts into every follower’s feed takes minutes: the [[celebrity problem|celebrity-problem]]. That pushes you toward a feed that pulls posts from big accounts when it is read.',
    },
  ],
  requirements: {
    functional: [
      'Upload a photo with a caption from a phone; it appears on the poster’s profile at once and in followers’ feeds within a few seconds.',
      'View any photo at a size that fits the screen: a thumbnail in grids, larger versions in the feed and full screen.',
      'Follow and unfollow other accounts.',
      'Scroll a home feed of photos from followed accounts, newest first, 20 at a time.',
      'Delete your own photo, which then disappears from feeds and profile pages.',
    ],
    nonFunctional: [
      'Fast viewing: a feed page in about 200 ms, and each image starting to draw within about 100 ms on a good connection (ballpark).',
      'Durable: an uploaded photo is never lost, even if a disk, a server or a whole data center fails.',
      'Highly available viewing, around 99.99% (a ballpark target). Uploads may pause briefly during a failure, as long as the app retries them.',
      'Uploads work on slow and flaky mobile networks, and resume rather than restart after a dropped connection.',
      'Feeds may be a few seconds out of date ([[eventual consistency|eventual-consistency]]), but users always see their own new posts at once.',
      'Scale: about 100 million daily users, 10 million new photos and 10 billion photo views a day (ballpark), kept for ten years or more.',
    ],
    outOfScope: [
      'Likes, comments, stories, video and direct messages.',
      'Search, hashtags and suggestions of accounts to follow.',
      'Ranking the feed with machine-learned models, beyond leaving room for a scoring step.',
      'Accounts and sign-in: assume each request arrives with a user identity.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '100 million (ballpark)' },
      { label: 'Photos posted per user per day', value: '0.1: one user in ten posts once' },
      { label: 'Photos viewed per user per day', value: 'about 100, so about 1,000 views for every upload' },
      { label: 'Bytes stored per photo', value: 'about 2.5 MB: a 2 MB original plus three resized copies of about 0.5 MB together' },
      { label: 'Bytes sent per view', value: 'about 200 KB: a resized copy, never the original' },
      { label: 'Followers per poster', value: 'about 200 on average, with a long tail of accounts followed by millions' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'In the calculator', value: 'a view counts as a read and an upload as a write; its outgoing bandwidth line assumes 2.5 MB per view, so divide it by about 12' },
    ],
    steps: [
      { label: 'Uploads per second', math: '10⁸ users × 0.1 = 10⁷ photos a day; 10⁷ ÷ 10⁵ seconds a day', result: '≈ 100 a second, 200 at peak' },
      { label: 'Views per second', math: '10⁸ users × 100 = 10¹⁰ views a day; 10¹⁰ ÷ 10⁵ seconds', result: '≈ 100,000 a second, 200,000 at peak' },
      { label: 'New photo storage', math: '10⁷ photos × 2.5 MB = 25 TB a day; × 365 ≈ 9 petabytes a year; × 10 years', result: '≈ 90 petabytes: object storage, not a database' },
      { label: 'Outgoing bandwidth', math: '200,000 views a second × 200 KB = 40 GB a second; × 8 bits per byte', result: '≈ 320 gigabits a second at peak: a job for a CDN' },
      { label: 'Metadata', math: '10⁷ photos × 500 bytes = 5 GB a day; × 365 × 10 years', result: '≈ 18 TB: a sharded database' },
      { label: 'Feed list writes', math: '10⁷ posts × 200 followers = 2 × 10⁹ a day; ÷ 10⁵ seconds', result: '≈ 20,000 a second, 40,000 at peak' },
      { label: 'Feed cache', math: '10⁸ users × 500 post IDs × 8 bytes', result: '≈ 400 GB, about 1 TB with overhead: a small cache cluster' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 100, readsPerWrite: 1000, objectBytes: 2_500_000, peakFactor: 2, retentionYears: 10 },
  },
  api: [
    {
      signature: 'POST /v1/uploads  { contentType, sizeBytes }  →  201 { photoId, uploadUrl, expiresAt }',
      description:
        'Starts an upload through the application programming interface (API) servers. The server creates a photo row marked `uploading` and returns a pre-signed URL for one object key, limited to image types and about 20 MB, valid for about 15 minutes (ballpark).',
    },
    {
      signature: 'PUT {uploadUrl}  (the image bytes, sent straight to object storage)  →  200 OK',
      description:
        'Not your server: the phone sends the bytes to the storage service, which checks the signature, size and type. Large files go up in parts, so a dropped connection resumes instead of starting over.',
    },
    {
      signature: 'POST /v1/photos/{photoId}/publish  { caption }  →  202 Accepted { status: "processing" }',
      description:
        'Confirms the object exists, saves the caption and queues the resize job. An [[idempotency key|idempotency-key]] header makes a retried publish return the same post instead of creating a second one.',
    },
    {
      signature: 'GET /v1/feed?cursor=…&limit=20  →  200 { posts: [{ photoId, author, caption, createdAt, images: { thumb, medium, large } }], nextCursor }',
      description:
        'One page of the home feed. The cursor holds the position of the last post seen ([[cursor pagination|cursor-pagination]]), so new posts arriving at the top never shift the next page.',
    },
    {
      signature: 'PUT /v1/me/following/{userId}  →  204 No Content   (DELETE to unfollow)',
      description:
        'Follows or unfollows an account. Both write the follow graph in two directions and are safe to repeat; a new follow does not copy old posts into your feed unless the product wants it to.',
    },
    {
      signature: 'DELETE /v1/photos/{photoId}  →  204 No Content',
      description:
        'Marks the photo deleted at once, so feeds and profiles stop showing it. A background job then deletes the stored copies and asks the CDN to drop its copies.',
    },
  ],
  dataModel: [
    {
      entity: 'Photo object',
      fields: ['key: photos/{photoId}/original', 'key: photos/{photoId}/{size}.jpg  (thumb, 640, 1080)', 'bytes, content type, checksum'],
      store: 'Object storage such as Amazon S3, with copies in several zones; originals move to a colder class after about 30 days',
      why: 'Photos are large, written once and never changed, which is exactly what object storage is built for: cheap per gigabyte, very durable, and readable over plain web requests by the CDN. Keys built from the photo ID never change, so any cache can keep a copy for as long as it likes.',
    },
    {
      entity: 'Photo',
      fields: ['photo_id: 64-bit, sorts by time (partition key)', 'owner_id', 'caption', 'created_at', 'status: uploading | processing | ready | deleted', 'width, height, sizes_ready'],
      store: 'Database partitioned by photo_id, such as Cassandra or sharded MySQL, with three copies of each row',
      why: 'Feeds fetch posts by ID in batches of 20 at about 20,000 feed loads a second at peak (ballpark), so lookups by key must be fast; rows are spread over shards by photo ID ([[sharding|sharding]]). IDs that sort by time, such as a [[Snowflake ID|snowflake-id]], let feeds and profiles sort without a separate time index.',
    },
    {
      entity: 'Photos by owner',
      fields: ['owner_id (partition key)', 'created_at (sort key, newest first)', 'photo_id'],
      store: 'The same database, as a second table',
      why: 'Profile grids and the pull side of the feed both ask for one user’s newest photos: one partition, already in order. It is written once per post, so keeping a second copy is cheap.',
    },
    {
      entity: 'Follow',
      fields: ['follower_id', 'followee_id', 'created_at'],
      store: 'Two tables in a sharded store: the followers of each user, and the accounts each user follows',
      why: 'Fan-out asks “who follows this poster?” and a feed rebuild asks “whom does this user follow?”, so each direction gets its own table, partitioned by the user being asked about. A graph database is unnecessary for lookups one hop deep.',
    },
    {
      entity: 'Feed list',
      fields: ['user_id (key)', 'entries: [(photo_id, author_id)], newest first, capped at 500'],
      store: 'An in-memory store such as Redis, sharded by user, with a replica of each shard',
      why: 'Each feed load reads one list, so the feed is [[precomputation|precomputation]] paid for at posting time; [[Redis|redis]] lists make adding to the front and reading a page fast. The lists can be rebuilt from photos and follows, so losing one costs speed, not data.',
    },
    {
      entity: 'Resize job',
      fields: ['photo_id', 'original_key', 'sizes: [thumb, 640, 1080]', 'attempt'],
      store: 'A message queue such as RabbitMQ, or a managed cloud queue',
      why: 'Jobs are independent and each takes a second or two, so a queue lets workers take them at their own pace and retry failures. Delivery is [[at-least-once|at-least-once]], which is safe here because a repeated job simply writes the same keys again.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Let people post photos and see the photos of people they follow, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One app server, one database and one storage bucket are enough for a prototype with a few thousand users. It breaks in two places as it grows: every byte of every upload and view passes through the app server, and building each feed with a join gets slower with every follow.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 200,000 photo views and 200 uploads a second at peak, 320 gigabits a second of images and 25 TB of new photos a day (ballpark).',
      diagram: v2,
      explanation:
        'App servers now handle only small requests: phones upload straight to storage and download from CDN edges. Each photo is resized once, in the background, so viewers get small files and the poster never waits. Every tier grows by adding machines: more workers when the queue grows, more edges for more viewers.',
    },
    {
      title: 'v3: Feeds ready before they are opened',
      solves: 'A join over follows and photos for each of about 20,000 feed loads a second at peak (ballpark) is too slow, and gets slower as people follow more accounts.',
      diagram: v3,
      explanation:
        'Fan-out on write moves the work from reading to posting, which pays off because feeds are loaded far more often than people post. Pulling big accounts at read time keeps a celebrity’s post from turning into millions of writes. The news feed problem explores these choices in more depth.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A lost disk, cache node or database leader, or a sudden viral photo, must not lose photos or stop feeds from loading.',
      diagram: v4,
      explanation:
        'Photos are safe because storage keeps copies in several zones, and everything else is either replicated or can be rebuilt: feed lists from metadata, resized copies from originals, CDN copies from storage. Uploads and new posts may pause for seconds during a failover, while viewing keeps working throughout. A second region with replicated storage and metadata covers the loss of a whole region.',
    },
  ],
  deepDives: [
    {
      title: 'Getting photos in: the upload path',
      problem:
        'Phones upload a few megabytes over networks that are slow, flaky and switch between Wi-Fi and cellular. If app servers carry those bytes, each upload holds a connection and memory for seconds, and a connection dropped at 90% starts over.',
      options: {
        caption: 'Three ways to get the bytes into storage',
        rows: [
          {
            option: 'Through the app servers',
            goodAt: 'Simplest: one request, and the server can check and resize the image on the way in.',
            badAt: 'Every byte passes through your fleet, so a few slow uploads tie up connections and memory, and you pay to move each file twice.',
            pickWhen: 'A prototype, or files of a few kilobytes.',
          },
          {
            option: 'Pre-signed URL, one upload',
            goodAt: 'The bytes go straight to object storage, which is built for exactly this; app servers handle only a small request before and after.',
            badAt: 'A dropped connection restarts the whole file, and you must confirm the object really arrived before publishing.',
            pickWhen: 'The default for photos of a few megabytes on decent networks.',
          },
          {
            option: 'Resumable upload in parts',
            goodAt: 'The file goes up in parts of a few megabytes each (ballpark); after a drop, only the missing parts are sent again, and parts can go up in parallel.',
            badAt: 'More logic in the app, and abandoned uploads leave parts behind that something must clean up.',
            pickWhen: 'Large originals, video, or users on poor mobile networks.',
          },
        ],
      },
      recommendation:
        'Hand out a pre-signed URL from the API servers and let the phone upload straight to object storage, in parts when the file is large or the network is poor. Sign each URL for one key, one content type and a size limit, and let it expire within minutes. Publish only after confirming the object exists, and let a [[lifecycle rule|lifecycle-rule]] delete uploads that were never published.',
    },
    {
      title: 'Making and serving the right size',
      problem:
        'A feed shows images about 1,080 pixels wide at most, and grids show thumbnails, so sending a 2 MB original for either wastes bandwidth and makes scrolling slow. You need several sizes, and you must decide when to make them and how to keep them cached.',
      options: {
        caption: 'When to make the sizes',
        rows: [
          {
            option: 'Resize after upload, in the background',
            goodAt: 'Each size is made once and stored, so views are plain file reads that every CDN edge can cache.',
            badAt: 'A new post is visible only after its job runs, and a new size or format means reprocessing every old photo.',
            pickWhen: 'The default for the few sizes every client uses.',
          },
          {
            option: 'Resize on demand behind the CDN',
            goodAt: 'An image service makes any size or format the first time it is asked for, and the CDN keeps the result.',
            badAt: 'The first view of each size is slow, and a burst of first views of a viral photo can swamp the image service.',
            pickWhen: 'Many devices and sizes, or a newer format such as WebP rolled out gradually.',
          },
          {
            option: 'Resize on the phone before upload',
            goodAt: 'Smaller uploads and less work for your servers.',
            badAt: 'You lose the original, depend on every app version doing it right, and still need other sizes made somewhere.',
            pickWhen: 'As an extra, to shrink very large camera files before sending them.',
          },
        ],
      },
      recommendation:
        'Make the two or three sizes every client uses right after upload, and put an on-demand image service behind the CDN for rarer sizes and formats. Give every size a key that never changes, such as `photos/{id}/640.jpg`, and serve it with a [[Cache-Control header|cache-control]] that allows caching for a year; an image that must change gets a new key ([[cache busting|cache-busting]]). With keys that never change, the [[hit ratio|hit-ratio]] stays high and nothing needs invalidating except deletes.',
    },
    {
      title: 'Building the home feed',
      problem:
        'About 20,000 feed loads a second at peak (ballpark) must each return the newest posts from a few hundred followed accounts within about 200 ms. Most posters have a few hundred followers, but a few have tens of millions.',
      options: {
        caption: 'Who does the work: the poster or the reader',
        rows: [
          {
            option: 'Fan-out on write (push)',
            goodAt: 'Each feed load reads one ready-made list, which is fast and predictable.',
            badAt: 'A post costs one write per follower: minutes of work for an account with tens of millions of followers, and wasted writes for followers who never open the app.',
            pickWhen: 'Accounts whose followers number in the hundreds or thousands, which is nearly all of them.',
          },
          {
            option: 'Fan-out on read (pull)',
            goodAt: 'Posting is a single write, and nothing is wasted on inactive users.',
            badAt: 'Each load reads and merges posts from hundreds of accounts, which is slow and repeats the same work for every reader.',
            pickWhen: 'Small apps, or the few accounts with huge followings.',
          },
          {
            option: 'Hybrid',
            goodAt: 'Pushes posts from ordinary accounts and pulls only from the handful of big accounts a user follows, so neither cost explodes.',
            badAt: 'Two code paths, a threshold to tune, and a merge on every load.',
            pickWhen: 'The default at this scale.',
          },
        ],
      },
      recommendation:
        'Use hybrid fan-out with a threshold of about a million followers (ballpark), and skip pushing to users who have not opened the app in weeks; if they return, build their feed by pulling. Keep only post IDs in each list, capped at a few hundred, and fetch post details in one batch read. Handle deletes and unfollows by filtering at read time, since scrubbing millions of lists is slow.',
    },
    {
      title: 'Storing about 90 petabytes for ten years',
      problem:
        'At 25 TB of new photos a day (ballpark), storage is one of the largest costs, and it only grows. Yet most views go to photos from the last few days, and old originals are almost never read.',
      options: {
        caption: 'Ways to keep the storage bill in check',
        rows: [
          {
            option: 'Keep everything in the standard class',
            goodAt: 'Simplest, and every photo is equally fast to read.',
            badAt: 'You pay the top price per gigabyte for originals that are almost never read again.',
            pickWhen: 'Early on, while the total is a few terabytes.',
          },
          {
            option: 'Lifecycle rules to colder classes',
            goodAt: 'Originals move to an infrequent-access class after about 30 days, roughly halving their cost, or far more in archive classes (ballpark), with no code changes.',
            badAt: 'Colder classes charge for each read and some take minutes or hours to return data, so the served sizes must stay in a fast class.',
            pickWhen: 'The default for originals, which are read only to make new sizes.',
          },
          {
            option: 'Drop originals after resizing',
            goodAt: 'Cuts storage by about 80% (ballpark), since originals are most of the bytes.',
            badAt: 'You can never make a larger size or a better format later, and users cannot get their full-quality photo back.',
            pickWhen: 'The product promises only screen-sized photos and cost dominates.',
          },
          {
            option: 'Newer image formats',
            goodAt: 'Formats such as WebP make served copies noticeably smaller at similar quality, saving storage and bandwidth together.',
            badAt: 'Extra copies per format, and older clients still need JPEG.',
            pickWhen: 'Bandwidth is a large share of the bill.',
          },
        ],
      },
      recommendation:
        'Keep originals, but let a lifecycle rule move them to an infrequent-access class after about 30 days, and keep the served sizes in the standard class behind the CDN. Rely on the storage service’s copies across zones for [[durability|durability]] rather than running your own backups of 90 petabytes. Track cost per photo stored and per thousand views, because a small change in image quality settings moves both.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 2 million photo views a second at peak (ballpark).',
      impact: 'Outgoing traffic reaches terabits a second, and every percent of CDN misses becomes thousands of storage reads a second.',
      mitigation:
        'Keep the hit ratio high with keys that never change and long cache lifetimes, and let the origin shield turn misses at many edges into one storage read. Feed servers are [[stateless|stateless]] and the feed cache is sharded, so both grow by adding machines.',
    },
    {
      scenario: '100× on one photo: an account with 50 million followers posts.',
      impact: 'Pushing to every follower would mean 50 million writes and minutes of delay, and the photo itself becomes a [[hot key|hot-key]] as millions open it at once.',
      mitigation: 'The hybrid feed never pushes posts from big accounts; readers pull them. CDN edges serve the image, and the origin shield coalesces the first wave of misses.',
    },
    {
      scenario: 'The resize workers crash or fall behind.',
      impact: 'Uploads still succeed, but new posts stay in processing and reach followers late while jobs pile up in the queue.',
      mitigation:
        'Alert on [[queue depth|queue-depth]] and the age of the oldest job, and add workers automatically ([[autoscaling|autoscaling]]). A corrupt image that crashes a worker every time is a [[poison message|poison-message]]: after a few tries it moves to a [[dead-letter queue|dead-letter-queue]] instead of blocking the line.',
    },
    {
      scenario: 'A feed cache node dies.',
      impact: 'The lists it held are gone, so those users’ feeds fall back to the slower pull path.',
      mitigation: 'Rebuild feeds on demand from metadata followers and write them back. A replica of each cache shard turns most failures into a quick switch instead of a rebuild.',
    },
    {
      scenario: 'A metadata shard’s leader dies.',
      impact: 'Reads continue from followers, but new posts and follows on that shard fail for a few seconds.',
      mitigation: 'Automatic failover promotes a follower, and the app retries publishes with the same idempotency key, so nothing is posted twice.',
    },
    {
      scenario: 'The CDN has an outage in one area.',
      impact: 'If storage had to serve those views directly, the traffic would swamp it and the bill.',
      mitigation:
        'Use two CDN providers and steer traffic between them with the Domain Name System (DNS). In an emergency, serve smaller sizes to cut the load ([[graceful degradation|graceful-degradation]]).',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'Uploads and posts handled there stop, and photos stored only there cannot be viewed.',
      mitigation: 'Replicate objects and metadata to a second [[region|region]]. CDN edges already hold popular photos, and misses fail over to the second region’s storage.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates image bytes from their metadata, puts the bytes in object storage, and draws upload, view and feed paths that work.',
        'Notices that views far outnumber uploads and puts a CDN in front of the images.',
        'Makes smaller copies of each photo instead of sending originals to phones.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Uploads straight to storage with pre-signed URLs, and moves resizing to a queue and workers with retries that are safe to repeat.',
        'Sizes storage and bandwidth from the estimate and uses the numbers to justify the CDN and the storage choices.',
        'Chooses push, pull or hybrid fan-out for the feed and explains the celebrity problem.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Leads the hard parts without being asked: big accounts, viral photos, the cost of storage and bandwidth, and deletes that must reach every cache.',
        'Designs for flaky networks and partial failure: resumable uploads, cleanup of abandoned uploads, caches that can be rebuilt.',
        'Plans operations and cost: hit ratio, the age of the oldest queued job, cost per thousand views, storage classes and a second region.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A user on a train loses signal halfway through uploading a photo. What happens?',
      a: 'With a resumable upload, the phone asks storage which parts arrived and sends only the rest when the signal returns, getting a fresh pre-signed URL if the old one expired. The publish call carries an idempotency key, so a retry after a timeout cannot create two posts. If the user gives up, a lifecycle rule deletes the orphaned parts after a day or so.',
    },
    {
      q: 'An account with 50 million followers just posted. Walk me through what happens.',
      a: 'The post is saved once and not fanned out, because the account is over the threshold. When each follower loads their feed, the feed service pulls that account’s newest posts and merges them into the ready-made list. The image comes through the CDN, and the origin shield turns the first wave of misses into one read per size.',
    },
    {
      q: 'The resize workers have been down for an hour. What do users see?',
      a: 'Uploads still work, because they go straight to storage, and the jobs wait in the queue. Posters see their photo as processing and followers don’t see it yet; the app can show the poster a preview made on the phone. When the workers return, autoscaling works through the backlog, and an alert on job age should have fired long before an hour passed.',
    },
    {
      q: 'A user deletes a photo. How do you make it disappear everywhere?',
      a: 'I mark it deleted in metadata first, so feeds and profiles filter it out on the next load even though its ID lingers in followers’ lists. A background job deletes the stored copies and asks the CDN to [[purge|purge]] each size; the purge matters because cache lifetimes are long. Privacy laws may also set a deadline for removing it everywhere, including backups.',
    },
    {
      q: 'Your CDN bill is now the largest line in the budget. How do you cut it?',
      a: 'Send fewer bytes per view: pick the size from the screen width, use newer formats such as WebP where clients support them, and tune compression quality. Keep the hit ratio high so storage serves little. At this volume, a committed-spend contract or a second CDN provider competing on price also helps.',
    },
    {
      q: 'How do you stop someone from viewing a private account’s photos by guessing the image address?',
      a: 'Keys contain long random IDs, so they can’t be guessed, and for private accounts the feed service hands out CDN addresses signed with a short expiry. The CDN checks the signature at the edge, so a copied address stops working once it expires. Public photos skip the signature so their copies cache well.',
    },
  ],
  rubric: [
    { item: 'Estimated uploads, views, storage and bandwidth, and let those numbers drive the design', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Kept image bytes in object storage and metadata in a database, with direct uploads using pre-signed URLs', weight: 20, lessonId: 'storage-types' },
    { item: 'Moved resizing off the upload path with a queue and workers, and made retries safe', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Served resized copies through a CDN with keys that never change and long cache lifetimes', weight: 20, lessonId: 'cdns' },
    { item: 'Built the feed with push, pull or hybrid fan-out, and handled accounts with millions of followers', weight: 20, lessonId: 'feed-fanout' },
    { item: 'Sharded and replicated metadata, and explained what users see when the feed cache, the workers or a database leader fail', weight: 15, lessonId: 'replication' },
  ],
};

export default problem;
