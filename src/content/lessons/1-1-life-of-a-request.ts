import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The signature diagram: one request from Singapore to Oregon and back. */
const journey: DiagramSpec = {
  grid: { cols: 3, rows: 4 },
  nodes: [
    { id: 'browser', type: 'client', label: 'Browser', sublabel: 'Singapore', x: 0, y: 1 },
    { id: 'resolver', type: 'dns', label: 'DNS resolver', x: 1, y: 0 },
    { id: 'root', type: 'dns', label: 'Root server', x: 2, y: 0 },
    { id: 'tld', type: 'dns', label: '.com TLD server', x: 2, y: 1 },
    { id: 'auth', type: 'dns', label: 'Authoritative', sublabel: 'snapgram.com', x: 2, y: 2 },
    { id: 'server', type: 'service', label: 'Web server', sublabel: 'Oregon', x: 1, y: 3 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 3 },
  ],
  edges: [
    { id: 'browser-resolver', from: 'browser', to: 'resolver', kind: 'sync' },
    { id: 'resolver-root', from: 'resolver', to: 'root', kind: 'sync' },
    { id: 'resolver-tld', from: 'resolver', to: 'tld', kind: 'sync' },
    { id: 'resolver-auth', from: 'resolver', to: 'auth', kind: 'sync' },
    { id: 'browser-server', from: 'browser', to: 'server', kind: 'sync' },
    { id: 'server-db', from: 'server', to: 'db', kind: 'sync' },
  ],
  // Phones: the browser on top, its DNS lookups to the right, and the request straight down to the web server.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      browser: { x: 0, y: 0 },
      resolver: { x: 1, y: 0 },
      root: { x: 2, y: 0 },
      tld: { x: 2, y: 1 },
      auth: { x: 2, y: 2 },
      server: { x: 0, y: 3 },
      db: { x: 1, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'Maya taps the link. Before anything can travel, the browser needs Snapgram’s [[IP address|ip-address]] (Internet Protocol address): the number computers use to find each other, like `203.0.113.10`.',
      focus: ['browser'],
    },
    {
      caption:
        'The browser asks a [[DNS resolver|dns-resolver]], usually run by the internet provider. The [[Domain Name System|dns]] (DNS) is the internet’s directory, so the resolver asks a root server, then the .com server, then Snapgram’s own name server, which answers `203.0.113.10`.',
      flow: [
        'browser-resolver',
        'resolver-root',
        '<resolver-root',
        'resolver-tld',
        '<resolver-tld',
        'resolver-auth',
        '<resolver-auth',
        { edge: 'browser-resolver', reverse: true, tag: '203.0.113.10' },
      ],
    },
    {
      caption:
        'Next, a connection. A [[Transmission Control Protocol|tcp]] (TCP) [[handshake|handshake]] makes the link reliable, then a [[Transport Layer Security|tls]] (TLS) handshake sets up encryption. Each one is a full round trip across the ocean.',
      flow: ['browser-server', '<browser-server', 'browser-server', '<browser-server'],
      notes: [{ target: 'browser-server', text: '2 round trips', tone: 'plain' }],
    },
    {
      caption:
        'Now the request itself, written in the [[Hypertext Transfer Protocol|http]] (HTTP): `GET /photo/123`. The web server runs Snapgram’s code, which asks the [[database|database]] for the photo’s details. Both sit in the same data center, so this takes milliseconds.',
      flow: ['browser-server', 'server-db', '<server-db'],
      notes: [{ target: 'server-db', text: '≈ 3 ms', tone: 'plain' }],
    },
    {
      caption:
        'The server answers with the [[status code|status-code]] `200 OK` and the page, written in [[HyperText Markup Language|html]] (HTML). It crosses the ocean back to Maya, and the browser starts drawing.',
      flow: ['<browser-server'],
      focus: ['browser', 'server', 'browser-server'],
    },
    {
      caption:
        'The page mentions a photo, so the browser asks for it over the same open connection. One more round trip, and Maya finally sees the picture, about 760 ms after she tapped.',
      flow: ['browser-server', '<browser-server'],
      focus: ['browser', 'server', 'browser-server'],
      notes: [{ target: 'browser', text: '≈ 760 ms', tone: 'signal' }],
    },
  ],
};

const handshakes: SequenceSpec = {
  actors: [
    { id: 'browser', type: 'client', label: 'Browser' },
    { id: 'server', type: 'service', label: 'Web server' },
  ],
  groups: [
    { label: 'TCP', from: 1, to: 2 },
    { label: 'TLS 1.3', from: 3, to: 4 },
    { label: 'HTTP', from: 5, to: 6 },
  ],
  messages: [
    {
      from: 'browser',
      to: 'server',
      label: 'SYN',
      kind: 'sync',
      caption: 'TCP, part one. The browser sends SYN (short for synchronize): a hello that includes a starting number for counting packets.',
    },
    {
      from: 'server',
      to: 'browser',
      label: 'SYN-ACK',
      kind: 'reply',
      caption: 'The server acknowledges it (ACK) and sends its own starting number. One round trip gone: about 150 ms for Maya.',
    },
    {
      from: 'browser',
      to: 'server',
      label: 'ACK, ClientHello',
      kind: 'sync',
      caption: 'The browser confirms, and in the same message starts TLS by listing the encryption methods it supports.',
    },
    {
      from: 'server',
      to: 'browser',
      label: 'ServerHello, certificate',
      kind: 'reply',
      caption: 'The server picks a method and proves who it is with its certificate. Keys are agreed. Two round trips gone.',
    },
    {
      from: 'browser',
      to: 'server',
      label: 'GET /photo/123',
      kind: 'sync',
      caption: 'Only now can the encrypted request go out.',
    },
    {
      from: 'server',
      to: 'browser',
      label: '200 OK, HTML',
      kind: 'reply',
      caption:
        'The answer arrives after the third round trip: about 450 ms of travel before the first byte of the page, while the server itself worked for about 8 ms.',
    },
  ],
};

const lesson: Lesson = {
  id: 'life-of-a-request',
  module: 'm1',
  order: 1,
  title: 'The life of a request',
  idea: 'Opening a link sets off a relay: your browser finds the server’s address, opens a secure connection, asks for the page and draws the answer, and every leg costs time.',
  minutes: 15,
  prerequisites: [],
  outcomes: [
    'Trace every step between tapping a link and seeing the page, in order.',
    'Explain why distance, not computing, usually decides how long a page takes.',
    'Say how caching and a [[content delivery network|cdn]] (CDN) shorten the trip.',
  ],
  analogy: {
    title: 'Mailing a letter',
    body: 'To send a letter, you first look up your friend’s address, in your own address book or by asking someone who knows. Then the post office carries it across the country, a trip measured in days. Your friend reads it, writes a reply, and the reply makes the same journey back.\n\nLoading a web page works the same way: look up the address, travel there, get an answer, travel back. It all happens in under a second, but most of that second is spent traveling, not reading or writing.',
  },
  whyItMatters:
    'Snapgram is a few weeks old. It runs on a single [[server|server]] in a [[data center|data-center]] in Oregon, and a few hundred people use it. Then Maya, a friend of the founders, writes from Singapore: “Your photo pages take almost a second to load. Everything else on my phone feels instant.”\n\nThe founders check their logs. The server answers each request in about 8 milliseconds. So where does the rest of the second go? To find out, follow one request from Maya’s phone to Oregon and back.',
  body: [
    {
      kind: 'prose',
      md: 'Maya taps a link: `https://snapgram.com/photo/123`. That text is a [[URL|url]] (uniform resource locator), and it packs three answers into one line: how to talk (`https`), which site (`snapgram.com`) and what to ask for (`/photo/123`). Step through the whole journey first; then we will slow down on each leg.',
    },
    {
      kind: 'diagram',
      title: 'The life of a request',
      caption: 'One request from Maya’s phone in Singapore to Snapgram’s server in Oregon and back. Use Play, or the arrow keys.',
      spec: journey,
    },
    { kind: 'heading', text: 'Find the address' },
    {
      kind: 'prose',
      md: 'Computers find each other by number, not by name. DNS connects the two: you ask for the [[domain name|domain-name]] `snapgram.com`, and it answers with an IP address. A full lookup asks a [[root server|root-server]], a [[top-level domain (TLD) server|tld-server]] and the domain’s [[authoritative name server|authoritative-server]] in turn, which can add around 100 milliseconds.\n\nThat would hurt on every request, so every answer is [[cached|cache]]. The browser, the phone’s operating system and the resolver all keep recent answers for as long as the record’s [[time to live|ttl]] (TTL) allows, often minutes to hours. Most lookups are answered from a cache in a few milliseconds or less.',
    },
    { kind: 'heading', text: 'Open a connection' },
    {
      kind: 'prose',
      md: 'With an address in hand, the browser connects. The TCP handshake is a quick exchange, like checking that a phone line works before you start talking, and it makes delivery reliable. The TLS handshake then proves the server really is Snapgram and agrees on encryption keys; it is the S in [[HTTPS|https]] (HTTP over TLS).\n\nNeither handshake does much work. They are slow only because each message has to cross the ocean, and the [[round-trip time|round-trip-time]] between Singapore and Oregon is around 150 milliseconds.',
    },
    {
      kind: 'sequence',
      title: 'Three round trips before the first byte',
      caption: 'Everything that crosses the ocean before Maya sees anything. Count the round trips.',
      spec: handshakes,
    },
    { kind: 'heading', text: 'Ask and answer' },
    {
      kind: 'prose',
      md: 'Once the connection is ready, the browser, the [[client|client]] in this conversation, sends an HTTP request. It names a method (`GET` means “give me”), a path, and a few headers with extra details. The server replies with a [[status code|status-code]], its own headers and a body, here the page’s HTML.',
    },
    {
      kind: 'code',
      code: 'GET /photo/123 HTTP/1.1\nHost: snapgram.com\nAccept: text/html\n\nHTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nContent-Length: 18240\n\n<!doctype html>\n<title>Sunset over the bay</title>\n…',
      caption: 'A simplified request (top) and response (bottom). [HTTP essentials](lesson:http-essentials) covers methods, headers and status codes.',
    },
    {
      kind: 'prose',
      md: 'Inside the data center, things are fast. The **web server** and the **database** are a fraction of a millisecond apart, so even a few queries cost only a few milliseconds. That is why Snapgram’s own logs looked so good: they only measured this part.',
    },
    { kind: 'heading', text: 'Draw the page' },
    {
      kind: 'prose',
      md: 'The browser reads the HTML from top to bottom. When it finds references to more files, such as the photo, a stylesheet and some scripts, it asks for those too, over the connection it already has. That [[connection reuse|keep-alive]] matters, because every new connection would cost two more round trips.',
    },
    { kind: 'heading', text: 'Where the time goes' },
    {
      kind: 'numbers',
      caption: 'Ballpark numbers. Real values vary by network and device; the proportions are what matter.',
      items: [
        { label: 'DNS lookup, nothing cached', value: '≈ 100 ms', note: 'a few ms or less when cached' },
        { label: 'One round trip, Singapore to Oregon', value: '≈ 150 ms' },
        { label: 'One round trip inside a data center', value: '≈ 0.5 ms' },
        { label: 'A simple database query', value: '≈ 1–5 ms' },
        { label: 'Drawing the page', value: '≈ 50 ms', note: 'varies with the device' },
      ],
    },
    {
      kind: 'prose',
      md: 'Add it up for Maya’s first visit. Four ocean round trips (the TCP handshake, the TLS handshake, the page and the photo) cost about 600 milliseconds, and the cold DNS lookup adds about 100 more. The server’s own work, the part Snapgram measured, is about 8 milliseconds. ==Distance, not computing, decides how fast this page feels.==',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real browsers overlap some of these steps: they look up names early, open connections in parallel and fetch many files at once. Newer protocols also save round trips, and [Go deeper](#go-deeper) at the end of this lesson covers them. The order and the costs here are the classic picture, and it is the one interviewers expect you to know.',
    }
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'request-journey',
      preset: { dnsCached: false, cdn: false },
      intro:
        'Now run Maya’s page load yourself. Every hop shows its cost, and the waterfall shows where the time goes. Turn on a DNS cache and a CDN to see what each one saves, then try the challenges.',
    },
  ],
  tradeoffs: {
    caption: 'Ways to shorten the journey, and what each one costs.',
    rows: [
      {
        option: 'Longer DNS TTL',
        goodAt: 'Fewer cold lookups, because resolvers answer from their cache.',
        badAt: 'If you move your servers to new IP addresses, the change takes longer to reach everyone.',
        pickWhen: 'Your servers’ addresses rarely change.',
      },
      {
        option: 'Connection reuse',
        goodAt: 'Later requests skip the TCP and TLS handshakes.',
        badAt: 'Every open connection holds some memory on the server.',
        pickWhen: 'Clients make several requests in a row, which is almost always.',
      },
      {
        option: 'A CDN',
        goodAt: 'Photos, scripts and handshakes are served from a nearby [[edge server|edge-server]].',
        badAt: 'Personal or fast-changing pages still travel to the [[origin server|origin-server]], and it costs money.',
        pickWhen: 'Users are spread out and much of each page is the same for everyone.',
      },
      {
        option: 'Servers in more regions',
        goodAt: 'Even personalized pages are served nearby.',
        badAt: 'Data has to be copied between regions, which adds a lot of complexity.',
        pickWhen: 'Many users are far away and the personalized parts must be fast.',
      },
    ],
  },
  realWorld: {
    title: 'When Facebook could not be found',
    body: 'On October 4, 2021, Facebook’s apps went offline for several hours. According to Meta’s engineering write-up, a routine maintenance command accidentally cut every connection in the backbone network that links its data centers. Facebook’s DNS servers are designed to stop announcing their routes, using the [[Border Gateway Protocol|bgp]] (BGP), when they cannot reach the data centers. So they withdrew them.\n\nFor everyone else, step one of the journey failed. Resolvers around the world could no longer reach the servers that answer for facebook.com, so no browser or app could even begin a connection. Meta notes that its DNS servers were still running; nobody could find them. Every request starts with a lookup, and when the lookup fails, nothing behind it matters.',
    sourceUrl: 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/',
    sourceLabel: 'Meta Engineering, “More details about the October 4 outage” (2021)',
  },
  interview: {
    whenToMention:
      'Two places. Some interviews open with a warm-up: what happens when you type a URL and press Enter. More often, it is the backbone of your high-level design: once the boxes are on the board, walk one request through them, from DNS to the database and back. That proves the design works and shows where the [[latency|latency]] hides.',
    sayItLikeThis: [
      'Let me walk one request through this. The client resolves our domain through DNS, opens a TLS connection to our web servers, and the request reaches an app server that checks the cache before the database.',
      'Most of this page’s latency is distance, not server time. Each round trip to another continent is around 150 milliseconds, so I’d serve photos from a CDN and keep connections open.',
      'On a first visit, a DNS lookup and two handshakes happen before any data moves. Repeat visits skip most of that, because the DNS answer is cached and the connection is reused.',
    ],
    followUps: [
      {
        q: 'Where would you add a CDN, and what would it cache?',
        a: 'In front of static content: photos, scripts and stylesheets, which are the same for every user. An edge near the user keeps copies, so those requests never cross the ocean. Personalized pages still go to the origin, but the CDN can finish the TLS handshake nearby and forward over a connection it keeps open, which saves round trips.',
      },
      {
        q: 'What happens if DNS for your domain stops answering?',
        a: 'Nothing else matters: clients cannot find any server, even healthy ones. Resolvers keep serving cached answers until the TTL runs out, so a short DNS outage may go unnoticed, but a long one takes you offline. Large sites run DNS with more than one provider to avoid that single point of failure.',
      },
      {
        q: 'Why is the first request to a site slower than later ones?',
        a: 'The first request pays for a cold DNS lookup, a TCP handshake and a TLS handshake before any data moves. Later requests reuse the cached DNS answer and the open connection, and the browser may already have the photos and scripts cached.',
      },
    ],
    redFlags: [
      'Skipping DNS or the handshakes, as if the request teleports to the server.',
      'Blaming server code for a slow page without counting network round trips first.',
      'Saying DNS is looked up on every request, ignoring the caches at every level.',
    ],
  },
  mistakes: [
    '**Forgetting round trips.** A handshake that does almost no work still costs a full round trip, about 150 ms across an ocean.',
    '**Optimizing the wrong part.** If the server takes 8 ms of a 760 ms page load, making it twice as fast saves 4 ms.',
    '**Blaming the size of the page.** For small pages, the number of round trips matters far more than the number of bytes.',
    '**Assuming every visit is a first visit.** Cached DNS answers and reused connections make repeat visits much faster.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put the steps of loading `https://snapgram.com/photo/123` in order.',
      items: [
        'Look up snapgram.com in DNS',
        'TCP handshake with the web server',
        'TLS handshake to set up encryption',
        'Send the HTTP request for /photo/123',
        'The server queries the database',
        'The browser draws the page',
      ],
      why: 'The browser cannot connect without an address, cannot encrypt without a connection, and cannot send the request until the connection is secure. The server answers only after it has the data, and the browser can only draw what it has received.',
    },
    {
      kind: 'single',
      prompt: 'What does a DNS lookup give the browser?',
      options: [
        {
          text: 'The IP address of the server for a domain name',
          correct: true,
          why: 'DNS maps names people can remember to the numeric addresses computers use to connect.',
        },
        { text: 'The HTML of the page', correct: false, why: 'The page comes later, from the web server, over HTTP.' },
        { text: 'An encryption key for the connection', correct: false, why: 'Keys are agreed during the TLS handshake, after DNS.' },
        {
          text: 'The fastest route across the internet',
          correct: false,
          why: 'Routers choose the path as packets travel. DNS only says where to go, not how to get there.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'Maya’s phone is about 150 ms away from Snapgram’s server, round trip. Before the page arrives she needs a TCP (Transmission Control Protocol) handshake, a TLS (Transport Layer Security) handshake, and the request and response: one round trip each. Ignoring the DNS (Domain Name System) lookup and server time, how long is that?',
      answer: 450,
      unit: 'ms',
      tolerance: 1.15,
      solution: [
        'Three round trips happen before the page arrives: TCP, TLS, then the request and response.',
        '3 × 150 ms = 450 ms.',
        'The server’s own work, about 8 ms, barely registers.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'A minute later, Maya opens a second Snapgram photo. Which steps can her browser usually skip?',
      options: [
        { text: 'The DNS lookup', correct: true, why: 'The answer is cached for its TTL, so the browser already knows the IP address.' },
        {
          text: 'The TCP and TLS handshakes',
          correct: true,
          why: 'Browsers keep connections open for a while, so the next request reuses the secure connection.',
        },
        { text: 'The HTTP request', correct: false, why: 'A new photo is a new request; the browser still has to ask for it.' },
        { text: 'Drawing the page', correct: false, why: 'The new page still has to be drawn on screen.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Snapgram adds a CDN. Why does Maya’s photo now load faster, even though the server in Oregon has not changed?',
      options: [
        {
          text: 'The photo comes from an edge server near her, so each round trip is short',
          correct: true,
          why: 'Distance is the main cost. An edge in Singapore answers in about 10 ms instead of 150 ms.',
        },
        {
          text: 'The CDN shrinks the photo so less data travels',
          correct: false,
          why: 'Some CDNs can resize images, but for one photo the distance matters far more than the size.',
        },
        {
          text: 'The CDN skips the DNS lookup',
          correct: false,
          why: 'The browser still looks up the name; the answer simply points to a nearby edge.',
        },
        {
          text: 'The CDN makes the database faster',
          correct: false,
          why: 'The database is untouched. The photo never needs it, because the edge already has a copy.',
        },
      ],
    },
  ],
  takeaways: [
    'A page load is a relay: DNS lookup, TCP and TLS handshakes, the HTTP request and response, then drawing the page.',
    'Distance dominates: one round trip across an ocean costs about 150 ms, far more than the server’s own work.',
    'Cached DNS answers, reused connections and nearby servers are the main ways to shorten the trip.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Newer protocols save round trips.** HTTP/2 sends many requests over one connection at the same time instead of one after another. HTTP/3 runs over QUIC, a newer transport built on the User Datagram Protocol (UDP), which folds the transport and encryption handshakes into a single round trip. On a repeat visit, it can sometimes send the request with no handshake wait at all.',
    },
    {
      kind: 'prose',
      md: '**TLS versions matter.** The older TLS 1.2 needed two round trips to set up; TLS 1.3 needs one. Across an ocean, that difference alone is about 150 milliseconds on every new connection.',
    },
    {
      kind: 'prose',
      md: '**Where DNS answers are cached.** In order: the browser’s own cache, the operating system’s cache, then the resolver’s. Only if all three miss does the resolver walk down from the root, and even then it usually has the `.com` servers cached already.',
    },
  ],
  flashcards: [
    {
      front: 'What are the main steps of loading a web page?',
      back: 'DNS lookup, TCP handshake, TLS handshake, the HTTP request and response, then the browser draws the page.',
    },
    { front: 'What does DNS do?', back: 'It translates a domain name like snapgram.com into the IP address of a server.' },
    {
      front: 'In what order does a cold DNS lookup ask servers?',
      back: 'The resolver asks a root server, then the top-level domain server (such as .com), then the domain’s authoritative server.',
    },
    {
      front: 'How many round trips do the TCP and TLS 1.3 handshakes add before the first request?',
      back: 'Two: one for TCP and one for TLS 1.3. With the older TLS 1.2 it was three.',
    },
    { front: 'Ballpark round-trip time between continents? Inside one data center?', back: 'About 150 ms between continents; about 0.5 ms inside a data center.' },
    {
      front: 'Why is a repeat visit faster than the first?',
      back: 'The DNS answer is cached and the open connection is reused, so the lookup and the handshakes are skipped.',
    },
    {
      front: 'What does a CDN change about a page load?',
      back: 'Static content and handshakes are served from an edge server near the user, so those round trips become short.',
    },
  ],
  related: ['dns', 'tcp-vs-udp', 'http-essentials', 'cdns', 'latency-numbers'],
  glossaryTerms: [
    'url',
    'ip-address',
    'dns',
    'dns-resolver',
    'domain-name',
    'root-server',
    'tld-server',
    'authoritative-server',
    'cache',
    'ttl',
    'tcp',
    'tls',
    'handshake',
    'https',
    'round-trip-time',
    'http',
    'client',
    'server',
    'data-center',
    'database',
    'status-code',
    'html',
    'keep-alive',
    'latency',
    'cdn',
    'edge-server',
    'origin-server',
    'bgp',
  ],
};

export default lesson;
