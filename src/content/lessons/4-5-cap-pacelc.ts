import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a normal like, the cut, the two possible choices and the repair. */
const outage: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'sgu', type: 'client', label: 'Singapore users', sublabel: 'Maya and others', x: 0, y: 0 },
    { id: 'sg', type: 'sqlDb', label: 'Singapore copy', x: 1, y: 0 },
    { id: 'or', type: 'sqlDb', label: 'Oregon copy', x: 2, y: 0 },
    { id: 'oru', type: 'client', label: 'Oregon users', x: 3, y: 0 },
  ],
  edges: [
    { id: 'sgu-sg', from: 'sgu', to: 'sg', kind: 'sync' },
    { id: 'sg-or', from: 'sg', to: 'or', kind: 'replication', label: 'Pacific link' },
    { id: 'oru-or', from: 'oru', to: 'or', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Normally, a like from Singapore is saved in the **Singapore copy** and replicated to the **Oregon copy** within a fraction of a second.',
      flow: ['sgu-sg', 'sg-or'],
    },
    {
      caption: 'The link fails. Both regions stay up and serve their own users, but no message gets across.',
      flow: ['sgu-sg', { edge: 'sg-or', tag: 'no answer', tone: 'alert' }],
      notes: [{ target: 'sg-or', text: 'cut', tone: 'alert' }],
    },
    {
      caption: 'Choice one, availability: each region keeps accepting likes and queues them for later. Nobody sees an error, but the copies disagree: 124 likes in Singapore, 131 in Oregon.',
      flow: [['sgu-sg', 'oru-or']],
      notes: [
        { target: 'sg', text: '124 likes' },
        { target: 'or', text: '131 likes' },
        { target: 'sg-or', text: 'cut', tone: 'alert' },
      ],
    },
    {
      caption:
        'Choice two, consistency: a new user asks Singapore for the name @sunset. Singapore cannot check whether Oregon has given it away, so it refuses for now, and both copies stay the same.',
      flow: ['sgu-sg', { edge: 'sg-or', tag: 'no answer', tone: 'alert' }, { edge: 'sgu-sg', reverse: true, tag: 'refused', tone: 'alert' }],
      notes: [{ target: 'sg-or', text: 'cut', tone: 'alert' }],
    },
    {
      caption: 'The link heals after 20 minutes. Queued likes cross both ways and merge to 135, none lost, and the refused sign-up can be tried again.',
      flow: [['sg-or', '<sg-or']],
      notes: [
        { target: 'sg', text: '135 likes', tone: 'signal' },
        { target: 'or', text: '135 likes', tone: 'signal' },
      ],
    },
  ],
};

/** A consistent write pays a round trip across the Pacific, even with no failure. */
const consistentWrite: SequenceSpec = {
  actors: [
    { id: 'maya', type: 'client', label: 'Maya' },
    { id: 'sg', type: 'sqlDb', label: 'Singapore copy' },
    { id: 'or', type: 'sqlDb', label: 'Oregon copy' },
  ],
  messages: [
    { from: 'maya', to: 'sg', label: 'Save caption', kind: 'sync', caption: 'Maya changes her caption. The Singapore copy stores it in a few milliseconds.' },
    {
      from: 'sg',
      to: 'or',
      label: 'Store and confirm',
      kind: 'sync',
      caption: 'To stay consistent, Singapore sends the change to Oregon and waits: about 85 ms each way (ballpark).',
    },
    { from: 'or', to: 'sg', label: 'Stored', kind: 'reply', caption: 'Oregon stores the change and confirms.' },
    {
      from: 'sg',
      to: 'maya',
      label: 'Saved',
      kind: 'reply',
      caption: 'Maya sees her change saved about 175 ms after tapping. Choosing latency instead, Singapore would answer at once and copy the change to Oregon in the background.',
    },
  ],
  groups: [{ label: 'about 170 ms', from: 2, to: 3 }],
};

const lesson: Lesson = {
  id: 'cap-pacelc',
  module: 'm4',
  order: 5,
  title: 'CAP and PACELC',
  idea: 'CAP (consistency, availability and partition tolerance) says cut-off replicas must choose consistency or availability, and PACELC adds latency or consistency when nothing is broken.',
  minutes: 15,
  prerequisites: ['replication-lag', 'tradeoffs-core-skill'],
  outcomes: [
    'Explain what CAP really says: during a network partition, a replicated system must refuse some requests or risk inconsistent answers.',
    'Choose consistency or availability per feature, as Snapgram does for likes, usernames and boost credits.',
    'Use PACELC to explain why consistency costs latency even with no failure, and correct common CAP misconceptions.',
  ],
  analogy: {
    title: 'Two bank branches and a dead phone line',
    body: 'A bank has two branches, each with a copy of every balance, and they phone each other after every withdrawal so both ledgers match. One morning the line goes dead, and a customer asks the north branch for $500.\n\nThe teller can refuse until the line is back: the customer leaves annoyed, but the books stay right. Or she can pay out now and sort it out later, risking the same customer emptying the account again at the south branch. Databases with copies in two places face exactly this choice.',
  },
  whyItMatters:
    'Snapgram now has about 10 million daily users and a second [[region|region]] in Singapore, the one [[GeoDNS|geodns]] sends Maya to. Each region keeps its own copy of the databases, in step through [[replication|replication]] across the Pacific, so Maya’s likes are saved close to her.\n\nOne Tuesday, a fault cuts the link between Oregon and Singapore for 20 minutes. Both regions stay up, but the two copies cannot talk. Maya keeps liking photos, and a new user in Singapore tries to sign up as @sunset, a name someone in Oregon may have just claimed.\n\nShould Singapore accept these writes and sort out the differences later, or refuse them until the link is back? And on a normal day, should every write wait for Oregon at all?',
  body: [
    {
      kind: 'prose',
      md: 'A [[network partition|network-partition]] splits machines into groups that cannot reach each other, while every group keeps running. From inside Singapore, a cut link looks just like a slow or crashed Oregon: requests go out and no answers come back. After a [[timeout|timeout]], Singapore must decide what to do with the next write.',
    },
    {
      kind: 'diagram',
      title: 'Twenty minutes without the link',
      caption: 'Step through a normal like, the cut, the two possible choices and the repair.',
      spec: outage,
    },
    { kind: 'heading', text: 'Consistency or availability' },
    {
      kind: 'prose',
      md: 'That choice is the [[CAP theorem|cap-theorem]]. Its letters stand for consistency, availability and [[partition tolerance|partition-tolerance]], often summed up as pick two of three. But partitions happen whether you plan for them or not, so the real rule is narrower: while a partition lasts, a replicated system must give up consistency or availability.\n\n- **Consistency**, in CAP, means every read sees the latest write, as if there were one copy. Its formal name is [[linearizability|linearizability]].\n- **Availability**, in CAP, means every request to a working region gets a real answer, not an error, even if the answer is out of date.',
    },
    {
      kind: 'prose',
      md: 'Choosing availability means both regions accept writes on their own, which is [[multi-leader replication|multi-leader-replication]]. Choosing consistency means refusing any write the other region has not confirmed. Snapgram decides per feature, by what a wrong answer would cost:\n\n- **Likes choose availability.** A like counted a few minutes late hurts nobody, and likes from both sides simply add up.\n- **Usernames choose consistency.** If both regions hand out @sunset, two people own one name. Refusing sign-ups for 20 minutes is cheaper.\n- **Boost credits choose consistency.** Spending the same credits once in each region is real money lost.',
    },
    { kind: 'heading', text: 'Merging after the partition' },
    {
      kind: 'prose',
      md: 'Availability sends its bill when the link heals: [[write conflicts|write-conflict]], where both copies changed the same data. Each kind of data needs a merge rule:\n\n- **Counters add up.** Each region counts its own likes and the merge sums them, so nothing is lost. Data types built to merge like this are called [[CRDTs|crdt]] (conflict-free replicated data types).\n- **Single values pick one.** A caption edited on both sides usually goes to [[last write wins|last-write-wins]]: keep the newest edit and silently drop the other.\n- **Some conflicts need a person.** No rule can quietly decide who keeps @sunset; the app must rename one account and tell its owner.',
    },
    { kind: 'heading', text: 'PACELC: the price you pay every day' },
    {
      kind: 'prose',
      md: 'Partitions are rare, yet many databases give up consistency all the time. Computer scientist Daniel Abadi explained why: replication forces a trade-off even when nothing is broken. A Singapore write that waits for Oregon, [[synchronous replication|synchronous-replication]], is consistent but pays a [[round trip|round-trip-time]] across the Pacific, about 170 ms (ballpark). One answered at once and copied later, [[asynchronous replication|asynchronous-replication]], is fast, but for a moment the copies disagree.',
    },
    {
      kind: 'sequence',
      title: 'One consistent write from Singapore',
      caption: 'Maya’s caption change waits for Oregon before she sees it saved.',
      spec: consistentWrite,
    },
    {
      kind: 'prose',
      md: 'Abadi called the full picture [[PACELC|pacelc]], pronounced pass-elk: if there is a partition (P), choose availability (A) or consistency (C); else (E), choose latency (L) or consistency (C). A design is labeled by both answers. Snapgram’s likes are `PA/EL`, available in a partition and fast otherwise, while boost credits are `PC/EC`, consistent in both cases.',
    },
    { kind: 'heading', text: 'Four misconceptions' },
    {
      kind: 'prose',
      md: '- **Pick any two of three.** You cannot opt out of partitions on a real network, so the only choice is what to do during one.\n- **CAP’s C is the C in ACID.** In [[ACID|acid]] (atomicity, consistency, isolation and durability), consistency means the rules always hold, such as no negative balances. CAP’s means every read sees the latest write.\n- **Availability means uptime.** CAP’s availability is about answering during a partition. A consistent system can still have excellent [[nines|nines]].\n- **A database is either `CP` or `AP`.** The choice is per operation: many databases let each request choose, and Snapgram makes different choices for likes and credits.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real systems usually keep three or more copies, so the side holding a majority, a [[quorum|quorum]], can keep accepting writes during a partition, as [Quorums](lesson:quorums) shows. Real partitions are also messier than a clean cut: links slow down, drop some messages, or fail in one direction only.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'partition',
      preset: { mode: 'consistency' },
      intro:
        'Run the outage yourself: cut the link, send writes to either region in each mode, then heal it and watch the copies merge. Also time a write in each mode while nothing is broken.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to behave during a partition, and the everyday cost.',
    rows: [
      {
        option: 'Consistency first (`PC/EC`)',
        goodAt: 'One version for every reader, and nothing to repair afterwards.',
        badAt: 'The cut-off side refuses writes during a partition, and every write waits for the other region, about 170 ms here (ballpark).',
        pickWhen: 'A wrong answer costs money or trust: balances, boost credits, unique names.',
      },
      {
        option: 'Availability first (`PA/EL`)',
        goodAt: 'Every region keeps answering quickly, even with the link down.',
        badAt: 'Readers can see [[stale data|stale-data]] or two versions, and merges can drop writes.',
        pickWhen: 'A late or merged answer is harmless: likes, view counts, feeds.',
      },
      {
        option: 'One home region per record (`PC/EL`)',
        goodAt: 'No write conflicts, and reads stay local and fast.',
        badAt: 'Reads can be slightly stale, and records whose home is across a cut cannot be updated.',
        pickWhen: 'Reads can be a moment old but writes must never conflict, such as profiles.',
      },
    ],
  },
  realWorld: {
    title: 'How Abadi classified real databases',
    body: 'In a 2012 article in the journal Computer, Daniel Abadi argued that CAP was being misapplied: it limits a system only during certain failures, yet many databases reduce consistency all the time, which he traced to latency.\n\nHe classified the default versions of Dynamo, Cassandra and Riak as `PA/EL`, giving up consistency both during a partition and for speed, though settings can trade some latency back. Fully ACID systems such as VoltDB/H-Store and Megastore, and also BigTable and HBase, are `PC/EC`. Yahoo’s PNUTS is `PC/EL`: it reads from nearby copies for speed, but a record whose home copy is cut off cannot be updated.',
    sourceUrl: 'https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf',
    sourceLabel: 'Daniel J. Abadi, “Consistency Tradeoffs in Modern Distributed Database System Design,” IEEE Computer, February 2012',
  },
  interview: {
    whenToMention:
      'Whenever your design copies data across regions, or the interviewer asks what happens if a link fails. Name the choice per feature, say what users see during the partition, and add that waiting for another region costs a round trip on every write.',
    sayItLikeThis: [
      'During a partition I’d choose per feature: likes stay available and merge later, while usernames and payments refuse writes they cannot confirm.',
      'CAP only matters while a partition lasts; the rest of the time the trade-off is latency versus consistency, which is PACELC.',
    ],
    followUps: [
      {
        q: 'Can’t you have all three?',
        a: 'Not across a network. If two copies cannot talk and both keep answering, a write on one side is invisible on the other. Without a partition you can have consistency and availability together, paying for consistency in latency.',
      },
      {
        q: 'What happens to writes accepted on both sides when the link heals?',
        a: 'They are merged: counters add up, single values usually go to last write wins, which silently drops one edit, and a duplicate username needs an application rule, such as renaming the later account. Version numbers on each change tell a real conflict from a plain update.',
      },
      {
        q: 'Boost purchases are consistent. What does a user in the cut-off region see?',
        a: 'A clear message that purchases are paused, while everything else keeps working. The app retries later with an [[idempotency key|idempotency-key]], so nothing is charged twice.',
      },
    ],
    redFlags: [
      'Saying you will keep consistency and availability and give up partition tolerance.',
      'Choosing `CP` or `AP` once for the whole system instead of per feature.',
      'Confusing CAP’s consistency with the C in ACID, or CAP’s availability with uptime.',
    ],
  },
  mistakes: [
    '**Last write wins on data that matters.** It silently drops one of two concurrent edits; for money, that is lost data, not a merge.',
    '**Forgetting the everyday cost.** Synchronous writes across an ocean add about 170 ms (ballpark) to every write, partition or not.',
    '**Errors without explanation.** A consistent feature that just times out looks broken; say what is paused, and retry safely later.',
    '**One answer for everything.** Making everything consistent makes likes slow and fragile; making everything available makes balances wrong.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'During the outage, Singapore keeps accepting likes and merges them with Oregon’s afterwards. What has Snapgram chosen for likes?',
      options: [
        { text: 'Availability over consistency', correct: true, why: 'Both regions keep answering, at the price of copies that disagree until the link heals.' },
        { text: 'Consistency over availability', correct: false, why: 'That would mean refusing likes Oregon cannot confirm, which Singapore did not do.' },
        { text: 'Giving up partition tolerance', correct: false, why: 'The partition happened anyway. No design can opt out of it, only decide how to behave during it.' },
        {
          text: 'Latency over consistency',
          correct: false,
          why: 'That is the choice for ordinary days, the “else” half of PACELC. During a partition the choice is availability or consistency.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which Snapgram writes should be refused during a partition rather than risk two different versions?',
      options: [
        { text: 'Signing up with a unique username', correct: true, why: 'Both regions could give the same name to different people, and no merge rule fixes that quietly.' },
        { text: 'Spending boost credits', correct: true, why: 'The same credits could be spent once in each region, which is real money lost.' },
        { text: 'Liking a photo', correct: false, why: 'Likes from both regions simply add up when the link heals, and a late count hurts nobody.' },
        { text: 'Counting a photo view', correct: false, why: 'View counts merge by adding and are approximate anyway, so staying available costs nothing.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Singapore waits for Oregon to confirm each write. A local write takes about 5 ms, and the round trip to Oregon about 170 ms. Maya saves three caption edits one after another, each waiting for the last. Roughly how long does she wait in total?',
      answer: 525,
      unit: 'ms',
      tolerance: 1.1,
      solution: [
        'Each consistent write takes the local write plus one round trip: 5 + 170 = 175 ms.',
        'Three in a row: 3 × 175 = 525 ms.',
        'Answered locally, the three would take about 3 × 5 = 15 ms: that gap is the latency side of PACELC, the everyday choice between latency and consistency.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put an availability-first partition in order.',
      items: [
        'The link between the regions fails',
        'Each region keeps accepting writes on its own',
        'The two copies drift apart',
        'The link heals',
        'Queued writes cross over and are merged',
      ],
      why: 'Availability postpones the problem: both sides answer during the partition, and the differences are settled by merge rules once the regions can talk again.',
    },
    {
      kind: 'single',
      prompt: 'Which statement about CAP is accurate?',
      options: [
        {
          text: 'It forces a choice only while the network is partitioned',
          correct: true,
          why: 'With no partition, a system can be both consistent and available; it pays for consistency in latency instead.',
        },
        { text: 'Its C means the same as the C in ACID', correct: false, why: 'ACID’s consistency is about rules such as constraints holding; CAP’s is about every read seeing the latest write.' },
        { text: 'A consistency-first system cannot have high uptime', correct: false, why: 'Partitions are rare, so a consistency-first system can still have excellent nines overall.' },
        { text: 'A fast enough network removes the choice', correct: false, why: 'Speed does not stop links from failing, and the choice is about what to do when they fail.' },
      ],
    },
  ],
  takeaways: [
    'During a network partition, a replicated system must refuse what it cannot confirm, or answer anyway and merge later.',
    'Choose per feature by what a wrong answer costs: likes can merge, while usernames and credits cannot.',
    'PACELC adds the everyday trade: keeping regions consistent costs a round trip on every write, even with no failure.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**What Brewer said twelve years later.** In 2012, Eric Brewer, who first proposed CAP, wrote that the two-of-three framing was always misleading, because partitions are rare and the choice matters only while one lasts. He suggests designing for partitions on purpose: notice one, limit what each side may do while it lasts, and plan the recovery. His example is the bank machine, where availability usually wins and the bank relies on audits and compensation to fix mistakes afterwards, as he explains in [CAP twelve years later](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/).',
    },
    {
      kind: 'prose',
      md: '**A partition is a timeout.** No machine sees a partition directly; it sees a request that has not been answered yet. Picking a timeout is picking when to stop waiting, and so when to choose between consistency and availability. Brewer describes CAP as a decision made during exactly that wait.',
    },
    {
      kind: 'prose',
      md: '**Majorities change the picture.** With three or more replicas, the side holding a majority can stay consistent and keep answering, while only the minority side refuses. Consensus protocols such as Raft work this way, as [Consensus and leader election](lesson:consensus-leader-election) shows.',
    },
  ],
  flashcards: [
    {
      front: 'What does the CAP theorem actually say?',
      back: 'During a network partition, a replicated system must either refuse some requests to stay consistent or answer them and risk inconsistent data.',
    },
    { front: 'Why can’t you give up partition tolerance?', back: 'Networks fail whether you like it or not, so any system spread across machines must decide what to do when they cannot talk.' },
    { front: 'What does PACELC add to CAP?', back: 'Else, when there is no partition, a replicated system still trades latency against consistency, because waiting for other copies takes time.' },
    {
      front: 'Which Snapgram features choose availability, and which consistency?',
      back: 'Likes and view counts stay available and merge later; unique usernames and boost credits refuse writes they cannot confirm.',
    },
    { front: 'How can likes merge after a partition without losing any?', back: 'Each region counts its own likes and the merge adds the counts. Data types built to merge like this are called CRDTs.' },
    { front: 'Is CAP’s consistency the same as ACID’s?', back: 'No. CAP’s means every read sees the latest write; ACID’s means the database’s rules, such as constraints, always hold.' },
    { front: 'What does last write wins cost?', back: 'It silently discards one edit whenever two copies change the same value during a partition.' },
  ],
  related: ['replication', 'replication-lag', 'consistency-models', 'quorums', 'consensus-leader-election', 'multi-region-dr', 'tradeoffs-core-skill'],
  glossaryTerms: [
    'region',
    'geodns',
    'replication',
    'network-partition',
    'timeout',
    'cap-theorem',
    'partition-tolerance',
    'linearizability',
    'multi-leader-replication',
    'write-conflict',
    'crdt',
    'last-write-wins',
    'synchronous-replication',
    'round-trip-time',
    'asynchronous-replication',
    'pacelc',
    'acid',
    'nines',
    'quorum',
    'stale-data',
    'idempotency-key',
  ],
};

export default lesson;
