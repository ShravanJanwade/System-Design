import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

const phone = { id: 'app', type: 'client', label: 'Maya’s phone' } as const;
const server = { id: 'server', type: 'service', label: 'Snapgram server' } as const;

/** Polling: ask on a timer, mostly for nothing. */
const polling: SequenceSpec = {
  actors: [phone, server],
  messages: [
    { from: 'app', to: 'server', label: 'Anything new?', kind: 'sync', caption: 'Every 5 seconds, the app asks. There is nothing to report.' },
    {
      from: 'server',
      to: 'app',
      label: 'Nothing',
      kind: 'reply',
      caption: 'An empty answer still costs a full [[round trip|round-trip-time]], a wake-up of the phone’s radio and a little battery.',
    },
    { from: 'app', to: 'server', label: 'Anything new?', kind: 'sync', caption: 'Five seconds later, the same question. Meanwhile, Sam liked Maya’s photo.' },
    {
      from: 'server',
      to: 'app',
      label: 'Sam liked your photo',
      kind: 'reply',
      caption: 'The news finally arrives, up to 5 seconds late, after a string of wasted requests.',
    },
  ],
};

/** Long polling: the server holds the request until there is news. */
const longPolling: SequenceSpec = {
  actors: [phone, server],
  messages: [
    { from: 'app', to: 'server', label: 'Anything new? (I’ll wait)', kind: 'sync', caption: 'The app asks, and the server parks the request instead of answering.' },
    {
      from: 'server',
      to: 'app',
      label: 'Sam liked your photo',
      kind: 'reply',
      caption: 'Twelve seconds later Sam taps the heart, and the server answers the waiting request at once.',
    },
    { from: 'app', to: 'server', label: 'Anything new? (I’ll wait)', kind: 'sync', caption: 'The app asks again right away, so a request is almost always waiting.' },
    {
      from: 'server',
      to: 'app',
      label: 'Nothing yet (30 s)',
      kind: 'reply',
      caption: 'After 30 quiet seconds the server answers “nothing”, so proxies along the way do not cut the idle request, and the cycle repeats.',
    },
  ],
};

/** WebSocket: one upgrade, then messages both ways. */
const webSocket: SequenceSpec = {
  actors: [phone, server],
  messages: [
    { from: 'app', to: 'server', label: 'GET /live, Upgrade', kind: 'sync', caption: 'The app opens with an ordinary HTTP request that asks to upgrade to a WebSocket.' },
    { from: 'server', to: 'app', label: '101 Switching Protocols', kind: 'reply', caption: 'The server agrees. The same connection now carries messages in both directions.' },
    {
      from: 'server',
      to: 'app',
      label: 'Like from Sam',
      kind: 'async',
      caption: 'When Sam likes Maya’s photo, the server pushes the news down the open connection within milliseconds. Nothing is sent while nothing happens.',
    },
    { from: 'app', to: 'server', label: 'Seen', kind: 'async', caption: 'The app can talk back on the same line, for example to mark the notification as seen.' },
  ],
};

/** Server-sent events: one long response, written to as events happen. */
const sse: SequenceSpec = {
  actors: [
    { id: 'page', type: 'client', label: 'Snapgram web page' },
    { id: 'server', type: 'service', label: 'Snapgram server' },
  ],
  messages: [
    { from: 'page', to: 'server', label: 'GET /events', kind: 'sync', caption: 'Snapgram’s web page opens one long-lived request for an event stream.' },
    { from: 'server', to: 'page', label: 'event: like', kind: 'async', caption: 'The server keeps the response open and writes each new like into it as a short text event.' },
    { from: 'server', to: 'page', label: 'event: comment', kind: 'async', caption: 'More events flow down the same response whenever they happen.' },
    {
      from: 'page',
      to: 'server',
      label: 'Reconnect, last seen: 42',
      kind: 'sync',
      caption: 'If the connection drops, the browser reconnects by itself and sends the identifier (ID) of the last event it saw, so the server can resend what was missed.',
    },
  ],
};

/** Webhooks: retried until they succeed, so duplicates happen. */
const webhook: SequenceSpec = {
  actors: [
    { id: 'snap', type: 'service', label: 'Snapgram server' },
    { id: 'partner', type: 'external', label: 'Partner server' },
  ],
  messages: [
    {
      from: 'snap',
      to: 'partner',
      label: 'POST event 77',
      kind: 'sync',
      lost: true,
      caption: 'Maya orders a print. Snapgram posts the event to the partner’s address, but the partner’s server is down.',
    },
    {
      from: 'snap',
      to: 'partner',
      label: 'Retry event 77',
      kind: 'sync',
      caption: 'Snapgram waits longer after each failure and tries again. This time the event arrives, and the partner queues the print job.',
    },
    {
      from: 'partner',
      to: 'snap',
      label: '200 OK',
      kind: 'reply',
      lost: true,
      caption: 'The partner’s answer is lost on the way back, so Snapgram cannot tell that the delivery worked.',
    },
    { from: 'snap', to: 'partner', label: 'Retry event 77', kind: 'sync', caption: 'So Snapgram retries, and the same event arrives a second time.' },
    {
      from: 'partner',
      to: 'snap',
      label: '200 OK, already done',
      kind: 'reply',
      caption: 'The partner recognizes event 77, skips it and answers at once. One print, not two.',
    },
  ],
};

/** Go deeper: routing a push to the one server that holds the user's socket. */
const routing: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'likes', type: 'service', label: 'Like service', x: 0, y: 1 },
    { id: 'bus', type: 'queue', label: 'Pub/sub', sublabel: 'channel user:42', x: 1, y: 1 },
    { id: 'conn1', type: 'service', label: 'Connection server 1', x: 2, y: 0 },
    { id: 'conn2', type: 'service', label: 'Connection server 2', sublabel: 'holds Maya’s socket', x: 2, y: 2 },
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 3, y: 2 },
  ],
  edges: [
    { id: 'likes-bus', from: 'likes', to: 'bus', kind: 'async' },
    { id: 'bus-conn1', from: 'bus', to: 'conn1', kind: 'async' },
    { id: 'bus-conn2', from: 'bus', to: 'conn2', kind: 'async' },
    { id: 'conn2-phone', from: 'conn2', to: 'phone', kind: 'async', label: 'WebSocket' },
  ],
  steps: [
    {
      caption: 'Sam likes Maya’s photo. The **like service** does not know which server holds Maya’s connection, so it publishes the event to the channel `user:42`.',
      flow: ['likes-bus'],
      focus: ['likes', 'bus'],
    },
    {
      caption: 'Only **Connection server 2** subscribed to `user:42`, because Maya’s socket lives there, so the event reaches it and nobody else.',
      flow: ['bus-conn2'],
      focus: ['bus', 'conn2'],
    },
    {
      caption: 'Connection server 2 pushes the like down Maya’s WebSocket. If she reconnects to server 1 tomorrow, server 1 subscribes to her channel instead.',
      flow: ['conn2-phone'],
      focus: ['conn2', 'phone'],
    },
  ],
};

const lesson: Lesson = {
  id: 'real-time-communication',
  module: 'm1',
  order: 7,
  title: 'Real-time communication',
  idea: 'To get updates in real time, a client can keep asking whether anything changed, or hold a connection open so the server can speak up the moment something happens, and each approach trades freshness against cost.',
  minutes: 15,
  prerequisites: ['http-essentials', 'tcp-vs-udp'],
  outcomes: [
    'Compare polling, long polling, WebSockets and server-sent events on freshness, cost and complexity.',
    'Use webhooks to notify other companies’ servers, and handle their retries and duplicates safely.',
    'Pick the right technique for features such as notifications, chat and live counters.',
  ],
  analogy: {
    title: '“Are we there yet?” vs. the driver announcing arrival',
    body: 'On a long car trip, a child in the back asks whether you have arrived, every five minutes. Nearly every answer is “not yet”, each question costs everyone a little patience, and even when you do arrive, the child only finds out at the next question.\n\nNow the driver says, “I’ll tell you when we get there,” and does. Nobody asks, and the news arrives the moment it happens; the driver just has to remember who is listening.',
  },
  whyItMatters:
    'Snapgram wants to tell Maya the moment someone likes her photo. The first version is simple: the app asks the server for new notifications every five seconds, all day. Within a week, users complain that Snapgram drains their batteries, and the servers spend most of their time answering “nothing new”.\n\nPrinting partners have the same problem with orders: they check Snapgram every minute to see whether anyone has ordered a print. There has to be a better way to say “something happened”.',
  body: [
    {
      kind: 'prose',
      md: 'All of these techniques answer one question: how does news travel from the server to whoever wants it? Either the client keeps asking (pull), or the server speaks up when something happens (push). Push is fresher and wastes less, but it needs a connection the server can use, and connections have costs of their own.',
    },
    { kind: 'heading', text: 'Polling: ask on a timer' },
    {
      kind: 'prose',
      md: 'With [[polling|polling]], the app sends an ordinary [[Hypertext Transfer Protocol|http]] (HTTP) request every few seconds, asking for anything new. It is the simplest thing that works: it runs on every network, and the server needs nothing special. But most answers are empty, every request costs battery, data and server work, and news waits for the next poll: 2.5 seconds on average with a 5-second timer.',
    },
    { kind: 'sequence', title: 'Polling', caption: 'The app asks every 5 seconds. Use Play, or the arrow keys.', spec: polling },
    { kind: 'heading', text: 'Long polling: ask, then wait' },
    {
      kind: 'prose',
      md: '[[Long polling|long-polling]] keeps the question but changes the answer. The server holds each request open until it has news or a timeout passes, say 30 seconds, and the app asks again as soon as a reply arrives. News now arrives almost instantly, over plain HTTP that works where other connections are blocked, but the server must keep one waiting request open for every listening user.',
    },
    { kind: 'sequence', title: 'Long polling', caption: 'Same question, but the server answers only when there is news or time runs out.', spec: longPolling },
    { kind: 'heading', text: 'WebSockets: a two-way line' },
    {
      kind: 'prose',
      md: 'A [[WebSocket|websocket]] turns one HTTP request into a long-lived, two-way connection over the [[Transmission Control Protocol|tcp]] (TCP). After a single upgrade, either side can send a message at any time, with only a few bytes of overhead each, which suits chat, live comments and games.\n\nThe price is state: the server holds an open connection for every online user, possibly for hours. Phones switch networks and connections drop, so apps must reconnect, and a small [[heartbeat|heartbeat]] every 30 seconds or so lets both sides notice a dead line.',
    },
    { kind: 'sequence', title: 'WebSocket', caption: 'One upgrade, then messages in both directions whenever there is news.', spec: webSocket },
    { kind: 'heading', text: 'Server-sent events: a one-way stream' },
    {
      kind: 'prose',
      md: 'Often only the server has news. [[Server-sent events|server-sent-events]] (SSE) keep one ordinary HTTP response open and let the server write events into it as they happen. Browsers support them with a built-in `EventSource` object that reconnects on its own, and because it is plain HTTP, it passes proxies that sometimes block WebSockets; to send anything back, the client makes a normal request.',
    },
    { kind: 'sequence', title: 'Server-sent events', caption: 'One response that never quite ends.', spec: sse },
    { kind: 'heading', text: 'Webhooks: push between servers' },
    {
      kind: 'prose',
      md: 'The printing partners need news on their servers, not on a phone. A [[webhook|webhook]] turns the usual [[application programming interface|api]] (API) call around: the partner registers a web address once, and Snapgram sends an HTTP `POST` to it whenever something happens, such as a new print order.\n\nThe partner’s server may be down, so webhooks are retried until they succeed, which makes delivery [[at least once|at-least-once]]: an event can arrive twice, or out of order. Good receivers verify a signature, answer `200 OK` quickly, do the real work from a [[message queue|message-queue]], and keep handlers [[idempotent|idempotent]] so a duplicate changes nothing. [Stripe](https://docs.stripe.com/webhooks), for example, retries failed deliveries for up to three days and warns that the same event can arrive more than once.',
    },
    { kind: 'sequence', title: 'Webhooks', caption: 'A failed delivery, a retry and a duplicate, handled safely.', spec: webhook },
    {
      kind: 'prose',
      md: 'A rule of thumb: poll when a delay is fine, push when it is not, and use webhooks when the listener is a server. So Snapgram sends notifications and live comments over a WebSocket while the app is open, and partners get webhooks instead of checking every minute.\n\nWhen the app is closed, the phone will not let it hold a connection. The server then hands the notification to Apple’s or Google’s [[push notification|push-notification]] service, which keeps one shared connection to each phone.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real apps mix these: a WebSocket while the app is open, platform push when it is closed, and polling as a fallback. This lesson skips how a message finds the server that holds a user’s connection; Go deeper sketches one way.',
    },
  ],
  tradeoffs: {
    caption: 'Pull is simple and wasteful; push is fresh but keeps connections open.',
    rows: [
      {
        option: 'Polling',
        goodAt: 'Simplest to build, works everywhere, and the server stays stateless.',
        badAt: 'Mostly empty answers that waste battery, and news is up to one interval late.',
        pickWhen: 'Updates are rare, or minutes of delay are fine.',
      },
      {
        option: 'Long polling',
        goodAt: 'Near-instant news over plain HTTP.',
        badAt: 'One waiting request per user, and a new request after every message.',
        pickWhen: 'You need push, but WebSockets are blocked.',
      },
      {
        option: 'WebSockets',
        goodAt: 'Instant, two-way messages with tiny overhead.',
        badAt: 'Long-lived connections to manage: reconnects, heartbeats and routing.',
        pickWhen: 'Chat, live comments, games and collaboration.',
      },
      {
        option: 'Server-sent events',
        goodAt: 'Simple one-way streaming with automatic reconnects.',
        badAt: 'Server to client only, and mainly a browser feature.',
        pickWhen: 'Live feeds and counters on a web page.',
      },
      {
        option: 'Webhooks',
        goodAt: 'Other companies hear about events without polling.',
        badAt: 'Receivers must be reachable and must handle retries, duplicates and fake requests.',
        pickWhen: 'Another company’s server needs your events.',
      },
    ],
  },
  realWorld: {
    title: 'Slack keeps a WebSocket open for every client',
    body: 'In a 2023 post, Slack’s engineers describe how messages reach users in real time. Every Slack client keeps a persistent WebSocket connection to Slack’s servers to receive events, after first fetching a user token and connection details with an ordinary request. The connection goes to the nearest edge region and on to a gateway server; unlike Slack’s other servers, gateway servers run in many regions.\n\nWhen someone posts, a channel server sends the message to every gateway server subscribed to that channel, and each gateway pushes it down its users’ WebSockets. Slack says the system serves tens of millions of connected clients and delivers messages across the world in 500 ms.',
    sourceUrl: 'https://slack.engineering/real-time-messaging/',
    sourceLabel: 'Slack Engineering, “Real-time Messaging” (2023)',
  },
  interview: {
    whenToMention:
      'Whenever a feature says live, instant or notify: chat, notifications, live counters, partner integrations. Say how news reaches the client and why that technique fits, then mention the cost of many open connections and how a message finds the server holding the right one.',
    sayItLikeThis: [
      'While the app is open, it keeps a WebSocket to a fleet of connection servers. When someone likes a photo, the like service publishes an event, and the server holding the owner’s socket pushes it within milliseconds.',
      'For partners, I’d send signed webhooks with retries and an event ID, so receivers can verify them and drop duplicates.',
    ],
    followUps: [
      {
        q: 'Why not just poll every second?',
        a: 'At a million online users, that is a million requests a second, nearly all answered with nothing new, and phones burn battery waking their radios. Push sends traffic only when there is news, so it is fresher and cheaper at scale.',
      },
      {
        q: 'How do you scale WebSockets to millions of users?',
        a: 'Run a fleet of connection servers, each holding many thousands of sockets, and route events with [[publish-subscribe|publish-subscribe]]: each server subscribes to channels for its own users. Clients reconnect after growing delays with random [[jitter|jitter]], so a server restart does not bring everyone back in the same second.',
      },
      {
        q: 'What can go wrong with webhooks, and how do receivers cope?',
        a: 'Deliveries fail, get retried, and can arrive twice or out of order, and anyone who learns the address can post fake events. Receivers verify the signature, answer quickly and work from a queue, and record each event ID so duplicates are ignored.',
      },
    ],
    redFlags: [
      'Polling every second for millions of users without counting the requests.',
      'Choosing WebSockets without saying how a message reaches the server that holds the user’s connection.',
      'Assuming each webhook arrives exactly once and in order.',
    ],
  },
  mistakes: [
    '**Polling too often.** Every empty answer costs battery, data and server work, and at scale empty answers can be most of your traffic.',
    '**No reconnect plan.** Mobile connections drop often, so clients need reconnects with growing, randomized delays, or a restart brings every client back at once.',
    '**Slow webhook handlers.** Senders count slow answers as failures and retry; GitHub, for example, expects a reply within 10 seconds. Answer fast and process from a queue.',
    '**Trusting every webhook.** Anyone who learns the address can post fake events, so verify the signature before acting.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt:
        'Snapgram has 20,000 users with the app open, and each phone polls for notifications every 5 seconds. How many requests per second does that send to the servers?',
      answer: 4000,
      unit: 'requests per second',
      tolerance: 1.1,
      solution: [
        'Each phone sends 1 request every 5 seconds, which is 0.2 requests per second.',
        '20,000 × 0.2 = 4,000 requests per second.',
        'Most of those answers are empty, because likes arrive far less often than that.',
      ],
    },
    {
      kind: 'single',
      prompt: 'A live like counter on Snapgram’s web page only needs updates from the server. Which technique is the simplest good fit?',
      options: [
        {
          text: 'Server-sent events',
          correct: true,
          why: 'One-way updates over plain HTTP, with reconnects built into the browser.',
        },
        {
          text: 'WebSockets',
          correct: false,
          why: 'They work, but a two-way connection is more than a one-way counter needs.',
        },
        {
          text: 'Webhooks',
          correct: false,
          why: 'Webhooks deliver events to servers at registered addresses, not to web pages.',
        },
        {
          text: 'Polling every 100 ms',
          correct: false,
          why: 'That is ten requests a second per viewer, most of them returning the same number.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about webhooks are true?',
      options: [
        {
          text: 'The same event can arrive more than once',
          correct: true,
          why: 'Senders retry until they see a success, so a lost reply leads to a duplicate.',
        },
        {
          text: 'Receivers should answer quickly and do slow work later',
          correct: true,
          why: 'Slow answers count as failures and trigger more retries.',
        },
        {
          text: 'Events always arrive in the order they happened',
          correct: false,
          why: 'Retries and parallel deliveries can reorder events, so receivers must not depend on order.',
        },
        {
          text: 'The receiver can be a phone app',
          correct: false,
          why: 'Webhooks go to servers at registered web addresses. A phone has no stable address to receive them.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a WebSocket notification in order.',
      items: [
        'The app sends an HTTP request asking to upgrade',
        'The server answers 101 Switching Protocols',
        'Sam likes Maya’s photo',
        'The server pushes the like down the open connection',
        'Maya’s app shows the notification',
      ],
      why: 'The connection must be upgraded before anything can be pushed, and the server only pushes once there is news to send.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s notifications must reach phones even when the app is closed. What carries them?',
      options: [
        {
          text: 'The phone platform’s push notification service',
          correct: true,
          why: 'Apple and Google keep one shared connection to each phone and deliver the message even when the app is not running.',
        },
        {
          text: 'A WebSocket held open by the closed app',
          correct: false,
          why: 'Phones do not let closed apps keep connections open, to save battery.',
        },
        {
          text: 'Long polling in the background',
          correct: false,
          why: 'Closed apps cannot keep requests waiting, and it would drain the battery if they could.',
        },
        {
          text: 'A webhook sent to the phone',
          correct: false,
          why: 'A phone has no stable public address for a webhook to reach.',
        },
      ],
    },
  ],
  takeaways: [
    'Polling is simple but wasteful and late, while push techniques deliver news the moment it happens.',
    'WebSockets carry two-way messages, server-sent events stream one way over HTTP, and long polling is push for networks that allow nothing else.',
    'Webhooks push events between servers, so receivers must verify them, answer fast and ignore duplicates.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Finding the right connection.** With many connection servers, each user’s socket lives on just one of them. A common fix: every server subscribes to a channel for each user connected to it, and other services publish events to those channels without knowing where anyone is.',
    },
    {
      kind: 'diagram',
      title: 'Finding Maya’s connection',
      caption: 'Publish to the user’s channel; only the server holding the socket is listening.',
      spec: routing,
    },
    {
      kind: 'prose',
      md: '**Treat a push as a hint.** Messages can be lost while a client reconnects, so many apps ask for everything since the last event they saw whenever they reconnect. The push makes it fast, and the catch-up makes it complete.',
    },
    {
      kind: 'prose',
      md: '**HTTP/2 helps streams share.** Over HTTP/2, many event streams and requests share one connection, so a page with several live widgets no longer needs a connection for each.',
    },
  ],
  flashcards: [
    {
      front: 'What is polling, and what does it cost?',
      back: 'Asking the server for news on a timer. Most answers are empty, which wastes battery and server work, and news is up to one interval late.',
    },
    {
      front: 'How does long polling differ from polling?',
      back: 'The server holds each request open until it has news or a timeout passes, so news arrives almost instantly.',
    },
    {
      front: 'WebSockets or server-sent events: what is the difference?',
      back: 'WebSockets are two-way and start with an HTTP upgrade. Server-sent events stream one way, server to client, over a normal HTTP response.',
    },
    { front: 'What is a webhook?', back: 'An HTTP POST that one system sends to an address you registered, whenever an event happens.' },
    {
      front: 'Why must webhook receivers handle duplicates?',
      back: 'Senders retry until they see a success, so a lost reply means the same event arrives again.',
    },
    {
      front: 'How do notifications reach a phone when the app is closed?',
      back: 'Through Apple’s or Google’s push service, which keeps one shared connection to each phone.',
    },
    {
      front: 'What does a heartbeat do on a WebSocket?',
      back: 'A small message every 30 seconds or so lets both sides notice a dead connection and reconnect.',
    },
  ],
  related: ['http-essentials', 'tcp-vs-udp', 'queues-and-streams', 'event-driven', 'real-time-collaboration'],
  glossaryTerms: [
    'polling',
    'http',
    'round-trip-time',
    'long-polling',
    'websocket',
    'tcp',
    'heartbeat',
    'server-sent-events',
    'webhook',
    'api',
    'at-least-once',
    'message-queue',
    'idempotent',
    'push-notification',
    'publish-subscribe',
    'jitter',
  ],
};

export default lesson;
