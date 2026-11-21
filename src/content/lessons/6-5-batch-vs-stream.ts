import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The two paths from the same events: a stream for trending, a nightly batch for recaps. */
const pipeline: DiagramSpec = {
  grid: { cols: 5, rows: 2 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 0 },
    { id: 'upload', type: 'service', label: 'Upload service', x: 1, y: 0 },
    { id: 'events', type: 'stream', label: 'Post events', sublabel: 'event stream', x: 2, y: 0 },
    { id: 'proc', type: 'worker', label: 'Stream processor', sublabel: '5-minute windows', x: 3, y: 0 },
    { id: 'trending', type: 'cache', label: 'Trending', sublabel: 'top hashtags', x: 4, y: 0 },
    { id: 'archive', type: 'objectStore', label: 'Archive', sublabel: 'every event', x: 2, y: 1 },
    { id: 'batch', type: 'worker', label: 'Nightly batch', x: 3, y: 1 },
    { id: 'recaps', type: 'nosqlDb', label: 'Recaps', sublabel: 'year in photos', x: 4, y: 1 },
  ],
  edges: [
    { id: 'phones-upload', from: 'phones', to: 'upload', kind: 'sync' },
    { id: 'upload-events', from: 'upload', to: 'events', kind: 'async' },
    { id: 'events-proc', from: 'events', to: 'proc', kind: 'async' },
    { id: 'proc-trending', from: 'proc', to: 'trending', kind: 'sync' },
    { id: 'events-archive', from: 'events', to: 'archive', kind: 'async' },
    { id: 'archive-batch', from: 'archive', to: 'batch', kind: 'sync' },
    { id: 'batch-recaps', from: 'batch', to: 'recaps', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Every new post becomes an event on the **post events** stream.',
      flow: ['phones-upload', 'upload-events'],
    },
    {
      caption: 'The **stream processor** adds each event to its hashtag’s count in the current five-minute window, and publishes the counts to **trending** when the window is complete.',
      flow: ['events-proc', 'proc-trending'],
      notes: [{ target: 'proc', text: '#sunset +1' }],
    },
    {
      caption: 'The same events land in the **archive**. Each night the **nightly batch** reads a whole year at once and builds every recap from complete data.',
      flow: ['events-archive', 'archive-batch', 'batch-recaps'],
    },
  ],
};

/** A MapReduce job counting hashtags across a year of posts. */
const mapReduce: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'archive', type: 'objectStore', label: 'Posts archive', sublabel: 'a year of posts', x: 0, y: 1 },
    { id: 'map1', type: 'worker', label: 'Map 1', x: 1, y: 0.5 },
    { id: 'map2', type: 'worker', label: 'Map 2', x: 1, y: 1.5 },
    { id: 'red1', type: 'worker', label: 'Reduce 1', sublabel: '#a to #m', x: 2, y: 0 },
    { id: 'red2', type: 'worker', label: 'Reduce 2', sublabel: '#n to #z', x: 2, y: 2 },
    { id: 'out', type: 'objectStore', label: 'Results', sublabel: 'count per hashtag', x: 3, y: 1 },
  ],
  edges: [
    { id: 'a-m1', from: 'archive', to: 'map1', kind: 'sync' },
    { id: 'a-m2', from: 'archive', to: 'map2', kind: 'sync' },
    { id: 'm1-r1', from: 'map1', to: 'red1', kind: 'sync' },
    { id: 'm1-r2', from: 'map1', to: 'red2', kind: 'sync' },
    { id: 'm2-r1', from: 'map2', to: 'red1', kind: 'sync' },
    { id: 'm2-r2', from: 'map2', to: 'red2', kind: 'sync' },
    { id: 'r1-out', from: 'red1', to: 'out', kind: 'sync' },
    { id: 'r2-out', from: 'red2', to: 'out', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'The **posts archive** is cut into chunks, and each **map** worker reads its own. A thousand workers read a thousand chunks at once.',
      flow: [['a-m1', 'a-m2']],
    },
    {
      caption: 'Map: for every post, a worker emits one pair per hashtag, such as `(#sunset, 1)`. Workers never talk to each other.',
      focus: ['map1', 'map2'],
      notes: [
        { target: 'map1', text: '(#sunset, 1)' },
        { target: 'map2', text: '(#coffee, 1)' },
      ],
    },
    {
      caption: 'Shuffle: pairs are sorted and sent by key, so every `#sunset` pair reaches the same **reduce** worker.',
      flow: [['m1-r1', 'm1-r2', 'm2-r1', 'm2-r2']],
    },
    {
      caption: 'Reduce: each reduce worker adds up the values for its hashtags and writes one total per hashtag to the **results**.',
      flow: [['r1-out', 'r2-out']],
      notes: [{ target: 'out', text: 'exact counts' }],
    },
    {
      caption: 'A machine fails halfway. The framework reruns its chunk on another machine; the input never changes, so the rerun emits the same pairs.',
      fail: ['map2'],
      flow: [{ edge: 'a-m1', tag: 'chunk 2 again' }],
    },
  ],
};

/** One window's result, a late post that updates it, and one that comes too late. */
const latePosts: SequenceSpec = {
  actors: [
    { id: 'phones', type: 'client', label: 'Phones' },
    { id: 'proc', type: 'worker', label: 'Stream processor' },
    { id: 'trending', type: 'cache', label: 'Trending' },
  ],
  messages: [
    {
      from: 'phones',
      to: 'proc',
      label: '#sunset, posted 18:12',
      kind: 'async',
      caption: 'A post made at 18:12:18 arrives a moment later and joins the 18:10 to 18:15 window, which is still collecting.',
    },
    {
      from: 'proc',
      to: 'trending',
      label: '18:10–18:15: 4 posts',
      kind: 'async',
      caption: 'At 18:16 the watermark, one minute behind, passes 18:15. The window publishes a count of 4.',
    },
    {
      from: 'phones',
      to: 'proc',
      label: '#sunset, posted 18:14',
      kind: 'async',
      caption: 'A post made at 18:14:18 on a subway train arrives at 18:16:54, after its window published: a late event.',
    },
    {
      from: 'proc',
      to: 'trending',
      label: '18:10–18:15: 5 posts',
      kind: 'async',
      caption: 'Allowed lateness is five minutes, so the window is still held. The processor publishes a corrected count of 5.',
    },
    {
      from: 'phones',
      to: 'proc',
      label: '#sunset, posted 18:08',
      kind: 'async',
      caption: 'At 18:41 a phone that was offline sends a post from 18:08. Its window is long gone, so the stream drops it; the nightly batch will still count it.',
    },
  ],
  groups: [{ label: '18:10–18:15 window', from: 1, to: 4 }],
};

const lesson: Lesson = {
  id: 'batch-vs-stream',
  module: 'm6',
  order: 5,
  title: 'Batch vs. stream processing',
  idea: 'Batch processing computes exact answers over a complete pile of collected data on a schedule, while stream processing updates answers continuously as events arrive, trading some completeness for freshness.',
  minutes: 15,
  prerequisites: ['queues-and-streams', 'time-and-ordering'],
  outcomes: [
    'Explain how a MapReduce-style batch job splits work into map, shuffle and reduce steps, and when a nightly batch is the right tool.',
    'Describe tumbling and sliding windows, and how event time, watermarks and allowed lateness decide which late events still count.',
    'Choose batch, stream or both for a feature, and say what each costs in freshness, completeness and complexity.',
  ],
  analogy: {
    title: 'Laundry day vs. washing each dish',
    body: 'You do laundry once a week. Clothes pile up, and on Sunday you wash them all in one big, efficient load: nothing is clean until Sunday, but the work per shirt is small, and a bad load can simply be run again.\n\nDishes are different. You wash each one right after using it, so a clean mug is always ready, at more effort per item. It gets awkward when a dirty cup turns up after you have put everything away: unpack the rack for one cup, or leave it for tomorrow?\n\nBatch processing is the laundry. Stream processing is the dishes, late cup included.',
  },
  whyItMatters:
    'Snapgram has about 50 million daily users, and two new features need numbers computed from everything people post. “Your year in photos”, a recap for every user, is built overnight by a [[batch processing|batch-processing]] job. Trending hashtags must be fresh within minutes, so a [[stream processing|stream-processing]] job counts hashtags in five-minute windows.\n\nTrending goes live, and some counts come out a little low. Phones that were offline, on a plane or in the subway, upload their posts minutes or hours late, after their window’s count was published. Should the stream wait for them, fix the published count, or ignore them?',
  body: [
    {
      kind: 'prose',
      md: 'Both features read the same posts; the difference is when. A batch job works on **bounded** data, a fixed pile such as yesterday’s posts that is complete before the job starts. A stream processor works on **unbounded** data that never finishes arriving.\n\nEvery post becomes an [[event|event]] on an [[event stream|event-stream]]: the stream processor reads it within seconds, and a copy goes to cheap [[object storage|object-storage]] for the nightly batch.',
    },
    {
      kind: 'diagram',
      title: 'Two paths from the same events',
      caption: 'One post’s two paths: trending within minutes, recaps overnight.',
      spec: pipeline,
    },
    { kind: 'heading', text: 'Batch: process the whole pile' },
    {
      kind: 'prose',
      md: 'A batch job is simple to reason about. Its input is fixed when it starts, so it can read everything and produce an exact answer, and after a bug you fix the code and run it again. The price is freshness: results are only as new as the last run, usually hours old.',
    },
    {
      kind: 'prose',
      md: 'Big batch jobs spread the work over many machines, classically with [[MapReduce|mapreduce]], the model Google described in 2004 and Apache Hadoop later brought to open source. You write two small functions, and the framework does the rest:\n\n- **Map** turns each record into key and value pairs: one `(hashtag, 1)` pair per hashtag in a post.\n- **[[Shuffle|shuffle]]** sends each pair over the network to the machine responsible for its key, so all the `#sunset` pairs meet.\n- **Reduce** combines the values for each key: here, it adds them up.',
    },
    {
      kind: 'diagram',
      title: 'Counting hashtags with MapReduce',
      caption: 'Two map and two reduce workers stand in for thousands.',
      spec: mapReduce,
    },
    {
      kind: 'prose',
      md: 'Each map worker handles one [[partition|partition]] of the input, so a bigger job just means more chunks and more machines, and a failure costs one chunk, not the whole job.',
    },
    { kind: 'heading', text: 'Stream: one event at a time, in windows' },
    {
      kind: 'prose',
      md: 'A stream processor, such as Apache Flink or Kafka Streams, keeps running state in memory and updates it with every event. Trending means *in the last few minutes*, so the processor groups events into windows of time and emits one result per window.\n\nA [[tumbling window|tumbling-window]] has a fixed size and starts where the previous one ended (18:00 to 18:05, then 18:05 to 18:10), so every event lands in exactly one. A [[sliding window|sliding-window]] also has a fixed size, but a new one starts every *slide*, such as ten-minute windows every five minutes, so windows overlap and an event counts in several.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Tumbling windows',
        summary: 'Fixed size, back to back',
        points: ['No overlap: each event counts once.', 'One result per period, such as every five minutes.', 'A burst across a boundary is split in two.'],
      },
      right: {
        title: 'Sliding windows',
        summary: 'Fixed size, a new one every slide',
        points: ['Overlapping: each event counts in size ÷ slide windows.', 'Smoother results, updated every slide.', 'More windows to keep, so more memory.'],
      },
      caption: 'A slide equal to the size gives tumbling windows. Session windows, also common, close after a gap with no events.',
    },
    { kind: 'heading', text: 'Event time, late events and watermarks' },
    {
      kind: 'prose',
      md: 'Every post carries two times. [[Event time|event-time]] is when it happened, on the phone; [[processing time|processing-time]] is when the stream processor sees it. Usually they are a second apart, but a phone in the subway holds a post for minutes, and one on a plane for hours.\n\nWindows should use event time; otherwise a post made at 18:14 counts in whatever window is open when it arrives, and replays give different answers. Event time comes from the phone’s clock, which can be off ([[clock skew|clock-skew]]), so servers often sanity-check it against the arrival time.',
    },
    {
      kind: 'prose',
      md: 'So when is the 18:10 to 18:15 window finished? The processor can never be sure no more of its posts are coming. A [[watermark|watermark]] is its working assumption, a moving time that says no events older than this are expected; when it passes 18:15, the window publishes.\n\nA common rule keeps the watermark a fixed delay, say one minute, behind the newest event time seen. A longer delay means fewer stragglers but later results: completeness costs freshness.',
    },
    {
      kind: 'prose',
      md: 'An event that arrives after its window has published is a [[late event|late-event]]. Keep each window a while longer, its [[allowed lateness|allowed-lateness]], and a late event updates the published result; anything later is dropped or sent to a separate stream. Apache Flink, for example, drops late events unless you configure allowed lateness, which starts at zero.',
    },
    {
      kind: 'sequence',
      title: 'A window, a late post and a very late one',
      caption: 'Five-minute windows, a one-minute watermark delay and five minutes of allowed lateness.',
      spec: latePosts,
    },
    {
      kind: 'prose',
      md: 'Whoever reads the results must expect corrections: an updated count replaces the earlier one rather than adding to it. And the posts the stream dropped are not lost. They sit in the archive, where the nightly batch counts them.',
    },
    { kind: 'heading', text: 'Running both' },
    {
      kind: 'prose',
      md: 'Many teams run both over the same events: the stream for fast, approximate answers, the batch for exact ones that replace them later. This is the [[lambda architecture|lambda-architecture]], and its cost is two code paths that compute the same thing and drift apart.\n\nThe [[kappa architecture|kappa-architecture]] keeps one stream pipeline and recomputes history by replaying the event log through it, which needs a log that keeps months of events. Either way, batch remains the natural tool for a [[backfill|backfill]] and for [[reconciliation|reconciliation]], checking the fast numbers against exact ones.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Left out: how stream processors survive crashes (they checkpoint their state and replay events from the stream), how they split work across machines by key, and joins between streams. Real watermarks also differ per data source and can stall when a source goes quiet.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'stream-windows',
      title: 'Windows, watermarks and late posts',
      caption:
        'Twenty-six posts from 18:00 to 18:30, six of them delayed. Play the arrivals, then change the window settings to see which late posts update a count and which are dropped.',
      props: { kind: 'tumbling', size: 5, watermarkDelay: 1, allowedLateness: 0 },
    },
  ],
  tradeoffs: {
    caption: 'Batch, stream, or both.',
    rows: [
      {
        option: 'Batch jobs',
        goodAt: 'Exact, complete answers; easy to rerun after a bug; cheap per record.',
        badAt: 'Results are hours old, and a failed run delays everything.',
        pickWhen: 'Recaps, reports and billing: anything that must be right more than fresh.',
      },
      {
        option: 'Stream processing',
        goodAt: 'Fresh results within seconds.',
        badAt: 'Must decide when a window is complete; late events, state and crashes make exact answers hard.',
        pickWhen: 'Trending lists, live counters, alerts and fraud checks.',
      },
      {
        option: 'Both (lambda architecture)',
        goodAt: 'Fresh numbers now, replaced by exact ones later.',
        badAt: 'Two code paths computing the same thing, which drift apart.',
        pickWhen: 'Fresh numbers matter now and exact ones later, such as views that drive payouts.',
      },
      {
        option: 'One stream with replay (kappa architecture)',
        goodAt: 'One code path; history is recomputed by replaying the log.',
        badAt: 'Needs a log that keeps months of events, and fast replays.',
        pickWhen: 'The log already keeps history, and old and new data need the same logic.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s MapReduce',
    body: 'In a 2004 paper, Jeffrey Dean and Sanjay Ghemawat of Google described MapReduce. Programmers write a map function, which turns a key and value pair into a set of intermediate pairs, and a reduce function, which merges all the intermediate values that share a key. The run-time system takes care of the rest: splitting the input, scheduling work across machines, handling machine failures and managing communication between machines.\n\nThe paper reports that a typical MapReduce computation processed many terabytes of data on thousands of machines, and that upwards of one thousand MapReduce jobs ran on Google’s clusters every day.',
    sourceUrl: 'https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/',
    sourceLabel: 'Dean and Ghemawat, “MapReduce: Simplified Data Processing on Large Clusters,” OSDI 2004',
  },
  interview: {
    whenToMention:
      'Whenever a design computes numbers from many events: analytics, counters, trending lists or billing. Say whether each answer must be fresh or exact, then pick batch, stream or both, and bring up event time and watermarks if late data comes up.',
    sayItLikeThis: [
      'Trending must be fresh, so I’d count hashtags in a stream, in five-minute tumbling windows by event time.',
      'Each window publishes a minute after it ends and accepts late updates for ten more; the nightly batch produces the exact numbers.',
      'The yearly recap doesn’t need to be fresh, so a nightly batch job is simpler, cheaper and exact.',
    ],
    followUps: [
      {
        q: 'What happens to an event that arrives after its window has published?',
        a: 'Within the allowed lateness, the processor adds it and publishes a corrected result, so consumers must replace values, not add to them. After that it is dropped or sent to a separate stream, and the batch over the archive still counts it.',
      },
      {
        q: 'Why window by event time instead of arrival time?',
        a: 'Arrival time depends on networks, retries and offline phones, so the same events would land in different windows each time. Event time gives the same answer however late data arrives, at the cost of deciding when a window is complete: the watermark’s job.',
      },
      {
        q: 'How does a batch job survive machine failures?',
        a: 'The input is fixed and split into chunks, so the framework reruns a failed chunk on another machine. Map and reduce are deterministic, so the rerun gives the same output, which is why batch is the easy way to exact answers.',
      },
    ],
    redFlags: [
      'Grouping events by arrival time, so results change with network delays.',
      'Treating a window’s first result as final, with no plan for late events.',
      'Proposing a nightly batch job for something users expect to change within minutes.',
    ],
  },
  mistakes: [
    '**Windowing by arrival time.** A post made at 18:14 that arrives at 18:17 lands in the wrong window, and replays give different answers.',
    '**Waiting forever for stragglers.** A watermark far behind the clock makes results complete but late; most features need a deadline and a plan for late data.',
    '**Adding corrections instead of replacing.** A consumer that adds each updated count counts the same posts twice.',
    '**Two pipelines that quietly disagree.** Separate batch and stream code drifts apart; share the logic or reconcile the results.',
    '**Forgetting that windows are state.** Open windows live in the processor’s memory; without checkpoints, a crash loses them.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'Five-minute tumbling windows, a watermark one minute behind and no allowed lateness. A #sunset post made at 18:14:18 arrives at 18:16:54. What happens to it?',
      options: [
        {
          text: 'It is dropped: its window published at 18:16 and kept nothing for late posts',
          correct: true,
          why: 'The watermark passed 18:15 at 18:16, so the window published, and with zero allowed lateness it was discarded at once.',
        },
        {
          text: 'It counts in the 18:15 to 18:20 window, the one open when it arrives',
          correct: false,
          why: 'That is windowing by arrival time. Event-time windows place a post by when it was made, 18:14, whenever it arrives.',
        },
        {
          text: 'The 18:10 to 18:15 count is updated to include it',
          correct: false,
          why: 'That needs allowed lateness. With none, the window is gone by the time the post arrives.',
        },
        {
          text: 'The processor waits for it before publishing the window',
          correct: false,
          why: 'The processor cannot know a post is on its way. It publishes when the watermark passes the window’s end.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Trending uses sliding windows ten minutes long, with a new window starting every two minutes. In how many windows does each post count?',
      answer: 5,
      unit: 'windows',
      tolerance: 1.1,
      solution: [
        'A window covers 10 minutes, and a new one starts every 2 minutes.',
        'Any moment falls inside every window that started in the 10 minutes before it: 10 ÷ 2 = 5 windows.',
        'So each post adds to 5 counts, and the processor keeps 5 windows open at a time.',
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a MapReduce job in order.',
      items: [
        'Split the input into chunks',
        'Map each record to key and value pairs',
        'Shuffle the pairs so each key reaches one reducer',
        'Reduce the values for each key',
        'Write one result per key',
      ],
      why: 'Map works on independent chunks in parallel. Only after the shuffle has gathered every pair for a key in one place can reduce combine them.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these fit a nightly batch job better than a stream?',
      options: [
        { text: 'Each user’s “year in photos” recap', correct: true, why: 'Nobody needs it before morning, and it should include every late post.' },
        { text: 'Monthly payouts to creators based on views', correct: true, why: 'Money must be exact and complete, and a few hours of delay cost nothing.' },
        {
          text: 'Trending hashtags on the home screen',
          correct: false,
          why: 'A trend from yesterday is useless. It needs results within minutes, so it belongs in a stream.',
        },
        {
          text: 'Spotting a login from a new country as it happens',
          correct: false,
          why: 'A fraud check must act within seconds, before any damage is done, so it needs a stream.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Why is an exact answer easier to get from a batch job than from a stream?',
      options: [
        {
          text: 'Its input is complete and fixed when it starts, so nothing arrives late and a rerun gives the same result',
          correct: true,
          why: 'A batch job never has to guess whether more data is coming, which is the hardest problem a stream has.',
        },
        {
          text: 'It runs on bigger machines',
          correct: false,
          why: 'Both can run on large clusters. What matters is whether the input is complete, not the size of the machines.',
        },
        {
          text: 'It groups events by processing time, which is more accurate',
          correct: false,
          why: 'Processing time depends on delays and retries. Good batch jobs group by event time too; they simply see every event.',
        },
        {
          text: 'It skips events that arrived late',
          correct: false,
          why: 'The opposite: it runs after the stragglers have arrived, so it includes them.',
        },
      ],
    },
  ],
  takeaways: [
    'Batch processing runs over a complete, fixed pile of data, so it is simple and exact but hours behind; MapReduce splits the work into parallel map, shuffle and reduce steps.',
    'Stream processing updates results as events arrive, grouping them by event time into tumbling or sliding windows.',
    'A watermark decides when a window publishes and allowed lateness how long it accepts corrections; anything later is dropped by the stream but still counted by the batch.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Exactly-once results.** A stream processor that crashes restarts from its last checkpoint and replays the events since then. Combined with outputs that ignore duplicates, this gives [[exactly-once processing|exactly-once]] results: each event affects the output once, even though some were read twice.',
    },
    {
      kind: 'prose',
      md: '**Approximate counts.** Keeping an exact count for every hashtag in every window takes memory. A [[Count-Min Sketch|count-min-sketch]], from [the lesson on probabilistic structures](lesson:probabilistic-structures), keeps approximate counts in a small, fixed space, which is often enough for a trending list.',
    },
    {
      kind: 'prose',
      md: '**When the stream falls behind.** If the processor cannot keep up, [[consumer lag|consumer-lag]] grows, the watermark falls behind the clock and every window publishes late. Watch lag as closely as you watch errors.',
    },
    {
      kind: 'prose',
      md: '**Further reading.** Tyler Akidau’s [Streaming 101](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/) explains event time and processing time in depth, and the [Apache Flink documentation on windows](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/) covers tumbling, sliding and session windows and allowed lateness.',
    },
  ],
  flashcards: [
    {
      front: 'What is the difference between batch and stream processing?',
      back: 'Batch processes a complete, fixed set of data on a schedule; stream processing updates results continuously as each event arrives.',
    },
    {
      front: 'What do map, shuffle and reduce do in MapReduce?',
      back: 'Map turns each record into key and value pairs, the shuffle groups the pairs by key across machines, and reduce combines the values for each key.',
    },
    {
      front: 'How do tumbling and sliding windows differ?',
      back: 'Tumbling windows sit back to back and never overlap; sliding windows have a fixed size but start every slide, so they overlap.',
    },
    {
      front: 'What is the difference between event time and processing time?',
      back: 'Event time is when something happened; processing time is when the system sees it. Windows should use event time.',
    },
    {
      front: 'What is a watermark?',
      back: 'The stream processor’s working assumption that no events older than a given time are still coming. When it passes a window’s end, the window publishes.',
    },
    {
      front: 'What is allowed lateness?',
      back: 'How long a window is kept after it publishes, so late events can still update its result. Events later than that are dropped.',
    },
    {
      front: 'What is the lambda architecture?',
      back: 'Running a stream for fast, approximate results and a batch over the same events for exact ones that replace them later.',
    },
  ],
  related: ['queues-and-streams', 'time-and-ordering', 'event-driven', 'cqrs-event-sourcing', 'probabilistic-structures', 'feed-fanout'],
  glossaryTerms: [
    'batch-processing',
    'stream-processing',
    'event',
    'event-stream',
    'object-storage',
    'mapreduce',
    'shuffle',
    'partition',
    'tumbling-window',
    'sliding-window',
    'event-time',
    'processing-time',
    'clock-skew',
    'watermark',
    'late-event',
    'allowed-lateness',
    'lambda-architecture',
    'kappa-architecture',
    'backfill',
    'reconciliation',
    'exactly-once',
    'count-min-sketch',
    'consumer-lag',
  ],
};

export default lesson;
