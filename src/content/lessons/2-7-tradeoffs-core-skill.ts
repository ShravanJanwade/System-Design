import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Three ways to keep Snapgram's like counts, one after another. */
const likeCounter: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', sublabel: 'likes and views', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 0 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'like counts', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'likes', x: 1, y: 1 },
  ],
  edges: [
    { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Option A: every like adds one to the photo’s count in the **database**, and every view reads it back. Counts are always exact, and the code is one line.',
      flow: ['phones-app', 'app-db', '<app-db', '<phones-app'],
      focus: ['phones', 'app', 'db'],
      notes: [{ target: 'db', text: 'exact', tone: 'signal' }],
    },
    {
      caption: 'Then a celebrity posts. Thousands of likes a second update the same row, a [[hot key|hot-key]], and each must wait its turn. Likes slow down, and so does every page that reads the database.',
      flow: ['phones-app', 'app-db'],
      focus: ['phones', 'app', 'db'],
      notes: [{ target: 'db', text: 'overloaded', tone: 'alert' }],
    },
    {
      caption:
        'Option B adds a [[cache|cache]]. Views read the count from it, and it recounts from the database every 5 seconds, while likes still go to the database. Reads get fast and cheap, but a count can be a few seconds [[stale|stale-data]].',
      add: ['cache', 'app-cache'],
      flow: ['phones-app', { edge: 'app-cache', tag: 'hit' }, '<app-cache', '<phones-app'],
      notes: [{ target: 'cache', text: '≤ 5 s old', tone: 'signal' }],
    },
    {
      caption:
        'Option C: each **app server** counts likes in its own memory and writes the totals to the database in [[batches|batching]] every few seconds. Likes feel instant and the database relaxes, but a crash loses the likes not yet written.',
      flow: ['phones-app', 'app-db'],
      focus: ['phones', 'app', 'db'],
      notes: [
        { target: 'app', text: 'counts in memory', tone: 'signal' },
        { target: 'app-db', text: 'every 5 s', tone: 'plain' },
      ],
    },
    {
      caption: 'None of the three is best at everything. A wins on freshness and simplicity, B on cheap, fast reads, and C on speed and cost. The requirements decide.',
      focus: ['phones', 'app', 'cache', 'db'],
    },
  ],
};

/** Option B in action: a stale read that harms nobody. */
const staleCount: SequenceSpec = {
  actors: [
    { id: 'maya', type: 'client', label: 'Maya’s phone' },
    { id: 'ben', type: 'client', label: 'Ben’s phone' },
    { id: 'app', type: 'service', label: 'App server' },
    { id: 'cache', type: 'cache', label: 'Cache' },
    { id: 'db', type: 'sqlDb', label: 'Database' },
  ],
  messages: [
    { from: 'maya', to: 'app', label: 'Like photo', kind: 'sync', caption: 'Maya likes a photo that had 100 likes.' },
    { from: 'app', to: 'db', label: 'likes + 1', kind: 'sync', caption: 'The app server saves the like. The database now holds the true count: 101.' },
    { from: 'ben', to: 'app', label: 'Open photo', kind: 'sync', caption: 'A second later, Ben opens the same photo.' },
    { from: 'app', to: 'cache', label: 'Get count', kind: 'sync', caption: 'The app reads the count from the cache, which last refreshed three seconds ago.' },
    { from: 'cache', to: 'app', label: '100', kind: 'reply', caption: 'The cache answers 100, one like behind. Ben sees a slightly stale number, and nobody is harmed.' },
    { from: 'db', to: 'cache', label: 'refresh: 101', kind: 'async', caption: 'Two seconds later the cache refreshes from the database, and every reader sees 101.' },
  ],
};

const lesson: Lesson = {
  id: 'tradeoffs-core-skill',
  module: 'm2',
  order: 7,
  title: 'Trade-offs: the core skill',
  idea: 'Every design choice buys one quality by spending another, so the real skill is choosing what to give up, based on the requirements, and saying so out loud.',
  minutes: 14,
  prerequisites: ['availability-nines', 'vertical-vs-horizontal-scaling'],
  outcomes: [
    'Name the common axes of a [[trade-off|trade-off]]: [[consistency|consistency]] vs. [[availability|availability]], latency vs. cost, and simplicity vs. flexibility.',
    'Compare options against requirements instead of looking for a perfect design.',
    'Explain a decision with the trade-off sentence interviewers listen for.',
  ],
  analogy: {
    title: 'Choosing a car',
    body: 'A sports car is fast but costs a lot and seats two. A minivan seats seven and swallows luggage, but it will never win a race. A small hatchback is cheap to buy and run, but it is neither fast nor roomy.\n\nNo car is best at everything, so nobody asks which car is best. They ask what they need it for: a family of five picks the minivan, and a student on a budget picks the hatchback. Software designs work the same way.',
  },
  whyItMatters:
    'Snapgram’s like counts have become a fight. When a celebrity posts, thousands of likes per second hit one row in the [[database|database]], and photo pages slow down for everyone. One engineer says counts must always be exact. Another wants to cache them, and a third wants to count likes in memory and save them in batches.\n\nEach engineer is right about something, so the meeting goes in circles. What is missing is not a better idea but a way to compare ideas: what each one gives, what each one costs, and which costs Snapgram can live with.',
  body: [
    {
      kind: 'prose',
      md: 'Every option is good at some things and bad at others. Designing means choosing which weaknesses you can afford, given what the product needs. To compare options, score them on a few axes: freshness, speed, cost and simplicity.',
    },
    {
      kind: 'diagram',
      title: 'Three ways to count likes',
      caption: 'Snapgram’s three options, one after another. Use Play, or the arrow keys.',
      spec: likeCounter,
    },
    { kind: 'heading', text: 'The common axes' },
    {
      kind: 'prose',
      md: 'The same few tensions come up in almost every design. Learn their names, because naming the axis is half of explaining a decision.',
    },
    {
      kind: 'table',
      columns: ['Axis', 'One side', 'The other side', 'Example'],
      rows: [
        [
          'Consistency vs. availability',
          'Every reader sees the latest write, even if some requests must wait or fail',
          'Every request gets an answer, even a slightly old one',
          'A bank balance needs consistency; a like count can favor availability',
        ],
        [
          'Latency vs. cost',
          'Fast answers, paid for with memory, copies and servers near users',
          'Cheaper hardware and fewer copies, with slower answers',
          'A cache cluster makes profiles fast but adds to the bill',
        ],
        [
          'Simplicity vs. flexibility',
          'One [[monolith|monolith]] and one database that anyone can understand and fix',
          'Many specialized parts that can change and grow separately',
          'A small team’s single app versus a large company’s [[microservices|microservices]]',
        ],
      ],
      caption: 'Most design decisions sit on one or more of these axes.',
    },
    {
      kind: 'prose',
      md: 'Consistency is the subtlest axis. [[Strong consistency|strong-consistency]] means every reader sees the latest write, as if there were one copy. When a [[network partition|network-partition]] cuts copies off from each other, a system must choose: refuse some requests until it can be sure, or answer with what it has and reconcile later, which is [[eventual consistency|eventual-consistency]]. [A later lesson](lesson:cap-pacelc) covers that choice in depth.',
    },
    {
      kind: 'prose',
      md: 'The other axes are more everyday. Low [[latency|latency]] usually costs money: memory instead of disk, more copies, servers near users. Flexibility usually costs simplicity, because every extra service, queue or database is one more thing to deploy, watch and debug at 3 a.m.',
    },
    { kind: 'heading', text: 'Decide from requirements' },
    {
      kind: 'prose',
      md: 'A requirement turns a matter of taste into a decision. The useful ones here are [[non-functional requirements|non-functional-requirement]]: how fast, how fresh, how reliable and how cheap the system must be. If Snapgram’s product team says counts may lag a few seconds but pages must stay fast during a celebrity post, option A is out. If the team is two engineers, option C’s crash-recovery code is a real cost, and option B wins.',
    },
    {
      kind: 'sequence',
      title: 'Option B in action',
      caption: 'A few seconds of staleness in exchange for fast, cheap reads.',
      spec: staleCount,
    },
    { kind: 'heading', text: 'Say it out loud' },
    {
      kind: 'prose',
      md: 'Interviewers listen for one sentence pattern more than any other. It names both options, what the choice gives and costs, the requirement that decides, and what would change your mind.',
    },
    {
      kind: 'annotated',
      title: 'The trade-off sentence',
      caption: 'The template, line by line. [Talking about trade-offs](lesson:talking-tradeoffs) practices it on many designs.',
      lines: [
        { code: 'We could do A or B.', note: 'Show that you see more than one option.' },
        { code: 'A gives us X but costs Y.', note: 'Name what you gain and what you give up.' },
        { code: 'Because of requirement Z, I’d pick A,', note: 'Tie the choice to a requirement, not to taste.' },
        { code: 'and here’s what would change my mind.', note: 'Show that you know when the answer flips.' },
      ],
    },
    {
      kind: 'prose',
      md: 'For Snapgram: “We could cache the count or batch likes in memory. Caching gives us fast reads with little new code, but costs counts that can be a few seconds stale. Because the team is small and counts may lag, I’d cache, and if likes ever had to feel instant at celebrity scale, I’d switch to batching.”',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real decisions weigh more than four axes: [[durability|durability]], security, team skills and time to build matter too. The scores in the widget that follows are judgment calls, written down so you can argue with them.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'tradeoff-sliders',
      title: 'Snapgram’s like counter',
      caption:
        'Set how much Snapgram cares about each quality. The cards show how the three designs score, which one fits best, what it gives up, and the trade-off sentence you could say in an interview.',
      props: { freshness: 2, latency: 4, cost: 3, simplicity: 4 },
    },
  ],
  tradeoffs: {
    caption: 'Three ways to keep like counts, compared.',
    rows: [
      {
        option: 'Update the database on every like',
        goodAt: 'Exact counts at all times, and the simplest code.',
        badAt: 'Every like is a write and every view a read; a viral photo makes likes queue on one row.',
        pickWhen: 'Traffic is modest, or counts must be exact, such as votes.',
      },
      {
        option: 'Cache the count, refresh every few seconds',
        goodAt: 'Fast, cheap reads with little new code.',
        badAt: 'Counts can be a few seconds stale, and the database still takes every like.',
        pickWhen: 'Reads far outnumber likes and a short delay is fine: a sensible default.',
      },
      {
        option: 'Count in memory, write in batches',
        goodAt: 'Instant likes and the fewest database writes.',
        badAt: 'A crash loses likes still in memory, and batching code is tricky to get right.',
        pickWhen: 'Write volume is huge and losing a few likes is acceptable.',
      },
    ],
  },
  realWorld: {
    title: 'Amazon’s shopping cart chose availability',
    body: 'In 2007, Amazon engineers published the design of Dynamo, the storage system behind services such as the shopping cart. The paper says customers must be able to view and add items to their cart even when disks fail, network routes flap or a tornado takes out a data center. To get there, Dynamo gives up consistency in some failure cases: it is eventually consistent, so copies of a cart can briefly disagree.\n\nWhen copies disagree, Dynamo keeps the versions and the cart merges them. The paper is open about the cost: an item the customer deleted can come back. The design accepts that occasional surprise rather than ever refusing to add an item.',
    sourceUrl: 'https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html',
    sourceLabel: 'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store,” SOSP 2007',
  },
  interview: {
    whenToMention:
      'Every time you make a choice, and especially in the deep dives and the wrap-up. Interviewers rarely ask whether a design is right; they ask what it gives up. Say the trade-off before they have to ask.',
    sayItLikeThis: [
      'We could update the count on every like or cache it with a short refresh. Caching gives us fast reads but costs a few seconds of staleness. Because likes don’t need to be exact, I’d cache, and if counts had to be exact, I’d revisit that.',
      'For account balances I’d choose consistency over availability, because a refused request is better than a wrong balance. For the feed I’d choose availability, because a slightly stale feed harms nobody.',
    ],
    followUps: [
      {
        q: 'Why not just pick the fastest option?',
        a: 'Speed is one axis among several. The fastest like counter, batching in memory, loses likes when a server crashes and needs tricky code. If the product cannot accept that, the fastest option is the wrong one.',
      },
      {
        q: 'When would you choose consistency over availability?',
        a: 'When a wrong answer does real harm: money, stock levels, permissions, anything where two people must not both win. For likes, views and feeds, a briefly stale answer is fine, so availability usually wins there.',
      },
      {
        q: 'How do you choose when two options look equally good?',
        a: 'Go back to the requirements and ask which axis matters more; often the interviewer will tell you. If it is still a tie, pick the simpler option, because it is cheaper to build and easier to change later.',
      },
    ],
    redFlags: [
      'Presenting one design as if it had no downsides.',
      'Listing pros and cons without ever making a choice.',
      'Choosing by fashion, such as microservices everywhere, instead of by requirements.',
    ],
  },
  mistakes: [
    '**Hunting for the perfect design.** It does not exist, and looking for it uses up the time you need to choose.',
    '**Hiding the downside.** Interviewers know every option costs something, so naming the cost first builds trust.',
    '**Deciding by taste.** Tie every choice to a requirement, or it sounds like opinion.',
    '**Going complex too early.** Extra services and caches cost simplicity; add them when a requirement demands it.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which statement best describes a trade-off?',
      options: [
        {
          text: 'Gaining one quality by giving up some of another',
          correct: true,
          why: 'Every option is good at some things and bad at others; choosing means deciding which weakness you can afford.',
        },
        { text: 'Picking the option with the fewest downsides', correct: false, why: 'Counting downsides ignores which ones matter for this product.' },
        {
          text: 'A temporary compromise until the perfect design is found',
          correct: false,
          why: 'There is no perfect design to wait for. Trade-offs are revisited when requirements change, not when perfection arrives.',
        },
        { text: 'Splitting the difference between two options', correct: false, why: 'Sometimes a middle option wins, but often one side is clearly right for the requirements.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram’s requirements say like counts may lag by a few seconds, but pages must stay fast when a celebrity posts. Which options fit?',
      options: [
        {
          text: 'Cache the count and refresh it every few seconds',
          correct: true,
          why: 'Reads stay fast, and a few seconds of staleness is exactly what the requirement allows.',
        },
        {
          text: 'Count likes in memory and write them in batches',
          correct: true,
          why: 'Likes stay fast and counts lag only until the next batch. You would still confirm that losing a few likes in a crash is acceptable.',
        },
        {
          text: 'Update the database on every like',
          correct: false,
          why: 'Exact counts are not required, and a celebrity post would pile thousands of writes onto one row, slowing pages.',
        },
        {
          text: 'Recount every like from the database on each view',
          correct: false,
          why: 'Counting all likes on every view is the slowest option of all, and it gets worse as a photo gets popular.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the parts of the trade-off sentence in order.',
      items: ['We could do A or B.', 'A gives us X but costs Y.', 'Because of requirement Z, I’d pick A,', 'and here’s what would change my mind.'],
      why: 'Options first, then what the choice gives and costs, then the requirement that decides, and finally what would flip the decision.',
    },
    {
      kind: 'single',
      prompt: 'A payments service must never show two different balances for the same account. Which side of the consistency vs. availability axis should it favor?',
      options: [
        {
          text: 'Consistency: delay or refuse a request rather than show a wrong balance',
          correct: true,
          why: 'A wrong balance can cost real money; a short wait or an error is the smaller harm.',
        },
        {
          text: 'Availability: always answer, even with a balance that may be out of date',
          correct: false,
          why: 'That suits likes and feeds, where stale data is harmless, not money.',
        },
        {
          text: 'Neither: a good design gets both, all the time',
          correct: false,
          why: 'When copies cannot reach each other, a system has to give up one or the other for a while.',
        },
        { text: 'Whichever is cheaper', correct: false, why: 'Cost matters, but the requirement here is correctness, and it decides.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'In the widget, with every priority set equally, which like-counting option fits best?',
      options: [
        {
          text: 'Caching the count, because it scores well on every axis without being perfect on any',
          correct: true,
          why: 'Its scores of 3, 4, 4 and 4 add up to more than the other options, whose strengths and weaknesses cancel out when nothing is weighted.',
        },
        {
          text: 'Updating on every like, because it is exact',
          correct: false,
          why: 'Exactness is one axis of four; with equal weights, its slow writes and high cost pull it down.',
        },
        {
          text: 'Batching in memory, because it is fastest',
          correct: false,
          why: 'Speed is one axis of four; with equal weights, its staleness and complexity pull it down.',
        },
        {
          text: 'All three tie, so there is no answer',
          correct: false,
          why: 'The other two tie with each other, but caching comes out ahead of both.',
        },
      ],
    },
  ],
  takeaways: [
    'No design is best at everything; every choice gives up some of one quality to gain another.',
    'The common axes are consistency vs. availability, latency vs. cost and simplicity vs. flexibility, and requirements decide where to sit on each.',
    'Say it as one sentence: the options, what the choice gives and costs, the requirement that decides, and what would change your mind.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Reversible and irreversible choices.** Some decisions are cheap to undo, like a cache’s refresh interval; others, like the main database, are expensive to change later. Spend your thinking time on the second kind.',
    },
    {
      kind: 'prose',
      md: '**Both sides in one product.** Large systems rarely pick one side of an axis everywhere. In his 2009 keynote, Google’s Jeff Dean described Gmail marking a message as read in the background, while sending a message is a heavier, consistent operation.',
    },
    {
      kind: 'prose',
      md: '**Trade-offs expire.** A choice that fits 10,000 users can be wrong at 10 million. Write down why you chose, so the team knows when the reason no longer holds.',
    },
  ],
  flashcards: [
    { front: 'What is a trade-off in system design?', back: 'Gaining one quality by giving up some of another. No option is best at everything.' },
    { front: 'Name three common trade-off axes.', back: 'Consistency vs. availability, latency vs. cost, and simplicity vs. flexibility.' },
    { front: 'What is the trade-off sentence?', back: 'We could do A or B. A gives us X but costs Y. Because of requirement Z, I’d pick A, and here’s what would change my mind.' },
    { front: 'When should you favor consistency over availability?', back: 'When a wrong or stale answer does real harm, such as with money or stock levels.' },
    { front: 'What does caching a like count give up?', back: 'Freshness: the count can be a few seconds behind the true number.' },
    { front: 'What decides between two good options?', back: 'The requirements. If they still tie, pick the simpler option.' },
  ],
  related: ['talking-tradeoffs', 'cap-pacelc', 'consistency-models', 'caching', 'requirements', 'monolith-vs-microservices'],
  glossaryTerms: [
    'trade-off',
    'consistency',
    'availability',
    'database',
    'hot-key',
    'cache',
    'stale-data',
    'batching',
    'monolith',
    'microservices',
    'strong-consistency',
    'network-partition',
    'eventual-consistency',
    'latency',
    'non-functional-requirement',
    'durability',
  ],
};

export default lesson;
