import type { DiagramSpec, Problem } from '../types';

/** v1: one click server adds 1 to a row per ad per minute, on the redirect path. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: 'clicking ads', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'Click server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'counts per minute', x: 2, y: 0 },
    { id: 'landing', type: 'external', label: 'Landing page', x: 0, y: 1 },
    { id: 'adv', type: 'client', label: 'Advertiser', x: 1, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: '+1' },
    { id: 'users-landing', from: 'users', to: 'landing', kind: 'sync', label: 'redirect' },
    { id: 'adv-app', from: 'adv', to: 'app', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A user clicks an ad. The **click server** adds 1 to the row for that ad and minute in the **database**, then answers with a `302` redirect.',
      flow: ['users-app', 'app-db', '<app-db', { edge: 'users-app', reverse: true, tag: '302' }],
      notes: [{ target: 'db', text: 'ad 42, 18:07: +1' }],
    },
    {
      caption: 'The browser follows the redirect to the advertiser’s **landing page**. The click cost one database write while the user waited.',
      flow: ['users-landing'],
    },
    {
      caption:
        'The **advertiser** opens the dashboard, and the click server reads that ad’s rows for the chosen dates. It is simple, and right only as long as nothing retries and no ad goes viral.',
      flow: ['adv-app', 'app-db', '<app-db', '<adv-app'],
    },
  ],
};

/** v2: clicks are appended to a stream and counted in one-minute windows, off the redirect path. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'click', type: 'service', label: 'Click service', sublabel: 'many copies', x: 1, y: 0 },
    { id: 'landing', type: 'external', label: 'Landing page', x: 0, y: 1 },
    { id: 'stream', type: 'stream', label: 'Click stream', sublabel: '64 partitions', x: 1, y: 1 },
    { id: 'agg', type: 'worker', label: 'Aggregator', sublabel: 'stream processor', x: 2, y: 1 },
    { id: 'counts', type: 'sqlDb', label: 'Minute counts', sublabel: 'analytics store', x: 3, y: 1 },
    { id: 'adv', type: 'client', label: 'Advertiser', x: 2, y: 2 },
    { id: 'query', type: 'service', label: 'Query API', x: 3, y: 2 },
  ],
  edges: [
    { id: 'users-click', from: 'users', to: 'click', kind: 'sync' },
    { id: 'users-landing', from: 'users', to: 'landing', kind: 'sync' },
    { id: 'click-stream', from: 'click', to: 'stream', kind: 'async', label: 'append' },
    { id: 'stream-agg', from: 'stream', to: 'agg', kind: 'async' },
    { id: 'agg-counts', from: 'agg', to: 'counts', kind: 'sync', label: 'upsert' },
    { id: 'adv-query', from: 'adv', to: 'query', kind: 'sync' },
    { id: 'query-counts', from: 'query', to: 'counts', kind: 'sync' },
  ],
  // Phones: the wide layout's first two columns, then the counting path down the middle with the advertiser beside it.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 0, y: 0 },
      click: { x: 1, y: 0 },
      landing: { x: 0, y: 1 },
      stream: { x: 1, y: 1 },
      agg: { x: 1, y: 2 },
      counts: { x: 1, y: 3 },
      adv: { x: 2, y: 2 },
      query: { x: 2, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'A click reaches the **click service**, which checks the signature on the ad’s click token, appends one click event to the **click stream** and redirects at once. The append takes a few milliseconds (ballpark), and nothing else sits on the user’s path.',
      flow: ['users-click', 'click-stream', { edge: 'users-click', reverse: true, tag: '302' }, 'users-landing'],
      notes: [{ target: 'stream', text: '50,000 events/s at peak' }],
    },
    {
      caption:
        'The **aggregator**, a stream processor such as Apache Flink, reads its share of the partitions. It skips any click ID it has seen in the last hour and adds the rest to a running count per ad, per minute of event time.',
      flow: ['stream-agg'],
      notes: [{ target: 'agg', text: 'skips repeats' }],
    },
    {
      caption:
        'When the [[watermark|watermark]] passes the end of a minute, the aggregator writes that minute’s counts to **minute counts**, each keyed by ad and minute. A viral ad’s 30,000 clicks in a minute become one row.',
      flow: ['agg-counts'],
      notes: [{ target: 'counts', text: 'one row per ad-minute' }],
    },
    {
      caption:
        'An **advertiser** opens the dashboard. The **query API**, the application programming interface behind it, reads that ad’s rows from the analytics store; a range longer than a few days reads hourly or daily rollups instead of minutes.',
      flow: ['adv-query', 'query-counts', '<query-counts', '<adv-query'],
    },
  ],
};

/** v3: raw clicks are archived, and a nightly batch job computes exact totals and checks the fast ones. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'click', type: 'service', label: 'Click service', x: 0, y: 0 },
    { id: 'stream', type: 'stream', label: 'Click stream', sublabel: 'kept 7 days', x: 1, y: 0 },
    { id: 'agg', type: 'worker', label: 'Aggregator', x: 2, y: 0 },
    { id: 'counts', type: 'sqlDb', label: 'Minute counts', sublabel: 'provisional', x: 3, y: 0 },
    { id: 'archive', type: 'objectStore', label: 'Raw click archive', sublabel: 'kept 1 year', x: 1, y: 1 },
    { id: 'batch', type: 'worker', label: 'Batch job', sublabel: 'nightly', x: 2, y: 1 },
    { id: 'billing', type: 'sqlDb', label: 'Daily totals', sublabel: 'for billing', x: 2, y: 2 },
  ],
  edges: [
    { id: 'click-stream', from: 'click', to: 'stream', kind: 'async' },
    { id: 'stream-agg', from: 'stream', to: 'agg', kind: 'async' },
    { id: 'agg-counts', from: 'agg', to: 'counts', kind: 'sync' },
    { id: 'stream-archive', from: 'stream', to: 'archive', kind: 'async', label: 'hourly files' },
    { id: 'archive-batch', from: 'archive', to: 'batch', kind: 'sync' },
    { id: 'batch-billing', from: 'batch', to: 'billing', kind: 'sync', label: 'exact totals' },
    { id: 'batch-counts', from: 'batch', to: 'counts', kind: 'sync' },
  ],
  // Phones: the click path down the left, the fast counts to its right, and the nightly batch path below the archive.
  narrow: {
    grid: { cols: 2, rows: 5 },
    positions: {
      click: { x: 0, y: 0 },
      stream: { x: 0, y: 1 },
      agg: { x: 1, y: 1 },
      archive: { x: 0, y: 2 },
      counts: { x: 1, y: 2 },
      batch: { x: 0, y: 3 },
      billing: { x: 0, y: 4 },
    },
  },
  steps: [
    {
      caption:
        'A sink connector copies every event from the **click stream** to the **raw click archive** in object storage, as hourly files. The archive keeps every click for a year, and every number downstream can be rebuilt from it.',
      flow: ['click-stream', 'stream-archive'],
    },
    {
      caption: 'Meanwhile the **aggregator** keeps **minute counts** fresh for the dashboard, as in v2. Those counts are marked provisional.',
      flow: ['stream-agg', 'agg-counts'],
    },
    {
      caption:
        'A few hours after midnight, once late clicks and fraud flags are in, the **batch job** reads the whole day’s files. It removes duplicates across the full day, drops clicks marked invalid, and writes exact totals per ad to **daily totals**, which billing reads.',
      flow: ['archive-batch', 'batch-billing'],
      notes: [{ target: 'batch', text: 'whole-day dedup' }],
    },
    {
      caption:
        'Then it compares its totals with the stream’s, ad by ad. A gap under about 0.1% (ballpark) is expected, and the exact numbers replace the provisional ones; a bigger gap pages an engineer, because it means a bug.',
      flow: ['batch-counts'],
      notes: [{ target: 'counts', text: 'marked final' }],
    },
  ],
};

/** v4: what each failure does to clicks and counts. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'click', type: 'service', label: 'Click service', sublabel: 'three zones', x: 1, y: 0 },
    { id: 'stream', type: 'stream', label: 'Click stream', sublabel: '3 copies', x: 1, y: 1 },
    { id: 'agg', type: 'worker', label: 'Aggregator', sublabel: 'checkpoints', x: 2, y: 1 },
    { id: 'counts', type: 'sqlDb', label: 'Minute counts', x: 3, y: 1 },
    { id: 'adv', type: 'client', label: 'Advertiser', x: 2, y: 2 },
    { id: 'query', type: 'service', label: 'Query API', x: 3, y: 2 },
  ],
  edges: [
    { id: 'users-click', from: 'users', to: 'click', kind: 'sync' },
    { id: 'click-stream', from: 'click', to: 'stream', kind: 'async' },
    { id: 'stream-agg', from: 'stream', to: 'agg', kind: 'async' },
    { id: 'agg-counts', from: 'agg', to: 'counts', kind: 'sync' },
    { id: 'adv-query', from: 'adv', to: 'query', kind: 'sync' },
    { id: 'query-counts', from: 'query', to: 'counts', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every tier runs several copies across three [[availability zones|availability-zone]]. Each stream partition lives on three brokers ([[replication factor|replication-factor]] 3), and an append counts only once two of them have it.',
      flow: ['users-click', 'click-stream', 'stream-agg', 'agg-counts'],
    },
    {
      caption:
        'The stream is unreachable. The **click service** still redirects every user and writes events to its local disk, sending them once the stream is back. Those clicks arrive late, so allowed lateness or the nightly batch counts them.',
      fail: ['stream'],
      flow: ['users-click', { edge: 'users-click', reverse: true, tag: '302' }],
      notes: [{ target: 'click', text: 'spooling to disk' }],
    },
    {
      caption:
        'The **aggregator** crashes mid-minute. It restarts from its last checkpoint, which saved its counts, its seen click IDs and its stream offsets together, and replays the events since; the windows rewrite the same rows, so nothing counts twice.',
      fail: ['agg'],
      flow: ['click-stream'],
      notes: [{ target: 'stream', text: 'events wait' }],
    },
    {
      caption:
        'The **minute counts** store is down. The aggregator retries and stops reading new events while writes are stuck ([[backpressure|backpressure]]), so [[consumer lag|consumer-lag]] grows but nothing is lost. The **query API** serves its last cached results, marked as delayed.',
      fail: ['counts'],
      flow: ['adv-query', { edge: 'adv-query', reverse: true, tag: 'cached' }],
      notes: [{ target: 'agg', text: 'retrying', tone: 'alert' }],
    },
  ],
};

const problem: Problem = {
  id: 'ad-click-aggregator',
  title: 'Ad click aggregator',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a system that counts clicks on online ads. Advertisers watch clicks per ad, minute by minute, on a dashboard that should be about a minute behind, and they pay for every click, so the totals they are billed on must be right.',
  concepts: ['back-of-the-envelope', 'queues-and-streams', 'batch-vs-stream', 'idempotency', 'sharding', 'cqrs-event-sourcing', 'sql-vs-nosql'],
  hints: [
    'Two jobs hide in this prompt: recording each click the moment it happens, and turning a billion clicks a day into counts. Which one sits in front of a waiting user, which one can run a minute late, and should one machine do both?',
    'Clicks arrive twice (double taps, retries, replays after a crash), and some arrive late. Think about what unique identifier (ID) each click could carry so a counting job can spot repeats, and whose clock decides which minute a click belongs to.',
    'One shape that works: a click service appends each click to a partitioned [[event stream|event-stream]] and redirects at once; a [[stream processor|stream-processing]] skips repeated click IDs and counts clicks per ad in one-minute [[tumbling windows|tumbling-window]]; an analytics store serves the dashboard; and a nightly batch job recounts the archived raw clicks exactly, for billing and to check the fast numbers.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many clicks a day, and how spiky is the traffic?',
      why: 'This sets the ingest rate and the number of stream partitions. Assume about a billion clicks a day, with the busiest hour around five times the average (ballpark): about 10,000 clicks a second on average and 50,000 at peak.',
    },
    {
      q: 'How fresh must the dashboard be, and are those the numbers advertisers pay on?',
      why: 'If a minute of delay is fine, counting moves off the click path into a stream processor that works a minute at a time. If billing needs exact totals, the fast numbers can be provisional while a slower, exact job settles the bill and checks the fast path ([[reconciliation|reconciliation]]), which splits the design in two.',
    },
    {
      q: 'Can the same click reach us twice, and should it count twice?',
      why: 'It can: a double tap, a browser retry or a replay inside the pipeline. Billing counts each click once, so every click needs an ID and the pipeline needs [[deduplication|deduplication]]; it also helps to agree that one ad view can earn at most one billable click.',
    },
    {
      q: 'Which dimensions do advertisers filter by, and how far back do they look?',
      why: 'Each dimension, such as country or device, multiplies the rows per ad per minute. Long ranges call for rolling minutes up into hours and days, so a year-long chart reads 365 rows, not half a million.',
    },
    {
      q: 'Who decides that a click is fraudulent or invalid, and how soon?',
      why: 'If a separate fraud service flags clicks hours later, billing totals cannot be final in real time. That pushes the exact count into a batch job that runs after the flags arrive, and lets the fast count stay simple.',
    },
    {
      q: 'Do all clicks pass through our redirect, or do apps also report clicks themselves?',
      why: 'A redirect hands the server each click as it happens, timestamped by a clock we run. Apps that send clicks in batches bring [[late events|late-event]] and device clocks that can be wrong or forged, so the design needs a rule for both.',
    },
  ],
  requirements: {
    functional: [
      'Record every click on an ad and send the user on to the advertiser’s landing page.',
      'Let advertisers query clicks per ad and per campaign, by minute, hour or day, filtered by country and device.',
      'Show new clicks on the dashboard within about a minute (ballpark).',
      'Produce exact daily click totals per ad for billing, without duplicates and without clicks flagged as invalid.',
    ],
    nonFunctional: [
      'Correct for billing: no click lost and none counted twice in the final totals.',
      'Fast clicks: recording a click adds a few milliseconds at most to the redirect (ballpark), and a slow counting pipeline never delays it.',
      'Highly available click recording, around 99.99% (a ballpark target), since a click we fail to record is revenue nobody can bill.',
      'Dashboard counts lag by about a minute; billing totals are final a few hours after each day ends (ballpark).',
      'Scale: about a billion clicks a day, peaks of 50,000 a second, and 10 million active ads (ballpark).',
    ],
    outOfScope: [
      'Choosing which ad to show (the auction) and counting impressions, which works the same way at a larger scale.',
      'Building fraud models: a separate service marks clicks invalid, and this design honors its flags.',
      'Invoices and payments: billing receives one final count per ad per day.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Clicks per day', value: 'about 1 billion (ballpark)' },
      { label: 'Busiest hour compared with the daily average', value: '5×, because big events and sales cause spikes' },
      { label: 'Bytes per raw click event', value: 'about 500: IDs, timestamps, country, device, and hashed Internet Protocol (IP) address and browser details' },
      { label: 'Ads with at least one click in a given minute', value: 'about 200,000 of 10 million active ads (ballpark)' },
      { label: 'How long raw clicks are kept', value: '7 days in the stream, 1 year in the archive' },
      {
        label: 'In the calculator',
        value: '200 million people who click, 10 actions each: 5 clicks, each written once and read once by the aggregator, so 1 read per write; one object is one 500-byte click event',
      },
    ],
    steps: [
      { label: 'Clicks per second', math: '10⁹ clicks ÷ 10⁵ seconds a day', result: '≈ 10,000 a second, 50,000 at peak' },
      { label: 'Incoming bandwidth', math: '50,000 clicks a second × 500 bytes', result: '≈ 25 MB a second at peak: easy for a partitioned stream' },
      { label: 'Raw storage', math: '10⁹ × 500 bytes ≈ 500 GB a day; × 365', result: '≈ 180 TB a year before compression' },
      { label: 'Minute counts', math: '200,000 ads × 1,440 minutes ≈ 3 × 10⁸ rows a day; × about 100 bytes with dimensions', result: '≈ 30 GB a day, about 15× smaller than the raw clicks' },
      { label: 'Aggregator workers', math: '50,000 events a second ÷ about 5,000 per worker (ballpark)', result: '≈ 10 workers at peak; create 64 partitions so the job can grow' },
      { label: 'Memory to spot repeats', math: '50,000 click IDs a second × 3,600 seconds × about 20 bytes', result: '≈ 4 GB for an hour of IDs, spread across the workers' },
    ],
    calculator: { dau: 200_000_000, actionsPerUser: 10, readsPerWrite: 1, objectBytes: 500, peakFactor: 5, retentionYears: 1 },
  },
  api: [
    {
      signature: 'GET /c/{clickToken}  →  302 Found, Location: <landing page>',
      description:
        'The link behind every ad. The ad server signs the token when it shows the ad, and it carries the ad ID, the impression ID and the time, so clicks can’t be invented or edited. The click service checks the signature, appends one event and redirects without waiting for anything else.',
    },
    {
      signature: 'POST /v1/clicks  { events: [{ clickId, adId, occurredAt }] }  →  202 Accepted',
      description:
        'For apps that report clicks themselves, in small batches. Each event carries a click ID made on the device, so a resent batch is recognized; `occurredAt` is trusted only within a few minutes of the server’s own time.',
    },
    {
      signature: 'GET /v1/ads/{adId}/clicks?from=…&to=…&granularity=minute|hour|day&groupBy=country  →  200 { buckets: [{ start, clicks, final }] }',
      description:
        'The dashboard query. Ranges longer than a few days read hourly or daily rollups, and `final` says whether the batch job has settled a bucket or it may still change.',
    },
    {
      signature: 'GET /v1/billing/daily?date=2026-11-18  →  200 { rows: [{ adId, billableClicks, invalidClicks, version }] }',
      description:
        'Internal, for the billing system, and only for closed days. A correction after a day closes creates a new `version` rather than quietly changing a number someone was already billed on.',
    },
  ],
  dataModel: [
    {
      entity: 'Click event',
      fields: ['click_id: the impression ID from the signed token', 'ad_id, campaign_id, advertiser_id', 'event_time: set by the click service', 'country, device, placement', 'ip_hash, browser_hash'],
      store: 'Event stream such as Kafka, partitioned by click ID, three copies, kept 7 days',
      why: 'Clicks are append-only and bursty. The stream absorbs peaks, lets the aggregator replay after a crash or a bug, and feeds several readers at once: the aggregator, the archive and the fraud service. Using the click ID as the [[partition key|partition-key]] spreads load evenly and sends every copy of a click to the same [[partition|partition]], where repeats are easy to spot.',
    },
    {
      entity: 'Raw click archive',
      fields: ['date and hour: one folder per hour', 'files of click events in a columnar format such as Parquet'],
      store: 'Object storage such as Amazon S3, written hourly from the stream, kept a year',
      why: 'This is the [[source of truth|source-of-truth]]: every number the system shows derives from it, so any of them can be recomputed. [[Object storage|object-storage]] is the cheapest place for 180 TB a year (ballpark), and columnar files compress well and let the batch job read only the columns it needs.',
    },
    {
      entity: 'Minute counts',
      fields: ['ad_id, campaign_id', 'minute', 'country, device', 'clicks', 'final: boolean'],
      store: 'Column-oriented analytics database such as Apache Druid, Apache Pinot or ClickHouse; minutes rolled up into hours after 7 days and days after 90',
      why: 'Dashboards filter by dimensions and sum over time ranges, which is what online analytical processing (OLAP) stores are built for. The aggregator writes each window as an [[upsert|upsert]] keyed by ad and minute, so a replay rewrites a row instead of adding to it.',
    },
    {
      entity: 'Daily totals',
      fields: ['ad_id', 'date', 'billable_clicks, invalid_clicks', 'version', 'computed_at'],
      store: 'Relational database with transactions',
      why: 'At most 10 million rows a day (ballpark), read by billing and auditors. Versioned rows keep a clear record of every correction, which matters far more here than speed.',
    },
    {
      entity: 'Seen click IDs',
      fields: ['click_id', 'first_seen_at'],
      store: 'The aggregator’s own state on local disk, saved in each checkpoint along with its stream offsets',
      why: 'Spotting a repeat needs a lookup for every click. An hour of IDs, about 60 MB per partition at peak (ballpark), fits inside each worker, so there is no network call per click; saving it with the stream [[offsets|offset]] keeps the two in step after a restart.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Count clicks per ad per minute and show them to advertisers, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One click server and one relational database handle a few clicks a second easily. It breaks at scale: every click is a database write while the user waits, a popular ad turns its counter row into a [[hot spot|hot-spot]], and a retried request counts twice.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 10,000 clicks a second, 50,000 at peak (ballpark): far too many writes for one database on the redirect path.',
      diagram: v2,
      explanation:
        'Recording a click is now one append, and counting happens off the redirect path, a minute at a time. The stream absorbs spikes, and if the aggregator falls behind, clicks wait instead of being lost. These counts are fast but provisional; the next stage makes them exact.',
    },
    {
      title: 'v3: Exact counts for billing',
      solves:
        'Fast counts can be slightly off: a duplicate that arrives after an hour, a click later than its window, a fraud flag that comes the next morning. Advertisers pay per click, so billing needs totals that are exact and can be checked.',
      diagram: v3,
      explanation:
        'The stream gives fast numbers and the batch gives right ones: the [[lambda architecture|lambda-architecture]]. Its cost is two code paths that must agree, so both use one shared library for validation and dedup rules, and the nightly comparison catches drift. Because every number derives from the archive, a bug is fixed by recomputing, not by patching rows.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead broker, aggregator or analytics store must not lose a click or count one twice, and none of them may slow a redirect.',
      diagram: v4,
      explanation:
        'Every failure turns into delay, never loss: clicks wait on the click service’s disk or in the stream, and replays are harmless because repeats are skipped and writes overwrite. A second region with its own click service and stream turns a regional outage into late counts, and the batch job merges both regions’ archives.',
    },
  ],
  deepDives: [
    {
      title: 'Counting each click exactly once',
      problem:
        'Duplicates come from everywhere: a user double-taps, a browser retries, the click service retries an append, and the aggregator replays events after a crash. Streams deliver [[at least once|at-least-once]], so the pipeline must make repeats harmless, and billing can’t overcount even slightly.',
      options: {
        caption: 'Ways to stop a click counting twice',
        rows: [
          {
            option: 'Count everything and accept the overcount',
            goodAt: 'Simplest and fastest, with no state to keep.',
            badAt: 'Double taps and replays inflate the counts, and advertisers pay for clicks that never happened.',
            pickWhen: 'Internal trend charts, where a small overcount is harmless.',
          },
          {
            option: 'Skip repeated click IDs in the stream processor',
            goodAt:
              'Each worker keeps the IDs it saw in the last hour and skips repeats. With the stream partitioned by click ID, every copy of a click reaches the same worker, so no worker has to ask another.',
            badAt: 'Memory for an hour of IDs (about 4 GB at peak, ballpark), and a repeat that arrives after the hour slips through.',
            pickWhen: 'The default for the fast path, backed by a whole-day dedup in the batch job.',
          },
          {
            option: 'Checkpoints plus overwriting writes',
            goodAt:
              'The processor saves its state and its stream offsets together, and writes each window as one row keyed by ad and minute. A replay after a crash rebuilds the same window and rewrites the same row: [[exactly-once processing|exactly-once]] effects.',
            badAt: 'The sink must accept whole-window totals that replace a row, never “add 1” increments.',
            pickWhen: 'Always, alongside dedup: this is what makes a crash harmless.',
          },
          {
            option: 'Transactional sink',
            goodAt:
              'Some processors, such as Flink writing to Kafka, commit their output and their offsets in one [[transaction|transaction]], so readers never see half a window.',
            badAt: 'Readers see results only when each checkpoint commits, which adds seconds of delay, and the sink must support transactions.',
            pickWhen: 'The output is another stream that other jobs read.',
          },
        ],
      },
      recommendation:
        'Give every click an ID before it enters the system: the impression ID inside the signed token, so a double tap on one ad view is one click. Skip repeats in the aggregator for an hour, checkpoint state and offsets together, and write whole windows as upserts. A replay after a crash then changes nothing, and the batch job’s whole-day dedup catches the rare repeat that arrives later.',
    },
    {
      title: 'Late clicks and whose clock to trust',
      problem:
        'A minute’s count can only be published once the minute is over, but its clicks keep trickling in: from a click service that saved events to disk during an outage, or an app that reports clicks in batches. Wait too long and the dashboard is stale; publish too soon and counts are short. And device clocks can be wrong, or forged by someone gaming a bill.',
      options: {
        caption: 'When is a minute finished?',
        rows: [
          {
            option: '[[Processing time|processing-time]] windows',
            goodAt: 'No waiting: a minute closes by the processor’s own clock, so results are as fresh as they can be.',
            badAt:
              'A click counts in whatever minute it happens to be processed, so a backlog after an outage piles hours of clicks into a few minutes, and a replay gives different answers.',
            pickWhen: 'Rough live charts, where the exact minute doesn’t matter.',
          },
          {
            option: '[[Event time|event-time]] with a watermark',
            goodAt:
              'Each click counts in the minute it happened. A watermark about 15 seconds (ballpark) behind the newest click decides when a minute is complete, and a replay gives the same answer every time.',
            badAt: 'Results wait for the watermark, and a click later than it misses a window that has already been published.',
            pickWhen: 'The default for the dashboard.',
          },
          {
            option: 'Watermark plus allowed lateness',
            goodAt:
              'Each window stays open a while longer, say 10 minutes of [[allowed lateness|allowed-lateness]], and a late click updates the published count.',
            badAt: 'More state held in memory, and the dashboard must treat an update as replacing the old count, not adding to it.',
            pickWhen: 'Late clicks are common enough to matter, such as from apps that report in batches.',
          },
          {
            option: 'Let the batch settle everything',
            goodAt: 'The nightly job sees every click, however late, and is exact.',
            badAt: 'Final numbers arrive hours after the day ends.',
            pickWhen: 'For billing, always, with the stream serving the dashboard.',
          },
        ],
      },
      recommendation:
        'Timestamp each click at the click service, on clocks you run and keep in sync, not on the device, which can be off ([[clock skew|clock-skew]]) or forged. Use event-time windows with a watermark about 15 seconds behind and 10 minutes of allowed lateness (both ballpark), send anything later to a side stream, and let the batch count it. For app-reported clicks, accept the device’s time only when it is within a few minutes of the arrival time.',
    },
    {
      title: 'Hot ads and how to partition the stream',
      problem:
        'A big campaign can draw tens of thousands of clicks a second to one ad (ballpark). Partition the stream by ad ID, and all of them land on one partition and one worker, which falls behind while the others sit idle. Yet every click for an ad must be added up somewhere.',
      options: {
        caption: 'Where a viral ad’s clicks go',
        rows: [
          {
            option: 'Partition by ad ID',
            goodAt: 'Each ad’s clicks reach one worker, which owns its count outright: simple, with no merge step.',
            badAt: 'A viral ad makes one partition and one worker a [[hot key|hot-key]] problem, and every other ad on that partition lags with it.',
            pickWhen: 'Traffic is spread fairly evenly across ads.',
          },
          {
            option: 'Partition by click ID, merge in two steps',
            goodAt:
              'Load spreads evenly. Each worker skips repeats and sums its share into partial counts per ad per minute, and a second step keyed by ad adds the partials up.',
            badAt: 'Two steps instead of one, and a few seconds more delay while partials move between workers.',
            pickWhen: 'The default at this scale: a hot ad costs the second step one partial per worker per minute.',
          },
          {
            option: 'Split known hot ads',
            goodAt: 'Add a suffix to a hot ad’s key, such as `ad42#0` to `ad42#7`, so its clicks spread over eight partitions, and add the eight counts at the end.',
            badAt: 'You must know in advance which ads are hot, and every reader must know to combine the pieces.',
            pickWhen: 'A handful of huge ads are known ahead of time, such as a big-game campaign.',
          },
        ],
      },
      recommendation:
        'Partition the stream by click ID. Every copy of a click lands on the same partition, so skipping repeats stays local, and the load is even however popular one ad gets. Then key the partial counts by ad for a second step: a viral ad sends that step one partial per worker per minute, about 64 numbers, instead of millions of clicks.',
    },
    {
      title: 'Fast numbers and right numbers',
      problem:
        'The stream gives counts within a minute but can drift: a bug, a repeat that arrives after the dedup hour, a fraud flag that lands the next morning. Billing needs numbers you can defend to an auditor. The question is how the fast path and the exact path fit together.',
      options: {
        caption: 'Three ways to combine speed and accuracy',
        rows: [
          {
            option: 'Stream only ([[kappa architecture|kappa-architecture]])',
            goodAt: 'One code path. To fix a bug, deploy the fix and replay the stream from a saved position.',
            badAt: 'The stream must keep events for as long as you might recompute, and fraud flags that arrive later still need a way back in.',
            pickWhen: 'The stream keeps weeks of events and nothing settles later than that.',
          },
          {
            option: 'Stream plus a nightly batch',
            goodAt: 'Fast provisional counts, and exact totals that replace them once a day’s late clicks and fraud flags are in.',
            badAt: 'Two code paths that must agree; any difference in their rules shows up as drift.',
            pickWhen: 'Money depends on the numbers: the usual choice for billing.',
          },
          {
            option: 'Batch only',
            goodAt: 'The simplest exact answer, from files alone.',
            badAt: 'Dashboards are a day behind, which advertisers running live campaigns won’t accept.',
            pickWhen: 'Reports are daily and nobody watches live.',
          },
        ],
      },
      recommendation:
        'Run both, with the raw archive as the source of truth. Share one library for parsing, validation and dedup rules between the stream and batch jobs, so they differ only in timing. Every night, compare totals per ad: within about 0.1% (ballpark) the batch numbers simply replace the stream’s, and beyond it an engineer looks, because drift that large means a bug, not lateness.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a big sales day at 500,000 clicks a second (ballpark).',
      impact:
        'The stream copes, since 250 MB a second over 64 partitions is about 4 MB a second each (ballpark), but the aggregator falls behind and dashboards lag.',
      mitigation:
        'Scale the aggregator out to one worker per partition, and add partitions ahead of known events. Consumer lag is the alarm: it says how many minutes behind the dashboard is.',
    },
    {
      scenario: '100× load, or one ad drawing most of a spike.',
      impact:
        'Partitioned by ad, one partition and one worker take the whole hot ad. Partitioned by click ID, the click service and the brokers’ network become the limits.',
      mitigation:
        'Partition by click ID with the two-step merge, and autoscale the click service. If the aggregator still can’t keep up, drop fine-grained dimensions from the fast path for a while; the archive still gets every click.',
    },
    {
      scenario: 'The click stream is unreachable.',
      impact: 'Clicks can’t be appended, and if the click service waited for the stream, users would wait too.',
      mitigation:
        'Redirect anyway and spool events to local disk, sending them when the stream returns. Give click servers disk for an hour or more of events (ballpark), and alert on how much is spooled.',
    },
    {
      scenario: 'The aggregator crashes.',
      impact: 'Dashboard counts stop updating while events pile up in the stream.',
      mitigation:
        'Restart from the last checkpoint, about a minute old, and replay. The seen-ID state and the overwriting writes make the replay harmless, so counts arrive late but correct.',
    },
    {
      scenario: 'The analytics store goes down.',
      impact: 'Dashboards can’t read, and the aggregator can’t write.',
      mitigation:
        'The aggregator retries and slows its reading, so events wait in the stream. Store replicas in several zones make a full outage rare, and the query API serves cached results marked as delayed.',
    },
    {
      scenario: 'A bug overcounted clicks for six hours.',
      impact: 'Dashboards, and any preliminary reports, show inflated numbers.',
      mitigation:
        'Fix the bug, then replay those hours from the stream (kept 7 days) or recompute them from the archive, overwriting the affected rows. The nightly comparison should flag drift like this before any bill is final.',
    },
    {
      scenario: 'A botnet floods clicks on a competitor’s ads.',
      impact: 'Click volume jumps, and the competitor would be billed for junk.',
      mitigation:
        'Signed tokens stop invented clicks, one billable click per impression stops repeats, and [[rate limits|rate-limiting]] per IP address and device slow the flood. The fraud service’s flags remove the rest before the batch totals are final, and the raw events stay for disputes.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates recording a click from counting it, with a queue or stream between the two.',
        'Estimates clicks per second and storage, and sees that a database write per click won’t last.',
        'Stores counts per ad per minute, which is what the dashboard reads.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Counts in event-time windows with a watermark and says what happens to late clicks.',
        'Explains why at-least-once delivery causes duplicates, then skips repeats by click ID and makes window writes overwrite.',
        'Chooses a partition key on purpose and explains what a viral ad does to it.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Splits the design into a fast provisional path and an exact batch path, with the raw archive as the source of truth and a reconciliation that alerts on drift.',
        'Reasons about trust: timestamps from servers rather than devices, signed click tokens, and fraud flags that arrive late.',
        'Plans for operations: consumer-lag alerts, replays after bugs, rollups for long ranges, and a second region.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The aggregator just crashed in the middle of a minute. Do advertisers lose clicks, or see some twice?',
      a: 'Neither. It restarts from its last checkpoint, which saved its partial counts, its seen click IDs and its stream offsets together, and replays everything after that point. The replay rebuilds the same windows, and each is written as a row keyed by ad and minute that overwrites, so the rows end up exactly as they would have. Advertisers see counts a minute or two late.',
    },
    {
      q: 'One ad is getting 50,000 clicks a second during a big game. What breaks first?',
      a: 'If the stream is partitioned by ad ID, that ad’s partition and the one worker reading it, and every other ad on that partition lags with it. I partition by click ID instead, so the load spreads over all 64 partitions, and each worker sends a partial count per ad per minute to a second step keyed by ad. That step sees 64 numbers a minute for the hot ad, not three million clicks.',
    },
    {
      q: 'You found a bug that double-counted clicks for the last six hours. How do you fix the numbers?',
      a: 'Fix and deploy, then replay those six hours from the stream, which keeps a week of events, into fresh windows that overwrite the bad rows. If the bug is older than the stream’s retention, the batch job recomputes those days from the archive. Bills use only reconciled daily totals, so the nightly comparison should have caught it before any invoice went out.',
    },
    {
      q: 'An app sends its clicks in batches, sometimes hours late. How do they get counted?',
      a: 'Each event carries a click ID made on the device, so a resent batch is skipped as repeats. Clicks within the allowed lateness update their minute; later ones go to a side stream, and the nightly batch counts them in the right day. I accept the device’s timestamp only within a few minutes of arrival, since a device clock can be wrong or faked.',
    },
    {
      q: 'How do you stop a bot from inflating an advertiser’s bill?',
      a: 'Cheap checks at the edge first: a signed token per impression so clicks can’t be invented, one billable click per impression, and rate limits per IP address and device. A fraud service then scores clicks with slower signals and flags them, and the batch job removes flagged clicks before totals are final. Raw events stay in the archive, so a disputed bill can be rechecked.',
    },
    {
      q: 'Advertisers now want the top 100 ads by clicks over the last five minutes, updated every minute. How?',
      a: 'A five-minute [[sliding window|sliding-window]] that moves every minute, per ad, in the second step, where each worker already holds complete counts for its ads. Each worker keeps its own top 100, and one final task merges those short lists into the global [[top-K|top-k]]. If memory gets tight with millions of ads, a [[Count-Min Sketch|count-min-sketch]] gives close-enough counts in fixed space.',
    },
    {
      q: 'How would you count unique people who clicked, not just clicks?',
      a: 'An exact count needs every user ID per ad, which is a lot of memory. A [[HyperLogLog|hyperloglog]] per ad per hour estimates uniques within about 1% (ballpark) in a few kilobytes, and hourly sketches merge into days. Billing still uses clicks; uniques are a reporting number, so an estimate is fine.',
    },
  ],
  rubric: [
    { item: 'Estimated clicks per second at peak, raw storage and the size of the aggregated counts', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Recorded each click with one append to a partitioned stream, keeping counting off the redirect path', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Counted in event-time windows with a watermark, with a plan for late clicks', weight: 20, lessonId: 'batch-vs-stream' },
    { item: 'Gave every click an ID, skipped repeats, and made window writes idempotent so replays are harmless', weight: 20, lessonId: 'idempotency' },
    { item: 'Chose the stream’s partition key on purpose and handled hot ads', weight: 10, lessonId: 'sharding' },
    { item: 'Kept raw clicks as the source of truth, with a batch job and reconciliation for billing', weight: 15, lessonId: 'batch-vs-stream' },
    { item: 'Served dashboards from a store built for queries, with rollups for long ranges', weight: 10, lessonId: 'cqrs-event-sourcing' },
  ],
};

export default problem;
