import type { DiagramSpec, Problem } from '../types';

/** v1: one server, a token bucket per client in its memory. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'partner', type: 'client', label: 'Partner app', x: 0, y: 0 },
    { id: 'scraper', type: 'client', label: 'Scraper', x: 0, y: 1 },
    { id: 'api', type: 'service', label: 'API server', sublabel: 'buckets in memory', x: 1, y: 0.5 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 0.5 },
  ],
  edges: [
    { id: 'partner-api', from: 'partner', to: 'api', kind: 'sync' },
    { id: 'scraper-api', from: 'scraper', to: 'api', kind: 'sync' },
    { id: 'api-db', from: 'api', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each client has a token bucket in the **API server**’s memory: up to 10 tokens, refilled at 5 a second (example numbers). The partner’s request spends one token and goes on to the database.',
      flow: ['partner-api', 'api-db', '<api-db', '<partner-api'],
      notes: [{ target: 'api', text: '10 → 9 tokens' }],
    },
    {
      caption:
        'The **scraper** fires 50 requests at once. The first 10 empty its bucket; the other 40 are rejected immediately with `429 Too Many Requests`, and the database never sees them.',
      flow: ['scraper-api', { edge: 'scraper-api', reverse: true, tag: '429', tone: 'alert' }],
      notes: [{ target: 'api', text: 'bucket empty', tone: 'alert' }],
    },
    {
      caption:
        'Each rejection carries a `Retry-After` header. A scraper that slows to 5 requests a second gets every one through, so the database sees at most the steady rate plus one burst.',
      flow: ['scraper-api', 'api-db', '<api-db', '<scraper-api'],
      notes: [{ target: 'api', text: '+5 tokens a second' }],
    },
  ],
};

/** v2: several gateways share one counter store, and each check is one atomic script. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'clients', type: 'client', label: 'Clients', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'gw1', type: 'gateway', label: 'Gateway 1', x: 2, y: 0 },
    { id: 'counters', type: 'cache', label: 'Counters', sublabel: 'Redis', x: 2, y: 1 },
    { id: 'gw2', type: 'gateway', label: 'Gateway 2', x: 2, y: 2 },
    { id: 'svc', type: 'service', label: 'API services', x: 3, y: 1 },
  ],
  edges: [
    { id: 'clients-lb', from: 'clients', to: 'lb', kind: 'sync' },
    { id: 'lb-gw1', from: 'lb', to: 'gw1', kind: 'sync' },
    { id: 'lb-gw2', from: 'lb', to: 'gw2', kind: 'sync' },
    { id: 'gw1-counters', from: 'gw1', to: 'counters', kind: 'sync' },
    { id: 'gw2-counters', from: 'gw2', to: 'counters', kind: 'sync' },
    { id: 'gw1-svc', from: 'gw1', to: 'svc', kind: 'sync', toSide: 'top' },
    { id: 'gw2-svc', from: 'gw2', to: 'svc', kind: 'sync', toSide: 'bottom' },
  ],
  steps: [
    {
      caption:
        'First try: each **gateway** keeps buckets in its own memory, with a limit of 100 requests a minute per key. The **load balancer** spreads a partner’s requests over both gateways, each lets 100 through, and the services get 200: twice the limit.',
      flow: ['clients-lb', ['lb-gw1', 'lb-gw2'], ['gw1-svc', 'gw2-svc']],
      notes: [
        { target: 'gw1', text: '100 allowed' },
        { target: 'gw2', text: '100 allowed' },
      ],
    },
    {
      caption:
        'The fix is one shared counter store for every gateway. Before forwarding, a gateway runs one short script there that refills the client’s bucket, takes a token and saves the result, as a single [[atomic operation|atomic-operation]].',
      add: ['counters', 'gw1-counters', 'gw2-counters'],
      flow: ['clients-lb', 'lb-gw1', 'gw1-counters', { edge: 'gw1-counters', reverse: true, tag: 'allowed' }, 'gw1-svc'],
      notes: [{ target: 'counters', text: '7 → 6 tokens' }],
    },
    {
      caption:
        'Two requests for the last token reach both gateways at the same moment. Redis runs one script at a time, so the first takes the token and the second finds the bucket empty: no [[race condition|race-condition]], however many gateways there are.',
      flow: [
        ['lb-gw1', 'lb-gw2'],
        ['gw1-counters', 'gw2-counters'],
        ['<gw1-counters', { edge: 'gw2-counters', reverse: true, tag: 'empty', tone: 'alert' }],
      ],
      notes: [{ target: 'counters', text: '1 → 0 tokens' }],
    },
    {
      caption:
        'The gateway answers `429 Too Many Requests` with a `Retry-After` header. Rejected requests stop at the gateway and never reach the **API services**.',
      flow: ['clients-lb', 'lb-gw2', 'gw2-counters', '<gw2-counters', '<lb-gw2', { edge: 'clients-lb', reverse: true, tag: '429', tone: 'alert' }],
    },
  ],
};

/** v3: rules cached in memory, counters sharded with replicas, and what each failure does. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'clients', type: 'client', label: 'Clients', x: 0, y: 1 },
    { id: 'rules', type: 'sqlDb', label: 'Rule store', x: 1, y: 0 },
    { id: 'gw', type: 'gateway', label: 'Gateways', sublabel: 'many copies', x: 1, y: 1 },
    { id: 'svc', type: 'service', label: 'API services', x: 1, y: 2 },
    { id: 'shardA', type: 'cache', label: 'Shard A', sublabel: 'primary', x: 2, y: 0 },
    { id: 'replicaA', type: 'cache', label: 'Replica A', x: 3, y: 0 },
    { id: 'shardB', type: 'cache', label: 'Shard B', sublabel: 'primary', x: 2, y: 2 },
    { id: 'replicaB', type: 'cache', label: 'Replica B', x: 3, y: 2 },
  ],
  edges: [
    { id: 'rules-gw', from: 'rules', to: 'gw', kind: 'async', label: 'rules' },
    { id: 'clients-gw', from: 'clients', to: 'gw', kind: 'sync' },
    { id: 'gw-svc', from: 'gw', to: 'svc', kind: 'sync' },
    { id: 'gw-a', from: 'gw', to: 'shardA', kind: 'sync' },
    { id: 'gw-b', from: 'gw', to: 'shardB', kind: 'sync' },
    { id: 'a-ra', from: 'shardA', to: 'replicaA', kind: 'replication' },
    { id: 'b-rb', from: 'shardB', to: 'replicaB', kind: 'replication' },
    { id: 'gw-ra', from: 'gw', to: 'replicaA', kind: 'sync', fromSide: 'right', toSide: 'bottom' },
  ],
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      rules: { x: 0, y: 0 },
      clients: { x: 1, y: 0 },
      shardA: { x: 0, y: 1 },
      gw: { x: 1, y: 1 },
      shardB: { x: 2, y: 1 },
      replicaA: { x: 0, y: 2 },
      replicaB: { x: 2, y: 2 },
      svc: { x: 1, y: 3 },
    },
    sides: { 'rules-gw': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Each gateway loads the rules from the **rule store** and keeps them all in memory, refreshing every few seconds, so a check never waits on the store. If the rule store goes down, gateways keep using the last rules they loaded.',
      flow: ['rules-gw'],
      notes: [{ target: 'gw', text: 'rules in memory' }],
    },
    {
      caption:
        'Counters are spread over shards by hashing each key, so a key always lands on the same shard and adding a shard moves only a slice of the keys ([[consistent hashing|consistent-hashing]]). This request checks two rules, its client’s bucket on shard A and its endpoint’s bucket on shard B, and the gateway asks both at once. Each shard copies its updates to a [[replica|replica]] in the background ([[asynchronous replication|asynchronous-replication]]).',
      focus: ['replicaA', 'replicaB', 'a-ra', 'b-rb'],
      flow: ['clients-gw', ['gw-a', 'gw-b'], ['<gw-a', '<gw-b'], 'gw-svc'],
    },
    {
      caption:
        'Shard A’s primary crashes. The gateway gives each check a [[timeout|timeout]] of a few milliseconds (ballpark), so this one fails fast instead of hanging. For ordinary rules it [[fails open|fail-open]]: it counts the client in a local bucket holding its share of the limit, and the request goes on.',
      fail: ['shardA'],
      flow: ['clients-gw', { edge: 'gw-a', tag: 'timeout', tone: 'alert' }, 'gw-svc'],
      notes: [{ target: 'gw', text: 'local limit' }],
    },
    {
      caption:
        'After a few timeouts, a [[circuit breaker|circuit-breaker]] in each gateway stops calling shard A for a few seconds, so requests stop paying the timeout. Login attempts are different: that rule fails closed, and the gateway answers `503 Service Unavailable` rather than allow unlimited password guesses, as in [[credential stuffing|credential-stuffing]].',
      fail: ['shardA'],
      flow: ['clients-gw', { edge: 'clients-gw', reverse: true, tag: '503', tone: 'alert' }],
      notes: [{ target: 'gw', text: 'breaker open', tone: 'alert' }],
    },
    {
      caption:
        'Within seconds, replica A is promoted to primary and checks go to it. It copied updates in the background, so the last few counts may be lost: a handful of clients get a little extra, which is harmless.',
      fail: ['shardA'],
      add: ['gw-ra'],
      flow: ['clients-gw', 'gw-ra', '<gw-ra', 'gw-svc'],
      notes: [{ target: 'replicaA', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        'One client floods at 50,000 requests a second (ballpark), and all its checks land on shard B, a [[hot key|hot-key]]. Once its bucket is empty, each gateway remembers that the client is over the limit until its next token is due and rejects it locally, so shard B sees a few checks a second instead of 50,000.',
      focus: ['shardB'],
      flow: ['clients-gw', { edge: 'clients-gw', reverse: true, tag: '429', tone: 'alert' }],
      notes: [{ target: 'gw', text: 'denied locally' }],
    },
  ],
};

const problem: Problem = {
  id: 'rate-limiter',
  title: 'Rate limiter',
  tier: 1,
  flagship: true,
  minutes: 45,
  prompt:
    'Design a [[rate limiter|rate-limiting]] for a public application programming interface (API). It should stop any single client from using more than its share, even though the API runs on many servers.',
  concepts: ['rate-limiting', 'reverse-proxies-gateways', 'consistent-hashing', 'circuit-breakers', 'timeouts-retries-backoff', 'back-of-the-envelope', 'cap-pacelc'],
  hints: [
    'Before choosing an algorithm, pin down who is limited and how strict the limit must be. A partner’s key, a signed-in user and an anonymous address lead to different designs.',
    'Picture the API on 20 servers behind a [[load balancer|load-balancer]]. If each server counts on its own, what limit does a client really get, and where could all 20 share one count without two requests both taking the last slot?',
    'One shape that works: the [[API gateway|api-gateway]] checks a [[token bucket|token-bucket]] per client in [[Redis|redis]] with one atomic script per request, using rules cached in memory, and the counters are sharded by client key. When Redis is slow or down, the gateway gives up within milliseconds and falls back to a local limit, except for security rules, which fail closed.',
  ],
  clarifyingQuestions: [
    {
      q: 'Who are we limiting: partners by [[API key|api-key]], signed-in users, or anonymous callers by [[Internet Protocol (IP) address|ip-address]]?',
      why: 'This picks the counter’s key and where the check can run. Keys and users are known only after authentication, at the gateway; anonymous floods are stopped earlier, by address, with generous limits, because a whole office or mobile network can share one address.',
    },
    {
      q: 'Is this one limiter in front of every service, or a library each service embeds?',
      why: 'A check at the gateway covers every service at once and keeps rejected traffic away from them. A library suits limits only a service understands, such as uploads per hour, but every team has to adopt it.',
    },
    {
      q: 'How strict is the limit? With a limit of 100 a minute, is 105 acceptable?',
      why: 'If a small overshoot is fine, servers can count locally and sync now and then, which is fast and survives outages. If the limit protects money or a fragile partner, every check needs one shared, exact counter, which costs a network round trip per request.',
    },
    {
      q: 'What happens to a request over the limit: reject it, queue it, or slow it down?',
      why: 'Rejecting with `429` and a hint of when to retry suits most APIs and needs only a counter. Queueing requests to a steady pace, a [[leaky bucket|leaky-bucket]], suits calls into a fragile system, but adds waiting and a queue to size.',
    },
    {
      q: 'How much traffic, and how many distinct clients?',
      why: 'Requests per second set how many counter operations the store must handle; the number of clients sets the memory. About 300,000 requests a second at peak from 10 million clients (ballpark) means a sharded counter store, but only a few gigabytes of memory.',
    },
    {
      q: 'One region or several?',
      why: 'Within one region, a shared counter costs well under a millisecond. Across regions, one global counter would add a trip across an ocean to every request, so each region counts on its own and a global limit becomes approximate.',
    },
    {
      q: 'If the limiter itself breaks, should requests be allowed or blocked?',
      why: 'Allowing keeps the API up but unprotected; blocking protects the services but turns a limiter outage into a full outage. The answer is usually per rule: allow for general limits, block for login attempts.',
    },
  ],
  requirements: {
    functional: [
      'Limit each client per rule, such as 100 requests a minute per API key, with different limits per plan and per endpoint.',
      'Allow short [[bursts|burst]] above the steady rate, up to a configured size.',
      'Reject requests over the limit with `429 Too Many Requests`, a `Retry-After` header, and headers showing the limit and what remains.',
      'Check several rules on one request, such as per key and per endpoint, and reject if any is exceeded.',
      'Change rules without a deploy; changes reach every server within a minute (ballpark).',
    ],
    nonFunctional: [
      'Fast: the check adds under about 1 ms for 99% of requests (ballpark), since it runs on every request.',
      'Accurate enough: a client gets at most a few percent over its limit, however many servers its requests reach.',
      'Available: the limiter must never be the reason the API is down. If it fails, ordinary traffic keeps flowing under a rough local limit.',
      'Scale: about 300,000 requests a second at peak from 10 million clients (ballpark).',
    ],
    outOfScope: [
      'Monthly [[quotas|quota]] and usage billing, which need durable, exact counts; the limiter’s decision log could feed them.',
      'Large [[distributed denial-of-service attacks|denial-of-service]] at the network level, which the edge network absorbs before traffic reaches the gateway.',
      'Authentication itself: assume the gateway already knows each caller’s key or user.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Distinct clients a day, API keys and signed-in users', value: '10 million (ballpark)' },
      { label: 'Requests per client per day', value: '1,000 on average, very uneven' },
      { label: 'Busiest hour compared with the daily average', value: '3×' },
      { label: 'Rules checked per request', value: '2: the client’s limit and the endpoint’s' },
      { label: 'Memory per token bucket', value: 'about 100 bytes, with its key and the store’s overhead' },
      { label: 'Simple operations one Redis node handles', value: 'about 100,000 a second (ballpark)' },
      {
        label: 'In the calculator',
        value: 'a check counts as a read and a new bucket as a write, about 1,000 checks per bucket; ignore its yearly storage, since buckets expire within minutes',
      },
    ],
    steps: [
      { label: 'Requests per second', math: '10⁷ clients × 1,000 ≈ 10¹⁰ a day; 10¹⁰ ÷ 10⁵ seconds a day', result: '≈ 100,000 a second, 300,000 at peak' },
      { label: 'Counter operations at peak', math: '300,000 requests × 2 rules', result: '≈ 600,000 a second' },
      { label: 'Counter store nodes', math: '600,000 ÷ 100,000 per node, plus room for hot keys and failover', result: '≈ 6 busy nodes, so plan about 10 shards, each with a replica' },
      { label: 'Memory for token buckets', math: '10⁷ clients × 2 rules × 100 bytes', result: '≈ 2 GB: small' },
      { label: 'Memory for an exact sliding log with an hourly limit', math: '300,000 requests a second × 3,600 seconds × 50 bytes per entry', result: '≈ 50 GB, about 25 times the buckets' },
      { label: 'Time budget per check', math: 'a round trip inside one data center ≈ 0.5 ms; across an ocean ≈ 150 ms (ballpark)', result: 'counters live in the same region as the gateway' },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 1_000, readsPerWrite: 1_000, objectBytes: 100, peakFactor: 3, retentionYears: 1 },
  },
  api: [
    {
      signature: 'checkLimit(clientKey, ruleId, cost = 1)  →  { allowed, remaining, retryAfterMs }',
      description:
        'The internal call the gateway makes before forwarding a request: one script on the counter store, run as a single step. `cost` lets an expensive endpoint spend several tokens at once.',
    },
    {
      signature: '429 Too Many Requests   Retry-After: 12   X-RateLimit-Limit: 100   X-RateLimit-Remaining: 0',
      description:
        'What a rejected client sees. `Retry-After` says how many seconds to wait; the limit and remaining headers are a common convention that lets well-behaved clients slow down before they hit the limit.',
    },
    {
      signature: 'PUT /v1/rules/{ruleId}  { match: { plan, route }, algorithm, rate, burst, onFailure: "open" | "closed", mode: "enforce" | "shadow" }',
      description:
        'Creates or changes a rule. Gateways pick up changes within seconds, and a new rule can start in shadow mode, logging what it would reject without rejecting anything.',
    },
  ],
  dataModel: [
    {
      entity: 'Rule',
      fields: ['rule_id', 'match: plan, route, key type', 'algorithm', 'rate and burst', 'on_failure: open or closed', 'mode: enforce or shadow'],
      store: 'Relational database or a configuration store such as etcd, cached in every gateway',
      why: 'A few thousand rows that rarely change but are read on every request, so each gateway keeps them all in memory and refreshes every few seconds. The store only needs to be durable and versioned, so a bad rule can be rolled back.',
    },
    {
      entity: 'Token bucket',
      fields: ['key: rl:{rule}:{client}', 'tokens', 'updated_at_ms', 'expiry: when it would be full again'],
      store: 'Redis, in memory, sharded by key, one replica per shard',
      why: 'It is read and updated on every request, so it must live in memory and change in one step. Losing it only resets some buckets to full, so it needs no disk, and an idle bucket deletes itself once it would have refilled anyway.',
    },
    {
      entity: 'Window counter',
      fields: ['key: rl:{rule}:{client}:{window start}', 'count', 'expiry: end of the next window'],
      store: 'Redis, on the same shards',
      why: 'Fixed and sliding window counters cost one `INCR` per request on a key that expires on its own; the sliding version also reads the previous window’s key.',
    },
    {
      entity: 'Decision log',
      fields: ['time', 'client_key', 'rule_id', 'decision', 'mode'],
      store: 'Event stream: every rejection, plus a sample of allowed requests',
      why: 'Support and owning teams need to see who was limited, by which rule, and what a shadow rule would have rejected, without logging every allowed request.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Stop one client from taking more than its share of a single server, so a buggy app or a [[scraper|scraper]] can’t slow the service for everyone.',
      diagram: v1,
      explanation:
        'A token bucket per client costs two numbers in memory and no network calls. It only works while there is one server: with two, each counts on its own and every client gets double its limit. A restart also forgets every bucket.',
    },
    {
      title: 'v2: It scales',
      solves: 'With many gateway servers, counting in each server’s memory multiplies every limit by the number of servers.',
      diagram: v2,
      explanation:
        'Checks now run at the gateway, so services never see rejected traffic, and counters live in one place, so every gateway sees the same count. Each check is one round trip of well under a millisecond inside a data center (ballpark). Because the script runs as one step, two gateways can never both spend the last token.',
    },
    {
      title: 'v3: It survives failures',
      solves:
        'At about 600,000 counter operations a second at peak (ballpark), one Redis node isn’t enough, and a failing counter node must not take the whole API down with it.',
      diagram: v3,
      explanation:
        'Counters are soft state: losing some only resets a few buckets to full for a moment. So this design favors staying available over being exact, with fast timeouts, local fallbacks and replicas that copy in the background. Only rules that stop attacks trade availability for safety and fail closed.',
    },
  ],
  deepDives: [
    {
      title: 'Choosing the algorithm',
      problem:
        'The four classic algorithms differ in how they treat bursts, how exact they are at window edges, and what each check costs in memory. A limit on a public API usually wants short bursts allowed and a steady long-run rate.',
      options: {
        caption: 'The algorithms, as you would build them on Redis',
        rows: [
          {
            option: 'Token bucket',
            goodAt: 'Allows bursts up to the bucket size while holding the long-run rate, with two numbers per client updated in one script.',
            badAt: 'A full bucket lets a whole burst through at once, and customers have two numbers, size and rate, to understand.',
            pickWhen: 'Per-key and per-user API limits: the usual default.',
          },
          {
            option: 'Leaky bucket',
            goodAt: 'Requests leave at a perfectly steady pace, so the system behind it never sees a spike.',
            badAt: 'Requests wait in a queue, which adds latency and memory, and one burst delays everyone behind it.',
            pickWhen: 'Feeding a fragile system at a fixed rate, such as a partner’s API or a text message (SMS) provider.',
          },
          {
            option: '[[Fixed window counter|fixed-window]]',
            goodAt: 'Cheapest: one `INCR` on a key that expires with the window.',
            badAt: 'A client can send a full limit at the end of one window and another at the start of the next: twice the limit within seconds.',
            pickWhen: 'Long windows such as daily caps, where a spike at the boundary doesn’t matter.',
          },
          {
            option: '[[Sliding window|sliding-window]] log',
            goodAt: 'Exact: keeps a timestamp per request and counts those inside the last window.',
            badAt: 'Memory grows with traffic: about 50 GB for an hourly limit at this scale (ballpark).',
            pickWhen: 'Low-volume limits that must be exact, such as password resets per hour.',
          },
          {
            option: 'Sliding window counter',
            goodAt: 'Nearly exact with two counters: this window’s count plus the last window’s, weighted by how much of it still overlaps.',
            badAt: 'An estimate that assumes the last window’s requests were spread evenly.',
            pickWhen: 'You promise “100 a minute” and want no spike at the boundary.',
          },
        ],
      },
      recommendation:
        'Use a token bucket for per-client API limits, a fixed window for daily caps, and a sliding log only for rare, security-sensitive limits. Build each as one script that Redis runs as a single step, and take the time from the Redis server rather than from each gateway, so [[clock skew|clock-skew]] between gateways can’t shift a window or overfill a bucket.',
    },
    {
      title: 'Where to enforce limits',
      problem:
        'A check can run in the client, at the edge, in the gateway or inside each service. The further out it runs, the cheaper a rejection is, but the less it knows about who is calling and what the request costs.',
      options: {
        caption: 'Each layer limits what it can see',
        rows: [
          {
            option: 'In the client',
            goodAt: 'Well-behaved clients slow themselves down and are never rejected.',
            badAt: 'Buggy or hostile clients ignore it, so it can never be the only limit.',
            pickWhen: 'Your own apps and official libraries, as a courtesy on top of server limits.',
          },
          {
            option: 'Edge network or content delivery network',
            goodAt: 'Stops floods by address before they cost you anything.',
            badAt: 'Knows addresses, not keys or users, and many people can share one address.',
            pickWhen: 'Anonymous floods and attacks, with generous per-address limits.',
          },
          {
            option: 'API gateway',
            goodAt: 'Knows the key, the user and the route after authentication; one place covers every service, and rejected requests never reach them.',
            badAt: 'Every request pays for the check, and many gateway copies need shared counters.',
            pickWhen: 'Per-key, per-user and per-endpoint limits: the main layer.',
          },
          {
            option: 'Inside each service, as a library or [[sidecar|sidecar]]',
            goodAt: 'Knows what a request really costs, such as an upload or a heavy search.',
            badAt: 'Rejected requests have already crossed the network and the gateway, and every team must adopt it.',
            pickWhen: 'Limits only the service understands, and protecting it from internal callers.',
          },
          {
            option: 'A separate rate-limit service',
            goodAt: 'One team owns the rules and counters, and every gateway and service asks it; Envoy’s global rate limiting works this way.',
            badAt: 'One more network hop, and one more service that can fail.',
            pickWhen: 'Many gateways and services share rules and you want one owner.',
          },
        ],
      },
      recommendation:
        'Layer it: generous per-address limits at the edge for floods, token buckets per key and per user at the gateway, and cost-based limits inside services for expensive work. Most of the design lives at the gateway, which is the layer the stages build; a separate limiter service is the same design behind one more hop.',
    },
    {
      title: 'Shared counters that stay fast and correct',
      problem:
        'With 20 gateway servers, a check must see every server’s requests, finish well under a millisecond, and never let two requests both take the last token. At about 600,000 counter operations a second at peak (ballpark), one Redis node isn’t enough either.',
      options: {
        caption: 'Five ways to share a count',
        rows: [
          {
            option: 'Read the count, then write it back',
            goodAt: 'Simple to write.',
            badAt: 'Two gateways read 99 at the same moment and both write 100, so both requests pass: the race that lets clients past the limit.',
            pickWhen: 'Never, for limits that matter.',
          },
          {
            option: 'One atomic script in Redis',
            goodAt: 'Exact: refill, check and spend in one step and one round trip, well under a millisecond (ballpark).',
            badAt: 'A network call on every check, and each client’s key lives on one shard.',
            pickWhen: 'The default.',
          },
          {
            option: 'Local counts, synced every second',
            goodAt: 'No network call on the request path, and it survives a counter store outage.',
            badAt: 'Each gateway sees the others’ counts up to a second late, so a client can overshoot by up to a second of traffic on every gateway.',
            pickWhen: 'A small overshoot is fine and latency matters most.',
          },
          {
            option: 'Local token batches',
            goodAt: 'A gateway takes, say, 10 tokens at once and spends them locally, cutting calls for busy clients about tenfold.',
            badAt: 'Tokens held by one gateway can’t be used by another, so a client may be rejected while tokens sit idle elsewhere.',
            pickWhen: 'A few very busy clients make up most of the traffic.',
          },
          {
            option: 'Send each client to one gateway',
            goodAt: 'Hashing the key at the load balancer lets one gateway count each client alone, with no shared store.',
            badAt: 'Busy clients overload their gateway, and counts reset whenever gateways are added or removed.',
            pickWhen: 'Rarely: small fleets that seldom change.',
          },
        ],
      },
      recommendation:
        'Run one atomic script in Redis per check, and shard the counters by client key across about 10 primaries; Redis Cluster does this with fixed hash slots, and a hash ring works too. Add local token batches or a short “denied until” cache for the hottest clients. Keep counters inside each region, and treat any global limit as approximate.',
    },
    {
      title: 'When the limiter itself fails',
      problem:
        'The limiter sits on every request, so its outage could become the API’s outage. You have to decide, per rule, whether a request that can’t be checked is allowed or rejected, and keep a slow counter store from adding latency to everything.',
      options: {
        caption: 'What to do with a request you can’t check',
        rows: [
          {
            option: 'Fail open: allow everything',
            goodAt: 'The API stays up whatever happens to the limiter.',
            badAt: 'No protection during the outage, which an attacker could wait for, or cause.',
            pickWhen: 'Limits that exist only for fairness, and only with alerts.',
          },
          {
            option: 'Fail open with a local limit',
            goodAt: 'The API stays up and clients are still limited roughly: each gateway allows its share, the limit divided by the number of gateways.',
            badAt: 'If traffic is uneven across gateways, the local share is too strict on some and too loose on others.',
            pickWhen: 'The default for ordinary per-key and per-user limits.',
          },
          {
            option: 'Fail closed: reject everything',
            goodAt: 'Nothing unchecked reaches the services.',
            badAt: 'A limiter outage becomes a full outage for every client.',
            pickWhen: 'Almost never, for a whole API.',
          },
          {
            option: 'Fail closed for chosen rules',
            goodAt: 'Security rules stay strict while the rest of the API stays up.',
            badAt: 'Logins or password resets are briefly unavailable during the outage.',
            pickWhen: 'Rules that stop attacks or costly abuse: login attempts, password resets, one-time codes and text messages.',
          },
        ],
      },
      recommendation:
        'Give each rule an `onFailure` setting: open with a local limit by default, closed for security rules. Wrap each call to Redis in a timeout of a few milliseconds and a circuit breaker, so a dead shard costs one fast failure rather than a slow wait on every request. Alert whenever gateways fall back, since a limiter quietly failing open looks perfectly healthy from outside.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 3 million requests a second at peak (ballpark).',
      impact: 'About 6 million counter operations a second: the shards saturate and checks slow down, adding latency to every request.',
      mitigation:
        'Add shards, which moves only a slice of the keys, batch tokens locally for busy clients, and keep the short timeout, so a slow shard turns into a local decision instead of a slow request.',
    },
    {
      scenario: '100× load, such as a distributed flood from many addresses.',
      impact: 'Even checking each request costs too much: the gateways and the counter store become the bottleneck, and the limiter itself is now the target.',
      mitigation:
        'Stop it before the gateway: the edge network absorbs floods and blocks bad addresses, and the gateway sheds load ([[load shedding|load-shedding]]) before doing any per-client work. Rejecting a request must cost far less than serving it.',
    },
    {
      scenario: 'A counter shard’s primary dies.',
      impact: 'Checks for keys on that shard time out, and for a few seconds those clients are limited only by local buckets.',
      mitigation: 'Fast timeouts and a circuit breaker, then the replica is promoted within seconds. A few recent counts are lost, so some clients get a little extra, which is fine for counters.',
    },
    {
      scenario: 'The whole counter store is unreachable.',
      impact: 'Every gateway falls back to local limits, so limits become approximate, and rules set to fail closed reject their traffic.',
      mitigation: 'Size local limits as the limit divided by the number of gateways, page the on-call engineer, and alert on the fallback rate.',
    },
    {
      scenario: 'A gateway server dies.',
      impact: 'The load balancer’s [[health checks|health-check]] remove it; its in-flight requests fail, and clients retry them.',
      mitigation: 'Nothing is lost, because counters live in Redis, not in the gateway; spare gateways absorb its share.',
    },
    {
      scenario: 'The rule store goes down, or someone ships a bad rule.',
      impact: 'Gateways can’t load rule changes, and a bad rule could reject a big customer’s traffic.',
      mitigation:
        'Gateways keep the last good rules in memory and never start without a built-in default set. New rules start in shadow mode, roll out gradually, and can be rolled back in one step.',
    },
    {
      scenario: 'One client becomes a hot key.',
      impact: 'All its checks hit one shard, which slows every other client whose keys live there.',
      mitigation: 'Once its bucket is empty, each gateway caches “denied until the next token is due”, so the shard sees a few checks a second for that client.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Explains at least two algorithms correctly, including how each treats a burst.',
        'Rejects with `429` and a `Retry-After` header, and puts the limiter in front of the services.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Spots that counting in each server’s memory multiplies the limit, and moves counters to a shared store with atomic updates.',
        'Chooses the key, whether API key, user or address, and explains why per-address limits must be generous.',
        'Decides what happens when the counter store is down instead of leaving it to chance.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Layers limits across the edge, the gateway and the services, and says what each layer can see.',
        'Budgets latency: timeouts in milliseconds, a circuit breaker, local fallbacks, and a plan for sharding and hot keys.',
        'Covers operations: shadow mode for new rules, counting per region with bounded overshoot, and alerts that catch a limiter failing open.',
      ],
    },
  ],
  followUps: [
    {
      q: 'Redis just went down. What happens to the API?',
      a: 'Each gateway’s call times out within a few milliseconds, and a circuit breaker stops further calls for a few seconds. Ordinary rules fall back to a local bucket holding the limit divided by the number of gateways, so the API stays up with rough limits, while security rules such as login attempts fail closed. When Redis returns, buckets start full again, a brief over-allowance I accept.',
    },
    {
      q: 'One client is sending 50,000 requests a second. What does that do to your counters?',
      a: 'All its checks land on one shard, which could slow every other client on it. Once its bucket is empty, each gateway caches “denied until the next token” locally, so the shard sees a few checks a second; for a legitimate heavy client, local token batches cut the calls the same way. If it’s an attack, the edge should block it before it reaches the gateway.',
    },
    {
      q: 'We run in three regions. Is a user’s limit per region or global?',
      a: 'Per region by default, because a global counter would add a trip across an ocean, roughly 100 to 200 ms (ballpark), to every request. If the limit must be global, I give each region a share, or sync counts in the background and accept a small overshoot, choosing [[eventual consistency|eventual-consistency]] over a slow exact count. Most clients stay in one region, so the error is small.',
    },
    {
      q: 'A customer says they were rate limited while under their limit. How do you debug it?',
      a: 'I look up their rejections in the decision log by key and rule. The usual causes are a second rule they didn’t know about, such as a per-endpoint limit; a shared address, since [[network address translation|nat]] lets a whole office appear as one caller; retries that counted as requests; or gateways in fallback mode with too small a local share. The response headers should have said which limit they hit, so I check those too.',
    },
    {
      q: 'How would you roll out a stricter limit without breaking big customers?',
      a: 'Ship it in shadow mode first: the gateway logs what it would reject but lets everything through. That shows exactly who would be hit, so we can warn them or grant overrides, then enforce it gradually, a few percent of gateways at a time, with a quick rollback.',
    },
    {
      q: 'Why not just let each service reject requests when it is overloaded?',
      a: 'You want both, because they answer different questions. Rate limiting is about fairness: one client can’t take everyone’s share, even when the system is healthy. Load shedding protects capacity: when a service is overloaded, it drops the least important work, whoever sent it.',
    },
    {
      q: 'How would you limit an expensive endpoint differently from a cheap one?',
      a: 'Give each request a cost: a search might spend 10 tokens and a profile read 1, from the same bucket, or the expensive endpoint gets its own rule. When the cost is only known afterwards, such as rows scanned, the service can charge the bucket once the request finishes.',
    },
  ],
  rubric: [
    { item: 'Clarified who is limited (key, user or address), the scale, and how strict the limit must be', weight: 10, lessonId: 'requirements' },
    { item: 'Explained the four algorithms and picked one, including how it treats bursts', weight: 20, lessonId: 'rate-limiting' },
    { item: 'Placed enforcement on purpose across the edge, the gateway and the services', weight: 15, lessonId: 'reverse-proxies-gateways' },
    { item: 'Shared counters across servers with atomic updates, with no read-then-write race', weight: 20, lessonId: 'rate-limiting' },
    { item: 'Sharded the counter store by key and handled hot keys', weight: 10, lessonId: 'consistent-hashing' },
    { item: 'Decided what happens when the limiter fails: fast timeouts, fail open with a local limit, fail closed for security rules', weight: 15, lessonId: 'circuit-breakers' },
    { item: 'Rejected well: 429, Retry-After and remaining-limit headers, so clients back off', weight: 10, lessonId: 'timeouts-retries-backoff' },
  ],
};

export default problem;
