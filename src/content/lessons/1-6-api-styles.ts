import type { DecisionNode, DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Cursor pagination for the photo grid, with new posts arriving between pages. */
const cursorPages: SequenceSpec = {
  actors: [
    { id: 'app', type: 'client', label: 'Snapgram app' },
    { id: 'api', type: 'service', label: 'API server' },
    { id: 'db', type: 'sqlDb', label: 'Database' },
  ],
  groups: [
    { label: 'Page 1', from: 1, to: 3 },
    { label: 'Page 2', from: 4, to: 6 },
  ],
  messages: [
    {
      from: 'app',
      to: 'api',
      label: 'GET ?limit=30',
      kind: 'sync',
      caption: 'Maya opens a profile, and the app asks for the 30 newest photos.',
    },
    {
      from: 'api',
      to: 'db',
      label: 'Newest 30',
      kind: 'sync',
      caption: 'The server reads them through an index on posting time, which takes a few milliseconds.',
    },
    {
      from: 'api',
      to: 'app',
      label: 'Page 1, cursor p_9f2c',
      kind: 'reply',
      caption: 'Page 1 comes back with a cursor marking its last photo. The app treats the cursor as an opaque token and simply hands it back later.',
    },
    {
      from: 'app',
      to: 'api',
      label: 'GET ?after=p_9f2c',
      kind: 'sync',
      caption: 'Maya scrolls to the end of page 1. Two new photos were posted in the meantime.',
    },
    {
      from: 'api',
      to: 'db',
      label: 'Next 30, older',
      kind: 'sync',
      caption: 'The server asks for the 30 photos just older than the cursor’s photo. The new posts are newer, so they cannot push anything into this page.',
    },
    {
      from: 'api',
      to: 'app',
      label: 'Page 2, cursor p_71aa',
      kind: 'reply',
      caption: 'Page 2 starts exactly where page 1 ended: no duplicates and no gaps. On the last page, the cursor comes back empty.',
    },
  ],
};

/** The profile screen: one GraphQL query at the edge, gRPC calls inside. */
const profileFlow: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Snapgram app', sublabel: 'Maya’s phone', x: 0, y: 1 },
    { id: 'gql', type: 'service', label: 'GraphQL server', x: 1, y: 1 },
    { id: 'profile', type: 'service', label: 'Profile service', x: 2, y: 0 },
    { id: 'photos', type: 'service', label: 'Photo service', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-gql', from: 'phone', to: 'gql', kind: 'sync', label: 'GraphQL' },
    { id: 'gql-profile', from: 'gql', to: 'profile', kind: 'sync', label: 'gRPC' },
    { id: 'gql-photos', from: 'gql', to: 'photos', kind: 'sync', label: 'gRPC' },
  ],
  // Phones: the app on top, the GraphQL server under it, and its two gRPC calls fanning out below.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: { phone: { x: 1, y: 0 }, gql: { x: 1, y: 1 }, profile: { x: 0, y: 2 }, photos: { x: 2, y: 2 } },
    sides: { 'gql-profile': { fromSide: 'bottom', toSide: 'top' }, 'gql-photos': { fromSide: 'bottom', toSide: 'top' } },
  },
  steps: [
    {
      caption: 'Maya opens a profile. The app sends one query to the **GraphQL server**, listing every field the screen needs.',
      flow: ['phone-gql'],
      focus: ['phone', 'gql'],
    },
    {
      caption: 'The server splits the query by field and asks the **profile service** and the **photo service** at the same time, over gRPC.',
      flow: [['gql-profile', 'gql-photos']],
    },
    {
      caption: 'Inside the data center, each call takes a few milliseconds, and the binary replies are small.',
      flow: [['<gql-profile', '<gql-photos']],
      notes: [
        { target: 'profile', text: '≈ 2 ms', tone: 'plain' },
        { target: 'photos', text: '≈ 3 ms', tone: 'plain' },
      ],
    },
    {
      caption: 'The server assembles one response shaped exactly like the query: one ocean round trip for the whole screen instead of three.',
      flow: [{ edge: 'phone-gql', reverse: true, tag: '1 round trip' }],
      focus: ['phone', 'gql'],
    },
  ],
};

const whichStyle: DecisionNode = {
  kind: 'question',
  id: 'caller',
  question: 'Who will call this API?',
  help: 'Think about who writes the client code, and whether you can change it.',
  options: [
    {
      label: 'Other companies or the public',
      next: {
        kind: 'result',
        id: 'rest-public',
        title: 'REST',
        why: 'Outside developers already know HTTP and JSON, every tool supports them, and GET responses cache well. Version it from day one, because you cannot update their code.',
      },
    },
    {
      label: 'Our own app’s screens',
      next: {
        kind: 'question',
        id: 'screens',
        question: 'Do the screens combine data from several resources and change often?',
        help: 'A profile that shows a user, their photos and their followers, redesigned every few months.',
        options: [
          {
            label: 'Yes',
            next: {
              kind: 'result',
              id: 'graphql',
              title: 'GraphQL',
              why: 'Each screen asks for exactly what it shows in one round trip, and the app team can change queries without new endpoints. Cap query cost on the server.',
            },
          },
          {
            label: 'No, mostly simple reads and writes',
            next: {
              kind: 'result',
              id: 'rest-simple',
              title: 'REST',
              why: 'A few resource endpoints are simpler to build, cache and monitor. Add GraphQL later if screens start needing many calls.',
            },
          },
        ],
      },
    },
    {
      label: 'Our own services, inside the data center',
      next: {
        kind: 'result',
        id: 'grpc',
        title: 'gRPC',
        why: 'Compact binary calls over HTTP/2, with generated code and strict contracts on both sides. Speed and safety matter more here than browser support.',
      },
    },
  ],
};

const lesson: Lesson = {
  id: 'api-styles',
  module: 'm1',
  order: 6,
  title: 'APIs: REST, GraphQL, gRPC',
  idea: 'Three styles of [[application programming interface|api]] (API) cover most systems: [[REST|rest]] (representational state transfer) for simple, cacheable resources, [[GraphQL|graphql]] for screens that need exactly their data, and [[gRPC|grpc]] for fast calls between services.',
  minutes: 15,
  prerequisites: ['http-essentials'],
  outcomes: [
    'Design a clean REST interface: resource names, methods, pagination and versions.',
    'Make retries safe with idempotent operations and idempotency keys.',
    'Pick REST, GraphQL or gRPC for a given caller, and defend the choice.',
  ],
  analogy: {
    title: 'A fixed menu vs. a build-your-own plate vs. a kitchen intercom',
    body: 'A fixed menu is easy: every dish has a number, everyone knows how to order, and the kitchen can prepare popular dishes ahead. But dish 12 always comes with fries, wanted or not, and soup plus a salad means two separate orders.\n\nAt a build-your-own counter, you name exactly what goes on your plate, all in one order. Behind the scenes, the cooks talk over an intercom in a terse shorthand only they understand, which is fast precisely because both ends know the code.',
  },
  whyItMatters:
    'Snapgram is splitting into a few internal services, and three kinds of callers now want its data. Printing partners want a public API they can learn in an afternoon. The mobile profile screen needs a name, an avatar, a follower count and the first photos, and from Singapore every extra request costs another ocean round trip.\n\nMeanwhile, the feed service calls the profile service thousands of times a second. And the photo grid’s “load more” shows the same photos twice whenever someone posts while Maya scrolls. One style will not serve them all equally well.',
  body: [
    {
      kind: 'prose',
      md: 'An API is a contract: the operations you may ask for, how to ask, and what comes back. Most web APIs run over the [[Hypertext Transfer Protocol|http]] (HTTP), in one of three common styles. Start with the one every public API speaks.',
    },
    { kind: 'heading', text: 'REST: resources and methods' },
    {
      kind: 'prose',
      md: 'REST models everything as a [[resource|api-resource]], a thing with its own address, such as a photo or a user, and acts on it with the standard HTTP methods. Name resources with plural nouns, let the method be the verb, and nest related things under their owner: Maya’s photos live at `/v1/users/42/photos`. Each address and method pair is an [[endpoint|endpoint]].\n\nResponses are usually [[JSON|json]] (JavaScript Object Notation) over plain HTTP, so every language and tool can call a REST API. A `GET` can also be cached by browsers and [[content delivery networks|cdn]] (CDNs) at no extra cost.',
    },
    {
      kind: 'annotated',
      title: 'Part of Snapgram’s public API',
      caption: 'Nouns in paths, verbs from the methods, and a version prefix.',
      lines: [
        { code: 'GET    /v1/users/42', note: 'Read one user.' },
        { code: 'GET    /v1/users/42/photos?limit=30', note: 'List a user’s photos, one page at a time.' },
        { code: 'POST   /v1/photos', note: 'Upload a photo. Returns `201 Created` and the new photo’s address.' },
        { code: 'PUT    /v1/photos/123/likes/me', note: 'Like a photo. Repeating it changes nothing, so retries are safe.' },
        { code: 'DELETE /v1/photos/123/likes/me', note: 'Unlike it. Also safe to repeat.' },
        { code: 'GET    /v1/getPhotosForUser?id=42', note: 'Avoid: a verb in the path, when the method is already the verb.' },
      ],
    },
    { kind: 'heading', text: 'Pages: offset or cursor' },
    {
      kind: 'prose',
      md: 'A user with 5,000 photos cannot come back in one response, so lists use [[pagination|pagination]]. [[Offset pagination|offset-pagination]] says “skip 60, return 30” and lets users jump to any page, but the database still walks past every skipped row, and a new post shifts everything by one, which is exactly Snapgram’s duplicate-photo bug.\n\n[[Cursor pagination|cursor-pagination]] fixes both. Each page comes back with a cursor, an opaque bookmark for the last item returned, and the next request asks for the items after it. The database jumps straight there using an [[index|index]], and new posts cannot shift the page.',
    },
    {
      kind: 'sequence',
      title: 'Cursor pagination for the photo grid',
      caption: 'Two pages of Maya’s profile, with new photos posted in between. Use Play, or the arrow keys.',
      spec: cursorPages,
    },
    { kind: 'heading', text: 'Safe retries' },
    {
      kind: 'prose',
      md: 'Networks fail halfway: the request reached the server, but the response never came back, so the app cannot tell whether the like was saved. The safe move is to retry, which only works if operations are [[idempotent|idempotent]]: doing them twice has the same effect as doing them once. `GET`, `PUT` and `DELETE` are idempotent by definition, which is why Snapgram likes a photo with `PUT .../likes/me` rather than a `POST`.\n\nA print order cannot be made naturally idempotent, so the client attaches an [[idempotency key|idempotency-key]], a unique identifier (ID) for that one attempt, and the server returns the stored result for any retry with the same key. [Stripe’s API](https://docs.stripe.com/api/idempotent_requests) works this way: its `POST` requests accept an `Idempotency-Key` header, and retries with the same key return the saved response.',
    },
    { kind: 'heading', text: 'Versions: change without breaking' },
    {
      kind: 'prose',
      md: 'Partners’ apps will call Snapgram for years, and nobody can update their code for them. Adding a field is safe, because old clients ignore what they do not read, but removing, renaming or retyping one is a [[breaking change|breaking-change]]. [[API versioning|api-versioning]] puts breaking changes in a new version, such as `/v2/photos`, while `/v1` keeps working.\n\n[Stripe](https://stripe.com/blog/api-versioning) names its versions by release date, pins a new account to the newest version on its first request, and lets a single request ask for another version with a `Stripe-Version` header. Its engineers wrote in 2017 that they had kept compatibility with every version of their API since 2011.',
    },
    { kind: 'heading', text: 'GraphQL: exactly what the screen needs' },
    {
      kind: 'prose',
      md: 'With REST, the profile screen needs three requests (the user, the follower count and the photos), and each returns fields the screen never shows. That is [[under-fetching|under-fetching]] and [[over-fetching|over-fetching]] at once, and if the app sends the requests one after another, each costs an ocean round trip from Singapore.\n\nGraphQL turns this around. The server publishes an [[API schema|api-schema]], a typed description of every object and field, and the client sends one query naming exactly the fields it wants, across related objects.',
    },
    {
      kind: 'code',
      code: 'query {\n  user(handle: "maya") {\n    name\n    avatarUrl\n    followerCount\n    photos(first: 12) {\n      id\n      thumbnailUrl\n    }\n  }\n}',
      caption: 'One query for the whole profile screen. The response has exactly this shape and nothing more.',
    },
    {
      kind: 'prose',
      md: 'The flexibility has a price. Queries usually go to a single endpoint as a `POST`, so ordinary HTTP caching stops working, and one deeply nested query can ask for an enormous amount of data, so servers cap query depth and cost.',
    },
    { kind: 'heading', text: 'gRPC: fast calls between services' },
    {
      kind: 'prose',
      md: 'Inside the data center, speed and strict contracts matter more than being friendly to browsers. gRPC is a [[remote procedure call|rpc]] (RPC) framework from Google: the feed service calls `GetProfile(42)` as if it were a local function. Messages are encoded with [[Protocol Buffers|protocol-buffers]], a compact binary format, and travel over HTTP/2 with many calls sharing one connection.\n\nCode for both sides is generated from one shared definition file, so a mismatched field fails at build time, not in production. The catch: browsers cannot call gRPC directly, and binary messages are hard to read when debugging.',
    },
    {
      kind: 'diagram',
      title: 'One profile screen, one round trip',
      caption: 'GraphQL at the edge, gRPC inside. Use Play, or the arrow keys.',
      spec: profileFlow,
    },
    { kind: 'heading', text: 'Which style when' },
    {
      kind: 'table',
      columns: ['Aspect', 'REST', 'GraphQL', 'gRPC'],
      rows: [
        ['A request is', 'A method on a resource path', 'One query listing the fields', 'A call to a typed function'],
        ['Data travels as', 'JSON text, usually', 'JSON shaped like the query', 'Binary Protocol Buffers'],
        ['Caching', 'Easy, with plain `GET`', 'Hard, since queries go as `POST`', 'Up to your own code'],
        ['Called from browsers', 'Yes', 'Yes', 'Only through a proxy'],
      ],
      caption: 'How the three styles work. Many systems use all three, each where it fits.',
    },
    {
      kind: 'decision',
      title: 'Which API style?',
      caption: 'Answer one or two questions about who calls the API.',
      tree: whichStyle,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real APIs also need authentication, rate limits, error formats and documentation. GraphQL and gRPC have many more features than shown here, and services can also talk through events instead of calls, which later lessons cover.',
    },
  ],
  tradeoffs: {
    caption: 'What each style makes easy, and what it makes hard.',
    rows: [
      {
        option: 'REST',
        goodAt: 'Familiar to every developer, works with every tool, and `GET` responses cache easily.',
        badAt: 'Fixed response shapes over-fetch, and complex screens need several requests.',
        pickWhen: 'Public and partner APIs, and simple resources.',
      },
      {
        option: 'GraphQL',
        goodAt: 'Each screen gets exactly the fields it needs, across resources, in one round trip.',
        badAt: 'Harder to cache, and one costly query can overload the database unless you cap it.',
        pickWhen: 'Your own apps have many screens that combine data from several places.',
      },
      {
        option: 'gRPC',
        goodAt: 'Fast, compact calls with generated code, strict contracts and streaming.',
        badAt: 'Browsers cannot call it directly, and binary traffic is hard to inspect.',
        pickWhen: 'Your own services call each other at high volume.',
      },
    ],
  },
  realWorld: {
    title: 'GitHub runs a REST API and a GraphQL API side by side',
    body: 'GitHub offers both styles over the same data, and its documentation compares them. To get the login names of ten of your followers and of ten followers of each of them, the REST API needs 11 requests: one for your followers, then one per follower, each returning extra data you did not ask for. A single GraphQL query returns exactly those names, in a response that mirrors the shape of the query.\n\nGitHub notes that fewer requests and less data make GraphQL appealing for mobile apps, while some developers are more comfortable with REST because it has been around longer. Its advice matches this lesson: use the one that fits your needs, and you do not have to use only one.',
    sourceUrl: 'https://docs.github.com/en/rest/about-the-rest-api/comparing-githubs-rest-api-and-graphql-api',
    sourceLabel: 'GitHub Docs, “Comparing GitHub’s REST API and GraphQL API”',
  },
  interview: {
    whenToMention:
      'In the API step, right after requirements. Name the style and the reason in one sentence, then write a few endpoints with methods, paths and pagination. Mention idempotency for anything a client might retry, and versioning if outside developers will call it.',
    sayItLikeThis: [
      'The public API is REST: GET /v1/users/{id}/photos with cursor pagination, and PUT /v1/photos/{id}/likes/me for likes, which is idempotent, so retries are safe.',
      'Internally, services call each other over gRPC for speed and typed contracts. If the mobile screens need many resources at once, I’d add a GraphQL layer in front of those services.',
    ],
    followUps: [
      {
        q: 'Why cursor pagination instead of offset?',
        a: 'Offset makes the database walk past every skipped row, so deep pages get slow, and new items shift the pages, so users see duplicates. A cursor marks the last item seen, so the next query jumps straight there and stays stable. Offset is still fine for small lists where users want to jump to page 7.',
      },
      {
        q: 'How do you make creating an order safe to retry?',
        a: 'The client generates an idempotency key and sends it with the request. The server stores the result of the first request under that key and returns the same result for any retry, so a timeout never creates a second order.',
      },
      {
        q: 'How would you change a field that partners depend on?',
        a: 'Not in place. Add the new field alongside the old one, and ship the removal of the old one in a new version while the old version keeps working. Announce a retirement date and watch traffic on the old version before turning it off.',
      },
    ],
    redFlags: [
      'Verbs in REST paths, such as `/getPhotos` or `/createUser`.',
      'Choosing GraphQL or gRPC because it is newer, without naming the problem it solves.',
      'Offset pagination on an endless, fast-changing feed.',
      'Retrying a payment with no idempotency key.',
    ],
  },
  mistakes: [
    '**Unbounded lists.** An endpoint that returns all of a user’s photos works with 20 and times out with 20,000. Paginate from day one.',
    '**Breaking clients in place.** Renaming a field in the current version breaks every app that reads it. Add fields freely and remove them only in a new version.',
    '**Unsafe retries.** Retrying a `POST` that is not idempotent after a timeout can double an order or a payment.',
    '**GraphQL without limits.** One deeply nested query can request millions of records, so cap query depth and cost.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Which is the best REST endpoint for listing a user’s photos?',
      options: [
        {
          text: '`GET /v1/users/42/photos`',
          correct: true,
          why: 'A plural noun nested under its owner, with the method as the verb and a version prefix.',
        },
        {
          text: '`GET /v1/getUserPhotos?user=42`',
          correct: false,
          why: 'The verb in the path repeats what GET already says and hides the resource structure.',
        },
        { text: '`POST /v1/photos/list`', correct: false, why: 'Reading with POST gives up caching and the safety of GET.' },
        { text: '`DELETE /v1/users/42/photos`', correct: false, why: 'DELETE would remove the photos instead of listing them.' },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Snapgram’s photo grid uses offset pagination. What goes wrong as the app grows?',
      options: [
        {
          text: 'New posts shift the pages, so users see some photos twice',
          correct: true,
          why: 'Every new photo pushes the rest down by one, so the next offset repeats an item.',
        },
        {
          text: 'Deep pages get slow, because the database walks past every skipped row',
          correct: true,
          why: 'Skipping 10,000 rows still means reading them.',
        },
        {
          text: 'Users can no longer jump to a page number',
          correct: false,
          why: 'Jumping is what offset pagination does well; cursors are the ones that cannot jump.',
        },
        {
          text: 'The responses can no longer be cached',
          correct: false,
          why: 'Offset pages are ordinary GET requests and cache like any other.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'Snapgram’s profile screen shows a user, their follower count and 12 photos, and the team redesigns it every few months. Which style fits the app best?',
      options: [
        {
          text: 'GraphQL',
          correct: true,
          why: 'One query fetches exactly what the screen shows in one round trip, and the app team can change it without new endpoints.',
        },
        {
          text: 'REST, with one endpoint per resource',
          correct: false,
          why: 'It works, but the screen needs several requests, and each costs a round trip from Singapore.',
        },
        {
          text: 'A custom REST endpoint for each screen design',
          correct: false,
          why: 'Every redesign then waits for new server code, and old endpoints pile up.',
        },
        {
          text: 'gRPC from the app to each service',
          correct: false,
          why: 'gRPC shines between services. The app would still make several calls, and browsers cannot call it directly.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'A print order times out, and the app retries. Put the steps of a safe retry in order.',
      items: [
        'The app creates a unique idempotency key for the order',
        'The app sends the order with the key, and the response is lost',
        'The app retries with the same key',
        'The server finds the key and returns the stored result',
        'Maya is charged exactly once',
      ],
      why: 'The key exists before the first attempt and is reused on every retry, so the server recognizes the retry and returns the first result instead of placing a second order.',
    },
    {
      kind: 'single',
      prompt: 'Which change to Snapgram’s public API is safe without a new version?',
      options: [
        { text: 'Adding a new field to the photo response', correct: true, why: 'Old clients ignore fields they do not read, so nothing breaks.' },
        { text: 'Renaming `likes` to `likeCount`', correct: false, why: 'Every client that reads `likes` breaks.' },
        { text: 'Changing `likes` from a number to text', correct: false, why: 'Clients that add up or compare like counts break.' },
        { text: 'Removing the `caption` field', correct: false, why: 'Every client that shows captions breaks.' },
      ],
    },
  ],
  takeaways: [
    'REST fits public APIs and simple resources, GraphQL fits screens that combine many resources, and gRPC fits fast calls between services.',
    'Name resources with nouns, paginate lists with cursors, and make retries safe with idempotent methods or idempotency keys.',
    'Version from day one: add fields freely, and put breaking changes in a new version.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Slow work.** For jobs that take minutes, such as building a photo book, return `202 Accepted` with a link to a job resource the client can check, instead of holding the request open.',
    },
    {
      kind: 'prose',
      md: '**The N+1 trap in GraphQL.** A naive server fetches each photo’s author with its own query, one per photo. Batching loaders gather those lookups and run one query per type instead.',
    },
    {
      kind: 'prose',
      md: '**Streaming in gRPC.** Besides one request and one response, gRPC can stream messages from the server, from the client, or both ways at once over a single HTTP/2 connection.',
    },
  ],
  flashcards: [
    {
      front: 'When does REST fit best?',
      back: 'Public and partner APIs and simple resources: it is familiar, works everywhere, and GET responses cache well.',
    },
    {
      front: 'What problem does GraphQL solve?',
      back: 'Over- and under-fetching: each screen asks for exactly the fields it needs, across resources, in one request.',
    },
    {
      front: 'Why use gRPC between services?',
      back: 'Compact binary messages over HTTP/2, generated code and strict contracts make calls fast and safe.',
    },
    {
      front: 'Offset or cursor pagination: what is the difference?',
      back: 'Offset skips a number of items: simple, but slow on deep pages and unstable when items are added. A cursor continues after the last item seen, so it stays fast and stable.',
    },
    {
      front: 'How do you make a retry safe?',
      back: 'Use an idempotent operation such as PUT or DELETE, or send an idempotency key so the server can return the first result again.',
    },
    {
      front: 'What is a breaking change?',
      back: 'A change that makes existing clients fail, such as removing, renaming or retyping a field. Ship it in a new version.',
    },
    {
      front: 'How should REST paths be named?',
      back: 'With plural nouns nested under their owner, and the HTTP method as the verb: GET /v1/users/42/photos.',
    },
  ],
  related: ['http-essentials', 'reverse-proxies-gateways', 'idempotency', 'service-communication', 'api-and-data-model'],
  glossaryTerms: [
    'api',
    'rest',
    'graphql',
    'grpc',
    'http',
    'api-resource',
    'endpoint',
    'json',
    'cdn',
    'pagination',
    'offset-pagination',
    'cursor-pagination',
    'index',
    'idempotent',
    'idempotency-key',
    'breaking-change',
    'api-versioning',
    'under-fetching',
    'over-fetching',
    'api-schema',
    'rpc',
    'protocol-buffers',
  ],
};

export default lesson;
