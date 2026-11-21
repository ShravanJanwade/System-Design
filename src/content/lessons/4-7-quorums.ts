import type { DiagramNode, DiagramSpec, Lesson } from '../types';

/** The app, a coordinator and three replicas, shared by the lesson's diagrams. */
function quorumNodes(sublabel: string): DiagramNode[] {
  return [
    { id: 'app', type: 'client', label: 'Snapgram app', x: 0, y: 1 },
    { id: 'coord', type: 'service', label: 'Coordinator', sublabel, x: 1, y: 1 },
    { id: 'r1', type: 'nosqlDb', label: 'Replica 1', x: 2, y: 0 },
    { id: 'r2', type: 'nosqlDb', label: 'Replica 2', x: 2, y: 1 },
    { id: 'r3', type: 'nosqlDb', label: 'Replica 3', x: 2, y: 2 },
  ];
}

const quorumEdges: DiagramSpec['edges'] = [
  { id: 'app-coord', from: 'app', to: 'coord', kind: 'sync' },
  { id: 'coord-r1', from: 'coord', to: 'r1', kind: 'sync' },
  { id: 'coord-r2', from: 'coord', to: 'r2', kind: 'sync' },
  { id: 'coord-r3', from: 'coord', to: 'r3', kind: 'sync' },
];

/** The main step-through: N = 3, W = 2, R = 2, a read that overlaps the write, then read repair. */
const quorumAtWork: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: quorumNodes('N = 3, W = 2, R = 2'),
  edges: quorumEdges,
  steps: [
    {
      caption: 'Every replica holds version 6 of Maya’s activity. Leo comments on her photo, and the **coordinator** sends the new version 7 to all three replicas.',
      flow: ['app-coord', ['coord-r1', 'coord-r2', 'coord-r3']],
    },
    {
      caption: 'Replicas 1 and 2 confirm first. W = 2, so that is enough, and the app hears that the write succeeded. Replica 3 has not stored it yet.',
      flow: [['<coord-r1', '<coord-r2'], '<app-coord'],
      notes: [
        { target: 'r1', text: 'v7', tone: 'signal' },
        { target: 'r2', text: 'v7', tone: 'signal' },
        { target: 'r3', text: 'v6, behind', tone: 'plain' },
      ],
    },
    {
      caption: 'Maya opens her activity tab. R = 2, so the coordinator waits for two answers, and this time Replicas 2 and 3 answer first.',
      flow: ['app-coord', ['coord-r2', 'coord-r3'], ['<coord-r2', '<coord-r3']],
      notes: [
        { target: 'r2', text: 'answers v7', tone: 'signal' },
        { target: 'r3', text: 'answers v6', tone: 'alert' },
      ],
    },
    {
      caption: 'Replica 2 is in both groups. The coordinator returns the highest version it heard, version 7, and Maya sees Leo’s comment.',
      focus: ['app', 'coord', 'r2'],
      flow: ['<app-coord'],
      notes: [{ target: 'r2', text: 'in both', tone: 'signal' }],
    },
    {
      caption: 'The coordinator also sends version 7 to Replica 3, which answered with an old one. This is [[read repair|read-repair]].',
      flow: [{ edge: 'coord-r3', tag: 'v7' }],
      notes: [{ target: 'r3', text: 'repaired', tone: 'plain' }],
    },
  ],
};

/** Snapgram's first setup: W = 1 and R = 1, and the read misses the write. */
const missedRead: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: quorumNodes('N = 3, W = 1, R = 1'),
  edges: quorumEdges,
  steps: [
    {
      caption: 'W = 1: Replica 1 stores Leo’s comment first, and one confirmation is enough, so the write succeeds.',
      flow: ['app-coord', ['coord-r1', 'coord-r2', 'coord-r3'], '<coord-r1', '<app-coord'],
      notes: [
        { target: 'r1', text: 'v7', tone: 'signal' },
        { target: 'r2', text: 'v6, behind', tone: 'plain' },
        { target: 'r3', text: 'v6, behind', tone: 'plain' },
      ],
    },
    {
      caption: 'R = 1: Maya’s read takes the first replica to answer, Replica 3, which has not stored the comment yet. She gets version 6.',
      flow: ['app-coord', 'coord-r3', '<coord-r3', { edge: 'app-coord', reverse: true, tag: 'stale', tone: 'alert' }],
      notes: [{ target: 'r3', text: 'answers v6', tone: 'alert' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'quorums',
  module: 'm4',
  order: 7,
  title: 'Quorums',
  idea: 'Keep N copies of each item, wait for W of them on a write and R of them on a read, and if R + W is greater than N, every read reaches a copy with the latest write.',
  minutes: 14,
  prerequisites: ['replication', 'cap-pacelc'],
  outcomes: [
    'Explain N, R and W, and why R + W > N makes every read overlap the latest write.',
    'Tune R and W for read-heavy or write-heavy data, and say what each choice costs.',
    'Work out how many failed replicas reads and writes can each survive.',
  ],
  analogy: {
    title: 'Two of three roommates',
    body: 'You share a flat with three roommates, and the plan for Saturday changes. You tell two of them and call it done. Later, a friend texts any two of the roommates to ask about the plan.\n\nThe friend doesn’t know which two you told, and it doesn’t matter. Any two of the three must include at least one of the two you told, because two plus two is more than three. That roommate knows the new plan, and the friend goes with the newest plan they hear.',
  },
  whyItMatters:
    'Snapgram now has about 10 million daily users. Its activity store, the [[wide-column store|wide-column-store]] from [choosing a database](lesson:sql-vs-nosql), copies every like, comment and follow to three machines with no [[leader|leader]]: the app can write to any copy and read from any copy. This [[leaderless replication|leaderless-replication]] keeps the store taking writes even while a machine is down.\n\nThe first setup treated a write as done once one copy had it, and read from whichever copy answered first. Then the bug reports started. Maya gets a notification that Leo commented on her photo, opens her activity tab, and the comment is not there; a refresh later, it appears. Her read reached a copy that the write had not reached yet.',
  body: [
    {
      kind: 'prose',
      md: 'Each item lives on several [[replicas|replica]], and three numbers describe how they are used:\n\n- **N** is the number of replicas of each item, the [[replication factor|replication-factor]]. Snapgram uses N = 3.\n- **W** is how many replicas must confirm a write before it counts.\n- **R** is how many replicas must answer a read.\n\nW and R are each a [[quorum|quorum]]: the minimum number of replicas that must take part. A [[coordinator|coordinator]], often just one of the replicas, sends each request to the replicas, waits for enough answers and replies to the app.',
    },
    {
      kind: 'diagram',
      title: 'A quorum write, then a quorum read',
      caption: 'N = 3, W = 2 and R = 2: a write that two replicas confirm, then a read that two replicas answer.',
      spec: quorumAtWork,
    },
    { kind: 'heading', text: 'Why R + W > N means fresh reads' },
    {
      kind: 'prose',
      md: 'The write reached W replicas and the read asked R. If R + W is more than N, the two groups cannot avoid each other: at least R + W − N replicas are in both, and each of them has the latest write.\n\nThe read may also hear older versions from other replicas, so every value carries a version, such as a timestamp, and the coordinator returns the highest. ==If R + W > N, every read overlaps the latest write.==',
    },
    {
      kind: 'prose',
      md: 'Snapgram’s first setup had W = 1 and R = 1. Then R + W = 2 is not more than N = 3, so the write and the read can land on different replicas, and the read returns [[stale data|stale-data]], as it did for Maya.',
    },
    {
      kind: 'diagram',
      title: 'Why Maya missed the comment',
      caption: 'The first setup: N = 3, W = 1 and R = 1.',
      spec: missedRead,
    },
    { kind: 'heading', text: 'Tuning R and W' },
    {
      kind: 'prose',
      md: 'Within R + W > N, you choose where to pay. A write waits for the W-th fastest replica and a read for the R-th fastest, so a bigger quorum waits for slower machines and hurts [[tail latency|tail-latency]]. Write to all three and read from one, and reads are cheap but writes are slow; write to one and read from all three, and it is the reverse.\n\nSnapgram keeps W = 2 and R = 2 for activity events. View counts can be a few views behind for a second, so they use W = 1 and R = 1, and the replicas catch up within moments: [[eventual consistency|eventual-consistency]]. Stores such as Cassandra let you choose per request, which is called [[tunable consistency|tunable-consistency]].',
    },
    { kind: 'heading', text: 'When replicas fail' },
    {
      kind: 'prose',
      md: 'A replica that is down cannot confirm writes or answer reads, so writes survive N − W failed replicas and reads survive N − R. With N = 3, W = 2 and R = 2, you can lose any one replica, but not two.\n\nThat is why a majority on both sides, two of three or three of five, is the usual default: two majorities always overlap, and a majority survives losing any minority. Raising W or R to N makes the other side cheaper, but then one failed replica blocks every request of that kind. When a replica returns, read repair and a background [[anti-entropy|anti-entropy]] process copy over the writes it missed.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out two writes to the same item at the same moment: picking a winner needs a rule such as [[last write wins|last-write-wins]] or [[version vectors|version-vector]], covered in [Time and ordering](lesson:time-and-ordering). It also skips sloppy quorums, described under Go deeper.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'quorum',
      preset: { n: 3, w: 2, r: 2 },
      intro: 'Now set N, R and W on one key of Snapgram’s activity store. Fail replicas, try the worst-case read, and find the settings where a read misses the latest write.',
    },
  ],
  tradeoffs: {
    caption: 'Where to set the quorums for three replicas.',
    rows: [
      {
        option: 'Write all, read one (W = 3, R = 1)',
        goodAt: 'Cheap reads that always see the latest write.',
        badAt: 'Writes wait for the slowest replica, and one failed replica blocks them all.',
        pickWhen: 'Reads far outnumber writes, and writes can wait.',
      },
      {
        option: 'Write one, read all (W = 1, R = 3)',
        goodAt: 'The fastest writes, which survive two failed replicas.',
        badAt: 'Reads wait for the slowest replica, and one failed replica blocks them all.',
        pickWhen: 'Writes far outnumber reads, and the rare read must be fresh.',
      },
      {
        option: 'Majority both ways (W = 2, R = 2)',
        goodAt: 'Fresh reads, and both sides survive one failed replica.',
        badAt: 'Every request waits for the second-fastest replica.',
        pickWhen: 'Users must see fresh data, like Snapgram’s activity events: the usual default.',
      },
      {
        option: 'One and one (W = 1, R = 1)',
        goodAt: 'The fastest setting, working while any replica is up.',
        badAt: 'Reads can miss recent writes until the replicas catch up.',
        pickWhen: 'A slightly old value does no harm, like view counts.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s Dynamo',
    body: 'Amazon described Dynamo, the highly available [[key-value store|key-value-store]] behind services such as its shopping cart, in a 2007 paper. N is set per instance, R and W are the minimum number of nodes that must take part in a successful read or write, and the paper notes that R + W > N yields a quorum-like system. The common configuration used by several Dynamo instances is (N, R, W) = (3, 2, 2).\n\nTo stay always writeable during failures, Dynamo uses a [[sloppy quorum|sloppy-quorum]], counting the first N healthy nodes, and [[hinted handoff|hinted-handoff]]. Apache Cassandra relies on several of Dynamo’s techniques, and its consistency levels, such as `ONE`, `QUORUM` and `ALL`, let each request choose how many replicas must answer.',
    sourceUrl: 'https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html',
    sourceLabel: 'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store,” 2007, on All Things Distributed',
  },
  interview: {
    whenToMention:
      'When your design uses a leaderless store such as Cassandra, or the interviewer asks how reads stay fresh without a leader. State N, R and W, check that R + W > N, and say how many failures each side survives.',
    sayItLikeThis: [
      'Three replicas with W = 2 and R = 2: every read overlaps the latest write, and we survive one replica down.',
      'View counts can be a little stale, so they use W = 1 and R = 1, the fastest setting.',
    ],
    followUps: [
      {
        q: 'Does R + W > N make the store strongly consistent?',
        a: 'It makes every read overlap the latest completed write, but it is not [[linearizability|linearizability]]. A read during an unfinished write can see the new value while a later read sees the old one. Concurrent writes still need a rule to pick a winner, and sloppy quorums drop the overlap during failures.',
      },
      {
        q: 'A replica was down for an hour. How does it catch up?',
        a: 'Other nodes hold the writes it missed and hand them over when it returns, as in Dynamo’s hinted handoff. Read repair fixes items as they are read, and anti-entropy compares replicas in the background to fix the rest.',
      },
      {
        q: 'How would you set quorums across two regions?',
        a: 'Waiting for another [[region|region]] adds roughly 150 to 200 ms (ballpark) between Oregon and Singapore. I’d count the quorum within the local region, as Cassandra’s `LOCAL_QUORUM` does, and copy to the other region in the background, unless the data must be fresh everywhere.',
      },
    ],
    redFlags: [
      'Claiming W = 1 and R = 1 keeps reads fresh because the data is replicated.',
      'Choosing W = N without noticing that one failed replica then blocks every write.',
      'Saying quorums make a store linearizable, with no caveats.',
    ],
  },
  mistakes: [
    '**Counting nodes instead of copies.** N is the number of replicas of each item, not the cluster size, so a quorum is two of three even on 12 nodes.',
    '**R + W ≤ N for data users must see.** A read and a write can land on different replicas, and users see old values, as Maya did.',
    '**W = N for safety.** Every write waits for the slowest replica, and one failed replica stops all writes.',
    '**Treating quorums as transactions.** Quorums make reads fresh, but they cannot stop two people claiming the same username at the same moment; that needs a single leader or [[consensus|consensus]].',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram’s activity store has N = 3. Which setting guarantees that every read sees the latest successful write?',
      options: [
        {
          text: 'W = 2, R = 2',
          correct: true,
          why: 'R + W = 4 is more than 3, so the two replicas a read asks always include one of the two the write reached.',
        },
        {
          text: 'W = 1, R = 2',
          correct: false,
          why: 'R + W = 3 is not more than 3: the write can sit on one replica while the read asks the other two.',
        },
        {
          text: 'W = 2, R = 1',
          correct: false,
          why: 'R + W = 3 again: the single replica the read asks may be the one the write has not reached.',
        },
        {
          text: 'W = 1, R = 1',
          correct: false,
          why: 'This was Snapgram’s first setup, and Maya’s missing comment shows that the write and the read can miss each other.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram moves another table to N = 5 replicas with W = 3 and R = 3. How many replicas can be down while both reads and writes still work?',
      answer: 2,
      unit: 'replicas',
      tolerance: 1.1,
      solution: [
        'Writes need 3 of the 5 replicas up, so they survive 5 − 3 = 2 failures.',
        'Reads also need 3 of 5, so they survive 2 failures too.',
        'Both keep working with up to 2 replicas down, and R + W = 6 > 5 keeps the reads fresh.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'N = 3, W = 3 and R = 1. Which statements are true?',
      options: [
        {
          text: 'Every read sees the latest successful write',
          correct: true,
          why: 'R + W = 4 is more than 3. Every replica stores every write, so any single replica is up to date.',
        },
        {
          text: 'One failed replica blocks every write',
          correct: true,
          why: 'A write needs all three confirmations, so it cannot succeed with a replica down.',
        },
        {
          text: 'Reads keep working with two replicas down',
          correct: true,
          why: 'A read needs only one answer, so a single surviving replica is enough.',
        },
        {
          text: 'Writes are as fast as the fastest replica',
          correct: false,
          why: 'A write waits for all three confirmations, so it is as slow as the slowest replica.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a quorum read with R = 2 in order.',
      items: [
        'The app sends the read to the coordinator',
        'The coordinator asks the replicas',
        'Two replicas answer with their versions',
        'The coordinator picks the highest version',
        'The app gets the newest value',
      ],
      why: 'The coordinator cannot reply until R replicas have answered, and it compares their versions before replying. That comparison is what lets the overlapping replica win.',
    },
    {
      kind: 'single',
      prompt: 'View counts use W = 1 and R = 1. What does Snapgram accept in return for the speed?',
      options: [
        {
          text: 'A count read just after a view may be slightly behind',
          correct: true,
          why: 'With R + W = 2, not more than 3, a read can ask a replica the latest view has not reached yet. It catches up within moments.',
        },
        {
          text: 'Writes fail whenever any replica is down',
          correct: false,
          why: 'W = 1 needs only one replica up, so writes survive two failures.',
        },
        {
          text: 'Every read must ask all three replicas',
          correct: false,
          why: 'That would be R = 3. With R = 1, one answer is enough.',
        },
        {
          text: 'Each view is stored on only one replica',
          correct: false,
          why: 'All three replicas still receive every write. The app just stops waiting after the first confirmation.',
        },
      ],
    },
  ],
  takeaways: [
    'A quorum store keeps N replicas of each item, waits for W of them on a write and R on a read, and returns the newest version it hears.',
    'When R + W > N, every read shares a replica with the latest write; otherwise a read can miss it.',
    'A bigger quorum costs speed and availability on its side, so tune R and W to the workload, and remember that majorities on both sides survive any minority of failures.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Sloppy quorums and hinted handoff.** If too many of an item’s usual replicas are down, a store can count stand-in nodes so that writes still succeed, then hand the data back later. That keeps the store writable, which is what Dynamo wanted for shopping carts. But a read during the outage may ask only the usual replicas and miss the write, so a sloppy quorum promises durability, not freshness.',
    },
    {
      kind: 'prose',
      md: '**Failed writes are not rolled back.** A write that reached only one replica before the coordinator gave up still sits on that replica, so later reads may or may not see it. Leaderless stores accept this. When every client must agree on one order of writes, route each item through a single leader instead; [Consensus and leader election](lesson:consensus-leader-election) shows how.',
    },
    {
      kind: 'prose',
      md: '**Reads during a write.** While a write is still spreading, two reads in a row can disagree: the first hears the new version from a replica that has it, and the second asks two replicas that do not. Making the coordinator repair stale replicas before it replies prevents this, at the cost of slower reads.',
    },
  ],
  flashcards: [
    {
      front: 'What do N, R and W mean in a quorum system?',
      back: 'N is the number of replicas of each item, W is how many must confirm a write, and R is how many must answer a read.',
    },
    {
      front: 'Why does R + W > N keep reads fresh?',
      back: 'A read group and a write group that together exceed N must share a replica, and that replica has the latest version.',
    },
    { front: 'How does the coordinator know which answer is newest?', back: 'Every value carries a version or timestamp, and the coordinator returns the highest one it hears.' },
    { front: 'How many failed replicas can N = 3, W = 2, R = 2 survive?', back: 'One. Two replicas are still enough for both reads and writes, but one is not.' },
    { front: 'What does W = N cost?', back: 'Every write waits for the slowest replica, and a single failed replica blocks all writes.' },
    { front: 'What is read repair?', back: 'When a read hears an old version from a replica, the coordinator sends that replica the newest version.' },
    {
      front: 'What is a sloppy quorum?',
      back: 'During failures, writes count stand-in nodes outside the usual replicas. Writes stay available, but reads may miss them until the data is handed back.',
    },
  ],
  related: ['replication', 'cap-pacelc', 'consistency-models', 'consistent-hashing', 'consensus-leader-election', 'time-and-ordering', 'heartbeats-gossip'],
  glossaryTerms: [
    'wide-column-store',
    'leader',
    'leaderless-replication',
    'replica',
    'replication-factor',
    'quorum',
    'coordinator',
    'read-repair',
    'stale-data',
    'tail-latency',
    'eventual-consistency',
    'tunable-consistency',
    'anti-entropy',
    'last-write-wins',
    'version-vector',
    'key-value-store',
    'sloppy-quorum',
    'hinted-handoff',
    'linearizability',
    'region',
    'consensus',
  ],
};

export default lesson;
