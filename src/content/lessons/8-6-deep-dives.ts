import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The signature diagram: the feed cache dies, traced through the six beats of a failure answer. */
const cacheDies: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 0 },
    { id: 'cache', type: 'cache', label: 'Feed cache', sublabel: 'first page per reader', x: 2, y: 0 },
    { id: 'feed', type: 'nosqlDb', label: 'Feed store', sublabel: 'source of truth', x: 1, y: 1 },
  ],
  edges: [
    { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync', label: 'feed request' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync', label: 'first page' },
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync', label: 'on a miss' },
  ],
  steps: [
    {
      caption: 'Normally the **feed cache** answers most feed reads, say nine in ten, in about a millisecond (ballpark). Only misses reach the **feed store**.',
      flow: ['phones-app', { edge: 'app-cache', tag: 'hit' }, '<app-cache', '<phones-app'],
      notes: [{ target: 'feed', text: 'misses only', tone: 'plain' }],
    },
    {
      caption:
        '**What breaks.** The cache dies, and every feed read now misses. If the cache answered nine reads in ten, the feed store suddenly gets ten times its usual load: a [[cache stampede|cache-stampede]].',
      fail: ['cache'],
      flow: ['phones-app', 'app-feed'],
      notes: [{ target: 'feed', text: '10× usual reads', tone: 'alert' }],
    },
    {
      caption:
        '**What users see, and how you notice.** Feeds slow down, then fail, as the store falls behind. Alerts on errors and latency fire within a minute or two (ballpark), and [[health checks|health-check]] mark the cache nodes as down.',
      fail: ['cache'],
      flow: ['phones-app', 'app-feed'],
      notes: [{ target: 'phones', text: 'slow, then errors', tone: 'alert' }],
    },
    {
      caption:
        '**What takes over.** The app servers protect the store: [[request coalescing|request-coalescing]] sends one read per missing feed, and [[load shedding|load-shedding]] turns away what the store cannot take. Most people still get a feed, perhaps a shorter one: [[graceful degradation|graceful-degradation]].',
      fail: ['cache'],
      flow: ['phones-app', 'app-feed', '<app-feed', '<phones-app'],
      notes: [{ target: 'app', text: '1 read per feed', tone: 'signal' }],
    },
    {
      caption:
        '**Recovery and cost.** Nothing was lost, because the feed store is the [[source of truth|source-of-truth]]. The cache returns as a [[cold cache|cold-cache]] and is refilled gradually, a step called [[cache warming|cache-warming]]. The price of all this is spare capacity and a tested fallback.',
      flow: ['app-cache', '<app-cache'],
      notes: [{ target: 'cache', text: 'warming up', tone: 'plain' }],
    },
  ],
  description:
    'Phones send feed requests to the app servers, which read the first page from a feed cache and go to the feed store only on a miss. When the cache dies, every read goes to the feed store; the app servers coalesce and shed load until the cache returns and is warmed up again.',
};

/** The shape of a deep dive that Maya leads, from plan to failure probe. */
const lead: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'Plan', from: 1, to: 2 },
    { label: 'The feed', from: 3, to: 5 },
    { label: 'A failure', from: 6, to: 7 },
  ],
  messages: [
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Feed first, then the cache?',
      kind: 'sync',
      caption: 'Maya proposes two topics and their order, with about seven minutes each, before anyone asks.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Sounds good',
      kind: 'reply',
      caption: 'The interviewer agrees. A redirect would be just as useful: it tells her what they want to grade.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Problem: celebrity posts',
      kind: 'sync',
      caption: 'She states the problem in one sentence, with the number that makes it hard: one post from an account with 30 million followers means 30 million feed writes.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Push, pull or hybrid: hybrid',
      kind: 'sync',
      caption: 'Two or three options with what each costs, then her pick for these numbers and what would change her mind.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Go deeper, or the cache?',
      kind: 'sync',
      caption: 'A check-in keeps the clock in view and gives the interviewer an easy way to steer.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'The feed cache dies. Then?',
      kind: 'sync',
      caption: 'The interviewer probes a failure. It is an invitation to show depth, not a trap.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Impact, fix, cost',
      kind: 'reply',
      caption: 'She answers with the six beats below, traced through her own diagram.',
    },
  ],
};

const lesson: Lesson = {
  id: 'deep-dives',
  module: 'm8',
  order: 6,
  title: 'Driving the deep dives',
  idea: 'In the deep dives you choose the two or three hardest parts of your design, propose them before you are asked, and answer each failure question by tracing what breaks, what users see, what takes over and what it costs.',
  minutes: 15,
  prerequisites: ['high-level-design', 'why-distributed-is-hard'],
  outcomes: [
    'Pick the two or three hardest parts of a design, using the requirements and the numbers to justify each choice.',
    'Lead the deep dives: announce a plan, work through each topic and check in, instead of waiting for questions.',
    'Answer failure questions with a routine: what breaks, what users see, how you notice, what takes over, how it recovers and what it costs.',
  ],
  analogy: {
    title: 'A home inspector with one hour',
    body: 'A home inspector has an hour, not a week. A good one does not test every light switch: she tells the buyers her plan, then heads for the roof, the foundation and the wiring, because those are the parts that are expensive or dangerous when they fail.\n\nWhen a buyer asks what happens if the boiler dies in January, she does not shrug. She says what would stop working, how they would notice, what the backup is and what a fix would cost. Choose the risky parts, say the plan, and answer failures with specifics: that is a deep dive.',
  },
  whyItMatters:
    'In a later practice round, Maya reaches minute 25 with a clean design on the board. Then she stops and waits for her practice interviewer to pick a topic. He picks one she has not prepared: “The feed cache just died. What happens?”\n\nMaya says the app would “fall back to the database” and runs out of words. She never mentions the flood of requests about to hit the feed store, what users would see, or how the cache comes back. The next twenty minutes go to whatever her interviewer asks, and none of them go to the parts of Snapgram she knows best.',
  body: [
    { kind: 'heading', text: 'Pick the two or three hardest parts' },
    {
      kind: 'prose',
      md: 'The [[deep dives|deep-dive]] get the largest block of time, about 15 minutes of 45, which is room for two or three topics. Choose them yourself, before the interviewer has to. A part deserves a deep dive when this prompt’s requirements and numbers make it hard, not when it is hard in general.',
    },
    {
      kind: 'prose',
      md: 'Three questions find the candidates. Where does the estimate put the most load? What breaks first if traffic grows tenfold? Which requirement is the hardest to meet, such as a freshness or latency target?',
    },
    {
      kind: 'table',
      columns: ['Candidate', 'Why it is hard here', 'Deep dive?'],
      rows: [
        ['The home feed', 'The hottest read, and one celebrity post means millions of feed writes', 'Yes, first'],
        ['The feed cache', 'Most feed reads depend on it, so its failure is the biggest risk', 'Yes, second'],
        ['Photo delivery', 'Large files viewed worldwide, but a content delivery network (CDN) handles most of it', 'Briefly, if time allows'],
        ['Sign-up and login', 'Important, but a standard form and one table', 'No'],
        ['Search', 'Scoped out in the requirements', 'No'],
      ],
      caption: 'Pick by what this prompt makes hard, not by what matters in general.',
    },
    {
      kind: 'prose',
      md: 'For Snapgram, the feed is the obvious first pick: the [[celebrity problem|celebrity-problem]] makes it hard to write, and its volume makes it hard to read. Maya’s design keeps the first page of each active reader’s feed in a feed cache in front of the feed store, which makes that cache the natural second pick.',
    },
    { kind: 'heading', text: 'Lead instead of waiting' },
    {
      kind: 'prose',
      md: 'Leading starts with a plan said out loud: the topics, the order and roughly how long each gets, followed by a question about whether that suits the interviewer. Then work through each topic the same way: the problem in one sentence with its number, two or three options with their costs, your pick for these requirements, and a check-in before moving on.',
    },
    {
      kind: 'prose',
      md: 'Leading is not refusing questions. If the interviewer redirects you, follow them, because their question shows what they need to grade; answer it with the same routine, then offer to return to your plan. The goal is that the time is never idle while someone decides what comes next.',
    },
    {
      kind: 'sequence',
      title: 'A deep dive Maya leads',
      caption: 'The shape of a led deep dive. Notice who proposes each next step. Use Play, or the arrow keys.',
      spec: lead,
    },
    { kind: 'heading', text: 'Handling “What if X fails?”' },
    {
      kind: 'prose',
      md: 'Failure questions are the most common probe in a deep dive, and they have a routine answer. Every component has a few [[failure modes|failure-mode]]: it can crash, slow down, or return stale or wrong data. Take the one you are asked about and walk it through your own diagram in six beats.',
    },
    {
      kind: 'prose',
      md: '1. **What breaks.** Which requests stop working or go somewhere else.\n2. **What users see.** Slower pages, errors, missing features or stale data.\n3. **How you notice.** The alert or metric that fires, and how quickly.\n4. **What takes over.** A replica, a fallback or a reduced mode.\n5. **How it recovers.** What happens when the part comes back.\n6. **What it costs.** The money, complexity or freshness the protection takes.',
    },
    {
      kind: 'diagram',
      title: 'The feed cache dies',
      caption: 'The six beats, traced through Maya’s design. Use Play, or the arrow keys.',
      spec: cacheDies,
    },
    { kind: 'heading', text: 'A sample deep dive, annotated' },
    {
      kind: 'prose',
      md: 'Here is the same moment done well. The left column is the conversation, and the right explains each move.',
    },
    {
      kind: 'annotated',
      title: 'The feed cache dies: a strong answer',
      caption: 'Maya traces her own design, names the impact before the fix, and ends by handing control back.',
      lines: [
        {
          code: 'Interviewer: The feed cache just died. What happens?',
          note: '**The probe.** A failure question is a chance to show how the design behaves, not a trap.',
        },
        {
          code: 'Maya: Let me trace it on the board.',
          note: '**Thinking out loud.** Working from the diagram beats a fast guess, and the interviewer can follow along.',
        },
        { code: 'Maya: Every feed read misses and goes to the feed store.', note: '**What breaks**, in terms of this design rather than a textbook.' },
        {
          code: 'Maya: At 90% hits before, that’s ten times its usual load.',
          note: '**A number.** It shows how big the risk is, and why the store needs protecting at once.',
        },
        { code: 'Maya: Users would see slow feeds, then errors.', note: '**What users see**, stated before any fix.' },
        { code: 'Maya: Alerts on errors and latency would page us in minutes.', note: '**How you notice.** A failure nobody detects lasts much longer.' },
        {
          code: 'Maya: The app coalesces misses and sheds what the store can’t take.',
          note: '**What takes over.** One read per missing feed, and a deliberate limit instead of a collapse.',
        },
        { code: 'Maya: People may get a shorter feed, but they get one.', note: '**Graceful degradation.** A working product with less in it beats an error page.' },
        { code: 'Maya: Nothing is lost; the feed store is the source of truth.', note: '**Why it is survivable.** The cache only held copies.' },
        {
          code: 'Maya: When it’s back, we warm it up gradually.',
          note: '**Recovery.** Sending full traffic to an empty cache would turn every read into a miss and start a second stampede.',
        },
        { code: 'Maya: The cost is spare capacity and a tested fallback.', note: '**The price.** Every safeguard costs something, and naming it shows judgment.' },
        { code: 'Maya: Should I go deeper here, or move on?', note: '**The check-in.** She keeps the clock in view and lets the interviewer steer.' },
      ],
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real deep dives wander: the interviewer may interrupt, change topics or push on a detail you planned to skip. The six beats are a default for organizing an answer, not a script. This lesson also skips how each fix is built, such as request coalescing, which earlier lessons cover.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to protect the feed when its cache fails, as you might present them in the deep dive.',
    rows: [
      {
        option: 'Replicate the cache',
        goodAt: 'Losing one node loses nothing, because a copy answers at once.',
        badAt: 'Roughly doubles the memory cost, and copies can briefly disagree.',
        pickWhen: 'The store behind the cache cannot survive the full read load.',
      },
      {
        option: 'Coalesce misses and shed load',
        goodAt: 'Cheap, and it keeps a stampede from flattening the store.',
        badAt: 'Some users wait or see errors while the cache refills.',
        pickWhen: 'Short slowdowns are acceptable and the store can absorb some extra load.',
      },
      {
        option: 'Serve a degraded feed',
        goodAt: 'Users still see something, such as an older or shorter feed.',
        badAt: 'The fallback must be built and tested, and the feed is briefly stale.',
        pickWhen: 'Showing something beats showing nothing, as with a social feed.',
      },
    ],
  },
  realWorld: {
    title: 'How Facebook handles a failed cache server',
    body: 'In “Scaling Memcache at Facebook” (2013), Facebook engineers explain why a failed cache server is dangerous: reads it can no longer serve land on the backend services, and that extra load can cause further, [[cascading failures|cascading-failure]]. Their automated repair can take a few minutes, which is long enough for that to happen.\n\nSo they keep a small pool of spare cache machines, called Gutter, about 1% of the cache servers in a cluster. When a client gets no response from a cache server, it retries in Gutter, and on a miss there it reads the database and stores the result in Gutter, where entries expire quickly. The paper says this accepts slightly stale data to limit backend load, cuts client-visible failures by 99%, and deliberately avoids spreading a dead server’s keys over the remaining servers, because one hot key can be 20% of a server’s requests.',
    sourceUrl: 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala',
    sourceLabel: 'Nishtala et al., “Scaling Memcache at Facebook”, USENIX NSDI 2013',
  },
  interview: {
    whenToMention:
      'Right after the high-level design, around minute 20 to 25 of a 45-minute interview, with about 15 minutes to spend. Propose two or three topics and their order, then lead each one: the problem, the options, your pick and a check-in. If the interviewer has not raised a failure by the end, raise one yourself.',
    sayItLikeThis: [
      'The two parts I think are hardest here are the feed, because of celebrity posts, and the cache in front of it. I’d like about seven minutes on each. Does that work for you?',
      'If the feed cache dies, every read misses and lands on the feed store, about ten times its usual load. Users would see slow feeds and then errors, so I’d coalesce the misses, shed what the store can’t take and warm the cache back up gradually.',
      'No data is lost, because the feed store is the source of truth. The protection costs spare capacity and a tested fallback, which I think is worth it for our main screen.',
    ],
    followUps: [
      {
        q: 'What if the interviewer picks a topic you had not planned?',
        a: 'Follow them. Their topic is what they need to grade, so treat it as a hint, answer it with the same routine, and offer your planned topic afterward if time allows.',
      },
      {
        q: 'What if you do not know how a component fails?',
        a: 'Reason from the diagram out loud: what depends on it, what users would see without it, and what could take over. Say what you would check in the real system, and give your best answer rather than going silent.',
      },
      {
        q: 'How do you decide between going deeper and moving on?',
        a: 'Watch the clock and the interviewer. If they keep asking about a topic, go deeper; if they seem satisfied, sum it up in one sentence and move to the next part. Asking directly also works: “Should I go deeper here, or move on?”',
      },
    ],
    redFlags: [
      'Waiting for the interviewer to choose every topic.',
      'Spending the deep dives on easy parts, such as the sign-up form.',
      'Answering a failure question with “we add redundancy” and nothing about what users see or what it costs.',
      'Claiming the design has no [[single point of failure|single-point-of-failure]] without tracing what happens when each part dies.',
    ],
  },
  mistakes: [
    '**Waiting to be asked.** The interviewer then picks the topics, often ones you have not prepared, and you lose the chance to show your strongest material.',
    '**Diving into the easy parts.** Depth on a login form shows nothing the interviewer needs to see. Pick the parts this prompt makes hard.',
    '**Generic failure answers.** “We add redundancy” is not an answer until you say what breaks, what users see and what takes over.',
    '**Forgetting the cost.** Replicas, spare capacity and fallbacks all cost money or freshness, and a safeguard without a price sounds naive.',
    '**Losing the clock.** One deep dive that eats all 15 minutes leaves the second hardest part untouched. Check in after each topic.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram’s design is on the board with 15 minutes left. Which two topics make the best deep dives?',
      options: [
        {
          text: 'The home feed and the feed cache',
          correct: true,
          why: 'Both are hard because of this prompt’s load and the celebrity problem, so depth there shows the most.',
        },
        {
          text: 'The sign-up form and the password reset email',
          correct: false,
          why: 'Important, but standard and easy here, so depth on them shows little.',
        },
        { text: 'Search and video upload', correct: false, why: 'Both were scoped out in the requirements, so they do not deserve the time.' },
        {
          text: 'Whatever the interviewer happens to ask first',
          correct: false,
          why: 'Following a question is right when one comes, but waiting for it gives away your chance to choose.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the beats of a strong answer to a failure question in order.',
      items: [
        'What breaks: every feed read misses and goes to the feed store',
        'What users see: slow feeds, then errors',
        'How you notice: alerts on errors and latency',
        'What takes over: coalesced reads, shed load and a shorter feed',
        'How it recovers: the cache is warmed up gradually',
        'What it costs: spare capacity and a tested fallback',
      ],
      why: 'Impact comes before mechanics, then detection, mitigation and recovery, and the price comes last because naming it is what shows judgment.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these are signs that a candidate is leading the deep dives?',
      options: [
        { text: 'She proposes the topics and their order before being asked', correct: true, why: 'Setting the agenda is the clearest sign of leading.' },
        {
          text: 'She checks in after each topic and suggests what comes next',
          correct: true,
          why: 'Checking in keeps the interviewer able to steer while she keeps the momentum.',
        },
        {
          text: 'She raises a weakness in her own design without being prompted',
          correct: true,
          why: 'Finding your own weak spots is a strong signal, especially at higher levels.',
        },
        {
          text: 'She refuses to change topic when the interviewer redirects her',
          correct: false,
          why: 'Leading is not ignoring hints. A redirect tells you what the interviewer needs to grade.',
        },
        { text: 'She stays silent while she decides what to say', correct: false, why: 'Silence gives the interviewer nothing to grade. Think out loud instead.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'The feed cache answers 90% of 20,000 feed reads a second, and the feed store serves the rest. If the cache dies, how many times its usual load does the feed store get?',
      answer: 10,
      unit: 'times',
      tolerance: 1.1,
      solution: [
        'Before: 10% of 20,000 = 2,000 reads a second reach the feed store.',
        'After: all 20,000 reads a second reach it.',
        '20,000 ÷ 2,000 = 10 times the usual load, which is why the store needs protecting the moment the cache dies.',
      ],
    },
    {
      kind: 'single',
      prompt: 'The interviewer asks what happens if the feed cache dies. Which answer is strongest?',
      options: [
        {
          text: 'Reads fall through to the feed store, so I’d coalesce misses, shed excess load and warm the cache back up; no data is lost, and the cost is spare capacity',
          correct: true,
          why: 'It covers impact, mitigation, recovery and cost, traced through the actual design.',
        },
        { text: 'Our cache is highly available, so it will not die', correct: false, why: 'Every component can fail, and denying it skips the question.' },
        {
          text: 'The app falls back to the database',
          correct: false,
          why: 'True but incomplete: it ignores the stampede, what users see and how the cache recovers.',
        },
        {
          text: 'We add redundancy everywhere',
          correct: false,
          why: 'A slogan, not an answer: it says nothing about this failure or what the protection costs.',
        },
      ],
    },
  ],
  takeaways: [
    'Pick the two or three parts that this prompt’s requirements and numbers make hard, and say why before you start.',
    'Lead each deep dive with the problem, the options, your pick and a check-in, and follow the interviewer whenever they redirect you.',
    'Answer failure questions by tracing what breaks, what users see, how you notice, what takes over, how it recovers and what it costs.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Other failures to expect.** The database leader dies ([Replication](lesson:replication)); a whole region goes dark ([Multi-region and disaster recovery](lesson:multi-region-dr)); a dependency slows down instead of failing ([Circuit breakers](lesson:circuit-breakers)); traffic spikes tenfold ([Rate limiting](lesson:rate-limiting)). The same six beats work for each.',
    },
    {
      kind: 'prose',
      md: '**Slow is harder than dead.** A dead cache is easy to detect, but one that answers in two seconds instead of one millisecond drags every request down with it. A [[timeout|timeout]] turns slow into failed, which the routine already handles; [Timeouts, retries, backoff and jitter](lesson:timeouts-retries-backoff) shows how to set one.',
    },
    {
      kind: 'prose',
      md: '**What higher levels add.** Senior candidates are expected to raise failures before being asked and to talk about detection and recovery time, not only the fix. [What each level is expected to show](lesson:level-expectations) covers the differences.',
    },
  ],
  flashcards: [
    { front: 'How many deep dives fit in a 45-minute interview?', back: 'Usually two or three, in about 15 minutes.' },
    {
      front: 'How do you pick deep-dive topics?',
      back: 'Choose what this prompt makes hard: the heaviest load, what breaks first at ten times the traffic, and the hardest requirement.',
    },
    {
      front: 'What does leading a deep dive look like?',
      back: 'You propose the topics and their order, then for each one give the problem, options with costs, your pick and a check-in.',
    },
    {
      front: 'What are the beats of a failure answer?',
      back: 'What breaks, what users see, how you notice, what takes over, how it recovers and what the protection costs.',
    },
    { front: 'The feed cache dies. Why is no data lost?', back: 'The cache only held copies. The feed store is the source of truth, so the cache can be refilled.' },
    {
      front: 'What is cache warming?',
      back: 'Refilling a cold cache gradually, or before it takes full traffic, so the store behind it is not flooded with misses.',
    },
    {
      front: 'What should you do if the interviewer changes the topic?',
      back: 'Follow them. Their question shows what they need to grade; answer it, then offer to return to your plan.',
    },
  ],
  related: ['interview-framework', 'high-level-design', 'caching', 'feed-fanout', 'circuit-breakers', 'why-distributed-is-hard', 'talking-tradeoffs'],
  glossaryTerms: [
    'deep-dive',
    'celebrity-problem',
    'failure-mode',
    'cache-stampede',
    'health-check',
    'request-coalescing',
    'load-shedding',
    'graceful-degradation',
    'source-of-truth',
    'cold-cache',
    'cache-warming',
    'cascading-failure',
    'single-point-of-failure',
    'timeout',
  ],
};

export default lesson;
