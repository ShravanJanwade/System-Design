import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: failover by timeout alone creates two leaders. */
const splitBrain: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', x: 0, y: 0.5 },
    { id: 'db1', type: 'sqlDb', label: 'Database 1', sublabel: 'leader', x: 1, y: 0 },
    { id: 'db2', type: 'sqlDb', label: 'Database 2', sublabel: 'follower', x: 1, y: 1 },
  ],
  edges: [
    { id: 'app-db1', from: 'app', to: 'db1', kind: 'sync' },
    { id: 'db1-db2', from: 'db1', to: 'db2', kind: 'replication' },
    { id: 'app-db2', from: 'app', to: 'db2', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Normally the app servers send every write to Database 1, the **leader**, which copies each change to Database 2.',
      flow: ['app-db1', 'db1-db2'],
    },
    {
      caption: 'A glitch cuts the link between them. After 10 seconds without hearing from the leader, Database 2 follows the simple rule and promotes itself.',
      flow: [{ edge: 'db1-db2', tag: 'lost', tone: 'alert' }],
      notes: [{ target: 'db2', text: 'promotes itself', tone: 'alert' }],
    },
    {
      caption: 'Some app servers still write to Database 1; others switch to Database 2. Both accept writes that the other never sees: split brain.',
      add: ['app-db2'],
      flow: [['app-db1', 'app-db2']],
      notes: [
        { target: 'db1', text: 'leader', tone: 'alert' },
        { target: 'db2', text: 'leader too', tone: 'alert' },
      ],
    },
  ],
};

/** The animated election: the leader fails, a follower times out, asks for votes and wins a majority. */
const election: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'b', type: 'sqlDb', label: 'Node B', x: 0, y: 0 },
    { id: 'd', type: 'sqlDb', label: 'Node D', x: 1, y: 0 },
    { id: 'e', type: 'sqlDb', label: 'Node E', x: 2, y: 0 },
    { id: 'a', type: 'sqlDb', label: 'Node A', x: 0.5, y: 1 },
    { id: 'c', type: 'sqlDb', label: 'Node C', x: 1.5, y: 1 },
  ],
  edges: [
    { id: 'a-b', from: 'a', to: 'b', kind: 'async' },
    { id: 'a-d', from: 'a', to: 'd', kind: 'async' },
    { id: 'a-e', from: 'a', to: 'e', kind: 'async' },
    { id: 'a-c', from: 'a', to: 'c', kind: 'async' },
    { id: 'c-b', from: 'c', to: 'b', kind: 'async' },
    { id: 'c-d', from: 'c', to: 'd', kind: 'async' },
    { id: 'c-e', from: 'c', to: 'e', kind: 'async' },
  ],
  steps: [
    {
      caption: 'Node A leads term 4. Every 100 ms or so it sends each follower a heartbeat, and each heartbeat resets that follower’s election timer.',
      flow: [['a-b', 'a-d', 'a-e', 'a-c']],
      notes: [{ target: 'a', text: 'leader, term 4', tone: 'signal' }],
    },
    {
      caption: 'Node A crashes and the heartbeats stop. Each follower’s timer keeps running, and since each picked a random timeout, they will not all run out together.',
      fail: ['a'],
      notes: [{ target: 'c', text: 'shortest timer' }],
    },
    {
      caption: 'Node C’s timer runs out first. It becomes a [[candidate|candidate]]: it starts term 5, votes for itself and asks the others for their votes.',
      fail: ['a'],
      flow: [['c-b', 'c-d', 'c-e']],
      notes: [{ target: 'c', text: 'candidate, term 5', tone: 'signal' }],
    },
    {
      caption: 'B and D have not voted in term 5 yet, so both say yes. With its own vote, C has 3 of 5, a majority, and becomes leader of term 5.',
      fail: ['a'],
      flow: [['<c-b', '<c-d']],
      notes: [{ target: 'c', text: '3 of 5 votes', tone: 'signal' }],
    },
    {
      caption: 'C sends heartbeats for term 5. Every follower resets its timer, so nobody else starts an election.',
      fail: ['a'],
      flow: [['c-b', 'c-d', 'c-e']],
      notes: [{ target: 'c', text: 'leader, term 5', tone: 'signal' }],
    },
    {
      caption: 'Node A restarts, still thinking it leads term 4. C’s next heartbeat carries term 5, a higher term, so A steps down at once and follows C.',
      flow: ['<a-c'],
      notes: [
        { target: 'a', text: 'follower, term 5' },
        { target: 'c', text: 'leader, term 5', tone: 'signal' },
      ],
    },
  ],
};

/** Snapgram's database nodes elect their leader through etcd. */
const viaEtcd: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'app', type: 'service', label: 'App servers', x: 0, y: 1 },
    { id: 'db1', type: 'sqlDb', label: 'Database 1', x: 1, y: 0 },
    { id: 'etcd', type: 'nosqlDb', label: 'etcd', sublabel: 'three nodes', x: 1, y: 1 },
    { id: 'db2', type: 'sqlDb', label: 'Database 2', x: 1, y: 2 },
  ],
  edges: [
    { id: 'db1-etcd', from: 'db1', to: 'etcd', kind: 'sync' },
    { id: 'db2-etcd', from: 'db2', to: 'etcd', kind: 'sync' },
    { id: 'app-etcd', from: 'app', to: 'etcd', kind: 'async' },
    { id: 'app-db1', from: 'app', to: 'db1', kind: 'sync' },
    { id: 'app-db2', from: 'app', to: 'db2', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Database 1 holds the key `/db/photos-1/leader` in **etcd**, on a 10-second lease that it keeps renewing. The app servers watch that key, so they send writes to Database 1.',
      flow: ['db1-etcd', '<app-etcd', 'app-db1'],
      notes: [{ target: 'db1', text: 'leader', tone: 'signal' }],
    },
    {
      caption: 'Database 1 dies and stops renewing. About 10 seconds later the lease expires, and etcd deletes the key.',
      fail: ['db1'],
      notes: [{ target: 'db1', text: 'lease expired', tone: 'alert' }],
    },
    {
      caption: 'Database 2 creates the key and wins; etcd’s majority vote lets only one node succeed. The watch tells the app servers at once, and writes move to Database 2.',
      fail: ['db1'],
      add: ['app-db2'],
      flow: ['db2-etcd', '<app-etcd', 'app-db2'],
      notes: [{ target: 'db2', text: 'leader', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'consensus-leader-election',
  module: 'm5',
  order: 7,
  title: 'Consensus and leader election',
  idea: 'To guarantee exactly one leader, machines hold an election in which a candidate needs a majority of votes, and since each machine votes once per numbered term, two leaders can never win the same term.',
  minutes: 14,
  prerequisites: ['replication', 'quorums'],
  outcomes: [
    'Explain why a replicated database needs exactly one leader, and how split brain happens without one.',
    'Walk through a Raft election: terms, random timeouts, votes and majorities.',
    'Decide when to rely on a coordination service such as ZooKeeper or etcd instead of building your own election.',
  ],
  analogy: {
    title: 'A class electing its representative',
    body: 'A class of 30 needs one representative. Anyone can stand, but winning takes a majority, at least 16 votes, and each student votes once per election, so two candidates can never both win: that would take 32 votes.\n\nEach election gets a number, so the winner of election 5 is never confused with the winner of election 4. And if too few students turn up to form a majority, the class has no representative until enough do, which beats having two people who both claim the job.',
  },
  whyItMatters:
    'Since [Replication](lesson:replication), each of Snapgram’s databases has a [[leader|leader]] that takes every write and two [[followers|follower]] that copy it. The team automated [[failover|failover]] with a simple rule: if a follower hears nothing from the leader for 10 seconds, it promotes itself.\n\nOne night a network switch misbehaves for 15 seconds. The leader is fine, but one follower cannot reach it, promotes itself, and for a while both machines accept writes. Boost purchases land on both, and Maya’s credit balance ends up different on each: [[split brain|split-brain]].',
  body: [
    { kind: 'heading', text: 'Why exactly one leader' },
    {
      kind: 'prose',
      md: 'A leader exists so that one machine decides the order of all writes and every follower copies that order. With two leaders, each accepts writes the other never sees, and no rule can merge two spends of the same credits into one correct balance. Yet a leader that looks dead may only be slow, or cut off by a [[network partition|network-partition]], and a follower cannot tell the difference.',
    },
    {
      kind: 'diagram',
      title: 'Failover by timeout alone',
      caption: 'A follower that promotes itself on a timeout, during a network glitch.',
      spec: splitBrain,
    },
    {
      kind: 'prose',
      md: 'So no single machine may decide alone. The group has to agree, which is the problem of [[consensus|consensus]]: getting several machines to settle on one value, here the name of the leader, even when some of them fail or cannot talk.',
    },
    { kind: 'heading', text: 'A vote by majority' },
    {
      kind: 'prose',
      md: 'The fix is the class election. A machine becomes leader only with votes from a [[majority|majority]] of the cluster, and no machine votes twice in the same election, so two candidates can never both win: any two majorities share at least one voter. With five nodes, a majority is three, so the cluster survives two failures, while a side cut off with only two nodes can never elect anyone.',
    },
    {
      kind: 'prose',
      md: '[[Raft|raft]], a widely used algorithm for [[leader election|leader-election]], adds two ideas. Time is split into numbered [[terms|election-term]]; each election starts a new term, and each node votes at most once per term. And each follower waits a random [[election timeout|election-timeout]] for the leader’s next [[heartbeat|heartbeat]] before starting an election, so usually one node starts first and wins before the others wake up.',
    },
    {
      kind: 'diagram',
      title: 'A Raft election',
      caption: 'Five nodes. Step through a leader crash, a timeout, a vote and the old leader stepping down.',
      spec: election,
    },
    {
      kind: 'prose',
      md: 'The leader’s real job is a [[replicated log|replicated-log]], the ordered list of every change. It sends each new entry to the followers and treats it as committed only once a majority have stored it, and voters refuse any candidate whose log is behind their own, so a new leader always has every committed change. An old leader stranded on the minority side can still accept a write, but it can never gather the majority to commit it, and it steps down as soon as it sees a higher term.',
    },
    {
      kind: 'table',
      columns: ['Nodes', 'Majority', 'Failures survived'],
      rows: [
        ['1', '1', '0'],
        ['3', '2', '1'],
        ['4', '3', '1'],
        ['5', '3', '2'],
        ['7', '4', '3'],
      ],
      caption: 'Majorities from the etcd documentation. A fourth node raises the majority without surviving more failures, so clusters use odd sizes.',
    },
    { kind: 'heading', text: 'Coordination services' },
    {
      kind: 'prose',
      md: 'Writing your own consensus code is a classic way to lose data, so most teams borrow it. A [[coordination service|coordination-service]] such as ZooKeeper or etcd runs consensus on three or five nodes and offers simple building blocks: a key-value store where every write is agreed by a majority, [[leases|lease]] that expire unless their holder renews them, and [[watches|watch]] that tell you when a key changes.',
    },
    {
      kind: 'diagram',
      title: 'Leader election through etcd',
      caption: 'Snapgram’s database nodes use etcd to decide which of them leads.',
      spec: viaEtcd,
    },
    {
      kind: 'prose',
      md: 'That is how Snapgram now picks its database leaders: the nodes race to create one key in etcd, and etcd’s own majority vote lets exactly one succeed. Leases have a trap, though: a leader that pauses for longer than its lease can wake up still acting as leader, which [Distributed locks and leases](lesson:distributed-locks) fixes with fencing tokens.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real Raft has more: rules for which log entries survive a leader change, snapshots, and safely adding or removing nodes. Two candidates can also split the vote, and then both wait a new random time and try again. The [Raft site](https://raft.github.io/) links the paper, which is readable once you have the intuition.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to choose a new leader.',
    rows: [
      {
        option: 'Manual failover',
        goodAt: 'A person confirms the old leader is really gone, so there is no split brain.',
        badAt: 'Writes stop for minutes or hours while someone is paged.',
        pickWhen: 'Failures are rare and a few minutes without writes is acceptable.',
      },
      {
        option: 'Self-promotion on a timeout',
        goodAt: 'Simple and fast.',
        badAt: 'A glitch or a pause creates two leaders.',
        pickWhen: 'Never for data that must stay correct.',
      },
      {
        option: 'Raft inside the database',
        goodAt: 'At most one leader per term, and failover in seconds without a person.',
        badAt: 'Needs three or more nodes, and the minority side of a partition stops taking writes.',
        pickWhen: 'Your database or log has consensus built in.',
      },
      {
        option: 'A coordination service',
        goodAt: 'Proven consensus you do not write yourself, plus leases and watches for any service.',
        badAt: 'Another cluster to run, and leases still need care when a leader pauses.',
        pickWhen: 'Your database or services have no election of their own.',
      },
    ],
  },
  realWorld: {
    title: 'etcd and its majorities',
    body: 'etcd describes itself as a consistent, distributed key-value store, used mainly as a coordination service, and it runs on Raft. Its documentation explains that Raft is leader-based: requests that need the cluster to agree go to the leader, and a follower forwards any it receives. A cluster of n members needs a majority of (n/2)+1, so three members survive one failure and five survive two, while an even-sized cluster survives no more failures than the odd size below it.\n\nThe documentation suggests no more than seven members and calls five, which survives two failures, sufficient in most cases. Its [tuning guide](https://etcd.io/docs/v3.5/tuning/) sets a 100 ms heartbeat and a 1,000 ms election timeout by default, and asks for an election timeout of at least ten times the round-trip time between members.',
    sourceUrl: 'https://etcd.io/docs/v3.5/faq/',
    sourceLabel: 'etcd documentation, frequently asked questions (v3.5)',
  },
  interview: {
    whenToMention:
      'Whenever your design has a leader: a primary database, a single scheduler, the owner of a shard. Once you say a follower takes over when the leader fails, expect to be asked how you avoid two leaders; answer with majorities and terms, and use ZooKeeper or etcd rather than a homemade election.',
    sayItLikeThis: [
      'Failover goes through a majority vote, so there is at most one leader per term, and the minority side of a partition stops taking writes instead of diverging.',
      'I won’t write my own election: the database nodes hold a lease on a leader key in etcd, and app servers watch that key to find the leader.',
      'I’d run five etcd nodes across three [[availability zones|availability-zone]], so losing a whole zone still leaves a majority.',
    ],
    followUps: [
      {
        q: 'Why do these clusters have an odd number of nodes?',
        a: 'A majority of 4 is 3, so four nodes survive one failure, the same as three, with one more machine that must answer. Five survive two. And when a network splits an odd-sized cluster in two, one side always keeps a majority.',
      },
      {
        q: 'What happens to writes on the minority side of a partition?',
        a: 'They cannot commit, because the leader there cannot reach a majority. Clients get timeouts or errors and retry against the majority side, which elects its own leader within seconds (ballpark). The system gives up availability on that side to stay consistent.',
      },
      {
        q: 'Can a deposed leader still do damage?',
        a: 'In Raft it cannot commit anything, and it steps down when it sees a higher term. With leases, a leader that pauses past its lease can wake up still acting as leader, so storage should reject its writes using a [[fencing token|fencing-token]], a number that grows with every new leader.',
      },
    ],
    redFlags: [
      'Promoting a follower whenever it stops hearing from the leader, with no vote.',
      'Running two coordination nodes for safety: losing either one stops all progress.',
      'Claiming consensus keeps the system fully available during a partition; the minority side stops taking writes.',
    ],
  },
  mistakes: [
    '**Failover by timeout alone.** A pause or a network glitch makes a healthy leader look dead, and you get two leaders.',
    '**Even-sized clusters.** Four nodes survive one failure, like three, and two nodes survive none.',
    '**One data center’s timeouts, used across regions.** An election timeout shorter than a few round trips causes needless elections and constant leader changes.',
    '**Writing your own consensus.** Pauses, partitions and crashes in the middle of an election are where homemade election code loses data.',
    '**Forgetting the old leader may still be running.** A deposed leader can wake from a pause and send writes; reject them with terms or fencing tokens.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'A Raft cluster has 7 nodes. How many can fail at the same time while it can still elect a leader and commit writes?',
      answer: 3,
      unit: 'nodes',
      tolerance: 1.1,
      solution: ['A majority of 7 is 4.', 'The cluster keeps working while at least 4 nodes are up.', '7 − 4 = 3 nodes can fail.'],
    },
    {
      kind: 'single',
      prompt: 'Why does Raft give each follower a random election timeout?',
      options: [
        {
          text: 'So that one node usually times out first and wins before the others start',
          correct: true,
          why: 'Random timers make it rare for several candidates to start at once and split the vote.',
        },
        { text: 'To spread heartbeat traffic evenly', correct: false, why: 'Heartbeats come from the leader on a steady beat; the randomness is in when followers give up waiting.' },
        { text: 'To pick the node with the most data', correct: false, why: 'That is checked in the vote itself: nodes refuse candidates whose log is behind their own.' },
        { text: 'To make elections slower and therefore safer', correct: false, why: 'Safety comes from majorities and terms; the random timer only avoids ties.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'A partition cuts nodes A and B off from C, D and E. A was the leader. Which statements are true?',
      options: [
        { text: 'C, D and E can elect a new leader', correct: true, why: 'Three of five is a majority.' },
        { text: 'A can keep committing new writes with B’s help', correct: false, why: 'Committing needs a majority of five to store the write, and A reaches only B.' },
        { text: 'A and B can elect a second leader between them', correct: false, why: 'Two of five is not a majority, so no candidate on that side can win.' },
        {
          text: 'When the partition heals, A steps down after seeing a higher term',
          correct: true,
          why: 'The new leader’s term is higher, and any node that sees a higher term becomes a follower.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put a Raft election in order.',
      items: [
        'The leader stops sending heartbeats',
        'A follower’s election timeout runs out',
        'It starts a new term and votes for itself',
        'It asks the other nodes for their votes',
        'A majority grant their votes',
        'It sends heartbeats as the new leader',
      ],
      why: 'An election starts only when heartbeats stop arriving, and ends only when one candidate has a majority for its term.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s database nodes elect their leader through etcd. What does etcd provide that makes this safe?',
      options: [
        {
          text: 'Writes agreed by a majority of its own nodes, and leases that expire',
          correct: true,
          why: 'Only one node can hold the leader key at a time, and the key disappears when its holder stops renewing.',
        },
        { text: 'Faster disks for the database', correct: false, why: 'etcd stores small records about the cluster; it does not speed up the database.' },
        { text: 'A promise that the old leader is never paused', correct: false, why: 'Nothing can promise that, which is why fencing tokens exist.' },
        { text: 'Copies of every photo record', correct: false, why: 'Replicating data is the database’s job; etcd only records who leads.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'A team runs etcd on 4 nodes instead of 3, for extra safety. What do they actually get?',
      options: [
        {
          text: 'Still one failure survived, plus one more node that must answer',
          correct: true,
          why: 'A majority of 4 is 3, so losing 2 nodes stops progress, exactly as with 3 nodes.',
        },
        { text: 'Two failures survived', correct: false, why: 'That takes five nodes, whose majority is three.' },
        { text: 'Faster writes', correct: false, why: 'Each write must now reach 3 nodes instead of 2, which is no faster.' },
        { text: 'Protection from split brain that 3 nodes lack', correct: false, why: 'Three nodes already allow at most one leader per term.' },
      ],
    },
  ],
  takeaways: [
    'Two leaders means two diverging copies of the data, so a leader change must be agreed by a majority, not decided by one machine’s timeout.',
    'Raft elects a leader by majority vote within numbered terms; each node votes once per term, and a higher term makes an old leader step down.',
    'Use a coordination service such as ZooKeeper or etcd, with an odd number of nodes, usually three or five, instead of writing your own election.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Paxos.** The Raft site describes Raft as equivalent to [[Paxos|paxos]] in fault tolerance and performance, but designed to be easier to understand, and a user study in the Raft paper found students learned it more easily. Many older systems run Paxos or a close relative.',
    },
    {
      kind: 'prose',
      md: '**Pre-vote.** A node cut off from the others keeps timing out and raising its term, and when it reconnects, its high term forces a needless election. Many Raft implementations add a pre-vote round: a node first asks whether it could win before it raises its term.',
    },
    {
      kind: 'prose',
      md: '**Reads need care too.** A leader that has been replaced but does not know it yet could serve stale data. Before answering a read that must be up to date, Raft systems confirm their leadership with a majority or rely on a time-based lease.',
    },
  ],
  flashcards: [
    {
      front: 'Why must a replicated database have exactly one leader?',
      back: 'Two leaders accept writes the other never sees, so the copies diverge and writes conflict or get lost: split brain.',
    },
    {
      front: 'Why can’t a follower decide on its own that the leader is dead?',
      back: 'It cannot tell a dead leader from a slow one or a network partition, so it might promote itself while the leader still works.',
    },
    { front: 'What is a term in Raft?', back: 'A numbered period of leadership. Each election starts a new term, and each node votes once per term, so at most one leader wins it.' },
    { front: 'Why are Raft election timeouts random?', back: 'So one follower usually times out first and wins before others start, avoiding split votes.' },
    { front: 'How many failures does a five-node cluster survive?', back: 'Two, because a majority of five is three.' },
    {
      front: 'What does a coordination service such as etcd give you?',
      back: 'A small, strongly consistent store with leases and watches, run by consensus, so services can elect leaders without writing their own election.',
    },
    { front: 'What happens when an old leader comes back?', back: 'The next message it sees carries a higher term, so it steps down and becomes a follower.' },
  ],
  related: ['replication', 'quorums', 'cap-pacelc', 'heartbeats-gossip', 'distributed-locks', 'time-and-ordering', 'why-distributed-is-hard'],
  glossaryTerms: [
    'leader',
    'follower',
    'failover',
    'split-brain',
    'network-partition',
    'consensus',
    'majority',
    'raft',
    'leader-election',
    'election-term',
    'election-timeout',
    'heartbeat',
    'candidate',
    'replicated-log',
    'coordination-service',
    'lease',
    'watch',
    'availability-zone',
    'fencing-token',
    'paxos',
  ],
};

export default lesson;
