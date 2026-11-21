import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: TLS termination, authentication, rate limiting, routing, then a fan-out. */
const frontDoor: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'app', type: 'client', label: 'Mobile app', x: 0, y: 1 },
    { id: 'gw', type: 'gateway', label: 'API gateway', sublabel: 'api.snapgram.com', x: 1, y: 1 },
    { id: 'users', type: 'service', label: 'User service', x: 2, y: 0 },
    { id: 'photos', type: 'service', label: 'Photo service', x: 2, y: 1 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 2, y: 2 },
  ],
  edges: [
    { id: 'app-gw', from: 'app', to: 'gw', kind: 'sync' },
    { id: 'gw-users', from: 'gw', to: 'users', kind: 'sync' },
    { id: 'gw-photos', from: 'gw', to: 'photos', kind: 'sync' },
    { id: 'gw-feed', from: 'gw', to: 'feed', kind: 'sync' },
  ],
  // Phones: the app above the gateway, and the three services in a column to its right.
  narrow: {
    grid: { cols: 2, rows: 3 },
    positions: { app: { x: 0, y: 0 }, gw: { x: 0, y: 1 }, users: { x: 1, y: 0 }, photos: { x: 1, y: 1 }, feed: { x: 1, y: 2 } },
  },
  steps: [
    {
      caption:
        'Every request from the app goes to one address, `api.snapgram.com`, over an encrypted connection. The **API gateway** holds the certificate and removes the [[Transport Layer Security|tls]] (TLS) encryption here, which is called [[TLS termination|tls-termination]].',
      flow: ['app-gw'],
      notes: [{ target: 'gw', text: 'decrypts', tone: 'plain' }],
    },
    {
      caption:
        'Next comes [[authentication|authentication]]: the gateway checks the token that came with the request. A missing or forged token is turned away with `401 Unauthorized` before any service sees it.',
      flow: ['app-gw', { edge: 'app-gw', reverse: true, tag: '401', tone: 'alert' }],
    },
    {
      caption:
        'Then [[rate limiting|rate-limiting]]: each user or partner may make only so many calls per minute. A partner’s runaway script gets `429 Too Many Requests` at the door, so the feed service never feels it.',
      flow: ['app-gw', { edge: 'app-gw', reverse: true, tag: '429', tone: 'alert' }],
    },
    {
      caption:
        'A request that passes is routed by its path: `/photos/123` goes to the photo service, and `/users/42` would go to the user service. Services can move or split without the app noticing.',
      flow: ['app-gw', 'gw-photos', '<gw-photos', '<app-gw'],
    },
    {
      caption:
        'The profile screen needs a user, her photos and her feed. The app makes one request, and the gateway calls all three services at once and combines the answers: [[request aggregation|request-aggregation]].',
      flow: ['app-gw', ['gw-users', 'gw-photos', 'gw-feed'], ['<gw-users', '<gw-photos', '<gw-feed'], '<app-gw'],
    },
  ],
};

/** Where the gateway sits: replicated, behind a load balancer, with shared rate-limit counters. */
const edge: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'app', type: 'client', label: 'Mobile app', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', sublabel: 'layer 4', x: 1, y: 1 },
    { id: 'gw', type: 'gateway', label: 'API gateway', sublabel: 'several copies', x: 2, y: 1 },
    { id: 'counters', type: 'cache', label: 'Rate-limit counters', sublabel: 'Redis', x: 2, y: 2 },
    { id: 'users', type: 'service', label: 'User service', x: 3, y: 0 },
    { id: 'photos', type: 'service', label: 'Photo service', x: 3, y: 1 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 3, y: 2 },
  ],
  edges: [
    { id: 'app-lb', from: 'app', to: 'lb', kind: 'sync' },
    { id: 'lb-gw', from: 'lb', to: 'gw', kind: 'sync' },
    { id: 'gw-counters', from: 'gw', to: 'counters', kind: 'sync' },
    { id: 'gw-users', from: 'gw', to: 'users', kind: 'sync' },
    { id: 'gw-photos', from: 'gw', to: 'photos', kind: 'sync' },
    { id: 'gw-feed', from: 'gw', to: 'feed', kind: 'sync' },
  ],
};

const lesson: Lesson = {
  id: 'reverse-proxies-gateways',
  module: 'm3',
  order: 3,
  title: 'Reverse proxies and API gateways',
  idea: 'An application programming interface (API) gateway is a reverse proxy for your APIs: one front door that removes encryption, checks who is calling, enforces rate limits and sends each request to the right service.',
  minutes: 11,
  prerequisites: ['load-balancers', 'http-essentials'],
  outcomes: [
    'Explain what a reverse proxy is, and how it differs from a forward proxy and a load balancer.',
    'List the jobs a gateway does at the edge: ending encryption, checking logins, limiting rates, routing and combining requests.',
    'Decide when a gateway helps, and how to keep it from becoming a bottleneck or a single point of failure.',
  ],
  analogy: {
    title: 'The hotel concierge',
    body: 'A good hotel has a concierge desk in the lobby. Guests do not wander the building looking for housekeeping, the restaurant or the spa; they ask the concierge, who checks that they are staying at the hotel, knows which department handles what, and passes each request along.\n\nAsk for dinner, theater tickets and a taxi at once, and the concierge makes the three calls and hands you one plan. Guests never need the back-office phone numbers, and the hotel can reorganize its departments without telling anyone. An API gateway is the concierge for your services.',
  },
  whyItMatters:
    'Snapgram has split its growing code into a few separate [[services|microservices]]: one for users, one for photos and one for the feed, each with its own servers and its own [[load balancer|load-balancer]]. The mobile app now needs three addresses, and every service repeats the same chores: decrypting traffic, checking the login and limiting how often each user can call.\n\nThen a bug in the photo service’s login check lets anyone read private photos, while the other two services were fine. A week later, a partner’s script floods the feed service with thousands of calls per second. The team wants one place where every request is checked the same way before it reaches any service.',
  body: [
    {
      kind: 'prose',
      md: 'A [[reverse proxy|reverse-proxy]] is a server that receives requests on behalf of your servers. Clients talk to it as if it were the site; it forwards each request to a server behind it and passes the answer back. Its mirror image is a [[forward proxy|forward-proxy]], which acts for clients instead, like an office proxy that every employee’s browser goes through.\n\nA load balancer is a reverse proxy whose main job is spreading load. An [[API gateway|api-gateway]] is a reverse proxy whose main job is guarding and organizing an [[API|api]]: the set of requests your services accept. In practice the same software, such as NGINX, can play all three roles.',
    },
    {
      kind: 'diagram',
      title: 'One front door',
      caption: 'Snapgram’s mobile app talks only to the gateway. Step through what happens to requests on the way in.',
      spec: frontDoor,
    },
    { kind: 'heading', text: 'What the gateway does' },
    {
      kind: 'prose',
      md: 'Each job moves work out of every service and into one place:\n\n- **TLS termination.** Decryption happens once, at the edge, and the certificates live in one place instead of on every server. Traffic inside the data center can then travel unencrypted, or be encrypted again with internal certificates when the network is not trusted.\n- **Authentication.** The gateway checks the session or [[signed token|jwt]] and passes the user identifier (ID) along, for example in a header. Services still handle [[authorization|authorization]], what this user may do, because only the photo service knows whose photo is whose.\n- **Rate limiting.** Limits per user, per [[API key|api-key]] or per address protect services from floods and runaway scripts. The counters live in a shared store such as Redis, so every gateway copy enforces the same limit.\n- **Routing.** Paths map to services, so you can move, split or rename services, or send 5% of traffic to a new version, without changing the app.\n- **Request aggregation.** One call from the phone becomes several calls inside the data center, where a round trip takes about 0.5 ms instead of the 100 ms or more a phone pays (ballpark).',
    },
    {
      kind: 'prose',
      md: 'Aggregation matters most on phones. Three requests one after another over a mobile network can take half a second (ballpark); one request that [[fans out|fan-out]] in parallel inside the data center takes about as long as its slowest call. Many teams go a step further with a [[backend for frontend|backend-for-frontend]]: a gateway layer per kind of client, so the mobile app gets small images and only the fields it shows.',
    },
    { kind: 'heading', text: 'Where the gateway sits' },
    {
      kind: 'prose',
      md: 'Every request passes through the gateway, so it must never be a bottleneck or a [[single point of failure|single-point-of-failure]]. It runs as several identical, [[stateless|stateless]] copies behind a load balancer, and anything they must share, such as rate-limit counters, lives in a shared store. Keep business logic out of it: a gateway that knows how feeds are built becomes a second, slower monolith that every team has to change.',
    },
    {
      kind: 'diagram',
      title: 'The edge of Snapgram',
      caption: 'Several gateway copies behind a layer 4 load balancer, sharing their rate-limit counters in Redis.',
      spec: edge,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real gateways also cache and compress responses, log every call, block known attackers, and translate between formats, such as JavaScript Object Notation (JSON) for the app and [[gRPC|grpc]] between services. How tokens are issued and protected is left to [Security essentials](lesson:security-essentials).',
    },
  ],
  tradeoffs: {
    caption: 'Where to put the work every request needs.',
    rows: [
      {
        option: 'Each service does it',
        goodAt: 'No extra hop, and each team controls its own rules.',
        badAt: 'Every service repeats the same code, and one mistake exposes everything behind it.',
        pickWhen: 'You have one or two services.',
      },
      {
        option: 'A reverse proxy',
        goodAt: 'Fast, simple encryption handling, caching and routing in front of servers.',
        badAt: 'Little help with logins, keys or per-user limits.',
        pickWhen: 'A website or a single app needs encryption, caching and load spreading.',
      },
      {
        option: 'An API gateway',
        goodAt: 'One place for authentication, rate limits, routing and aggregation.',
        badAt: 'One more hop (about 1 ms, ballpark) and a critical system to run, which can grow into a monolith.',
        pickWhen: 'Several services face outside clients such as apps and partners.',
      },
      {
        option: 'A backend for each frontend',
        goodAt: 'Responses shaped for each kind of client, and fewer round trips.',
        badAt: 'One more layer to build and run per client type.',
        pickWhen: 'Mobile and web need very different data from the same services.',
      },
    ],
  },
  realWorld: {
    title: 'Netflix’s front door',
    body: 'Netflix built and open-sourced Zuul, an edge service that its documentation calls the front door for all requests from devices and websites to the backend of the Netflix streaming application. It was built for dynamic routing, monitoring, resiliency and security, with functionality added as filters.\n\nThe project wiki lists how Netflix uses it, including checking each resource’s authentication requirements and rejecting requests that fail them, routing requests to different backend clusters as needed, and load shedding: giving each type of request a share of capacity and dropping requests over the limit. That is this lesson’s gateway, at Netflix’s scale.',
    sourceUrl: 'https://github.com/Netflix/zuul/wiki',
    sourceLabel: 'Netflix, Zuul project wiki on GitHub',
  },
  interview: {
    whenToMention:
      'When your design has several services, or outside clients such as a mobile app and partners. Draw the gateway between the load balancer and the services, list what it handles, and say that services stay focused on their own logic. Bring it up again when the interviewer asks about logins, abuse or slow mobile screens.',
    sayItLikeThis: [
      'Clients hit an API gateway behind a load balancer. It terminates TLS, validates the token, applies per-user and per-key rate limits, and routes by path to the user, photo and feed services.',
      'For the profile screen, the gateway calls three services in parallel and returns one response, so the phone makes one round trip instead of three.',
      'The gateway is stateless and runs as several copies with its rate-limit counters in Redis, so it scales out and is not a single point of failure.',
    ],
    followUps: [
      {
        q: 'Isn’t the gateway a bottleneck and a single point of failure?',
        a: 'Only if you run one copy. It is stateless, so it runs as several copies behind a load balancer and scales out like any app tier. It adds about a millisecond per request (ballpark), which is small next to a mobile round trip, and keeping business logic out of it keeps it fast.',
      },
      {
        q: 'If the gateway checks logins, can the services trust every request?',
        a: 'They can trust the identity the gateway passes along, as long as network rules make sure only the gateway can reach them. They still check authorization themselves, because only the photo service knows whose photo is whose. Many teams also encrypt and authenticate traffic between services.',
      },
      {
        q: 'What happens when one service in an aggregated request is slow?',
        a: 'The whole response waits for the slowest call, so the gateway gives each call a short timeout. If the feed is late, it can return the profile and photos and let the app load the feed separately, instead of failing the whole screen.',
      },
    ],
    redFlags: [
      'Putting business logic in the gateway, so every feature change has to go through it.',
      'Drawing a single gateway instance with no redundancy.',
      'Letting each service write its own login checks and rate limits.',
    ],
  },
  mistakes: [
    '**A gateway full of business logic.** It turns into a shared monolith that every team waits on.',
    '**One gateway copy.** The front door for everything becomes the single point of failure for everything.',
    '**Rate-limit counters in each copy’s memory.** With five gateway copies, a limit of 100 calls per minute quietly becomes 500.',
    '**Skipping authorization in services.** The gateway proves who the user is, not what they may do.',
    '**Aggregating without timeouts.** One slow service makes every combined response slow.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'What is the difference between a forward proxy and a reverse proxy?',
      options: [
        {
          text: 'A forward proxy acts for clients reaching out; a reverse proxy acts for servers receiving requests',
          correct: true,
          why: 'An office proxy speaks for employees’ browsers, while Snapgram’s gateway speaks for Snapgram’s services.',
        },
        {
          text: 'A forward proxy encrypts traffic; a reverse proxy decrypts it',
          correct: false,
          why: 'Either can handle encryption. The difference is whose side the proxy is on.',
        },
        {
          text: 'A reverse proxy sends responses back in reverse order',
          correct: false,
          why: 'Order has nothing to do with it; “reverse” means it stands in front of servers rather than clients.',
        },
        {
          text: 'They are two names for the same thing',
          correct: false,
          why: 'They sit at opposite ends of the connection and serve different owners.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these jobs belong in Snapgram’s API gateway?',
      options: [
        { text: 'Removing the TLS encryption from incoming requests', correct: true, why: 'Doing it once at the edge keeps certificates in one place.' },
        { text: 'Checking that each request’s token is valid', correct: true, why: 'Authentication is the same for every service, so it belongs in one place.' },
        { text: 'Limiting each partner to a number of calls per minute', correct: true, why: 'Rate limits at the door stop floods before they reach any service.' },
        {
          text: 'Deciding which photos appear in Maya’s feed',
          correct: false,
          why: 'That is business logic, which belongs in the feed service; a gateway that holds it becomes a monolith.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put what the gateway does with one request in order.',
      items: [
        'Decrypt the request',
        'Read the token to learn who is calling',
        'Count the call against that user’s rate limit',
        'Pick the service from the path and forward the request',
        'Send the service’s answer back to the app',
      ],
      why: 'Nothing can be read until the request is decrypted, and a per-user limit needs to know the user. Only requests that pass every check reach a service.',
    },
    {
      kind: 'numeric',
      prompt:
        'Maya’s phone is about 150 ms from Snapgram, round trip. Her profile screen needs data from three services, and each answers in about 20 ms. The gateway calls all three in parallel and combines the answers. Roughly how long does the screen’s single request take, in milliseconds?',
      answer: 170,
      unit: 'ms',
      tolerance: 1.2,
      solution: [
        'One round trip between the phone and the gateway: about 150 ms.',
        'The three calls run at the same time, so they add only the slowest one: about 20 ms.',
        '150 + 20 = 170 ms, against about 3 × 170 = 510 ms if the phone made the three calls one after another.',
      ],
    },
    {
      kind: 'single',
      prompt:
        'Snapgram runs five copies of its gateway, and each keeps rate-limit counters in its own memory. A partner’s limit is 100 calls per minute. What actually happens?',
      options: [
        {
          text: 'The partner can make up to about 500 calls per minute, 100 through each copy',
          correct: true,
          why: 'Each copy counts only the calls it sees, so the limit multiplies by the number of copies. A shared counter store fixes it.',
        },
        {
          text: 'Exactly 100 calls per minute get through',
          correct: false,
          why: 'That needs one shared count. Separate counters cannot see each other’s calls.',
        },
        {
          text: 'The partner is blocked completely',
          correct: false,
          why: 'Each copy still allows 100 calls; nothing blocks the partner outright.',
        },
        {
          text: 'Each copy allows 20 calls, so the total stays 100',
          correct: false,
          why: 'Copies do not split a limit unless someone configures them to, and even then uneven traffic breaks it.',
        },
      ],
    },
  ],
  takeaways: [
    'A reverse proxy stands in front of your servers, and an API gateway is a reverse proxy that guards and organizes your APIs.',
    'A gateway does the shared edge work once: TLS termination, authentication, rate limiting, routing and request aggregation.',
    'Keep the gateway stateless, replicated and free of business logic, so it never becomes the bottleneck.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Service meshes.** A gateway handles traffic coming into the system. Traffic between services can get similar treatment from a service mesh, which puts a small proxy next to every service to handle encryption, retries and metrics. [How services find and talk to each other](lesson:service-communication) covers it.',
    },
    {
      kind: 'prose',
      md: '**Encrypting all the way.** Ending TLS at the edge leaves traffic inside the data center readable unless you encrypt it again. Many companies now use mutual TLS between services, where both sides prove who they are with certificates.',
    },
    {
      kind: 'prose',
      md: '**Gateways and CDNs.** A content delivery network (CDN) often sits in front of the gateway, serving cached photos and ending encryption close to users, then passing everything else to the gateway. See [CDNs](lesson:cdns).',
    },
  ],
  flashcards: [
    { front: 'What is a reverse proxy?', back: 'A server that receives requests on behalf of your servers and forwards them, often handling encryption, caching and routing.' },
    { front: 'Forward proxy or reverse proxy: whose side is each on?', back: 'A forward proxy acts for clients reaching out; a reverse proxy acts for the servers receiving requests.' },
    { front: 'What does an API gateway do?', back: 'It is one front door for your APIs: TLS termination, authentication, rate limiting, routing and request aggregation.' },
    { front: 'What is TLS termination?', back: 'Decrypting traffic at the proxy or gateway, so the services behind it receive plain requests and certificates live in one place.' },
    { front: 'Why aggregate requests at the gateway?', back: 'Phone round trips are slow, so one request that fans out inside the data center replaces several from the phone.' },
    { front: 'Why must rate-limit counters be shared between gateway copies?', back: 'Otherwise each copy counts separately, and the real limit is multiplied by the number of copies.' },
  ],
  related: ['load-balancers', 'rate-limiting', 'api-styles', 'monolith-vs-microservices', 'security-essentials', 'service-communication'],
  glossaryTerms: [
    'microservices',
    'load-balancer',
    'reverse-proxy',
    'forward-proxy',
    'api-gateway',
    'api',
    'tls',
    'tls-termination',
    'authentication',
    'rate-limiting',
    'request-aggregation',
    'jwt',
    'authorization',
    'api-key',
    'fan-out',
    'backend-for-frontend',
    'single-point-of-failure',
    'stateless',
    'grpc',
  ],
};

export default lesson;
