import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** The resolution chain: three caches miss, the resolver walks the hierarchy, then a neighbor hits the shared cache. */
const chain: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'browser', type: 'client', label: 'Browser', sublabel: 'browser cache', x: 0, y: 1 },
    { id: 'os', type: 'client', label: 'Operating system', sublabel: 'device cache', x: 1, y: 1 },
    { id: 'resolver', type: 'dns', label: 'Resolver', sublabel: 'shared cache', x: 2, y: 1 },
    { id: 'root', type: 'dns', label: 'Root server', x: 3, y: 0 },
    { id: 'tld', type: 'dns', label: '.com TLD server', x: 3, y: 1 },
    { id: 'auth', type: 'dns', label: 'Authoritative', sublabel: 'snapgram.com', x: 3, y: 2 },
    { id: 'neighbor', type: 'client', label: 'Neighbor’s phone', sublabel: 'same resolver', x: 2, y: 2 },
  ],
  edges: [
    { id: 'browser-os', from: 'browser', to: 'os', kind: 'sync' },
    { id: 'os-resolver', from: 'os', to: 'resolver', kind: 'sync' },
    { id: 'resolver-root', from: 'resolver', to: 'root', kind: 'sync' },
    { id: 'resolver-tld', from: 'resolver', to: 'tld', kind: 'sync' },
    { id: 'resolver-auth', from: 'resolver', to: 'auth', kind: 'sync' },
    { id: 'neighbor-resolver', from: 'neighbor', to: 'resolver', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya types snapgram.com. Her browser checks its own cache first, but its saved answer has expired: a miss.',
      focus: ['browser'],
      notes: [{ target: 'browser', text: 'miss', tone: 'alert' }],
    },
    {
      caption: 'The browser asks the operating system, which keeps a cache for every app on the phone. Another miss.',
      flow: [{ edge: 'browser-os', tag: 'miss' }],
    },
    {
      caption: 'The operating system asks the **resolver**. Its cache has nothing for snapgram.com either, so it must look the name up.',
      flow: [{ edge: 'os-resolver', tag: 'miss' }],
    },
    {
      caption:
        'The resolver walks the hierarchy. The **root server** points to the .com servers, they point to Snapgram’s authoritative server, and that server answers `203.0.113.50`.',
      flow: ['resolver-root', '<resolver-root', 'resolver-tld', '<resolver-tld', 'resolver-auth', { edge: 'resolver-auth', reverse: true, tag: '203.0.113.50' }],
    },
    {
      caption:
        'The answer travels back, and each cache on the way keeps a copy for as long as the record’s TTL allows. A full walk can add around 100 ms (ballpark); a cached answer takes a few milliseconds or less.',
      flow: ['<os-resolver', '<browser-os'],
      notes: [
        { target: 'resolver', text: 'cached', tone: 'plain' },
        { target: 'browser', text: 'cached', tone: 'plain' },
      ],
    },
    {
      caption: 'A minute later, Maya’s neighbor opens Snapgram through the same resolver. The resolver answers from its cache: a hit, with no trip up the hierarchy.',
      add: ['neighbor'],
      flow: [{ edge: 'neighbor-resolver', tag: 'hit' }, '<neighbor-resolver'],
    },
  ],
};

/** Moving to a new server: lower the TTL first, switch, then raise it again. */
const migration: SequenceSpec = {
  actors: [
    { id: 'founders', type: 'client', label: 'Founders' },
    { id: 'auth', type: 'dns', label: 'Authoritative' },
    { id: 'resolver', type: 'dns', label: 'Resolver' },
  ],
  groups: [
    { label: 'Prepare', from: 1, to: 3 },
    { label: 'Switch', from: 4, to: 6 },
    { label: 'Settle', from: 7, to: 7 },
  ],
  messages: [
    {
      from: 'founders',
      to: 'auth',
      label: 'TTL 86400 → 300',
      kind: 'sync',
      caption: 'Monday, two days before the move: the founders lower the record’s TTL from a day to five minutes. Caches holding the old copy keep it until it expires.',
    },
    { from: 'resolver', to: 'auth', label: 'snapgram.com?', kind: 'sync', caption: 'As each cached copy expires, resolvers ask again.' },
    {
      from: 'auth',
      to: 'resolver',
      label: '203.0.113.10, TTL 300',
      kind: 'reply',
      caption: 'Within a day, every copy in the world expires within five minutes of being fetched.',
    },
    {
      from: 'founders',
      to: 'auth',
      label: 'A → 203.0.113.50',
      kind: 'sync',
      caption: 'Wednesday: they point the record at the new server, and keep the old one running just in case.',
    },
    { from: 'resolver', to: 'auth', label: 'snapgram.com?', kind: 'sync', caption: 'No cache holds an answer older than five minutes, so resolvers ask again almost at once.' },
    {
      from: 'auth',
      to: 'resolver',
      label: '203.0.113.50, TTL 300',
      kind: 'reply',
      caption: 'Within about five minutes, nearly every user reaches the new server.',
    },
    {
      from: 'founders',
      to: 'auth',
      label: 'TTL 300 → 3600',
      kind: 'sync',
      caption: 'Once the new server is stable, they raise the TTL to an hour to cut lookups, and switch off the old machine.',
    },
  ],
};

/** One name, different answers by location, and DNS failover. Every edge is a straight line. */
const geo: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'sg', type: 'loadBalancer', label: 'Singapore region', x: 0, y: 0 },
    { id: 'maya', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 1, y: 0 },
    { id: 'res-sg', type: 'dns', label: 'Resolver', sublabel: 'Singapore', x: 2, y: 0 },
    { id: 'auth', type: 'dns', label: 'Authoritative', sublabel: 'GeoDNS', x: 2, y: 1 },
    { id: 'us', type: 'loadBalancer', label: 'Oregon region', x: 0, y: 2 },
    { id: 'user', type: 'client', label: 'Portland user', sublabel: 'Oregon', x: 1, y: 2 },
    { id: 'res-us', type: 'dns', label: 'Resolver', sublabel: 'Oregon', x: 2, y: 2 },
  ],
  edges: [
    { id: 'maya-res', from: 'maya', to: 'res-sg', kind: 'sync' },
    { id: 'res-sg-auth', from: 'res-sg', to: 'auth', kind: 'sync' },
    { id: 'user-res', from: 'user', to: 'res-us', kind: 'sync' },
    { id: 'res-us-auth', from: 'res-us', to: 'auth', kind: 'sync' },
    { id: 'maya-sg', from: 'maya', to: 'sg', kind: 'sync' },
    { id: 'user-us', from: 'user', to: 'us', kind: 'sync' },
    { id: 'maya-us', from: 'maya', to: 'us', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya’s resolver in Singapore asks for snapgram.com. The authoritative server sees a query from Singapore and answers with the Singapore region’s address.',
      flow: ['maya-res', 'res-sg-auth', { edge: 'res-sg-auth', reverse: true, tag: 'Singapore' }, '<maya-res', 'maya-sg'],
    },
    {
      caption: 'A user in Portland asks the same question through a resolver in Oregon, and gets a different answer: the Oregon region.',
      flow: ['user-res', 'res-us-auth', { edge: 'res-us-auth', reverse: true, tag: 'Oregon' }, '<user-res', 'user-us'],
    },
    {
      caption:
        'The Singapore region fails its health checks, so the authoritative server stops handing out its address. Once Maya’s cached answer expires, her next lookup sends her to Oregon: slower, but working.',
      add: ['maya-us'],
      fail: ['sg'],
      flow: ['maya-res', 'res-sg-auth', { edge: 'res-sg-auth', reverse: true, tag: 'Oregon' }, '<maya-res', 'maya-us'],
    },
  ],
};

const lesson: Lesson = {
  id: 'dns',
  module: 'm1',
  order: 3,
  title: 'DNS',
  idea: 'The Domain Name System (DNS) turns names like snapgram.com into Internet Protocol (IP) addresses through a chain of caches and servers, and its answers decide which servers your users reach and how fast a change takes effect.',
  minutes: 15,
  prerequisites: ['life-of-a-request', 'clients-servers-ips-ports'],
  outcomes: [
    'Trace a lookup through the browser, operating system and resolver caches, then the root, top-level domain and authoritative servers.',
    'Choose a [[time to live|ttl]] (TTL) for a record, and explain why you lower it before moving to a new server.',
    'Explain how DNS can send users to a nearby region, and why DNS itself can take a site offline.',
  ],
  analogy: {
    title: 'Your contacts first, then directory assistance',
    body: 'When you want to call a friend, you do not dial from memory. You tap their name and your phone finds the number in your contacts, instantly. If they are not there, you call directory assistance, which may have to check with the local phone company before it can tell you.\n\nOnce you have the number, you save it, so next time is instant again. But numbers change: if your friend switches carriers, your saved number is wrong until you update it. DNS works the same way, with saved answers at every step and a rule for how long each one can be trusted.',
  },
  whyItMatters:
    'The founders buy the [[domain name|domain-name]] snapgram.com and point it at their server, `203.0.113.10`. To keep lookups fast, they give the record a TTL of 24 hours, so resolvers may keep the answer for a full day. Everything works.\n\nSix months later they move Snapgram to a bigger server at `203.0.113.50`, update the record, and leave the old machine running. For hours afterward, some users still reach the old server and see an outdated Snapgram, because their resolvers remember the old address and may keep it for up to a day. Nothing is wrong with the new server; the old answer is simply still cached.',
  body: [
    {
      kind: 'prose',
      md: 'The life of a request showed [[DNS|dns]] in one line: a name goes in, an [[IP address|ip-address]] comes out. This lesson opens the box. Behind every answer sit a chain of caches, a hierarchy of servers, and [[DNS records|dns-record]] that the domain’s owner controls.',
    },
    { kind: 'heading', text: 'The resolution chain' },
    {
      kind: 'prose',
      md: 'A lookup tries the closest [[cache|cache]] first. The browser keeps its own, then asks the operating system, which keeps one for every app on the device. On a miss, the question goes to a [[DNS resolver|dns-resolver]], usually run by the internet provider or a public service, whose cache serves many users at once.\n\nOnly when every cache misses does the resolver walk the hierarchy. A [[root server|root-server]] points it to the [[top-level domain|tld-server]] (TLD) servers for `.com`, and those point it to snapgram.com’s [[authoritative name server|authoritative-server]], which holds the real answer.',
    },
    {
      kind: 'diagram',
      title: 'The resolution chain, with hits and misses',
      caption: 'A lookup that misses every cache, and the next one that does not. Use Play, or the arrow keys.',
      spec: chain,
    },
    { kind: 'heading', text: 'Records: what the answers say' },
    {
      kind: 'prose',
      md: 'The authoritative server answers from records the domain’s owner sets up. Each record has a name, a type, a value and a time to live in seconds. Three types cover most of what you will meet, plus one that ties the hierarchy together:',
    },
    {
      kind: 'table',
      columns: ['Type', 'Maps', 'Example'],
      rows: [
        ['A', 'A name to an IPv4 address', '`snapgram.com` → `203.0.113.50`'],
        ['AAAA', 'A name to an IPv6 address', '`snapgram.com` → `2001:db8::50`'],
        ['[[CNAME|cname]]', 'A name to another name, as an alias', '`photos.snapgram.com` → `snapgram.cdn.example.net`'],
        ['NS', 'A domain to its authoritative servers', '`snapgram.com` → `ns1.dnshost.example`'],
      ],
      caption: 'Common record types. A lookup that meets a CNAME continues with the name it points to.',
    },
    { kind: 'heading', text: 'Caching and the TTL' },
    {
      kind: 'prose',
      md: 'Every answer carries its time to live, and every cache may reuse it until that time runs out. A long TTL, such as a day, means fewer lookups: users get fast answers and the authoritative servers stay quiet. The cost is agility, because after a change some resolvers keep handing out the old answer until their copy expires. That delay is often called [[DNS propagation|dns-propagation]], and the old TTL sets its upper limit.\n\nThe fix for Snapgram’s problem is to plan ahead. At least one old TTL before a move, lower the TTL to a few minutes, so every cache soon holds a short-lived copy. Then switch the record, and within minutes everyone has the new address. Once the move has settled, raise the TTL again.',
    },
    {
      kind: 'sequence',
      title: 'Moving servers without a long tail',
      caption: 'Lower the TTL first, switch, then raise it again.',
      spec: migration,
    },
    { kind: 'heading', text: 'Routing users to a nearby region' },
    {
      kind: 'prose',
      md: 'An authoritative server does not have to give everyone the same answer. With [[GeoDNS|geodns]], it looks at where a query comes from and answers with the address of the nearest [[region|region]]: a resolver in Singapore gets Snapgram’s Singapore servers, and one in Oregon gets the Oregon servers. Latency-based routing works the same way but picks the region with the fastest measured response.\n\nThe same lever handles failures. When [[health checks|health-check]] show a region is down, the authoritative server stops handing out its address, which is called [[DNS failover|dns-failover]]. It is only as fast as the TTL allows, so records used this way get short TTLs, often a minute or a few.',
    },
    {
      kind: 'diagram',
      title: 'One name, different answers',
      caption: 'GeoDNS answers by location and steers users away from a failed region. Use Play, or the arrow keys.',
      spec: geo,
    },
    {
      kind: 'prose',
      md: 'One catch: the authoritative server usually sees the resolver’s address, not the user’s. If Maya used a public resolver whose nearest site was far away, she could be sent to the wrong region. Resolvers that pass along part of the user’s address make the guess better.',
    },
    { kind: 'heading', text: 'When DNS itself fails' },
    {
      kind: 'prose',
      md: 'Every request starts with a lookup, so DNS is a [[single point of failure|single-point-of-failure]] for everything behind it. If your authoritative servers cannot be reached, healthy servers become invisible, which is what happened to Facebook in 2021. Cached answers keep working until their TTL runs out, one argument for TTLs that are not tiny.\n\nThe defense is [[redundancy|redundancy]]. Run several authoritative servers on separate networks, usually through a DNS provider that answers from many locations, and for critical domains, use two providers so that one outage cannot take you offline.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson leaves out other record types, such as those for email, the signatures that protect answers from tampering, and how resolvers choose among several name servers. It also simplifies caching: a resolver usually has the root and `.com` answers cached already, so most cold lookups go straight to the authoritative server.',
    },
  ],
  tradeoffs: {
    caption: 'TTL lengths and DNS strategies, compared.',
    rows: [
      {
        option: 'Long TTL (hours to a day)',
        goodAt: 'Few lookups, fast answers, light load on your DNS servers, and cached answers survive a short DNS outage.',
        badAt: 'A change can take the whole TTL to reach everyone.',
        pickWhen: 'Records rarely change, such as your name servers.',
      },
      {
        option: 'Short TTL (one to five minutes)',
        goodAt: 'Changes and failovers reach users within minutes.',
        badAt: 'More lookups, slightly slower first requests, and less cushion if DNS goes down.',
        pickWhen: 'You are about to migrate, or you use DNS for failover.',
      },
      {
        option: 'GeoDNS or latency-based answers',
        goodAt: 'Users reach a nearby region automatically.',
        badAt: 'Based on the resolver’s location, which may be far from the user, and it costs more.',
        pickWhen: 'You run servers in more than one region.',
      },
      {
        option: 'A second DNS provider',
        goodAt: 'One provider’s outage cannot take your domain offline.',
        badAt: 'Two systems to keep in sync, and two bills.',
        pickWhen: 'Downtime is expensive and DNS is your last single point of failure.',
      },
    ],
  },
  realWorld: {
    title: 'How Wikipedia sends you to a nearby data center',
    body: 'Wikipedia is served from [seven Wikimedia data centers](https://wikitech.wikimedia.org/wiki/Data_centers). Two, in Virginia and Texas, run the application and its databases; the other five, in San Francisco, Amsterdam, Marseille, Singapore and São Paulo, are caching sites. According to Wikimedia’s engineering documentation, its authoritative DNS servers work out roughly where each query comes from and answer with the address of approximately the nearest site.\n\nThe same mechanism takes a site out of service: a DNS configuration change stops sending users there. Wikimedia’s TTLs are commonly five minutes, so most traffic moves within that window, and the documentation notes that a few caches break the rules and hold answers longer.',
    sourceUrl: 'https://wikitech.wikimedia.org/wiki/Global_traffic_routing',
    sourceLabel: 'Wikimedia Foundation, “Global traffic routing,” Wikitech',
  },
  interview: {
    whenToMention:
      'At the start of the high-level design, as the first hop: the client resolves your domain through DNS. Bring it back when the design spans regions, since DNS sends users to the nearest one, and when you discuss failover, since the TTL limits how fast traffic moves. And list it when you name single points of failure, because DNS is one.',
    sayItLikeThis: [
      'Users resolve snapgram.com through DNS. With servers in two regions, I’d use latency-based DNS so each user gets the nearest region’s load balancer.',
      'The regional records are health-checked with a TTL of about a minute, so if a region fails, new lookups move to the healthy one within a few minutes.',
      'Before we migrate, I’d lower the TTL a day ahead, so the switch takes minutes instead of a day.',
    ],
    followUps: [
      {
        q: 'Why not set the TTL to one second, so changes are instant?',
        a: 'Then almost every lookup misses the caches and goes to the authoritative servers, adding latency for users and load on the DNS provider. Some resolvers also enforce a minimum and ignore very low TTLs. A minute or a few is a common balance for records you may need to change quickly.',
      },
      {
        q: 'How does DNS-based routing know where a user is?',
        a: 'Usually it does not: the authoritative server sees the resolver’s address and maps that to a location. Some resolvers pass along part of the user’s address to improve the guess, but a user on a far-away public resolver can still be sent to the wrong region.',
      },
      {
        q: 'Your DNS provider goes down. What happens?',
        a: 'Clients with cached answers keep working until the TTL expires. Everyone else cannot resolve your domain, so healthy servers become unreachable. The fix is redundancy: name servers on separate networks, or a second DNS provider.',
      },
    ],
    redFlags: [
      'Saying the client queries DNS before every request, ignoring the caches.',
      'Planning DNS failover with a 24-hour TTL and expecting a fast switch.',
      'Assuming DNS knows each user’s exact location.',
      'Forgetting that DNS itself can fail.',
    ],
  },
  mistakes: [
    '**Changing a long-TTL record without preparing.** Lower the TTL first, wait out the old value, then change the record.',
    '**Switching off the old server right after the change.** Caches keep sending some users there until the old TTL runs out.',
    '**Tiny TTLs everywhere.** Most lookups then miss the caches, which slows users down and loads your DNS servers for no benefit.',
    '**Relying on one DNS provider.** If it goes down, so does every service behind your domain.',
    '**Expecting DNS to balance load evenly.** Everyone behind one resolver gets the same cached answer, so traffic arrives in lumps.',
  ],
  quiz: [
    {
      kind: 'order',
      prompt: 'Put the steps of a lookup that misses every cache in order.',
      items: [
        'The browser checks its own cache',
        'The operating system checks its cache',
        'The resolver checks its cache',
        'A root server points to the .com servers',
        'A .com server points to the authoritative server',
        'The authoritative server returns the address',
      ],
      why: 'Caches are checked from closest to farthest, because each closer one is faster. Only after every cache misses does the resolver walk down the hierarchy, from the root to the domain’s own servers.',
    },
    {
      kind: 'single',
      prompt: 'Which record type maps a name to an IPv6 address?',
      options: [
        { text: 'AAAA', correct: true, why: 'A records hold 32-bit IPv4 addresses; AAAA, four times the letter, holds addresses four times as long.' },
        { text: 'A', correct: false, why: 'A records hold IPv4 addresses.' },
        { text: 'CNAME', correct: false, why: 'A CNAME points to another name, not to an address.' },
        { text: 'NS', correct: false, why: 'NS records name the authoritative servers for a domain.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram’s record had a TTL (time to live) of 86,400 seconds. After the founders change it, for up to how many hours can a resolver keep handing out the old address?',
      answer: 24,
      unit: 'hours',
      tolerance: 1.1,
      solution: [
        '86,400 seconds ÷ 3,600 seconds per hour = 24 hours.',
        'A resolver that cached the record just before the change may keep it that long.',
        'That is why you lower the TTL well before a planned move.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Next week Snapgram moves to a new IP address. Which steps make the switch fast and safe?',
      options: [
        { text: 'Lower the TTL to a few minutes at least a day before the move', correct: true, why: 'Caches then hold short-lived copies, so the change spreads within minutes.' },
        { text: 'Keep the old server running until the old TTL has passed', correct: true, why: 'Some users will still be sent there, and they should not hit a dead machine.' },
        { text: 'Raise the TTL again once the move is stable', correct: true, why: 'Short TTLs cost lookups, so return to longer caching once the risk has passed.' },
        { text: 'Change the record first and lower the TTL afterward', correct: false, why: 'Caches that already hold the old answer keep it for the old, long TTL.' },
        { text: 'Set the TTL to zero permanently', correct: false, why: 'Caching disappears and every visit pays for a lookup, which slows users down.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Maya, in Singapore, uses a public resolver whose nearest site is in the United States. Snapgram uses GeoDNS based on the resolver’s location. Which region is she most likely sent to?',
      options: [
        { text: 'The United States region', correct: true, why: 'The authoritative server sees the resolver’s address, not Maya’s, so it guesses from the resolver’s location.' },
        {
          text: 'Singapore, because DNS knows where her phone is',
          correct: false,
          why: 'DNS servers do not see the phone’s location; at best a resolver passes along part of her address.',
        },
        { text: 'A random region', correct: false, why: 'GeoDNS answers are deliberate; here they are based on the wrong location.' },
        { text: 'No region, because the lookup fails', correct: false, why: 'The lookup succeeds. It simply returns a far-away address.' },
      ],
    },
  ],
  takeaways: [
    'A lookup checks the browser, operating system and resolver caches first, and walks the root, TLD and authoritative servers only when they all miss.',
    'The TTL trades speed for agility, so lower it before a planned change and raise it again afterward.',
    'DNS can send users to a nearby region and steer them away from a failed one, and it can also take you offline, so run it redundantly.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Anycast.** Root servers and large DNS providers announce the same IP address from many locations, and the network delivers each query to the nearest one. That is how the 13 root server names are answered from hundreds of sites worldwide, and why an attack on one site rarely takes the service down.',
    },
    {
      kind: 'prose',
      md: '**Negative answers are cached too.** If a name does not exist, resolvers cache that “no such name” answer for a time the domain sets. A record created right after someone looked it up can take a little while to appear.',
    },
    {
      kind: 'prose',
      md: '**Lookups usually skip the handshake.** A DNS query and its answer each fit in one small message, so they normally travel over the [[User Datagram Protocol|udp]] (UDP), with no connection setup. The [[Transmission Control Protocol|tcp]] (TCP) is used for large answers. [TCP vs. UDP](lesson:tcp-vs-udp) explains the difference.',
    },
  ],
  flashcards: [
    {
      front: 'In what order does a lookup check caches and servers?',
      back: 'Browser cache, operating system cache, resolver cache; then the resolver asks a root server, a TLD server and the authoritative server.',
    },
    { front: 'What do A, AAAA and CNAME records hold?', back: 'An IPv4 address, an IPv6 address, and an alias that points to another name.' },
    { front: 'What does a DNS record’s TTL control?', back: 'How long resolvers and devices may cache the answer before asking again.' },
    {
      front: 'How do you move to a new IP address without a long tail of old answers?',
      back: 'Lower the TTL at least one old TTL ahead, switch the record, keep the old server up until old copies expire, then raise the TTL.',
    },
    {
      front: 'How can DNS send users to a nearby region?',
      back: 'The authoritative server answers by where the query comes from, usually the resolver’s location, or by measured latency.',
    },
    { front: 'Why is DNS a single point of failure?', back: 'If your authoritative servers cannot be reached, nobody can find your servers, even healthy ones.' },
    { front: 'What limits how fast DNS failover works?', back: 'The TTL: clients keep using cached answers until they expire, so failover records use short TTLs.' },
  ],
  related: ['life-of-a-request', 'clients-servers-ips-ports', 'cdns', 'load-balancers', 'availability-nines', 'multi-region-dr'],
  glossaryTerms: [
    'ttl',
    'domain-name',
    'dns',
    'ip-address',
    'dns-record',
    'cache',
    'dns-resolver',
    'root-server',
    'tld-server',
    'authoritative-server',
    'cname',
    'dns-propagation',
    'geodns',
    'region',
    'health-check',
    'dns-failover',
    'single-point-of-failure',
    'redundancy',
    'udp',
    'tcp',
  ],
};

export default lesson;
