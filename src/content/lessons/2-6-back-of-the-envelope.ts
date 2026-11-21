import type { DiagramSpec, Lesson } from '../types';

/** Snapgram's estimate as a pipeline: users, requests, storage, bandwidth, cache. */
const snapgramNumbers: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: '1 million a day', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 0 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 2, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', x: 1, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-store', from: 'app', to: 'store', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Every day, 1 million users make about 100 million requests. Over a day of about 10⁵ seconds, that is 1,000 requests per second on average.',
      flow: ['users-app'],
      notes: [{ target: 'users-app', text: '≈ 1,000/s', tone: 'signal' }],
    },
    {
      caption: 'Evenings are busier. With a [[peak factor|peak-factor]] of 2, the **app servers** must handle about 2,000 requests per second, so you size them for the peak, not the average.',
      focus: ['users', 'app', 'users-app'],
      notes: [{ target: 'app', text: '2,000/s at peak', tone: 'signal' }],
    },
    {
      caption: 'About 10 requests a second are uploads. At 1 MB each, about 10 MB per second flows into **photo storage**: the incoming bandwidth.',
      flow: ['users-app', 'app-store'],
      notes: [{ target: 'app-store', text: '10 MB/s in', tone: 'signal' }],
    },
    {
      caption: 'Each day adds 1 million photos, about 1 TB. That is about 400 TB a year, and about 2 PB over 5 years of [[retention|data-retention]].',
      focus: ['store'],
      notes: [{ target: 'store', text: '≈ 2 PB', tone: 'signal' }],
    },
    {
      caption: 'The other 1,000 requests a second are views, and each sends a 1 MB photo back: about 1 GB per second out on average, and 2 GB at peak.',
      flow: ['app-store', '<app-store', '<users-app'],
      notes: [{ target: 'users-app', text: '1 GB/s out', tone: 'signal' }],
    },
    {
      caption:
        'A **cache** for the most popular 20% of a day’s views would need 0.2 × 10⁸ × 1 MB = 20 TB. That is far more memory than one server has, an early hint that photos belong on a [[content delivery network|cdn]].',
      flow: [{ edge: 'app-cache', tag: 'hit' }, '<app-cache'],
      notes: [{ target: 'cache', text: '≈ 20 TB', tone: 'signal' }],
    },
  ],
};

/** The design the numbers point to: photos through an edge, small records through a cache. */
const whatToBuild: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Phones', sublabel: '1 million users a day', x: 0, y: 0.5 },
    { id: 'edge', type: 'cdn', label: 'CDN edge', sublabel: 'serves photos', x: 1, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Object storage', sublabel: '≈ 2 PB of photos', x: 2, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: '≈ 2,000 requests/s at peak', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', sublabel: 'photo details, ≈ 20 GB', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'photo details', x: 1, y: 2 },
  ],
  edges: [
    { id: 'users-edge', from: 'users', to: 'edge', kind: 'sync' },
    { id: 'edge-store', from: 'edge', to: 'store', kind: 'sync', label: 'misses' },
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'back-of-the-envelope',
  module: 'm2',
  order: 6,
  title: 'Back-of-the-envelope estimation',
  idea: 'Back-of-the-envelope estimation turns a few stated assumptions into rough numbers for traffic, storage, bandwidth and cache size, so you know which parts of a design matter before you draw them.',
  minutes: 15,
  prerequisites: ['latency-throughput-bandwidth', 'latency-numbers'],
  outcomes: [
    'Convert [[daily active users|daily-active-users]] into average and peak [[requests per second|requests-per-second]], using a day of about 100,000 seconds.',
    'Estimate storage per year, [[bandwidth|bandwidth]] in and out, and [[cache|cache]] size with the [[80/20 rule|pareto-principle]].',
    'Round like an interviewer and state your assumptions out loud, so anyone can check your numbers.',
  ],
  analogy: {
    title: 'Ordering pizza for a party',
    body: 'You are hosting a party and need to order pizza. You do not know exactly how hungry everyone will be, and you do not need to. About 30 guests, about three slices each, eight slices a pizza: roughly 11 pizzas, so order 12.\n\nNobody counts slices to the crumb. You make a few sensible assumptions, round to easy numbers, and add a little for the guests who arrive hungry. Being off by one pizza is fine; ordering 3 or 300 is not.',
  },
  whyItMatters:
    'Snapgram has grown fast, and the founders expect one million daily users within a year. Before they buy anything, they want answers: how many requests per second will hit the servers, how much storage the photos need, and how big the network bill will be. Their investors want the numbers by Friday.\n\nNobody on the team has run a system this big, and there is no time to build it first and measure. Working out what you will need before you need it is [[capacity planning|capacity-planning]], and its first draft is [[back-of-the-envelope estimation|back-of-the-envelope]]: numbers good enough to decide with, worked out on a whiteboard in an afternoon.',
  body: [
    {
      kind: 'prose',
      md: 'An estimate is a chain of small multiplications. You state an assumption, multiply, round, and move on to the next link. Each link is simple; the skill is knowing which links to build and how far to round.',
    },
    { kind: 'heading', text: 'Start with assumptions' },
    {
      kind: 'prose',
      md: 'Write your assumptions down before any math, because every number after them depends on them. For Snapgram:\n\n- 1 million daily active users.\n- About 100 actions per user per day, mostly viewing photos.\n- A [[read/write ratio|read-write-ratio]] of 100 to 1: one upload for every 100 views.\n- About 1 MB per photo, once compressed.\n- Busy evenings at twice the average traffic, and photos kept for 5 years.',
    },
    {
      kind: 'prose',
      md: 'These are illustrative guesses, not measurements. In an interview you say them out loud, and the interviewer corrects any they disagree with.',
    },
    { kind: 'heading', text: 'Powers of two and big numbers' },
    {
      kind: 'prose',
      md: 'Sizes are counted in [[bytes|byte]], and computers count bytes in powers of two. The useful accident is that 2¹⁰ = 1,024, almost exactly a thousand, so every ten doublings add about three zeros.',
    },
    {
      kind: 'table',
      columns: ['Power of two', 'About', 'Prefix', 'Unit'],
      rows: [
        ['2¹⁰', '10³, a thousand', 'kilo', '1 KB, a kilobyte'],
        ['2²⁰', '10⁶, a million', 'mega', '1 MB, a megabyte'],
        ['2³⁰', '10⁹, a billion', 'giga', '1 GB, a gigabyte'],
        ['2⁴⁰', '10¹², a trillion', 'tera', '1 TB, a terabyte'],
        ['2⁵⁰', '10¹⁵, a quadrillion', 'peta', '1 PB, a petabyte'],
      ],
      caption: 'Estimates use the round decimal values. The gap between 1,024 and 1,000 is 2% at a kilobyte and grows to about 13% at a petabyte, still small next to your assumptions.',
    },
    {
      kind: 'prose',
      md: 'Two more numbers do most of the work. A day has 86,400 seconds, which estimates round to 100,000, or 10⁵. A year has 365 days, so 1 TB a day is about 400 TB a year once you round.',
    },
    { kind: 'heading', text: 'From daily users to requests per second' },
    {
      kind: 'prose',
      md: 'Multiply daily active users (DAU) by actions per user to get requests per day: 1 million × 100 = 100 million, or 10⁸. Divide by 10⁵ seconds and you get about 1,000 requests per second (RPS) on average. Interviewers also say queries per second (QPS); it means the same thing.',
    },
    {
      kind: 'prose',
      md: 'Then split by the read/write ratio. With 100 reads per write, about 1,000 of those requests are reads and about 10 are writes. Writes are rare, but each one creates data you keep for years; reads are many, but each one only moves data.',
    },
    {
      kind: 'diagram',
      title: 'Snapgram at one million daily users',
      caption: 'From daily users to every number the founders asked for. Use Play, or the arrow keys.',
      spec: snapgramNumbers,
    },
    { kind: 'heading', text: 'Peaks: plan for the busiest hour' },
    {
      kind: 'prose',
      md: 'Traffic is not flat. People use Snapgram after work, so the busiest hour carries more than the average, and the ratio between the two is the peak factor. A factor of 2 to 3 is a common ballpark for apps with a daily rhythm; launches, holidays and viral moments can bring 10 times or more.',
    },
    {
      kind: 'prose',
      md: 'Servers must survive the peak, so size for it and keep some [[headroom|headroom]] on top. An average that looks comfortable can hide a peak that falls over.',
    },
    { kind: 'heading', text: 'Storage: what you keep' },
    {
      kind: 'prose',
      md: 'Only writes create data. Multiply writes per day by the size of each object, then by 365 for a year and by the years you keep it: 1 million photos × 1 MB = 1 TB a day, about 400 TB a year, about 2 PB over 5 years. That much data belongs in [[object storage|object-storage]], a service built for huge numbers of files, not in a database. Many storage systems also keep about three copies of everything, so the raw disk is about three times bigger.',
    },
    { kind: 'heading', text: 'Bandwidth: what moves' },
    {
      kind: 'prose',
      md: 'Bandwidth is how much data moves per second. Incoming bandwidth is writes per second × object size, and outgoing bandwidth is reads per second × object size. Snapgram takes in about 10 MB per second and sends out about 1 GB per second on average, 2 GB at peak.',
    },
    {
      kind: 'prose',
      md: 'Network links are rated in bits per second, and a byte is 8 bits. So 2 GB per second is about 16 gigabits per second, a number a network engineer can price.',
    },
    { kind: 'heading', text: 'Cache: the 80/20 rule' },
    {
      kind: 'prose',
      md: 'Popularity is lopsided: a small share of photos gets most of the views. The 80/20 rule says about 20% of items get about 80% of the reads, so a cache holding the hottest 20%, the [[working set|working-set]], catches most of the traffic.',
    },
    {
      kind: 'prose',
      md: 'The usual interview shortcut is to cache 20% of a day’s reads: 0.2 × 10⁸ reads × 1 MB = 20 TB. It counts every view as a different photo, so it is an upper bound, and it still dwarfs one server’s memory. The estimate just told you something useful: cache small records such as photo details, about 1 KB each, which comes to about 20 GB, and let a content delivery network serve the photos.',
    },
    {
      kind: 'diagram',
      title: 'What the numbers suggest',
      caption:
        'Photos travel through a content delivery network edge backed by object storage, while the **app servers**, a small **cache** and a **database** handle pages, likes and photo details.',
      spec: whatToBuild,
    },
    { kind: 'heading', text: 'Round like an interviewer' },
    {
      kind: 'prose',
      md: 'Four habits keep the math fast and honest:\n\n- **Round early.** 86,400 becomes 10⁵, and 990,099 becomes a million.\n- **Keep one or two [[significant figures|significant-figure]].** 1,157 requests per second is about 1,000 or 1,200, never 1,157.\n- **Write the units.** Most slips are a lost factor of 8 (bits and bytes) or 1,000 (kilobytes and megabytes).\n- **Sanity-check the result.** If one server would need 20 TB of memory, an assumption or the design has to change.',
    },
    {
      kind: 'prose',
      md: 'Rounding a day up to 10⁵ seconds makes rates about 14% low. That is fine, because your assumptions are rarely better than a factor of 2: aim for the right [[order of magnitude|order-of-magnitude]], and say what would change it.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real traffic is messier: phones download several photo sizes, a content delivery network serves most views, photo details live in a database, and storage keeps extra copies. A first estimate ignores all of that on purpose, then adds only the pieces that change the design.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'estimation',
      preset: { dau: 1000000, actionsPerUser: 100, readsPerWrite: 100, objectBytes: 1000000, peakFactor: 2, retentionYears: 5 },
      intro:
        'The calculator starts with Snapgram’s assumptions. Change one at a time and watch which results move, and open any row to compare the rounded interview math with the exact math. Then try the challenges.',
    },
  ],
  tradeoffs: {
    caption: 'How much estimating to do, from none to a full model.',
    rows: [
      {
        option: 'Skip the estimate',
        goodAt: 'Saves minutes when the numbers would not change the design.',
        badAt: 'You may miss the one part that needs 100 times more capacity than the rest.',
        pickWhen: 'The interviewer says scale is small, or asks you to move on.',
      },
      {
        option: 'Quick order-of-magnitude estimate',
        goodAt: 'Takes a few minutes and finds the parts that need special design.',
        badAt: 'Can be off by a factor of 2 or 3.',
        pickWhen: 'Almost always: it is what interviews expect.',
      },
      {
        option: 'Detailed capacity model',
        goodAt: 'Accurate enough to buy hardware and set budgets.',
        badAt: 'Takes days and needs measured data you rarely have in an interview.',
        pickWhen: 'You are planning a real launch with real traffic data.',
      },
      {
        option: 'Load test',
        goodAt: 'Shows real behavior, including bottlenecks nobody predicted.',
        badAt: 'Needs a working system, so it comes after design, not before.',
        pickWhen: 'The system exists and you need to confirm its capacity.',
      },
    ],
  },
  realWorld: {
    title: 'Twitter’s 25-times peak',
    body: 'In August 2013, Twitter’s engineering blog described a new record. On a typical day it took in more than 500 million Tweets, which the post works out to about 5,700 Tweets per second on average: the same divide-by-a-day step as this lesson. Then, during an airing of the film *Castle in the Sky* in Japan, Tweets hit a one-second peak of 143,199 per second.\n\nThat peak was about 25 times Twitter’s steady state. A system sized only for the average would have been 25 times too small for that second, which is why estimates always ask for the peak as well as the average.',
    sourceUrl: 'https://blog.x.com/engineering/en_us/a/2013/new-tweets-per-second-record-and-how',
    sourceLabel: 'Raffi Krikorian, “New Tweets per second record, and how!”, Twitter Engineering blog, August 2013',
  },
  interview: {
    whenToMention:
      'Right after requirements, in the first few minutes. Estimate only what shapes the design: requests per second to size servers, storage to pick a store, bandwidth when large files move, cache size when reads dominate. State the assumptions, do the math out loud, then say what the result means.',
    sayItLikeThis: [
      'Let’s assume 1 million daily users making about 100 requests each. That’s 10⁸ a day, and with about 10⁵ seconds in a day, roughly 1,000 requests per second, or 2,000 at peak.',
      'Writes are about 1 in 100, so 1 million photos a day at 1 MB is 1 TB a day, around 400 TB a year. That belongs in object storage, not in one database.',
      'Reads outnumber writes 100 to 1, so this is a read-heavy system: caching and a content delivery network will matter more than write speed.',
    ],
    followUps: [
      {
        q: 'How did you get from daily users to requests per second?',
        a: 'Daily users times requests per user gives requests per day: 10⁶ × 100 = 10⁸. A day is about 10⁵ seconds, so that is about 1,000 per second on average. I multiply by a peak factor, here 2, because capacity has to cover the busiest hour.',
      },
      {
        q: 'What happens to your estimates if photos get twice as big?',
        a: 'Requests per second do not change, because users do the same things. Storage, bandwidth and cache size double: about 4 PB over five years and 4 GB per second out at peak. That might push me to resize photos or lean harder on the content delivery network.',
      },
      {
        q: 'Your cache estimate says 20 TB. Is that realistic?',
        a: 'Not in one server’s memory, and it is an upper bound because it counts every view as a different photo. I’d cache photo details at about 1 KB each, roughly 20 GB, and serve the photos themselves from a content delivery network.',
      },
    ],
    redFlags: [
      'Diving into math without stating assumptions first.',
      'False precision, such as 1,157.4 requests per second.',
      'Sizing for the average and forgetting the peak.',
      'Mixing up bits and bytes, or kilobytes and megabytes.',
    ],
  },
  mistakes: [
    '**Skipping the assumptions.** Without them nobody can check your math, and a wrong guess hides inside the result.',
    '**Forgetting the peak.** Servers sized for the average fall over in the busiest hour.',
    '**Losing a factor of 8 or 1,000.** Networks count bits and storage counts bytes, and each unit step is a thousand.',
    '**Estimating everything.** Spend the minutes on numbers that change the design, and skip the rest.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'A rival app has 5 million daily users, each making about 20 requests a day. About how many requests per second is that on average?',
      answer: 1000,
      unit: 'requests per second',
      tolerance: 2,
      solution: [
        'Requests per day: 5,000,000 × 20 = 100,000,000, or 10⁸.',
        'A day is about 100,000 seconds, or 10⁵.',
        '10⁸ ÷ 10⁵ = 1,000 requests per second. With 86,400 seconds the exact answer is about 1,157.',
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A notes app saves 1 million new notes a day, each about 2 KB. About how many gigabytes of new storage does it need per year?',
      answer: 730,
      unit: 'GB per year',
      tolerance: 2,
      solution: ['Per day: 1,000,000 × 2 KB = 2,000,000 KB, which is 2 GB.', 'Per year: 2 GB × 365 = 730 GB.', 'Rounded, about 700 GB: under a terabyte a year.'],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram serves 100 million views a day. Using the 80/20 rule, how many gigabytes would a cache need to hold 20% of a day’s views of 1 KB photo records?',
      answer: 20,
      unit: 'GB',
      tolerance: 2,
      solution: [
        '20% of a day’s reads: 0.2 × 100,000,000 = 20,000,000 records.',
        '20,000,000 × 1 KB = 20,000,000 KB, which is 20 GB.',
        'That fits in one large server’s memory.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Why do estimates use a day of 100,000 seconds instead of 86,400?',
      options: [
        {
          text: 'Dividing by a power of ten is easy, and the error is small next to the guesses in the assumptions',
          correct: true,
          why: 'Rounding up to 10⁵ makes rates about 14% low, far inside the uncertainty of the inputs, and it saves time for the design.',
        },
        { text: 'Servers are idle for part of every day', correct: false, why: 'Idle time has nothing to do with it; the 10⁵ is rounding to make division easy.' },
        {
          text: 'It builds in headroom for peak traffic',
          correct: false,
          why: 'It does the opposite: a longer day makes the average slightly lower. Peaks get their own peak factor.',
        },
        { text: 'Interviewers penalize exact arithmetic', correct: false, why: 'Exact arithmetic is fine, just slow. Rounding saves minutes you need for the design.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram doubles the size of every photo. Which estimates double?',
      options: [
        { text: 'Storage per year', correct: true, why: 'Storage is writes × object size, so it doubles.' },
        { text: 'Outgoing bandwidth', correct: true, why: 'Bandwidth is reads per second × object size, so it doubles.' },
        { text: 'Cache size', correct: true, why: 'The cache holds 20% of a day’s reads × object size, so it doubles too.' },
        { text: 'Requests per second', correct: false, why: 'Users make the same number of requests; each one just carries more data.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps for estimating storage in order.',
      items: [
        'State daily active users and actions per user',
        'Work out requests per day',
        'Split requests into reads and writes',
        'Multiply writes per day by object size',
        'Multiply by 365 and by the years you keep the data',
      ],
      why: 'Users give requests, the read/write ratio gives writes, and only writes create stored data, which then piles up over the retention period.',
    },
  ],
  takeaways: [
    'Requests per second ≈ daily users × actions per user ÷ 10⁵, multiplied by a peak factor to size for the busiest hour.',
    'Storage comes from writes × object size × time kept, bandwidth from requests per second × object size, and cache size from about 20% of a day’s reads.',
    'State assumptions first, round to one or two significant figures, and aim for the right order of magnitude.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**From monthly to daily users.** Prompts often give [[monthly active users|monthly-active-users]]. Daily users are some fraction of them, so state the fraction you assume, such as half.',
    },
    {
      kind: 'prose',
      md: '**How many servers.** Divide peak requests per second by what one server handles, measured or assumed, then add headroom. If one server handles 500 requests per second, 2,000 at peak needs 4, so run 5 or 6; treat the 500 as a placeholder until you measure.',
    },
    {
      kind: 'prose',
      md: '**Requests in flight.** [[Little’s law|littles-law]] says requests in progress equal arrival rate × time per request: 2,000 per second × 0.1 s = 200 at once. It tells you how many connections or worker threads to plan for.',
    },
  ],
  flashcards: [
    { front: 'How many seconds are in a day, and what do you round it to?', back: '86,400, rounded to 100,000 (10⁵) for estimates.' },
    { front: 'How do you get average requests per second from daily active users?', back: 'Daily users × actions per user gives requests per day; divide by about 10⁵ seconds.' },
    { front: 'What is a peak factor?', back: 'The busiest hour’s traffic divided by the average. Size servers for the peak; 2 to 3 is a common ballpark.' },
    { front: 'How do you estimate storage per year?', back: 'Writes per day × object size × 365, then multiply by the years you keep the data.' },
    { front: 'How do you size a cache with the 80/20 rule?', back: 'Cache about 20% of a day’s reads: 0.2 × reads per day × object size. It is an upper bound.' },
    { front: 'Roughly what powers of ten are 2¹⁰, 2²⁰, 2³⁰ and 2⁴⁰?', back: '10³ (kilo), 10⁶ (mega), 10⁹ (giga) and 10¹² (tera).' },
    { front: 'How many bits are in a byte, and why does it matter?', back: 'Eight. Network links are rated in bits per second, so 1 GB per second is about 8 gigabits per second.' },
  ],
  related: ['latency-numbers', 'estimation-in-the-room', 'caching', 'storage-types', 'cdns', 'vertical-vs-horizontal-scaling'],
  glossaryTerms: [
    'daily-active-users',
    'requests-per-second',
    'bandwidth',
    'cache',
    'pareto-principle',
    'capacity-planning',
    'back-of-the-envelope',
    'read-write-ratio',
    'byte',
    'peak-factor',
    'data-retention',
    'cdn',
    'headroom',
    'object-storage',
    'working-set',
    'significant-figure',
    'order-of-magnitude',
    'monthly-active-users',
    'littles-law',
  ],
};

export default lesson;
