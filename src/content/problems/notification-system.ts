import type { DiagramSpec, Problem } from '../types';

/** v1: the notification service calls every provider while the caller waits. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Order service', sublabel: 'a caller', x: 0, y: 1 },
    { id: 'notif', type: 'service', label: 'Notification service', x: 1, y: 1 },
    { id: 'users', type: 'sqlDb', label: 'Users database', sublabel: 'preferences, tokens', x: 1, y: 2 },
    { id: 'push', type: 'external', label: 'Apple, Google', sublabel: 'push services', x: 2, y: 0 },
    { id: 'email', type: 'external', label: 'Email provider', x: 2, y: 1 },
    { id: 'text', type: 'external', label: 'Text provider', x: 2, y: 2 },
  ],
  edges: [
    { id: 'svc-notif', from: 'svc', to: 'notif', kind: 'sync' },
    { id: 'notif-users', from: 'notif', to: 'users', kind: 'sync' },
    { id: 'notif-push', from: 'notif', to: 'push', kind: 'sync' },
    { id: 'notif-email', from: 'notif', to: 'email', kind: 'sync' },
    { id: 'notif-text', from: 'notif', to: 'text', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The **order service** calls the **notification service**: user 42, “order shipped”. It reads the user’s preferences and device tokens from the **users database** and finds that push and email are allowed for order updates.',
      flow: ['svc-notif', 'notif-users', '<notif-users'],
    },
    {
      caption:
        'It fills in the template, calls Apple’s and Google’s push services and the email provider, and only then answers the order service.',
      flow: [['notif-push', 'notif-email'], ['<notif-push', '<notif-email'], '<svc-notif'],
    },
    {
      caption:
        'One day the **text provider** takes 10 seconds to answer. The order service waits too, its threads fill up, and a provider’s bad day becomes your checkout outage; if the notification service crashes mid-call, the notification is simply lost.',
      fail: ['text'],
      flow: ['svc-notif', 'notif-text'],
      notes: [{ target: 'svc', text: 'waiting 10 s', tone: 'alert' }],
    },
  ],
};

/** v2: intake checks preferences and queues one message per channel; workers per channel call providers. */
const v2: DiagramSpec = {
  grid: { cols: 5, rows: 3 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Product services', x: 0, y: 1 },
    { id: 'api', type: 'service', label: 'Notification service', sublabel: 'intake', x: 1, y: 1 },
    { id: 'prefs', type: 'sqlDb', label: 'Preferences', sublabel: 'cached', x: 1, y: 2 },
    { id: 'pushQ', type: 'queue', label: 'Push queue', x: 2, y: 0 },
    { id: 'pushW', type: 'worker', label: 'Push workers', x: 3, y: 0 },
    { id: 'push', type: 'external', label: 'Apple, Google', x: 4, y: 0 },
    { id: 'emailQ', type: 'queue', label: 'Email queue', x: 2, y: 2 },
    { id: 'emailW', type: 'worker', label: 'Email workers', x: 3, y: 2 },
    { id: 'email', type: 'external', label: 'Email provider', x: 4, y: 2 },
  ],
  edges: [
    { id: 'svc-api', from: 'svc', to: 'api', kind: 'sync' },
    { id: 'api-prefs', from: 'api', to: 'prefs', kind: 'sync' },
    { id: 'api-pushQ', from: 'api', to: 'pushQ', kind: 'async' },
    { id: 'api-emailQ', from: 'api', to: 'emailQ', kind: 'async' },
    { id: 'pushQ-pushW', from: 'pushQ', to: 'pushW', kind: 'async' },
    { id: 'pushW-push', from: 'pushW', to: 'push', kind: 'sync' },
    { id: 'emailQ-emailW', from: 'emailQ', to: 'emailW', kind: 'async' },
    { id: 'emailW-email', from: 'emailW', to: 'email', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A product service calls the **notification service** with a user, a type and its data, plus an idempotency key. The service stores the request, answers `202 Accepted` at once, and the caller moves on.',
      flow: ['svc-api', '<svc-api'],
    },
    {
      caption:
        'It reads the user’s **preferences** from a cache: order updates by push and email, never by text, and quiet hours from 22:00 to 07:00. It renders one message per allowed channel and puts each on that channel’s queue.',
      flow: ['api-prefs', '<api-prefs', ['api-pushQ', 'api-emailQ']],
    },
    {
      caption:
        '**Push workers** take messages from the **push queue** and call Apple’s and Google’s push services with each device token; **email workers** do the same with the email provider. A third lane for text messages works the same way, and because each channel has its own queue, a slow email provider never delays a push.',
      flow: [['pushQ-pushW', 'emailQ-emailW'], ['pushW-push', 'emailW-email']],
    },
    {
      caption:
        'Each tier now scales on its own: more intake servers, more workers per channel, and queues that absorb bursts, such as a breaking-news alert, while workers drain them at the pace providers accept.',
      focus: ['pushQ', 'emailQ', 'pushW', 'emailW'],
      notes: [{ target: 'push', text: '≈ 24,000 a second at peak' }],
    },
  ],
};

/** v3: duplicates dropped with sent keys; failures retried later, then dead-lettered. */
const v3: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'keys', type: 'cache', label: 'Sent keys', sublabel: 'kept a day', x: 1, y: 0 },
    { id: 'q', type: 'queue', label: 'Push queue', x: 0, y: 1 },
    { id: 'w', type: 'worker', label: 'Push workers', x: 1, y: 1 },
    { id: 'push', type: 'external', label: 'Apple, Google', x: 2, y: 1 },
    { id: 'retry', type: 'queue', label: 'Retry queue', sublabel: 'delayed messages', x: 0, y: 2 },
    { id: 'dead', type: 'queue', label: 'Dead letters', x: 2, y: 2 },
  ],
  edges: [
    { id: 'q-w', from: 'q', to: 'w', kind: 'async' },
    { id: 'w-keys', from: 'w', to: 'keys', kind: 'sync' },
    { id: 'w-push', from: 'w', to: 'push', kind: 'sync' },
    { id: 'w-retry', from: 'w', to: 'retry', kind: 'async' },
    { id: 'retry-q', from: 'retry', to: 'q', kind: 'async', label: 'when due' },
    { id: 'w-dead', from: 'w', to: 'dead', kind: 'async' },
  ],
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      q: { x: 0, y: 0 },
      keys: { x: 1, y: 0 },
      retry: { x: 0, y: 1 },
      w: { x: 1, y: 1 },
      dead: { x: 2, y: 1 },
      push: { x: 1, y: 2 },
    },
  },
  steps: [
    {
      caption:
        'A push worker takes a message and first claims it in **sent keys**: an atomic set-if-absent on the notification’s identifier and channel. If the key is already there, the queue has delivered a copy twice, and the worker drops it instead of sending again.',
      flow: ['q-w', 'w-keys', '<w-keys'],
      notes: [{ target: 'keys', text: 'set if absent' }],
    },
    {
      caption:
        'Apple’s service answers `429 Too Many Requests`. The worker doesn’t retry in a tight loop: it puts the message on the **retry queue** with a delay that doubles each attempt, plus random [[jitter|jitter]], and moves on.',
      flow: ['w-push', { edge: 'w-push', reverse: true, tag: '429' }, 'w-retry'],
      notes: [{ target: 'retry', text: 'next try in 4 s' }],
    },
    {
      caption:
        'When the delay is up, the message goes back on the **push queue** and is tried again, up to about 10 times over a few hours (ballpark). A message too old to matter, such as a login code after 10 minutes, is dropped and logged instead.',
      flow: ['retry-q', 'q-w', 'w-push', '<w-push'],
    },
    {
      caption:
        'A message that keeps failing, or fails in a way no retry can fix, goes to **dead letters** with an alert, so a person can inspect it and replay it after a fix. When Apple or Google say a device token is no longer valid, the worker deletes the token instead, so nobody sends to that phone again.',
      flow: ['w-dead'],
      notes: [{ target: 'dead', text: 'inspect, replay' }],
    },
  ],
};

/** v4: what each failure does, drawn for the text message lane. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Product services', sublabel: 'with outbox', x: 0, y: 0 },
    { id: 'api', type: 'service', label: 'Notification service', x: 1, y: 0 },
    { id: 'prefs', type: 'sqlDb', label: 'Preferences', x: 2, y: 0 },
    { id: 'q', type: 'queue', label: 'Text queue', sublabel: 'three copies', x: 1, y: 1 },
    { id: 'w', type: 'worker', label: 'Text workers', sublabel: 'circuit breaker', x: 1, y: 2 },
    { id: 'provA', type: 'external', label: 'Provider A', x: 0, y: 2 },
    { id: 'provB', type: 'external', label: 'Provider B', x: 2, y: 2 },
  ],
  edges: [
    { id: 'svc-api', from: 'svc', to: 'api', kind: 'sync' },
    { id: 'api-prefs', from: 'api', to: 'prefs', kind: 'sync' },
    { id: 'api-q', from: 'api', to: 'q', kind: 'async' },
    { id: 'q-w', from: 'q', to: 'w', kind: 'async' },
    { id: 'w-provA', from: 'w', to: 'provA', kind: 'sync' },
    { id: 'w-provB', from: 'w', to: 'provB', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A bad deploy takes the **notification service** down for a minute. Product services lose nothing: each writes the request to an outbox table in the same transaction as the order, and a relay keeps retrying with the same idempotency key until the service accepts it ([[transactional outbox|transactional-outbox]]).',
      fail: ['api'],
      notes: [{ target: 'svc', text: '1,200 waiting' }],
    },
    {
      caption:
        'Text messages normally go through **provider A**. It starts timing out, and after a run of failures the workers’ [[circuit breaker|circuit-breaker]] opens: they stop calling A instead of piling retries onto it.',
      flow: ['q-w', 'w-provA', { edge: 'w-provA', reverse: true, tag: 'timeout' }],
      notes: [{ target: 'provA', text: 'failing', tone: 'alert' }],
    },
    {
      caption:
        'The workers switch to **provider B**, which costs a little more per message but keeps login codes arriving. The breaker lets a trial message through to A every 30 seconds or so and switches back once A recovers.',
      add: ['provB', 'w-provB'],
      flow: ['q-w', 'w-provB', '<w-provB'],
    },
    {
      caption:
        'The **preferences** store is unreachable and the cache misses. The service never guesses: it holds marketing and social notifications until preferences are back, and sends only security messages, such as login codes, which users can’t turn off.',
      fail: ['prefs'],
      flow: ['svc-api', 'api-q'],
    },
  ],
};

const problem: Problem = {
  id: 'notification-system',
  title: 'Notification system',
  tier: 1,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a notification system that other services use to reach users by mobile [[push notification|push-notification]], email and text message. It must respect each user’s preferences and never spam anyone with duplicates.',
  concepts: ['queues-and-streams', 'timeouts-retries-backoff', 'idempotency', 'real-time-communication', 'rate-limiting', 'circuit-breakers', 'back-of-the-envelope'],
  hints: [
    'Separate asking from sending. The order service shouldn’t wait while a phone company’s server thinks, so what could sit between them so that neither waits for the other?',
    'Every outside provider will sometimes be slow, down or telling you to slow down, and your queue will sometimes deliver a message twice. Decide what a worker does in each case, and what must be true so a retry never becomes a second notification in someone’s pocket.',
    'One shape that works: an intake service checks an [[idempotency key|idempotency-key]] and the user’s preferences, then puts one message per channel on a [[message queue|message-queue]] per channel and priority; channel workers call providers with [[exponential backoff|exponential-backoff]], a [[dead-letter queue|dead-letter-queue]] and a dedup key per message.',
  ],
  clarifyingQuestions: [
    {
      q: 'Which channels do we support: mobile push, email, text messages, an in-app inbox?',
      why: 'Each channel has its own providers, limits, costs and failures, so each gets its own queue and workers. Text messages (SMS) cost money per message, around a cent each in the United States (ballpark), which changes how carefully you retry them.',
    },
    {
      q: 'How many notifications a day, and how bursty is the traffic?',
      why: 'Assume about a billion a day, around 30,000 a second at peak (ballpark). Breaking news or a marketing campaign can be many times that, which is why queues sit between the services that ask and the workers that send.',
    },
    {
      q: 'Are some notifications urgent, such as login codes, while others can wait?',
      why: 'Urgent ones need seconds and must never queue behind a marketing broadcast, so they get their own queues and workers. Bulk ones can be spread out over minutes or hours.',
    },
    {
      q: 'What can users control: opt-outs per type and channel, quiet hours, a cap on how many they get?',
      why: 'Preferences must be checked before every send, and again at send time for anything that waited. Some messages, such as security alerts, are usually exempt, and marketing email generally needs a working unsubscribe link by law.',
    },
    {
      q: 'Which is worse: a duplicate or a missed notification?',
      why: 'Queues deliver at least once, so duplicates happen unless you remove them. A second “your order shipped” push annoys, a second text message costs money, and a missed login code locks someone out, so the answer sets how hard you dedupe on each channel.',
    },
    {
      q: 'Do product teams need delivery status, or only “accepted”?',
      why: 'Status means a delivery log updated by workers and by provider callbacks, about a billion rows a day (ballpark). If “accepted” is enough, the log can be thin and short-lived.',
    },
  ],
  requirements: {
    functional: [
      'Product services send a notification to a user by type, such as “order shipped”, with the data its template needs.',
      'Deliver by mobile push, email and text message, on the channels the user allows for that type.',
      'Respect preferences: opt-outs per type and channel, quiet hours in the user’s time zone, and caps on how many arrive per day.',
      'Support scheduled sends and broadcasts to large audiences.',
      'Report each notification’s status on each channel.',
    ],
    nonFunctional: [
      'Urgent notifications, such as login codes, reach the provider within a few seconds (ballpark), even during a broadcast.',
      'Nothing accepted is silently lost: a notification is delivered, deliberately dropped and logged, or parked in a dead-letter queue.',
      'No duplicates in normal operation, and duplicate text messages as close to zero as possible, since each one costs money.',
      'Highly available intake, around 99.99% (a ballpark target): product services must always be able to hand a notification off.',
      'Scale: about a billion notifications a day, 30,000 a second at peak (ballpark), plus broadcasts to tens of millions of users.',
    ],
    outOfScope: [
      'Writing and translating the notification text and templates.',
      'Running our own mail servers or connections to phone networks: we use providers.',
      'Choosing which marketing message each user should get.',
      'Analytics on opens and clicks, beyond recording delivery status.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'People who get notifications each day', value: '100 million (ballpark)' },
      { label: 'Notifications per person per day', value: '10, across all channels' },
      { label: 'Channel mix', value: 'push about 80%, email about 20%, text messages about a million a day (ballpark)' },
      { label: 'Busiest hour compared with the daily average', value: '3×, more during broadcasts' },
      { label: 'Delivery log row', value: 'about 500 bytes' },
      { label: 'In the calculator', value: '20 actions per person with one read per write: each notification is one write (its log row) plus one preference lookup; the yearly storage line assumes the log is kept a year' },
    ],
    steps: [
      { label: 'Notifications per second', math: '10⁸ people × 10 = 10⁹ a day; ÷ 10⁵ seconds a day', result: '≈ 10,000 a second, 30,000 at peak' },
      { label: 'Per channel at peak', math: '80% and 20% of 30,000; 10⁶ texts a day ÷ 10⁵ seconds × 3', result: '≈ 24,000 pushes and 6,000 emails a second, about 30 text messages' },
      { label: 'Cost of text messages', math: '10⁶ a day × about $0.01 (ballpark)', result: '≈ $10,000 a day: retries and duplicates cost real money' },
      { label: 'Delivery log', math: '10⁹ rows × 500 bytes = 500 GB a day; × 30 days', result: '≈ 15 TB kept hot; older rows move to cheap storage' },
      { label: 'Sent keys', math: '10⁹ keys a day × about 50 bytes, kept one day', result: '≈ 50 GB: a small in-memory cluster' },
      { label: 'Preference lookups', math: '30,000 a second at peak, over 10⁸ users × about 1 KB', result: '≈ 100 GB of preferences: cached, almost every read hits' },
      { label: 'A broadcast to 50 million users', math: '5 × 10⁷ pushes ÷ 24,000 a second', result: '≈ 35 minutes, however many workers you add' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 20, readsPerWrite: 1, objectBytes: 500, peakFactor: 3, retentionYears: 1 },
  },
  api: [
    {
      signature: 'POST /v1/notifications  { userId, type, data, priority?, sendAfter? }  + Idempotency-Key  →  202 { notificationId }',
      description:
        'Called by product services. It answers `202 Accepted` once the request is stored, not when it is delivered, and a repeated idempotency key returns the first notification’s identifier instead of sending again.',
    },
    {
      signature: 'POST /v1/broadcasts  { audience, type, data, sendWindow }  →  202 { broadcastId }',
      description:
        'Starts a send to a large audience, such as everyone who follows a team. A separate job expands the audience in pages and feeds the bulk queue at a controlled rate, and the broadcast can be paused or cancelled.',
    },
    {
      signature: 'GET /v1/notifications/{notificationId}  →  200 { channels: [{ channel, status, attempts, updatedAt }] }',
      description: 'Delivery status on each channel, read from the delivery log, for support tools and debugging.',
    },
    {
      signature: 'PUT /v1/users/{userId}/preferences  { channelsByType, quietHours, timeZone }  →  200',
      description: 'Called by the settings page. The cached copy is deleted on every change, so the next notification sees the new rules.',
    },
    {
      signature: 'POST /v1/devices  { userId, platform, token }  →  204',
      description: 'The app registers its push token when it starts and whenever Apple or Google issue a new one.',
    },
  ],
  dataModel: [
    {
      entity: 'Notification request',
      fields: ['notification_id (partition key)', 'idempotency_key', 'user_id', 'type: "order_shipped"', 'data: { orderId, eta }', 'priority: critical | normal | bulk', 'created_at', 'send_after (or null)'],
      store: 'Key-value store such as DynamoDB or Cassandra, kept about 30 days (ballpark)',
      why: 'Written once and read by its key when a worker needs details or support staff investigate. The idempotency key gets its own conditional insert, so a retried request finds the first notification instead of creating a second one.',
    },
    {
      entity: 'User preferences',
      fields: ['user_id (primary key)', 'channels_by_type: { order_updates: [push, email], marketing: [] }', 'quiet_hours: 22:00 to 07:00', 'time_zone', 'locale'],
      store: 'Relational database, with a cache in front',
      why: 'Every notification reads them, up to 30,000 times a second at peak (ballpark), but they change rarely, so the cache answers almost every read. A relational database keeps the rules consistent and easy to query for support.',
    },
    {
      entity: 'Contact points',
      fields: ['user_id (partition key)', 'channel: push | email | text', 'address: device token, email address or phone number', 'verified', 'last_seen_at'],
      store: 'The same database as preferences',
      why: 'A user may have several phones and an email address. Push workers delete a device token as soon as Apple or Google report it invalid, and hard email bounces mark an address bad, so the table doesn’t fill with dead ends.',
    },
    {
      entity: 'Delivery log',
      fields: ['notification_id (partition key)', 'channel (sort key)', 'status: queued | sent | delivered | failed | dropped', 'provider, provider_message_id', 'attempts', 'updated_at'],
      store: 'Wide-column store such as Cassandra, 30 days hot, then archived to object storage',
      why: 'About a billion rows a day (ballpark), written by workers and updated by provider callbacks, but read only when someone asks “did this user get it?”. A [[wide-column store|wide-column-store]] absorbs that write rate cheaply.',
    },
    {
      entity: 'Sent keys',
      fields: ['key: notification_id + channel', 'state: sending | sent', 'expires: 1 day'],
      store: 'In-memory store such as Redis, replicated',
      why: 'Workers check and set a key before every send, tens of thousands of times a second at peak, so it must answer in about a millisecond (ballpark). Keys only need to outlive redeliveries and retries, so a day is plenty.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Send a user the notifications they allow, on the right channels, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'Calling providers directly is fine for a prototype. But it ties every caller to the slowest provider, loses notifications whenever a call or a server fails, and gives a broadcast nowhere to wait.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 30,000 notifications a second at peak (ballpark), callers that must never wait on a provider, and bursts many times the normal rate.',
      diagram: v2,
      explanation:
        'Queues split asking from sending: intake is fast and always available, and workers send at whatever pace each provider allows. Queues per channel keep one provider’s trouble from spreading, and in a full design each channel also has separate queues for critical, normal and bulk messages.',
    },
    {
      title: 'v3: Retries and duplicates',
      solves: 'Providers fail and slow you down, and queues deliver at least once, so a naive worker either loses notifications or sends them twice.',
      diagram: v3,
      explanation:
        'Temporary failures wait in a retry queue with growing delays instead of blocking workers; permanent ones are dead-lettered or clean up a bad token. Sent keys turn [[at-least-once|at-least-once]] delivery into “effectively once” for the user, except in a narrow window that the deep dive covers.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A down intake service, a failing provider or an unreachable preference store must not lose notifications or send ones the user opted out of.',
      diagram: v4,
      explanation:
        'Each failure has a planned response: callers queue requests in their outbox, providers sit behind circuit breakers with a backup, and missing preferences mean holding, never guessing. The system fails toward delay rather than toward spam.',
    },
  ],
  deepDives: [
    {
      title: 'Never sending the same notification twice',
      problem:
        'Duplicates come from three places: a product service retrying its request, the queue redelivering after a worker crash, and a worker retrying a provider call that timed out but actually succeeded. Each needs its own fix, and the last one can’t be removed completely.',
      options: {
        caption: 'Five layers of deduplication',
        rows: [
          {
            option: 'Idempotency key at intake',
            goodAt: 'Stops duplicates from callers: a retried request with the same key returns the first notification’s identifier.',
            badAt: 'Does nothing about redeliveries inside your pipeline, and a buggy caller that makes a new key each time slips through.',
            pickWhen: 'Always, on the intake endpoint.',
          },
          {
            option: 'Mark as sent after the provider accepts',
            goodAt: 'Never loses a notification: if the worker crashes before marking, the message is redelivered and sent.',
            badAt: 'A crash between sending and marking sends it twice.',
            pickWhen: 'Push and email, where a rare duplicate beats a lost message.',
          },
          {
            option: 'Claim before sending',
            goodAt: 'A second worker that finds the claim never sends, so redeliveries stop causing duplicates.',
            badAt: 'If the claiming worker dies before sending, the message is lost unless the claim expires and someone retries.',
            pickWhen: 'Text messages, where each duplicate costs money; give the claim a short expiry.',
          },
          {
            option: 'Collapse keys on the device',
            goodAt: 'Apple and Google both support collapse identifiers, so a newer push with the same identifier can replace an older one and a duplicate shows as one notification.',
            badAt: 'Push only, and both copies still travel to the phone.',
            pickWhen: 'As the last line of defense for push.',
          },
          {
            option: 'Content key within a time window',
            goodAt: 'Catches buggy callers: the same user, type and order within 10 minutes is sent once.',
            badAt: 'Can wrongly merge two real events that look identical.',
            pickWhen: 'Types where two identical messages minutes apart are always a mistake.',
          },
        ],
      },
      recommendation:
        'Layer them. Use an idempotency key at intake, then a two-state key per channel in a fast store: “sending”, with an expiry of a few minutes, before the provider call, and “sent” after it. A redelivered copy that finds “sent” is dropped, and one that finds an expired “sending” is retried; add collapse keys for push and content keys for types that should never repeat, and say plainly that a provider timeout can still, rarely, mean a duplicate.',
    },
    {
      title: 'Retrying providers without making things worse',
      problem:
        'Providers fail in different ways: a timeout, a `429` asking you to slow down, a `503` outage, or a permanent “this device token is invalid”. Blind retries multiply the load on a struggling provider, tie up workers and can resend messages long after they matter.',
      options: {
        caption: 'Four tools, used together',
        rows: [
          {
            option: 'Retry at once, inside the worker',
            goodAt: 'Simple, and fine for a one-off network blip.',
            badAt: 'Hammers a struggling provider and holds the worker while it waits; across thousands of workers, a [[retry storm|retry-storm]] can keep the provider down.',
            pickWhen: 'One quick retry at most.',
          },
          {
            option: 'Retry queue with exponential backoff and jitter',
            goodAt: 'The worker moves on at once, waits grow 1 s, 2 s, 4 s and so on, and random jitter spreads the retries out.',
            badAt: 'Messages arrive later, and the retry queue needs its own monitoring.',
            pickWhen: 'The default for temporary errors.',
          },
          {
            option: 'Circuit breaker and a second provider',
            goodAt: 'Stops calling a provider that is clearly down, and keeps messages flowing through another.',
            badAt: 'Two contracts and two integrations to test and keep working; the backup may cost more.',
            pickWhen: 'Channels where an outage hurts: text messages for login codes, and email.',
          },
          {
            option: 'A lifetime for each message type',
            goodAt: 'A login code 10 minutes old is useless, and dropping it avoids confusing the user.',
            badAt: 'Every type needs a lifetime, and every dropped message must be logged.',
            pickWhen: 'Always.',
          },
        ],
      },
      recommendation:
        'Classify every error. Permanent ones, such as an invalid token or a bad address, are never retried: delete the token or mark the address bad. Temporary ones go to the retry queue with exponential backoff, full jitter and a cap of about 10 attempts (ballpark), honoring any `Retry-After` header and stopping once the message’s lifetime has passed. Put each provider behind a circuit breaker, keep a second provider for text messages and email, and dead-letter whatever still fails.',
    },
    {
      title: 'Preferences, quiet hours and caps',
      problem:
        'Users decide what they get: “no marketing email”, “nothing between 22:00 and 07:00”, “at most three promotional pushes a day”. The checks must run on every notification, see changes quickly, and never block a security alert that users can’t turn off.',
      options: {
        caption: 'Where and how to apply the user’s rules',
        rows: [
          {
            option: 'Each product service checks for itself',
            goodAt: 'No central dependency.',
            badAt: 'Every team implements the rules differently, and one forgetful team spams everyone.',
            pickWhen: 'Never, at this size.',
          },
          {
            option: 'Check once, at intake',
            goodAt: 'One place applies every rule, and rejected notifications never reach a queue.',
            badAt: 'A delayed or scheduled message can go out after the user changed their mind.',
            pickWhen: 'Notifications sent at once.',
          },
          {
            option: 'Check again just before sending',
            goodAt: 'Catches changes made while a message waited in a queue, a retry or a schedule.',
            badAt: 'One more cache read per send.',
            pickWhen: 'Anything that waits: scheduled sends, retries and quiet-hour holds.',
          },
          {
            option: 'Digests instead of single notifications',
            goodAt: '“5 people liked your photo” replaces five pushes, which users prefer.',
            badAt: 'Needs a short holding window per user and type, so each notification arrives a little later.',
            pickWhen: 'Social activity that arrives in bursts.',
          },
        ],
      },
      recommendation:
        'Check preferences centrally at intake and again at send time, from a cache that is cleared on every change. Quiet hours turn a send into a scheduled one for the end of the user’s night, caps are counters per user, type and day ([[rate limiting|rate-limiting]] applied to people), and security messages skip both. Bursty social types wait in a digest window of a few minutes (ballpark).',
    },
    {
      title: 'Broadcasts and priorities',
      problem:
        'A breaking-news push to 50 million users is 50 million messages at once, and if it shares a queue with login codes, a code can wait half an hour behind it. Providers also cap how fast you may send, so a broadcast takes time however many workers you run.',
      options: {
        caption: 'Keeping bulk traffic away from urgent messages',
        rows: [
          {
            option: 'One queue for everything',
            goodAt: 'Simplest to run.',
            badAt: 'Urgent messages wait behind bulk ones, so one broadcast delays everything.',
            pickWhen: 'Prototypes only.',
          },
          {
            option: 'Separate queues and workers per priority',
            goodAt: 'Login codes and alerts get their own lane that bulk traffic can’t touch.',
            badAt: 'More queues and worker pools to size and watch.',
            pickWhen: 'The default: at least critical, normal and bulk.',
          },
          {
            option: 'Expand broadcasts in a paced job',
            goodAt: 'A job pages through the audience and feeds the bulk queue at a set rate, within provider limits, and can be paused.',
            badAt: 'The last users get it minutes after the first.',
            pickWhen: 'Any audience bigger than a few thousand.',
          },
          {
            option: 'Send by time zone',
            goodAt: 'Arrives at a sensible local hour and spreads the load across the day.',
            badAt: 'Slower overall, and needs every user’s time zone.',
            pickWhen: 'Marketing and digests, not news.',
          },
        ],
      },
      recommendation:
        'Give each channel at least three queues, critical, normal and bulk, each with its own workers, so bulk traffic can never starve critical. Broadcasts never call intake once per user: a broadcast job expands the audience in pages and feeds the bulk queue below provider limits, behind a kill switch. At about 24,000 pushes a second (ballpark), 50 million take about 35 minutes; say so, rather than promising everyone at once.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 300,000 notifications a second at peak (ballpark).',
      impact: 'Queues grow faster than workers drain them, providers start answering `429`, and delays climb from seconds to minutes.',
      mitigation:
        'Scale workers on [[queue depth|queue-depth]], pace sends to stay within provider limits, and let the priority lanes keep critical messages fast while bulk ones wait.',
    },
    {
      scenario: '100×: a broadcast to all 100 million users at once.',
      impact: 'At provider limits it takes over an hour, and without priority lanes every login code waits behind it.',
      mitigation: 'A paced broadcast job on the bulk lane, sends by time zone where possible, and a kill switch for each broadcast.',
    },
    {
      scenario: 'A provider is slow or down.',
      impact: 'Workers block on calls and retries pile up; with only one provider, that channel stops.',
      mitigation: 'Timeouts of a few seconds (ballpark), circuit breakers, a retry queue with backoff, and a second provider for text messages and email.',
    },
    {
      scenario: 'A queue broker dies.',
      impact: 'Its partitions move to replicas, and messages that workers were handling are redelivered.',
      mitigation: 'Three copies of every message, and sent keys that drop the redelivered copies.',
    },
    {
      scenario: 'The sent-keys store is down.',
      impact: 'Workers can’t tell a first send from a duplicate.',
      mitigation:
        'Fail safe per channel: hold text messages until it returns, since a duplicate costs money, and keep sending push and email, where collapse keys and a rare duplicate are acceptable.',
    },
    {
      scenario: 'A bug makes a product service request the same notification for every user, every minute.',
      impact: 'The worst thing a notification system can do: millions of annoyed users, people turning notifications off for good, and a large text-message bill.',
      mitigation: 'Per-user caps, content keys that merge repeats, alerts on unusual volume per type, and a kill switch per type that stops sends within seconds.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Puts a queue between the services that ask for notifications and the workers that send them.',
        'Handles each channel with its own provider, and looks up device tokens and preferences before sending.',
        'Retries failed sends rather than dropping them.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Retries with exponential backoff and jitter, parks repeated failures in a dead-letter queue, and deletes invalid device tokens.',
        'Explains why at-least-once delivery causes duplicates, and removes them with idempotency keys and sent keys.',
        'Applies preferences, quiet hours and per-user caps, and re-checks them for messages that waited.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Isolates priorities and channels so a broadcast or a slow provider can never delay a login code.',
        'Plans for failures on both sides: an outbox for callers, circuit breakers and a backup provider for senders.',
        'Guards against the system’s worst failure, spamming users, with kill switches, caps and deduplication that fails safe, and keeps the cost of text messages in view.',
      ],
    },
  ],
  followUps: [
    {
      q: 'Apple’s push service has been returning errors for 20 minutes. What happens?',
      a: 'The push workers’ circuit breaker opens, so they stop hammering Apple, and messages wait in the retry queue with growing delays; pushes to Android phones through Google keep flowing. Messages with short lifetimes, such as login codes, expire and are logged, and the user can ask for the code by email or text. When Apple recovers, the backlog drains at a paced rate, critical messages first.',
    },
    {
      q: 'A bug made the order service send the same request 50 times. How many notifications does the user get?',
      a: 'One, if the retries carry the same idempotency key: intake returns the first notification’s identifier 49 times. If the bug makes a new key each time, the content key catches it, since the same user, type and order within 10 minutes is sent once. Per-user caps are the last guard.',
    },
    {
      q: 'Marketing wants to push a message to all 100 million users at nine in the morning, local time. How?',
      a: 'A broadcast job, not 100 million intake calls. It groups users by time zone and, for each zone, pages through the audience and feeds the bulk queue at a paced rate, checking preferences and caps as it goes. A big time zone takes 20 minutes or so to finish (ballpark), which also spreads the load, and the critical lane is untouched.',
    },
    {
      q: 'A user says they got a notification at 3 in the morning despite quiet hours. How could that happen?',
      a: 'The likely causes: their time zone in our records is stale after travel; the message was checked at intake but sent hours later from a retry or a schedule without a second check; or it was a security alert, which is exempt. I re-check preferences at send time, refresh time zones from the app, and keep the exempt list short and explicit.',
    },
    {
      q: 'How do you know a notification actually reached the user?',
      a: 'A provider accepting it only means it is on its way. Email and text providers call our [[webhook|webhook]] with delivered, bounced or failed, and the app reports when a push arrives or is opened; all of it updates the delivery log. Hard bounces mark the address bad, and invalid push tokens are deleted.',
    },
    {
      q: 'How would you add an in-app inbox that shows past notifications?',
      a: 'Treat the inbox as another channel: its worker writes each notification to a per-user table, partitioned by user and sorted by time, which the app reads when it opens. If the user is online, the notification is also pushed live over their open connection, such as a [[WebSocket|websocket]], and unread counts live in a small counter per user.',
    },
  ],
  rubric: [
    { item: 'Estimated notifications per second for each channel, and noticed that text messages cost money', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Put queues between callers and senders, with a queue and workers for each channel', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Sent push through Apple’s and Google’s services with device tokens, and cleaned up invalid tokens', weight: 10, lessonId: 'real-time-communication' },
    { item: 'Retried with backoff and jitter, dead-lettered repeated failures, and handled provider outages', weight: 20, lessonId: 'timeouts-retries-backoff' },
    { item: 'Prevented duplicates with idempotency keys at intake and dedup keys per channel', weight: 20, lessonId: 'idempotency' },
    { item: 'Applied preferences, quiet hours and per-user caps, at intake and again at send time', weight: 15, lessonId: 'rate-limiting' },
    { item: 'Kept urgent notifications fast during broadcasts with separate priority lanes', weight: 10, lessonId: 'queues-and-streams' },
  ],
};

export default problem;
