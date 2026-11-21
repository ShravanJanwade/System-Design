import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Why it is hard: the order and the charge commit, then the print shop says no. */
const naiveOrder: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'app', type: 'client', label: 'Maya’s app', x: 0, y: 0.5 },
    { id: 'order', type: 'service', label: 'Order service', sublabel: 'own database', x: 1, y: 0.5 },
    { id: 'payment', type: 'service', label: 'Payment service', sublabel: 'own database', x: 2, y: 0 },
    { id: 'print', type: 'external', label: 'Print shop', sublabel: 'another company', x: 2, y: 1 },
  ],
  edges: [
    { id: 'app-order', from: 'app', to: 'order', kind: 'sync' },
    { id: 'order-payment', from: 'order', to: 'payment', kind: 'sync' },
    { id: 'order-print', from: 'order', to: 'print', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya orders a photo book. The **order service** saves the order, and the **payment service** charges her card. Both commit.',
      flow: ['app-order', 'order-payment', '<order-payment'],
      notes: [
        { target: 'order', text: 'order saved', tone: 'signal' },
        { target: 'payment', text: 'card charged', tone: 'signal' },
      ],
    },
    {
      caption: 'Then the **print shop** rejects the job: two photos are too small to print.',
      flow: ['order-print', { edge: 'order-print', reverse: true, tag: 'rejected', tone: 'alert' }],
    },
    {
      caption: 'The order and the charge are committed in two other databases, and nothing undoes them. Maya has paid for a book that will never exist.',
      focus: ['order', 'payment'],
      notes: [{ target: 'payment', text: 'still charged', tone: 'alert' }],
    },
  ],
};

/** Two-phase commit, and a coordinator that crashes between the phases. */
const twoPhase: SequenceSpec = {
  actors: [
    { id: 'coord', type: 'service', label: 'Coordinator' },
    { id: 'orders', type: 'sqlDb', label: 'Order database' },
    { id: 'payments', type: 'sqlDb', label: 'Payment database' },
  ],
  messages: [
    { from: 'coord', to: 'orders', label: 'prepare', kind: 'sync', caption: 'Phase one: the coordinator asks the order database to prepare.' },
    { from: 'orders', to: 'coord', label: 'yes', kind: 'reply', caption: 'It saves the change, locks the rows and votes yes: a promise to commit if asked.' },
    { from: 'coord', to: 'payments', label: 'prepare', kind: 'sync', caption: 'The payment database is asked to prepare the charge.' },
    { from: 'payments', to: 'coord', label: 'yes', kind: 'reply', caption: 'It locks Maya’s balance and votes yes too.' },
    {
      from: 'payments',
      to: 'coord',
      label: 'decision?',
      kind: 'sync',
      lost: true,
      caption: 'The coordinator crashes before sending its decision. The payment database voted yes, so it may not abort, and nobody told it to commit: it keeps the rows locked and waits.',
    },
  ],
  groups: [
    { label: 'Phase 1: prepare', from: 1, to: 4 },
    { label: 'Phase 2: stuck', from: 5, to: 5 },
  ],
};

/** The required visual: the Snapgram Prints saga, with compensation. */
const printsSaga: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Maya’s app' },
    { id: 'order', type: 'service', label: 'Order service' },
    { id: 'payment', type: 'service', label: 'Payment service' },
    { id: 'print', type: 'external', label: 'Print shop' },
  ],
  messages: [
    { from: 'app', to: 'order', label: 'place order', kind: 'sync', caption: 'Maya orders the book. The order service saves it as pending: step 1.' },
    { from: 'order', to: 'payment', label: 'charge card', kind: 'sync', caption: 'Step 2: the payment service charges her card.' },
    { from: 'payment', to: 'order', label: 'charged', kind: 'reply', caption: 'The charge commits.' },
    { from: 'order', to: 'print', label: 'print book', kind: 'sync', caption: 'Step 3: the job goes to the print shop.' },
    {
      from: 'print',
      to: 'order',
      label: 'rejected',
      kind: 'reply',
      caption: 'The print shop rejects it. Nothing can roll back across services, so the saga runs its compensating actions, newest first.',
    },
    { from: 'order', to: 'payment', label: 'refund', kind: 'sync', caption: 'Undoing step 2: the payment service refunds the charge, and both stay on record.' },
    { from: 'order', to: 'app', label: 'order canceled', kind: 'reply', caption: 'Undoing step 1: the order is marked canceled, and Maya is told why.' },
  ],
  groups: [
    { label: 'Forward steps', from: 1, to: 5 },
    { label: 'Compensation', from: 6, to: 7 },
  ],
};

/** The transactional outbox: one local transaction, a relay, and an idempotent consumer. */
const outbox: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'order', type: 'service', label: 'Order service', x: 0, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Order database', sublabel: 'orders + outbox', x: 1, y: 0 },
    { id: 'relay', type: 'worker', label: 'Outbox relay', x: 2, y: 0 },
    { id: 'stream', type: 'stream', label: 'Order events', x: 2, y: 1 },
    { id: 'payment', type: 'service', label: 'Payment service', x: 1, y: 1 },
  ],
  edges: [
    { id: 'order-db', from: 'order', to: 'db', kind: 'sync' },
    { id: 'relay-db', from: 'relay', to: 'db', kind: 'sync' },
    { id: 'relay-stream', from: 'relay', to: 'stream', kind: 'async' },
    { id: 'stream-payment', from: 'stream', to: 'payment', kind: 'async' },
  ],
  steps: [
    {
      caption: 'The **order service** saves the order and an “order placed” row in the outbox table, in one local transaction.',
      flow: ['order-db'],
      notes: [{ target: 'db', text: 'order + event', tone: 'signal' }],
    },
    {
      caption: 'The **outbox relay** reads new outbox rows and publishes them to the stream of order events.',
      flow: ['relay-db', '<relay-db', 'relay-stream'],
    },
    {
      caption: 'The **payment service** receives “order placed” and charges the card.',
      flow: ['stream-payment'],
      notes: [{ target: 'payment', text: 'charged', tone: 'signal' }],
    },
    {
      caption:
        'If the relay crashes before marking a row as sent, it publishes it again: delivery is [[at least once|at-least-once]]. The payment service is [[idempotent|idempotent]]: it skips event identifiers (IDs) it has already handled.',
      flow: ['relay-stream', { edge: 'stream-payment', tag: 'repeat', tone: 'alert' }],
      notes: [{ target: 'payment', text: 'skipped', tone: 'plain' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'distributed-transactions',
  module: 'm4',
  order: 8,
  title: 'Transactions across services',
  idea: 'When one action spans several services, no single database transaction covers it, so you run a saga: local steps that each commit, with compensating actions that undo them if a later step fails.',
  minutes: 14,
  prerequisites: ['databases-101', 'queues-and-streams'],
  outcomes: [
    'Explain why a transaction across services is hard, and why two-phase commit can block.',
    'Design a saga with compensating actions, using choreography or orchestration.',
    'Use a transactional outbox so a service never loses an event or announces a false one.',
  ],
  analogy: {
    title: 'Booking a trip',
    body: 'You book a weekend away: a flight, then a hotel, each on a different website. No button books both or neither. The flight is booked, and then the hotel turns out to be full.\n\nYou don’t pretend the flight never happened. You cancel it, perhaps for a small fee, and the trip is undone step by step. A saga works the same way: each booking is real the moment it is made, and a later failure means canceling the earlier ones.',
  },
  whyItMatters:
    'Snapgram launches Snapgram Prints: pick 30 photos and order a printed photo book. Each order touches three systems: the order service and the payment service, each with its own database, and an outside print shop reached through its [[application programming interface|api]] (API).\n\nMaya orders a book for her mother. Her card is charged, but the print shop rejects the job because two photos are too small to print. Now Snapgram has her money and no book to send, and no single [[transaction|transaction]] covered all three steps, so nothing rolled back on its own.',
  body: [
    {
      kind: 'prose',
      md: 'Inside one database, a transaction makes changes [[atomic|atomicity]]: they all [[commit|commit]], or a [[rollback|rollback]] undoes them all. But Snapgram’s [[microservices|microservices]] each own their data, and the print shop belongs to another company. A [[distributed transaction|distributed-transaction]] across them is hard: a crash or a rejection partway through leaves a [[partial failure|partial-failure]], with some steps done and others not.',
    },
    {
      kind: 'diagram',
      title: 'Snapgram Prints, the naive way',
      caption: 'Three systems, three separate commits.',
      spec: naiveOrder,
    },
    { kind: 'heading', text: 'Two-phase commit' },
    {
      kind: 'prose',
      md: 'The classic answer is [[two-phase commit|two-phase-commit]]. A [[coordinator|coordinator]] first asks every database to prepare: save the change durably, lock the rows and vote yes or no. If all vote yes, it tells them all to commit; if any votes no, it tells them all to abort.',
    },
    {
      kind: 'sequence',
      title: 'Two-phase commit, and a badly timed crash',
      caption: 'Phase one, then a coordinator crash at the worst moment.',
      spec: twoPhase,
    },
    {
      kind: 'prose',
      md: 'This is the blocking problem: databases that voted yes hold their locks, stalling other requests, until the coordinator recovers. Every participant must also support the protocol, and the print shop’s API does not, so two-phase commit is used inside some databases but rarely between services.',
    },
    { kind: 'heading', text: 'Sagas' },
    {
      kind: 'prose',
      md: 'A [[saga|saga]] gives up on one big transaction. Each step is a local transaction in one service that commits on its own, and each step has a [[compensating action|compensating-action]] that undoes it if a later step fails. Compensations run in reverse order, and they undo the effect rather than erase history: a refund, not a deleted payment.',
    },
    {
      kind: 'sequence',
      title: 'The Snapgram Prints saga',
      caption: 'The order, the rejection and the compensating actions.',
      spec: printsSaga,
    },
    {
      kind: 'prose',
      md: 'A saga gives you atomicity in the end, but not [[isolation|isolation]], the I in ACID. While it runs, other requests can see in-between states, such as an order that is paid but not yet printed. So label those states honestly, as pending, and put steps that cannot be undone, such as shipping, last.',
    },
    { kind: 'heading', text: 'Choreography or orchestration' },
    {
      kind: 'prose',
      md: 'Someone has to run the steps. With [[choreography|choreography]], each service reacts to the others’ events; with [[orchestration|orchestration]], one component directs them all.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Choreography',
        summary: 'Services react to events',
        points: [
          'Payments hears “order placed”, charges the card and publishes “payment taken”.',
          'No central controller, but the flow is scattered, so it is hard to see where an order is stuck.',
        ],
      },
      right: {
        title: 'Orchestration',
        summary: 'One orchestrator directs the steps',
        points: [
          'The orchestrator tells each service what to do and records its progress.',
          'The flow, timeouts and compensations live in one place, at the cost of one more component.',
        ],
      },
      caption: 'Past a few steps, most teams orchestrate. The order service orchestrates Snapgram Prints.',
    },
    { kind: 'heading', text: 'The transactional outbox' },
    {
      kind: 'prose',
      md: 'Each saga step must change its database and announce it, for example by publishing “order placed” to a [[message queue|message-queue]]. Doing these separately is a [[dual write|dual-write]]: crash between them, and the order exists but nobody hears about it. Publish first, and the event can announce an order that never committed.',
    },
    {
      kind: 'prose',
      md: 'The [[transactional outbox|transactional-outbox]] writes the event into an outbox table in the same local transaction as the order, so both commit or neither does. A separate relay then publishes new outbox rows, by polling the table or with [[change data capture|change-data-capture]] (CDC), which reads the database’s [[write-ahead log|write-ahead-log]].',
    },
    {
      kind: 'diagram',
      title: 'An outbox at work',
      caption: 'The order and its event commit together; a relay publishes the event.',
      spec: outbox,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson skips saga timeouts, ways to limit what missing isolation allows, and workflow engines. Compensations are retried, so they need [[idempotency keys|idempotency-key]]; [Idempotency](lesson:idempotency) covers them.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to keep a multi-step action all or nothing.',
    rows: [
      {
        option: 'One database transaction',
        goodAt: 'All or nothing and isolated, with nothing extra to build.',
        badAt: 'Only works when all the data lives in one database.',
        pickWhen: 'You can keep the data together, sometimes by redrawing service boundaries.',
      },
      {
        option: 'Two-phase commit',
        goodAt: 'All or nothing across databases.',
        badAt: 'Blocks while the coordinator is down, holds locks across the network, and needs every participant to support it.',
        pickWhen: 'A few databases you control, or a database that runs it internally.',
      },
      {
        option: 'Saga with choreography',
        goodAt: 'No central controller, so services stay loosely coupled.',
        badAt: 'The flow is hard to follow, and in-between states are visible.',
        pickWhen: 'Short flows of two or three steps.',
      },
      {
        option: 'Saga with orchestration',
        goodAt: 'The flow, timeouts and compensations live in one place.',
        badAt: 'One more component to run, and in-between states are still visible.',
        pickWhen: 'Longer flows with outside partners, such as Snapgram Prints.',
      },
    ],
  },
  realWorld: {
    title: 'The saga and outbox patterns',
    body: 'Chris Richardson’s pattern catalog at microservices.io presents the saga as the way to run transactions that span services: a sequence of local transactions, where compensating transactions undo the completed steps if one fails. It describes choreography, where each local transaction publishes events that trigger the next, and orchestration, where an orchestrator tells the participants what to run, and it lists the lack of isolation as a drawback.\n\nIts transactional outbox pattern stores each message in the database in the same transaction as the business data, and a separate process sends it to the message broker. The page warns that this relay might publish a message more than once, so consumers must be idempotent.',
    sourceUrl: 'https://microservices.io/patterns/data/saga.html',
    sourceLabel: 'Chris Richardson, “Pattern: Saga,” microservices.io',
  },
  interview: {
    whenToMention:
      'Whenever one user action changes data owned by two or more services, such as an order and a payment. Say that you avoid distributed transactions, run a saga with compensating actions, and publish events through an outbox.',
    sayItLikeThis: [
      'Each service owns its data, so the order runs as a saga: if the print shop rejects it, a compensating step refunds the payment.',
      'Events go through an outbox in the same transaction as the order, and consumers skip duplicates.',
    ],
    followUps: [
      {
        q: 'Why not use two-phase commit?',
        a: 'A participant that votes yes holds its locks until the coordinator decides, so a crashed coordinator stalls everyone. Every participant must also support the protocol, and an outside partner’s API will not.',
      },
      {
        q: 'What if a compensating action fails?',
        a: 'Retry it until it succeeds, so it must be idempotent, such as a refund keyed to the original charge. If it truly cannot succeed, the saga records the failure and alerts a person to fix it by hand.',
      },
      {
        q: 'What anomalies can a saga cause, and how do you limit them?',
        a: 'Other requests can see in-between states, such as an order that is paid but not printed. Mark records as pending until the saga finishes, run the steps most likely to fail first, and put steps that cannot be undone last.',
      },
    ],
    redFlags: [
      'Proposing one ACID transaction across services that each own their database.',
      'Writing to the database and then publishing to the broker as if both always succeed.',
      'Compensating by deleting records, such as removing a payment instead of refunding it.',
    ],
  },
  mistakes: [
    '**Dual writes.** Saving to the database and publishing to the broker separately means a crash in between loses the event, or announces something that never happened.',
    '**Compensations that are not idempotent.** Compensations get retried, so a refund that runs twice pays the customer twice.',
    '**Irreversible steps too early.** Put steps that cannot be undone, like sending the book to the printer, after the steps most likely to fail.',
    '**A choreography nobody can follow.** When many services react to each other’s events, no one can say where an order is stuck.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'The order service commits a new order, then crashes before publishing the “order placed” event. What happens without an outbox?',
      options: [
        {
          text: 'The order exists, but no other service hears about it, so the saga stalls',
          correct: true,
          why: 'The commit and the publish were separate steps, and the crash fell between them.',
        },
        {
          text: 'The database rolls the order back automatically',
          correct: false,
          why: 'The order had already committed, and a later crash does not undo a committed transaction.',
        },
        {
          text: 'The queue delivers the event twice',
          correct: false,
          why: 'The event was never published, so there is nothing to deliver at all.',
        },
        {
          text: 'The payment service charges the card anyway',
          correct: false,
          why: 'It only charges when it receives the event, which never arrives.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the Snapgram Prints saga in order when the print shop rejects the job.',
      items: ['Save the order as pending', 'Charge the card', 'Send the job to the print shop', 'Receive the rejection', 'Refund the charge', 'Mark the order canceled'],
      why: 'Forward steps run first. When one fails, the compensations run in reverse order, so the refund comes before the order is canceled.',
    },
    {
      kind: 'multi',
      prompt: 'Which statements about two-phase commit are true?',
      options: [
        {
          text: 'A participant that voted yes must wait for the coordinator’s decision',
          correct: true,
          why: 'Voting yes is a promise to commit if told to, so it cannot abort on its own.',
        },
        {
          text: 'Participants hold locks while they wait',
          correct: true,
          why: 'The prepared changes stay locked until the decision arrives, which stalls other requests.',
        },
        {
          text: 'It works with any outside partner’s API',
          correct: false,
          why: 'Every participant must implement the prepare and commit protocol, and most outside APIs do not.',
        },
        {
          text: 'It cannot block as long as the network is reliable',
          correct: false,
          why: 'A coordinator crash alone leaves prepared participants stuck, whatever the network does.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which is a good compensating action for a card charge?',
      options: [
        {
          text: 'A refund that references the original charge',
          correct: true,
          why: 'It undoes the effect while keeping both records, and keying it to the charge makes a retry safe.',
        },
        {
          text: 'Deleting the payment row',
          correct: false,
          why: 'The money has already moved. Deleting the record hides the charge instead of undoing it.',
        },
        {
          text: 'Rolling back the payment service’s transaction',
          correct: false,
          why: 'That transaction committed earlier, so there is nothing left to roll back.',
        },
        {
          text: 'Waiting until the customer complains',
          correct: false,
          why: 'The saga promises all or nothing in the end, so it must undo the charge itself.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Why must consumers of outbox events be idempotent?',
      options: [
        {
          text: 'The relay can publish an event more than once, for example after crashing before it marks the event as sent',
          correct: true,
          why: 'Delivery is at least once, so a consumer must recognize repeats and skip them.',
        },
        {
          text: 'The outbox table can lose events',
          correct: false,
          why: 'Events commit with the data in one transaction, so they are not lost; repeats are the problem.',
        },
        {
          text: 'Events arrive in a random order on purpose',
          correct: false,
          why: 'Order is a separate concern. Idempotency is about handling the same event twice.',
        },
        {
          text: 'It makes events arrive faster',
          correct: false,
          why: 'Idempotency changes how repeats are handled, not how quickly events are delivered.',
        },
      ],
    },
  ],
  takeaways: [
    'Once data lives in several services, no single transaction covers a business action, so a failure can leave it half done.',
    'Two-phase commit blocks when its coordinator fails, so most designs use sagas: local steps undone by compensating actions.',
    'Publish events through an outbox written in the same transaction as the data, and make consumers idempotent.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Choosing the order of steps.** Put the steps most likely to fail first, and the step that cannot be undone, sometimes called the pivot, last. For Snapgram Prints, checking that the photos are printable before charging the card would avoid most refunds.',
    },
    {
      kind: 'prose',
      md: '**Consensus under two-phase commit.** Databases such as Google’s Spanner run two-phase commit between groups of machines that each replicate with consensus, so the failure of one coordinator machine does not block for long. That works because one database controls every participant.',
    },
    {
      kind: 'prose',
      md: '**Workflow engines.** Orchestrated sagas often run on a durable workflow engine that records each completed step, so a crashed orchestrator resumes where it stopped instead of starting over.',
    },
  ],
  flashcards: [
    {
      front: 'Why can’t one database transaction cover a Snapgram Prints order?',
      back: 'The order, the payment and the print shop live in different systems, and a transaction covers only one database.',
    },
    {
      front: 'What is the blocking problem in two-phase commit?',
      back: 'Participants that voted yes cannot commit or abort on their own, so if the coordinator crashes, they hold their locks until it returns.',
    },
    {
      front: 'What is a saga?',
      back: 'A sequence of local transactions, one per service, with compensating actions that undo completed steps if a later one fails.',
    },
    {
      front: 'Choreography or orchestration: what is the difference?',
      back: 'In choreography, services react to each other’s events. In orchestration, one orchestrator tells each service what to do next.',
    },
    {
      front: 'What problem does the transactional outbox solve?',
      back: 'The dual write: the event is saved in the same transaction as the data, so a crash cannot lose it or announce a change that never committed.',
    },
    { front: 'Why must outbox consumers be idempotent?', back: 'The relay can publish an event more than once, so consumers must recognize repeats and skip them.' },
  ],
  related: ['databases-101', 'queues-and-streams', 'idempotency', 'event-driven', 'monolith-vs-microservices', 'consensus-leader-election', 'why-distributed-is-hard'],
  glossaryTerms: [
    'api',
    'transaction',
    'atomicity',
    'commit',
    'rollback',
    'microservices',
    'distributed-transaction',
    'partial-failure',
    'two-phase-commit',
    'coordinator',
    'saga',
    'compensating-action',
    'isolation',
    'choreography',
    'orchestration',
    'message-queue',
    'dual-write',
    'transactional-outbox',
    'change-data-capture',
    'write-ahead-log',
    'at-least-once',
    'idempotent',
    'idempotency-key',
  ],
};

export default lesson;
