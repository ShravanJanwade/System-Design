import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: round robin, health checks, a dead server, removal and return. */
const atWork: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1.5 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', sublabel: 'snapgram.com', x: 1, y: 1.5 },
    { id: 'app1', type: 'service', label: 'App 1', x: 2, y: 0 },
    { id: 'app2', type: 'service', label: 'App 2', x: 2, y: 1 },
    { id: 'app3', type: 'service', label: 'App 3', x: 2, y: 2 },
    { id: 'app4', type: 'service', label: 'App 4', x: 2, y: 3 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-app1', from: 'lb', to: 'app1', kind: 'sync' },
    { id: 'lb-app2', from: 'lb', to: 'app2', kind: 'sync' },
    { id: 'lb-app3', from: 'lb', to: 'app3', kind: 'sync' },
    { id: 'lb-app4', from: 'lb', to: 'app4', kind: 'sync' },
  ],
  // Phones: users above the balancer, with two app servers beside it and two below.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      users: { x: 1, y: 0 },
      lb: { x: 1, y: 1 },
      app1: { x: 0, y: 1 },
      app2: { x: 2, y: 1 },
      app3: { x: 0, y: 2 },
      app4: { x: 2, y: 2 },
    },
    sides: { 'lb-app3': { fromSide: 'bottom', toSide: 'right' }, 'lb-app4': { fromSide: 'bottom', toSide: 'left' } },
  },
  steps: [
    {
      caption: 'Requests from all of Snapgram’s users arrive at one address: the **load balancer**’s. Behind it are four identical app servers.',
      flow: ['users-lb'],
    },
    {
      caption:
        'Using [[round robin|round-robin]], the balancer hands each new request to the next server in turn: App 1, App 2, App 3, App 4, then App 1 again.',
      flow: ['lb-app1', 'lb-app2', 'lb-app3', 'lb-app4'],
    },
    {
      caption:
        'Every few seconds, the balancer also sends each server a [[health check|health-check]]: a tiny request such as `GET /health` that a working server answers with `200 OK`.',
      flow: [
        ['lb-app1', 'lb-app2', 'lb-app3', 'lb-app4'],
        ['<lb-app1', '<lb-app2', '<lb-app3', '<lb-app4'],
      ],
    },
    {
      caption: 'App 3’s disk fails and it stops answering. Until the balancer notices, round robin keeps sending it every fourth request, and each of those fails.',
      fail: ['app3'],
      flow: ['users-lb', { edge: 'lb-app3', tag: 'fails', tone: 'alert' }],
    },
    {
      caption: 'App 3 misses two health checks in a row, so the balancer takes it out of rotation. New requests go only to App 1, App 2 and App 4, and the errors stop.',
      fail: ['app3'],
      flow: ['users-lb', ['lb-app1', 'lb-app2', 'lb-app4']],
      notes: [{ target: 'app3', text: 'removed', tone: 'plain' }],
    },
    {
      caption: 'Once App 3 is repaired and passes two checks in a row, the balancer adds it back, and requests spread across all four servers again.',
      flow: ['users-lb', ['lb-app1', 'lb-app2', 'lb-app3', 'lb-app4']],
      notes: [{ target: 'app3', text: 'back', tone: 'signal' }],
    },
  ],
};

/** An active-passive pair of balancers sharing a virtual IP address. */
const pair: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 0.5 },
    { id: 'lbA', type: 'loadBalancer', label: 'Balancer A', sublabel: 'active', x: 1, y: 0 },
    { id: 'lbB', type: 'loadBalancer', label: 'Balancer B', sublabel: 'standby', x: 1, y: 1 },
    { id: 'pool', type: 'service', label: 'App servers', sublabel: 'four of them', x: 2, y: 0.5 },
  ],
  edges: [
    { id: 'users-a', from: 'users', to: 'lbA', kind: 'sync' },
    { id: 'a-pool', from: 'lbA', to: 'pool', kind: 'sync' },
    { id: 'b-a', from: 'lbB', to: 'lbA', kind: 'async', label: 'checks' },
    { id: 'users-b', from: 'users', to: 'lbB', kind: 'sync' },
    { id: 'b-pool', from: 'lbB', to: 'pool', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Balancer A is active: it holds the virtual IP address that snapgram.com points to, so every request goes through it. Balancer B, the standby, checks on A every second.',
      flow: ['users-a', 'a-pool', 'b-a'],
    },
    {
      caption: 'Balancer A crashes. Requests to the shared address go nowhere, and B’s checks get no reply.',
      fail: ['lbA'],
      flow: [{ edge: 'users-a', tone: 'alert' }, { edge: 'b-a', tag: 'no reply', tone: 'alert' }],
    },
    {
      caption: 'After a few missed checks, B claims the virtual IP address and becomes active. Traffic flows again within seconds, at the same address.',
      fail: ['lbA'],
      add: ['users-b', 'b-pool'],
      flow: ['users-b', 'b-pool'],
      notes: [{ target: 'lbB', text: 'active', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'load-balancers',
  module: 'm3',
  order: 2,
  title: 'Load balancers',
  idea: 'A load balancer is the single front door for a group of servers: it spreads requests across the healthy ones, so you can add servers, lose servers and deploy without users noticing.',
  minutes: 15,
  prerequisites: ['stateless-vs-stateful', 'availability-nines'],
  outcomes: [
    'Explain what a load balancer does, and the difference between layer 4 and layer 7 balancing.',
    'Choose between round robin, weighted round robin, least connections and hashing for a workload.',
    'Describe how health checks and a redundant pair of balancers keep traffic flowing when machines fail.',
  ],
  analogy: {
    title: 'The restaurant host',
    body: 'A busy restaurant has a host at the door. Guests do not pick their own tables; the host looks at the room and seats each party where there is space, so no waiter is buried while another stands idle. A big table takes more guests than a small one, and when a section closes, the host stops seating people there.\n\nThe host never cooks or serves. The whole job is deciding where each guest goes, quickly and fairly, and noticing when part of the room stops working. That is a load balancer’s job too.',
  },
  whyItMatters:
    'Snapgram’s app servers are [[stateless|stateless]] now, so any server can handle any request. At peak, a few hundred requests per second arrive, spread across four app servers behind a [[load balancer|load-balancer]].\n\nOn a busy Friday evening, App 3’s disk fails and the machine stops answering. For several seconds, a quarter of all requests go to a server that is not there, and people see errors. Then the errors stop on their own, before anyone is paged. Something noticed that App 3 was gone and stopped sending it traffic.',
  body: [
    {
      kind: 'prose',
      md: 'A load balancer sits between the clients and a group of servers, often called a pool. Clients only ever see one address, the balancer’s, so servers behind it can come and go. For each request, the balancer decides which servers are healthy, which of those should get this request, and how to pass it along. It is what makes [[horizontal scaling|horizontal-scaling]] work: add a server to the pool and it starts taking its share.',
    },
    {
      kind: 'diagram',
      title: 'A load balancer at work',
      caption: 'Four app servers behind one balancer. Step through normal traffic, a health check, a failure and the recovery.',
      spec: atWork,
    },
    { kind: 'heading', text: 'Layer 4 or layer 7' },
    {
      kind: 'prose',
      md: 'Load balancers are described by how much of the request they read, using the layers of the [[Open Systems Interconnection|osi-model]] (OSI) model, a standard way of describing networks. A [[layer 4 balancer|layer-4-load-balancing]] looks only at the [[Transmission Control Protocol|tcp]] (TCP) or [[User Datagram Protocol|udp]] (UDP) connection: the Internet Protocol (IP) address and the [[port|port]]. It forwards whole connections without reading them, which makes it very fast and able to carry any protocol.\n\nA [[layer 7 balancer|layer-7-load-balancing]] reads each [[Hypertext Transfer Protocol|http]] (HTTP) request: its path, headers and cookies. That costs more work, and for encrypted traffic it must first undo the [[Transport Layer Security|tls]] (TLS) encryption. In return, it can send `/api/photos` to the photo servers, retry a failed request elsewhere and keep a user on one server.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Layer 4',
        summary: 'Reads addresses and ports',
        points: [
          'Forwards whole connections, so it is very fast and cheap per request.',
          'Carries any protocol: web traffic, databases, video, games.',
          'Cannot route by path or cookie, because it never reads the request.',
        ],
      },
      right: {
        title: 'Layer 7',
        summary: 'Reads each HTTP request',
        points: [
          'Routes by path, header or cookie, and can retry a failed request.',
          'Can decrypt traffic, compress responses and add headers.',
          'Does more work per request, so it needs more capacity.',
        ],
      },
      caption: 'Large systems often use both: a layer 4 tier spreading connections across a fleet of layer 7 balancers.',
    },
    { kind: 'heading', text: 'Choosing a server' },
    {
      kind: 'prose',
      md: 'The rule a balancer uses to pick a server is its algorithm. Four cover nearly every case:\n\n- **Round robin.** Each server in turn. It is simple and fair when servers are identical and requests cost about the same.\n- **[[Weighted round robin|weighted-round-robin]].** Round robin with more turns for bigger machines: a server with weight 2 gets twice the requests of one with weight 1.\n- **[[Least connections|least-connections]].** Each request goes to the server with the fewest requests in progress. It adapts on its own when some requests are slow or a server is struggling.\n- **Hashing.** A hash of something in the request, such as the client’s IP address ([[IP hash|ip-hash]]) or a user identifier (ID), picks the server, so the same client keeps landing on the same one. That keeps per-user caches warm, but one very busy client overloads its server.',
    },
    {
      kind: 'prose',
      md: 'Plain hashing has a catch. If the server is picked with `hash % N`, adding or removing one server changes N, and most clients move to a different server. [Consistent hashing](lesson:consistent-hashing) fixes that by moving only the clients of the server that changed.',
    },
    { kind: 'heading', text: 'Health checks' },
    {
      kind: 'prose',
      md: 'A balancer can only avoid dead servers it knows about. Active health checks send each server a small request, often `GET /health`, every few seconds. A server is taken out after a few failures in a row, typically two or three, and put back after a few passes, so one slow answer does not bounce it in and out.\n\nThe timing is a trade-off. Checking every 5 seconds with a threshold of two means a dead server keeps getting its share for up to about 10 seconds; checking every second finds it sooner, but costs more check traffic and risks removing a server that only paused. Many balancers also watch real traffic and stop sending to a server that keeps returning errors.',
    },
    {
      kind: 'prose',
      md: 'Taking a healthy server out on purpose, for a deploy or because traffic is low, works differently. With [[connection draining|connection-draining]], the balancer stops sending it new requests but lets the ones in progress finish, usually within seconds to a minute (ballpark).',
    },
    { kind: 'heading', text: 'Sticky sessions' },
    {
      kind: 'prose',
      md: 'Sometimes you want the same user on the same server, for example when a server keeps a warm cache of that user’s data. Layer 7 balancers do this with [[sticky sessions|sticky-session]]: a [[cookie|cookie]], set on the first response, that names the server. As [Stateless vs. stateful services](lesson:stateless-vs-stateful) showed, stickiness costs you even load and breaks when a server fails, so keep the real state in a [[session store|session-store]] and treat stickiness as an optimization at most.',
    },
    { kind: 'heading', text: 'Who balances the balancer?' },
    {
      kind: 'prose',
      md: 'Every request now passes through the balancer, so a lone balancer is a [[single point of failure|single-point-of-failure]]. The classic fix is [[redundancy|redundancy]]: run two. In an active-passive pair, the active balancer owns a [[virtual IP address|virtual-ip]] and the standby watches it; if the active one goes silent, the standby claims the address within seconds, which is called [[failover|failover]].',
    },
    {
      kind: 'diagram',
      title: 'An active-passive pair',
      caption: 'Two balancers share one address. Step through a failover.',
      spec: pair,
    },
    {
      kind: 'prose',
      md: 'Big sites go further and run many active balancers at once. The [[Domain Name System|dns]] (DNS) can return several balancer addresses, and routers can spread traffic across a whole fleet of balancers, so losing one costs only a slice of capacity. Managed cloud load balancers do this for you behind a single name.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real load balancers do more than this lesson shows: they retry failed requests on another server, cap the connections each server gets, add headers that tell servers the client’s real address, and often handle encryption. [The next lesson](lesson:reverse-proxies-gateways) picks up several of these jobs.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'load-balancer',
      preset: { algorithm: 'round-robin', servers: 4, capacity: 100, traffic: 280, checkIntervalSec: 5 },
      intro:
        'Now run Snapgram’s traffic yourself: one minute of requests across four app servers, starting with round robin. Turn on the older server or the slow uploads and watch one server’s queue fill. Then stop a server and count the requests that fail before the health checks react.',
    },
  ],
  tradeoffs: {
    caption: 'The four common algorithms, compared.',
    rows: [
      {
        option: 'Round robin',
        goodAt: 'Simple and predictable, with nothing to track.',
        badAt: 'Ignores how busy each server is, so slow requests or a weaker server pile up.',
        pickWhen: 'Servers are identical and requests cost about the same.',
      },
      {
        option: 'Weighted round robin',
        goodAt: 'Handles servers of different sizes.',
        badAt: 'Weights are set by hand and do not react to load.',
        pickWhen: 'The fleet mixes machine sizes, or you want to send a small share to a new version.',
      },
      {
        option: 'Least connections',
        goodAt: 'Adapts to slow requests and struggling servers automatically.',
        badAt: 'Needs live counts per server, and a server that fails instantly can look idle and attract traffic.',
        pickWhen: 'Request costs vary a lot, such as uploads mixed with likes, or connections stay open for long.',
      },
      {
        option: 'Hashing by IP address or key',
        goodAt: 'Keeps a client or key on one server, so its caches stay warm.',
        badAt: 'Uneven when one client is very busy, and plain hashing reshuffles clients when servers change.',
        pickWhen: 'You need affinity, such as per-user caches or one live connection per user.',
      },
    ],
  },
  realWorld: {
    title: 'Google’s Maglev',
    body: 'Google described its network load balancer, Maglev, in a 2016 paper. Instead of special hardware, Maglev is a distributed software system that runs on ordinary Linux servers, so its capacity grows by adding machines. Routers spread incoming packets evenly across the Maglev machines using Equal-Cost Multi-Path (ECMP) routing, and each machine then spreads them across the servers of the right service.\n\nThe paper reports that a single Maglev machine can saturate a 10-gigabit-per-second link with small packets. Maglev uses consistent hashing and connection tracking so that failures disturb as few connections as possible, and it has served Google’s traffic since 2008.',
    sourceUrl: 'https://www.usenix.org/conference/nsdi16/technical-sessions/presentation/eisenbud',
    sourceLabel: 'Eisenbud et al., “Maglev: A Fast and Reliable Software Network Load Balancer,” USENIX NSDI 2016',
  },
  interview: {
    whenToMention:
      'Right after you draw more than one app server, which happens in almost every design. Put a load balancer in front, name the algorithm and say why, and mention health checks. When the interviewer asks what happens if something dies, cover both a dead app server and a dead balancer.',
    sayItLikeThis: [
      'I’ll put a layer 7 load balancer in front of the stateless app servers and use least connections, since uploads take far longer than likes.',
      'Health checks hit `/health` every few seconds, and two failures take a server out, so a crash costs a few seconds of errors that retries can absorb.',
      'The balancer itself runs as a redundant pair, or as a managed cloud load balancer, so it is not a single point of failure.',
    ],
    followUps: [
      {
        q: 'What happens to requests that were in progress on a server that dies?',
        a: 'They fail, and so do new requests sent to it until the health checks notice, typically within several seconds. A layer 7 balancer can retry [[idempotent|idempotent]] requests, such as reads, on another server, and clients retry too. Requests that change data need more care, because a retry must not apply them twice.',
      },
      {
        q: 'Layer 4 or layer 7: which would you use?',
        a: 'Layer 7 for web traffic, because it can route by path, handle encryption and retry. Layer 4 when I need raw speed or a protocol that is not HTTP, such as a database or a game server. Large systems often put a layer 4 tier in front of a fleet of layer 7 balancers.',
      },
      {
        q: 'How would you keep a user’s requests on the same server, and should you?',
        a: 'A layer 7 balancer can set a sticky cookie, or I can hash the user ID. I’d only do it as an optimization, such as keeping a per-user cache warm, never to hold state the user cannot afford to lose. The real state stays in the session store.',
      },
    ],
    redFlags: [
      'Drawing one load balancer with no plan for when it fails.',
      'Forgetting health checks, as if the balancer knew by magic which servers are down.',
      'Hashing by IP address without noticing that many users can share one address, such as everyone in an office.',
    ],
  },
  mistakes: [
    '**Round robin with mixed request costs.** A server that happens to get several slow uploads keeps receiving its turn while it falls behind.',
    '**Health checks that check nothing.** An endpoint that always answers `200 OK` keeps a server in rotation even when it cannot do real work.',
    '**A single balancer.** It removes every other single point of failure and becomes the biggest one.',
    '**Hashing by IP address.** Many users behind one office or mobile network address all land on the same server.',
    '**Removing servers abruptly.** Taking a server out without draining it fails every request it was still handling.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'Snapgram’s servers are identical, but 1 request in 20 is a photo upload that takes about a second, while the rest take about 50 ms. Which algorithm keeps queues shortest?',
      options: [
        {
          text: 'Least connections',
          correct: true,
          why: 'A server busy with uploads has more requests in progress, so new requests go elsewhere until it catches up.',
        },
        {
          text: 'Round robin',
          correct: false,
          why: 'It keeps giving turns to a server stuck on several uploads, so quick requests queue behind them.',
        },
        {
          text: 'Weighted round robin with equal weights',
          correct: false,
          why: 'With equal weights it is plain round robin, and it still ignores how busy each server is.',
        },
        {
          text: 'IP hash',
          correct: false,
          why: 'It ties each client to one server whatever that server is doing, and spreads load no better than chance.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Health checks run every 5 seconds, and two failures in a row take a server out. Snapgram sends 280 requests per second, spread evenly over four servers. One server dies just after passing a check. Roughly how many requests are sent to it before it is removed?',
      answer: 700,
      unit: 'requests',
      tolerance: 1.2,
      solution: [
        'It fails the next two checks, 5 and 10 seconds later, so it is removed after about 10 seconds.',
        'Its share of traffic is 280 ÷ 4 = 70 requests per second.',
        '70 × 10 = 700 requests fail, unless the balancer or the clients retry them elsewhere.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these can a layer 7 balancer do that a layer 4 balancer cannot?',
      options: [
        {
          text: 'Send `/api/photos` to the photo servers and `/api/users` to the user servers',
          correct: true,
          why: 'That needs the request path, which only a balancer that reads HTTP can see.',
        },
        {
          text: 'Keep each user on one server with a cookie',
          correct: true,
          why: 'Cookies live inside the HTTP request, so only a layer 7 balancer can read or set them.',
        },
        {
          text: 'Spread connections across healthy servers',
          correct: false,
          why: 'Both can. A layer 4 balancer spreads connections by address and port, and it uses health checks too.',
        },
        {
          text: 'Carry a protocol that is not HTTP, such as a database connection',
          correct: false,
          why: 'That is a layer 4 strength: it forwards bytes without needing to understand them.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'An app server dies. Put what happens next in order.',
      items: [
        'The server stops answering',
        'Requests sent to it fail',
        'It fails a health check',
        'It fails a second check in a row and is taken out of rotation',
        'Requests go only to the healthy servers',
      ],
      why: 'The balancer learns about the failure only through health checks, so requests keep failing until the second failed check. Shorter intervals shrink that window.',
    },
    {
      kind: 'single',
      prompt: 'How do you keep the load balancer itself from being a single point of failure?',
      options: [
        {
          text: 'Run a standby that takes over its virtual IP address, or several active balancers',
          correct: true,
          why: 'Redundancy plus automatic failover means losing one balancer costs seconds, not an outage.',
        },
        {
          text: 'Give the balancer more memory and faster processors',
          correct: false,
          why: 'A bigger machine handles more traffic but is still one machine that can fail.',
        },
        {
          text: 'Turn on sticky sessions',
          correct: false,
          why: 'Stickiness controls which app server a user reaches; it does nothing if the balancer dies.',
        },
        {
          text: 'Have the app servers check the balancer’s health',
          correct: false,
          why: 'Noticing a failure is not enough: something has to take over the balancer’s address and its work.',
        },
      ],
    },
  ],
  takeaways: [
    'A load balancer gives a pool of servers one address and spreads requests across the healthy ones.',
    'Pick the algorithm for the workload: round robin for identical servers and similar requests, weights for mixed machines, least connections for mixed request costs, and hashing when you need affinity.',
    'Health checks take dead servers out within seconds, and a redundant pair keeps the balancer itself from being a single point of failure.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**The power of two choices.** In a huge fleet, finding the single least busy server is costly, and many balancers acting on slightly stale counts can all pick the same one. A neat fix is to pick two servers at random and send the request to the less busy of the two, which spreads load almost as well as checking them all.',
    },
    {
      kind: 'prose',
      md: '**Shallow and deep health checks.** A shallow check only proves the process is running. A deep check also touches the database or cache, which catches more problems but can take every server out at once when a shared dependency hiccups. Many teams keep the balancer’s checks shallow and watch dependencies separately.',
    },
    {
      kind: 'prose',
      md: '**Failing fast fools least connections.** A broken server that rejects requests instantly has almost nothing in progress, so least connections may send it more traffic, not less. Balancers guard against this by also ejecting servers that return too many errors in a row.',
    },
    {
      kind: 'prose',
      md: '**Slow start.** A server that has just joined has cold caches, so some balancers ramp its share up over a minute or so instead of giving it a full share at once.',
    },
  ],
  flashcards: [
    { front: 'What does a load balancer do?', back: 'It gives a pool of servers one address and spreads incoming requests across the healthy ones.' },
    {
      front: 'Layer 4 or layer 7 load balancing: what is the difference?',
      back: 'Layer 4 forwards connections by address and port without reading them; layer 7 reads each HTTP request and can route by path, header or cookie.',
    },
    {
      front: 'When does least connections beat round robin?',
      back: 'When request costs or server speeds vary, because it sends work to whichever server has the fewest requests in progress.',
    },
    {
      front: 'How do health checks remove a dead server?',
      back: 'The balancer probes each server every few seconds. After a few failures in a row it takes the server out; after a few passes it adds it back.',
    },
    {
      front: 'What are the risks of hashing by IP address?',
      back: 'Many users can share one address, so a busy address overloads its server, and plain hashing moves most clients when servers change.',
    },
    {
      front: 'How do you avoid a single point of failure at the load balancer?',
      back: 'Run a redundant pair sharing a virtual IP address with automatic failover, or many active balancers behind DNS or routers.',
    },
    { front: 'What is connection draining?', back: 'Letting a server finish its in-progress requests, while sending it no new ones, before removing it.' },
  ],
  related: ['stateless-vs-stateful', 'reverse-proxies-gateways', 'availability-nines', 'consistent-hashing', 'timeouts-retries-backoff', 'zero-downtime-deploys'],
  glossaryTerms: [
    'stateless',
    'load-balancer',
    'horizontal-scaling',
    'round-robin',
    'health-check',
    'osi-model',
    'layer-4-load-balancing',
    'tcp',
    'udp',
    'port',
    'layer-7-load-balancing',
    'http',
    'tls',
    'weighted-round-robin',
    'least-connections',
    'ip-hash',
    'connection-draining',
    'sticky-session',
    'cookie',
    'session-store',
    'single-point-of-failure',
    'redundancy',
    'virtual-ip',
    'failover',
    'dns',
    'idempotent',
  ],
};

export default lesson;
