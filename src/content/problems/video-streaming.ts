import type { DiagramEdge, DiagramNode, DiagramSpec, Problem } from '../types';

/* ------------------------------------------------------------------ */
/* Diagram parts. The three stages share positions, so the design      */
/* visibly grows from v1 to v3.                                        */
/* ------------------------------------------------------------------ */

const cache: DiagramNode = { id: 'cache', type: 'cache', label: 'Metadata cache', x: 0, y: 0 };
const servers: DiagramNode = { id: 'servers', type: 'service', label: 'App servers', x: 1, y: 0 };
const queue: DiagramNode = { id: 'queue', type: 'queue', label: 'Task queue', x: 2, y: 0 };
const dlq: DiagramNode = { id: 'dlq', type: 'queue', label: 'Dead letters', sublabel: 'failed tasks', x: 3, y: 0 };
const apps: DiagramNode = { id: 'apps', type: 'client', label: 'Apps', sublabel: 'creators and viewers', x: 0, y: 1 };
const db: DiagramNode = { id: 'db', type: 'sqlDb', label: 'Video database', sublabel: 'metadata', x: 1, y: 1 };
const workers: DiagramNode = { id: 'workers', type: 'worker', label: 'Transcoders', sublabel: 'worker pool', x: 2, y: 1 };
const cdn: DiagramNode = { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'edge servers', x: 0, y: 2 };
const store: DiagramNode = { id: 'store', type: 'objectStore', label: 'Object storage', sublabel: 'originals, segments', x: 1, y: 2 };

const appsServers: DiagramEdge = { id: 'apps-servers', from: 'apps', to: 'servers', kind: 'sync' };
const serversDb: DiagramEdge = { id: 'servers-db', from: 'servers', to: 'db', kind: 'sync' };
const appsStore: DiagramEdge = { id: 'apps-store', from: 'apps', to: 'store', kind: 'sync' };
const serversQueue: DiagramEdge = { id: 'servers-queue', from: 'servers', to: 'queue', kind: 'async', label: 'job' };
const queueWorkers: DiagramEdge = { id: 'queue-workers', from: 'queue', to: 'workers', kind: 'async' };
const workersStore: DiagramEdge = { id: 'workers-store', from: 'workers', to: 'store', kind: 'sync' };
const workersDb: DiagramEdge = { id: 'workers-db', from: 'workers', to: 'db', kind: 'sync' };
const appsCdn: DiagramEdge = { id: 'apps-cdn', from: 'apps', to: 'cdn', kind: 'sync' };
const cdnStore: DiagramEdge = { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync', label: 'miss' };
const serversCache: DiagramEdge = { id: 'servers-cache', from: 'servers', to: 'cache', kind: 'sync' };
const queueDlq: DiagramEdge = { id: 'queue-dlq', from: 'queue', to: 'dlq', kind: 'async', label: 'after 3 tries' };

/** v1: uploads straight to object storage, a queue in front of the transcoders, playback from storage. */
const itWorks: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [servers, queue, apps, db, workers, store],
  edges: [appsServers, serversDb, appsStore, serversQueue, queueWorkers, workersStore, workersDb],
  steps: [
    {
      caption:
        'A creator’s app asks the **App servers** to create a video. They save a row with status `uploading` in the **Video database** and send back pre-signed upload links, one for each part of the file.',
      flow: ['apps-servers', 'servers-db', '<servers-db', '<apps-servers'],
    },
    {
      caption:
        'The app uploads the parts straight to **Object storage**, several at once. Gigabytes of video never pass through the app servers, so they stay small and [[stateless|stateless]].',
      flow: ['apps-store'],
      notes: [{ target: 'store', text: 'original saved' }],
    },
    {
      caption:
        'When the last part lands, the app calls `complete`. The app servers put a job on the **Task queue** and answer at once, and the creator sees that the video is processing.',
      flow: ['apps-servers', 'servers-queue'],
    },
    {
      caption:
        'A worker from the **Transcoders** pool takes the job. It reads the original and writes every rendition as segments a few seconds long, plus the manifests that list them, then marks the video `ready`.',
      flow: ['queue-workers', 'workers-store', 'workers-db'],
      notes: [{ target: 'workers', text: '5 renditions' }],
    },
    {
      caption:
        'A viewer presses play. The app servers return the title and the manifest’s address, and the player downloads the manifest and then the segments from object storage, one after another.',
      flow: ['apps-servers', 'servers-db', '<servers-db', '<apps-servers', 'apps-store', '<apps-store'],
    },
  ],
};

/** v2: a CDN for playback, a metadata cache, and chunked transcoding on an autoscaled pool. */
const itScales: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [cache, servers, queue, apps, db, workers, cdn, store],
  edges: [appsServers, serversDb, appsStore, serversQueue, queueWorkers, workersStore, workersDb, appsCdn, cdnStore, serversCache],
  steps: [
    {
      caption:
        'At 3 million streams, storage in one region becomes the bottleneck: about 9 terabits per second (ballpark) would leave it, and viewers far away wait on every segment.',
      flow: [{ edge: 'apps-store', tone: 'alert' }],
      notes: [{ target: 'store', text: '≈ 9 Tbps', tone: 'alert' }],
    },
    {
      caption:
        'Add a **CDN**: many edge servers close to viewers. The player fetches manifests and segments from the nearest edge, and popular segments are already there, so most requests never leave the viewer’s region.',
      add: ['cdn'],
      flow: [{ edge: 'apps-cdn', tag: 'hit' }, '<apps-cdn'],
    },
    {
      caption:
        'On a miss, the edge fetches the segment from object storage once and keeps it for a long time, because a segment never changes. An [[origin shield|origin-shield]], one more cache layer in front of storage, means each segment leaves storage about once rather than once per edge.',
      flow: [{ edge: 'apps-cdn', tag: 'miss', tone: 'alert' }, 'cdn-store', '<cdn-store', '<apps-cdn'],
    },
    {
      caption:
        'Metadata reads now go to the **Metadata cache** first, using [[cache-aside|cache-aside]]: the app servers check the cache and read the database only on a miss. Titles and manifest addresses rarely change, so nearly every read is a hit.',
      add: ['cache'],
      flow: ['apps-servers', { edge: 'servers-cache', tag: 'hit' }, '<servers-cache', '<apps-servers'],
    },
    {
      caption:
        'On the upload side, the first task cuts each original into chunks of about 10 seconds, and the **Task queue** gets one task per chunk and rendition. Hundreds of transcoders work on one video at once, and the pool grows and shrinks with the length of the queue.',
      flow: ['servers-queue', 'queue-workers', 'workers-store'],
      notes: [{ target: 'workers', text: 'autoscaled' }],
    },
  ],
};

/** v3: retries, dead letters, and playback that keeps going when storage or the database fails. */
const itSurvives: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [cache, servers, queue, dlq, apps, db, workers, cdn, store],
  edges: [appsServers, serversDb, appsStore, serversQueue, queueWorkers, workersStore, workersDb, appsCdn, cdnStore, serversCache, queueDlq],
  steps: [
    {
      caption:
        'A transcoder crashes halfway through a chunk. It never acknowledged its task, so after a timeout the **Task queue** hands the task to another transcoder. The retry writes to the same object key, so it replaces the half-finished file instead of adding a second one.',
      flow: ['queue-workers', 'workers-store'],
      notes: [
        { target: 'workers', text: '1 worker died', tone: 'alert' },
        { target: 'store', text: 'same key' },
      ],
    },
    {
      caption:
        'A corrupt upload crashes every transcoder that touches it: a [[poison message|poison-message]]. After three failed attempts its task moves to **Dead letters**, an engineer is alerted, and the creator sees that processing failed instead of waiting forever.',
      add: ['dlq'],
      flow: ['queue-workers', 'queue-dlq'],
      notes: [{ target: 'dlq', text: 'alert sent', tone: 'alert' }],
    },
    {
      caption:
        'Object storage in the main region goes down. Playback carries on: the **CDN** keeps serving the segments it already holds, and its misses go to a copy of every finished video kept in a second region.',
      fail: ['store'],
      flow: [{ edge: 'apps-cdn', tag: 'hit' }, '<apps-cdn'],
    },
    {
      caption:
        'The database’s primary fails, and a replica in another [[availability zone|availability-zone]] is promoted in under a minute (ballpark). Meanwhile uploads cannot start, but viewers keep watching: the cache answers metadata reads, and the CDN never needed the database.',
      fail: ['db'],
      flow: ['apps-servers', { edge: 'servers-cache', tag: 'hit' }, '<servers-cache', '<apps-servers', 'apps-cdn', '<apps-cdn'],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The problem                                                         */
/* ------------------------------------------------------------------ */

const problem: Problem = {
  id: 'video-streaming',
  title: 'Video streaming',
  tier: 2,
  flagship: true,
  minutes: 45,
  prompt:
    'Design a video platform like YouTube. Creators upload videos, and anyone should be able to watch them smoothly on a phone, a laptop or a television.',
  concepts: ['storage-types', 'queues-and-streams', 'cdns', 'latency-throughput-bandwidth', 'cost-awareness'],
  hints: [
    'There are two very different paths here: getting a video in, and getting it out to millions of viewers. Sketch each one on its own before you connect them.',
    'A raw upload is one huge file in one format, but viewers have small phones, big screens and connections that change from minute to minute. What has to happen to a video between upload and the first view, and should the creator wait for it?',
    'Upload straight to object storage with pre-signed links, then let a queue feed workers that transcode each video into several qualities, cut into segments a few seconds long and listed in a manifest. Players fetch the manifest and segments through a content delivery network and choose the quality of each segment from the bandwidth they measure.',
  ],
  clarifyingQuestions: [
    {
      q: 'Are we designing both upload and playback, or only playback?',
      why: 'Both is the usual answer, and it gives you two systems with very different shapes: a write path that pushes huge files through slow processing, and a read path that serves the same bytes millions of times. If it is playback only, transcoding (converting each upload into the formats players need) drops out, and the interview centers on the [[content delivery network|cdn]] (CDN).',
    },
    {
      q: 'Is this recorded video only, or live streaming too?',
      why: 'Recorded video can be processed for a few minutes before anyone watches it. Live video must be encoded and delivered within seconds of being filmed, which changes the whole pipeline. Assume recorded video and treat live streaming as a follow-up.',
    },
    {
      q: 'How many viewers and uploads a day, and how long is a typical video?',
      why: 'Views drive bandwidth, while uploads drive storage and processing, so these numbers size everything. Expect hundreds of views per upload (ballpark), which makes this a read-heavy design.',
    },
    {
      q: 'Which devices and networks do viewers use?',
      why: 'Phones on weak mobile signals need small, low-quality versions, while big screens on fast home connections want high resolution. A wide range means producing several versions of every video and letting the player switch between them.',
    },
    {
      q: 'How soon after upload must a video be watchable?',
      why: 'If a few minutes is fine, processing runs in the background from a queue. If creators expect long videos to be ready within minutes too, you split each video into chunks that are processed in parallel and publish the lowest quality first.',
    },
    {
      q: 'Is the audience global, and do we keep every video forever?',
      why: 'A global audience means serving video from servers near each viewer and keeping copies in more than one region. Keeping everything forever makes storage the fastest-growing cost, so rarely watched videos should move to cheaper storage.',
    },
  ],
  requirements: {
    functional: [
      'Creators upload a video of up to a few gigabytes with a title and description, and an interrupted upload resumes where it stopped.',
      'Each upload is turned into several versions at different resolutions and bitrates (bits of video per second), called renditions, so it plays on any device; the creator sees its status until it is ready.',
      'Viewers can watch any public video from the start or jump to any point in it.',
      'Playback adapts to the viewer’s connection, switching quality up or down without stopping.',
      'Each video shows an approximate view count.',
    ],
    nonFunctional: [
      'Fast start: playback begins within about 2 seconds (ballpark), and rebuffering, where the video pauses to load, is rare.',
      'High availability for playback: viewers keep watching even when uploads or processing are down.',
      'Durability: once an upload is confirmed, the video is never lost.',
      'Scale: millions of people watching at once, worldwide, with an evening peak.',
      'Cost: bandwidth and storage dominate the bill, so the design keeps both in check.',
      '[[Eventual consistency|eventual-consistency]] is fine for metadata and counts: a new video or a view can take a few seconds to show up everywhere.',
    ],
    outOfScope: [
      'Live streaming.',
      'Search, recommendations, comments and ads.',
      'Copy protection (digital rights management) and content moderation, beyond noting where they would plug in.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active viewers', value: '100 million (ballpark)' },
      { label: 'Views per viewer per day', value: '5' },
      { label: 'Views per upload', value: 'about 500, so about 1 million uploads a day' },
      { label: 'Average video, and average view', value: '5 minutes' },
      { label: 'Average bitrate streamed', value: 'about 3 megabits per second, a mix of phones and big screens, so about 100 MB per view' },
      { label: 'Stored per upload', value: 'about 1 GB: an original of about 400 MB plus every rendition, rounded up' },
      {
        label: 'Transcoding cost',
        value: 'about 5 processor-minutes per minute of video for all renditions (ballpark; the codec, meaning the compression method, and its settings can change this several times over)',
      },
      { label: 'Peak hour', value: 'about 2× the daily average' },
      {
        label: 'In the calculator',
        value: 'one object is one view’s worth of video (100 MB), so its storage line counts a single copy; multiply it by 10 for the original and every rendition',
      },
    ],
    steps: [
      {
        label: 'Views per second',
        math: '100 million × 5 = 500 million views a day; ÷ 100,000 seconds ≈ 5,000 a second; × 2 at peak',
        result: 'about 10,000 new streams a second at peak',
      },
      {
        label: 'Streams at once',
        math: '10,000 a second × 300 seconds each ([[Little’s law|littles-law]])',
        result: 'about 3 million concurrent streams at peak',
      },
      {
        label: 'Bandwidth out',
        math: '3 million × 3 megabits per second; or 500 million views × 100 MB a day',
        result: 'about 9 terabits per second at peak, and about 50 PB (petabytes) a day',
      },
      {
        label: 'Uploads coming in',
        math: '1 million a day ÷ 100,000 seconds ≈ 10 a second; × 400 MB each',
        result: 'about 4 GB a second of originals, roughly 30 to 40 gigabits per second',
      },
      {
        label: 'Storage',
        math: '1 million uploads × 1 GB',
        result: 'about 1 PB a day, roughly 365 PB a year',
      },
      {
        label: 'Transcoding',
        math: '1 million × 5 minutes × 5 processor-minutes = 25 million processor-minutes a day; ÷ 1,440 minutes in a day',
        result: 'about 17,000 processor cores busy around the clock, more at peak',
      },
      {
        label: 'Metadata reads',
        math: '10,000 new streams a second, each loading one video’s metadata, plus browsing',
        result: 'tens of thousands of small reads a second: cache them',
      },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 5, readsPerWrite: 500, objectBytes: 100_000_000, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'POST /v1/videos  { title, description, sizeBytes } → { videoId, uploadId, partSize, partUrls[] }',
      description:
        'Creates the video record with status `uploading` and returns one [[pre-signed URL|pre-signed-url]] per part: a uniform resource locator carrying a signature that allows exactly that upload, for a limited time. Parts are about 16 MB each (ballpark).',
    },
    {
      signature: 'PUT {partUrl}  <about 16 MB of the file> → ETag',
      description:
        'The app uploads parts straight to object storage, several in parallel. A failed part is retried on its own, which is what makes a 2 GB upload over a phone connection survivable.',
    },
    {
      signature: 'POST /v1/videos/{videoId}/complete  { parts: [{ number, etag }] } → 202 Accepted',
      description:
        'Asks object storage to join the parts into one file, marks the video `processing` and queues the first transcoding task. It answers at once; processing finishes minutes later.',
    },
    {
      signature: 'GET /v1/videos/{videoId} → { title, status, durationSec, manifestUrl, thumbnailUrl }',
      description: 'Metadata for the watch page. Once the status is `ready`, `manifestUrl` points at the video’s master manifest on the CDN.',
    },
    {
      signature: 'GET {cdn}/v/{videoId}/master.m3u8, then GET {cdn}/v/{videoId}/720p/seg-00042.m4s',
      description:
        'Playback is ordinary Hypertext Transfer Protocol (HTTP) downloads of small files, so any CDN can cache it. The player reads the master manifest, a small text file listing the renditions, picks one, and then fetches that rendition’s segments, each a few seconds of video, one by one.',
    },
    {
      signature: 'POST /v1/views  { videoId, sessionId, secondsWatched } → 202 Accepted',
      description:
        'The player reports progress in the background now and then. Events go onto an [[event stream|event-stream]] and are counted in batches, so counts are approximate and a few seconds behind.',
    },
  ],
  dataModel: [
    {
      entity: 'Video',
      fields: [
        'videoId (primary key)',
        'creatorId',
        'title, description',
        "status: 'uploading' | 'processing' | 'ready' | 'failed'",
        'durationSec',
        'renditions: [{ height, bitrateKbps, playlistPath }]',
        'createdAt',
      ],
      store: 'Relational database, for example PostgreSQL, with read replicas and a cache in front',
      why: 'Rows are small and only about 1 million arrive a day, so one primary handles the writes for a long time. Reads look up one video at a time and repeat constantly, which a cache absorbs. If the table outgrows one machine, [[shard|sharding]] it by `videoId`.',
    },
    {
      entity: 'Transcoding task',
      fields: [
        'taskId',
        'videoId',
        'rendition (for example 720p)',
        'chunkIndex',
        "status: 'queued' | 'running' | 'done' | 'failed'",
        'attempts',
        'outputPath',
      ],
      store: 'A message queue hands out the tasks; a task table in the same database tracks them',
      why: 'The [[message queue|message-queue]] gives each task to one worker and redelivers it if that worker dies. The table records which tasks are done, so the video turns `ready` exactly when its last task finishes, and a retry can skip work that is already finished.',
    },
    {
      entity: 'Video files',
      fields: [
        'raw/{videoId}/original',
        'v/{videoId}/master.m3u8',
        'v/{videoId}/{rendition}/playlist.m3u8',
        'v/{videoId}/{rendition}/seg-{n}.m4s',
        'v/{videoId}/thumbs/{n}.jpg',
      ],
      store: 'Object storage, replicated across availability zones, with finished videos copied to a second region',
      why: 'Video is huge, written once and read many times, which is exactly what [[object storage|object-storage]] is for: cheap per gigabyte, very durable, and readable by the CDN over plain web requests. Paths never change once written, so caches can keep the files for as long as they like.',
    },
    {
      entity: 'View count',
      fields: ['videoId', 'count', 'updatedAt'],
      store: 'Key-value store, updated in batches from the event stream',
      why: 'Writing every view to its own row would mean about 5,000 writes a second, piled onto the most popular videos. A [[stream processing|stream-processing]] job adds up events for a few seconds and writes one total per video to a [[key-value store|key-value-store]], which turns that into far fewer, larger writes.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Getting a video from a creator’s phone to a viewer’s screen, in a form every device can play.',
      diagram: itWorks,
      explanation:
        'Two habits carry the whole design. Big files move straight between apps and object storage, never through the app servers. Slow work happens in the background behind a queue, so an upload is accepted in seconds and processed over minutes. The weak spot is playback: every viewer downloads from storage in one region, which is slow far away and cannot serve millions of streams at once.',
    },
    {
      title: 'v2: It scales',
      solves: 'Millions of people watching at once, all over the world, and long uploads that should still be watchable within minutes.',
      diagram: itScales,
      explanation:
        'The CDN now carries almost all playback traffic, and object storage sees only the first request for each segment in each region. Splitting videos into chunks makes processing time depend on the size of the transcoder pool rather than the length of the video. Uploads still go straight to object storage, exactly as in v1.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'Crashing workers, corrupt uploads and outages in storage or the database, without losing a video or stopping playback.',
      diagram: itSurvives,
      explanation:
        'Every step of processing is safe to repeat: a task stays in the queue until a worker acknowledges it, and every output goes to a fixed path. Playback depends only on the CDN and replicated storage, so the fragile parts sit on the upload side, where a short delay is acceptable.',
    },
  ],
  deepDives: [
    {
      title: 'Adaptive bitrate streaming',
      problem:
        'Viewers’ bandwidth ranges from a weak mobile signal to fast home fiber, and it changes during a single video. One fixed quality either stalls on slow connections or looks poor on big screens. The standard answer is adaptive bitrate streaming, described by one of two formats: HTTP Live Streaming (HLS) or Dynamic Adaptive Streaming over HTTP (DASH).',
      options: {
        caption: 'Ways to deliver recorded video to players.',
        rows: [
          {
            option: 'One file, progressive download',
            goodAt: 'Simplest: one file per video, served by any web server or CDN.',
            badAt: 'One quality for everyone: it stalls on slow links, wastes data on small screens, and jumping far ahead needs byte-range requests.',
            pickWhen: 'Short clips where viewers have similar screens and connections.',
          },
          {
            option: 'Adaptive bitrate over HTTP (HLS or DASH)',
            goodAt: 'The player changes quality at every segment to match its measured bandwidth, and every file is a plain, cacheable download.',
            badAt: 'Several renditions to produce and store, and the first seconds often play at lower quality.',
            pickWhen: 'Recorded video for a broad audience on mixed devices: the standard choice.',
          },
          {
            option: 'Real-time streaming, such as WebRTC',
            goodAt: 'Under a second of delay, for calls and interactive live video.',
            badAt: 'Servers keep state for every viewer, CDNs cannot cache the stream, and each viewer costs far more to serve.',
            pickWhen: 'Video calls, and live video where viewers interact in real time.',
          },
        ],
      },
      recommendation:
        'Use adaptive bitrate streaming with about five renditions from 240p to 1080p, plus 4K for big screens, cut into segments of 2 to 6 seconds and described by HLS and DASH manifests. The player starts on a low rendition so the first frame appears quickly, steps up while its buffer fills, and steps down as soon as downloads slow. Shorter segments adapt faster but mean more requests and slightly worse compression. Because all the logic lives in the player, the servers stay simple file servers that any CDN can cache.',
    },
    {
      title: 'The transcoding pipeline',
      problem:
        'On one machine, transcoding an hour-long video into five renditions can take longer than the video itself. Creators expect to see it live within minutes, and a crash near the end should not restart everything.',
      options: {
        caption: 'Ways to split the work of transcoding one video.',
        rows: [
          {
            option: 'One task per video',
            goodAt: 'Simple to build and to track: one worker, one status.',
            badAt: 'An hour of video takes hours, and a crash restarts it from the beginning.',
            pickWhen: 'Short clips at small scale.',
          },
          {
            option: 'One task per rendition',
            goodAt: 'Renditions run in parallel, and the lowest can be published first.',
            badAt: 'Still bound by the length of the video, and the slowest rendition sets the finish time.',
            pickWhen: 'Medium-length videos and a simple pipeline.',
          },
          {
            option: 'Split into chunks, transcode in parallel, then join',
            goodAt: 'Hundreds of workers share one video, so any length finishes in minutes, and a failed chunk retries alone.',
            badAt: 'Each chunk must start at a keyframe, a frame stored in full rather than as changes from the one before; joining needs care, and there are many more tasks to track.',
            pickWhen: 'Long videos at large scale: the usual answer for a big platform.',
          },
        ],
      },
      recommendation:
        'Split each original into chunks of about 10 seconds at keyframes, and queue one task per chunk and rendition. Record each finished task in the task table, and join a rendition’s chunks once all of them are done, publishing the low renditions first so the video goes live sooner. Name every output by video, rendition and chunk, so a retried task overwrites its own file and duplicates are harmless. A workflow engine can run these steps as a graph, which is [[orchestration|orchestration]] rather than a chain of hand-written callbacks.',
    },
    {
      title: 'Delivering 9 terabits per second',
      problem:
        'At peak, about 9 terabits per second (ballpark) leave the system, which makes delivery the largest cost and the largest risk. Popularity is very uneven: a few videos get most of the views, while most videos are watched rarely.',
      options: {
        caption: 'Ways to get segments to viewers.',
        rows: [
          {
            option: '[[Pull CDN|pull-cdn]] for everything',
            goodAt: 'Simple: edges fill themselves on the first request in each region.',
            badAt: 'The first viewers in each region wait on a miss, and a sudden hit sends a burst of misses toward storage.',
            pickWhen: 'The default, and the right answer for the long tail of rarely watched videos.',
          },
          {
            option: '[[Push|push-cdn]] popular videos ahead of time',
            goodAt: 'No cold misses for predictable hits, and copies can move overnight while links are quiet.',
            badAt: 'Needs a popularity forecast, and wastes edge space when the forecast is wrong.',
            pickWhen: 'Demand you can predict, such as a new episode of a popular series.',
          },
          {
            option: 'Several CDN providers',
            goodAt: 'Survives one provider’s outage and keeps prices competitive.',
            badAt: 'More setup, and each provider’s caches warm up separately, so there are more misses.',
            pickWhen: 'An outage at one provider would be unacceptable.',
          },
          {
            option: 'Your own CDN inside internet providers’ networks',
            goodAt: 'The lowest cost per gigabyte at huge scale, and the shortest path to viewers.',
            badAt: 'Years of work, and hardware in hundreds of locations.',
            pickWhen: 'Only at the very largest scale.',
          },
        ],
      },
      recommendation:
        'Start with a commercial pull CDN plus an origin shield. Cache segments for a year under versioned paths and manifests for a few minutes, and push predictable hits ahead of time. Watch the [[egress|egress]] bill, because it grows with every view: at the high-volume ballpark prices in [Cost awareness](lesson:cost-awareness), 50 PB a day is tens of millions of dollars a month. Netflix’s Open Connect, described in [CDNs](lesson:cdns), shows where this road ends: servers placed inside, or directly connected to, internet providers’ networks.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load on one video: a viral hit or a premiere',
      impact:
        'Millions of requests arrive for the same segments within minutes. The CDN absorbs them, but the first miss for each segment in every region heads for storage at once, a [[cache stampede|cache-stampede]].',
      mitigation:
        'An origin shield plus [[request coalescing|request-coalescing]], so each segment leaves storage about once. For a scheduled premiere, push the first minutes of every rendition to the edges ahead of time.',
    },
    {
      scenario: '10× uploads: everyone posts after a big event',
      impact: 'The task queue grows and new videos take longer to become ready. Playback is unaffected.',
      mitigation:
        '[[Autoscale|autoscaling]] the transcoders on [[queue depth|queue-depth]], transcode the lowest renditions first so videos go live sooner, and run the backlog on cheaper [[spot instances|spot-instance]].',
    },
    {
      scenario: '100× load across the whole platform',
      impact:
        'Delivery nears a petabit per second, storage grows by about 100 PB a day, and transcoding would need well over a million processor cores (ballpark). Every line of the bill grows a hundredfold.',
      mitigation:
        'Place servers inside internet providers’ networks, spend extra compute on newer codecs for popular videos so each view needs fewer bits, move rarely watched videos to colder [[storage classes|storage-class]], and transcode the long tail only when someone asks.',
    },
    {
      scenario: 'A transcoder dies in the middle of a task',
      impact: 'That chunk finishes late; nothing is lost.',
      mitigation:
        'The queue redelivers unacknowledged tasks after a timeout, outputs go to fixed paths so retries overwrite, and a task that fails three times moves to a [[dead-letter queue|dead-letter-queue]].',
    },
    {
      scenario: 'The task queue goes down',
      impact: 'No new videos finish processing, though uploads still land in object storage and playback is untouched.',
      mitigation:
        'Run the queue replicated across zones. Because every video’s status lives in the database, a sweeper can re-queue anything stuck in `processing` once the queue is back.',
    },
    {
      scenario: 'Object storage fails in one region',
      impact: 'Cached segments keep playing, but misses and new uploads fail in that region.',
      mitigation:
        'Copy finished renditions to a second region and give the CDN a backup origin. Send new uploads to the second region’s storage until the first recovers.',
    },
    {
      scenario: 'The CDN fails in one region',
      impact: 'Viewers there get errors, or are sent to edges much farther away.',
      mitigation:
        'Use two CDN providers and steer viewers to the healthy one. A manifest can list a backup address, so the player retries a failed segment elsewhere.',
    },
    {
      scenario: 'The video database’s primary fails',
      impact:
        'New uploads and status changes fail for under a minute. Watch pages keep working from the cache, and playback never touches the database.',
      mitigation: 'Automatic [[failover|failover]] to a replica, and longer cache lifetimes for metadata during the incident.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates the upload path from the playback path, with video files in object storage and metadata in a database.',
        'Knows each video must be converted into several formats before it plays everywhere, and runs that work in the background.',
        'Serves playback through a CDN and can say why.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Uploads straight to object storage with pre-signed URLs, in parts that can resume.',
        'Explains adaptive bitrate streaming: renditions, segments, manifests and a player that picks the quality of each segment.',
        'Estimates bandwidth and storage, and concludes that delivery dominates.',
        'Makes transcoding tasks safe to retry, with a dead-letter queue for videos that always fail.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Designs a chunked, parallel transcoding pipeline and reasons about how long a long video takes to become watchable.',
        'Treats cost as a design input: egress, storage classes, codec choice (compute against bandwidth) and lazy transcoding for the long tail.',
        'Plans for viral spikes and outages: origin shield, request coalescing, a second CDN, and playback that survives back-end failures.',
        'Says what is out of scope, such as live streaming or copy protection, and how each would change the design.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A creator’s upload dies at 90% on a train. What happens?',
      a: 'Nothing is lost. Every confirmed part is already in object storage, so the app asks which parts arrived and uploads only the rest under the same upload session. Sessions that are never completed are cleaned up after a day or so by a [[lifecycle rule|lifecycle-rule]].',
    },
    {
      q: 'A celebrity premieres a video, and 5 million people press play in the same minute. Walk me through it.',
      a: 'The metadata comes from the cache, and the manifest and first segments were pushed to the edges before the premiere. Misses that remain are coalesced at the origin shield, so storage sees each segment about once. View events are counted in batches from the stream, so the counter never becomes a [[hot spot|hot-spot]].',
    },
    {
      q: 'How would you add live streaming?',
      a: 'The broadcaster sends a stream to ingest servers, which transcode it into the same renditions in real time and write a new segment every few seconds. The live manifest changes with each segment, so the CDN caches it for only a second or two, while segments are cached as usual. Expect a delay from a few seconds to about half a minute (ballpark), set mostly by segment length and how many segments the player buffers.',
    },
    {
      q: 'Your storage bill doubles every year. What would you change?',
      a: 'Most videos are rarely watched after their first weeks, so a lifecycle rule moves them to a colder storage class. For the long tail, keep the original and a couple of renditions, and produce the rest only when someone asks. Popular videos go the other way: spend more compute on a newer codec, because the bandwidth saved on every view pays for it.',
    },
    {
      q: 'How do you count views accurately enough to pay creators?',
      a: 'Keep two counts. The number on the page comes from batching the stream of player events, so it is approximate and a little behind. The count used for payment comes from a daily job over the raw events that applies [[deduplication|deduplication]] by session and filters out bots, so it is exact but a day late.',
    },
    {
      q: 'Some videos are private. How do you stop strangers from watching them when the CDN caches everything?',
      a: 'Give the player a short-lived signed address or cookie for the manifest and segments, and have the CDN check the signature at the edge before serving. Keep the signature out of the cache key, so every allowed viewer shares one cached copy. It is the pre-signed URL idea again, this time for reading.',
    },
    {
      q: 'A transcoder bug corrupted the 720p rendition of a million videos last week. How do you fix it?',
      a: 'Because originals are kept, re-run the pipeline for the affected renditions. Write the fixed segments under a new versioned path and update the manifests, which are cached only briefly, so players switch to the new files; this is [[cache busting|cache-busting]]. Overwriting the old paths would not work, since edges could keep serving the cached bad copies for up to a year.',
    },
  ],
  rubric: [
    { item: 'Separated upload from playback, with files in object storage and metadata in a database', weight: 15, lessonId: 'storage-types' },
    { item: 'Uploaded directly to object storage with pre-signed, resumable multipart uploads', weight: 10, lessonId: 'storage-types' },
    { item: 'Ran transcoding behind a queue, with safe retries and a dead-letter queue', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Explained adaptive bitrate streaming: renditions, segments, manifests and player-side switching', weight: 20, lessonId: 'latency-throughput-bandwidth' },
    { item: 'Served playback through a CDN, with long cache lifetimes and a plan for viral spikes', weight: 15, lessonId: 'cdns' },
    { item: 'Estimated bandwidth, storage and processing, and saw that delivery dominates', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Treated cost as a design input: egress, storage classes and the long tail', weight: 10, lessonId: 'cost-awareness' },
    { item: 'Kept playback working when processing, storage or the database fails', weight: 5, lessonId: 'multi-region-dr' },
  ],
};

export default problem;
