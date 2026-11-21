import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: where each kind of Snapgram read goes, and what it costs. */
const whereReadsGo: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 0.5 },
    { id: 'sg', type: 'sqlDb', label: 'Singapore copy', sublabel: 'nearby', x: 1, y: 0 },
    { id: 'or', type: 'sqlDb', label: 'Oregon leader', sublabel: 'orders writes', x: 1, y: 1 },
  ],
  edges: [
    { id: 'maya-sg', from: 'maya', to: 'sg', kind: 'sync' },
    { id: 'maya-or', from: 'maya', to: 'or', kind: 'sync' },
    { id: 'or-sg', from: 'or', to: 'sg', kind: 'replication' },
  ],
  steps: [
    {
      caption: 'Like counts, eventual: Maya’s phone reads from the **Singapore copy**, a few milliseconds away. The count may be a second behind, and nobody can tell.',
      flow: ['maya-sg', '<maya-sg'],
      notes: [{ target: 'sg', text: '≈ 5 ms' }],
    },
    {
      caption:
        'Boost credit balances, strong: every check and purchase goes to the **Oregon leader**, which puts all purchases in one order. That costs a round trip across the Pacific, about 170 ms (ballpark), but is never out of date.',
      flow: ['maya-or', '<maya-or'],
      notes: [{ target: 'or', text: '≈ 170 ms' }],
    },
    {
      caption:
        'Maya’s own new post, read-your-writes: her phone remembers the version of her last write, and the **Singapore copy** answers only once it has caught up to it.',
      flow: [{ edge: 'maya-sg', tag: 'after my post' }, 'or-sg', '<maya-sg'],
    },
    {
      caption: 'Comments, causal: the **Singapore copy** answers from nearby, but holds back any reply until it has the comment the reply answers.',
      flow: ['or-sg', 'maya-sg', '<maya-sg'],
      notes: [{ target: 'sg', text: 'questions first' }],
    },
  ],
};

/** Under eventual consistency, a reply can reach a copy before the question it answers. */
const replyFirst: SequenceSpec = {
  actors: [
    { id: 'leo', type: 'client', label: 'Leo' },
    { id: 'c1', type: 'nosqlDb', label: 'Copy 1' },
    { id: 'maya', type: 'client', label: 'Maya' },
    { id: 'c2', type: 'nosqlDb', label: 'Copy 2' },
    { id: 'priya', type: 'client', label: 'Priya' },
  ],
  messages: [
    { from: 'leo', to: 'c1', label: 'Question', kind: 'sync', caption: 'Leo asks where the photo was taken. His comment is stored on copy 1.' },
    { from: 'maya', to: 'c1', label: 'Read comments', kind: 'sync', caption: 'Maya opens the photo; her request reaches copy 1.' },
    { from: 'c1', to: 'maya', label: 'Question', kind: 'reply', caption: 'She sees Leo’s question.' },
    { from: 'maya', to: 'c2', label: 'Reply', kind: 'sync', caption: 'Maya answers. Her reply is stored on copy 2, which has not received the question yet.' },
    { from: 'priya', to: 'c2', label: 'Read comments', kind: 'sync', caption: 'Priya opens the photo; her request reaches copy 2.' },
    { from: 'c2', to: 'priya', label: 'Reply only', kind: 'reply', caption: 'Under eventual consistency, copy 2 returns what it has: an answer to a question Priya cannot see.' },
    {
      from: 'c1',
      to: 'c2',
      label: 'Question, late',
      kind: 'async',
      caption: 'The question arrives a moment later. With causal consistency, copy 2 would have held the reply back until now.',
    },
  ],
};

const lesson: Lesson = {
  id: 'consistency-models',
  module: 'm4',
  order: 6,
  title: 'Consistency models',
  idea: 'A consistency model is the promise a replicated system makes about which values a read may return, and each feature needs only the weakest promise that keeps it correct.',
  minutes: 14,
  prerequisites: ['cap-pacelc'],
  outcomes: [
    'Describe what strong, eventual, causal and read-your-writes consistency each promise, and what each lets a read return.',
    'Match each Snapgram feature to the weakest model that keeps it correct, from boost credit balances to like counts.',
    'Explain what each model costs, and how systems commonly provide it.',
  ],
  analogy: {
    title: 'The live score and tomorrow’s paper',
    body: 'During a big match, the stadium scoreboard shows every goal the moment it happens, and everyone sees the same score. Tomorrow’s newspaper reports it too, correctly, but hours after the final whistle.\n\nThe live score needs cameras and a feed to every screen; the paper needs only a printing press. Most news can wait for the paper, but a coach deciding on a substitution needs the live score. Consistency models describe the options in between: how current each reader’s view must be, and what may show up out of order.',
  },
  whyItMatters:
    'After the outage, the Snapgram team reviews how each feature reads its data. Most reads go to the nearest copy, which is fast but can be a moment behind, and a week of bug reports shows the cost:\n\n- Maya posted a photo, opened her profile, and it was not there, so she posted it again.\n- Priya saw Maya’s answer, Marina Bay, from the pier, under a photo with no question above it.\n\nNobody has noticed like counts running a few seconds behind. And an engineer wants boost credit balances read from the nearest copy too, to make purchases faster.',
  body: [
    {
      kind: 'prose',
      md: 'A [[consistency model|consistency-model]] is a promise about which values a read may return, given the writes before it. At one end, a system with many copies, built through [[replication|replication]], behaves as if there were only one; at the other, the copies only agree in the end. In between sit promises that rule out specific confusions, like those in the two bug reports.',
    },
    { kind: 'heading', text: 'Strong consistency' },
    {
      kind: 'prose',
      md: '[[Strong consistency|strong-consistency]], formally [[linearizability|linearizability]], is the live score: every read returns the latest completed write, for every reader, everywhere. To keep that promise, reads and writes go through the copy that orders writes, usually a [[leader|leader]] or a [[quorum|quorum]] of copies; for Snapgram that can mean a [[round trip|round-trip-time]] across the Pacific, about 170 ms (ballpark). During a [[network partition|network-partition]], the side that cannot reach it must refuse requests.\n\nBoost credit balances need it: a purchase must see every earlier purchase, or the same credits get spent twice.',
    },
    { kind: 'heading', text: 'Eventual consistency' },
    {
      kind: 'prose',
      md: '[[Eventual consistency|eventual-consistency]] is tomorrow’s paper: it promises only that if writes stop, all copies end up the same. Until then, readers may disagree, and one reader can even see an older value after a newer one. It is the cheapest model: every read is served by the nearest copy, and every region keeps working during a partition. Like and view counts live here, because nobody can tell that a count is a few seconds behind.',
    },
    { kind: 'heading', text: 'Read-your-writes' },
    {
      kind: 'prose',
      md: '[[Read-your-writes consistency|read-your-writes]] makes one narrow promise: after you change something, your own reads show the change. Others may still see the old version for a moment, but they cannot tell. It fixes Maya’s vanishing photo: as [Replication lag in practice](lesson:replication-lag) showed, Snapgram reads your own profile from the leader for a minute after you change it. Another way is for the app to remember your last write’s version and read only from [[followers|follower]] that have caught up.',
    },
    { kind: 'heading', text: 'Causal consistency' },
    {
      kind: 'prose',
      md: '[[Causal consistency|causal-consistency]] promises that effects never appear before their causes. Maya read Leo’s question and then replied, so anyone who sees her reply must also see the question. It includes read-your-writes, and you never see an older version of something after a newer one. Unrelated writes, such as comments on different photos, may still appear in any order, which keeps it far cheaper than strong consistency.',
    },
    {
      kind: 'sequence',
      title: 'How a reply can arrive before its question',
      caption: 'Two copies of the comments, each receiving writes in its own order.',
      spec: replyFirst,
    },
    {
      kind: 'prose',
      md: 'Systems provide causal consistency by attaching dependencies to each write, often as version numbers or a [[version vector|version-vector]]: this reply depends on that question. A copy shows a write only once it has everything the write depends on. Like read-your-writes, causal consistency keeps working on both sides of a partition, as long as each user keeps talking to the same copy.',
    },
    { kind: 'heading', text: 'Choosing per feature' },
    {
      kind: 'prose',
      md: 'The rule of thumb: give each feature the weakest model that keeps it correct, because every step up costs latency and, during a partition, availability.',
    },
    {
      kind: 'diagram',
      title: 'Where each read goes',
      caption: 'Step through four Snapgram features and the guarantee each one gets.',
      spec: whereReadsGo,
    },
    {
      kind: 'table',
      columns: ['Snapgram feature', 'Model', 'Why that one'],
      rows: [
        ['Boost credit balance', 'Strong', 'Two purchases must see each other.'],
        ['Unique usernames', 'Strong', 'Two people must never get one name.'],
        ['Comments and replies', 'Causal', 'An answer without its question confuses everyone.'],
        ['Your own posts and captions', 'Read-your-writes', 'You must see your change at once.'],
        ['Like and view counts', 'Eventual', 'A few seconds behind harms nobody.'],
      ],
      caption: 'Each feature with the weakest model that keeps it correct.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'There are many more models, such as sequential consistency, monotonic reads and snapshot isolation, and databases name them differently. Real systems also mix models per request, such as reading from the leader only right after a user’s own write.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'consistency-timelines',
      title: 'Four models, one story',
      caption: 'Step through one story under four models: ticked values are ones a read may return, struck-out ones it never returns. Then switch to the comment-and-reply story.',
      props: { scenario: 'caption' },
    },
  ],
  tradeoffs: {
    caption: 'The four models, strongest first.',
    rows: [
      {
        option: 'Strong (linearizable)',
        goodAt: 'Behaves like a single copy, so there is nothing surprising to explain.',
        badAt: 'Every read and write waits for the leader or a majority, often in another region, and the cut-off side stops during a partition.',
        pickWhen: 'Money, credits, stock levels, unique names and locks.',
      },
      {
        option: 'Causal',
        goodAt: 'No effect before its cause, and your own writes always show, while most reads stay local.',
        badAt: 'Tracking dependencies adds metadata and complexity.',
        pickWhen: 'Conversations: comments, replies and chat.',
      },
      {
        option: 'Read-your-writes',
        goodAt: 'Fixes the most visible confusion, your own change vanishing, cheaply.',
        badAt: 'Protects only the writer; others can still see [[stale data|stale-data]] or changes out of order.',
        pickWhen: 'Profiles, settings, captions and your own posts.',
      },
      {
        option: 'Eventual',
        goodAt: 'Fastest, and every region keeps working during a partition.',
        badAt: 'Readers can see old values, disagree with each other, and see a value go backwards.',
        pickWhen: 'Counts, feeds and recommendations.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon S3 moves to strong consistency',
    body: 'Amazon Simple Storage Service (S3) is Amazon’s [[object storage|object-storage]] service. Before December 2020, as Amazon Web Services (AWS) later explained, a read or listing could briefly miss a recent write: the data was stored but not yet visible to every request, and some big-data users added extra tools to get consistent results.\n\nIn December 2020, AWS announced that S3 now provides strong read-after-write consistency for reads, writes and listings of all new and existing objects, in all regions, automatically and at no extra charge, with no performance impact. Its summary: “What you write is what you will read.”',
    sourceUrl: 'https://aws.amazon.com/blogs/aws/amazon-s3-update-strong-read-after-write-consistency/',
    sourceLabel: 'Jeff Barr, “Amazon S3 Update – Strong Read-After-Write Consistency,” AWS News Blog, 1 December 2020',
  },
  interview: {
    whenToMention:
      'Whenever you add replicas, caches or a second region, say which consistency model each kind of data needs and why. Interviewers listen for the weakest model that is still correct.',
    sayItLikeThis: [
      'Credit balances need strong consistency, so every purchase goes through the leader; like counts can be eventually consistent, served from the nearest copy.',
      'For comments I want causal consistency, so a reply never shows up before the comment it answers.',
      'Users must see their own edits at once, so their own profile reads go to the leader for a minute after a change.',
    ],
    followUps: [
      {
        q: 'Isn’t strong consistency always better?',
        a: 'It is the easiest to reason about, but every read and write must reach the copy that orders writes, often across regions, and the cut-off side refuses requests during a partition. For a like count that cost buys nothing users notice, so I keep it for balances and unique names.',
      },
      {
        q: 'How would you implement read-your-writes?',
        a: 'Send a user’s reads to the leader for a short time after they write, or have the client remember its last write’s version and read only from a copy that has caught up. Pinning each user to one copy also stops their view from going backwards.',
      },
      {
        q: 'How does a system provide causal consistency?',
        a: 'Each write carries what it depends on, such as the comment a reply answers, often as version numbers or a version vector. A copy makes a write visible only after applying everything it depends on.',
      },
    ],
    redFlags: [
      'Saying eventual consistency means the data is random, or that it guarantees agreement within a fixed time.',
      'Choosing strong consistency everywhere without mentioning its latency and availability cost.',
      'Treating read-your-writes as strong consistency: it protects only the writer’s own view.',
    ],
  },
  mistakes: [
    '**Strong everything by default.** Every read pays for a trip to the leader, and a partition takes down features that never needed the guarantee.',
    '**Eventual everything by default.** Users see their own posts vanish and answers before questions, and they file bug reports nobody can reproduce.',
    '**Forgetting [[monotonic reads|monotonic-reads]].** If each refresh can reach a different copy, a comment can appear and then vanish; pinning each user to one copy fixes it.',
    '**Assuming eventual means soon.** The model promises agreement, not a deadline, so measure your [[replication lag|replication-lag]] and alert when it grows.',
  ],
  quiz: [
    {
      kind: 'multi',
      prompt: 'Leo sees Maya’s new caption, refreshes, and sees the old one again. Which models allow that?',
      options: [
        { text: 'Eventual', correct: true, why: 'Until the copies catch up, any value written so far may come back, even after a newer one was seen.' },
        { text: 'Read-your-writes', correct: true, why: 'It protects only the writer: Maya always sees her new caption, but Leo gets no promise.' },
        { text: 'Causal', correct: false, why: 'Once Leo has seen the new caption, causal consistency never shows him the older one.' },
        { text: 'Strong (linearizable)', correct: false, why: 'Once the new caption is saved, every read anywhere returns it.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Priya sees Maya’s reply but not Leo’s question above it. What is the weakest model that rules this out?',
      options: [
        { text: 'Causal', correct: true, why: 'It guarantees that anyone who sees the reply also sees the question it depends on.' },
        { text: 'Read-your-writes', correct: false, why: 'It protects only a writer’s own reads, and Priya wrote nothing.' },
        { text: 'Eventual', correct: false, why: 'It allows any mix of comments until the copies catch up.' },
        { text: 'Strong (linearizable)', correct: false, why: 'It rules this out too, but at a much higher cost; causal is enough.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which Snapgram feature needs strong consistency?',
      options: [
        { text: 'Spending boost credits', correct: true, why: 'A purchase must see every earlier purchase, or the same credits are spent twice.' },
        { text: 'Showing a like count', correct: false, why: 'A count a few seconds behind harms nobody, so eventual consistency is fine.' },
        { text: 'Showing replies under a comment', correct: false, why: 'Causal consistency is enough to keep answers after their questions.' },
        { text: 'Showing Maya her own new post', correct: false, why: 'Read-your-writes is enough, because only Maya needs to see it at once.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Order these models from the strongest promise to the weakest.',
      items: ['Strong (linearizable)', 'Causal', 'Read-your-writes', 'Eventual'],
      why: 'Strong behaves like one copy. Causal includes read-your-writes and adds that causes come before effects for everyone. Read-your-writes protects only your own changes, and eventual promises only that copies agree in the end.',
    },
    {
      kind: 'numeric',
      prompt:
        'Maya’s profile screen makes 6 reads, one after another. Each takes about 5 ms from the Singapore copy, or about 170 ms from the Oregon leader. How much longer does the screen take if every read goes to the leader?',
      answer: 990,
      unit: 'ms',
      tolerance: 1.1,
      solution: ['From the leader: 6 × 170 = 1,020 ms.', 'From the nearby copy: 6 × 5 = 30 ms.', 'The difference is 1,020 − 30 = 990 ms, about a second, mostly for reads that did not need it.'],
    },
  ],
  takeaways: [
    'A consistency model is a promise about what a read may return, and stronger promises cost more latency and, during partitions, availability.',
    'Use strong consistency for money and unique names, causal for conversations, read-your-writes for your own changes, and eventual for counts.',
    'Give each feature the weakest model that keeps it correct, and say why in the interview.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**More models.** Between causal and eventual sit smaller promises such as monotonic reads (you never go back in time) and consistent prefix reads (you see writes in the order they happened). Above causal sit sequential consistency and, for transactions, serializability. Jepsen keeps a [map of consistency models](https://jepsen.io/consistency/models) that shows how they relate and which of them cannot stay fully available during a partition.',
    },
    {
      kind: 'prose',
      md: '**Session guarantees.** Read-your-writes, monotonic reads, monotonic writes and writes-follow-reads are known together as session guarantees, because each protects one user’s session. Causal consistency gives all four at once.',
    },
    {
      kind: 'prose',
      md: '**Strong, but per key.** Many databases are linearizable for each key or row but promise nothing across keys. That is often enough: one balance needs a single order of updates, but two users’ balances do not need to share one.',
    },
  ],
  flashcards: [
    { front: 'What is a consistency model?', back: 'A promise about which values a read may return, given the writes that came before it.' },
    {
      front: 'What does strong consistency (linearizability) promise?',
      back: 'Every read returns the latest completed write, as if there were one copy, and no read goes back to an older value.',
    },
    { front: 'What does eventual consistency promise?', back: 'Only that copies agree once writes stop. Until then, reads can be stale, disagree, or go backwards.' },
    { front: 'What does read-your-writes promise, and to whom?', back: 'That your own reads always show your own changes. Other users may see them later.' },
    {
      front: 'What does causal consistency promise?',
      back: 'That effects never appear before their causes, such as a reply before its comment, and that you never see an older version than one you have seen.',
    },
    { front: 'Which Snapgram feature needs which model?', back: 'Boost credits: strong. Comments and replies: causal. Your own posts: read-your-writes. Like counts: eventual.' },
    {
      front: 'Why not make everything strongly consistent?',
      back: 'Every read and write must reach the copy that orders writes, often across regions, and the cut-off side stops working during a partition.',
    },
  ],
  related: ['cap-pacelc', 'replication-lag', 'quorums', 'time-and-ordering', 'distributed-transactions', 'caching'],
  glossaryTerms: [
    'consistency-model',
    'replication',
    'strong-consistency',
    'linearizability',
    'leader',
    'quorum',
    'round-trip-time',
    'network-partition',
    'eventual-consistency',
    'read-your-writes',
    'follower',
    'causal-consistency',
    'version-vector',
    'stale-data',
    'object-storage',
    'monotonic-reads',
    'replication-lag',
  ],
};

export default lesson;
