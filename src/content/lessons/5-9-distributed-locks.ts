import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a race with no lock, then a lease lock taken, refused, renewed, and taken over after a crash. */
const leaseLock: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'workerA', type: 'worker', label: 'Worker A', x: 0, y: 1 },
    { id: 'lock', type: 'cache', label: 'Lock service', sublabel: 'Redis', x: 1, y: 0 },
    { id: 'log', type: 'sqlDb', label: 'Send log', x: 1, y: 1 },
    { id: 'email', type: 'external', label: 'Email service', x: 1, y: 2 },
    { id: 'workerB', type: 'worker', label: 'Worker B', x: 2, y: 1 },
  ],
  edges: [
    { id: 'a-lock', from: 'workerA', to: 'lock', kind: 'sync' },
    { id: 'a-log', from: 'workerA', to: 'log', kind: 'sync' },
    { id: 'a-email', from: 'workerA', to: 'email', kind: 'sync' },
    { id: 'b-lock', from: 'workerB', to: 'lock', kind: 'sync' },
    { id: 'b-log', from: 'workerB', to: 'log', kind: 'sync' },
    { id: 'b-email', from: 'workerB', to: 'email', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'With no lock, workers A and B pick batch 17 at the same moment, a [[race condition|race-condition]], and a thousand people get the email twice.',
      flow: [['a-email', 'b-email']],
      notes: [{ target: 'email', text: 'sent twice', tone: 'alert' }],
    },
    {
      caption: 'Now a worker must hold a batch’s lock first. A asks the **lock service** to create `lock:batch-17` only if it does not exist yet, expiring in 10 seconds, and gets it.',
      flow: ['a-lock', { edge: 'a-lock', reverse: true, tag: 'granted' }],
    },
    {
      caption: 'B asks for the same key a moment later. It exists, so B is refused and moves on to batch 18.',
      flow: ['b-lock', { edge: 'b-lock', reverse: true, tag: 'taken', tone: 'alert' }],
    },
    {
      caption: 'While A works, it renews the lease every 3 seconds, records each email in the **send log** and sends it.',
      flow: ['a-lock', 'a-log', 'a-email'],
      notes: [{ target: 'lock', text: 'renewed', tone: 'plain' }],
    },
    {
      caption: 'A’s machine crashes. Nobody deletes the key, but with no renewals it expires 10 seconds later, and B takes over the batch, skipping emails the log says were sent.',
      fail: ['workerA'],
      flow: ['b-lock', { edge: 'b-lock', reverse: true, tag: 'granted' }, 'b-log', 'b-email'],
      notes: [{ target: 'lock', text: 'A’s lease expired', tone: 'plain' }],
    },
  ],
};

/** The paused client: its lease expires while it is frozen, and a fencing token makes storage reject its late write. */
const pausedWorker: SequenceSpec = {
  actors: [
    { id: 'a', type: 'worker', label: 'Worker A' },
    { id: 'lock', type: 'service', label: 'Lock service' },
    { id: 'b', type: 'worker', label: 'Worker B' },
    { id: 'log', type: 'sqlDb', label: 'Send log' },
  ],
  groups: [
    { label: 'A holds the lock', from: 1, to: 2 },
    { label: 'A is frozen', from: 3, to: 6 },
    { label: 'Fencing', from: 7, to: 8 },
  ],
  messages: [
    { from: 'a', to: 'lock', label: 'lock batch 17', kind: 'sync', caption: 'Worker A asks for the lock on batch 17.' },
    { from: 'lock', to: 'a', label: 'granted, token 33', kind: 'reply', caption: 'It gets a 10-second lease and fencing token 33.' },
    {
      from: 'b',
      to: 'lock',
      label: 'lock batch 17',
      kind: 'sync',
      caption: 'A freezes in a 15-second pause before writing anything. Its lease expires after 10 seconds, and worker B asks for the lock.',
    },
    { from: 'lock', to: 'b', label: 'granted, token 34', kind: 'reply', caption: 'As far as the lock service can tell, A is gone, so B gets the lock, with token 34.' },
    { from: 'b', to: 'log', label: 'email 1, token 34', kind: 'sync', caption: 'B records the first email in the send log with token 34. The log remembers 34 as the newest token.' },
    { from: 'log', to: 'b', label: 'OK', kind: 'reply', caption: 'The write succeeds, and B works through the batch.' },
    { from: 'a', to: 'log', label: 'email 1, token 33', kind: 'sync', caption: 'A wakes up. To A no time has passed, so it records the same email, with token 33.' },
    {
      from: 'log',
      to: 'a',
      label: 'rejected: 33 < 34',
      kind: 'reply',
      caption: 'The log has seen 34, so it rejects 33. A learns it has lost the lock and stops, and the email goes out once.',
    },
  ],
};

const KLEPPMANN = 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html';

const lesson: Lesson = {
  id: 'distributed-locks',
  module: 'm5',
  order: 9,
  title: 'Distributed locks and leases',
  idea: 'A distributed lock is really a lease that expires, so a crashed holder cannot block the work forever, and fencing tokens stop a holder that paused past its lease from doing damage.',
  minutes: 14,
  prerequisites: ['consensus-leader-election', 'time-and-ordering'],
  outcomes: [
    'Decide when work needs a distributed lock, and when idempotency or a database transaction does the job instead.',
    'Explain how a lease lock is taken, renewed and released, and choose a lease length.',
    'Show how a paused holder outlives its lease, and how fencing tokens make storage reject it.',
  ],
  analogy: {
    title: 'A meeting-room booking that expires',
    body: 'Your office books meeting rooms through an app. Book room 4 from 2:00 to 2:30 and everyone else sees it as taken; if you forget to cancel or go home sick, the booking simply ends at 2:30, so a forgotten booking never blocks the room all day.\n\nThe expiry has a cost. Lose track of time on a long call, walk back in at 2:45 sure the room is still yours, and you find a team that booked it at 2:31. Some offices fix this with numbered bookings: the door keypad accepts only the newest booking’s code, so your code 33 stops working the moment booking 34 exists.',
  },
  whyItMatters:
    'Snapgram now has about 30 million daily users, and every Sunday evening a job emails each of them “your week in photos”. Three workers take batches of 1,000 users from a shared list, and sometimes two take the same batch at the same moment, so those users get the email twice.\n\nThe team adds a [[distributed lock|distributed-lock]]: a worker must hold a batch’s lock before sending it, and the lock expires after 10 seconds unless the worker renews it, so a crashed worker cannot hold a batch forever. The duplicates stop, for weeks.\n\nThen one Sunday a worker freezes for 15 seconds in the middle of a batch. Its lock expires, another worker takes the batch over, and the first one wakes up still sure it holds the lock. Maya gets her email twice again.',
  body: [
    { kind: 'heading', text: 'When you need a lock' },
    {
      kind: 'prose',
      md: `Across machines there is no shared memory, so a distributed lock lives in a service that every worker asks before doing the protected work. [Martin Kleppmann](${KLEPPMANN}) sorts such locks into two kinds. An **efficiency** lock saves work: if it fails now and then, something is done twice, such as a duplicate email. A **correctness** lock protects data: if two holders ever overlap, data is corrupted or lost, such as boost credits spent twice.`,
    },
    {
      kind: 'prose',
      md: 'Locks are a last resort, because they bring the problems in the rest of this lesson. Work that is safe to repeat needs none: an [[idempotency key|idempotency-key]] made from the user and the week turns a second email into a no-op. Data in one database can be protected by a [[transaction|transaction]] or a [[compare-and-set|compare-and-set]] write instead.',
    },
    { kind: 'heading', text: 'A lock is a lease' },
    {
      kind: 'prose',
      md: 'The simplest distributed lock is one key in a shared store such as [[Redis|redis]]. A worker takes the lock by creating the key only if it does not exist yet, and releases it by deleting the key. But a crashed worker never deletes its key, so distributed locks are [[leases|lease]]: the key gets a [[time to live|ttl]] (TTL) of, say, 10 seconds, and the holder renews it every few seconds while it works.',
    },
    {
      kind: 'diagram',
      title: 'A lease lock at work',
      caption: 'Two workers share the weekly email. Step through a race, a lock taken and refused, renewals, and a crash.',
      spec: leaseLock,
    },
    {
      kind: 'annotated',
      title: 'A lease lock in Redis',
      caption: 'The value is the holder’s name, so a worker only ever touches its own lock.',
      lines: [
        {
          code: 'SET lock:batch-17 worker-a NX PX 10000',
          note: 'Take the lock: create the key only if it does not exist (`NX`), expiring in 10,000 milliseconds (`PX`). That expiry is the lease.',
        },
        { code: 'PEXPIRE lock:batch-17 10000', note: 'Renew every few seconds, after checking that the value is still `worker-a`.' },
        { code: 'if GET lock:batch-17 == worker-a: DEL lock:batch-17', note: 'Release only if the lock is still yours. A small script does the check and the delete as one step.' },
      ],
    },
    {
      kind: 'prose',
      md: 'The lease length is a trade-off. A short lease frees the work soon after a crash, but a holder that is merely slow loses its lock more often. A long lease rides out slow moments, but after a crash the work waits for the lease to run out; seconds to tens of seconds is common (ballpark).',
    },
    { kind: 'heading', text: 'The paused holder' },
    {
      kind: 'prose',
      md: 'A lease protects you from holders that die, not from holders that only seem to. A [[process pause|process-pause]] stops a program while the world carries on: a long [[garbage collection|garbage-collection]] pass, a virtual machine being moved, or memory swapped to disk can freeze it for seconds. When it wakes, it carries on from the line it was on, and that line says it holds the lock.',
    },
    {
      kind: 'prose',
      md: 'Checking the lease just before writing does not help, because the pause can fall between the check and the write. A write delayed in a slow network arrives late in the same way, and a holder whose clock runs slow, through [[clock drift|clock-drift]], can think its lease has longer to run than the lock service does.',
    },
    { kind: 'heading', text: 'Fencing tokens' },
    {
      kind: 'prose',
      md: 'You cannot stop a holder from pausing, so stop its late writes instead. Each time the lock service grants the lock, it hands out a [[fencing token|fencing-token]], a number bigger than any before it. The holder sends its token with every write, and storage rejects any token smaller than the biggest it has seen.',
    },
    {
      kind: 'sequence',
      title: 'A paused worker meets a fencing token',
      caption: 'Worker A’s lease expires while it is frozen. Step through what happens when it wakes up.',
      spec: pausedWorker,
    },
    {
      kind: 'prose',
      md: 'The tokens must never repeat, even when machines fail. A [[coordination service|coordination-service]] such as ZooKeeper or etcd is built on [[consensus|consensus]] and numbers every change it makes, so ZooKeeper’s transaction number, for example, works as a fencing token. A single Redis server gives no tokens, and because its replicas copy data by [[asynchronous replication|asynchronous-replication]], a lock can vanish when Redis [[fails over|failover]] to a replica that never received it.',
    },
    {
      kind: 'prose',
      md: 'Fencing only protects what checks the token. The outside email service does not, so Snapgram also keys each email in its send log by user and week and skips repeats: the lock keeps the work efficient, and the tokens and keys keep it correct.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out how the lock service itself stays available (with consensus, as in [Consensus and leader election](lesson:consensus-leader-election)), queues of waiting workers, shared locks for readers, and Redlock, which takes one lock on a majority of several Redis servers.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to keep two workers from doing the same thing at once.',
    rows: [
      {
        option: 'No lock: idempotent work',
        goodAt: 'Nothing can expire or pause, and repeats are harmless.',
        badAt: 'Every side effect needs a key, and some outside systems cannot honor one.',
        pickWhen: 'The work has a natural key, such as one email per user per week.',
      },
      {
        option: 'Transaction or conditional write',
        goodAt: 'Atomic, using the database you already run.',
        badAt: 'Covers only data inside that one database.',
        pickWhen: 'You protect rows in one database, such as a credit balance.',
      },
      {
        option: 'Lease lock in Redis',
        goodAt: 'Fast and simple.',
        badAt: 'No fencing tokens, and a failover or a long pause can let two holders overlap.',
        pickWhen: 'The lock is for efficiency, and a rare duplicate is fine.',
      },
      {
        option: 'Coordination service lock with fencing',
        goodAt: 'Survives machine failures and hands out tokens.',
        badAt: 'Another system to run, slower to acquire, and storage must check the tokens.',
        pickWhen: 'Two holders at once would corrupt or lose data.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s Chubby lock service',
    body: 'Google described Chubby, its lock service, in a 2006 paper. Its locks are coarse-grained, meant to be held for hours or days, and a main use is leader election: the Google File System uses a Chubby lock to appoint its master server, and Bigtable uses Chubby to elect its master.\n\nChubby’s answer to the paused holder is close to a fencing token. A holder can ask for a sequencer, a short string that includes a lock generation number, and pass it to the servers it calls, which check it and reject the request if it is no longer valid. For servers that cannot check sequencers, a lock whose holder failed stays unavailable for a lock-delay of up to one minute.',
    sourceUrl: 'https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/',
    sourceLabel: 'Burrows, “The Chubby Lock Service for Loosely-Coupled Distributed Systems,” OSDI 2006',
  },
  interview: {
    whenToMention:
      'When a design has work that must happen once, or a resource only one machine may change at a time, such as a scheduled job running on several servers. First say how you would avoid the lock; if you still need one, call it a lease, and raise fencing tokens before the interviewer asks about pauses.',
    sayItLikeThis: [
      'I’d avoid the lock: if each email is recorded under a user-and-week key first, a duplicate run is harmless.',
      'If we need one, it’s a 10-second lease in the coordination service, renewed every 3 seconds, so a crash frees the batch quickly.',
      'A paused worker can outlive its lease, so writes carry a fencing token and storage rejects old tokens.',
    ],
    followUps: [
      {
        q: 'Why not use a long lease, say an hour?',
        a: 'A long lease makes a harmful pause rarer, not impossible, and it makes crashes expensive: a dead holder blocks the work for an hour. I’d keep the lease short and rely on fencing tokens for safety.',
      },
      {
        q: 'Is a lock in Redis good enough?',
        a: 'For efficiency, yes: a rare duplicate email is acceptable. For correctness, no: Redis gives no fencing tokens, and a failover can lose the lock, so I’d use ZooKeeper or etcd with fencing, or a database transaction.',
      },
      {
        q: 'What if the resource cannot check fencing tokens?',
        a: 'Then the token cannot stop a stale holder there. I’d make the operation idempotent, with a key that the resource or my own log can deduplicate on, or put a small service I control in front of it to check tokens.',
      },
    ],
    redFlags: [
      'A lock with no expiry, so one crash blocks the work until someone deletes the key by hand.',
      'Claiming a lease guarantees a single holder, without mentioning pauses or fencing.',
      'Reaching for a distributed lock when an idempotency key or a database constraint would do.',
    ],
  },
  mistakes: [
    '**No expiry.** A crashed holder never releases its lock, and the job stays stuck until someone deletes the key by hand.',
    '**Check, then write.** Checking the lock right before a write leaves a gap, and a pause can fall exactly into it.',
    '**Deleting someone else’s lock.** If your lease expired and another worker took over, an unconditional delete frees their lock and lets a third worker in.',
    '**Correctness on a best-effort lock.** A single Redis server can lose a lock in a failover; if two holders would corrupt data, you need fencing.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Worker A holds a lock with a 10-second lease and freezes for 15 seconds. Meanwhile, worker B takes the lock. What reliably stops A’s late write from doing damage?',
      options: [
        {
          text: 'Storage rejects A’s write because its fencing token is older than B’s',
          correct: true,
          why: 'Storage has already seen B’s bigger token, so it refuses A’s smaller one, however confused A is about the time.',
        },
        {
          text: 'A checks that it still holds the lock right before writing',
          correct: false,
          why: 'The pause can fall between the check and the write, so the check passes and the write still lands late.',
        },
        {
          text: 'A 60-second lease instead',
          correct: false,
          why: 'It makes this pause harmless but not the next, longer one, and it slows recovery after every crash.',
        },
        {
          text: 'Keeping the clocks of A and the lock service in sync',
          correct: false,
          why: 'A paused program is not running at all, so even a perfect clock cannot stop it from writing when it wakes.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'A worker’s lease lasts 10 seconds, and it renews the lease every 3 seconds. Ignoring network delays and clock drift, what is the longest pause, in seconds, that it is sure to survive without losing the lock?',
      answer: 7,
      unit: 'seconds',
      tolerance: 1.1,
      solution: [
        'Each renewal moves the end of the lease to 10 seconds later.',
        'In the worst case, the pause starts just before the next renewal is due, 3 seconds after the last one.',
        'At that moment 10 − 3 = 7 seconds of lease are left, so any longer pause can cost the lock.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these can leave a worker acting on a lock whose lease has already expired?',
      options: [
        {
          text: 'A long garbage collection pause',
          correct: true,
          why: 'The worker is frozen while its lease runs out, and it wakes up believing nothing has changed.',
        },
        {
          text: 'A write that sits in a slow network until after the lease ends',
          correct: true,
          why: 'It was sent in time but arrives late, when another worker may already hold the lock.',
        },
        {
          text: 'A clock on the worker that runs slow',
          correct: true,
          why: 'The worker measures less time passing than the lock service does, so it thinks its lease has longer to run.',
        },
        {
          text: 'Renewing the lease well before it ends',
          correct: false,
          why: 'Early renewal is the healthy pattern: it keeps the lease alive with time to spare.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the paused-worker story in order.',
      items: [
        'Worker A takes the lock with token 33',
        'A freezes in a long pause',
        'A’s lease expires',
        'Worker B takes the lock with token 34',
        'B writes with token 34',
        'A wakes up and writes with token 33, and storage rejects it',
      ],
      why: 'B can take the lock only after A’s lease expires, and storage rejects token 33 because it has already accepted 34 from B.',
    },
    {
      kind: 'single',
      prompt: 'When is a simple lock in Redis, a key with an expiry, good enough?',
      options: [
        {
          text: 'When it only saves duplicate work, and a rare duplicate is acceptable',
          correct: true,
          why: 'That is an efficiency lock: if it occasionally fails, the cost is a repeated job or email, not broken data.',
        },
        {
          text: 'When two holders would spend the same boost credits twice',
          correct: false,
          why: 'That is a correctness lock, which needs fencing tokens or a transaction; a plain Redis key gives you neither.',
        },
        {
          text: 'Whenever the lease is longer than any pause you have seen',
          correct: false,
          why: 'The next pause can be longer than any before it, and a failover can lose the lock whatever the lease length.',
        },
        {
          text: 'Never: a lock must always use consensus',
          correct: false,
          why: 'For an efficiency lock, the extra safety is rarely worth the cost of running and calling a consensus system.',
        },
      ],
    },
  ],
  takeaways: [
    'Avoid a distributed lock when idempotency or a transaction can do the job, and know whether a lock is for efficiency or for correctness.',
    'Every distributed lock is a lease that expires unless renewed, so a crashed holder frees it within seconds.',
    'A paused holder can outlive its lease without knowing, so storage should check fencing tokens and reject old ones.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: `**Redlock and the debate.** Redlock takes the same lock on a majority of several independent Redis servers, so losing one server does not lose the lock. In 2016 [Martin Kleppmann argued](${KLEPPMANN}) that it depends on timing assumptions, such as bounded pauses and network delays, and gives no fencing tokens, so it is unsafe when correctness depends on the lock. The algorithm’s author published a rebuttal, and reading both is a good lesson in how subtle this is.`,
    },
    {
      kind: 'prose',
      md: '**Leaders are lock holders too.** A database leader from [Consensus and leader election](lesson:consensus-leader-election) keeps its role only while its [[heartbeats|heartbeat]] keep arriving, and it can pause just like a worker. In [[Raft|raft]], the term number plays the role of a fencing token: nodes reject messages from a leader with an older term, which keeps a deposed leader from causing [[split brain|split-brain]].',
    },
    {
      kind: 'prose',
      md: '**Leave a margin.** A holder cannot know exactly when the lock service will consider its lease over, because the two clocks run at slightly different rates and messages take time to arrive. Careful clients stop working a little before their own deadline, for example after 8 of their 10 seconds, and treat the rest as a safety margin.',
    },
  ],
  flashcards: [
    { front: 'What is a distributed lock?', back: 'A lock shared by many machines, so only one of them at a time does a piece of work or changes a resource.' },
    { front: 'Why must a distributed lock expire?', back: 'A holder can crash without releasing it. A lease that expires unless renewed frees the lock within seconds.' },
    {
      front: 'How can a lock holder lose its lock without knowing?',
      back: 'A process pause, a slow network or a slow clock can let its lease expire while it still believes it holds the lock.',
    },
    { front: 'What is a fencing token?', back: 'A number that grows with every lock grant. Storage remembers the largest it has seen and rejects writes carrying a smaller one.' },
    {
      front: 'Why is checking the lock just before writing not enough?',
      back: 'The pause can happen between the check and the write, so the write can still arrive after the lease has ended.',
    },
    {
      front: 'Efficiency lock or correctness lock: what is the difference?',
      back: 'An efficiency lock only avoids duplicate work, so a rare failure is cheap. A correctness lock protects data, so a failure corrupts it, and you need fencing.',
    },
    {
      front: 'How long should a lease be?',
      back: 'Long enough to ride out normal hiccups and short enough that a crash frees the work quickly, often seconds to tens of seconds. Fencing, not lease length, provides safety.',
    },
  ],
  related: ['consensus-leader-election', 'time-and-ordering', 'idempotency', 'heartbeats-gossip', 'databases-101', 'why-distributed-is-hard'],
  glossaryTerms: [
    'distributed-lock',
    'idempotency-key',
    'transaction',
    'compare-and-set',
    'redis',
    'lease',
    'ttl',
    'race-condition',
    'process-pause',
    'garbage-collection',
    'clock-drift',
    'fencing-token',
    'coordination-service',
    'consensus',
    'asynchronous-replication',
    'failover',
    'heartbeat',
    'raft',
    'split-brain',
  ],
};

export default lesson;
