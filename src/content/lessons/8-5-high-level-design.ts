import type { DiagramSpec, Lesson } from '../types';

/** Maya's first board, cut down to nine of its fifteen boxes: no labels, no path to trace. */
const tangle: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phones', x: 0, y: 0 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0 },
    { id: 'cacheA', type: 'cache', label: 'Cache', x: 2, y: 0 },
    { id: 'search', type: 'search', label: 'Search', x: 3, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 1 },
    { id: 'queue', type: 'queue', label: 'Queue', x: 2, y: 1 },
    { id: 'dbB', type: 'nosqlDb', label: 'Database 2', x: 3, y: 1 },
    { id: 'cacheB', type: 'cache', label: 'Cache 2', x: 1, y: 2 },
    { id: 'dbA', type: 'sqlDb', label: 'Database', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-lb', from: 'phone', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'lb-cacheA', from: 'lb', to: 'cacheA', kind: 'sync' },
    { id: 'cacheA-search', from: 'cacheA', to: 'search', kind: 'sync' },
    { id: 'app-queue', from: 'app', to: 'queue', kind: 'async' },
    { id: 'app-cacheB', from: 'app', to: 'cacheB', kind: 'sync' },
    { id: 'cacheA-queue', from: 'cacheA', to: 'queue', kind: 'sync' },
    { id: 'queue-dbB', from: 'queue', to: 'dbB', kind: 'async' },
    { id: 'search-dbB', from: 'search', to: 'dbB', kind: 'sync' },
    { id: 'cacheB-dbA', from: 'cacheB', to: 'dbA', kind: 'sync' },
    { id: 'queue-dbA', from: 'queue', to: 'dbA', kind: 'sync' },
  ],
  // Phones (inside a compare block): phones and load balancer on top, the other seven in layers below.
  narrow: {
    grid: { cols: 3, rows: 5 },
    positions: {
      phone: { x: 1, y: 0 },
      lb: { x: 1, y: 1 },
      cacheA: { x: 0, y: 2 },
      app: { x: 1, y: 2 },
      cacheB: { x: 2, y: 2 },
      search: { x: 0, y: 3 },
      queue: { x: 1, y: 3 },
      dbB: { x: 0.5, y: 4 },
      dbA: { x: 1.5, y: 4 },
    },
    sides: { 'lb-cacheA': { fromSide: 'left', toSide: 'top' } },
  },
  description:
    'Nine boxes joined by eleven unlabeled arrows: phones, a load balancer, two caches, search, app servers, a queue and two databases. Nothing says what travels on any arrow, and no single path leads from the phones to the data.',
};

/** Maya's second board: seven boxes, every arrow labeled. Walked through below. */
const boardTwo: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'cdn', type: 'cdn', label: 'CDN', sublabel: 'nearby edge', x: 0, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', x: 1, y: 0 },
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 2, y: 1 },
    { id: 'feed', type: 'nosqlDb', label: 'Feed store', x: 3, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Main database', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-lb', from: 'phone', to: 'lb', kind: 'sync', label: 'feed request' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync', label: 'to a server' },
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync', label: 'newest 20' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: 'details' },
    { id: 'phone-cdn', from: 'phone', to: 'cdn', kind: 'sync', label: 'images' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync', label: 'on a miss' },
  ],
  // Phones (inside a compare block, and for the walk-through below): the phone on top, images down the left,
  // the feed request down the right.
  narrow: {
    grid: { cols: 2, rows: 4 },
    positions: {
      phone: { x: 0.5, y: 0 },
      cdn: { x: 0, y: 1 },
      lb: { x: 1, y: 1 },
      store: { x: 0, y: 2 },
      app: { x: 1, y: 2 },
      db: { x: 0, y: 3 },
      feed: { x: 1, y: 3 },
    },
  },
  description:
    'Maya’s phone sends a feed request to a load balancer, which forwards it to an app server. The app server reads the newest 20 entries from the feed store and the photo details from the main database. The phone loads images from a nearby CDN edge, which fetches from photo storage only on a miss.',
};

/** The signature diagram: board two, walked through with Maya's feed request. */
const walk: DiagramSpec = {
  ...boardTwo,
  steps: [
    {
      caption: 'Maya opens Snapgram in Singapore. Her phone sends one feed request to the **load balancer**, which passes it to one of the **app servers**.',
      flow: ['phone-lb', 'lb-app'],
    },
    {
      caption: 'The app server reads Maya’s ready-made list from the **feed store**: the identifiers of the 20 newest photos, in one lookup.',
      flow: ['app-feed', '<app-feed'],
      notes: [{ target: 'feed', text: '1 lookup', tone: 'plain' }],
    },
    {
      caption: 'It fetches those 20 photos’ details from the **main database** in one batch: captions, authors and each file’s storage key.',
      flow: ['app-db', '<app-db'],
      notes: [{ target: 'db', text: '1 batch of 20', tone: 'plain' }],
    },
    {
      caption: 'The response travels back with captions and image links, but never the images themselves, so it stays small.',
      flow: ['<lb-app', '<phone-lb'],
      notes: [{ target: 'phone', text: 'captions + links', tone: 'plain' }],
    },
    {
      caption:
        'The phone fetches each image from a nearby **CDN** edge. Only on a miss does the edge ask **photo storage**, once, and then it serves that image to everyone nearby.',
      flow: ['phone-cdn', { edge: 'cdn-store', tag: 'miss' }, '<cdn-store', '<phone-cdn'],
    },
    {
      caption:
        'Every hop had a labeled arrow, so the interviewer could follow the request without asking. One walk took about a minute and showed that the design serves the feed.',
      focus: ['phone', 'lb', 'app', 'feed', 'db', 'cdn', 'store'],
    },
  ],
};

/** The write path: posting a photo, which adds a queue and feed workers. */
const post: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Main database', x: 2, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', x: 0, y: 1 },
    { id: 'queue', type: 'queue', label: 'Queue', sublabel: 'new posts', x: 1, y: 1 },
    { id: 'worker', type: 'worker', label: 'Feed workers', x: 2, y: 1 },
    { id: 'feed', type: 'nosqlDb', label: 'Feed store', x: 3, y: 1 },
  ],
  edges: [
    { id: 'phone-store', from: 'phone', to: 'store', kind: 'sync', label: 'photo bytes' },
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync', label: 'create post' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync', label: 'photo row' },
    { id: 'app-queue', from: 'app', to: 'queue', kind: 'async', label: 'new post' },
    { id: 'queue-worker', from: 'queue', to: 'worker', kind: 'async', label: 'next job' },
    { id: 'worker-db', from: 'worker', to: 'db', kind: 'sync', label: 'followers' },
    { id: 'worker-feed', from: 'worker', to: 'feed', kind: 'sync', label: 'append IDs' },
  ],
  steps: [
    {
      caption: 'Maya posts a photo. The bytes go straight from her phone to **photo storage** through a pre-signed link, so no app server carries them.',
      flow: ['phone-store', '<phone-store'],
    },
    {
      caption:
        'Her phone then asks the **app servers** to create the post. The app server writes the photo’s row to the **main database** and puts a message on the **queue**: a dashed arrow, because nobody waits for it.',
      flow: ['phone-app', 'app-db', '<app-db', 'app-queue'],
    },
    {
      caption: 'The app server answers right away, while the feed work waits in the queue. Maya sees her post published within a fraction of a second (ballpark).',
      flow: [{ edge: 'phone-app', reverse: true, tag: 'posted' }],
    },
    {
      caption:
        'A **feed worker** takes the message, looks up Maya’s followers in the main database and appends the photo’s identifier to each follower’s list in the **feed store**: [[fan-out on write|fan-out-on-write]].',
      flow: ['queue-worker', 'worker-db', '<worker-db', 'worker-feed'],
      notes: [{ target: 'feed', text: '1 append per follower', tone: 'plain' }],
    },
  ],
};

/** Quiz: the first simple board, but with feeds built by a query on every load. */
const noFeedStore: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 0, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', x: 1, y: 0 },
    { id: 'phone', type: 'client', label: 'Phones', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 2, y: 1 },
    { id: 'db', type: 'sqlDb', label: 'Main database', sublabel: 'feed built by query', x: 3, y: 1 },
  ],
  edges: [
    { id: 'phone-lb', from: 'phone', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'phone-cdn', from: 'phone', to: 'cdn', kind: 'sync' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'high-level-design',
  module: 'm8',
  order: 5,
  title: 'Drawing the high-level design',
  idea: 'A strong high-level design starts as the fewest boxes that serve every core feature, is checked by walking one real request through it, and has a label on every arrow saying what travels along it.',
  minutes: 14,
  prerequisites: ['api-and-data-model', 'load-balancers'],
  outcomes: [
    'Draw a first design with only the components the core features need, and give the reason for each one.',
    'Walk the hottest read and the main write through the design, hop by hop, to show that it works and to find what is missing.',
    'Label every arrow with what travels along it, using solid and dashed lines to show whether the caller waits.',
  ],
  analogy: {
    title: 'A subway map, not a survey',
    body: 'A city’s subway map leaves out almost everything: streets, buildings, even the real distances between stations. What remains is a handful of stations and lines, and every line has a name. You can put a finger on your home station, trace the trip to the airport and see exactly where to change trains.\n\nA surveyor’s drawing of the same tunnels would be far more accurate and nearly useless for finding your way. A high-level design is the subway map of a system: few boxes, named lines, and a route you can trace with one finger.',
  },
  whyItMatters:
    'Maya’s first practice whiteboard for “Design a photo-sharing app” ends with fifteen boxes: three databases, two caches, a queue, a search cluster, a machine-learning ranker and arrows running in every direction, none of them labeled. Her practice interviewer asks a simple question: what happens when someone opens Snapgram? Maya starts tracing a path, stops at a junction of four arrows, and admits she is not sure which one the request takes.\n\nA week later, on a fresh board, she draws seven boxes, walks her own feed request through them and writes a label on every arrow. The second board has fewer than half the components and gets far better feedback. This lesson is about why.',
  body: [
    { kind: 'heading', text: 'Start simple' },
    {
      kind: 'prose',
      md: 'The [[high-level design|high-level-design]] is the first complete sketch of the system, and it gets about ten minutes. Begin with the fewest components that serve every call in your [[application programming interface|api]] (API): for Snapgram, the phones, the app servers, a database, a feed store and [[object storage|object-storage]] for photo files. Each box should answer one question: which requirement needs it?',
    },
    {
      kind: 'prose',
      md: 'Add a component only when you can name the problem it solves, ideally with a number from your estimate. A [[load balancer|load-balancer]] earns its place because thousands of requests a second need several [[stateless|stateless]] app servers, and a [[content delivery network|cdn]] (CDN) because photos are viewed worldwide. A search cluster or a second cache does not, until a requirement asks for it. Boxes added just in case are [[over-engineering|over-engineering]]: each one is time spent drawing and a question you must be ready to answer.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Board one: the tangle',
        summary: 'Fifteen boxes, no labels, no path.',
        points: [
          'Components added before any requirement asked for them.',
          'Arrows with no labels, so nobody can tell what flows where, or who waits.',
          'No route you can trace from a phone to the data and back.',
        ],
        diagram: tangle,
        verdict: 'Hard to follow, hard to defend, and the clock is nearly gone.',
      },
      right: {
        title: 'Board two: simple and walked',
        summary: 'Seven boxes, every arrow labeled.',
        points: [
          'Only what the core features need, each box with a reason.',
          'Every arrow says what travels on it, such as a feed request or images.',
          'One request traced from a phone to the data and back.',
        ],
        diagram: boardTwo,
        verdict: 'Easy to follow, with fifteen minutes left for the deep dives.',
      },
      caption: 'Two boards for the same prompt. Board one is cut down to nine of its fifteen boxes so that it fits here.',
    },
    { kind: 'heading', text: 'Walk one request through it' },
    {
      kind: 'prose',
      md: 'Boxes on a board prove nothing until a request travels through them. Pick the hottest read, its [[read path|read-path]], and trace it out loud, hop by hop: which box receives it, what that box does, what it asks next and what comes back. For Snapgram, that is Maya opening the app and loading her home feed.',
    },
    {
      kind: 'diagram',
      title: 'Maya’s feed request, hop by hop',
      caption: 'Board two, walked through. Use Play, or the arrow keys.',
      spec: walk,
    },
    {
      kind: 'prose',
      md: 'Then walk the main write, its [[write path|write-path]]. Posting a photo is where the simple board shows a gap: nothing yet puts the new photo into followers’ feeds. Walking requests is how you find gaps like this, and adding exactly what fills one is how the design grows.',
    },
    { kind: 'heading', text: 'Label every arrow' },
    {
      kind: 'prose',
      md: 'An unlabeled arrow says only that two boxes are related, and the interviewer has to guess the rest. A label says what travels along it, such as a feed request, photo bytes or a new-post message. The line style says how: solid for a [[synchronous|synchronous-communication]] call, where the caller waits for the answer, and dashed for an [[asynchronous|asynchronous-communication]] message that nobody waits on.',
    },
    {
      kind: 'diagram',
      title: 'Posting a photo, with the parts it needs',
      caption:
        'The write path adds a [[queue|message-queue]] and workers, because copying a post into hundreds of feeds is too slow to do while Maya waits. Use Play, or the arrow keys.',
      spec: post,
    },
    {
      kind: 'table',
      columns: ['Arrow', 'Weak label', 'Strong label'],
      rows: [
        ['Phone to load balancer', 'none', 'feed request'],
        ['App server to feed store', 'uses', 'newest 20 photo identifiers'],
        ['App server to queue', 'data', 'new-post message, dashed'],
        ['CDN edge to photo storage', 'calls', 'image fetch, only on a miss'],
      ],
      caption: 'A strong label names what travels; the line style shows whether anyone waits.',
    },
    { kind: 'heading', text: 'Check in, then go deeper' },
    {
      kind: 'prose',
      md: 'When both walks work, stop drawing and check in: “This covers posting, following and the feed. I’d like to go deeper on the feed next, unless you’d rather look at something else.” The board now holds a design simple enough to reason about and concrete enough to show its weak spots, which is exactly what the deep dives need.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real boards also show an [[API gateway|api-gateway]], login checks, monitoring and more, and some interviewers want a diagram per service. This lesson keeps to the parts that decide whether the design works. Mention the rest in a sentence, and draw it only if the interviewer asks.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to spend the ten minutes of the high-level design.',
    rows: [
      {
        option: 'Simple design first, then grow it',
        goodAt: 'A working design early, a reason for every box, and time left for depth.',
        badAt: 'Looks naive for a few minutes, so say that scaling comes next.',
        pickWhen: 'Almost always; it is the default.',
      },
      {
        option: 'The final, large-scale design at once',
        goodAt: 'Shows you know which parts large systems use.',
        badAt: 'Burns the clock, hides the reasons and invites questions about boxes you cannot defend.',
        pickWhen: 'Rarely, such as when the interviewer asks for the large-scale picture directly.',
      },
      {
        option: 'One component in depth before the rest',
        goodAt: 'Shows expertise in that one part.',
        badAt: 'Leaves no complete design, so nobody can tell whether the system works end to end.',
        pickWhen: 'Only when the interviewer narrows the question to that component.',
      },
    ],
  },
  realWorld: {
    title: 'The C4 model’s rules for diagrams',
    body: 'The C4 model is a published approach to drawing software architecture, and its notation guide asks for what this lesson does. Every line should show a relationship in one direction and carry a label that matches its direction and intent, as specific as possible; the guide warns against single words such as “Uses”. Lines between separately running parts, which usually means communication between processes, should also name the technology or protocol.\n\nIt asks the same of boxes and whole diagrams. Every element states its type and a short description of its responsibilities, every diagram has a title and a key that explains its notation, and acronyms should be understandable by everyone who reads it.',
    sourceUrl: 'https://c4model.com/diagrams/notation',
    sourceLabel: 'The C4 model, “Notation”',
  },
  interview: {
    whenToMention:
      'Right after the API and data model, around minute 13 to 15 of a 45-minute interview, for about ten minutes. Announce it: “Let me draw a simple version that covers the core features, then walk a request through it.” Narrate each box as you add it, and finish with both walkthroughs before you go deeper.',
    sayItLikeThis: [
      'I’ll start with the simplest design that covers posting, following and the feed, then we can scale the parts that need it.',
      'Let me walk Maya’s feed request through it: the phone calls the load balancer, which picks an app server; the app server reads her list from the feed store and the photo details from the database.',
      'This arrow is dashed because nobody waits on it: the app server queues a new-post message, and workers update followers’ feeds in the background.',
    ],
    followUps: [
      {
        q: 'Why is there no cache in your design?',
        a: 'Because nothing has asked for one yet: the feed store already serves the hottest read in one lookup. If the estimate showed too many photo-detail reads for the database, I’d add a cache in front of it and say what it holds and for how long.',
      },
      {
        q: 'Your app servers talk to three stores. Is that too complex?',
        a: 'Each store is there for one reason: files in object storage, rules and relationships in the database, and the hottest read in the feed store. If the numbers were small, I’d fold the feed into the database and drop a box.',
      },
      {
        q: 'What happens if the load balancer dies?',
        a: 'As drawn, it is a [[single point of failure|single-point-of-failure]]. In practice you run a standby pair that shares one address, or a managed load balancer that does this for you. I’d note it now and come back to failures in the wrap-up.',
      },
    ],
    redFlags: [
      'Fifteen boxes before a single request has been traced.',
      'Arrows with no labels, or labels such as “uses” and “data”.',
      'Naming products instead of jobs: “Kafka, Redis, Cassandra” with no reason for any of them.',
      'Going deep on one box before the whole design exists.',
    ],
  },
  mistakes: [
    '**Drawing the final design first.** A design for a billion users at minute 12 has reasons you have not said and parts you cannot defend. Grow it from the simple version instead.',
    '**Unlabeled arrows.** The interviewer cannot grade what they cannot follow, and you lose the chance to show what each hop carries.',
    '**No walkthrough.** Without tracing a request, gaps stay hidden, such as how images reach the viewer or who fills the feed.',
    '**Drawing in silence.** Say why each box exists as you draw it, so the interviewer hears the reason while the box appears.',
    '**Erasing instead of growing.** When scale changes the design, add to the simple board and say why, so the reasoning stays visible.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which first design is best for a photo-sharing app with posting, following and a feed?',
      options: [
        {
          text: 'Phones, a load balancer, app servers, a database, a feed store, photo storage and a CDN, each with a reason',
          correct: true,
          why: 'Every box serves a core feature or a number from the estimate, and nothing is there just in case.',
        },
        {
          text: 'Fifteen components, including search, two caches and a ranking service, to show breadth',
          correct: false,
          why: 'Breadth without reasons is over-engineering. Each extra box costs time and invites questions you may not be able to answer.',
        },
        {
          text: 'One app server and one database, with photos stored in database rows',
          correct: false,
          why: 'Simple is good, but this ignores the storage and load you already estimated.',
        },
        {
          text: 'A detailed design of the feed store alone',
          correct: false,
          why: 'Depth comes later. Without the whole picture, nobody can tell whether the system works end to end.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of drawing a high-level design in order.',
      items: [
        'Name the core features the design must serve',
        'Draw the fewest boxes that serve them, labeling each arrow',
        'Walk the hottest read through the design',
        'Walk the main write, adding only what it needs',
        'Check in and propose where to go deeper',
      ],
      why: 'Features decide the boxes, labels make every hop readable, the walkthroughs prove the design and expose gaps, and only then is it time to pick a deep dive.',
    },
    {
      kind: 'multi',
      prompt: 'Which of these make an arrow on the board more useful?',
      options: [
        { text: 'A label saying what travels on it, such as “photo bytes”', correct: true, why: 'The interviewer then knows what each hop carries without asking.' },
        {
          text: 'A dashed line when nobody waits for the message',
          correct: true,
          why: 'The line style shows at a glance which steps the user waits for and which happen in the background.',
        },
        { text: 'A product name on the arrow, such as “Redis”', correct: false, why: 'A product says what runs in a box, not what flows between boxes.' },
        { text: 'A single generic word, such as “uses”', correct: false, why: 'It tells the reader nothing that the arrow itself did not already say.' },
      ],
    },
    {
      kind: 'bottleneck',
      prompt:
        'This board has no feed store, so every feed load runs a query that gathers the newest photos from all 300 accounts the reader follows. At thousands of feed loads a second, which box gives out first?',
      diagram: noFeedStore,
      answerNodeId: 'db',
      why: 'Every feed load becomes a heavy query touching hundreds of accounts’ photos, so the database saturates first. That number is what earns the feed store its place on board two.',
      others: {
        phone: 'Each phone sends only its own requests.',
        lb: 'A load balancer only forwards requests, and it handles far more than this.',
        app: 'App servers are stateless, so you add more of them behind the load balancer.',
        cdn: 'The edge serves image bytes from nearby copies and grows easily.',
        store: 'Photo storage sees only the misses from the CDN (content delivery network) edges.',
      },
    },
    {
      kind: 'single',
      prompt: 'While walking the posting request, Maya notices that nothing ever writes to the feed store. What should she do?',
      options: [
        {
          text: 'Say so, and add the queue and workers that fill the feed',
          correct: true,
          why: 'Finding gaps is what walkthroughs are for, and fixing one out loud shows judgment.',
        },
        {
          text: 'Keep going and hope the interviewer does not notice',
          correct: false,
          why: 'Interviewers notice, and a hidden gap looks far worse than one you found and fixed.',
        },
        {
          text: 'Erase the board and start a new design',
          correct: false,
          why: 'The design is mostly right. Add what is missing instead of throwing away ten minutes of work.',
        },
        { text: 'Add a cache in front of the feed store', correct: false, why: 'A cache speeds up reads. It does not explain how the feed gets written.' },
      ],
    },
  ],
  takeaways: [
    'Start with the fewest boxes that serve the core features, and add a component only when you can name the problem it solves.',
    'Walk the hottest read and the main write through the design, hop by hop, to prove it works and find what is missing.',
    'Label every arrow with what travels along it, solid when the caller waits and dashed when nobody does.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Number the walk.** Writing small numbers on the arrows as you narrate leaves a record of the walkthrough on the board, which helps when the interviewer later asks about step 4.',
    },
    {
      kind: 'prose',
      md: '**Lay it out left to right.** Put clients on the left and storage on the right, in the order a request meets each box. Arrows that mostly flow one way are easier to follow, especially in a shared drawing tool.',
    },
    {
      kind: 'prose',
      md: '**Two levels of zoom.** If the design grows past about ten boxes, draw the big picture with each service as one box, and zoom into one service in a separate corner of the board.',
    },
  ],
  flashcards: [
    {
      front: 'What goes into a first high-level design?',
      back: 'Only the components the core features need, each with a reason, such as a load balancer, app servers, a database, a feed store, photo storage and a CDN.',
    },
    {
      front: 'Why walk a request through the design?',
      back: 'It proves that the boxes and arrows actually serve the feature, and it exposes missing pieces, such as who fills the feed.',
    },
    { front: 'What should an arrow label say?', back: 'What travels along it, such as “feed request” or “photo bytes”, not a vague word like “uses”.' },
    { front: 'When is an arrow solid, and when dashed?', back: 'Solid when the caller waits for an answer; dashed for a message or event that nobody waits on.' },
    {
      front: 'What is over-engineering in an interview?',
      back: 'Adding components no requirement needs. Each one costs time to explain and invites questions you may not be able to answer.',
    },
    {
      front: 'How long does the high-level design take in a 45-minute interview?',
      back: 'About ten minutes, ending with a walkthrough and a check-in before the deep dives.',
    },
  ],
  related: ['interview-framework', 'api-and-data-model', 'load-balancers', 'cdns', 'storage-types', 'queues-and-streams', 'feed-fanout', 'deep-dives'],
  glossaryTerms: [
    'high-level-design',
    'api',
    'object-storage',
    'load-balancer',
    'stateless',
    'cdn',
    'over-engineering',
    'read-path',
    'write-path',
    'synchronous-communication',
    'asynchronous-communication',
    'message-queue',
    'fan-out-on-write',
    'api-gateway',
    'single-point-of-failure',
  ],
};

export default lesson;
