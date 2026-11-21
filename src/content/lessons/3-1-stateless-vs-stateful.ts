import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The bug: each app server keeps its own logins. */
const stickyBug: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya', sublabel: 'phone', x: 0, y: 0.5 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0.5 },
    { id: 'app1', type: 'service', label: 'App 1', sublabel: 'sessions in memory', x: 2, y: 0 },
    { id: 'app2', type: 'service', label: 'App 2', sublabel: 'sessions in memory', x: 2, y: 1 },
  ],
  edges: [
    { id: 'maya-lb', from: 'maya', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Maya logs in. The **load balancer** sends the request to App 1, which checks her password and creates a [[session|session]]: a record saying that session `abc123` belongs to user 42. App 1 keeps it in its own memory and gives her phone a [[cookie|cookie]] holding `abc123`.',
      flow: ['maya-lb', 'lb-app1', '<lb-app1', '<maya-lb'],
      notes: [{ target: 'app1', text: 'abc123: Maya', tone: 'plain' }],
    },
    {
      caption: 'A minute later, Maya opens her feed. The request carries the same cookie, but this time the balancer picks App 2, which has never seen `abc123`.',
      flow: ['maya-lb', { edge: 'lb-app2', tag: 'unknown', tone: 'alert' }],
    },
    {
      caption: 'App 2 can only answer `401 Unauthorized`, and the app shows the login screen. Nothing broke: the state was simply on the other server.',
      flow: ['<lb-app2', { edge: 'maya-lb', reverse: true, tag: 'logged out', tone: 'alert' }],
    },
    {
      caption: 'It gets worse. When App 1 restarts for a deploy, every session in its memory is gone, and everyone it logged in is logged out at once.',
      fail: ['app1'],
    },
  ],
};

/** The fix: sessions in a shared store, so requests move freely between servers. */
const sharedStore: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1.5 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1.5 },
    { id: 'app1', type: 'service', label: 'App 1', x: 2, y: 0 },
    { id: 'app2', type: 'service', label: 'App 2', x: 2, y: 1 },
    { id: 'app3', type: 'service', label: 'App 3', x: 2, y: 2 },
    { id: 'app4', type: 'service', label: 'App 4', x: 2, y: 3 },
    { id: 'store', type: 'cache', label: 'Session store', sublabel: 'Redis', x: 3, y: 1.5 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
    { id: 'lb-app3', from: 'lb', to: 'app3', kind: 'sync' },
    { id: 'lb-app4', from: 'lb', to: 'app4', kind: 'sync' },
    { id: 'app1-store', from: 'app1', to: 'store', kind: 'sync' },
    { id: 'app2-store', from: 'app2', to: 'store', kind: 'sync' },
    { id: 'app3-store', from: 'app3', to: 'store', kind: 'sync' },
    { id: 'app4-store', from: 'app4', to: 'store', kind: 'sync' },
  ],
  // Phones: users above the balancer, and the app servers in a column between it and the session store.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      users: { x: 0, y: 0 },
      lb: { x: 0, y: 1.5 },
      app1: { x: 1, y: 0 },
      app2: { x: 1, y: 1 },
      app3: { x: 1, y: 2 },
      app4: { x: 1, y: 3 },
      store: { x: 2, y: 1.5 },
    },
  },
  steps: [
    {
      caption: 'Maya logs in through App 1. Instead of keeping the session, App 1 writes it to the **session store** and gives Maya the same kind of cookie as before.',
      flow: ['users-lb', 'lb-app1', 'app1-store', '<app1-store', '<lb-app1', '<users-lb'],
      notes: [{ target: 'store', text: 'abc123: Maya', tone: 'plain' }],
    },
    {
      caption: 'Her next request lands on App 2. App 2 looks up `abc123` in the store, finds it, and serves her feed: she stays logged in.',
      flow: ['users-lb', 'lb-app2', { edge: 'app2-store', tag: 'found' }, '<app2-store', '<lb-app2', '<users-lb'],
    },
    {
      caption: 'Thousands of people do the same at once. Since any server can take any request, the balancer just spreads them out, and every server reads the same store.',
      flow: ['users-lb', ['lb-app1', 'lb-app2', 'lb-app3'], ['app1-store', 'app2-store', 'app3-store']],
    },
    {
      caption:
        'App 2 crashes. The balancer stops sending it requests, and App 1 and App 3 pick up its users, who find their sessions exactly where they left them. Nobody is logged out.',
      fail: ['app2'],
      flow: ['users-lb', ['lb-app1', 'lb-app3'], ['app1-store', 'app3-store']],
    },
    {
      caption: 'Traffic grows, so the team adds App 4. It has nothing to copy and nothing to warm up, so it serves requests the moment the balancer adds it.',
      add: ['app4', 'lb-app4', 'app4-store'],
      fail: ['app2'],
      flow: ['users-lb', ['lb-app1', 'lb-app3', 'lb-app4'], ['app1-store', 'app3-store', 'app4-store']],
    },
  ],
};

const lookup: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'app', type: 'service', label: 'App 2' },
    { id: 'store', type: 'cache', label: 'Session store' },
  ],
  messages: [
    {
      from: 'phone',
      to: 'app',
      label: 'GET /feed, cookie abc123',
      kind: 'sync',
      caption: 'Maya’s phone asks for her feed. The cookie holds only `abc123`, which stands in for a long random string that is hard to guess.',
    },
    {
      from: 'app',
      to: 'store',
      label: 'GET session:abc123',
      kind: 'sync',
      caption: 'App 2, or any other server, asks the session store who owns that session.',
    },
    {
      from: 'store',
      to: 'app',
      label: 'user 42, expires in 30 days',
      kind: 'reply',
      caption: 'The store answers in about a millisecond (ballpark), because it keeps everything in memory.',
    },
    {
      from: 'app',
      to: 'phone',
      label: '200 OK, the feed',
      kind: 'reply',
      caption: 'App 2 builds the feed for user 42 and answers. The next request can go to any server and get the same result.',
    },
  ],
};

const lesson: Lesson = {
  id: 'stateless-vs-stateful',
  module: 'm3',
  order: 1,
  title: 'Stateless vs. stateful services',
  idea: 'A stateless server remembers nothing between requests, so any copy of it can answer any request, while the state itself lives in shared stores such as a database, a cache or a session store.',
  minutes: 14,
  prerequisites: ['vertical-vs-horizontal-scaling', 'http-essentials'],
  outcomes: [
    'Tell a stateless service from a stateful one, and find state hiding in a server’s memory or disk.',
    'Decide where each kind of state should live: the database, a cache, a session store or object storage.',
    'Explain why stateless servers make adding servers, deploying and surviving crashes easy.',
  ],
  analogy: {
    title: 'The hotel front desk',
    body: 'At a well-run hotel, you can walk up to any clerk at the front desk. It does not matter who checked you in, because your booking lives in the hotel’s shared system: whoever is free looks you up by name and sees everything.\n\nNow picture a hotel where each clerk keeps bookings in a private notebook. You have to wait for “your” clerk while the others stand idle, and when that clerk goes home sick, your booking goes with them. Stateless servers work like the first hotel; stateful servers like the second.',
  },
  whyItMatters:
    'Snapgram has outgrown its single app [[server|server]]. The founders add a second one and put a [[load balancer|load-balancer]] in front, a box that splits incoming requests between the two. The next morning the support inbox is full: people are logged out at random, sometimes twice in a minute, and half-written captions disappear.\n\nNothing crashed, and both servers run the same code. The trouble is where Snapgram keeps track of who is logged in: in the memory of whichever server handled the login. When your next request lands on the other server, it has never heard of you.',
  body: [
    {
      kind: 'prose',
      md: 'Every web app remembers things: who is logged in, what is in a draft, which photos you just uploaded. That memory is called *state*. The question is not whether you have state, but where it lives.\n\nA [[stateful service|stateful-service]] keeps state in its own memory or on its own disk, so a later request must come back to that same server. A [[stateless|stateless]] service keeps nothing between requests: everything it needs arrives with the request or comes from a shared store. Snapgram’s app servers are stateful by accident, and the diagram shows what that costs.',
    },
    {
      kind: 'diagram',
      title: 'Sessions in one server’s memory',
      caption: 'Snapgram’s two app servers each keep their own logins. Step through two requests from Maya.',
      spec: stickyBug,
    },
    {
      kind: 'prose',
      md: 'The fix is to take state out of the app servers. Logins go to a [[session store|session-store]]: a shared, fast store that every server can reach, usually an in-memory [[key-value store|key-value-store]] such as [[Redis|redis]]. Each session is saved under its identifier (ID) with a [[time to live|ttl]] (TTL), so abandoned sessions expire on their own.',
    },
    {
      kind: 'sequence',
      title: 'Any server can find any session',
      caption: 'One request after the fix. The cookie carries only the session ID; the session itself lives in the store.',
      spec: lookup,
    },
    {
      kind: 'diagram',
      title: 'Stateless app servers',
      caption: 'Sessions live in the shared store, so requests can go to any server. Step through a login, a crash and a new server.',
      spec: sharedStore,
    },
    { kind: 'heading', text: 'Where state should live' },
    {
      kind: 'prose',
      md: 'Sessions are only one kind of state. Each kind has a natural home outside the app servers, and the [[database|database]] stays the [[source of truth|source-of-truth]]: the one place whose copy wins when copies disagree.',
    },
    {
      kind: 'table',
      columns: ['State', 'At Snapgram', 'Where it lives'],
      rows: [
        ['Accounts, photo details, likes', 'Maya’s profile and the likes on her photos', 'The database'],
        ['Login sessions', 'Session `abc123` belongs to user 42', 'A session store with a TTL, or a signed token the app carries'],
        ['Uploaded files', 'The photos themselves', '[[Object storage|object-storage]], with each photo’s details in the database'],
        ['Results worth reusing', 'A popular profile page, already built', 'A shared [[cache|cache]]'],
        ['Work to do later', 'Making thumbnails after an upload', 'A queue, covered in [Message queues and event streams](lesson:queues-and-streams)'],
      ],
      caption: 'A rule of thumb: if losing one app server would lose it, it is in the wrong place.',
    },
    { kind: 'heading', text: 'Three ways to handle sessions' },
    {
      kind: 'prose',
      md: 'The quickest patch is [[sticky sessions|sticky-session]]: the balancer sends each user back to the server that holds their session. It stops the random logouts without changing any code, but load gets uneven, and a crash or a deploy still logs that server’s users out. Treat it as a stopgap.\n\nThe usual fix is the shared session store from the diagrams. The third option skips the lookup entirely: a [[signed token|jwt]] that carries the user ID and an expiry time, signed by Snapgram so any server can check it without asking anyone. Its weak spot is logging someone out early, because a token stays valid until it expires.',
    },
    { kind: 'heading', text: 'Why stateless servers scale' },
    {
      kind: 'prose',
      md: 'Once no server holds anything unique, the servers become interchangeable, and three hard problems get easy:\n\n- **Adding capacity.** More traffic means more identical servers behind the balancer, which is [[horizontal scaling|horizontal-scaling]]. A new server can take requests a minute or two after it starts.\n- **Deploying.** You can restart servers one at a time to ship new code, and users never notice.\n- **Surviving crashes.** A dead server costs you capacity, not data, and the balancer simply routes around it.',
    },
    {
      kind: 'prose',
      md: '==Stateless servers do not get rid of state; they move it somewhere every server can reach.== That is not free. Every request now makes an extra trip to the session store, about half a millisecond inside a data center (ballpark), and the shared stores must scale and stay up instead. One lonely Redis server holding every session is a [[single point of failure|single-point-of-failure]], so it gets copies of its own.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Some services are stateful on purpose: databases, caches, and servers that hold long-lived connections, such as a chat server with open [[WebSockets|websocket]]. They scale in other ways, by copying and splitting their data, which Module 4 covers. This lesson also skips how sessions are protected from theft, which [Security essentials](lesson:security-essentials) covers.',
    },
  ],
  tradeoffs: {
    caption: 'Where to keep login sessions once there is more than one app server.',
    rows: [
      {
        option: 'In the server’s memory',
        goodAt: 'Fastest and simplest: no extra network trip.',
        badAt: 'Breaks as soon as there are two servers, and every restart logs users out.',
        pickWhen: 'There is exactly one server, such as a prototype.',
      },
      {
        option: 'Sticky sessions',
        goodAt: 'Stops random logouts without changing app code.',
        badAt: 'Uneven load, and a crash, deploy or scale-down still logs users out.',
        pickWhen: 'You need a stopgap while you move state out.',
      },
      {
        option: 'Shared session store',
        goodAt: 'Any server can serve any user, and crashes or deploys lose nothing.',
        badAt: 'One more lookup per request (about 0.5 ms, ballpark) and one more system to run.',
        pickWhen: 'Most web apps with logins. This is the default.',
      },
      {
        option: 'Signed tokens',
        goodAt: 'No lookup at all: each server checks the signature itself.',
        badAt: 'Hard to revoke before they expire, and the token travels with every request.',
        pickWhen: 'Many services must check identity, and short expiry times are acceptable.',
      },
    ],
  },
  realWorld: {
    title: 'The Twelve-Factor App on state',
    body: 'The Twelve-Factor App is a well-known set of guidelines for building web apps. Its sixth factor, Processes, says the running copies of an app should be stateless and share nothing. Anything that must persist belongs in a stateful backing service, typically a database.\n\nIt allows a process’s memory or disk only as a brief cache for a single transaction, and warns that a later request will likely be served by a different process. It calls sticky sessions a violation that should never be relied on, and suggests keeping session data in a store that can expire entries, such as Memcached or Redis.',
    sourceUrl: 'https://12factor.net/processes',
    sourceLabel: 'The Twelve-Factor App, “VI. Processes”',
  },
  interview: {
    whenToMention:
      'As soon as your design has more than one app server behind a load balancer, which is usually the first sketch. Say that the app tier is stateless and point at where each kind of state lives. Interviewers often test this by asking what happens when a server dies.',
    sayItLikeThis: [
      'I’ll keep the app servers stateless, so the load balancer can send any request to any server. Sessions go in Redis with a TTL, user data in the database, and photos in object storage.',
      'Because no app server holds anything unique, losing one costs us capacity, not data, and we can add servers as traffic grows.',
      'If we want to skip the session lookup, we can use short-lived signed tokens, but then logging someone out everywhere needs extra work.',
    ],
    followUps: [
      {
        q: 'Why not just turn on sticky sessions?',
        a: 'They fix the random logouts without moving any state, but they tie each user to one server. Load gets uneven, and a crash, a deploy or a scale-down still logs that server’s users out. I’d use them only as a stopgap while moving sessions to a shared store.',
      },
      {
        q: 'Doesn’t the session store become a single point of failure?',
        a: 'It can, so it needs its own redundancy, such as a replicated Redis setup that fails over automatically. The data is small and expires anyway, so even in the worst case people log in again, which is far better than losing photos.',
      },
      {
        q: 'Where would you keep a photo that is halfway through uploading?',
        a: 'Not on the app server’s disk. The phone can upload straight to object storage, or send chunks that any server accepts, with the progress recorded in a shared store. Then a retry can land on any server and carry on.',
      },
    ],
    redFlags: [
      'Keeping sessions or uploads in one server’s memory or disk while claiming the app tier scales out.',
      'Proposing sticky sessions as the long-term answer to state.',
      'Calling the whole system stateless, as if the database and caches did not need a scaling plan.',
    ],
  },
  mistakes: [
    '**State hiding in memory.** A login map, a counter or a cached feed in one server’s memory works with one server and breaks quietly with two.',
    '**Files on local disk.** Photos saved by the server that received the upload are missing whenever another server is asked for them.',
    '**Sticky sessions as the fix.** They hide the problem until a crash, a deploy or a scale-down logs everyone on that server out.',
    '**Forgetting the shared store can fail.** Moving every session to one Redis node trades many small risks for one big one, unless it has copies.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram adds a second app server behind a load balancer, and users start getting logged out at random. What is the most likely cause?',
      options: [
        {
          text: 'Each server keeps login sessions in its own memory, so the other server does not recognize them',
          correct: true,
          why: 'Requests switch between servers, and only the server that handled the login knows the session.',
        },
        {
          text: 'The database cannot handle two app servers',
          correct: false,
          why: 'An overloaded database makes pages slow or fail, but it would not log people out at random.',
        },
        {
          text: 'The login cookie expires too quickly',
          correct: false,
          why: 'An expiring cookie logs people out on a schedule, with one server or two. Here the logouts follow which server answers.',
        },
        {
          text: 'The load balancer strips cookies from requests',
          correct: false,
          why: 'Load balancers pass cookies along. The cookie arrives fine; the server it reaches simply has no matching session.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these make Snapgram’s app servers stateful?',
      options: [
        {
          text: 'A map of logged-in users kept in the server’s memory',
          correct: true,
          why: 'Only that server knows those sessions, so no other server can serve those users.',
        },
        {
          text: 'Uploaded photos saved to the server’s local disk',
          correct: true,
          why: 'Other servers cannot read that disk, and the photos vanish if the server is replaced.',
        },
        {
          text: 'Reading profiles from the shared database on every request',
          correct: false,
          why: 'The data lives in a store that every server can reach, so any server can do this.',
        },
        {
          text: 'Holding a downloaded file in memory only while one request processes it',
          correct: false,
          why: 'A brief scratch space for a single request is fine, because nothing later depends on it.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of serving a request with a shared session store in order.',
      items: [
        'The phone sends the request with its session cookie',
        'The load balancer picks any healthy app server',
        'The app server looks up the session ID in the session store',
        'The store says which user the session belongs to',
        'The app server builds the response for that user',
      ],
      why: 'The server cannot know who is asking until it has looked up the session, and it can only do that once the request reaches it. Because the lookup goes to a shared store, any server can do every step.',
    },
    {
      kind: 'single',
      prompt: 'At noon, App 2 crashes. Snapgram’s app servers are stateless, with sessions in a shared store. What do logged-in users notice?',
      options: [
        {
          text: 'Almost nothing: their next requests go to other servers, which find the same sessions',
          correct: true,
          why: 'The crash removes capacity, not state. At worst, a request that was in progress on App 2 fails and is retried.',
        },
        {
          text: 'Everyone whose last request went to App 2 is logged out',
          correct: false,
          why: 'That would happen if sessions lived in App 2’s memory. Here they live in the shared store.',
        },
        {
          text: 'The whole site is down until App 2 restarts',
          correct: false,
          why: 'The load balancer routes around a dead server, and the other servers can serve everyone.',
        },
        {
          text: 'Photos uploaded through App 2 are lost',
          correct: false,
          why: 'Photos go to object storage, not to the app server’s disk, so they survive.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'At peak, 500,000 people are logged in to Snapgram at once, and each session takes about 1 KB in the session store. Roughly how much memory do the sessions need, in megabytes?',
      answer: 500,
      unit: 'MB',
      tolerance: 1.1,
      solution: [
        '500,000 sessions × 1 KB = 500,000 KB.',
        'About 1,000 KB make 1 MB, so that is about 500 MB.',
        'That fits easily in one server’s memory, so even with copies for safety, sessions are cheap to keep.',
      ],
    },
  ],
  takeaways: [
    'A stateless server keeps nothing between requests, so any server can answer any request.',
    'State does not disappear: it moves to shared stores such as the database, a cache, a session store and object storage.',
    'Stateless app servers make scaling out, deploying and surviving crashes easy, while sticky sessions only hide the problem.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Signed tokens, in more detail.** The most common format is the JSON Web Token (JWT); JSON, short for JavaScript Object Notation, is a plain-text format for data. A JWT holds a few fields, such as a user ID and an expiry time, plus a signature that only Snapgram’s servers can produce. Because a stolen token works until it expires, tokens are kept short-lived, often minutes, and renewed with a separate refresh token.',
    },
    {
      kind: 'prose',
      md: '**State that has to stay.** Some state cannot move out: a database is state, and so is a chat server holding thousands of open connections. For those, the tools are copying data to several machines and splitting it across them, the subjects of [Replication](lesson:replication) and [Sharding](lesson:sharding).',
    },
    {
      kind: 'prose',
      md: '**Removing a server politely.** Even a stateless server has requests in progress. Before a deploy, the balancer stops sending it new requests and lets the open ones finish, which [Load balancers](lesson:load-balancers) covers along with health checks.',
    },
  ],
  flashcards: [
    { front: 'What makes a service stateless?', back: 'It keeps nothing between requests: everything it needs comes with the request or from a shared store.' },
    {
      front: 'Why do stateless servers scale out easily?',
      back: 'Any server can handle any request, so you can add or remove servers, deploy one at a time and survive crashes without losing data.',
    },
    { front: 'Where should login sessions live when there are several app servers?', back: 'In a shared session store, such as Redis with a TTL, or in a signed token the client carries.' },
    {
      front: 'What are sticky sessions, and why are they a weak fix?',
      back: 'The load balancer pins each user to one server. Load gets uneven, and sessions still vanish when that server crashes, is redeployed or is removed.',
    },
    { front: 'Where should uploaded photos go instead of an app server’s disk?', back: 'Object storage, with each photo’s details in the database.' },
    { front: 'What is the main weakness of signed tokens for sessions?', back: 'They are hard to revoke: a token stays valid until it expires.' },
  ],
  related: ['load-balancers', 'vertical-vs-horizontal-scaling', 'caching', 'databases-101', 'storage-types', 'security-essentials'],
  glossaryTerms: [
    'server',
    'load-balancer',
    'stateful-service',
    'stateless',
    'session',
    'cookie',
    'session-store',
    'key-value-store',
    'redis',
    'ttl',
    'database',
    'source-of-truth',
    'object-storage',
    'cache',
    'sticky-session',
    'jwt',
    'horizontal-scaling',
    'single-point-of-failure',
    'websocket',
  ],
};

export default lesson;
