import type { Block, DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Transcript 4 on the whiteboard: parts nobody asked for, then the fix. */
const overBuilt: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 1 },
    { id: 'photos', type: 'objectStore', label: 'Photo storage', x: 1, y: 2 },
    { id: 'stream', type: 'stream', label: 'Event stream', x: 1, y: 0 },
    { id: 'wide', type: 'nosqlDb', label: 'Wide-column store', x: 2, y: 0 },
    { id: 'search', type: 'search', label: 'Search cluster', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-photos', from: 'app', to: 'photos', kind: 'sync' },
    { id: 'app-stream', from: 'app', to: 'stream', kind: 'async' },
    { id: 'stream-wide', from: 'stream', to: 'wide', kind: 'async' },
    { id: 'db-search', from: 'db', to: 'search', kind: 'async' },
  ],
  steps: [
    {
      caption:
        '**What the requirements need.** Upload photos, follow people and see a feed, for about 10,000 daily users in version one. Phones call the **app servers**, which keep photo details in the **database** and the files in **photo storage**.',
      flow: ['phones-app', 'app-db', '<app-db', '<phones-app'],
    },
    {
      caption:
        'Minute 18: Maya adds an [[event stream|event-stream]] and a [[wide-column store|wide-column-store]] “to be ready for a billion users”. No agreed number calls for either.',
      add: ['stream', 'wide', 'app-stream', 'stream-wide'],
      notes: [{ target: 'stream', text: 'which requirement?', tone: 'alert' }],
    },
    {
      caption:
        'Minute 19: a **search cluster** joins them, though nobody asked for search. Each new box must be deployed, monitored, paid for and explained, and the clock keeps running.',
      add: ['search', 'db-search'],
      notes: [{ target: 'search', text: 'not asked for', tone: 'alert' }],
    },
    {
      caption:
        '**The fix.** Start from the smallest design that meets the agreed numbers, and add a part only when a requirement or a number calls for it, saying which one. At 10,000 daily users, the first design was the right answer.',
      focus: ['phones', 'app', 'db', 'photos'],
    },
  ],
};

/** Maya's real interview, compressed: each step is the opposite of one mistake. */
const friday: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'Requirements', from: 1, to: 3 },
    { label: 'Design', from: 4, to: 4 },
    { label: 'Deep dive', from: 5, to: 7 },
    { label: 'Wrap-up', from: 8, to: 8 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Design a photo-sharing app',
      kind: 'sync',
      caption: 'Friday, minute 0: the same one-line prompt as every practice round.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Who uses it, and how much?',
      kind: 'sync',
      caption: 'Before drawing, Maya asks about core features, daily users, how stale a feed may be and where users live, and writes the answers on the board.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Feed and uploads, 10M daily users',
      kind: 'reply',
      caption: 'Those answers become the requirements she will check her design against.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'A simple design, narrated',
      kind: 'sync',
      caption: 'Minute 12: the smallest design that meets them, explained box by box as she draws, then one upload and one feed read walked through it.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Feed or photo delivery first?',
      kind: 'sync',
      caption: 'Minute 22: she checks the clock out loud, names the two hardest parts and proposes where to go deep.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'Start with the feed',
      kind: 'reply',
      caption: 'The interviewer picks, and Maya leads from there.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Copy or pull: my pick',
      kind: 'sync',
      caption: 'She says the trade-off in one sentence, tied to the read-heavy requirement, and names what would change her mind. Every part she adds comes with its reason.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Weak spots and next steps',
      kind: 'sync',
      caption: 'Minute 40: with five minutes left, she sums up the bottlenecks, what fails first and what she would change at ten times the traffic.',
    },
  ],
};

type Transcript = { title: string; lines: [time: string, line: string][] };

/** A practice-round transcript: one line per utterance, with the clock beside it. */
function transcript({ title, lines }: Transcript): Block {
  return { kind: 'annotated', title, lines: lines.map(([time, line]) => ({ code: line, note: time })) };
}

const MISTAKE_PROMPT = 'Which mistake does this transcript show?';

const lesson: Lesson = {
  id: 'mistakes-that-sink',
  module: 'm8',
  order: 9,
  title: 'Mistakes that sink candidates',
  idea: 'Six habits sink design interviews even when the candidate knows the material: jumping to a solution, buzzword soup, ignoring requirements, drawing in silence, over-engineering and running out of time.',
  minutes: 14,
  prerequisites: ['interview-framework', 'talking-tradeoffs'],
  outcomes: [
    'Spot the six classic mistakes in short transcripts of practice interviews.',
    'Replace each mistake with a habit that sends the interviewer the opposite signal.',
    'Plan a 45-minute interview that avoids all six, from the first question to the wrap-up.',
  ],
  analogy: {
    title: 'Failing a test you could pass',
    body: 'Plenty of people who fail a driving test can drive. They fail on habits: rolling through a stop sign, forgetting a mirror check, speeding up to finish sooner.\n\nExaminers keep a short list of faults, because the same few come up again and again. And they can grade only what they see: a mirror check done with a flick of the eyes may not count. A design interview works the same way, and your thinking counts only when it is said out loud.',
  },
  whyItMatters:
    'Maya has done six practice interviews for her Snapgram role, and friends recorded each one. Played back, the recordings are painful in a useful way. In one she starts drawing before the interviewer has finished the prompt; in another she says “Kafka” four times without explaining what it does for Snapgram.\n\nNone of the sessions went wrong for lack of knowledge. Each went wrong in a way she could not see while it was happening, which is why the transcripts help: on paper, the mistakes are obvious. Her real interview is on Friday.',
  body: [
    {
      kind: 'prose',
      md: 'Interviewers can grade only what they see and hear. Each mistake in this lesson hides an [[interview signal|interview-signal]] you have, or sends one you don’t mean to send. The transcripts below come from Maya’s practice rounds: read each one, decide which mistake it shows, then read the fix.',
    },
    { kind: 'heading', text: 'At the start' },
    transcript({
      title: 'Transcript 1, minute 0',
      lines: [
        ['0:00', 'Interviewer: Design a photo-sharing app.'],
        ['0:10', 'Maya: Sure. A load balancer up front, then app servers, then a database for the photos.'],
        ['0:40', 'Maya: (drawing) And uploads go straight into the database.'],
        ['1:30', 'Interviewer: Before we go on, who is this for, and how many users?'],
        ['1:35', 'Maya: Oh. I hadn’t thought about that yet.'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Jumping to a solution',
            correct: true,
            why: 'She draws a design within seconds, before asking who uses the app, what it must do or at what scale.',
          },
          { text: 'Drawing in silence', correct: false, why: 'She talks while she draws; the problem is the step she skipped.' },
          { text: 'Over-engineering', correct: false, why: 'Three boxes is a modest design. Nobody knows yet whether it fits.' },
          { text: 'Running out of time', correct: false, why: 'It is the first minute, so time is plentiful; it is going to the wrong step.' },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Jumping to a solution.** Drawing before asking tells the interviewer you will build the system you imagine, not the one they asked for. The fix is about five minutes of [[clarifying questions|clarifying-question]] on users, features, scale and what matters most, with the answers written down. They become your [[functional|functional-requirement]] and [[non-functional requirements|non-functional-requirement]].',
    },
    { kind: 'heading', text: 'While you design' },
    transcript({
      title: 'Transcript 2, minute 9',
      lines: [
        ['9:00', 'Interviewer: Those requirements look right. Over to you.'],
        ['9:05', '(Maya draws for four minutes without a word.)'],
        ['13:10', 'Interviewer: Can you walk me through what you’re drawing?'],
        ['13:15', 'Maya: One second, I’m nearly done. I’ll explain it all at the end.'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Drawing in silence',
            correct: true,
            why: 'Four quiet minutes give the interviewer nothing to grade and no chance to steer her early.',
          },
          { text: 'Jumping to a solution', correct: false, why: 'She agreed on requirements first, so she did not skip the questions.' },
          { text: 'Buzzword soup', correct: false, why: 'She names no technologies at all; she says nothing.' },
          {
            text: 'Ignoring requirements',
            correct: false,
            why: 'Nothing shows yet whether the design misses a requirement; the interviewer simply cannot tell.',
          },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Drawing in silence.** The interviewer cannot see your reasoning unless you say it, and four silent minutes also take away their chance to steer you early. The fix: narrate as you draw, one sentence per box saying what it is for, and check in after the first pass.',
    },
    transcript({
      title: 'Transcript 3, minute 14',
      lines: [
        ['14:00', 'Maya: Uploads go into Kafka, then Cassandra, with Redis in front.'],
        ['14:30', 'Maya: It all runs on Kubernetes with a service mesh, and the feed uses event sourcing.'],
        ['15:00', 'Interviewer: What does Kafka do for Snapgram here?'],
        ['15:05', 'Maya: It makes it scalable. The big companies all use it.'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Buzzword soup',
            correct: true,
            why: 'Six technologies in thirty seconds, and the one reason given would fit any of them.',
          },
          {
            text: 'Over-engineering',
            correct: false,
            why: 'The two often travel together, but the clearest problem here is that no name comes with a reason.',
          },
          { text: 'Drawing in silence', correct: false, why: 'She is talking; the trouble is what she says.' },
          {
            text: 'Jumping to a solution',
            correct: false,
            why: 'This is minute 14, after the requirements; the issue is how she justifies parts, not when she started.',
          },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Buzzword soup.** Naming tools sounds confident, but the interviewer is listening for reasons, and “it scales” is not one. The fix: say what a part does before what it is called, and tie it to a requirement, such as “a [[queue|message-queue]], because uploads spike when a celebrity posts.” A [[buzzword|buzzword]] with a real reason attached stops being one.',
    },
    transcript({
      title: 'Transcript 4, minute 18',
      lines: [
        ['18:00', 'Interviewer: Remember, version one is for about 10,000 daily users.'],
        ['18:10', 'Maya: Sure, but it should be ready for a billion. Every upload goes onto an event stream, and photo details go into a wide-column store as well.'],
        ['18:50', 'Maya: And I’ll add a search cluster, in case we want search later.'],
        ['19:10', 'Interviewer: For 10,000 users?'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Over-engineering',
            correct: true,
            why: 'She builds for a scale and features nobody asked for, and every extra part costs time to explain and money to run.',
          },
          { text: 'Ignoring requirements', correct: false, why: 'The design meets every agreed requirement; it just goes far beyond them.' },
          {
            text: 'Buzzword soup',
            correct: false,
            why: 'She gives a reason, readiness for a billion users; it is just not one the requirements support.',
          },
          { text: 'Running out of time', correct: false, why: 'Not yet, though building all this is how the clock starts to slip.' },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Over-engineering.** Every part beyond what the requirements need must still be deployed, watched, paid for and explained, so [[over-engineering|over-engineering]] spends time you need elsewhere. The fix: draw the smallest design that meets the agreed numbers, then grow it in steps, naming the number that forces each one. If the interviewer wants to see more scale, they will raise the numbers.',
    },
    {
      kind: 'diagram',
      title: 'The over-built board',
      caption: 'Transcript 4 on the whiteboard, and the fix. Use Play, or the arrow keys.',
      spec: overBuilt,
    },
    transcript({
      title: 'Transcript 5, minute 25',
      lines: [
        ['25:00', 'Interviewer: Earlier we agreed photos must load fast in Singapore and Europe, not only near Oregon.'],
        ['25:10', 'Interviewer: Where are photos served from in this design?'],
        ['25:15', 'Maya: From photo storage in Oregon, through the app servers.'],
        ['25:30', 'Interviewer: And for someone in Singapore?'],
        ['25:35', 'Maya: Oh, right. I forgot about that one.'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Ignoring requirements',
            correct: true,
            why: 'The design misses a requirement she agreed to twenty minutes earlier: fast photos far from Oregon.',
          },
          {
            text: 'Jumping to a solution',
            correct: false,
            why: 'She did ask questions first; she stopped checking her design against the answers.',
          },
          { text: 'Over-engineering', correct: false, why: 'The design does less than it should, not more.' },
          {
            text: 'Running out of time',
            correct: false,
            why: 'At minute 25 there is still time, and catching the gap now leaves room to fix it.',
          },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Ignoring requirements.** Agreeing on requirements and then designing past them tells the interviewer the questions were a ritual. The fix: before the deep dives, check the design against each requirement out loud, one line each. Here, that check would have added a [[content delivery network|cdn]] (CDN) to serve photos near Singapore.',
    },
    { kind: 'heading', text: 'At the end' },
    transcript({
      title: 'Transcript 6, minute 41',
      lines: [
        ['41:00', 'Interviewer: We have about four minutes left. How does the feed work?'],
        ['41:10', 'Maya: Ah. I spent a while on the storage numbers, so I haven’t reached the feed.'],
        ['41:30', 'Maya: Let me quickly draw the database schema first.'],
        ['45:00', 'Interviewer: We’ll have to stop there.'],
      ],
    }),
    {
      kind: 'quickCheck',
      question: {
        kind: 'single',
        prompt: MISTAKE_PROMPT,
        options: [
          {
            text: 'Running out of time',
            correct: true,
            why: 'With four minutes left, the core feature has no design and there is no wrap-up, so her best material is never heard.',
          },
          { text: 'Jumping to a solution', correct: false, why: 'If anything she started too slowly, spending too long on numbers.' },
          { text: 'Drawing in silence', correct: false, why: 'She is talking; the problem is where the minutes went.' },
          { text: 'Buzzword soup', correct: false, why: 'No technologies are named here; the clock is the problem.' },
        ],
      },
    },
    {
      kind: 'prose',
      md: '**Running out of time.** The deep dives carry the most weight, so a design still half-drawn at minute 40 limits how well you can do. The fix: [[timebox|timebox]] each phase, say the time out loud when you move on, and protect the last five minutes for the wrap-up. If a phase overruns, cut detail, not phases.',
    },
    { kind: 'heading', text: 'Maya’s real interview' },
    {
      kind: 'prose',
      md: 'On Friday, Maya gets the same one-line prompt. She knows no more than she did in the practice rounds; only her habits have changed.',
    },
    {
      kind: 'sequence',
      title: 'Friday, done right',
      caption: 'Maya’s real interview at Snapgram, compressed. Each step is the opposite of one mistake above.',
      spec: friday,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real interviews rarely show one clean mistake at a time: mistakes blend, and the same habit can look different with a different interviewer. These transcripts are short and illustrative, and the list is not complete; vague talk about trade-offs, covered in [Talking about trade-offs](lesson:talking-tradeoffs), sinks candidates too.',
    },
  ],
  realWorld: {
    title: 'Meta’s advice, read as a list of mistakes',
    body: 'Meta’s careers blog publishes advice for software engineering candidates, last updated in 2022. For the 45-minute design interview it says to start with requirements, outline a high-level approach, drive the discussion and make it a conversation.\n\nRead in reverse, that advice is this lesson. “There’s not enough time to discuss every detail of the design,” it warns, so find the interesting and hard problems to focus on. And a good solution “compares and contrasts different approaches”, rather than naming one.',
    sourceUrl: 'https://www.metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/',
    sourceLabel: 'Meta Careers, “Preparing for your software engineering interview at Meta” (updated 2022)',
  },
  interview: {
    whenToMention:
      'You never mention these mistakes; you show the opposite habits out loud. Say your plan for the time in the first minute, give each new component its reason as you draw it, and mention the clock when you change phase.',
    sayItLikeThis: [
      'Before I draw anything, can I ask a few questions about who uses this and how much?',
      'I’m adding a queue here because uploads spike when a celebrity posts; without that spike, I’d leave it out.',
      'We’re at minute 25 with a working design, so I’d like to spend the next 15 minutes on the feed, then wrap up.',
    ],
    followUps: [
      {
        q: 'What if you notice halfway through that you ignored a requirement?',
        a: 'Say so and fix it: “I just noticed this misses the latency requirement for Singapore, so let me add a content delivery network.” Catching your own mistake is a good signal; hoping nobody notices is not.',
      },
      {
        q: 'Is it ever right to name a specific technology?',
        a: 'Yes, when you say what it does for this design. “Kafka, because several services replay each upload” is a reason; “Kafka, because it scales” is not.',
      },
      {
        q: 'How do you recover when you are running out of time?',
        a: 'Say so and prioritize: name the part you won’t finish, sketch it in one sentence, and keep the last minutes for the wrap-up. A two-minute summary of weak spots is worth more than a half-drawn deep dive.',
      },
    ],
    redFlags: [
      'Boxes on the board in the first minute, before a single question.',
      'Technologies named with no reason tied to this design.',
      'Long silences while drawing.',
      'Reaching minute 40 without a complete design.',
    ],
  },
  mistakes: [
    '**Overcorrecting.** Fifteen minutes of questions to avoid jumping to a solution is its own mistake; about five is enough.',
    '**Narrating every stroke.** Thinking out loud means explaining decisions, not reading out each box as you draw it.',
    '**Avoiding every name.** Naming a technology is fine when you say what it does here; the mistake is a name with no reason.',
    '**Under-building to dodge over-engineering.** A design that ignores the agreed scale is as wrong as one built for a scale nobody asked for.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put these habits in the order they come up in a 45-minute interview.',
      items: [
        'Ask about users, scale and priorities before drawing',
        'Narrate the simplest design that works while you draw it',
        'Check the design against each agreed requirement',
        'Check the clock and choose the deep dives',
        'Save the last five minutes for the wrap-up',
      ],
      why: 'Questions come first, then a narrated simple design, then a check against the requirements before the deep dives, and the wrap-up closes the interview.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these are signs of buzzword soup?',
      options: [
        {
          text: 'Naming several technologies without saying what each does here',
          correct: true,
          why: 'Names without reasons give the interviewer nothing to evaluate.',
        },
        { text: 'Answering a question about a component with “it scales”', correct: true, why: 'Almost anything scales in some way, so it explains nothing.' },
        {
          text: 'Citing what big companies use as the reason for a choice',
          correct: true,
          why: 'Other companies’ needs are not this system’s requirements.',
        },
        {
          text: 'Choosing a queue because uploads spike when celebrities post',
          correct: false,
          why: 'That ties a component to a real requirement, which is exactly the fix.',
        },
        { text: 'Naming a well-known database and explaining why it fits', correct: false, why: 'A name with a reason is not a buzzword.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Twenty minutes in, you notice your design misses a requirement you agreed on. What should you do?',
      options: [
        { text: 'Say so, and adjust the design', correct: true, why: 'Catching and fixing your own gap shows judgment and keeps the design honest.' },
        { text: 'Keep going and hope the interviewer missed it', correct: false, why: 'They rarely miss it, and silence looks worse than the gap.' },
        { text: 'Start the whole design over', correct: false, why: 'Most gaps need one change, not a restart that eats the clock.' },
        { text: 'Argue that the requirement was not important', correct: false, why: 'You agreed on it; dropping it now reads as ignoring requirements.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'What is the best fix for drawing in silence?',
      options: [
        {
          text: 'Say what each box is for, and why, as you draw it',
          correct: true,
          why: 'Narration turns the drawing into reasoning the interviewer can grade, and invites early steering.',
        },
        { text: 'Draw faster, so the silence is shorter', correct: false, why: 'Shorter silence is still silence: the reasoning stays invisible.' },
        {
          text: 'Draw everything first, then explain it all at the end',
          correct: false,
          why: 'That is the mistake itself, and it leaves the interviewer no time to redirect you.',
        },
        { text: 'Ask the interviewer to draw instead', correct: false, why: 'You are expected to drive the design, including the drawing.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'In a 45-minute interview you plan to keep 5 minutes for the wrap-up. Your high-level design is finished at minute 30. How many minutes are left for deep dives?',
      answer: 10,
      unit: 'minutes',
      tolerance: 1.1,
      solution: [
        '45 − 30 = 15 minutes remain after the design.',
        '15 − 5 for the wrap-up = 10 minutes for deep dives.',
        'That is less than the usual 15, so pick the single hardest part and go straight to it.',
      ],
    },
  ],
  takeaways: [
    'Six habits sink capable candidates: jumping to a solution, buzzword soup, ignoring requirements, drawing in silence, over-engineering and running out of time.',
    'Each has a fix you can practice: ask before drawing, give every name a reason, check the design against the requirements, narrate, build only what the numbers need, and watch the clock.',
    'Interviewers grade only what they see and hear, so make your reasoning visible from the first question to the wrap-up.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Record a practice round.** Mistakes that are invisible in the moment are obvious in a transcript, as Maya found. Record a [[mock interview|mock-interview]], write out five minutes of it, and label each line with the habit it shows.',
    },
    {
      kind: 'prose',
      md: '**Interviewers differ.** Some let you run and judge the result; others interrupt early. A mistake costs less when you catch and name it yourself, whichever kind you get.',
    },
  ],
  flashcards: [
    {
      front: 'What is jumping to a solution?',
      back: 'Drawing or naming a design before asking what the system must do and at what scale. The fix: ask about users, features, scale and priorities first.',
    },
    {
      front: 'What is buzzword soup?',
      back: 'Naming technologies without saying what each does for this design. The fix: give every name a reason tied to a requirement.',
    },
    {
      front: 'What does ignoring requirements look like?',
      back: 'Agreeing on requirements, then designing something that does not meet them. The fix: check the design against each requirement before the deep dives.',
    },
    { front: 'Why does drawing in silence hurt?', back: 'The interviewer can grade only what they hear. The fix: say what each box is for as you draw it.' },
    {
      front: 'What is over-engineering in an interview?',
      back: 'Adding parts, scale or flexibility the requirements do not need. The fix: start simple and add a part only when a number or requirement calls for it.',
    },
    {
      front: 'How do you avoid running out of time?',
      back: 'Timebox each phase, say the time out loud when you move on, and save the last five minutes for the wrap-up.',
    },
  ],
  related: ['interview-framework', 'requirements', 'high-level-design', 'talking-tradeoffs', 'level-expectations', 'interview-at-a-glance'],
  glossaryTerms: [
    'interview-signal',
    'clarifying-question',
    'functional-requirement',
    'non-functional-requirement',
    'message-queue',
    'buzzword',
    'over-engineering',
    'event-stream',
    'wide-column-store',
    'cdn',
    'timebox',
    'mock-interview',
  ],
};

export default lesson;
