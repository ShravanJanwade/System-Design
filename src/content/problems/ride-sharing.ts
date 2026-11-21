import type { DiagramSpec, Problem } from '../types';

/** v1: one app server and one database; drivers update their row and poll for offers. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'drivers', type: 'client', label: 'Drivers', sublabel: 'driver app', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'drivers and rides', x: 2, y: 0 },
    { id: 'riders', type: 'client', label: 'Riders', sublabel: 'rider app', x: 0, y: 1 },
  ],
  edges: [
    { id: 'drivers-app', from: 'drivers', to: 'app', kind: 'sync', label: 'every 4 s' },
    { id: 'riders-app', from: 'riders', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every 4 seconds, each driver’s app sends its position. The **app server** updates that driver’s row in the **database**: latitude, longitude, and the geohash of the cell they are in, which is indexed.',
      flow: ['drivers-app', 'app-db'],
      notes: [{ target: 'db', text: 'update in place' }],
    },
    {
      caption:
        'A rider requests a ride. The app server saves it, then asks the database for available drivers in the pickup’s cell and its neighbors, and picks the closest one.',
      flow: ['riders-app', 'app-db', '<app-db'],
    },
    {
      caption:
        'Driver apps ask the server for new offers every few seconds ([[polling|polling]]). The chosen driver sees the offer and accepts, and the server records the match in one transaction and tells the rider.',
      flow: ['drivers-app', { edge: 'drivers-app', reverse: true, tag: 'offer' }, { edge: 'riders-app', reverse: true, tag: 'driver found' }],
    },
  ],
};

/** v2: positions flow into an in-memory geo index per city; a matcher pushes offers through gateways. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'drivers', type: 'client', label: 'Drivers', x: 0, y: 0 },
    { id: 'gateway', type: 'gateway', label: 'Driver gateway', sublabel: 'WebSockets', x: 1, y: 0 },
    { id: 'location', type: 'service', label: 'Location service', x: 2, y: 0 },
    { id: 'history', type: 'stream', label: 'Location stream', sublabel: 'trip history', x: 3, y: 0 },
    { id: 'matcher', type: 'service', label: 'Matcher', sublabel: 'per city', x: 1, y: 1 },
    { id: 'geo', type: 'cache', label: 'Live geo index', sublabel: 'in memory, per city', x: 2, y: 1 },
    { id: 'riders', type: 'client', label: 'Riders', x: 0, y: 2 },
    { id: 'ride', type: 'service', label: 'Ride service', x: 1, y: 2 },
    { id: 'db', type: 'sqlDb', label: 'Rides database', sublabel: 'sharded by city', x: 2, y: 2 },
  ],
  edges: [
    { id: 'drivers-gateway', from: 'drivers', to: 'gateway', kind: 'sync' },
    { id: 'gateway-location', from: 'gateway', to: 'location', kind: 'async', label: 'positions' },
    { id: 'location-history', from: 'location', to: 'history', kind: 'async' },
    { id: 'location-geo', from: 'location', to: 'geo', kind: 'sync' },
    { id: 'matcher-geo', from: 'matcher', to: 'geo', kind: 'sync' },
    { id: 'matcher-gateway', from: 'matcher', to: 'gateway', kind: 'async', label: 'offers' },
    { id: 'riders-ride', from: 'riders', to: 'ride', kind: 'sync' },
    { id: 'ride-matcher', from: 'ride', to: 'matcher', kind: 'sync' },
    { id: 'ride-db', from: 'ride', to: 'db', kind: 'sync' },
  ],
  // Phones: drivers down the left, riders down the right, and offers crossing the empty middle back to the gateway.
  narrow: {
    grid: { cols: 3, rows: 5 },
    positions: {
      drivers: { x: 0, y: 0 },
      riders: { x: 2, y: 0 },
      db: { x: 1, y: 1 },
      ride: { x: 2, y: 1 },
      gateway: { x: 0, y: 2 },
      matcher: { x: 2, y: 2 },
      location: { x: 0, y: 3 },
      geo: { x: 1, y: 3 },
      history: { x: 0, y: 4 },
    },
  },
  steps: [
    {
      caption:
        'Each online driver’s app keeps one WebSocket open to a **driver gateway** and sends a small position message every 4 seconds, with no reply: about 250,000 messages a second at peak (ballpark), spread over dozens of gateway servers.',
      flow: ['drivers-gateway', 'gateway-location'],
      notes: [{ target: 'drivers', text: 'every 4 s' }],
    },
    {
      caption:
        'The **location service** writes each position into the **live geo index** for that city, and copies it to the **location stream** for trip history. Index entries vanish after 30 seconds without an update, so a phone that goes quiet drops out of matching.',
      flow: [['location-geo', 'location-history']],
      notes: [{ target: 'geo', text: 'expires after 30 s' }],
    },
    {
      caption:
        'A rider requests a ride. The **ride service** saves it in the **rides database** with the status `matching`, then hands it to the **matcher** for that city.',
      flow: ['riders-ride', 'ride-db', '<ride-db', 'ride-matcher'],
    },
    {
      caption:
        'The matcher asks the geo index for available drivers in the pickup’s cell and its neighbors, ranks the nearest ten by ETA, and sends an offer to the best one through the gateway that holds that driver’s connection.',
      flow: ['matcher-geo', '<matcher-geo', 'matcher-gateway', { edge: 'drivers-gateway', reverse: true, tag: 'offer' }],
    },
    {
      caption:
        'The driver taps accept. The gateway passes it to the matcher, which reports back to the ride service, and the ride service records the match. Two drivers must never win the same ride, which is the next stage.',
      flow: ['drivers-gateway', '<matcher-gateway', '<ride-matcher', 'ride-db'],
    },
  ],
};

/** v3: a conditional transaction settles every accept; trip channels push status and positions to riders. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'drivers', type: 'client', label: 'Drivers', x: 0, y: 0 },
    { id: 'dgw', type: 'gateway', label: 'Driver gateway', x: 1, y: 0 },
    { id: 'ride', type: 'service', label: 'Ride service', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Rides database', sublabel: 'rides and drivers', x: 3, y: 0 },
    { id: 'channel', type: 'queue', label: 'Trip channels', sublabel: 'publish-subscribe', x: 1, y: 1 },
    { id: 'riders', type: 'client', label: 'Riders', x: 0, y: 2 },
    { id: 'rgw', type: 'gateway', label: 'Rider gateway', x: 1, y: 2 },
  ],
  edges: [
    { id: 'drivers-dgw', from: 'drivers', to: 'dgw', kind: 'sync' },
    { id: 'dgw-ride', from: 'dgw', to: 'ride', kind: 'sync', label: 'accept' },
    { id: 'ride-db', from: 'ride', to: 'db', kind: 'sync' },
    { id: 'dgw-channel', from: 'dgw', to: 'channel', kind: 'async' },
    { id: 'ride-channel', from: 'ride', to: 'channel', kind: 'async' },
    { id: 'channel-rgw', from: 'channel', to: 'rgw', kind: 'async' },
    { id: 'riders-rgw', from: 'riders', to: 'rgw', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The matcher offered the ride to driver A and marked A as offered for 15 seconds, a short [[lease|lease]] that stops other matchers offering A a second ride. A taps accept, and the **ride service** runs one transaction: give the ride to A only if it is still `matching`, and mark A busy only if A is still free.',
      flow: ['drivers-dgw', 'dgw-ride', 'ride-db', '<ride-db', '<dgw-ride', { edge: 'drivers-dgw', reverse: true, tag: 'confirmed' }],
      notes: [{ target: 'db', text: '1 row changed' }],
    },
    {
      caption:
        'A race: driver B was offered the ride first, but the offer timed out and moved to A, and B’s late accept arrives a moment after A’s. The same conditional update now finds the ride `accepted`, changes nothing, and B is told the ride is gone. The database settles every race.',
      flow: ['drivers-dgw', 'dgw-ride', 'ride-db', '<ride-db', '<dgw-ride', { edge: 'drivers-dgw', reverse: true, tag: 'ride taken' }],
      notes: [{ target: 'db', text: '0 rows changed', tone: 'alert' }],
    },
    {
      caption:
        'The ride service publishes “driver assigned” to the trip’s channel ([[publish-subscribe|publish-subscribe]]). The **rider gateway** holding the rider’s connection subscribed to that channel when the ride was requested, so the news reaches the rider within a fraction of a second.',
      flow: ['ride-channel', 'channel-rgw', { edge: 'riders-rgw', reverse: true, tag: 'driver found' }],
    },
    {
      caption:
        'On the way to the pickup, the **driver gateway** also publishes each of the driver’s positions to the trip channel, so the car moves on the rider’s map every 4 seconds; the app animates it smoothly between updates.',
      flow: ['drivers-dgw', 'dgw-channel', 'channel-rgw', '<riders-rgw'],
    },
  ],
};

/** v4: what each failure does to one city. One database shard is drawn. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'drivers', type: 'client', label: 'Drivers', x: 0, y: 0 },
    { id: 'dgw', type: 'gateway', label: 'Driver gateways', sublabel: 'many servers', x: 1, y: 0 },
    { id: 'location', type: 'service', label: 'Location service', x: 2, y: 0 },
    { id: 'geo', type: 'cache', label: 'Live geo index', sublabel: 'one city', x: 3, y: 0 },
    { id: 'riders', type: 'client', label: 'Riders', x: 0, y: 1 },
    { id: 'ride', type: 'service', label: 'Ride service', x: 1, y: 1 },
    { id: 'matcher', type: 'service', label: 'Matcher', x: 3, y: 1 },
    { id: 'leader', type: 'sqlDb', label: 'Database leader', sublabel: 'rides, one city', x: 1, y: 2 },
    { id: 'follower', type: 'sqlDb', label: 'Database follower', sublabel: 'another zone', x: 2, y: 2 },
  ],
  edges: [
    { id: 'drivers-dgw', from: 'drivers', to: 'dgw', kind: 'sync' },
    { id: 'dgw-location', from: 'dgw', to: 'location', kind: 'async' },
    { id: 'location-geo', from: 'location', to: 'geo', kind: 'sync' },
    { id: 'riders-ride', from: 'riders', to: 'ride', kind: 'sync' },
    { id: 'ride-matcher', from: 'ride', to: 'matcher', kind: 'sync' },
    { id: 'matcher-geo', from: 'matcher', to: 'geo', kind: 'sync' },
    { id: 'ride-leader', from: 'ride', to: 'leader', kind: 'sync' },
    { id: 'leader-follower', from: 'leader', to: 'follower', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'Each city’s live index is one in-memory shard, refreshed by every driver every 4 seconds. Each rides database shard has a **database leader** and a **database follower** in another zone, kept in step by [[semi-synchronous replication|semi-synchronous-replication]]: a commit returns only once the follower has it too.',
      focus: ['leader', 'follower', 'leader-follower'],
      flow: ['drivers-dgw', 'dgw-location', 'location-geo'],
    },
    {
      caption:
        'A gateway server dies, and about 50,000 drivers lose their connection at once (ballpark). Their apps reconnect to other gateways after a random wait, [[exponential backoff|exponential-backoff]] with [[jitter|jitter]], so the reconnections spread over a few seconds; meanwhile the index keeps their last positions.',
      flow: ['drivers-dgw', 'dgw-location', 'location-geo'],
      notes: [{ target: 'drivers', text: 'reconnecting' }],
    },
    {
      caption:
        'The city’s geo index shard dies, and matching there pauses. A standby starts empty and is complete again about 4 seconds later, because every driver sends a fresh position anyway: the drivers themselves are the source of truth for where they are.',
      fail: ['geo'],
      flow: ['drivers-dgw', 'dgw-location'],
      notes: [{ target: 'matcher', text: 'waits about 4 s' }],
    },
    {
      caption:
        'The database leader dies, and the follower is promoted within seconds ([[failover|failover]]). Every commit had reached it, so no match is forgotten and no driver can be given a second ride; requests in those seconds wait and retry with the same idempotency key.',
      fail: ['leader'],
      flow: ['riders-ride', { edge: 'riders-ride', reverse: true, tag: 'retrying' }],
      notes: [{ target: 'follower', text: 'promoted', tone: 'signal' }],
    },
  ],
};

const problem: Problem = {
  id: 'ride-sharing',
  title: 'Ride sharing',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a ride-sharing service like Uber or Lyft. A rider asks for a ride from where they stand, the system finds a nearby driver who accepts it, and both watch each other approach on a map.',
  concepts: ['back-of-the-envelope', 'geospatial-indexing', 'real-time-communication', 'stateless-vs-stateful', 'distributed-locks', 'consistency-models', 'replication'],
  hints: [
    'Start with the write rate: how many drivers are online at once, and how often does each phone report its position? Compare that with how often anyone requests a ride.',
    'There are two very different kinds of data here: positions that are stale within seconds, and ride assignments that must never be wrong. Give each the storage and the consistency it needs, then think about how an offer reaches a phone within a second.',
    'One shape that works: driver phones hold a [[WebSocket|websocket]] to a gateway and send positions every 4 seconds into an in-memory [[geospatial index|geospatial-index]] per city; a matcher finds nearby drivers, ranks them by time to arrive and offers the ride to one at a time; and the accept is a conditional update in the rides database, so only one driver can ever win.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many drivers are online at once, and how often does each one report its position?',
      why: 'This sets the write rate. Assume about 1 million drivers online at peak, each reporting every 4 seconds (ballpark): 250,000 updates a second of tiny records that are stale within seconds, which points to memory, not a database on disk.',
    },
    {
      q: 'Who is the best driver for a request: the closest in a straight line, or the one who can get there soonest?',
      why: 'Straight-line distance comes straight from the geo index, but the closest car may be across a river. Ranking by estimated time of arrival (ETA) needs a routing service, so you ask the index for a handful of candidates and route only those.',
    },
    {
      q: 'Can a driver decline an offer, and may one request go to several drivers at once?',
      why: 'If drivers can decline, offers go out one at a time with a timeout, which keeps assignment simple but adds seconds per refusal. Sending a request to several drivers is faster, but two of them can accept, so assignment needs an atomic check either way.',
    },
    {
      q: 'Is this one city or worldwide?',
      why: 'A rider in Paris never needs a driver in Tokyo. Ride sharing splits naturally by city, which bounds every index and database shard, keeps servers near their users, and limits the [[blast radius|blast-radius]] of a failure to one city.',
    },
    {
      q: 'What must never go wrong?',
      why: 'Two drivers sent to one rider, or one driver given two rides, is the failure people notice and remember. A lost position update is not, since the next one arrives in 4 seconds. That splits the design into a fast, lossy location path and a strict assignment path.',
    },
    {
      q: 'Are shared rides, scheduled rides or surge pricing in scope?',
      why: 'Shared rides turn matching into route planning, and surge pricing needs live counts of riders and drivers per area. Assume single-rider rides on demand, and leave the others for later.',
    },
  ],
  requirements: {
    functional: [
      'Drivers go online and offline; while online, their app sends its position every few seconds.',
      'Riders see nearby cars on a map, then request a ride from a pickup point to a destination.',
      'Each request is offered to a nearby available driver, who accepts or declines. Every ride ends up with exactly one driver, and every driver has at most one ride.',
      'Until pickup and during the trip, rider and driver see each other’s live position and an ETA; a trip moves from requested to accepted, arrived, in progress and completed, or is cancelled.',
    ],
    nonFunctional: [
      'Fresh positions: the index shows where each driver was within the last 5 seconds or so (ballpark).',
      'Fast matching: for most requests, an offer reaches a driver within about 2 seconds (ballpark).',
      'Strict assignment: never two drivers for one ride or two rides for one driver, even with retries, timeouts and crashes.',
      'Highly available in every city, and a failure in one city must not spread to the others.',
      'Scale: about 1 million drivers online at peak sending 250,000 updates a second, and 20 million rides a day (ballpark).',
    ],
    outOfScope: [
      'Payments, fares and surge pricing.',
      'Maps and routing: assume a routing service that returns the driving time between two points.',
      'Shared and scheduled rides, driver onboarding and ratings.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Drivers online at the busiest moment', value: '1 million worldwide (ballpark)' },
      { label: 'Drivers who work on a given day', value: '2 million, online about 5 hours each' },
      { label: 'Position updates', value: 'one every 4 seconds while online, about 100 bytes each' },
      { label: 'Rides per day', value: '20 million (ballpark)' },
      { label: 'Busiest hour compared with the daily average', value: 'about 2.5×' },
      {
        label: 'In the calculator',
        value: 'a driver is a user, and each position update is a write that is read about once (by a rider’s map or the matcher): 9,000 actions a day at one read per write. The storage line is the raw position history.',
      },
    ],
    steps: [
      { label: 'Position updates per second', math: '10⁶ drivers online at peak ÷ 4 seconds', result: '≈ 250,000 a second at peak, about 100,000 on average' },
      { label: 'Ride requests per second', math: '2 × 10⁷ rides a day ÷ 10⁵ seconds', result: '≈ 200 a second, 500 at peak' },
      { label: 'Live index size', math: '10⁶ drivers × 100 bytes', result: '≈ 100 MB: tiny, so the write rate is the hard part' },
      { label: 'Geo index shards', math: '250,000 writes a second ÷ about 50,000 per shard (a comfortable load, ballpark)', result: 'at least 5; in practice one per city, several for the largest' },
      { label: 'Open connections', math: '10⁶ drivers + about 10⁶ riders with the app open; ÷ 50,000 per gateway server (ballpark)', result: '≈ 40 gateway servers, plus headroom' },
      { label: 'Position history', math: '2 × 10⁶ drivers × 5 hours × 900 updates an hour ≈ 9 × 10⁹ a day; × 100 bytes', result: '≈ 900 GB a day raw: compressed, in object storage' },
    ],
    calculator: { dau: 2_000_000, actionsPerUser: 9_000, readsPerWrite: 1, objectBytes: 100, peakFactor: 2.5, retentionYears: 1 },
  },
  api: [
    {
      signature: 'WebSocket /v1/connect   driver → server: { type: "location", lat, lon, heading, speed, ts }   every 4 s',
      description:
        'One connection per online phone, opened after sign-in. Drivers send a position every 4 seconds with no reply, and the server pushes offers and trip updates down the same connection.',
    },
    {
      signature: 'POST /v1/rides  { pickup: { lat, lon }, dropoff: { lat, lon } }  →  201 { rideId, status: "matching" }',
      description:
        'Requests a ride. An [[idempotency key|idempotency-key]] header means a retry after a timeout returns the same ride instead of booking a second car.',
    },
    {
      signature: 'server → driver: { type: "offer", offerId, rideId, pickup, etaSec, expiresInSec: 15 }',
      description: 'An offer, pushed to one driver at a time. If the driver doesn’t answer within 15 seconds, it lapses and the matcher tries the next driver.',
    },
    {
      signature: 'POST /v1/rides/{rideId}/accept  { offerId }  →  200 { ride }  or  409 Conflict',
      description:
        'A driver accepts. It succeeds only if the ride is still waiting for a driver and the driver is still free; otherwise the app shows that the ride was taken.',
    },
    {
      signature: 'GET /v1/cars/nearby?lat=…&lon=…  →  200 { cars: [{ lat, lon, heading }] }',
      description: 'The little cars on a rider’s map before a request, read from the geo index every few seconds. It returns rounded positions only, with no driver details.',
    },
  ],
  dataModel: [
    {
      entity: 'Driver position',
      fields: ['driver_id', 'lat, lon, heading, speed', 'cell: geohash, 6 characters', 'status: available | offered | on_trip', 'offer_expires_at', 'updated_at'],
      store: 'In-memory geo index such as Redis, one shard per city and several for the biggest',
      why: 'A quarter of a million writes a second at peak (ballpark), of data that is stale within seconds, belongs in memory, not on disk. Losing it costs little, since it refills within one 4-second update, and entries silent for 30 seconds are dropped.',
    },
    {
      entity: 'Ride',
      fields: ['ride_id (primary key)', 'city_id', 'rider_id', 'driver_id (null until accepted)', 'status: matching | accepted | arrived | in_progress | completed | cancelled', 'pickup, dropoff', 'requested_at, accepted_at, completed_at'],
      store: 'Relational database sharded by city, each shard with a leader and a semi-synchronous follower',
      why: 'A ride moves through a small set of states, and each move is a conditional update on its row, so only one driver can win. About 500 new rides a second at peak (ballpark) is light work for a database; being exactly right is the point.',
    },
    {
      entity: 'Driver',
      fields: ['driver_id (primary key)', 'city_id', 'status: offline | available | on_trip', 'current_ride_id'],
      store: 'The same shard as the city’s rides',
      why: 'Accepting a ride changes the ride and the driver together, in one transaction on one shard, so a ride never gets two drivers and a driver never gets two rides.',
    },
    {
      entity: 'Channel subscription',
      fields: ['channel: driver:{id} or trip:{id}', 'gateway_server'],
      store: 'Publish-subscribe system such as Redis Pub/Sub',
      why: 'When a phone connects, its gateway subscribes to the channels for that driver or trip, so the matcher and ride service publish without knowing which gateway holds the connection. Messages are fire-and-forget: a missed position is replaced in 4 seconds, and the app reloads the ride’s status after a reconnect.',
    },
    {
      entity: 'Position history',
      fields: ['driver_id (stream key)', 'ride_id, if on a trip', 'timestamp', 'lat, lon'],
      store: 'Event stream such as Kafka, archived to object storage',
      why: 'About 900 GB a day raw (ballpark), used for trip routes, fares, disputes and analytics, and never on the matching path. Keying by driver keeps each driver’s points in order.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Track drivers, find the closest one for a request, and record the match, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One app server and one database work for a single small city: 2,000 drivers send about 500 updates a second (ballpark), which a database absorbs. At 250,000 updates a second it fails, because each update rewrites an indexed row on disk. Polling also adds seconds to every offer while multiplying requests.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 250,000 position updates a second at peak (ballpark), and offers that must reach a driver’s phone within a second or two.',
      diagram: v2,
      explanation:
        'Positions now skip the database entirely: they live in memory, one shard per city, and expire on their own. Gateways hold the open connections, which makes them [[stateful|stateful-service]], so they do nothing else and can be replaced quickly. The matcher reads the index and pushes offers, while the rides database sees only rides: hundreds of writes a second, not hundreds of thousands.',
    },
    {
      title: 'v3: One driver per ride, and live maps',
      solves: 'Offers time out, accepts arrive late or twice, and riders want to watch their car approach. Every race must still end with exactly one driver per ride.',
      diagram: v3,
      explanation:
        'Two paths now make two different promises. Positions are disposable and [[eventually consistent|eventual-consistency]]: a lost update is replaced 4 seconds later. Assignments are [[strongly consistent|strong-consistency]]: one conditional transaction on one database shard decides each race, and both phones hear the same answer.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A gateway, a geo index shard or a database leader will die during rush hour; riders must still get rides, and no ride may get two drivers.',
      diagram: v4,
      explanation:
        'The location path heals itself because its data is replaced every 4 seconds; the assignment path is safe because its data is copied before each commit returns. Cities are independent, so one city’s trouble never spreads. If a whole region fails, its cities move to another region, drivers reconnect there, and the index refills within seconds.',
    },
  ],
  deepDives: [
    {
      title: 'Where live positions live',
      problem:
        'A quarter of a million position updates arrive every second at peak (ballpark), each stale within seconds. The matcher needs the available drivers near a point within a few milliseconds, while those drivers keep moving.',
      options: {
        caption: 'Four homes for live positions',
        rows: [
          {
            option: 'A row per driver in the main database',
            goodAt: 'One system, and positions sit next to rides for transactions.',
            badAt: 'Every update rewrites an indexed row on disk; 250,000 a second needs a fleet of databases for data nobody reads again a minute later.',
            pickWhen: 'One small city, as in v1.',
          },
          {
            option: 'A Redis geo set per city',
            goodAt: '`GEOADD` and `GEOSEARCH` are built in and run in memory in well under a millisecond, and one node takes tens of thousands of updates a second (ballpark).',
            badAt: 'Members of a set can’t expire one by one, so a sweeper must remove drivers who stop reporting, and a big city can outgrow one node.',
            pickWhen: 'Most cities: the default.',
          },
          {
            option: 'A grid in the matcher’s own memory',
            goodAt: 'No network hop at all, and any cell shape you like, such as the H3 hexagons Uber open-sourced.',
            badAt: 'You build copying, failover and splitting yourself.',
            pickWhen: 'Very large scale, where every millisecond and machine counts.',
          },
          {
            option: 'A quadtree',
            goodAt: 'Cells adapt to density, which suits places that stay put.',
            badAt: 'Moving cars force constant splits and merges, and the tree must be locked or rebuilt while it changes.',
            pickWhen: 'Points that rarely move; not cars.',
          },
        ],
      },
      recommendation:
        'Keep live positions in memory, one shard per city and several for the biggest, in fixed cells about 1 km across (geohashes of 6 characters, ballpark). Move a driver between cells only when they cross a cell edge, and drop anyone silent for 30 seconds. The main database never sees this firehose: it holds rides and driver status, and the position history goes to a stream.',
    },
    {
      title: 'Choosing which driver gets the offer',
      problem:
        'The geo index can name the ten nearest available drivers in milliseconds, but the nearest in a straight line isn’t always the quickest to arrive, and a driver can ignore or decline an offer. Every second spent matching is a second the rider waits.',
      options: {
        caption: 'Ways to pick a driver',
        rows: [
          {
            option: 'Nearest in a straight line',
            goodAt: 'Instant, using only the geo index.',
            badAt: 'The nearest car may be across a river or on the far side of a highway.',
            pickWhen: 'A first version, or to choose candidates for a better ranking.',
          },
          {
            option: 'Best ETA among the nearest ten',
            goodAt: 'Picks the driver who can actually arrive first, and routing ten candidates costs tens of milliseconds (ballpark).',
            badAt: 'Depends on a routing service, and ten candidates can miss a faster driver just beyond them.',
            pickWhen: 'The default.',
          },
          {
            option: 'Offer several drivers at once',
            goodAt: 'The fastest acceptance when drivers often decline.',
            badAt: 'Drivers who tap accept and lose the race are annoyed, and every accept must pass the atomic assignment.',
            pickWhen: 'Few drivers about, or low acceptance rates.',
          },
          {
            option: 'Batch matching every few seconds',
            goodAt: 'Collects every request in an area for a couple of seconds and pairs them to minimize total waiting, which beats one-at-a-time choices in busy areas.',
            badAt: 'Adds a couple of seconds, and each area needs a single owner to run the batch.',
            pickWhen: 'Dense areas at peak.',
          },
        ],
      },
      recommendation:
        'Ask the geo index for available drivers within a couple of kilometers, rank the nearest ten by ETA, and offer the ride to the best one with a 15-second timeout. Mark that driver as offered in the index for those 15 seconds, so other matchers skip them, and move to the next candidate on a decline or a timeout. Mention batch matching as the upgrade for busy areas.',
    },
    {
      title: 'One driver per ride, one ride per driver',
      problem:
        'Matchers run on many servers, offers time out, phones retry, and two accepts can arrive milliseconds apart. Whatever happens, a ride must end with exactly one driver, and a driver with at most one ride.',
      options: {
        caption: 'Ways to make assignment safe',
        rows: [
          {
            option: 'Read, check, then write',
            goodAt: 'Simple code: read the ride, see that it is free, write the driver.',
            badAt: 'A [[race condition|race-condition]]: two accepts both read “free” before either writes, and both win.',
            pickWhen: 'Never for assignment.',
          },
          {
            option: 'A distributed lock per ride',
            goodAt: 'Familiar: take a lock on the ride in a lock service, check, write, release.',
            badAt:
              'One more system on the critical path, and a holder that pauses past its lease can still write unless every write carries a [[fencing token|fencing-token]].',
            pickWhen: 'The data spans systems that can’t share a transaction.',
          },
          {
            option: 'A conditional write in one transaction',
            goodAt:
              'The database is the judge: update the ride only if it is still `matching` and the driver only if still free, in one transaction. One accept changes the rows; the other changes nothing and gets `409 Conflict`.',
            badAt: 'Rides and drivers must live on the same shard, and the losing driver needs a clear message.',
            pickWhen: 'The default: both rows live in one database.',
          },
          {
            option: 'One matcher per city',
            goodAt: 'Every assignment in a city goes through one owner, one at a time, so races inside the city can’t happen.',
            badAt: 'One owner caps a city’s throughput, and ownership itself needs a lease and failover, or two owners can act at once.',
            pickWhen: 'Batch matching, which needs one owner per area anyway.',
          },
        ],
      },
      recommendation:
        'Use a conditional write, a [[compare-and-set|compare-and-set]] on the ride’s status and the driver’s status in one transaction on the city’s shard. Treat the offered mark in the geo index as a hint that prevents double offers, never as the guarantee. Make requests and accepts idempotent so a retry returns the original outcome, and replicate each shard semi-synchronously so a failover never forgets a committed match.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 2.5 million position updates a second at peak (ballpark).',
      impact: 'Gateways and geo index shards run out of headroom, and the location stream fills faster than its readers keep up.',
      mitigation:
        'Add gateways and split big cities into more shards by cell range. Send an update every 4 seconds only while a car moves; a parked car can report every 15 to 30 seconds (ballpark).',
    },
    {
      scenario: 'A stadium empties: 20,000 ride requests in one area within minutes.',
      impact: 'One shard and one matcher take the whole burst, and many requests chase the same few drivers.',
      mitigation:
        'Switch that area to batch matching, admit requests at the rate drivers can accept them, and show riders an honest wait. Surge pricing, out of scope here, exists to balance exactly this.',
    },
    {
      scenario: 'A gateway server dies.',
      impact: 'Tens of thousands of phones lose their connection at once and try to reconnect together, a [[retry storm|retry-storm]] against the remaining gateways.',
      mitigation:
        'Reconnect with exponential backoff and jitter, keep spare gateway capacity, and keep drivers in the index until their 30-second expiry, so a few seconds offline changes nothing.',
    },
    {
      scenario: 'A city’s geo index shard dies.',
      impact: 'Matching in that city pauses; nothing else is affected.',
      mitigation: 'Fail over to a standby, or start an empty shard: it refills within one 4-second update cycle, because every driver resends their position.',
    },
    {
      scenario: 'A rides database leader dies.',
      impact: 'Requests and accepts in that city fail for the seconds a failover takes; trips already under way carry on in the apps.',
      mitigation:
        'Promote the semi-synchronous follower, which has every committed match. Clients retry with their idempotency keys, so nothing is booked twice.',
    },
    {
      scenario: 'A matcher crashes in the middle of its offers.',
      impact: 'The rides it was handling sit in `matching`, with nobody working on them.',
      mitigation:
        'Matchers take rides from a queue per city and hold each under a lease; when a lease lapses, another matcher picks the ride up from the database. A late accept for the old offer still passes through the conditional write.',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'Every city served from it stops matching.',
      mitigation:
        'Move those cities to another region: drivers reconnect there and the index refills in seconds, while rides come from an asynchronous copy of the database. The last few seconds of changes may be missing, so the apps resend their current ride and status, and the ride service reconciles them.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Separates the two flows, position updates and ride requests, and keeps a connection open to push offers.',
        'Finds nearby drivers with a geospatial index instead of scanning every driver.',
        'Records each ride’s status, from requested to completed.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Estimates 250,000 updates a second, and keeps live positions in memory, sharded by city, with expiry for silent drivers.',
        'Offers rides to one driver at a time with a timeout, and ranks candidates by ETA.',
        'Prevents double assignment with a conditional update in a transaction, and explains the race it prevents.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Names the split between a lossy location path and a strict assignment path, and designs each for its own promise.',
        'Plans failures per city: reconnect storms, an index that refills itself, and failover that keeps every committed match.',
        'Raises hot spots such as stadiums and airports, and batch matching, before being asked.',
      ],
    },
  ],
  followUps: [
    {
      q: 'Two drivers tap accept on the same ride 50 ms apart. Walk me through it.',
      a: 'Both accepts reach the ride service, which runs the same transaction for each: set the driver only where the ride is still `matching`, and mark the driver busy only if still free. The database applies them one after the other. The first changes the rows; the second finds the ride `accepted`, changes nothing and gets `409 Conflict`, so that driver sees “ride taken” and stays available.',
    },
    {
      q: 'The geo index for a big city just crashed. What do riders and drivers see?',
      a: 'Riders there wait a few extra seconds for a match, and drivers notice nothing. I start a standby shard, and since every driver sends a position every 4 seconds, it is complete again about 4 seconds later. I don’t carefully replicate this data, because the drivers themselves are its source of truth.',
    },
    {
      q: 'A driver goes into a tunnel and their updates stop for a minute. What happens?',
      a: 'After 30 seconds without an update they drop out of the index, so they get no new offers, and an offer already sent lapses after 15 seconds and moves on. If they are on a trip, nothing breaks: the trip lives in the database, the rider’s map shows the last position, and the app sends its buffered positions when the connection returns.',
    },
    {
      q: 'Why not keep positions in your main database, next to the rides?',
      a: 'Because 250,000 updates a second of data that is useless a minute later would cost a fleet of database machines, and those writes would compete with the reads the matcher needs. The database holds what must be durable and exact, rides and driver status. Positions stay in memory, and their history flows to a stream for fares and disputes.',
    },
    {
      q: 'How do you show riders the little cars on the map before they request?',
      a: 'The app asks a nearby-cars endpoint every few seconds, which reads the geo index for the rider’s cell and its neighbors. It returns rounded positions without driver details, and the app animates between updates. Many riders look at the same busy cells, so I cache each cell’s answer for a second or two.',
    },
    {
      q: 'One city is too busy for a single geo index shard. What do you do?',
      a: 'Split the city by cell ranges into several shards, with a small directory saying which shard owns which cells. A search near a boundary asks both shards and merges the results. A driver who crosses a boundary is removed from one shard and added to the other, which is easy because the location service routes every update by its cell.',
    },
  ],
  rubric: [
    { item: 'Estimated position updates per second at peak, and saw that live data is small but write-heavy', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Kept live positions in an in-memory geospatial index, sharded by city, with expiry for silent drivers', weight: 20, lessonId: 'geospatial-indexing' },
    { item: 'Used open connections to receive positions and push offers, and handled reconnects', weight: 15, lessonId: 'real-time-communication' },
    { item: 'Matched with a geo search plus ranking by ETA, offering one driver at a time with a timeout', weight: 10, lessonId: 'geospatial-indexing' },
    { item: 'Guaranteed one driver per ride with a conditional write in one transaction, and explained the race', weight: 20, lessonId: 'distributed-locks' },
    { item: 'Separated the eventually consistent location path from the strongly consistent assignment path', weight: 10, lessonId: 'consistency-models' },
    { item: 'Explained what riders and drivers see when a gateway, a geo index shard or a database leader fails', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
