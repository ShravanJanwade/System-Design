import type { DiagramEdge, DiagramNode, NodeType, PracticeItem } from '../types';

/**
 * Spot the bottleneck (blueprint section 10): a design, a load, and the component that breaks first.
 * Each item links the lesson that teaches the fix. Capacities are ballpark and labeled as such.
 */

function node(id: string, type: NodeType, label: string, x: number, y: number, sublabel?: string): DiagramNode {
  return sublabel ? { id, type, label, sublabel, x, y } : { id, type, label, x, y };
}

function edge(from: string, to: string, kind: DiagramEdge['kind'] = 'sync'): DiagramEdge {
  return { id: `${from}-${to}`, from, to, kind };
}

type Scenario = {
  id: string;
  title: string;
  lessonId: string;
  prompt: string;
  grid: { cols: number; rows: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  answer: string;
  why: string;
  /** Why each other node holds, keyed by node id, in diagram order. */
  others: Record<string, string>;
};

function bottleneck(s: Scenario): PracticeItem {
  return {
    id: s.id,
    title: s.title,
    lessonId: s.lessonId,
    question: {
      kind: 'bottleneck',
      prompt: s.prompt,
      diagram: { grid: s.grid, nodes: s.nodes, edges: s.edges },
      answerNodeId: s.answer,
      why: s.why,
      others: s.others,
    },
  };
}

export const bottleneckItems: PracticeItem[] = [
  bottleneck({
    id: 'bottleneck-single-database-writes',
    title: 'Writes outgrow one database',
    lessonId: 'sharding',
    prompt:
      'Snapgram launches reactions, and writes jump from 2,000 to 40,000 a second across millions of posts. Every write goes to one primary database, while reads come from a cache and three [[read replicas|read-replica]] (capacities are ballpark). Which component breaks first?',
    grid: { cols: 5, rows: 3 },
    nodes: [
      node('users', 'client', 'Users', 0, 1, '40,000 writes/s'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1),
      node('app', 'service', 'App servers', 2, 1, '20 instances'),
      node('cache', 'cache', 'Cache', 3, 0, 'reads only'),
      node('primary', 'sqlDb', 'Primary database', 3, 2, '≈ 5,000 writes/s'),
      node('replicas', 'sqlDb', 'Read replicas', 4, 2, '3 copies'),
    ],
    edges: [edge('users', 'lb'), edge('lb', 'app'), edge('app', 'cache'), edge('app', 'primary'), edge('primary', 'replicas', 'replication')],
    answer: 'primary',
    why: 'Every write lands on the one primary, which handles about 5,000 writes a second (ballpark). At 40,000 a second its disk and [[write-ahead log|write-ahead-log]] fall behind, so writes queue up and time out. Split the data with [[sharding|sharding]], for example by post, so each shard takes a slice of the writes.',
    others: {
      users: 'Users are the load, not a part of the system that can run out of capacity.',
      lb: 'A load balancer forwards requests and handles far more than 40,000 a second (ballpark). It stores nothing, so writes do not slow it down.',
      app: 'App servers are stateless, so you can add more of them. They mostly wait on the database.',
      cache: 'The cache speeds up reads, but every reaction is a write that must reach the database. Caching does not reduce writes.',
      replicas: 'Replicas copy the primary and serve reads. They add read capacity, but every write still goes through the primary first.',
    },
  }),

  bottleneck({
    id: 'bottleneck-hot-cache-key',
    title: 'One profile everyone opens',
    lessonId: 'caching',
    prompt:
      'A pop star with 80 million followers posts on Snapgram, and about 200,000 requests a second read her profile. The cache cluster picks a node for each key by hashing it, and each node serves about 100,000 reads a second (ballpark). Which component breaks first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('users', 'client', 'Users', 0, 1, '200,000 reads/s'),
      node('app', 'service', 'App servers', 1, 1, '40 instances'),
      node('nodeA', 'cache', 'Cache node A', 2, 0, 'holds her profile'),
      node('nodeB', 'cache', 'Cache node B', 2, 1),
      node('nodeC', 'cache', 'Cache node C', 2, 2),
      node('db', 'sqlDb', 'Database', 1, 2),
    ],
    edges: [edge('users', 'app'), edge('app', 'nodeA'), edge('app', 'nodeB'), edge('app', 'nodeC'), edge('app', 'db')],
    answer: 'nodeA',
    why: 'Hashing sends every read of one key to the same node, so all 200,000 reads a second for her profile land on node A, about twice what it can serve. This is a [[hot key|hot-key]]: the cluster has room, but not on that node. Copy hot keys to several nodes, or keep a short-lived copy in each app server’s memory.',
    others: {
      users: 'Users are the load. The trouble is where their reads end up.',
      app: 'Forty stateless app servers split the traffic, about 5,000 requests a second each (ballpark), which is comfortable.',
      nodeB: 'Node B holds other keys and sees ordinary traffic. Hashing spreads keys across nodes, not the reads of one key.',
      nodeC: 'Node C serves its share of ordinary keys. Her profile never touches it.',
      db: 'Her profile is cached, so the database only sees the occasional miss. The pressure is on the cache node that holds the key.',
    },
  }),

  bottleneck({
    id: 'bottleneck-slow-fraud-check',
    title: 'Checkout waits on a slow fraud check',
    lessonId: 'circuit-breakers',
    prompt:
      'Each checkout calls a fraud-check service and waits for its answer. Today the fraud check slows from about 50 ms to 5 seconds, while traffic stays at 1,000 checkouts a second and the checkout service has 200 worker threads (ballpark). Which component runs out of capacity first?',
    grid: { cols: 4, rows: 3 },
    nodes: [
      node('shoppers', 'client', 'Shoppers', 0, 1, '1,000 checkouts/s'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1),
      node('checkout', 'service', 'Checkout service', 2, 1, '200 threads'),
      node('fraud', 'external', 'Fraud check', 3, 0, '50 ms, now 5 s'),
      node('db', 'sqlDb', 'Orders database', 3, 2),
    ],
    edges: [edge('shoppers', 'lb'), edge('lb', 'checkout'), edge('checkout', 'fraud'), edge('checkout', 'db')],
    answer: 'checkout',
    why: 'Requests in flight equal arrivals times wait ([[Little’s law|littles-law]]), so 1,000 a second times 5 seconds is 5,000 requests waiting, against 200 threads. The pool fills in a fraction of a second, and the checkout service stops answering anyone, though nothing in it is broken. Set a [[timeout|timeout]] on the call and add a [[circuit breaker|circuit-breaker]], so a slow dependency fails fast instead of holding threads.',
    others: {
      shoppers: 'Shoppers send the same 1,000 requests a second as yesterday. The load did not change; the wait did.',
      lb: 'The load balancer only forwards connections. It has no threads tied up waiting on the fraud check.',
      fraud: 'The fraud check is slow but still answering. Its slowness spills upstream into the service that waits on it.',
      db: 'Orders are written only after the fraud check passes, so the database sees fewer writes than usual, not more.',
    },
  }),

  bottleneck({
    id: 'bottleneck-thumbnail-workers',
    title: 'Thumbnails pile up in the queue',
    lessonId: 'queues-and-streams',
    prompt:
      'Snapgram puts each uploaded photo on a queue, and workers turn it into thumbnails. Uploads peak at 3,000 a second, and each resize holds one of 200 worker threads (4 workers with 50 each) for about 200 ms (ballpark). Which component falls behind first?',
    grid: { cols: 3, rows: 2 },
    nodes: [
      node('phones', 'client', 'Phones', 0, 0, '3,000 uploads/s'),
      node('upload', 'service', 'Upload service', 1, 0),
      node('store', 'objectStore', 'Photo storage', 2, 0),
      node('queue', 'queue', 'Resize queue', 1, 1),
      node('workers', 'worker', 'Resize workers', 2, 1, '4 × 50 threads'),
    ],
    edges: [edge('phones', 'upload'), edge('upload', 'store'), edge('upload', 'queue', 'async'), edge('queue', 'workers', 'async'), edge('workers', 'store')],
    answer: 'workers',
    why: 'Two hundred threads at about 200 ms per photo finish about 1,000 photos a second (ballpark), a third of the peak. The backlog grows by about 2,000 photos every second, so thumbnails show up later and later. Add workers until their total throughput beats the peak, and scale them on [[queue depth|queue-depth]].',
    others: {
      phones: 'Phones only upload. They get a reply as soon as the original is stored and the job is queued.',
      upload: 'The upload service stores the file and adds a small message to the queue. It never waits for the resize.',
      store: 'Object storage handles far more requests than this (ballpark). It only stores and returns bytes.',
      queue: 'The queue grows, but holding a backlog is its job. It can hold millions of small messages (ballpark) while the workers catch up.',
    },
  }),

  bottleneck({
    id: 'bottleneck-single-thread-limiter',
    title: 'Every request asks one counter',
    lessonId: 'rate-limiting',
    prompt:
      'An API (application programming interface) gateway checks every request with a rate limiter before passing it on. The limiter is one single-threaded process that keeps its counters in memory and handles about 10,000 checks a second (ballpark). When traffic grows to 30,000 requests a second, which component breaks first?',
    grid: { cols: 4, rows: 2 },
    nodes: [
      node('limiter', 'service', 'Rate limiter', 1, 0, '1 thread'),
      node('clients', 'client', 'Clients', 0, 1, '30,000 requests/s'),
      node('gateway', 'gateway', 'API gateway', 1, 1, '6 instances'),
      node('services', 'service', 'Services', 2, 1, 'autoscaled'),
      node('db', 'sqlDb', 'Database', 3, 1),
    ],
    edges: [edge('clients', 'gateway'), edge('gateway', 'limiter'), edge('gateway', 'services'), edge('services', 'db')],
    answer: 'limiter',
    why: 'One thread handles one check at a time, so the limiter tops out near 10,000 checks a second, a third of the traffic. Checks queue up inside it, and every request through the gateway waits in that line. Run several limiter nodes with the counters split by client, or let each gateway count locally and sync now and then.',
    others: {
      clients: 'Clients are the load. Spread across six gateways, it is ordinary traffic.',
      gateway: 'Six gateway instances split the traffic, about 5,000 requests a second each (ballpark), which is easy for a proxy.',
      services: 'Services sit behind the limiter, so they see at most what it lets through.',
      db: 'The database sits behind the services, so it never sees more than they pass on.',
    },
  }),

  bottleneck({
    id: 'bottleneck-celebrity-fan-out',
    title: 'A celebrity posts to 50 million feeds',
    lessonId: 'feed-fanout',
    prompt:
      'Snapgram builds feeds with [[fan-out on write|fan-out-on-write]]: when someone posts, workers copy the post into every follower’s cached feed. A celebrity with 50 million followers posts, and the workers can make about 500,000 feed writes a second in total (ballpark). Which component falls behind first?',
    grid: { cols: 5, rows: 2 },
    nodes: [
      node('celebrity', 'client', 'Celebrity', 0, 0, '50 million followers'),
      node('post', 'service', 'Post service', 1, 0),
      node('posts', 'nosqlDb', 'Posts table', 1, 1),
      node('queue', 'queue', 'Fan-out queue', 2, 0),
      node('workers', 'worker', 'Fan-out workers', 3, 0, '≈ 500,000 writes/s'),
      node('feeds', 'cache', 'Feed caches', 4, 0, '≈ 2 million writes/s'),
    ],
    edges: [edge('celebrity', 'post'), edge('post', 'posts'), edge('post', 'queue', 'async'), edge('queue', 'workers', 'async'), edge('workers', 'feeds')],
    answer: 'workers',
    why: 'One post becomes 50 million feed writes, so the workers need about 100 seconds for it (ballpark), and every other post waits behind it. Skip the copy step for accounts with huge followings and merge their posts in when a follower opens the feed. That mix is the [[hybrid approach|hybrid-fan-out]].',
    others: {
      celebrity: 'The celebrity sends one request. The cost comes from what the design does with it.',
      post: 'Saving the post is one write and one queue message, done in milliseconds.',
      posts: 'The posts table gets a single write for the new post, however many followers there are.',
      queue: 'The queue holds the waiting work safely, which is what queues are for. It only grows because the workers cannot keep up.',
      feeds: 'The feed caches can take about four times what the workers send (ballpark), so they wait on the workers, not the other way round.',
    },
  }),

  bottleneck({
    id: 'bottleneck-lock-across-payment',
    title: 'A lock held during payment',
    lessonId: 'distributed-locks',
    prompt:
      'A ticketing site sells seats for a popular concert. To prevent double booking, each purchase takes one lock for the whole event, charges the card, writes the booking, then releases the lock. A charge takes about 2 seconds (ballpark), and 5,000 buyers try to check out in the first minute. Which component limits sales first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('buyers', 'client', 'Buyers', 0, 1, '5,000 in a minute'),
      node('booking', 'service', 'Booking service', 1, 1, 'autoscaled'),
      node('lock', 'service', 'Lock service', 2, 0, 'one lock per event'),
      node('payments', 'external', 'Payment provider', 2, 1, '≈ 2 s per charge'),
      node('db', 'sqlDb', 'Bookings database', 2, 2),
    ],
    edges: [edge('buyers', 'booking'), edge('booking', 'lock'), edge('booking', 'payments'), edge('booking', 'db')],
    answer: 'lock',
    why: 'Only one purchase can hold the event lock, and it keeps it through the 2-second charge, so the whole site sells about 30 tickets a minute (ballpark). The other buyers wait in line for the lock, then time out. Lock each seat with a short [[lease|lease]] instead, and never hold a lock across a slow network call.',
    others: {
      buyers: 'Buyers are the demand. A few thousand checkouts in a minute is easy when purchases run in parallel.',
      booking: 'Booking instances sit idle, each waiting for its turn at the lock.',
      payments: 'The payment provider handles many charges at once (ballpark). It only sees one at a time because the lock lines them up.',
      db: 'The bookings database gets one write every 2 seconds, far below its limits.',
    },
  }),

  bottleneck({
    id: 'bottleneck-cross-region-calls',
    title: 'Twenty calls across an ocean',
    lessonId: 'latency-numbers',
    prompt:
      'A profile page is served from Frankfurt, but the settings service it depends on was moved to Virginia. Rendering one page makes 20 calls to it, one after another, and each round trip across the Atlantic takes about 90 ms (ballpark). Where does most of the page’s time go?',
    grid: { cols: 4, rows: 3 },
    nodes: [
      node('users', 'client', 'Users in Europe', 0, 1),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1, 'Frankfurt'),
      node('page', 'service', 'Profile service', 2, 1, 'Frankfurt'),
      node('cache', 'cache', 'Cache', 3, 0, 'Frankfurt, ≈ 1 ms'),
      node('settings', 'service', 'Settings service', 3, 1, 'Virginia'),
      node('db', 'sqlDb', 'Profile database', 3, 2, 'Frankfurt, ≈ 5 ms'),
    ],
    edges: [edge('users', 'lb'), edge('lb', 'page'), edge('page', 'cache'), edge('page', 'settings'), edge('page', 'db')],
    answer: 'settings',
    why: 'The settings service does little work, but every call to it pays about 90 ms of [[round-trip time|round-trip-time]], and 20 calls in a row add about 1.8 seconds to each page (ballpark). Move the service, or a copy of its data, into the same region, or fetch everything in one batched call.',
    others: {
      users: 'Users reach Frankfurt over a short hop, a few tens of milliseconds at most (ballpark).',
      lb: 'The load balancer adds well under a millisecond to each request.',
      page: 'The profile service does little work itself. It mostly waits for its calls to come back.',
      cache: 'The cache is in the same region and answers in about a millisecond.',
      db: 'The database is in the same region, so each query costs a few milliseconds.',
    },
  }),

  bottleneck({
    id: 'bottleneck-unindexed-email-search',
    title: 'Finding orders by email',
    lessonId: 'indexes',
    prompt:
      'A support tool looks up orders by customer email with `WHERE email = ?`. The orders table has 200 million rows, and the `email` column has no index. Support agents run about 50 searches a second. Which component breaks first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('agents', 'client', 'Support agents', 0, 1, '50 searches/s'),
      node('tool', 'service', 'Support tool', 1, 1),
      node('cache', 'cache', 'Cache', 2, 0, 'rarely hit'),
      node('db', 'sqlDb', 'Orders database', 2, 2, '200 million rows'),
    ],
    edges: [edge('agents', 'tool'), edge('tool', 'cache'), edge('tool', 'db')],
    answer: 'db',
    why: 'With no index, each search reads all 200 million rows, a [[full table scan|full-table-scan]] that takes seconds even on fast disks (ballpark). Fifty of those a second saturate the database’s disk and processor, so every other query slows down too. An [[index|index]] on `email` turns each search into a handful of page reads.',
    others: {
      agents: 'Fifty searches a second is light traffic. The cost is in how each search runs.',
      tool: 'The support tool passes each search along and waits. It does almost no work of its own.',
      cache: 'Agents look up different customers, so the cache rarely has the answer. It is not overloaded, just missed.',
    },
  }),

  bottleneck({
    id: 'bottleneck-coordination-leader',
    title: 'Heartbeats through one leader',
    lessonId: 'consensus-leader-election',
    prompt:
      'A team stores each worker’s heartbeat in a three-node [[coordination service|coordination-service]] built on [[Raft|raft]]. Every write goes to the leader, which copies it to a majority before replying. The fleet grows to 40,000 workers, each writing a heartbeat every second. Which component breaks first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('workers', 'worker', 'Workers', 0, 1, '40,000 heartbeats/s'),
      node('leader', 'nosqlDb', 'Leader', 1, 1, '≈ 10,000 writes/s'),
      node('follower1', 'nosqlDb', 'Follower 1', 2, 0),
      node('follower2', 'nosqlDb', 'Follower 2', 2, 2),
    ],
    edges: [edge('workers', 'leader'), edge('leader', 'follower1', 'replication'), edge('leader', 'follower2', 'replication')],
    answer: 'leader',
    why: 'Every write passes through the one leader, which also sends it to the followers, so it caps writes near 10,000 a second (ballpark) however many followers you add. Keep consensus stores for small, rarely changing data such as config and who the leader is. Send heartbeats to a store built for high write rates, or spread them with a [[gossip protocol|gossip-protocol]].',
    others: {
      workers: 'Each worker sends one small write a second. The total is the problem, not any one worker.',
      follower1: 'Followers copy what the leader sends them, at the leader’s pace. Adding followers adds work for the leader, not write capacity.',
      follower2: 'This follower cannot accept writes itself, so it cannot take load off the leader.',
    },
  }),

  bottleneck({
    id: 'bottleneck-cdn-purge-storm',
    title: 'A purge empties the edge',
    lessonId: 'cdns',
    prompt:
      'A news site serves its images through a content delivery network (CDN). Normally the edge servers answer about 95% of requests, so the origin sees about 5,000 a second (ballpark). During the evening peak of 100,000 image requests a second, someone purges the whole CDN cache. Which component breaks first?',
    grid: { cols: 4, rows: 1 },
    nodes: [
      node('readers', 'client', 'Readers', 0, 0, '100,000 requests/s'),
      node('edge', 'cdn', 'CDN edge servers', 1, 0, 'just purged'),
      node('origin', 'service', 'Origin servers', 2, 0, 'sized for ≈ 5,000/s'),
      node('store', 'objectStore', 'Image storage', 3, 0),
    ],
    edges: [edge('readers', 'edge'), edge('edge', 'origin'), edge('origin', 'store')],
    answer: 'origin',
    why: 'With the cache empty, every request misses at once, and all 100,000 a second fall through to origin servers sized for a twentieth of that. They overload and start failing, which keeps the edges from refilling. Purge only the files that changed, use versioned file names, and put an [[origin shield|origin-shield]] in front of the origin.',
    others: {
      readers: 'Readers make the same requests as on any other evening.',
      edge: 'Edge servers are built for this traffic. An empty cache makes them pass requests on, so the load lands behind them.',
      store: 'Image storage sits behind the origin servers, which fail first and limit what reaches it.',
    },
  }),

  bottleneck({
    id: 'bottleneck-shard-by-date',
    title: 'All of today’s writes on one shard',
    lessonId: 'sharding',
    prompt:
      'An analytics service splits its events across shards by date, one shard per day. Events arrive at 60,000 writes a second, and each shard handles about 15,000 writes a second (ballpark). Which component breaks first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('apps', 'client', 'Apps', 0, 1, '60,000 events/s'),
      node('ingest', 'service', 'Ingest service', 1, 1, 'autoscaled'),
      node('older', 'sqlDb', 'Older shards', 2, 0, 'reads only'),
      node('yesterday', 'sqlDb', 'Yesterday’s shard', 2, 1),
      node('today', 'sqlDb', 'Today’s shard', 2, 2),
    ],
    edges: [edge('apps', 'ingest'), edge('ingest', 'older'), edge('ingest', 'yesterday'), edge('ingest', 'today')],
    answer: 'today',
    why: 'Splitting by date is [[range partitioning|range-partitioning]], and every new event falls in today’s range. One shard takes all 60,000 writes a second while the rest sit idle, a classic [[hot spot|hot-spot]]. Shard on a hash of a key such as the device, so new writes spread across every shard.',
    others: {
      apps: 'Apps send events at a steady pace; they are the load.',
      ingest: 'The ingest service is stateless and autoscaled. It forwards writes as fast as the shard accepts them.',
      older: 'Older shards only serve reports. No new events land on them.',
      yesterday: 'Yesterday’s shard stopped taking writes at midnight.',
    },
  }),

  bottleneck({
    id: 'bottleneck-ip-hash-office',
    title: 'One office, one server',
    lessonId: 'load-balancers',
    prompt:
      'A business app’s load balancer picks a server by hashing each client’s IP (Internet Protocol) address. A large customer sends 8,000 requests a second from one office, all from a single shared address, which hashes to app server 2. Each app server handles about 4,000 requests a second (ballpark). Which component breaks first?',
    grid: { cols: 3, rows: 3 },
    nodes: [
      node('office', 'client', 'Large customer', 0, 0, '8,000 requests/s'),
      node('rest', 'client', 'Other customers', 0, 2, 'many addresses'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1, 'hash of IP'),
      node('app1', 'service', 'App server 1', 2, 0),
      node('app2', 'service', 'App server 2', 2, 1),
      node('app3', 'service', 'App server 3', 2, 2),
    ],
    edges: [edge('office', 'lb'), edge('rest', 'lb'), edge('lb', 'app1'), edge('lb', 'app2'), edge('lb', 'app3')],
    answer: 'app2',
    why: '[[Hashing by address|ip-hash]] sends every request from one address to the same server, so all 8,000 requests a second from the office land on app server 2, twice its 4,000. The other servers have room, but the hash never sends the office’s traffic there. Use [[least connections|least-connections]] or [[round robin|round-robin]], and keep sessions in a shared store so any server can answer.',
    others: {
      office: 'Spread across the three servers, the office’s traffic would fit. The problem is that all of it goes to one place.',
      rest: 'Other customers come from many addresses, so their requests spread evenly.',
      lb: 'The load balancer forwards 8,000 requests a second easily. It is doing exactly what its hash rule says.',
      app1: 'App server 1 only gets other customers’ traffic, a light load.',
      app3: 'App server 3 only gets other customers’ traffic and has room to spare.',
    },
  }),

  bottleneck({
    id: 'bottleneck-retry-storm',
    title: 'Retries pile onto a recovering service',
    lessonId: 'timeouts-retries-backoff',
    prompt:
      'A profile service comes back after a two-minute outage. Phones retry every failed request right away, up to five times, with no backoff. Normal traffic is 4,000 requests a second, and the service handles about 6,000 (ballpark). Which component breaks first as it comes back?',
    grid: { cols: 4, rows: 3 },
    nodes: [
      node('phones', 'client', 'Phones', 0, 1, 'retry at once, 5 times'),
      node('gateway', 'gateway', 'Gateway', 1, 1),
      node('profile', 'service', 'Profile service', 2, 1, '≈ 6,000 requests/s'),
      node('cache', 'cache', 'Cache', 3, 0),
      node('db', 'sqlDb', 'Database', 3, 2),
    ],
    edges: [edge('phones', 'gateway'), edge('gateway', 'profile'), edge('profile', 'cache'), edge('profile', 'db')],
    answer: 'profile',
    why: 'Every failed request comes back several more times at once, so the returning service meets its normal traffic plus a wave of retries, several times its 6,000 a second. It fails again, which causes more retries: a [[retry storm|retry-storm]]. Use [[exponential backoff|exponential-backoff]] with [[jitter|jitter]], and cap retries with a [[retry budget|retry-budget]].',
    others: {
      phones: 'Each phone sends only a few requests. Together, with instant retries, they become the storm.',
      gateway: 'The gateway forwards requests and has capacity to spare (ballpark). It passes the storm along rather than failing first.',
      cache: 'The cache answers quickly and only sees requests the profile service gets through.',
      db: 'The database sits behind the profile service, which limits how many requests reach it.',
    },
  }),

  bottleneck({
    id: 'bottleneck-video-through-app',
    title: 'Video bytes through the app servers',
    lessonId: 'storage-types',
    prompt:
      'A course site keeps lecture videos in object storage, but every download streams through its app servers, which fetch the file and pass the bytes on. In the evening, 20,000 students watch at about 5 megabits a second each (ballpark). Which component breaks first?',
    grid: { cols: 4, rows: 2 },
    nodes: [
      node('students', 'client', 'Students', 0, 0, '20,000 streams'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 0, 'managed, scales out'),
      node('app', 'service', 'App servers', 2, 0, '10 × 1 Gbps network'),
      node('store', 'objectStore', 'Object storage', 3, 0, 'videos'),
      node('db', 'sqlDb', 'Course database', 2, 1),
    ],
    edges: [edge('students', 'lb'), edge('lb', 'app'), edge('app', 'store'), edge('app', 'db')],
    answer: 'app',
    why: 'Twenty thousand streams at 5 megabits a second is about 100 gigabits a second, and ten servers with 1-gigabit network cards can send about 10 (ballpark). Their network links fill long before their processors do. Hand out [[pre-signed links|pre-signed-url]] so players download straight from storage, ideally through a content delivery network.',
    others: {
      students: 'Students only press play. Their total demand is what the design has to carry.',
      lb: 'The managed load balancer adds capacity as traffic grows (ballpark), so it is not the first to run out.',
      store: 'Object storage is built to serve huge total bandwidth (ballpark). It never gets asked for more than the app servers can pass on.',
      db: 'The course database answers a few small lookups per video, not the video bytes.',
    },
  }),

  bottleneck({
    id: 'bottleneck-ticket-server',
    title: 'One server hands out every order number',
    lessonId: 'unique-ids',
    prompt:
      'An order system gets each new order number from one [[ticket server|ticket-server]], which increments a counter in a database row and saves it to disk. A flash sale brings 20,000 orders a second, and the ticket server saves about 5,000 increments a second (ballpark). Which component breaks first?',
    grid: { cols: 4, rows: 3 },
    nodes: [
      node('shoppers', 'client', 'Shoppers', 0, 1, '20,000 orders/s'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1),
      node('orders', 'service', 'Order service', 2, 1, 'autoscaled'),
      node('ticket', 'sqlDb', 'Ticket server', 3, 0, 'one counter'),
      node('db', 'sqlDb', 'Orders database', 3, 2, '8 shards'),
    ],
    edges: [edge('shoppers', 'lb'), edge('lb', 'orders'), edge('orders', 'ticket'), edge('orders', 'db')],
    answer: 'ticket',
    why: 'Every order waits on the same counter, and each increment is a write to disk, so the whole system tops out near 5,000 orders a second. The orders database, with eight shards, could take far more. Have each server reserve a block of numbers at a time, or generate [[Snowflake-style identifiers|snowflake-id]] locally from the time, a machine number and a sequence.',
    others: {
      shoppers: 'Shoppers are the load. A flash sale is exactly the peak the design must survive.',
      lb: 'The load balancer forwards requests with plenty of room to spare (ballpark).',
      orders: 'Order service instances are stateless and autoscaled. They spend most of their time waiting for a number.',
      db: 'Eight shards share the order writes, about 2,500 a second each at full speed (ballpark), which they can absorb.',
    },
  }),

  bottleneck({
    id: 'bottleneck-wildcard-product-search',
    title: 'Search with a leading wildcard',
    lessonId: 'search-inverted-indexes',
    prompt:
      "A shop’s search box runs `WHERE name LIKE '%boots%'` against a products table of 5 million rows, which has an index on `name`. Search traffic peaks at 2,000 queries a second. Which component breaks first?",
    grid: { cols: 4, rows: 2 },
    nodes: [
      node('cache', 'cache', 'Page cache', 2, 0, 'product pages only'),
      node('shoppers', 'client', 'Shoppers', 0, 1, '2,000 searches/s'),
      node('lb', 'loadBalancer', 'Load balancer', 1, 1),
      node('app', 'service', 'Shop app', 2, 1, 'autoscaled'),
      node('db', 'sqlDb', 'Products database', 3, 1, '5 million rows'),
    ],
    edges: [edge('shoppers', 'lb'), edge('lb', 'app'), edge('app', 'cache'), edge('app', 'db')],
    answer: 'db',
    why: 'An index on `name` is sorted from the first letter, so it cannot help with a pattern that starts with a wildcard. Every search becomes a [[full table scan|full-table-scan]] of 5 million rows, and 2,000 of those a second saturate the database. Send search to a [[search engine|search-engine]] built on an [[inverted index|inverted-index]], which maps each word straight to the products that contain it.',
    others: {
      cache: 'The page cache only holds product pages, and search terms vary too much to cache well.',
      shoppers: 'Shoppers are the load. Two thousand searches a second is modest for a well-built search.',
      lb: 'The load balancer forwards requests and has plenty of room (ballpark).',
      app: 'App servers are stateless and autoscaled. They pass each search to the database and wait.',
    },
  }),
];
