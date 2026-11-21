import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The same photo-sharing prompt, answered at four levels. One step per level. */
const fourAnswers: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 1 },
    { id: 'photos', type: 'objectStore', label: 'Photo storage', x: 1, y: 2 },
    { id: 'cache', type: 'cache', label: 'Feed cache', x: 1, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 0, y: 2 },
    { id: 'replica', type: 'sqlDb', label: 'Replica', sublabel: 'standby', x: 3, y: 1 },
  ],
  edges: [
    { id: 'phones-app', from: 'phones', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-photos', from: 'app', to: 'photos', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'phones-cdn', from: 'phones', to: 'cdn', kind: 'sync' },
    { id: 'cdn-photos', from: 'cdn', to: 'photos', kind: 'sync' },
    { id: 'db-replica', from: 'db', to: 'replica', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        '**Entry level: a design that works.** Phones call the **app servers**, which keep photo details in the **database** and the files in **photo storage**. Every box has a reason, and one upload can be walked through it, perhaps with a hint or two.',
      flow: ['phones-app', 'app-db', '<app-db', '<phones-app'],
    },
    {
      caption:
        '**Mid level: the same design at the agreed scale.** Feeds come from a **feed cache**, and photos from a [[content delivery network|cdn]] (CDN) near users. Each new part arrives with its reason and its cost.',
      add: ['cache', 'cdn', 'app-cache', 'phones-cdn', 'cdn-photos'],
      flow: [{ edge: 'phones-cdn', tag: 'hit' }, '<phones-cdn'],
    },
    {
      caption:
        '**Senior level: the weak spots, found first.** The one **database** could take the whole app down, so a standby **replica** takes over when it fails ([[failover|failover]]). The candidate also picks the hardest parts, the feed and photo delivery, and leads the deep dives without being asked.',
      add: ['replica', 'db-replica'],
      fail: ['db'],
      notes: [{ target: 'replica', text: 'takes over', tone: 'signal' }],
    },
    {
      caption:
        '**Staff level: the board barely changes, the questions do.** What does keeping every photo for ten years cost, which team owns the feed, and when is a second region worth it? The answer reaches past one system to the company around it.',
      notes: [
        { target: 'photos', text: 'cost per year?', tone: 'plain' },
        { target: 'db', text: 'second region?', tone: 'plain' },
        { target: 'cache', text: 'which team?', tone: 'plain' },
      ],
    },
  ],
};

/** One interview question, answered at each level in turn. */
const sameQuestion: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'candidate', type: 'client', label: 'Candidate' },
  ],
  groups: [
    { label: 'Entry', from: 1, to: 2 },
    { label: 'Mid', from: 3, to: 4 },
    { label: 'Senior', from: 5, to: 6 },
    { label: 'Staff', from: 7, to: 8 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'candidate',
      label: 'How does the feed load?',
      kind: 'sync',
      caption: 'Imagine one question put to four candidates, one at each level.',
    },
    {
      from: 'candidate',
      to: 'interviewer',
      label: 'Follows, then their photos',
      kind: 'reply',
      caption:
        'Entry: look up the accounts you follow, fetch their recent photos and sort them by time. Correct and simple; with a nudge about celebrities, the candidate can reason about the cost.',
    },
    {
      from: 'interviewer',
      to: 'candidate',
      label: 'How does the feed load?',
      kind: 'sync',
      caption: 'The same question, now to a mid-level candidate such as Maya.',
    },
    {
      from: 'candidate',
      to: 'interviewer',
      label: 'Precompute it, at a cost',
      kind: 'reply',
      caption: 'Mid: copy each post into followers’ feeds ahead of time, because reads dominate, and name the cost: heavy writes when a big account posts.',
    },
    {
      from: 'interviewer',
      to: 'candidate',
      label: 'How does the feed load?',
      kind: 'sync',
      caption: 'The same question to a senior candidate.',
    },
    {
      from: 'candidate',
      to: 'interviewer',
      label: 'Hybrid, sized, failure-ready',
      kind: 'reply',
      caption:
        'Senior: push posts for most accounts and pull them for celebrities, size the cache from the estimate, and say what happens when the cache dies, before being asked.',
    },
    {
      from: 'interviewer',
      to: 'candidate',
      label: 'How does the feed load?',
      kind: 'sync',
      caption: 'And to a staff candidate.',
    },
    {
      from: 'candidate',
      to: 'interviewer',
      label: 'Which feed do we want?',
      kind: 'reply',
      caption:
        'Staff: first ask what the feed is for (newest posts or ranked ones), whether the company already runs a ranking system worth reusing, and what each choice costs to run and to staff. Then design.',
    },
  ],
};

const lesson: Lesson = {
  id: 'level-expectations',
  module: 'm8',
  order: 8,
  title: 'What each level is expected to show',
  idea: 'Every level gets the same kind of design prompt, but the bar rises: entry-level candidates show a working design, mid-level candidates scale it with clear trade-offs, senior candidates lead the hard parts and plan for failure, and staff candidates weigh the needs of the whole organization.',
  minutes: 14,
  prerequisites: ['interview-framework'],
  outcomes: [
    'Describe the signals interviewers look for at entry, mid, senior and staff levels.',
    'Translate level names between companies, so you prepare for the right bar.',
    'Pitch your answer at the level you are applying for, without overreaching or underselling.',
  ],
  analogy: {
    title: 'Four cooks, one dinner',
    body: 'Ask four cooks to plan a dinner for a hundred guests. A new line cook writes a menu that works and remembers to ask about allergies. An experienced cook adds quantities and timings, and knows which dishes can be made ahead.\n\nA sous chef plans for the oven dying mid-service and decides who runs each station. The head chef asks whether it should be a buffet at all, what it will cost, and how the kitchen will cope with ten more events like it. Same dinner, four plans, and each one is right for its cook.',
  },
  whyItMatters:
    'Maya’s real interview at Snapgram is two weeks away, for a mid-level role. She has heard that every level gets the same kind of prompt: “Design a photo-sharing app.” That worries her, because the same prompt must be judged differently for a new graduate and for an engineer with fifteen years behind them.\n\nHer practice partner, a senior engineer, makes it worse. He says a strong answer covers multiple regions, cost per user and which team owns what, so Maya crams all of it into her next practice round and never finishes the basic design. She is preparing for the wrong bar.',
  body: [
    {
      kind: 'prose',
      md: 'Companies sort engineers into [[levels|engineering-level]], and each level comes with its own expectations and pay. The [[interview loop|interview-loop]] decides both whether you are hired and at which level. For mid and senior roles the design round weighs heavily in that decision, and interviewers grade it against a [[rubric|rubric]]: a written guide to what a strong answer shows at each level.',
    },
    { kind: 'heading', text: 'Same level, different names' },
    {
      kind: 'prose',
      md: 'Level names are not standard. Entry level is L3 at Google, E3 at Meta and SDE I (software development engineer I) at Amazon, where the next title up is SDE II. On levels.fyi, a public site where engineers report their level and pay, L3 and E3 are the lowest software engineer levels listed for [Google](https://www.levels.fyi/companies/google/salaries/software-engineer) and [Meta](https://www.levels.fyi/companies/facebook/salaries/software-engineer), and L4, Amazon’s number for SDE I, is the lowest listed for [Amazon](https://www.levels.fyi/companies/amazon/salaries/software-engineer). Titles mislead too: “senior” at a small startup may match mid level at a large company.',
    },
    {
      kind: 'prose',
      md: 'The design round itself changes with level. Many entry-level loops have a lighter design round or none, and weigh coding more heavily. From mid level up, expect a full design round, graded on signals like the ones below.',
    },
    { kind: 'heading', text: 'Four levels, four bars' },
    {
      kind: 'prose',
      md: 'Interviewers write down [[signals|interview-signal]]: evidence of a skill, such as asking about scale or naming a cost unprompted. The prompt stays the same at every level. What changes is how much you do without help, and how far your thinking reaches: one working system at entry level, that system at scale at mid level, its failures and hardest parts at senior level, and the organization around it at staff level.',
    },
    {
      kind: 'table',
      columns: ['Signal', 'Entry', 'Mid', 'Senior', 'Staff'],
      rows: [
        [
          'Requirements',
          'Asks the basic questions, with some prompting',
          'Asks about scale, reads and writes unprompted, and scopes the problem',
          'Finds the requirements that drive the design and says why',
          'Questions the problem itself: who it serves, what it costs, what comes next',
        ],
        [
          'Design',
          'A working design with sensible parts',
          'A design that meets the agreed numbers, with a reason for each part',
          'A design shaped by the hardest parts, kept as simple as the numbers allow',
          'A design that fits the company’s other systems and can keep changing for years',
        ],
        [
          'Deep dives',
          'Goes deeper when asked, with help',
          'Handles a deep dive or two, with some steering',
          'Picks and leads the deep dives without being asked',
          'Goes deep where the business risk is, across team lines',
        ],
        [
          'Trade-offs',
          'Knows options exist, and may need help choosing',
          'Names options, costs and a pick tied to a requirement',
          'Weighs options with numbers and names the [[tipping point|tipping-point]]',
          'Weighs cost, team effort and long-term risk, not only technology',
        ],
        [
          'Failures',
          'Spots an obvious [[single point of failure|single-point-of-failure]] when asked',
          'Adds redundancy for the main parts',
          'Raises failure modes, monitoring and recovery unprompted',
          'Plans for regional outages, migrations and day-to-day operations',
        ],
        [
          'Who drives',
          'The interviewer leads, and you follow well',
          'You drive most of it; the interviewer steers the deep dives',
          'You drive; the interviewer mostly probes',
          'You drive, and reframe the problem when that helps',
        ],
      ],
      caption: 'An illustrative rubric grid. Real companies write their own, but they describe signals like these.',
    },
    {
      kind: 'prose',
      md: 'Read the grid down a column to see one level’s whole profile. A senior answer is not an entry answer with more boxes: it is a different conversation, in which the candidate decides what matters and goes there first. [[Staff engineers|staff-engineer]] are expected to question the problem itself, yet like seniors they stay [[individual contributors|individual-contributor]], building rather than managing.',
    },
    {
      kind: 'diagram',
      title: 'One prompt, four answers',
      caption: 'The photo-sharing prompt at each level. After mid level the board barely grows; the conversation does. Use Play, or the arrow keys.',
      spec: fourAnswers,
    },
    { kind: 'heading', text: 'What the same question sounds like' },
    {
      kind: 'sequence',
      title: 'One question, four answers',
      caption: 'Each answer is right for its level. Notice what the stronger answers add: a cost, then numbers and failures, then the business.',
      spec: sameQuestion,
    },
    { kind: 'heading', text: 'Aiming at your level' },
    {
      kind: 'prose',
      md: 'Maya is interviewing for mid level. Her bar is a complete design that handles the agreed numbers, a clear trade-off for each choice, and at least one deep dive she drives. Regions, cost per user and team ownership are staff territory; one sentence about them in the wrap-up shows she knows they exist, without spending ten minutes there.\n\nReaching too low is the other risk. A mid-level candidate who waits to be told each next step reads as entry level, even if every answer is right, and the result can be [[down-leveling|down-leveling]]: an offer one level below the role.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real rubrics differ by company and change over time, and the lines between levels are fuzzy: a strong mid-level answer and a weak senior one can look alike. Treat the grid as a guide, and ask your recruiter which level the role is and what the design round covers.',
    },
  ],
  tradeoffs: {
    caption: 'How far to reach above your level.',
    rows: [
      {
        option: 'Aim squarely at your level',
        goodAt: 'Finishing a complete, sound design that shows every signal the level asks for.',
        badAt: 'Shows little of what you could grow into.',
        pickWhen: 'Always, as the base, and as the whole plan at entry level.',
      },
      {
        option: 'Reach one level up in one deep dive',
        goodAt: 'Shows judgment beyond the role, which can support a higher level.',
        badAt: 'Costs time, and backfires if the basic design is not finished.',
        pickWhen: 'Your design is complete by about minute 25 and the interviewer is engaged.',
      },
      {
        option: 'Cover everything a staff engineer would',
        goodAt: 'Shows you know that regions, cost and ownership matter.',
        badAt: 'Rarely finishes, and shallow everywhere reads as weaker, not stronger.',
        pickWhen: 'You are interviewing for staff; otherwise, give these topics one line in the wrap-up.',
      },
    ],
  },
  realWorld: {
    title: 'Dropbox publishes what each level means',
    body: 'Dropbox publishes its engineering career framework on the open web, so anyone can read what each level is expected to show. For software engineers it runs from IC1 to IC4 Software Engineer, then IC5 Staff, IC6 Principal and IC7 Senior Principal. Each level’s expectations describe its scope, collaborative reach and levers for impact.\n\nRead side by side, the levels differ mostly in scope. An IC2 engineer executes on defined projects to achieve team-level goals and escalates to their manager when they need help with a decision. An IC5 staff engineer, in the framework’s words, sets “the multi-year, multi-team technical strategy” and increasingly influences the roadmaps of other Dropbox teams.',
    sourceUrl: 'https://dropbox.github.io/dbx-career-framework/',
    sourceLabel: 'Dropbox Engineering Career Framework',
  },
  interview: {
    whenToMention:
      'Before the interview, not during it: ask your recruiter which level the role is and how much the design round counts. In the room, show your level through what you do, such as driving the deep dives, rather than by saying what level you are.',
    sayItLikeThis: [
      'I have a design that handles our numbers. The two parts I’d like to go deeper on are the feed and photo delivery; shall I start with the feed?',
      'I’ll stay in one region for now. A second region mainly buys [[disaster recovery|disaster-recovery]] here, and I’d come back to its cost in the wrap-up.',
      'I’m not sure yet how to split the database, so let me make the design work on one machine first, then reason about splitting it.',
    ],
    followUps: [
      {
        q: 'Does a senior candidate need a bigger design?',
        a: 'No. Senior signals come from judgment: finding the hard parts, leading the deep dives, planning for failure and weighing trade-offs with numbers. A senior design is often simpler than an overreaching junior one.',
      },
      {
        q: 'What if the entry-level loop has no design round?',
        a: 'That is common: many entry-level loops have a lighter design round or none, and weigh coding more. The basics still help you explain choices in coding rounds, and the next level up needs them.',
      },
      {
        q: 'Can the design round change the level you are offered?',
        a: 'Yes. Interviewers report the signals they saw, and those feed the level decision, so strong senior signals can support a higher level and weak ones can mean an offer one level down.',
      },
    ],
    redFlags: [
      'At mid level and above: waiting for the interviewer to choose each next step.',
      'At senior level: no mention of failures, monitoring or trade-offs until asked.',
      'At any level: reaching for staff-level topics before the basic design works.',
    ],
  },
  mistakes: [
    '**Cramming the level above.** Covering regions, cost and team structure in a mid-level interview usually means never finishing the design that is actually graded.',
    '**Underselling.** Waiting to be led at mid or senior level reads as the level below, even when every answer is right.',
    '**Preparing for the title.** “Senior” at a ten-person startup may match mid level at a large company, so prepare for the role’s expectations, not its name.',
    '**Studying the wrong round.** Many entry-level loops weigh coding far more than design, so check the loop before you spend weeks on distributed systems.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put these answers to the same feed question in order, from entry level to staff level.',
      items: [
        'Look up the accounts I follow, then fetch and sort their recent photos',
        'Precompute each feed in a cache because reads dominate, at the cost of heavy writes',
        'Push for most accounts, pull for celebrities, and plan for the cache failing',
        'First ask what the feed is for and what each design costs to run and to staff',
      ],
      why: 'Each answer keeps what the one before it had and adds a wider view: a cost, then numbers and failures, then the business around the system.',
    },
    {
      kind: 'single',
      prompt: 'Maya is interviewing for a mid-level role, and her design works by minute 22. What should she do next?',
      options: [
        {
          text: 'Propose the hardest parts and lead a deep dive on one of them',
          correct: true,
          why: 'Driving a deep dive on a working design is the mid-level bar, and it leaves room to show more.',
        },
        {
          text: 'Add a second region and a cost model, to look more senior',
          correct: false,
          why: 'Staff-level topics at the expense of depth usually read as weaker, not stronger.',
        },
        {
          text: 'Wait for the interviewer to choose the next topic',
          correct: false,
          why: 'Waiting to be led reads as entry level, even when every answer is right.',
        },
        {
          text: 'Redo her estimates in more detail',
          correct: false,
          why: 'The estimates already did their job, and more precision changes no decision.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are staff-level signals?',
      options: [
        {
          text: 'Asking whether the problem as stated is the right one to solve',
          correct: true,
          why: 'Questioning the problem itself is a hallmark of staff-level thinking.',
        },
        {
          text: 'Weighing cost and team ownership along with technology',
          correct: true,
          why: 'Staff engineers answer for the organization around the system, not only the system.',
        },
        {
          text: 'Planning how to migrate the existing system without downtime',
          correct: true,
          why: 'Real systems change while they run, and staff engineers plan those changes.',
        },
        {
          text: 'Drawing more boxes than anyone else',
          correct: false,
          why: 'Box count is not a signal; at staff level the board often barely changes.',
        },
        {
          text: 'Choosing the newest technology available',
          correct: false,
          why: 'Novelty is not a requirement, and staff engineers weigh what a new tool costs to run.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'What is true of the design round for entry-level roles?',
      options: [
        {
          text: 'Many entry-level loops have a lighter design round or none',
          correct: true,
          why: 'Entry-level loops often weigh coding more, so check yours before you prepare.',
        },
        {
          text: 'It is harder than the senior round, to filter more candidates',
          correct: false,
          why: 'The bar is lower at entry level: a sound, working design, reached with some help, is a strong answer.',
        },
        {
          text: 'It is graded against staff-level expectations',
          correct: false,
          why: 'Each level is graded against its own expectations.',
        },
        {
          text: 'It always includes a deep dive on consensus algorithms',
          correct: false,
          why: 'Deep specialist topics are not expected at entry level.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'At which level are candidates expected to pick and lead the deep dives without being asked?',
      options: [
        {
          text: 'Senior',
          correct: true,
          why: 'Choosing the hardest parts and leading them unprompted is a core senior signal.',
        },
        { text: 'Entry', correct: false, why: 'At entry level, going deeper when asked, with help, is a strong answer.' },
        {
          text: 'Mid',
          correct: false,
          why: 'Mid-level candidates often lead one deep dive, but some steering from the interviewer is expected.',
        },
        {
          text: 'None, because the interviewer always chooses',
          correct: false,
          why: 'From senior level up, waiting for the interviewer to choose is a red flag.',
        },
      ],
    },
  ],
  takeaways: [
    'Every level gets the same kind of prompt, but the bar rises: a working design at entry level, scale with clear trade-offs at mid, led deep dives and failure planning at senior, and the wider organization at staff.',
    'Level names differ by company, with entry level called L3 at Google, E3 at Meta and SDE I at Amazon, so prepare for the role’s expectations, not its title.',
    'Aim squarely at your level: finish a complete design first, and reach above it only when time allows.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**How the level gets decided.** At many companies, interviewers write up the signals they saw, and a hiring manager or a group compares them with each level’s expectations. A consistent picture across the loop counts for more than one strong round.',
    },
    {
      kind: 'prose',
      md: '**Two tracks above senior.** Many companies split into a manager track and an individual contributor track. Dropbox’s framework, for example, has individual contributor levels from IC1 to IC7 and separate manager levels from M3 to M7.',
    },
    {
      kind: 'prose',
      md: '**Staff interviews reach wider.** At staff level, be ready to discuss how you would migrate an existing system and how you would get several teams to agree on one design.',
    },
  ],
  flashcards: [
    {
      front: 'What is entry level called at Google, Meta and Amazon?',
      back: 'L3 at Google, E3 at Meta and SDE I at Amazon. Titles differ, so compare expectations, not names.',
    },
    {
      front: 'What does a strong entry-level design answer show?',
      back: 'A working design with sensible parts, one request walked through it, and good reasoning when the interviewer gives hints.',
    },
    {
      front: 'What separates mid level from entry level?',
      back: 'Independence and scale: you drive most of the session and fit the design to the numbers, with a trade-off for each choice.',
    },
    {
      front: 'What separates senior from mid level?',
      back: 'You pick and lead the deep dives, raise failure modes unprompted and weigh trade-offs with numbers.',
    },
    {
      front: 'What are staff-level signals?',
      back: 'Judgment beyond one system: questioning the problem, cost, team ownership, migrations and how the design changes over years.',
    },
    { front: 'Do entry-level loops always include a design round?', back: 'No. Many have a lighter design round or none.' },
    {
      front: 'What is down-leveling?',
      back: 'An offer at a lower level than the one you interviewed for, because the interviews showed that lower level’s signals.',
    },
  ],
  related: ['interview-at-a-glance', 'interview-framework', 'deep-dives', 'talking-tradeoffs', 'mistakes-that-sink', 'cost-awareness'],
  glossaryTerms: [
    'engineering-level',
    'interview-loop',
    'rubric',
    'interview-signal',
    'tipping-point',
    'single-point-of-failure',
    'staff-engineer',
    'individual-contributor',
    'cdn',
    'failover',
    'down-leveling',
    'disaster-recovery',
  ],
};

export default lesson;
