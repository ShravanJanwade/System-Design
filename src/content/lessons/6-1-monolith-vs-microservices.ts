import type { DecisionNode, DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The main step-through: Snapgram's core app gains modules, then services move out of it one at a time. */
const evolution: DiagramSpec = {
  grid: { cols: 4, rows: 4 },
  nodes: [
    { id: 'phones', type: 'client', label: 'Phones', x: 0, y: 1.5 },
    { id: 'gateway', type: 'gateway', label: 'API gateway', x: 1, y: 1.5 },
    { id: 'photos', type: 'service', label: 'Photo service', x: 2, y: 0 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 2, y: 1 },
    { id: 'core', type: 'service', label: 'Core app', sublabel: 'the monolith', x: 2, y: 2 },
    { id: 'payments', type: 'service', label: 'Payments', sublabel: 'for Prints', x: 2, y: 3 },
    { id: 'photoDb', type: 'sqlDb', label: 'Photo database', x: 3, y: 0 },
    { id: 'notify', type: 'service', label: 'Notifications', x: 3, y: 1 },
    { id: 'coreDb', type: 'sqlDb', label: 'Core database', x: 3, y: 2 },
  ],
  edges: [
    { id: 'phones-gateway', from: 'phones', to: 'gateway', kind: 'sync' },
    { id: 'gateway-core', from: 'gateway', to: 'core', kind: 'sync' },
    { id: 'core-coreDb', from: 'core', to: 'coreDb', kind: 'sync' },
    { id: 'gateway-photos', from: 'gateway', to: 'photos', kind: 'sync' },
    { id: 'photos-photoDb', from: 'photos', to: 'photoDb', kind: 'sync' },
    { id: 'gateway-feed', from: 'gateway', to: 'feed', kind: 'sync' },
    { id: 'feed-photos', from: 'feed', to: 'photos', kind: 'sync' },
    { id: 'photos-notify', from: 'photos', to: 'notify', kind: 'async' },
    { id: 'core-payments', from: 'core', to: 'payments', kind: 'sync' },
  ],
  // Phones: phones and gateway on top, the photo services on the left and the core app's pieces on the right.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      phones: { x: 1, y: 0 },
      feed: { x: 0, y: 1 },
      gateway: { x: 1, y: 1 },
      photos: { x: 0, y: 2 },
      notify: { x: 1, y: 2 },
      core: { x: 2, y: 2 },
      photoDb: { x: 0, y: 3 },
      payments: { x: 1, y: 3 },
      coreDb: { x: 2, y: 3 },
    },
    sides: { 'gateway-core': { fromSide: 'right', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Today almost every request goes through the **API gateway** to the **core app**: one program, one database and one deploy for about 300 engineers. Only Prints **payments** has run on its own, since lesson 4.8.',
      flow: ['phones-gateway', 'gateway-core', 'core-coreDb'],
    },
    {
      caption:
        'First, nothing changes outside. Inside the core app, the code is split into photo, feed, notification and Prints modules, each with an owning team, a public interface and its own tables.',
      focus: ['core', 'coreDb'],
      notes: [{ target: 'core', text: '4 modules, 1 deploy', tone: 'signal' }],
    },
    {
      caption:
        'The photo module moves out first: it changes often and needs the most servers. The **photo service** gets its own servers, deploys and database, and the gateway sends photo requests to it.',
      add: ['photos', 'photoDb', 'gateway-photos', 'photos-photoDb'],
      flow: ['phones-gateway', 'gateway-photos', 'photos-photoDb'],
      notes: [{ target: 'photoDb', text: 'owned by photos', tone: 'plain' }],
    },
    {
      caption:
        'The **feed service** follows. Showing a post used to be a function call into the photo module; now it is a network call to the photo service, slower and able to fail.',
      add: ['feed', 'gateway-feed', 'feed-photos'],
      flow: ['phones-gateway', 'gateway-feed', 'feed-photos'],
      notes: [{ target: 'feed-photos', text: 'network call', tone: 'alert' }],
    },
    {
      caption:
        'Notifications never need an answer, so the photo service publishes a “photo uploaded” event and **Notifications** handles it later. If notifications are down, uploads still work.',
      add: ['notify', 'photos-notify'],
      flow: ['photos-notify'],
    },
    {
      caption:
        'Prints **payments** keeps its own service and careful releases, because it handles money. The rest stays in a smaller core app, and each team ships on its own schedule.',
      flow: ['phones-gateway', 'gateway-core', 'core-payments'],
      notes: [{ target: 'payments', text: 'own deploy', tone: 'signal' }],
    },
  ],
};

/** One Prints order after the split: two network messages, two databases and an event. */
const printsOrder: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'prints', type: 'service', label: 'Prints service' },
    { id: 'payments', type: 'service', label: 'Payments' },
    { id: 'notify', type: 'service', label: 'Notifications' },
  ],
  messages: [
    {
      from: 'phone',
      to: 'prints',
      label: 'Order photo book',
      kind: 'sync',
      caption: 'Maya orders a photo book. The **Prints service** saves the order as “pending” in its own database.',
    },
    {
      from: 'prints',
      to: 'payments',
      label: 'Charge $30',
      kind: 'sync',
      caption: 'Prints may not touch the payment tables, so it asks **Payments** over the network: a call that can be slow, fail or time out.',
    },
    {
      from: 'payments',
      to: 'prints',
      label: 'Charged',
      kind: 'reply',
      caption:
        'Payments records the charge in its own database. No transaction covers both: if Prints crashed now, the card would be charged and the order still “pending” until a repair step runs.',
    },
    {
      from: 'prints',
      to: 'notify',
      label: 'Order placed',
      kind: 'async',
      caption: 'Prints publishes an “order placed” event. **Notifications** emails Maya later, and Prints does not wait.',
    },
    {
      from: 'prints',
      to: 'phone',
      label: 'Order confirmed',
      kind: 'reply',
      caption: 'Maya sees her confirmation. One tap became two network messages and an event, each able to fail.',
    },
  ],
  groups: [{ label: 'network call', from: 2, to: 3 }],
};

const whichShape: DecisionNode = {
  kind: 'question',
  id: 'teams',
  question: 'How many teams work on the code?',
  options: [
    {
      label: 'One or two',
      next: {
        kind: 'result',
        id: 'monolith',
        title: 'A monolith',
        why: 'A small team coordinates easily, and one program is the fastest to build and change.',
      },
    },
    {
      label: 'Several',
      next: {
        kind: 'question',
        id: 'independence',
        question: 'Must some part deploy, scale or fail on its own, and can you run a service for it?',
        options: [
          {
            label: 'Not yet',
            next: {
              kind: 'result',
              id: 'modular',
              title: 'A modular monolith',
              why: 'Owners and enforced walls stop teams tripping over each other, with one deploy and fast calls.',
            },
          },
          {
            label: 'Yes',
            next: {
              kind: 'result',
              id: 'extract',
              title: 'Pull out those parts as services',
              why: 'Extract only the parts that need independence, one at a time, and keep the rest as a modular monolith.',
              lessonId: 'service-communication',
            },
          },
        ],
      },
    },
  ],
};

const lesson: Lesson = {
  id: 'monolith-vs-microservices',
  module: 'm6',
  order: 1,
  title: 'Monolith, modular monolith, microservices',
  idea: 'An app can run as one program (a monolith), one program with enforced walls between its parts (a modular monolith), or many small programs talking over the network (microservices), and each step trades simplicity for independence.',
  minutes: 15,
  prerequisites: ['reverse-proxies-gateways', 'why-distributed-is-hard'],
  outcomes: [
    'Describe a monolith, a modular monolith and microservices, and say when each one fits.',
    'Explain the real costs of microservices: network calls, operations work and divided data.',
    'Plan a gradual split, from modules with owners to a few services pulled out one at a time.',
  ],
  analogy: {
    title: 'One big kitchen or a food court',
    body: 'Picture a restaurant with one big kitchen. Every cook shares the same stoves and fridge, so passing a pan along is easy and the head chef can change the menu in an afternoon. But at fifty cooks, people bump into each other, and a grease fire at one station closes the whole kitchen.\n\nA food court works differently: each stall has its own kitchen, staff and hours, so the noodle stall can close for a day while the taco stand keeps serving. The price is two queues for one meal, a fridge and an inspection for every stall, and no borrowing from another stall’s fridge without asking. In between sits one big kitchen with walled-off stations, each with its own cooks and its own shelf.',
  },
  whyItMatters:
    'Snapgram now has about 50 million daily users and about 300 engineers. Only Prints payments and dozens of small helper services, from thumbnails to suggestions, run on their own. The user, photo and feed services from [lesson 3.3](lesson:reverse-proxies-gateways) were split in name only: they still share the core database and ship in the same deploy. So the heart of the product is still one big program, the core app: a [[monolith|monolith]] holding profiles, photos, the feed, comments, notifications and Prints orders.\n\nEvery change ships in the same [[deploy|deploy]], and a deploy now takes hours, because the whole test suite must pass first. Last week a bug in the notifications code failed those tests, and every other team’s finished work waited a day behind it. Days later, a memory leak in the comments code crashed the core app and took login and checkout down with it.\n\nOne engineer wants to split everything into small services. Another warns that her last company did exactly that and spent a year undoing it. Both have a point.',
  body: [
    { kind: 'heading', text: 'One program: the monolith' },
    {
      kind: 'prose',
      md: 'A monolith is one program: one codebase, one build, one deploy and usually one database. That is often exactly right. Parts talk through function calls that take nanoseconds and cannot get lost, one database [[transaction|transaction]] can save a comment and a payment together, and one stack trace shows what broke.',
    },
    {
      kind: 'prose',
      md: 'A monolith is not one server: Snapgram runs many copies of its core app behind a [[load balancer|load-balancer]]. The trouble is size. With 300 engineers, every change waits for the same release, one bad change can block or crash everything, and the parts grow tangled through [[coupling|coupling]], so a change to comments breaks the feed.',
    },
    { kind: 'heading', text: 'Walls inside one program: the modular monolith' },
    {
      kind: 'prose',
      md: 'A [[modular monolith|modular-monolith]] keeps one program and one deploy but divides the code into modules along business lines: photos, feed, notifications, Prints. Each module has an owning team, a public interface that others must use, and its own tables that no other module reads. Good modules follow a [[bounded context|bounded-context]]: a part of the business with its own words and rules, such as Prints orders.',
    },
    {
      kind: 'prose',
      md: 'Tools enforce the walls: a check in the build fails when one module reaches into another’s private code or tables. You keep fast calls and a single deploy, teams stop tripping over each other, and you learn where the real boundaries are before you split anything out.',
    },
    { kind: 'heading', text: 'Separate programs: microservices' },
    {
      kind: 'prose',
      md: 'With [[microservices|microservices]], each module becomes its own program, with its own servers, releases and data. The photo team can deploy ten times a day without waiting for anyone, the feed can run on 400 servers while Prints runs on 6, and a crash in notifications stays there: a smaller [[blast radius|blast-radius]].',
    },
    {
      kind: 'prose',
      md: 'Each service owns its data, a rule called [[database per service|database-per-service]]. Other services never read its tables; they ask through its [[application programming interface|api]] (API) or listen for its [[events|event]]. That rule makes independent change possible, and it is also what makes microservices expensive.',
    },
    {
      kind: 'diagram',
      title: 'Snapgram splits, one piece at a time',
      caption: 'From one core app, to modules inside it, to four services. Step through the split.',
      spec: evolution,
    },
    { kind: 'heading', text: 'What microservices really cost' },
    {
      kind: 'prose',
      md: '**Network calls.** A function call takes a few nanoseconds; a call to another service in the same data center takes about half a millisecond for the round trip (ballpark). Worse, it can fail in ways a function call cannot: the other side may be down, slow, or done with the work while the reply was lost, the [[partial failure|partial-failure]] from [Why distributed systems are hard](lesson:why-distributed-is-hard).',
    },
    {
      kind: 'prose',
      md: 'Chains of calls multiply the risk. If a request needs six services that are each up 99.9% of the time, it works only about 99.4% of the time, and calls made one after another add up their [[latencies|latency]]. Every call needs a [[timeout|timeout]] and a fallback, or one slow service can drag its callers down with it, a [[cascading failure|cascading-failure]].',
    },
    {
      kind: 'prose',
      md: '**Operations.** Every service needs its own deploy pipeline, dashboards, alerts and on-call. Following one slow request across services takes [[distributed tracing|distributed-tracing]], so good [[observability|observability]] stops being optional.',
    },
    {
      kind: 'prose',
      md: '**Data ownership.** One database meant one transaction for an order and its payment, and any page could join any tables. With a database per service there are no joins or transactions across services, so a Prints order that spans two of them needs a [[saga|saga]] with undo steps, and other services see changes a little later: [[eventual consistency|eventual-consistency]].',
    },
    {
      kind: 'sequence',
      title: 'One Prints order, three services',
      caption: 'What used to be function calls inside one program is now network messages and an event.',
      spec: printsOrder,
    },
    {
      kind: 'prose',
      md: 'Break these rules, say by letting services share a database, and you get a [[distributed monolith|distributed-monolith]]: services that must still change and release together, now with network calls between them. It has the costs of microservices without the independence.',
    },
    { kind: 'heading', text: 'Choosing, and splitting gradually' },
    {
      kind: 'decision',
      title: 'Monolith, modular monolith or microservices?',
      caption: 'A rough guide. Real answers depend on the product and the people.',
      tree: whichShape,
    },
    {
      kind: 'prose',
      md: 'When you do split, go one piece at a time. The [[strangler fig pattern|strangler-fig]] puts a router, often the gateway, in front of the old system and moves one feature at a time to new code until the old part can be switched off. Start with the part that gains most, such as one that changes often, needs far more servers or handles money.',
    },
    {
      kind: 'prose',
      md: 'Martin Fowler argues for this order in [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html): almost all the successful microservice stories he knew of began as a monolith that grew too big and was broken up, partly because boundaries are hard to get right before you know the domain.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson skips how big a service should be, how teams organize around services, the platforms that run them and how to move data out of a shared database. How split services find and call each other is [the next lesson](lesson:service-communication).',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to arrange the same product.',
    rows: [
      {
        option: 'Monolith',
        goodAt: 'Fast to build, change, test and debug; calls and transactions stay local.',
        badAt: 'Gets tangled as teams grow: shared releases, and one bug can block or crash everything.',
        pickWhen: 'You are starting out, or one or two teams own the product.',
      },
      {
        option: 'Modular monolith',
        goodAt: 'Clear owners and boundaries, with one deploy, fast calls and simple transactions.',
        badAt: 'The walls need tooling and discipline, and it is still one release and one unit to scale.',
        pickWhen: 'Several teams share a growing codebase.',
      },
      {
        option: 'Microservices',
        goodAt: 'Teams deploy and scale on their own, and failures stay contained.',
        badAt: 'Network calls, partial failures, heavy operations work, and no joins or transactions across services.',
        pickWhen: 'Many teams must move independently, parts have very different load or rules, and you can run the platform.',
      },
    ],
  },
  realWorld: {
    title: 'Shopify’s modular monolith',
    body: 'In 2019, Shopify described its codebase as one of the largest Ruby on Rails codebases in existence, worked on for over a decade by more than a thousand developers. Unrelated changes broke each other’s tests, and new developers needed a lot of context to change anything. The team decided against microservices for now, citing the pipelines and infrastructure each service would need and network calls that add latency and reduce reliability.\n\nInstead, it built a modular monolith: one codebase and one deployment, reorganized into components such as orders, shipping, inventory and billing. Each component was to have a public interface and exclusive ownership of its data, and an in-house tool called Wedge flagged calls that crossed component boundaries.',
    sourceUrl: 'https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity',
    sourceLabel: 'Kirsten Westeinde, “Deconstructing the Monolith: Designing Software that Maximizes Developer Productivity,” Shopify Engineering, 2019',
  },
  interview: {
    whenToMention:
      'Early, when you sketch the high-level design. For a new product or a small team, start with a modular monolith and name the parts you might split later. For huge scale or many teams, split along business boundaries and name the costs you are taking on.',
    sayItLikeThis: [
      'I’d start with a modular monolith: one deployable app with modules for photos, feed and payments, each owning its tables, so we can split later along tested lines.',
      'I’d pull out the feed as its own service, because it needs far more capacity than the rest, and accept a network call to the photo service for that.',
      'Each service owns its data; anything spanning services, like an order and its payment, goes through a saga or events, not a shared database.',
    ],
    followUps: [
      {
        q: 'Why not start with microservices, since we will need them at scale?',
        a: 'Boundaries are hard to get right before you know the domain, and moving code between services is far harder than between modules. Each service also needs a pipeline, monitoring and on-call. I’d build a modular monolith and split out a service when a team or a load pattern needs it.',
      },
      {
        q: 'Two services need the same data. Can they share a database?',
        a: 'I’d avoid it: a shared schema couples them, so one team’s change can break the other and neither can deploy alone. One service owns the data; the other calls its API, or keeps a copy updated from events and accepts that it can be slightly stale.',
      },
      {
        q: 'How would you split an existing monolith without a big rewrite?',
        a: 'With the strangler fig pattern: give one module a clear interface and its own data, build the new service, and route that module’s traffic to it through the gateway, keeping the old path as a fallback until the service is proven. Then repeat.',
      },
    ],
    redFlags: [
      'Proposing dozens of microservices for a small product built by one team.',
      'Letting several services read and write the same tables.',
      'Ignoring the network: no timeouts, no retries, no plan for a service being down.',
      'Treating microservices as a speed fix, when they add latency to every call between services.',
    ],
  },
  mistakes: [
    '**Splitting too early.** Boundaries drawn before you understand the product land in the wrong places, and moving code across services is slow and risky.',
    '**Sharing a database between services.** It creates a distributed monolith, where one table change breaks teams that never touched it.',
    '**Chatty services.** A page that makes ten calls in a row between services pays for ten round trips and has ten chances to fail.',
    '**Splitting by technical layer.** A “database service” and a “logic service” must change together for every feature, so split by business area instead.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'A new photo app has two engineers and a product that changes every week. Which shape fits best?',
      options: [
        {
          text: 'A monolith with tidy code',
          correct: true,
          why: 'Two people coordinate easily, and one program is the fastest to build, change and debug while the product is still finding its shape.',
        },
        {
          text: 'Microservices, one per feature',
          correct: false,
          why: 'They would spend their time on pipelines, network calls and operations instead of the product, and boundaries drawn now will likely be wrong.',
        },
        {
          text: 'Microservices that share one database',
          correct: false,
          why: 'That is a distributed monolith: the costs of services with none of the independence.',
        },
        {
          text: 'One service per database table',
          correct: false,
          why: 'Splitting by table turns nearly every feature into a chain of network calls between services that must change together.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'A page needs 10 services, called one after another. Each is up 99.9% of the time, and they fail independently. Out of 10,000 page loads, roughly how many fail?',
      answer: 100,
      unit: 'page loads',
      tolerance: 1.2,
      solution: [
        'Each service works with probability 0.999.',
        'All ten work with probability 0.999 to the tenth power, about 0.990.',
        'So about 1% of page loads fail: 10,000 × 0.01 ≈ 100.',
        'Shortcut for small failure rates: add them up, 10 × 0.1% = 1%.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are real costs of moving from a monolith to microservices?',
      options: [
        {
          text: 'Calls between parts can now time out or fail halfway',
          correct: true,
          why: 'A function call cannot get lost, but a network call can, so every call needs a timeout and a plan for failure.',
        },
        {
          text: 'Each service needs its own pipeline, monitoring and on-call',
          correct: true,
          why: 'Operations work grows with the number of services, which is why the platform has to come first.',
        },
        {
          text: 'No database transaction can cover two services’ data',
          correct: true,
          why: 'Each service owns its own store, so changes that span services need sagas or events instead.',
        },
        {
          text: 'Parts can no longer be scaled separately',
          correct: false,
          why: 'Separate scaling is a benefit of microservices, not a cost: the feed can run on far more servers than Prints.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of pulling one module out of a monolith in order.',
      items: [
        'Give the module a clear boundary and a public interface inside the monolith',
        'Stop other modules from reading its tables directly',
        'Build the new service and move the module’s data into the service’s own database',
        'Route the module’s traffic to the new service through the gateway',
        'Delete the old code path once the service has proven itself',
      ],
      why: 'Walls inside the monolith come first, because they are cheap to fix while everything is still one program. Traffic moves only after the service owns its data, and the old path stays as a fallback until the new one is trusted.',
    },
    {
      kind: 'single',
      prompt: 'The feed service and the photo service are deployed separately, but both read and write the same `photos` table. What do you have?',
      options: [
        {
          text: 'A distributed monolith',
          correct: true,
          why: 'They deploy separately but stay coupled through a shared table, so one team’s schema change can break the other.',
        },
        {
          text: 'A modular monolith',
          correct: false,
          why: 'A modular monolith is one program with walls inside; here there are two programs and no wall around the data.',
        },
        {
          text: 'Healthy microservices with a database per service',
          correct: false,
          why: 'Database per service means each service owns its own data, and here two services share a table.',
        },
        {
          text: 'A strangler fig migration',
          correct: false,
          why: 'The strangler fig pattern replaces a system gradually; sharing a table is not part of it.',
        },
      ],
    },
  ],
  takeaways: [
    'A monolith is the right start for most products: one program, fast calls, simple transactions and one deploy.',
    'A modular monolith adds owners and enforced walls inside that one program, which fixes most team problems without any network calls.',
    'Microservices buy independent deploys, scaling and failure, and you pay for them in network calls, operations work and data split across services.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Segment’s way back.** In a 2018 post, [Goodbye Microservices](https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices), Segment described splitting its data delivery into over 140 services, one per destination, to keep one failing destination from slowing the rest. Shared libraries drifted apart between services, tuning autoscaling for each one was “more art than science”, and three full-time engineers spent most of their time keeping the system running. The team merged them back into one service and reported more improvements to shared code and deploys one engineer could do in minutes, at the cost of weaker fault isolation.',
    },
    {
      kind: 'prose',
      md: '**Teams shape systems.** [[Conway’s law|conways-law]] says a system’s structure tends to copy the communication structure of the organization that builds it. Teams use it on purpose: draw service boundaries where team boundaries are, so each team owns its services from code to on-call. If two teams must coordinate every release, the boundary between their services is probably in the wrong place.',
    },
    {
      kind: 'prose',
      md: '**Not all or nothing.** Many companies keep a large core monolith with a ring of services around it, for the parts that need their own scaling, security or release pace. Fowler describes gradually peeling services off the edges of a monolith, which can leave a large monolith at the core. Stopping there is not a failure; it is often the cheapest place to stop.',
    },
  ],
  flashcards: [
    {
      front: 'What is a monolith?',
      back: 'One program built and deployed as a single unit, usually with one database. Its parts call each other with fast, local function calls.',
    },
    {
      front: 'What makes a monolith “modular”?',
      back: 'Its code is split into modules with owners, public interfaces and their own tables, and tools enforce the walls. It is still one program and one deploy.',
    },
    { front: 'What do microservices buy you?', back: 'Teams that deploy and scale on their own, and failures that stay inside one service.' },
    {
      front: 'What are the three big costs of microservices?',
      back: 'Network calls that can be slow or fail, operations work for every service, and data split across services with no joins or transactions between them.',
    },
    { front: 'What is database per service?', back: 'Each service owns its data store; other services use its interface or its events, never its tables.' },
    {
      front: 'What is a distributed monolith?',
      back: 'Services deployed separately but still coupled, often through a shared database, so they must change and release together.',
    },
    {
      front: 'What is the strangler fig pattern?',
      back: 'Replacing an old system piece by piece: a router sends one feature at a time to new code until the old part can be removed.',
    },
  ],
  related: [
    'reverse-proxies-gateways',
    'why-distributed-is-hard',
    'service-communication',
    'event-driven',
    'distributed-transactions',
    'zero-downtime-deploys',
    'observability',
  ],
  glossaryTerms: [
    'monolith',
    'deploy',
    'transaction',
    'load-balancer',
    'coupling',
    'modular-monolith',
    'bounded-context',
    'microservices',
    'blast-radius',
    'database-per-service',
    'api',
    'event',
    'partial-failure',
    'latency',
    'timeout',
    'cascading-failure',
    'distributed-tracing',
    'observability',
    'saga',
    'eventual-consistency',
    'distributed-monolith',
    'strangler-fig',
    'conways-law',
  ],
};

export default lesson;
