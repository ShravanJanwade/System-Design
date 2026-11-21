import type { DiagramEdge, DiagramNode, DiagramSpec, Problem } from '../types';

/* ------------------------------------------------------------------ */
/* Diagrams                                                            */
/* ------------------------------------------------------------------ */

/** v1: two phones, one chat server holding both sockets, one database. Store first, then deliver. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'alice', type: 'client', label: 'Alice', x: 0, y: 0 },
    { id: 'bob', type: 'client', label: 'Bob', x: 0, y: 2 },
    { id: 'server', type: 'service', label: 'Chat server', x: 1, y: 1 },
    { id: 'db', type: 'nosqlDb', label: 'Database', sublabel: 'messages', x: 2, y: 1 },
  ],
  edges: [
    { id: 'alice-server', from: 'alice', to: 'server', kind: 'sync', label: 'WebSocket' },
    { id: 'bob-server', from: 'bob', to: 'server', kind: 'sync', label: 'WebSocket' },
    { id: 'server-db', from: 'server', to: 'db', kind: 'sync' },
  ],
  narrow: {
    grid: { cols: 2, rows: 3 },
    positions: {
      alice: { x: 0, y: 0 },
      server: { x: 0, y: 1 },
      db: { x: 1, y: 1 },
      bob: { x: 0, y: 2 },
    },
  },
  steps: [
    {
      caption:
        'Alice and Bob open the app, and each phone opens a WebSocket to the **chat server**: one long-lived, two-way connection that the server can push messages down at any time.',
      flow: [['alice-server', 'bob-server']],
    },
    {
      caption: 'Alice sends “hi”. The server saves it in the **database** first, then acknowledges, and Alice’s app shows one tick: sent.',
      flow: ['alice-server', 'server-db', '<server-db', '<alice-server'],
      notes: [{ target: 'alice', text: 'sent' }],
    },
    {
      caption: 'The server pushes the message down Bob’s socket. His app answers “delivered”, and the server forwards that receipt to Alice: two ticks.',
      flow: ['<bob-server', 'bob-server', '<alice-server'],
      notes: [{ target: 'alice', text: 'delivered' }],
    },
    {
      caption: 'If Bob is offline, the message waits in the database. When his app reconnects, it asks for every message after the last one it has, and the gap fills.',
      flow: ['bob-server', 'server-db', '<server-db', '<bob-server'],
      notes: [{ target: 'bob', text: 'caught up' }],
    },
  ],
};

/**
 * v2 and v3 share one layout: phones on the left, connection servers and the session registry in the
 * middle column, the stateless chat service and the message store to the right, the push service below.
 */
const nodes: DiagramNode[] = [
  { id: 'alice', type: 'client', label: 'Alice', x: 0, y: 0 },
  { id: 'gwA', type: 'service', label: 'Connection server', sublabel: 'A', x: 1, y: 0 },
  { id: 'registry', type: 'cache', label: 'Session registry', x: 1, y: 1 },
  { id: 'chat', type: 'service', label: 'Chat service', sublabel: 'stateless', x: 2, y: 1 },
  { id: 'store', type: 'nosqlDb', label: 'Message store', x: 3, y: 1 },
  { id: 'bob', type: 'client', label: 'Bob', x: 0, y: 2 },
  { id: 'gwB', type: 'service', label: 'Connection server', sublabel: 'B', x: 1, y: 2 },
  { id: 'push', type: 'external', label: 'Push service', sublabel: 'Apple, Google', x: 1, y: 3 },
];

const edges: DiagramEdge[] = [
  { id: 'alice-gwA', from: 'alice', to: 'gwA', kind: 'sync' },
  { id: 'bob-gwB', from: 'bob', to: 'gwB', kind: 'sync' },
  { id: 'gwA-registry', from: 'gwA', to: 'registry', kind: 'sync' },
  { id: 'gwB-registry', from: 'gwB', to: 'registry', kind: 'sync' },
  { id: 'gwA-chat', from: 'gwA', to: 'chat', kind: 'sync' },
  { id: 'chat-registry', from: 'chat', to: 'registry', kind: 'sync' },
  { id: 'chat-gwB', from: 'chat', to: 'gwB', kind: 'sync' },
  { id: 'chat-store', from: 'chat', to: 'store', kind: 'sync' },
  { id: 'chat-push', from: 'chat', to: 'push', kind: 'async' },
  { id: 'push-bob', from: 'push', to: 'bob', kind: 'async' },
];

/** v2: many connection servers, a registry to find them, per-conversation numbering, push for offline users. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes,
  edges,
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      alice: { x: 0, y: 0 },
      gwA: { x: 1, y: 0 },
      registry: { x: 1, y: 1 },
      chat: { x: 2, y: 1 },
      bob: { x: 0, y: 2 },
      gwB: { x: 1, y: 2 },
      store: { x: 2, y: 2 },
      push: { x: 1, y: 3 },
    },
    sides: { 'gwA-chat': { fromSide: 'right', toSide: 'top' }, 'push-bob': { fromSide: 'left', toSide: 'bottom' } },
  },
  steps: [
    {
      caption:
        'Each phone opens a WebSocket to a **connection server** picked by a load balancer. The server records the session in the **session registry**: Alice is on A, Bob is on B.',
      flow: [['alice-gwA', 'bob-gwB'], ['gwA-registry', 'gwB-registry']],
    },
    {
      caption:
        'Alice sends a message. Server A hands it to the **chat service**, which gives it the conversation’s next sequence number and saves it in the **message store**.',
      focus: [],
      flow: ['alice-gwA', 'gwA-chat', 'chat-store', '<chat-store'],
      notes: [{ target: 'store', text: 'seq 42' }],
    },
    {
      caption: 'Only now does Alice get her acknowledgment. The message is stored, so no crash from here on can lose it.',
      focus: [],
      flow: ['<gwA-chat', '<alice-gwA'],
      notes: [{ target: 'alice', text: 'sent' }],
    },
    {
      caption: 'The chat service asks the registry where Bob is connected and hands the message to server B, which pushes it down Bob’s socket.',
      focus: [],
      flow: ['chat-registry', '<chat-registry', 'chat-gwB', '<bob-gwB'],
    },
    {
      caption: 'Bob’s app answers “delivered”, and the receipt travels back the same way to Alice. When Bob opens the chat, a “read” receipt follows the same path.',
      focus: [],
      flow: ['bob-gwB', '<chat-gwB', '<gwA-chat', '<alice-gwA'],
      notes: [{ target: 'alice', text: 'delivered' }],
    },
    {
      caption:
        'In a group, the message is still stored once, then delivered to every member. The chat service looks up each member’s session: online members get it through their connection server, and offline members get a [[push notification|push-notification]].',
      focus: [],
      flow: ['gwA-chat', 'chat-store', '<chat-store', 'chat-registry', '<chat-registry', ['chat-gwB', 'chat-push']],
      notes: [
        { target: 'gwB', text: 'online' },
        { target: 'push', text: 'offline' },
      ],
    },
    {
      caption:
        'An offline member sees the notification and opens the app, which reconnects and asks for everything after the last sequence number it has in each conversation. The push is only a hint; this sync is what guarantees nothing is missed.',
      focus: [],
      flow: ['push-bob', 'bob-gwB', '<chat-gwB', 'chat-store', '<chat-store', 'chat-gwB', '<bob-gwB'],
      notes: [{ target: 'bob', text: 'caught up' }],
    },
  ],
};

/** v3: the same design, plus store replicas and Bob's reconnect to a healthy server. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes: [...nodes, { id: 'replica', type: 'nosqlDb', label: 'Replicas', sublabel: '2 more copies', x: 3, y: 2 }],
  edges: [
    ...edges,
    { id: 'store-replica', from: 'store', to: 'replica', kind: 'replication' },
    { id: 'bob-gwA', from: 'bob', to: 'gwA', kind: 'sync' },
  ],
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      alice: { x: 0, y: 0 },
      gwA: { x: 1, y: 0 },
      registry: { x: 1, y: 1 },
      chat: { x: 2, y: 1 },
      bob: { x: 0, y: 2 },
      gwB: { x: 1, y: 2 },
      store: { x: 2, y: 2 },
      push: { x: 1, y: 3 },
      replica: { x: 2, y: 3 },
    },
    sides: { 'gwA-chat': { fromSide: 'right', toSide: 'top' }, 'push-bob': { fromSide: 'left', toSide: 'bottom' } },
  },
  steps: [
    {
      caption:
        'The **message store** keeps three copies of every message and acknowledges a write once two of them have it, a [[quorum|quorum]], so one dead storage machine loses nothing.',
      focus: [],
      add: ['replica', 'store-replica'],
      flow: ['alice-gwA', 'gwA-chat', 'chat-store', 'store-replica', '<chat-store', '<gwA-chat', '<alice-gwA'],
      notes: [{ target: 'store', text: '2 of 3' }],
    },
    {
      caption:
        'Connection server B crashes, and every socket on it drops. Bob’s app notices at once if the socket closes, or after a few missed [[heartbeats|heartbeat]] if the line just goes silent.',
      focus: [],
      fail: ['gwB'],
      flow: [{ edge: 'bob-gwB', tag: 'no reply', tone: 'alert' }],
    },
    {
      caption:
        'Meanwhile Alice writes to Bob. The registry still points to B, so the delivery fails, but the message is already stored, and a push notification goes out instead.',
      focus: [],
      fail: ['gwB'],
      flow: [
        'alice-gwA',
        'gwA-chat',
        'chat-store',
        '<chat-store',
        'chat-registry',
        '<chat-registry',
        { edge: 'chat-gwB', tag: 'fails', tone: 'alert' },
        'chat-push',
        'push-bob',
      ],
    },
    {
      caption:
        'Bob’s app reconnects after a short random delay, [[jitter|jitter]], so the 100,000 users of server B do not all return in the same second as a [[retry storm|retry-storm]]. The load balancer picks a healthy server, A, which overwrites Bob’s stale session in the registry.',
      focus: [],
      fail: ['gwB'],
      add: ['bob-gwA'],
      flow: ['bob-gwA', 'gwA-registry'],
      notes: [{ target: 'gwA', text: '+ Bob' }],
    },
    {
      caption:
        'His app then syncs, asking for everything after the last sequence number it has in each conversation. The message Alice sent during the outage arrives; nothing was lost, and nothing shows twice.',
      focus: [],
      fail: ['gwB'],
      flow: ['bob-gwA', 'gwA-chat', 'chat-store', '<chat-store', '<gwA-chat', '<bob-gwA'],
      notes: [{ target: 'bob', text: 'caught up' }],
    },
    {
      caption:
        'Later, a network blip swallows Alice’s acknowledgment, so her app resends with the same client message ID. The chat service finds that ID already stored and returns the original sequence number instead of saving a copy.',
      focus: [],
      flow: ['alice-gwA', 'gwA-chat', { edge: 'chat-store', tag: 'duplicate' }, '<chat-store', '<gwA-chat', '<alice-gwA'],
      notes: [{ target: 'alice', text: 'one copy' }],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Problem                                                             */
/* ------------------------------------------------------------------ */

const problem: Problem = {
  id: 'chat-app',
  title: 'Chat app',
  tier: 2,
  flagship: true,
  minutes: 45,
  prompt: 'Design a chat app. People can message each other one-on-one and in small groups, and messages should arrive in real time.',
  concepts: ['real-time-communication', 'time-and-ordering', 'heartbeats-gossip', 'queues-and-streams', 'idempotency', 'stateless-vs-stateful', 'sharding'],
  hints: [
    'Start with two phones that both have the app open. Which side opens the connection, and how can the server push a message to the recipient the moment it arrives?',
    'Give each online device a [[WebSocket|websocket]] to a fleet of connection servers, and save every message before you deliver it. Then work out how the server holding the sender’s socket finds the one holding the recipient’s, and what happens when the recipient is offline.',
    'A strong answer keeps a session registry that maps each user to their connection server, numbers messages within each conversation, and stores them partitioned by conversation. Online devices get messages pushed through their server; offline ones get a push notification and, on reconnect, fetch everything after the last number they have. Receipts are tiny messages flowing back the same way, and online status comes from heartbeats.',
  ],
  clarifyingQuestions: [
    {
      q: 'One-on-one only, or groups too? How large can a group get?',
      why: 'A group message is stored once but delivered to every member, so a group of 500 means 500 deliveries and 500 receipts. A cap of a few hundred keeps per-member delivery simple; groups of many thousands behave like broadcast channels and need a different design.',
    },
    {
      q: 'Does the server keep message history, and should it sync across each user’s devices?',
      why: 'If the server holds messages only until they are delivered, storage stays small, but a new phone starts empty. Keeping history and syncing several devices means a durable store that grows every day, which shapes the data model and the estimate.',
    },
    {
      q: 'Do we need delivery and read receipts, typing indicators and online status?',
      why: 'Receipts send a small message back for every delivery and every read, roughly doubling traffic. Typing indicators and online status are short-lived signals that should never touch the database, so they take a cheaper path that is allowed to lose updates.',
    },
    {
      q: 'How many people use it daily, and how many messages do they send?',
      why: 'Daily users, and the share of them online at once, set the number of open connections and so the size of the connection server fleet. Messages per day set the write rate and how fast the message store grows.',
    },
    {
      q: 'Must everyone see messages in the same order? Across the whole app, or within one conversation?',
      why: 'One order across the whole app would need a single global sequencer, which becomes a bottleneck. Order within a conversation is what people notice, and it lets you number messages per conversation and spread conversations across machines.',
    },
    {
      q: 'Do we support media and end-to-end encryption?',
      why: 'Media goes to [[object storage|object-storage]], and messages carry links, so the chat path stays small. With end-to-end encryption, the server stores and forwards messages it cannot read, which rules out server-side search and content moderation.',
    },
  ],
  requirements: {
    functional: [
      'Send and receive text messages one-on-one and in groups of up to a few hundred members, in real time when the recipient is online.',
      'Offline recipients get a push notification, and every message is waiting on each of their devices when they reconnect.',
      'Messages in a conversation appear in the same order for every member.',
      'Delivery and read receipts, plus online or last-seen status for contacts.',
    ],
    nonFunctional: [
      'Low latency: under about 500 ms from send to delivery for online recipients, a ballpark target.',
      'Durable: once the sender sees “sent”, the message is never lost.',
      'Each message appears exactly once, even though the network may deliver it twice.',
      'Highly available with tens of millions of open connections at peak; a server crash causes reconnects, not lost messages.',
    ],
    outOfScope: [
      'Voice and video calls, message search, stickers and payments.',
      'The details of end-to-end encryption; a follow-up covers how it changes the server’s role.',
      'Uploading and processing media: attachments are links to files in object storage.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily active users', value: '100 million (ballpark)' },
      { label: 'Messages sent', value: '50 per user per day' },
      { label: 'Deliveries per message', value: 'about 2: most chats are one-on-one, and groups and second devices add more' },
      { label: 'Stored size per message', value: 'about 200 bytes: the text plus identifiers (IDs), a sequence number and timestamps' },
      { label: 'Online at peak', value: '20% of daily users, each holding one open connection' },
      { label: 'Connections per server', value: '100,000, a conservative ballpark; an idle connection costs mostly memory' },
      { label: 'Peak', value: 'the busiest hour carries about 2× the daily average' },
      { label: 'In the calculator', value: '150 actions per user a day (50 sends and 100 deliveries), so 2 reads per write; one object is one message' },
    ],
    steps: [
      { label: 'Messages per second', math: '100 million × 50 ÷ 100,000 seconds in a day (86,400, rounded up)', result: '≈ 50,000 a second on average, 100,000 at peak' },
      { label: 'Deliveries per second', math: '50,000 × 2', result: '≈ 100,000 a second on average; receipts send about as many back' },
      { label: 'Storage', math: '5 billion messages a day × 200 bytes', result: '≈ 1 TB a day, about 365 TB a year before replication' },
      { label: 'Open connections at peak', math: '100 million × 20%', result: '≈ 20 million WebSockets' },
      { label: 'Connection servers', math: '20 million ÷ 100,000 per server', result: '≈ 200 servers, plus headroom for failures and deploys' },
      {
        label: 'Heartbeats',
        math: '20 million connections ÷ one every 30 seconds',
        result: '≈ 670,000 a second, far more than messages, so they must stay on the connection servers',
      },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 150, readsPerWrite: 2, objectBytes: 200, peakFactor: 2, retentionYears: 5 },
  },
  api: [
    {
      signature: 'GET /v1/connect   Upgrade: websocket   Authorization: Bearer <token>',
      description:
        'Opens the device’s long-lived socket. The connection server checks the token, then records the session (user, device and server) in the session registry.',
    },
    {
      signature: 'send { clientMsgId, conversationId, body }   →   ack { clientMsgId, seq, sentAt }',
      description:
        'Sent over the socket. The server replies with `ack` only after the message is stored, and the app resends with the same `clientMsgId` until it gets one. That ID is an [[idempotency key|idempotency-key]], so a resend never creates a second copy.',
    },
    {
      signature: 'message { conversationId, seq, senderId, body, sentAt }   (server to device)',
      description: 'Pushes a new message to an online device, which saves it locally and answers with a delivered receipt.',
    },
    {
      signature: 'receipt { conversationId, upToSeq, kind: delivered | read }',
      description: 'Acknowledges every message up to a sequence number at once, so reading 30 new messages sends one receipt, not 30.',
    },
    {
      signature: 'GET /v1/sync?cursor=<opaque>   →   { conversations: [{ id, messages[] }], cursor }',
      description:
        'Called on every reconnect: returns what changed in each conversation since this device last synced. The push notification is only a hint; this call is what makes offline delivery complete.',
    },
    {
      signature: 'POST /v1/conversations   { memberIds[] }   →   { conversationId }',
      description: 'Creates a one-on-one or group conversation. Adding and removing members works the same way.',
    },
  ],
  dataModel: [
    {
      entity: 'Message',
      fields: ['conversation_id: bigint', 'seq: bigint, increasing within the conversation', 'client_msg_id: uuid', 'sender_id: bigint', 'body: text', 'sent_at: timestamp'],
      store: 'Wide-column store such as Cassandra: partitioned by conversation_id (plus a month bucket for busy groups), sorted by seq',
      why: 'Writes are appends, about 100,000 a second at peak, and nearly every read asks for the newest messages in a conversation or everything after a sequence number: a slice of one partition. A [[wide-column store|wide-column-store]] does both well, and the month bucket stops a busy group’s [[partition key|partition-key]] from growing without limit.',
    },
    {
      entity: 'Conversation',
      fields: ['conversation_id: bigint', 'kind: direct | group', 'member_ids: list<bigint>', 'last_seq: bigint'],
      store: 'Relational database, sharded by conversation_id',
      why: 'Member lists change rarely and drive group delivery. `last_seq` is the counter that numbers messages, and incrementing it inside a [[transaction|transaction]] means two people sending at the same moment can never get the same number.',
    },
    {
      entity: 'Inbox entry',
      fields: ['user_id: bigint', 'conversation_id: bigint', 'last_seq: bigint', 'updated_at: timestamp'],
      store: 'Wide-column store, partitioned by user_id, sorted by updated_at',
      why: 'A reconnecting device asks which conversations changed since its last sync, and this per-user index answers with one partition read. Each message updates one row per member, one more reason group size is capped.',
    },
    {
      entity: 'Receipt',
      fields: ['conversation_id: bigint', 'user_id: bigint', 'delivered_up_to: seq', 'read_up_to: seq'],
      store: 'Wide-column store, partitioned by conversation_id',
      why: 'Receipts are cumulative, so each member needs one row per conversation instead of one per message. Who has read a message is one partition read: every member whose `read_up_to` is at least its sequence number.',
    },
    {
      entity: 'Session',
      fields: ['user_id: bigint', 'device_id: string', 'server_id: string', 'last_heartbeat_at: timestamp'],
      store: 'In-memory key-value store such as Redis, each entry with a time to live (TTL) of about a minute',
      why: 'Sessions change every time a phone connects or drops, and every delivery reads them, so they live in memory. Each heartbeat renews the entry’s [[time to live|ttl]]; if a server dies without cleaning up, its entries expire on their own. Online status is simply whether a live session exists.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Get messages flowing between two people: instantly when both are online, and safely stored when one is not.',
      diagram: v1,
      explanation:
        'One server holds every connection, so finding Bob is a lookup in its own memory. Saving before delivering is the rule every later stage keeps: the database, not the socket, is the [[source of truth|source-of-truth]]. The design breaks when one machine can no longer hold every connection, and that machine is a [[single point of failure|single-point-of-failure]].',
    },
    {
      title: 'v2: It scales',
      solves: 'Spread tens of millions of connections across hundreds of servers, and still route every message to the right device.',
      diagram: v2,
      explanation:
        'Connection servers are [[stateful|stateful-service]]: each holds its own users’ sockets, so the **session registry** is how everything else finds them. The **chat service** is [[stateless|stateless]] and scales like any web service behind a [[load balancer|load-balancer]]. Messages are partitioned by conversation, so each conversation’s history lives together, in order.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'Lose a connection server, a storage machine or an acknowledgment without losing or duplicating a message.',
      diagram: v3,
      explanation:
        'Every failure here ends in one of two safe outcomes: a retry that the store recognizes, or a reconnect followed by a sync. That works because messages are stored before delivery, numbered per conversation and deduplicated by their client ID. Pushes down sockets make delivery fast; the sync makes it complete.',
    },
  ],
  deepDives: [
    {
      title: 'Finding the server that holds a user’s socket',
      problem:
        'Twenty million sockets are spread across a few hundred connection servers, and a message for Bob must reach the server holding each of his devices’ sockets. The lookup happens on every delivery, so it must be fast, and it must cope with servers dying and users moving between them.',
      options: {
        caption: 'Four ways to route a message to a connection.',
        rows: [
          {
            option: 'Session registry plus a direct call',
            goodAt: 'One fast lookup, then one call to the right server; the same data answers whether someone is online.',
            badAt: 'The registry sits on every delivery’s path, and a crashed server leaves stale entries until they expire.',
            pickWhen: 'The default for one-on-one and small-group chat.',
          },
          {
            option: '[[Publish-subscribe|publish-subscribe]] channel per user or conversation',
            goodAt: 'Senders publish without knowing where anyone is; each connection server subscribes for its own users.',
            badAt: 'The broker carries every message and every subscription change, so it must scale with connections.',
            pickWhen: 'You already run a broker built for this, or one event goes to many servers, as in large channels.',
          },
          {
            option: 'Broadcast to every server',
            goodAt: 'No registry at all; trivially simple.',
            badAt: 'Every server handles every message, so the cost grows with servers times messages.',
            pickWhen: 'Only for a handful of servers.',
          },
          {
            option: 'Hash each user to a fixed server',
            goodAt: 'Anyone can compute Bob’s server from his ID with [[consistent hashing|consistent-hashing]], so no lookup is needed.',
            badAt: 'Clients must connect to that exact server, and adding or losing a server moves many users at once.',
            pickWhen: 'You control how clients connect, and the fleet rarely changes.',
          },
        ],
      },
      recommendation:
        'Use a session registry in an in-memory store, sharded by user ID, with entries that heartbeats keep alive and that expire on their own. Delivery is one lookup plus one internal call, and a failed delivery is normal rather than an error: the message is already stored, so fall back to a push notification and let the next sync deliver it. Slack has publicly described the publish-subscribe variant, where each client’s WebSocket ends at a gateway server and each message goes to every gateway subscribed to its channel; see [Real-time communication](lesson:real-time-communication).',
    },
    {
      title: 'Ordering messages within a conversation',
      problem:
        'Two members of a group send messages at almost the same moment, through different connection servers and different chat service machines. Every member must see the same order, and a reply must never appear above the message it answers.',
      options: {
        rows: [
          {
            option: 'Server timestamps',
            goodAt: 'Free: every machine already has a clock.',
            badAt: 'Clocks disagree, which is called [[clock skew|clock-skew]], sometimes by more than the gap between two messages, so a reply can sort above its question.',
            pickWhen: 'Only for display, such as the time shown next to a message.',
          },
          {
            option: 'A sequence number per conversation, from one counter',
            goodAt: 'One order that every member sees, and a gap in the numbers reveals a missing message.',
            badAt: 'Each conversation’s counter is one point of contention, and a failover must never reuse a number.',
            pickWhen: 'The default: one conversation’s message rate is low, so its counter never gets hot.',
          },
          {
            option: '[[Logical clocks|logical-clock]]',
            goodAt: 'Causes always sort before effects, without any central counter.',
            badAt: 'Unrelated messages get an arbitrary order, and a late message can land above ones already on screen.',
            pickWhen: 'Peer-to-peer or offline-first designs, where no server sees every message.',
          },
        ],
      },
      recommendation:
        'Number messages with a per-conversation counter in the conversation’s shard, assigned when the message is stored, and have every device sort by that number. It works like a [[sequence number|sequence-number]] in the Transmission Control Protocol (TCP): a device that has 41 and then receives 43 knows 42 is missing and fetches it. A sender’s own messages stay in order because the app sends them one at a time per conversation, waiting for each acknowledgment.',
    },
    {
      title: 'Delivery guarantees, receipts and offline users',
      problem:
        'Networks drop packets, phones lose signal, and servers crash in the middle of a send. The app must deliver every message, never show one twice, and tell the sender how far each message got: sent, delivered or read.',
      options: {
        rows: [
          {
            option: '[[At-most-once|at-most-once]] push',
            goodAt: 'Simplest and fastest: send once and forget.',
            badAt: 'Anything lost in flight is gone for good.',
            pickWhen: 'Typing indicators and online status, where a lost update does not matter.',
          },
          {
            option: '[[At-least-once|at-least-once]] with client message IDs',
            goodAt: 'Nothing is lost: senders retry until acknowledged, and [[deduplication|deduplication]] by ID drops the repeats.',
            badAt: 'Every step must handle repeats, and devices must remember what they already have.',
            pickWhen: 'Messages and receipts.',
          },
          {
            option: 'Push plus sync',
            goodAt: 'Online delivery is instant, and every gap closes when a device asks for everything after its last sequence number.',
            badAt: 'Two paths to build and test.',
            pickWhen: 'Always, alongside at-least-once: the sync is what makes offline delivery complete.',
          },
        ],
      },
      recommendation:
        'Combine them. Senders retry with a client message ID until acknowledged; the server stores before acknowledging, pushes to online devices and sends a push notification to offline ones; and devices sync on every reconnect, so lost pushes heal on their own. Receipts are cumulative watermarks, such as read up to 57, which turns a stream of per-message receipts into a few small updates per conversation.',
    },
    {
      title: 'Online status without flooding the system',
      problem:
        'Online status changes every time a phone connects, drops or goes quiet, and phones drop all the time. Broadcasting every change to every contact could cost more than the messages themselves, and a shaky network makes status flicker.',
      options: {
        rows: [
          {
            option: 'Broadcast every change to all contacts',
            goodAt: 'Status is always current everywhere.',
            badAt: 'Someone with 500 contacts sends 500 updates per change, mostly to people who are not looking.',
            pickWhen: 'Small contact lists and small scale.',
          },
          {
            option: 'Subscribe while viewing',
            goodAt: 'Updates go only to people who have that chat or contact list on screen, so most changes reach nobody.',
            badAt: 'Subscriptions churn as people open and close chats.',
            pickWhen: 'The default for large chat apps.',
          },
          {
            option: 'Fetch on open, no live updates',
            goodAt: 'Cheapest: no subscriptions at all.',
            badAt: 'Status goes stale while the chat stays open.',
            pickWhen: 'Last-seen only, or very large groups where live status is noise.',
          },
        ],
      },
      recommendation:
        'Derive status from sessions: a user is online while any device has a live session in the registry, and last seen is written once, when the last one drops. Declare someone offline only after a grace period of missed heartbeats, about 30 to 60 seconds (ballpark), the same trade-off as any [[failure detector|failure-detector]]: shorter is fresher but flickers, longer is calmer but slower. Send status only to subscribers who are viewing, batched every few seconds.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a global event, and everyone messages at once.',
      impact:
        'Messages reach about a million a second at peak. The message store’s write path and the push provider fill up first, and delivery slows from under a second to several.',
      mitigation:
        'The chat service scales out because it is stateless, and the store adds nodes, since conversations spread evenly across shards. Use [[load shedding|load-shedding]] on the cheap signals first: delay typing indicators and status updates, batch receipts, and keep message delivery fast.',
    },
    {
      scenario: '100× the message volume, for example from bots and broadcast groups.',
      impact:
        'About 10 million messages a second at peak and 100 TB of new history a day. The counters of the busiest groups and the inbox updates for every member become the bottleneck.',
      mitigation:
        'Rate limit bots, treat very large groups as broadcast channels that members read on demand, move old history to cheaper storage, and revisit keeping all history forever. Redo the estimate first, so the fix targets the real bottleneck.',
    },
    {
      scenario: 'A connection server crashes.',
      impact: 'Its 100,000 users lose their sockets at once and reconnect together, which can knock over the servers that take them in.',
      mitigation:
        'Clients reconnect with [[exponential backoff|exponential-backoff]] plus jitter, stale registry entries expire by TTL, and messages sent in between arrive through push notifications and the sync. During deploys, drain servers gradually instead of dropping everyone at once.',
    },
    {
      scenario: 'The session registry goes down.',
      impact: 'The chat service cannot find anyone’s server, so live delivery stops, although sending and storing still work.',
      mitigation:
        'Replicate the registry across zones. If it is lost, connection servers re-register their users within seconds, and until then the chat service falls back to push notifications and sync, so messages arrive late but never vanish.',
    },
    {
      scenario: 'A message store machine dies.',
      impact: 'With three copies and quorum writes, the other two keep serving; latency may rise while the store repairs itself.',
      mitigation:
        'Replace the machine and let the store copy the missing data back in the background. Sends that failed are retried with the same client message ID, so nothing is duplicated.',
    },
    {
      scenario: 'The push notification provider is slow or down.',
      impact: 'Offline users are not woken, so their messages wait until they open the app.',
      mitigation:
        'Call the provider from a queue with retries and a [[dead-letter queue|dead-letter-queue]], never on the send path. Messages are already stored, so the sync delivers them on the next open.',
    },
    {
      scenario: 'A chat service instance dies in the middle of a send.',
      impact: 'The sender gets no acknowledgment, and the message may or may not have been stored.',
      mitigation:
        'The app resends with the same client message ID, and another instance either stores it or returns the existing sequence number. Either way, there is exactly one copy.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Uses WebSockets for real-time delivery and explains why polling every second would be wasteful.',
        'Stores messages before delivering them and explains how an offline user catches up.',
        'Proposes a sensible data model: messages grouped by conversation and kept in order.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Separates stateful connection servers from a stateless chat service, with a session registry to route between them.',
        'Orders messages with per-conversation sequence numbers instead of timestamps, and makes retries safe with client message IDs.',
        'Estimates open connections and servers, and keeps receipts and online status cheap and separate.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Walks through a connection server crash: the reconnect storm, backoff with jitter, stale registry entries and the sync that closes the gap.',
        'States the delivery guarantee end to end: at-least-once with deduplication, pushes as hints and the sync as the safety net.',
        'Discusses limits and trade-offs: group size caps versus broadcast channels, the cost of online status, multi-region connections and what end-to-end encryption takes away from the server.',
      ],
    },
  ],
  followUps: [
    {
      q: 'One of your connection servers just crashed. Walk me through the next minute.',
      a: 'Its users’ sockets drop, and their apps notice from the closed socket or missed heartbeats. They reconnect with backoff and jitter to healthy servers, which register the new sessions. Messages sent in the gap were stored but could not be delivered, so they went out as push notifications, and each app’s sync on reconnect fetches everything after its last sequence number.',
    },
    {
      q: 'Alice’s phone sends a message but never gets the acknowledgment. What happens?',
      a: 'Her app resends with the same client message ID. If the first attempt was stored, the chat service finds the ID and returns the original sequence number; if not, it stores the message now. Either way there is exactly one copy, and Alice sees one message.',
    },
    {
      q: 'How do read receipts work in a group of 200?',
      a: 'Each member sends one cumulative receipt per conversation, such as read up to 57, and the server keeps one watermark row per member. The sender’s app gets those watermarks and works out “read by 150 of 200” itself, instead of tracking 200 receipts for every message.',
    },
    {
      q: 'Bob uses the app on his phone and his laptop. How do both stay in sync?',
      a: 'Each device has its own session in the registry and its own sync cursor. New messages are pushed to every live session, and each device syncs from its own last sequence numbers when it reconnects. A read receipt from one device moves Bob’s watermark, so the other device clears its unread badge too.',
    },
    {
      q: 'A group grows to 100,000 members. What breaks?',
      a: 'Every message becomes 100,000 deliveries, 100,000 inbox updates and a flood of receipts: the same shape as the celebrity problem in a news feed. Treat it like a broadcast channel: store once, push live only to members connected right now, let everyone else read the conversation when they open it, and turn off receipts and online status.',
    },
    {
      q: 'Why not just order messages by the server’s timestamp?',
      a: 'Messages in one conversation can be handled by different machines whose clocks disagree by milliseconds or more, so two close messages can swap places and a reply can sort above its question. A per-conversation counter gives one order that every device agrees on; timestamps are kept only for display.',
    },
    {
      q: 'How does end-to-end encryption change this design?',
      a: 'The server stores and forwards encrypted messages it cannot read. Routing, ordering, receipts and sync all still work, because they rely only on metadata, but server-side search and content moderation are gone, push notifications carry no readable text, and each device needs its own keys.',
    },
  ],
  rubric: [
    { item: 'Asked about groups, history, receipts and ordering before designing', weight: 10, lessonId: 'requirements' },
    { item: 'Estimated messages per second, storage and open connections', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Used WebSockets on connection servers, with a session registry to route messages', weight: 20, lessonId: 'real-time-communication' },
    { item: 'Stored before delivering, and synced offline devices by sequence number', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Ordered messages per conversation instead of by timestamp', weight: 15, lessonId: 'time-and-ordering' },
    { item: 'Made sends idempotent with client message IDs and stated the delivery guarantee', weight: 10, lessonId: 'idempotency' },
    { item: 'Built online status from heartbeats with a grace period, and receipts as watermarks', weight: 10, lessonId: 'heartbeats-gossip' },
    { item: 'Handled connection server crashes: backoff with jitter, stale sessions and sync', weight: 10, lessonId: 'timeouts-retries-backoff' },
  ],
};

export default problem;
