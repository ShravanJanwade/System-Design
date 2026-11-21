import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The three measures on Snapgram's upload path, from one request to the evening peak. */
const uploadPath: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'p1', type: 'client', label: 'Phone', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'p2', type: 'client', label: 'Phone', sublabel: 'London', x: 0, y: 1 },
    { id: 'p3', type: 'client', label: 'Phone', sublabel: 'Chicago', x: 0, y: 2 },
    { id: 'server', type: 'service', label: 'Upload server', sublabel: 'Oregon, 100 Mbps link', x: 1, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'photo details', x: 2, y: 1 },
  ],
  edges: [
    { id: 'p1-server', from: 'p1', to: 'server', kind: 'sync' },
    { id: 'p2-server', from: 'p2', to: 'server', kind: 'sync' },
    { id: 'p3-server', from: 'p3', to: 'server', kind: 'sync' },
    { id: 'server-db', from: 'server', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '[[Latency|latency]] is how long one request takes, start to finish. Maya likes a photo from Singapore: the tiny request crosses to Oregon and the answer comes back in about 150 ms, one full [[round trip|round-trip-time]].',
      flow: ['p1-server', '<p1-server'],
      notes: [{ target: 'p1', text: '≈ 150 ms', tone: 'signal' }],
    },
    {
      caption:
        '[[Bandwidth|bandwidth]] is how much data a link can carry per second. Maya’s phone can send about 10 megabits per second (Mbps), ballpark, so a 3 MB photo, which is 24 megabits, needs about 2.4 seconds just to squeeze through.',
      focus: ['p1', 'server', 'p1-server'],
      notes: [{ target: 'p1-server', text: '10 Mbps up', tone: 'plain' }],
    },
    {
      caption:
        '[[Throughput|throughput]] is how much work finishes per second across everyone, often counted in [[requests per second|requests-per-second]]. At the evening peak, uploads arrive from everywhere at once: about six a second, ballpark.',
      flow: [['p1-server', 'p2-server', 'p3-server']],
      notes: [{ target: 'server', text: '6 uploads/s', tone: 'signal' }],
    },
    {
      caption:
        'Every upload squeezes through the server’s own connection, which carries 100 Mbps. Six 3 MB uploads a second need about 144 Mbps, so that connection is the [[bottleneck|bottleneck]]: the part that fills up first.',
      focus: ['server'],
      notes: [{ target: 'server', text: 'needs 144 Mbps', tone: 'alert' }],
    },
    {
      caption:
        'Uploads that do not fit wait their turn, and that [[queueing delay|queueing-delay]] lands on top of everything else. Off-peak an upload takes about 3 seconds; at peak it takes longer the longer the rush lasts.',
      flow: ['p2-server', 'server-db'],
      notes: [{ target: 'server', text: 'uploads waiting', tone: 'alert' }],
    },
  ],
};

const likeVsPhoto: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'server', type: 'service', label: 'Upload server' },
  ],
  groups: [
    { label: 'Small: latency rules', from: 1, to: 2 },
    { label: 'Big: bandwidth rules', from: 3, to: 4 },
  ],
  messages: [
    {
      from: 'phone',
      to: 'server',
      label: 'POST /like, 1 KB',
      kind: 'sync',
      caption: 'A like is about 1 KB. At 10 Mbps it takes under a millisecond to push out, so nearly all of its time is the trip to Oregon.',
    },
    {
      from: 'server',
      to: 'phone',
      label: '200 OK',
      kind: 'reply',
      caption: 'The answer arrives about 150 ms after Maya tapped. A link ten times wider would save less than a millisecond.',
    },
    {
      from: 'phone',
      to: 'server',
      label: 'POST /upload, 3 MB',
      kind: 'sync',
      caption: 'A photo is about 3 MB, or 24 megabits. Pushing it through 10 Mbps takes about 2.4 seconds, sixteen times the trip.',
    },
    {
      from: 'server',
      to: 'phone',
      label: '201 Created',
      kind: 'reply',
      caption:
        'Here bandwidth rules. Double Maya’s link and the upload takes about half as long, while a server next door would save only about 0.15 seconds.',
    },
  ],
};

const lesson: Lesson = {
  id: 'latency-throughput-bandwidth',
  module: 'm2',
  order: 1,
  title: 'Latency, throughput, bandwidth',
  idea: 'Latency is how long one request takes, throughput is how many requests finish per second, and bandwidth is the most a link can carry: three different measures, fixed in different ways.',
  minutes: 14,
  prerequisites: ['life-of-a-request'],
  outcomes: [
    'Define latency, throughput and bandwidth, and name the unit each one is measured in.',
    'Explain why a small request is limited by latency and a large transfer by bandwidth.',
    'Spot when pushing for more throughput starts to hurt latency, and say what to do about it.',
  ],
  analogy: {
    title: 'A highway',
    body: 'Picture a highway. The speed limit decides how long one car takes to get from the on-ramp to the exit. The number of lanes decides how many cars can travel side by side. Count the cars that reach the exit each minute, and you have what the road actually delivers.\n\nThose are three different things. A higher speed limit gets each car there sooner but adds no room, and an extra lane adds room but gets no single car there faster. At rush hour, when more cars arrive than the lanes can take, a line forms at the on-ramp: the road carries all it can, yet every trip takes longer.',
  },
  whyItMatters:
    'Snapgram now has about 100,000 daily users, and the evening peak brings a new complaint: photo uploads feel slow. The team has three ideas. Buy a bigger internet connection for the server, move the server closer to most users, or add a second upload server.\n\nEach idea fixes a different problem, and only one matches what is actually wrong. To choose, you need three words that people mix up all the time: latency, throughput and bandwidth.',
  body: [
    {
      kind: 'prose',
      md: 'Here are all three on Snapgram’s upload path, where phones everywhere send photos to the **upload server** in Oregon.',
    },
    {
      kind: 'diagram',
      title: 'Three measures on one upload path',
      caption: 'From one small request to the evening rush. Use Play, or the arrow keys.',
      spec: uploadPath,
    },
    { kind: 'heading', text: 'How the three relate' },
    {
      kind: 'prose',
      md: 'Bandwidth is a ceiling, and throughput is what you actually get. Throughput can never beat the bandwidth of the narrowest link on the path, and it is often lower: a four-lane road with ten cars an hour has plenty of capacity and very little throughput.',
    },
    {
      kind: 'prose',
      md: 'Latency has parts. Travel time, called [[propagation delay|propagation-delay]], depends only on distance. [[Transmission time|transmission-time]] is the message’s size divided by the bandwidth. Add any time spent waiting in line and the time to do the work, and you have one request’s latency.',
    },
    {
      kind: 'code',
      code: 'time for one transfer ≈ round trips × round-trip time\n                      + size ÷ bandwidth\n                      + time waiting in line\n                      + time doing the work',
      caption: 'A whiteboard estimate. For small messages the first line dominates; for big ones, the second.',
    },
    {
      kind: 'table',
      columns: ['What Maya sends', 'Size', 'One round trip to Oregon', 'Pushing it through 10 Mbps'],
      rows: [
        ['A like', '≈ 1 KB', '≈ 150 ms', 'under 1 ms'],
        ['A photo', '≈ 3 MB', '≈ 150 ms', '≈ 2.4 s'],
        ['A few minutes of video', '≈ 300 MB', '≈ 150 ms', '≈ 4 minutes'],
      ],
      caption: 'Ballpark numbers. The trip costs the same for every message; the push time grows with size.',
    },
    {
      kind: 'sequence',
      title: 'A like versus a photo',
      caption: 'Two requests over the same connection from Singapore. Watch where the time goes.',
      spec: likeVsPhoto,
    },
    { kind: 'heading', text: 'When they pull against each other' },
    {
      kind: 'prose',
      md: 'Up to a point, a system can be busy and fast at once. But when requests arrive faster than the bottleneck can finish them, the extras wait in line: throughput stays at its maximum while the line, and every new request’s latency, keeps growing.',
    },
    {
      kind: 'prose',
      md: 'Lines form even below full capacity, because requests arrive in bursts rather than evenly. The closer a component’s [[utilization|utilization]] gets to 100%, the longer those lines grow, so teams keep [[headroom|headroom]] for the peak. ==Maximum throughput and minimum latency are different goals==.',
    },
    {
      kind: 'prose',
      md: '[[Batching|batching]] trades one for the other on purpose. Writing 100 view counts to the database in one go is far cheaper than 100 separate writes, so throughput goes up. But the first view in each batch waits for the other 99, so its latency goes up too.',
    },
    { kind: 'heading', text: 'Back to Snapgram' },
    {
      kind: 'prose',
      md: 'Snapgram’s numbers point at bandwidth: at peak, uploads need about 144 Mbps from a 100 Mbps connection. Upgrading the connection to 1 gigabit per second (Gbps), which is 1,000 Mbps, leaves plenty of room, and the line disappears. Moving closer would save each upload about 0.15 seconds, and a second server helps only if it brings its own connection.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real networks are messier. A new connection starts sending slowly and speeds up, a link is shared with everyone else’s traffic, and the bandwidth you buy is a maximum, not a promise. The arithmetic here is the estimate you would make on a whiteboard, and it is the one interviewers expect.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'highway',
      title: 'The highway',
      caption:
        'Lanes are bandwidth, the speed limit sets latency, and cars reaching the exit each minute are throughput. Raise the speed limit, then push arrivals past capacity, then open a lane.',
      props: { lanes: 2, speedKmh: 60, arrivalsPerMin: 40 },
    },
  ],
  tradeoffs: {
    caption: 'Ways to make a slow request faster, and which measure each one improves.',
    rows: [
      {
        option: 'Serve from closer to users',
        goodAt: 'Cuts travel time, so every request’s latency drops. Small requests gain the most.',
        badAt: 'Does nothing for a full link or a busy server, and more locations cost more to run.',
        pickWhen: 'Requests are small and users are far away.',
      },
      {
        option: 'Buy more bandwidth',
        goodAt: 'Big transfers finish sooner, and more of them fit at once.',
        badAt: 'Travel time is unchanged, so small requests feel no faster. You pay for room you mostly use at peak.',
        pickWhen: 'A link fills up at peak, or transfers are large.',
      },
      {
        option: 'Add more servers',
        goodAt: 'More requests finish per second, and a line at a busy server disappears.',
        badAt: 'One request on a quiet system gets no faster, and there are more machines to run.',
        pickWhen: 'A server, not the network, is the bottleneck.',
      },
      {
        option: 'Batch work together',
        goodAt: 'Less overhead per item, so throughput rises.',
        badAt: 'Each item waits for its batch, so latency rises.',
        pickWhen: 'Items are small and a short delay is fine, as with view counts or logs.',
      },
    ],
  },
  realWorld: {
    title: 'When a truck beats the network',
    body: 'In 2016, Amazon Web Services (AWS) announced Snowmobile: a 45-foot shipping container on a truck that stores up to 100 petabytes. It plugs into a customer’s data center through a switch that supports 1 terabit per second, and it can be filled in about 10 days. The announcement notes that moving petabytes or exabytes over the internet can take years or decades.\n\nSnowmobile is this lesson taken to an extreme. Its bandwidth is enormous, 100 petabytes per trip, and its latency is terrible: about 10 days just to fill it, before the drive even starts. By our own arithmetic, 100 petabytes over a 10 gigabit-per-second connection would take about two and a half years, so for one giant transfer the slow, wide truck wins.',
    sourceUrl: 'https://aws.amazon.com/blogs/aws/aws-snowmobile-move-exabytes-of-data-to-the-cloud-in-weeks/',
    sourceLabel: 'Jeff Barr, “AWS Snowmobile – Move Exabytes of Data to the Cloud in Weeks,” AWS News Blog (2016)',
  },
  interview: {
    whenToMention:
      'Twice in most interviews. In requirements, say which measure matters: chat needs low latency, video uploads need throughput and bandwidth. When something is slow, name which of the three is the problem before proposing a fix, because each has a different cure.',
    sayItLikeThis: [
      'Feed requests are small, so their latency is mostly round trips: I’d cut those with a [[content delivery network|cdn]] (CDN) and [[connection reuse|keep-alive]]. Uploads are large and limited by bandwidth, so I’d send them straight to storage.',
      'At peak we expect about six 3 MB uploads a second. That is roughly 150 megabits per second, so a single server on a 100-megabit connection is the bottleneck.',
      'I’ll size the upload tier to run well below full capacity at peak, because as utilization approaches 100%, queues and latency grow quickly.',
    ],
    followUps: [
      {
        q: 'What is the difference between bandwidth and throughput?',
        a: 'Bandwidth is a link’s capacity, the most it can carry per second. Throughput is what you actually achieve: never higher, often lower. A 1 Gbps link carrying 200 Mbps has 1 Gbps of bandwidth and 200 Mbps of throughput.',
      },
      {
        q: 'Your service handles 10,000 requests per second, but users say it is slow. How can both be true?',
        a: 'They measure different things. A system can finish many requests per second while each one waits in a line or crosses an ocean. Find where each request spends its time, and check whether a few very slow requests hide behind a good average, which is the next lesson.',
      },
      {
        q: 'How would you raise throughput without making latency worse?',
        a: 'Add capacity side by side: more servers behind a load balancer, more workers. Each request takes the same path, but more of them run at once. Batching raises throughput too, but it adds waiting, so use it only where a short delay is fine.',
      },
    ],
    redFlags: [
      'Treating latency and throughput as the same thing, or promising that more bandwidth will speed up a small request.',
      'Planning to run servers at 100% of capacity at peak, with no headroom for bursts.',
      'Proposing a fix, such as more servers or a CDN, before saying which of the three measures is the problem.',
    ],
  },
  mistakes: [
    '**Mixing up bits and bytes.** Network speeds are quoted in bits per second and file sizes in bytes, so a 100 Mbps link moves about 12.5 megabytes per second, not 100.',
    '**Buying bandwidth to fix latency.** A wider link does not shorten the trip; a small request across an ocean still takes about 150 ms.',
    '**Running at 100% busy.** Throughput tops out, but waiting time grows fast near full capacity, so leave room for the peak.',
    '**Planning for the daily average.** A day’s average hides the evening rush, and capacity must cover the busiest minutes, not the typical one.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'A dashboard shows that Snapgram’s servers finished 2,000 requests in the last second. Which measure is that?',
      options: [
        { text: 'Throughput', correct: true, why: 'It counts finished work per unit of time, across all requests.' },
        { text: 'Latency', correct: false, why: 'Latency is how long one request takes, measured in milliseconds, not a count per second.' },
        {
          text: 'Bandwidth',
          correct: false,
          why: 'Bandwidth is the most a link could carry per second. It is a capacity, not work that actually got done.',
        },
        { text: 'Round-trip time', correct: false, why: 'That is the time for one message to go and come back, which is a kind of latency.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Maya uploads a 3 MB photo over a phone link with 10 megabits per second of upload bandwidth. Ignoring round trips, how many seconds does it take to push the photo through?',
      answer: 2.4,
      unit: 'seconds',
      tolerance: 1.1,
      solution: [
        'A byte is 8 bits, so 3 MB is 3 × 8 = 24 megabits.',
        '24 megabits ÷ 10 megabits per second = 2.4 seconds.',
        'The trip to Oregon adds only about 0.15 seconds, so bandwidth dominates this upload.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which changes would lower the latency of one small request, such as a like, sent from Singapore to Oregon?',
      options: [
        {
          text: 'Answering it from a server in Singapore',
          correct: true,
          why: 'Distance sets the travel time, and travel is nearly all of a small request’s latency.',
        },
        {
          text: 'Reusing an open connection so the request skips the handshakes',
          correct: true,
          why: 'Each handshake is a full round trip, so skipping them removes whole round trips.',
        },
        {
          text: 'Upgrading the server’s link from 1 Gbps to 10 Gbps',
          correct: false,
          why: 'A 1 KB request takes a tiny fraction of a millisecond to push out either way. Bandwidth was never its limit.',
        },
        {
          text: 'Adding five more app servers while the current one is mostly idle',
          correct: false,
          why: 'With no line to clear, extra servers add throughput nobody needs and leave each request just as slow.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'On the highway, 90 cars arrive each minute, but the two open lanes carry only 60. What happens over the next few minutes?',
      options: [
        {
          text: 'A line at the on-ramp grows by about 30 cars a minute, and each new car’s trip takes longer',
          correct: true,
          why: 'Throughput is capped at 60, so the other 30 each minute wait, and every new arrival joins the back of a longer line.',
        },
        {
          text: 'Throughput rises to 90 cars a minute',
          correct: false,
          why: 'Throughput can never beat capacity. Only more lanes would raise it.',
        },
        {
          text: 'Cars drive faster to keep up',
          correct: false,
          why: 'The speed limit sets each car’s trip time; it does not change with the crowd. Even a higher limit would add no room at the on-ramp.',
        },
        {
          text: 'Nothing, because traffic averages out over the day',
          correct: false,
          why: 'The line builds during the rush itself. A quiet night later does not help the drivers stuck in it now.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Order these transfers from the most limited by latency to the most limited by bandwidth.',
      items: ['A like, about 1 KB', 'A profile page, about 100 KB', 'A photo, about 3 MB', 'A few minutes of video, about 300 MB'],
      why: 'Every message pays the same trip, but the time to push it through the link grows with its size. Small messages are almost all travel; big ones are almost all pushing.',
    },
  ],
  takeaways: [
    'Latency is how long one request takes, throughput is how many finish per second, and bandwidth is the most a link can carry.',
    'Small requests are limited by latency and large transfers by bandwidth, so the right fix depends on which one you have.',
    'Pushing throughput toward full capacity makes lines, and latency, grow fast, so plan for the peak with room to spare.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Little’s law.** In any steady system, the number of requests in progress equals throughput × latency. A service handling 1,000 requests per second at 50 ms each has about 50 requests in progress at any moment, which tells you how many connections, threads or workers it needs. [[Little’s law|littles-law]] holds for the highway too: cars on the road equal cars per second times each car’s trip time.',
    },
    {
      kind: 'prose',
      md: '**The bandwidth-delay product.** To keep a long link busy, a sender must have bandwidth × round-trip time worth of data in flight. A 1 Gbps link with a 150 ms round trip needs about 19 megabytes in flight; a sender that stops to wait for acknowledgments sooner cannot fill the link. That [[bandwidth-delay product|bandwidth-delay-product]] is why one transfer across an ocean often gets far less than the link’s rated speed.',
    },
    {
      kind: 'prose',
      md: '**Why waiting explodes near full capacity.** In the simplest textbook queueing model, with random arrivals and random work times, a server that is 50% busy makes the average request wait about as long as the work itself. At 90% busy, the average wait is about nine times the work. The exact numbers depend on the model, but the steep curve near 100% shows up in every real system.',
    },
  ],
  flashcards: [
    { front: 'What is latency?', back: 'How long one operation takes from start to finish, such as one request.' },
    { front: 'What is throughput?', back: 'How much work finishes per unit of time, such as requests per second or uploads per minute.' },
    { front: 'What is bandwidth?', back: 'The most data a link can carry per second, usually in bits per second. Throughput can never exceed it.' },
    { front: 'How long does a 3 MB photo take to push through a 10 Mbps link?', back: 'About 2.4 seconds: 3 MB is 24 megabits, and 24 ÷ 10 = 2.4.' },
    { front: 'What limits a small request? A large transfer?', back: 'A small request is limited by latency (round trips). A large transfer is limited by bandwidth (size ÷ bandwidth).' },
    { front: 'Why does latency rise as a server nears full capacity?', back: 'Requests start waiting in line, and the closer the server gets to 100% busy, the longer the line grows.' },
    {
      front: 'In the highway analogy, what are latency, bandwidth and throughput?',
      back: 'Latency is one car’s trip time, bandwidth is the number of lanes, and throughput is cars reaching the exit per minute.',
    },
  ],
  related: ['percentiles-tail-latency', 'latency-numbers', 'back-of-the-envelope', 'vertical-vs-horizontal-scaling', 'cdns'],
  glossaryTerms: [
    'latency',
    'round-trip-time',
    'bandwidth',
    'throughput',
    'requests-per-second',
    'bottleneck',
    'queueing-delay',
    'propagation-delay',
    'transmission-time',
    'utilization',
    'headroom',
    'batching',
    'cdn',
    'keep-alive',
    'littles-law',
    'bandwidth-delay-product',
  ],
};

export default lesson;
