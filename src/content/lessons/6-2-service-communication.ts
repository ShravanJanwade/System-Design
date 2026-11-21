import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: registering, looking up, a new instance from autoscaling, and a crash. */
const lookup: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'feed', type: 'service', label: 'Feed service', x: 0, y: 1 },
    { id: 'photos1', type: 'service', label: 'Photos 1', sublabel: '10.0.3.17', x: 1, y: 0 },
    { id: 'photos2', type: 'service', label: 'Photos 2', sublabel: '10.0.3.24', x: 1, y: 2 },
    { id: 'registry', type: 'nosqlDb', label: 'Registry', sublabel: 'name → addresses', x: 2, y: 1 },
  ],
  edges: [
    { id: 'photos1-registry', from: 'photos1', to: 'registry', kind: 'sync', fromSide: 'right', toSide: 'top' },
    { id: 'photos2-registry', from: 'photos2', to: 'registry', kind: 'sync', fromSide: 'right', toSide: 'bottom' },
    { id: 'feed-registry', from: 'feed', to: 'registry', kind: 'sync', label: 'lookup', fromSide: 'right', toSide: 'left' },
    { id: 'feed-photos1', from: 'feed', to: 'photos1', kind: 'sync', fromSide: 'top', toSide: 'left' },
    { id: 'feed-photos2', from: 'feed', to: 'photos2', kind: 'sync', fromSide: 'bottom', toSide: 'left' },
  ],
  steps: [
    {
      caption:
        'When **Photos 1** starts, it registers: “photos is at 10.0.3.17, port 8080.” From then on, it sends a heartbeat every few seconds to stay on the list.',
      flow: ['photos1-registry'],
      notes: [{ target: 'registry', text: 'photos: 1 address', tone: 'plain' }],
    },
    {
      caption: 'To call the photo service, the **feed service** asks the **registry** for “photos” and gets back one address.',
      flow: ['feed-registry', '<feed-registry'],
    },
    {
      caption:
        'The feed then calls Photos 1 directly. The registry only answers lookups; it is not in the path of the call.',
      flow: ['feed-photos1'],
    },
    {
      caption:
        'At the evening peak, autoscaling starts **Photos 2** at a new address. It registers, the feed’s next lookup returns both, and calls spread across the two with no config change.',
      add: ['photos2', 'photos2-registry', 'feed-photos2'],
      flow: ['photos2-registry', 'feed-registry', '<feed-registry', ['feed-photos1', 'feed-photos2']],
      notes: [{ target: 'registry', text: 'photos: 2 addresses', tone: 'signal' }],
    },
    {
      caption:
        'Photos 1 crashes and its heartbeats stop. After a few missed beats, about 10 seconds (ballpark), the registry drops it, and the feed stops calling a dead address.',
      fail: ['photos1'],
      flow: ['feed-registry', '<feed-registry', 'feed-photos2'],
      notes: [{ target: 'registry', text: 'dropped Photos 1', tone: 'alert' }],
    },
  ],
};

/** One upload: a synchronous call where the answer is needed, an event for everything else. */
const upload: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'upload', type: 'service', label: 'Upload service' },
    { id: 'photos', type: 'service', label: 'Photo service' },
    { id: 'broker', type: 'stream', label: 'Event broker' },
    { id: 'search', type: 'service', label: 'Search' },
  ],
  messages: [
    {
      from: 'phone',
      to: 'upload',
      label: 'Upload photo',
      kind: 'sync',
      caption: 'Maya posts a photo. Her phone sends it to the **upload service** and waits for an answer.',
    },
    {
      from: 'upload',
      to: 'photos',
      label: 'SavePhoto (gRPC)',
      kind: 'sync',
      caption:
        'The upload cannot finish until the photo is saved, so the upload service calls the **photo service** with gRPC and waits: a synchronous call.',
    },
    {
      from: 'photos',
      to: 'upload',
      label: 'saved',
      kind: 'reply',
      caption: 'The photo service answers within a few milliseconds (ballpark), and the upload service carries on.',
    },
    {
      from: 'upload',
      to: 'broker',
      label: 'photo uploaded',
      kind: 'async',
      caption:
        'Search, notifications and the feed only need to know it happened, so the upload service publishes one event to the **event broker** and does not wait.',
    },
    {
      from: 'upload',
      to: 'phone',
      label: 'Posted',
      kind: 'reply',
      caption: 'Maya sees her post as soon as the one call that mattered is done, however slow search is today.',
    },
    {
      from: 'broker',
      to: 'search',
      label: 'photo uploaded',
      kind: 'async',
      caption:
        'Moments later, **search** reads the event and indexes the caption. Had search been down, the event would have waited in the broker.',
    },
  ],
  groups: [{ label: 'synchronous', from: 2, to: 3 }],
};

const lesson: Lesson = {
  id: 'service-communication',
  module: 'm6',
  order: 2,
  title: 'How services find and talk to each other',
  idea: 'Services find each other through a registry that always knows which instances are alive and where they are, and they talk either by calling and waiting for an answer or by publishing events that others handle in their own time.',
  minutes: 15,
  prerequisites: ['monolith-vs-microservices', 'api-styles'],
  outcomes: [
    'Explain why fixed addresses break and how a service registry keeps track of live instances.',
    'Choose between a synchronous call and an asynchronous event for each conversation between services.',
    'Describe what a service mesh adds, and when it is worth running one.',
  ],
  analogy: {
    title: 'A directory that updates itself',
    body: 'In a big office, people change desks all the time: teams grow, new people join, others work from home. A printed list of desk numbers would be wrong within a week, and you would keep walking up to empty chairs. So the office keeps a live directory instead: when you sit down, your badge checks you in at that desk, and when you leave, you drop off the list.\n\nTo reach someone in payroll, you look up “payroll” and get whoever is at a payroll desk right now. Then you choose how to reach them: call and wait on the line for an answer, or leave a note in their tray for them to handle when they can. Services make the same two choices.',
  },
  whyItMatters:
    'After the split, Snapgram runs about forty services, and none of them sits still. [[Autoscaling|autoscaling]] adds [[instances|instance]] of the busiest services at the evening peak and removes them at night, and every deploy replaces old instances with new ones at new addresses.\n\nThe feed service finds the photo service through a config file that lists four [[IP addresses|ip-address]] (Internet Protocol addresses). One evening, autoscaling replaces two of those instances, and about half of the feed’s calls to photos fail until someone edits the file by hand.\n\nThere is a second problem. The upload service calls the search, notification and feed services one after another and waits for each, so a slow search service makes every upload slow, and a dead one makes uploads fail.',
  body: [
    { kind: 'heading', text: 'Finding each other' },
    {
      kind: 'prose',
      md: 'Fixed addresses fail because, in a fleet, nothing stays put: an instance gets a new address and port whenever it starts, and it can vanish at any moment. So a caller has to look up where a service is at the moment it calls. That lookup is called [[service discovery|service-discovery]].',
    },
    {
      kind: 'prose',
      md: 'The usual tool is a [[service registry|service-registry]]: a small, replicated database that maps each service name to the addresses of its healthy instances. It works like the office directory, in four moves:\n\n1. **Register.** A new instance tells the registry its name, address and port, or the platform does it on the instance’s behalf.\n2. **Stay alive.** It sends a [[heartbeat|heartbeat]] every few seconds, or the registry runs [[health checks|health-check]]. An instance that goes quiet is dropped, like a [[lease|lease]] that was not renewed.\n3. **Look up.** A caller asks for “photos” and gets the current list, which it may keep for a few seconds.\n4. **Leave.** An instance that shuts down cleanly removes itself first.',
    },
    {
      kind: 'diagram',
      title: 'Looking up the photo service',
      caption: 'The feed service finds photo instances through the registry. Step through a lookup, a new instance and a crash.',
      spec: lookup,
    },
    {
      kind: 'prose',
      md: 'There are two common ways to use a registry. In [[client-side discovery|client-side-discovery]], the caller asks the registry itself and picks an instance, often taking turns. In [[server-side discovery|server-side-discovery]], the caller sends every request to one stable name or [[virtual IP address|virtual-ip]], and a [[load balancer|load-balancer]] or the platform looks up the registry and forwards the request.',
    },
    {
      kind: 'compare',
      left: {
        title: 'Client-side discovery',
        summary: 'The caller looks up and picks',
        points: [
          'No extra hop: calls go straight to an instance.',
          'The caller can pick well, such as the least busy instance.',
          'Every service needs a discovery library in its own language.',
        ],
      },
      right: {
        title: 'Server-side discovery',
        summary: 'The caller uses one stable name',
        points: [
          'Callers stay simple: one stable name.',
          'Works the same for any language or tool.',
          'Adds a hop, and the forwarder must itself be redundant.',
        ],
      },
      caption: 'Kubernetes does server-side discovery by default, and its “headless” services hand callers the full list instead.',
    },
    {
      kind: 'prose',
      md: 'The [[Domain Name System|dns]] (DNS) can serve as a registry too, and every language can use it. But clients often cache answers for their [[time to live|ttl]] (TTL) or longer, so a dead address can linger, which is one reason [[Kubernetes|kubernetes]] points each service’s DNS name at one stable virtual address instead.',
    },
    { kind: 'heading', text: 'Talking: wait for an answer, or not' },
    {
      kind: 'prose',
      md: 'Once a service knows where to call, it has to decide how. In [[synchronous communication|synchronous-communication]], the caller sends a request and waits for the reply, as in a [[representational state transfer|rest]] (REST) call or a [[gRPC|grpc]] call. In [[asynchronous communication|asynchronous-communication]], the sender publishes a message or [[event|event]] to a [[message broker|message-broker]] and moves on, and whoever cares handles it later.',
    },
    {
      kind: 'prose',
      md: '**Synchronous calls** fit when the caller cannot continue without the answer, as when the feed needs photo details to build a page. REST sends readable [[JavaScript Object Notation|json]] (JSON) over the Hypertext Transfer Protocol (HTTP) and works with any tool, which suits public and partner [[application programming interfaces|api]] (APIs). gRPC sends compact [[Protocol Buffers|protocol-buffers]] messages from a shared contract file, faster and stricter, which suits busy internal calls; [APIs: REST, GraphQL, gRPC](lesson:api-styles) compares them.',
    },
    {
      kind: 'prose',
      md: 'The price of waiting: a caller is only as fast and as available as the services it calls. Give each synchronous call a [[timeout|timeout]], limited retries and usually a [[circuit breaker|circuit-breaker]], as in [Timeouts, retries, backoff and jitter](lesson:timeouts-retries-backoff). When a page needs several services, call them at the same time, so it waits only for the slowest.',
    },
    {
      kind: 'prose',
      md: '**Asynchronous events** fit when the sender does not need an answer: after an upload, indexing, notifications and feed updates can happen a moment later. If search is down, its events wait in the broker until it recovers. The price: nothing happens instantly, an event can arrive twice, so consumers must be [[idempotent|idempotent]], and a chain of events is harder to follow than one call, as [Event-driven architecture](lesson:event-driven) shows.',
    },
    {
      kind: 'sequence',
      title: 'One upload: one call that waits, one event that does not',
      caption: 'The upload service waits only for what it truly needs. Step through it.',
      spec: upload,
    },
    { kind: 'heading', text: 'A service mesh, in one paragraph' },
    {
      kind: 'prose',
      md: 'With forty services, every one needs the same plumbing on every call: discovery, timeouts, retries, encryption and metrics. A [[service mesh|service-mesh]] moves that plumbing out of the code into a small proxy beside each instance, called a [[sidecar|sidecar]]: services talk to their local proxy, and the proxies find each other, retry, encrypt traffic with [[mutual TLS|mutual-tls]] (Transport Layer Security where both sides prove who they are) and report metrics. A central controller sends every proxy its rules, so one change can, say, move 5% of feed traffic to a new version. [Istio](https://istio.io/latest/about/service-mesh/), built on the Envoy proxy, is a well-known mesh; the price is more parts to run and a little extra latency on every call.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out a lot: how the registry itself stays up (it usually runs on a replicated [[coordination service|coordination-service]] such as etcd or ZooKeeper), load balancing inside client libraries, versioning the contracts of calls and events, and the many settings of a real mesh.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways for services to talk, and the layer that can manage the calls.',
    rows: [
      {
        option: 'REST call',
        goodAt: 'Simple, readable, and works with every language and tool.',
        badAt: 'Bigger text messages that are slower to parse, and often a loose contract.',
        pickWhen: 'Public and partner APIs, and simple internal calls.',
      },
      {
        option: 'gRPC call',
        goodAt: 'Compact binary messages, code generated from a strict contract, and streaming.',
        badAt: 'Harder to inspect by hand, and browsers need a proxy to use it.',
        pickWhen: 'Busy internal calls that need an answer now.',
      },
      {
        option: 'Asynchronous event',
        goodAt: 'The sender never waits, consumers can be down for a while, and new consumers join without changing the sender.',
        badAt: 'No immediate answer, possible duplicates and delays, and flows that are harder to trace.',
        pickWhen: 'The sender needs no reply, as with indexing and notifications.',
      },
      {
        option: 'Service mesh',
        goodAt: 'Retries, encryption, routing and metrics for every call, without changing service code.',
        badAt: 'Another system to run, extra latency per call, and a lot to learn.',
        pickWhen: 'Many services in several languages need the same call rules and security.',
      },
    ],
  },
  realWorld: {
    title: 'Services and DNS in Kubernetes',
    body: 'Kubernetes runs each instance of a service in a pod, and its documentation warns that pods are ephemeral: they are created and destroyed to match the desired state of the cluster, so their addresses keep changing. A Kubernetes Service gives a set of pods one stable cluster IP address, and Kubernetes updates the Service’s list of endpoints whenever the set of pods changes.\n\nKubernetes also creates a DNS record for every Service, such as `photos.prod.svc.cluster.local`, which resolves to that stable address, and a pod in the same namespace can simply look up `photos`. For callers that want to pick instances themselves, a headless Service resolves to the addresses of all its pods instead. The details are in [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/).',
    sourceUrl: 'https://kubernetes.io/docs/concepts/services-networking/service/',
    sourceLabel: 'Kubernetes documentation, “Service”',
  },
  interview: {
    whenToMention:
      'As soon as your design has more than a couple of services. Say how they find each other, through the platform’s discovery or a registry, and for each arrow say whether the caller waits. Interviewers like hearing which calls are synchronous and why, and which work moves to events.',
    sayItLikeThis: [
      'Services find each other through the platform’s discovery: a stable name per service, backed by a registry of healthy instances, so autoscaling never breaks callers.',
      'The feed calls the photo service synchronously over gRPC, with a 200 ms timeout and a fallback, because it needs the answer to build the page.',
      'Everything that can happen a moment later, such as indexing, notifications and counters, hangs off one “photo uploaded” event, so uploads never wait for those services.',
    ],
    followUps: [
      {
        q: 'What happens if the service registry goes down?',
        a: 'Callers keep using the addresses they cached, so most traffic continues, but new instances cannot register and dead ones stay listed. That is why registries run as a replicated cluster of three or five nodes, and why callers keep their last good answer when the registry is unreachable.',
      },
      {
        q: 'When would you choose gRPC over REST between internal services?',
        a: 'For busy internal calls where speed and a strict contract matter: gRPC messages are smaller, the contract file generates client code, and it supports streaming. I would keep REST for public or partner APIs and for simple, low-traffic internal calls, where readability and tooling matter more.',
      },
      {
        q: 'Do you need a service mesh?',
        a: 'Not at first. With a handful of services, the platform’s discovery and a shared client library are enough. A mesh pays off when many services in several languages need the same retries, encryption and traffic rules, and the team can run it.',
      },
    ],
    redFlags: [
      'Hard-coding instance addresses in config files.',
      'Making every call synchronous, so one slow service stalls every request that touches it.',
      'Calling another service with no timeout, or retrying without limits.',
      'Adding a service mesh to a three-service system because big companies use one.',
    ],
  },
  mistakes: [
    '**Hard-coded addresses.** They break as soon as autoscaling or a deploy replaces an instance, and nobody notices until calls fail.',
    '**Long synchronous chains.** A request that waits on four services in a row adds their latencies together and fails if any one of them fails.',
    '**Caching lookups forever.** A caller that never refreshes its list keeps sending traffic to instances that are long gone.',
    '**Events where you need an answer.** If the caller needs the result now, such as a login check, an event adds delay and a reply path you have to build yourself.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt:
        'Autoscaling replaced two of the photo service’s four instances, and now about half of the feed’s calls to photos fail. What is the most likely cause?',
      options: [
        {
          text: 'The feed calls fixed addresses from a config file',
          correct: true,
          why: 'Two of the four addresses now point at instances that no longer exist, so about half of the calls go nowhere.',
        },
        {
          text: 'The photo service is overloaded',
          correct: false,
          why: 'Overload makes calls slow or fail on every instance, not exactly on the replaced ones.',
        },
        {
          text: 'gRPC is too slow for this traffic',
          correct: false,
          why: 'The protocol is not the problem; the calls are going to addresses with nothing behind them.',
        },
        {
          text: 'The event broker is down',
          correct: false,
          why: 'The feed’s calls to the photo service are synchronous calls and never pass through the broker.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these should be asynchronous events rather than synchronous calls?',
      options: [
        {
          text: 'Updating the search index after an upload',
          correct: true,
          why: 'The uploader does not need to wait for indexing, and a few seconds of delay is fine.',
        },
        {
          text: 'Sending a “someone liked your photo” notification',
          correct: true,
          why: 'Nobody waits on the notification, and it can be delivered later if the service is down.',
        },
        {
          text: 'Checking whether a login token is valid',
          correct: false,
          why: 'The request cannot continue without the answer, so it needs a synchronous call.',
        },
        {
          text: 'Fetching photo details to build the feed page',
          correct: false,
          why: 'The page needs the details now, so the feed calls the photo service and waits.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put a new photo instance’s first minute in order.',
      items: [
        'The instance starts at a new address',
        'It registers its name, address and port',
        'It sends heartbeats every few seconds',
        'A caller’s next lookup includes it',
        'The caller sends it requests',
      ],
      why: 'An instance gets traffic only after it is in the registry and a caller has looked it up again. Callers keep lookups for a few seconds, so a new instance gets traffic within seconds, not instantly.',
    },
    {
      kind: 'single',
      prompt: 'What does the sidecar proxy in a service mesh do?',
      options: [
        {
          text: 'Handles discovery, retries, encryption and metrics for its service’s calls',
          correct: true,
          why: 'The proxy runs beside each instance, so every service gets these features without changing its code.',
        },
        {
          text: 'Stores events until consumers are ready for them',
          correct: false,
          why: 'That is a message broker’s job; a sidecar handles calls as they happen.',
        },
        {
          text: 'Replaces the service registry',
          correct: false,
          why: 'The mesh still needs to know where instances are, and it usually reads them from the platform’s registry.',
        },
        {
          text: 'Turns asynchronous events into synchronous calls',
          correct: false,
          why: 'It carries whatever calls the service makes and does not change their style.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'To build a page, the feed calls three services that each take about 20 ms, then a fourth that takes 40 ms, one after another. None needs another’s answer. How many milliseconds does it save by calling all four at the same time?',
      answer: 60,
      unit: 'ms',
      tolerance: 1.1,
      solution: [
        'One after another, the waits add up: 20 + 20 + 20 + 40 = 100 ms.',
        'At the same time, the feed waits only for the slowest call: 40 ms.',
        'It saves 100 − 40 = 60 ms.',
      ],
    },
  ],
  takeaways: [
    'Instances come and go, so services find each other through a registry of healthy instances, never through fixed addresses.',
    'Call synchronously, with REST or gRPC, only when the caller needs the answer now, and give every such call a timeout and a fallback.',
    'Publish an event for work that can happen later, so slow or broken consumers never hold up the sender.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Control plane and data plane.** A mesh has two parts: the [[control plane|control-plane]] decides the rules, such as routes, retry limits and certificates, and pushes them out, while the data plane, the proxies, carries the actual traffic. If the control plane goes down, the proxies keep working with their last rules; they just cannot get new ones.',
    },
    {
      kind: 'prose',
      md: '**Sidecars or not.** A proxy per instance costs memory and adds a hop to every call. Istio also offers an “ambient” mode as an alternative to sidecars, and some teams skip the mesh entirely and put retries and encryption in a shared client library.',
    },
    {
      kind: 'prose',
      md: '**Contracts between services.** Every call and every event is a contract between teams. Change them in [[backward-compatible|backward-compatibility]] ways, such as adding optional fields, and keep old versions working until every caller has moved, or one team’s deploy will break another’s service.',
    },
  ],
  flashcards: [
    {
      front: 'Why can’t services call each other at fixed addresses?',
      back: 'Instances start, stop and move with autoscaling and deploys, so their addresses keep changing.',
    },
    {
      front: 'What does a service registry hold?',
      back: 'For each service name, the addresses and ports of its healthy instances, kept current by registration and heartbeats or health checks.',
    },
    {
      front: 'Client-side or server-side discovery: what is the difference?',
      back: 'In client-side discovery the caller looks up instances and picks one; in server-side discovery it calls one stable name, and a balancer or the platform picks.',
    },
    {
      front: 'When should a call between services be synchronous?',
      back: 'When the caller cannot continue without the answer, such as fetching data to build a page or checking a login.',
    },
    {
      front: 'When should work move to an asynchronous event?',
      back: 'When the sender does not need a reply and the work can happen a moment later, such as indexing or notifications.',
    },
    {
      front: 'What is a sidecar in a service mesh?',
      back: 'A small proxy beside each service instance that handles discovery, retries, encryption and metrics for its calls.',
    },
    {
      front: 'gRPC or REST for internal calls?',
      back: 'gRPC for busy calls that need speed and a strict contract; REST where simplicity, readability and broad tooling matter more.',
    },
  ],
  related: [
    'monolith-vs-microservices',
    'api-styles',
    'load-balancers',
    'timeouts-retries-backoff',
    'circuit-breakers',
    'event-driven',
    'heartbeats-gossip',
    'observability',
  ],
  glossaryTerms: [
    'autoscaling',
    'instance',
    'ip-address',
    'service-discovery',
    'service-registry',
    'heartbeat',
    'health-check',
    'lease',
    'client-side-discovery',
    'server-side-discovery',
    'virtual-ip',
    'load-balancer',
    'dns',
    'ttl',
    'kubernetes',
    'synchronous-communication',
    'rest',
    'grpc',
    'asynchronous-communication',
    'event',
    'message-broker',
    'json',
    'api',
    'protocol-buffers',
    'timeout',
    'circuit-breaker',
    'idempotent',
    'service-mesh',
    'sidecar',
    'mutual-tls',
    'coordination-service',
    'control-plane',
    'backward-compatibility',
  ],
};

export default lesson;
