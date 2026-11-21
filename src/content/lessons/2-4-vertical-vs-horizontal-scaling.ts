import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Scaling up: Snapgram's one server is replaced by a bigger one, until there is no bigger one. */
const scaleUp: DiagramSpec = {
  grid: { cols: 2, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0.5 },
    { id: 'small', type: 'service', label: 'Server', sublabel: '8 cores, 32 GB', x: 1, y: 0 },
    { id: 'big', type: 'service', label: 'Bigger server', sublabel: '64 cores, 512 GB', x: 1, y: 1 },
  ],
  edges: [
    { id: 'users-small', from: 'users', to: 'small', kind: 'sync' },
    { id: 'small-big', from: 'small', to: 'big', kind: 'replication', label: 'copy data' },
    { id: 'users-big', from: 'users', to: 'big', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Snapgram today: one **server** with 8 cores and 32 GB of memory runs the app and the database. Every evening it is over 90% busy.',
      flow: ['users-small', '<users-small'],
      focus: ['users', 'small'],
      notes: [{ target: 'small', text: '90% busy', tone: 'alert' }],
    },
    {
      caption: 'Scaling up: copy everything to a **bigger server** with 64 cores and 512 GB. The site is offline during the switch.',
      add: ['big', 'small-big'],
      flow: ['small-big'],
      fail: ['small'],
    },
    {
      caption: 'Same code, same design, and the evening peak now keeps the new machine only about 15% busy.',
      add: ['users-big'],
      flow: ['users-big', '<users-big'],
      focus: ['users', 'big'],
      notes: [{ target: 'big', text: '15% busy', tone: 'plain' }],
    },
    {
      caption: 'Snapgram keeps growing, and the big machine fills up too. At a few hundred cores, there is no bigger machine to rent.',
      flow: ['users-big', '<users-big'],
      focus: ['users', 'big'],
      notes: [{ target: 'big', text: '85% busy', tone: 'alert' }],
    },
    {
      caption: 'And it is still one machine: when it fails, as Snapgram’s server did that Saturday, the whole site goes down.',
      focus: ['users', 'big'],
      fail: ['big'],
    },
  ],
  description:
    'Users send requests to one server with 8 cores and 32 GB of memory. Its data is copied to a bigger server with 64 cores and 512 GB, which then takes all the traffic. It is still a single machine.',
};

/** Scaling out: app servers appear one at a time behind a load balancer; the database stays one machine. */
const scaleOut: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app1', type: 'service', label: 'App server 1', x: 2, y: 0 },
    { id: 'app2', type: 'service', label: 'App server 2', x: 2, y: 1 },
    { id: 'app3', type: 'service', label: 'App server 3', x: 2, y: 2 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'one big machine', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
    { id: 'lb-app3', from: 'lb', to: 'app3', kind: 'sync' },
    { id: 'app1-db', from: 'app1', to: 'db', kind: 'sync' },
    { id: 'app2-db', from: 'app2', to: 'db', kind: 'sync' },
    { id: 'app3-db', from: 'app3', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'First the database moves to its own machine, so each part can grow on its own. A **load balancer** sits in front of the one **app server**.',
      flow: ['users-lb', 'lb-app1', 'app1-db', '<app1-db', '<lb-app1', '<users-lb'],
    },
    {
      caption: 'Add a second app server, an exact copy of the first. The load balancer spreads requests across both.',
      add: ['app2', 'lb-app2', 'app2-db'],
      flow: ['users-lb', ['lb-app1', 'lb-app2']],
      focus: ['users', 'lb', 'app1', 'app2'],
    },
    {
      caption: 'Add a third. Capacity grows roughly in step with the number of servers.',
      add: ['app3', 'lb-app3', 'app3-db'],
      flow: ['users-lb', ['lb-app1', 'lb-app2', 'lb-app3']],
      focus: ['users', 'lb', 'app1', 'app2', 'app3'],
    },
    {
      caption: 'One server fails. The load balancer stops sending it requests, and the other two carry on.',
      fail: ['app2'],
      flow: ['users-lb', ['lb-app1', 'lb-app3']],
      focus: ['users', 'lb', 'app1', 'app2', 'app3'],
    },
    {
      caption: 'A replacement starts in minutes, because server 2 held nothing special. But all three still query one **database**, the next part to watch.',
      flow: [['app1-db', 'app2-db', 'app3-db']],
      focus: ['db'],
      notes: [{ target: 'db', text: 'next bottleneck', tone: 'alert' }],
    },
  ],
  description:
    'Users reach a load balancer, which spreads requests across three identical app servers. All three app servers query the same database, which runs on one large machine.',
};

/** Two requests, two servers: the session lives in a shared store, so either server can answer. */
const anyServer: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'app1', type: 'service', label: 'App server 1' },
    { id: 'app2', type: 'service', label: 'App server 2' },
    { id: 'store', type: 'cache', label: 'Session store' },
  ],
  groups: [
    { label: 'Request 1', from: 1, to: 3 },
    { label: 'Request 2', from: 4, to: 6 },
  ],
  messages: [
    { from: 'phone', to: 'app1', label: 'Log in', kind: 'sync', caption: 'Maya logs in, and the load balancer happens to pick app server 1.' },
    {
      from: 'app1',
      to: 'store',
      label: 'Save session abc',
      kind: 'sync',
      caption: 'App server 1 saves her [[session|session]], the server’s note that she is logged in, in the shared store rather than its own memory.',
    },
    {
      from: 'app1',
      to: 'phone',
      label: 'Cookie: session abc',
      kind: 'reply',
      caption: 'Her phone gets a [[cookie|cookie]] with the session identifier (ID), sent along with every later request.',
    },
    { from: 'phone', to: 'app2', label: 'Open feed, session abc', kind: 'sync', caption: 'Her next request lands on app server 2, which has never seen her.' },
    { from: 'app2', to: 'store', label: 'Look up abc', kind: 'sync', caption: 'App server 2 looks up the session in the shared store and learns it is Maya.' },
    { from: 'app2', to: 'phone', label: 'Maya’s feed', kind: 'reply', caption: 'It answers as if it had served her all along.' },
  ],
};

/** Quiz: traffic grows five times and only the app tier was scaled out. */
const fiveTimes: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: '5× the traffic', x: 0, y: 0 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', sublabel: '20 servers, 40% busy', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'one machine', x: 3, y: 0 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'vertical-vs-horizontal-scaling',
  module: 'm2',
  order: 4,
  title: 'Vertical vs. horizontal scaling',
  idea: 'When one server can’t keep up, you can move to a bigger machine (scaling up) or add more machines (scaling out): the first is simpler but hits a ceiling, while the second keeps growing as long as any server can handle any request.',
  minutes: 14,
  prerequisites: ['latency-throughput-bandwidth'],
  outcomes: [
    'Explain scaling up and scaling out, and the limits of a bigger machine.',
    'Explain why stateless servers are easy to scale out, and where their state should live.',
    'Decide which parts of a design to scale up and which to scale out.',
  ],
  analogy: {
    title: 'A bigger truck vs. more trucks',
    body: 'A bakery delivers bread with one van. As orders grow, the easy fix is a bigger truck: same driver, same route, more bread per trip. But trucks only come so big, the biggest cost a fortune, and when the one truck breaks down, nobody gets bread.\n\nThe other fix is more vans. Each carries less, but you can add one whenever orders grow, and if one breaks down, the rest keep delivering. The catch: the vans must be interchangeable. If one van holds the only copy of the order list, you can’t send just any van on any route.',
  },
  whyItMatters:
    'Snapgram has passed 100,000 [[daily active users|daily-active-users]], and it still runs on one [[server|server]] in Oregon that holds both the app and the database. Every evening at peak, that machine is more than 90% busy. Requests wait in line, and pages that took 200 milliseconds now take two seconds.\n\nThe Saturday crash is still fresh, too: when the one server died, all of Snapgram died with it. The founders need more capacity before next month’s growth arrives. Should they buy a bigger server, or more servers?',
  body: [
    {
      kind: 'prose',
      md: 'Every machine has limits: so many cores, so much memory, and disks and a network card that move data only so fast. Past those limits, requests queue up and [[latency|latency]] climbs. You can add room in two ways: make the machine bigger, or add more machines.',
    },
    { kind: 'heading', text: 'Scaling up: a bigger machine' },
    {
      kind: 'prose',
      md: '[[Vertical scaling|vertical-scaling]], or scaling up, means moving to a machine with more cores, more memory and faster disks. Nothing else changes: same code, same design, one machine to look after. For a while, it is exactly the right move.',
    },
    {
      kind: 'diagram',
      title: 'Scaling up',
      caption: 'Snapgram moves to a bigger machine. Step through to see what that buys, and where it stops.',
      spec: scaleUp,
    },
    {
      kind: 'prose',
      md: 'A bigger machine has four limits:\n\n- **A ceiling.** Even the biggest machines for rent top out at a few hundred cores and some terabytes of memory.\n- **Paying for the peak.** One machine must be sized for your busiest minute, so you pay for that capacity at 4 a.m. too.\n- **Downtime to upgrade.** Moving to bigger hardware usually means a restart or a migration.\n- **One point of failure.** A lone machine is a [[single point of failure|single-point-of-failure]]: when it dies, everything on it dies, and the [[downtime|downtime]] counts against you.',
    },
    { kind: 'heading', text: 'Scaling out: more machines' },
    {
      kind: 'prose',
      md: '[[Horizontal scaling|horizontal-scaling]], or scaling out, means several ordinary machines sharing the work. In front of them sits a [[load balancer|load-balancer]] that hands each request to one of the servers; [Load balancers](lesson:load-balancers) covers how it chooses.',
    },
    {
      kind: 'diagram',
      title: 'Scaling out',
      caption: 'Snapgram’s app servers grow one at a time behind a load balancer, while the database stays on one machine.',
      spec: scaleOut,
    },
    {
      kind: 'prose',
      md: 'Scaling out fixes what scaling up could not. Capacity grows a server at a time, and spare servers keep the site up when one fails: that spare capacity is [[redundancy|redundancy]]. With [[autoscaling|autoscaling]], the number of servers can follow the traffic, so you stop paying for the peak all night. The price is more machines to deploy and watch, and one strict rule: the servers must be interchangeable.',
    },
    { kind: 'heading', text: 'Why stateless servers scale out easily' },
    {
      kind: 'prose',
      md: 'State is anything a server remembers between requests, such as who is logged in. A [[stateless|stateless]] server keeps none of it; anything that must outlive a request goes to a shared place every server can reach, like the [[database|database]], a [[cache|cache]] or a [[session store|session-store]]. Then the load balancer can send any request anywhere, a new server is useful the moment it starts, and a dead one loses nothing.',
    },
    {
      kind: 'sequence',
      title: 'Any server can answer',
      caption: 'Two requests from Maya land on two different servers. Step through to see why the second one still knows her.',
      spec: anyServer,
    },
    {
      kind: 'prose',
      md: 'Had app server 1 kept the session in its own memory, Maya would look logged out whenever a request landed elsewhere. [Stateless vs. stateful services](lesson:stateless-vs-stateful) goes deeper.',
    },
    { kind: 'heading', text: 'Which parts scale which way' },
    {
      kind: 'prose',
      md: 'Real systems do both, part by part. App servers are usually stateless, so they scale out early and cheaply. The database *is* the state, and splitting it is hard, so teams scale it up first, put a cache in front and add [[read replicas|read-replica]], copies that serve reads. Only when writes outgrow the biggest machine do they reach for [[sharding|sharding]]: splitting the data across several databases.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real servers run out of processor, memory, disk or network at different times, but this lesson treats capacity as one dial. Scaling out also adds costs of its own, such as network hops between machines. [Replication](lesson:replication) and [Sharding](lesson:sharding) cover scaling the data itself.',
    },
  ],
  tradeoffs: {
    caption: 'Bigger machines versus more machines, and the mix most teams end up with.',
    rows: [
      {
        option: 'Scale up (vertical)',
        goodAt: 'Simple: no code changes, and one machine keeps joins and transactions easy.',
        badAt: 'Hits a ceiling, needs downtime to upgrade, pays for the peak all day, and is a single point of failure.',
        pickWhen: 'You are small, or the part holds data that is hard to split, like the main database.',
      },
      {
        option: 'Scale out (horizontal)',
        goodAt: 'Grows a server at a time, survives one failure, and can follow the traffic with autoscaling.',
        badAt: 'Needs a load balancer, stateless servers and more machines to run. Stored data is hard to split this way.',
        pickWhen: 'The part is stateless, like app servers, or must survive a machine failing.',
      },
      {
        option: 'Both: apps out, data up',
        goodAt: 'The easy tier spreads out, and the hard tier stays simple.',
        badAt: 'The single database becomes the next bottleneck and still needs a plan for failure.',
        pickWhen: 'Most web apps, until the data outgrows the biggest machine you can buy.',
      },
    ],
  },
  realWorld: {
    title: 'Stack Overflow’s few, large servers',
    body: 'In 2016, Stack Overflow’s Nick Craver described the hardware behind the site. On one day that February, its load balancers handled about 209 million requests, about 66 million of them page loads. They went to 9 primary web servers, and the main database cluster ran on machines with 384 GB of memory and two 12-core processors each.\n\nThe post adds that after years of tuning, the whole site could run on one web server, which the team had confirmed by accident a few times, though the author does not call that a good idea. A handful of large machines carried a very large site, which shows how far scaling up can go.',
    sourceUrl: 'https://nickcraver.com/blog/2016/02/17/stack-overflow-the-architecture-2016-edition/',
    sourceLabel: 'Nick Craver, “Stack Overflow: The Architecture, 2016 Edition”',
  },
  interview: {
    whenToMention:
      'When your estimates show more traffic than one machine can serve, or the interviewer asks what happens at ten times the load. Say which tier scales which way: stateless app servers out, the database up first.',
    sayItLikeThis: [
      'Our app servers are stateless, with sessions in Redis and photos in object storage, so we can scale them out behind a load balancer.',
      'For the database, I’d scale up first and add read replicas for reads. I’d only shard when writes or data size outgrow the biggest machine.',
      'I’d run one more app server than the peak needs, so losing one at peak still leaves enough capacity.',
    ],
    followUps: [
      {
        q: 'Why not just buy a bigger server?',
        a: 'Up to a point, you should: it is the simplest fix. But there is a ceiling, upgrades usually mean downtime, and one machine is still a single point of failure. So I’d scale up what is hard to split, like the database, and scale out the stateless parts.',
      },
      {
        q: 'What makes a service stateless, and how do you get there?',
        a: 'It keeps nothing between requests that another instance would need. Move sessions to a shared store such as Redis, uploaded files to object storage, and everything else to the database. Then any instance can handle any request.',
      },
      {
        q: 'The app tier scales out. How does the database keep up?',
        a: 'Scale it up, cache repeated reads and send reads to replicas. If writes or data outgrow one machine, shard it by a key such as user ID. That is a big step, because queries and transactions across shards get hard.',
      },
    ],
    redFlags: [
      'Saying “just add more servers” while the servers keep sessions or uploaded files on their own memory or disk.',
      'Scaling out the app tier and forgetting that every server still queries one database.',
      'Dismissing scaling up: one large machine goes a long way, and it is often the cheapest first step.',
    ],
  },
  mistakes: [
    '**Scaling out stateful servers.** If sessions or files live on one server, users see random logouts and missing photos once a second server joins.',
    '**Forgetting the database.** Ten times the app servers send ten times the queries to the same database.',
    '**Waiting for the ceiling.** A move to bigger hardware takes planning and downtime, so plan it before the machine is full.',
    '**Running without a spare.** With exactly enough servers for the peak, one failure at peak overloads the rest.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram moves from an 8-core server to a 64-core server. What is this called?',
      options: [
        { text: 'Vertical scaling (scaling up)', correct: true, why: 'One machine got bigger, with more cores and more memory, and the design stayed the same.' },
        { text: 'Horizontal scaling (scaling out)', correct: false, why: 'Scaling out adds machines. Snapgram still has exactly one.' },
        { text: 'Sharding', correct: false, why: 'Sharding splits data across several databases. Nothing was split here.' },
        {
          text: 'Autoscaling',
          correct: false,
          why: 'Autoscaling changes the number of servers automatically as load changes. This was a one-time move to bigger hardware.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are real limits of scaling up?',
      options: [
        { text: 'There is a largest machine you can buy or rent', correct: true, why: 'Past a few hundred cores and some terabytes of memory, there is no bigger machine.' },
        { text: 'Upgrading usually means some downtime', correct: true, why: 'Moving to new hardware, or resizing a cloud server, usually means a restart or a migration.' },
        { text: 'One machine is a single point of failure', correct: true, why: 'However big it is, when it fails, everything on it fails.' },
        { text: 'The app must be rewritten to run on it', correct: false, why: 'Scaling up needs no code changes; that is its main attraction.' },
        {
          text: 'The server must become stateless',
          correct: false,
          why: 'Statelessness is what scaling out needs. A single big server can keep state in its own memory.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Why are stateless app servers easy to scale out?',
      options: [
        {
          text: 'Any server can handle any request, because shared state lives elsewhere',
          correct: true,
          why: 'The load balancer can send requests anywhere, and adding or removing a server loses nothing.',
        },
        {
          text: 'They use less memory than stateful servers',
          correct: false,
          why: 'Memory use is not the point. A stateless server may use plenty of memory while it handles a request.',
        },
        { text: 'They do not need a database', correct: false, why: 'They still read and write the database. They just do not keep shared state themselves.' },
        { text: 'They never crash', correct: false, why: 'They crash like any server, but a crash loses nothing the other servers need.' },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Each Snapgram app server comfortably handles about 500 requests per second. The evening peak is 4,000 requests per second, and the team wants to survive one server failing at peak. How many app servers should run at peak?',
      answer: 9,
      unit: 'servers',
      tolerance: 1.1,
      solution: [
        'Servers needed to carry the peak: 4,000 ÷ 500 = 8.',
        'Add one spare, so the peak still fits when any one server fails: 8 + 1 = 9.',
        'The spare only helps because the servers are interchangeable: any of them can take over any request.',
      ],
    },
    {
      kind: 'bottleneck',
      prompt: 'Snapgram’s traffic grows five times. The team adds app servers until each one is only 40% busy. Which component breaks first?',
      diagram: fiveTimes,
      answerNodeId: 'db',
      why: 'Every app server sends its queries to the same database, so five times the traffic means about five times the database load, on one machine that can only scale up. Cache repeated reads, add read replicas, and plan for sharding.',
      others: {
        users: 'Users only send requests. They do not run out of capacity.',
        lb: 'A load balancer does very little work per request, and it can be scaled out too.',
        app: 'The team already scaled them out, and at 40% busy they have room to spare.',
      },
    },
  ],
  takeaways: [
    'Scaling up buys a bigger machine, which is simple but hits a ceiling, needs downtime to upgrade and remains a single point of failure.',
    'Scaling out adds interchangeable machines behind a load balancer, which works only when the servers are stateless.',
    'Most designs scale stateless app servers out and the database up first, then add caches, replicas and shards as the data grows.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**More cores, smaller gains.** Doubling the cores of a busy machine rarely doubles its throughput. Requests compete for the same memory, disks and locks, and any part of the work that must happen one step at a time cannot be sped up by extra cores. This limit is known as Amdahl’s law.',
    },
    {
      kind: 'prose',
      md: '**Autoscaling in practice.** Cloud platforms add servers when a measure such as processor use crosses a threshold, and remove them when it falls. A new server takes time to start and warm up, often a minute or more, so autoscaling follows daily cycles well but can lag behind a sudden spike. Teams keep some spare capacity to cover that gap.',
    },
    {
      kind: 'prose',
      md: '**Scaling a database up has its own tricks.** Before splitting data, teams give the database its own machine, add enough memory that the hot data fits in it, move to faster disks, and fix slow queries with [indexes](lesson:indexes).',
    },
  ],
  flashcards: [
    { front: 'What is vertical scaling?', back: 'Handling more load with a bigger machine: more cores, more memory, faster disks. Also called scaling up.' },
    { front: 'What is horizontal scaling?', back: 'Handling more load by adding machines that share the work, behind a load balancer. Also called scaling out.' },
    { front: 'What are four limits of scaling up?', back: 'A ceiling on machine size, paying for peak capacity all day, downtime to upgrade, and a single point of failure.' },
    { front: 'What makes a server stateless?', back: 'It keeps nothing between requests that another server would need; shared state lives in a database, cache or session store.' },
    { front: 'Why do stateless servers scale out easily?', back: 'Any server can handle any request, so servers can be added, removed or restarted without losing anything.' },
    {
      front: 'Which tier usually scales out first, and which scales up?',
      back: 'Stateless app servers scale out. The database usually scales up first, then adds read replicas and, much later, shards.',
    },
    { front: 'Why run one more server than the peak needs?', back: 'So that if any one server fails at peak, the rest can still carry the load.' },
  ],
  related: ['latency-throughput-bandwidth', 'stateless-vs-stateful', 'load-balancers', 'availability-nines', 'replication', 'sharding'],
  glossaryTerms: [
    'daily-active-users',
    'server',
    'latency',
    'vertical-scaling',
    'single-point-of-failure',
    'downtime',
    'horizontal-scaling',
    'load-balancer',
    'redundancy',
    'autoscaling',
    'stateless',
    'database',
    'cache',
    'session-store',
    'session',
    'cookie',
    'read-replica',
    'sharding',
  ],
};

export default lesson;
