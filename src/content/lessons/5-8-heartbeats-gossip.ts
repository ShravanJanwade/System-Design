import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a crash, a timeout, and two rounds of gossip. */
const detect: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'n9', type: 'cache', label: 'Cache 9', x: 0, y: 0.5 },
    { id: 'n4', type: 'cache', label: 'Cache 4', x: 1, y: 0.5 },
    { id: 'n61', type: 'cache', label: 'Cache 61', x: 2, y: 0 },
    { id: 'n130', type: 'cache', label: 'Cache 130', x: 2, y: 1 },
    { id: 'n17', type: 'cache', label: 'Cache 17', x: 3, y: 0 },
    { id: 'n188', type: 'cache', label: 'Cache 188', x: 3, y: 1 },
  ],
  edges: [
    { id: 'hb', from: 'n9', to: 'n4', kind: 'async' },
    { id: 'g1', from: 'n4', to: 'n61', kind: 'async' },
    { id: 'g2', from: 'n4', to: 'n130', kind: 'async' },
    { id: 'g3', from: 'n61', to: 'n17', kind: 'async' },
    { id: 'g4', from: 'n130', to: 'n188', kind: 'async' },
  ],
  steps: [
    {
      caption: 'Every second, Cache 9 sends a heartbeat. Each one that reaches Cache 4 resets Cache 4’s 5-second timer for it.',
      flow: ['hb', 'hb'],
    },
    {
      caption: 'Cache 9’s power supply fails and its heartbeats stop. Cache 4’s timer keeps counting.',
      fail: ['n9'],
      notes: [{ target: 'n4', text: 'silent for 3 s' }],
    },
    {
      caption: 'Five seconds pass in silence, so Cache 4 marks Cache 9 as down. In the next gossip round, it tells two nodes picked at random.',
      fail: ['n9'],
      flow: [['g1', 'g2']],
      notes: [{ target: 'n4', text: '9 is down', tone: 'alert' }],
    },
    {
      caption: 'In the round after, every node that knows tells two more random nodes. Three nodes knew; now up to nine do.',
      fail: ['n9'],
      flow: [['g3', 'g4']],
    },
    {
      caption: 'The number who know triples each round at first, so all 199 live nodes hear within about eight rounds (ballpark), with no central server involved.',
      fail: ['n9'],
      focus: ['n4', 'n61', 'n130', 'n17', 'n188'],
      notes: [{ target: 'n4', text: 'round 1', tone: 'signal' }],
    },
  ],
};

/** A garbage collection pause makes a healthy node look dead, until its next heartbeat. */
const pause: SequenceSpec = {
  actors: [
    { id: 'c23', type: 'cache', label: 'Cache 23' },
    { id: 'c4', type: 'cache', label: 'Cache 4' },
    { id: 'c61', type: 'cache', label: 'Cache 61' },
  ],
  messages: [
    { from: 'c23', to: 'c4', label: 'heartbeat 812', kind: 'async', caption: 'Cache 23 is healthy. Its heartbeat counter rises every second; Cache 4 has seen 812.' },
    {
      from: 'c4',
      to: 'c61',
      label: '23 is suspect',
      kind: 'async',
      caption: 'Cache 23 freezes in an 8-second garbage collection pause. After 5 silent seconds, Cache 4 suspects it and gossips that, but nobody removes it yet.',
    },
    { from: 'c23', to: 'c4', label: 'heartbeat 813', kind: 'async', caption: 'The pause ends, and Cache 23 sends its next heartbeat as if nothing happened.' },
    {
      from: 'c4',
      to: 'c61',
      label: '23 alive, 813',
      kind: 'async',
      caption: 'Counter 813 is newer than the suspicion, so it overrides it everywhere, and Cache 23 keeps its keys.',
    },
  ],
};

const lesson: Lesson = {
  id: 'heartbeats-gossip',
  module: 'm5',
  order: 8,
  title: 'Heartbeats and gossip',
  idea: 'A cluster finds failed machines by noticing missing heartbeats, and spreads the news by gossip, each node telling a few random others every round, so everyone hears within a handful of rounds.',
  minutes: 14,
  prerequisites: ['why-distributed-is-hard', 'timeouts-retries-backoff'],
  outcomes: [
    'Explain how heartbeats and timeouts detect failures, and why a slow node can look dead.',
    'Describe how gossip spreads news through a cluster in a number of rounds that grows with the logarithm of its size.',
    'Choose between a central monitor, all-to-all heartbeats and gossip for a cluster.',
  ],
  analogy: {
    title: 'Office gossip',
    body: 'News in an office does not travel by memo. One person hears that the third-floor coffee machine is broken and mentions it to two colleagues at lunch; each of them tells two more by the afternoon, and by the next morning the whole building knows, with nobody in charge of telling anyone.\n\nThe office also notices who is missing. If a colleague who always says good morning has not appeared by ten, people start to wonder, but someone stuck in traffic looks exactly like someone off sick, until they walk in.',
  },
  whyItMatters:
    'Snapgram’s cache cluster has grown to 200 nodes, and every app server needs to know which nodes are alive, so that requests for a dead node’s keys go elsewhere. At first, one monitoring server checks every node and publishes a list. But it is a [[single point of failure|single-point-of-failure]]: when it hiccups, all 200 nodes look dead at once.\n\nThen, one evening, a healthy cache node freezes for 8 seconds while its memory is cleaned up, and the monitor declares it dead. Its keys move to other nodes, those caches miss, and the database takes the load. Seconds later the node is back, as if nothing had happened.',
  body: [
    { kind: 'heading', text: 'Heartbeats and timeouts' },
    {
      kind: 'prose',
      md: 'From outside a machine, you only know what it tells you. So each node sends a [[heartbeat|heartbeat]], a tiny “still here” message, about once a second (ballpark), and a [[failure detector|failure-detector]] on the receiving side runs a [[timeout|timeout]]: if no heartbeat arrives for, say, 5 seconds, the node is declared dead. A load balancer’s [[health check|health-check]] is the same idea, run in the other direction.',
    },
    {
      kind: 'diagram',
      title: 'Detecting a failure and spreading the news',
      caption: 'Six of Snapgram’s 200 cache nodes. Step through a crash, a timeout and two rounds of gossip.',
      spec: detect,
    },
    {
      kind: 'prose',
      md: 'The timeout is a trade-off you cannot escape. A short one finds real failures fast but also convicts healthy nodes that were only slow, a [[false positive|false-positive]]; a long one avoids false alarms but keeps sending requests to a dead node for longer. A dead node and a slow one look exactly the same from outside.',
    },
    { kind: 'heading', text: 'Who checks on whom' },
    {
      kind: 'prose',
      md: 'A central monitor is simple but, as Snapgram found, fragile. Having every node heartbeat every other node removes it, but the messages grow with the square of the cluster. A [[gossip protocol|gossip-protocol]] keeps the work per node fixed and still spreads news to everyone quickly.',
    },
    {
      kind: 'numbers',
      items: [
        { label: 'Central monitor', value: '200 messages a second', note: 'cheap, but one machine decides for everyone' },
        { label: 'Every node checks every node', value: '39,800 messages a second', note: '200 × 199, growing with the square of the cluster' },
        { label: 'Gossip with a fanout of 2', value: '400 messages a second', note: 'two per node per round, whatever the size' },
      ],
      caption: 'Heartbeat traffic for Snapgram’s 200 cache nodes at one round per second (ballpark).',
    },
    { kind: 'heading', text: 'How gossip spreads news' },
    {
      kind: 'prose',
      md: 'In each [[gossip round|gossip-round]], typically about once a second, every node that knows something tells a few random peers, its [[fanout|gossip-fanout]]. With a fanout of 2, news reaches 3 nodes after one round, up to 9 after two and up to 27 after three: like a rumor, the number who know multiplies each round. So doubling the cluster adds only about one round, and the time to reach everyone grows with the logarithm of the cluster size.',
    },
    {
      kind: 'prose',
      md: 'What nodes gossip about is their [[membership list|membership-list]]: every node they know of, with its latest heartbeat counter. Each node raises its own counter every round, and when two lists meet, the higher counter wins. A node whose counter stops rising is the one that is down, and with no central server, the cluster reaches [[eventual consistency|eventual-consistency]] about who is alive within seconds.',
    },
    { kind: 'heading', text: 'Fewer false alarms' },
    {
      kind: 'prose',
      md: 'A long [[pause|process-pause]], such as garbage collection freezing a program for seconds, makes a healthy node look dead. So many systems soften the verdict: a silent node is first [[suspected|suspected-node]], and it is declared dead only if it stays silent through a grace period. If it wakes up, its next heartbeat carries a higher counter, which overrides the suspicion everywhere.',
    },
    {
      kind: 'sequence',
      title: 'A pause that looks like a crash',
      caption: 'A long pause, a suspicion and a recovery.',
      spec: pause,
    },
    {
      kind: 'prose',
      md: 'Two more refinements are common. With an [[indirect probe|indirect-probe]], a node that gets no answer asks a few others to try, so one bad network link cannot get a node convicted. And a [[phi accrual failure detector|phi-accrual-failure-detector]] replaces the fixed timeout with a suspicion level, based on how late a heartbeat is compared with that node’s usual rhythm.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real gossip systems also exchange their full state now and then, cap how much each message carries, and handle nodes joining and leaving on purpose. The widget below uses simple push gossip, in which only nodes that know send; real protocols often pull as well.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'gossip',
      title: 'Gossip in a cluster',
      caption:
        'Cache node 4 has just noticed that cache node 9 is down. Step through the rounds and count how many it takes for all 199 live nodes to hear, then change the fanout or the cluster size and compare.',
      props: { nodes: 200, fanout: 2, seed: 7 },
    },
  ],
  tradeoffs: {
    caption: 'Three ways to track which nodes are alive.',
    rows: [
      {
        option: 'Central monitor',
        goodAt: 'Simple, with one list that everyone reads.',
        badAt: 'A single point of failure that sees the network from one place only.',
        pickWhen: 'Small clusters, or as one input among several.',
      },
      {
        option: 'All-to-all heartbeats',
        goodAt: 'Fast, direct detection.',
        badAt: 'Messages grow with the square of the cluster: about 40,000 a second for 200 nodes.',
        pickWhen: 'A handful of nodes, such as a five-node coordination cluster.',
      },
      {
        option: 'Gossip',
        goodAt: 'Fixed work per node, no single point of failure, and news reaches everyone in about log N rounds.',
        badAt: 'For a few seconds, nodes disagree about who is alive.',
        pickWhen: 'Clusters of dozens to thousands of nodes, where seconds of disagreement are fine.',
      },
    ],
  },
  realWorld: {
    title: 'Gossip and failure detection in Apache Cassandra',
    body: 'Apache Cassandra’s documentation describes gossip as how the database spreads basic cluster information, such as which nodes are members. Every second, each node updates its own heartbeat state, exchanges state with one random node, sometimes tries nodes it believes are unreachable, and, if the random node was not a seed, also gossips with one of a few well-known seed nodes. Each piece of state carries a generation and a version, so nodes can tell newer information from stale.\n\nEach node also runs its own variant of the phi accrual failure detector, driven mostly by heartbeats: when a peer’s heartbeat stops rising for long enough, the node stops routing reads to it. These up and down verdicts are local and are not gossiped. A node marked down is never removed from the cluster without an operator’s instruction, so a brief failure does not shuffle data around.',
    sourceUrl: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html',
    sourceLabel: 'Apache Cassandra documentation, “Dynamo” architecture: gossip and failure detection',
  },
  interview: {
    whenToMention:
      'When your design has a cluster that must know which members are alive: a cache cluster, a sharded database, a fleet of workers. Start with heartbeats and timeouts, and bring up gossip when asked how every node learns of a failure without a central server.',
    sayItLikeThis: [
      'Nodes heartbeat every second; a node silent for 5 seconds is suspected, and declared dead only if it stays silent through a grace period, so a garbage collection pause doesn’t evict it.',
      'Membership spreads by gossip: each node tells a couple of random peers per round, so news reaches all 200 nodes in about eight rounds, with fixed work per node.',
    ],
    followUps: [
      {
        q: 'How long until every node knows that a node died?',
        a: 'The timeout, plus the grace period, plus the spread: about log N gossip rounds, roughly eight for 200 nodes at a round a second (ballpark). Shorter timeouts are faster but evict more healthy nodes.',
      },
      {
        q: 'Why not have every node heartbeat every other node?',
        a: 'Messages grow with the square of the cluster, about 40,000 a second for 200 nodes, and every node does work for all the others. Gossip keeps the work per node fixed and still reaches everyone in a logarithmic number of rounds.',
      },
      {
        q: 'What if a node is only slow, not dead?',
        a: 'From outside it looks the same. Suspicion with a grace period, indirect probes and adaptive detectors such as phi accrual cut false alarms but never remove them, so anything that must not run twice still needs leases or fencing tokens.',
      },
    ],
    redFlags: [
      'Assuming a failure detector can tell a dead node from a slow one for certain.',
      'One central health checker for a large cluster, with no plan for when it fails.',
      'Timeouts shorter than the longest normal pause, so healthy nodes get evicted.',
    ],
  },
  mistakes: [
    '**Timeouts tuned for the average.** Pauses and network blips are rare but long; a timeout shorter than them evicts healthy nodes.',
    '**Trusting one node’s opinion.** A single bad link can hide a healthy node from one place only; check through other nodes first.',
    '**Expecting instant agreement.** For a few seconds after a failure, some nodes still send requests to the dead one, so clients still need timeouts and retries.',
    '**Flapping.** A node declared dead and alive over and over moves its data back and forth; require several good heartbeats before trusting it again.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'Snapgram’s 200 cache nodes each send a heartbeat to every other node once a second. About how many messages per second is that?',
      answer: 39800,
      unit: 'messages per second',
      tolerance: 1.1,
      solution: ['Each node sends to the 199 others.', '200 × 199 = 39,800 messages per second.'],
    },
    {
      kind: 'single',
      prompt: 'Gossip with a fanout of 2 reaches 100 nodes in about seven rounds. Roughly how many rounds does it need for 200 nodes?',
      options: [
        { text: 'About eight', correct: true, why: 'The number who know multiplies each round, so doubling the cluster costs only about one more round.' },
        { text: 'About fourteen', correct: false, why: 'That would be true if news spread at a steady pace; gossip multiplies instead.' },
        { text: 'Exactly seven', correct: false, why: 'More nodes still take a little longer, about one round per doubling.' },
        { text: 'About seventy', correct: false, why: 'Gossip’s time grows with the logarithm of the size, far more slowly than the size itself.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'A cache node freezes for 8 seconds in a garbage collection pause, and the timeout is 5 seconds. What best keeps it from being evicted?',
      options: [
        {
          text: 'Suspect it first, with a grace period longer than typical pauses',
          correct: true,
          why: 'The node gets time to come back and override the suspicion with a newer heartbeat counter.',
        },
        { text: 'Shorten the timeout to 1 second', correct: false, why: 'That makes false alarms more likely, not less.' },
        { text: 'Add more cache nodes', correct: false, why: 'The pause has nothing to do with the size of the cluster.' },
        { text: 'Gossip with a bigger fanout', correct: false, why: 'That only spreads the wrong verdict faster.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about gossip-based membership are true?',
      options: [
        { text: 'Each node does about the same work, whatever the cluster size', correct: true, why: 'It contacts a fixed number of peers per round.' },
        { text: 'All nodes agree on who is alive at every instant', correct: false, why: 'News takes a few rounds to spread, so views differ for a few seconds.' },
        { text: 'There is no single point of failure', correct: true, why: 'Any node can notice a failure and spread the news.' },
        { text: 'A good detector can tell a slow node from a dead one', correct: false, why: 'From outside they look the same; detectors can only suspect, with some chance of being wrong.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the life of a failure, as the cluster sees it, in order.',
      items: [
        'A node stops sending heartbeats',
        'Its neighbors’ timeouts run out',
        'They mark it suspected and gossip that',
        'The grace period passes with no newer heartbeat',
        'It is declared dead, and within a few rounds every node knows',
      ],
      why: 'Detection waits out the timeout and then the grace period, trading speed for fewer false alarms; gossip then spreads the verdict.',
    },
  ],
  takeaways: [
    'Failure detection runs on heartbeats and timeouts, and because a slow node looks exactly like a dead one, every detector trades speed against false alarms.',
    'Gossip spreads news by having each node tell a few random peers every round, so it reaches all nodes in about log N rounds with fixed work per node.',
    'Suspicion, grace periods and indirect probes keep a pause or one bad link from evicting a healthy node.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**SWIM.** HashiCorp’s Serf builds on SWIM (Scalable Weakly-consistent Infection-style Process Group Membership): each node probes a random member at a fixed interval, asks a few others to probe it when there is no answer, and marks it suspicious before declaring it dead. [Serf’s documentation](https://github.com/hashicorp/serf/blob/master/docs/internals/gossip.html.markdown) explains that SWIM carries news only on its probe messages, while Serf adds dedicated gossip messages to spread it faster.',
    },
    {
      kind: 'prose',
      md: '**Push and pull.** In pure push gossip, as in the widget, the last few uninformed nodes are found only by chance, which costs extra rounds. If nodes also pull news from random peers, those stragglers ask for it themselves, and the tail shrinks.',
    },
    {
      kind: 'prose',
      md: '**Anti-entropy.** Besides spreading fresh news, many systems regularly compare their full state with a random peer and repair any differences, so nothing is missed forever.',
    },
  ],
  flashcards: [
    { front: 'What is a heartbeat?', back: 'A small message a node sends at regular intervals to show it is alive.' },
    { front: 'Why can a failure detector never be certain?', back: 'A dead node and a slow or paused one look the same from outside: both are silent.' },
    { front: 'How does gossip spread news?', back: 'Every round, each node that knows tells a few random peers, so the number who know multiplies until everyone has heard.' },
    { front: 'How many rounds does gossip need to reach N nodes?', back: 'About log N: doubling the cluster adds roughly one round.' },
    { front: 'Why not have every node heartbeat every other node?', back: 'Messages grow with the square of the cluster size: about 40,000 a second for 200 nodes.' },
    {
      front: 'How do gossip systems avoid evicting a paused node?',
      back: 'They suspect it first and wait out a grace period; a newer heartbeat counter from the node overrides the suspicion.',
    },
  ],
  related: ['why-distributed-is-hard', 'timeouts-retries-backoff', 'consistent-hashing', 'consensus-leader-election', 'distributed-locks', 'load-balancers'],
  glossaryTerms: [
    'single-point-of-failure',
    'heartbeat',
    'failure-detector',
    'timeout',
    'health-check',
    'false-positive',
    'gossip-protocol',
    'gossip-round',
    'gossip-fanout',
    'membership-list',
    'eventual-consistency',
    'process-pause',
    'suspected-node',
    'indirect-probe',
    'phi-accrual-failure-detector',
  ],
};

export default lesson;
