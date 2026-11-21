import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: a Singapore clock 300 ms fast puts a reply above the comment it answers. */
const fastClock: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'sg', type: 'service', label: 'App server', sublabel: 'Singapore', x: 1, y: 0 },
    { id: 'sgdb', type: 'sqlDb', label: 'Comments', sublabel: 'Singapore copy', x: 2, y: 0 },
    { id: 'friend', type: 'client', label: 'Her friend', sublabel: 'Oregon', x: 0, y: 1 },
    { id: 'or', type: 'service', label: 'App server', sublabel: 'Oregon', x: 1, y: 1 },
    { id: 'ordb', type: 'sqlDb', label: 'Comments', sublabel: 'Oregon copy', x: 2, y: 1 },
  ],
  edges: [
    { id: 'maya-sg', from: 'maya', to: 'sg', kind: 'sync' },
    { id: 'sg-sgdb', from: 'sg', to: 'sgdb', kind: 'sync' },
    { id: 'sgdb-ordb', from: 'sgdb', to: 'ordb', kind: 'replication' },
    { id: 'friend-or', from: 'friend', to: 'or', kind: 'sync' },
    { id: 'or-ordb', from: 'or', to: 'ordb', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya comments at 12:00:00.000, true time. The Singapore **app server**’s clock runs 300 ms fast, so it stamps the comment 12:00:00.300.',
      flow: ['maya-sg', 'sg-sgdb'],
      notes: [{ target: 'sg', text: 'clock +300 ms', tone: 'alert' }],
    },
    {
      caption: 'The comment is copied to Oregon, so both regions can show the whole thread.',
      flow: ['sgdb-ordb'],
    },
    {
      caption: 'Her friend replies 100 ms later. Oregon’s clock is right, so the reply is stamped 12:00:00.100.',
      flow: ['friend-or', 'or-ordb'],
      notes: [{ target: 'or', text: 'clock on time' }],
    },
    {
      caption: 'The reply is copied back, and both regions sort by timestamp: .100 comes before .300, so the answer is listed above the question.',
      flow: ['<sgdb-ordb'],
      focus: ['sgdb', 'ordb'],
      notes: [
        { target: 'sgdb', text: 'reply first', tone: 'alert' },
        { target: 'ordb', text: 'reply first', tone: 'alert' },
      ],
    },
    {
      caption:
        'The fix is to order by cause, not by clock. The comment carries a counter, 42; Oregon’s counter jumps past 42 when the comment arrives, so the reply gets 43 and sorts after it.',
      focus: ['sgdb', 'ordb'],
      notes: [
        { target: 'sgdb', text: 'comment 42', tone: 'signal' },
        { target: 'ordb', text: 'reply 43', tone: 'signal' },
      ],
    },
  ],
};

/** A Lamport clock carried along with replication. */
const counters: SequenceSpec = {
  actors: [
    { id: 'maya', type: 'client', label: 'Maya' },
    { id: 'sg', type: 'service', label: 'Singapore' },
    { id: 'or', type: 'service', label: 'Oregon' },
    { id: 'friend', type: 'client', label: 'Her friend' },
  ],
  messages: [
    { from: 'maya', to: 'sg', label: 'comment', kind: 'sync', caption: 'Maya comments. Singapore’s counter goes from 41 to 42, and the comment carries 42.' },
    { from: 'sg', to: 'or', label: 'comment, 42', kind: 'async', caption: 'Replication carries the counter. Oregon’s counter was 17, so it jumps to 42.' },
    { from: 'or', to: 'friend', label: 'new comment', kind: 'async', caption: 'Her friend sees the comment.' },
    { from: 'friend', to: 'or', label: 'reply', kind: 'sync', caption: 'The reply gets 43, more than anything Oregon has seen, so it sorts after the comment.' },
    { from: 'or', to: 'sg', label: 'reply, 43', kind: 'async', caption: 'Singapore receives the reply and moves its counter to 43. Both regions list 42, then 43.' },
  ],
};

const lesson: Lesson = {
  id: 'time-and-ordering',
  module: 'm5',
  order: 6,
  title: 'Time and ordering',
  idea: 'Clocks on different servers never quite agree, so timestamps cannot reliably order events across machines; logical clocks order them by cause and effect instead.',
  minutes: 15,
  prerequisites: ['why-distributed-is-hard', 'consistency-models'],
  outcomes: [
    'Explain why server clocks disagree, and how sorting events from different machines by timestamp can put an effect before its cause.',
    'Use a logical clock to order related events, and a monotonic clock to measure durations.',
    'Describe how version vectors detect two edits made at the same time.',
  ],
  analogy: {
    title: 'Two friends whose watches disagree',
    body: 'You and a friend keep diaries of the same weekend. Your watch runs two minutes fast and theirs three minutes slow, though neither of you knows it. You text them about dinner at 6:00 by your watch, and they say yes a minute later, at 5:56 by theirs.\n\nMerge the diaries by time, and the answer lands four minutes before the question. A better watch only shrinks the error. What fixes the order is noting what you had already heard: “replying to the 6:00 text” can never sort before that text.',
  },
  whyItMatters:
    'Snapgram now runs in two [[regions|region]], Oregon and Singapore. Each saves the comments written near it and copies them to the other, a setup called [[multi-leader replication|multi-leader-replication]]. Every comment is stamped with the time on the server that saved it, and threads are listed in timestamp order.\n\nOne afternoon a support ticket arrives with a screenshot: under a friend’s beach photo, the friend’s reply sits above the comment from Maya that it answers. Nothing was lost and every database is healthy. The culprit is one Singapore server whose clock runs 300 ms fast.',
  body: [
    { kind: 'heading', text: 'Every clock is a little wrong' },
    {
      kind: 'prose',
      md: 'A server keeps time with a quartz crystal that vibrates at a set rate, but no two crystals are quite alike, and heat changes them. So every clock gains or loses a little, its [[clock drift|clock-drift]], measured in parts per million (ppm). Tens of ppm is common (ballpark), and 50 ppm adds up to about 4 seconds a day.',
    },
    {
      kind: 'prose',
      md: 'To stop that piling up, servers regularly fetch the correct time with the [[Network Time Protocol|ntp]] (NTP), which gets a clock within about a millisecond on a local network and tens of milliseconds across the internet (ballpark). Between corrections, the drift starts again. The difference between two clocks at a given moment is their [[clock skew|clock-skew]]: it grows between corrections and snaps back at each one.',
    },
    {
      kind: 'prose',
      md: 'A correction can even move a clock backwards, and a [[leap second|leap-second]] can make it repeat a second. That is why a machine has two clocks. [[Wall-clock time|wall-clock-time]] gives the date and time of day and can jump; a [[monotonic clock|monotonic-clock]] only counts forward, and it is the one to use for measuring durations, such as a [[timeout|timeout]].',
    },
    { kind: 'heading', text: 'Why timestamps lie' },
    {
      kind: 'prose',
      md: 'Ordering by timestamp works when events are far apart. But when two events in different regions are closer together than the skew between their clocks, their timestamps can come out in either order, and an effect can sort before its cause.',
    },
    {
      kind: 'diagram',
      title: 'How a fast clock reorders a thread',
      caption: 'Two regions, one clock 300 ms fast. Step through a comment, a quick reply and the fix.',
      spec: fastClock,
    },
    {
      kind: 'prose',
      md: 'A person takes longer than 100 ms to read and answer, so a 300 ms error flips only the fastest replies. But a spam filter or a bot reacts within milliseconds, and when time sync quietly stops, clocks drift apart by whole seconds, enough to flip ordinary replies.',
    },
    { kind: 'heading', text: 'Logical clocks: count, don’t measure' },
    {
      kind: 'prose',
      md: 'A thread does not need the time; it needs cause and effect in the right order. In 1978, Leslie Lamport showed how to get that with a [[logical clock|logical-clock]], which is just a counter. Each server adds one to its counter for every event and sends the counter with every message, and when a message arrives, it moves its own counter up to at least the number the message carries.',
    },
    {
      kind: 'sequence',
      title: 'Ordering by counter',
      caption: 'The counter travels with the comment, so the reply gets a bigger number.',
      spec: counters,
    },
    {
      kind: 'prose',
      md: 'If one event could have influenced another, a relation called [[happens-before|happens-before]], the first always gets the smaller number. The reverse does not hold: events that never heard of each other are [[concurrent|concurrent-events]], and their counters order them arbitrarily, with ties broken by server name. For a thread that is enough, because it delivers the [[causal consistency|causal-consistency]] promise: causes before effects.',
    },
    { kind: 'heading', text: 'Version vectors: catching edits made at the same time' },
    {
      kind: 'prose',
      md: 'Sometimes you need to know that two events were concurrent, such as Maya in Singapore and her friend in Oregon renaming their shared album at the same moment. A [[version vector|version-vector]] keeps one counter per region with each copy of a value, and a region adds one to its own counter whenever it saves a change. If one version is ahead or equal in every slot, it includes the other; if each is ahead somewhere, neither saw the other. The system then keeps both as a [[write conflict|write-conflict]] to settle, instead of letting [[last write wins|last-write-wins]] silently drop one.',
    },
    {
      kind: 'table',
      columns: ['Album title', 'Singapore', 'Oregon', 'Meaning'],
      rows: [
        ['Before the edits', '3', '5', 'Both regions have it.'],
        ['Maya’s rename', '4', '5', 'Singapore made a change.'],
        ['Her friend’s rename', '3', '6', 'Oregon made a change.'],
        ['The renames compared', '4 vs. 3', '5 vs. 6', 'Each ahead once: concurrent.'],
      ],
      caption: 'Neither rename is ahead in both slots, so neither may overwrite the other.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Left out: how NTP estimates network delay, the hybrid clocks some databases use, and the full rules for merging version vectors. Real logical clocks also count each arriving message as an event; the ordering promise is the same.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'drifting-clocks',
      title: 'Two drifting clocks',
      caption:
        'Set each clock’s drift and how often both are synced, then move through two hours. Syncing every 15 minutes keeps the skew just under the 100 ms between Maya’s comment and the reply; sync every hour and watch the reply jump above the comment, then sort by logical clock.',
      props: { oregonPpm: -20, singaporePpm: 80, syncMin: 15, atMin: 44, gapMs: 100 },
    },
  ],
  tradeoffs: {
    caption: 'Ways to order events across machines.',
    rows: [
      {
        option: 'Wall-clock timestamps',
        goodAt: 'Free, readable, and right for events seconds apart.',
        badAt: 'Events closer together than the clock skew can sort either way, and clocks can jump backwards.',
        pickWhen: 'Showing times to people, expiring caches, or ordering events far apart.',
      },
      {
        option: 'Logical clock',
        goodAt: 'Always puts a cause before its effect, with one small counter.',
        badAt: 'Says nothing about real time, and orders concurrent events arbitrarily without flagging them.',
        pickWhen: 'Related events must appear in the same order everywhere, like replies after comments.',
      },
      {
        option: 'Version vectors',
        goodAt: 'Detect concurrent edits, so no update is silently lost.',
        badAt: 'One counter per replica, and the app must settle each conflict.',
        pickWhen: 'Several replicas accept writes to the same data, as in multi-leader replication.',
      },
    ],
  },
  realWorld: {
    title: 'Cloudflare and the leap second of 2017',
    body: 'At midnight Coordinated Universal Time (UTC) on January 1, 2017, a leap second was added to the world’s clocks, and some of Cloudflare’s Domain Name System (DNS) servers started failing. Their software timed upstream servers by subtracting one clock reading from another, assuming time cannot go backwards. When the clock stepped back for the leap second, a duration came out negative, and passing it to Go’s `rand.Int63n`, which panics on negative numbers, made those lookups fail.\n\nAt peak, about 0.2% of DNS queries were affected, on a small number of machines. Cloudflare patched the code to keep negative values out, and its stated lesson is the one here: never assume the difference between two clock readings is positive.',
    sourceUrl: 'https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/',
    sourceLabel: 'Cloudflare blog, “How and why the leap second affected Cloudflare DNS,” 2017',
  },
  interview: {
    whenToMention:
      'Whenever your design orders events from more than one machine: a comment thread, a feed sorted by time, or replicas that keep the latest write. Say that server clocks disagree, then pick an ordering that does not depend on them.',
    sayItLikeThis: [
      'Server clocks drift and get corrected, so I won’t order events from different servers by timestamp; each reply records the comment it answers, and a logical counter orders the rest.',
      'Last write wins on wall-clock time can silently drop an edit, so for data people edit I’d use version vectors and surface conflicts.',
    ],
    followUps: [
      {
        q: 'Why not just keep every clock in sync with NTP?',
        a: 'NTP gets clocks within about a millisecond on a local network and tens of milliseconds across the internet (ballpark), and it can step a clock backwards. Events closer together than that can still sort wrongly, so correctness must not depend on it.',
      },
      {
        q: 'How is a Lamport clock different from a version vector?',
        a: 'A Lamport clock is one counter that gives a cause a smaller number than its effect, but it cannot tell you whether two events were concurrent. A version vector keeps a counter per replica, so comparing two versions shows whether one includes the other or they conflict.',
      },
      {
        q: 'What if you truly need real-time order across regions?',
        a: 'Use clocks with a known error bound and wait the error out, as Google’s Spanner does with TrueTime: it delays making a commit visible until its timestamp is certainly in the past. That needs special hardware and adds a short wait to every commit.',
      },
    ],
    redFlags: [
      'Sorting events from different servers by timestamp and treating the order as exact.',
      'Using last write wins on data people edit, without noticing it throws away one of two concurrent edits.',
      'Measuring a duration by subtracting two wall-clock readings.',
    ],
  },
  mistakes: [
    '**Trusting timestamp order across machines.** Clocks disagree by milliseconds, or by seconds when sync breaks, so close events can sort in any order.',
    '**Measuring durations with the wall clock.** A correction or a leap second can move it backwards; use the monotonic clock.',
    '**Last write wins on data people care about.** The “later” write may only have the faster clock, and the other edit vanishes.',
    '**Reading real time into a logical clock.** Counter 43 means “after 42 in cause and effect”, not anything about seconds.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'Snapgram’s Singapore server clock runs 300 ms fast and Oregon’s is exact. Maya comments in Singapore, and a reply is written in Oregon 100 ms later. Sorted by timestamp, what happens?',
      options: [
        {
          text: 'The reply sorts first, by about 200 ms',
          correct: true,
          why: 'The comment is stamped 300 ms late and the reply on time, so the reply looks 200 ms older than the comment.',
        },
        {
          text: 'They sort correctly, 100 ms apart',
          correct: false,
          why: 'That needs both clocks to agree; a 300 ms error is bigger than the 100 ms gap.',
        },
        {
          text: 'They sort correctly, 400 ms apart',
          correct: false,
          why: 'A fast clock makes the comment look later, not earlier, which pushes it below the reply.',
        },
        {
          text: 'The database rejects the reply for having an older timestamp',
          correct: false,
          why: 'Nothing checks one region’s timestamps against another’s; the wrong order is accepted silently.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A server clock drifts 50 parts per million, and its time sync has silently stopped. Roughly how far off is it after one day?',
      answer: 4.32,
      unit: 'seconds',
      tolerance: 1.1,
      solution: ['One day is 86,400 seconds.', '50 parts per million is 50 ÷ 1,000,000 = 0.00005.', '86,400 × 0.00005 = 4.32 seconds.'],
    },
    {
      kind: 'single',
      prompt: 'Which clock should you use to measure how long a request took?',
      options: [
        { text: 'The monotonic clock', correct: true, why: 'It only moves forward, so the difference between two readings is never negative.' },
        { text: 'The wall clock, kept in sync by NTP', correct: false, why: 'A correction or a leap second can move it backwards between the two readings.' },
        { text: 'A logical clock', correct: false, why: 'It counts events, not seconds, so it cannot measure a duration.' },
        { text: 'The clock on the user’s phone', correct: false, why: 'Phones can be off by seconds or more, and users can change them.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about a logical (Lamport) clock are true?',
      options: [
        { text: 'If event A caused event B, A’s counter is smaller than B’s', correct: true, why: 'The counter travels with messages, and every new event goes higher than anything already seen.' },
        { text: 'If A’s counter is smaller than B’s, then A caused B', correct: false, why: 'Unrelated events also get different numbers, so a smaller number proves nothing about cause.' },
        { text: 'It tells you how many milliseconds passed between two events', correct: false, why: 'It counts events and messages, not time.' },
        { text: 'It works even when the servers’ wall clocks disagree', correct: true, why: 'It never reads the wall clock at all.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'One copy of an album title has the version vector Singapore 4, Oregon 5; another has Singapore 3, Oregon 6. What should the system conclude?',
      options: [
        { text: 'The edits were concurrent, so keep both and settle the conflict', correct: true, why: 'Each version is ahead in one slot, so neither had seen the other.' },
        { text: 'The second is newer because 6 is the biggest number', correct: false, why: 'A version includes another only if it is ahead or equal in every slot.' },
        { text: 'Keep whichever has the later wall-clock timestamp', correct: false, why: 'That is last write wins, which silently throws one of the edits away.' },
        { text: 'The two copies hold the same value', correct: false, why: 'Different counters mean different histories, so the values may differ.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps in order when Maya’s comment and the reply are ordered by a logical clock.',
      items: [
        'Singapore adds one to its counter and the comment carries 42',
        'The comment, with 42, reaches Oregon',
        'Oregon moves its counter from 17 up to 42',
        'Her friend’s reply gets 43',
        'Every region lists the reply after the comment',
      ],
      why: 'The counter travels with the message, so anything Oregon writes after seeing the comment gets a bigger number than the comment.',
    },
  ],
  takeaways: [
    'Every server’s clock drifts and gets corrected, sometimes backwards, so timestamps from different machines cannot order events that happen close together.',
    'A logical clock orders events by cause and effect: counters travel with messages, so a reply always gets a bigger number than the comment it answers.',
    'Version vectors detect concurrent edits, so you can settle the conflict instead of letting last write wins silently drop one.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**TrueTime.** Google’s [Spanner paper](https://www.usenix.org/conference/osdi12/technical-sessions/presentation/corbett) describes a time service that exposes clock uncertainty: it answers with an interval rather than a single time, kept narrow by time servers with Global Positioning System (GPS) receivers and atomic clocks. Spanner waits until a commit’s timestamp is certainly in the past before anyone can see the commit, so timestamp order matches real order.',
    },
    {
      kind: 'prose',
      md: '**Hybrid logical clocks.** Some databases combine both ideas in one value: a wall-clock time that never runs backwards, plus a small counter for events in the same millisecond. It stays close to real time but still orders causes before effects.',
    },
    {
      kind: 'prose',
      md: '**Leap smearing.** Instead of repeating a second, some time providers spread a leap second over many hours by running their clocks very slightly slow. Time never jumps, but a server using smeared time and one using standard time can disagree by a large fraction of a second during the smear.',
    },
  ],
  flashcards: [
    {
      front: 'Why can’t you sort events from different servers by timestamp?',
      back: 'Each server’s clock drifts and is corrected on its own schedule, so events closer together than the clock skew can come out in the wrong order.',
    },
    { front: 'What is clock drift, in numbers?', back: 'How fast a clock gains or loses time, in parts per million: 50 ppm is about 4 seconds a day.' },
    {
      front: 'Monotonic clock or wall clock: which measures durations?',
      back: 'The monotonic clock, because it only moves forward; the wall clock can jump backwards when it is corrected.',
    },
    {
      front: 'How does a Lamport clock work?',
      back: 'Each server keeps a counter, adds one for each event, sends it with every message, and jumps to at least any counter it receives.',
    },
    { front: 'What can a Lamport clock not tell you?', back: 'Whether two events were concurrent, and how much real time passed between them.' },
    { front: 'What does a version vector detect?', back: 'Whether one version already includes another, or whether two edits were made concurrently and conflict.' },
    {
      front: 'What went wrong at Cloudflare on January 1, 2017?',
      back: 'A leap second moved the clock backwards, a measured duration came out negative, and code that assumed time only moves forward failed.',
    },
  ],
  related: ['why-distributed-is-hard', 'consistency-models', 'replication-lag', 'quorums', 'consensus-leader-election', 'distributed-locks', 'unique-ids'],
  glossaryTerms: [
    'region',
    'multi-leader-replication',
    'clock-drift',
    'ntp',
    'clock-skew',
    'leap-second',
    'wall-clock-time',
    'monotonic-clock',
    'timeout',
    'logical-clock',
    'happens-before',
    'concurrent-events',
    'causal-consistency',
    'version-vector',
    'write-conflict',
    'last-write-wins',
  ],
};

export default lesson;
