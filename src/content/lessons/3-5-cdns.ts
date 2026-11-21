import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: a pull CDN serving Maya, her friend and a reader in Frankfurt. */
const edgeFlow: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'friend', type: 'client', label: 'Friend’s phone', sublabel: 'Singapore', x: 0, y: 1 },
    { id: 'reader', type: 'client', label: 'Reader’s laptop', sublabel: 'Frankfurt', x: 0, y: 2 },
    { id: 'sg', type: 'cdn', label: 'CDN edge', sublabel: 'Singapore', x: 1, y: 0.5 },
    { id: 'fra', type: 'cdn', label: 'CDN edge', sublabel: 'Frankfurt', x: 1, y: 2 },
    { id: 'origin', type: 'service', label: 'Origin server', sublabel: 'Oregon', x: 2, y: 1 },
  ],
  edges: [
    { id: 'maya-sg', from: 'maya', to: 'sg', kind: 'sync' },
    { id: 'friend-sg', from: 'friend', to: 'sg', kind: 'sync' },
    { id: 'reader-fra', from: 'reader', to: 'fra', kind: 'sync' },
    { id: 'sg-origin', from: 'sg', to: 'origin', kind: 'sync' },
    { id: 'fra-origin', from: 'fra', to: 'origin', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Maya opens a photo. The [[Domain Name System|dns]] (DNS) sends her phone to the nearest edge, in Singapore. That edge has never seen this photo: a [[cache miss|cache-miss]].',
      flow: [{ edge: 'maya-sg', tag: 'miss' }],
    },
    {
      caption: 'In a [[pull CDN|pull-cdn]], the edge now fetches the photo from Oregon, keeps a copy and passes it on. This first view is no faster than before.',
      flow: ['sg-origin', '<sg-origin', '<maya-sg'],
      notes: [{ target: 'sg-origin', text: '≈ 200 ms', tone: 'plain' }],
    },
    {
      caption: 'Later, Maya’s friend opens the same photo. It is a [[cache hit|cache-hit]]: the edge answers in about 10 ms, and Oregon never hears about it.',
      flow: [{ edge: 'friend-sg', tag: 'hit' }, '<friend-sg'],
      notes: [{ target: 'friend', text: '≈ 10 ms', tone: 'signal' }],
    },
    {
      caption: 'A reader in Frankfurt opens it too. Each edge keeps its own copies, so Frankfurt misses once, then serves every later view there by itself.',
      flow: [{ edge: 'reader-fra', tag: 'miss' }, 'fra-origin', '<fra-origin', '<reader-fra'],
    },
    {
      caption:
        'Maya’s feed is personal, so no edge can reuse a copy. The edge passes it through to Oregon over a connection it keeps open, which still spares her the slow handshakes.',
      flow: ['maya-sg', 'sg-origin', '<sg-origin', '<maya-sg'],
      notes: [{ target: 'sg', text: 'not cached', tone: 'plain' }],
    },
  ],
};

/** Origin shielding: three edges miss at once, and the origin sees one request. */
const shield: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'tokyo', type: 'cdn', label: 'CDN edge', sublabel: 'Tokyo', x: 0, y: 0 },
    { id: 'sydney', type: 'cdn', label: 'CDN edge', sublabel: 'Sydney', x: 0, y: 1 },
    { id: 'frankfurt', type: 'cdn', label: 'CDN edge', sublabel: 'Frankfurt', x: 0, y: 2 },
    { id: 'shield', type: 'cdn', label: 'Origin shield', sublabel: 'near Oregon', x: 1, y: 1 },
    { id: 'origin', type: 'service', label: 'Origin server', sublabel: 'Oregon', x: 2, y: 1 },
  ],
  edges: [
    { id: 'tokyo-shield', from: 'tokyo', to: 'shield', kind: 'sync' },
    { id: 'sydney-shield', from: 'sydney', to: 'shield', kind: 'sync' },
    { id: 'frankfurt-shield', from: 'frankfurt', to: 'shield', kind: 'sync' },
    { id: 'shield-origin', from: 'shield', to: 'origin', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'A new photo goes viral. Edges in Tokyo, Sydney and Frankfurt all miss within the same second.',
      flow: [['tokyo-shield', 'sydney-shield', 'frankfurt-shield']],
    },
    {
      caption: 'Instead of three requests reaching Oregon, the shield [[coalesces|request-coalescing]] them and asks once.',
      flow: ['shield-origin', '<shield-origin'],
      notes: [{ target: 'origin', text: '1 request', tone: 'signal' }],
    },
    {
      caption: 'The shield keeps a copy and answers all three edges. Later misses anywhere in the world stop at the shield.',
      flow: [['<tokyo-shield', '<sydney-shield', '<frankfurt-shield']],
    },
  ],
};

const lesson: Lesson = {
  id: 'cdns',
  module: 'm3',
  order: 5,
  title: 'CDNs',
  idea: 'A [[content delivery network|cdn]] (CDN) keeps copies of your files on servers around the world, so each user downloads them from a nearby edge instead of from your faraway origin.',
  minutes: 13,
  prerequisites: ['caching', 'dns'],
  outcomes: [
    'Explain what happens at an edge on a hit and on a miss.',
    'Choose between a pull and a push CDN, and set Cache-Control headers that keep files fresh.',
    'Decide which content belongs on a CDN and which must still go to the origin.',
  ],
  analogy: {
    title: 'Local warehouses for an online store',
    body: 'An online store with one warehouse in Oregon can ship anywhere, but a parcel to Singapore takes a week. So the store rents small warehouses near its customers and stocks them with its best sellers, and most orders now arrive the next day.\n\nThe local warehouses make nothing; they hold copies. When a local shelf lacks something, the warehouse orders it from Oregon and keeps a few for the next customer. And when a product changes, every local shelf holds old stock that has to be swapped.',
  },
  whyItMatters:
    'Snapgram now has about two million daily users, more of them every week in Asia, Europe and South America. Maya opens her feed in Singapore and watches thirty photos appear one at a time, each one sent from Oregon, about 13,000 km away.\n\nThe servers answer in milliseconds, but every [[round trip|round-trip-time]] across the Pacific takes roughly 150 to 200 ms. Snapgram also pays for every byte that leaves Oregon, sending the same popular photo thousands of times a day. Faster servers will not fix this: the photos need to be closer to the people looking at them.',
  body: [
    {
      kind: 'prose',
      md: '[The life of a request](lesson:life-of-a-request) showed that distance decides how fast a page feels, and [Caching](lesson:caching) showed how to stop repeating slow work. A CDN combines the two: it runs [[edge servers|edge-server]] in many cities, and each one is a [[cache|cache]] in front of your [[origin server|origin-server]], the server that holds the real files. ==A CDN is a cache you put near your users.==',
    },
    {
      kind: 'diagram',
      title: 'A pull CDN, step by step',
      caption: 'Three people in two cities open the same photo. Use Play, or the arrow keys.',
      spec: edgeFlow,
    },
    { kind: 'heading', text: 'Pull or push' },
    {
      kind: 'prose',
      md: 'An edge that fetches a file only when someone asks for it is a pull CDN: [[cache-aside|cache-aside]] again, with the **edge** in the app server’s role. A [[push CDN|push-cdn]] works the other way: you upload files ahead of time, so there are no slow first views, but you manage every upload and pay to store files nobody may watch. Push suits big files with predictable demand, like a new video; pull suits nearly everything else.',
    },
    { kind: 'heading', text: 'Telling the edge what to keep' },
    {
      kind: 'prose',
      md: 'The origin labels every response with a [[header|http-header]] called [[Cache-Control|cache-control]], which says what may be cached and for how long: its [[time to live|ttl]] (TTL). Edges and the [[browser cache|browser-cache]] on Maya’s phone both obey it. Each edge files a copy under a [[cache key|cache-key]], usually the file’s full URL (uniform resource locator).',
    },
    {
      kind: 'annotated',
      title: 'Cache-Control on four Snapgram responses',
      lines: [
        { code: 'Cache-Control: public, max-age=31536000, immutable', note: 'A photo or script with a version in its name: any cache may keep it for a year.' },
        { code: 'Cache-Control: public, max-age=60, s-maxage=600', note: 'A popular public profile: browsers keep it a minute, shared caches such as the CDN keep it ten.' },
        { code: 'Cache-Control: no-cache', note: 'The web app’s start page: caches must check with the origin before every reuse.' },
        { code: 'Cache-Control: private, no-store', note: 'Maya’s account page: personal, so nobody may keep a copy.' },
      ],
    },
    { kind: 'heading', text: 'Changing a file that is already everywhere' },
    {
      kind: 'prose',
      md: 'You could [[purge|purge]] the old copies: ask the CDN to delete them at every edge. That is [[cache invalidation|cache-invalidation]] on a global scale; it works, but it takes a while to spread, and then every edge misses at once.',
    },
    {
      kind: 'prose',
      md: 'The better habit is [[cache busting|cache-busting]]: never change a file at the same address. A new version gets a new name, such as `app.3f9a1c.js` with a hash of its contents, and pages point to it. Nobody asks for the old name again, which is why versioned files can safely be cached for a year.',
    },
    { kind: 'heading', text: 'Shielding the origin' },
    {
      kind: 'prose',
      md: 'One new photo can cause a miss at many edges within seconds, each one aimed at Oregon. An [[origin shield|origin-shield]] adds a cache layer in front of the **origin server**, so each file leaves the origin about once.',
    },
    {
      kind: 'diagram',
      title: 'An origin shield',
      caption: 'Three edges miss at the same moment; the origin answers once.',
      spec: shield,
    },
    { kind: 'heading', text: 'What belongs on a CDN' },
    {
      kind: 'prose',
      md: 'Ask one question: is the response the same for everyone? [[Static content|static-content]] such as photos and scripts is, so it belongs at the edge. Personal responses are not, so the edge passes them through, and Maya still gains, because her secure connection ends at the nearby edge.',
    },
    {
      kind: 'table',
      columns: ['Content', 'On the CDN?', 'Why'],
      rows: [
        ['Photos and videos', 'Yes', 'The same bytes for everyone, viewed many times.'],
        ['Scripts, stylesheets and fonts', 'Yes', 'They change only on a release; use versioned names.'],
        ['Popular public pages', 'Briefly', 'Even a few seconds of caching absorbs a burst of views.'],
        ['Feeds, settings and messages', 'No, passed through', 'Personal: a copy made for Maya is wrong for anyone else.'],
        ['Uploads, likes and comments', 'No, passed through', 'Writes must reach the origin.'],
      ],
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real CDNs also compress and resize images, absorb floods of traffic and stack several cache layers in each region. How a phone finds its nearest edge is in [Go deeper](#go-deeper).',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'cdn-map',
      title: 'Edge or origin?',
      caption: 'A schematic map: the grid shows latitude and longitude, not countries. Pick a city, switch the CDN on and off, and compare the ballpark round trips.',
      props: { city: 'singapore', cdn: false, cache: 'hit' },
    },
  ],
  tradeoffs: {
    caption: 'Ways to serve Snapgram’s photos to the whole world.',
    rows: [
      {
        option: 'No CDN',
        goodAt: 'The simplest setup: nothing can go stale.',
        badAt: 'Far-away users wait an ocean round trip per file, and the origin pays for every byte.',
        pickWhen: 'Users are near your servers, or traffic is tiny.',
      },
      {
        option: 'Pull CDN',
        goodAt: 'No upload step; edges cache exactly what people view.',
        badAt: 'The first request at each edge misses, and copies can be stale until they expire.',
        pickWhen: 'Many files with unpredictable popularity. The usual default.',
      },
      {
        option: 'Push CDN',
        goodAt: 'No slow first views.',
        badAt: 'You manage uploads and pay to store files nobody watches.',
        pickWhen: 'Big files with predictable demand, like a video catalog.',
      },
      {
        option: 'Pull CDN with an origin shield',
        goodAt: 'Each file leaves the origin about once.',
        badAt: 'One more hop on every miss, and one more layer to pay for.',
        pickWhen: 'Users are on many continents, or the origin is small.',
      },
    ],
  },
  realWorld: {
    title: 'Netflix pushes its catalog to the edge',
    body: 'Netflix runs its own CDN, called Open Connect. In a 2016 post, Netflix said Open Connect delivers 100% of its video traffic from servers in close to 1,000 locations, and that most members are served from a server inside, or directly connected to, their internet provider’s network.\n\nNetflix does not wait for viewers to ask. Popularity models decide which files go on which server, and files are copied out during off-peak hours, when they do not compete with other traffic. That is a push CDN: a predictable catalog of huge files, in place before anyone presses play.',
    sourceUrl: 'https://about.netflix.com/en/news/how-netflix-works-with-isps-around-the-globe-to-deliver-a-great-viewing-experience',
    sourceLabel: 'Netflix, “How Netflix works with ISPs around the globe to deliver a great viewing experience” (2016)',
  },
  interview: {
    whenToMention:
      'Whenever the design serves files to users in several regions, usually when you draw the read path for photos or video. Say what the CDN caches, for how long, and how updates reach the edges.',
    sayItLikeThis: [
      'Photos never change once uploaded, so I’ll serve them through a pull CDN with versioned names and a one-year `max-age`. The first view in each region warms the edge; later views are local hits.',
      'The feed is personal, so it goes to the origin, but clients still connect to a nearby edge, which keeps the handshakes short.',
    ],
    followUps: [
      {
        q: 'How do you update a file that is already cached at every edge?',
        a: 'Publish the new version under a new name, such as one with a content hash, and point pages at it. The old copies expire without anyone asking for them. Purge only in emergencies, like a photo that must come down now.',
      },
      {
        q: 'What happens if the CDN has an outage?',
        a: 'Traffic falls back to the origin, which suddenly gets every request, much like a cold cache. Protect it with [[rate limiting|rate-limiting]] and spare capacity; some large sites keep a second CDN provider to move traffic to.',
      },
      {
        q: 'How would you serve private photos through a CDN?',
        a: 'With signed links: each address carries an expiry time and a signature, and the edge checks both before serving its cached copy. Anyone without a valid link is refused.',
      },
    ],
    redFlags: [
      'Caching personal responses in a shared cache.',
      'No plan for updating cached files beyond purging everything.',
      'Claiming the CDN speeds up writes and personal pages too.',
    ],
  },
  mistakes: [
    '**Caching personal pages publicly.** A response marked `public` may be handed to the next person who asks. Mark personal responses `private` or `no-store`.',
    '**Overwriting files in place.** A new `logo.png` at the old address leaves stale copies at every edge until they expire.',
    '**Ignoring the cache key.** Tracking parameters make every address unique, so the edge never gets a hit.',
    '**Treating the CDN as storage.** Edges evict files nobody asked for lately, so the origin must keep the real copy.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya’s friends in Singapore have viewed a photo many times. A reader in Frankfurt now opens it for the first time. What happens in a pull CDN?',
      options: [
        {
          text: 'The Frankfurt edge misses, fetches the photo from the origin, keeps a copy and returns it',
          correct: true,
          why: 'Every edge has its own cache. Popularity in Singapore puts no copy in Frankfurt, so the first view there is a miss.',
        },
        {
          text: 'The Frankfurt edge copies the photo from the Singapore edge',
          correct: false,
          why: 'A miss goes toward the origin, perhaps through a shield, not to another edge on the far side of the world.',
        },
        {
          text: 'The reader is sent to the Singapore edge, which already has a copy',
          correct: false,
          why: 'Users go to a nearby edge, not to wherever a copy happens to be. Crossing the world would defeat the purpose.',
        },
        {
          text: 'The request fails until someone uploads the photo to Frankfurt',
          correct: false,
          why: 'That describes a push CDN with a missing file. A pull CDN fetches anything it lacks from the origin.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these should Snapgram serve from the CDN’s cache?',
      options: [
        { text: 'Photo files', correct: true, why: 'The same bytes for every viewer, large, and read many times.' },
        {
          text: 'The versioned script bundle of the web app',
          correct: true,
          why: 'It changes only on a release, and each release gets a new name, so a long lifetime is safe.',
        },
        {
          text: 'Maya’s personal feed',
          correct: false,
          why: 'Every user’s feed is different, so a shared copy would be wrong for everyone else. It passes through to the origin.',
        },
        {
          text: 'A request to like a photo',
          correct: false,
          why: 'Writes must reach the origin. The edge forwards them and never answers them from a cache.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        'A first visit to a photo needs three round trips: two handshakes, then the photo. Maya’s round trip to Oregon is about 200 ms; to the Singapore edge, about 10 ms. If the photo is a hit at the edge, how many milliseconds does the CDN (content delivery network) save on that first visit?',
      answer: 570,
      unit: 'ms',
      tolerance: 1.1,
      solution: ['Without the CDN: 3 × 200 ms = 600 ms.', 'With a hit at the edge: 3 × 10 ms = 30 ms.', 'Saved: 600 − 30 = 570 ms, nearly all of the wait.'],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a pull CDN miss in order.',
      items: [
        'DNS points the phone to the nearest edge',
        'The edge looks up the cache key and finds nothing',
        'The edge requests the file from the origin',
        'The edge keeps a copy and sends the photo to the phone',
        'The next request from nearby is answered by the edge alone',
      ],
      why: 'The phone needs an address before it can ask, and the edge only fetches after a miss. It keeps a copy as the file passes through, so the next request nearby never leaves the city.',
    },
    {
      kind: 'single',
      prompt: 'Snapgram replaces its logo but keeps the address `/logo.png`, served with `Cache-Control: public, max-age=86400`. What do users see?',
      options: [
        {
          text: 'Some see the old logo for up to a day, until their cached copies expire',
          correct: true,
          why: 'For a day, edges and browsers may reuse their copy without asking, and nothing tells them the file changed.',
        },
        {
          text: 'Everyone sees the new logo right away',
          correct: false,
          why: 'Caches cannot know the file changed. Only a new address, or a purge, would make that happen.',
        },
        {
          text: 'Nobody can load the logo until the caches are cleared',
          correct: false,
          why: 'The cached copies still work; they are just out of date.',
        },
        {
          text: 'Edges check with the origin on every request, so only browsers show the old logo',
          correct: false,
          why: 'That is what `no-cache` would do. With `max-age`, edges reuse their copy without asking until it expires.',
        },
      ],
    },
  ],
  takeaways: [
    'A CDN is a cache near your users: edges answer hits locally and send misses to the origin.',
    'Cache-Control sets what may be cached and for how long, and versioned file names make updates instant.',
    'Files that are the same for everyone belong on the CDN, while personal pages and writes go to the origin.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**How a phone finds the nearest edge.** There are two common ways. With DNS-based routing, the CDN’s name servers answer each lookup with the address of an edge near whoever is asking. With anycast, many edges announce the same [[IP address|ip-address]] (Internet Protocol address), and the internet’s routing delivers each request to the closest one.',
    },
    {
      kind: 'prose',
      md: '**Revalidation.** When a cached copy expires, the edge does not have to download it again. It asks the origin whether the file changed, quoting a tag the origin sent with it, and if nothing changed the origin replies `304 Not Modified` with no body. The `stale-while-revalidate` directive goes further: the edge may keep serving the old copy for a short while as it checks in the background.',
    },
    {
      kind: 'prose',
      md: '**Edges do more than cache.** Most CDNs also finish the secure connection at the edge, compress and resize images, and soak up floods of junk traffic before it reaches the origin. Some let you run small programs on the edge itself, which can tailor a response without a trip to the origin.',
    },
  ],
  flashcards: [
    { front: 'What is a CDN?', back: 'A network of edge servers around the world that keep copies of your files close to users, in front of your origin server.' },
    {
      front: 'What is the difference between a pull CDN and a push CDN?',
      back: 'A pull CDN fetches a file from the origin on the first request at each edge. A push CDN has files uploaded to it ahead of time.',
    },
    {
      front: 'What does Cache-Control: public, max-age=31536000, immutable mean?',
      back: 'Any cache, including the CDN, may reuse the response for a year without asking, and it will never change at that address.',
    },
    {
      front: 'What is the difference between no-cache and no-store?',
      back: 'no-cache lets caches keep a copy but makes them check with the origin before each reuse. no-store forbids keeping a copy at all.',
    },
    {
      front: 'How do you update a file that is cached at every edge?',
      back: 'Publish it under a new name, such as one with a content hash, and point pages at it. Purge only in emergencies.',
    },
    { front: 'What does an origin shield do?', back: 'It adds a cache layer between the edges and the origin, so a file missing everywhere is fetched from the origin once.' },
    {
      front: 'Which content belongs on a CDN?',
      back: 'Responses that are the same for everyone: photos, videos, scripts, stylesheets and popular public pages. Personal pages and writes pass through.',
    },
  ],
  related: ['caching', 'dns', 'life-of-a-request', 'storage-types', 'multi-region-dr'],
  glossaryTerms: [
    'cdn',
    'round-trip-time',
    'edge-server',
    'cache',
    'origin-server',
    'dns',
    'cache-miss',
    'pull-cdn',
    'cache-hit',
    'cache-aside',
    'push-cdn',
    'http-header',
    'cache-control',
    'ttl',
    'browser-cache',
    'cache-key',
    'purge',
    'cache-invalidation',
    'cache-busting',
    'origin-shield',
    'request-coalescing',
    'static-content',
    'rate-limiting',
    'ip-address',
  ],
};

export default lesson;
