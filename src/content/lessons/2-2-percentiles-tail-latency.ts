import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** One unlucky home page load: four of the ten backend calls, one of them slow. */
const fanOut: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone', x: 0, y: 1.5 },
    { id: 'page', type: 'service', label: 'Page server', sublabel: 'builds the home page', x: 1, y: 1.5 },
    { id: 'feed', type: 'service', label: 'Feed', x: 2, y: 0 },
    { id: 'profile', type: 'service', label: 'Profile', x: 2, y: 1 },
    { id: 'stories', type: 'service', label: 'Stories', x: 2, y: 2 },
    { id: 'notif', type: 'service', label: 'Notifications', x: 2, y: 3 },
  ],
  edges: [
    { id: 'phone-page', from: 'phone', to: 'page', kind: 'sync' },
    { id: 'page-feed', from: 'page', to: 'feed', kind: 'sync' },
    { id: 'page-profile', from: 'page', to: 'profile', kind: 'sync' },
    { id: 'page-stories', from: 'page', to: 'stories', kind: 'sync' },
    { id: 'page-notif', from: 'page', to: 'notif', kind: 'sync' },
  ],
  // Phones: the page server under the phone, with its four calls fanning out to both sides.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      phone: { x: 1, y: 0 },
      page: { x: 1, y: 1 },
      feed: { x: 0, y: 1 },
      profile: { x: 2, y: 1 },
      stories: { x: 0, y: 2 },
      notif: { x: 2, y: 2 },
    },
    sides: { 'page-stories': { fromSide: 'bottom', toSide: 'right' }, 'page-notif': { fromSide: 'bottom', toSide: 'left' } },
  },
  steps: [
    {
      caption: 'Maya opens Snapgram. Her phone asks the **page server** for the home page.',
      flow: ['phone-page'],
      focus: ['phone', 'page'],
    },
    {
      caption:
        'The page server sends ten backend calls at once, one per part of the page. Four are shown here. This is fan-out: one request becomes many.',
      flow: [['page-feed', 'page-profile', 'page-stories', 'page-notif']],
    },
    {
      caption: 'Three answers come back in about 100 ms each, a perfectly typical time.',
      flow: [['<page-feed', '<page-profile', '<page-stories']],
      notes: [
        { target: 'feed', text: '≈ 100 ms', tone: 'plain' },
        { target: 'profile', text: '≈ 90 ms', tone: 'plain' },
        { target: 'stories', text: '≈ 110 ms', tone: 'plain' },
      ],
    },
    {
      caption:
        'The **notifications** call is the unlucky one: its first try hits a one-second [[timeout|timeout]] and has to be sent again. It answers after about 1.1 seconds.',
      flow: [{ edge: 'page-notif', reverse: true, tone: 'alert', tag: '1.1 s' }],
      focus: ['page', 'notif'],
    },
    {
      caption: 'The page can only finish when its slowest call does. Maya waits more than a second, even though nine calls in ten were quick.',
      flow: ['<phone-page'],
      focus: ['phone', 'page'],
      notes: [{ target: 'phone', text: '≈ 1.2 s', tone: 'alert' }],
    },
  ],
};

/** A hedged request: ask a second copy when the first is slow, keep the first answer. */
const hedged: SequenceSpec = {
  actors: [
    { id: 'page', type: 'service', label: 'Page server' },
    { id: 'a', type: 'service', label: 'Feed, copy A' },
    { id: 'b', type: 'service', label: 'Feed, copy B' },
  ],
  messages: [
    { from: 'page', to: 'a', label: 'GET /feed', kind: 'sync', caption: 'The page server asks one copy of the feed service, as usual.' },
    {
      from: 'page',
      to: 'b',
      label: 'GET /feed (backup)',
      kind: 'sync',
      caption:
        'No answer after 50 ms, which is longer than 95% of feed calls take. So it sends the same request to a second copy: a [[hedged request|hedged-request]].',
    },
    { from: 'b', to: 'page', label: 'feed, 40 ms', kind: 'reply', caption: 'The second copy answers quickly, and the page uses whichever answer arrives first.' },
    {
      from: 'page',
      to: 'a',
      label: 'cancel',
      kind: 'async',
      caption: 'It cancels the first request, which was stuck behind a slow disk. Only the slowest 5% or so of calls get a backup, so the extra load stays small.',
    },
  ],
};

const lesson: Lesson = {
  id: 'percentiles-tail-latency',
  module: 'm2',
  order: 2,
  title: 'Percentiles and tail latency',
  idea: 'An average hides the slow requests people actually notice, so you describe latency with percentiles such as p50 and p99, and watch how fan-out makes the slow tail common.',
  minutes: 15,
  prerequisites: ['latency-throughput-bandwidth'],
  outcomes: [
    'Read p50, p95 and p99 from a set of latencies, and say what each one tells you.',
    'Explain why an average can look healthy while some users wait seconds.',
    'Calculate how fan-out turns a rare slow call into a common slow page.',
  ],
  analogy: {
    title: 'One slow order in a coffee line',
    body: 'At a coffee shop, most orders take a minute: a drip coffee, a tea. Then someone orders six custom drinks for the office, and the line stops for ten minutes. Everyone behind that order waits, even though their own drinks are quick.\n\nIf the shop reported its average wait, the number would look fine, because one long order spread across a hundred quick ones barely moves it. Ask instead how long the slowest few customers waited, and you see the morning everyone complains about.',
  },
  whyItMatters:
    'Snapgram’s dashboard looks great: the average home page loads in 200 ms. Yet the support inbox fills with messages like “the app froze for a few seconds again.” The founders dig into the raw [[latency|latency]] numbers and find that one load in a hundred takes about 3 seconds.\n\nThe average was hiding it. And the home page does not load alone: it [[fans out|fan-out]] to ten backend calls, for the feed, stories, notifications and the rest, and it can only finish when the slowest one does.',
  body: [
    { kind: 'heading', text: 'Why averages lie' },
    {
      kind: 'prose',
      md: 'Here are ten home page loads, in milliseconds, sorted from fastest to slowest: 110, 120, 130, 140, 150, 160, 170, 190, 220 and 3,000. Nine people waited less than a quarter of a second, and one waited three seconds.',
    },
    {
      kind: 'prose',
      md: 'Their [[mean|mean]], the average, is 439 ms, a number that describes nobody on the list. In Snapgram’s real traffic the slow loads are one in a hundred, not one in ten, so they lift the average only from about 170 ms to 200 ms. The dashboard stays green while one user in a hundred stares at a frozen screen.',
    },
    { kind: 'heading', text: 'Percentiles' },
    {
      kind: 'prose',
      md: 'A [[percentile|percentile]] asks a better question: how slow is it for the unluckiest share of users? Sort the measurements and read the value a given share of the way up. The 50th percentile, or p50, is the [[median|median]]: half the requests are faster. The 99th percentile, p99, is the time that only one request in a hundred exceeds.',
    },
    {
      kind: 'table',
      columns: ['Measure', 'What it tells you', 'Snapgram’s home page'],
      rows: [
        ['p50 (median)', 'Half of loads are faster: the typical experience', '≈ 160 ms'],
        ['p95', '1 load in 20 is slower than this', '≈ 300 ms'],
        ['p99', '1 load in 100 is slower than this', '≈ 3 s'],
        ['Mean', 'Total time divided by the number of loads', '≈ 200 ms'],
      ],
      caption: 'Snapgram’s numbers, illustrative. Only the p99 row shows the problem users are writing in about.',
    },
    {
      kind: 'prose',
      md: 'The slowest requests are called the [[tail latency|tail-latency]], after the long, thin end of a latency [[histogram|histogram]]. Teams watch p50 for the typical experience and p99 or p99.9 for the tail. The tail matters more than its size suggests: someone who loads 100 pages a day will hit a one-in-a-hundred delay on most days.',
    },
    {
      kind: 'prose',
      md: 'Most requests take the fast path, and a few do not. The data was not in the [[cache|cache]], the server paused to clean up memory, the request waited in line behind a big one, or a call timed out and had to be retried. A retry after a one-second timeout turns a 100 ms call into one that takes over a second.',
    },
    { kind: 'heading', text: 'Fan-out makes the tail common' },
    {
      kind: 'prose',
      md: 'Snapgram’s home page makes ten backend calls in parallel, and it can only finish when the slowest one does. Step through one unlucky load.',
    },
    {
      kind: 'diagram',
      title: 'One slow call holds up the page',
      caption: 'A home page load with four of its ten calls shown. Use Play, or the arrow keys.',
      spec: fanOut,
    },
    {
      kind: 'prose',
      md: 'If each call is slow one time in a hundred, the chance that all ten are fast is 0.99 multiplied by itself ten times: about 90%. So about one page in ten waits on a slow call. With 100 calls, 63% of pages do, and the rare case has become the normal one.',
    },
    {
      kind: 'code',
      code: 'chance a page is slow = 1 − (chance one call is fast) ^ number of calls\n\n 10 calls:  1 − 0.99^10  ≈ 10%\n100 calls:  1 − 0.99^100 ≈ 63%',
      caption: 'Every call must be fast for the page to be fast. This assumes calls are slow independently of each other.',
    },
    {
      kind: 'prose',
      md: 'The same arithmetic explains Snapgram’s one in a hundred. If each of the ten calls is slow only one time in a thousand, 1 − 0.999^10 is about 1%. ==A page is only as fast as its slowest call==, so each backend needs a much better tail than the page.',
    },
    { kind: 'heading', text: 'Taming the tail' },
    {
      kind: 'prose',
      md: 'You cannot remove every slow call, but you can stop one from stalling the page. Give each call a timeout and show the page without the parts that miss it. Make fewer calls, or cache their answers. For reads that several copies of a service can answer, send a backup request when the first one is slow.',
    },
    {
      kind: 'sequence',
      title: 'A hedged request',
      caption: 'Asking a second copy of the feed service when the first is slow.',
      spec: hedged,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real latency data shifts with the time of day and differs from one endpoint to the next, so teams track percentiles per endpoint and over time. The fan-out formula assumes calls are slow independently of each other; in real systems one busy database can slow many calls at once.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'percentile-histogram',
      title: 'Drag the percentile marker',
      caption:
        'Ten thousand backend calls from a simulation: most take about 100 ms, and about one in a hundred hits a one-second timeout and is retried. Drag the marker from p50 toward p99 and watch where it jumps, then raise the calls per page and switch to the page view.',
      props: { calls: 10, percentile: 90 },
    },
  ],
  tradeoffs: {
    caption: 'Ways to keep slow calls from becoming slow pages.',
    rows: [
      {
        option: 'Timeouts with a fallback',
        goodAt: 'Caps how long one slow call can stall the page; the page shows without that part.',
        badAt: 'Users sometimes see a piece missing, and a timeout set too short gives up on calls that would have worked.',
        pickWhen: 'Part of the page is optional, like suggestions or a notification count.',
      },
      {
        option: 'Hedged requests',
        goodAt: 'Cuts the tail sharply for a small amount of extra load.',
        badAt: 'Only safe for requests that can run twice, such as reads, and the extra copies add load.',
        pickWhen: 'Several copies can answer and the tail comes from occasional slow servers.',
      },
      {
        option: 'Fewer, larger calls',
        goodAt: 'Fewer chances to hit a slow call.',
        badAt: 'Each call does more work, and services become more tangled together.',
        pickWhen: 'A page makes many small calls that could be combined.',
      },
      {
        option: 'Caching responses',
        goodAt: 'Most requests skip the slow path entirely.',
        badAt: 'Cached data can be stale, and a miss still pays the full price.',
        pickWhen: 'The same answers are asked for often and can be a little old.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s tail at scale',
    body: 'In “The Tail at Scale” (2013), Google’s Jeffrey Dean and Luiz André Barroso describe this exact effect. Take a server that usually answers in 10 ms but has a 99th-percentile latency of one second. A user request handled by one such server is slow one time in a hundred, but a request that must collect answers from 100 of them in parallel takes more than a second 63% of the time.\n\nThey also report measurements from a real Google service with a large fan-out. One random leaf request finished in 10 ms at the 99th percentile, but waiting for all of a request’s leaf requests took 140 ms at the same percentile. Because slowness at that scale cannot be removed entirely, they argue for systems that work around it, with techniques such as hedged requests.',
    sourceUrl: 'https://research.google/pubs/the-tail-at-scale/',
    sourceLabel: 'Dean and Barroso, “The Tail at Scale,” Communications of the ACM (2013)',
  },
  interview: {
    whenToMention:
      'Whenever you state a latency requirement or design a page that calls several services. Give latency targets as percentiles, such as p99 under 300 ms, never as averages. When your design fans out, point out that the slowest call sets the page’s speed, and say how you will contain it.',
    sayItLikeThis: [
      'Let’s set a [[service level objective|slo]] (SLO) of p99 under 300 ms for the home feed. An average would hide the slow loads our heaviest users hit every day.',
      'The home page fans out to ten services, so if each is slow one time in a hundred, about one page in ten is slow. I’d give each call a timeout and render the page without the optional parts that miss it.',
      'For feed reads I’d use hedged requests: if a copy hasn’t answered by our p95, send the same read to another copy and take the first answer.',
    ],
    followUps: [
      {
        q: 'Why not just report the average latency?',
        a: 'A few very slow requests barely move it, so it can look healthy while some users wait seconds. Percentiles show the typical case and the bad cases separately, and users remember the bad cases.',
      },
      {
        q: 'Your p50 is 50 ms but your p99 is 2 seconds. Where would you look?',
        a: 'At what the slow requests have in common: an endpoint, a server, a time of day or a kind of user. Typical causes are cache misses, memory clean-up pauses, queueing behind big requests and retries after timeouts. Tracing a few slow requests end to end usually shows which call ate the time.',
      },
      {
        q: 'How does fan-out change your latency targets?',
        a: 'If a page needs ten calls, it is slow whenever any one of them is. So each backend needs a much stricter target than the page, often at p99.9, or the page must tolerate slow calls with timeouts, fallbacks or hedged requests.',
      },
    ],
    redFlags: [
      'Setting or reporting latency goals as averages.',
      'Assuming a page that calls many services is as fast as a typical call.',
      'Adding retries with no timeouts or limits, which turns slow calls into extra load.',
    ],
  },
  mistakes: [
    '**Trusting the average.** A handful of very slow requests barely move it, so it hides exactly the slowness users complain about.',
    '**Averaging percentiles.** The p99 of the whole system is not the average of each server’s p99; combine the raw measurements, then compute the percentile.',
    '**Measuring only the backend.** Users feel the whole page, including fan-out and the network, so measure from the user’s side too.',
    '**Ignoring fan-out.** Ten calls that are each slow 1% of the time make about one page in ten slow.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Nine requests take 100 ms each and a tenth takes 2,000 ms. Which statement is true?',
      options: [
        {
          text: 'The median is 100 ms and the mean is 290 ms',
          correct: true,
          why: 'Sorted, the middle values are both 100 ms. The total is 2,900 ms over ten requests, so the mean is 290 ms.',
        },
        { text: 'The median is 290 ms', correct: false, why: 'That is the mean. The median is the middle value of the sorted list, which is 100 ms.' },
        { text: 'The mean is 100 ms', correct: false, why: 'The one slow request adds 1,900 ms to the total, which lifts the mean to 290 ms.' },
        {
          text: 'The mean and the median are always equal',
          correct: false,
          why: 'They match only when values are spread evenly around the middle. A long tail pulls the mean up and leaves the median alone.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'A page makes 20 backend calls in parallel, and each call is slower than its p99 one time in a hundred. To the nearest percent, what share of pages wait on at least one slow call?',
      answer: 18,
      unit: '%',
      tolerance: 1.1,
      solution: [
        'Each call is fast 99% of the time, so all 20 are fast with chance 0.99^20.',
        '0.99^20 ≈ 0.818.',
        '1 − 0.818 ≈ 0.18, so about 18% of pages wait on a slow call.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these make a page’s tail latency worse?',
      options: [
        {
          text: 'The page waits for 50 backend calls instead of 5',
          correct: true,
          why: 'Every extra call is another chance to hit a slow one, and the page waits for the slowest.',
        },
        {
          text: 'A call is retried only after a one-second timeout',
          correct: true,
          why: 'The retried call takes more than a second in total, and that slow case lands in the tail.',
        },
        {
          text: 'Popular answers are cached',
          correct: false,
          why: 'Cache hits skip the slow path, which makes slow calls rarer.',
        },
        {
          text: 'A backup request goes to a second copy when the first is slow',
          correct: false,
          why: 'That is a hedged request. It shortens the tail by taking whichever answer comes first.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'A dashboard says p99 = 800 ms. What does that mean?',
      options: [
        { text: '99% of requests took 800 ms or less', correct: true, why: 'That is the definition: only 1% of requests were slower.' },
        { text: 'The average request took 800 ms', correct: false, why: 'The average is the mean, which is a different measure and often much lower.' },
        { text: 'Exactly 99 requests took 800 ms', correct: false, why: 'A percentile describes a share of requests, not a count of requests with one exact time.' },
        { text: 'The slowest request took 800 ms', correct: false, why: 'One request in a hundred was slower than 800 ms; the slowest may have taken far longer.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a hedged request in order.',
      items: [
        'Send the request to one copy of the service',
        'Wait about as long as the usual p95 latency without an answer',
        'Send the same request to a second copy',
        'Use whichever answer arrives first and cancel the other request',
      ],
      why: 'Waiting until the p95 time first means only the slowest few percent of requests send a backup, so the extra load stays small while the tail shrinks.',
    },
  ],
  takeaways: [
    'Averages hide slow requests, so describe latency with percentiles such as p50, p95 and p99.',
    'Fan-out makes the tail common: a page waiting on N calls is slow if any one is, so 1 − 0.99^N of pages hit a p99 call.',
    'You cannot remove every slow call, so contain them with timeouts, fewer calls, caching and hedged requests.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Percentiles do not add up or average.** The p99 of a whole fleet is not the average of each server’s p99, and a page’s p99 is not the sum of its calls’ p99s. Monitoring systems keep histograms of the raw measurements, or compact summaries of them, so they can compute any percentile across any group.',
    },
    {
      kind: 'prose',
      md: '**Measure on a schedule.** A load test that waits for each response before sending the next request quietly skips the requests that would have been sent during a stall. Its percentiles then look better than what real users get, so send requests on a fixed schedule instead.',
    },
    {
      kind: 'prose',
      md: '**Hedging in practice.** Dean and Barroso describe waiting until the first request has been outstanding longer than the 95th-percentile latency for that kind of request before sending the backup. They report that this limits the extra load to about 5% while shortening the tail substantially.',
    },
  ],
  flashcards: [
    { front: 'What does p99 latency mean?', back: 'The time that only 1 request in 100 exceeds: 99% of requests are this fast or faster.' },
    { front: 'Why can an average latency mislead?', back: 'A few very slow requests barely move it, so it can look healthy while some users wait seconds.' },
    { front: 'What is the median?', back: 'The middle value: half the measurements are faster and half slower. It is the 50th percentile, p50.' },
    { front: 'What is tail latency?', back: 'The latency of the slowest requests, usually measured at p99 and above.' },
    {
      front: 'A page makes 10 parallel calls, each slower than its p99 1% of the time. What share of pages hit a slow call?',
      back: 'About 10%: 1 − 0.99^10 ≈ 9.6%. With 100 calls it is about 63%.',
    },
    { front: 'What is a hedged request?', back: 'A backup copy of a slow request sent to a second server; the caller uses whichever answer arrives first.' },
    { front: 'Name three common causes of tail latency.', back: 'Cache misses, pauses to clean up memory, waiting behind big requests, and retries after timeouts.' },
  ],
  related: ['latency-throughput-bandwidth', 'availability-nines', 'caching', 'load-balancers', 'timeouts-retries-backoff'],
  glossaryTerms: [
    'latency',
    'fan-out',
    'mean',
    'percentile',
    'median',
    'tail-latency',
    'histogram',
    'cache',
    'timeout',
    'hedged-request',
    'slo',
  ],
};

export default lesson;
