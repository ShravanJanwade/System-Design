import type { DiagramEdge, DiagramNode, DiagramSpec, Problem } from '../types';

/* ------------------------------------------------------------------ */
/* v1: two fans, one seat, one database.                               */
/* ------------------------------------------------------------------ */

const itWorks: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'fana', type: 'client', label: 'Fan A', sublabel: 'phone', x: 0, y: 0 },
    { id: 'svc', type: 'service', label: 'Booking service', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Booking database', sublabel: 'seats and holds', x: 2, y: 0 },
    { id: 'fanb', type: 'client', label: 'Fan B', sublabel: 'laptop', x: 0, y: 1 },
    { id: 'pay', type: 'external', label: 'Payment provider', x: 1, y: 1 },
  ],
  edges: [
    { id: 'fana-svc', from: 'fana', to: 'svc', kind: 'sync' },
    { id: 'fanb-svc', from: 'fanb', to: 'svc', kind: 'sync' },
    { id: 'svc-db', from: 'svc', to: 'db', kind: 'sync' },
    { id: 'svc-pay', from: 'svc', to: 'pay', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Fan A opens the seat map. The **Booking service** reads seat statuses from the **Booking database**, where every seat of the event is one row: available, held or sold.',
      flow: ['fana-svc', 'svc-db', '<svc-db', '<fana-svc'],
    },
    {
      caption:
        'Fan A and Fan B click the same seat in the same millisecond. Both requests become the same conditional update: mark the seat held, but only if it is still available or its old hold has expired.',
      flow: [['fana-svc', 'fanb-svc'], 'svc-db'],
    },
    {
      caption:
        'The database applies the two updates one at a time. Fan A’s update changes one row and wins a 10-minute hold; Fan B’s finds the seat already held, changes nothing, and Fan B hears “taken” at once.',
      flow: [
        '<svc-db',
        [
          { edge: 'fana-svc', reverse: true, tag: 'held' },
          { edge: 'fanb-svc', reverse: true, tag: 'taken', tone: 'alert' },
        ],
      ],
    },
    {
      caption:
        'Fan A pays. The service has the **Payment provider** approve the charge, then in one transaction marks the seat sold and records the booking, as long as the hold is still Fan A’s.',
      flow: ['fana-svc', 'svc-pay', '<svc-pay', 'svc-db', '<svc-db', '<fana-svc'],
    },
    {
      caption:
        'Had Fan A walked away instead, nothing would need cleaning up. After 10 minutes the hold has expired, so the next fan’s conditional update treats the seat as available again.',
      flow: ['fanb-svc', 'svc-db'],
      notes: [{ target: 'db', text: 'hold expired' }],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* v2 and v3 share positions, so the design visibly grows.             */
/* ------------------------------------------------------------------ */

const fans: DiagramNode = { id: 'fans', type: 'client', label: 'Fans', sublabel: 'up to a million', x: 0, y: 0 };
const room: DiagramNode = { id: 'room', type: 'gateway', label: 'Waiting room', sublabel: 'at the edge', x: 1, y: 0 };
const svc: DiagramNode = { id: 'svc', type: 'service', label: 'Booking service', x: 2, y: 0 };
const db: DiagramNode = { id: 'db', type: 'sqlDb', label: 'Booking database', sublabel: 'a shard per event', x: 3, y: 0 };
const recon: DiagramNode = { id: 'recon', type: 'worker', label: 'Reconciler', sublabel: 'settles payments', x: 4, y: 0 };
const qstore: DiagramNode = { id: 'qstore', type: 'cache', label: 'Queue store', sublabel: 'in memory', x: 1, y: 1 };
const seatCache: DiagramNode = { id: 'cache', type: 'cache', label: 'Seat map cache', x: 2, y: 1 };
const pay: DiagramNode = { id: 'pay', type: 'external', label: 'Payment provider', x: 3, y: 1 };

const fansRoom: DiagramEdge = { id: 'fans-room', from: 'fans', to: 'room', kind: 'sync' };
const roomQstore: DiagramEdge = { id: 'room-qstore', from: 'room', to: 'qstore', kind: 'sync' };
const roomSvc: DiagramEdge = { id: 'room-svc', from: 'room', to: 'svc', kind: 'sync', label: 'admitted' };
const svcCache: DiagramEdge = { id: 'svc-cache', from: 'svc', to: 'cache', kind: 'sync' };
const svcDb: DiagramEdge = { id: 'svc-db', from: 'svc', to: 'db', kind: 'sync' };
const svcPay: DiagramEdge = { id: 'svc-pay', from: 'svc', to: 'pay', kind: 'sync' };
const reconDb: DiagramEdge = { id: 'recon-db', from: 'recon', to: 'db', kind: 'sync' };
const reconPay: DiagramEdge = { id: 'recon-pay', from: 'recon', to: 'pay', kind: 'sync' };

/** v2: a waiting room in front, a cache for the seat map, one database shard per event. */
const itScales: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [fans, room, svc, db, qstore, seatCache, pay],
  edges: [fansRoom, roomQstore, roomSvc, svcCache, svcDb, svcPay],
  steps: [
    {
      caption:
        'At on-sale time, a million fans arrive within minutes, about 20 for every seat. They all land in the **Waiting room**, a lightweight page served at the edge, and each gets a place in line kept in the **Queue store**.',
      flow: ['fans-room', 'room-qstore', '<room-qstore', '<fans-room'],
      notes: [{ target: 'qstore', text: 'sorted by arrival' }],
    },
    {
      caption:
        'Fans who arrived before the opening are shuffled into a random order, so refreshing early gains nothing; later arrivals join the end. Each fan’s app checks its position every few seconds.',
      flow: ['fans-room', '<fans-room'],
      notes: [{ target: 'fans', text: 'position 48,210' }],
    },
    {
      caption:
        'The room lets fans through at a steady rate, about 2,000 a minute (ballpark), and gives each a signed access token. Requests without a valid token never reach the **Booking service**.',
      flow: ['fans-room', 'room-svc'],
      notes: [{ target: 'room', text: '2,000 a minute' }],
    },
    {
      caption:
        'Admitted fans load the seat map from the **Seat map cache**, which is refreshed about once a second, so seat-map reads never touch the database.',
      flow: ['fans-room', 'room-svc', { edge: 'svc-cache', tag: 'hit' }, '<svc-cache', '<room-svc', '<fans-room'],
    },
    {
      caption:
        'A hold is still one conditional update, now on the database shard that owns this event. Only about 30 holds a second reach it, so the stampede outside never becomes a stampede on the seat rows.',
      flow: ['fans-room', 'room-svc', 'svc-db'],
      notes: [{ target: 'db', text: '≈ 30 holds/s' }],
    },
    {
      caption:
        'Paying calls the **Payment provider** with an idempotency key, then moves the seats from held to sold in one transaction, exactly as in v1.',
      flow: ['svc-pay', '<svc-pay', 'svc-db'],
    },
  ],
};

/** v3: crashes, unknown payment outcomes, database failover and a lost queue store. */
const itSurvives: DiagramSpec = {
  grid: { cols: 5, rows: 2 },
  nodes: [fans, room, svc, db, recon, qstore, seatCache, pay],
  edges: [fansRoom, roomQstore, roomSvc, svcCache, svcDb, svcPay, reconDb, reconPay],
  steps: [
    {
      caption:
        'A booking server crashes after saving a hold but before answering. The app retries with the same idempotency key, and another server finds the hold already recorded under that key and returns it, rather than holding a second set of seats.',
      flow: ['fans-room', 'room-svc', 'svc-db', '<svc-db', '<room-svc', '<fans-room'],
      notes: [{ target: 'svc', text: '1 server died', tone: 'alert' }],
    },
    {
      caption:
        'The payment provider times out, so the charge may or may not have happened. The hold moves to `paying`, which expiry skips, and the **Reconciler** later asks the provider what happened to that idempotency key. It then confirms the booking or releases the seats.',
      add: ['recon'],
      flow: [{ edge: 'svc-pay', tag: 'timeout', tone: 'alert' }, 'recon-pay', '<recon-pay', 'recon-db'],
    },
    {
      caption:
        'The database’s primary fails. A standby in another zone, which received every commit before it was confirmed ([[synchronous replication|synchronous-replication]]), takes over within about 30 seconds (ballpark). No confirmed hold or sale is lost, so no seat can be sold twice, and requests during the switch are told to try again.',
      fail: ['db'],
      flow: ['room-svc', { edge: 'svc-db', tone: 'alert' }],
    },
    {
      caption:
        'The **Queue store** fails. The waiting room stops admitting new fans rather than letting everyone rush in, while fans already admitted keep shopping, because their signed tokens are checked without the store.',
      fail: ['qstore'],
      flow: ['fans-room', 'room-svc'],
      notes: [{ target: 'room', text: 'admissions paused', tone: 'alert' }],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The problem                                                         */
/* ------------------------------------------------------------------ */

const problem: Problem = {
  id: 'ticket-booking',
  title: 'Ticket booking',
  tier: 2,
  flagship: true,
  minutes: 45,
  prompt:
    'Design a ticket booking system like Ticketmaster. Fans choose seats for concerts and games, and for the biggest events far more people want tickets than there are seats.',
  concepts: ['databases-101', 'distributed-locks', 'idempotency', 'rate-limiting', 'caching', 'distributed-transactions'],
  hints: [
    'Most of the time this is an easy system. Focus on the one moment that isn’t: thousands of people trying to grab the same few seats in the same second.',
    'Choosing seats and paying takes minutes, so a seat needs a state between free and sold. How would you hold a seat for one person, and what happens when they walk away?',
    'Give each seat a status and an expiry time. One conditional update moves seats from available to held for about 10 minutes, only if nobody else holds them, and payment moves them to sold. For the biggest sales, put a virtual waiting room in front that lets fans in at a rate the booking system can handle.',
  ],
  clarifyingQuestions: [
    {
      q: 'Do fans pick exact seats, or just a section and a number of tickets?',
      why: 'Exact seats mean many people compete for the same rows, and the app needs a live seat map. General admission is just a count per section, which is simpler, though that one busy counter becomes a [[hot spot|hot-spot]] of its own.',
    },
    {
      q: 'How big are the biggest sales, and how fast do they sell out?',
      why: 'Most events never see real contention, and one relational database handles them easily. A huge on-sale, the moment a popular event’s tickets are released, can bring many times more fans than seats in the first minutes. That needs a waiting room and [[load shedding|load-shedding]] in front of the booking path.',
    },
    {
      q: 'How long can a fan hold seats while paying?',
      why: 'The hold time is a trade-off. Too short, and real buyers lose seats while typing card details; too long, and abandoned holds keep seats from others. Whatever the answer, it becomes the expiry on every hold.',
    },
    {
      q: 'Is selling the same seat twice ever acceptable?',
      why: 'For assigned seats, no: two people with one seat is the failure that matters most. That answer makes the booking path [[strongly consistent|strong-consistency]], even if it means turning some requests away during failures.',
    },
    {
      q: 'Do we take payments ourselves, or through an outside payment provider?',
      why: 'With an outside provider, payment is a slow call that can time out, or succeed after we have stopped waiting. The design then needs [[idempotency keys|idempotency-key]] and a way to reconcile payments with bookings, comparing the two and fixing any mismatch.',
    },
    {
      q: 'Is there a limit on tickets per person, and are bots a concern?',
      why: 'Ticket limits and bot defenses shape the waiting room and the rate limits. Without them, scripts run by resellers can take most of the seats in the first seconds.',
    },
  ],
  requirements: {
    functional: [
      'Browse events and see a seat map with live availability.',
      'Select up to 8 seats and hold them for about 10 minutes while paying.',
      'Pay and receive a confirmed booking; seats that were held but not paid for are released automatically.',
      'For high-demand events, wait in a virtual waiting room, a holding page that lets fans in a few at a time, and be let in fairly.',
      'View and cancel bookings, within the event’s refund rules.',
    ],
    nonFunctional: [
      'No double booking: each seat is sold to at most one fan, even during failures.',
      'Survive on-sale spikes: up to a million fans arriving within minutes for one event (ballpark).',
      'Fairness: fans who arrive earlier are let in earlier, and bots gain nothing from speed.',
      'Browsing is fast, about 100 ms (ballpark), and highly available; the seat map may be a few seconds stale.',
      'The booking path picks consistency over availability: it is better to ask a fan to try again than to sell a seat twice.',
    ],
    outOfScope: [
      'Pricing, dynamic pricing, promotions and resale.',
      'The payment provider’s internals and fraud models.',
      'Venue setup and the tools for creating events.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Events on sale at any time', value: '10,000, with about 20,000 seats each (ballpark)' },
      { label: 'A normal day', value: '10 million visitors with about 20 page views each, and 1 million tickets sold in about 400,000 orders' },
      { label: 'The biggest on-sale', value: '50,000 seats, and 1 million fans arriving in the first 5 minutes (ballpark)' },
      { label: 'Tickets per order', value: 'about 2.5' },
      { label: 'Hold time', value: '10 minutes' },
      { label: 'Record sizes', value: 'about 100 bytes per seat and about 1 KB per booking' },
      {
        label: 'In the calculator',
        value: 'a normal day, with orders as the writes; an on-sale is far beyond its largest peak factor, so it is worked out by hand below',
      },
    ],
    steps: [
      {
        label: 'Normal reads',
        math: '10 million × 20 = 200 million page views a day; ÷ 100,000 seconds',
        result: 'about 2,000 reads a second, more in the evening',
      },
      {
        label: 'Normal writes',
        math: '400,000 orders a day ÷ 100,000 seconds',
        result: 'about 4 orders a second: one database handles that easily',
      },
      {
        label: 'On-sale arrivals',
        math: '1 million fans ÷ 300 seconds',
        result: 'about 3,000 new fans a second at the front door',
      },
      {
        label: 'On-sale reads with no protection',
        math: '1 million fans each refreshing the seat map every 2 seconds',
        result: 'about 500,000 reads a second, for one event',
      },
      {
        label: 'Contention',
        math: '1 million fans ÷ 50,000 seats',
        result: 'about 20 fans for every seat, most of them wanting the same best sections',
      },
      {
        label: 'Admission rate',
        math: '50,000 seats ÷ 2.5 per order = 20,000 orders; admit about 2,000 fans a minute',
        result: 'a sellout in roughly 10 to 15 minutes, with only about 30 holds a second reaching the database',
      },
      {
        label: 'Storage',
        math: '10,000 events × 20,000 seats × 100 bytes; plus 400,000 bookings a day × 1 KB × 365',
        result: 'about 20 GB of seats and about 150 GB of bookings a year: small',
      },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 20, readsPerWrite: 500, objectBytes: 1_000, peakFactor: 10, retentionYears: 5 },
  },
  api: [
    {
      signature: 'GET /v1/events/{eventId}/seats → { sections: [{ sectionId, seats: [{ seatId, status }] }], asOf }',
      description:
        'The seat map, served from a cache refreshed about once a second. It can be slightly stale, so it is only a hint; the hold request is where the truth is checked.',
    },
    {
      signature: 'POST /v1/events/{eventId}/holds  { seatIds[], idempotencyKey } → 201 { holdId, expiresAt } | 409 { taken: seatIds[] }',
      description:
        'Holds all the requested seats or none of them, for 10 minutes. A `409 Conflict` lists the seats someone else got first, so the app can offer nearby ones. Repeating the request with the same key returns the same hold.',
    },
    {
      signature: 'POST /v1/holds/{holdId}/purchase  { paymentToken, idempotencyKey } → 200 { bookingId } | 410 Gone',
      description:
        'Authorizes the card through the payment provider (reserving the money), turns the hold into a booking, then captures the payment (actually taking it). The provider gets an idempotency key derived from the hold, so a retried click charges once. `410 Gone` means the hold expired before payment started.',
    },
    {
      signature: 'DELETE /v1/holds/{holdId} → 204 No Content',
      description: 'Releases the seats at once when the fan leaves checkout, instead of waiting for the hold to expire.',
    },
    {
      signature: 'POST /v1/events/{eventId}/line → { lineToken, position }',
      description:
        'Joins the waiting room. The `lineToken` is signed and records the fan’s place in line, so the line can be rebuilt from the tokens fans hold if the queue store is lost.',
    },
    {
      signature: 'GET /v1/events/{eventId}/line/status?token=… → { position, admitted, accessToken? }',
      description:
        'Polled every few seconds, with [[jitter|jitter]] so a million apps do not ask at the same instant. Once the fan is admitted, it returns a short-lived signed access token that the hold and purchase endpoints require.',
    },
  ],
  dataModel: [
    {
      entity: 'Seat',
      fields: ['eventId, seatId (primary key)', 'section, row, number', "status: 'available' | 'held' | 'sold'", 'holdId', 'heldUntil', 'bookingId'],
      store: 'Relational database, for example PostgreSQL, partitioned by eventId as it grows',
      why: 'The seat row is the [[source of truth|source-of-truth]] for availability: one conditional update on it, a write that applies only if the seat is still free, decides who gets the seat. Keeping all of an event’s seats on one [[shard|sharding]] lets a multi-seat hold run as one local [[transaction|transaction]].',
    },
    {
      entity: 'Hold',
      fields: [
        'holdId',
        'userId',
        'eventId',
        'seatIds',
        'expiresAt',
        "status: 'active' | 'paying' | 'purchased' | 'expired' | 'released'",
        'idempotencyKey (unique)',
      ],
      store: 'Same database, written in the same transaction as its seats',
      why: 'A hold and its seats can never disagree, because they change together. An [[index|index]] on `expiresAt` lets a background sweeper find expired holds quickly, and the unique key turns a retried request into the same hold.',
    },
    {
      entity: 'Booking',
      fields: ['bookingId', 'holdId (unique)', 'userId', 'eventId', 'seatIds', 'paymentId', 'createdAt'],
      store: 'Same database',
      why: 'A unique [[constraint|constraint]] on `holdId` means one hold becomes at most one booking, however many times a purchase is retried. Bookings are kept for years for refunds and entry checks, and at about 1 KB each they stay small.',
    },
    {
      entity: 'Line entry',
      fields: ['eventId', 'lineToken', 'joinedAt, or a random number for fans who arrived before opening', 'admittedAt'],
      store: 'In-memory store such as Redis, with one sorted set per event',
      why: 'Hundreds of thousands of fans join in minutes, which an in-memory store such as [[Redis|redis]] handles easily, and a sorted set (a collection kept in order by a score) makes a fan’s position a cheap lookup. Losing it is a nuisance, not a correctness problem: the database still prevents double booking.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Selling each seat exactly once while people take minutes to choose and pay.',
      diagram: itWorks,
      explanation:
        'The database does the hard part. A conditional update is atomic, so two fans can never both hold one seat, and putting the expiry check inside that same update means correctness never depends on a background job. One relational database handles a normal day’s few orders a second easily.',
    },
    {
      title: 'v2: It scales',
      solves: 'A million fans arriving in the same few minutes for 50,000 seats, without melting the booking path or rewarding whoever refreshes fastest.',
      diagram: itScales,
      explanation:
        'When demand is 20 times supply, no amount of scaling lets everyone in at once, so the waiting room turns the spike into a steady flow. Reads come from a cache that may be a second stale, and writes stay on one shard per event, where a conditional update keeps them correct. The admission rate is a dial: raise it while checkouts finish quickly, and lower it when the database or payments slow down.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'Crashed servers, payments with unknown outcomes and database failover, without double booking or charging anyone for seats they don’t get.',
      diagram: itSurvives,
      explanation:
        'Correctness rests on three things that survive crashes: conditional updates in one database, synchronous replication to a standby, and idempotency keys on every hold and payment. Everything else, including the waiting room and the caches, can fail safe, by pausing admissions or serving a slightly older seat map, and recover without risking a double sale.',
    },
  ],
  deepDives: [
    {
      title: 'Preventing double booking',
      problem:
        'Two fans can click the same seat in the same millisecond, and with many booking servers there is no single place in memory to decide who wins. Reading the seat and then writing it is a [[race condition|race-condition]]: both requests can see it as available. The decision has to be atomic, and it has to cover every seat in the hold.',
      options: {
        caption: 'Ways to make sure a seat is sold once.',
        rows: [
          {
            option: 'Conditional update',
            goodAt: 'One [[compare-and-set|compare-and-set]] statement checks and changes each seat, so no lock is held while a fan thinks, and the loser hears “taken” at once.',
            badAt: 'The app must check how many rows changed, and a multi-seat hold needs a transaction around its updates.',
            pickWhen: 'The usual answer: assigned seats in one relational database.',
          },
          {
            option: 'Row locks (`SELECT … FOR UPDATE`)',
            goodAt: 'Easy to reason about: read the seats, check them and update them while they are locked.',
            badAt: 'Requests queue behind hot seats, and two holds that lock seats in different orders can deadlock, each waiting for the other, unless seats are always locked in a fixed order.',
            pickWhen: 'The check needs several reads that one update cannot express.',
          },
          {
            option: 'A [[distributed lock|distributed-lock]] per seat in Redis',
            goodAt: 'Fast, and it keeps some load off the database.',
            badAt: 'A lock can expire during a pause and let two holders overlap, so the database must check anyway, for example with a [[fencing token|fencing-token]].',
            pickWhen: 'Rarely: only to turn away losers before the database, never as the only guard.',
          },
          {
            option: 'The strictest [[isolation level|isolation-level]] (serializable)',
            goodAt: 'The database guarantees the result matches some one-at-a-time order, even for complex rules.',
            badAt: 'Under heavy contention many transactions abort, and the app must retry them.',
            pickWhen: 'A rule spans many rows, such as at most 8 tickets per fan per event.',
          },
        ],
      },
      recommendation:
        'Use one conditional update per hold, inside a transaction: set the seats to held where `status = available or heldUntil < now()`, and commit only if the number of rows changed equals the number of seats requested. Add a unique constraint on event and seat in the bookings table as a last line of defense. Keep all of an event’s seats on one shard, so the hold never becomes a transaction across databases.',
    },
    {
      title: 'Holds that expire',
      problem:
        'A hold reserves seats for one fan for a short time, much like a [[lease|lease]]. Many holds are abandoned, so expired holds must free their seats reliably, without ever freeing a seat whose payment is still going through.',
      options: {
        caption: 'Ways to make a hold run out.',
        rows: [
          {
            option: 'Expiry time on the seat, checked by the update',
            goodAt: 'Correct without any background job: an expired hold simply counts as available.',
            badAt: 'The seat map shows expired holds as held until something tidies them up.',
            pickWhen: 'Always, as the rule that guarantees correctness.',
          },
          {
            option: 'Hold keys in Redis with a [[time to live|ttl]] (TTL)',
            goodAt: 'Fast, and keys disappear on their own.',
            badAt: 'A second source of truth: after a failover, holds can vanish or disagree with the database.',
            pickWhen: 'As a fast pre-check in front of the database, never as the record.',
          },
          {
            option: 'A delayed message that releases the hold',
            goodAt: 'Seats free up at the right moment, and the seat map stays accurate.',
            badAt: 'If the message is lost or late, the seat stays held, and a release that arrives during payment must be ignored.',
            pickWhen: 'As a tidy-up for the seat map, on top of the expiry check.',
          },
          {
            option: 'No holds: first to pay wins',
            goodAt: 'Nothing to expire.',
            badAt: 'Fans type their card details and then lose the seat, and losing payments must be refunded.',
            pickWhen: 'General admission with plenty of supply.',
          },
        ],
      },
      recommendation:
        'Store `heldUntil` on each seat and make the conditional update treat an expired hold as available, so correctness never waits for a job. Run a sweeper every few seconds to reset expired holds, purely so the seat map stays accurate. When payment starts, mark the hold `paying` and extend it by a few minutes, so expiry can never take seats out from under a charge in progress.',
    },
    {
      title: 'The virtual waiting room',
      problem:
        'At an on-sale, demand can be 20 times supply, all arriving in the same few minutes. Autoscaling cannot add servers that fast, and turning requests away at random rewards whoever retries most, usually bots.',
      options: {
        caption: 'Ways to let a crowd in.',
        rows: [
          {
            option: 'No waiting room: autoscale and [[rate-limit|rate-limiting]]',
            goodAt: 'Nothing extra to build.',
            badAt: 'Scaling lags a spike by minutes, random rejections are unfair, and rejected fans retry, which adds load.',
            pickWhen: 'Events that never sell out quickly.',
          },
          {
            option: 'First come, first served line',
            goodAt: 'Simple and easy to explain, and fans see their position.',
            badAt: 'Rewards whoever loads the page first, so bots and constant refreshing win the front of the line.',
            pickWhen: 'Moderate demand with little bot pressure.',
          },
          {
            option: 'Random order for early arrivals, then first come, first served',
            goodAt: 'Arriving a second before opening is as good as arriving an hour early, which removes the race at the opening.',
            badAt: 'Fans who came early may feel cheated, so the rules must be stated clearly.',
            pickWhen: 'High-demand on-sales: the usual choice.',
          },
          {
            option: 'A lottery for the right to buy, run days ahead',
            goodAt: 'No spike at all, and bots gain little from speed.',
            badAt: 'Slow, and it needs registration and identity checks in advance.',
            pickWhen: 'The very largest events, where demand is many times supply.',
          },
        ],
      },
      recommendation:
        'Run the waiting room at the edge, on a page served by a content delivery network (CDN), so the line itself never loads the booking system. Shuffle everyone who arrives before the opening, then go first come, first served, and admit fans at a rate you adjust live from checkout success and database latency. Check accounts for bots and ticket limits before a fan joins the line, not after they reach a seat, and admit them with short-lived signed tokens that the booking service can verify on its own.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a big on-sale',
      impact: 'A million fans arrive at once. Without the waiting room, seat-map reads alone would reach about 500,000 a second.',
      mitigation: 'The waiting room absorbs the crowd at the edge, the seat map comes from a cache, and only the admission rate reaches the database.',
    },
    {
      scenario: '100× load: a world tour goes on sale in many cities at once',
      impact: 'Hundreds of hot events compete for the same booking servers and databases.',
      mitigation:
        'Shard by event so each on-sale has its own database shard, keep a separate line per event, and give the biggest on-sales dedicated capacity, a [[bulkhead|bulkhead]], so one event cannot starve the rest.',
    },
    {
      scenario: 'Everyone wants the same front rows',
      impact: 'Most holds fail with “taken”, fans retry, and the retries pile onto a few hot rows.',
      mitigation: 'Offer “best available” seats picked by the server, return nearby alternatives with every 409 answer, and limit retries per access token.',
    },
    {
      scenario: 'The booking database’s primary fails',
      impact: 'Holds and purchases fail for up to about 30 seconds (ballpark) while the standby takes over.',
      mitigation:
        'Synchronous replication to a standby in another zone, so nothing confirmed is lost, then automatic [[failover|failover]]. Pause admissions during the switch, and let apps retry with their idempotency keys.',
    },
    {
      scenario: 'The payment provider is slow or down',
      impact: 'Checkouts stall, and holds could expire in the middle of a payment.',
      mitigation:
        'Mark holds `paying` and extend them, wrap provider calls in a [[circuit breaker|circuit-breaker]], pause admissions so new fans don’t pile up, and let the reconciler settle every payment whose outcome is unknown.',
    },
    {
      scenario: 'The queue store dies',
      impact: 'Nobody new can join the line or be admitted.',
      mitigation:
        'Fail safe: pause admissions rather than opening the doors. Admitted fans keep shopping with their signed tokens, and because each line token records its place, the line can be rebuilt from the tokens fans present.',
    },
    {
      scenario: 'The seat map cache dies',
      impact: 'Seat-map reads fall through to the database.',
      mitigation:
        'Coalesce reads so each event’s map is rebuilt about once a second, shed load if needed, and fall back to “best available” selection without a map.',
    },
    {
      scenario: 'Bots flood the line',
      impact: 'Thousands of scripted accounts take places in line, and with them most of the seats.',
      mitigation: 'Verify accounts before they join, limit tickets per account and per payment card, and rate-limit by device and network address.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Stores seats in a relational database and books them inside a transaction.',
        'Notices that two fans can click the same seat at once, and says the database must decide who wins.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Uses a conditional update or row locks, all or nothing across a multi-seat hold, and explains the race it prevents.',
        'Designs holds that expire, and makes holds and purchases idempotent so retries never double-book or double-charge.',
        'Serves the seat map from a cache and explains why slightly stale reads are fine there.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Sees that demand is many times supply and makes the waiting room the real scaling answer, including fairness and bots.',
        'Handles payments with unknown outcomes: idempotency keys, a `paying` state, reconciliation and refunds.',
        'Chooses synchronous replication for the booking database, and explains how [[asynchronous replication|asynchronous-replication]] could resell a seat after a failover.',
        'Keeps each booking inside one shard by partitioning by event, and isolates the biggest on-sales.',
      ],
    },
  ],
  followUps: [
    {
      q: 'Two fans click the same seat in the same millisecond. Walk me through exactly what happens.',
      a: 'Both requests send the same conditional update to the shard that owns the event. The database applies them one at a time: the first changes one row and commits, and the second finds the seat held, changes nothing and rolls back. That fan gets a 409 with nearby alternatives, typically within tens of milliseconds (ballpark).',
    },
    {
      q: 'A fan’s payment went through, but their hold expired a second earlier and someone else took the seat. Now what?',
      a: 'Marking the hold `paying` and extending it before the charge starts makes this rare. If it still happens, the final transaction finds the seats are no longer theirs and fails, so the [[saga|saga]] runs its compensating step: void or refund the charge, and tell the fan. Because the card was only authorized, not yet captured, voiding it usually means no money ever moved.',
    },
    {
      q: 'The line is 800,000 fans long. How do you tell each of them their position without overloading anything?',
      a: 'Give each fan a number when they join, inside their signed token, and publish one value, “now admitting up to number N”, that the CDN caches for a second or two. Each app works out its own position as its number minus N, so a million polling apps hit one cached value rather than a database. Apps poll every few seconds with jitter, and N rises as fast as the admission rate allows.',
    },
    {
      q: 'How would the design change for general admission, with no seat numbers?',
      a: 'Each section becomes a counter, and one conditional update subtracts tickets only if enough remain. That single row is now the hot spot, so split each section’s count across several rows and take tickets from any row that has enough. Holds work the same way, with each hold recording how many tickets it took from which row.',
    },
    {
      q: 'Resellers run thousands of bots. What do you do?',
      a: 'Make speed worthless and identity expensive. Shuffle early arrivals, verify accounts and phone numbers before fans join the line, limit tickets per account and per payment card, and rate-limit by device. Short-lived access tokens tied to one account stop an admitted session from being shared among bots.',
    },
    {
      q: 'The artist wants 2,000 seats saved for a fan club presale. How does that fit?',
      a: 'Tag those seats with an allocation, and make the conditional update check that the fan’s access token carries the presale right. The presale gets its own line and its own on-sale time. Seats left unsold when it ends are retagged for the general sale in one update.',
    },
    {
      q: 'Fans in Europe say the seat map is slow, but your database is in one American region. Do you go multi-region?',
      a: 'For reads, yes: serve the seat map and the waiting room from caches and edges near the fans. For writes, keep one home region per event, usually near the venue, because taking holds for the same seat in two regions would need coordination between regions on every hold, or risk selling it twice. A few hundred extra milliseconds on a hold is a fair price for never double booking.',
    },
  ],
  rubric: [
    { item: 'Named contention on hot seats as the core problem, and made the database decide each seat atomically', weight: 20, lessonId: 'databases-101' },
    { item: 'Designed holds that expire, without relying on a background job for correctness', weight: 15, lessonId: 'distributed-locks' },
    { item: 'Made holds and purchases idempotent, so retries and double clicks are safe', weight: 15, lessonId: 'idempotency' },
    { item: 'Put a virtual waiting room in front of on-sales, with an admission rate, fairness rules and bot defenses', weight: 20, lessonId: 'rate-limiting' },
    { item: 'Served the seat map from a cache, and explained why stale reads are acceptable there', weight: 10, lessonId: 'caching' },
    { item: 'Handled payment timeouts with a paying state, reconciliation and compensation', weight: 10, lessonId: 'distributed-transactions' },
    { item: 'Used synchronous replication and failover for the booking database, sharded by event', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
