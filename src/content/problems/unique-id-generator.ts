import type { DiagramSpec, Problem } from '../types';

/** v1: one database counter (a ticket server) hands out every number. */
const v1: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'a', type: 'service', label: 'App server A', x: 0, y: 0 },
    { id: 'b', type: 'service', label: 'App server B', x: 0, y: 1 },
    { id: 'ticket', type: 'sqlDb', label: 'Ticket server', sublabel: 'one counter', x: 1, y: 0.5 },
  ],
  edges: [
    { id: 'a-ticket', from: 'a', to: 'ticket', kind: 'sync' },
    { id: 'b-ticket', from: 'b', to: 'ticket', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'App server A needs an ID for a new order, so it asks the **ticket server**, a database whose [[auto-increment|auto-increment]] counter answers 1,045,213. With only one counter, no two IDs can ever match.',
      flow: ['a-ticket', '<a-ticket'],
      notes: [{ target: 'ticket', text: 'next: 1,045,214' }],
    },
    {
      caption:
        'App server B asks at the same moment and waits its turn. Every ID now costs a network round trip of about a millisecond (ballpark), and every new record in the company queues at one machine.',
      flow: ['b-ticket', '<b-ticket'],
    },
    {
      caption:
        'The ticket server goes down, and nothing anywhere can create an order, a message or a user until it returns: a [[single point of failure|single-point-of-failure]].',
      fail: ['ticket'],
    },
  ],
};

/** v2: Snowflake-style generators behind a load balancer; worker numbers leased from a coordination service. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'apps', type: 'service', label: 'App servers', sublabel: 'callers', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'gen1', type: 'service', label: 'Generator', sublabel: 'worker 1', x: 2, y: 0 },
    { id: 'gen2', type: 'service', label: 'Generator', sublabel: 'worker 2', x: 2, y: 2 },
    { id: 'coord', type: 'nosqlDb', label: 'Coordination', sublabel: 'etcd, leases', x: 3, y: 1 },
  ],
  edges: [
    { id: 'apps-lb', from: 'apps', to: 'lb', kind: 'sync', label: '100 at a time' },
    { id: 'lb-gen1', from: 'lb', to: 'gen1', kind: 'sync' },
    { id: 'lb-gen2', from: 'lb', to: 'gen2', kind: 'sync' },
    { id: 'gen1-coord', from: 'gen1', to: 'coord', kind: 'sync' },
    { id: 'gen2-coord', from: 'gen2', to: 'coord', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'When a **generator** starts, it claims a free worker number from the **coordination** service and holds it under a 10-minute lease that it renews every minute. These two hold workers 1 and 2 in data center 1.',
      flow: [['gen1-coord', 'gen2-coord'], ['<gen1-coord', '<gen2-coord']],
      notes: [{ target: 'coord', text: 'workers 1, 2 taken' }],
    },
    {
      caption:
        'An app server asks for 100 IDs. Generator 1 builds each one in memory from the current millisecond, its data center and worker numbers, and a sequence that counts up within the millisecond: no disk, no other machine.',
      flow: ['apps-lb', 'lb-gen1', '<lb-gen1', '<apps-lb'],
      notes: [{ target: 'gen1', text: 'sequence 0 to 99' }],
    },
    {
      caption:
        'Another call reaches generator 2 in the same millisecond. Its IDs carry worker 2 instead of 1, so they can’t match generator 1’s, even with identical times and sequences.',
      flow: ['apps-lb', 'lb-gen2', '<lb-gen2', '<apps-lb'],
      notes: [{ target: 'gen2', text: 'same ms, worker 2' }],
    },
    {
      caption:
        'Each generator can make 4,096 IDs per millisecond, about 4 million a second, so two cover 20,000 a second at peak (ballpark) hundreds of times over; extra generators are for spare capacity, not speed. Callers keep a small buffer of IDs, so they rarely wait on a call.',
      focus: ['gen1', 'gen2'],
    },
  ],
};

/** v3: what a generator does when its clock moves backwards, and after a restart. */
const v3: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'apps', type: 'service', label: 'App servers', x: 0, y: 0 },
    { id: 'gen1', type: 'service', label: 'Generator', sublabel: 'worker 1', x: 1, y: 0 },
    { id: 'ntp', type: 'external', label: 'Time servers', x: 2, y: 0 },
    { id: 'gen2', type: 'service', label: 'Generator', sublabel: 'worker 2', x: 1, y: 1 },
    { id: 'coord', type: 'nosqlDb', label: 'Coordination', x: 2, y: 1 },
  ],
  edges: [
    { id: 'apps-gen1', from: 'apps', to: 'gen1', kind: 'sync' },
    { id: 'apps-gen2', from: 'apps', to: 'gen2', kind: 'sync' },
    { id: 'ntp-gen1', from: 'ntp', to: 'gen1', kind: 'sync', label: 'time sync' },
    { id: 'gen2-coord', from: 'gen2', to: 'coord', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Generator 1 last used 12:00:00.105. A correction from the **time servers**, which speak the [[Network Time Protocol|ntp]] (NTP), steps its clock back 3 ms, to .102.',
      flow: ['ntp-gen1'],
      notes: [{ target: 'ntp', text: 'step back 3 ms', tone: 'alert' }],
    },
    {
      caption:
        'A request arrives. The generator sees that now (.102) is earlier than the last time it used (.105), so it waits 3 ms rather than risk repeating an ID, then answers; the caller barely notices.',
      flow: ['apps-gen1', '<apps-gen1'],
    },
    {
      caption:
        'A bad time source moves the clock back 2 seconds. Stalling every request that long is worse than failing, so generator 1 refuses to make IDs and fails its [[health check|health-check]]; callers move to generator 2 while an alert goes out.',
      fail: ['gen1'],
      flow: ['apps-gen2', '<apps-gen2'],
    },
    {
      caption:
        'Generator 2 crashes and restarts. It never takes back its old number: it claims one whose lease ran out minutes after its last ID, longer than any clock error the generators accept, so no restart can repeat an older ID.',
      flow: ['gen2-coord', '<gen2-coord'],
      notes: [{ target: 'coord', text: 'worker 3, unused' }],
    },
  ],
};

/** v4: two regions, each with its own data center number; what each failure does to callers. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'apps1', type: 'service', label: 'App servers', sublabel: 'region 1', x: 0, y: 0 },
    { id: 'id1', type: 'service', label: 'ID service', sublabel: 'data center 1', x: 1, y: 0 },
    { id: 'coord1', type: 'nosqlDb', label: 'Coordination', sublabel: 'region 1', x: 2, y: 0 },
    { id: 'apps2', type: 'service', label: 'App servers', sublabel: 'region 2', x: 0, y: 2 },
    { id: 'id2', type: 'service', label: 'ID service', sublabel: 'data center 2', x: 1, y: 2 },
    { id: 'coord2', type: 'nosqlDb', label: 'Coordination', sublabel: 'region 2', x: 2, y: 2 },
  ],
  edges: [
    { id: 'apps1-id1', from: 'apps1', to: 'id1', kind: 'sync' },
    { id: 'id1-coord1', from: 'id1', to: 'coord1', kind: 'sync' },
    { id: 'apps2-id2', from: 'apps2', to: 'id2', kind: 'sync' },
    { id: 'id2-coord2', from: 'id2', to: 'coord2', kind: 'sync' },
    { id: 'apps1-id2', from: 'apps1', to: 'id2', kind: 'sync', fromSide: 'bottom', toSide: 'top' },
  ],
  steps: [
    {
      caption:
        'Each region runs its own **ID service**, with its own data center number and its own **coordination** service, spread over three [[availability zones|availability-zone]]. Making an ID never crosses regions, so a cut link between them changes nothing.',
      flow: [['apps1-id1', 'apps2-id2'], ['<apps1-id1', '<apps2-id2']],
    },
    {
      caption:
        'One generator in region 1 dies. The load balancer drops it within seconds, callers retry on another generator, and its worker number frees itself when its lease runs out.',
      flow: ['apps1-id1', '<apps1-id1'],
      notes: [{ target: 'id1', text: '1 of 5 down', tone: 'alert' }],
    },
    {
      caption:
        'Region 1’s coordination service goes down. Generators keep their numbers until their 10-minute leases run out, so IDs keep flowing; only new generators can’t start, and the alert gives people minutes to act.',
      fail: ['coord1'],
      flow: ['apps1-id1', '<apps1-id1'],
    },
    {
      caption:
        'Region 1’s whole ID service is unreachable. Callers spend their buffers, a few seconds of IDs, then call region 2’s service, whose different data center number keeps every ID unique, at the cost of a cross-region round trip.',
      fail: ['id1'],
      add: ['apps1-id2'],
      flow: ['apps1-id2', '<apps1-id2'],
    },
  ],
};

const problem: Problem = {
  id: 'unique-id-generator',
  title: 'Unique ID generator',
  tier: 1,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a service that hands out unique identifiers (IDs) to every server in a large system. Servers need new IDs for posts, messages and orders thousands of times a second, and no two may ever be the same.',
  concepts: ['unique-ids', 'time-and-ordering', 'consensus-leader-election', 'back-of-the-envelope', 'indexes', 'sharding', 'distributed-locks'],
  hints: [
    'Pin down the constraints first: how big may an ID be, must IDs sort by time, and how many are needed per second? The answers rule out whole families of designs before you draw anything.',
    'The cheapest coordination is none at all. Think about what each machine could combine, using only what it knows locally, so that two machines can never produce the same number, and about what could make one machine repeat itself.',
    'One shape that works: a [[Snowflake ID|snowflake-id]] with 41 bits of milliseconds since a custom [[epoch|epoch]], 10 bits of worker number and a 12-bit sequence; worker numbers leased from a [[coordination service|coordination-service]]; and a rule for clocks that move backwards: wait out small jumps, refuse large ones.',
  ],
  clarifyingQuestions: [
    {
      q: 'Must IDs be unique across every machine and forever, or only within one table?',
      why: 'Unique everywhere and forever rules out a counter per database, since counters on different shards repeat each other. It also makes a reused number after a crash or a clock error a real bug, not a rare annoyance.',
    },
    {
      q: 'How big may an ID be: 64 bits, or is 128 fine?',
      why: 'Sixty-four bits fit a database `BIGINT` and every language’s integer, and keep indexes small; with 128 bits, [[universally unique identifiers|uuid]] (UUIDs) need no coordination at all. This one answer often decides between Snowflake-style IDs and UUIDs.',
    },
    {
      q: 'Do IDs need to sort by creation time, and how strictly?',
      why: 'Roughly sorted IDs let tables and feeds order by ID and keep inserts at the end of an index. Strictly increasing IDs across all machines need one sequencer or [[consensus|consensus]] on every ID, which is slower and less available; most products only need “within a few milliseconds”.',
    },
    {
      q: 'How many IDs are needed per second at peak, and by how many machines?',
      why: 'Assume about 20,000 a second at peak (ballpark), requested by thousands of app servers. That decides whether there are enough bits for machine numbers and whether generators run inside each app server or as a separate service.',
    },
    {
      q: 'May IDs reveal anything, such as when a record was made or how many exist?',
      why: 'Time-based IDs reveal creation time, and counters reveal volume: two order numbers a week apart tell a competitor your sales. If that matters, show users a separate random public ID, or encrypt the ID before it leaves your systems.',
    },
    {
      q: 'Will IDs be used in browsers and in other programming languages?',
      why: 'JavaScript numbers hold whole numbers exactly only up to 2⁵³, so 64-bit IDs must travel as strings in responses. It is a small decision that causes real bugs when it is missed.',
    },
  ],
  requirements: {
    functional: [
      'Return new IDs on request, one at a time or in batches of up to 1,000.',
      'Every ID is unique across all generators, data centers and time, including after crashes, restarts and clock corrections.',
      'IDs sort by creation time to within a few milliseconds (ballpark), so sorting by ID roughly sorts by time.',
      'Any ID can be decoded into its creation time, for debugging and time-range queries.',
    ],
    nonFunctional: [
      'Each ID fits in 64 bits, so it fits a `BIGINT` column and every language’s integer type.',
      'Throughput: about 20,000 IDs a second at peak today (ballpark), with room for ten times that.',
      'Latency: making an ID takes microseconds and never waits on another machine; a network call, when there is one, takes about a millisecond (ballpark).',
      'Highly available, around 99.99% (a ballpark target), because nothing in the product can be created without an ID.',
      'Uniqueness is never traded for availability: a generator that is unsure stops rather than risk a duplicate.',
    ],
    outOfScope: [
      'Human-friendly codes, such as short links or order numbers read out over the phone.',
      'Hiding creation time or volume; assume a separate public ID if the product needs one.',
      'Gap-free numbering, such as invoice numbers that accounting rules require to have no gaps.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'People using the product each day', value: '100 million (ballpark)' },
      { label: 'Requests per person per day', value: '100, about 1 in 11 creating a record that needs an ID' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'ID layout', value: '1 unused sign bit, 41 time bits, 5 data center bits, 5 worker bits, 12 sequence bits' },
      { label: 'Clock agreement between machines', value: 'within a few milliseconds, kept by time sync (ballpark)' },
      { label: 'In the calculator', value: 'each write is a record that needs one ID and reads need none; the storage line is the records themselves, which the generator never stores' },
    ],
    steps: [
      { label: 'New IDs per second', math: '10⁸ people × 100 = 10¹⁰ requests a day; 1 in 11 is a write ≈ 9 × 10⁸ IDs a day; ÷ 10⁵ seconds', result: '≈ 10,000 a second, 20,000 at peak' },
      { label: 'IDs one generator can make', math: '2¹² = 4,096 sequence values per millisecond × 1,000 ms', result: '≈ 4 million a second: one generator covers the peak 200 times over' },
      { label: 'How long the timestamp lasts', math: '2⁴¹ ≈ 2.2 × 10¹² ms ÷ (1,000 × 86,400 × 365) ms a year', result: '≈ 69 years after the custom epoch' },
      { label: 'Generators that can run at once', math: '2⁵ data centers × 2⁵ workers = 2¹⁰', result: '1,024 generators, 32 per data center' },
      { label: 'Space saved compared with 128-bit IDs', math: '9 × 10⁸ IDs a day × 365 × 5 years ≈ 1.6 × 10¹² IDs × 8 bytes saved', result: '≈ 13 TB less in every table or index that stores the ID' },
      { label: 'Calls to the ID service', math: '20,000 IDs a second ÷ 100 per call', result: '≈ 200 calls a second at peak: trivial' },
      { label: 'How far out of order IDs can be', math: 'two generators’ clocks differ by up to a few ms', result: 'IDs made within a few ms of each other may sort either way' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 100, readsPerWrite: 10, objectBytes: 1_000, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'GET /v1/ids?count=100  →  200 { ids: ["7259814532157440001", …] }',
      description:
        'Returns up to 1,000 new IDs in one call, so callers pay one round trip for many IDs. IDs travel as strings, because JavaScript numbers lose precision above 2⁵³.',
    },
    {
      signature: 'idClient.next()  →  int64',
      description:
        'The caller-side library. It hands out IDs from a local buffer and refills the buffer in the background when it drops below half, so a short blip in the ID service goes unnoticed.',
    },
    {
      signature: 'parse(id)  →  { timeMs, dataCenter, worker, sequence }',
      description:
        'Decodes an ID for debugging and time-range queries. Every ID made at or after time t is at least `(t − epoch) << 22`, so a range of IDs is a range of time.',
    },
    {
      signature: 'claimWorker(dataCenter)  →  { worker, leaseSeconds: 600 }',
      description:
        'Called by a generator at startup, against the coordination service: an atomic create-if-absent on the first free number from 0 to 31, held under a [[lease|lease]] that the generator renews every minute.',
    },
  ],
  dataModel: [
    {
      entity: 'ID (64 bits)',
      fields: ['sign: 1 bit, always 0', 'time: 41 bits, milliseconds since a custom epoch such as 2025-01-01', 'dataCenter: 5 bits (0 to 31)', 'worker: 5 bits (0 to 31)', 'sequence: 12 bits (0 to 4,095)'],
      store: 'Not stored by the generator: computed in memory and returned',
      why: 'Time in the top bits makes IDs sort by creation time, the machine bits keep generators from colliding without talking, and the sequence covers many IDs in one millisecond. A custom epoch spends the 41 time bits on the years ahead, not on the decades since 1970.',
    },
    {
      entity: 'Worker lease',
      fields: ['key: /id-workers/dc-1/worker-07', 'holder: host name and process', 'lease: 10 minutes, renewed every minute'],
      store: 'Coordination service such as etcd or ZooKeeper: three or five nodes, every write agreed by a majority',
      why: 'Two live generators with the same numbers would make identical IDs, so each number is claimed with a strongly consistent create-if-absent. A dead generator’s number frees itself when its lease runs out, and numbers are never handed back early, so a number is reused only minutes after its last ID.',
    },
    {
      entity: 'Generator state',
      fields: ['last_ms: the newest timestamp used', 'sequence: next value within last_ms', 'lease_valid_until: by the monotonic clock'],
      store: 'Memory only, inside each generator',
      why: 'Each new timestamp is compared with `last_ms` to catch a clock that went backwards. Nothing has to survive a restart, because a restarted generator always claims a number nobody has used for minutes.',
    },
    {
      entity: 'Records that use the IDs',
      fields: ['id: int64 primary key', 'owner_id', 'created_at: can be read from the id'],
      store: 'The product’s own databases, sharded by a hash of the ID or by owner',
      why: 'New IDs are always the largest so far, so they append at the end of a [[B-tree|b-tree]] index, which keeps inserts cheap. The same property makes [[range partitioning|range-partitioning]] by ID send every new write to the newest shard, so shard by a hash instead.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Give every new record a number that no other record has, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'A single [[ticket server|ticket-server]] is perfectly unique and perfectly ordered, and fine for modest volume. It fails on scale and availability: every ID is a round trip to one machine, and when that machine is down, nothing can be created anywhere.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 20,000 IDs a second at peak (ballpark), from thousands of callers, with no single counter in the path and no coordination per ID.',
      diagram: v2,
      explanation:
        'Each generator makes IDs alone from its clock, its numbers and a sequence, so adding generators adds capacity with no shared state. The only coordination is claiming a worker number at startup. The price is a dependency on clocks, which the next stage deals with.',
    },
    {
      title: 'v3: Clocks that move backwards',
      solves: 'Time sync, leap seconds and paused virtual machines can move a clock backwards, and a generator that reuses a millisecond can repeat an ID.',
      diagram: v3,
      explanation:
        'The generator remembers the last millisecond it used and never goes below it: it waits out small jumps and refuses large ones, failing loudly so a person fixes the clock. Restarts are safe because a restarted generator never reuses a recently held number.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead generator, a coordination outage or a whole region going dark must not stop the product from creating records, and must never cause a duplicate.',
      diagram: v4,
      explanation:
        'Data center bits make regions independent, so they never coordinate and can serve each other in an emergency. Leases long enough to ride out short outages, plus caller buffers, mean most failures cost capacity, not availability, and none of them can produce a duplicate.',
    },
  ],
  deepDives: [
    {
      title: 'Choosing the ID scheme',
      problem:
        'Each scheme makes IDs unique in a different way: one counter everyone asks, randomness so large that collisions never happen in practice, or a layout that gives each machine its own slice of numbers. They differ in size, ordering and what they depend on.',
      options: {
        caption: 'Five ways to make unique IDs',
        rows: [
          {
            option: 'Ticket server: one database counter',
            goodAt: 'Simple, compact and perfectly ordered; two servers handing out odd and even numbers remove the single point of failure.',
            badAt: 'A network round trip per ID and one machine’s throughput as the ceiling; with two servers, the order across them is only rough.',
            pickWhen: 'Modest volume, with a database you already run.',
          },
          {
            option: 'Blocks of numbers from a counter',
            goodAt: 'Compact and unique, with one counter call per block of thousands.',
            badAt: 'IDs from different servers interleave out of time order, and a crashed server wastes the rest of its block.',
            pickWhen: 'Order doesn’t matter and IDs should stay small, as in short links.',
          },
          {
            option: 'Random UUID, version 4',
            goodAt: 'No coordination or setup at all: any machine, or even a browser, can make one.',
            badAt: 'Twice the size of a `BIGINT`, and random order scatters inserts across indexes, which slows big tables.',
            pickWhen: 'IDs are made in many places, including clients, and order doesn’t matter.',
          },
          {
            option: 'UUID version 7',
            goodAt: 'Time-ordered like Snowflake with no machine numbers: 48 bits of milliseconds, then random bits.',
            badAt: 'Still 128 bits, and IDs made in the same millisecond on different machines sort in random order.',
            pickWhen: '128 bits are fine and you want to skip worker numbers.',
          },
          {
            option: 'Snowflake-style 64-bit ID',
            goodAt: 'Sixty-four bits, roughly time-ordered, and each generator makes millions a second alone.',
            badAt: 'Every generator needs a unique worker number, and correctness depends on clocks not moving backwards.',
            pickWhen: 'High volume, 64-bit IDs and time order: the usual answer here.',
          },
        ],
      },
      recommendation:
        'Use Snowflake-style IDs: 41 bits of time, 10 bits of worker number and 12 bits of sequence. They fit in 64 bits, sort by time to within the [[clock skew|clock-skew]] between generators, and need coordination only when a generator starts. If 128-bit IDs are acceptable and you would rather not run worker numbers at all, UUID version 7 is the simpler choice.',
    },
    {
      title: 'When the clock moves backwards',
      problem:
        'A Snowflake generator trusts its clock. Time sync can step a clock back, a [[leap second|leap-second]] can repeat one, and a virtual machine can resume with a stale clock; a generator that reuses a millisecond with the same worker number can repeat a sequence value, and so an ID.',
      options: {
        caption: 'Five defenses, best combined',
        rows: [
          {
            option: 'Wait until the clock passes the last time used',
            goodAt: 'Never repeats an ID, and a correction of a few milliseconds costs only a short pause.',
            badAt: 'A jump of seconds stalls every request for seconds.',
            pickWhen: 'Backward jumps of up to a few milliseconds.',
          },
          {
            option: 'Refuse, fail the health check and alert',
            goodAt: 'Fails loudly: the load balancer moves callers to healthy generators and a person looks at the clock.',
            badAt: 'Capacity drops while that generator is out, and if every clock jumps at once, nobody can make IDs.',
            pickWhen: 'Jumps too big to wait out, say over 10 ms (ballpark).',
          },
          {
            option: 'Keep counting from the last time used',
            goodAt: 'No pause: the generator keeps the old timestamp and borrows the next millisecond whenever the sequence runs out.',
            badAt: 'Its IDs run ahead of real time, and after a big jump their timestamps stay wrong for a long while.',
            pickWhen: 'Tiny jumps, as a short bridge only.',
          },
          {
            option: 'Use the monotonic clock after startup',
            goodAt: 'Read the wall clock once at startup, then add the elapsed time from the [[monotonic clock|monotonic-clock]], which never goes backwards.',
            badAt: 'It ignores the steps that correct the wall clock, so if the clock was wrong at startup, every ID carries that error until a restart.',
            pickWhen: 'As the main defense, together with a startup check of the clock.',
          },
          {
            option: 'Make time sync slew, and smear leap seconds',
            goodAt: 'Removes most backward jumps at the source: the clock runs slightly fast or slow until it is right, instead of being stepped.',
            badAt: 'A large error takes a long time to slew away, and some events, such as a paused virtual machine, are outside its control.',
            pickWhen: 'Always, on every generator.',
          },
        ],
      },
      recommendation:
        'Combine them. Run time sync in slew-only mode with smeared leap seconds, take timestamps from the monotonic clock after a startup check against the time servers, and keep the last millisecond used in memory. Wait out backward jumps of up to about 10 ms (ballpark) and refuse beyond that, failing the health check and paging someone.',
    },
    {
      title: 'Giving every generator a unique worker number',
      problem:
        'Uniqueness rests on worker numbers: two live generators with the same numbers can make identical IDs in the same millisecond, and nothing may notice until two records collide. Generators come and go with deploys, crashes and autoscaling, so numbers must be handed out and reclaimed safely.',
      options: {
        caption: 'Four ways to number the generators',
        rows: [
          {
            option: 'Static configuration per host',
            goodAt: 'No moving parts at runtime, and easy to reason about for a few fixed machines.',
            badAt: 'One copy-paste mistake gives two hosts the same number, and every replaced or added host needs someone to assign one.',
            pickWhen: 'A small, fixed set of generators.',
          },
          {
            option: 'Taken from the host’s network address',
            goodAt: 'Automatic: use the low 10 bits of the host’s [[Internet Protocol (IP) address|ip-address]].',
            badAt: 'Two hosts whose addresses share those bits collide, and addresses are reused when machines are replaced.',
            pickWhen: 'Only if the address plan guarantees those bits are unique.',
          },
          {
            option: 'Picked at random',
            goodAt: 'No coordination at all.',
            badAt: 'With 40 generators choosing among 1,024 numbers, the chance that two pick the same one is about 50%: the birthday paradox.',
            pickWhen: 'Never, for this.',
          },
          {
            option: 'Leased from a coordination service',
            goodAt: 'A strongly consistent create-if-absent gives each number to exactly one holder, and a dead holder’s number frees itself when its lease runs out.',
            badAt: 'One more system to run, and a generator that freezes past its lease could wake up using a number someone else now holds.',
            pickWhen: 'The default for any fleet that changes.',
          },
        ],
      },
      recommendation:
        'Lease numbers from etcd or ZooKeeper for about 10 minutes (ballpark), renew every minute, and never hand a number back early, so a number is reused only minutes after its last ID. Before each batch, a generator checks on its own monotonic clock that its lease is still valid with a margin to spare, and stops if not. Long leases also mean a short coordination outage changes nothing.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 200,000 IDs a second at peak (ballpark).',
      impact: 'Still far below what one generator can make; what grows is the number of calls to the service and the network traffic between callers and generators.',
      mitigation: 'Bigger batches and caller-side buffers, and a few more generators, which cost only worker numbers.',
    },
    {
      scenario: '100× bursts: one generator asked for more than 4,096 IDs in one millisecond.',
      impact: 'Its sequence runs out, and it must wait for the next millisecond, adding up to 1 ms to that call.',
      mitigation: 'Spread calls across generators; if the fleet stays small, move bits from the worker number to the sequence, such as 8 worker bits and 14 sequence bits.',
    },
    {
      scenario: 'A clock jumps backwards.',
      impact: 'A few milliseconds: that generator pauses briefly. Seconds: it refuses to make IDs, and capacity drops by one generator.',
      mitigation: 'Slew-only time sync, timestamps from the monotonic clock, health checks that route around a refusing generator, and an alert on clock offset.',
    },
    {
      scenario: 'Two generators end up with the same worker number.',
      impact: 'Silent duplicates whenever both use the same millisecond and sequence, which break primary keys or, worse, merge two records into one.',
      mitigation: 'Lease numbers from a strongly consistent store, check the lease before every batch, and keep unique constraints in the databases as a last line of defense.',
    },
    {
      scenario: 'The coordination service is down.',
      impact: 'Running generators carry on until their leases run out, about 10 minutes; new generators can’t start, so deploys and autoscaling stall.',
      mitigation: 'Run it on three or five nodes across zones, alert the moment renewals fail, and pause deploys until it is back.',
    },
    {
      scenario: 'A whole region’s ID service is unreachable.',
      impact: 'Once caller buffers run dry, within seconds, every write in that region that needs an ID fails.',
      mitigation: 'Fall back to another region’s ID service; its different data center number keeps IDs unique, at the cost of a cross-region round trip.',
    },
    {
      scenario: 'The 41-bit timestamp runs out, 69 years after the epoch.',
      impact: 'IDs would wrap around: no longer sorted by time, and at risk of repeating old ones.',
      mitigation: 'Choose a recent custom epoch when you start, and plan any format change decades ahead.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Explains why one database counter becomes a bottleneck and a single point of failure, and names alternatives such as UUIDs.',
        'Describes the Snowflake layout: time, machine number and sequence, packed into 64 bits.',
        'Notices that IDs from different machines only roughly sort by time.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Does the arithmetic: 4,096 IDs per millisecond per generator, 1,024 generators and about 69 years of timestamps.',
        'Handles clocks moving backwards with a concrete rule: wait out small jumps, refuse large ones.',
        'Explains how each generator gets a unique worker number, and what goes wrong if two share one.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Treats worker numbers as the real correctness problem: lease length, never reusing a number early, and generators that freeze past their lease.',
        'Raises downstream effects unprompted: hot newest shards under range sharding, IDs that leak creation time and volume, and JavaScript precision.',
        'Plans for operations: clock-offset alerts, sequence overflow, running out of worker numbers, and caller buffers that ride out short outages.',
      ],
    },
  ],
  followUps: [
    {
      q: 'One server’s clock just jumped back two seconds. What happens to its IDs?',
      a: 'Its generator compares the clock with the last millisecond it used and sees time going backwards. Two seconds is far more than it waits out, so it refuses to make IDs and fails its health check; callers move to other generators, and an alert asks someone to fix the time source. No duplicate is ever issued, and we lose one generator’s capacity for a while.',
    },
    {
      q: 'Why not just use UUIDs and skip all of this?',
      a: 'If 128-bit IDs are fine, I would consider it: random UUIDs need no coordination at all, and version 7 adds time order. The cost is size, twice the bytes in every table, index and foreign key, and for version 4, inserts scattered across the index. With 64 bits required and nearly a billion new records a day, Snowflake-style IDs earn their extra parts.',
    },
    {
      q: 'You have 5,000 app servers. Should each one generate its own IDs?',
      a: 'Not with 10 machine bits: 5,000 generators need 13 bits, taken from the time or the sequence, and every server’s clock becomes a uniqueness risk. I would run a small ID service and have app servers fetch batches of 100 into a local buffer, which keeps the network call off almost every request. With a small fleet, a library inside each server avoids the call entirely.',
    },
    {
      q: 'Your IDs grow with time. Is that a problem for the database?',
      a: 'For a B-tree index it helps, since new rows append at the end. For range sharding by ID it hurts: every new write lands on the newest shard, a [[hot spot|hot-spot]]. So I shard by a hash of the ID, or by owner, and keep the time order for indexes within each shard.',
    },
    {
      q: 'Can a competitor learn anything from your IDs?',
      a: 'Yes: every ID contains its creation time, and by collecting IDs over weeks they can estimate how fast we create records. If that matters, I keep Snowflake IDs internal and show users a random public ID, or encrypt the ID with a secret key before it leaves our systems.',
    },
    {
      q: 'A generator’s virtual machine froze for 15 minutes, and its lease expired meanwhile. What now?',
      a: 'When it wakes, it must not issue anything before checking. It compares its monotonic clock with its last successful renewal, sees the lease is gone, and stops until it claims a new number, because another generator may hold its old one by now. That is why the lease check runs before every batch, not just on a timer.',
    },
    {
      q: 'A front-end developer says some IDs come out wrong in the browser. What happened?',
      a: 'JavaScript numbers hold whole numbers exactly only up to 2⁵³, and our IDs use up to 63 bits, so large IDs are silently rounded when parsed as numbers. Responses should carry IDs as strings, and the front end should treat them as opaque text.',
    },
  ],
  rubric: [
    { item: 'Asked about size, ordering and throughput, then estimated IDs per second and checked the bit budget', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Compared a central counter, UUIDs and Snowflake-style IDs, and chose one with reasons', weight: 20, lessonId: 'unique-ids' },
    { item: 'Laid out the 64 bits and did the arithmetic for time span, machine count and sequence', weight: 10, lessonId: 'unique-ids' },
    { item: 'Handled clocks that move backwards, and explained why IDs from different machines only roughly sort by time', weight: 20, lessonId: 'time-and-ordering' },
    { item: 'Gave each generator a unique worker number with leases, and said what happens if two share one', weight: 20, lessonId: 'consensus-leader-election' },
    { item: 'Explained what callers see when a generator, the coordination service or a region fails', weight: 10, lessonId: 'distributed-locks' },
    { item: 'Raised downstream effects: hot newest shards, leaked creation times and precision limits in JavaScript', weight: 10, lessonId: 'sharding' },
  ],
};

export default problem;
