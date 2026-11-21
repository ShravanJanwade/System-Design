import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** What the whiteboard holds after each of the six phases. One step per phase. */
const board: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 3, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'photos', type: 'objectStore', label: 'Photo storage', x: 2, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 1, y: 0 },
    { id: 'cache', type: 'cache', label: 'Feed cache', x: 2, y: 2 },
  ],
  edges: [
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-photos', from: 'app', to: 'photos', kind: 'sync' },
    { id: 'users-cdn', from: 'users', to: 'cdn', kind: 'sync' },
    { id: 'cdn-photos', from: 'cdn', to: 'photos', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        '**Requirements, about 5 minutes.** The board is nearly empty. You agree on the core features (upload, follow, a feed), the scale (say, 10 million daily users) and what matters most, such as a fast feed.',
      focus: ['users'],
      notes: [{ target: 'users', text: 'upload, follow, feed', tone: 'plain' }],
    },
    {
      caption:
        '**Estimation, about 3 to 5 minutes.** With 10 million daily users viewing about 50 photos each, that is about 6,000 views a second, and uploads add roughly a terabyte a day (ballpark). Reads far outnumber writes, so the design must be built for reading.',
      focus: ['users'],
      notes: [
        { target: 'users', text: '≈ 6,000 views/s', tone: 'signal' },
        { target: 'users', text: '≈ 1 TB/day', tone: 'plain' },
      ],
    },
    {
      caption:
        '**API and data model, about 5 minutes.** Three calls cover the core features: upload a photo, follow someone and get the feed. The **database** stores users, photos and follows.',
      add: ['app', 'db'],
      flow: ['app-db', '<app-db'],
      notes: [
        { target: 'app', text: '3 API calls', tone: 'plain' },
        { target: 'db', text: 'users, photos, follows', tone: 'plain' },
      ],
    },
    {
      caption:
        '**High-level design, about 10 minutes.** Now the boxes and arrows: a [[load balancer|load-balancer]] in front of the app servers, photo files in their own storage, and a [[content delivery network|cdn]] (CDN) serving them near users. You walk one feed request through it to show the design works.',
      add: ['lb', 'photos', 'cdn'],
      flow: ['users-lb', 'lb-app', 'app-db', '<app-db', '<lb-app', '<users-lb'],
    },
    {
      caption:
        '**Deep dives, about 15 minutes.** You pick the hardest part and go deep. Here it is the feed: building it on every request is slow, so you compare precomputing feeds into a [[cache|cache]] with building them on read, and pick one for these numbers.',
      add: ['cache'],
      focus: ['app', 'cache', 'db'],
      flow: ['lb-app', { edge: 'app-cache', tag: 'hit' }, '<app-cache', '<lb-app'],
    },
    {
      caption:
        '**Wrap-up, about 5 minutes.** You step back and name the weak spots. The one **database** is a [[single point of failure|single-point-of-failure]], so you would add replicas and plan for [[failover|failover]], then summarize the main trade-offs.',
      fail: ['db'],
      notes: [{ target: 'db', text: 'only copy', tone: 'alert' }],
    },
  ],
};

/** The rhythm of a good session: you ask, propose, check in and explain. */
const rhythm: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'you', type: 'client', label: 'You' },
  ],
  groups: [
    { label: 'Scope', from: 1, to: 3 },
    { label: 'Design', from: 4, to: 4 },
    { label: 'Deep dive', from: 5, to: 6 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'you',
      label: 'Design a photo-sharing app',
      kind: 'sync',
      caption: 'One line, no numbers. Everything else comes from your questions.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'Which features? How many users?',
      kind: 'sync',
      caption: 'You open with questions, and say how you plan to spend the time so the interviewer can redirect you early.',
    },
    {
      from: 'interviewer',
      to: 'you',
      label: 'Feed and uploads, 10M daily users',
      kind: 'reply',
      caption: 'Now there is something concrete to design for.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'A simple version first',
      kind: 'sync',
      caption: 'You sketch the simplest design that works, walk a request through it, and check in before going further.',
    },
    {
      from: 'interviewer',
      to: 'you',
      label: 'What if a celebrity posts?',
      kind: 'sync',
      caption: 'The interviewer probes. It is an invitation to go deeper, not a trap.',
    },
    {
      from: 'you',
      to: 'interviewer',
      label: 'Two options, and my pick',
      kind: 'reply',
      caption: 'You name the options and what each costs, pick one for these requirements, and say what would change your mind.',
    },
  ],
};

const lesson: Lesson = {
  id: 'interview-at-a-glance',
  module: 'm0',
  order: 3,
  title: 'The interview at a glance',
  idea: 'A system design interview is a 45- to 60-minute conversation in which you turn a deliberately vague prompt into a working design, out loud, while the interviewer watches how you think.',
  minutes: 13,
  prerequisites: ['what-is-system-design'],
  outcomes: [
    'Describe the format of a system design interview: who is there, how long it lasts and what you work on.',
    'Lay out the six steps of the interview framework and roughly how many minutes each one gets.',
    'Recognize what a strong session feels like: a collaborative conversation that you drive.',
  ],
  analogy: {
    title: 'An architect’s first meeting',
    body: 'A family tells an architect they want a house by the lake. A good architect does not start drawing windows. She asks how many people will live there, what the budget is and how harsh the winters are.\n\nThen she sketches a rough plan and explains why the kitchen faces the water. When the family mentions a grandmother who uses a wheelchair, the plan changes. Questions first, a rough sketch next, trade-offs out loud: that is a system design interview.',
  },
  whyItMatters:
    '“Design a photo-sharing app” is a classic interview prompt, and Snapgram is that app. By the end of this course you will know every part it needs. In the room, though, you get one line, 45 minutes and a whiteboard.\n\nPicture two candidates who know the same things. One draws for twenty minutes without asking a question and runs out of time. The other asks questions first, has a simple design by minute twenty, and goes deep on the hardest part. The second does far better, and this lesson is about why.',
  body: [
    {
      kind: 'prose',
      md: 'A system design interview is usually one interviewer and you, for 45 to 60 minutes. The prompt is deliberately vague, often a single line. You work on a whiteboard, or a shared drawing tool when the interview is remote, and you rarely write code.\n\nIt is one round in a loop that usually also includes coding and behavioral interviews. Many entry-level loops have a lighter design round or none at all, while mid and senior loops lean on it heavily.',
    },
    { kind: 'heading', text: 'Six steps in 45 minutes' },
    {
      kind: 'prose',
      md: 'Strong candidates follow a plan. The one this course teaches has six steps, and Module 8 practices each in depth. First come the requirements: [[functional requirements|functional-requirement]] (what the system does) and [[non-functional requirements|non-functional-requirement]] (how fast, how big, how reliable). Then a quick estimate, the [[application programming interface|api]] (API) and [[data model|data-model]], a [[high-level design|high-level-design]], two or three [[deep dives|deep-dive]], and a wrap-up on [[bottlenecks|bottleneck]], failures and trade-offs.',
    },
    {
      kind: 'numbers',
      caption: 'A 45-minute budget. In a 60-minute interview, give the extra time to the high-level design and the deep dives.',
      items: [
        { label: 'Requirements', value: '≈ 5 min' },
        { label: 'Estimation', value: '≈ 3–5 min', note: 'only what informs a decision' },
        { label: 'API and data model', value: '≈ 5 min' },
        { label: 'High-level design', value: '≈ 10 min' },
        { label: 'Deep dives', value: '≈ 15 min', note: 'the largest block' },
        { label: 'Wrap-up', value: '≈ 5 min', note: 'bottlenecks, failures, trade-offs' },
      ],
    },
    {
      kind: 'diagram',
      title: 'The board, phase by phase',
      caption: 'What a photo-sharing design looks like on the whiteboard after each step. Use Play, or the arrow keys.',
      spec: board,
    },
    {
      kind: 'prose',
      md: 'Ten minutes in, little has been drawn, and that is fine: the questions decide what is worth drawing. By minute 25 a simple, complete design is on the board, leaving the largest block for the deep dives.',
    },
    { kind: 'heading', text: 'What a good session feels like' },
    {
      kind: 'prose',
      md: 'A good session feels like two engineers designing together, with you driving. You propose what to do next instead of waiting to be asked, you think out loud, and you check in at each step. When the interviewer adds a constraint or asks “what if”, you treat it as a hint about what they want to see, not as an attack.',
    },
    {
      kind: 'sequence',
      title: 'The rhythm of a strong session',
      caption: 'A compressed session. Notice who proposes each next step.',
      spec: rhythm,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real interviews vary. Some last 60 minutes, some save the last few minutes for your questions, and some lean toward product or API design. The six steps are a default you adapt to the interviewer, not a script.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'interview-timeline',
      title: 'The interview timeline',
      caption: 'Select a phase to see its goal, what the interviewer looks for, a way to open it and a common mistake. The bar is drawn to scale for a 45-minute interview.',
      props: { length: 45, initial: 0 },
    },
  ],
  realWorld: {
    title: 'How one company describes its design round',
    body: 'Meta’s careers blog published a guide for software engineering candidates in 2022. It describes the design interview as 45 minutes long, almost never involving code: you talk and draw on a whiteboard while the interviewer gives you a very broad design problem. Interviewers typically save the last five minutes for your questions, which leaves about 40 for the design.\n\nIts advice matches this lesson: start with requirements, outline your high-level approach, focus on the interesting and hard parts because there is not time for every detail, explore the trade-offs, and drive the discussion while keeping it a conversation.',
    sourceUrl: 'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
    sourceLabel: 'Meta Careers, “Preparing for your software engineering interview at Meta” (2022)',
  },
  interview: {
    whenToMention:
      'In the first minute. After hearing the prompt, say how you plan to use the time, then follow that plan out loud. Mention the clock when you change phase, for example “I have a working design, so I’d like to spend the next 15 minutes on the feed.” It shows control and gives the interviewer a chance to steer.',
    sayItLikeThis: [
      'I’ll start by clarifying requirements, do a quick estimate, sketch the API and a simple design, then spend most of our time on the hardest parts. Does that work for you?',
      'We have about five minutes left, so let me summarize the bottlenecks and what I’d change at ten times the traffic.',
    ],
    followUps: [
      {
        q: 'What if the interviewer interrupts your plan with a different question?',
        a: 'Follow them. A question is a hint about what they want to evaluate, so answer it, then say where you were and carry on.',
      },
      {
        q: 'How much time should estimation take?',
        a: 'Three to five minutes, and only for numbers that change a decision, such as requests per second or whether the data fits in memory. If an estimate would not change the design, skip it and say so.',
      },
      {
        q: 'What should you do if you get stuck?',
        a: 'Say what you are thinking, name the options you are weighing, and ask a focused question. Silence is worse than an imperfect idea.',
      },
    ],
    redFlags: [
      'Drawing for ten minutes before asking a single question.',
      'Spending half the interview on estimates or one small detail, and never finishing a design.',
      'Waiting for the interviewer to say what to do next.',
      'Arguing with a hint instead of exploring it.',
    ],
  },
  mistakes: [
    '**Skipping requirements.** You end up designing a different system from the one the interviewer had in mind.',
    '**Estimating everything.** Numbers that do not change a decision only use up the clock.',
    '**Never reaching the deep dives.** They carry the most weight, so a design still half-drawn at minute 30 is in trouble.',
    '**Designing in silence.** The interviewer can only grade what they hear and see.',
    '**No wrap-up.** Stopping mid-sentence wastes the chance to show you know your design’s weak spots.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put the six steps of the interview framework in order.',
      items: ['Requirements', 'Estimation', 'API and data model', 'High-level design', 'Deep dives', 'Wrap-up'],
      why: 'Each step needs the one before: estimates need agreed requirements, the API serves the features, the design implements the API, deep dives need a design to improve, and the wrap-up reviews the whole thing.',
    },
    {
      kind: 'single',
      prompt: 'What is the usual format of a system design interview?',
      options: [
        {
          text: 'One interviewer, 45 to 60 minutes, a vague prompt, and a whiteboard or drawing tool',
          correct: true,
          why: 'That is the standard shape: a conversation in which you talk and draw while the interviewer probes.',
        },
        {
          text: 'A panel of interviewers, two hours and a detailed specification',
          correct: false,
          why: 'The prompt is short on purpose. Turning it into a specification is your job.',
        },
        { text: 'A take-home assignment with working code', correct: false, why: 'Design rounds are live conversations and rarely involve code.' },
        {
          text: 'A multiple-choice test on distributed systems',
          correct: false,
          why: 'Interviewers assess how you reason through an open problem, which a test cannot capture.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'In a 45-minute interview, you spend 5 minutes on requirements, 5 on estimation, 5 on the API (application programming interface) and data model, 10 on the high-level design and 5 on the wrap-up. How many minutes are left for deep dives?',
      answer: 15,
      unit: 'minutes',
      tolerance: 1.1,
      solution: [
        '5 + 5 + 5 + 10 + 5 = 30 minutes on the other five steps.',
        '45 − 30 = 15 minutes for deep dives.',
        'That is the largest single block, because deep dives are where you show depth.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are signs of a strong session?',
      options: [
        { text: 'You ask clarifying questions before drawing', correct: true, why: 'Scoping first means you design the system the interviewer has in mind.' },
        { text: 'You say how you plan to use the time', correct: true, why: 'It shows structure and gives the interviewer an early chance to redirect you.' },
        { text: 'You propose what to dig into next', correct: true, why: 'Driving the session is a strong signal, especially at mid and senior levels.' },
        { text: 'You wait for the interviewer to choose each next step', correct: false, why: 'Waiting to be led reads as a lack of ownership.' },
        {
          text: 'You avoid mentioning weaknesses in your design',
          correct: false,
          why: 'Every design has weak spots. Naming them, with fixes, shows judgment.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Why is the interview prompt so vague?',
      options: [
        {
          text: 'Turning a vague request into clear requirements is one of the skills being assessed',
          correct: true,
          why: 'Real projects start vague too. Asking the right questions is part of the job.',
        },
        { text: 'The interviewer has not prepared', correct: false, why: 'The vagueness is deliberate, and interviewers usually have specific requirements in mind.' },
        { text: 'Any design is acceptable', correct: false, why: 'Designs are judged against the requirements you agree on, so not every design fits.' },
        {
          text: 'To see how quickly you can start drawing',
          correct: false,
          why: 'Drawing before scoping is a red flag, not a strength.',
        },
      ],
    },
  ],
  takeaways: [
    'A system design interview is a 45- to 60-minute conversation with one interviewer, a vague prompt and a whiteboard.',
    'Six steps keep you on time: requirements, estimation, API and data model, high-level design, deep dives and wrap-up, with deep dives getting the most time.',
    'A strong session feels like two engineers designing together, with you driving and thinking out loud.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Levels change the depth, not the steps.** Entry-level candidates are expected to reach a sensible working design with some prompting. Senior candidates are expected to drive the deep dives, raise failure modes unprompted and weigh trade-offs with numbers. [What each level is expected to show](lesson:level-expectations) covers the differences.',
    },
    {
      kind: 'prose',
      md: '**Remote interviews.** When the board is a shared drawing tool, practice with one before the day. Drawing boxes and arrows with a mouse is slower than with a marker, so keep the diagram simple and label every arrow.',
    },
  ],
  flashcards: [
    {
      front: 'What is the usual format of a system design interview?',
      back: 'One interviewer, 45 to 60 minutes, a deliberately vague prompt, and a whiteboard or drawing tool. You talk and draw; there is rarely any code.',
    },
    { front: 'What are the six steps of the interview framework, in order?', back: 'Requirements, estimation, API and data model, high-level design, deep dives, wrap-up.' },
    { front: 'How does a 45-minute interview split across the six steps?', back: 'About 5, 3 to 5, 5, 10, 15 and 5 minutes. Deep dives get the most time.' },
    { front: 'What should estimation cover?', back: 'Only the numbers that change a decision, such as requests per second or storage, in 3 to 5 minutes.' },
    { front: 'What does a strong session feel like?', back: 'A collaborative conversation that you drive: you ask, propose, check in and explain trade-offs out loud.' },
    { front: 'What belongs in the wrap-up?', back: 'The bottlenecks, what happens when parts fail, the main trade-offs, and what you would change at 10 times the scale.' },
  ],
  related: ['what-is-system-design', 'how-to-use-blueprint', 'interview-framework', 'requirements', 'deep-dives', 'mistakes-that-sink'],
  glossaryTerms: [
    'functional-requirement',
    'non-functional-requirement',
    'api',
    'data-model',
    'high-level-design',
    'deep-dive',
    'bottleneck',
    'load-balancer',
    'cdn',
    'cache',
    'single-point-of-failure',
    'failover',
  ],
};

export default lesson;
