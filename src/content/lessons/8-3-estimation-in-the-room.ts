import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Four rounded numbers, each attached to the part of the design it sizes. */
const decisions: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Phones', x: 0, y: 0.5 },
    { id: 'edge', type: 'cdn', label: 'CDN edge', x: 1, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Object storage', x: 2, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 1, y: 2 },
  ],
  edges: [
    { id: 'users-edge', from: 'users', to: 'edge', kind: 'sync' },
    { id: 'edge-store', from: 'edge', to: 'store', kind: 'sync' },
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '**Peak reads: about 15,000 a second.** That is more than one **database** should serve alone, so the design needs a fleet of **app servers** and a cache in front of the database. Number first, then the decision it forces.',
      flow: ['users-app', 'app-db', '<app-db', '<users-app'],
      notes: [{ target: 'app', text: '≈ 15,000/s at peak', tone: 'signal' }],
    },
    {
      caption:
        '**Storage: about 700 TB a year.** Far too much for a database, so the photo files go to [[object storage|object-storage]], and only their details, about a kilobyte each, go in the **database**.',
      focus: ['app', 'store', 'db'],
      notes: [{ target: 'store', text: '≈ 700 TB a year', tone: 'signal' }],
    },
    {
      caption:
        '**Bandwidth: about 3 GB a second at peak.** Sending that much from one data center is slow for distant users and costly, so a [[content delivery network|cdn]] (CDN) serves photos from a **CDN edge** near each user.',
      flow: ['users-edge', 'edge-store', '<edge-store', '<users-edge'],
      notes: [{ target: 'edge', text: '≈ 3 GB/s', tone: 'signal' }],
    },
    {
      caption:
        '**Cache: about 100 GB of photo details.** That fits in the memory of a few servers, so the hot records, the [[working set|working-set]], live in a **cache**. Anything that would not change a box was skipped.',
      flow: ['users-app', { edge: 'app-cache', tag: 'hit' }, '<app-cache', '<users-app'],
      notes: [{ target: 'cache', text: '≈ 100 GB', tone: 'signal' }],
    },
  ],
};

/** Maya's estimate, done for decisions instead of digits. */
const takeTwo: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'Plan', from: 1, to: 1 },
    { label: 'Peak reads', from: 2, to: 3 },
    { label: 'Storage', from: 4, to: 4 },
    { label: 'Skip', from: 5, to: 6 },
  ],
  messages: [
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Three numbers, then the design',
      kind: 'sync',
      caption: 'She says up front what she will estimate and why, which caps the step at a few minutes.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: '10⁷ users × 50 views ÷ 10⁵ s',
      kind: 'sync',
      caption: 'About 5,000 views a second on average, and about 15,000 at an evening peak of three times. A day becomes 10⁵ seconds without apology.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'So the feed needs a cache',
      kind: 'sync',
      caption: 'The conclusion, said out loud: one database cannot serve 15,000 reads a second alone.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: '1M photos × 2 MB → about 700 TB a year',
      kind: 'sync',
      caption: 'Storage per year, rounded, with its decision: object storage for the files.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'What about follows per user?',
      kind: 'sync',
      caption: 'A tempting number to work out.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'It won’t change the design yet',
      kind: 'reply',
      caption: 'She skips it in one sentence and offers to come back if the feed deep dive needs it. The whole step takes about four minutes.',
    },
  ],
};

const lesson: Lesson = {
  id: 'estimation-in-the-room',
  module: 'm8',
  order: 3,
  title: 'Estimation in the room',
  idea: 'In an interview, estimate only the two or three numbers that change a decision, round them hard enough to work out in your head, and skip the rest out loud.',
  minutes: 13,
  prerequisites: ['back-of-the-envelope', 'requirements'],
  outcomes: [
    'Pick the few numbers worth estimating for a prompt, such as peak [[requests per second|requests-per-second]] or storage per year, and name the decision each one informs.',
    'Round to one [[significant figure|significant-figure]] and powers of ten, so each estimate takes about a minute.',
    'Recognize when to skip an estimate, and say so in one sentence.',
  ],
  analogy: {
    title: 'Buying paint for a room',
    body: 'To paint a bedroom, you do not measure every wall to the millimeter. Four walls of about 4 by 2.5 meters is about 40 square meters; a can covers about 10, and two coats double it, so you buy 8 cans. Two minutes of rough math, and the answer is good enough to act on.\n\nNobody works out the area of the light switch. And if you are painting one small wall, you skip the math and buy one can. Estimating in an interview works the same way: rough numbers, and only when they decide something.',
  },
  whyItMatters:
    'In her second practice round, Maya reaches estimation on time. Then she works out Snapgram’s photo storage to the byte: 10 million [[daily users|daily-active-users]], 0.12 uploads each, 2.4 MB per photo, 365.25 days a year. The long multiplication eats ten minutes, and the answer, 1,051,920 gigabytes a year, says nothing that “about a petabyte” would not.\n\nHer friend points out the bigger problem. She never estimated the number the design depended on: how many feed reads hit the servers at the evening peak. The estimate looked careful, but it did not inform a single decision.',
  body: [
    { kind: 'heading', text: 'What to estimate' },
    {
      kind: 'prose',
      md: 'A [[back-of-the-envelope|back-of-the-envelope]] estimate earns its minutes only if its answer could change the design. So before you multiply anything, name the decision: how many servers, which kind of store, whether you need a content delivery network, whether the hot data fits in memory. If no answer would change a choice, skip the number.',
    },
    {
      kind: 'table',
      columns: ['Number', 'The decision it informs', 'Snapgram, ballpark'],
      rows: [
        ['Peak requests per second', 'How many servers, and whether one database can take the load', 'About 15,000 photo views a second'],
        ['Storage per year', 'Which kind of store, and when one machine is no longer enough', 'About 700 TB of photos'],
        ['Outgoing [[bandwidth|bandwidth]]', 'Whether files need a content delivery network', 'About 3 GB a second at peak'],
        ['Cache size', 'Whether the hot data fits in memory', 'About 100 GB of photo details'],
        ['Most other numbers', 'Nothing yet: follows per user, bytes per comment, logins per day', 'Skip them, out loud'],
      ],
      caption: 'Four numbers cover most designs. These are the drills in Try it, at 10 million daily users.',
    },
    { kind: 'heading', text: 'How to round' },
    {
      kind: 'prose',
      md: 'Rounding is what makes the math fit in your head. Four habits do most of the work:\n\n- **Keep one significant figure.** 86,400 seconds in a day becomes 10⁵, 2.4 MB becomes 2 MB, and 10.2 million users becomes 10 million.\n- **Use powers of ten.** Write 10 million as 10⁷ and multiply by adding exponents: 10⁷ × 50 = 5 × 10⁸.\n- **Round toward safety.** When a number sizes capacity, round up and leave [[headroom|headroom]], and size for the busiest hour with a [[peak factor|peak-factor]] of 2 or 3.\n- **Keep the units.** Most slips are a lost factor of 8, bits and bytes, or of 1,000, kilobytes and megabytes.',
    },
    {
      kind: 'prose',
      md: 'Then say what the number means. “About 15,000 reads a second at peak” is a fact; “so one database cannot serve them alone, and the feed needs a cache” is the point. Aim for the right [[order of magnitude|order-of-magnitude]], and run a quick [[sanity check|sanity-check]]: if a result says one server needs 20 TB of memory, an input or the design is wrong.',
    },
    {
      kind: 'diagram',
      title: 'Each number lands on one decision',
      caption: 'Four rounded numbers, each attached to the part of the design it sizes. Use Play, or the arrow keys.',
      spec: decisions,
    },
    { kind: 'heading', text: 'When to skip' },
    {
      kind: 'prose',
      md: 'Skip an estimate when the interviewer gives you the numbers, when the scale is clearly small, or when no answer would change the design. Skipping out loud still shows judgment: “Storage is small here, a few gigabytes a year, so I won’t size it further.” If the interviewer wants the number, they will ask, and you have spent ten seconds instead of ten minutes.',
    },
    {
      kind: 'prose',
      md: '[[False precision|false-precision]] is the opposite trap: digits your inputs cannot support. Maya’s 1,051,920 gigabytes came from guesses such as 0.12 uploads per user, so every digit after the first one or two was noise that cost her minutes.',
    },
    {
      kind: 'sequence',
      title: 'Maya’s estimate, take two',
      caption: 'The same estimate, done for decisions instead of digits.',
      spec: takeTwo,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'These numbers are illustrative and rounded hard on purpose. A real [[capacity plan|capacity-planning]] uses measured traffic, several photo sizes and the extra copies storage keeps; [back-of-the-envelope estimation](lesson:back-of-the-envelope) shows how to add those when they matter.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'estimation-drill',
      title: 'Timed estimation drills',
      caption:
        'Five quick estimates, each with a countdown you can pause or switch off. An answer within 2× of the reference counts, then the worked solution appears line by line, with the decision the number informs.',
    },
  ],
  realWorld: {
    title: 'Choosing a design with two lines of arithmetic',
    body: 'In a 2009 keynote on building large distributed systems, Google’s Jeff Dean showed how a back-of-the-envelope estimate picks between designs. The question was how long it takes to build an image results page with 30 thumbnails. Reading 30 images of 256 KB one after another, at about 10 ms per disk seek and 30 MB per second, comes to about 560 ms.\n\nIssuing the 30 reads in parallel comes to about 18 ms, which the slide itself says is really more like 30 to 60 ms once variance is counted. Two lines of arithmetic and no code make the better design obvious, and the same slide lists caching and precomputing thumbnails as variations to estimate next.',
    sourceUrl: 'https://www.cs.cornell.edu/projects/ladis2009/talks/dean-keynote-ladis2009.pdf',
    sourceLabel: 'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems”, keynote at LADIS 2009',
  },
  interview: {
    whenToMention:
      'Right after requirements, for three to five minutes. Say which numbers you will estimate and why, work each one out loud with rounded inputs, and end each with what it means for the design. If the interviewer says to skip estimation, skip it gladly and state one or two assumptions instead.',
    sayItLikeThis: [
      'I’ll estimate three things: peak reads, storage per year and bandwidth, because they decide the cache, the store and whether we need a content delivery network.',
      'Ten million users times 50 views is 5 × 10⁸ a day. Over 10⁵ seconds that’s about 5,000 a second, so roughly 15,000 at peak, and one database won’t serve that alone.',
      'Storage is small here, a few gigabytes a year, so I’ll skip sizing it and come back if it matters.',
    ],
    followUps: [
      {
        q: 'Your day has 100,000 seconds. Isn’t that wrong?',
        a: 'It has 86,400, so my rates are about 14% low. The inputs are guesses good to maybe a factor of 2, so the rounding changes no decision, and it saves time for the design.',
      },
      {
        q: 'Why not estimate the number of follows per user?',
        a: 'No answer would change the design at this stage. If the feed deep dive needs it, for example to size the work of copying posts into feeds, I’ll estimate it then, when it informs a choice.',
      },
      {
        q: 'Your estimate could be off by a factor of three. Does that worry you?',
        a: 'Not for these decisions. Whether reads are 5,000 or 15,000 a second, one database still needs a cache in front of it. I’d worry if a factor of three crossed a limit, such as data no longer fitting in memory, and I’d say so.',
      },
    ],
    redFlags: [
      'Long multiplication on the whiteboard, or answers like 1,051,920 gigabytes.',
      'Estimating numbers that never inform a decision.',
      'Producing a number and moving on without saying what it means.',
      'Refusing to estimate at all when the design depends on the scale.',
    ],
  },
  mistakes: [
    '**False precision.** Exact digits suggest an accuracy your assumptions do not have, and they cost minutes.',
    '**Estimating everything.** Each number should name its decision first; the rest is time you need for the deep dives.',
    '**A number without a conclusion.** Say what the result means for the design, or the interviewer cannot tell why you worked it out.',
    '**Losing a factor of 1,000 or 8.** Keep units on every line: kilobytes versus megabytes, bytes versus bits.',
    '**Sizing for the average.** Servers sized for the average fall over in the busiest hour, so multiply by a peak factor.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'A chat app has 50 million daily users, each sending about 40 messages a day. About how many messages per second is that on average?',
      answer: 20000,
      unit: 'messages per second',
      tolerance: 2,
      solution: [
        'Messages a day: 5 × 10⁷ users × 40 = 2 × 10⁹.',
        'A day is about 10⁵ seconds.',
        '2 × 10⁹ ÷ 10⁵ = 2 × 10⁴, about 20,000 messages a second on average.',
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A video app stores 100,000 new videos a day at about 50 MB each. About how many terabytes is that per year?',
      answer: 1825,
      unit: 'TB per year',
      tolerance: 2,
      solution: [
        'Per day: 10⁵ videos × 50 MB = 5 × 10⁶ MB, which is 5 TB.',
        'Per year: 5 TB × 365 ≈ 1,800 TB.',
        'About 2 petabytes a year: object storage, not a database.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Which number is most worth estimating for Snapgram’s feed design?',
      options: [
        { text: 'Peak feed reads per second', correct: true, why: 'It decides how many servers you need and whether the database needs a cache in front of it.' },
        { text: 'The average length of a caption, in characters', correct: false, why: 'Captions are tiny next to photos, so no answer changes the design.' },
        { text: 'How often a user changes their password', correct: false, why: 'It is rare and cheap, and it says nothing about the feed.' },
        { text: 'The exact number of seconds in a leap year', correct: false, why: 'That is false precision: a day of 10⁵ seconds is close enough.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'When is it fine to skip an estimate?',
      options: [
        { text: 'The interviewer gives you the numbers', correct: true, why: 'Then there is nothing to estimate: use their numbers and move on.' },
        { text: 'No answer would change any design decision', correct: true, why: 'An estimate is only worth the minutes if it informs a choice.' },
        { text: 'The scale is clearly tiny, such as an internal tool for 50 people', correct: true, why: 'One server obviously copes, so you can say so in one sentence.' },
        { text: 'The math looks hard', correct: false, why: 'Hard math is a cue to round harder, not to skip a number the design depends on.' },
        { text: 'You would rather spend the time drawing', correct: false, why: 'Skip numbers that inform nothing, but the ones that size the design earn their minutes.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of one in-the-room estimate in order.',
      items: [
        'Name the decision the number informs',
        'State the assumptions out loud',
        'Multiply with rounded powers of ten',
        'Round the result to one significant figure',
        'Say what the result means for the design',
      ],
      why: 'Naming the decision first stops you from estimating numbers that do not matter, and ending with the meaning turns arithmetic into a design choice.',
    },
  ],
  takeaways: [
    'Estimate only the numbers that change a decision, usually peak requests per second, storage per year, bandwidth and cache size, and name the decision first.',
    'Round to one significant figure and powers of ten, keep the units, and finish each number with what it means for the design.',
    'Skip estimates that inform nothing, out loud, so a three-minute step never becomes a ten-minute one.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**A cheat sheet for the room.** A day is about 10⁵ seconds and a year about 3 × 10⁷. A million a day is about 10 a second. Each step from kilo to mega to giga to tera is about a thousand times.',
    },
    {
      kind: 'prose',
      md: '**Numbers near a limit.** The estimates that matter most sit close to a threshold: data that almost fits in memory, or writes close to what one database can take. Those deserve a second, more careful look, and often a deep dive.',
    },
  ],
  flashcards: [
    {
      front: 'Which numbers are usually worth estimating in an interview?',
      back: 'Peak requests per second, storage per year, bandwidth and cache size, each tied to the decision it informs.',
    },
    { front: 'What should you say before you estimate a number?', back: 'The decision it informs, such as whether one database can take the load.' },
    { front: 'How do you round in the room?', back: 'To one significant figure and powers of ten: a day is 10⁵ seconds, and 2.4 MB is 2 MB.' },
    {
      front: 'When should you skip an estimate?',
      back: 'When the interviewer gives you the numbers, when the scale is clearly tiny, or when no answer would change the design.',
    },
    { front: 'What is false precision?', back: 'More digits than your assumptions support, such as 1,051,920 GB instead of about a petabyte.' },
    { front: 'About how many requests per second is a million a day?', back: 'About 10 a second, because a day is about 10⁵ seconds.' },
  ],
  related: ['back-of-the-envelope', 'requirements', 'interview-framework', 'latency-numbers', 'caching', 'cdns', 'storage-types'],
  glossaryTerms: [
    'requests-per-second',
    'significant-figure',
    'daily-active-users',
    'back-of-the-envelope',
    'bandwidth',
    'headroom',
    'peak-factor',
    'order-of-magnitude',
    'sanity-check',
    'object-storage',
    'cdn',
    'working-set',
    'false-precision',
    'capacity-planning',
  ],
};

export default lesson;
