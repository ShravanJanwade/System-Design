import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The signature diagram: uploads before the queue, then the same upload with the slow work handed off. */
const uploadFlow: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'Upload service', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'Thumbnail queue', x: 2, y: 0 },
    { id: 'worker', type: 'worker', label: 'Thumbnail worker', x: 3, y: 0 },
    { id: 'storage', type: 'objectStore', label: 'Photo storage', x: 2, y: 1 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-storage', from: 'app', to: 'storage', kind: 'sync' },
    { id: 'app-queue', from: 'app', to: 'queue', kind: 'async' },
    { id: 'queue-worker', from: 'queue', to: 'worker', kind: 'async' },
    { id: 'worker-storage', from: 'worker', to: 'storage', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '**Before.** The **upload service** saves Maya’s photo to **photo storage**, then makes three thumbnails before it answers. Maya watches a spinner for about 2 seconds.',
      flow: ['phone-app', 'app-storage', '<app-storage', '<phone-app'],
      focus: ['phone', 'app', 'storage'],
      notes: [{ target: 'app', text: '≈ 2 s of resizing', tone: 'alert' }],
    },
    {
      caption:
        '**After.** The service saves the photo, adds a message to the **thumbnail queue** (“make thumbnails for photo 123”) and answers at once. Queuing takes a few milliseconds.',
      add: ['queue', 'worker', 'app-queue', 'queue-worker', 'worker-storage'],
      flow: ['phone-app', 'app-storage', '<app-storage', 'app-queue', '<phone-app'],
      notes: [{ target: 'app-queue', text: '≈ 2 ms', tone: 'plain' }],
    },
    {
      caption: 'A free **thumbnail worker** takes the message. Maya is already scrolling her feed; nobody waits on this work.',
      flow: ['queue-worker'],
    },
    {
      caption: 'The worker reads the original, makes the thumbnails and saves them. While it is busy, the next jobs simply wait in the queue.',
      flow: ['worker-storage', '<worker-storage'],
    },
    {
      caption:
        'Finally the worker sends an [[acknowledgment|acknowledgment]], or “ack”, and the queue deletes the message. Had the worker crashed first, the message would still be there for another worker.',
      flow: [{ edge: 'queue-worker', reverse: true, tag: 'ack' }],
    },
  ],
};

/** A log with two partitions read by two consumer groups. */
const streamGroups: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'upload', type: 'service', label: 'Upload service', x: 0, y: 1 },
    { id: 'p0', type: 'stream', label: 'Partition 0', sublabel: 'photo events', x: 1, y: 0 },
    { id: 'p1', type: 'stream', label: 'Partition 1', sublabel: 'photo events', x: 1, y: 2 },
    { id: 'idxA', type: 'worker', label: 'Search indexer A', x: 2, y: 0 },
    { id: 'idxB', type: 'worker', label: 'Search indexer B', x: 2, y: 2 },
    { id: 'notify', type: 'service', label: 'Notifications', x: 3, y: 1 },
  ],
  edges: [
    { id: 'upload-p0', from: 'upload', to: 'p0', kind: 'async' },
    { id: 'upload-p1', from: 'upload', to: 'p1', kind: 'async' },
    { id: 'p0-idxA', from: 'p0', to: 'idxA', kind: 'async' },
    { id: 'p1-idxB', from: 'p1', to: 'idxB', kind: 'async' },
    { id: 'p0-notify', from: 'p0', to: 'notify', kind: 'async' },
    { id: 'p1-notify', from: 'p1', to: 'notify', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'The **upload service** appends a “photo posted” event. Events are spread over partitions by user identifier (ID), so all of Maya’s events land in partition 0, in order.',
      flow: ['upload-p0'],
      notes: [{ target: 'p0', text: 'offset 812', tone: 'signal' }],
    },
    {
      caption: 'The search indexers form one consumer group. Each partition is read by one member: indexer A takes partition 0, indexer B takes partition 1.',
      flow: [['p0-idxA', 'p1-idxB']],
    },
    {
      caption: '**Notifications** is a second group. It reads the same events from its own offsets, at its own pace; nothing was deleted when search read them.',
      flow: [['p0-notify', 'p1-notify']],
    },
    {
      caption: 'A bug garbled yesterday’s search entries. After the fix, the search group rewinds its offsets to yesterday and replays. A queue couldn’t: those messages are gone.',
      flow: [
        [
          { edge: 'p0-idxA', tag: 'replay' },
          { edge: 'p1-idxB', tag: 'replay' },
        ],
      ],
    },
  ],
};

/** At-least-once delivery: the ack is lost, so the job runs twice. */
const atLeastOnce: SequenceSpec = {
  actors: [
    { id: 'queue', type: 'queue', label: 'Thumbnail queue' },
    { id: 'a', type: 'worker', label: 'Worker A' },
    { id: 'b', type: 'worker', label: 'Worker B' },
    { id: 'storage', type: 'objectStore', label: 'Photo storage' },
  ],
  groups: [
    { label: 'First delivery', from: 1, to: 3 },
    { label: 'Redelivery', from: 4, to: 6 },
  ],
  messages: [
    {
      from: 'queue',
      to: 'a',
      label: 'job 123',
      kind: 'async',
      caption: 'The queue delivers the job to worker A and hides it from other workers while it waits for an ack.',
    },
    { from: 'a', to: 'storage', label: 'save thumbnails', kind: 'sync', caption: 'Worker A makes the thumbnails and saves them.' },
    { from: 'a', to: 'queue', label: 'ack', kind: 'async', lost: true, caption: 'Worker A crashes before its ack goes out. The ack never arrives.' },
    {
      from: 'queue',
      to: 'b',
      label: 'job 123, again',
      kind: 'async',
      caption: 'After a timeout, the queue assumes the job failed and delivers it to worker B.',
    },
    {
      from: 'b',
      to: 'storage',
      label: 'save thumbnails',
      kind: 'sync',
      caption: 'Worker B makes the same thumbnails again: a duplicate. Saving the same files to the same place twice changes nothing, so it is harmless.',
    },
    { from: 'b', to: 'queue', label: 'ack', kind: 'async', caption: 'Worker B acks, and the queue deletes the message.' },
  ],
};

/** Quiz: a backlog that grows all evening. */
const backlogQuiz: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', sublabel: '40 uploads/s', x: 0, y: 0 },
    { id: 'upload', type: 'service', label: 'Upload service', sublabel: '6 servers', x: 1, y: 0 },
    { id: 'queue', type: 'queue', label: 'Thumbnail queue', sublabel: 'growing all evening', x: 2, y: 0 },
    { id: 'workers', type: 'worker', label: 'Workers', sublabel: '6 × 5 jobs/s', x: 3, y: 0 },
    { id: 'storage', type: 'objectStore', label: 'Photo storage', sublabel: 'writes ≈ 20 ms', x: 3, y: 1 },
  ],
  edges: [
    { id: 'phones-upload', from: 'phones', to: 'upload', kind: 'sync' },
    { id: 'upload-queue', from: 'upload', to: 'queue', kind: 'async' },
    { id: 'queue-workers', from: 'queue', to: 'workers', kind: 'async' },
    { id: 'workers-storage', from: 'workers', to: 'storage', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'queues-and-streams',
  module: 'm3',
  order: 10,
  title: 'Message queues and event streams',
  idea: 'A message queue lets one part of a system hand work to another and move on, so slow tasks run in the background and sudden spikes wait in line instead of knocking servers over.',
  minutes: 15,
  prerequisites: ['latency-throughput-bandwidth', 'stateless-vs-stateful'],
  outcomes: [
    'Explain how a queue takes slow work out of the request and absorbs spikes, and when it can’t.',
    'Choose between a queue and an event stream, and pick a delivery guarantee.',
    'Design consumers that cope with duplicates, poison messages and a growing backlog.',
  ],
  analogy: {
    title: 'The order rail',
    body: 'In a busy restaurant, waiters don’t stand in the kitchen while each steak cooks. They clip the order ticket to the rail by the kitchen window and go back to their tables. Each cook pulls the next ticket off the rail, so every order goes to exactly one cook.\n\nAt the dinner rush the tickets pile up, but nobody is turned away and the waiters keep taking orders. And if a ticket is unreadable, the cook sets it aside for the manager and takes the next one, instead of staring at it all night.',
  },
  whyItMatters:
    'Snapgram’s photos now live in [[object storage|object-storage]], and every new photo needs three thumbnails: for the feed, the profile grid and notifications. The upload service makes them during the upload, about 2 seconds of image work (ballpark) while the phone shows a spinner. On a normal evening, 20 photos arrive each second and the servers just cope.\n\nThen a pop star asks her fans to post their sunsets with #SnapgramSunset. Uploads triple within minutes, every server is busy resizing, uploads time out, and people tap Retry, which adds even more work. Nothing is broken: the slow work is simply happening while people wait.',
  body: [
    {
      kind: 'prose',
      md: 'The fix is to stop doing slow work while someone waits. A [[message queue|message-queue]] sits between the part of the system that asks for work, the [[producer|producer]], and the part that does it, the [[consumer|consumer]]. The producer adds a message describing the job and moves on; consumers take messages when they are ready.',
    },
    {
      kind: 'diagram',
      title: 'Uploads, before and after the queue',
      caption: 'Dashed arrows are messages that nobody waits on. Use Play, or the arrow keys.',
      spec: uploadFlow,
    },
    {
      kind: 'prose',
      md: 'Two things changed. Maya’s upload finishes about 2 seconds sooner, because it no longer waits for thumbnails. And the **upload service** no longer depends on the workers: if they are slow or restarting, uploads still succeed and the jobs wait. This separation is called [[decoupling|decoupling]], and it lets each side scale, change and fail on its own.',
    },
    { kind: 'heading', text: 'Absorbing spikes' },
    {
      kind: 'prose',
      md: 'A queue also changes what a spike does. Extra jobs wait in line, so the [[queue depth|queue-depth]] climbs during the spike and falls after it, while the workers keep a steady pace. Nothing is lost and nobody is turned away.\n\nThe catch is arithmetic. Over any long stretch, the workers’ [[throughput|throughput]], the jobs they finish per second, must beat the rate at which jobs arrive. If 20 arrive each second and the workers finish 15, the queue grows by 5 a second without end: a queue buys time, not capacity.',
    },
    {
      kind: 'numbers',
      caption: 'A worked example, ballpark. The backlog grows by the extra rate, and it drains only as fast as the spare capacity allows.',
      items: [
        { label: 'Normal evening', value: '20 uploads/s' },
        { label: 'During the spike, for 10 minutes', value: '60 uploads/s' },
        { label: 'Ten workers, 5 jobs/s each', value: '50 jobs/s' },
        { label: 'Backlog when the spike ends', value: '6,000 jobs', note: '(60 − 50) × 600 s' },
        { label: 'Time to drain it', value: '≈ 3.3 min', note: '6,000 ÷ (50 − 20)' },
      ],
    },
    {
      kind: 'prose',
      md: 'Users feel the wait, not the depth. [[Consumer lag|consumer-lag]] measures how far behind the workers are, usually as the age of the oldest waiting message; when that spike ends, new thumbnails appear about 2 minutes late. And a queue can’t grow forever, so production queues get a size limit and [[backpressure|backpressure]]: when the queue is full, producers must slow down or get an error, and the overload shows up where someone can act on it.',
    },
    { kind: 'heading', text: 'Queues and logs' },
    {
      kind: 'prose',
      md: 'Messaging systems come in two families. In a classic queue, such as RabbitMQ or Amazon Simple Queue Service (SQS), each message goes to one consumer and is deleted once that consumer acknowledges it. That suits tasks: each thumbnail job should be done once, by one worker.\n\nAn [[event stream|event-stream]], such as Apache Kafka, is a log instead. Producers append events to the end, the log keeps them for days, and each reader keeps its own place, so one “photo posted” event can feed search, notifications and analytics. Delivering every message to every interested reader is called [[publish-subscribe|publish-subscribe]].',
    },
    {
      kind: 'diagram',
      title: 'One stream, two consumer groups',
      caption: 'Each group reads every event at its own pace. Use Play, or the arrow keys.',
      spec: streamGroups,
    },
    {
      kind: 'prose',
      md: 'Three words carry this design. A stream is split into [[partitions|partition]] so several machines share the load, and each event has an [[offset|offset]], its position in its partition. Readers form [[consumer groups|consumer-group]]: within a group, each partition goes to one member, so members split the work, while each group as a whole sees every event.',
    },
    { kind: 'heading', text: 'Delivery guarantees' },
    {
      kind: 'prose',
      md: 'When the consumer acks decides what a crash costs. Ack before the work, and a crash in the middle loses the message: [[at-most-once delivery|at-most-once]]. Ack after the work, and a crash means the message comes back and the work may run twice: [[at-least-once delivery|at-least-once]]. Most systems choose at-least-once, because a lost job is worse than a repeated one.',
    },
    {
      kind: 'sequence',
      title: 'A crash before the ack',
      caption: 'At-least-once delivery in action: the work happens twice.',
      spec: atLeastOnce,
    },
    {
      kind: 'prose',
      md: 'So duplicates are normal, and consumers must be [[idempotent|idempotent]]: running a job twice must leave the same result as running it once. Thumbnails are idempotent for free. A job like “charge 5 credits for a boost” is not, so the consumer stores each message’s unique identifier in the same database [[transaction|transaction]] as the charge, and skips any it has seen. ==At-least-once delivery plus an idempotent consumer== is how real systems get [[exactly-once|exactly-once]] effects.',
    },
    { kind: 'heading', text: 'Poison messages and order' },
    {
      kind: 'prose',
      md: 'Retries fix temporary trouble, such as a storage hiccup, but not a [[poison message|poison-message]]: one that fails every time, like a corrupted image. Retried forever, it keeps a worker busy for good. The fix is a [[dead-letter queue|dead-letter-queue]]: after a few failed attempts, often three to five, the message moves to a side queue and an alert goes out, so an engineer can inspect it and replay it once the bug is fixed.\n\nOrder is the other trap. With several consumers, job 2 can finish before job 1, and a retried message returns after newer ones. Logs keep order only within a partition, so give related events the same partition key, such as the photo’s ID, when order matters: “photo posted” must come before “photo deleted”.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real brokers also copy messages to several machines so a crash doesn’t lose them, batch messages for speed, and rebalance consumer groups when members come and go. Go deeper covers visibility timeouts, exactly-once inside Kafka and the outbox pattern.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'message-queue',
      preset: { rate: 20, consumers: 3, speed: 5, spike: false, poison: false, dlq: true, maxDepth: 0 },
      intro:
        'The simulator starts with Snapgram’s evening load: 20 uploads a second and three thumbnail workers, each finishing five jobs a second. The workers can’t keep up, so watch the queue and the wait grow. Then try the challenges: add workers, send a spike, slip in broken photos and cap the queue.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to get work done, compared.',
    rows: [
      {
        option: 'Direct call',
        goodAt: 'Simple, and the caller gets the result or the error at once.',
        badAt: 'The caller waits for slow work, and a spike or outage downstream hits it directly.',
        pickWhen: 'The user needs the answer now and the work is fast.',
      },
      {
        option: 'Message queue',
        goodAt: 'Spreads tasks over workers, retries failures and absorbs spikes; each task runs on one worker.',
        badAt: 'Results arrive later, and you must handle duplicates, poison messages and backlogs.',
        pickWhen: 'Slow or bursty background tasks: thumbnails, emails, video encoding.',
      },
      {
        option: 'Event stream',
        goodAt: 'Many consumer groups read the same events, replay history and get order within a partition.',
        badAt: 'More to run and tune, and retrying one failed message is harder than in a queue.',
        pickWhen: 'Several services react to the same events, or you need to replay them.',
      },
    ],
  },
  realWorld: {
    title: 'Kafka at LinkedIn',
    body: 'In a 2011 paper, three LinkedIn engineers described Kafka, which they built to deliver activity data such as page views, clicks and searches to other systems within a few seconds. Messages have no separate ID: each is addressed by its offset in the log, and it is deleted only after a retention period, typically 7 days. That lets a consumer rewind to an old offset and re-consume data, for example after fixing a bug.\n\nThe paper is just as clear about limits. Each message goes to one consumer within a group, order is guaranteed only within a partition, and delivery is at-least-once: after a crash, a consumer may see duplicates, so applications that care must remove them, for example with a unique key in each message.',
    sourceUrl: 'https://www.microsoft.com/en-us/research/wp-content/uploads/2017/09/Kafka.pdf',
    sourceLabel: 'Kreps, Narkhede and Rao, “Kafka: a Distributed Messaging System for Log Processing,” NetDB 2011',
  },
  interview: {
    whenToMention:
      'Whenever a request triggers work the user doesn’t wait for, such as resizing images, sending email or updating feeds, or when several services must react to one event. Say what goes on the queue, who consumes it, and what happens when consumers fall behind, crash or meet a message that always fails.',
    sayItLikeThis: [
      'Thumbnails take a couple of seconds, so the upload service stores the photo, queues a job and returns. Workers make the thumbnails in the background.',
      'Delivery is at-least-once, so the worker writes thumbnails to a fixed path per photo, and a duplicate just overwrites the same files.',
      'Jobs that fail three times go to a dead-letter queue with an alert, and we scale workers on consumer lag.',
    ],
    followUps: [
      {
        q: 'What if the consumers can’t keep up?',
        a: 'Short spikes are fine: that’s what the queue is for. For sustained overload, add consumers, ideally with [[autoscaling|autoscaling]] on lag, and cap the queue with backpressure so producers slow down or get a clear error instead of the backlog growing until something breaks.',
      },
      {
        q: 'Can the queue guarantee each message is processed exactly once?',
        a: 'Not on its own: a crash between the work and the ack forces a choice between losing the message and repeating it. So I’d take at-least-once delivery and make the effect idempotent, for example by storing each message ID with the work and skipping repeats.',
      },
      {
        q: 'When would you pick Kafka over a queue like SQS?',
        a: 'When several services need the same events, when I need to replay history, such as rebuilding a search index, or when I need order per key at high volume. For a plain list of tasks with per-message retries and a dead-letter queue, a queue is simpler.',
      },
    ],
    redFlags: [
      'Adding a queue without saying what happens when consumers fall behind.',
      'Claiming exactly-once delivery, with no plan for duplicates.',
      'Expecting global order from many parallel consumers.',
    ],
  },
  mistakes: [
    '**Assuming exactly-once delivery.** Most queues deliver at least once, so crashes and timeouts create duplicates. Make every consumer idempotent.',
    '**No dead-letter queue.** A message that always fails is retried forever, tying up a worker and burying real errors.',
    '**Watching errors but not lag.** Nothing fails while a backlog quietly grows to hours. Alert on the age of the oldest message.',
    '**Queuing work the user waits for.** If someone needs the answer now, a queue only adds delay.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Why does the queue make Snapgram’s uploads faster for Maya?',
      options: [
        {
          text: 'The upload returns once the job is queued; thumbnails are made later',
          correct: true,
          why: 'Queuing a message takes milliseconds, so the slow work no longer sits between Maya and her answer.',
        },
        {
          text: 'Queues resize images faster than app servers',
          correct: false,
          why: 'A queue only stores messages. Workers do the same resizing as before, just not while Maya waits.',
        },
        { text: 'Messages travel faster than ordinary requests', correct: false, why: 'The network is the same. The saving comes from not waiting for the work.' },
        { text: 'The workers skip one of the three thumbnail sizes', correct: false, why: 'All three thumbnails are still made. Only the timing changed.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'During a spike, uploads arrive at 60 per second for 5 minutes, and the workers finish 45 per second. How many jobs are waiting when the spike ends?',
      answer: 4500,
      unit: 'jobs',
      tolerance: 1.1,
      solution: [
        'Each second, 60 − 45 = 15 more jobs arrive than the workers finish.',
        '5 minutes is 300 seconds, so 15 × 300 = 4,500 jobs are waiting.',
        'If uploads then drop to 20 per second, the workers gain 25 a second on the backlog, so it drains in 4,500 ÷ 25 = 180 seconds.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are true of an event stream such as Kafka, but not of a classic queue?',
      options: [
        {
          text: 'Several consumer groups can each read every event',
          correct: true,
          why: 'Each group keeps its own offsets, so search and notifications both see every event.',
        },
        {
          text: 'A consumer can rewind and replay events it has already read',
          correct: true,
          why: 'Events stay for the retention period, so moving the offset back replays them.',
        },
        {
          text: 'Each message is handled by exactly one consumer in the whole system',
          correct: false,
          why: 'That describes a queue. In a stream, one member of each group reads an event, but every group gets it.',
        },
        {
          text: 'Order is guaranteed across all partitions',
          correct: false,
          why: 'Order holds only within a partition. Events in different partitions can be read in any order.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the life of one thumbnail job in order, with at-least-once delivery.',
      items: [
        'The upload service adds the job to the queue',
        'The queue delivers the job to a free worker',
        'The worker makes and saves the thumbnails',
        'The worker acknowledges the job',
        'The queue deletes the message',
      ],
      why: 'The worker acknowledges only after the thumbnails are saved, so a crash before that leads to redelivery instead of a lost job. The queue deletes a message only once it is acknowledged.',
    },
    {
      kind: 'single',
      prompt: 'A worker crashes after saving thumbnails but before acknowledging. With at-least-once delivery, what happens next?',
      options: [
        {
          text: 'The job is delivered again, and the thumbnails are made a second time',
          correct: true,
          why: 'The queue never saw an ack, so it assumes the job failed. That duplicate is why consumers must be idempotent.',
        },
        {
          text: 'The job is lost, so the photo never gets thumbnails',
          correct: false,
          why: 'That is at-most-once, where the ack comes before the work. Here the message stays until it is acknowledged.',
        },
        {
          text: 'The queue sees the thumbnails in storage and deletes the job',
          correct: false,
          why: 'The queue knows only what consumers tell it; it never looks at storage.',
        },
        {
          text: 'Maya’s upload fails and she has to post again',
          correct: false,
          why: 'Her upload finished long ago, when the job was queued. Producer and consumer are decoupled.',
        },
      ],
    },
    {
      kind: 'bottleneck',
      prompt:
        'Snapgram’s thumbnail queue has grown all evening, and new thumbnails now appear 20 minutes late. Uploads arrive at 40 per second. Which component is the bottleneck?',
      diagram: backlogQuiz,
      answerNodeId: 'workers',
      why: 'Six workers finish 30 jobs a second while 40 arrive, so the backlog grows by about 10 every second. Add workers, ideally automatically when lag rises.',
      others: {
        phones: 'Phones only create the demand. Their 40 uploads a second are what the system must keep up with.',
        upload: 'The upload service only stores each photo and queues a small message, which is cheap. It keeps up fine.',
        queue: 'The queue is the symptom, not the cause: it holds exactly the work the workers can’t get to yet.',
        storage: 'Each write takes about 20 ms, ballpark, which is not what limits six workers at 5 jobs a second.',
      },
    },
  ],
  takeaways: [
    'A queue lets producers hand off slow work and move on, turning spikes into a backlog, as long as consumers keep up on average.',
    'Queues give each message to one consumer and delete it, while logs keep events so many consumer groups can read and replay them, in order within a partition.',
    'Expect at-least-once delivery: make consumers idempotent, park repeat failures in a dead-letter queue, and rely on order only within a partition.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Visibility timeouts.** How does a queue notice that a consumer died? Many hide a delivered message for a set time instead of deleting it, and if no ack arrives in time, the message becomes visible again and goes to another consumer. Set the timeout longer than your slowest normal job, or healthy work gets delivered twice.',
    },
    {
      kind: 'prose',
      md: '**Exactly-once inside Kafka.** Kafka can make a read-process-write loop exactly-once when both the input and the output are Kafka topics, by committing the consumer’s offsets and its output messages in one transaction. Once the effect leaves Kafka, such as an email or a card payment, you are back to idempotent consumers.',
    },
    {
      kind: 'prose',
      md: '**The outbox pattern.** Saving a row and publishing a message are two separate steps, and a crash between them leaves one without the other. With a transactional outbox, the app writes the message into an outbox table in the same transaction as the row, and a separate relay publishes it to the queue, at least once.',
    },
  ],
  flashcards: [
    {
      front: 'What two problems does a message queue solve for Snapgram’s uploads?',
      back: 'Users no longer wait for slow work, and traffic spikes become a backlog that drains later instead of overloading the servers.',
    },
    {
      front: 'Queue vs. log: what happens to a message after it is processed?',
      back: 'A queue deletes it once the consumer acknowledges it. A log keeps it for its retention period, so other consumer groups can read it and anyone can replay it.',
    },
    {
      front: 'What is a consumer group?',
      back: 'Consumers that share the work of reading a stream: each partition goes to one member, while every other group still gets every event.',
    },
    {
      front: 'At-most-once vs. at-least-once: when does the consumer acknowledge?',
      back: 'At-most-once acks before the work, so a crash loses the message. At-least-once acks after, so a crash causes a duplicate.',
    },
    {
      front: 'How do you get exactly-once effects?',
      back: 'Use at-least-once delivery and make the consumer idempotent, for example by recording each message ID with the work and skipping repeats.',
    },
    {
      front: 'What is a dead-letter queue for?',
      back: 'It holds messages that failed several times, so a poison message stops tying up workers and someone can inspect it.',
    },
    {
      front: 'Where does a log such as Kafka guarantee order?',
      back: 'Only within a partition. Give related events the same partition key, such as the user ID, to keep them in order.',
    },
    {
      front: 'Uploads arrive at 20 per second and workers finish 15. What happens to the queue?',
      back: 'It grows by 5 jobs every second without end. A queue absorbs bursts, but workers must keep up with the average rate.',
    },
  ],
  related: ['idempotency', 'timeouts-retries-backoff', 'event-driven', 'batch-vs-stream', 'cqrs-event-sourcing', 'rate-limiting'],
  glossaryTerms: [
    'object-storage',
    'message-queue',
    'producer',
    'consumer',
    'acknowledgment',
    'decoupling',
    'queue-depth',
    'throughput',
    'consumer-lag',
    'backpressure',
    'event-stream',
    'publish-subscribe',
    'partition',
    'offset',
    'consumer-group',
    'at-most-once',
    'at-least-once',
    'idempotent',
    'transaction',
    'exactly-once',
    'poison-message',
    'dead-letter-queue',
    'autoscaling',
  ],
};

export default lesson;
