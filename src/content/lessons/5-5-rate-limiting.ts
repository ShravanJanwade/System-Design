import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Where limits live: each layer counts what it can see. */
const layers: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'app', type: 'client', label: 'Snapgram app', sublabel: 'backs off', x: 0, y: 0 },
    { id: 'edge', type: 'cdn', label: 'Edge network', sublabel: 'per address', x: 1, y: 0 },
    { id: 'gateway', type: 'gateway', label: 'API gateway', sublabel: 'per key and user', x: 2, y: 0 },
    { id: 'photos', type: 'service', label: 'Photo service', sublabel: 'per operation', x: 3, y: 0 },
  ],
  edges: [
    { id: 'app-edge', from: 'app', to: 'edge', kind: 'sync' },
    { id: 'edge-gateway', from: 'edge', to: 'gateway', kind: 'sync' },
    { id: 'gateway-photos', from: 'gateway', to: 'photos', kind: 'sync' },
  ],
};

/** Two gateway copies read the same counter before either writes: a race condition. */
const race: SequenceSpec = {
  actors: [
    { id: 'g1', type: 'gateway', label: 'Gateway 1' },
    { id: 'redis', type: 'cache', label: 'Redis' },
    { id: 'g2', type: 'gateway', label: 'Gateway 2' },
  ],
  messages: [
    { from: 'g1', to: 'redis', label: 'GET count', kind: 'sync', caption: 'A request from the partner reaches Gateway 1, which reads the partner’s count for this minute.' },
    { from: 'redis', to: 'g1', label: '99', kind: 'reply', caption: 'The count is 99, one under the limit of 100, so Gateway 1 will allow the request.' },
    {
      from: 'g2',
      to: 'redis',
      label: 'GET count',
      kind: 'sync',
      caption: 'At the same moment, another request from the same partner reaches Gateway 2, which reads the same count.',
    },
    { from: 'redis', to: 'g2', label: '99', kind: 'reply', caption: 'Gateway 2 also sees 99, because Gateway 1 has not written its update yet.' },
    { from: 'g1', to: 'redis', label: 'SET 100', kind: 'sync', caption: 'Gateway 1 writes 100 and lets its request through.' },
    {
      from: 'g2',
      to: 'redis',
      label: 'SET 100',
      kind: 'sync',
      caption: 'Gateway 2 also writes 100 and lets its request through. That makes 101 requests while the count says 100: a [[race condition|race-condition]].',
    },
  ],
  groups: [
    { label: 'both read', from: 1, to: 4 },
    { label: 'both write', from: 5, to: 6 },
  ],
};

const lesson: Lesson = {
  id: 'rate-limiting',
  module: 'm5',
  order: 5,
  title: 'Rate limiting',
  idea: 'A rate limiter caps how many requests each client may make in a period, usually with a token bucket checked at the gateway against counters shared in Redis, so one runaway client cannot crowd out everyone else.',
  minutes: 15,
  prerequisites: ['reverse-proxies-gateways', 'timeouts-retries-backoff'],
  outcomes: [
    'Compare the token bucket, leaky bucket, fixed window and sliding window, and predict how each treats a burst.',
    'Decide where to enforce a limit and what to count it by: a partner’s key, a user or an address.',
    'Keep shared counters correct when many gateway copies update them at once.',
  ],
  analogy: {
    title: 'Tickets at a fixed pace',
    body: 'Picture a popular exhibit with a ticket machine at the door. It prints one ticket a minute and holds at most ten; you need a ticket to go in, and if the tray is empty you are told to come back later.\n\nOn a quiet morning the tray fills up, so a school group of ten walks straight in. After that, visitors get in at the machine’s pace, however many are waiting. A short rush still gets in, yet the room never gets more crowded than it can handle: that is a token bucket.',
  },
  whyItMatters:
    'Snapgram’s public application programming interface (API) lets partners, such as photo-printing apps, read public photos using an [[API key|api-key]]. One Monday, a partner’s [[scraper|scraper]] starts downloading every public profile in bursts of thousands of requests, and the photo service slows down for everyone.\n\nThe same week, an app release ships with a bug: when a like fails, it retries at once, in a tight loop. A few thousand phones each send dozens of likes a second, and the like database falls behind. Neither client means harm, but each takes far more than its share.',
  body: [
    {
      kind: 'prose',
      md: '[[Rate limiting|rate-limiting]] caps how many requests a client may make in a period, such as 100 a minute per API key. Requests over the limit are rejected at once, usually with the [[status code|status-code]] `429 Too Many Requests` and a `Retry-After` header saying when to try again. Every limiter needs a key that identifies the client and an algorithm that decides whether this request fits.',
    },
    { kind: 'heading', text: 'Four algorithms' },
    {
      kind: 'prose',
      md: '**[[Token bucket|token-bucket]].** Each client has a bucket that holds up to B tokens and gains R tokens a second; each request spends one, and a request that finds the bucket empty is rejected. The bucket size sets the biggest [[burst|burst]] you allow, and the refill rate sets the long-run rate. It needs just two numbers per client, the token count and the time of the last update, which is why it is the most common choice.',
    },
    {
      kind: 'prose',
      md: '**[[Leaky bucket|leaky-bucket]].** Requests join a line that drains at a fixed pace, R a second, like water from a hole in a bucket, and a full line rejects new arrivals. Bursts never reach the service at once, so its load is perfectly smooth, but requests may wait seconds for their turn.',
    },
    {
      kind: 'prose',
      md: '**[[Fixed window|fixed-window]].** Count each client’s requests per calendar minute and reject once the count passes the limit; the count starts from zero when the next minute begins. It is the cheapest of the four, one counter per client. Its flaw is the boundary: a client can send a full limit at 0:59 and another at 1:00, twice the limit in two seconds.',
    },
    {
      kind: 'prose',
      md: '**[[Sliding window|sliding-window]].** Count the requests in the last 60 seconds, measured back from now, so there is no boundary to game. The exact version stores a timestamp per request, which costs memory. A cheap version keeps two counters, this minute and the last, and counts the last minute in proportion to how much of it still falls inside the window.',
    },
    { kind: 'heading', text: 'Where to enforce limits' },
    {
      kind: 'prose',
      md: 'Limits work best in layers. The further out a check runs, the cheaper the rejection, but the less it knows about who is calling:\n\n- **Client.** Snapgram’s own app batches likes and slows down when told to, but buggy or hostile clients will not.\n- **Edge.** A content delivery network (CDN) or load balancer blocks floods by Internet Protocol (IP) address, as in a [[denial-of-service attack|denial-of-service]], before they cost anything.\n- **Gateway.** The [[API gateway|api-gateway]] knows each partner’s key and each user, so per-client limits live here.\n- **Service.** Each service guards its expensive work, such as uploads per hour, and caps how many requests it handles at once.',
    },
    {
      kind: 'diagram',
      title: 'Where limits live',
      caption: 'Each layer limits what it can see: addresses at the edge, keys and users at the gateway, expensive operations in the service.',
      spec: layers,
    },
    {
      kind: 'prose',
      md: 'What you count by matters too. Per key and per user name who is responsible; per [[IP address|ip-address]] is the only option before login, but many people can share one address, such as everyone in an office, so keep those limits generous.',
    },
    { kind: 'heading', text: 'Shared counters in Redis' },
    {
      kind: 'prose',
      md: 'Snapgram runs several copies of its gateway. If each counted in its own memory, a client spread across five copies would get five times its limit. So the counters live in one shared store, [[Redis|redis]], where each check takes well under a millisecond (ballpark).',
    },
    {
      kind: 'sequence',
      title: 'Two gateways, one counter',
      caption: 'A partner has used 99 of its 100 requests this minute, and two more arrive at the same moment.',
      spec: race,
    },
    {
      kind: 'prose',
      md: 'The fix is to check and update in one [[atomic operation|atomic-operation]]. For a fixed window, Redis’s `INCR` adds one and returns the new count in a single step, so the two gateways get 100 and 101 and the second is rejected, while `EXPIRE` deletes the key when the window ends. For a token bucket, a short script that Redis runs as one step refills the bucket, takes a token and saves both numbers.',
    },
    {
      kind: 'prose',
      md: 'Redis is now on the path of every request, so decide in advance what happens when it is unreachable. Most teams [[fail open|fail-open]] for ordinary limits, letting requests through with a rough limit in each gateway’s memory, since rejecting everyone is worse. Limits that stop attacks, such as on login attempts, fail closed.',
    },
    { kind: 'heading', text: 'Rejecting well' },
    {
      kind: 'prose',
      md: 'A good rejection tells the client what to do next. Snapgram’s apps wait as long as `Retry-After` says, or back off with [[exponential backoff|exponential-backoff]] and [[jitter|jitter]], so a wave of rejections never turns into a [[retry storm|retry-storm]].',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson treats a limit as a fixed number of requests per client. Real systems vary limits by plan and endpoint, charge expensive calls more than one token, and often count separately in each region instead of in one global store, accepting a little overshoot to avoid a slow round trip.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'rate-limiter',
      preset: { algorithm: 'token-bucket', bucket: 10, refill: 2, pattern: 'bursts', rate: 1, burst: 20 },
      intro:
        'Run one partner’s traffic through each algorithm for a minute: steady requests, bursts every ten seconds, or bursts timed around a window boundary. Watch what reaches the photo service, and when.',
    },
  ],
  tradeoffs: {
    caption: 'The four algorithms, compared.',
    rows: [
      {
        option: 'Token bucket',
        goodAt: 'Allows short bursts but holds the long-run rate, with two numbers per client.',
        badAt: 'A full bucket lets a whole burst reach the service at once.',
        pickWhen: 'Most per-user and per-key limits, where short bursts are normal.',
      },
      {
        option: 'Leaky bucket',
        goodAt: 'Perfectly smooth load on the service behind it.',
        badAt: 'Requests wait in line, and a burst delays everything behind it.',
        pickWhen: 'The service behind needs a steady pace, such as a partner with a strict limit.',
      },
      {
        option: 'Fixed window',
        goodAt: 'Simplest and cheapest: one counter that expires.',
        badAt: 'Up to twice the limit gets through around a boundary.',
        pickWhen: 'Long windows such as daily quotas, where boundary bursts do not matter.',
      },
      {
        option: 'Sliding window',
        goodAt: 'No boundary bursts, and the two-counter version is nearly as cheap.',
        badAt: 'The exact version stores every timestamp; the cheap one is an estimate.',
        pickWhen: 'You need accurate per-minute limits without spikes at the boundary.',
      },
    ],
  },
  realWorld: {
    title: 'Stripe’s rate limiters',
    body: 'Stripe described its limiters in a 2017 engineering post. It runs four kinds: a request rate limiter that caps each user at a number of requests per second while allowing brief bursts, a limiter on how many requests a user has in progress at once, and two [[load shedders|load-shedding]] that protect the whole fleet. The request rate limiter uses the token bucket algorithm, with one bucket per user, kept in Redis.\n\nThe post calls the request rate limiter the most used of the four, rejecting millions of requests a month. One load shedder reserves part of the fleet for critical requests, 20% in its example, and rejects other requests with a 503 when the rest is busy.',
    sourceUrl: 'https://stripe.com/blog/rate-limiters',
    sourceLabel: 'Paul Tarjan, “Scaling your API with rate limiters,” Stripe engineering blog, 2017',
  },
  interview: {
    whenToMention:
      'Whenever you design a public API, a login page or anything one client could flood. Put the limiter at the gateway in your high-level design, and be ready to go deeper, since “Design a rate limiter” is also a classic question on its own.',
    sayItLikeThis: [
      'The gateway runs a token bucket per API key and per user, say 20 tokens refilled at 5 a second, so short bursts pass but the long-run rate holds.',
      'Counters live in Redis, shared by every gateway copy, and each check is one atomic script, so two gateways can never both spend the last token.',
    ],
    followUps: [
      {
        q: 'What happens if Redis goes down?',
        a: 'The gateway has to choose. For ordinary limits I would fail open, with a rough in-memory limit in each gateway copy, since blocking every user is worse than a few minutes of loose limits. For login attempts, where the limit stops attacks, I would fail closed.',
      },
      {
        q: 'How would you rate limit across two regions?',
        a: 'One global counter would add a cross-region round trip to every request. I would count in each region and give each a share of the limit, or sync counts in the background and accept a small overshoot, since most clients stay in one region.',
      },
      {
        q: 'Per IP address, per user or per API key?',
        a: 'Per key for partners and per user for our apps, since those name who is responsible. Per IP address works before login, but many people can share one address, so I would keep those limits generous and use them mainly against floods.',
      },
    ],
    redFlags: [
      'Counting in each gateway’s memory, so the real limit grows with the number of copies.',
      'Reading the count and writing it back as two steps, which lets simultaneous requests slip past the limit.',
      'Rejecting with a bare error and no hint of when to retry, so clients hammer the service even harder.',
    ],
  },
  mistakes: [
    '**Counters in local memory.** Each gateway copy counts on its own, so with five copies a client gets five times its limit.',
    '**Read, then write.** Checking the count and updating it in two steps lets two requests both take the last slot.',
    '**One limit for every endpoint.** A search or an upload costs far more than reading a profile, so expensive endpoints need their own, lower limits.',
    '**Fixed windows for short limits.** Bursts of up to twice the limit land exactly when every window resets.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt:
        'A token bucket holds 20 tokens and refills at 5 a second. It starts full. A client sends 50 requests at once, waits 2 seconds, then sends 50 more at once. How many of the 100 are allowed?',
      answer: 30,
      unit: 'requests',
      tolerance: 1.1,
      solution: [
        'The first burst finds 20 tokens, so 20 are allowed and 30 rejected.',
        'Over the next 2 seconds the bucket gains 5 × 2 = 10 tokens.',
        'The second burst gets those 10, so 20 + 10 = 30 are allowed in all.',
      ],
    },
    {
      kind: 'single',
      prompt: 'A fixed window allows 100 requests per minute. What is the most a client can get through in two seconds?',
      options: [
        {
          text: '200: 100 at the end of one minute and 100 at the start of the next',
          correct: true,
          why: 'The count starts from zero at the boundary, so two full limits fit around it.',
        },
        { text: '100, because the limit is per minute', correct: false, why: 'That holds within one window, but two windows meet at every boundary.' },
        { text: 'About 3, the per-second average', correct: false, why: 'A window limit does not spread requests out; all 100 can arrive at once.' },
        {
          text: '101, because of a race between gateways',
          correct: false,
          why: 'Races are a separate problem with shared counters. Even a perfect counter allows 200 here.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram runs six gateway copies. Which designs correctly enforce 100 requests a minute per API key?',
      options: [
        {
          text: 'Each gateway adds one to a shared counter per key in Redis with `INCR`',
          correct: true,
          why: 'Each request is one atomic increment, so every copy sees the same count.',
        },
        {
          text: 'Each gateway runs a short script in Redis that refills and takes a token in one step',
          correct: true,
          why: 'The script runs as one step, so two gateways can never both spend the last token.',
        },
        { text: 'Each gateway keeps its own counter and allows 100 a minute', correct: false, why: 'Six separate counters allow up to 600 a minute.' },
        {
          text: 'Each gateway reads the count from Redis, adds one and writes it back',
          correct: false,
          why: 'Two gateways can read the same count at once and both allow a request: a race condition.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which algorithm gives the service behind it a perfectly steady stream of requests, at the cost of making some of them wait?',
      options: [
        { text: 'Leaky bucket', correct: true, why: 'Requests wait in a line that drains at a fixed pace, so bursts are smoothed out.' },
        { text: 'Token bucket', correct: false, why: 'It lets a burst as big as the bucket straight through.' },
        { text: 'Fixed window', correct: false, why: 'It allows everything up to the limit at once, then nothing until the next window.' },
        { text: 'Sliding window', correct: false, why: 'It limits how many requests fit in any window, but does not space them out.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'A request reaches Snapgram’s gateway. Put the rate-limiting steps in order.',
      items: [
        'Identify the caller from its API key or login',
        'Find the caller’s bucket in Redis',
        'Add the tokens earned since the last request',
        'Take a token, or reject with 429 if there is none',
        'Send the allowed request on to its service',
      ],
      why: 'You need the caller before you can find its bucket, and the refill happens just before spending, in the same atomic step, so the count is current. Only allowed requests reach the service.',
    },
  ],
  takeaways: [
    'A rate limiter caps each client’s requests so one runaway client cannot crowd out everyone else, and rejects the excess quickly with a 429.',
    'Token buckets allow short bursts but hold the long-run rate, leaky buckets smooth traffic into a steady stream, and fixed windows are cheap but let up to twice the limit through at a boundary.',
    'Enforce per-client limits at the gateway with counters in a shared store such as Redis, updated in one atomic step, and decide in advance what happens when that store is down.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Sliding windows at scale.** [Cloudflare described](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/) estimating a sliding window from two counters. With a limit of 50 a minute, 42 requests in the previous minute and 18 so far in a minute that began 15 seconds ago, the estimate is 42 × 45 ÷ 60 + 18 = 49.5. In a test on 400 million requests from 270,000 sources, it reported that 0.003% of requests were wrongly allowed or limited.',
    },
    {
      kind: 'prose',
      md: '**Limit concurrency, not just rate.** A request that takes 30 seconds ties up a server 300 times longer than one that takes 100 ms. That is why Stripe also caps how many requests each user has in progress at once.',
    },
    {
      kind: 'prose',
      md: '**Quotas.** A [[quota|quota]] is a long-period allowance, such as 10,000 calls a day on a free plan, often tied to billing. A quota decides how much in total; a rate limit decides how fast.',
    },
  ],
  flashcards: [
    { front: 'What does a rate limiter do?', back: 'It caps how many requests a client can make in a period and rejects the rest, usually with 429 Too Many Requests.' },
    {
      front: 'How does a token bucket work?',
      back: 'A bucket holds up to B tokens and refills at R a second. Each request spends one, and a request that finds no token is rejected.',
    },
    {
      front: 'What is the weakness of a fixed window?',
      back: 'The count resets at each boundary, so a client can send a full limit just before it and another just after: twice the limit in a moment.',
    },
    {
      front: 'How does a leaky bucket differ from a token bucket?',
      back: 'A leaky bucket queues requests and lets them out at a steady pace, smoothing bursts but adding waits; a token bucket lets bursts through up to its size.',
    },
    { front: 'Why keep rate-limit counters in Redis?', back: 'So every gateway copy counts against the same limit. Separate counters multiply the limit by the number of copies.' },
    {
      front: 'How do you avoid race conditions on shared counters?',
      back: 'Check and update in one atomic step, such as Redis’s INCR or a short script, never as a separate read and write.',
    },
    { front: 'What should a client do when it gets a 429?', back: 'Wait as long as the Retry-After header says, or back off exponentially with jitter, instead of retrying at once.' },
  ],
  related: ['reverse-proxies-gateways', 'timeouts-retries-backoff', 'circuit-breakers', 'api-styles', 'security-essentials', 'multi-region-dr'],
  glossaryTerms: [
    'api-key',
    'scraper',
    'rate-limiting',
    'status-code',
    'token-bucket',
    'burst',
    'leaky-bucket',
    'fixed-window',
    'sliding-window',
    'denial-of-service',
    'api-gateway',
    'ip-address',
    'redis',
    'race-condition',
    'atomic-operation',
    'fail-open',
    'exponential-backoff',
    'jitter',
    'retry-storm',
    'load-shedding',
    'quota',
  ],
};

export default lesson;
