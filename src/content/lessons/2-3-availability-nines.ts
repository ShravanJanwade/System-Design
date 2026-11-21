import type { DiagramSpec, Lesson } from '../types';

/** Series: every part must work, so one failure stops every request. */
const series: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'dns', type: 'dns', label: 'DNS', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'Oregon', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 3, y: 0 },
  ],
  edges: [
    { id: 'users-dns', from: 'users', to: 'dns', kind: 'sync' },
    { id: 'dns-app', from: 'dns', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A request needs every part in the chain: the name lookup, the app server and the database. Say each one is up 99.9% of the time, ballpark.',
      flow: ['users-dns', 'dns-app', 'app-db', '<app-db', '<dns-app', '<users-dns'],
      notes: [
        { target: 'dns', text: '99.9%', tone: 'plain' },
        { target: 'app', text: '99.9%', tone: 'plain' },
        { target: 'db', text: '99.9%', tone: 'plain' },
      ],
    },
    {
      caption: 'The **database** fails. Every request now fails too, even though the other parts are fine.',
      flow: ['users-dns', 'dns-app', { edge: 'app-db', tone: 'alert', tag: 'no answer' }],
      fail: ['db'],
    },
    {
      caption:
        'The same goes for every other part. Each one is a [[single point of failure|single-point-of-failure]]: on its own, it can take Snapgram down.',
      fail: ['app'],
      focus: ['users', 'dns', 'app', 'db'],
    },
    {
      caption: 'Multiply to combine them: 0.999 × 0.999 × 0.999 ≈ 0.997. The chain is up about 99.7% of the time, worse than any one of its parts.',
      notes: [{ target: 'users', text: '≈ 99.7%', tone: 'signal' }],
      focus: ['users', 'dns', 'app', 'db'],
    },
  ],
};

/** Parallel: two app servers behind a load balancer; one fails, the other carries on. */
const parallel: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0.5 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0.5 },
    { id: 'app1', type: 'service', label: 'App server', sublabel: 'copy 1', x: 2, y: 0 },
    { id: 'app2', type: 'service', label: 'App server', sublabel: 'copy 2', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 3, y: 0.5 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
    { id: 'app1-db', from: 'app1', to: 'db', kind: 'sync' },
    { id: 'app2-db', from: 'app2', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Two copies of the app server share the requests.',
      flow: ['users-lb', ['lb-app1', 'lb-app2']],
    },
    {
      caption:
        'Copy 1 dies. The load balancer notices that it has stopped answering its regular checks and sends every request to copy 2: [[failover|failover]]. Users notice nothing.',
      flow: ['users-lb', 'lb-app2', 'app2-db'],
      fail: ['app1'],
    },
    {
      caption: 'The **database** is still a single copy, so it is now the weakest link.',
      focus: ['db'],
      notes: [{ target: 'db', text: 'only copy', tone: 'alert' }],
    },
  ],
};

/** Quiz: which part is still a single point of failure? */
const spof: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancers', sublabel: '2 copies', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: '3 copies', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: '1 copy', x: 3, y: 0 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'availability-nines',
  module: 'm2',
  order: 3,
  title: 'Availability and the nines',
  idea: 'Availability is the share of time a system works, counted in nines: parts chained in series make it worse, and spare copies in parallel make it better.',
  minutes: 14,
  prerequisites: ['life-of-a-request'],
  outcomes: [
    'Convert availability from 99% to 99.999% into downtime per year and per month.',
    'Tell service level indicators, objectives and agreements apart, and say who each one is for.',
    'Calculate the availability of parts in series and in parallel, and spot single points of failure.',
  ],
  analogy: {
    title: 'Holiday lights and a backup generator',
    body: 'Old strings of holiday lights were wired in series: the current ran through every bulb in turn, so one dead bulb left the whole string dark. More bulbs meant more chances for one to fail, and you had to test them one by one to find it.\n\nA hospital works the other way. When the main power fails, a backup generator starts and the lights stay on. The power goes out only if the grid and the generator fail at the same time, which is far less likely than either one failing alone.',
  },
  whyItMatters:
    'Snapgram still runs on one server in Oregon, with the app and the database on the same machine. On a Saturday afternoon, its disk fails. Nobody can load a photo for four hours, until a founder rebuilds everything on a new machine.\n\nOn Monday, the founders want a number: how reliable is Snapgram, and how many nines were four hours of [[downtime|downtime]] worth? They also want to know what it would take for one broken machine never to take everything down again.',
  body: [
    { kind: 'heading', text: 'Availability as a number' },
    {
      kind: 'prose',
      md: '[[Availability|availability]] is the share of time a system works when people need it. Teams quote it in [[nines|nines]]: 99.9% is three nines, and 99.99% is four. Each extra nine cuts the allowed downtime by a factor of ten.',
    },
    {
      kind: 'table',
      columns: ['Availability', 'Nickname', 'Downtime per year', 'Downtime per 30-day month'],
      rows: [
        ['99%', 'Two nines', '≈ 3.7 days', '≈ 7.2 hours'],
        ['99.9%', 'Three nines', '≈ 8.8 hours', '≈ 43 minutes'],
        ['99.99%', 'Four nines', '≈ 53 minutes', '≈ 4.3 minutes'],
        ['99.999%', 'Five nines', '≈ 5.3 minutes', '≈ 26 seconds'],
      ],
      caption: 'Downtime allowed at each level, from a 365-day year and a 30-day month.',
    },
    {
      kind: 'prose',
      md: 'If the Saturday crash is Snapgram’s only outage all year, its availability is about 99.95%: three nines, with half the year’s allowance used in one afternoon. Measured over that month alone, it is about 99.4%. The window changes the answer, which is why every target names one.',
    },
    { kind: 'heading', text: 'Series: every part must work' },
    {
      kind: 'prose',
      md: 'A request to Snapgram passes through several parts in turn: the Domain Name System (DNS) lookup, the app server and the database. That is a chain in series, and it works only when every part works. To combine them, multiply their availabilities. ==A chain is always weaker than its weakest part.==',
    },
    {
      kind: 'diagram',
      title: 'Parts in series',
      caption: 'Every request needs every part. Use Play, or the arrow keys.',
      spec: series,
    },
    { kind: 'heading', text: 'Parallel: spare copies cover for each other' },
    {
      kind: 'prose',
      md: 'Now give a part a spare: two app servers behind a [[load balancer|load-balancer]] that sends each request to a working one. The pair fails only when both copies are down at once. If each is down 0.1% of the time, independently, both are down 0.1% × 0.1% = 0.0001% of the time, so the pair is up 99.9999%. That is [[redundancy|redundancy]], and it is how systems reach four and five nines.',
    },
    {
      kind: 'diagram',
      title: 'Copies in parallel',
      caption: 'The load balancer spreads requests over two app servers and stops using one that fails.',
      spec: parallel,
    },
    {
      kind: 'prose',
      md: 'The maths only holds if the copies fail independently. Two servers on the same power supply, in the same rack or running the same bad update can fail together, and then the spare is no spare at all. Big systems spread copies across separate buildings and regions to avoid such [[correlated failures|correlated-failure]].',
    },
    { kind: 'heading', text: 'Measuring it and promising it' },
    {
      kind: 'prose',
      md: 'Teams describe reliability with three related terms. A [[service level indicator|sli]] (SLI) is a measurement, such as the share of photo loads that succeed in under 500 ms. A [[service level objective|slo]] (SLO) is the target for that measurement over a window, such as 99.9% each month. A [[service level agreement|sla]] (SLA) is a contract with customers that says what happens, often refunds or credits, if a promise is missed.',
    },
    {
      kind: 'table',
      columns: ['Term', 'What it is', 'Snapgram example', 'Who it is for'],
      rows: [
        ['SLI', 'A measurement', 'Share of photo loads that succeed in under 500 ms', 'Engineers watching the dashboards'],
        ['SLO', 'A target for an SLI', '99.9% of photo loads succeed each month', 'The team deciding what to work on next'],
        ['SLA', 'A contract with consequences', 'Partners get credits below 99.5% in a month', 'Customers, and whoever pays the credits'],
      ],
      caption: 'Measure with SLIs, aim with SLOs, promise with SLAs. The SLA is usually looser than the SLO, so a missed target is fixed before it costs money.',
    },
    {
      kind: 'prose',
      md: 'The gap between the SLO and 100% is an [[error budget|error-budget]]: at 99.9% a month, Snapgram can afford about 43 minutes of downtime. While budget remains, the team ships features quickly. When it runs out, they slow down and work on reliability.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real availability is rarely all or nothing. A service can be up for most users and down for some, or up but too slow to use, so many teams count successful requests instead of minutes. The series and parallel maths also assumes independent failures, which shared power, networks and software updates often break.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'availability',
      preset: { stages: 'dns:99.99,app:99.9,database:99.9' },
      intro:
        'The calculator starts with Snapgram’s chain: DNS at 99.99%, one app server and one database at 99.9% each. Add copies, swap parts and watch the downtime per year, then try the challenges.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to raise availability, from the simplest to the most expensive.',
    rows: [
      {
        option: 'One bigger, better machine',
        goodAt: 'Simple: nothing to coordinate and no copies to keep in step.',
        badAt: 'Still a single point of failure. When it dies, everything stops.',
        pickWhen: 'Early on, when a few hours of downtime a year is acceptable.',
      },
      {
        option: 'A standby copy (active-passive)',
        goodAt: 'A spare takes over when the main copy fails.',
        badAt: 'The spare sits idle, and the switch takes time and must be tested regularly.',
        pickWhen: 'The part is hard to run as several active copies, like a main database.',
      },
      {
        option: 'Several active copies (active-active)',
        goodAt: 'Every copy serves traffic, so a failure removes only part of the capacity.',
        badAt: 'Copies cannot keep important data only in their own memory, and shared data needs extra care.',
        pickWhen: 'Parts that keep no state of their own, such as app servers behind a load balancer.',
      },
      {
        option: 'Copies in another region',
        goodAt: 'Survives the loss of a whole data center or region.',
        badAt: 'Costly, and keeping data in step across long distances is hard.',
        pickWhen: 'Hours of downtime would hurt the business badly, and the budget allows it.',
      },
    ],
  },
  realWorld: {
    title: 'A cloud provider’s nines, in writing',
    body: 'Amazon publishes an SLA for EC2 (Elastic Compute Cloud), its service for renting virtual servers. For a single instance, it commits to 99.5% uptime each month. For instances spread across two or more [[Availability Zones|availability-zone]], separate data centers within one region, it commits to 99.99% for the region, which counts as down only when all of those instances lose external connectivity at the same time.\n\nThat is this lesson’s maths written into a contract: one machine is a single point of failure, and copies in separate places earn more nines. If Amazon misses a target, customers get service credits, from 10% up to 100% depending on how low uptime falls, and the SLA says the credits are the only remedy. An SLA promises compensation, not uptime.',
    sourceUrl: 'https://aws.amazon.com/compute/sla/',
    sourceLabel: 'Amazon EC2 Service Level Agreement (updated May 2022)',
  },
  interview: {
    whenToMention:
      'In the requirements step, when you agree how reliable the system must be, and again after the high-level design, when you hunt for single points of failure. Turn a target such as 99.99% into minutes of downtime, then walk the request path and ask what happens when each part dies.',
    sayItLikeThis: [
      'Four nines allows about 53 minutes of downtime a year, so we can’t rely on one database server. I’d add a standby copy with automatic failover.',
      'Every component on the request path multiplies in, so I’d check each one for a single point of failure, including DNS and the load balancer.',
      'I’d set an SLO of 99.9% of requests succeeding each month, which gives an error budget of about 43 minutes a month.',
    ],
    followUps: [
      {
        q: 'Three services are called in series, each at 99.9%. What is the availability of the whole?',
        a: 'About 99.7%: multiply 0.999 three times. That is roughly 26 hours of downtime a year, three times worse than any one service, which is why long chains of calls hurt reliability.',
      },
      {
        q: 'How would you make the database highly available?',
        a: 'Run a standby copy, kept up to date by copying every change to it, in a separate data center, with automatic failover. Test the failover regularly, and decide how much recently written data you could lose if the main copy dies.',
      },
      {
        q: 'What is the difference between an SLO and an SLA?',
        a: 'An SLO is an internal target the team aims for. An SLA is a promise to customers with consequences, such as credits, if it is missed. The SLA is usually looser than the SLO, so the team fixes problems before they cost money.',
      },
    ],
    redFlags: [
      'Promising five nines without saying what it costs or how you would get there.',
      'Adding copies of the app server but leaving the load balancer, database or DNS as a single point of failure.',
      'Assuming two copies fail independently when they share power, a network, a region or the same deploy.',
    ],
  },
  mistakes: [
    '**Forgetting that a chain multiplies.** Ten parts at 99.9% in series give about 99%, roughly three and a half days of downtime a year.',
    '**Counting copies that fail together.** Two servers on the same power supply, or running the same bad update, can go down as one.',
    '**Leaving one part single.** Spare app servers do not help if every request still needs a single database.',
    '**Setting the SLA equal to the SLO.** If the contract promises exactly your internal target, every slip costs money; keep the promise looser.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'Snapgram sets an SLO (service level objective) of 99.9% each month. How many minutes of downtime does that allow in a 30-day month?',
      answer: 43.2,
      unit: 'minutes',
      tolerance: 1.1,
      solution: [
        'A 30-day month has 30 × 24 × 60 = 43,200 minutes.',
        '99.9% up means 0.1% down: 0.001 × 43,200 = 43.2 minutes.',
        'That 43 minutes is the month’s error budget.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Every request goes through three services one after another, each available 99.9% of the time. What is the availability of the whole chain?',
      options: [
        { text: 'About 99.7%', correct: true, why: 'Multiply them: 0.999 × 0.999 × 0.999 ≈ 0.997. Each service adds its own chance of failure.' },
        { text: 'Exactly 99.9%', correct: false, why: 'That would be true only if all three always failed at the same moments, which they do not.' },
        {
          text: 'About 99.9999%',
          correct: false,
          why: 'That is what two copies in parallel give. In series, the risks add up instead of covering for each other.',
        },
        { text: '100%, because each service is reliable', correct: false, why: 'No part is up 100% of the time, and a chain is worse than any one of its parts.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which changes remove a single point of failure from Snapgram’s one-server design?',
      options: [
        { text: 'A second app server behind a load balancer', correct: true, why: 'If one app server dies, the load balancer sends requests to the other.' },
        { text: 'A standby database that takes over automatically', correct: true, why: 'The database is no longer the only copy, so its failure no longer stops everything.' },
        { text: 'A bigger, faster single server', correct: false, why: 'It is still one machine. When it fails, everything stops.' },
        {
          text: 'Two app server programs on the same physical machine',
          correct: false,
          why: 'They share the hardware, so one disk or power failure takes both down.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which of these is an SLO?',
      options: [
        { text: '99.9% of photo loads should succeed each month', correct: true, why: 'It is a target for a measurement over a time window, which is exactly what an SLO is.' },
        {
          text: 'The share of photo loads that succeeded yesterday',
          correct: false,
          why: 'That is the measurement itself: a service level indicator.',
        },
        {
          text: 'Partners receive a 10% credit if the service is below 99.5% in a month',
          correct: false,
          why: 'A promise to customers with consequences is a service level agreement.',
        },
        { text: 'The servers can handle 5,000 requests per second', correct: false, why: 'That is a capacity, not a reliability target.' },
      ],
    },
    {
      kind: 'bottleneck',
      prompt: 'Snapgram has added copies of most parts. Which one is still a single point of failure?',
      diagram: spof,
      answerNodeId: 'db',
      why: 'The database has one copy and every request needs it. When it fails, Snapgram is down however many app servers are running, so it needs a standby with failover.',
      others: {
        users: 'Users are not part of the system Snapgram runs.',
        lb: 'There are two load balancers, so one can take over when the other fails.',
        app: 'Three copies sit behind the load balancers, so losing one leaves two.',
      },
    },
  ],
  takeaways: [
    'Availability is the share of time a system works, and each extra nine cuts the allowed downtime by ten.',
    'Parts in series multiply, so a chain is weaker than its weakest part, while copies in parallel cover for each other if they fail independently.',
    'Measure with SLIs, aim with SLOs and promise with SLAs, keeping the promise looser than the target.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Availability from failures and repairs.** Availability ≈ MTBF ÷ (MTBF + MTTR), where MTBF is the mean time between failures and MTTR is the mean time to recovery. A server that fails once a month and takes an hour to fix is about 99.86% available. Cutting the fix to six minutes gets it to about 99.99% without making failures any rarer, which is why fast recovery matters as much as fewer failures.',
    },
    {
      kind: 'prose',
      md: '**Too reliable is a risk too.** Google’s site reliability engineering (SRE) book describes Chubby, an internal lock service so reliable that other teams began to assume it would never fail. In a quarter when real failures have not pushed it below its SLO, the team takes it down on purpose, to flush out services that wrongly depend on it.',
    },
    {
      kind: 'prose',
      md: '**Counting requests instead of minutes.** Many teams define availability as successful requests divided by all requests. That counts the outage that hits only some users, and it lets an error budget be spent on many small failures instead of one long one.',
    },
  ],
  flashcards: [
    { front: 'How much downtime a year do 99.9% and 99.99% allow?', back: 'About 8.8 hours a year for 99.9%, and about 53 minutes for 99.99%.' },
    { front: 'How do you combine parts in series?', back: 'Multiply their availabilities: three parts at 99.9% give about 99.7%.' },
    {
      front: 'How do you combine copies in parallel?',
      back: 'The stage fails only if every copy fails: 1 − (1 − a)^n. Two 99.9% copies give 99.9999%, if they fail independently.',
    },
    { front: 'What is a single point of failure?', back: 'A component whose failure alone takes the whole system down.' },
    { front: 'SLI, SLO, SLA: what is each?', back: 'An SLI is a measurement, an SLO is the target for it, and an SLA is a contract with consequences if a promise is missed.' },
    { front: 'What is an error budget?', back: 'The downtime an SLO allows. At 99.9% a month, about 43 minutes.' },
    { front: 'Why might two copies of a server not really be redundant?', back: 'They can fail together if they share power, a network, a region or the same bad update.' },
  ],
  related: ['load-balancers', 'vertical-vs-horizontal-scaling', 'tradeoffs-core-skill', 'replication', 'percentiles-tail-latency'],
  glossaryTerms: [
    'downtime',
    'availability',
    'nines',
    'single-point-of-failure',
    'load-balancer',
    'redundancy',
    'failover',
    'correlated-failure',
    'sli',
    'slo',
    'sla',
    'error-budget',
    'availability-zone',
  ],
};

export default lesson;
