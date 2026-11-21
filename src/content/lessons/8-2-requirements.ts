import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** How each answer to the five essential questions changes Snapgram's design. One step per answer. */
const answers: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 3, y: 1 },
    { id: 'photos', type: 'objectStore', label: 'Photo storage', x: 2, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 1, y: 0 },
    { id: 'feed', type: 'cache', label: 'Feed cache', x: 2, y: 2 },
  ],
  edges: [
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'phones-lb', from: 'phones', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-photos', from: 'app', to: 'photos', kind: 'sync' },
    { id: 'phones-cdn', from: 'phones', to: 'cdn', kind: 'sync' },
    { id: 'cdn-photos', from: 'cdn', to: 'photos', kind: 'sync' },
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '**Before any numbers.** The features, upload, follow and a feed, need **phones**, **app servers** behind a [[load balancer|load-balancer]], a **database** for users, photos and follows, and **photo storage** for the files.',
    },
    {
      caption:
        '**Scale: 10 million daily users.** That is thousands of requests a second at the evening peak, so the **app servers** become a fleet of identical, [[stateless|stateless]] machines, and one database will not serve every read alone.',
      focus: ['phones', 'lb', 'app'],
      notes: [{ target: 'app', text: 'many servers', tone: 'signal' }],
    },
    {
      caption:
        '**Read/write ratio: about 100 views per upload.** Reads dominate, so the read path gets the investment: feeds come from a **feed cache** in memory, and the **database** mostly handles writes.',
      add: ['feed'],
      focus: ['app', 'feed', 'db'],
    },
    {
      caption:
        '**Latency: the feed in under 200 ms.** Building a feed from the database on each request is too slow, so each user’s feed is built ahead of time, and reading it is one lookup in the **feed cache**.',
      flow: ['phones-lb', 'lb-app', { edge: 'app-feed', tag: 'hit' }, '<app-feed', '<lb-app', '<phones-lb'],
      notes: [{ target: 'feed', text: 'built ahead', tone: 'signal' }],
    },
    {
      caption:
        '**Consistency: a few seconds late is fine.** A new post is saved in the **database**, and followers’ feeds catch up in the background after the upload returns. Only the poster’s own profile must show it at once, which is [[read-your-writes|read-your-writes]].',
      flow: ['phones-lb', 'lb-app', 'app-db', '<app-db', '<lb-app', '<phones-lb'],
      notes: [{ target: 'feed', text: 'seconds behind', tone: 'plain' }],
    },
    {
      caption:
        '**Geography: users worldwide.** Photos come from a [[content delivery network|cdn]] (CDN) with edges near each user, so someone in Singapore does not wait on Oregon. A second region can come later, if the numbers call for it.',
      add: ['cdn'],
      flow: ['phones-cdn', { edge: 'cdn-photos', tag: 'miss' }, '<cdn-photos', '<phones-cdn'],
      notes: [{ target: 'cdn', text: 'near users', tone: 'signal' }],
    },
  ],
};

/** Maya's requirements step for the photo-sharing prompt. */
const fiveMinutes: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'Scope', from: 1, to: 3 },
    { label: 'The numbers', from: 4, to: 7 },
    { label: 'Read-back', from: 8, to: 8 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Design a photo-sharing app',
      kind: 'sync',
      caption: 'The same one-line prompt, and a five-minute [[timebox|timebox]] for requirements.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Upload, follow, feed. Skip messages?',
      kind: 'sync',
      caption: 'She proposes a scope instead of asking an open question. It is faster, and it shows judgment about what matters.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Yes, and skip video too',
      kind: 'reply',
      caption: 'Two features go on the out-of-scope list, in a corner of the board.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'How many users? Views per upload?',
      kind: 'sync',
      caption: 'Scale and the read/write ratio, asked together.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: '10M a day, about 100 views each',
      kind: 'reply',
      caption: 'A read-heavy system, at a scale that needs many servers.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Feed speed? Instant? Where?',
      kind: 'sync',
      caption: 'Latency, consistency and geography, each phrased so the answer can be a number or a short phrase.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Under 200 ms, seconds late is fine, worldwide',
      kind: 'reply',
      caption: 'Three answers, and each will change a part of the design.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Let me read that back',
      kind: 'sync',
      caption: '**Minute 5.** She reads the list back, gets a nod, and moves on to the estimate.',
    },
  ],
};

const lesson: Lesson = {
  id: 'requirements',
  module: 'm8',
  order: 2,
  title: 'Requirements like a pro',
  idea: 'In the first five minutes you turn a one-line prompt into a short, agreed list of what the system must do, how well it must do it and what you will leave out, by asking the few questions that change the design.',
  minutes: 15,
  prerequisites: ['interview-framework'],
  outcomes: [
    'Separate [[functional requirements|functional-requirement]] from [[non-functional requirements|non-functional-requirement]], and write each non-functional one as a number.',
    'Ask the five questions that change a design most: scale, read/write ratio, latency, consistency and geography.',
    'Scope a vague prompt down to three or four core features, and say out loud what you are leaving out.',
  ],
  analogy: {
    title: 'A tailor’s first five minutes',
    body: 'A good tailor does not start cutting cloth the moment you walk in. She asks what the suit is for, when you need it and how you like it to fit, then takes a handful of measurements. Each answer changes the cut.\n\nShe does not ask which brand of thread you prefer, and she says up front that fixing your other jackets is a separate job. A few questions that change the result, and a clear line around the work: that is gathering requirements.',
  },
  whyItMatters:
    'Before her next practice round, Maya studies her first one. The questions she asked were not bad; most of them just changed nothing. Knowing whether hashtags are case-sensitive did not move a single box on the board.\n\nThe prompt, design a photo-sharing app, hides very different systems. An app for one family is a single server and a database; Snapgram, with 100 million daily users around the world, is dozens of services in several regions. Until Maya asks the right questions, she does not know which one she is designing, and she has five minutes to find out.',
  body: [
    { kind: 'heading', text: 'Two kinds of requirements' },
    {
      kind: 'prose',
      md: 'Functional requirements say what the system does, usually as things a user can do: upload a photo, follow someone, see a feed. Non-functional requirements say how well it must do them: how many users, how fast, how fresh, how available. The functional ones shape the [[application programming interface|api]] (API) and the data model; the non-functional ones shape the architecture.',
    },
    {
      kind: 'compare',
      caption: 'Snapgram’s requirements after five minutes.',
      left: {
        title: 'Functional: what it does',
        points: ['Users upload photos.', 'Users follow other users.', 'Users see a feed of photos from the people they follow.'],
        verdict: 'Shapes the API and the data model.',
      },
      right: {
        title: 'Non-functional: how well, as numbers',
        points: [
          'About 10 million daily users.',
          'The feed loads in under 200 ms for 99% of requests.',
          'A new post reaches followers within a few seconds.',
          'Users in North America and Asia.',
        ],
        verdict: 'Shapes the architecture: caches, queues and regions.',
      },
    },
    {
      kind: 'prose',
      md: 'Write every non-functional requirement as a number. “Fast” cannot be checked, but “the feed loads in under 200 ms for 99% of requests” can, and it tells you which paths need a cache. That 99% is a [[percentile|percentile]], and a target like this is a small [[service level objective|slo]] (SLO).',
    },
    { kind: 'heading', text: 'Five questions that change the design' },
    {
      kind: 'prose',
      md: 'Most prompts hide the same five unknowns, and five [[clarifying questions|clarifying-question]] uncover them. Ask each in your own words, and write the answer down as a number or a short phrase. The [[read/write ratio|read-write-ratio]], for example, is how many reads the system serves for each write.',
    },
    {
      kind: 'table',
      columns: ['Ask about', 'A way to ask', 'What the answer changes'],
      rows: [
        ['Scale', 'How many daily users, and how fast is it growing?', 'How many servers, how much storage, and whether one database is enough.'],
        [
          'Read/write ratio',
          'How often is a photo viewed compared with posted?',
          'Whether to build for reads, with caches and a content delivery network, or for writes, with queues and [[sharding|sharding]].',
        ],
        ['Latency', 'How fast must the main screen load?', 'Which paths must be precomputed or cached, and which work can run in the background.'],
        [
          'Consistency',
          'Must followers see a new post at once?',
          'Whether you need [[strong consistency|strong-consistency]], which costs speed, or can accept [[eventual consistency|eventual-consistency]].',
        ],
        ['Geography', 'Where are the users?', 'Whether you need servers near users, a second [[region|region]], or rules on where data may live.'],
      ],
      caption: 'Ask all five in about two minutes. Each answer moves at least one box.',
    },
    {
      kind: 'diagram',
      title: 'How five answers shape Snapgram’s design',
      caption: 'Each step adds one answer to the simplest design. Use Play, or the arrow keys.',
      spec: answers,
    },
    { kind: 'heading', text: 'Scoping it down' },
    {
      kind: 'prose',
      md: 'A photo-sharing app could include messaging, stories, video, search, ads and payments. In 45 minutes you can design three or four features well, so propose the core ones, confirm them, and say out loud what you are leaving out. Write that list in a corner of the board; it is the [[out of scope|out-of-scope]] list, and it keeps features from creeping back in.',
    },
    {
      kind: 'prose',
      md: 'Scoping out is not dodging. It shows judgment about what matters, and it buys time to go deep on the parts that do. If the interviewer wants one of them back, they will say so, and the list tells you what to reopen.',
    },
    {
      kind: 'sequence',
      title: 'Five minutes, five questions',
      caption: 'Maya’s requirements step for the photo-sharing prompt. Notice that she proposes a scope instead of asking an open question.',
      spec: fiveMinutes,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real prompts sometimes come with numbers, or the interviewer says “you decide.” Then state an assumption, such as 10 million daily users, write it down and move on. This lesson also leaves out [[availability|availability]] and [[durability|durability]] targets, which deserve one question each when downtime or lost data would be costly.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'requirements-worksheet',
      title: 'The requirements worksheet',
      caption:
        'Pick the questions you would ask after the prompt. Each one reveals the interviewer’s answer, what it changes and what it adds to your worksheet. Then review your picks to see which essential questions you skipped and which ones wasted time.',
      props: { prompt: 'photo-sharing' },
    },
  ],
  realWorld: {
    title: 'The checklist in an open guide',
    body: 'The System Design Primer, a free guide on GitHub, starts its advice on interview questions with one step: outline use cases, constraints and assumptions. It calls the interview an open-ended conversation and tells you to ask questions that clarify use cases and constraints.\n\nIts checklist covers who will use the system and how, how many users there are, what the system does, its inputs and outputs, how much data to expect, how many requests per second, and the expected ratio of reads to writes. Scale and the read/write ratio are there by name; latency, consistency and geography are what this lesson adds for a system like Snapgram.',
    sourceUrl: 'https://github.com/donnemartin/system-design-primer#how-to-approach-a-system-design-interview-question',
    sourceLabel: 'Donne Martin, The System Design Primer, “How to approach a system design interview question”',
  },
  interview: {
    whenToMention:
      'At the very start, before you draw anything, in about five minutes. Propose a scope, ask the five questions, then read the list back so the interviewer can correct it. Return to a requirement whenever a choice depends on it: “because followers can see posts a few seconds late, the feed can be built in the background.”',
    sayItLikeThis: [
      'Before I design anything, I’d like to pin down scope. I’ll focus on uploading photos, following people and the home feed, and leave out messaging and video. Does that match what you had in mind?',
      'Roughly how many daily users should I plan for, and how many views per upload? That tells me whether to build mainly for reads.',
      'Let me read that back: 10 million daily users, about 100 views per upload, a feed in under 200 milliseconds, a few seconds of delay is fine for followers, and users worldwide.',
    ],
    followUps: [
      {
        q: 'Why do you care about the read/write ratio?',
        a: 'It tells me where the load is. At 100 views per upload, almost all traffic is reads, so caches, precomputed feeds and a content delivery network matter more than write speed. A write-heavy system would push me toward queues and sharding instead.',
      },
      {
        q: 'I won’t give you a number for users. What do you do?',
        a: 'I state an assumption, say 10 million daily users, write it down and design for it. I also say what would change at ten times more or ten times less, so the design does not hinge on my guess.',
      },
      {
        q: 'Why leave out messaging? Real apps have it.',
        a: 'In 45 minutes I would rather design the core well than everything badly. Messaging is a real-time system of its own; I’d add it later as a separate service, and I’m happy to discuss it if you want.',
      },
    ],
    redFlags: [
      'Drawing before asking a single question.',
      'Twenty questions, or questions that change nothing, such as which programming language to use.',
      'Non-functional requirements as adjectives, such as “fast” and “scalable”, instead of numbers.',
      'Trying to include every feature the prompt could imply.',
    ],
  },
  mistakes: [
    '**Only functional requirements.** Knowing the features without the scale or the latency target gives you a design for some other system.',
    '**Adjectives instead of numbers.** “Fast” and “highly available” cannot be checked; “under 200 ms for 99% of requests” can.',
    '**Questions that change nothing.** Language, cloud provider and screen design use up the clock without moving a single box.',
    '**No out-of-scope list.** Without one, features creep back in and the design outgrows the time you have.',
    '**Never reading the list back.** A ten-second recap catches the misunderstanding that would otherwise surface at minute 30.',
  ],
  quiz: [
    {
      kind: 'multi',
      prompt: 'Which of these are non-functional requirements?',
      options: [
        { text: 'The feed loads in under 200 ms for 99% of requests', correct: true, why: 'It says how fast, not what the system does, so it is non-functional.' },
        { text: 'Users can follow other users', correct: false, why: 'It is something a user can do, so it is functional.' },
        { text: 'The system serves 10 million daily users', correct: true, why: 'Scale says how big, not what, so it is non-functional.' },
        { text: 'Followers see a new post within a few seconds', correct: true, why: 'It sets a freshness target, which is a consistency requirement.' },
        { text: 'Users can upload photos', correct: false, why: 'A feature, so it is functional.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'The interviewer says each photo is viewed about 100 times for every upload. Which choice does that support most?',
      options: [
        {
          text: 'Caching feeds and serving photos through a content delivery network',
          correct: true,
          why: 'Reads dominate, so the read path deserves the most investment.',
        },
        { text: 'Sharding the database to speed up writes', correct: false, why: 'Writes are rare here, so this solves a problem the system does not have yet.' },
        { text: 'A queue in front of every request', correct: false, why: 'Queues smooth out writes and slow work; they do not make reads faster.' },
        { text: 'Strong consistency for every read', correct: false, why: 'That makes reads slower and costlier, the opposite of what a read-heavy system needs.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which question is the lowest value in the first five minutes?',
      options: [
        { text: 'Which programming language should the servers use?', correct: true, why: 'The design is the same in any mainstream language, so the answer changes nothing.' },
        { text: 'How many daily users should I plan for?', correct: false, why: 'Scale sizes everything else, from servers to storage.' },
        { text: 'Must followers see a new post instantly?', correct: false, why: 'The answer decides whether feeds can be updated in the background.' },
        { text: 'Where are the users?', correct: false, why: 'Geography decides whether you need servers near users or a second region.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put Maya’s first five minutes in order.',
      items: [
        'Hear the one-line prompt',
        'Propose three or four core features and confirm them',
        'Ask the questions that set the numbers',
        'Read the requirements back',
        'Move on to the estimate',
      ],
      why: 'Scope comes first because the numbers depend on which features you build, and the read-back catches a misunderstanding before the design depends on it.',
    },
    {
      kind: 'numeric',
      prompt: 'If each question and its answer take about 30 seconds, about how many questions fit in a five-minute requirements step?',
      answer: 10,
      unit: 'questions',
      tolerance: 1.1,
      solution: [
        'Five minutes is 5 × 60 = 300 seconds.',
        '300 ÷ 30 = 10 questions.',
        'Five of them should be scale, the read/write ratio, latency, consistency and geography.',
      ],
    },
  ],
  takeaways: [
    'Functional requirements say what the system does and shape the API; non-functional requirements say how well, as numbers, and shape the architecture.',
    'Always ask about scale, the read/write ratio, latency, consistency and geography, because each answer changes part of the design.',
    'Scope the prompt to three or four core features, write down what is out of scope, and read the list back before moving on.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Availability and durability.** For systems where downtime or lost data is costly, such as payments, ask how much downtime a month is acceptable and whether any data may ever be lost. The answers decide replication and backups; [availability in nines](lesson:availability-nines) shows how to turn them into numbers.',
    },
    {
      kind: 'prose',
      md: '**Ask for numbers you can multiply.** Daily users, actions per user and the size of each item are the inputs every estimate needs, so ask in those units. [Estimation in the room](lesson:estimation-in-the-room) picks up from there.',
    },
  ],
  flashcards: [
    {
      front: 'What is the difference between functional and non-functional requirements?',
      back: 'Functional requirements say what the system does. Non-functional ones say how well, such as scale, speed and freshness, ideally as numbers.',
    },
    { front: 'Which five questions change a design most?', back: 'Scale, read/write ratio, latency, consistency and geography.' },
    {
      front: 'Why ask about the read/write ratio?',
      back: 'It shows where the load is. Read-heavy systems invest in caches and content delivery networks; write-heavy ones in queues and sharding.',
    },
    { front: 'How should you write a latency requirement?', back: 'As a number at a percentile, such as the feed loading in under 200 ms for 99% of requests.' },
    { front: 'What is an out-of-scope list?', back: 'The features you agree to leave out, written on the board so the design fits the time.' },
    {
      front: 'What do you do if the interviewer will not give you numbers?',
      back: 'State an assumption, write it down, design for it, and say what would change if the real number were very different.',
    },
  ],
  related: ['interview-framework', 'estimation-in-the-room', 'api-and-data-model', 'back-of-the-envelope', 'consistency-models', 'percentiles-tail-latency', 'cdns'],
  glossaryTerms: [
    'functional-requirement',
    'non-functional-requirement',
    'api',
    'percentile',
    'slo',
    'clarifying-question',
    'read-write-ratio',
    'sharding',
    'strong-consistency',
    'eventual-consistency',
    'region',
    'load-balancer',
    'stateless',
    'read-your-writes',
    'cdn',
    'out-of-scope',
    'timebox',
    'availability',
    'durability',
  ],
};

export default lesson;
