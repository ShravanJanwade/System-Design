import type { DiagramSpec, Lesson } from '../types';

/** One profile request from Singapore, priced step by step. */
const pricedRequest: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'Oregon', x: 1, y: 1 },
    { id: 'redis', type: 'cache', label: 'Redis cache', sublabel: 'same data center', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'spinning disks', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-redis', from: 'app', to: 'redis', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya opens a profile. Her request crosses the Pacific to Oregon: about 75 ms, half of a 150 ms [[round trip|round-trip-time]].',
      flow: ['phone-app'],
      notes: [{ target: 'phone-app', text: '≈ 75 ms', tone: 'signal' }],
    },
    {
      caption: 'The **app server** checks a small [[cache|cache]] in its own memory: about 100 ns. The profile is not there.',
      focus: ['app'],
      notes: [{ target: 'app', text: '≈ 100 ns', tone: 'signal' }],
    },
    {
      caption: 'It asks the **[[Redis|redis]] cache** on another machine in the same data center: about 0.5 ms there and back. Another miss.',
      flow: [{ edge: 'app-redis', tag: 'miss' }, '<app-redis'],
      notes: [{ target: 'app-redis', text: '≈ 0.5 ms', tone: 'signal' }],
    },
    {
      caption: 'So it asks the **database**: another 0.5 ms hop, plus one [[disk seek|disk-seek]] on a [[spinning disk|hard-disk]], about 10 ms.',
      flow: ['app-db', '<app-db'],
      notes: [{ target: 'db', text: '≈ 10 ms seek', tone: 'signal' }],
    },
    {
      caption: 'The profile heads back across the ocean: another 75 ms.',
      flow: ['<phone-app'],
      notes: [{ target: 'phone-app', text: '≈ 75 ms', tone: 'signal' }],
    },
    {
      caption: 'Total: about 161 ms, and 150 ms of it is the ocean. Caching in memory would save the 10 ms seek; only moving data closer to Maya can save the trip.',
      focus: ['phone', 'app', 'redis', 'db', 'phone-app'],
      notes: [{ target: 'phone', text: '≈ 161 ms', tone: 'signal' }],
    },
  ],
};

/** Ballpark round trips by distance, from Maya's phone to the data center. */
const distances: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'edge', type: 'cdn', label: 'CDN edge', sublabel: 'Singapore', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'Oregon', x: 2, y: 0 },
    { id: 'redis', type: 'cache', label: 'Redis', sublabel: 'same data center', x: 3, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'same data center', x: 2, y: 1 },
  ],
  edges: [
    { id: 'phone-edge', from: 'phone', to: 'edge', kind: 'sync', label: '≈ 10 ms' },
    { id: 'edge-app', from: 'edge', to: 'app', kind: 'sync', label: '≈ 150 ms' },
    { id: 'app-redis', from: 'app', to: 'redis', kind: 'sync', label: '≈ 0.5 ms' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: '≈ 0.5 ms' },
  ],
  description:
    'Ballpark round-trip times by distance: Maya’s phone to a nearby edge server in Singapore, about 10 ms; the edge to the app server in Oregon, about 150 ms; the app server to Redis or the database in the same data center, about 0.5 ms each.',
};

const lesson: Lesson = {
  id: 'latency-numbers',
  module: 'm2',
  order: 5,
  title: 'Latency numbers to know',
  idea: 'A handful of ballpark numbers, from a memory read to a round trip across an ocean, tells you which part of a design will be slow before you build it.',
  minutes: 13,
  prerequisites: ['latency-throughput-bandwidth'],
  outcomes: [
    'Recall ballpark costs for reading memory, a [[solid-state drive|ssd]] (SSD) and a spinning disk, and for network round trips near and far.',
    'Use [[orders of magnitude|order-of-magnitude]] to find the slowest step of a request before you build it.',
    'Explain why memory beats disk, and why no hardware upgrade removes the cost of crossing an ocean.',
  ],
  analogy: {
    title: 'If 1 nanosecond were 1 second',
    body: 'Computers work in units too small to feel. A [[nanosecond|nanosecond]] is a billionth of a second, so imagine slowing everything down until one nanosecond lasts a whole second. Now reading the [[processor’s own cache|cpu-cache]] takes half a second, and fetching from [[main memory|main-memory]] takes about a minute and a half.\n\nAn SSD read takes almost two days, and a spinning disk finding its place takes nearly four months. A message from California to Europe and back takes almost five years.',
  },
  whyItMatters:
    'Snapgram now runs on several app [[servers|server]] in a [[data center|data-center]] in Oregon, and its profile page is still slow for Maya in Singapore. Three engineers each have a fix: faster disks for the database, popular profiles kept in memory, or servers closer to Asia.\n\nEach fix costs money and weeks of work, and each engineer is sure theirs matters most. Nobody can settle it, because nobody knows what each step of a request actually costs.',
  body: [
    {
      kind: 'prose',
      md: 'To see where the time goes, follow one profile request and put a price on each step: its ballpark [[latency|latency]], rounded to an easy number.',
    },
    {
      kind: 'diagram',
      title: 'One request, priced step by step',
      caption: 'Maya’s profile request, from Singapore to Oregon and back. Use Play, or the arrow keys.',
      spec: pricedRequest,
    },
    { kind: 'heading', text: 'The numbers worth knowing' },
    {
      kind: 'numbers',
      caption:
        'Ballpark values from the widely shared “latency numbers every programmer should know” table (Jeff Dean and Peter Norvig, figures from about 2012). Newer hardware is faster on some rows, but the gaps hold.',
      items: [
        { label: 'Main memory reference', value: '≈ 100 ns' },
        { label: 'Random 4 KB read from an SSD', value: '≈ 150 µs', note: '1,500 memory reads' },
        { label: 'Round trip within one data center', value: '≈ 0.5 ms', note: '500 µs' },
        { label: 'Disk seek', value: '≈ 10 ms', note: '20 data-center round trips' },
        { label: 'Round trip across continents', value: '≈ 150 ms', note: 'California to the Netherlands' },
      ],
    },
    {
      kind: 'prose',
      md: 'A [[microsecond|microsecond]] (µs) is 1,000 nanoseconds, and a [[millisecond|millisecond]] (ms) is 1,000 microseconds. Compare the rows by orders of magnitude, factors of ten: a disk seek is five orders above a memory read, so one seek costs as much as 100,000 reads.',
    },
    { kind: 'heading', text: 'Memory, SSD and disk' },
    {
      kind: 'prose',
      md: 'Main memory, or RAM (random-access memory), holds a running program’s data and answers in about 100 ns. An SSD keeps data without power and has no moving parts; a random read takes about 150 µs. A hard disk must swing its arm to the right spot before each random read, and that seek costs about 10 ms.',
    },
    {
      kind: 'prose',
      md: 'Order matters too. A [[sequential read|sequential-read]] of 1 MB from disk takes about 20 ms once the arm is in place, while scattered [[random reads|random-read]] pay a seek every time. Memory makes random reads nearly free, which is the whole case for a cache.',
    },
    { kind: 'heading', text: 'Near and far on the network' },
    {
      kind: 'prose',
      md: 'A round trip between two machines in one data center takes about 0.5 ms, twenty times faster than a disk seek. So asking another server for data it keeps in memory beats reading your own disk, which is why a shared cache such as Redis pays off.',
    },
    {
      kind: 'prose',
      md: 'Across continents, physics takes over. Light in optical fiber covers about 200,000 km per second, and Singapore is roughly 13,000 km from Oregon, so a round trip needs well over 100 ms before any equipment adds delay. No faster server can remove this [[propagation delay|propagation-delay]]; only moving data closer to Maya can.',
    },
    {
      kind: 'diagram',
      title: 'Round trips by distance',
      caption: 'Ballpark round trips by distance. A [[content delivery network|cdn]] (CDN) keeps copies on an [[edge server|edge-server]] near Maya, which answers in about 10 ms.',
      spec: distances,
    },
    { kind: 'heading', text: 'Using the numbers' },
    {
      kind: 'prose',
      md: 'Three habits follow:\n\n- **Avoid the ocean.** Serve what you can from near the user.\n- **Avoid the disk seek.** Keep hot data in memory, and use disks for long sequential reads and writes.\n- **Count round trips.** Fifty calls in a row cost about 25 ms inside a data center, and over 7 seconds across an ocean.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'These figures date from about 2012. Newer drives and memory are several times faster on some rows, busy systems add waiting time, and real requests overlap steps. The gaps between rows are what you reason with, and they still hold.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'latency-ladder',
      preset: { zoom: 'all', human: false },
      intro: 'Explore the whole ladder: thirteen operations on one scale. Turn on human scale to feel the gaps, select two rows to compare them, and try the challenges.',
    },
  ],
  tradeoffs: {
    caption: 'Where to keep data, by how fast you can read it back.',
    rows: [
      {
        option: 'Memory (a cache)',
        goodAt: 'About 100 ns on the same machine, or 0.5 ms from a cache server nearby.',
        badAt: 'Costly per gigabyte, small, and emptied by a restart.',
        pickWhen: 'Hot data is read again and again.',
      },
      {
        option: 'SSD',
        goodAt: 'Random reads in about 150 µs, and data survives a restart.',
        badAt: 'Costs more per gigabyte than spinning disks.',
        pickWhen: 'A database needs fast random reads.',
      },
      {
        option: 'Spinning hard disk',
        goodAt: 'Cheapest per gigabyte, and fine for long sequential reads.',
        badAt: 'Every random read pays a 10 ms seek.',
        pickWhen: 'Backups, archives and logs.',
      },
      {
        option: 'Copies near users (CDN or another region)',
        goodAt: 'Removes 150 ms ocean crossings.',
        badAt: 'More copies to keep in sync and to pay for.',
        pickWhen: 'Users are far from your servers.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s numbers everyone should know',
    body: 'In a 2009 keynote, Google’s Jeff Dean showed a slide called “Numbers Everyone Should Know”, an early version of this lesson’s table: 100 ns for main memory, 10 ms for a disk seek, 150 ms for a packet from California to the Netherlands and back.\n\nHe then used the numbers to choose a design. Reading 30 image thumbnails one after another from disk would take about 560 ms, mostly seeks; issuing the 30 reads in parallel cuts that to about 18 ms, or 30 to 60 ms with real-world variation. The numbers picked the design before anyone wrote code.',
    sourceUrl: 'https://www.cs.cornell.edu/projects/ladis2009/talks/dean-keynote-ladis2009.pdf',
    sourceLabel: 'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems,” LADIS 2009 keynote',
  },
  interview: {
    whenToMention:
      'Whenever you justify a choice by speed: adding a cache, choosing storage, placing servers, or adding another network call. Quote the number, then the conclusion; it shows you reason from costs, not habit.',
    sayItLikeThis: [
      'A memory read is about 100 nanoseconds and a disk seek about 10 milliseconds, so caching hot profiles in memory removes the slowest step from most reads.',
      'Users in Asia are about 150 milliseconds from Oregon per round trip, and no faster server changes that, so I’d serve photos from CDN edges near them.',
    ],
    followUps: [
      {
        q: 'Why is a cache on another server faster than the database, when both are a network hop away?',
        a: 'Both cost about 0.5 ms for the round trip, but the cache answers from memory, while the database may also read from disk. One disk seek is about 10 ms, twenty times the hop.',
      },
      {
        q: 'Your servers are in Oregon and many users are in Europe. What should they expect?',
        a: 'Roughly 150 ms per round trip, and several round trips per page. Hardware cannot fix distance, so I’d serve static content from a CDN, reuse connections, and consider servers in Europe.',
      },
      {
        q: 'A page makes 30 database calls one after another. Is that a problem?',
        a: 'Inside one data center that is about 15 ms of round trips, which may be fine. If each call also seeks on disk, it becomes 300 ms or more, so I’d batch the calls, run them in parallel, or cache the results.',
      },
    ],
    redFlags: [
      'Treating a network call as free, or as fast as a function call.',
      'Quoting numbers with false precision instead of orders of magnitude.',
      'Proposing faster hardware to fix latency that comes from distance.',
    ],
  },
  mistakes: [
    '**Mixing up the units.** Confusing ms, µs and ns puts an estimate off by a thousand or a million.',
    '**Forgetting the network.** Every call to another machine costs at least a round trip, and calls in a row add up.',
    '**Fixing the wrong step.** Halving a 2 ms query does little for a user who waits 150 ms per round trip.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put these operations in order, fastest first.',
      items: ['Main memory reference', 'Random 4 KB read from an SSD', 'Round trip within one data center', 'Disk seek', 'Round trip across continents'],
      why: 'Memory is about 100 ns, an SSD read about 150 µs, a data-center round trip about 0.5 ms, a disk seek about 10 ms and an ocean round trip about 150 ms. Each step is a big jump, not a small one.',
    },
    {
      kind: 'numeric',
      prompt: 'About how many main memory references fit into one round trip within a data center?',
      answer: 5000,
      unit: 'memory references',
      tolerance: 1.1,
      solution: [
        'A round trip within a data center is about 0.5 ms, which is 500,000 ns.',
        'A main memory reference is about 100 ns.',
        '500,000 ÷ 100 = 5,000.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s profile reads hit a database on spinning disks. Which change most speeds up a typical read inside the data center?',
      options: [
        {
          text: 'Keep popular profiles in a memory cache',
          correct: true,
          why: 'A cache hit costs about 0.5 ms over the network, or 100 ns on the same machine, instead of a 10 ms disk seek.',
        },
        {
          text: 'Buy app servers with faster processors',
          correct: false,
          why: 'The processor does a few microseconds of work per request; the disk seek is thousands of times longer.',
        },
        {
          text: 'Compress profiles before storing them',
          correct: false,
          why: 'Compressing 1 KB takes about 3 µs and saves a little space, but every read still pays the seek.',
        },
        {
          text: 'Move the database to the other side of the ocean',
          correct: false,
          why: 'That would add about 150 ms to every round trip, making each read far slower.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Maya in Singapore waits about 150 ms for every round trip to Oregon. Which changes would shorten her wait?',
      options: [
        {
          text: 'Serving photos from a CDN edge in Singapore',
          correct: true,
          why: 'The edge is a few milliseconds away, so those round trips stop crossing the ocean.',
        },
        {
          text: 'Running Snapgram in a data center in Asia as well',
          correct: true,
          why: 'A shorter distance means a shorter round trip for every request, not just for photos.',
        },
        {
          text: 'Moving the Oregon database onto SSDs',
          correct: false,
          why: 'That saves milliseconds inside Oregon, but the 150 ms ocean crossing stays.',
        },
        {
          text: 'Doubling the number of app servers in Oregon',
          correct: false,
          why: 'More servers handle more traffic, but each request still crosses the same ocean.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'On the human scale, where 1 ns lasts 1 second, a main memory reference takes about 1.7 minutes. How long does a round trip across continents take?',
      options: [
        { text: 'About 5 years', correct: true, why: '150 ms is 150 million ns, so 150 million seconds on this scale: about 4.8 years.' },
        { text: 'About 5 days', correct: false, why: 'That is closer to a round trip inside one data center, 500,000 ns.' },
        { text: 'About 5 hours', correct: false, why: 'Five hours is 18,000 seconds, so about 18 µs in real time: closer to sending a kilobyte over a fast network.' },
        { text: 'About 5 minutes', correct: false, why: 'That is about 300 ns, just a few memory references.' },
      ],
    },
  ],
  takeaways: [
    'Memory reads take about 100 ns, SSD reads about 150 µs, disk seeks about 10 ms, and round trips about 0.5 ms nearby and 150 ms across continents.',
    'Each step down the ladder costs orders of magnitude more, so remove the slowest step first: the ocean, then the disk.',
    'Distance sets a floor that no hardware can beat; only moving data closer to users lowers it.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why the network row barely changes.** Processors, memory and drives keep getting faster, but light in fiber does not. A round trip across an ocean costs about what it did decades ago, so it takes a bigger share of every request each year.',
    },
    {
      kind: 'prose',
      md: '**Waiting is not streaming.** A disk can stream a hundred megabytes or more each second once its arm is in place, yet each random read still waits about 10 ms. The fixes differ: caches and sequential layouts for the wait, more disks or machines for the volume.',
    },
    {
      kind: 'prose',
      md: '**Typical is not worst.** These are typical values. Under load, a few requests wait much longer, and a page that makes many calls is only as fast as its slowest one: its [[tail latency|tail-latency]]. [Percentiles and tail latency](lesson:percentiles-tail-latency) covers how to measure that.',
    },
  ],
  flashcards: [
    { front: 'Ballpark: how long does a main memory reference take?', back: 'About 100 nanoseconds.' },
    { front: 'Ballpark: a random read from an SSD? A disk seek?', back: 'About 150 microseconds for the SSD read and about 10 milliseconds for the disk seek.' },
    { front: 'Ballpark round trip within one data center? Across continents?', back: 'About 0.5 ms within a data center and about 150 ms across continents.' },
    { front: 'How many nanoseconds are in a microsecond, and microseconds in a millisecond?', back: 'A thousand in each case: each unit is 1,000 times the last.' },
    { front: 'Why can a cache on another server beat a database on a spinning disk?', back: 'The network round trip costs about 0.5 ms, while a disk seek costs about 10 ms, twenty times more.' },
    { front: 'On the human scale (1 ns lasts 1 second), how long is a round trip across continents?', back: 'About 4.8 years, against about 1.7 minutes for a main memory reference.' },
    { front: 'Why can’t faster servers fix latency for users on another continent?', back: 'Most of the time is light traveling through fiber, so only moving data closer to the users helps.' },
  ],
  related: ['latency-throughput-bandwidth', 'back-of-the-envelope', 'caching', 'cdns', 'percentiles-tail-latency', 'multi-region-dr'],
  glossaryTerms: [
    'ssd',
    'order-of-magnitude',
    'nanosecond',
    'cpu-cache',
    'main-memory',
    'server',
    'data-center',
    'latency',
    'round-trip-time',
    'cache',
    'redis',
    'disk-seek',
    'hard-disk',
    'microsecond',
    'millisecond',
    'sequential-read',
    'random-read',
    'propagation-delay',
    'cdn',
    'edge-server',
    'tail-latency',
  ],
};

export default lesson;
