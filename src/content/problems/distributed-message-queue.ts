import type { DiagramSpec, Problem } from '../types';

/** v1: one broker, one append-only log per topic, consumers reading by offset. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'prod', type: 'service', label: 'Producers', x: 0, y: 0 },
    { id: 'broker', type: 'stream', label: 'Broker', x: 1, y: 0 },
    { id: 'cons', type: 'worker', label: 'Consumer group', sublabel: 'remembers offset', x: 2, y: 0 },
    { id: 'disk', type: 'blockStore', label: 'Log on disk', sublabel: 'append-only', x: 1, y: 1 },
  ],
  edges: [
    { id: 'prod-broker', from: 'prod', to: 'broker', kind: 'sync', label: 'append' },
    { id: 'broker-disk', from: 'broker', to: 'disk', kind: 'sync' },
    { id: 'cons-broker', from: 'cons', to: 'broker', kind: 'sync', label: 'fetch' },
  ],
  steps: [
    {
      caption:
        'A producer sends a message to the **broker**, which appends it to the end of the topic’s **log on disk** and replies with its offset, say 1,042. Nothing in the log is ever changed, only added to.',
      flow: ['prod-broker', 'broker-disk', '<broker-disk', '<prod-broker'],
      notes: [{ target: 'disk', text: 'offset 1,042' }],
    },
    {
      caption:
        'A **consumer group** asks for messages from the offset it reached last, handles a batch, and saves its new offset. A second group reading the same log keeps its own offset, so the two never get in each other’s way.',
      flow: ['cons-broker', 'broker-disk', '<broker-disk', '<cons-broker'],
    },
    {
      caption:
        'After 7 days, the oldest part of the log is deleted, whether or not anyone read it. Reading never removes a message; only retention does.',
      notes: [{ target: 'disk', text: 'oldest data deleted' }],
    },
  ],
};

/** v2: topics split into partitions across brokers; a consumer group shares them out. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'prod', type: 'service', label: 'Producers', sublabel: 'hash(key) → partition', x: 0, y: 1 },
    { id: 'b1', type: 'stream', label: 'Broker 1', sublabel: 'partition 0', x: 1, y: 0 },
    { id: 'b2', type: 'stream', label: 'Broker 2', sublabel: 'partition 1', x: 1, y: 1 },
    { id: 'b3', type: 'stream', label: 'Broker 3', sublabel: 'partition 2', x: 1, y: 2 },
    { id: 'c1', type: 'worker', label: 'Consumer 1', sublabel: 'partitions 0 and 1', x: 2, y: 0 },
    { id: 'c2', type: 'worker', label: 'Consumer 2', sublabel: 'partition 2', x: 2, y: 2 },
  ],
  edges: [
    { id: 'prod-b1', from: 'prod', to: 'b1', kind: 'sync' },
    { id: 'prod-b2', from: 'prod', to: 'b2', kind: 'sync' },
    { id: 'prod-b3', from: 'prod', to: 'b3', kind: 'sync' },
    { id: 'c1-b1', from: 'c1', to: 'b1', kind: 'sync' },
    { id: 'c1-b2', from: 'c1', to: 'b2', kind: 'sync' },
    { id: 'c2-b3', from: 'c2', to: 'b3', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A topic is split into partitions, each its own log, spread across brokers. The producer hashes each message’s key to pick a partition, so every event for one key, such as one order, lands on one partition in the order it was written.',
      flow: [['prod-b1', 'prod-b2', 'prod-b3']],
    },
    {
      caption:
        'Producers collect messages for a few milliseconds and send each partition one compressed batch, so a broker writes a few large chunks instead of thousands of tiny ones. That is how one partition takes about 10 MB a second (ballpark).',
      flow: ['prod-b2', '<prod-b2'],
      notes: [{ target: 'prod', text: 'batch of 500' }],
    },
    {
      caption:
        'Within a group, each partition is read by exactly one member: **consumer 1** reads partitions 0 and 1, and **consumer 2** reads partition 2. Another group reading the same topic gets its own assignment and its own offsets.',
      flow: [['c1-b1', 'c1-b2', 'c2-b3']],
    },
    {
      caption:
        'A consumer that keeps up asks for data written moments ago, which is still in the operating system’s memory, so most reads never touch the disk. Adding a third member would take one partition from consumer 1: a group can use at most as many members as there are partitions.',
      flow: ['c2-b3', '<c2-b3'],
    },
  ],
};

/** v3: each partition replicated to three brokers; a Raft-based controller elects a new leader. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'ctrl', type: 'service', label: 'Controller', sublabel: 'Raft group', x: 0, y: 0 },
    { id: 'prod', type: 'service', label: 'Producer', x: 0, y: 1 },
    { id: 'leader', type: 'stream', label: 'Broker 1', sublabel: 'leader', x: 1, y: 1 },
    { id: 'f1', type: 'stream', label: 'Broker 2', sublabel: 'follower', x: 2, y: 0 },
    { id: 'f2', type: 'stream', label: 'Broker 3', sublabel: 'follower', x: 2, y: 2 },
    { id: 'cons', type: 'worker', label: 'Consumer', x: 3, y: 1 },
  ],
  edges: [
    { id: 'prod-leader', from: 'prod', to: 'leader', kind: 'sync' },
    { id: 'leader-f1', from: 'leader', to: 'f1', kind: 'replication' },
    { id: 'leader-f2', from: 'leader', to: 'f2', kind: 'replication' },
    { id: 'cons-leader', from: 'cons', to: 'leader', kind: 'sync' },
    { id: 'ctrl-f1', from: 'ctrl', to: 'f1', kind: 'async', label: 'you lead now' },
    { id: 'prod-f1', from: 'prod', to: 'f1', kind: 'sync' },
    { id: 'cons-f1', from: 'cons', to: 'f1', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each partition has three replicas on brokers in different zones. Producers and consumers talk only to the partition’s **leader**; the followers keep fetching new messages from it, and a follower that keeps up counts as *in sync*.',
      flow: ['prod-leader', ['leader-f1', 'leader-f2']],
    },
    {
      caption:
        'With `acks=all`, the leader answers the producer only once every in-sync replica has the message. The leader then moves the *high watermark*, the last offset all in-sync replicas hold, and consumers may read only up to it, so they never see a message a failover could take back.',
      flow: ['prod-leader', ['leader-f1', 'leader-f2'], '<prod-leader', 'cons-leader', '<cons-leader'],
      notes: [{ target: 'cons', text: 'reads to high watermark' }],
    },
    {
      caption:
        'Broker 1 dies. The **controller**, a small group of nodes that agree through [[Raft|raft]], sees its heartbeats stop and names **broker 2**, an in-sync follower, as the new leader with a higher epoch. Broker 2 holds every committed message, which is all any consumer has seen.',
      fail: ['leader'],
      add: ['ctrl', 'ctrl-f1'],
      flow: ['ctrl-f1'],
      notes: [{ target: 'ctrl', text: 'epoch 7 → 8' }],
    },
    {
      caption:
        'Producers and consumers fetch fresh metadata and move to broker 2. If broker 1 wakes up still thinking it leads, its old epoch gets its requests refused; it cuts off any messages that were never committed and rejoins as a follower.',
      fail: ['leader'],
      add: ['prod-f1', 'cons-f1'],
      flow: ['prod-f1', '<prod-f1', 'cons-f1', '<cons-f1'],
    },
  ],
};

/** v4: segments, retention and tiered storage; a replay job reads old data. */
const v4: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'live', type: 'worker', label: 'Live consumer', x: 1, y: 0 },
    { id: 'prod', type: 'service', label: 'Producers', x: 0, y: 1 },
    { id: 'broker', type: 'stream', label: 'Broker', sublabel: 'partition leader', x: 1, y: 1 },
    { id: 'replay', type: 'worker', label: 'Replay job', x: 2, y: 1 },
    { id: 'disk', type: 'blockStore', label: 'Local segments', sublabel: 'last 24 hours', x: 1, y: 2 },
    { id: 'tier', type: 'objectStore', label: 'Object storage', sublabel: 'older segments', x: 2, y: 2 },
  ],
  edges: [
    { id: 'prod-broker', from: 'prod', to: 'broker', kind: 'sync' },
    { id: 'live-broker', from: 'live', to: 'broker', kind: 'sync' },
    { id: 'broker-disk', from: 'broker', to: 'disk', kind: 'sync' },
    { id: 'disk-tier', from: 'disk', to: 'tier', kind: 'async' },
    { id: 'replay-broker', from: 'replay', to: 'broker', kind: 'sync' },
    { id: 'broker-tier', from: 'broker', to: 'tier', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each partition’s log is a series of segment files of about 1 GB (ballpark). The **broker** appends only to the newest one; older segments are closed and never change, and a small index per segment maps offsets to positions in the file.',
      flow: ['prod-broker', 'broker-disk'],
      notes: [{ target: 'disk', text: 'newest segment open' }],
    },
    {
      caption:
        'A **live consumer** asks for data written a moment ago. It is still in the operating system’s memory, so the broker copies it straight from memory to the network.',
      flow: ['live-broker', '<live-broker'],
    },
    {
      caption:
        'Closed segments are copied to **object storage**, and the local copies are deleted after 24 hours. Brokers now need disk for one day of data instead of seven, and a topic can keep months of history cheaply.',
      flow: ['disk-tier'],
      notes: [{ target: 'tier', text: 'months, cheaply' }],
    },
    {
      caption:
        'A **replay job** asks for messages from ten days ago, say to rebuild a search index. The broker fetches those segments from object storage and streams them back, so old data can be replayed without living on the brokers.',
      flow: ['replay-broker', 'broker-tier', '<broker-tier', '<replay-broker'],
    },
  ],
};

const problem: Problem = {
  id: 'distributed-message-queue',
  title: 'Distributed message queue',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design a distributed message queue like Apache Kafka. [[Producers|producer]] publish messages to named topics, many independent [[consumer groups|consumer-group]] read each topic at their own pace, and no acknowledged message may be lost.',
  concepts: ['queues-and-streams', 'sharding', 'replication', 'consensus-leader-election', 'idempotency', 'storage-types', 'back-of-the-envelope'],
  hints: [
    'Start from the data structure. What if a queue were an append-only file that each reader moves through at its own pace, instead of a list that messages are removed from? Then ask how one such file becomes many machines’ worth.',
    'Throughput, ordering and durability pull against each other. Think about splitting each topic into pieces that keep order only within themselves, keeping copies of each piece on other machines, and deciding exactly when a message counts as safe.',
    'One shape that works: each topic is split into [[partitions|partition]], each an append-only log of numbered messages ([[offsets|offset]]) kept on three brokers; one replica leads and the others copy it; producers wait until the in-sync copies have each message; each group commits its own offsets; a small [[consensus|consensus]] group elects leaders; and old data is deleted, compacted or moved to object storage.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many messages a second, how big are they, and how many groups read each one?',
      why: 'This sets disk, network and partition counts. Assume a million messages a second at peak, about 1 KB each, read by three consumer groups on average (ballpark): about 1 GB a second in and 3 GB a second out at peak.',
    },
    {
      q: 'Must consumers be able to reread old messages, or is a message gone once it is handled?',
      why: 'Rereading points to a log that keeps messages for a set time while each group tracks its own position. If messages vanish once handled, a classic work queue with an acknowledgment per message fits better; this design takes the log, because replay is what makes many independent readers cheap.',
    },
    {
      q: 'Does order matter, and across what?',
      why: 'A total order across a whole topic caps it at one partition’s throughput. Order per key, such as per account or per order, is what most systems need, and it lets a topic spread over many partitions.',
    },
    {
      q: 'Can a message ever be lost, and may it be delivered twice?',
      why: 'Never losing an acknowledged message means waiting for several copies before acknowledging, a few milliseconds per write (ballpark). Ruling out duplicates entirely is impossible across systems, so the real question is whether consumers can be made [[idempotent|idempotent]].',
    },
    {
      q: 'How long must messages be kept?',
      why: 'A week of everything is about 1,000 TB with three copies (ballpark), which decides whether brokers keep it all on local disk or move older data to object storage. Some topics hold current state and should keep the newest message per key forever.',
    },
    {
      q: 'How soon after a write must a consumer see the message?',
      why: 'Tens of milliseconds end to end (ballpark) leaves room for producers to batch for a few milliseconds and for consumers to wait on open requests. Well under a millisecond would mean tiny batches and shorter replication waits, at a large cost in throughput.',
    },
  ],
  requirements: {
    functional: [
      'Producers publish messages, each with an optional key, to named topics and get back the partition and offset of each.',
      'Consumers in a group share out a topic’s partitions, read in order within each partition, and commit their offsets; any number of groups read the same topic independently.',
      'A consumer can rewind to any retained offset, or to a point in time, and replay.',
      'Retention is set per topic: by time, by size, or by keeping the newest message for each key.',
    ],
    nonFunctional: [
      'Durable: an acknowledged message survives the loss of any one broker, or of a whole availability zone.',
      'High throughput: about 1 GB a second of writes and 3 GB a second of reads at peak (ballpark), growing by adding brokers.',
      'Low latency: tens of milliseconds from publish to consume at the 99th percentile (ballpark).',
      'Ordered within each partition, and highly available: a failed broker’s partitions get new leaders within seconds.',
      'At-least-once delivery by default, with the tools to get exactly-once effects.',
    ],
    outOfScope: [
      'Per-message routing rules, priorities and delayed delivery, as a classic [[message broker|message-broker]] offers.',
      'Message schemas and how they change; a separate registry handles them.',
      'Authentication, encryption and billing for many tenants.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Messages written at peak', value: '1 million a second, half that on average (ballpark)' },
      { label: 'Average message size', value: 'about 1 KB before compression' },
      { label: 'Copies of each partition', value: '3, in three availability zones' },
      { label: 'Consumer groups reading each message', value: '3 on average' },
      { label: 'Retention', value: '7 days' },
      { label: 'One broker, comfortably', value: 'about 20 TB of usable disk and 500 MB a second of traffic each way (ballpark)' },
      {
        label: 'In the calculator',
        value: '100 million users whose apps produce 500 messages each a day, each read by 3 groups, so 2,000 actions per user at 3 reads per write; ignore the storage lines, since data is kept 7 days, not years',
      },
    ],
    steps: [
      { label: 'Incoming data', math: '10⁶ messages a second × 1 KB', result: '≈ 1 GB a second at peak, 500 MB a second on average' },
      { label: 'Network at peak', math: '1 GB/s from producers + 2 GB/s to two followers + 3 GB/s to three groups', result: '≈ 6 GB a second across the cluster' },
      { label: 'Storage for 7 days', math: '500 MB/s × 10⁵ seconds ≈ 50 TB a day; × 7 days × 3 copies', result: '≈ 1,000 TB' },
      { label: 'Brokers if all 7 days stay local', math: '1,000 TB ÷ 20 TB per broker', result: '≈ 50 brokers, sized by disk alone' },
      { label: 'Brokers with one day local', math: 'disk: 50 TB × 3 copies ÷ 20 TB ≈ 8; network: 6 GB/s ÷ 0.5 GB/s per broker', result: '≈ 12 brokers, now sized by network' },
      { label: 'Partitions', math: '1 GB/s ÷ about 10 MB/s per partition (ballpark)', result: 'at least 100, plus room for consumer parallelism' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 2_000, readsPerWrite: 3, objectBytes: 1_000, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'produce(topic, key?, value, headers?)  →  { partition, offset }',
      description:
        'Usually called through a client library that batches messages per partition for a few milliseconds and compresses each batch. With `acks=all`, the call returns once every in-sync replica has the batch. Retries carry the producer’s identifier (ID) and a sequence number, so the broker drops duplicates.',
    },
    {
      signature: 'fetch(topic, partition, fromOffset, maxBytes, maxWaitMs)  →  { messages, highWatermark }',
      description:
        'Consumers pull. The broker returns messages from `fromOffset` up to the high watermark, or holds the request open for up to `maxWaitMs` when nothing is new, which keeps latency low without constant polling.',
    },
    {
      signature: 'commitOffsets(group, { partition: offset, … })  →  ok',
      description:
        'Records how far a group has processed. Commits are written to an internal topic that keeps only the newest offset for each group and partition.',
    },
    {
      signature: 'createTopic(name, partitions, replicas = 3, retention = "7d" | "compact")  →  ok',
      description: 'Asks the controller to place the partitions’ replicas across brokers and zones, and records the result in the cluster metadata.',
    },
  ],
  dataModel: [
    {
      entity: 'Partition log',
      fields: ['offset: 64-bit, one higher for each message', 'key, value, headers', 'timestamp', 'producer_id, sequence'],
      store: 'Append-only segment files of about 1 GB on each replica’s local disk, with a sparse index from offset to file position',
      why: 'Appends and in-order reads are sequential disk access, the fastest kind, and the operating system keeps recent data in memory. The sparse index holds one entry every few kilobytes, so finding an offset is one small lookup and a short scan. Deleting old data means deleting whole files.',
    },
    {
      entity: 'Partition state',
      fields: ['leader: broker', 'leader_epoch', 'in_sync_replicas', 'high_watermark'],
      store: 'Cluster metadata held by the controller’s Raft group, cached on every broker',
      why: 'Exactly one leader per partition, agreed through consensus, is what keeps the replicas’ logs identical. The epoch rises with each new leader, so a broker that still thinks it leads can be told it doesn’t: a [[fencing token|fencing-token]] in all but name.',
    },
    {
      entity: 'Committed offsets',
      fields: ['group, topic, partition: the key', 'offset', 'committed_at'],
      store: 'An internal topic on the brokers, compacted to the newest value per key',
      why: 'Offsets are just more messages, so they get replication for free, and compaction keeps the topic about as small as the number of groups times partitions.',
    },
    {
      entity: 'Producer state',
      fields: ['producer_id', 'producer_epoch', 'last_sequence for each partition'],
      store: 'In memory on each partition leader, saved alongside the log',
      why: 'It lets the leader drop a retried batch it has already written. The producer epoch shuts out an old instance of a producer once a replacement has started.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Let producers hand off messages and let several consumers read them at their own pace, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One broker with an append-only log per topic shows the core idea: the log never changes, and each group remembers its own offset, so a new reader costs nothing. It falls short in two ways: one machine caps throughput at its disk and network, and when it dies, every topic goes with it.',
    },
    {
      title: 'v2: It scales',
      solves: 'A million messages a second at peak (ballpark) is far beyond one broker, and many consumers need to share the work of reading one topic.',
      diagram: v2,
      explanation:
        'Partitions are the unit of everything: throughput, ordering, storage and parallelism. Each is a separate log on one broker, so more brokers and partitions mean more capacity, while keys keep related messages in order. Since a group can’t use more members than the topic has partitions, partition counts are planned for future consumers too.',
    },
    {
      title: 'v3: It survives failures',
      solves: 'Brokers and disks fail. An acknowledged message must survive, the partition must work again within seconds, and consumers must never see history change.',
      diagram: v3,
      explanation:
        'Replication turns one fragile log into three copies, and the in-sync list says which copies are safe to promote. The high watermark hides anything a failover could take back, and epochs decided by consensus stop two brokers from both acting as leader, the [[split brain|split-brain]] problem.',
    },
    {
      title: 'v4: Retention and replay',
      solves:
        'Keeping 7 days of every topic on brokers’ disks takes about 1,000 TB (ballpark), yet consumers still need to replay old data after a bug or to build something new.',
      diagram: v4,
      explanation:
        'Retention by time or size deletes whole segments, which costs almost nothing, and compacted topics keep the newest message per key indefinitely. Tiered storage splits the broker’s two jobs: fast local disks for recent data and cheap object storage for history, so brokers are sized by traffic instead of by retention.',
    },
  ],
  deepDives: [
    {
      title: 'Partitions, keys and ordering',
      problem:
        'One log can’t take a million messages a second, so each topic is split into partitions, but order holds only within a partition. How messages are assigned decides ordering, load balance, and what happens when partitions are added later.',
      options: {
        caption: 'How a producer picks a partition',
        rows: [
          {
            option: 'Round robin, no key',
            goodAt: 'Even load, and a slow partition can simply be skipped.',
            badAt: 'Related messages scatter across partitions, so there is no order between them.',
            pickWhen: 'Independent events such as log lines or metrics.',
          },
          {
            option: 'Hash of a key',
            goodAt: 'Every message with one key, such as one order’s events, lands on one partition in the order it was written.',
            badAt:
              'A [[hot key|hot-key]] overloads one partition, and changing the partition count sends keys to new partitions, breaking order across the change.',
            pickWhen: 'The default whenever order per entity matters.',
          },
          {
            option: 'One partition per topic',
            goodAt: 'A single order over every message.',
            badAt: 'Throughput is capped at one partition, about 10 MB a second (ballpark), with one busy consumer per group.',
            pickWhen: 'Low-volume topics that need a total order, such as a small change log.',
          },
          {
            option: 'Very many partitions',
            goodAt: 'Lots of consumers can work in parallel.',
            badAt: 'Each partition costs open files, memory and metadata, and failovers and rebalances slow down as counts reach the tens of thousands.',
            pickWhen: 'Only as many as the parallelism you need, plus room to grow.',
          },
        ],
      },
      recommendation:
        'Key messages by the entity whose order matters, such as the order or account ID, and hash keys to partitions. Size each topic for peak throughput and future consumers, about 100 partitions for 1 GB a second (ballpark), because adding partitions later moves keys. When a keyed topic must grow, create a bigger topic and move producers and consumers over at a planned point.',
    },
    {
      title: 'When is a message safe?',
      problem:
        'An acknowledged message must survive a broker dying, but waiting for every copy costs latency. And when a leader dies, the new one must hold every message consumers have already seen, or history appears to change under them.',
      options: {
        caption: 'Acknowledgment levels',
        rows: [
          {
            option: '`acks=0`: fire and forget',
            goodAt: 'Lowest latency; the producer never waits.',
            badAt: 'Messages vanish whenever a broker or the network hiccups, and the producer never knows.',
            pickWhen: 'Metrics or logs, where a small loss is fine.',
          },
          {
            option: '`acks=1`: leader only',
            goodAt: 'The leader confirms as soon as it has written the message, in about a millisecond (ballpark).',
            badAt: 'If the leader dies before a follower copies the message, it is gone, though the producer was told it was safe.',
            pickWhen: 'High volume, where losing a few messages in a crash is acceptable.',
          },
          {
            option: '`acks=all`, at least 2 in sync',
            goodAt:
              'The leader confirms only when every in-sync follower has the message, and refuses writes if fewer than two replicas are in sync, so an acknowledged message is always on two brokers or more.',
            badAt: 'Latency follows the slowest in-sync follower, a few milliseconds (ballpark), and a partition stops taking writes when only one replica is left.',
            pickWhen: 'The default for anything you can’t afford to lose.',
          },
          {
            option: 'A majority quorum per write',
            goodAt: 'Each partition runs its own consensus log, and a write commits on a majority, so one slow follower never holds writes up.',
            badAt: 'Surviving two failures takes five copies rather than three, and every write pays for a round of consensus.',
            pickWhen: 'Steady latency matters more than storage, or you want one protocol for data and metadata.',
          },
        ],
      },
      recommendation:
        'Default to `acks=all` with three replicas across zones and at least two in sync. Consumers read only up to the high watermark, so a failover never shows them a message that then disappears. Drop a follower from the in-sync list once it lags by more than tens of seconds (ballpark), so one sick broker can’t stall every write to its partitions.',
    },
    {
      title: 'At-least-once, and exactly-once effects',
      problem:
        'Producers retry when an acknowledgment is lost, and consumers crash between doing the work and committing their offset. Both create duplicates. The queue must say plainly what it promises, and give consumers the tools to get each message’s effect exactly once.',
      options: {
        caption: 'Delivery guarantees and the tools behind them',
        rows: [
          {
            option: '[[At-most-once|at-most-once]]: commit, then process',
            goodAt: 'No duplicates, and simple.',
            badAt: 'A crash after the commit but before the work loses the message.',
            pickWhen: 'Losing a message is cheaper than handling it twice, as for a live chart.',
          },
          {
            option: '[[At-least-once|at-least-once]]: process, then commit',
            goodAt: 'Nothing is lost: after a crash, the consumer resumes from its last committed offset and redoes a little work.',
            badAt: 'Messages handled since the last commit run again, so consumers must be idempotent.',
            pickWhen: 'The default for almost everything.',
          },
          {
            option: 'Idempotent producer',
            goodAt:
              'Each producer numbers its messages per partition with a [[sequence number|sequence-number]], and the leader drops a retried batch it has already written, so producer retries never duplicate.',
            badAt: 'Covers only the hop from producer to broker, not what consumers do.',
            pickWhen: 'Always on: it costs almost nothing.',
          },
          {
            option: 'Transactions across partitions',
            goodAt:
              'A job that reads from topics and writes to topics commits its output and its input offsets together, so the whole loop takes effect [[exactly once|exactly-once]] inside the log.',
            badAt: 'Only inside the log: a card charge or an email still needs its own protection, and transactions add latency.',
            pickWhen: 'Stream-processing pipelines whose input and output are both topics.',
          },
        ],
      },
      recommendation:
        'Promise at-least-once delivery, turn idempotent producers on by default, and offer transactions for pipelines that stay inside the log. Give consumers the rule that works everywhere: record each message’s offset or ID in the same database transaction as its effect, and skip any message already recorded. That is exactly-once in effect, the only kind anyone can promise across systems.',
    },
    {
      title: 'Retention: what to keep, and where',
      problem:
        'At 50 TB a day (ballpark), logs can’t grow forever. Some topics are events nobody needs after a week, some hold current state that new consumers must rebuild from, and some must be kept for months for audits and replays.',
      options: {
        caption: 'Four ways to bound a log',
        rows: [
          {
            option: 'Delete by time or size',
            goodAt: 'Dropping whole segments older than 7 days is almost free, and disk use is predictable.',
            badAt: 'Data is gone after the window, and a consumer more than 7 days behind silently loses messages.',
            pickWhen: 'Event topics: clicks, logs, metrics.',
          },
          {
            option: 'Compaction by key',
            goodAt:
              'A background cleaner keeps only the newest message for each key, so the topic holds current state indefinitely in bounded space; a message with an empty value deletes its key.',
            badAt: 'Older values for a key are lost, and cleaning rewrites segments, using disk bandwidth.',
            pickWhen: 'State and change logs, such as committed offsets or each user’s latest profile.',
          },
          {
            option: 'Tiered storage',
            goodAt: 'Closed segments move to object storage, so retention can be months at a fraction of the cost, and brokers need disk only for recent data.',
            badAt: 'Old reads are slower to start, tens of milliseconds (ballpark), and depend on the object store being reachable.',
            pickWhen: 'Long retention, or brokers whose disks fill long before their network does.',
          },
          {
            option: 'Archive to files for analytics',
            goodAt: 'A connector copies topics into columnar files that analytics tools query directly.',
            badAt: 'A second copy to manage, and replays must come from files rather than through consumers.',
            pickWhen: 'History is for analysis and audits rather than replay.',
          },
        ],
      },
      recommendation:
        'Set retention per topic: deletion after 7 days by default, compaction for state topics, and tiered storage for anything kept longer than a few days. Alert on [[consumer lag|consumer-lag]], measured in time, well before it nears the retention window, because a consumer that falls further behind than retention resumes from the oldest data still there and silently skips the rest.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 10 GB a second of writes (ballpark).',
      impact:
        'Broker networks and disks saturate, latency climbs, and followers fall behind and drop out of the in-sync list; with at least two required in sync, partitions start refusing writes.',
      mitigation:
        'Add brokers and move partitions onto them in throttled steps, enforce per-client quotas so one noisy producer can’t starve the rest, and make sure every producer compresses its batches.',
    },
    {
      scenario: '100× load on one partition from a hot key.',
      impact: 'One partition’s leader hits its limits while the rest of the cluster idles, and that partition’s consumers fall behind.',
      mitigation: 'Spread the hot key over several partitions with a suffix, or give it its own topic, accepting looser order for it, and cap the producer with a quota.',
    },
    {
      scenario: 'A broker dies.',
      impact: 'The partitions it led have no leader for a few seconds, and producers get errors and retry.',
      mitigation:
        'The controller promotes in-sync followers within seconds, and idempotent producers retry without duplicates. When the broker returns, it catches up as a follower before it can lead again.',
    },
    {
      scenario: 'The active controller dies.',
      impact: 'No leadership can change until a new controller takes over, but reads and writes to healthy partitions carry on.',
      mitigation: 'The controller is a Raft group of three or five nodes, so another member takes over in seconds, while brokers keep serving with the metadata they already have.',
    },
    {
      scenario: 'A network split leaves an old leader running.',
      impact: 'Producers that can still reach it may keep sending it writes.',
      mitigation:
        'With `acks=all`, it can’t get those writes confirmed by followers that now follow the new leader, so producers see errors, never false success. Its old epoch is rejected, and when it rejoins it cuts off its uncommitted tail.',
    },
    {
      scenario: 'A consumer dies or stalls.',
      impact: 'Its partitions stop being processed, and lag grows.',
      mitigation:
        'Its heartbeats to the group coordinator stop, the group rebalances, and another member resumes each partition from the last committed offset, redoing a few messages. Rebalancing that moves only the affected partitions keeps everyone else working.',
    },
    {
      scenario: 'A message crashes its consumer every time.',
      impact: 'The consumer restarts, rereads the same message and crashes again, so the whole partition stalls behind it.',
      mitigation:
        'After a few attempts, the consumer writes the message to a [[dead-letter queue|dead-letter-queue]] topic and moves on, and an engineer inspects and replays it once the bug is fixed.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Describes producers appending to a log and consumers reading by offset, with each group keeping its own position.',
        'Splits topics into partitions for throughput and says that order holds within a partition.',
        'Copies each partition to several brokers so that one failure loses nothing.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Chooses partition keys for ordering and explains what a hot key, or a change in partition count, does.',
        'Explains acknowledgment levels and in-sync replicas, and why consumers read only up to the high watermark.',
        'Picks at-least-once delivery with idempotent consumers and says where duplicates come from.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Explains leader election through a consensus-based controller, epochs that shut out old leaders, and what happens during a split.',
        'Designs retention per topic, with deletion, compaction and tiered storage, and ties lag alerts to the retention window.',
        'Sizes the cluster by disk, network and partition count, and plans throttled rebalancing and quotas.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The leader of a busy partition just died. Walk me through the next ten seconds.',
      a: 'The controller notices the missing heartbeats within a few seconds and promotes an in-sync follower, raising the leader epoch. Producers get errors, refresh their metadata and retry, and idempotence stops those retries from creating duplicates. Consumers move to the new leader and carry on from their offsets; they only ever saw committed messages, so nothing they read is missing there.',
    },
    {
      q: 'Can a message the producer was told is safe still be lost?',
      a: 'With `acks=all` and at least two in sync, only if every copy is lost at once, such as two brokers in one zone failing together, which is why replicas sit in different zones. Brokers write to the operating system’s memory and flush to disk later, so safety comes from copies on separate machines rather than from each write reaching disk. With `acks=1`, yes: a leader crash before a follower copies the message loses it.',
    },
    {
      q: 'One member of a consumer group is far slower than the rest. What happens?',
      a: 'Its partitions build up lag while other members sit idle, since each partition has exactly one reader in a group. I add members up to the partition count; past that, I add partitions, or let each consumer process a partition’s messages in parallel, keeping order per key. If it stops sending heartbeats, the group rebalances and its partitions move.',
    },
    {
      q: 'How would you guarantee exactly-once processing?',
      a: 'Inside the log, idempotent producers plus transactions let a read, process and write loop commit its outputs and its input offsets together. Outside it, nobody can promise exactly-once delivery, so I make the effects idempotent: the consumer records each message’s offset in the same database transaction as its work and skips anything already recorded.',
    },
    {
      q: 'A team wants to grow a keyed topic from 12 partitions to 48. What breaks?',
      a: 'Keys hash to different partitions, so messages for one key written after the change can land on a new partition and be read before older ones still waiting on the old partition. If order matters, I create a new 48-partition topic, switch producers at a known point, and let consumers finish the old topic before they start on the new one.',
    },
    {
      q: 'A team wants to keep a topic for a year so they can replay it. How?',
      a: 'Tiered storage: closed segments go to object storage and brokers keep about a day locally, so a year of data costs object-storage prices and needs no bigger brokers. Replays then read through the brokers from object storage, slower to start but fine for backfills. If they need the latest state rather than every event, a compacted topic is far smaller.',
    },
    {
      q: 'How is this different from a classic work queue, and could you add an acknowledgment per message?',
      a: 'A log tracks one offset per partition per group, so a single slow message holds back the offset behind it, and reading deletes nothing. A work queue acknowledges each message, redelivers only failed ones after a timeout, and deletes them when done. You can layer per-message acknowledgment on a log by tracking which offsets are done and committing only up to the first gap, at the cost of more state.',
    },
  ],
  rubric: [
    { item: 'Estimated write rate, network traffic with replication and fan-out, and storage for the retention window', weight: 10, lessonId: 'back-of-the-envelope' },
    { item: 'Modeled topics as partitioned append-only logs, with offsets and consumer groups', weight: 20, lessonId: 'queues-and-streams' },
    { item: 'Chose partition keys for ordering and handled hot keys and changing partition counts', weight: 10, lessonId: 'sharding' },
    { item: 'Replicated partitions with a leader and in-sync followers, and chose acknowledgment levels and the high watermark', weight: 20, lessonId: 'replication' },
    { item: 'Handled leader failure with a consensus-based controller and epochs that shut out old leaders', weight: 15, lessonId: 'consensus-leader-election' },
    { item: 'Stated delivery guarantees and made duplicates harmless with idempotent producers and consumers', weight: 15, lessonId: 'idempotency' },
    { item: 'Designed retention per topic, with deletion, compaction and tiered storage', weight: 10, lessonId: 'storage-types' },
  ],
};

export default problem;
