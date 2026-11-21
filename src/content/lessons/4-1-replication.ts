import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a write to the leader, the log streamed to followers, reads from followers, a failover. */
const leaderFollower: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'f1', type: 'sqlDb', label: 'Follower 1', sublabel: 'full copy', x: 2, y: 0 },
    { id: 'leader', type: 'sqlDb', label: 'Leader', sublabel: 'photo database', x: 2, y: 1 },
    { id: 'f2', type: 'sqlDb', label: 'Follower 2', sublabel: 'full copy', x: 2, y: 2 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-leader', from: 'app', to: 'leader', kind: 'sync', label: 'writes' },
    { id: 'leader-f1', from: 'leader', to: 'f1', kind: 'replication' },
    { id: 'leader-f2', from: 'leader', to: 'f2', kind: 'replication' },
    { id: 'app-f1', from: 'app', to: 'f1', kind: 'sync' },
    { id: 'app-f2', from: 'app', to: 'f2', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Every write goes to the **leader**. A like arrives, and the leader saves it as change #1042 in its log.',
      flow: ['users-app', 'app-leader'],
      notes: [{ target: 'leader', text: 'change #1042' }],
    },
    {
      caption: 'The leader streams its log to both followers, which apply #1042, then #1043, in the same order.',
      flow: [['leader-f1', 'leader-f2']],
      notes: [
        { target: 'f1', text: 'applied #1042' },
        { target: 'f2', text: 'applied #1042' },
      ],
    },
    {
      caption: 'Reads, such as profile views, go to the followers, which takes load off the leader.',
      flow: ['users-app', ['app-f1', 'app-f2'], ['<app-f1', '<app-f2']],
    },
    {
      caption: 'One night the leader’s disk dies. Writes fail, but reads keep working from the followers.',
      fail: ['leader'],
      flow: ['users-app', { edge: 'app-leader', tag: 'fails', tone: 'alert' }, 'app-f2', '<app-f2'],
    },
    {
      caption: 'Within seconds, Follower 1, the most up-to-date copy, is promoted, and writes go to it. This switch is called [[failover|failover]].',
      fail: ['leader'],
      flow: ['users-app', 'app-f1'],
      notes: [{ target: 'f1', text: 'new leader', tone: 'signal' }],
    },
  ],
};

/** The same kind of write, confirmed synchronously and then asynchronously. */
const confirmWrite: SequenceSpec = {
  actors: [
    { id: 'app', type: 'service', label: 'App server' },
    { id: 'leader', type: 'sqlDb', label: 'Leader' },
    { id: 'f1', type: 'sqlDb', label: 'Follower 1' },
  ],
  messages: [
    { from: 'app', to: 'leader', label: 'Save like', kind: 'sync', caption: 'Synchronous first: the app server sends a like, and the leader saves it.' },
    { from: 'leader', to: 'f1', label: 'Change #1042', kind: 'sync', caption: 'Before answering, the leader sends the change to Follower 1 and waits.' },
    { from: 'f1', to: 'leader', label: 'Got it', kind: 'reply', caption: 'Follower 1 stores it and confirms, about a millisecond later inside one data center (ballpark).' },
    { from: 'leader', to: 'app', label: 'Saved', kind: 'reply', caption: 'Only now is the like confirmed. Two machines have it, so losing the leader cannot lose it.' },
    { from: 'app', to: 'leader', label: 'Save like', kind: 'sync', caption: 'Now asynchronous: the next like arrives the same way.' },
    { from: 'leader', to: 'app', label: 'Saved', kind: 'reply', caption: 'The leader confirms at once, so the app gets its answer sooner.' },
    {
      from: 'leader',
      to: 'f1',
      label: 'Change #1043',
      kind: 'async',
      caption: 'The change follows later, usually within milliseconds. If the leader dies first, the like is gone, though the user was told it was saved.',
    },
  ],
  groups: [
    { label: 'Synchronous', from: 1, to: 4 },
    { label: 'Asynchronous', from: 5, to: 7 },
  ],
};

const lesson: Lesson = {
  id: 'replication',
  module: 'm4',
  order: 1,
  title: 'Replication',
  idea: 'Replication keeps copies of a database on several machines, so data survives a failure and reads can spread out, at the price of copies that are never quite in step.',
  minutes: 15,
  prerequisites: ['databases-101', 'availability-nines'],
  outcomes: [
    'Explain how leader–follower replication works and why reads can move to the followers.',
    'Compare synchronous and asynchronous replication: write speed against what a failover can lose.',
    'Describe what multi-leader and leaderless replication offer instead.',
  ],
  analogy: {
    title: 'The teacher and the board',
    body: 'A teacher writes on the board while the class copies into notebooks. The board is the one true version; each notebook is a copy, a few seconds behind. Ask any student what was said, and the teacher stays free to keep writing.\n\nBut a student a line behind shows you the old version. And if the board is wiped before the slowest writers catch up, the last line survives only in the fastest notebooks, or nowhere. Databases copy their data the same way, with the same two problems.',
  },
  whyItMatters:
    'Snapgram now has about 10 million daily users, with its photo data split across four databases. Each is still a single machine: if its disk fails, the data is gone, and on busy evenings profile reads alone keep it near its limit.\n\nSo each database gets a [[leader|leader]] and two [[followers|follower]] in Oregon, all holding the full data, and profile reads move to the followers. Then one night a leader’s disk dies. A follower takes over within seconds and the app keeps working, but the next morning users report likes that vanished: likes tapped in the second before the crash, which the app had confirmed.',
  body: [
    {
      kind: 'prose',
      md: 'In leader–follower [[replication|replication]], one copy, the leader, takes every write. It records each change in a log, often the same [[write-ahead log|write-ahead-log]] it keeps to survive crashes, and streams that log to the followers. They apply the changes in the same order, so each ends up with the same data, slightly later. Clients never write to a follower, so there is one order of writes and the copies never disagree about what came first.',
    },
    {
      kind: 'diagram',
      title: 'A leader and two followers at work',
      caption: 'One Snapgram photo database: a write, a read and a failover.',
      spec: leaderFollower,
    },
    { kind: 'heading', text: 'Synchronous or asynchronous' },
    {
      kind: 'prose',
      md: 'The big choice is when the leader tells the client a write succeeded. With [[synchronous replication|synchronous-replication]], it waits until a follower confirms it has the change too. With [[asynchronous replication|asynchronous-replication]], it confirms as soon as the change is in its own log, and the followers catch up in the background.',
    },
    {
      kind: 'sequence',
      title: 'Two ways to confirm a write',
      caption: 'Watch when the app server gets its answer.',
      spec: confirmWrite,
    },
    {
      kind: 'prose',
      md: 'Synchronous replication is safer, but every write waits for a round trip to the follower: about a millisecond nearby, 150 ms or more across an ocean (ballpark). If that follower is slow or down, writes wait too. So a common middle ground is [[semi-synchronous replication|semi-synchronous-replication]]: one synchronous follower, the rest asynchronous, and another steps in if the synchronous one fails.\n\nFully asynchronous replication stays popular because it is fast. Its price shows up in a failover: writes the leader confirmed but had not yet sent are gone, as Snapgram’s likes were.',
    },
    { kind: 'heading', text: 'Read replicas' },
    {
      kind: 'prose',
      md: 'Apps read far more than they write. Every follower holds a full copy, so it can answer reads; used this way, it is a [[read replica|read-replica]], and you add more as reads grow. Replicas do not help with writes, though: every follower applies every write too, so spreading writes needs [sharding](lesson:sharding).\n\nThe catch is [[replication lag|replication-lag]], the delay before a follower applies a change: milliseconds on a healthy system, seconds under heavy load (ballpark). Meanwhile a replica serves [[stale data|stale-data]], which [the next lesson](lesson:replication-lag) shows how to handle.',
    },
    { kind: 'heading', text: 'Failover' },
    {
      kind: 'prose',
      md: 'When a follower dies, it catches up from the leader’s log once it is back. When the leader dies, writes stop until a follower takes over:\n\n1. **Detect.** A [[failure detector|failure-detector]] declares the leader dead after it misses several [[heartbeats|heartbeat]], often within 10 to 30 seconds (ballpark).\n2. **Choose.** The most up-to-date follower is picked, ideally by majority vote so that exactly one wins: a [[leader election|leader-election]].\n3. **Switch.** Writes go to the new leader, the other followers copy from it, and the old leader must come back as a follower.',
    },
    {
      kind: 'prose',
      md: 'Each step can go wrong. With asynchronous replication, the new leader lacks the old one’s last confirmed writes, which are usually discarded if the old leader returns. And a leader that was only cut off, not dead, may keep taking writes, so two machines act as leader: [[split brain|split-brain]], the subject of [Consensus and leader election](lesson:consensus-leader-election).',
    },
    { kind: 'heading', text: 'Other shapes: multi-leader and leaderless' },
    {
      kind: 'prose',
      md: 'A single leader is simple: one place takes writes, so there is one order and no conflicts. [[Multi-leader replication|multi-leader-replication]] and [[leaderless replication|leaderless-replication]] give that up for something else.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Multi-leader',
        summary: 'One leader per region',
        points: [
          'Each region takes writes locally: fast for distant users, and a region keeps working when cut off.',
          'Two leaders can change the same data at once, a [[write conflict|write-conflict]], which must be merged.',
        ],
      },
      right: {
        title: 'Leaderless',
        summary: 'No leader at all',
        points: [
          'Each write goes to several replicas, say three, and counts once two confirm; reads ask two as well.',
          'Any two groups of two out of three overlap, so a read reaches the latest write: a [[quorum|quorum]]. No failover is needed.',
        ],
      },
      caption: 'Both return later: multi-leader when Snapgram adds a second region ([lesson 4.5](lesson:cap-pacelc)), leaderless in [Quorums](lesson:quorums).',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson skips how changes are encoded, how a new follower starts from a snapshot, and how followers can feed other followers. Real failover also fails in more ways than three steps suggest, so some teams have a person approve it.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'replication',
      preset: { lagMs: 1000, mode: 'async', readFromLeader: false, sticky: false, failLeader: true },
      intro:
        'Replay 12 seconds of one Snapgram database. The leader’s disk dies at 7 seconds: count the confirmed writes lost with asynchronous replication, then switch to synchronous and watch the write time.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to arrange the copies.',
    rows: [
      {
        option: 'Single leader, asynchronous',
        goodAt: 'Fast writes; followers never hold the leader back.',
        badAt: 'A failover loses confirmed writes that had not reached a follower.',
        pickWhen: 'Losing a second of writes is tolerable, as with likes.',
      },
      {
        option: 'Single leader, semi-synchronous',
        goodAt: 'A failover loses nothing that was confirmed.',
        badAt: 'Every write waits for a follower, and a struggling one slows all writes.',
        pickWhen: 'Writes must never be lost, such as payments.',
      },
      {
        option: 'Multi-leader',
        goodAt: 'Fast local writes in every region.',
        badAt: 'Concurrent writes conflict and must be merged.',
        pickWhen: 'Users in several regions write a lot, and the data merges easily.',
      },
      {
        option: 'Leaderless',
        goodAt: 'No failover; dead replicas are simply outvoted.',
        badAt: 'Each request contacts several replicas, and consistency depends on tuning.',
        pickWhen: 'Staying writable through failures matters most.',
      },
    ],
  },
  realWorld: {
    title: 'GitHub’s 43-second network cut, 2018',
    body: 'On October 21, 2018, maintenance work cut the link between GitHub’s primary data center on the East Coast of the United States and a nearby network hub for 43 seconds. In that time, Orchestrator, the tool that runs failover for GitHub’s MySQL clusters, began moving cluster leaders to the West Coast, and writes followed.\n\nBut the East Coast databases held a brief period of writes never replicated to the West Coast. GitHub put data integrity ahead of a fast recovery, and the site ran degraded for 24 hours and 11 minutes. One of the busiest clusters had 954 writes in the affected window; reconciling those few seconds of writes by hand was still under way when the report came out.',
    sourceUrl: 'https://github.blog/news-insights/company-news/oct21-post-incident-analysis/',
    sourceLabel: 'Jason Warner, “October 21 post-incident analysis,” The GitHub Blog, 2018',
  },
  interview: {
    whenToMention:
      'Whenever your design has a database. Say how many copies you keep, whether replication is synchronous and why, and where reads go; if asked what happens when the database dies, walk through the failover and what it can lose.',
    sayItLikeThis: [
      'Each shard has a leader and two followers in different [[availability zones|availability-zone]]; writes go to the leader, profile reads to the followers.',
      'One follower is synchronous, so a confirmed write survives losing the leader; the other is asynchronous, so one slow follower can’t stall writes.',
      'Likes can afford to lose a second of writes in a failover; payments can’t, so they take the synchronous path.',
    ],
    followUps: [
      {
        q: 'How long does a failover take, and what do users see?',
        a: 'Detection takes a few missed heartbeats, often 10 to 30 seconds, plus a few seconds to promote (ballpark). Writes fail meanwhile but reads keep working, so clients should retry writes after a short wait.',
      },
      {
        q: 'Why not make every follower synchronous?',
        a: 'Every write would wait for the slowest follower, and one dead follower would stop all writes. One synchronous follower already keeps every confirmed write on two machines.',
      },
      {
        q: 'What happens to the old leader when it comes back?',
        a: 'It rejoins as a follower, and writes it holds that the new leader never got are usually discarded or reconciled by hand, as GitHub did in 2018. It must be stopped from taking writes first, or you get split brain.',
      },
    ],
    redFlags: [
      'Calling replicas a backup: an accidental delete reaches every follower within seconds.',
      'Claiming replicated data can never be lost, without saying whether replication is synchronous.',
      'Adding followers to absorb more writes.',
    ],
  },
  mistakes: [
    '**Treating replicas as backups.** A bad delete reaches every follower within seconds; keep backups you can restore to an earlier point.',
    '**Assuming asynchronous replication loses nothing.** A failover can drop the last moments of confirmed writes.',
    '**Making every follower synchronous.** Each write waits for the slowest copy, and one dead follower stops all writes.',
    '**Promoting without stopping the old leader.** If it was only cut off, it may keep taking writes, and you have two leaders.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'Snapgram’s leader confirms each like as soon as it is in its own log, and the followers receive changes about a second later. The leader’s disk dies, and Follower 1 is promoted. What happens to the likes confirmed in the last second?',
      options: [
        {
          text: 'They are lost, because they never reached Follower 1',
          correct: true,
          why: 'With asynchronous replication, a confirmed write that had not reached the follower existed only on the dead leader.',
        },
        {
          text: 'They are safe, because the leader confirmed them',
          correct: false,
          why: 'The confirmation only meant the leader had them; nothing waited for a follower.',
        },
        {
          text: 'They are copied over from Follower 2',
          correct: false,
          why: 'Follower 2 gets changes from the same leader, at best as quickly as Follower 1, so it does not have them either.',
        },
        {
          text: 'Users see an error and retry them',
          correct: false,
          why: 'They had already been confirmed, so users were told they succeeded. That is what makes this loss so surprising.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'A leader takes about 300 writes per second, and its asynchronous followers run about half a second behind. The leader dies. Roughly how many confirmed writes can be lost?',
      answer: 150,
      unit: 'writes',
      tolerance: 1.2,
      solution: [
        'Writes confirmed in the last half second had not reached the followers yet.',
        '300 writes per second × 0.5 seconds = 150 writes.',
        'The most up-to-date follower is the one promoted, so its lag sets the loss.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are good reasons to add read replicas?',
      options: [
        { text: 'Profile reads are overloading the leader', correct: true, why: 'Replicas can answer reads, which takes that load off the leader.' },
        {
          text: 'Writes are overloading the leader',
          correct: false,
          why: 'Every replica must apply every write too, so replicas add no write capacity. Spreading writes needs sharding.',
        },
        {
          text: 'You want a copy ready to promote if the leader dies',
          correct: true,
          why: 'A follower holds a nearly complete copy, which is exactly what a failover promotes.',
        },
        {
          text: 'You need a way to undo an accidental delete',
          correct: false,
          why: 'The delete replicates to every follower within seconds. Undoing it needs backups that keep older versions.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'A leader’s disk dies. Put the failover in order.',
      items: [
        'The leader stops sending heartbeats',
        'After several missed heartbeats, the failure detector declares it dead',
        'The most up-to-date follower is chosen and promoted',
        'Writes go to the new leader, and the other followers copy from it',
        'The old leader, when it comes back, rejoins as a follower',
      ],
      why: 'Nothing can happen before the failure is detected. The old leader must return as a follower, or two machines would both take writes.',
    },
    {
      kind: 'single',
      prompt: 'What does synchronous replication cost you?',
      options: [
        {
          text: 'Every write waits for a follower, so a slow or dead follower holds writes up',
          correct: true,
          why: 'The leader cannot confirm until the follower answers, so the follower’s speed becomes part of every write.',
        },
        {
          text: 'Reads get slower',
          correct: false,
          why: 'Reads are answered by one copy either way. Synchronous replication changes when writes are confirmed.',
        },
        {
          text: 'A failover can lose confirmed writes',
          correct: false,
          why: 'That is the risk of asynchronous replication. Synchronous replication exists to remove it.',
        },
        {
          text: 'Followers can no longer serve reads',
          correct: false,
          why: 'They still can. A synchronous follower is a full copy, just one the leader waits for.',
        },
      ],
    },
  ],
  takeaways: [
    'In leader–follower replication, the leader takes every write and streams its log to followers, which serve reads and can take over in a failover.',
    'Asynchronous replication keeps writes fast but can lose the last confirmed writes in a failover; one synchronous follower prevents that, at the cost of slower writes.',
    'Followers add read capacity, not write capacity, and because they lag, some reads will be stale.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**How changes are shipped.** Some databases send the statements themselves, which breaks on anything that is not deterministic, such as the current time or a random number: each follower would work out its own value. Most now send the changed rows, or the low-level log itself.',
    },
    {
      kind: 'prose',
      md: '**Adding a follower.** A new follower cannot replay years of log. It starts from a snapshot of the leader’s data, notes the log position the snapshot matches, then asks for every change after that position until it has caught up.',
    },
    {
      kind: 'prose',
      md: '**Chained followers.** A leader with many followers sends every change many times. Some setups let followers feed other followers, which spreads that work at the price of more lag at the end of the chain.',
    },
  ],
  flashcards: [
    {
      front: 'What is leader–follower replication?',
      back: 'One leader takes every write and streams its log of changes to followers, which apply them in the same order and can serve reads.',
    },
    {
      front: 'Synchronous or asynchronous replication: what is the difference?',
      back: 'Synchronous: the leader confirms a write only once a follower has it. Asynchronous: it confirms at once, and the followers catch up later.',
    },
    {
      front: 'What can an asynchronous failover lose?',
      back: 'Writes the leader had confirmed but not yet sent to the promoted follower: roughly the write rate times the lag.',
    },
    {
      front: 'What is semi-synchronous replication?',
      back: 'One follower is synchronous and the rest are asynchronous, so every confirmed write is on two machines without waiting for all of them.',
    },
    { front: 'Do read replicas help with write load?', back: 'No. Every replica applies every write; spreading writes needs sharding.' },
    {
      front: 'What are the steps of a failover?',
      back: 'Detect the dead leader through missed heartbeats, promote the most up-to-date follower, send writes to it, and keep the old leader from taking writes.',
    },
    {
      front: 'Multi-leader or leaderless replication: what is the difference?',
      back: 'Multi-leader has several leaders, often one per region, that exchange changes and merge conflicts. Leaderless has no leader: clients write to and read from several replicas.',
    },
  ],
  related: ['replication-lag', 'sharding', 'cap-pacelc', 'quorums', 'consensus-leader-election', 'availability-nines', 'multi-region-dr'],
  glossaryTerms: [
    'leader',
    'follower',
    'replication',
    'write-ahead-log',
    'failover',
    'synchronous-replication',
    'asynchronous-replication',
    'semi-synchronous-replication',
    'read-replica',
    'replication-lag',
    'stale-data',
    'failure-detector',
    'heartbeat',
    'leader-election',
    'split-brain',
    'multi-leader-replication',
    'leaderless-replication',
    'write-conflict',
    'quorum',
    'availability-zone',
  ],
};

export default lesson;
