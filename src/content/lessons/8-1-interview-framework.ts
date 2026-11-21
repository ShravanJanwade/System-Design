import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The simple, complete design Maya should have on the board by minute 25, walked through with one request. */
const minute25: DiagramSpec = {
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
        '**Minute 15: the simplest design that works.** **Phones** reach [[stateless|stateless]] **app servers** through a [[load balancer|load-balancer]], photo details go in a **database**, and the files go in [[object storage|object-storage]]. Nothing is optimized yet.',
      focus: ['phones', 'lb', 'app', 'db', 'photos'],
    },
    {
      caption:
        '**One upload, end to end.** The photo goes through the **load balancer** to an app server, which stores the file in **photo storage** and then writes its details to the **database**. Walking a real request shows that every arrow means something.',
      flow: ['phones-lb', 'lb-app', 'app-photos', '<app-photos', 'app-db', '<app-db', '<lb-app', '<phones-lb'],
    },
    {
      caption:
        '**One feed read.** Feeds wait ready-made in the **feed cache**, because the requirements asked for a feed in well under a second. The photos themselves come from a [[content delivery network|cdn]] (CDN) close to the user.',
      add: ['cdn', 'feed'],
      flow: ['phones-lb', 'lb-app', { edge: 'app-feed', tag: 'hit' }, '<app-feed', '<lb-app', '<phones-lb', 'phones-cdn', '<phones-cdn'],
    },
    {
      caption:
        '**Minute 25: the checkpoint.** The design is simple but complete, so Maya names the two hardest parts, feeds for accounts with millions of followers and photos served worldwide, and proposes to spend the next 15 minutes on them.',
      focus: ['feed', 'cdn', 'app'],
      notes: [
        { target: 'feed', text: 'deep dive 1', tone: 'signal' },
        { target: 'cdn', text: 'deep dive 2', tone: 'signal' },
      ],
    },
  ],
};

/** The same prompt run with the framework: each change of step is said out loud. */
const signposts: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'Plan', from: 1, to: 2 },
    { label: 'Requirements', from: 3, to: 3 },
    { label: 'Estimate and design', from: 4, to: 5 },
    { label: 'Deep dives', from: 6, to: 7 },
    { label: 'Wrap-up', from: 8, to: 8 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Design a photo-sharing app',
      kind: 'sync',
      caption: '**Minute 0.** One line, no numbers. This time Maya starts with a plan, not a question.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Here’s how I’ll use our 45 minutes',
      kind: 'sync',
      caption:
        'Twenty seconds: requirements, a quick estimate, the API, a simple design, then most of the time on the hardest parts. She asks whether that works, which gives the interviewer an early chance to steer.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'How many users? Reads per upload?',
      kind: 'sync',
      caption: 'A handful of questions that change the design, not twenty that do not.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'About 5,000 views a second: build for reads',
      kind: 'sync',
      caption:
        '**Minute 5.** She reads the requirements back in one breath, then gives one estimate that matters and what it means. Three API calls and three tables follow in about five minutes.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Here’s one upload, end to end',
      kind: 'sync',
      caption: '**Minute 15.** A simple design goes on the board, and she walks one request through it before improving anything.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Next: the feed, then photo delivery',
      kind: 'sync',
      caption: '**Minute 25.** She proposes the deep dives herself, hardest first, and says how long each will take.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'What if a celebrity posts?',
      kind: 'sync',
      caption: 'A probe, the [[celebrity problem|celebrity-problem]]. She handles it inside the feed deep dive she is already leading.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'To wrap up: risks and next steps',
      kind: 'sync',
      caption: '**Minute 40.** Bottlenecks, failures and trade-offs, in a summary she chose rather than one cut off by the clock.',
    },
  ],
};

const lesson: Lesson = {
  id: 'interview-framework',
  module: 'm8',
  order: 1,
  title: 'The framework',
  idea: 'A system design interview goes best as six steps with a time budget, from requirements to a wrap-up, so that 45 minutes end with a complete, explained design instead of half of one.',
  minutes: 15,
  prerequisites: ['interview-at-a-glance', 'back-of-the-envelope'],
  outcomes: [
    'Run a 45-minute design interview as six steps, knowing what each step should leave on the board and roughly how long it gets.',
    'Signpost each change of step and check the clock at fixed minutes, so you reach the deep dives with time to spare.',
    'Adjust the plan when you fall behind, when the interviewer steers you, or when the interview runs 60 minutes.',
  ],
  analogy: {
    title: 'A cooking contest with a clock',
    body: 'In a televised cooking contest, every cook gets the same basket and 45 minutes. The cooks who lose are rarely the least skilled. Often they spent 25 minutes perfecting a sauce and plated a raw main course at the buzzer.\n\nThe winners look at the clock before they pick up a knife. They decide what each part of the dish gets, put something complete on the plate early, and spend the time left on the parts that impress. A design interview rewards the same habit.',
  },
  whyItMatters:
    'Snapgram is hiring engineers, and Maya applies. She has used the app since its first weeks, when pages took almost a second to load from Oregon, and she has watched it grow to 100 million daily users. A friend on the team offers her a practice interview.\n\nThe prompt is one line: design a photo-sharing app. Maya asks good questions, then keeps asking, about private accounts, hashtags, deleted photos and comment threads. She spends 25 minutes on requirements, works through some estimates and tables, and when time runs out the whiteboard holds lists and numbers but not a single box. Her friend says she clearly knows a lot, but an interviewer can only grade what they see.',
  body: [
    {
      kind: 'prose',
      md: 'A framework is a plan for the clock. Each of its six steps leaves something on the board that the next step needs: the requirements decide which numbers to estimate, the numbers shape the [[application programming interface|api]] (API) and the [[data model|data-model]], and the design exists to serve that API. Skip a step and the gap shows later; overstay one and you steal minutes from a step that carries more weight.',
    },
    { kind: 'heading', text: 'Six steps, one budget' },
    {
      kind: 'prose',
      md: 'Here is the budget for a 45-minute interview. The first step pins down [[functional requirements|functional-requirement]], what the system does, and [[non-functional requirements|non-functional-requirement]], how big, how fast and how fresh it must be. Then come a [[back-of-the-envelope|back-of-the-envelope]] estimate, the API and data model, a [[high-level design|high-level-design]], two or three [[deep dives|deep-dive]], and a wrap-up.',
    },
    {
      kind: 'table',
      columns: ['Step', 'Time', 'What it leaves on the board'],
      rows: [
        ['Requirements', 'about 5 min', 'Three or four core features, the scale and qualities as numbers, and a short list of what is out of scope.'],
        ['Estimation', 'about 3 to 5 min', 'Two or three rounded numbers, each tied to a decision, such as peak [[requests per second|requests-per-second]] or storage per year.'],
        ['API and data model', 'about 5 min', 'The few calls clients make, and the main tables or records with their keys.'],
        ['High-level design', 'about 10 min', 'The simplest design that meets the requirements, with one request walked through it.'],
        ['Deep dives', 'about 15 min', 'Two or three hard parts, each with options, a choice and the reason for it.'],
        ['Wrap-up', 'about 5 min', 'The [[bottlenecks|bottleneck]], what happens when parts fail, the main [[trade-offs|trade-off]], and what changes at ten times the load.'],
      ],
      caption: 'A 45-minute budget. The minutes are a default, not a law; the order is what matters, because each step feeds the next.',
    },
    {
      kind: 'prose',
      md: 'Notice where the time goes. The first 25 minutes exist to make the last 20 possible: by minute 25 a simple, complete design is on the board, and the deep dives get the largest block because that is where you show depth. Estimation stays short on purpose, since only numbers that inform a decision earn their minutes; [estimation in the room](lesson:estimation-in-the-room) shows how to pick them.',
    },
    {
      kind: 'diagram',
      title: 'A complete design by minute 25',
      caption: 'What the board should hold when the deep dives begin. Use Play, or the arrow keys.',
      spec: minute25,
    },
    { kind: 'heading', text: 'Signposts and checkpoints' },
    {
      kind: 'prose',
      md: 'The interviewer cannot see your plan unless you say it. Open with a ten-second version of it, and mark each change of step with one sentence that closes the last step and names the next. This [[signposting|signposting]] keeps the interviewer with you, and it gives them a natural moment to steer.',
    },
    {
      kind: 'prose',
      md: 'Then treat each step as a [[timebox|timebox]]. Write the checkpoint minutes in a corner of the board, 5, 10, 15, 25 and 40, and at each one ask whether the step has left what it should. If not, close it with what you have and say so: a rough answer on time beats a perfect one that eats the deep dives.',
    },
    {
      kind: 'sequence',
      title: 'Signposts, minute by minute',
      caption: 'The same prompt, run with the framework. Notice the minute marks, and who proposes each next step.',
      spec: signposts,
    },
    { kind: 'heading', text: 'When the plan bends' },
    {
      kind: 'prose',
      md: 'Real interviews rarely run to the minute. Three adjustments cover most surprises:\n\n- **Running behind.** Shrink steps instead of skipping them: one estimate instead of three, three API calls without their details. Never skip the high-level design, because everything after it builds on it.\n- **Steered by the interviewer.** Follow the question and answer it fully, then say where you were and carry on. A question shows what they want to grade.\n- **A 60-minute interview.** The extra 15 minutes go to the high-level design and the deep dives, not to longer requirements.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Interviews vary. Some interviewers drive hard and choose the deep dives themselves, some save the last five minutes for your questions, and some skip estimation entirely. The six steps and their minutes are a default that you adapt to the person across the table, not a script to defend.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'interview-timeline',
      title: 'Your 45-minute budget',
      caption: 'Select a phase to see its goal, what the interviewer looks for, an opening line and a common mistake. The bar is drawn to scale.',
      props: { length: 45, initial: 0 },
    },
  ],
  realWorld: {
    title: 'A four-step version of the same plan',
    body: 'ByteByteGo’s system design interview course has a chapter called “A framework for system design interviews.” It splits a 45-minute interview into four steps: understand the problem and establish the design scope (3 to 10 minutes), propose a high-level design and get buy-in (10 to 15), a design deep dive (10 to 25), and a wrap-up (3 to 5). It calls these figures a very rough guide.\n\nThe shape matches this lesson’s six steps, which split its first step into requirements and estimation and give the API and data model a step of their own. The chapter also warns that small details can swallow the clock without showing anything about your abilities.',
    sourceUrl: 'https://bytebytego.com/courses/system-design-interview/a-framework-for-system-design-interviews',
    sourceLabel: 'ByteByteGo, “A framework for system design interviews”',
  },
  interview: {
    whenToMention:
      'In the first minute, right after the prompt. Say the plan in one or two sentences, ask whether it works, then use the step names as signposts. If the interviewer has a plan of their own, theirs wins: change the budget, keep the order.',
    sayItLikeThis: [
      'I’d like to spend about five minutes on requirements, a few on the numbers that affect the design, then the API, a simple design, and most of our time on the two or three hardest parts. Does that work for you?',
      'I have a simple design that handles uploads and the feed. I see two hard parts: feeds for very popular accounts and serving photos worldwide. Shall I start with the feed?',
      'We have about five minutes left, so let me wrap up: the main bottleneck, what happens when the cache fails, and what I’d change at ten times the traffic.',
    ],
    followUps: [
      {
        q: 'You’re ten minutes behind. What do you cut?',
        a: 'I shrink the early steps instead of skipping any: one estimate instead of three, three API calls without details. I never skip the high-level design, and I protect at least ten minutes for deep dives, because that is where depth shows.',
      },
      {
        q: 'Why not spend longer on requirements to get them exactly right?',
        a: 'They only need to be good enough to design against, and I can revisit them when a choice depends on one. After about five minutes, each extra question adds little, and a design I never draw cannot be graded.',
      },
      {
        q: 'What if I want to go deep on something you haven’t planned for?',
        a: 'Then we go there. Your question tells me what you want to see, so I answer it fully, then say where I was in my plan and pick it back up.',
      },
    ],
    redFlags: [
      'Drawing before agreeing on what to build, or asking questions for 20 minutes without drawing.',
      'No sense of time: the interviewer has to say “we need to move on” more than once.',
      'Reaching minute 35 without a complete design on the board.',
    ],
  },
  mistakes: [
    '**Over-gathering requirements.** Five good questions shape the design; twenty use up the clock and still leave the board empty.',
    '**Keeping the plan to yourself.** Without signposts, the interviewer cannot tell a deliberate shortcut from a gap.',
    '**Polishing one step.** A perfect estimate or a complete schema at minute 20 costs the deep dives, which carry more weight.',
    '**Skipping the high-level design to reach the interesting part.** Deep dives need a complete design to improve; without one they float.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put what the board should hold in the order it appears during the interview.',
      items: [
        'Agreed features, scale and qualities',
        'One or two numbers tied to decisions',
        'Three API calls and the main tables',
        'A simple design with one request walked through it',
        'Options and a choice for the hardest part',
        'A summary of risks and next steps',
      ],
      why: 'Each output is the input to the next step: numbers need agreed requirements, the design serves the API, deep dives improve a complete design, and the wrap-up reviews it all.',
    },
    {
      kind: 'numeric',
      prompt: 'In a 60-minute interview, the extra 15 minutes go to the high-level design (5 more) and the deep dives (10 more). About how many minutes do the deep dives get?',
      answer: 25,
      unit: 'minutes',
      tolerance: 1.1,
      solution: [
        'In the 45-minute plan, deep dives get about 15 minutes.',
        'The 60-minute plan adds 10 of its extra 15 minutes to them.',
        '15 + 10 = 25 minutes, still the largest block.',
      ],
    },
    {
      kind: 'single',
      prompt: 'It is minute 20, and Maya is still refining her estimates. What should she do?',
      options: [
        {
          text: 'Close the estimate with the numbers she has, say so, and start the high-level design',
          correct: true,
          why: 'A rough number on time beats a perfect one that costs the design, and she can refine it later if a decision depends on it.',
        },
        {
          text: 'Finish the estimates first, since wrong numbers lead to a wrong design',
          correct: false,
          why: 'Estimates only need the right order of magnitude, and a missing design is far worse than a rough number.',
        },
        {
          text: 'Skip the high-level design and go straight to a deep dive to catch up',
          correct: false,
          why: 'Deep dives improve a complete design; without one they have nothing to stand on.',
        },
        {
          text: 'Ask the interviewer for more time',
          correct: false,
          why: 'The length is fixed, and managing it is part of what is being assessed.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are good signposts?',
      options: [
        {
          text: '“Here’s my plan for our 45 minutes. Does that work for you?”',
          correct: true,
          why: 'It shows structure and invites the interviewer to redirect you early.',
        },
        {
          text: '“I have a working design. I’d like to spend 15 minutes on the feed next.”',
          correct: true,
          why: 'It closes one step, names the next and says how long it will take.',
        },
        {
          text: 'Silently starting to draw boxes',
          correct: false,
          why: 'The interviewer cannot tell where you are in your plan, or whether you have one.',
        },
        {
          text: 'Two minutes of silent thinking after the prompt',
          correct: false,
          why: 'A few seconds of thought is fine, but long silence hides your reasoning; think out loud instead.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Why do the deep dives get the largest block of time?',
      options: [
        {
          text: 'They are where you show depth, comparing options for the hardest parts and choosing with reasons',
          correct: true,
          why: 'A simple design shows you can build something; the deep dives show judgment, which separates strong candidates.',
        },
        {
          text: 'Interviewers grade only the deep dives',
          correct: false,
          why: 'Every step is graded; the deep dives simply carry the most signal about depth.',
        },
        {
          text: 'The high-level design does not matter much',
          correct: false,
          why: 'It matters enough to come first, which is why it is kept simple and finished early.',
        },
        {
          text: 'Deep dives are where you write code',
          correct: false,
          why: 'Design interviews rarely involve code; deep dives are about options and trade-offs.',
        },
      ],
    },
  ],
  takeaways: [
    'Six steps with a time budget, about 5, 3 to 5, 5, 10, 15 and 5 minutes, turn 45 minutes into a complete, explained design.',
    'Each step leaves something on the board that the next one needs, and a simple, complete design by minute 25 makes the deep dives possible.',
    'Signpost every change of step, check the clock at fixed minutes, and shrink steps rather than skip them when you fall behind.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why six steps and not four.** Many guides fold estimation into requirements and the API into the design. Splitting them out keeps two steps that are easy to forget on the board: the numbers behind a choice, and the calls a client makes.',
    },
    {
      kind: 'prose',
      md: '**Practice with a clock.** A [[mock interview|mock-interview]] with a visible timer builds the habit faster than reading about it. Blueprint’s mock interview mode follows these six steps, with a phase timer and a rubric at the end.',
    },
  ],
  flashcards: [
    {
      front: 'What are the six steps of a 45-minute design interview, with their minutes?',
      back: 'Requirements about 5, estimation about 3 to 5, API and data model about 5, high-level design about 10, deep dives about 15, wrap-up about 5.',
    },
    { front: 'What should be on the board by minute 25?', back: 'A simple, complete design that meets the requirements, with one request walked through it.' },
    { front: 'What is signposting?', back: 'Saying out loud where you are and what comes next, so the interviewer can follow your plan and steer it.' },
    {
      front: 'You are ten minutes behind. What do you cut?',
      back: 'Shrink the early steps, such as one estimate and three API calls, but never skip the high-level design, and protect time for the deep dives.',
    },
    { front: 'Where does the extra time in a 60-minute interview go?', back: 'To the high-level design and the deep dives, not to longer requirements.' },
    { front: 'What belongs in the wrap-up?', back: 'The bottlenecks, what happens when parts fail, the main trade-offs, and what changes at ten times the load.' },
  ],
  related: ['interview-at-a-glance', 'requirements', 'estimation-in-the-room', 'api-and-data-model', 'high-level-design', 'deep-dives', 'mistakes-that-sink'],
  glossaryTerms: [
    'api',
    'data-model',
    'functional-requirement',
    'non-functional-requirement',
    'back-of-the-envelope',
    'high-level-design',
    'deep-dive',
    'requests-per-second',
    'bottleneck',
    'trade-off',
    'stateless',
    'load-balancer',
    'object-storage',
    'cdn',
    'signposting',
    'timebox',
    'celebrity-problem',
    'mock-interview',
  ],
};

export default lesson;
