import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** A stale read of Maya’s own write, message by message. */
const staleRead: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'leader', type: 'sqlDb', label: 'Leader' },
    { id: 'follower', type: 'sqlDb', label: 'Follower' },
  ],
  messages: [
    { from: 'phone', to: 'leader', label: 'Save caption', kind: 'sync', caption: 'Maya saves a new caption. Like every write, it goes to the leader.' },
    {
      from: 'leader',
      to: 'phone',
      label: 'Saved',
      kind: 'reply',
      caption: 'The leader stores it and confirms at once, because it replicates [[asynchronously|asynchronous-replication]].',
    },
    { from: 'phone', to: 'follower', label: 'Load profile', kind: 'sync', caption: 'Her app reloads her profile 300 ms later. Reads go to a follower.' },
    { from: 'follower', to: 'phone', label: 'Old caption', kind: 'reply', caption: 'The follower is about 2 seconds behind, so it answers with the old caption. Her edit looks lost.' },
    { from: 'leader', to: 'follower', label: 'New caption', kind: 'async', caption: 'About 2 seconds after the save, the change reaches the follower.' },
    { from: 'phone', to: 'follower', label: 'Load profile', kind: 'sync', caption: 'Maya reloads again.' },
    { from: 'follower', to: 'phone', label: 'New caption', kind: 'reply', caption: 'This time she sees her edit. It was never lost, only late.' },
  ],
  groups: [{ label: 'Stale read', from: 3, to: 4 }],
};

/** Reads that hop between followers at different points, then the sticky fix. */
const vanishing: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'f1', type: 'sqlDb', label: 'Follower 1', sublabel: '≈ 1 s behind', x: 1, y: 0 },
    { id: 'maya', type: 'client', label: 'Maya’s phone', x: 0, y: 1 },
    { id: 'leader', type: 'sqlDb', label: 'Leader', x: 1, y: 1 },
    { id: 'friend', type: 'client', label: 'A friend', sublabel: 'comments', x: 2, y: 1 },
    { id: 'f2', type: 'sqlDb', label: 'Follower 2', sublabel: '≈ 2 s behind', x: 1, y: 2 },
  ],
  edges: [
    { id: 'friend-leader', from: 'friend', to: 'leader', kind: 'sync' },
    { id: 'leader-f1', from: 'leader', to: 'f1', kind: 'replication' },
    { id: 'leader-f2', from: 'leader', to: 'f2', kind: 'replication' },
    { id: 'maya-f1', from: 'maya', to: 'f1', kind: 'sync' },
    { id: 'maya-f2', from: 'maya', to: 'f2', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'A friend comments on Sam’s beach photo. The **leader** takes the comment and copies it to both followers, which apply it about 1 and 2 seconds later.',
      flow: ['friend-leader', ['leader-f1', 'leader-f2']],
    },
    {
      caption: 'Maya refreshes the photo. A [[load balancer|load-balancer]] spreads reads across the followers, and this one lands on Follower 1, which has the comment.',
      flow: ['maya-f1', { edge: 'maya-f1', reverse: true, tag: 'comment' }],
    },
    {
      caption: 'She refreshes again, and this read lands on Follower 2, which is further behind. The comment is gone.',
      flow: ['maya-f2', { edge: 'maya-f2', reverse: true, tag: 'comment gone', tone: 'alert' }],
    },
    {
      caption: 'The fix: every read Maya makes goes to one follower, here Follower 2. It applies changes in order, so the comment shows up a little later, then stays.',
      flow: ['maya-f2', { edge: 'maya-f2', reverse: true, tag: 'comment' }],
      focus: ['maya', 'f2', 'leader'],
    },
  ],
};

const lesson: Lesson = {
  id: 'replication-lag',
  module: 'm4',
  order: 2,
  title: 'Replication lag in practice',
  idea: 'Because followers trail the leader, a read can show data that is already out of date, and two simple routing rules stop the two kinds users notice: missing their own changes, and seeing time run backwards.',
  minutes: 15,
  prerequisites: ['replication'],
  outcomes: [
    'Explain why a read from a follower can be stale, and estimate how stale.',
    'Recognize read-your-writes and monotonic-reads problems from what a user describes.',
    'Choose a fix: reading from the leader after a change, waiting for a log position, or pinning reads to one follower.',
  ],
  analogy: {
    title: 'The calendar that has not synced',
    body: 'You move Thursday’s meeting from 2 pm to 3 pm. A teammate checks their calendar, which has not synced yet, sees 2 pm and walks into an empty room. Nothing is broken; the change simply has not arrived.\n\nNow they check twice, on two devices. The laptop has synced and says 3 pm, the phone has not and says 2 pm. Seeing the new time and then the old one is more confusing than seeing only the old one, and replication lag causes both surprises.',
  },
  whyItMatters:
    'Since [the last lesson](lesson:replication), Snapgram reads profiles from [[followers|follower]], which keeps the [[leaders|leader]] calm. Most of the time the followers are a fraction of a second behind; at the evening peak, a second or two.\n\nMaya, in Singapore, edits the caption on her latest photo and taps Save. The app says it is saved, reloads her profile, and shows the old caption. Later, on her friend Sam’s beach photo, a new comment appears; she refreshes and it is gone, then back on the next refresh. Two support tickets arrive that evening: “my edits don’t save” and “comments keep disappearing”.',
  body: [
    {
      kind: 'prose',
      md: '[[Replication lag|replication-lag]] is how far a follower trails the leader. On a healthy system it is milliseconds, so most reads from a follower see the latest data. It grows when the leader takes a burst of writes, when a follower runs a heavy query or a backup, or when the network is busy: seconds at peaks, and minutes for a struggling follower (ballpark). Once a follower catches up, the copies agree again, which is what [[eventual consistency|eventual-consistency]] promises.\n\nA read that misses a change the leader has already confirmed returns [[stale data|stale-data]]. Most stale reads go unnoticed, since a like count a second old harms no one. Two kinds are different, because users notice them and decide the app is broken.',
    },
    { kind: 'heading', text: 'Reading your own writes' },
    {
      kind: 'sequence',
      title: 'A stale read of Maya’s own edit',
      caption: 'Step through the save, the reload, and the moment the change arrives.',
      spec: staleRead,
    },
    {
      kind: 'prose',
      md: 'Maya’s edit succeeded, but the follower answering her reload had not applied it yet. [[Read-your-writes consistency|read-your-writes]] promises that after you change something, your own reads show the change, even if other users see it a little later. Three fixes, from simplest to most precise:\n\n1. **Read what you can edit from the leader.** Your own profile comes from the leader, everyone else’s from followers. It is simple, but every owner’s view of their profile lands on the leader.\n2. **Read from the leader for a while after a change.** For a minute after Maya changes her profile, her reads of it go to the leader; by then the followers have caught up. Keep the time of her last change on the server, so her laptop follows the rule too, not just her phone.\n3. **Wait for the follower to catch up.** Every change has a [[log position|log-position]]. The app remembers the position of Maya’s last write, and a follower may answer her only once it has applied that position; otherwise the read waits briefly or goes to the leader.',
    },
    { kind: 'heading', text: 'Time running backwards' },
    {
      kind: 'prose',
      md: 'The second problem is subtler. Each follower moves forward at its own pace, so two followers can be at different points. When one refresh lands on a follower that is further ahead and the next on one that is further behind, data appears and then disappears.',
    },
    {
      kind: 'diagram',
      title: 'A comment that appears, then vanishes',
      caption: 'Two followers at different points, then the fix. Step through it.',
      spec: vanishing,
    },
    {
      kind: 'prose',
      md: '[[Monotonic reads|monotonic-reads]] promise that this never happens: once you have seen a value, later reads never show an older one. They do not promise fresh data, only that time never runs backwards for you.\n\nThe usual fix is [[sticky reads|sticky-reads]]: pin each user to one follower, for example by running the user name through a [[hash function|hash-function]]. If that follower fails, the user moves to another that may be further behind, so some systems also remember the highest log position each user has seen and switch only to a follower that has reached it.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Lag hides in more places than followers: caches and search indexes fed from the database fall behind too, and the same problems and fixes apply. Ordering across different pieces of data, such as a reply that must never appear before the comment it answers, is [[causal consistency|causal-consistency]], covered in [Consistency models](lesson:consistency-models).',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'replication',
      preset: { lagMs: 1000, mode: 'async', readFromLeader: false, sticky: false, failLeader: false },
      intro:
        'This run starts where Maya’s evening went wrong: about a second of lag, reads spread across both followers, and no fixes. Find the stale reload and the vanishing comment, then turn on one fix at a time and see which problem each one solves.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to hide replication lag from users.',
    rows: [
      {
        option: 'Read from the leader after a change',
        goodAt: 'Simple, and the person who made the change always sees it.',
        badAt: 'Adds reads to the leader, and the window must outlast the worst lag.',
        pickWhen: 'Users mostly read back their own recent edits, such as profiles and settings.',
      },
      {
        option: 'Wait for a log position',
        goodAt: 'Precise: reads stay on followers unless one is really behind.',
        badAt: 'Every read must carry a position, and some reads wait.',
        pickWhen: 'There are too many reads to send to the leader.',
      },
      {
        option: 'Sticky reads',
        goodAt: 'Time never runs backwards for a user, with no extra load on the leader.',
        badAt: 'Your own writes show up no sooner, and the guarantee breaks when your follower fails.',
        pickWhen: 'Users refresh the same feeds and threads again and again.',
      },
      {
        option: 'Every read from the leader',
        goodAt: 'Never stale.',
        badAt: 'Gives up read scaling entirely.',
        pickWhen: 'The data is small and must always be current, such as account balances.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon RDS read replicas',
    body: 'Amazon Relational Database Service (RDS), the managed database service of Amazon Web Services (AWS), builds read replicas on each database engine’s own replication. Its documentation says updates to the primary are copied to read replicas asynchronously, and suggests routing read queries to replicas to take load off the primary. It also notes that replicas can keep serving reads while the primary is unavailable, but that their data might then be stale.\n\nThe same page describes a separate standby replica for high availability. Replication to that standby is synchronous, and unlike a read replica, it cannot serve reads: asynchronous copies to scale reads, a synchronous one so that data is not lost.',
    sourceUrl: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
    sourceLabel: 'Amazon Web Services, “Working with DB instance read replicas,” Amazon RDS User Guide',
  },
  interview: {
    whenToMention:
      'As soon as you send reads to replicas: name the lag, and say which reads can live with it. If the interviewer describes a user who edits a post and does not see the change, that is your cue for read-your-writes.',
    sayItLikeThis: [
      'Profile reads go to followers, which can lag a second or two at peak, so a user’s own profile is read from the leader for a minute after they change it.',
      'To keep a refreshing feed from jumping backwards, I’d pin each user’s reads to one follower by hashing their user name.',
      'We alert when replica lag passes a few seconds and take a lagging replica out of the read pool, so how stale a read can be stays bounded.',
    ],
    followUps: [
      {
        q: 'How do you give read-your-writes across a user’s phone and laptop?',
        a: 'Keep the time or log position of the user’s last write on the server, keyed by user, not in one device’s memory. Every device’s reads then follow the same rule: the leader, or a follower that has caught up.',
      },
      {
        q: 'What happens to sticky reads when the pinned follower dies?',
        a: 'The user moves to another follower, which may be further behind, so they can briefly see older data. Remembering the highest log position each user has seen, and moving them only to a follower that has reached it, closes that gap.',
      },
      {
        q: 'How would you know that lag is getting worse?',
        a: 'Databases report how far each follower is behind, so graph it, alert past a threshold of a few seconds, and stop sending reads to a follower that falls too far behind. Spikes usually come from bursts of writes, big batch jobs or heavy queries on the follower.',
      },
    ],
    redFlags: [
      'Assuming replicas are always up to date, or that lag is a constant.',
      'Fixing stale reads by sending every read to the leader, which throws away read scaling.',
      'Remembering the last write only on the device, so the laptop still shows old data.',
    ],
  },
  mistakes: [
    '**Testing only on an idle system.** Lag is near zero in development and shows up at the evening peak, so the bug appears only in production.',
    '**A window shorter than the lag.** Reading from the leader for 5 seconds after a change does nothing when followers fall 10 seconds behind.',
    '**Keeping the last write on the device.** The phone reads from the leader, but the laptop knows nothing of the change and shows old data.',
    '**Treating sticky reads as fresh reads.** Pinning stops time running backwards, but a pinned user can still miss their own new write.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya refreshes a photo and sees a new comment. She refreshes again, and the comment is gone. Which guarantee broke?',
      options: [
        {
          text: 'Monotonic reads',
          correct: true,
          why: 'She saw a newer state and then an older one, because her two reads hit followers at different points.',
        },
        { text: 'Read-your-writes', correct: false, why: 'That guarantee covers your own changes, and the comment was someone else’s.' },
        {
          text: 'Durability',
          correct: false,
          why: 'Nothing was lost: the comment is safe on the leader and reappears once the lagging follower catches up.',
        },
        {
          text: 'None: the database is broken',
          correct: false,
          why: 'Followers are allowed to lag. The problem is how the reads were routed, and routing can fix it.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these give Maya read-your-writes on her own profile?',
      options: [
        {
          text: 'Read her profile from the leader for a minute after she changes it',
          correct: true,
          why: 'The leader has every confirmed write, and after a minute the followers have caught up too.',
        },
        {
          text: 'Read only from a follower that has applied her last write’s log position',
          correct: true,
          why: 'That follower has every change up to and including her write.',
        },
        {
          text: 'Pin all her reads to one follower',
          correct: false,
          why: 'Her pinned follower can still be behind her own write. Pinning stops backwards jumps, not staleness.',
        },
        { text: 'Add a third follower', correct: false, why: 'More followers add read capacity, but each one still lags.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Followers run about 2 seconds behind. Maya saves a caption, and her app reloads her profile 0.3 seconds after the save, then every half second. If every reload goes to a follower, how many show the old caption?',
      answer: 4,
      unit: 'reloads',
      tolerance: 1.1,
      solution: [
        'The followers apply the change about 2 seconds after the save.',
        'Reloads happen at 0.3, 0.8, 1.3 and 1.8 seconds, all before 2 seconds, so all four are stale.',
        'The reload at 2.3 seconds shows the new caption, so 4 reloads were stale.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put Maya’s stale read in order.',
      items: [
        'Maya saves her caption on the leader',
        'The leader confirms right away',
        'Her app reloads the profile from a follower',
        'The follower answers with the old caption',
        'The follower applies the change',
      ],
      why: 'With asynchronous replication the confirmation comes before the followers have the change, which leaves a window in which reads from a follower are stale.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram pins each user’s reads to one follower. Does that fix Maya’s missing caption edit?',
      options: [
        {
          text: 'No: her follower can still be behind her own write',
          correct: true,
          why: 'Pinning gives monotonic reads, but the pinned follower may not have applied her edit yet.',
        },
        { text: 'Yes: one follower always has the latest data', correct: false, why: 'A single follower still trails the leader by its replication lag.' },
        { text: 'Yes: pinning sends her reads to the leader', correct: false, why: 'Pinning picks a follower, not the leader.' },
        {
          text: 'No: sticky reads only work with synchronous replication',
          correct: false,
          why: 'Sticky reads work with any replication. They just do not make reads fresh.',
        },
      ],
    },
  ],
  takeaways: [
    'Followers trail the leader by the replication lag, usually milliseconds but seconds at peaks, so a read from a follower can be stale.',
    'Read-your-writes comes from reading recently changed data from the leader, or from a follower that has reached your last write’s log position.',
    'Monotonic reads come from sticky reads: each user reads from one follower, so what they see never moves backwards.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Lag-aware routing.** Many setups check each follower’s lag before sending it reads and skip any follower more than a few seconds behind. That caps how stale a read can be, at the price of more load on the followers that remain.',
    },
    {
      kind: 'prose',
      md: '**Bounded staleness.** Some databases let a read say how stale it may be, for example at most 5 seconds. The database then picks a copy that is fresh enough, or waits for one.',
    },
    {
      kind: 'prose',
      md: '**Caches lag too.** A cache in front of a follower can serve data older than the follower itself. Read-your-writes then has to cover the cache as well, for example by updating or skipping it right after a user’s own write.',
    },
  ],
  flashcards: [
    { front: 'What is replication lag?', back: 'How far a follower trails the leader: the time, or the number of changes, it has not applied yet.' },
    { front: 'What does read-your-writes guarantee?', back: 'After you change something, your own reads always show the change, even if other users see it later.' },
    { front: 'What do monotonic reads guarantee?', back: 'Once you have seen a value, later reads never show an older one: time never runs backwards for you.' },
    {
      front: 'How do you give read-your-writes with read replicas?',
      back: 'Read recently changed data from the leader for a while, or only from a follower that has reached the log position of your last write.',
    },
    {
      front: 'How do sticky reads work?',
      back: 'Each user’s reads go to one follower, picked by hashing the user. It applies changes in order, so the user never sees data go backwards.',
    },
    { front: 'What makes replication lag grow?', back: 'Bursts of writes, heavy queries or backups on a follower, and busy networks: milliseconds when healthy, seconds or more at peaks.' },
  ],
  related: ['replication', 'consistency-models', 'cap-pacelc', 'caching', 'load-balancers', 'time-and-ordering'],
  glossaryTerms: [
    'follower',
    'leader',
    'replication-lag',
    'eventual-consistency',
    'stale-data',
    'asynchronous-replication',
    'read-your-writes',
    'log-position',
    'load-balancer',
    'monotonic-reads',
    'sticky-reads',
    'hash-function',
    'causal-consistency',
  ],
};

export default lesson;
