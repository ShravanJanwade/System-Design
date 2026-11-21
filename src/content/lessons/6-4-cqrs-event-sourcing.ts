import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a command on the write side, a projector feeding a read model, a query, and a new read model built by replay. */
const commandsAndQueries: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'app', type: 'client', label: 'Maya’s app', x: 0, y: 1 },
    { id: 'orders', type: 'service', label: 'Order service', sublabel: 'write model', x: 1, y: 0 },
    { id: 'store', type: 'sqlDb', label: 'Event store', sublabel: 'append-only', x: 2, y: 0 },
    { id: 'proj', type: 'worker', label: 'Projector', x: 2, y: 1 },
    { id: 'page', type: 'nosqlDb', label: 'Order page', sublabel: 'read model', x: 1, y: 2 },
    { id: 'timings', type: 'nosqlDb', label: 'Print timings', sublabel: 'new read model', x: 2, y: 2 },
  ],
  edges: [
    { id: 'app-orders', from: 'app', to: 'orders', kind: 'sync', label: 'command' },
    { id: 'orders-store', from: 'orders', to: 'store', kind: 'sync', label: 'append' },
    { id: 'store-proj', from: 'store', to: 'proj', kind: 'async' },
    { id: 'proj-page', from: 'proj', to: 'page', kind: 'sync' },
    { id: 'app-page', from: 'app', to: 'page', kind: 'sync', label: 'query' },
    { id: 'proj-timings', from: 'proj', to: 'timings', kind: 'sync' },
  ],
  // Phones: the app on top, the write side down the left, the projector feeding the read models on the right.
  narrow: {
    grid: { cols: 2, rows: 4 },
    positions: {
      app: { x: 0.5, y: 0 },
      orders: { x: 0, y: 1 },
      page: { x: 1, y: 1 },
      store: { x: 0, y: 2 },
      proj: { x: 1, y: 2 },
      timings: { x: 1, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'Maya taps “Request refund”. Her app sends a command to the **order service**, the write model, which loads the order’s events from the **event store** and replays them to get the current state.',
      flow: ['app-orders', 'orders-store', '<orders-store'],
    },
    {
      caption: 'The rules pass: the book was delivered, and $15 is less than she paid. The service appends one new event, “refund requested”. Nothing is updated in place.',
      flow: [{ edge: 'orders-store', tag: 'event 6' }],
    },
    {
      caption: 'The **projector** reads each new event and updates the **order page** read model: one ready-made record per order, shaped exactly like the screen.',
      flow: ['store-proj', 'proj-page'],
    },
    {
      caption: 'When Maya opens her order page, the app reads that one record. The query never touches the event store and never replays anything.',
      flow: ['app-page', '<app-page'],
    },
    {
      caption:
        'Months later, operations asks how long printing takes. Replaying every order’s events from the very first one fills a new read model, **print timings**, with history it was never sent.',
      add: ['timings', 'proj-timings'],
      flow: ['store-proj', { edge: 'proj-timings', tag: 'replay' }],
    },
  ],
};

/** The read model lags: the command has succeeded, but the page has not caught up. */
const readOwnWrite: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Maya’s app' },
    { id: 'orders', type: 'service', label: 'Order service' },
    { id: 'proj', type: 'worker', label: 'Projector' },
    { id: 'page', type: 'nosqlDb', label: 'Order page' },
  ],
  messages: [
    {
      from: 'app',
      to: 'orders',
      label: 'request refund',
      kind: 'sync',
      caption: 'Maya’s app sends the command. The order service checks the rules and appends event 6.',
    },
    { from: 'orders', to: 'app', label: 'accepted, version 6', kind: 'reply', caption: 'It answers at once, with the order’s new version number.' },
    { from: 'app', to: 'page', label: 'get order', kind: 'sync', caption: 'The app reloads the order page from the read model…' },
    {
      from: 'page',
      to: 'app',
      label: 'version 5: delivered',
      kind: 'reply',
      caption: '…which has not applied event 6 yet. Shown as it is, the page would tell Maya her request never happened, and she might tap again.',
    },
    {
      from: 'proj',
      to: 'page',
      label: 'apply event 6',
      kind: 'async',
      caption:
        'A moment later the projector applies event 6 and the read model catches up. Until then, the app shows “Refund requested” from the command’s answer, because it knows version 6 is stored.',
    },
  ],
};

const lesson: Lesson = {
  id: 'cqrs-event-sourcing',
  module: 'm6',
  order: 4,
  title: 'CQRS and event sourcing',
  idea: 'Command query responsibility segregation (CQRS) splits the model that changes data from the models that read it, and event sourcing stores every change as an event, so the current state and every read model can be rebuilt by replaying the log.',
  minutes: 15,
  prerequisites: ['event-driven', 'denormalization'],
  outcomes: [
    'Explain how CQRS separates a write model that checks commands from read models shaped for each screen.',
    'Derive an order’s state by replaying its events, and fix a mistake by appending a correcting event.',
    'Decide when CQRS and event sourcing are worth their cost, and when they are overkill.',
  ],
  analogy: {
    title: 'A bank statement and your balance',
    body: 'Your bank does not just store your balance. It keeps a statement: every deposit, payment and fee, in order, and your balance is what you get by adding them up. The statement also answers questions the balance cannot, such as how much you had on the 3rd and where the money went.\n\nWhen the bank charges you twice by mistake, nobody rubs out a line. It adds a new one, a reversal, and the balance comes right while the history still shows what happened. Your banking app, the monthly statement and the year-end tax summary are different views, all computed from the same lines.',
  },
  whyItMatters:
    'Snapgram Prints has grown, and each order is still one row in the order service’s database, with a status column overwritten at every step: placed, paid, printed, shipped, delivered. The order page joins that row with the payment and shipping tables on every view, and it has become one of the slowest pages in the app. Maya’s photo book for her mother arrives with two blurry pages, and she asks for a $15 refund.\n\nThat evening she writes to support: her order page says “Refunded $30”, but her bank shows one refund of $15. Support asks the team what happened to the order. The row says `amount_refunded = 30` and nothing more: no record of which step wrote it, or when, because each update replaced the one before.',
  body: [
    {
      kind: 'prose',
      md: '[[Event sourcing|event-sourcing]] changes what you store. Instead of one row that is overwritten, each order gets its own stream of [[events|event]] in an [[event store|event-store]], and the stream only grows: new events are appended, and old ones never change. The order’s current state is not stored at all. It is derived by replaying the events in order, starting from nothing.',
    },
    {
      kind: 'annotated',
      title: 'Order 1042 as events',
      caption: 'Each line is a fact. Replaying them in order gives the current state.',
      lines: [
        { code: '1  OrderPlaced      total $45', note: 'Status placed, $45 due.' },
        { code: '2  PaymentCaptured  $45', note: 'Paid $45.' },
        { code: '3  BookPrinted', note: 'Status printed.' },
        { code: '4  BookShipped', note: 'Status shipped.' },
        { code: '5  BookDelivered', note: 'Status delivered.' },
        { code: '6  RefundRequested  $15, blurry pages', note: 'A $15 refund requested.' },
        { code: '7  RefundIssued     $15', note: 'Refunded $15.' },
        { code: '8  RefundIssued     $15', note: 'Refunded $30: the same refund again, a minute later.' },
      ],
    },
    {
      kind: 'prose',
      md: 'Now support’s question has an answer. Events 7 and 8 record the same $15 refund a minute apart: the support tool timed out and retried, while the payment provider, protected by an [[idempotency key|idempotency-key]], refunded only once. The old row kept only the total, but the events show every step, in order, with its time. Kept this way, the history doubles as an [[audit trail|audit-trail]].',
    },
    { kind: 'heading', text: 'Separate models for writing and reading' },
    {
      kind: 'prose',
      md: 'Replaying is fine for one order, but the order page needs an instant answer, and support wants to search every order shipped yesterday. A pile of event streams cannot answer that quickly. So event sourcing almost always comes with [[CQRS|cqrs]]: a [[write model|write-model]] handles [[commands|command]] and records events, while separate [[read models|read-model]] answer queries.',
    },
    {
      kind: 'diagram',
      title: 'Commands in, queries out',
      caption: 'The write side records events, and a projector turns them into read models shaped for each screen. Step through a refund request.',
      spec: commandsAndQueries,
    },
    {
      kind: 'prose',
      md: 'Each read model is built by its own [[projection|projection]]: code that turns events into exactly the shape one screen or query needs, such as the order page, a support search or a finance report. Read models are [[denormalized|denormalization]] copies, so they are [[derived data|derived-data]]: each can live in whatever database suits it, scale on its own, and be deleted and rebuilt from the log at any time. CQRS does not require event sourcing, though: in [Denormalization](lesson:denormalization), the profile read model was fed by changes to ordinary tables.',
    },
    {
      kind: 'prose',
      md: 'The price is lag. A projector updates its read model a moment after the event is stored, so read models are [[eventually consistent|eventual-consistency]], and Maya can refresh before her own change has arrived.',
    },
    {
      kind: 'sequence',
      title: 'Reading your own write',
      caption: 'The command has succeeded, but the read model has not caught up yet.',
      spec: readOwnWrite,
    },
    {
      kind: 'prose',
      md: 'Showing users their own changes from what the write side told them, while everything else catches up, gives [[read-your-writes|read-your-writes]] consistency, which you met in [Replication lag](lesson:replication-lag).',
    },
    { kind: 'heading', text: 'Fixing mistakes by appending' },
    {
      kind: 'prose',
      md: 'Event 8 is wrong, but deleting it would erase the evidence that the order said $30 for a day. Instead, support appends a [[compensating event|compensating-event]]: event 9, “refund record voided”, which points at event 8. Replaying all nine events gives $15 refunded, the read models update as they do for any event, and the history keeps both the mistake and its correction.',
    },
    {
      kind: 'prose',
      md: 'The log also answers questions about the past: replay up to last Tuesday to see exactly what the order page showed then. And when a projector has a bug, you fix its code and rebuild its read model from the events, which were right all along.',
    },
    { kind: 'heading', text: 'Keeping replays fast' },
    {
      kind: 'prose',
      md: 'A Prints order has about ten events, so replaying one takes well under a millisecond (ballpark). Streams that grow long, such as an account with years of activity, use a [[snapshot|snapshot]]: every few hundred or thousand events, save the derived state, then load the latest snapshot and replay only the events after it. Snapshots are a cache, so you can throw them away and rebuild them from the log.',
    },
    { kind: 'heading', text: 'When it is overkill' },
    {
      kind: 'prose',
      md: 'Likes need none of this. There are billions of them, each is a simple yes or no, and nobody will ever ask for the history of a like. Event-sourcing likes would add an event store, projectors, versioned events and lag, and buy nothing. Keep them as plain [[create, read, update and delete|crud]] (CRUD) rows, and save event sourcing for the parts where the history is the point: money, orders, and anything people dispute.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out how the write side stops two commands from changing one order at the same moment, how stored events change shape over the years, and how to delete personal data from a log that never forgets. All three are in Go deeper.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'event-replay',
      title: 'Replay a Prints order',
      caption:
        'Step through the events of Maya’s order and watch the state and her order page build up. Find the refund recorded twice, fix it by appending a correcting event, then build a new read model from the same log.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to store Prints orders, from simplest to most powerful.',
    rows: [
      {
        option: 'One table, updated in place (CRUD)',
        goodAt: 'Simple and familiar, and reads always see the latest state.',
        badAt: 'Each update erases the one before, and one schema must serve every screen.',
        pickWhen: 'History does not matter, as for likes, profiles and settings.',
      },
      {
        option: 'CRUD plus an audit table',
        goodAt: 'Keeps a history of changes with little new machinery.',
        badAt: 'The audit table is a side copy that state is never rebuilt from, so it can drift or miss changes.',
        pickWhen: 'You must show a history, for example to auditors, but will never replay it.',
      },
      {
        option: 'CQRS with read models',
        goodAt: 'Each screen gets a read model shaped and scaled for it, while writes stay simple.',
        badAt: 'Read models lag behind writes, and projectors are more code to run and watch.',
        pickWhen: 'Reads far outnumber writes or need very different shapes, as with profile counts.',
      },
      {
        option: 'Event sourcing with CQRS',
        goodAt: 'Full history, replays for debugging, and new read models built from old events.',
        badAt: 'The hardest to build and change: versioned events, snapshots, lag and deleting personal data.',
        pickWhen: 'The history is the product: payments, orders, ledgers and anything people dispute.',
      },
    ],
  },
  realWorld: {
    title: 'LMAX: a trading platform that replays its inputs',
    body: 'LMAX, a retail financial trading platform, is described in Martin Fowler’s 2011 article “The LMAX Architecture”. Its core, the Business Logic Processor, runs entirely in memory using event sourcing, and the article reports that it can handle 6 million orders per second on a single thread. Because the input events are kept in a durable store, the processor’s state can be recreated at any time by replaying them.\n\nTo avoid replaying from the very beginning, LMAX takes a snapshot every night during quiet periods, so a restart loads a recent snapshot and replays a day’s worth of events. Snapgram’s scale is far smaller, but the idea is the same: the log is the truth, and everything else can be rebuilt from it.',
    sourceUrl: 'https://martinfowler.com/articles/lmax.html',
    sourceLabel: 'Martin Fowler, “The LMAX Architecture,” 2011',
  },
  interview: {
    whenToMention:
      'When the design involves money, orders or anything people dispute later, or when one kind of write feeds very different reads. Bring up CQRS when reads and writes differ in shape or volume, and event sourcing only for the parts where history matters. Say which parts you are not event-sourcing, too.',
    sayItLikeThis: [
      'Orders are event-sourced: each order is an append-only stream of events, and its state is a replay of that stream, which also gives support a full audit trail.',
      'The order page reads from a read model that a projector keeps up to date, so it is one lookup; it can lag by a second, so the app shows the user’s own change from the command’s response.',
      'Likes stay plain CRUD: there are billions of them, and nobody needs their history.',
    ],
    followUps: [
      {
        q: 'Two support agents refund the same order at the same moment. What stops a double refund?',
        a: '[[Optimistic concurrency control|optimistic-concurrency]] on the stream. Both load the order at version 7 and append with “expected version 7”; the store accepts the first and rejects the second, which reloads, sees the refund already requested, and stops.',
      },
      {
        q: 'Replaying a long stream is slow. What do you do?',
        a: 'Save a snapshot every so many events and replay only what came after the latest one. Snapshots are a cache, so they can be rebuilt from the log at any time. For short streams, such as an order with ten events, you don’t need them.',
      },
      {
        q: 'How would you change the shape of an event that is already stored millions of times?',
        a: 'Never edit the stored events. Add new fields with defaults so old events still read correctly, and for bigger changes add a new version of the event type and [[upcast|upcasting]] old versions as they are read. Then rebuild any read model whose logic changed.',
      },
    ],
    redFlags: [
      'Event-sourcing the whole system, likes and settings included, with no reason.',
      'Fixing a mistake by editing or deleting stored events.',
      'Serving every page view by replaying events instead of from a read model.',
      'Forgetting that read models lag, so users don’t see their own changes.',
    ],
  },
  mistakes: [
    '**Event-sourcing everything.** Most data has no useful history, so an event store, projectors and versioned events there are pure cost.',
    '**Editing the log.** Changing a stored event destroys the audit trail and makes replays disagree with what really happened; append a correcting event instead.',
    '**Events that hide intent.** “Status set to 6” says nothing; “refund requested, $15, blurry pages” is what support and future read models need.',
    '**Side effects in projectors.** A projector that sends emails sends them all again when you rebuild its read model; keep side effects out of replays.',
    '**Ignoring the lag.** Maya requests a refund, the page still says “Delivered”, and she taps again; show users their own changes from the command’s response.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'A Prints order’s events are: placed ($45), paid ($45), refund issued ($15), refund issued ($15, the same refund recorded twice), and a correction that voids the duplicate. What does a full replay say was refunded?',
      options: [
        { text: '$15', correct: true, why: 'The correction cancels the duplicate record, so one $15 refund remains.' },
        {
          text: '$30',
          correct: false,
          why: 'That is the state before the correction. A full replay applies every event, including the correction.',
        },
        { text: '$0', correct: false, why: 'The correction voids only the duplicate record, not the real refund.' },
        { text: '$45', correct: false, why: 'Only refund records add to the amount refunded, and once corrected they add up to $15.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about CQRS are true?',
      options: [
        {
          text: 'Commands go to a write model that checks the business rules',
          correct: true,
          why: 'Rules such as “refund no more than was paid” are enforced on the write side, before any event is stored.',
        },
        {
          text: 'Read models can use a different database and shape from the write side',
          correct: true,
          why: 'Each read model is built for its queries, such as one ready-made record per order page.',
        },
        {
          text: 'CQRS requires event sourcing',
          correct: false,
          why: 'Read models can also be fed from ordinary tables, through an outbox or change data capture.',
        },
        {
          text: 'A read model reflects a command the instant it succeeds',
          correct: false,
          why: 'Read models are updated after the event is stored, so they lag a little behind.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the handling of a “Request refund” command in order.',
      items: [
        'Load the order’s events from the event store',
        'Replay them to get the current state',
        'Check the business rules against that state',
        'Append a “refund requested” event',
        'Update the order page read model from the new event',
      ],
      why: 'The rules are checked against state derived from the events, and only a command that passes becomes an event. Read models follow once the event is stored.',
    },
    {
      kind: 'single',
      prompt: 'Which Snapgram feature is the best fit for event sourcing?',
      options: [
        {
          text: 'Prints orders, which involve money, refunds and disputes',
          correct: true,
          why: 'Money and disputes make the history valuable, and the history is exactly what event sourcing keeps.',
        },
        {
          text: 'Likes on photos',
          correct: false,
          why: 'There are billions of likes and nobody asks for their history, so the extra machinery buys nothing.',
        },
        { text: 'The dark mode setting', correct: false, why: 'Only the current value matters, and a plain row is simpler and always up to date.' },
        {
          text: 'The thumbnail cache',
          correct: false,
          why: 'A cache is derived data that can be rebuilt from the photos; it is never the source of truth.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Snapgram Prints sells prepaid credit to photo studios, and each studio’s credit account is an event-sourced stream. A big studio’s stream has 200,000 events, and applying one takes about 0.005 ms (ballpark). With a snapshot saved every 1,000 events, roughly how many milliseconds of replay does loading the account take at most?',
      answer: 5,
      unit: 'ms',
      tolerance: 1.2,
      solution: [
        'The latest snapshot is at most 999 events old, so you replay at most about 1,000 events.',
        '1,000 × 0.005 ms = 5 ms, plus the time to read the snapshot itself.',
        'A full replay would take 200,000 × 0.005 ms = 1,000 ms, so the snapshot saves about a second on every load.',
      ],
    },
  ],
  takeaways: [
    'Event sourcing stores every change as an event in an append-only log and derives the current state by replaying it.',
    'CQRS sends commands to a write model that checks the rules and queries to read models built from the changes, which lag slightly behind.',
    'Fix mistakes by appending correcting events, and use event sourcing only where the history itself is valuable, such as money and orders, never for likes.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Two writers, one stream.** Two support agents refund the same order at once, and both loaded it at version 7. The store accepts an append only if the stream is still at the version the writer read, so the first succeeds and the second is rejected, reloads, and finds the refund already requested. This is optimistic concurrency control, and it keeps every stream in one valid order without locks.',
    },
    {
      kind: 'prose',
      md: '**Events are forever.** Stored events are never edited, so changing their shape takes care. Adding an optional field is easy; for bigger changes, teams add a new version of the event type and upcast old versions as they are read.',
    },
    {
      kind: 'prose',
      md: '**Forgetting personal data.** Privacy laws can require deleting a person’s data, which clashes with a log that never changes. A common answer is to keep personal details outside the events and store only a reference to them, or to encrypt each person’s details with their own key and delete the key when asked.',
    },
    {
      kind: 'prose',
      md: '**Further reading.** Martin Fowler’s articles on [event sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) and [CQRS](https://martinfowler.com/bliki/CQRS.html), and the Microsoft Azure Architecture Center’s page on the [Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing), cover the details, including when not to use them. Fowler warns that “for most systems CQRS adds risky complexity”, so use it only for the parts that need it.',
    },
  ],
  flashcards: [
    {
      front: 'What does CQRS stand for, and what does it separate?',
      back: 'Command query responsibility segregation: the model that handles commands and changes data is kept apart from the read models that answer queries.',
    },
    { front: 'How does event sourcing get an entity’s current state?', back: 'It replays the entity’s events in order, starting from an empty state and applying each one.' },
    {
      front: 'How do you fix a wrong event in an event-sourced system?',
      back: 'Append a compensating event that cancels or corrects it. The original stays in the log, so the history shows both.',
    },
    {
      front: 'What is a projection?',
      back: 'Code that reads events in order and builds a read model from them; replaying every event rebuilds the read model from scratch.',
    },
    {
      front: 'Why do read models lag, and what do you do about it?',
      back: 'They are updated after the event is stored. Show users their own changes from the command’s response until the read model catches up.',
    },
    { front: 'What is a snapshot for?', back: 'It saves the derived state at some event, so loading replays only the events after it instead of the whole stream.' },
    {
      front: 'When is event sourcing overkill?',
      back: 'When nobody needs the history, as with likes or settings: plain rows are simpler, faster and always up to date.',
    },
  ],
  related: ['event-driven', 'denormalization', 'distributed-transactions', 'replication-lag', 'idempotency', 'queues-and-streams', 'batch-vs-stream'],
  glossaryTerms: [
    'event-sourcing',
    'event',
    'event-store',
    'idempotency-key',
    'audit-trail',
    'cqrs',
    'write-model',
    'command',
    'read-model',
    'projection',
    'denormalization',
    'derived-data',
    'eventual-consistency',
    'read-your-writes',
    'compensating-event',
    'snapshot',
    'crud',
    'optimistic-concurrency',
    'upcasting',
  ],
};

export default lesson;
