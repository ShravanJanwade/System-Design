import type { DiagramSpec, Problem } from '../types';

/** v1: one metrics server scrapes, stores on local disk, answers dashboards and evaluates alert rules. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'engineer', type: 'client', label: 'Engineer', sublabel: 'dashboards', x: 1, y: 0 },
    { id: 'services', type: 'service', label: 'Services', sublabel: 'expose counters', x: 0, y: 1 },
    { id: 'server', type: 'service', label: 'Metrics server', sublabel: 'scrape, store, alert', x: 1, y: 1 },
    { id: 'disk', type: 'blockStore', label: 'Local disk', sublabel: 'blocks and log', x: 2, y: 1 },
    { id: 'pager', type: 'external', label: 'Pager service', x: 2, y: 2 },
  ],
  edges: [
    { id: 'server-services', from: 'server', to: 'services', kind: 'sync', label: 'scrape' },
    { id: 'engineer-server', from: 'engineer', to: 'server', kind: 'sync' },
    { id: 'server-disk', from: 'server', to: 'disk', kind: 'sync' },
    { id: 'server-pager', from: 'server', to: 'pager', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'Every 10 seconds the **metrics server** asks each service for its current numbers, a scrape. Each number is one sample of a series, named by a metric and its labels, such as `http_requests_total{service="checkout", status="500"}`.',
      flow: ['server-services', '<server-services'],
      notes: [{ target: 'services', text: 'every 10 s' }],
    },
    {
      caption:
        'The server appends each sample to an in-memory chunk for its series and to a [[write-ahead log|write-ahead-log]] on the **local disk**, so a restart loses nothing. Every two hours it writes the chunks out as a compressed, read-only block.',
      flow: ['server-disk'],
      notes: [{ target: 'disk', text: '2-hour blocks' }],
    },
    {
      caption:
        'An engineer’s dashboard asks for checkout’s error rate over the last six hours. The server finds the matching series through its index of labels and reads only their chunks.',
      flow: ['engineer-server', 'server-disk', '<server-disk', '<engineer-server'],
    },
    {
      caption:
        'Every 30 seconds the server evaluates each alert rule. Checkout’s error ratio has stayed above 1% for five minutes, so it sends an alert to the **pager service**, which wakes the on-call engineer.',
      flow: ['server-disk', '<server-disk', 'server-pager'],
      notes: [{ target: 'pager', text: 'checkout errors', tone: 'alert' }],
    },
  ],
};

/** v2: the write path. Agents push to a gateway, a stream partitioned by series feeds ingesters, blocks go to object storage. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'services', type: 'service', label: 'Services', sublabel: '100,000 hosts', x: 0, y: 0 },
    { id: 'agents', type: 'worker', label: 'Agents', sublabel: 'one per host', x: 0, y: 1 },
    { id: 'gateway', type: 'gateway', label: 'Ingest gateway', sublabel: 'limits per team', x: 1, y: 1 },
    { id: 'stream', type: 'stream', label: 'Sample stream', sublabel: 'by series hash', x: 2, y: 1 },
    { id: 'ingesters', type: 'service', label: 'Ingesters', sublabel: 'last 2 hours', x: 3, y: 1 },
    { id: 'objects', type: 'objectStore', label: 'Object storage', sublabel: '2-hour blocks', x: 3, y: 2 },
  ],
  edges: [
    { id: 'agents-services', from: 'agents', to: 'services', kind: 'sync', label: 'scrape' },
    { id: 'agents-gateway', from: 'agents', to: 'gateway', kind: 'sync', label: 'push' },
    { id: 'gateway-stream', from: 'gateway', to: 'stream', kind: 'async' },
    { id: 'stream-ingesters', from: 'stream', to: 'ingesters', kind: 'async' },
    { id: 'ingesters-objects', from: 'ingesters', to: 'objects', kind: 'sync' },
  ],
  // Phones: services over the agents, the push down to the gateway, then the write path running right and down.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      services: { x: 0, y: 0 },
      agents: { x: 0, y: 1 },
      gateway: { x: 0, y: 2 },
      stream: { x: 1, y: 2 },
      ingesters: { x: 2, y: 2 },
      objects: { x: 2, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'An **agent** on each host scrapes the services beside it every 10 seconds and pushes one compressed batch to the **ingest gateway**. The gateway checks the team’s limits on active series and samples a second, and answers `429` to a team over them.',
      flow: ['agents-services', '<agents-services', 'agents-gateway'],
    },
    {
      caption:
        'The gateway appends each batch to the **sample stream**, whose partitions are chosen by a hash of each series’ labels, so a series always lands on the same partition. About 10 million samples a second (ballpark) spread over a few hundred partitions.',
      flow: ['agents-gateway', 'gateway-stream'],
      notes: [{ target: 'stream', text: '10 million a second' }],
    },
    {
      caption:
        'Each **ingester** reads its partitions, appends samples to compressed chunks in memory and answers queries for the last two hours. Every two hours it uploads a block, the chunks plus a label index, to **object storage**, which keeps it as long as retention says.',
      flow: ['stream-ingesters', 'ingesters-objects'],
      notes: [{ target: 'objects', text: 'read-only blocks' }],
    },
    {
      caption:
        'If an ingester crashes, new samples simply wait in the **sample stream**. Its replacement replays its partitions from the [[offset|offset]] of the last block it uploaded, so the stream doubles as the write-ahead log, and a second copy of each partition’s ingester answers queries meanwhile.',
      fail: ['ingesters'],
      flow: ['agents-gateway', 'gateway-stream'],
      notes: [{ target: 'stream', text: 'samples wait' }],
    },
  ],
};

/** v3: the read path. The query service splits by time, a results cache keeps finished hours, a compactor builds rollups. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'cache', type: 'cache', label: 'Results cache', x: 1, y: 0 },
    { id: 'ingesters', type: 'service', label: 'Ingesters', sublabel: 'last 2 hours', x: 2, y: 0 },
    { id: 'engineer', type: 'client', label: 'Engineer', sublabel: 'dashboards', x: 0, y: 1 },
    { id: 'query', type: 'service', label: 'Query service', sublabel: 'splits by time', x: 1, y: 1 },
    { id: 'objects', type: 'objectStore', label: 'Object storage', sublabel: 'blocks and rollups', x: 2, y: 2 },
    { id: 'compactor', type: 'worker', label: 'Compactor', sublabel: 'merges, rolls up', x: 3, y: 2 },
  ],
  edges: [
    { id: 'engineer-query', from: 'engineer', to: 'query', kind: 'sync' },
    { id: 'query-cache', from: 'query', to: 'cache', kind: 'sync' },
    { id: 'query-ingesters', from: 'query', to: 'ingesters', kind: 'sync' },
    { id: 'query-objects', from: 'query', to: 'objects', kind: 'sync' },
    { id: 'compactor-objects', from: 'compactor', to: 'objects', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A dashboard asks for checkout’s [[99th-percentile|percentile]] latency over the last six hours. The **query service** splits the range: the last two hours from the **ingesters**, the rest from blocks in **object storage**, where each block’s label index finds checkout’s series without touching the others.',
      flow: ['engineer-query', ['query-ingesters', 'query-objects'], ['<query-ingesters', '<query-objects'], '<engineer-query'],
    },
    {
      caption:
        'The finished hours of that answer go into the **results cache**. A dashboard refreshing every 30 seconds then recomputes only the newest few minutes, which matters with 10,000 dashboards open at once (ballpark).',
      flow: ['engineer-query', 'query-cache', '<query-cache', 'query-ingesters', '<query-ingesters', '<engineer-query'],
      notes: [{ target: 'cache', text: 'finished hours' }],
    },
    {
      caption:
        'The **compactor** merges small blocks into larger ones and builds rollups: for every 5 minutes, and again for every hour, it keeps each series’ count, sum, minimum and maximum, plus histogram bucket counts for latencies. Raw samples are deleted after 15 days, 5-minute rollups after 90 and hourly ones after two years (ballpark).',
      flow: ['compactor-objects', '<compactor-objects', 'compactor-objects'],
      notes: [{ target: 'compactor', text: '5 min and 1 hour' }],
    },
    {
      caption:
        'A one-year chart reads hourly rollups: 8,760 points per series instead of about 3.2 million raw samples. The query service picks the coarsest resolution that still gives every pixel of the chart a point of its own.',
      flow: ['engineer-query', 'query-objects', { edge: 'query-objects', reverse: true, tag: 'hourly' }, '<engineer-query'],
    },
  ],
};

/** v4: alerting. Two evaluators per rule group, an alert manager that deduplicates and groups, and a watchdog outside. */
const v4: DiagramSpec = {
  grid: { cols: 5, rows: 3 },
  nodes: [
    { id: 'evalA', type: 'service', label: 'Rule evaluator', sublabel: 'copy 1', x: 1, y: 0 },
    { id: 'pager', type: 'external', label: 'Pager service', x: 3, y: 0 },
    { id: 'ingesters', type: 'service', label: 'Ingesters', sublabel: 'recent data', x: 0, y: 1 },
    { id: 'alertmgr', type: 'service', label: 'Alert manager', sublabel: 'three copies', x: 2, y: 1 },
    { id: 'oncall', type: 'client', label: 'On-call engineer', x: 4, y: 1 },
    { id: 'evalB', type: 'service', label: 'Rule evaluator', sublabel: 'copy 2', x: 1, y: 2 },
    { id: 'heartbeat', type: 'external', label: 'Heartbeat monitor', sublabel: 'another provider', x: 3, y: 2 },
  ],
  edges: [
    { id: 'evalA-ingesters', from: 'evalA', to: 'ingesters', kind: 'sync' },
    { id: 'evalB-ingesters', from: 'evalB', to: 'ingesters', kind: 'sync' },
    { id: 'evalA-alertmgr', from: 'evalA', to: 'alertmgr', kind: 'async' },
    { id: 'evalB-alertmgr', from: 'evalB', to: 'alertmgr', kind: 'async' },
    { id: 'alertmgr-pager', from: 'alertmgr', to: 'pager', kind: 'async' },
    { id: 'alertmgr-heartbeat', from: 'alertmgr', to: 'heartbeat', kind: 'async' },
    { id: 'pager-oncall', from: 'pager', to: 'oncall', kind: 'async' },
    { id: 'heartbeat-oncall', from: 'heartbeat', to: 'oncall', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'Rules are split into groups, and each group runs on two **rule evaluators**. Every 30 seconds each copy runs its rules against recent data in the **ingesters**, such as “checkout’s error ratio over the last 5 minutes is above 1%”.',
      flow: [['evalA-ingesters', 'evalB-ingesters'], ['<evalA-ingesters', '<evalB-ingesters']],
    },
    {
      caption:
        'A rule that matches is pending, and fires only if it still matches after its `for` duration, here five minutes, so one bad scrape never wakes anyone. Both copies fire and send the same alert to the **alert manager**.',
      flow: [['evalA-alertmgr', 'evalB-alertmgr']],
    },
    {
      caption:
        'The alert manager drops the duplicate, groups 200 alerts from one failing cluster into a single notification, holds back alerts that a silence or a bigger outage already covers, and sends one page through the **pager service**.',
      flow: ['alertmgr-pager', 'pager-oncall'],
      notes: [{ target: 'oncall', text: 'one page', tone: 'alert' }],
    },
    {
      caption:
        'One alert, the watchdog, always fires. The alert manager sends it every minute to a **heartbeat monitor** run by another provider, which expects to hear it.',
      flow: ['alertmgr-heartbeat'],
      notes: [{ target: 'heartbeat', text: 'watchdog: fine' }],
    },
    {
      caption:
        'If the alert manager, the evaluators or the ingesters fail, the watchdog stops arriving, and the heartbeat monitor pages on-call itself. A silent alerting system must never look like a healthy one.',
      fail: ['alertmgr'],
      flow: ['heartbeat-oncall'],
      notes: [{ target: 'heartbeat', text: 'watchdog missing', tone: 'alert' }],
    },
  ],
};

const problem: Problem = {
  id: 'metrics-platform',
  title: 'Metrics and alerting platform',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a metrics and alerting platform like Prometheus or Datadog. Thousands of services report numbers such as request counts and latencies every few seconds; engineers chart them on dashboards and get paged when something goes wrong.',
  concepts: [
    'back-of-the-envelope',
    'observability',
    'percentiles-tail-latency',
    'queues-and-streams',
    'batch-vs-stream',
    'sql-vs-nosql',
    'sharding',
    'storage-types',
  ],
  hints: [
    'Start with the shape of the data. Each number belongs to a series, named by a [[metric|metric]] and a few labels such as service and status code, and a new sample arrives every few seconds, forever. How many series are there, and what does that make the write rate?',
    'Writes are a steady flood of tiny appends, and reads mostly ask for some series over a time range, with recent data read far more than old. Think about what that means for how samples are compressed and laid out, and how much detail you can afford to keep for a month versus two years.',
    'One shape that works: agents push batches through a gateway into a stream partitioned by series; ingesters keep the last two hours in compressed memory chunks and upload read-only blocks with a label index to [[object storage|object-storage]]; a compactor builds 5-minute and hourly rollups; and rule evaluators query recent data every 30 seconds, sending alerts through an alert manager that deduplicates and groups them before paging.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many machines and series are we monitoring, and how often is each one sampled?',
      why: 'Series times frequency is the write rate. Assume 100,000 hosts with about 1,000 series each, sampled every 10 seconds (ballpark): 10 million samples a second, day and night, which rules out a general-purpose database writing one row per sample.',
    },
    {
      q: 'Do services push their numbers, or does the platform pull them?',
      why: 'Pulling, called scraping, tells you at once when a target stops answering and keeps load under the platform’s control, but it needs an up-to-date list of targets. Pushing suits short-lived jobs and machines behind firewalls. A common middle path is an agent on each host that scrapes locally and pushes batches.',
    },
    {
      q: 'How long must data be kept, and at what detail?',
      why: 'Raw 10-second samples kept for two years would approach a petabyte (ballpark). If full detail matters only for recent incidents, you keep raw samples for about two weeks and coarser summaries, called rollups, for longer: downsampling.',
    },
    {
      q: 'Can teams attach any labels they like?',
      why: 'Every distinct combination of label values is a separate series, so the number of series, its [[cardinality|cardinality]], drives the cost. A label holding user identifiers (IDs) can add millions of series in minutes, which calls for limits per team and a rule that per-user detail belongs in logs and traces.',
    },
    {
      q: 'How fast must alerts fire, and what is allowed to page a person?',
      why: 'Catching a problem within a minute or two (ballpark) means evaluating rules every 30 seconds against data only seconds old, so alerting reads recent data from memory. Paging only on symptoms users feel, such as a [[service level objective|slo]] (SLO) burning fast, keeps pages rare enough that people still trust them.',
    },
    {
      q: 'Is this one shared platform for many teams?',
      why: 'Then one careless team can hurt everyone, so ingestion, queries and storage need limits and isolation per team. It also decides who owns dashboards and rules, and who may silence an alert.',
    },
  ],
  requirements: {
    functional: [
      'Accept numbers from every host: counters (such as requests served), gauges (such as memory in use) and [[histograms|histogram]] (such as request latency, counted in buckets), each a series named by a metric and labels.',
      'Query any series, or aggregate many by label, over a time range for dashboards: from the last few seconds to two years back.',
      'Evaluate alert rules continuously and notify the right on-call person, with deduplication, grouping and silences for planned work.',
      'Let each team manage its dashboards and alert rules, and see how many series it sends.',
    ],
    nonFunctional: [
      'Ingest about 10 million samples a second (ballpark) without losing data, and absorb bursts such as thousands of containers restarting at once.',
      'Fresh: a sample is visible to queries and alert rules within about 30 seconds of being measured (ballpark).',
      'Fast: dashboard panels over the last few hours return in under a second for 99% of queries, and year-long charts in a few seconds (ballpark).',
      'Alerting is more available than anything it watches: it keeps working, or says loudly that it isn’t, during the outages it exists to catch.',
      'Retention: raw samples for about 15 days and summaries for two years (ballpark).',
    ],
    outOfScope: [
      'Logs and distributed traces, which have their own stores; this platform holds numbers only.',
      'Drawing the dashboards, and the pager product that phones and texts people: assume outside services.',
      'Anomaly detection by machine learning; every rule here is written by a person.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Monitored hosts and containers', value: '100,000 (ballpark)' },
      { label: 'Active series per host', value: 'about 1,000, so 100 million series in all' },
      { label: 'Sample interval', value: 'every 10 seconds' },
      { label: 'Bytes per sample', value: '16 raw (an 8-byte time and an 8-byte value), about 1.5 after compression' },
      { label: 'Open dashboards at the busiest time', value: 'about 10,000, with 20 panels each, refreshing every 30 seconds (ballpark)' },
      { label: 'Alert rules', value: 'about 100,000, each evaluated every 30 seconds' },
      { label: 'Busiest hour compared with the daily average', value: 'about 1× for writes: machines report day and night' },
      {
        label: 'In the calculator',
        value: 'each host is a user and each 10-second batch of its 1,000 samples one write of 1,500 bytes; one query per batch stands in for reads; its storage line keeps raw data a whole year',
      },
    ],
    steps: [
      { label: 'Samples per second', math: '10⁸ series ÷ 10 seconds', result: '10⁷: about 10 million a second, all day' },
      { label: 'Raw storage', math: '10⁷ × 1.5 bytes × 86,400 seconds ≈ 1.3 TB a day; × 15 days', result: '≈ 20 TB of raw samples' },
      { label: 'Raw for two years instead', math: '1.3 TB × 730 days', result: '≈ 950 TB: why old data is downsampled' },
      {
        label: 'Rollups',
        math: '5-minute: 10⁸ × 288 windows × 4 values × 2 bytes ≈ 230 GB a day, × 90 days; hourly: 10⁸ × 24 × 4 × 2 ≈ 19 GB a day, × 730 days',
        result: '≈ 21 TB + 14 TB, so about 55 TB in all with the raw data',
      },
      { label: 'Ingester memory', math: '10⁸ active series × about 5 KB each (ballpark), two copies', result: '≈ 1 TB: 16 ingesters of 64 GB, or about 32 to keep half their memory free' },
      { label: 'Queries', math: '10,000 dashboards × 20 panels ÷ 30 s ≈ 6,700; 100,000 rules ÷ 30 s ≈ 3,300', result: '≈ 10,000 queries a second, mostly over the last hour' },
    ],
    calculator: { dau: 100_000, actionsPerUser: 17_280, readsPerWrite: 1, objectBytes: 1_500, peakFactor: 1, retentionYears: 1 },
  },
  api: [
    {
      signature: 'POST /v1/push  { series: [{ name, labels, samples: [[time, value], …] }] }  →  204',
      description:
        'Agents send one compressed batch every 10 seconds. The gateway checks the team’s limits and answers `429 Too Many Requests` with `Retry-After` when the team is over them. A retried batch is harmless: a repeated sample for the same series and time is dropped.',
    },
    {
      signature: 'GET /v1/query_range?expr=…&start=…&end=…&step=60s  →  200 { series: [{ labels, points: [[time, value], …] }] }',
      description:
        'What dashboards call. `expr` is a query such as `sum by (service) (rate(http_requests_total{status="500"}[5m]))`, and `step` sets the spacing of points, from which the service picks raw data or rollups.',
    },
    {
      signature: 'GET /v1/query?expr=…&time=…  →  200 { series: [{ labels, value }] }',
      description: 'One value per matching series at one moment. Rule evaluators use it every 30 seconds.',
    },
    {
      signature: 'PUT /v1/rules/{team}/{group}  { rules: [{ name, expr, for, labels, annotations }] }  →  200',
      description:
        'Replaces a group of alert rules. Each change is versioned and checked before it is saved, so a typo can’t silently disable alerting.',
    },
    {
      signature: 'POST /v1/silences  { matchers, startsAt, endsAt, comment }  →  201 { silenceId }',
      description: 'Mutes alerts whose labels match, such as everything for one database during planned work. Silences always end at a set time, so none is forgotten.',
    },
  ],
  dataModel: [
    {
      entity: 'Series',
      fields: ['series_id: hash of name and sorted labels', 'name: "http_requests_total"', 'labels: { service, region, status, … }', 'team'],
      store: 'An inverted index in each block and in ingester memory: each label pair points to a sorted list of series',
      why: 'Queries pick series by label, as in `service="checkout"` and `status="500"`, so each label pair keeps a [[posting list|posting-list]] of series, and a query intersects the lists. It is an [[inverted index|inverted-index]], the same structure a search engine uses for words.',
    },
    {
      entity: 'Chunk',
      fields: ['series_id', 'start_time, end_time', 'samples: about 120, compressed together', 'encoding: time and value deltas'],
      store: 'Ingester memory while open, then inside a two-hour block',
      why: 'Neighboring samples of one series are nearly alike, so storing each as a small difference from the last shrinks 16 bytes to under 2 on average.',
    },
    {
      entity: 'Block',
      fields: ['block_id', 'team', 'min_time, max_time', 'resolution: raw | 5m | 1h', 'files: chunks, index, metadata'],
      store: 'Object storage such as S3; files are written once and never changed',
      why: 'Object storage is cheap and durable, and read-only files are easy to cache, copy and delete when retention ends. A query fetches only the index pages and chunks it needs.',
    },
    {
      entity: 'Rollup point',
      fields: ['series_id', 'window_start', 'count, sum, min, max', 'bucket_counts (histograms only)'],
      store: 'Blocks at 5-minute and 1-hour resolution, in the same object storage',
      why: 'Every value can be combined again: sums add, the larger maximum wins and bucket counts add. That lets any coarser window or any group of series be computed later, which averages and percentiles never allow.',
    },
    {
      entity: 'Alert rule',
      fields: ['rule_id', 'team, group', 'expr', 'for: 5m', 'labels: severity, team', 'annotations: summary, runbook'],
      store: 'A relational database with every version kept; evaluators load the current set',
      why: 'Rules are small, changed by people, and need review and history, which a relational database handles simply.',
    },
    {
      entity: 'Alert state and silences',
      fields: ['fingerprint: hash of the alert’s labels', 'state: pending | firing | resolved', 'active_since', 'last_notified', 'silences: matchers, ends_at'],
      store: 'Evaluator and alert manager memory, saved regularly and shared between alert manager copies',
      why: 'A restarted evaluator must not restart its `for` timers or page again for an alert already sent. Alert manager copies share silences and sent notifications by [[gossip|gossip-protocol]], so any of them can take over.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Collect numbers from a few hundred services, chart them, and page someone when one goes wrong.',
      diagram: v1,
      explanation:
        'A single scraping server with a local time-series store is how many teams start, and it handles a few million series. It stops there: one machine’s memory caps the series, its disk caps retention, and if it dies, dashboards and alerts die with it.',
    },
    {
      title: 'v2: It scales: the write path',
      solves: 'About 10 million samples a second and 100 million active series (ballpark), far beyond one machine’s memory and disk.',
      diagram: v2,
      explanation:
        'Hashing series onto partitions spreads both memory and writes evenly, and the stream absorbs bursts and replays after crashes. Moving finished blocks to object storage separates what must be fast (the last two hours, in memory) from what must be cheap (everything older).',
    },
    {
      title: 'v3: Queries and downsampling',
      solves: 'Ten thousand dashboards refreshing every 30 seconds, year-long charts, and storage that would approach a petabyte if raw samples were kept two years (ballpark).',
      diagram: v3,
      explanation:
        'Recent data comes from memory, older data from blocks, and the oldest from rollups, so each query touches about as many points as it can draw. Caching finished time ranges turns a refreshing dashboard into a small query. Rollups keep only values that combine exactly, so they shrink storage without lying about spikes.',
    },
    {
      title: 'v4: Alerting you can trust',
      solves: 'An alert must fire once, to the right person, within minutes, and must never stay silent because the alerting path itself broke.',
      diagram: v4,
      explanation:
        'Two evaluators per rule group and three alert manager copies remove single points of failure, and deduplication makes the redundancy invisible to on-call. The watchdog covers what redundancy can’t: a failure that takes out the whole path, which only something outside the platform can notice.',
    },
  ],
  deepDives: [
    {
      title: 'Storing time series cheaply',
      problem:
        'Ten million tiny samples a second arrive, always at the newest time, and most reads ask for a few series over a time range. A row per sample in a general-purpose database would spend more on indexes and row overhead than on the numbers themselves.',
      options: {
        caption: 'Where samples could live',
        rows: [
          {
            option: 'Relational table, one row per sample',
            goodAt: 'Familiar, with flexible queries and joins against other tables.',
            badAt: 'Tens of bytes of overhead around each 16-byte sample, and a [[B-tree|b-tree]] index updated ten million times a second.',
            pickWhen: 'A few thousand series, such as one small app.',
          },
          {
            option: '[[Wide-column store|wide-column-store]], one row per series per day',
            goodAt: 'Spreads writes across many machines, and a time range is one sorted read.',
            badAt: 'No compression that understands times and values, and no index for finding series by label.',
            pickWhen: 'You already run one, such as Cassandra, at scale, and queries name exact series.',
          },
          {
            option: 'Purpose-built time-series database',
            goodAt: 'Compresses each sample to under 2 bytes, keeps recent data in memory, writes read-only blocks and indexes series by label.',
            badAt: 'A specialized system to run, and poor at anything that isn’t a series over time.',
            pickWhen: 'The default for a metrics platform.',
          },
          {
            option: 'Column-oriented analytics database, such as ClickHouse',
            goodAt: 'Very fast scans, good compression and flexible ad hoc analysis.',
            badAt: 'Prefers large batched inserts to a constant trickle, and label queries must be modeled by hand.',
            pickWhen: 'Metrics that analysts slice many ways, alongside business events.',
          },
        ],
      },
      recommendation:
        'Use a time-series layout like the one Prometheus’s storage uses. Each series keeps an in-memory chunk compressed the way Facebook’s Gorilla paper (2015) described, timestamps as differences of differences, which are usually zero, and values as bitwise differences from the previous one; the paper reported about 1.37 bytes per sample. A write-ahead log protects the chunks, and every two hours they become a read-only block in object storage with an inverted index from label pairs to series, much like the files of a log-structured merge (LSM) tree.',
    },
    {
      title: 'Downsampling without lying',
      problem:
        'Two years of raw samples would take nearly a petabyte (ballpark), and a year-long chart doesn’t need a point every 10 seconds: it is perhaps 1,000 pixels wide. But summaries must not hide the spike that caused an outage, and percentiles can’t be averaged at all.',
      options: {
        caption: 'Ways to keep old data affordable',
        rows: [
          {
            option: 'Keep every raw sample',
            goodAt: 'Nothing is lost, and every query is exact.',
            badAt: 'Storage grows without end, and a year-long chart reads millions of samples per series.',
            pickWhen: 'Short retention, such as a month.',
          },
          {
            option: 'Keep one sample in N',
            goodAt: 'Trivial, and shrinks data by exactly N.',
            badAt: 'Whatever happened between the kept samples disappears, so short spikes simply vanish.',
            pickWhen: 'Rough trends only; never data that alerts depend on.',
          },
          {
            option: 'An average per window',
            goodAt: 'Small, and smooth on charts.',
            badAt: 'Flattens spikes, and an average of percentiles is not a percentile of anything.',
            pickWhen: 'Gauges where only the trend matters, such as disk space used.',
          },
          {
            option: 'Count, sum, min and max per window, plus histogram buckets',
            goodAt: 'Everything combines exactly, so any coarser window or any group of series can be computed later.',
            badAt: 'About four values per window instead of one, and percentiles are only as precise as the histogram’s buckets.',
            pickWhen: 'The default, at 5 minutes and 1 hour.',
          },
        ],
      },
      recommendation:
        'Keep raw samples 15 days, 5-minute rollups 90 days and hourly rollups two years (ballpark), built by the compactor from finished blocks: about 55 TB in all instead of nearly a petabyte. Each rollup window is a [[tumbling window|tumbling-window]], and every stored value can be merged further. For latency, keep histogram buckets or a mergeable [[sketch|sketch]] and compute percentiles at query time, and let the query service pick the resolution from the chart’s time range.',
    },
    {
      title: 'Cardinality: the number of series',
      problem:
        'Memory, index size and query cost all grow with the number of active series, not the number of samples. One label with many values, such as a user ID, a request ID or a full web address, can multiply a metric into millions of series within minutes of a deploy.',
      options: {
        caption: 'Ways to keep the series count under control',
        rows: [
          {
            option: 'Accept whatever arrives',
            goodAt: 'No friction for teams.',
            badAt: 'One bad deploy can fill every ingester’s memory and take the platform down for everyone.',
            pickWhen: 'Never on a shared platform.',
          },
          {
            option: 'Hard limits per team',
            goodAt: 'Caps on active series and samples a second protect everyone else, and the team over its cap gets a clear error.',
            badAt: 'Series beyond the cap are dropped, so that team loses data until it fixes the label.',
            pickWhen: 'Always, as the backstop.',
          },
          {
            option: 'Rewrite labels in the agent',
            goodAt: 'Risky labels are dropped or coarsened before they leave the host, such as turning a full path into a route pattern.',
            badAt: 'Rules to write and maintain, and the detail is gone for good.',
            pickWhen: 'Known offenders, and shared libraries everyone uses.',
          },
          {
            option: 'Send unbounded detail to logs and traces',
            goodAt: 'Per-user and per-request questions go to stores built for them.',
            badAt: 'Two places to look, and an aggregate across users needs a separate job.',
            pickWhen: 'Any label value with no natural limit, such as user or request IDs.',
          },
        ],
      },
      recommendation:
        'Combine them: limits per team at the gateway and in the ingesters, label rewriting in the shared agent, and a clear rule that unbounded values belong in logs and traces. Show each team its series count per metric, estimated cheaply with a [[HyperLogLog|hyperloglog]], so a jump is visible right after the deploy that caused it. Spread each team over a small, fixed subset of ingesters, called shuffle sharding, so even a team that slips past its limit has a small [[blast radius|blast-radius]].',
    },
    {
      title: 'Alerts people can trust',
      problem:
        'An alert must fire within a minute or two of a real problem, stay quiet through blips, and page one person once, not once per container. It must also keep working, or say loudly that it isn’t, during the very outages it exists to catch.',
      options: {
        caption: 'Where to evaluate alert rules',
        rows: [
          {
            option: 'Scheduled queries against recent data',
            goodAt: 'Rules are ordinary queries, run every 30 seconds against the ingesters’ memory, and easy to write, test and split into groups.',
            badAt: 'Detection waits for the next run, and samples that arrive late can make a rule see a false dip.',
            pickWhen: 'The default for nearly all rules.',
          },
          {
            option: 'Rules inside the stream',
            goodAt: 'Each sample is checked as it arrives, so detection takes seconds.',
            badAt: 'Hard for rules over many series or long windows, and the [[stream processor|stream-processing]] must keep its own state.',
            pickWhen: 'The few rules where seconds matter, such as cutting off fraud.',
          },
          {
            option: 'Rules in each host’s agent',
            goodAt: 'Keeps working even when the central platform is down.',
            badAt: 'Sees one host, so it can’t judge a service as a whole.',
            pickWhen: 'Host checks such as a full disk, as a backup path.',
          },
        ],
      },
      recommendation:
        'Run rule groups on a schedule, each on two evaluators, and let a three-copy alert manager drop duplicates, group related alerts into one page, apply silences and hold back alerts a bigger outage already explains. Use `for` durations, and [[burn rate|burn-rate]] alerts on SLOs, so blips never page anyone. Treat missing or late data as its own alert, never as all clear, and send an always-firing watchdog to a heartbeat monitor outside the platform.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 100 million samples a second and a billion active series (ballpark).',
      impact: 'Ingesters need about 5 TB of memory per copy, block indexes grow tenfold, and the compactor falls behind, so queries read many more small blocks.',
      mitigation:
        'Add stream partitions and ingesters, since series spread by hash; run compactors in parallel by team and time range; and make each team see, and pay attention to, its series count.',
    },
    {
      scenario: '100× series from one team: a deploy adds a user ID label to every request metric.',
      impact: 'Millions of new series appear in minutes. Without limits, ingester memory fills and every team loses metrics, including the alerts that would explain the outage.',
      mitigation:
        'Series limits per team reject new series past the cap with a clear error, shuffle sharding keeps the damage to a few ingesters, and the team sees its series count jump on its own dashboard.',
    },
    {
      scenario: 'An ingester crashes.',
      impact: 'The series it held lose their last two hours from its memory until a replacement replays its partitions from the stream.',
      mitigation:
        'Run two ingesters per partition, replay from the offset of the last uploaded block, and have queries merge both copies and drop duplicates, so dashboards and alerts carry on.',
    },
    {
      scenario: 'The stream falls behind, so data arrives minutes late.',
      impact: 'Rules evaluate stale data: an error rate looks normal because the errors haven’t arrived yet, and firing alerts can resolve by mistake.',
      mitigation:
        'Alert on [[consumer lag|consumer-lag]] and on data freshness. Evaluators hold, rather than resolve, rules whose newest data is too old, and a “metrics delayed” alert tells on-call that dashboards can’t be trusted for now.',
    },
    {
      scenario: 'Object storage is slow or unavailable.',
      impact: 'Queries reaching back more than about two hours fail or crawl, and ingesters can’t upload new blocks. Alerts carry on, because they read recent data from memory.',
      mitigation: 'Give ingesters enough local disk to hold a day of blocks and retry uploads; cache block indexes and popular chunks near the query service.',
    },
    {
      scenario: 'The alert manager or the pager provider goes down.',
      impact: 'Rules fire, but nobody hears them.',
      mitigation:
        'Three alert manager copies in different zones, plus the watchdog: when it stops reaching the outside heartbeat monitor, that monitor pages on-call through its own channel.',
    },
    {
      scenario: 'The region that hosts the platform fails, along with the services it watches.',
      impact: 'You go blind exactly when you most need to see.',
      mitigation:
        'Run a small, separate monitoring setup in another region that watches the main platform and the most important SLOs, and keep the heartbeat monitor with a different provider altogether.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Describes the data as series of time and value pairs, named by a metric and labels, and picks a store suited to appends and time-range reads.',
        'Separates collecting, storing, querying and alerting, and evaluates alert rules on a schedule.',
        'Keeps recent data at full detail and plans for old data to expire.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Sizes the write rate and storage from series counts, then adds compression, retention and downsampling with numbers.',
        'Explains cardinality and why a label holding user IDs can break the platform.',
        'Shards ingestion by series, keeps the last hours in memory behind a write-ahead log, and moves finished blocks to object storage.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Knows percentiles can’t be averaged or downsampled directly, and keeps histograms or sketches that merge exactly.',
        'Makes alerting trustworthy: `for` durations, burn-rate alerts, deduplication and grouping, stale-data handling, and a watchdog outside the platform.',
        'Isolates teams with limits and shuffle sharding, and keeps monitoring in a separate failure domain from what it monitors.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A team just deployed code that adds a user ID label to every request metric. What happens?',
      a: 'Each user becomes a new series for every metric, millions within minutes. Without protection, ingester memory fills and the whole platform degrades. With limits per team, the gateway and ingesters reject series past the cap, that team gets a clear error and sees its series count jump, and everyone else is unaffected; the fix is to move user IDs into logs or traces.',
    },
    {
      q: 'Your dashboard shows p99 latency for the past year. How do you compute it from rollups?',
      a: 'Not by averaging stored p99 values: an average of percentiles isn’t a percentile of anything. Each rollup keeps the latency histogram’s bucket counts, which add exactly across time windows and across servers, so I merge the buckets for each chart point and read the 99th percentile from the merged histogram. Its precision depends on the bucket edges, so I put several buckets near the SLO’s latency threshold.',
    },
    {
      q: 'Ingestion is ten minutes behind. What do your alerts do?',
      a: 'Rules would see too little data, so error rates could look healthy and firing alerts could resolve. Each evaluation checks how fresh its data is; when it is too old, the rule keeps its last state instead of resolving, and an alert on consumer lag tells on-call the metrics are delayed. Silence must never be mistaken for health.',
    },
    {
      q: 'Should services push metrics to you, or should you pull them?',
      a: 'Pulling tells me at once when a target stops answering and keeps load under my control, but needs service discovery and misses short-lived jobs. Pushing handles those and works through firewalls, but a dead host looks the same as an idle one. I’d run an agent on each host that scrapes locally and pushes batches, so discovery stays local and the platform still controls its intake with limits.',
    },
    {
      q: 'A cluster of 200 containers fails at once. How do you avoid 200 pages?',
      a: 'The alert manager groups alerts by labels such as alert name and service, waits a few seconds to collect the group, and sends one notification that lists the containers. Inhibition rules hold back symptoms of a known bigger failure, such as every service alert in a zone that is already down, and repeat notifications are spaced out until someone acknowledges.',
    },
    {
      q: 'How do you know the monitoring system itself is working?',
      a: 'A watchdog alert fires all the time, and an outside heartbeat monitor pages if it stops arriving, so a dead evaluator, alert manager or ingestion path is noticed within minutes. A small, separate setup in another region also tracks the platform’s own [[golden signals|golden-signals]]: ingest rate, query latency, rule evaluation time and failed notifications.',
    },
    {
      q: 'How would you make a 30-day dashboard load in under a second?',
      a: 'Read 5-minute rollups instead of raw samples, which cuts the points per series about 30-fold, and serve finished days from the results cache so only today is computed. For heavy panels, precompute the aggregate on a schedule as its own series, a recording rule, so the dashboard reads one series instead of thousands.',
    },
  ],
  rubric: [
    { item: 'Clarified series counts, sample interval and retention, then estimated samples a second, storage and memory', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Stored samples in a time-series layout: compressed chunks, a write-ahead log, read-only blocks and a label index', weight: 15, lessonId: 'sql-vs-nosql' },
    { item: 'Sharded ingestion by series behind a stream, with replay after an ingester crash', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Planned retention with rollups that merge exactly, built by a background compactor', weight: 15, lessonId: 'batch-vs-stream' },
    { item: 'Computed percentiles from histograms or sketches, never by averaging percentiles', weight: 10, lessonId: 'percentiles-tail-latency' },
    { item: 'Controlled cardinality with limits per team, series reports and shuffle sharding', weight: 10, lessonId: 'sharding' },
    { item: 'Made alerts trustworthy: scheduled rules, for durations, deduplication and grouping, stale data and a watchdog', weight: 15, lessonId: 'observability' },
    { item: 'Explained what happens when ingesters, the stream, object storage or the alert manager fail', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
