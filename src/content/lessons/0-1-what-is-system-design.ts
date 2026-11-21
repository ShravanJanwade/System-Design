import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/**
 * Snapgram grows from one server to a small fleet. Nodes appear only when growth causes
 * the problem they solve. Users appear with the load balancer, so no stale arrow is left behind.
 */
const growth: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'app1', type: 'service', label: 'App server', sublabel: 'Oregon', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 1 },
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app2', type: 'service', label: 'App server', sublabel: 'Oregon', x: 2, y: 2 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 3, y: 1 },
    { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'edges worldwide', x: 1, y: 0 },
  ],
  edges: [
    { id: 'app1-db', from: 'app1', to: 'db', kind: 'sync' },
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
    { id: 'app2-db', from: 'app2', to: 'db', kind: 'sync' },
    { id: 'app1-cache', from: 'app1', to: 'cache', kind: 'sync' },
    { id: 'app2-cache', from: 'app2', to: 'cache', kind: 'sync' },
    { id: 'users-cdn', from: 'users', to: 'cdn', kind: 'sync' },
    { id: 'cdn-lb', from: 'cdn', to: 'lb', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Version one. A single **app server** in Oregon runs Snapgram’s code and its database side by side. For about 100 users, this is the right design: cheap, simple and easy to understand.',
      notes: [{ target: 'app1', text: 'app + database', tone: 'plain' }],
    },
    {
      caption:
        'Thousands of users. The app and the database fight over the same memory and disk, so the **database** moves to its own machine, where each can be sized for its own job.',
      add: ['db'],
      flow: ['app1-db', '<app1-db'],
    },
    {
      caption:
        'Tens of thousands of users, and one app server is full. A [[load balancer|load-balancer]] spreads requests over a second **app server**, and if either one fails, the other keeps serving. More machines instead of a bigger one is called [[horizontal scaling|horizontal-scaling]].',
      add: ['users', 'lb', 'app2'],
      flow: ['users-lb', ['lb-app1', 'lb-app2']],
    },
    {
      caption:
        'Hundreds of thousands of users, who read the same popular profiles again and again. A [[cache|cache]] keeps those answers in memory, so most reads never reach the database.',
      add: ['cache'],
      flow: ['users-lb', 'lb-app2', { edge: 'app2-cache', tag: 'hit' }, '<app2-cache', '<lb-app2', '<users-lb'],
    },
    {
      caption:
        'Millions of users, all over the world. A [[content delivery network|cdn]] (CDN) keeps copies of photos on servers near users, so a photo opened in Singapore no longer crosses the ocean.',
      add: ['cdn'],
      flow: [{ edge: 'users-cdn', tag: 'hit' }, '<users-cdn'],
    },
    {
      caption:
        'With more machines, something is always broken somewhere. When an app server fails, the load balancer stops sending it requests and Snapgram stays up. Later steps add replicas, queues and more regions, each when a real problem calls for it.',
      fail: ['app1'],
      flow: ['users-lb', 'lb-app2', 'app2-db', '<app2-db', '<lb-app2', '<users-lb'],
    },
  ],
};

/** A compressed interview: the same prompt gets two different, correct answers. */
const conversation: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'you', type: 'client', label: 'You' },
  ],
  groups: [
    { label: 'Scope', from: 1, to: 3 },
    { label: 'Design', from: 4, to: 4 },
    { label: 'Grow', from: 5, to: 6 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'you',
      label: 'Design a photo-sharing app',
      kind: 'sync',
      caption: 'The prompt is short and vague on purpose. What you do with it is part of the test.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'Who uses it, and how many?',
      kind: 'sync',
      caption: 'Scoping: before drawing anything, find out who the users are, how many there are and which features matter.',
    },
    {
      from: 'interviewer',
      to: 'you',
      label: 'About 100 friends',
      kind: 'reply',
      caption: 'The answer changes everything that follows.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'One server is enough',
      kind: 'sync',
      caption: 'At this size the simple design is the right one. A fleet of servers would cost more and break more often, for no benefit.',
    },
    {
      from: 'interviewer',
      to: 'you',
      label: 'And for 100 million users?',
      kind: 'sync',
      caption: 'A new requirement. Interviewers change the numbers to see how your design, and your reasoning, adapt.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'Then caches, a CDN, many servers',
      kind: 'reply',
      caption: 'Same prompt, new requirements, a different design. Explaining why each new part is now worth its cost is what earns the credit.',
    },
  ],
};

/** Quiz: which part runs out first? */
const firstLimit: DiagramSpec = {
  grid: { cols: 3, rows: 1 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: '2,000 requests/s at peak', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', sublabel: 'handles ≈ 500 requests/s', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'handles ≈ 10,000 queries/s', x: 2, y: 0 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'what-is-system-design',
  module: 'm0',
  order: 1,
  title: 'What system design is',
  idea: 'System design is deciding which parts a piece of software needs and how they fit together, so it keeps working as its users, its data and its failures grow.',
  minutes: 13,
  prerequisites: [],
  outcomes: [
    'Explain what system design is, and why growing users, data and failures make it hard.',
    'Describe what interviewers evaluate: how you scope a problem, weigh trade-offs and communicate.',
    'Explain why a design question has no single right answer, only designs that fit the requirements or do not.',
  ],
  analogy: {
    title: 'Planning a city, not building one house',
    body: 'Building one house is a craft problem: choose good materials, put them together well, and fix that house if something goes wrong. Nobody asks what happens when a million people move in.\n\nPlanning a city is a different job. You decide where roads, pipes and power lines go before most buildings exist, and you plan for rush hour, burst water mains and neighborhoods that double in size. System design is city planning for software: less about writing one feature well, more about how the parts fit together and hold up as things grow and break.',
  },
  whyItMatters:
    'Snapgram starts as an idea: an app for sharing photos with friends. Version one runs on a single [[server|server]] in a [[data center|data-center]] in Oregon, with the app’s code and its [[database|database]] on the same machine. About 100 people use it, and it works fine.\n\nNow imagine it takes off: 100,000 users, then 10 million, then 100 million. Photos pile up by the terabyte, and the one server becomes a [[single point of failure|single-point-of-failure]]: when it crashes on a Saturday, everyone is locked out. None of that is a bug in the code. It is a design problem, and solving problems like it, one at a time, is what this course is about.',
  body: [
    {
      kind: 'prose',
      md: '[[System design|system-design]] works one level above code. Instead of asking how to write a feature, it asks which parts the system needs (servers, databases, caches and more), how they connect, and how data moves between them. The goal is a system that meets its requirements at the size it must reach, for a price it can afford.\n\nThree things grow as a product succeeds, and each one pushes on the design. **Users** bring load: more requests every second. **Data** piles up: more photos and more rows to store and search. And **failures** multiply, because a system with a thousand machines always has a few that are broken.',
    },
    { kind: 'heading', text: 'One server becomes many' },
    {
      kind: 'prose',
      md: 'Here is the road Snapgram travels in this course, compressed into six steps. Watch how each new part appears only when growth causes a specific problem.',
    },
    {
      kind: 'diagram',
      title: 'From one server to a small fleet',
      caption: 'Snapgram grows from about 100 users to millions, one fix at a time. Use Play, or the arrow keys.',
      spec: growth,
    },
    {
      kind: 'prose',
      md: 'Every step followed the same pattern: find the [[bottleneck|bottleneck]], the part that runs out of capacity first, and fix that, not everything at once. A design that can grow this way, by adding machines instead of being rewritten, has good [[scalability|scalability]].\n\nNotice what each step cost, too. The **load balancer** is one more thing to run, the **cache** can serve an out-of-date profile, and the **CDN** adds a bill. Every choice is a [[trade-off|trade-off]]: you gain something in one place and pay for it in another.',
    },
    { kind: 'heading', text: 'What interviewers look for' },
    {
      kind: 'prose',
      md: 'In a system design interview you get a vague prompt, such as “design a photo-sharing app”, and about 45 minutes. Nobody expects a finished system. The interviewer is watching how you think, and three skills carry most of the weight:\n\n- **Scoping.** You ask who the users are, how many there are and which features matter, and agree on what to build before you draw.\n- **Trade-offs.** For each choice, you say what it gains, what it costs, and why it suits these requirements better than the alternative.\n- **Communication.** You think out loud, draw clearly, walk one request through your design, and check in with the interviewer as you go.',
    },
    {
      kind: 'sequence',
      title: 'Same prompt, different answers',
      caption: 'A compressed interview. Watch the right design change when the requirements do.',
      spec: conversation,
    },
    {
      kind: 'prose',
      md: 'That exchange holds the most important idea in this course. ==There is no single right answer to a design question, only designs that fit their requirements and designs that do not.== Two candidates can draw different systems for the same prompt and both do well, if each can explain why their choices fit.\n\nIt also shows why requirements come first. One server is a great answer for 100 users and a poor one for 100 million, so a design that ignores the numbers cannot even be judged.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'The growth story skips many real steps, such as database replicas, queues for slow work, monitoring, security and running in more than one region. Each one gets its own lesson later. Real companies also grow in messier ways, often fixing problems after users notice them.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to handle growth, previewed. Later lessons cover each one in depth.',
    rows: [
      {
        option: 'A bigger server',
        goodAt: 'No design changes. This is [[vertical scaling|vertical-scaling]].',
        badAt: 'Machines only get so big, and it is still one machine that can fail.',
        pickWhen: 'You are small and want the quickest fix.',
      },
      {
        option: 'More app servers',
        goodAt: 'Room to grow, and one failure no longer takes you down.',
        badAt: 'Needs a load balancer, and more machines to run.',
        pickWhen: 'One machine is no longer enough, or downtime costs too much.',
      },
      {
        option: 'A cache',
        goodAt: 'Fast, cheap reads for data many people ask for.',
        badAt: 'Cached copies can be out of date.',
        pickWhen: 'The same data is read far more often than it changes.',
      },
    ],
  },
  realWorld: {
    title: 'Stack Overflow on a handful of servers',
    body: 'In 2016, Stack Overflow engineer Nick Craver described the hardware behind the site. On one February day, its load balancers handled about 209 million requests. The core ran on 11 web servers, 4 database servers, 2 [[Redis|redis]] servers, 3 Elasticsearch servers and 4 load balancers in New York, with a second data center in Colorado for disasters.\n\nCraver wrote that they were down to needing only one web server, and had tested that by accident a few times, though he was not saying it was a good idea. A few powerful machines fit their workload: the right design depends on the requirements.',
    sourceUrl: 'https://nickcraver.com/blog/2016/02/17/stack-overflow-the-architecture-2016-edition/',
    sourceLabel: 'Nick Craver, “Stack Overflow: The Architecture, 2016 Edition” (2016)',
  },
  interview: {
    whenToMention:
      'From the first minute, and in every answer after it. When the prompt arrives, resist drawing: ask about users, scale and the features that matter. When you add a part, say what problem it solves and what it costs, and when the interviewer changes a number, treat it as a new requirement and adapt out loud.',
    sayItLikeThis: [
      'Before I draw anything, I’d like to pin down scope: which features matter most, how many users we expect, and whether reads or writes dominate.',
      'I’ll start with the simplest design that works, one app server and one database, and grow it as we find bottlenecks.',
      'We could add a cache or database replicas here. The cache is simpler and cheaper, and the feed can be a few seconds old, so I’d start with the cache.',
    ],
    followUps: [
      {
        q: 'Why not design for 100 million users from day one?',
        a: 'That design costs far more and has many more parts that can fail, for traffic that may never arrive. Start simple, estimate when the next limit will hit, and add parts as the numbers demand, showing that you know the path to the large design.',
      },
      {
        q: 'How do you decide what to fix first as a system grows?',
        a: 'Find the bottleneck. Estimate the load, such as requests per second, compare it with what each part can handle, and fix the tightest limit first. Fixing anything else buys nothing.',
      },
      {
        q: 'What do you do if the interviewer disagrees with a choice?',
        a: 'Treat it as information. Ask which requirement they have in mind, explain your trade-off, and change the design if the requirement changes the answer. Pushback often tests your reasoning, not your answer.',
      },
    ],
    redFlags: [
      'Drawing a large architecture before asking a single question about requirements.',
      'Naming technologies without saying what problem each one solves or what it costs.',
      'Defending one design as simply correct, with no alternatives or trade-offs.',
      'Designing in silence for long stretches, so the interviewer cannot follow your reasoning.',
    ],
  },
  mistakes: [
    '**Jumping to the solution.** Drawing boxes before you know the requirements means designing for a problem nobody asked about.',
    '**Over-engineering from day one.** Ten services for a hundred users cost time and money and add failure points, with nothing gained.',
    '**Buzzword soup.** Naming a technology is not a design. Saying what problem it solves, and what it costs, is.',
    '**Ignoring failure.** At scale, machines, disks and networks fail every day, and a design that assumes they will not is fragile.',
    '**Hunting for the one right answer.** Interviewers grade your reasoning, so two different designs can both earn top marks.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which description fits system design best?',
      options: [
        {
          text: 'Deciding which parts a system needs and how they fit together, so it keeps working as it grows',
          correct: true,
          why: 'That is the core of it: components, connections and data flow, judged against growth in users, data and failures.',
        },
        {
          text: 'Writing efficient algorithms for each feature',
          correct: false,
          why: 'Efficient code matters, but system design works a level above code: which machines, stores and connections the system needs.',
        },
        {
          text: 'Choosing the best programming language for a project',
          correct: false,
          why: 'Language choice is a small part of design. Most design questions are about how components fit, not how they are written.',
        },
        {
          text: 'Drawing diagrams of an existing system',
          correct: false,
          why: 'Diagrams are a tool for design, not the goal. The goal is a system that meets its requirements.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'What do interviewers evaluate in a system design interview?',
      options: [
        { text: 'How you scope the problem with questions', correct: true, why: 'A vague prompt tests whether you ask before you build.' },
        { text: 'How you reason about trade-offs', correct: true, why: 'Every choice costs something. Naming the cost and why it is worth paying is central.' },
        {
          text: 'How clearly you communicate your design',
          correct: true,
          why: 'Thinking out loud, drawing clearly and walking a request through the design let the interviewer follow and help.',
        },
        {
          text: 'Whether you know a specific company’s internal architecture',
          correct: false,
          why: 'Interviewers want reasoning that works on any prompt, not memorized diagrams of someone else’s system.',
        },
        { text: 'Whether your code compiles', correct: false, why: 'Design interviews almost never involve code. You talk and draw.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'An interviewer says “Design a photo-sharing app” and nothing else. What should you do first?',
      options: [
        {
          text: 'Ask about the users, the scale and the most important features',
          correct: true,
          why: 'The prompt is vague on purpose. The answers decide whether one server or a large fleet is the right design.',
        },
        {
          text: 'Draw a load balancer, app servers and a database',
          correct: false,
          why: 'Those parts may well be right, but drawing before scoping risks solving the wrong problem.',
        },
        { text: 'Pick a database product', correct: false, why: 'You cannot choose storage before you know what data you store and how it is read.' },
        {
          text: 'Estimate the storage needed for 100 million users',
          correct: false,
          why: 'Estimates need agreed numbers first. Assuming 100 million users might be wildly wrong for this prompt.',
        },
      ],
    },
    {
      kind: 'bottleneck',
      prompt: 'Snapgram’s traffic grows to 2,000 requests per second at peak, and each request makes two database queries. Which component runs out of capacity first?',
      diagram: firstLimit,
      answerNodeId: 'app',
      why: 'One app server handles about 500 requests per second, a quarter of the peak. The database sees 4,000 queries per second, well under its 10,000. So the first fix is more app servers behind a load balancer, not a bigger database.',
      others: {
        users: 'Users only send requests. They do not run out of capacity.',
        db: 'At two queries per request, the database sees 4,000 queries per second, comfortably within its 10,000.',
      },
    },
    {
      kind: 'numeric',
      prompt: 'At peak, Snapgram gets 3,000 requests per second, and one app server handles about 400. What is the smallest number of app servers that can carry the peak?',
      answer: 8,
      unit: 'servers',
      tolerance: 1.1,
      solution: [
        '3,000 ÷ 400 = 7.5 servers’ worth of load.',
        'You cannot run half a server, so round up to 8.',
        'In practice you would add one or two more, so the fleet survives a failure at peak.',
      ],
    },
  ],
  takeaways: [
    'System design is deciding which parts a system needs and how they fit together, so it keeps working as users, data and failures grow.',
    'Good designs start simple and add parts only when a real bottleneck appears, and every part has a cost.',
    'Interviewers grade your scoping, trade-offs and communication, because there is no single right answer.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why failures grow with size.** Suppose a server fails about once every three years, a rough, illustrative figure. With 1,000 servers, that is close to one failure a day. At that size a failure is routine, so the design must route around broken machines automatically instead of waking someone up each time.',
    },
    {
      kind: 'prose',
      md: '**Requirements come in two kinds.** [[Functional requirements|functional-requirement]] say what the system does, such as “users can upload photos”. [[Non-functional requirements|non-functional-requirement]] say how well it must do it: how fast, how available, at what scale and cost. [The interview at a glance](lesson:interview-at-a-glance) and Module 8 turn asking about both into a habit.',
    },
    {
      kind: 'prose',
      md: '**Scale changes the answer, not just the size.** At 100 users, one server is the best design; at 100 million, the same choice cannot keep up and takes everything down when it fails. That is why the same prompt can have opposite good answers in two interviews.',
    },
  ],
  flashcards: [
    {
      front: 'What is system design?',
      back: 'Deciding which parts a system needs, how they connect and how data moves between them, so it keeps working as users, data and failures grow.',
    },
    { front: 'Which three kinds of growth make system design hard?', back: 'More users (load), more data (storage) and more failures (more machines that can break).' },
    { front: 'What do interviewers evaluate in a system design interview?', back: 'How you scope the problem, how you reason about trade-offs, and how clearly you communicate.' },
    { front: 'Is there a single right answer to a design question?', back: 'No. A design is good if its trade-offs fit the requirements and you can explain why.' },
    { front: 'What is a bottleneck?', back: 'The part of a system that runs out of capacity first, and so limits the whole system.' },
    { front: 'Why start with the simplest design that works?', back: 'It is cheaper and has fewer parts to break. Add parts when a real limit appears.' },
    {
      front: 'When is a single server the right design?',
      back: 'When the load is small and some downtime is acceptable. It becomes wrong once load or reliability needs outgrow one machine.',
    },
  ],
  related: ['how-to-use-blueprint', 'interview-at-a-glance', 'life-of-a-request', 'vertical-vs-horizontal-scaling', 'tradeoffs-core-skill', 'interview-framework'],
  glossaryTerms: [
    'server',
    'data-center',
    'database',
    'single-point-of-failure',
    'system-design',
    'load-balancer',
    'horizontal-scaling',
    'cache',
    'cdn',
    'bottleneck',
    'scalability',
    'trade-off',
    'vertical-scaling',
    'redis',
    'functional-requirement',
    'non-functional-requirement',
  ],
};

export default lesson;
