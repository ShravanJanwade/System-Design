import type { ChoiceOption, PracticeItem } from '../types';

/**
 * Pick the tool (blueprint section 10): short requirements, three or four options, and the reasoning
 * behind every option. `flowchartLessonId` points at the lesson whose decision flowchart walks the choice.
 */

const right = (text: string, why: string): ChoiceOption => ({ text, correct: true, why });
const wrong = (text: string, why: string): ChoiceOption => ({ text, correct: false, why });

type Pick = {
  id: string;
  title: string;
  lessonId: string;
  flowchartLessonId?: string;
  /** More than one option is correct. */
  multi?: boolean;
  prompt: string;
  options: ChoiceOption[];
};

function pick({ multi, prompt, options, ...item }: Pick): PracticeItem {
  return { ...item, question: { kind: multi ? 'multi' : 'single', prompt, options } };
}

export const toolItems: PracticeItem[] = [
  /* Databases ------------------------------------------------------- */
  pick({
    id: 'tool-database-store-credit',
    title: 'Moving store credit between accounts',
    lessonId: 'sql-vs-nosql',
    flowchartLessonId: 'sql-vs-nosql',
    prompt:
      'A shop lets customers move store credit to each other. Both balance changes must succeed or fail together, and finance runs reports that join orders, customers and refunds. Which database fits best?',
    options: [
      wrong(
        'A document store',
        'Documents suit data read as one unit, but moving credit touches two customers’ documents. Most document stores make transactions across documents, and joins, harder than a relational database does.',
      ),
      right(
        'A relational database',
        'It runs both balance changes in one [[transaction|transaction]], so a crash cannot leave credit half moved. It also handles joins across tables for the finance reports.',
      ),
      wrong(
        'A key-value store',
        'It fetches one value by key very fast, but it has no joins and usually no transactions across keys. The reports would have to be built somewhere else.',
      ),
      wrong(
        'A wide-column store',
        'It shines at huge write volumes read by partition, not at transactions across rows. Joining orders, customers and refunds would mean copying data by hand.',
      ),
    ],
  }),

  pick({
    id: 'tool-database-chat-history',
    title: 'Storing billions of chat messages',
    lessonId: 'sql-vs-nosql',
    flowchartLessonId: 'sql-vs-nosql',
    prompt:
      'A chat app stores billions of messages and adds tens of thousands every second (ballpark). Almost every read fetches the latest 50 messages of one channel, newest first, and no query joins channels together. Which database fits best?',
    options: [
      wrong(
        'A relational database',
        'It can do this at first, but one server holds every message, and splitting it across machines by hand is hard. Its strengths, joins and transactions, go unused here.',
      ),
      wrong(
        'A graph database',
        'Graph databases answer questions about connections several hops deep. Reading recent messages by channel is a simple lookup, not a walk through a graph.',
      ),
      right(
        'A wide-column store, partitioned by channel',
        'Each channel’s messages sit together sorted by time, so the latest 50 are one fast read from one partition. Writes spread across many nodes as the data grows ([[wide-column store|wide-column-store]]).',
      ),
      wrong(
        'A document store, one document per channel',
        'A channel’s document would grow without limit, and every new message rewrites it. One document per message would work better, but the wide-column layout fits this pattern directly.',
      ),
    ],
  }),

  pick({
    id: 'tool-database-friend-suggestions',
    title: 'Suggesting friends of friends',
    lessonId: 'sql-vs-nosql',
    flowchartLessonId: 'sql-vs-nosql',
    prompt:
      'A social app suggests people you may know: friends of your friends, ranked by how many friends you share, sometimes three hops out. Every question is about connections between people. Which database fits best?',
    options: [
      right(
        'A graph database',
        'A [[graph database|graph-database]] stores people as nodes and friendships as edges, so following links two or three hops out is its everyday work. Each hop follows a pointer instead of running a join.',
      ),
      wrong(
        'A relational database',
        'It can answer with self-joins on a friendships table, but each extra hop adds another join over a huge table. Three hops out gets slow fast.',
      ),
      wrong(
        'A key-value store',
        'It can keep each person’s friend list under one key, but walking several hops means many separate lookups stitched together in your code.',
      ),
      wrong(
        'A wide-column store',
        'It handles huge write volumes read by partition. Questions that wander across many partitions, like friends of friends, are what it does worst.',
      ),
    ],
  }),

  pick({
    id: 'tool-database-product-catalog',
    title: 'A catalog where every product differs',
    lessonId: 'sql-vs-nosql',
    flowchartLessonId: 'sql-vs-nosql',
    prompt:
      'A marketplace sells shoes, laptops and sofas, and each category has its own attributes. A product page loads one product with all its details at once, and sellers add new kinds of attributes every week. Which database fits best?',
    options: [
      wrong(
        'A relational database with a column per attribute',
        'You would end up with thousands of mostly empty columns and a schema change every time sellers add an attribute. It works, but the data fights the table shape.',
      ),
      wrong(
        'A graph database',
        'Graphs answer questions about connections. A product page is one item read whole, which a graph handles no better than a document store.',
      ),
      wrong(
        'A key-value store holding each product as one blob',
        'It is fast to fetch by key, but the store cannot see inside the blob. Filtering by size or brand would have to happen somewhere else.',
      ),
      right(
        'A document store',
        'Each product is one document with whatever fields its category needs, read in a single fetch from a [[document store|document-store]]. New attributes need no [[schema migration|schema-migration]].',
      ),
    ],
  }),

  /* Caching ---------------------------------------------------------- */
  pick({
    id: 'tool-cache-profile-reads',
    title: 'Caching profiles that rarely change',
    lessonId: 'caching',
    flowchartLessonId: 'caching',
    prompt:
      'Profiles are read about 100 times for every edit (ballpark). If someone changes their bio, other people can see the old one for up to a minute. Which caching pattern fits?',
    options: [
      wrong(
        'No cache: read the database every time',
        'A hundred reads per edit is exactly the load a cache takes off the database. Skipping it wastes an easy win.',
      ),
      right(
        'Cache-aside with a TTL (time to live) of about a minute',
        'The app reads the cache first and fills it from the database on a miss ([[cache-aside|cache-aside]]), and the TTL keeps any stale copy to about a minute. It is the simple default for read-heavy data that may be slightly stale.',
      ),
      wrong(
        'Write-through',
        'Writing every edit to the cache and the database together keeps them in step, but edits are rare and slight staleness is fine. The extra write work buys nothing here.',
      ),
      wrong(
        'Write-back',
        'It confirms writes from the cache and saves them to the database later, which suits write-heavy data. A cache crash could lose bio edits, for no gain on read-heavy data.',
      ),
    ],
  }),

  pick({
    id: 'tool-cache-fresh-prices',
    title: 'Prices that must be fresh',
    lessonId: 'caching',
    flowchartLessonId: 'caching',
    prompt:
      'An online shop caches product prices, which are read constantly and changed a few times a day. When a price changes, shoppers must see the new price on their very next page load. Which caching pattern fits?',
    options: [
      wrong(
        'Cache-aside with a one-hour TTL (time to live)',
        'Shoppers could see an old price for up to an hour after a change. That breaks the requirement, unless you also delete the cached entry on every update.',
      ),
      wrong(
        'Write-back',
        'It suits write-heavy data and can lose writes if a cache node crashes. Prices change rarely, and losing a price change is not acceptable.',
      ),
      right(
        'Write-through',
        'Every price change goes to the cache and the database together ([[write-through|write-through]]), so the next read already sees it. Writes are rare, so the extra work is cheap.',
      ),
      wrong(
        'Write-around',
        'Writes skip the cache and go only to the database, so the old cached price stays until it expires. Shoppers see stale prices.',
      ),
    ],
  }),

  pick({
    id: 'tool-cache-view-counters',
    title: 'Counting video views',
    lessonId: 'caching',
    flowchartLessonId: 'caching',
    prompt:
      'A video site counts views: millions of increments a minute, and the counts are read far less often than they are written. If a cache node crashes, losing the last few seconds of increments is acceptable. Which caching pattern fits?',
    options: [
      right(
        'Write-back',
        'Increments land in the cache and are flushed to the database in batches ([[write-back|write-back]]), turning millions of tiny writes into a few large ones. Its risk, losing a few seconds of counts in a crash, is one the requirements accept.',
      ),
      wrong(
        'Write-through',
        'Every increment would also hit the database at once, so it still takes millions of writes a minute. The cache saves nothing on the write path.',
      ),
      wrong(
        'Cache-aside',
        'Cache-aside speeds up reads, but these counters are written far more than they are read. Writes still go straight to the database.',
      ),
      wrong(
        'Write-around',
        'Writes go straight to the database, which is exactly the load you want to avoid. It suits data that is written once and rarely read soon after.',
      ),
    ],
  }),

  pick({
    id: 'tool-cache-eviction-news',
    title: 'What a news cache should evict',
    lessonId: 'caching',
    prompt:
      'A news site caches article pages. Stories are hot for a few hours after they publish, then fade as new ones arrive. When the cache is full, which [[eviction|eviction]] policy keeps the [[hit ratio|hit-ratio]] highest?',
    options: [
      wrong(
        'LFU (least frequently used)',
        'Yesterday’s big story has a huge count from its peak, so it would stay cached long after readers moved on. Fresh stories would be evicted instead.',
      ),
      right(
        'LRU (least recently used)',
        'Recent reads predict the next ones here, so dropping the page untouched for longest removes yesterday’s news first. It is the common default for this kind of traffic.',
      ),
      wrong(
        'FIFO (first in, first out)',
        'It evicts the oldest entry even while it is still busy, such as a breaking story cached early that people are still reading. It ignores how entries are used.',
      ),
    ],
  }),

  /* Queues and streams ------------------------------------------------ */
  pick({
    id: 'tool-stream-order-events',
    title: 'Many teams reading the same events',
    lessonId: 'queues-and-streams',
    prompt:
      'An order service publishes an event for every order. Billing, shipping and analytics each need every event, at their own pace, and a new fraud model must replay the last seven days of orders. Which tool fits?',
    options: [
      wrong(
        'A message queue',
        'A queue hands each message to one consumer and deletes it once processed. Three teams would need three copies, and nothing would be left to replay.',
      ),
      right(
        'An event stream',
        'An [[event stream|event-stream]] keeps events in an ordered log for a set time, and each [[consumer group|consumer-group]] tracks its own position. Every team reads every event, and the fraud model can rewind seven days.',
      ),
      wrong(
        'Direct calls from the order service to each team',
        'The order service would wait on billing, shipping and analytics, and fail whenever one of them is down. Every new reader means changing the order service.',
      ),
      wrong(
        'A database table that each team polls',
        'Polling works at small scale, but every team hits the table over and over. Tracking what each team has already read is left to you.',
      ),
    ],
  }),

  pick({
    id: 'tool-queue-reset-emails',
    title: 'Sending password-reset emails',
    lessonId: 'queues-and-streams',
    prompt:
      'When someone asks for a password reset, the web app should reply at once and send the email in the background. Each email job should go to one worker, failed sends should be retried, and jobs that keep failing should be set aside for someone to inspect. Which tool fits?',
    options: [
      wrong(
        'An event stream',
        'A stream suits many readers replaying one log. Retrying single messages and parking failed ones takes extra work, because a stuck message holds up its partition.',
      ),
      wrong(
        'Sending the email inside the web request',
        'The user waits on the email provider, and a provider outage turns into failed reset requests. Nothing retries a failed send.',
      ),
      right(
        'A message queue',
        'A [[message queue|message-queue]] hands each job to one worker, delivers it again if the worker fails, and moves repeat failures to a [[dead-letter queue|dead-letter-queue]]. That is this job description almost word for word.',
      ),
      wrong(
        'A scheduled job that scans a table every hour',
        'People would wait up to an hour for a reset email. The scan also has to track which rows are done, which a queue does for you.',
      ),
    ],
  }),

  /* API styles ------------------------------------------------------- */
  pick({
    id: 'tool-api-outside-developers',
    title: 'Opening up to outside developers',
    lessonId: 'api-styles',
    flowchartLessonId: 'api-styles',
    prompt:
      'A payments company is opening an API (application programming interface) to thousands of outside developers, who use every language and tool. Responses for common lookups should be easy to cache. Which style fits?',
    options: [
      wrong(
        'GraphQL',
        'GraphQL lets clients pick their fields, which helps your own apps with complex screens. For outside developers it is harder to cache and to protect from very costly queries.',
      ),
      wrong(
        'gRPC',
        'gRPC is fast and strictly typed, but browsers cannot call it directly and many developers’ tools do not speak it. It fits calls between your own services.',
      ),
      right(
        'REST (Representational State Transfer)',
        'Every language and tool can call it with plain web requests, and `GET` responses cache with standard headers. It is the usual choice for public APIs.',
      ),
    ],
  }),

  pick({
    id: 'tool-api-mobile-screens',
    title: 'Screens that combine many resources',
    lessonId: 'api-styles',
    flowchartLessonId: 'api-styles',
    prompt:
      'A team builds its own mobile app, where the home screen shows the user, their orders, recommendations and messages. Screens change every few weeks, and each extra round trip on a mobile network costs hundreds of milliseconds (ballpark). Which API (application programming interface) style fits?',
    options: [
      wrong(
        'REST (Representational State Transfer)',
        'Each resource has its own endpoint, so the home screen needs four requests or a custom endpoint for that one screen. Fixed responses also send fields the screen never shows ([[over-fetching|over-fetching]]).',
      ),
      right(
        'GraphQL',
        'One query fetches exactly the fields the screen needs from several resources in one round trip. Screens can change without a new endpoint each time.',
      ),
      wrong(
        'gRPC',
        'gRPC suits fast calls between your own backend services. Mobile and web clients need extra layers to call it.',
      ),
    ],
  }),

  pick({
    id: 'tool-api-internal-calls',
    title: 'Fast calls between internal services',
    lessonId: 'api-styles',
    flowchartLessonId: 'api-styles',
    prompt:
      'Inside one company, a pricing service is called by 30 other services, about 200,000 times a second in total (ballpark). Teams want strict, versioned contracts and generated client code, and no browser ever calls it. Which style fits?',
    options: [
      right(
        'gRPC',
        'It sends compact binary messages over long-lived connections and generates typed clients from one contract file written in [[Protocol Buffers|protocol-buffers]]. It is built for high-volume calls between your own services.',
      ),
      wrong(
        'REST (Representational State Transfer) with JSON (JavaScript Object Notation)',
        'It works, but text messages are bigger and slower to parse at this volume. Contracts are only as strict as your documentation.',
      ),
      wrong(
        'GraphQL',
        'GraphQL helps clients with many changing screens choose their fields. Service calls with fixed shapes gain little from it and still pay for parsing each query.',
      ),
    ],
  }),

  /* Real-time protocols ---------------------------------------------- */
  pick({
    id: 'tool-realtime-live-scores',
    title: 'Live scores in the browser',
    lessonId: 'real-time-communication',
    prompt:
      'A sports site shows live scores to about a million viewers in their browsers (ballpark). Updates flow only from the server to the viewer, a few times a minute, and viewers never send anything back on that page. Which approach fits best?',
    options: [
      wrong(
        'WebSockets',
        'WebSockets work too, but they open a two-way channel the page never uses. You take on more to run, such as your own reconnect logic, for no gain.',
      ),
      right(
        'Server-sent events',
        'With [[server-sent events|server-sent-events]], one long-lived response streams updates to the browser, which reconnects on its own if the connection drops. One-way updates are exactly what it is for.',
      ),
      wrong(
        'Polling every second',
        'A million viewers asking every second is a million requests a second, and almost all of them find nothing new. Scores change only a few times a minute.',
      ),
      wrong(
        'Webhooks',
        'Webhooks are calls from one server to another server’s address. A viewer’s browser cannot receive them.',
      ),
    ],
  }),

  pick({
    id: 'tool-realtime-team-chat',
    title: 'Chat with typing indicators',
    lessonId: 'real-time-communication',
    prompt:
      'A team chat app sends messages both ways and shows when someone is typing, with updates expected well under a second after they happen. Each person keeps the app open for hours. Which approach fits best?',
    options: [
      wrong(
        'Server-sent events',
        'Events flow only from server to client, so every sent message and typing signal needs a separate request. It fits one-way feeds better.',
      ),
      wrong(
        'Long polling',
        '[[Long polling|long-polling]] works as a fallback, but every update needs a fresh request, and two-way chat doubles the traffic. Delays grow under load.',
      ),
      right(
        'WebSockets',
        'One long-lived [[WebSocket|websocket]] connection carries messages in both directions with very little overhead per message. Chat and typing signals both need that two-way, low-delay channel.',
      ),
      wrong(
        'Polling every five seconds',
        'Messages would show up seconds late, and most requests would come back empty.',
      ),
    ],
  }),

  pick({
    id: 'tool-realtime-merchant-notice',
    title: 'Telling merchants a payment cleared',
    lessonId: 'real-time-communication',
    prompt:
      'A payment platform must tell each merchant’s server when a payment clears, which can take minutes or hours. Merchants do not want to keep a connection open or ask again and again. Which approach fits best?',
    options: [
      wrong(
        'Polling',
        'Merchants would ask for the status again and again for hours, which wastes requests on both sides and still adds delay.',
      ),
      wrong(
        'WebSockets',
        'Each merchant’s server would hold a connection open for hours to receive one event, and reconnect whenever it drops.',
      ),
      wrong(
        'Server-sent events',
        'They stream updates to a client that keeps a connection open, which merchants do not want. They suit browsers watching a live page.',
      ),
      right(
        'Webhooks',
        'With a [[webhook|webhook]], the platform calls the merchant’s registered address the moment the payment clears, so nobody waits on an open connection. Retries with backoff cover a merchant that is briefly down.',
      ),
    ],
  }),

  /* Storage types ---------------------------------------------------- */
  pick({
    id: 'tool-storage-user-photos',
    title: 'Where to keep billions of photos',
    lessonId: 'storage-types',
    prompt:
      'A photo app stores billions of user photos, a few megabytes each, written once and read many times through a content delivery network (CDN). Storage must grow without anyone planning disks. Which storage type fits?',
    options: [
      wrong(
        'Block storage',
        'Block storage is a raw disk attached to one machine and sized up front. It suits databases, not billions of files shared with the world.',
      ),
      wrong(
        'File storage',
        'A shared file system suits folders that several servers mount, but it gets slow and costly at billions of files. A CDN also cannot read from it directly.',
      ),
      right(
        'Object storage',
        '[[Object storage|object-storage]] keeps whole files by key, grows without limit and serves them over plain web requests, which a CDN can cache. It is also the cheapest of the three per gigabyte (ballpark).',
      ),
      wrong(
        'Files saved inside the database',
        'Large files bloat the database, slow its backups and take memory away from real queries. Keep the file in object storage and its address in the database.',
      ),
    ],
  }),

  pick({
    id: 'tool-storage-database-disk',
    title: 'A disk for a self-run database',
    lessonId: 'storage-types',
    prompt:
      'A team runs its own database on a cloud virtual machine. The database needs a disk with fast random reads and writes that survives the machine being replaced. Which storage type fits?',
    options: [
      wrong(
        'Object storage',
        'Objects are read and written whole over the network, at tens of milliseconds per request (ballpark). A database cannot update a few bytes in the middle of a file that way.',
      ),
      right(
        'Block storage',
        '[[Block storage|block-storage]] appears to the machine as a raw disk, with the fast random reads and writes a database expects, and the volume can move to a new machine. It is what databases are built to sit on.',
      ),
      wrong(
        'File storage',
        'A network file system adds latency and locking behavior many databases are not built for. It fits shared folders, not a database’s data files.',
      ),
    ],
  }),

  /* Unique identifiers ------------------------------------------------ */
  pick({
    id: 'tool-ids-sharded-orders',
    title: 'Order numbers across 50 shards',
    lessonId: 'unique-ids',
    prompt:
      'An order system writes to 50 database shards and creates about 50,000 orders a second at peak (ballpark). Each identifier must be unique across all shards, fit in 64 bits, and sort roughly by creation time. Which ID scheme fits?',
    options: [
      wrong(
        'Auto-increment on each shard',
        'Each shard counts from 1 on its own ([[auto-increment|auto-increment]]), so shards hand out the same numbers. Order 1,000 would exist 50 times.',
      ),
      wrong(
        'Random UUIDs (universally unique identifiers)',
        'They are unique without coordination, but they take 128 bits and carry no time order. Random values also scatter inserts across the index.',
      ),
      wrong(
        'A single ticket server',
        'One counter is unique and ordered, but every order waits on it. At 50,000 a second it becomes a bottleneck and a single point of failure.',
      ),
      right(
        'Snowflake IDs',
        'Each server builds identifiers from the time, its own machine number and a counter, so no coordination is needed and they sort roughly by time ([[Snowflake IDs|snowflake-id]]). They fit in 64 bits.',
      ),
    ],
  }),

  pick({
    id: 'tool-ids-offline-notes',
    title: 'Identifiers made offline on phones',
    lessonId: 'unique-ids',
    prompt:
      'A notes app lets people create notes on their phones while offline and syncs them later. Each note needs an identifier the moment it is created, with no server to ask, and the order of identifiers does not matter. Which scheme fits?',
    options: [
      right(
        'Random UUIDs (universally unique identifiers)',
        'Any device can make a [[UUID|uuid]] alone, and 122 random bits make a collision vanishingly unlikely. Order does not matter here, so their randomness costs nothing.',
      ),
      wrong('Auto-increment numbers from the server', 'The phone is offline, so there is no server to hand out the next number.'),
      wrong(
        'Snowflake-style identifiers',
        'Every phone would need its own unique machine number, handed out by a server it cannot reach. Phone clocks also drift, which spoils the time order.',
      ),
      wrong('A ticket server', 'It needs a network call for every new note, which an offline phone cannot make.'),
    ],
  }),

  /* Rate limiting ---------------------------------------------------- */
  pick({
    id: 'tool-rate-limit-bursts',
    title: 'Allowing short bursts',
    lessonId: 'rate-limiting',
    prompt:
      'A public API (application programming interface) allows each [[API key|api-key]] 10 requests a second on average. Apps often send 50 requests at once when a screen opens, then go quiet, and that should be allowed. Which rate-limiting algorithm fits?',
    options: [
      wrong(
        'Fixed window',
        'A one-second window with a limit of 10 rejects most of the burst. Raising the limit lets up to twice that through around each window boundary.',
      ),
      wrong(
        'Sliding window',
        'It removes boundary spikes, but a sliding limit of 10 a second still rejects the burst. It is built for accuracy, not for allowing bursts.',
      ),
      right(
        'Token bucket',
        'A [[token bucket|token-bucket]] refills at 10 tokens a second up to a size of, say, 50, so a quiet client can spend a burst at once while the long-run rate holds. Each client needs only two numbers.',
      ),
      wrong(
        'Leaky bucket',
        'It releases requests at a steady pace, so a burst of 50 waits in line for 5 seconds. That smooths load but punishes the very behavior you want to allow.',
      ),
    ],
  }),

  pick({
    id: 'tool-rate-limit-steady-carrier',
    title: 'Feeding a partner at a steady pace',
    lessonId: 'rate-limiting',
    prompt:
      'Your service forwards text messages to a carrier that rejects anything over 100 messages a second. Your own traffic arrives in spikes, and delaying a message by a few seconds is fine. Which rate-limiting algorithm fits?',
    options: [
      right(
        'Leaky bucket',
        'Messages wait in a line that drains at a fixed 100 a second ([[leaky bucket|leaky-bucket]]), so the carrier sees a steady stream however spiky the input. A few seconds of waiting is the accepted cost.',
      ),
      wrong(
        'Token bucket',
        'A full bucket lets a whole burst through at once, which could push the carrier past 100 a second. Here bursts are the problem, not a feature.',
      ),
      wrong('Fixed window', 'Up to twice the limit can get through around a window boundary, and the carrier would reject the extra.'),
      wrong(
        'No limiter, just retry rejected messages',
        'Retries add load exactly when the carrier is already refusing, and messages fail in bunches.',
      ),
    ],
  }),

  /* Consistency ------------------------------------------------------ */
  pick({
    id: 'tool-consistency-own-edits',
    title: 'Seeing your own edits',
    lessonId: 'consistency-models',
    prompt:
      'A profile service serves reads from replicas that lag the primary by up to a few seconds (ballpark). After editing their bio, users see the old one come back on refresh. Other people seeing the change a few seconds late is fine. Which consistency guarantee fixes this?',
    options: [
      wrong(
        'Strong consistency for every read',
        'It fixes the complaint but makes every read pay for coordination, including reads of other people’s profiles that may be a little stale. That cost buys nothing here.',
      ),
      right(
        'Read-your-writes',
        '[[Read-your-writes|read-your-writes]] means each user always sees their own latest changes, for example by reading from the primary for a short while after they write. Everyone else keeps reading from the replicas.',
      ),
      wrong(
        'Eventual consistency alone',
        'It only promises that replicas catch up in time, which is exactly the behavior users are complaining about.',
      ),
    ],
  }),

  pick({
    id: 'tool-consistency-usernames',
    title: 'No two people get the same username',
    lessonId: 'consistency-models',
    prompt:
      'A sign-up flow lets people claim a username, and two people must never end up with the same one, even if they click at the same moment on different continents. Which consistency level does the claim need?',
    options: [
      wrong(
        'Eventual consistency',
        'Both claims could succeed on different replicas and only clash later, after both people were told the name is theirs.',
      ),
      wrong(
        'Read-your-writes',
        'It only promises that each person sees their own writes. Two different people can still both claim the name.',
      ),
      right(
        'Strong consistency',
        'All replicas agree on one order of claims ([[linearizable|linearizability]]), so the second claim sees the first and fails. A short wait at sign-up is a fair price for that.',
      ),
      wrong(
        'Causal consistency',
        'It keeps related events in order, but two strangers’ claims are not related to each other. Both can succeed.',
      ),
    ],
  }),

  pick({
    id: 'tool-quorum-settings',
    title: 'Choosing quorum sizes',
    lessonId: 'quorums',
    multi: true,
    prompt:
      'A key-value store keeps each item on N = 3 replicas and uses [[quorum|quorum]] reads and writes. Reads must always see the latest confirmed write. Which settings for W (replicas that confirm a write) and R (replicas asked on a read) guarantee that? Pick all that apply.',
    options: [
      right(
        '`W = 2, R = 2`',
        'Two plus two is more than three, so every read overlaps every write in at least one replica. It also keeps working with one replica down.',
      ),
      wrong(
        '`W = 1, R = 2`',
        'One plus two equals three, which is not more than three, so a read can miss the one replica that has the write.',
      ),
      right(
        '`W = 3, R = 1`',
        'Every replica has the write before it is confirmed, so any one replica is up to date. The cost is that one replica down blocks all writes.',
      ),
      wrong(
        '`W = 1, R = 1`',
        'Fast, but a read can easily hit a replica that has not seen the write yet. That is eventual consistency.',
      ),
    ],
  }),

  /* Load balancing and hashing ---------------------------------------- */
  pick({
    id: 'tool-lb-uneven-requests',
    title: 'Requests that take wildly different times',
    lessonId: 'load-balancers',
    prompt:
      'An app’s requests are mixed: most take about 50 ms, but report exports hold a server for 30 seconds or more (ballpark). With round robin, some servers end up buried in exports while others sit idle. Which load-balancing algorithm fits?',
    options: [
      wrong(
        'Round robin',
        'It hands out requests in turn, whatever each server is busy with. That is the problem described.',
      ),
      wrong(
        'Weighted round robin',
        'Weights fix servers of different sizes, not requests of different lengths. Busy servers still get their full turn.',
      ),
      wrong(
        'Hashing by client address',
        'It pins each client to one server, which helps sessions but ignores load. A client running many exports buries its server.',
      ),
      right(
        'Least connections',
        'It sends each new request to the server with the fewest open requests ([[least connections|least-connections]]), so servers busy with exports get fewer new ones. It adapts to uneven work as it happens.',
      ),
    ],
  }),

  pick({
    id: 'tool-lb-mixed-servers',
    title: 'Servers of different sizes',
    lessonId: 'load-balancers',
    prompt:
      'A pool has four large servers and four small ones, and each large server handles about twice the traffic of a small one (ballpark). Requests are short and similar. Which load-balancing algorithm fits?',
    options: [
      wrong('Round robin', 'Each server gets the same number of requests, so the small servers fill up while the large ones still have room.'),
      right(
        'Weighted round robin',
        'Giving large servers a weight of 2 and small ones a weight of 1 sends each its fair share ([[weighted round robin|weighted-round-robin]]). With short, similar requests, a fixed ratio is all you need.',
      ),
      wrong('Hashing by client address', 'Hashing ignores server size and can pile busy clients onto one machine.'),
      wrong('Random choice', 'Random spreads requests evenly on average, which overloads the small servers just as round robin does.'),
    ],
  }),

  pick({
    id: 'tool-hash-cache-nodes',
    title: 'Adding a cache node without mass misses',
    lessonId: 'consistent-hashing',
    prompt:
      'A cache cluster of 10 nodes keeps each key on one node, and it grows to 11 nodes for busy seasons. When a node is added, most keys must stay where they are, or the database gets flooded with misses. How should keys be assigned to nodes?',
    options: [
      wrong(
        'Hash of the key, modulo the number of nodes',
        'Changing the divisor from 10 to 11 moves about 10 of every 11 keys, so nearly every lookup misses at once.',
      ),
      right(
        'Consistent hashing',
        'Nodes and keys sit on a [[hash ring|hash-ring]], and each key belongs to the next node along it ([[consistent hashing|consistent-hashing]]). Adding an 11th node moves only about one key in eleven.',
      ),
      wrong('Round robin', 'It spreads requests, but the same key would land on different nodes, so the cache would rarely hit.'),
      wrong('Least connections', 'It picks the least busy node, which ignores where each key is stored.'),
    ],
  }),

  /* Other building blocks --------------------------------------------- */
  pick({
    id: 'tool-search-product-text',
    title: 'Product search that ranks results',
    lessonId: 'search-inverted-indexes',
    prompt:
      'A shop wants a search box over 5 million products that matches words anywhere in titles and descriptions, ranks the best matches first, and treats “boot” and “boots” as the same word. Which tool fits?',
    options: [
      wrong(
        "A `LIKE '%word%'` query on the products table",
        'A leading wildcard cannot use an index, so every search scans all 5 million rows. There is no ranking or plural handling either.',
      ),
      wrong(
        'A B-tree index on the title column',
        'A [[B-tree|b-tree]] finds values by how they begin, such as titles that start with a word. It cannot find a word in the middle of a description.',
      ),
      right(
        'A search engine built on an inverted index',
        'An [[inverted index|inverted-index]] maps each word to the products that contain it, so a search reads a few short lists instead of every row. [[Stemming|stemming]] and ranking come built in.',
      ),
      wrong('A key-value store keyed by product name', 'It finds an exact name instantly, but it cannot match single words or rank results.'),
    ],
  }),

  pick({
    id: 'tool-architecture-small-team',
    title: 'Architecture for a six-person team',
    lessonId: 'monolith-vs-microservices',
    flowchartLessonId: 'monolith-vs-microservices',
    prompt:
      'A startup with six engineers is building its first product. Requirements change weekly, and nothing yet needs to scale or deploy on its own. How should they structure the code?',
    options: [
      wrong(
        'Microservices, one per feature',
        'Six people would run many services, with network calls, separate deploys and harder debugging, long before any of it pays off.',
      ),
      right(
        'One monolith',
        'One codebase and one deploy keep changes quick for one small team, and calls between parts are plain function calls ([[monolith|monolith]]). Pieces can be split out later, when a real need appears.',
      ),
      wrong(
        'A modular monolith with strict module boundaries',
        'Strict boundaries pay off once several teams share the code. With one team changing everything weekly, that structure can wait.',
      ),
    ],
  }),

  pick({
    id: 'tool-count-unique-visitors',
    title: 'Counting unique visitors cheaply',
    lessonId: 'probabilistic-structures',
    prompt:
      'An analytics product shows how many unique visitors each page had per day, across billions of page views. An error of about 1% is fine, but the memory per page must stay tiny. Which tool fits?',
    options: [
      wrong(
        'An exact set of every visitor',
        'It is exact, but it stores every visitor for every page and day, gigabytes where a sketch needs kilobytes (ballpark).',
      ),
      wrong(
        'A Bloom filter',
        'A Bloom filter tells you whether an item was probably seen before, not how many distinct items there were. Counting with it takes extra tricks and more memory.',
      ),
      right(
        'HyperLogLog',
        'A [[HyperLogLog|hyperloglog]] estimates how many distinct items it has seen, within about 1%, in roughly ten kilobytes (ballpark) however many visitors there are. Sketches from different servers can also be merged.',
      ),
      wrong(
        'A Count-Min Sketch',
        'It estimates how often each item appears, which suits top-k lists. It does not count distinct items.',
      ),
    ],
  }),

  pick({
    id: 'tool-order-across-services',
    title: 'One order across three services',
    lessonId: 'distributed-transactions',
    prompt:
      'Placing an order reserves stock in the inventory service, charges the card in the payment service and books a courier in the shipping service. Each service owns its own database. If the courier booking fails, the stock and the charge must be undone. Which approach fits?',
    options: [
      wrong(
        'Two-phase commit across the three databases',
        '[[Two-phase commit|two-phase-commit]] makes all three commit or none, but every database holds locks while the coordinator waits, and a stuck coordinator stalls them all. Many services and payment providers do not support it at all.',
      ),
      right(
        'A saga with compensating actions',
        'In a [[saga|saga]], each service commits its own step, and a failure triggers [[compensating actions|compensating-action]] such as refunding the charge and releasing the stock. No service holds locks while it waits on the others.',
      ),
      wrong(
        'One shared database for all three services',
        'A single transaction would work, but it ties the services tightly together, which undoes the reason for splitting them.',
      ),
      wrong(
        'Retry the failed step until it succeeds',
        'Retries help with brief glitches, but if no courier is available they never succeed, and the customer stays charged.',
      ),
    ],
  }),
];
