import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Maya's payment: the response is lost, the retry carries the same key, and the server replays the stored result. */
const payment: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Maya’s app' },
    { id: 'pay', type: 'service', label: 'Payment service' },
    { id: 'db', type: 'sqlDb', label: 'Payments database' },
    { id: 'card', type: 'external', label: 'Card provider' },
  ],
  groups: [
    { label: 'First attempt', from: 1, to: 6 },
    { label: 'Retry, same key', from: 7, to: 9 },
  ],
  messages: [
    {
      from: 'app',
      to: 'pay',
      label: 'Pay $34, key 7f3a',
      kind: 'sync',
      caption: 'Before the first attempt, the app makes a random key for this payment and sends it with the request.',
    },
    {
      from: 'pay',
      to: 'db',
      label: 'Claim key 7f3a',
      kind: 'sync',
      caption: 'The payment service records the key first, marked “in progress”. A unique constraint means only one request can ever claim it.',
    },
    { from: 'pay', to: 'card', label: 'Charge $34', kind: 'sync', caption: 'Then it asks the card provider to charge the card.' },
    { from: 'card', to: 'pay', label: 'Approved', kind: 'reply', caption: 'The charge goes through.' },
    {
      from: 'pay',
      to: 'db',
      label: 'Save receipt 881',
      kind: 'sync',
      caption: 'The service stores the response, receipt 881, next to the key and marks it done.',
    },
    {
      from: 'pay',
      to: 'app',
      label: 'Paid, receipt 881',
      kind: 'reply',
      lost: true,
      caption: 'The train enters a tunnel and the response is lost. Maya has paid, but her app does not know it.',
    },
    {
      from: 'app',
      to: 'pay',
      label: 'Pay $34, key 7f3a',
      kind: 'sync',
      caption: 'The app times out and retries, sending the same key, because it is the same payment.',
    },
    {
      from: 'pay',
      to: 'db',
      label: 'Look up key 7f3a',
      kind: 'sync',
      caption: 'The service finds key 7f3a already marked done, with its stored response.',
    },
    {
      from: 'pay',
      to: 'app',
      label: 'Paid, receipt 881',
      kind: 'reply',
      caption: 'It returns the stored response without charging again. One payment, one charge, one receipt.',
    },
  ],
};

/** Where the key lives: made by the app, claimed in the database, passed on to the card provider. */
const keys: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'app', type: 'client', label: 'Maya’s app', x: 0, y: 0.5 },
    { id: 'pay', type: 'service', label: 'Payment service', x: 1, y: 0.5 },
    { id: 'db', type: 'sqlDb', label: 'Payments database', sublabel: 'keys table', x: 2, y: 0 },
    { id: 'card', type: 'external', label: 'Card provider', x: 2, y: 1 },
  ],
  edges: [
    { id: 'app-pay', from: 'app', to: 'pay', kind: 'sync', label: 'same key' },
    { id: 'pay-db', from: 'pay', to: 'db', kind: 'sync' },
    { id: 'pay-card', from: 'pay', to: 'card', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'The app makes one key per payment, before the first attempt, and sends that same key with every try.',
      flow: ['app-pay'],
      notes: [{ target: 'app', text: 'key 7f3a', tone: 'signal' }],
    },
    {
      caption:
        'The **payment service** claims the key in the **payments database**, in the same transaction as the payment record. A unique constraint lets only one request claim it.',
      flow: ['pay-db', '<pay-db'],
    },
    {
      caption: 'It sends a key of its own to the **card provider**, so a retry between those two is safe as well. Every hop that causes a side effect needs a key.',
      flow: ['pay-card', '<pay-card'],
    },
    {
      caption: 'A retry with the same key stops at the database lookup: the stored response goes back, and the card provider is never called again.',
      flow: ['app-pay', 'pay-db', '<pay-db', '<app-pay'],
      notes: [{ target: 'card', text: 'not called', tone: 'plain' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'idempotency',
  module: 'm5',
  order: 3,
  title: 'Idempotency',
  idea: 'An operation is idempotent when doing it twice has the same effect as doing it once, and an idempotency key lets a server recognize a retried request and return the first answer instead of, say, charging a card twice.',
  minutes: 14,
  prerequisites: ['timeouts-retries-backoff', 'http-essentials'],
  outcomes: [
    'Tell idempotent operations from ones that are not, including which Hypertext Transfer Protocol (HTTP) methods are which.',
    'Design an idempotency key flow: who makes the key, where the server stores it, and what a duplicate gets back.',
    'Explain how at-least-once delivery plus idempotent handling gives exactly-once effects.',
  ],
  analogy: {
    title: 'The elevator button',
    body: 'You press the call button for the elevator and nothing seems to happen, so you press it again, and then a third time. Three elevators do not come. The button stays lit, because the system already has a request for your floor, and every extra press means the same thing as the first.\n\nThat is idempotence: an action you can safely repeat, because repeating it changes nothing. A vending machine is the opposite: press “buy” twice and you may pay twice. Payments on the internet behave like the vending machine, unless someone designs them to behave like the elevator.',
  },
  whyItMatters:
    'Snapgram Prints, from [Distributed transactions](lesson:distributed-transactions), lets people order printed photo books. Maya orders one for her mother, for 34 dollars, and taps Pay on a train out of Singapore just as it enters a tunnel. Snapgram’s payment service charges her card, and the charge goes through, but the response never reaches her phone.\n\nThe app waits, [[times out|timeout]] and retries, exactly as [the last lesson](lesson:timeouts-retries-backoff) taught it to. The payment service sees what looks like a brand-new payment and charges her again. Maya gets one photo book and two charges, and Snapgram gets a support ticket.',
  body: [
    {
      kind: 'prose',
      md: 'The retry was the right move: the app could not know that the first charge went through. The bug is that the server could not tell a retry from a new payment. Fixing that is what idempotency is about.',
    },
    { kind: 'heading', text: 'Idempotent operations' },
    {
      kind: 'prose',
      md: 'An operation is [[idempotent|idempotent]] if doing it twice has the same effect as doing it once. Some operations are idempotent by nature: setting a caption to “Sunset”, deleting a photo, or liking a photo with `PUT /photos/42/likes/me`, which [an earlier lesson](lesson:api-styles) chose for exactly this reason. Others are not: adding 1 to a counter, creating an order, sending an email, charging a card. Each of these has a [[side effect|side-effect]] that stacks up when it runs twice.',
    },
    {
      kind: 'prose',
      md: '[[HTTP methods|http-method]] make a promise about this. `GET`, `PUT` and `DELETE` are idempotent by definition, so browsers, proxies and clients may retry them freely, while `POST` is not, which is why a retried `POST /orders` can create two orders. Inserts can often be made idempotent too: an [[upsert|upsert]] that writes a row under an identifier (ID) the client chose, or updates it if it already exists, is harmless to repeat.',
    },
    { kind: 'heading', text: 'Idempotency keys' },
    {
      kind: 'prose',
      md: 'A charge cannot be phrased as “set”. You make it idempotent with an [[idempotency key|idempotency-key]]: a unique ID the client creates once per operation and sends with every attempt, often in an `Idempotency-Key` header. The server records each key it has handled, along with the response it sent. When a key comes back, the server knows the request is a retry, skips the work and returns the saved response.',
    },
    {
      kind: 'sequence',
      title: 'A lost response, deduplicated',
      caption: 'Maya’s payment, with an idempotency key. Step through the first attempt, the lost response and the retry.',
      spec: payment,
    },
    {
      kind: 'prose',
      md: 'Three details make or break this. The client creates the key before the first attempt, typically a random [[universally unique identifier|uuid]] (UUID), and reuses it for every retry of that payment. The server claims the key with a unique [[constraint|constraint]] inside the same [[transaction|transaction]] that records the payment, so if two copies arrive at once, only one insert wins. And the server keeps the response, so a duplicate gets the same receipt number as the original, not just a refusal.',
    },
    {
      kind: 'diagram',
      title: 'A key at every hop',
      caption: 'Where the key is made, where it is stored, and where it goes next.',
      spec: keys,
    },
    { kind: 'heading', text: 'The edge cases' },
    {
      kind: 'prose',
      md: '- **Two copies at once.** If a retry arrives while the first attempt is still running, its insert fails on the unique constraint. The server answers with a conflict, such as `409 Conflict`, and the client tries again a moment later.\n- **A crash in the middle.** If the service dies after the charge but before saving the response, the key stays marked “in progress”. Because the card provider got a key of its own, the service can safely send the charge again and get the first charge back.\n- **Same key, different request.** A key reused with a different amount is a client bug. The server stores a fingerprint of each request, such as a [[hash|hash-function]] of its body, and rejects a mismatch instead of replaying an unrelated answer.\n- **How long to keep keys.** Keys must outlive every retry, so servers keep them for hours or a day (ballpark) and then delete them. Each key belongs to one user or account, so two customers can never collide.',
    },
    { kind: 'heading', text: 'Exactly once, honestly' },
    {
      kind: 'prose',
      md: 'Networks and queues cannot promise that a message arrives exactly once. They offer [[at-least-once delivery|at-least-once]], which means duplicates, or [[at-most-once delivery|at-most-once]], which means losses. What systems build instead is [[exactly-once processing|exactly-once]]: at-least-once delivery plus a receiver that recognizes repeats and ignores them, which is [[deduplication|deduplication]]. The queue consumers in [Queues and streams](lesson:queues-and-streams) do it with message IDs, just as payments do it with idempotency keys.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'We kept one payment service and one database. In bigger systems a key travels through several services, each of which must pass it on or derive its own, and finance teams still compare charges with orders every day to catch anything that slipped through. Stored responses can also hold personal data, so the keys table needs the same protection as the payments themselves.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to make an operation safe to repeat.',
    rows: [
      {
        option: 'Naturally idempotent design',
        goodAt: 'No extra storage or bookkeeping: repeating it is harmless by design, such as “set” instead of “add”.',
        badAt: 'Not every operation can be phrased that way; you cannot “set” a charge.',
        pickWhen: 'Updates and deletes, such as captions, likes with `PUT`, or removing a photo.',
      },
      {
        option: 'Idempotency key table',
        goodAt: 'Works for any operation, and replays the original response.',
        badAt: 'Needs storage and expiry, and careful handling of concurrent duplicates and crashes.',
        pickWhen: 'Payments, orders and other side effects that cannot be phrased as a set.',
      },
      {
        option: 'Unique constraint on a natural key',
        goodAt: 'Simple, and enforced by the database itself.',
        badAt: 'Needs a natural key, and a duplicate gets an error to translate rather than the original response.',
        pickWhen: 'The business already has a unique ID, such as one order per checkout cart.',
      },
      {
        option: 'Version check on update',
        goodAt: 'Makes a retried update harmless, and also stops two editors overwriting each other.',
        badAt: 'Clients must track versions and handle conflicts.',
        pickWhen: 'Edits to shared records, such as a caption two devices might change.',
      },
    ],
  },
  realWorld: {
    title: 'Stripe’s idempotency keys',
    body: 'Stripe, a payments company, described its approach in a 2017 engineering blog post by Brandur Leach. Its application programming interface (API) accepts an `Idempotency-Key` header on `POST` requests, holding a unique value the client chooses for each operation. If a request fails because the connection broke, the client sends it again with the same key, and if the first attempt had succeeded, the server returns its saved result instead of repeating the work.\n\nThe post lists three ways a request can fail: the connection fails before the server sees it, the server fails partway through the work, or the work succeeds and the response is lost on the way back. It recommends retrying with exponential backoff and random jitter, and notes that Stripe’s Ruby library retries failed requests automatically, with idempotency keys.',
    sourceUrl: 'https://stripe.com/blog/idempotency',
    sourceLabel: 'Brandur Leach, “Designing robust and predictable APIs with idempotency,” Stripe blog, 2017',
  },
  interview: {
    whenToMention:
      'Whenever an operation must not happen twice: payments, orders, sending messages, anything that charges, creates or notifies. Say it right after you add retries or a queue with at-least-once delivery, because those are what create duplicates.',
    sayItLikeThis: [
      'The client creates an idempotency key per payment and sends it with every retry; the server stores the key with the response and replays the response for duplicates.',
      'The key is claimed with a unique constraint in the same transaction as the order update, so two concurrent retries cannot both charge.',
      'Our queue delivers at least once, so the consumers are idempotent: they record each message ID and skip the ones they have seen.',
    ],
    followUps: [
      {
        q: 'What if two requests with the same key arrive at the same time?',
        a: 'Only one can insert the key, because of the unique constraint; the other sees a conflict. The server can answer that one with `409 Conflict` so the client retries a moment later, or wait and then return the stored result.',
      },
      {
        q: 'How long do you keep the keys?',
        a: 'Long enough to cover every client’s retry window, typically hours to a day (ballpark), and then delete them. After that, a very late retry would look new, so clients must stop retrying well before then.',
      },
      {
        q: 'What if the server crashes after charging the card but before saving the result?',
        a: 'That is why the key is claimed before the charge, marked “in progress”, and why the card provider gets a key of its own. On the retry, the server sees the unfinished key and repeats the provider call with the same provider key, which returns the original charge instead of making a new one.',
      },
    ],
    redFlags: [
      'Generating the key on the server, or a new key for every retry, so retries never match.',
      'Checking whether a key exists and then inserting it as two separate steps, which lets two concurrent retries both pass the check.',
      'Assuming that HTTP or the message queue gives exactly-once delivery for free.',
    ],
  },
  mistakes: [
    '**A new key for every attempt.** If the key is created inside the retry loop, every retry looks new and the protection is gone.',
    '**Check, then insert.** Reading the keys table and then writing to it in two steps is a [[race condition|race-condition]]: two retries can both see nothing and both charge, so let a unique constraint decide.',
    '**Storing the key without the response.** The duplicate should get the same answer as the original, such as the same receipt number, not just a refusal.',
    '**Ignoring the request body.** If the same key arrives with a different amount, it is a client bug; reject it instead of replaying the wrong result.',
    '**Forgetting downstream calls.** Your service may be idempotent while the card provider call is not, so pass a key along to every side effect.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which of these operations is idempotent by nature?',
      options: [
        { text: 'Set Maya’s caption to “Sunset at the pier”', correct: true, why: 'Setting a value twice leaves the same value, so a retry is harmless.' },
        { text: 'Add 1 to the photo’s like count', correct: false, why: 'Each run adds another 1, so a retry inflates the count.' },
        { text: 'Create a new print order', correct: false, why: 'Each run creates another order, unless something recognizes the duplicate.' },
        { text: 'Charge 34 dollars to Maya’s card', correct: false, why: 'Each run is another charge, which is exactly why payments need idempotency keys.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which HTTP methods are idempotent by definition?',
      options: [
        { text: '`GET`', correct: true, why: 'Reading changes nothing, so reading twice is the same as reading once.' },
        { text: '`PUT`', correct: true, why: 'It replaces the resource with the same content each time, so the end state is the same.' },
        { text: '`DELETE`', correct: true, why: 'After the first delete the resource is gone, and deleting again leaves it gone.' },
        { text: '`POST`', correct: false, why: 'It usually creates something new each time, so a retried `POST` can make a duplicate.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of handling a new payment request with an idempotency key in order.',
      items: [
        'Read the key from the request',
        'Insert the key marked “in progress”, relying on a unique constraint',
        'Do the work, such as charging the card',
        'Store the response next to the key and mark it done',
        'Return the response to the client',
      ],
      why: 'Claiming the key first stops a concurrent duplicate from also doing the work, and storing the response before returning it lets any later retry get the same answer.',
    },
    {
      kind: 'single',
      prompt: 'Maya’s app retries a payment, but the retry carries a new idempotency key. What happens?',
      options: [
        {
          text: 'The server treats it as a new payment and may charge her twice',
          correct: true,
          why: 'The key is the only way the server recognizes a retry, so a new key looks like a new payment.',
        },
        { text: 'The server recognizes the retry anyway', correct: false, why: 'Without the same key, it has nothing reliable to match on: two identical payments can be legitimate.' },
        { text: 'The server returns the stored response', correct: false, why: 'It stores responses by key, and this key has never been seen.' },
        { text: 'The request is rejected as a duplicate', correct: false, why: 'Nothing marks it as a duplicate, because its key is new.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Snapgram keeps idempotency keys for 24 hours. Each key and its stored response take about 1 KB, and Snapgram Prints handles about 2 million payment requests a day (ballpark). Roughly how much storage do the keys need?',
      answer: 2,
      unit: 'GB',
      tolerance: 1.2,
      solution: [
        'Keys live for one day, so about one day of requests is stored at any time: about 2,000,000 keys.',
        '2,000,000 × 1 KB = 2,000,000 KB.',
        '2,000,000 KB is about 2 GB, small enough for one ordinary database table.',
      ],
    },
  ],
  takeaways: [
    'An idempotent operation has the same effect whether it runs once or many times, which makes retrying it safe.',
    'When an operation is not naturally idempotent, the client sends an idempotency key and the server claims it with a unique constraint and stores the response to replay.',
    'Exactly-once effects come from at-least-once delivery plus idempotent handling, not from the network.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Natural keys.** Sometimes the business already has a unique key: one print order per checkout cart, one like per user and photo. A unique constraint on that key makes the operation idempotent without a separate keys table, though a duplicate then gets an error the server must translate into the original answer.',
    },
    {
      kind: 'prose',
      md: '**Version checks.** For updates, a condition such as “change the caption only if its version is still 7” makes a retry harmless: the first attempt moves the version to 8, so the retry finds nothing to do. The same check stops two devices from silently overwriting each other’s edits.',
    },
    {
      kind: 'prose',
      md: '**Idempotent consumers.** A queue consumer can record each message ID in the same database transaction as the work it does. If the message is delivered again, the insert of its ID fails and the consumer skips it, so its effect still happens once.',
    },
  ],
  flashcards: [
    { front: 'What does idempotent mean?', back: 'Running an operation once or many times has the same effect.' },
    { front: 'Why must the client create the idempotency key?', back: 'So every retry of the same operation carries the same key; a key made by the server would differ on every attempt.' },
    {
      front: 'Where should the server store an idempotency key?',
      back: 'In the same database as the effect, claimed with a unique constraint in the same transaction, together with the response.',
    },
    { front: 'What does the server return for a duplicate key?', back: 'The stored response from the first attempt, without doing the work again.' },
    { front: 'What if the same key arrives with a different request body?', back: 'Reject it as a client error, instead of replaying a result that belongs to a different request.' },
    { front: 'How is exactly-once processing built?', back: 'From at-least-once delivery plus idempotent handling that recognizes and ignores duplicates.' },
    { front: 'Which HTTP methods are idempotent by definition?', back: 'GET, PUT and DELETE are; POST is not.' },
  ],
  related: ['timeouts-retries-backoff', 'http-essentials', 'api-styles', 'queues-and-streams', 'distributed-transactions', 'why-distributed-is-hard', 'databases-101'],
  glossaryTerms: [
    'timeout',
    'idempotent',
    'side-effect',
    'http-method',
    'upsert',
    'idempotency-key',
    'uuid',
    'constraint',
    'transaction',
    'hash-function',
    'at-least-once',
    'at-most-once',
    'exactly-once',
    'deduplication',
    'race-condition',
  ],
};

export default lesson;
