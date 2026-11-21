import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** One lesson's path from first read to mastered, following the Leitner schedule in src/state/leitner.ts. */
const toMastery: SequenceSpec = {
  actors: [
    { id: 'you', type: 'client', label: 'You' },
    { id: 'app', type: 'service', label: 'Blueprint' },
  ],
  groups: [
    { label: 'Day 1', from: 1, to: 4 },
    { label: 'Later', from: 5, to: 6 },
  ],
  messages: [
    {
      from: 'you',
      to: 'app',
      label: 'Read the lesson, try it',
      kind: 'sync',
      caption: 'Day 1. You read a lesson, step through its diagrams and play with its simulator or widget.',
    },
    {
      from: 'you',
      to: 'app',
      label: 'Take the quiz',
      kind: 'sync',
      caption: 'The quiz mixes question types and explains every option. Reading the lesson and attempting the quiz marks it done.',
    },
    {
      from: 'app',
      to: 'you',
      label: 'Best score: 4 of 5',
      kind: 'reply',
      caption: 'Your best score is kept. 80% or more counts toward mastery; below that, reread the explanations and try again another day.',
    },
    {
      from: 'you',
      to: 'app',
      label: 'Add 7 flashcards, review',
      kind: 'sync',
      caption: 'You add the lesson’s flashcards to your review deck and review them once. Each card you recall moves up a box, so it comes back in three days.',
    },
    {
      from: 'app',
      to: 'you',
      label: 'Day 4: 7 cards due',
      kind: 'async',
      caption: 'Three days later, Home lists the cards as due. Recall them again and each moves up another box: the next review is a week away.',
    },
    {
      from: 'app',
      to: 'you',
      label: 'Lesson mastered',
      kind: 'reply',
      caption: 'Best quiz score of 80% or more, and every card at a week or longer: the lesson is mastered. Keep reviewing and the gaps grow to two weeks, then a month.',
    },
  ],
};

/** Where progress lives: Blueprint has no accounts and no server-side storage. */
const progressStore: DiagramSpec = {
  grid: { cols: 4, rows: 1 },
  nodes: [
    { id: 'app', type: 'client', label: 'Blueprint', sublabel: 'in your browser', x: 0, y: 0 },
    { id: 'progress', type: 'nosqlDb', label: 'Your progress', sublabel: 'browser storage', x: 1, y: 0 },
    { id: 'file', type: 'objectStore', label: 'Export file', sublabel: 'a copy you keep', x: 2, y: 0 },
    { id: 'other', type: 'client', label: 'Another device', x: 3, y: 0 },
  ],
  edges: [
    { id: 'app-progress', from: 'app', to: 'progress', kind: 'sync', label: 'saves' },
    { id: 'progress-file', from: 'progress', to: 'file', kind: 'async', label: 'export' },
    { id: 'file-other', from: 'file', to: 'other', kind: 'async', label: 'import' },
  ],
  description: 'Blueprint runs in your browser and saves your progress in that browser’s storage. An export file is a copy you keep, which you can import on another device.',
};

const lesson: Lesson = {
  id: 'how-to-use-blueprint',
  module: 'm0',
  order: 2,
  title: 'How to use Blueprint',
  idea: 'Blueprint works as a loop: you learn an idea in a lesson, try it in a simulator, recall it with quizzes and flashcards, and apply it to interview problems, on a study plan built around your timeline.',
  minutes: 12,
  prerequisites: ['what-is-system-design'],
  outcomes: [
    'Set up a study plan that fits your experience, interview timeline and target level, and change it later.',
    'Use the learning loop of learn, try, recall and apply to turn a lesson into something you can do in an interview.',
    'Tell when a lesson counts as done and when it counts as mastered.',
  ],
  analogy: {
    title: 'Learning to drive',
    body: 'Nobody learns to drive from the handbook alone. You read the rules, then practice in an empty parking lot where mistakes are cheap. A week later your instructor quizzes you on who has the right of way, and only then do you merge onto a real highway.\n\nEach stage does a different job. Reading gives you the idea, the parking lot makes it physical, the quiz makes it stick, and the highway proves you can use it under pressure. Blueprint is built the same way.',
  },
  whyItMatters:
    'Snapgram is the running example for the whole course. It starts as one server and about 100 users, and every module picks up its story as it grows toward 100 million, so ideas arrive in the order you would need them.\n\nThe course is big: 70 lessons, 26 interview problems and 17 simulators, against an interview date that will not move. Reading it all once and hoping it sticks is the slow way to prepare. This lesson shows a faster one.',
  body: [
    {
      kind: 'prose',
      md: 'Blueprint has four kinds of material. **Lessons**, in Learn, teach one idea each. **Simulators** and smaller widgets let you change a system and watch what happens, such as shrinking a [[cache|cache]] until the database struggles; they sit in each lesson’s Try it section and on the Playground.\n\n**Practice** brings ideas back: flashcards, estimation drills, spot-the-[[bottleneck|bottleneck]] exercises, an architecture builder and timed [[mock interviews|mock-interview]]. **Problems** are 26 classic interview questions in three tiers of difficulty, each with hints and a full walkthrough.',
    },
    { kind: 'heading', text: 'Your study plan' },
    {
      kind: 'prose',
      md: 'On your first visit, Blueprint asks three questions, all skippable: how much backend experience you have, when your interview is (in 2, 4, 8 or 12 weeks), and the level you are aiming for (entry, mid or senior). From the answers it builds a week-by-week plan of lessons, problems and mock interviews, and Home shows this week’s part. Experienced engineers get time to skim the early modules, and you can change your answers at any time.',
    },
    {
      kind: 'table',
      columns: ['Target level', 'Lessons', 'Interview problems'],
      rows: [
        ['Entry', 'Modules 0 to 3, then Module 8', 'Tiers 1 and 2'],
        ['Mid', 'Adds the Module 4 to 7 lessons that come up most often', 'Tiers 1 and 2'],
        ['Senior', 'Adds all of Modules 4 to 7', 'Tiers 1, 2 and 3'],
      ],
      caption: 'What each target level covers. Shorter timelines fit fewer problems into the plan.',
    },
    { kind: 'heading', text: 'The learning loop' },
    {
      kind: 'prose',
      md: 'Every idea in Blueprint goes around a loop of four steps. You **learn** it from a lesson, **try** it in a simulator or widget, **recall** it later through the quiz and flashcards, and **apply** it to an interview problem. Applying an idea usually exposes a gap, which sends you back to learn, and the loop starts again.\n\nRecall is where most self-study falls short. Testing yourself, called [[active recall|active-recall]], feels harder than rereading but makes ideas last much longer. Reviewing at growing intervals, called [[spaced repetition|spaced-repetition]], keeps them from fading between sessions.',
    },
    { kind: 'heading', text: 'Done and mastered' },
    {
      kind: 'prose',
      md: 'Blueprint tracks two milestones for every lesson. A lesson is **done** once you have read it and attempted its quiz. It is **mastered** when your best quiz score is 80% or more and all of its flashcards have reached a review interval of a week or more.\n\nThe flashcards follow the [[Leitner system|leitner-system]]. A card you recall moves up a box and comes back later: after three days, then a week, two weeks and a month. A card you miss drops back to the first box and returns the next day.',
    },
    {
      kind: 'sequence',
      title: 'From first read to mastered',
      caption: 'One lesson’s path, assuming you recall every card. Use Play, or the arrow keys.',
      spec: toMastery,
    },
    { kind: 'heading', text: 'Where your progress lives' },
    {
      kind: 'prose',
      md: 'Blueprint has no accounts and no server that stores your data. Quiz scores, flashcard boxes and your plan are saved in the browser on the device you are using. That keeps it fast and private, but clearing your browser data erases your progress, and a second device starts empty.\n\nTo back up or move your progress, export it from Settings as a JSON (JavaScript Object Notation) file, then import that file on the other device.',
    },
    {
      kind: 'diagram',
      title: 'Your progress stays on your device',
      caption: 'Blueprint saves progress in your browser. An export file is the only copy that leaves it.',
      spec: progressStore,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This tour skips smaller features: the command palette, focus mode, themes, text size, reduced motion, and the cheat sheets and glossary in Reference. None of them changes how the loop works.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'learning-loop',
      title: 'The learning loop',
      caption: 'Select a station, or move around the loop with the arrow keys, to see which parts of Blueprint serve it and why that step matters.',
    },
  ],
  realWorld: {
    title: 'Why every lesson ends with a quiz',
    body: 'In a 2006 study, psychologists Henry Roediger and Jeffrey Karpicke asked students to study short passages. Some studied the passage again; others took a test, writing down what they could recall. On a test five minutes later, restudying did better. On tests two days or a week later, the students who had practiced recalling remembered more, even though the restudiers felt more confident.\n\nThat is why Blueprint quizzes you instead of handing you a summary to reread.',
    sourceUrl: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
    sourceLabel: 'Roediger and Karpicke, “Test-Enhanced Learning,” Psychological Science (2006)',
  },
  interview: {
    whenToMention:
      'You will not mention Blueprint in an interview, but the loop is how you get ready for one. Interviews test the apply step: using ideas on an unfamiliar problem, out loud, against a clock. So in the final weeks, shift your time toward timed problems and mock interviews, and keep the flashcard reviews going so the basics stay instant.',
    sayItLikeThis: [
      'Let me check the load before choosing a database: ten million daily users at about ten requests each is roughly a thousand requests per second on average.',
      'When a cache restarts empty, every read falls through to the database at once, so I’d warm it up before sending it traffic.',
    ],
    followUps: [
      {
        q: 'You added a cache. What happens right after it restarts?',
        a: 'Every read misses and hits the database at once, so warm the cache first or bring traffic back gradually. That answer comes from watching it happen in a simulator, not from a definition.',
      },
      {
        q: 'Roughly how many requests per second is that?',
        a: 'State the assumptions and round hard: 10 million daily users × 20 requests ÷ 100,000 seconds is about 2,000 per second. Estimation drills make this quick.',
      },
      {
        q: 'Why did you choose that over the alternative?',
        a: 'Name both options, what each costs, and the requirement that tips the balance. Comparing your answers with problem walkthroughs builds a stock of these.',
      },
    ],
    redFlags: [
      'Reciting a definition but being unable to apply it to the problem in front of you.',
      'Running out of time because you have never practiced against a clock.',
      'Forcing a memorized reference design onto a different problem.',
    ],
  },
  mistakes: [
    '**Rereading instead of recalling.** Rereading feels productive, but testing yourself is what makes ideas stick.',
    '**Skipping the Try it sections.** Watching a cache fail once teaches what three paragraphs cannot.',
    '**Saving problems for the last week.** Problems show what you have not understood, so find out while there is time to fix it.',
    '**Letting reviews pile up.** A few minutes of flashcards each day beats an hour once a week.',
    '**Reading the walkthrough first.** Attempting a problem before seeing the answer is what makes the walkthrough useful.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put the steps of the learning loop in order, starting with a new idea.',
      items: [
        'Learn: read a lesson',
        'Try: experiment in a simulator or widget',
        'Recall: answer the quiz and review flashcards',
        'Apply: solve an interview problem',
      ],
      why: 'You need the idea before you can experiment with it, and an experiment gives you something concrete to remember. Recalling it over days makes it last, and applying it shows what to relearn, which starts the loop again.',
    },
    {
      kind: 'single',
      prompt: 'When does Blueprint count a lesson as done?',
      options: [
        { text: 'When you have read it and attempted its quiz', correct: true, why: 'Done means read, with the quiz attempted, whatever the score.' },
        { text: 'When you score 80% or more on its quiz', correct: false, why: 'A score of 80% is one of the two conditions for mastered, not for done.' },
        { text: 'When you have opened it', correct: false, why: 'An opened lesson is in progress until you read it and attempt the quiz.' },
        { text: 'When all of its flashcards reach a week-long interval', correct: false, why: 'That is the other condition for mastered.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which conditions together make a lesson mastered?',
      options: [
        { text: 'Your best quiz score is 80% or more', correct: true, why: 'Your best score counts, so you can retake the quiz after reviewing.' },
        {
          text: 'All of its flashcards have reached a review interval of a week or more',
          correct: true,
          why: 'That shows you can recall the ideas days later, not just right after reading.',
        },
        {
          text: 'You attempted every simulator challenge',
          correct: false,
          why: 'Challenges are worth doing, but they are not part of the mastery rule.',
        },
        { text: 'You read the lesson twice', correct: false, why: 'Rereading is not tracked, and it does little for memory compared with recall.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'You add a lesson’s flashcards, review them right away and recall every one. If you keep recalling them when they come due, how many days after that first review do they reach a week-long interval?',
      answer: 3,
      unit: 'days',
      tolerance: 1.1,
      solution: [
        'A recalled card moves from box 1 to box 2, which comes back in 3 days.',
        'Recall it again on day 3 and it moves to box 3, whose interval is 7 days.',
        'So after 3 days and a second good review, the cards count toward mastery.',
      ],
    },
    {
      kind: 'single',
      prompt: 'You are new to backend work, your interview is in four weeks, and you are aiming for an entry-level role. What does your study plan focus on?',
      options: [
        {
          text: 'Modules 0 to 3, Module 8, and Tier 1 and 2 problems',
          correct: true,
          why: 'Entry-level plans cover the foundations and the interview playbook, plus the problems that exercise them.',
        },
        { text: 'Every lesson in all nine modules', correct: false, why: 'Modules 4 to 7 come in with mid and senior plans.' },
        { text: 'Interview problems only', correct: false, why: 'Without the building blocks, problems mostly expose gaps you have no time left to fill.' },
        { text: 'Modules 4 to 7 and Tier 3 problems', correct: false, why: 'That is senior-level material, beyond what entry-level interviews expect.' },
      ],
    },
  ],
  takeaways: [
    'Blueprint’s loop is learn, try, recall and apply, and each step does a job the others cannot.',
    'A study plan comes from three skippable questions, about experience, timeline and level, and you can change it anytime.',
    'A lesson is done once read with its quiz attempted, and mastered at 80% or more with all its flashcards at a week or longer.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Why the gaps grow.** Each successful review lets a memory last longer before it fades, so the next review can wait longer. Blueprint’s boxes use fixed gaps of 1, 3, 7, 14 and 30 days, and a missed card restarts at the shortest gap.',
    },
    {
      kind: 'prose',
      md: '**Short sessions work.** Twenty to sixty minutes is enough for one lesson, its Try it section and the day’s reviews. Several short sessions a week beat one long one, for the same reason spaced reviews beat cramming.',
    },
    {
      kind: 'prose',
      md: '**Keyboard shortcuts.** Press Ctrl+K, or Command+K on a Mac, to search lessons, terms, problems and simulators. In any step-by-step diagram, the left and right arrow keys move between steps.',
    },
  ],
  flashcards: [
    {
      front: 'What are the four steps of Blueprint’s learning loop?',
      back: 'Learn (lessons), try (simulators and widgets), recall (quizzes and flashcards) and apply (problems and mock interviews).',
    },
    {
      front: 'Which three questions build your study plan?',
      back: 'Your experience, your interview timeline (2, 4, 8 or 12 weeks) and your target level (entry, mid or senior). All are skippable.',
    },
    {
      front: 'When is a lesson done, and when is it mastered?',
      back: 'Done: read, with its quiz attempted. Mastered: a best quiz score of 80% or more, and all its flashcards at an interval of a week or more.',
    },
    { front: 'How does the Leitner system schedule flashcards?', back: 'A card you recall moves up a box and comes back later; one you miss drops to the first box and comes back the next day.' },
    { front: 'Why does testing yourself beat rereading?', back: 'Pulling an idea out of memory strengthens it, so it lasts longer than an idea you only reread.' },
    { front: 'Where is your Blueprint progress stored?', back: 'In the browser on the device you use. Export it as a file to back it up or move it.' },
  ],
  related: ['what-is-system-design', 'interview-at-a-glance', 'life-of-a-request', 'caching', 'interview-framework'],
  glossaryTerms: ['cache', 'bottleneck', 'mock-interview', 'active-recall', 'spaced-repetition', 'leitner-system'],
};

export default lesson;
