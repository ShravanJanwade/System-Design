import type { DiagramSpec, Problem } from '../types';

/** v1: a job API, one scheduler process polling the database, a queue and a pool of workers. */
const v1: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'teams', type: 'client', label: 'Teams', sublabel: 'create jobs', x: 0, y: 0 },
    { id: 'api', type: 'service', label: 'Job API', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Jobs database', sublabel: 'jobs and runs', x: 2, y: 0 },
    { id: 'workers', type: 'worker', label: 'Workers', x: 3, y: 0 },
    { id: 'scheduler', type: 'service', label: 'Scheduler', sublabel: 'one process', x: 2, y: 1 },
    { id: 'queue', type: 'queue', label: 'Run queue', x: 3, y: 1 },
  ],
  edges: [
    { id: 'teams-api', from: 'teams', to: 'api', kind: 'sync' },
    { id: 'api-db', from: 'api', to: 'db', kind: 'sync' },
    { id: 'scheduler-db', from: 'scheduler', to: 'db', kind: 'sync' },
    { id: 'scheduler-queue', from: 'scheduler', to: 'queue', kind: 'async' },
    { id: 'workers-queue', from: 'workers', to: 'queue', kind: 'sync' },
    { id: 'workers-db', from: 'workers', to: 'db', kind: 'sync', label: 'results' },
  ],
  steps: [
    {
      caption:
        'A team registers a job: run `nightly-report` every day at 2:00, Berlin time. The **job API** checks the schedule, works out the next run time in UTC, and saves both in the **jobs database**.',
      flow: ['teams-api', 'api-db', '<api-db', '<teams-api'],
      notes: [{ target: 'teams', text: 'every day, 2:00' }],
    },
    {
      caption:
        'Every second the **scheduler** asks the database for jobs whose next run time has passed. For each one, a single transaction inserts a run row keyed by the job and its scheduled time, and moves the job’s next run time forward a day.',
      flow: ['scheduler-db', '<scheduler-db'],
    },
    {
      caption:
        'The scheduler puts the run on the **run queue**. A **worker** takes it, runs it within its time limit, and writes the result back to the database.',
      flow: ['scheduler-queue', '<workers-queue', 'workers-db'],
    },
    {
      caption:
        'One scheduler process is a [[single point of failure|single-point-of-failure]]. If it dies at 1:59, the 2:00 report never runs, and nobody notices until someone asks where it is.',
      fail: ['scheduler'],
    },
  ],
};

/** v2: two schedulers, one leader holding a lease; the term fences the database; an outbox relay feeds the queue. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'schedA', type: 'service', label: 'Scheduler A', sublabel: 'leader, term 7', x: 1, y: 0 },
    { id: 'coord', type: 'nosqlDb', label: 'Coordination', sublabel: 'etcd: leader lease', x: 0, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Jobs database', sublabel: 'runs and outbox', x: 2, y: 1 },
    { id: 'queue', type: 'queue', label: 'Run queue', x: 3, y: 1 },
    { id: 'schedB', type: 'service', label: 'Scheduler B', sublabel: 'standby', x: 1, y: 2 },
    { id: 'workers', type: 'worker', label: 'Workers', x: 3, y: 2 },
  ],
  edges: [
    { id: 'schedA-coord', from: 'schedA', to: 'coord', kind: 'sync' },
    { id: 'schedB-coord', from: 'schedB', to: 'coord', kind: 'sync' },
    { id: 'schedA-db', from: 'schedA', to: 'db', kind: 'sync' },
    { id: 'schedB-db', from: 'schedB', to: 'db', kind: 'sync' },
    { id: 'db-queue', from: 'db', to: 'queue', kind: 'async', label: 'relay' },
    { id: 'workers-queue', from: 'workers', to: 'queue', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Two schedulers run, but only the leader fires jobs. Both ask the **coordination** service for the leader lease; **scheduler A** holds it with term number 7 and renews it every few seconds, while **scheduler B** stands by and [[watches|watch]] it.',
      flow: [['schedA-coord', 'schedB-coord'], '<schedA-coord'],
      notes: [{ target: 'coord', text: 'A leads, term 7' }],
    },
    {
      caption:
        'Leader A finds due jobs and, in one transaction per batch, inserts each run, moves the job’s next run time forward and adds an outbox row. The transaction commits only if term 7 is still the newest, and a relay copies outbox rows to the **run queue**, so a run is queued if and only if it was recorded.',
      flow: ['schedA-db', '<schedA-db', 'db-queue', '<workers-queue'],
    },
    {
      caption:
        'Scheduler A crashes. Its lease expires within about 10 seconds (ballpark), B wins term 8 and fires the jobs that came due in the gap. Runs are keyed by job and scheduled time, so a run A already recorded is never created twice.',
      fail: ['schedA'],
      add: ['schedB-db'],
      flow: ['schedB-coord', '<schedB-coord', 'schedB-db', '<schedB-db', 'db-queue'],
      notes: [{ target: 'coord', text: 'B leads, term 8' }],
    },
    {
      caption:
        'If A was only paused, it wakes up still thinking it leads. Its next transaction carries term 7, but the database now holds 8, so the write is rejected, and A steps down. Without that check, both schedulers would fire the same jobs during the overlap.',
      flow: [{ edge: 'schedA-db', tag: 'rejected', tone: 'alert' }],
    },
  ],
};

/** v3: jobs split into 1,024 shards; each scheduler node leases some, prefetches the next minute and fires from memory. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'sched1', type: 'service', label: 'Scheduler 1', sublabel: 'shards 0–511', x: 1, y: 0 },
    { id: 'coord', type: 'nosqlDb', label: 'Coordination', sublabel: 'shard leases', x: 0, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Jobs database', sublabel: 'sharded by job', x: 1, y: 1 },
    { id: 'queue', type: 'queue', label: 'Run queues', sublabel: 'by pool, priority', x: 2, y: 1 },
    { id: 'workers', type: 'worker', label: 'Workers', sublabel: 'autoscaled', x: 3, y: 1 },
    { id: 'sched2', type: 'service', label: 'Scheduler 2', sublabel: 'shards 512–1,023', x: 1, y: 2 },
  ],
  edges: [
    { id: 'sched1-coord', from: 'sched1', to: 'coord', kind: 'sync' },
    { id: 'sched2-coord', from: 'sched2', to: 'coord', kind: 'sync' },
    { id: 'sched1-db', from: 'sched1', to: 'db', kind: 'sync' },
    { id: 'sched2-db', from: 'sched2', to: 'db', kind: 'sync' },
    { id: 'sched1-queue', from: 'sched1', to: 'queue', kind: 'async' },
    { id: 'sched2-queue', from: 'sched2', to: 'queue', kind: 'async' },
    { id: 'workers-queue', from: 'workers', to: 'queue', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Jobs are split into 1,024 logical shards by a hash of the job ID. Each scheduler node holds leases on some shards, each with its own term, so a node that joins or leaves moves only the shards it held.',
      flow: [['sched1-coord', 'sched2-coord'], ['<sched1-coord', '<sched2-coord']],
    },
    {
      caption:
        'Every few seconds each node reads its shards’ jobs that fall due in the next minute, records their runs and advances their schedules in batches, then holds the runs in an in-memory timer, a min-heap ordered by time.',
      flow: [['sched1-db', 'sched2-db'], ['<sched1-db', '<sched2-db']],
    },
    {
      caption:
        'At each run’s time, its node puts it on the **run queues**, split by worker pool and priority. **Workers** pull from their pool’s queue, and each pool grows when its [[queue depth|queue-depth]] rises.',
      flow: [['sched1-queue', 'sched2-queue'], '<workers-queue'],
      notes: [{ target: 'workers', text: 'grows with backlog' }],
    },
    {
      caption:
        'At midnight UTC about a million daily jobs fall due in the same minute (ballpark). Jobs that don’t need an exact minute were spread across the hour when they were created; the rest arrive as a burst, which the queues absorb and the workers drain over a few minutes.',
      flow: [['sched1-queue', 'sched2-queue'], '<workers-queue'],
      notes: [{ target: 'workers', text: 'draining a burst' }],
    },
  ],
};

/** v4: a worker freezes, its lease expires, a second attempt runs; idempotency keys and attempt numbers make the repeat harmless. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'workerA', type: 'worker', label: 'Worker A', sublabel: 'attempt 1', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'Run queue', sublabel: 'leases runs', x: 0, y: 1 },
    { id: 'runs', type: 'sqlDb', label: 'Runs table', sublabel: 'checks attempt', x: 1, y: 1 },
    { id: 'billing', type: 'external', label: 'Billing service', sublabel: 'idempotency keys', x: 2, y: 1 },
    { id: 'workerB', type: 'worker', label: 'Worker B', sublabel: 'attempt 2', x: 1, y: 2 },
  ],
  edges: [
    { id: 'workerA-queue', from: 'workerA', to: 'queue', kind: 'sync' },
    { id: 'workerB-queue', from: 'workerB', to: 'queue', kind: 'sync' },
    { id: 'workerA-runs', from: 'workerA', to: 'runs', kind: 'sync' },
    { id: 'workerB-runs', from: 'workerB', to: 'runs', kind: 'sync' },
    { id: 'workerA-billing', from: 'workerA', to: 'billing', kind: 'sync' },
    { id: 'workerB-billing', from: 'workerB', to: 'billing', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '**Worker A** takes run 881, this month’s invoice for customer 42, from the **run queue** with a 60-second lease as attempt 1, and records the start in the **runs table**. While it works, it renews the lease with a heartbeat every 10 seconds (ballpark).',
      flow: ['workerA-queue', '<workerA-queue', 'workerA-runs'],
    },
    {
      caption:
        'A freezes in a long [[pause|process-pause]] before it finishes. Its heartbeats stop, the lease runs out, and the queue hands run 881 to **worker B** as attempt 2.',
      flow: ['workerB-queue', '<workerB-queue', 'workerB-runs'],
    },
    {
      caption:
        'B calls the **billing service** with the idempotency key `run-881`, so the customer is charged once, and records success under attempt 2.',
      flow: ['workerB-billing', '<workerB-billing', 'workerB-runs'],
      notes: [{ target: 'billing', text: 'charged once' }],
    },
    {
      caption:
        'A wakes up and finishes too. Billing has seen `run-881` before and returns the first result instead of charging again, and the runs table rejects A’s report because attempt 1 is older than the attempt on record. Running at least once, with idempotent effects, gives the result of running exactly once.',
      flow: ['workerA-billing', '<workerA-billing', { edge: 'workerA-runs', tag: 'rejected', tone: 'alert' }],
      notes: [{ target: 'billing', text: 'same result' }],
    },
  ],
};

const problem: Problem = {
  id: 'job-scheduler',
  title: 'Distributed job scheduler',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a distributed job scheduler: a cron for a whole company. Teams submit jobs that run once at a set time or on a repeating schedule, such as every night at 2:00, and the system runs each one on a fleet of workers even when machines fail.',
  concepts: [
    'back-of-the-envelope',
    'consensus-leader-election',
    'distributed-locks',
    'idempotency',
    'queues-and-streams',
    'timeouts-retries-backoff',
    'sharding',
    'time-and-ordering',
  ],
  hints: [
    'Start with one scheduler process that wakes every second and looks for jobs whose time has come. What happens to tonight’s 2:00 jobs if that process dies at 1:59, and what happens if two copies of it run at once?',
    'Machines fail at the worst moments: after a job ran but before anyone recorded it, or halfway through. Decide which you would rather risk, a missed run or a repeated one, and then think about how to make the repeated one harmless.',
    'One shape that works: jobs live in a sharded database with an index on their next run time; scheduler nodes win [[leases|lease]] on shards through [[leader election|leader-election]], record each run and advance its schedule in one transaction, and queue the run. Workers take runs with a lease, renew it with [[heartbeats|heartbeat]] and retry on failure, so each run happens [[at least once|at-least-once]], and every job is [[idempotent|idempotent]], keyed by its run identifier (ID).',
  ],
  clarifyingQuestions: [
    {
      q: 'How many jobs are there, how often do they run, and how precise must start times be?',
      why: 'Assume 10 million jobs and about 100 million runs a day (ballpark): about 1,000 runs a second on average. Starting within a few seconds lets you batch and prefetch; millisecond precision would need a very different and much costlier design.',
    },
    {
      q: 'If the system is unsure whether a run happened, should it run the job again or skip it?',
      why: 'That is the choice between at-least-once and [[at-most-once|at-most-once]] execution. Most jobs, such as reports and cleanups, should run again, which is safe only if running twice does no harm, so the answer shapes the contract every job must follow.',
    },
    {
      q: 'What happens to runs missed during an outage, and to a run still going when its next one is due?',
      why: 'These are product policies, not accidents of the implementation. Settings on each job for missed runs (catch up, run once, skip) and for overlapping runs (allow, skip, replace) decide what the scheduler does after every failure.',
    },
    {
      q: 'Are schedules written in local time zones?',
      why: 'A job set for 2:00 in Berlin moves relative to Coordinated Universal Time (UTC) twice a year, and on the nights clocks change, a local time may not exist or may happen twice. Storing each schedule with its time zone and computing every next run in UTC keeps that explicit.',
    },
    {
      q: 'Does the platform run the job code, or does it trigger the teams’ own services?',
      why: 'Running code means isolation, resource limits and a time limit for every job. Calling a team’s endpoint or posting to its queue keeps the platform small, but its guarantees end at that hand-off.',
    },
    {
      q: 'Do jobs depend on each other, and do teams need a history of runs?',
      why: 'Dependencies turn a scheduler into a workflow engine, a bigger problem, so assume independent jobs. A history of every run, with times, attempts and errors, is how teams debug, and at about 100 GB a day (ballpark) it needs a retention plan.',
    },
  ],
  requirements: {
    functional: [
      'Through an application programming interface (API), create, update, pause and delete jobs that run once at a set time or repeatedly on a cron-style schedule in a chosen time zone.',
      'Run each due job on a worker with a time limit, retrying failures with [[exponential backoff|exponential-backoff]] up to a set number of attempts.',
      'Show each job’s runs: when each was due, when it started and finished, its attempts, status and errors.',
      'Tell a job’s owner when a run fails for good, or when a job is running late.',
    ],
    nonFunctional: [
      'On time: runs start within about 5 seconds of their scheduled time (ballpark), outside known bursts such as midnight.',
      'No lost runs: every due run happens at least once, even when schedulers, workers or the database fail.',
      'No doubled effects: a run may execute twice, but jobs are built so the second execution changes nothing.',
      'Highly available scheduling, around 99.99% (a ballpark target): a scheduler failure delays runs by seconds, not minutes.',
      'Scale: about 10 million jobs and 100 million runs a day, with bursts of a million runs in one minute (ballpark).',
    ],
    outOfScope: [
      'Workflows in which one job waits for others to finish.',
      'Building and deploying the job code: assume each job names a handler the workers already have.',
      'Charging teams for the computing time their jobs use.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Jobs defined', value: '10 million (ballpark), recurring and one-off' },
      { label: 'Runs per job per day', value: 'about 10 on average: a few run every few minutes, most daily' },
      { label: 'Bytes per run record', value: 'about 1 KB: status, times, attempt, worker and a short error' },
      { label: 'Average run length', value: 'about 30 seconds (ballpark)' },
      { label: 'Busiest minute', value: 'midnight UTC, when about 1 million daily jobs fall due (ballpark)' },
      {
        label: 'In the calculator',
        value: 'each job is a user and each run one 1 KB write, read about twice (by a worker and by the status page), so 30 actions a job; peak factor 3 for the busiest hour',
      },
    ],
    steps: [
      { label: 'Runs per second', math: '10⁷ jobs × 10 = 10⁸ runs a day; 10⁸ ÷ 10⁵ seconds', result: '≈ 1,000 a second on average' },
      { label: 'Midnight burst', math: '10⁶ runs ÷ 60 seconds', result: '≈ 17,000 a second for that minute, over 15× the average, if nothing is spread' },
      { label: 'Runs in progress', math: '1,000 a second × 30 seconds', result: '≈ 30,000 at once on average' },
      { label: 'Workers', math: '30,000 runs ÷ 20 slots per worker (ballpark)', result: '≈ 1,500 workers, more around midnight' },
      { label: 'Run history', math: '10⁸ × 1 KB = 100 GB a day; × 30 days', result: '≈ 3 TB kept in the database; older runs move to object storage' },
      { label: 'Lease renewals', math: '30,000 running ÷ one heartbeat every 10 seconds', result: '≈ 3,000 a second: light' },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 30, readsPerWrite: 2, objectBytes: 1_000, peakFactor: 3, retentionYears: 1 },
  },
  api: [
    {
      signature:
        'POST /v1/jobs  { name, schedule: "0 2 * * *" | runAt, timeZone, handler, payload, timeoutSec, maxAttempts, misfire, overlap }  →  201 { jobId, nextRunAt }',
      description:
        'Registers a recurring job in cron syntax, read in its time zone, or a one-off job with `runAt`. The response shows the first run time so the team can check the schedule, and an [[idempotency key|idempotency-key]] header makes a retried create return the same job.',
    },
    {
      signature: 'GET /v1/jobs/{jobId}/runs?limit=20  →  200 { runs: [{ runId, scheduledFor, attempt, status, startedAt, finishedAt, error? }] }',
      description: 'The run history page. Recent runs come from the database, older ones from the archive in object storage.',
    },
    {
      signature: 'POST /v1/jobs/{jobId}/pause  |  /resume  |  /trigger  →  204',
      description: 'Pausing stops new runs but lets a running one finish; triggering creates an extra run now, with its own run ID.',
    },
    {
      signature: 'claim(pool)  →  { runId, attempt, leaseUntil, handler, payload, scheduledFor }',
      description: 'How a worker takes the next run from its pool’s queue. The run stays leased to that worker until `leaseUntil`; after that, the queue hands it to another worker as the next attempt.',
    },
    {
      signature: 'heartbeat(runId, attempt)  →  { leaseUntil }   complete(runId, attempt, status, output)  →  200 | 409',
      description:
        'A worker renews its lease while it runs and reports the result at the end. `409 Conflict` means a newer attempt has taken over, so this worker must stop and discard its result.',
    },
  ],
  dataModel: [
    {
      entity: 'Job',
      fields: ['job_id (primary key)', 'shard: hash(job_id) mod 1,024', 'owner_team', 'schedule or run_at, time_zone', 'next_run_at', 'handler, payload', 'timeout, max_attempts, misfire, overlap', 'paused'],
      store: 'Relational database such as PostgreSQL, split by shard across several machines, with an index on (shard, next_run_at)',
      why: 'Recording a run and advancing the schedule must happen in one transaction, which a relational database gives you. The index turns “jobs in my shards due in the next minute” into one short range scan, and 1,024 [[logical shards|logical-shard]] can move between machines as load grows.',
    },
    {
      entity: 'Run',
      fields: ['run_id', 'job_id, scheduled_for (unique together)', 'status: scheduled | queued | running | succeeded | failed | dead', 'attempt', 'worker_id, lease_until', 'started_at, finished_at, error'],
      store: 'The same database and shard as its job; runs older than 30 days move to object storage',
      why: 'The unique key makes creating a run idempotent: a second scheduler that tries to create the same run simply fails. Results are written with a conditional update on `attempt`, so a stale worker can’t overwrite a newer attempt.',
    },
    {
      entity: 'Outbox',
      fields: ['outbox_id', 'run_id', 'created_at', 'sent'],
      store: 'The same database, written in the same transaction as the run',
      why: 'A run is put on the queue by a relay that reads this table, the [[transactional outbox|transactional-outbox]] pattern. Without it, a crash between “record the run” and “queue the run” could lose a run or queue one that was never recorded.',
    },
    {
      entity: 'Lease',
      fields: ['shard_id (or "leader")', 'owner', 'term', 'expires_at'],
      store: 'A [[coordination service|coordination-service]] such as etcd or ZooKeeper',
      why: 'Leases must be strongly consistent, expire on their own and notify standbys when they change. The term grows with every new owner and is written into the database with each batch, so it works as a [[fencing token|fencing-token]] against a stale owner.',
    },
    {
      entity: 'Queued run',
      fields: ['run_id', 'attempt', 'pool', 'priority', 'scheduled_for'],
      store: 'A message queue with leases on messages and dead-letter queues, such as RabbitMQ or Amazon’s simple queue service',
      why: 'Workers need each run handed to one of them at a time, taken back if its lease expires, and set aside after too many failures. A log-style stream fits poorly, because one slow run would hold up the runs behind it in its partition.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Run each job at its time on some worker, and keep a record of every run.',
      diagram: v1,
      explanation:
        'A database, one polling scheduler and a queue already give durable jobs and a history. Recording the run and advancing the schedule in one transaction means a crash can delay a run but never skip one. The weak point is the scheduler: one process, so one failure stops every job.',
    },
    {
      title: 'v2: It survives a scheduler failure',
      solves: 'A crashed or frozen scheduler must neither stop all jobs nor, by coming back, fire them twice.',
      diagram: v2,
      explanation:
        'The lease picks one leader and replaces it within seconds, and the term checked by the database stops a paused leader from acting on old beliefs. The outbox makes recording and queuing a run a single step. Together, a leader change delays runs by about one lease length and never loses or doubles one.',
    },
    {
      title: 'v3: It scales',
      solves: 'About 100 million runs a day, bursts of a million in one minute, and timing within seconds (ballpark): more than one leader polling one database can handle.',
      diagram: v3,
      explanation:
        'Sharding turns one leader into many, each with its own lease and term, so the database and the timers split evenly and a failure delays only one node’s shards. Prefetching the next minute keeps timing precise without querying every second. Spreading flexible jobs across the hour turns midnight’s cliff into a slope.',
    },
    {
      title: 'v4: Runs that are safe to repeat',
      solves: 'A worker that crashed after charging a customer, or froze and came back, must not cause a second charge.',
      diagram: v4,
      explanation:
        'Leases and retries guarantee each run happens at least once; idempotency keys and attempt numbers make every extra execution a no-op. This is the contract each job signs: it may run more than once, and its effects must not show it.',
    },
  ],
  deepDives: [
    {
      title: 'Electing the scheduler that fires jobs',
      problem:
        'Exactly one process must decide that a job’s time has come, or runs are missed (none decides) or doubled (two decide). Processes crash, pause and lose the network, and a leader that froze for 20 seconds may wake up still believing it leads.',
      options: {
        caption: 'Ways to make one scheduler fire each job',
        rows: [
          {
            option: 'One scheduler, restarted by a supervisor',
            goodAt: 'Simplest: no election at all.',
            badAt: 'Nothing fires while it restarts, and if its machine dies, nothing fires until it is started somewhere else.',
            pickWhen: 'Internal tools where a few minutes of delay are acceptable.',
          },
          {
            option: 'Leader lease in a coordination service',
            goodAt:
              'Services such as etcd reach [[consensus|consensus]] with [[Raft|raft]] to grant one lease at a time, with a term number that only grows, and standbys are told the moment it lapses.',
            badAt: 'One more strongly consistent system to run, and a lease alone can’t stop a paused leader from writing late.',
            pickWhen: 'The default, combined with a fence where the writes land.',
          },
          {
            option: 'Lease row in the jobs database',
            goodAt: 'No new system: a conditional update takes the lease if it has expired, judged by the database’s own clock, so the schedulers’ clocks don’t matter.',
            badAt: 'Failover depends on the database being up, and checking the row adds load.',
            pickWhen: 'Small deployments that already have a highly available database.',
          },
          {
            option: 'Leases per shard, no single leader',
            goodAt: 'Scheduling spreads across many nodes, and a failure delays only the shards that node held.',
            badAt: 'Many leases to manage, and shards move whenever nodes come or go.',
            pickWhen: 'One leader can no longer keep up, as in v3.',
          },
        ],
      },
      recommendation:
        'Hold leases in a coordination service, start with one leader, and move to a lease per shard when one node can’t keep up. Either way, check the term where the writes land: a batch of runs commits only if the writer’s term is still current, which prevents [[split brain|split-brain]] even when two processes both think they lead. Keep leases short, about 10 seconds (ballpark), since a takeover delays runs by roughly one lease.',
    },
    {
      title: 'Finding due jobs on time',
      problem:
        'At any moment only a few thousand of 10 million jobs are due (ballpark). Scanning every job each second is hopeless, and a midnight burst puts a million runs into the same minute.',
      options: {
        caption: 'Ways to notice that a job is due',
        rows: [
          {
            option: 'Poll an index on next run time',
            goodAt: 'Simple and durable: each pass reads the range of jobs due by now from an [[index|index]] on next run time.',
            badAt: 'A query every second for every shard, and timing is only as fine as the polling interval.',
            pickWhen: 'Small and medium deployments, and as the durable backbone of everything else.',
          },
          {
            option: 'Prefetch into an in-memory timer',
            goodAt: 'Every few seconds, load the next minute’s jobs into a min-heap ordered by time, then fire each one to the second without asking the database again.',
            badAt: 'Prefetched runs must be recorded as they are loaded, or a crash loses them, and jobs created inside the window need a fast path.',
            pickWhen: 'High volume with timing within about a second.',
          },
          {
            option: 'Time buckets',
            goodAt: 'One list per minute: a new one-off job is appended to its minute’s list, and the scheduler reads exactly one list each minute.',
            badAt: 'Coarse unless buckets are small, and a busy minute’s bucket becomes a [[hot spot|hot-spot]].',
            pickWhen: 'Huge numbers of one-off delayed jobs, such as reminders.',
          },
          {
            option: 'Delayed delivery in the queue itself',
            goodAt: 'No scheduler needed for short delays: the queue hides a message until its time.',
            badAt: 'Delays are capped, at 15 minutes in Amazon’s simple queue service, and nobody can see what is scheduled.',
            pickWhen: 'Retries and delays of seconds to minutes.',
          },
        ],
      },
      recommendation:
        'Keep the index on (shard, next run time) as the durable truth, and on top of it let each node prefetch the next minute into a min-heap, recording each run as it loads it so a crash loses nothing. Spread jobs that don’t need an exact minute by hashing the job ID into an offset within their hour, which flattens the midnight spike. Use delays in the queue only for retries.',
    },
    {
      title: 'At least once, and jobs that tolerate it',
      problem:
        'A worker can crash after doing the work but before reporting it, or freeze and come back after its run went to someone else. The scheduler can never be sure whether a run happened, so it must choose between maybe running it twice and maybe not running it at all.',
      options: {
        caption: 'What a run is promised',
        rows: [
          {
            option: 'At most once',
            goodAt: 'A run is marked done before it starts, so it never runs twice.',
            badAt: 'A crash partway through loses that run without a trace.',
            pickWhen: 'A skipped run is harmless and a repeated one is not, as with some notifications.',
          },
          {
            option: 'At least once, with leases and retries',
            goodAt: 'A run is marked done only after it finishes; if its lease runs out first, it is retried, so no run is lost.',
            badAt: 'Runs can execute twice, and doubled [[side effects|side-effect]], such as charges or emails, are real.',
            pickWhen: 'The base for every job.',
          },
          {
            option: 'One transaction across the job and its effects',
            goodAt: 'In theory, the effect and the “done” mark commit together.',
            badAt: 'Every downstream system must join a [[two-phase commit|two-phase-commit]], which slows everything and stalls when any part fails.',
            pickWhen: 'Almost never: only when every effect lives in one database.',
          },
          {
            option: 'At least once, plus idempotent jobs',
            goodAt: 'Duplicates still happen, but a second execution changes nothing, so the outcome is as if each run happened once.',
            badAt: 'Every job must be written with care, and every downstream service must honor idempotency keys.',
            pickWhen: 'Jobs with effects outside the scheduler: nearly all of them.',
          },
        ],
      },
      recommendation:
        'Deliver at least once and make jobs idempotent. Give every run an ID made from its job and scheduled time, pass it to the job, and have the job use it as the idempotency key for every side effect; record results with a conditional write on the attempt number, so a stale worker can’t overwrite a newer attempt. Retry with backoff and [[jitter|jitter]], and after the last attempt move the run to a [[dead-letter queue|dead-letter-queue]] and tell its owner.',
    },
    {
      title: 'Missed runs, overlapping runs and bursts',
      problem:
        'After an outage some runs are late or never fired, a slow run may still be going when its next one is due, and thousands of teams pick midnight. None of these has a single right answer, so each job must be able to say what it wants.',
      options: {
        caption: 'Policies a job can choose',
        rows: [
          {
            option: 'Catch up every missed run',
            goodAt: 'Each run handles its own time window, so no window is skipped.',
            badAt: 'After a long outage, a flood of runs arrives at once.',
            pickWhen: 'Jobs that each process one hour or one day of data.',
          },
          {
            option: 'Run once, then resume the schedule',
            goodAt: 'One run brings things up to date without a flood.',
            badAt: 'Work tied to each missed occurrence is lost.',
            pickWhen: 'Jobs that process everything since their last run: the usual default.',
          },
          {
            option: 'Skip missed runs',
            goodAt: 'No surprise load after an outage.',
            badAt: 'The work quietly doesn’t happen, so owners must be told.',
            pickWhen: 'Results that are worthless late, such as a 9:00 reminder sent at noon.',
          },
          {
            option: 'Forbid overlap: skip or replace a run while the last one is still going',
            goodAt: 'Two copies never fight over the same data.',
            badAt: 'A stuck run blocks the ones after it until its time limit ends it.',
            pickWhen: 'Jobs that are not safe to run alongside themselves.',
          },
        ],
      },
      recommendation:
        'Make both policies settings on each job, defaulting to “run once” for missed runs and “forbid” for overlap, with a time limit on every run; Kubernetes CronJobs expose similar choices through `concurrencyPolicy` and `startingDeadlineSeconds`. Pass each run its scheduled time, not the current time, so a late run still processes the window it was meant for. For bursts, spread flexible jobs across the hour, give each team a [[quota|quota]] and its own share of workers, and let urgent pools go first.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a billion runs a day and 10 million due at midnight (ballpark).',
      impact: 'Recording runs becomes about 10,000 writes a second on average and far more in bursts, and 300,000 runs are in progress at once.',
      mitigation:
        'Move logical shards onto more database machines, insert runs in batches, archive history sooner, and let worker pools scale with queue depth. Spreading start times matters more at this size than any server.',
    },
    {
      scenario: 'One team schedules 5 million jobs for exactly midnight.',
      impact: 'Their burst fills the queues, and everyone else’s midnight jobs start an hour late behind it.',
      mitigation:
        'Quotas per team at the API, separate queues and worker shares per team, and fair scheduling between them, so a team’s burst delays mostly that team. Offer “sometime in this hour” as the default for jobs that don’t need an exact minute.',
    },
    {
      scenario: 'A scheduler node dies.',
      impact: 'Jobs in its shards start late by about one lease, around 10 seconds (ballpark). None is lost, because a run and its schedule change were recorded together.',
      mitigation:
        'Another node takes over the shards with a higher term, re-queues recorded runs that never reached the queue, and fires anything that fell due during the gap.',
    },
    {
      scenario: 'A worker dies partway through a run.',
      impact: 'The run’s lease expires and it runs again as the next attempt, possibly repeating side effects the first attempt already made.',
      mitigation: 'Idempotency keys built from the run ID make the repeat harmless, and the attempt number stops the first worker’s late report from counting.',
    },
    {
      scenario: 'A [[poison message|poison-message]]: a job that fails or crashes its worker every time.',
      impact: 'Endless retries waste workers and push other runs back.',
      mitigation:
        'Cap attempts with exponential backoff, then move the run to the dead-letter queue and notify the owner. After several failed runs in a row, pause the job’s schedule until someone looks.',
    },
    {
      scenario: 'The queue is unavailable.',
      impact: 'Runs are still recorded, but none reach the workers, so every job starts late.',
      mitigation: 'Recorded runs wait in the outbox and are sent when the queue returns. Alert on the age of the oldest unsent run, and let urgent pools fail over to a second queue.',
    },
    {
      scenario: 'The jobs database loses its primary.',
      impact: 'For the failover window, about 30 seconds (ballpark), no runs are recorded and no results saved.',
      mitigation:
        'Fail over to a synchronously replicated standby so no recorded run is lost; schedulers and workers retry with backoff, and runs that came due during the gap fire as soon as writes resume.',
    },
    {
      scenario: 'A scheduler node’s clock jumps ten minutes ahead.',
      impact: 'It fires jobs ten minutes early, which is worse than late for jobs that expect a day’s data to be complete.',
      mitigation:
        'Keep clocks synced with the Network Time Protocol (NTP), measure waits with a [[monotonic clock|monotonic-clock]], and have each prefetch ask the database for the current time; a node whose clock disagrees by more than a second or two stops firing and raises an alert.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Stores jobs with their next run time, finds due jobs and hands them to workers through a queue.',
        'Retries failed runs and keeps each run’s status and errors for the job’s owner.',
        'Notices that a single scheduler process is a single point of failure.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Replaces the single scheduler with leader election and explains what happens to jobs that fall due during a failover.',
        'Explains at-least-once execution with leases, heartbeats and retries with backoff, and why jobs must therefore be idempotent.',
        'Sizes runs a second and the midnight burst from the estimate.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Fences stale leaders and stale workers with terms and attempt numbers checked where the writes land, and records a run with its schedule change in one transaction.',
        'Shards scheduling with leases per shard and prefetching, and spreads synchronized start times instead of buying servers for midnight.',
        'Makes the product policies explicit: missed runs, overlapping runs, time zones and clock changes, and quotas per team.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The scheduler leader just died at 1:59:58. Does the 2:00 job run?',
      a: 'Yes, about ten seconds late (ballpark). The old leader never recorded the 2:00 run, so the job’s next run time hasn’t moved; when its lease expires, the new leader wins a higher term, finds the job overdue and fires it. If the old leader had recorded the run but not queued it, the outbox relay still queues it, and the unique key on job and scheduled time stops a second copy.',
    },
    {
      q: 'A worker finished a payment job but crashed before reporting success. What happens?',
      a: 'Its lease expires and the run is retried as attempt 2. The job sends the payment provider the same idempotency key, the run ID, so the provider returns the original result instead of charging again, and attempt 2 records success. If the first worker comes back and reports late, the conditional write on attempt number rejects it.',
    },
    {
      q: 'A job is set for 2:30 every night in New York. What happens on the night the clocks spring forward?',
      a: 'That night 2:30 local time doesn’t exist, because clocks jump from 2:00 to 3:00. Each job stores its schedule with its time zone, and the next run is computed with a proper time zone library, with a stated rule: run at the next valid time, 3:00. In autumn, when 1:30 happens twice, the job runs once, at the first 1:30, and teams that want neither surprise can schedule in UTC.',
    },
    {
      q: 'One team schedules 5 million jobs for exactly midnight. How do you protect everyone else?',
      a: 'Quotas on how many runs a team may have due in one minute, enforced when jobs are created, and separate queues with fair sharing between teams, so that team’s burst mostly delays that team. I’d also make “run sometime in this hour” the default for daily jobs and spread those by hashing the job ID.',
    },
    {
      q: 'Why not just run cron on a few servers?',
      a: 'Cron on one server stops everything when that server dies, and cron on several servers runs every job several times, since each copy fires on its own. It also has no retries, no history and no view of what is late, and its configuration is scattered across machines. Leader election, a durable store of jobs and runs, and leases on runs are exactly what cron lacks.',
    },
    {
      q: 'How would you support a job that must wait for another, such as a report that needs last night’s import?',
      a: 'That makes the scheduler a workflow engine. I would store each job’s upstream jobs, create runs for the same scheduled time, and mark a run ready only when all its upstream runs for that time have succeeded; the jobs and their links must form a directed acyclic graph, which I check when jobs are saved. Readiness becomes one more state in the runs table, so the rest of the design stays the same.',
    },
  ],
  rubric: [
    { item: 'Clarified job counts, timing precision and failure behavior, then estimated runs a second and the midnight burst', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Stored jobs and runs durably, and found due jobs with an index or prefetched timers', weight: 10, lessonId: 'indexes' },
    { item: 'Removed the single scheduler with leader election through leases, with a takeover that loses no due runs', weight: 20, lessonId: 'consensus-leader-election' },
    { item: 'Fenced stale leaders and workers with terms or attempt numbers checked where the writes land', weight: 15, lessonId: 'distributed-locks' },
    { item: 'Ran jobs at least once with worker leases, heartbeats, retries with backoff and a dead-letter queue', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Made jobs idempotent with run IDs as idempotency keys, so a repeated run changes nothing', weight: 15, lessonId: 'idempotency' },
    { item: 'Scaled with sharded scheduling, spread synchronized start times and set quotas per team', weight: 10, lessonId: 'sharding' },
    { item: 'Defined policies for missed runs, overlapping runs, time zones and clock changes', weight: 5, lessonId: 'time-and-ordering' },
  ],
};

export default problem;
