import type { DiagramSpec, Problem } from '../types';

/** v1: one machine, one first-in-first-out queue, a seen set in memory. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'seen', type: 'cache', label: 'Seen URLs', sublabel: 'a set in memory', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'URL queue', x: 0, y: 1 },
    { id: 'crawler', type: 'worker', label: 'Crawler', sublabel: 'one machine', x: 1, y: 1 },
    { id: 'web', type: 'external', label: 'Websites', x: 2, y: 1 },
    { id: 'store', type: 'objectStore', label: 'Page storage', x: 1, y: 2 },
  ],
  edges: [
    { id: 'crawler-queue', from: 'crawler', to: 'queue', kind: 'sync' },
    { id: 'crawler-web', from: 'crawler', to: 'web', kind: 'sync' },
    { id: 'crawler-store', from: 'crawler', to: 'store', kind: 'sync' },
    { id: 'crawler-seen', from: 'crawler', to: 'seen', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'The **crawler** takes the next address from the **URL queue**, which starts with a few seed pages, and downloads that page from the **websites**.',
      flow: ['crawler-queue', '<crawler-queue', 'crawler-web', '<crawler-web'],
    },
    {
      caption:
        'It saves the page in **page storage**, pulls out every link, and checks each one against **seen URLs**, a set kept in memory, so no address is queued twice.',
      flow: ['crawler-store', 'crawler-seen', '<crawler-seen'],
      notes: [{ target: 'seen', text: 'about 50 links a page' }],
    },
    {
      caption:
        'New links join the back of the queue ([[first in, first out|fifo]]), and the loop repeats. One machine manages a few pages a second, and because a page’s links mostly point to its own site, the crawler fires bursts of requests at one site back to back.',
      flow: ['crawler-queue'],
      notes: [{ target: 'web', text: 'one site hammered', tone: 'alert' }],
    },
  ],
};

/** v2: a polite frontier, fetchers with a local DNS cache, parsers, a Bloom filter, hosts split across nodes. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'seen', type: 'cache', label: 'Seen-URL filter', sublabel: 'Bloom filter', x: 0, y: 0 },
    { id: 'dns', type: 'dns', label: 'DNS resolver', sublabel: 'local cache', x: 1, y: 0 },
    { id: 'frontier', type: 'queue', label: 'URL frontier', sublabel: 'a queue per host', x: 0, y: 1 },
    { id: 'fetchers', type: 'worker', label: 'Fetchers', sublabel: 'many machines', x: 1, y: 1 },
    { id: 'web', type: 'external', label: 'Websites', x: 2, y: 1 },
    { id: 'parsers', type: 'worker', label: 'Parsers', x: 0, y: 2 },
    { id: 'store', type: 'objectStore', label: 'Page storage', sublabel: 'compressed', x: 1, y: 2 },
    { id: 'others', type: 'worker', label: 'Other crawler nodes', sublabel: 'own other hosts', x: 0, y: 3 },
  ],
  edges: [
    { id: 'fetchers-frontier', from: 'fetchers', to: 'frontier', kind: 'sync' },
    { id: 'fetchers-dns', from: 'fetchers', to: 'dns', kind: 'sync' },
    { id: 'fetchers-web', from: 'fetchers', to: 'web', kind: 'sync' },
    { id: 'fetchers-store', from: 'fetchers', to: 'store', kind: 'sync' },
    { id: 'store-parsers', from: 'store', to: 'parsers', kind: 'async', label: 'new page' },
    { id: 'parsers-frontier', from: 'parsers', to: 'frontier', kind: 'sync', label: 'new links' },
    { id: 'frontier-seen', from: 'frontier', to: 'seen', kind: 'sync' },
    { id: 'parsers-others', from: 'parsers', to: 'others', kind: 'async', label: 'other hosts' },
  ],
  narrow: {
    grid: { cols: 3, rows: 5 },
    positions: {
      seen: { x: 0, y: 0 },
      dns: { x: 1, y: 0 },
      frontier: { x: 0, y: 1 },
      fetchers: { x: 1, y: 1 },
      web: { x: 2, y: 1 },
      store: { x: 1, y: 2 },
      parsers: { x: 0, y: 3 },
      others: { x: 0, y: 4 },
    },
    sides: { 'store-parsers': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'The **URL frontier** keeps a queue for each host and the time each host may next be fetched. One of the **fetchers** asks for work and gets a URL whose host is due, on a lease of a few minutes.',
      flow: ['fetchers-frontier', '<fetchers-frontier'],
    },
    {
      caption:
        'The fetcher finds the host’s address in a local cache, the **DNS resolver**, because an outside lookup can take tens of milliseconds (ballpark). It then downloads the page from the **websites**, with a 30-second limit and a size cap. By [[Little’s law|littles-law]], 10,000 pages a second at about a second each means about 10,000 downloads in flight across the fleet.',
      flow: ['fetchers-dns', '<fetchers-dns', 'fetchers-web', '<fetchers-web'],
      notes: [{ target: 'dns', text: 'cached for hours' }],
    },
    {
      caption:
        'It stores the compressed page in **page storage**, which tells the **parsers**. They pull out every link, turn it into a full, normalized address (lower-case host, no fragment, no tracking parameters), and drop links the site’s robots.txt forbids.',
      flow: ['fetchers-store', 'store-parsers'],
    },
    {
      caption:
        'Every host belongs to exactly one crawler node, chosen by consistent hashing on the host name. Links for this node’s hosts go to the frontier, which queues only those the **seen-URL filter** has never seen; links for other hosts are batched and sent to the **other crawler nodes** that own them.',
      flow: ['parsers-frontier', 'frontier-seen', '<frontier-seen', 'parsers-others'],
      notes: [
        { target: 'seen', text: '≈ 1% false positives' },
        { target: 'others', text: 'batched by host' },
      ],
    },
    {
      caption:
        'Politeness lives in the frontier: a host’s next URL isn’t handed out until its delay has passed, a second or two (ballpark), and only one fetch per host runs at a time. Speed comes from width instead, with tens of thousands of sites crawled side by side.',
      flow: ['fetchers-frontier', '<fetchers-frontier', 'fetchers-web', '<fetchers-web'],
      notes: [{ target: 'web', text: 'one request at a time' }],
    },
  ],
};

/** v3: recrawls scheduled by change rate, conditional fetches, content fingerprints. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'urls', type: 'nosqlDb', label: 'URL store', sublabel: 'next visit per URL', x: 0, y: 0 },
    { id: 'scheduler', type: 'worker', label: 'Recrawl scheduler', x: 1, y: 0 },
    { id: 'fingerprints', type: 'nosqlDb', label: 'Content fingerprints', sublabel: 'hash to first URL', x: 2, y: 0 },
    { id: 'frontier', type: 'queue', label: 'URL frontier', x: 1, y: 1 },
    { id: 'fetchers', type: 'worker', label: 'Fetchers', x: 2, y: 1 },
    { id: 'web', type: 'external', label: 'Websites', x: 3, y: 1 },
    { id: 'store', type: 'objectStore', label: 'Page storage', x: 2, y: 2 },
    { id: 'events', type: 'stream', label: 'Page events', sublabel: 'to indexing', x: 3, y: 2 },
  ],
  edges: [
    { id: 'scheduler-urls', from: 'scheduler', to: 'urls', kind: 'sync' },
    { id: 'scheduler-frontier', from: 'scheduler', to: 'frontier', kind: 'sync', label: 'due URLs' },
    { id: 'fetchers-frontier', from: 'fetchers', to: 'frontier', kind: 'sync' },
    { id: 'fetchers-web', from: 'fetchers', to: 'web', kind: 'sync' },
    { id: 'fetchers-fingerprints', from: 'fetchers', to: 'fingerprints', kind: 'sync' },
    { id: 'fetchers-store', from: 'fetchers', to: 'store', kind: 'sync' },
    { id: 'store-events', from: 'store', to: 'events', kind: 'async' },
    { id: 'frontier-urls', from: 'frontier', to: 'urls', kind: 'sync' },
  ],
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      scheduler: { x: 0, y: 0 },
      urls: { x: 1, y: 0 },
      fingerprints: { x: 2, y: 0 },
      frontier: { x: 0, y: 1 },
      fetchers: { x: 1, y: 1 },
      web: { x: 2, y: 1 },
      store: { x: 1, y: 2 },
      events: { x: 2, y: 2 },
    },
  },
  steps: [
    {
      caption:
        'The **recrawl scheduler** scans the **URL store** for pages that are due again: a news front page that changes hourly is due within the hour, while a page unchanged for a year waits weeks. It puts them in the **URL frontier** with a priority.',
      flow: ['scheduler-urls', '<scheduler-urls', 'scheduler-frontier'],
      notes: [{ target: 'scheduler', text: 'due by change rate' }],
    },
    {
      caption:
        'One of the **fetchers** asks the site for the page only if it changed, sending the date and version tag from the last visit. An unchanged page answers `304 Not Modified` with no body, so the visit costs almost nothing.',
      flow: ['fetchers-frontier', '<fetchers-frontier', 'fetchers-web', { edge: 'fetchers-web', reverse: true, tag: '304' }],
    },
    {
      caption:
        'A changed page is hashed with a [[hash function|hash-function]]. If the **content fingerprints** already hold that hash, the same page lives at another address, such as a mirror, so it is recorded as a duplicate and not stored or indexed again.',
      flow: ['fetchers-web', '<fetchers-web', 'fetchers-fingerprints', { edge: 'fetchers-fingerprints', reverse: true, tag: 'duplicate' }],
    },
    {
      caption:
        'A new or changed page goes to **page storage**, and an event on the **page events** stream hands it to indexing. The outcome goes back through the frontier to the URL store, so the scheduler learns how often each page really changes.',
      flow: ['fetchers-store', 'store-events', 'fetchers-frontier', 'frontier-urls'],
    },
  ],
};

/** v4: what each failure does to the crawl. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'coord', type: 'service', label: 'Coordination service', sublabel: 'host-to-node map', x: 1, y: 0 },
    { id: 'a', type: 'worker', label: 'Crawler node A', x: 0, y: 1 },
    { id: 'b', type: 'worker', label: 'Crawler node B', x: 1, y: 1 },
    { id: 'c', type: 'worker', label: 'Crawler node C', x: 2, y: 1 },
    { id: 'web', type: 'external', label: 'Websites', x: 3, y: 1 },
    { id: 'urls', type: 'nosqlDb', label: 'URL store', sublabel: 'durable record', x: 1, y: 2 },
  ],
  edges: [
    { id: 'a-coord', from: 'a', to: 'coord', kind: 'sync' },
    { id: 'b-coord', from: 'b', to: 'coord', kind: 'sync' },
    { id: 'c-coord', from: 'c', to: 'coord', kind: 'sync' },
    { id: 'a-urls', from: 'a', to: 'urls', kind: 'sync' },
    { id: 'b-urls', from: 'b', to: 'urls', kind: 'sync' },
    { id: 'c-urls', from: 'c', to: 'urls', kind: 'sync' },
    { id: 'c-web', from: 'c', to: 'web', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The **coordination service**, a small, strongly consistent store such as ZooKeeper or etcd, holds the map from hosts to crawler nodes, and each node sends it a [[heartbeat|heartbeat]] every few seconds. The **URL store** is the durable record of every address and when it is due, so any node’s frontier can be rebuilt from it.',
      focus: ['urls'],
      flow: [['a-coord', 'b-coord', 'c-coord']],
    },
    {
      caption:
        '**Crawler node B** dies. Its heartbeats stop, and within seconds its hosts are reassigned; consistent hashing moves only B’s share, so A and C each take about half. They rebuild queues for their new hosts from the URL store, and URLs that B had leased but not finished are fetched again: [[at least once|at-least-once]], never lost.',
      fail: ['b'],
      flow: [['a-urls', 'c-urls']],
      notes: [{ target: 'a', text: 'takes half of B’s hosts' }],
    },
    {
      caption:
        'A site generates endless pages, such as a calendar that always links to the next day. Per-host caps on pages, link depth and address length stop **crawler node C** from spending its budget there, and politeness keeps the trap to one fetch at a time anyway.',
      flow: ['c-web', '<c-web'],
      notes: [{ target: 'web', text: 'endless pages', tone: 'alert' }],
    },
    {
      caption:
        'A site starts answering `503 Service Unavailable`. Node C backs off that host with [[exponential backoff|exponential-backoff]], doubling the delay after each error, so a struggling site gets breathing room instead of more load while its URLs simply wait.',
      flow: ['c-web', { edge: 'c-web', reverse: true, tag: '503' }],
      notes: [{ target: 'web', text: 'backing off' }],
    },
  ],
};

const problem: Problem = {
  id: 'web-crawler',
  title: 'Web crawler',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a web crawler for a [[search engine|search-engine]]. Starting from a few seed pages, it should discover and download billions of pages by following links, and revisit them to pick up changes.',
  concepts: ['queues-and-streams', 'probabilistic-structures', 'rate-limiting', 'consistent-hashing', 'dns', 'storage-types', 'back-of-the-envelope'],
  hints: [
    'Start with the loop: take an address, download the page, store it, pull out its links, and queue the new ones. Then ask what goes wrong when that loop runs ten thousand times a second against websites you don’t own.',
    'Two rules shape everything: never send a site more than a trickle of requests, and never fetch the same page twice by accident. Think about how the queue of waiting addresses can enforce the first, and how to answer “seen it before?” half a million times a second for the second.',
    'One shape that works: a frontier with priority queues in front and one queue per host behind, each host with a time it may next be fetched; fetchers with a local Domain Name System (DNS) cache; a [[Bloom filter|bloom-filter]] for seen [[uniform resource locators|url]] (URLs); and crawler nodes that each own a share of hosts, assigned by [[consistent hashing|consistent-hashing]] and recorded in a [[coordination service|coordination-service]].',
  ],
  clarifyingQuestions: [
    {
      q: 'How many pages, and how fresh must our copies be?',
      why: 'Assume an index of 10 billion pages refreshed every 10 days on average, so about 1 billion fetches a day (ballpark): 10,000 pages a second. Freshness decides how much of that budget goes to revisiting known pages rather than finding new ones.',
    },
    {
      q: 'Which content do we fetch: only web pages, or also images, documents and video?',
      why: 'Pages written in HyperText Markup Language ([[HTML|html]]) average around 100 KB (ballpark) and keep the parser simple. Other types multiply storage and bandwidth and need their own processing, so start with HTML only.',
    },
    {
      q: 'Must we follow robots.txt and limit how hard we hit each site?',
      why: 'Yes, always: a crawler that ignores them overloads small sites and gets blocked. Politeness, about one request at a time per site with a pause between them, shapes the whole frontier, and it means speed must come from crawling many sites in parallel.',
    },
    {
      q: 'Do we need to run JavaScript to see a page’s content?',
      why: 'Rendering runs a browser for each page and costs many times more than parsing HTML (ballpark). Assume plain HTML first, with a separate, smaller rendering queue for pages that need it.',
    },
    {
      q: 'How should duplicate and near-duplicate pages be handled?',
      why: 'Much of the web is copies: mirrors, one page under several addresses, printer-friendly versions. Detecting duplicates by address and by content saves storage and stops endless page generators from eating the budget.',
    },
    {
      q: 'What happens to the pages once we have them?',
      why: 'If a separate indexing pipeline consumes them, the crawler only stores pages and announces them on a stream. Ranking and indexing stay out of scope, and parsing in the crawler only needs to find links.',
    },
  ],
  requirements: {
    functional: [
      'Start from seed URLs and keep discovering new pages by following links.',
      'Download pages, store the latest copy of each, and hand every new or changed page to the indexing pipeline.',
      'Revisit known pages on a schedule that depends on how often they change and how important they are.',
      'Obey each site’s robots.txt and limit the request rate for every site.',
      'Skip duplicate addresses and duplicate content, and avoid sites that generate endless pages.',
    ],
    nonFunctional: [
      '[[Throughput|throughput]]: about 10,000 pages a second, or 1 billion a day (ballpark).',
      'Polite: at most one request at a time to a site, with about a second or more between requests (ballpark), and slower if the site asks.',
      'Grows by adding machines, with no single machine on the path of every URL.',
      'Fault tolerant: a crashed machine loses no URLs; at worst some pages are fetched twice.',
      'Copes with a hostile web: slow servers, endless pages, broken markup and huge files can’t stall it.',
    ],
    outOfScope: [
      'Ranking pages and building the search index.',
      'Running JavaScript to render pages, beyond a separate queue for the few that need it.',
      'Pages behind logins or paywalls.',
      'Images, video and other content that isn’t a web page.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Pages fetched per day', value: '1 billion (ballpark), to refresh a 10-billion-page index about every 10 days' },
      { label: 'Average page size', value: 'about 100 KB of HTML, about 25 KB compressed' },
      { label: 'Links per page', value: 'about 50' },
      { label: 'Addresses known, crawled or waiting', value: 'about 30 billion' },
      { label: 'Time per fetch', value: 'about 1 second, counting slow sites' },
      { label: 'Delay between requests to one site', value: 'about 2 seconds (ballpark), longer if the site asks' },
      { label: 'Busiest hour compared with the daily average', value: '1×: a crawler runs flat out all day' },
      {
        label: 'In the calculator',
        value: 'each page fetched in a day is one “user” whose write is the stored page and whose 50 reads are link checks. Its incoming bandwidth is the download rate; ignore its outgoing bandwidth and cache lines, and note its storage keeps every fetch, while we keep only the latest copy',
      },
    ],
    steps: [
      { label: 'Pages per second', math: '10⁹ pages a day ÷ 10⁵ seconds a day', result: '≈ 10,000 a second, all day' },
      { label: 'Download bandwidth', math: '10,000 pages a second × 100 KB = 1 GB a second; × 8 bits per byte', result: '≈ 8 gigabits a second, more with retries and redirects' },
      { label: 'Stored pages', math: 'latest copy of 10¹⁰ pages × 25 KB compressed', result: '≈ 250 TB, about 1 petabyte uncompressed' },
      { label: 'Link checks', math: '10⁹ pages × 50 links = 5 × 10¹⁰ a day; ÷ 10⁵ seconds', result: '≈ 500,000 a second: must be answered in memory' },
      { label: 'Seen-URL filter', math: '3 × 10¹⁰ URLs × 9.6 bits for 1% false positives ≈ 2.9 × 10¹¹ bits', result: '≈ 36 GB, split across crawler nodes' },
      { label: 'Downloads in flight', math: '10,000 pages a second × 1 second each (Little’s law)', result: '≈ 10,000 open connections: 20 machines at 500 each, about 50 with headroom' },
      { label: 'Sites crawled at once', math: '10,000 pages a second × 2 seconds between requests to one site', result: '≈ 20,000 sites in flight at any moment' },
    ],
    calculator: { dau: 1_000_000_000, actionsPerUser: 51, readsPerWrite: 50, objectBytes: 100_000, peakFactor: 1, retentionYears: 1 },
  },
  api: [
    {
      signature: 'frontier.add([{ url, priority, foundOn }])  →  { accepted }',
      description: 'Adds discovered URLs after normalization and the seen check. Parsers batch these calls per owning node, and adding a URL that is already known is harmless.',
    },
    {
      signature: 'frontier.next(fetcherId)  →  { url, host, leaseUntil }',
      description:
        'Hands a fetcher the next URL whose host is due, on a [[lease|lease]] of a few minutes. If the fetcher dies, the lease runs out and the URL goes to another fetcher.',
    },
    {
      signature: 'frontier.complete(url, { status, contentHash, changed })  →  ok',
      description: 'Ends the lease, records the outcome in the URL store, and sets the host’s next ready time and the page’s next visit.',
    },
    {
      signature: 'fetch(url, { ifModifiedSince, etag })  →  { status, headers, body ≤ 10 MB }',
      description:
        'The fetcher’s request to a site, with about 30 seconds to finish (ballpark) and a size cap. The conditional headers let an unchanged page answer `304 Not Modified` with no body.',
    },
    {
      signature: 'PageStored event  { url, fetchedAt, contentHash, storageKey }',
      description: 'Published on a stream for the indexing pipeline whenever a page is new or changed. The pipeline reads at its own pace, so a slow indexer never slows the crawl.',
    },
  ],
  dataModel: [
    {
      entity: 'URL record',
      fields: ['url_hash: 64-bit (key)', 'url', 'host', 'last_fetched, last_changed', 'content_hash', 'next_visit, priority'],
      store: 'Wide-column store such as Cassandra or Bigtable, partitioned by host',
      why: 'Tens of billions of rows, read and written by key, plus scans of each host’s URLs for scheduling: a [[wide-column store|wide-column-store]] fits. Partitioning by host keeps a site’s URLs together, next to the node that owns that host.',
    },
    {
      entity: 'Frontier queues',
      fields: ['per host: URLs waiting, in priority order', 'host_ready_at: when the host may be fetched next', 'heap of hosts ordered by host_ready_at'],
      store: 'On each crawler node: heads in memory, the rest on local disk, saved regularly',
      why: 'Billions of waiting URLs don’t fit in memory, but only the front of each queue is needed at any moment. Keeping each host’s queue on one node makes politeness a local decision.',
    },
    {
      entity: 'Seen-URL filter',
      fields: ['bit array: about 9.6 bits per URL', '7 hash functions', 'one filter per crawler node'],
      store: 'Memory of each crawler node, saved to disk regularly',
      why: 'Answers about 500,000 “seen it?” checks a second (ballpark) from memory. A [[false positive|false-positive]] skips a new URL now and then, which a crawler can afford, and the filter never says a seen URL is new.',
    },
    {
      entity: 'Host record',
      fields: ['host (key)', 'robots_rules, robots_fetched_at', 'crawl_delay, host_ready_at', 'ip_address, dns_expires_at', 'recent_errors'],
      store: 'A key-value store, cached on the crawler node that owns the host',
      why: 'Each host’s robots.txt rules, delay and cached address are checked before every fetch, so they live next to that host’s queue. Robots rules are fetched again about once a day (ballpark).',
    },
    {
      entity: 'Page copy',
      fields: ['key: url_hash + fetched_at', 'compressed HTML', 'status, headers'],
      store: 'Object storage, compressed, latest copy per page',
      why: 'About 250 TB compressed (ballpark), written once and read in bulk by indexing, which is what object storage does cheaply.',
    },
    {
      entity: 'Content fingerprint',
      fields: ['content_hash (key)', 'first_url', 'seen_count'],
      store: 'A key-value store sharded by hash',
      why: 'Hashing each page body catches exact copies under different addresses after one fetch, so the copy is neither stored nor indexed again.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Find and download pages by following links, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One machine with a queue, a set of seen addresses and a place to keep pages proves the loop. It manages a few pages a second, its seen set outgrows memory within days, and its first-in, first-out queue fires bursts of requests at whichever site it is reading, which is rude and gets it blocked.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 10,000 pages a second and 500,000 link checks a second (ballpark), while no site ever gets more than one request at a time.',
      diagram: v2,
      explanation:
        'Fetching, parsing and checking are separate steps joined by queues, so each grows on its own, and each crawler node owns a share of hosts from end to end. Politeness is a property of the frontier, and throughput comes from crawling tens of thousands of sites at once rather than any one site quickly.',
    },
    {
      title: 'v3: Fresh copies, no duplicates',
      solves: 'A crawl that only discovers goes stale, and refetching every page on a fixed cycle wastes most of the budget on pages that never change or exist twice.',
      diagram: v3,
      explanation:
        'The scheduler spends fetches where pages change, conditional requests make unchanged pages nearly free, and content hashes catch copies under different addresses. Each visit’s outcome teaches the scheduler, so the budget follows how fast each part of the web really changes.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'Crashed machines, hostile or failing sites and slow lookups must not lose URLs, stall the crawl or hurt anyone’s website.',
      diagram: v4,
      explanation:
        'Durable state, the URL store and saved frontier queues, means any node can be rebuilt, and leases make repeated work the worst case. Per-host limits contain whatever one site does, so a bad site can waste only its own share of the budget.',
    },
  ],
  deepDives: [
    {
      title: 'The URL frontier: priority and politeness',
      problem:
        'The frontier decides what to fetch next. It must prefer important and stale pages, never send two requests at once to one site, and keep thousands of fetchers busy, with billions of URLs waiting.',
      options: {
        caption: 'Four ways to order the work',
        rows: [
          {
            option: 'One first-in, first-out queue',
            goodAt: 'Simplest, and it explores the web level by level.',
            badAt: 'A page’s links mostly point to its own site, so the crawler hits that site in bursts, and nothing marks some pages as more important.',
            pickWhen: 'A tiny crawl of a few sites.',
          },
          {
            option: 'A single priority queue',
            goodAt: 'Fetches important pages first, ranked by links pointing to them or by how often they change.',
            badAt: 'Still impolite: the top of the queue is often many pages from one big site.',
            pickWhen: 'Never alone; it is half of the answer.',
          },
          {
            option: 'One queue per host, with a ready time',
            goodAt: 'A heap of hosts ordered by when each may next be fetched builds politeness in, and many hosts interleave naturally.',
            badAt: 'Millions of queues to manage, most of them on disk, and no notion of importance on its own.',
            pickWhen: 'The other half of the answer.',
          },
          {
            option: 'Priority queues in front, host queues behind',
            goodAt: 'Priority decides which URLs move forward; host queues decide when each may be fetched. Both goals are met.',
            badAt: 'The most moving parts, and the flow from front to back needs tuning.',
            pickWhen: 'The default for a large crawler.',
          },
        ],
      },
      recommendation:
        'Use two layers: priority queues in front, filled by the scheduler and the parsers, and behind them one queue per host plus a heap of hosts ordered by the time each may next be fetched. A fetcher takes the host at the top of the heap, fetches one URL, and puts the host back with its next ready time: now plus its delay, which grows if the site is slow or asks for less. Keep each host’s queue on the one node that owns the host, mostly on disk, with only the front of each queue in memory.',
    },
    {
      title: 'Have we seen this URL before?',
      problem:
        'With about 50 links per page, the crawler checks about 500,000 URLs a second (ballpark) against tens of billions it already knows. A lookup that touches disk for every check would be far too slow.',
      options: {
        caption: 'Four ways to answer “seen it?”',
        rows: [
          {
            option: 'Hash set of full URLs in memory',
            goodAt: 'Exact answers, very fast.',
            badAt: 'At 30 billion URLs and about 100 bytes each, roughly 3 TB of memory (ballpark).',
            pickWhen: 'Small crawls.',
          },
          {
            option: 'Database lookup per URL',
            goodAt: 'Exact and durable, and the URL store exists anyway for scheduling.',
            badAt: 'About 500,000 random reads a second, most of them for URLs already seen.',
            pickWhen: 'Behind a filter, for the few URLs that pass it.',
          },
          {
            option: 'Set of 8-byte hashes',
            goodAt: 'Exact apart from rare collisions, in about 240 GB for 30 billion URLs (ballpark).',
            badAt: 'Still a lot of memory to shard and keep safe.',
            pickWhen: 'Memory is plentiful and skipped pages are costly.',
          },
          {
            option: 'Bloom filter',
            goodAt: 'About 9.6 bits per URL for 1% false positives: about 36 GB for 30 billion URLs, split across nodes.',
            badAt: 'About 1 new URL in 100 is wrongly skipped as seen, and entries can’t be removed.',
            pickWhen: 'The default first check at crawl scale.',
          },
        ],
      },
      recommendation:
        'Shard the check by host, so each node checks only its own hosts’ URLs, and use a Bloom filter as the first check: about 36 GB in total at 1% false positives (ballpark). A URL the filter calls new really is new, so it goes into the frontier and the URL store. Losing 1% of new URLs is acceptable because important pages are linked from many places and come back another way; size the filter for growth, since false positives climb fast when it overfills.',
    },
    {
      title: 'Duplicate content and crawler traps',
      problem:
        'Many addresses lead to the same content: mirrors, session identifiers in addresses, sorting parameters, printer versions. Other sites never end, such as calendars or generated search pages, and can swallow the crawl budget.',
      options: {
        caption: 'Four defenses, usually used together',
        rows: [
          {
            option: 'Normalize URLs',
            goodAt: 'Lower-casing hosts, dropping fragments, sorting query parameters and removing known tracking parameters merges many addresses before anything is fetched.',
            badAt: 'Catches only the patterns you know about.',
            pickWhen: 'Always, before the seen check.',
          },
          {
            option: 'Exact content hash',
            goodAt: 'A hash of the page body catches identical copies at different addresses after one fetch.',
            badAt: 'One changed byte, such as a timestamp or an ad, makes a copy look new.',
            pickWhen: 'Always: cheap, and it catches mirrors.',
          },
          {
            option: 'Near-duplicate fingerprints',
            goodAt: 'A similarity fingerprint such as SimHash gives nearly identical pages fingerprints that differ in only a few bits.',
            badAt: 'Finding every fingerprint within a few bits needs extra indexes, and similar pages are sometimes genuinely different.',
            pickWhen: 'Large crawls where near-copies waste a noticeable share of fetches.',
          },
          {
            option: 'Per-host limits',
            goodAt: 'Caps on pages per host, address length and link depth stop any trap, known or not.',
            badAt: 'Can cut off a large legitimate site unless the caps have exceptions.',
            pickWhen: 'Always, as the backstop.',
          },
        ],
      },
      recommendation:
        'Normalize every URL before the seen check, hash every fetched body and skip exact duplicates, and add near-duplicate fingerprints if copies eat a noticeable share of the crawl. Cap pages per host per day, address length and link depth, with higher caps for sites known to be large and important. Watch pages per host: a host whose page count keeps climbing with no new content is probably a trap.',
    },
    {
      title: 'Splitting the crawl across machines',
      problem:
        'About 10,000 pages a second (ballpark) needs dozens of machines. Politeness needs every request to one host to go through one place, and deduplication needs each URL checked in one place.',
      options: {
        caption: 'Four ways to divide the work',
        rows: [
          {
            option: 'One shared frontier',
            goodAt: 'One global view of priorities and politeness.',
            badAt: 'Every fetch and every discovered link goes through it: a bottleneck and a [[single point of failure|single-point-of-failure]].',
            pickWhen: 'A few machines.',
          },
          {
            option: 'URLs assigned at random',
            goodAt: 'Spreads work evenly.',
            badAt: 'Two nodes can hit the same host at once, and every node needs the whole seen set.',
            pickWhen: 'Never, for a polite crawler.',
          },
          {
            option: 'Partition by host, with consistent hashing',
            goodAt: 'Each host belongs to one node, so politeness, robots rules, the address cache and the seen check are all local, and adding a node moves only a small share of hosts.',
            badAt: 'Links to other hosts must be forwarded, and one giant site can’t be spread across nodes.',
            pickWhen: 'The default.',
          },
          {
            option: 'Partition by a hash of the full URL',
            goodAt: 'Spreads even a giant site’s pages evenly.',
            badAt: 'Politeness for a host now spans nodes and needs a shared rate limit.',
            pickWhen: 'Only for the handful of huge sites, with a shared limit per host.',
          },
        ],
      },
      recommendation:
        'Partition by a hash of the host name with consistent hashing, with the map kept in a coordination service, so each node owns its hosts from end to end. Forward links for other nodes’ hosts in batches through a stream partitioned the same way. Add nodes when frontier queues grow faster than fetchers drain them; consistent hashing keeps each addition cheap.',
    },
  ],
  failureModes: [
    {
      scenario: '10× the target: 100,000 pages a second (ballpark).',
      impact: 'Bandwidth reaches about 80 gigabits a second and link checks 5 million a second, and politeness caps how much any one site can contribute.',
      mitigation:
        'Add crawler nodes, which consistent hashing spreads hosts over, and crawl ten times as many sites at once, since each is held to about one request a second (ballpark). Warm the address cache ahead of time for hosts about to become due.',
    },
    {
      scenario: '100× links from one site: a site that generates millions of pages.',
      impact: 'Its node’s queues and seen filter fill with junk URLs, and that host’s budget is wasted.',
      mitigation: 'Per-host page caps, depth and length limits, and an alert on hosts whose page counts climb without new content.',
    },
    {
      scenario: 'A crawler node dies.',
      impact: 'Its hosts stop being crawled, and the URLs it had leased are in limbo.',
      mitigation:
        'Heartbeats stop, the coordination service reassigns its hosts, and the new owners rebuild queues from the URL store. Leased URLs are fetched again, which is harmless because a fetch only reads.',
    },
    {
      scenario: 'A site is slow, returns errors or asks us to slow down.',
      impact: 'Fetches hang or fail, and keeping the same pace could hurt the site.',
      mitigation:
        'Timeouts on connecting and downloading, exponential backoff per host, and honoring `429 Too Many Requests` with its `Retry-After` header. After repeated failures, the host is paused for hours.',
    },
    {
      scenario: 'The DNS resolver is slow or down.',
      impact: 'Fetchers wait on lookups, and throughput collapses even though the sites are fine.',
      mitigation: 'Cache each host’s address for its full time to live, run several resolvers, and look up addresses ahead of time for hosts about to become due.',
    },
    {
      scenario: 'Page storage or the URL store is unavailable.',
      impact: 'Fetched pages and their outcomes can’t be saved.',
      mitigation:
        'Pause fetching rather than lose work ([[backpressure|backpressure]]): the frontier stops handing out URLs while storage is down and resumes from its saved state.',
    },
    {
      scenario: 'A node’s seen filter is lost in a crash.',
      impact: 'Every URL would look new, flooding the frontier with pages already crawled.',
      mitigation: 'Save each filter to disk regularly and rebuild it from the URL store if needed. Until it is back, check the URL store directly, at a lower crawl rate.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Draws the basic loop: take a URL, fetch the page, store it, extract links, and queue the new ones.',
        'Avoids fetching the same URL twice with a seen set.',
        'Mentions robots.txt and not overloading sites.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Designs a frontier with a queue and a delay per host, so the crawler is polite yet keeps thousands of fetches in flight.',
        'Sizes bandwidth, storage and link checks, and picks a Bloom filter for the seen check, with its false-positive trade-off.',
        'Splits the work across machines by host and explains why.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Handles the hostile web: traps, duplicates, and slow or failing sites, with caps, timeouts and backoff per host.',
        'Plans recrawling by change rate and importance, with conditional requests to save bandwidth.',
        'Explains recovery from a dead node: heartbeats, reassignment by consistent hashing, frontier rebuilt from durable state, fetches repeated rather than lost.',
      ],
    },
  ],
  followUps: [
    {
      q: 'How do you make sure you never hit one website too hard?',
      a: 'All of a host’s URLs wait in one queue on the one node that owns the host, and the frontier hands out its next URL only after the host’s delay has passed, with one fetch in flight at a time. The delay starts at a second or two (ballpark), follows any crawl delay in robots.txt, and grows when the site slows down or returns errors.',
    },
    {
      q: 'Your Bloom filter says a URL was seen, but it wasn’t. What happens?',
      a: 'We skip a page we have never fetched, about 1 time in 100 at our sizing. That is acceptable because important pages are linked from many places and come back through other links. If it mattered more, I’d size for 0.1%, about 14 bits per URL, or check the URL store for high-priority URLs.',
    },
    {
      q: 'A crawler node just died. What happens to its hosts and its URLs?',
      a: 'Its heartbeats stop, and the coordination service reassigns its hosts, with consistent hashing moving only that node’s share. The new owners rebuild those hosts’ queues from the URL store, and URLs that were leased but unfinished are handed out again, so some pages are fetched twice and none are lost.',
    },
    {
      q: 'How do you avoid getting stuck in a site that generates infinite pages?',
      a: 'Normalize URLs to merge obvious variants, cap pages per host per day, cap address length and link depth, and watch for hosts whose page count keeps climbing with no new content. Politeness also limits the damage: a trap gets one fetch at a time, so it can waste its own host’s budget but never the whole crawl’s.',
    },
    {
      q: 'How do you decide when to fetch a page again?',
      a: 'Track how often each page changed across past visits and schedule the next visit to match: hourly for a busy news page, weeks for an archive. Weight by importance, such as how many pages link to it, and use conditional requests so unchanged pages answer `304 Not Modified` without a body.',
    },
    {
      q: 'Some pages need JavaScript to show their content. What would you do?',
      a: 'Keep the main crawl on plain HTML, and send pages that look empty without scripts to a separate rendering queue, where headless browsers run them. Rendering costs far more per page (ballpark), so it gets its own budget and priority.',
    },
  ],
  rubric: [
    { item: 'Estimated pages per second, bandwidth, storage and link checks, and sized the crawler from them', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Designed a frontier with priority and a queue per host, so the crawler stays polite', weight: 25, lessonId: 'rate-limiting' },
    { item: 'Deduplicated URLs with a Bloom filter or similar, and content with fingerprints', weight: 20, lessonId: 'probabilistic-structures' },
    { item: 'Split the crawl across machines by host with consistent hashing', weight: 15, lessonId: 'consistent-hashing' },
    { item: 'Decoupled fetching, parsing and storing with queues, and recovered leased work after crashes', weight: 10, lessonId: 'queues-and-streams' },
    { item: 'Cached DNS lookups and handled slow, failing and hostile sites with timeouts and backoff', weight: 10, lessonId: 'dns' },
    { item: 'Scheduled recrawls by change rate and importance, with conditional requests', weight: 10, lessonId: 'http-essentials' },
  ],
};

export default problem;
