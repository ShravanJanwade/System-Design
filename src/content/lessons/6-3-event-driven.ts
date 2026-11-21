import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: one event fanned out to every subscriber, a subscriber failing and catching up, and a new one joining. */
const fanOut: DiagramSpec = {
  grid: { cols: 3, rows: 6 },
  nodes: [
    { id: 'up', type: 'service', label: 'Upload service', x: 0, y: 2.5 },
    { id: 'stream', type: 'stream', label: 'Event stream', sublabel: 'photo uploaded', x: 1, y: 2.5 },
    { id: 'thumbs', type: 'worker', label: 'Thumbnails', x: 2, y: 0 },
    { id: 'feed', type: 'service', label: 'Feed', x: 2, y: 1 },
    { id: 'notify', type: 'service', label: 'Notifications', x: 2, y: 2 },
    { id: 'search', type: 'service', label: 'Search', x: 2, y: 3 },
    { id: 'mod', type: 'service', label: 'Moderation', x: 2, y: 4 },
    { id: 'memories', type: 'service', label: 'Memories', sublabel: 'new team', x: 2, y: 5 },
  ],
  edges: [
    { id: 'up-stream', from: 'up', to: 'stream', kind: 'async', label: 'publish' },
    { id: 's-thumbs', from: 'stream', to: 'thumbs', kind: 'async' },
    { id: 's-feed', from: 'stream', to: 'feed', kind: 'async' },
    { id: 's-notify', from: 'stream', to: 'notify', kind: 'async' },
    { id: 's-search', from: 'stream', to: 'search', kind: 'async' },
    { id: 's-mod', from: 'stream', to: 'mod', kind: 'async' },
    { id: 's-memories', from: 'stream', to: 'memories', kind: 'async' },
  ],
  // Phones: the upload service above the stream, with three subscribers down each side in the wide layout's order.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      up: { x: 1, y: 0 },
      thumbs: { x: 0, y: 1 },
      stream: { x: 1, y: 1 },
      feed: { x: 2, y: 1 },
      notify: { x: 0, y: 2 },
      search: { x: 2, y: 2 },
      mod: { x: 0, y: 3 },
      memories: { x: 2, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'Maya uploads a photo. The **upload service** saves it and publishes one event, “photo uploaded”, to the **event stream**. Then it answers Maya; it calls no other service.',
      flow: ['up-stream'],
    },
    {
      caption: 'The stream hands a copy of the event to every subscriber. Thumbnails, feed, notifications, search and moderation each do their own work, at the same time.',
      flow: [['s-thumbs', 's-feed', 's-notify', 's-search', 's-mod']],
    },
    {
      caption:
        'The **search** service goes down for an hour. Uploads keep working and the other four subscribers carry on, while the events meant for search wait in the stream.',
      fail: ['search'],
      flow: ['up-stream', ['s-thumbs', 's-feed', 's-notify', 's-mod']],
    },
    {
      caption: 'When search comes back, it reads on from where it stopped and catches up on the hour it missed. No event was lost, and the upload service never noticed.',
      flow: [{ edge: 's-search', tag: 'catching up' }],
    },
    {
      caption: 'A new team builds **Memories**, which resurfaces old photos. It subscribes to the same event, and the upload service does not change at all.',
      add: ['memories', 's-memories'],
      flow: ['up-stream', { edge: 's-memories', tag: 'new' }],
    },
  ],
};

/** Choreography: each service reacts to one event and publishes the next. */
const chain: SequenceSpec = {
  actors: [
    { id: 'up', type: 'service', label: 'Upload' },
    { id: 'stream', type: 'stream', label: 'Event stream' },
    { id: 'mod', type: 'service', label: 'Moderation' },
    { id: 'feed', type: 'service', label: 'Feed' },
    { id: 'notify', type: 'service', label: 'Notifications' },
  ],
  messages: [
    { from: 'up', to: 'stream', label: 'photo uploaded', kind: 'async', caption: 'The upload service publishes “photo uploaded” and is done.' },
    { from: 'stream', to: 'mod', label: 'photo uploaded', kind: 'async', caption: 'Moderation subscribes to it, so it receives the event and checks the image.' },
    {
      from: 'mod',
      to: 'stream',
      label: 'photo approved',
      kind: 'async',
      caption: 'The image is fine, so moderation publishes an event of its own, “photo approved”. It does not know who will use it.',
    },
    { from: 'stream', to: 'feed', label: 'photo approved', kind: 'async', caption: 'The feed service waits for approval, then adds the post to the followers’ feeds.' },
    { from: 'feed', to: 'stream', label: 'post added', kind: 'async', caption: 'With the feeds updated, it publishes “post added”.' },
    {
      from: 'stream',
      to: 'notify',
      label: 'post added',
      kind: 'async',
      caption: 'Notifications reacts to “post added”, so followers hear about the post only once it is really in their feeds.',
    },
  ],
};

const lesson: Lesson = {
  id: 'event-driven',
  module: 'm6',
  order: 3,
  title: 'Event-driven architecture',
  idea: 'In an event-driven system, a service announces what has happened as an event, and any number of other services react on their own, so the producer never needs to know who is listening.',
  minutes: 15,
  prerequisites: ['queues-and-streams', 'service-communication'],
  outcomes: [
    'Tell events from commands, and choose the right one for each message.',
    'Use publish-subscribe and choreography so that one action triggers many services without the producer knowing about them.',
    'Plan for the pitfalls: duplicates, events out of order, effects that arrive before their cause, and flows that are hard to trace.',
  ],
  analogy: {
    title: 'A newspaper and its subscribers',
    body: 'A newspaper reports what happened and prints it once. It does not phone each reader with instructions. One subscriber reads the weather and moves a picnic, another checks the football scores, and a third ignores the paper completely; the newsroom never knows. New readers subscribe without the editor changing a single story.\n\nThat freedom has a cost. If a story was wrong, the correction appears in a later edition, after some readers have already acted on it. And if you want to know why a hundred people turned up at a park on Saturday, no single place records which story sent them there.',
  },
  whyItMatters:
    'Snapgram now runs about forty services. When Maya uploads a photo, five things must follow: thumbnails are made, the photo goes into her followers’ feeds, followers get a notification, search indexes the caption, and moderation checks the image. Today the upload service calls each of those services in turn and waits for each one.\n\nEvery call adds to the upload time, and when the search service is down, uploads fail even though the photo was saved. Worse, every new feature needs a change to the upload service: the moderation team waited two weeks for the upload team to add their call. The upload service has become the one place that knows about everybody, and everybody waits on it.',
  body: [
    {
      kind: 'prose',
      md: 'The fix is to turn the calls around. Instead of telling five services what to do, the upload service announces one fact: this photo was uploaded. Each service that cares listens for that fact and does its own work. A system built mainly this way, with services reacting to each other’s announcements instead of calling each other, follows an [[event-driven architecture|event-driven-architecture]].',
    },
    { kind: 'heading', text: 'Events and commands' },
    {
      kind: 'prose',
      md: 'An [[event|event]] is a record that something happened, named in the past tense: “photo uploaded”, “payment captured”. A [[command|command]] asks one particular service to do something: “make thumbnails for photo 42”. The difference is about who decides. With a command, the sender decides what happens next; with an event, each receiver decides, and the sender does not even know who the receivers are.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Command',
        summary: '“Make thumbnails for photo 42”',
        points: [
          'An instruction for one service, which is expected to carry it out.',
          'The receiver can refuse it, for example when the photo no longer exists.',
          'Adding a new step means changing the sender.',
        ],
      },
      right: {
        title: 'Event',
        summary: '“Photo 42 uploaded”',
        points: [
          'A fact about the past, published for any service that cares, including none.',
          'Nobody can refuse it: it already happened.',
          'Adding a new reaction means adding a subscriber; the sender stays the same.',
        ],
      },
      caption: 'Both travel as messages. What differs is who decides what happens next.',
    },
    {
      kind: 'prose',
      md: 'Both are useful. Use a command when exactly one service must do the work and you want to know if it failed. Use an event when several services may react, now or in the future. Be wary of an event named like an instruction, such as “send welcome email”: it is a command in disguise, and if nobody handles it, nothing tells you.',
    },
    { kind: 'heading', text: 'Publish once, subscribe many' },
    {
      kind: 'prose',
      md: 'Events travel by [[publish-subscribe|publish-subscribe]] messaging, which you met in [Queues and streams](lesson:queues-and-streams). The **upload service** publishes each event once to an [[event stream|event-stream]], and every subscribing service reads it as its own [[consumer group|consumer-group]], keeping its own place in the stream, its [[offset|offset]]. A slow or broken subscriber falls behind without holding anyone else back.',
    },
    {
      kind: 'diagram',
      title: 'One event, many reactions',
      caption: 'The upload service publishes one event, and each subscriber reacts in its own time. Step through a failure and a new subscriber.',
      spec: fanOut,
    },
    {
      kind: 'prose',
      md: 'Two details make this safe. The upload service saves the photo and the event in the same database transaction, using the [[transactional outbox|transactional-outbox]] from [Distributed transactions](lesson:distributed-transactions), so a crash cannot store one without the other. And because the stream keeps events for days (often a week by default), a subscriber can be down, slow or brand new and still see every event. The services are [[decoupled|decoupling]] in time as well as in code.',
    },
    { kind: 'heading', text: 'Choreography' },
    {
      kind: 'prose',
      md: 'Subscribers can publish events of their own, and other services can react to those. When a whole process runs like this, with no service in charge, it is called [[choreography|choreography]]. The alternative, [[orchestration|orchestration]], puts one coordinator in charge of telling each service what to do next.',
    },
    {
      kind: 'sequence',
      title: 'Choreography after an upload',
      caption: 'Each service reacts to one event and publishes the next. No service knows the whole chain.',
      spec: chain,
    },
    {
      kind: 'prose',
      md: 'Choreography keeps each service simple and independent, and a new step is just a new subscriber. The cost is that the process exists only as the sum of its subscriptions. To learn what happens after an upload, someone has to read the code of every service, and nothing tracks how far one photo has got.',
    },
    { kind: 'heading', text: 'The pitfalls' },
    {
      kind: 'prose',
      md: '**Effects before causes.** Subscribers run at their own speed, so their results appear in any order. If notifications reacted to “photo uploaded”, a follower could tap the alert a second later and find no photo, because the feed was not updated yet. That is why notifications listen for “post added” instead: react to the event that means what you need.',
    },
    {
      kind: 'prose',
      md: '**Duplicates.** Streams deliver [[at least once|at-least-once]]: a consumer that crashes after doing its work but before saving its offset sees the same event again. Make every consumer [[idempotent|idempotent]], for example by storing the identifier (ID) of each event it has handled and skipping repeats, which is [[deduplication|deduplication]].',
    },
    {
      kind: 'prose',
      md: '**Ordering.** A stream keeps order only within one [[partition|partition]]. If “photo deleted” lands on a different partition from “photo uploaded”, search can process the delete first and then index a photo that no longer exists. Publish every event about a photo with the photo’s ID as its key, so they share a partition and stay in order.',
    },
    {
      kind: 'prose',
      md: '**Debugging a chain nobody owns.** When a post never reaches anyone’s feed, five teams can each say their part worked. Give every event a [[correlation ID|correlation-id]] that starts at the upload and is copied into each event it causes, so [[distributed tracing|distributed-tracing]] and logs can follow one photo through every service. Watch each subscriber’s [[consumer lag|consumer-lag]] too, and give every flow an owner.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out how events are described and versioned with schemas, how stream processors offer stronger delivery guarantees, and the choice between events that carry only an ID and events that carry the full data. The last one is in Go deeper, and [Batch vs. stream processing](lesson:batch-vs-stream) picks up stream processing.',
    },
  ],
  tradeoffs: {
    caption: 'Ways for one action to trigger work in other services.',
    rows: [
      {
        option: 'Direct calls',
        goodAt: 'Simple to follow, and the caller learns at once whether each step worked.',
        badAt: 'The caller waits for every service and fails when any of them is down, and each new step means changing the caller.',
        pickWhen: 'You need the answer before you can reply, such as checking that a username is free.',
      },
      {
        option: 'Commands through a queue',
        goodAt: 'The work happens later, with retries, and spikes are absorbed.',
        badAt: 'The sender still knows every receiver and must change to add one.',
        pickWhen: 'One known service owns a slow job, such as sending a receipt email.',
      },
      {
        option: 'Events with choreography',
        goodAt: 'New reactions are new subscribers, and a broken subscriber holds up no one.',
        badAt: 'The flow is spread across services, so ordering, duplicates and debugging need deliberate work.',
        pickWhen: 'Several independent services react to the same fact.',
      },
      {
        option: 'Events with an orchestrator',
        goodAt: 'One place holds the whole process, its progress and its failure handling.',
        badAt: 'The orchestrator is one more service, and it must change whenever the process does.',
        pickWhen: 'Steps must run in a set order with undo steps, such as a Prints order.',
      },
    ],
  },
  realWorld: {
    title: 'Kafka’s first job: activity tracking',
    body: 'Apache Kafka, a widely used open-source event streaming platform, describes its original use case in its documentation: rebuilding a user activity tracking pipeline as a set of real-time publish-subscribe feeds. Site activity, such as page views and searches, is published to central topics, which are named streams, one for each type of activity. Many systems subscribe to those feeds, including real-time processing, real-time monitoring and loading into offline data warehouses for reporting.\n\nThe documentation adds that activity tracking is often very high volume, because each page view can generate many activity messages. The shape is the same as Snapgram’s: each fact is published once, and every system that needs it subscribes.',
    sourceUrl: 'https://kafka.apache.org/uses',
    sourceLabel: 'Apache Kafka documentation, “Use cases”',
  },
  interview: {
    whenToMention:
      'When one action has several independent consequences, such as an upload that feeds thumbnails, feeds, notifications and search. Say which steps must finish before you reply to the user (keep those as direct calls) and which can happen afterwards (publish an event). Then name the pitfalls before the interviewer does.',
    sayItLikeThis: [
      'The upload service saves the photo and writes a “photo uploaded” event to an outbox in the same transaction; thumbnails, feed, notifications and search each consume it with their own consumer group.',
      'Delivery is at least once, so every consumer is idempotent, keyed by event ID, and events are partitioned by photo ID so each photo’s events stay in order.',
      'Notifications listen for “post added”, not “photo uploaded”, so nobody is told about a post they can’t see yet.',
    ],
    followUps: [
      {
        q: 'How do you make sure the event is published if the upload service crashes right after saving the photo?',
        a: 'I write the event to an outbox table in the same database transaction as the photo, and a relay publishes it afterwards. A crash can then cause the event to be published twice but never lost, which the idempotent consumers already handle.',
      },
      {
        q: 'Why not have the upload service call the five services directly?',
        a: 'Then every upload waits for the slowest of them and fails when any is down, and each new feature changes the upload service. With an event, the upload depends only on its database and the stream, and new consumers need no change to the producer. Steps the user must wait for, such as saving the photo, stay synchronous.',
      },
      {
        q: 'A photo never showed up in anyone’s feed. How would you find out why?',
        a: 'Look up the photo’s correlation ID in the traces and logs to see which services handled its events and where the chain stopped. Then check that subscriber’s consumer lag and its [[dead-letter queue|dead-letter-queue]]. An owner for each flow and a list of who publishes and consumes each event turn this from guesswork into a lookup.',
      },
    ],
    redFlags: [
      'Using an event where the caller needs an answer right away, such as a login check.',
      'Assuming events arrive exactly once and in order across the whole system.',
      'Naming events as instructions, such as “send email”, so commands hide behind events.',
    ],
  },
  mistakes: [
    '**Commands dressed as events.** An event called “send welcome email” really tells one service what to do, and if that service stops listening, the work silently stops.',
    '**Assuming global order.** Order holds only within one partition, and different subscribers finish at different times, so effects can show up before their causes.',
    '**Consumers that are not idempotent.** Duplicates are normal with at-least-once delivery, and a consumer that sends a notification for each copy sends two.',
    '**Breaking an event’s shape.** Renaming or removing a field breaks consumers you may not know about; change events in a [[backward-compatible|backward-compatibility]] way, such as adding optional fields.',
    '**Events for everything.** A step that needs an answer, such as checking a password, gets slower and harder to debug when it becomes a chain of events.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which of these messages is an event rather than a command?',
      options: [
        {
          text: '“Photo 42 uploaded”',
          correct: true,
          why: 'It states a fact in the past tense and asks nothing of anyone; any number of services, or none, may react.',
        },
        {
          text: '“Make thumbnails for photo 42”',
          correct: false,
          why: 'It asks one specific service to do a job, so it is a command, even if it travels through a queue.',
        },
        {
          text: '“Send Maya a push notification”',
          correct: false,
          why: 'It is an instruction for the notification service: a command, whatever it is called.',
        },
        {
          text: '“Charge $45 for order 1042”',
          correct: false,
          why: 'The sender wants this exact work done and needs to know if it fails, which makes it a command.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram’s search service was down for an hour while photos kept being uploaded. Which statements are true?',
      options: [
        {
          text: 'Uploads kept working',
          correct: true,
          why: 'The upload service only publishes to the stream, so it does not depend on search being up.',
        },
        {
          text: 'Search catches up from its saved offset when it returns',
          correct: true,
          why: 'Its consumer group remembers how far it read, and the stream still holds the events it missed.',
        },
        {
          text: 'The other subscribers had to wait for search',
          correct: false,
          why: 'Each consumer group reads at its own pace, so the others carried on.',
        },
        {
          text: 'Search has lost that hour’s events for good',
          correct: false,
          why: 'The stream keeps events for days, so they are still there unless the outage lasts longer than the retention period.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the life of one “photo uploaded” event in order.',
      items: [
        'The upload service saves the photo and the event in one transaction',
        'A relay publishes the event from the outbox to the stream',
        'Each subscribed consumer group receives its own copy',
        'Each consumer does its work, then saves its offset',
      ],
      why: 'The outbox makes saving and publishing safe together. Saving the offset after the work is what makes delivery at least once: a crash in between means the event is processed again.',
    },
    {
      kind: 'single',
      prompt: 'Followers get “Ana posted a photo” alerts, tap them, and see “photo not found” for a few seconds. What is the best fix?',
      options: [
        {
          text: 'Have notifications react to an event published once the post is visible, such as “post added”',
          correct: true,
          why: 'Reacting to the event that means “ready” removes the race, instead of hoping one subscriber is slower than another.',
        },
        {
          text: 'Make the notification service faster',
          correct: false,
          why: 'A faster notifier makes the race worse: the alert arrives even earlier, before the feed is ready.',
        },
        {
          text: 'Delay every notification by 10 seconds',
          correct: false,
          why: 'It hides the race most of the time but fails whenever the feed is slow, and it delays every alert for everyone.',
        },
        {
          text: 'Put notifications and feed in the same consumer group',
          correct: false,
          why: 'Within one group each event goes to only one member, so one of the two services would miss it.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Before the change, an upload succeeded only if all five services answered. Each is up 99.9% of the time, and they fail independently. Using a 720-hour month, roughly how many hours a month was at least one of them down, failing uploads?',
      answer: 3.6,
      unit: 'hours',
      tolerance: 1.15,
      solution: [
        'All five are up at the same time 0.999 × 0.999 × 0.999 × 0.999 × 0.999 ≈ 0.995 of the time.',
        'So at least one is down about 0.5% of the time.',
        '0.005 × 720 hours ≈ 3.6 hours a month, five times the 0.72 hours of a single service.',
        'With an event, the upload no longer needs any of the five to be up.',
      ],
    },
  ],
  takeaways: [
    'An event records a fact that already happened and lets any number of services react; a command asks one service to do one thing.',
    'Publish-subscribe lets you add reactions without touching the producer, and choreography chains services through events with no one in charge.',
    'Design for the costs from the start: idempotent consumers for duplicates, keys for ordering, the right event for each reaction, and correlation IDs for tracing.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Four things called event-driven.** [Martin Fowler’s article on what people mean by event-driven](https://martinfowler.com/articles/201701-event-driven.html) separates four patterns that share the name: event notification, event-carried state transfer, event sourcing, and command query responsibility segregation (CQRS). Mixing them up is a common source of confusion in design discussions. The last two are the subject of [CQRS and event sourcing](lesson:cqrs-event-sourcing).',
    },
    {
      kind: 'prose',
      md: '**Thin events or fat events.** A thin event carries little more than an ID, such as “photo 42 uploaded”, so each subscriber calls the photo service for details, which adds load and can return data newer than the event. A fat event carries the data its subscribers need, so they can keep their own copies and never call back. The cost is a bigger contract that is harder to change.',
    },
    {
      kind: 'prose',
      md: '**Events are a contract.** Once other teams consume an event, its fields are a public interface. Many teams describe each event type with a schema and check every change against it before publishing, so a producer cannot break its consumers by accident.',
    },
  ],
  flashcards: [
    {
      front: 'What is the difference between an event and a command?',
      back: 'An event records something that already happened and leaves the reaction to the receivers; a command asks one service to do something specific.',
    },
    {
      front: 'What does publish-subscribe add over a plain work queue?',
      back: 'Every subscriber gets its own copy of each event, so many services can react to the same fact independently.',
    },
    {
      front: 'What is choreography?',
      back: 'A process with no coordinator, where each service reacts to events and publishes its own, so the flow emerges from the subscriptions.',
    },
    {
      front: 'Why must event consumers be idempotent?',
      back: 'Delivery is at least once, so a consumer may see the same event twice; handling it twice must have the same effect as handling it once.',
    },
    {
      front: 'How do you keep the events about one photo in order?',
      back: 'Publish them with the photo’s ID as the key, so they land on one partition, where order is kept.',
    },
    {
      front: 'How do you debug a flow that crosses many services through events?',
      back: 'Carry a correlation ID through every event the flow causes and follow it in traces and logs; watch each subscriber’s consumer lag.',
    },
    {
      front: 'When should a step stay a direct call instead of becoming an event?',
      back: 'When the caller needs the answer before it can continue, such as checking a password or that a username is free.',
    },
  ],
  related: [
    'queues-and-streams',
    'service-communication',
    'cqrs-event-sourcing',
    'distributed-transactions',
    'idempotency',
    'time-and-ordering',
    'batch-vs-stream',
    'observability',
  ],
  glossaryTerms: [
    'event-driven-architecture',
    'event',
    'command',
    'publish-subscribe',
    'event-stream',
    'consumer-group',
    'offset',
    'transactional-outbox',
    'decoupling',
    'choreography',
    'orchestration',
    'at-least-once',
    'idempotent',
    'deduplication',
    'partition',
    'correlation-id',
    'distributed-tracing',
    'consumer-lag',
    'dead-letter-queue',
    'backward-compatibility',
  ],
};

export default lesson;
