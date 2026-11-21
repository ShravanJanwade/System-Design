import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Snapgram's home feed decision, said one part of the template at a time. One step per part. */
const feedDecision: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'poster', type: 'client', label: 'Poster’s phone', x: 0, y: 0 },
    { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
    { id: 'db', type: 'nosqlDb', label: 'Posts', sublabel: 'stored once', x: 1, y: 1 },
    { id: 'reader', type: 'client', label: 'Follower’s phone', x: 0, y: 2 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 2 },
    { id: 'cache', type: 'cache', label: 'Feed cache', sublabel: 'a list per user', x: 2, y: 2 },
  ],
  edges: [
    { id: 'poster-post', from: 'poster', to: 'post', kind: 'sync' },
    { id: 'post-db', from: 'post', to: 'db', kind: 'sync' },
    { id: 'post-cache', from: 'post', to: 'cache', kind: 'async', label: 'A: copy', fromSide: 'right', toSide: 'top' },
    { id: 'reader-feed', from: 'reader', to: 'feed', kind: 'sync' },
    { id: 'feed-cache', from: 'feed', to: 'cache', kind: 'sync' },
    { id: 'feed-db', from: 'feed', to: 'db', kind: 'sync', label: 'B: pull' },
  ],
  // Phones: the wide grid fits with narrow cards, so it keeps its shape; "A: copy" still runs over the top.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      poster: { x: 0, y: 0 },
      post: { x: 1, y: 0 },
      db: { x: 1, y: 1 },
      reader: { x: 0, y: 2 },
      feed: { x: 1, y: 2 },
      cache: { x: 2, y: 2 },
    },
    sides: { 'post-cache': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        '**We could do A or B.** Option A copies each new post into every follower’s list in the **feed cache**: [[fan-out on write|fan-out-on-write]]. Option B stores it once, and the **feed service** pulls recent posts when a follower opens the app: [[fan-out on read|fan-out-on-read]].',
    },
    {
      caption: '**A gives us X.** Opening the feed becomes one quick read of a list that is already built, however many accounts you follow.',
      flow: ['reader-feed', { edge: 'feed-cache', tag: 'one read' }, '<feed-cache', '<reader-feed'],
    },
    {
      caption:
        '**But costs Y.** Every post is copied once per follower. When a celebrity with 30 million followers posts, that is 30 million list updates, and the last followers may see the post minutes later (ballpark).',
      flow: ['poster-post', { edge: 'post-cache', tag: '30M updates', tone: 'alert' }],
    },
    {
      caption:
        '**Because of requirement Z, I’d pick A.** Feeds are read far more often than people post, a lopsided [[read/write ratio|read-write-ratio]], and the agreed requirement is a feed that opens fast. Paying once on the rare write to make every read cheap fits those numbers.',
      focus: ['reader', 'feed', 'cache'],
      notes: [{ target: 'reader', text: 'reads ≫ posts', tone: 'signal' }],
    },
    {
      caption:
        '**And here’s what would change my mind:** accounts with millions of followers. Their posts are pulled at read time and merged in, which makes the design a [[hybrid|hybrid-fan-out]], the one Snapgram runs today.',
      flow: ['reader-feed', ['feed-cache', 'feed-db'], ['<feed-cache', '<feed-db'], '<reader-feed'],
    },
  ],
};

/** A requirement changes mid-dive, and the sentence is rerun instead of defended. */
const pushback: SequenceSpec = {
  actors: [
    { id: 'interviewer', type: 'client', label: 'Interviewer' },
    { id: 'maya', type: 'client', label: 'Maya' },
  ],
  groups: [
    { label: 'The sentence', from: 1, to: 2 },
    { label: 'Pushback', from: 3, to: 6 },
  ],
  messages: [
    {
      from: 'interviewer',
      to: 'maya',
      label: 'How do you count likes?',
      kind: 'sync',
      caption: 'A deep dive on one decision. Earlier, they agreed that like counts may lag a few seconds.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Cache, refreshed every 5 s',
      kind: 'reply',
      caption:
        'One breath: a cache or batching in memory; the cache gives fast reads but costs a few seconds of [[staleness|stale-data]]; because counts may lag, the cache; if likes had to feel instant at celebrity scale, batching.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'What if counts must be exact?',
      kind: 'sync',
      caption: 'The interviewer changes a requirement. It is not an attack: it tests whether her reasoning moves with it.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Then the cache is out',
      kind: 'reply',
      caption: 'Maya goes back to the deciding requirement instead of defending her answer. A cache that lags cannot give exact counts, so every like now updates the database.',
    },
    {
      from: 'interviewer',
      to: 'maya',
      label: 'And the celebrity post?',
      kind: 'sync',
      caption: 'A fair follow-up: thousands of likes a second on one row, a [[hot key|hot-key]], was the original problem.',
    },
    {
      from: 'maya',
      to: 'interviewer',
      label: 'Split the counter: new cost',
      kind: 'reply',
      caption: 'She names a fix and its price: split each hot count across several rows and add them up on read, at the cost of more writes and more code.',
    },
  ],
};

const lesson: Lesson = {
  id: 'talking-tradeoffs',
  module: 'm8',
  order: 7,
  title: 'Talking about trade-offs',
  idea: 'In an interview, the reasoning behind a choice counts for more than the choice itself, so say each big decision as one sentence: the options, what your pick gives and costs, the requirement that decides, and what would change your mind.',
  minutes: 14,
  prerequisites: ['tradeoffs-core-skill', 'deep-dives'],
  outcomes: [
    'Say any design decision as one four-part sentence that an interviewer can follow.',
    'Choose a deciding requirement and a [[tipping point|tipping-point]] that make your choice sound like judgment rather than taste.',
    'Handle pushback by rerunning the sentence with the new requirement.',
  ],
  analogy: {
    title: 'Two doctors, one diagnosis',
    body: 'Your knee hurts after every run, and you see two doctors. The first looks at the scan and says, “Surgery.” The second says, “We could operate or try physical therapy. Surgery fixes it faster, but it means weeks on crutches.\n\n“Because you want to race in the spring, I’d operate. If the tear were smaller, I’d try therapy first.” Both doctors chose surgery, but you trust the second one, because you heard how she decided and when she would decide differently.',
  },
  whyItMatters:
    'Maya knows Snapgram’s history better than most candidates: she watched the team argue about fresh like counts and saw the [[home feed|news-feed]] change when celebrities joined. In her third practice interview, the interviewer asks how she would build that feed, and she says, “I’d precompute it.” The follow-up comes at once: why not build it when the user opens the app?\n\nMaya knows the answer, but it comes out in pieces: celebrities, then cache memory, then an old outage. Five minutes later the interviewer still cannot tell what she picked or why.',
  body: [
    {
      kind: 'prose',
      md: 'You met the [[trade-off|trade-off]] sentence in [Trade-offs: the core skill](lesson:tradeoffs-core-skill). In an interview it also shows how you decide, which is what you are graded on, and it gives the interviewer an obvious place to push.',
    },
    {
      kind: 'annotated',
      title: 'The template, and what the interviewer hears',
      caption: 'Each part sends the interviewer a signal.',
      lines: [
        { code: 'We could do A or B.', note: 'You see more than one way, so your pick is a choice, not a habit.' },
        { code: 'A gives us X but costs Y.', note: 'You know what your pick is for, and you saw its price before anyone pointed it out.' },
        { code: 'Because of requirement Z, I’d pick A,', note: 'Your choice follows from the requirements you agreed, not from taste.' },
        { code: 'and here’s what would change my mind.', note: 'You know where the answer flips, so a follow-up question confirms your judgment.' },
      ],
    },
    { kind: 'heading', text: 'Part by part' },
    {
      kind: 'prose',
      md: '**The options.** Name two, sometimes three: one option is not a decision, and five is a lecture. Give the one you reject a fair, one-clause hearing.\n\n**What it gives and what it costs.** Say both in terms the requirements care about, such as a faster feed or fewer servers. Naming the cost yourself shows you saw it before anyone had to point it out.\n\n**The deciding requirement.** This is the easiest part to skip, and ==it is the part that turns taste into judgment==. Point back to something you agreed earlier, with a number when you have one: “because reads outnumber posts a hundred to one” beats “because it’s faster.”\n\n**What would change your mind.** Name the tipping point: the number or requirement that would flip your pick. When the interviewer later asks about accounts with millions of followers, you have already answered.',
    },
    {
      kind: 'diagram',
      title: 'Snapgram’s feed decision, part by part',
      caption: 'The home feed decision from [Feeds: fan-out on write vs. on read](lesson:feed-fanout), one part of the template per step. Use Play, or the arrow keys.',
      spec: feedDecision,
    },
    { kind: 'heading', text: 'When the interviewer pushes back' },
    {
      kind: 'prose',
      md: 'Interviewers change a requirement to see whether your reasoning moves with it, so the weakest reply is to defend your first answer. Go back to the deciding requirement, rerun the sentence with the new one, say plainly if the pick changes, and name the new cost.',
    },
    {
      kind: 'sequence',
      title: 'Pushback, handled',
      caption: 'A like-count deep dive from Maya’s fourth practice round. Watch what she does when the requirement changes.',
      spec: pushback,
    },
    { kind: 'heading', text: 'Long form, short form' },
    {
      kind: 'prose',
      md: 'Not every choice deserves all four parts. Save the full sentence for the two or three decisions that shape the design, such as how the feed is built or which data must be [[strongly consistent|strong-consistency]]. For smaller choices, a short form keeps the reason without the speech: “[[Round robin|round-robin]] is fine here, because the app servers are [[stateless|stateless]].”',
    },
    {
      kind: 'table',
      columns: ['Instead of', 'Try', 'Why it lands better'],
      rows: [
        ['“X is the best.”', '“X fits here, because…”', 'Nothing is best everywhere, and “fits” invites the reason.'],
        ['“Everyone uses Kafka.”', '“A durable log helps here, because several services replay each upload.”', 'Popularity is not a requirement of this system.'],
        ['“Let’s use both.”', '“A for most accounts, B for the few with millions of followers.”', 'A hybrid is fine when you say where the line is.'],
      ],
      caption: 'Phrases to swap. The ones on the left are not wrong, just unfinished.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real conversations are messier than one sentence: you may weigh three options or revisit a choice after a deep dive. The template is a shape for your reasoning, not a script, and the widget’s examples are one good way to say each decision, not the only one.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'phrase-cards',
      title: 'Trade-off phrase cards',
      caption:
        'Each card is one part of the template. Flip it to see how Maya would say that part for one of Snapgram’s decisions, and watch the sentence below fill in. The arrow keys move between cards; Enter or Space flips the one in focus.',
      props: { decision: 'home-feed' },
    },
  ],
  realWorld: {
    title: 'Google’s design docs write the trade-offs down',
    body: 'In his 2020 post on design docs at Google, Malte Ubl calls the [[design doc|design-doc]] “the place to write down the trade-offs you made in designing your software”. He advises focusing on those trade-offs to produce a useful document with long-term value.\n\nHe counts the “alternatives considered” section among the most important: it lists other designs that could have reached similar outcomes. There, he writes, the focus should be on the trade-offs each design makes. It is the interview template, written down for the team that will live with the decision.',
    sourceUrl: 'https://www.industrialempathy.com/posts/design-docs-at-google/',
    sourceLabel: 'Malte Ubl, “Design Docs at Google” (2020)',
  },
  interview: {
    whenToMention:
      'At every decision that shapes the design, such as where photos live or how the feed is built. Use the full sentence for those two or three and a short form for the rest, and when pushed, lead with the deciding requirement.',
    sayItLikeThis: [
      'We could copy posts into followers’ feeds when they’re posted, or build feeds when the app opens. Copying gives us one-read feeds but costs a burst of writes for big accounts. Because feeds are read far more than people post, I’d copy, and for accounts with millions of followers I’d pull their posts at read time instead.',
      'Good challenge. My deciding requirement was that counts may lag a few seconds; if they must be exact, the cache is out, and I’d write every like to the database, which costs more writes.',
    ],
    followUps: [
      {
        q: 'What if the interviewer clearly prefers the option you rejected?',
        a: 'Ask which requirement makes them prefer it and rerun your sentence with it. If it flips your pick, say so and name the new cost; if not, explain calmly why, and what would.',
      },
      {
        q: 'Is “it depends” ever a good answer?',
        a: 'Only as the first two words. Say what it depends on, pick a side for the numbers you agreed, and name the point where you would switch.',
      },
      {
        q: 'How long should a trade-off statement take?',
        a: 'Roughly 20 to 30 seconds for the full sentence, and a few for the short form. If it takes minutes, you are comparing too many options.',
      },
    ],
    redFlags: [
      'A choice with no reason, or a reason that is only taste, such as “I like Cassandra.”',
      'Pros and cons for every option, and no decision.',
      'Defending the first answer after the interviewer changes a requirement.',
    ],
  },
  mistakes: [
    '**Hiding the cost.** If you don’t name the downside, the interviewer will, and then it sounds as if you missed it.',
    '**A requirement that isn’t one.** “Because it’s faster” describes an option; “because the feed must open in under a second” is a requirement.',
    '**No tipping point.** Without “what would change my mind”, the choice sounds fixed forever, and the follow-up catches you unprepared.',
    '**Reciting instead of reasoning.** If the requirement you name does not actually explain your pick, the template makes the gap more obvious, not less.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Snapgram runs in two regions. Put Maya’s sentence about new usernames in template order.',
      items: [
        'We could let each region accept new usernames on its own, or confirm every new name with one home region.',
        'Confirming with one region gives us names that are always unique, but costs slower signups, and none while the link between regions is down.',
        'Because two people must never share a username, I’d confirm with one region,',
        'and if signups during an outage mattered more than the odd duplicate, I’d accept locally and rename duplicates later.',
      ],
      why: 'Options first, then what the pick gives and costs, then the requirement that decides, and finally the condition that would flip it.',
    },
    {
      kind: 'single',
      prompt: 'Which answer is a complete trade-off statement?',
      options: [
        {
          text: 'We could cache feeds or build them on read. Caching makes feeds fast but costs memory. Because feeds must open in under a second, I’d cache, and if memory got too expensive, I’d stop caching feeds for inactive users.',
          correct: true,
          why: 'It has both options, a gain and a cost, a deciding requirement and a tipping point.',
        },
        {
          text: 'I’d cache the feeds, because caching is fast.',
          correct: false,
          why: 'There is no second option, no cost and no requirement, so it sounds like habit.',
        },
        {
          text: 'Caching is fast but uses memory, and building on read is slow but cheap, so both have pros and cons.',
          correct: false,
          why: 'A fair comparison, but it never decides, and nothing ties it to a requirement.',
        },
        {
          text: 'We could cache or build on read; I’d cache, because big companies do.',
          correct: false,
          why: 'What other companies do is not a requirement of this system.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'You chose to cache like counts because they may lag a few seconds. The interviewer now says counts must be exact. What is the strongest reply?',
      options: [
        {
          text: 'Exact counts change the deciding requirement, so the cache is out; I’d update the database on every like and split hot counters, which costs more writes.',
          correct: true,
          why: 'It reruns the sentence with the new requirement, changes the pick and names the new cost.',
        },
        {
          text: 'A few seconds of lag is fine for likes, so I’d keep the cache.',
          correct: false,
          why: 'That argues with the new requirement instead of reasoning with it.',
        },
        {
          text: 'Then I’d add a second cache in front of the first one.',
          correct: false,
          why: 'Another cache still lags, so it cannot meet a requirement for exact counts.',
        },
        {
          text: 'It depends.',
          correct: false,
          why: 'Without saying what it depends on and choosing, this dodges the question.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these can serve as a deciding requirement?',
      options: [
        {
          text: 'The feed must open in under a second for nearly every user',
          correct: true,
          why: 'Specific, agreed and measurable, so it can decide between options.',
        },
        { text: 'Like counts may lag by up to five seconds', correct: true, why: 'It states exactly how much staleness the product accepts.' },
        {
          text: 'Reads outnumber posts about a hundred to one, from our estimate',
          correct: true,
          why: 'A number from the estimate shows where the work is, which makes it a strong reason.',
        },
        { text: 'Cassandra is popular', correct: false, why: 'Popularity says nothing about what this system needs.' },
        {
          text: 'I used it at my last job',
          correct: false,
          why: 'Familiarity can break a tie, but it is not a requirement of the system.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Which is the best tipping point to name after choosing to copy posts into followers’ feeds?',
      options: [
        {
          text: 'If an account has millions of followers, I’d pull its posts at read time instead.',
          correct: true,
          why: 'It names the exact condition under which copying stops being worth its cost.',
        },
        {
          text: 'If the interviewer prefers something else.',
          correct: false,
          why: 'A tipping point comes from the system’s numbers or requirements, not from guessing what the interviewer wants.',
        },
        {
          text: 'Nothing would; copying is the standard way to build feeds.',
          correct: false,
          why: 'Every choice has a point where it stops fitting, and a celebrity post is this one’s.',
        },
        {
          text: 'If we had more time to build it.',
          correct: false,
          why: 'Build time matters, but it says nothing about when the design itself stops fitting.',
        },
      ],
    },
  ],
  takeaways: [
    'Say each big decision as one sentence: the options, what your pick gives and costs, the requirement that decides, and what would change your mind.',
    'The deciding requirement turns taste into judgment, and the tipping point turns a follow-up question into a chance to show it.',
    'When the interviewer changes a requirement, rerun the sentence instead of defending your first answer.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Steelman the option you reject.** Before turning it down, describe it at its best: “Building feeds on read is simpler, and it wastes nothing on people who never open the app.” To [[steelman|steelman]] an option this way makes your choice more convincing, and it often earns the follow-up you want.',
    },
    {
      kind: 'prose',
      md: '**Numbers make requirements bite.** “Reads dominate” is good; “about a hundred reads per post, from our estimate” is better, because it shows how far you are from the tipping point. [Estimation in the room](lesson:estimation-in-the-room) covers getting such numbers quickly.',
    },
    {
      kind: 'prose',
      md: '**At work, write it down.** The same four parts make a good decision record: the context, the options, the choice and its consequences. When the tipping point arrives months later, the team can see that the decision is due for review.',
    },
  ],
  flashcards: [
    {
      front: 'What are the four parts of the trade-off template?',
      back: 'The options; what your pick gives and costs; the requirement that decides; and what would change your mind.',
    },
    { front: 'Why name the cost of your choice yourself?', back: 'It shows you saw it. If the interviewer has to point it out, it sounds as if you missed it.' },
    {
      front: 'What makes a good deciding requirement?',
      back: 'Something you agreed with the interviewer, ideally with a number, such as “counts may lag five seconds.” Taste and popularity don’t count.',
    },
    {
      front: 'What is a tipping point?',
      back: 'The condition under which your decision flips, such as an account with millions of followers. Naming it turns follow-up questions into confirmations.',
    },
    {
      front: 'How should you handle pushback on a decision?',
      back: 'Ask which requirement is behind it, rerun the sentence with that requirement, change your pick if it flips, and name the new cost.',
    },
    {
      front: 'When is a short form better than the full sentence?',
      back: 'For small choices. Save the full sentence for the two or three decisions that shape the design.',
    },
    {
      front: 'What is the tipping point for copying posts into Snapgram feeds?',
      back: 'Accounts with millions of followers. Their posts are pulled at read time instead, which makes the design a hybrid.',
    },
  ],
  related: ['tradeoffs-core-skill', 'deep-dives', 'feed-fanout', 'cap-pacelc', 'level-expectations', 'mistakes-that-sink'],
  glossaryTerms: [
    'tipping-point',
    'news-feed',
    'trade-off',
    'fan-out-on-write',
    'fan-out-on-read',
    'read-write-ratio',
    'hybrid-fan-out',
    'stale-data',
    'hot-key',
    'strong-consistency',
    'round-robin',
    'stateless',
    'design-doc',
    'steelman',
  ],
};

export default lesson;
