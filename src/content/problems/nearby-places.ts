import type { DiagramSpec, Problem } from '../types';

/** v1: one app server and one database with an indexed geohash column. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', sublabel: 'phone app', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Places database', sublabel: 'index on geohash', x: 2, y: 0 },
    { id: 'owners', type: 'client', label: 'Business owners', x: 0, y: 1 },
  ],
  edges: [
    { id: 'users-app', from: 'users', to: 'app', kind: 'sync' },
    { id: 'owners-app', from: 'owners', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'An owner adds a café. The **app server** works out the geohash of its location, the name of the map cell it sits in, and stores it in an indexed column of the **places database**, next to the latitude and longitude.',
      flow: ['owners-app', 'app-db', '<app-db', '<owners-app'],
      notes: [{ target: 'db', text: 'w21z73k…' }],
    },
    {
      caption:
        'A user asks for cafés within 1 km. The app server turns their location into every cell the search circle touches, about a dozen six-character cells (ballpark), and runs one range scan of the index per cell.',
      flow: ['users-app', 'app-db', '<app-db'],
      notes: [{ target: 'db', text: 'one scan per cell' }],
    },
    {
      caption:
        'Cells are rectangles and the search is a circle, so the server measures the exact distance to each candidate with the [[haversine formula|haversine-formula]], drops those beyond 1 km, and returns the closest 20.',
      flow: [{ edge: 'users-app', reverse: true, tag: '20 places' }],
    },
  ],
};

/** v2: every search server holds the whole index in memory; details come from a cache. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Details cache', sublabel: 'Redis', x: 2, y: 0 },
    { id: 'search', type: 'service', label: 'Search servers', sublabel: 'geo index in memory', x: 2, y: 1 },
    { id: 'replicas', type: 'sqlDb', label: 'Read replicas', sublabel: 'places database', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-search', from: 'lb', to: 'search', kind: 'sync' },
    { id: 'search-cache', from: 'search', to: 'cache', kind: 'sync' },
    { id: 'search-replicas', from: 'search', to: 'replicas', kind: 'sync', label: 'misses' },
  ],
  steps: [
    {
      caption:
        'At startup, each **search server** reads every place from a **read replica** and builds the whole index in its own memory: 200 million entries of about 100 bytes, roughly 20 GB (ballpark). It is a quadtree, so crowded downtown squares split into small cells and empty land stays in big ones.',
      flow: ['search-replicas', '<search-replicas'],
      notes: [{ target: 'replicas', text: 'read once at startup' }],
    },
    {
      caption:
        'A search arrives through the [[load balancer|load-balancer]]. The server walks the tree to the cells the circle touches, then filters the candidates by category and exact distance and ranks them, all in memory: a few milliseconds (ballpark), with no network hop.',
      flow: ['users-lb', 'lb-search'],
    },
    {
      caption:
        'For the 20 winners, the server fetches their cards (address, hours, photo, price) from the **details cache** in one batched read. A popular place is shown thousands of times for every edit, so most lookups are [[cache hits|cache-hit]].',
      flow: ['search-cache', { edge: 'search-cache', reverse: true, tag: 'hit' }],
    },
    {
      caption:
        'Misses read a replica and copy the card into the cache with a [[time to live|ttl]] (TTL) of an hour, the [[cache-aside|cache-aside]] pattern. Then the results go back to the user.',
      flow: [{ edge: 'search-cache', tag: 'miss' }, 'search-replicas', '<search-replicas', 'search-cache', '<lb-search', { edge: 'users-lb', reverse: true, tag: '20 places' }],
    },
    {
      caption:
        'Need more capacity? Start another search server. Every server holds a full copy, so about 10,000 searches a second at peak (ballpark) is simply a matter of running enough of them, and losing one costs capacity, not data.',
      focus: ['lb', 'search'],
    },
  ],
};

/** v3: edits flow from the database to every copy of the index; snapshots let new servers start fast. */
const v3: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'owners', type: 'client', label: 'Business owners', x: 0, y: 0 },
    { id: 'places', type: 'service', label: 'Places service', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Places database', sublabel: 'leader', x: 2, y: 0 },
    { id: 'search', type: 'service', label: 'Search servers', x: 1, y: 1 },
    { id: 'stream', type: 'stream', label: 'Change stream', sublabel: 'keyed by place', x: 2, y: 1 },
    { id: 'snapshots', type: 'objectStore', label: 'Index snapshots', x: 1, y: 2 },
    { id: 'builder', type: 'worker', label: 'Snapshot builder', x: 2, y: 2 },
  ],
  edges: [
    { id: 'owners-places', from: 'owners', to: 'places', kind: 'sync' },
    { id: 'places-db', from: 'places', to: 'db', kind: 'sync' },
    { id: 'db-stream', from: 'db', to: 'stream', kind: 'async', label: 'each change' },
    { id: 'stream-search', from: 'stream', to: 'search', kind: 'async' },
    { id: 'stream-builder', from: 'stream', to: 'builder', kind: 'async' },
    { id: 'builder-snapshots', from: 'builder', to: 'snapshots', kind: 'sync', label: 'hourly' },
    { id: 'snapshots-search', from: 'snapshots', to: 'search', kind: 'sync' },
  ],
  // Phones: owners on top of the places service; below, the wide layout's two columns, with each change running down.
  narrow: {
    grid: { cols: 2, rows: 4 },
    positions: {
      owners: { x: 0, y: 0 },
      places: { x: 0, y: 1 },
      db: { x: 1, y: 1 },
      search: { x: 0, y: 2 },
      stream: { x: 1, y: 2 },
      snapshots: { x: 0, y: 3 },
      builder: { x: 1, y: 3 },
    },
  },
  steps: [
    {
      caption:
        'An owner moves their café’s pin and changes its hours. The **places service** saves the row on the database leader in one transaction and deletes the café’s card from the details cache, so its page shows the new hours at once.',
      flow: ['owners-places', 'places-db', '<places-db', '<owners-places'],
    },
    {
      caption:
        'Change data capture reads the database’s log and turns each committed change into an event on the **change stream**, keyed by place, so two edits to one café stay in order. At about 10 edits a second (ballpark), this path is tiny.',
      flow: ['db-stream'],
    },
    {
      caption:
        'Every **search server** reads the stream and applies each change to its own index: remove the café from its old cell, add it to the new one. Seconds later, and at most a minute or two (ballpark), every server shows the café in its new place.',
      flow: ['stream-search'],
      notes: [{ target: 'search', text: 'old cell → new cell' }],
    },
    {
      caption:
        'The **snapshot builder** reads the same stream, keeps its own copy of the index, and every hour writes a full copy to **index snapshots**, labeled with the stream [[offset|offset]] it covers.',
      flow: ['stream-builder', 'builder-snapshots'],
    },
    {
      caption:
        'A new or restarted search server loads the latest snapshot, replays the stream from its offset until it has caught up, and only then takes searches. It starts in minutes (ballpark), and the database never sees a full read.',
      flow: ['snapshots-search', 'stream-search'],
    },
  ],
};

/** v4: what each failure does to searches. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'users', type: 'client', label: 'Users', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Details cache', sublabel: 'several nodes', x: 2, y: 0 },
    { id: 'search', type: 'service', label: 'Search servers', sublabel: 'three zones', x: 2, y: 1 },
    { id: 'stream', type: 'stream', label: 'Change stream', x: 2, y: 2 },
    { id: 'leader', type: 'sqlDb', label: 'Places leader', sublabel: 'takes edits', x: 3, y: 0 },
    { id: 'replica', type: 'sqlDb', label: 'Read replica', sublabel: 'serves misses', x: 3, y: 1 },
  ],
  edges: [
    { id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' },
    { id: 'lb-search', from: 'lb', to: 'search', kind: 'sync' },
    { id: 'search-cache', from: 'search', to: 'cache', kind: 'sync' },
    { id: 'search-replica', from: 'search', to: 'replica', kind: 'sync', label: 'misses' },
    { id: 'stream-search', from: 'stream', to: 'search', kind: 'async' },
    { id: 'leader-replica', from: 'leader', to: 'replica', kind: 'replication' },
  ],
  steps: [
    {
      caption:
        'Every tier runs several copies across three [[availability zones|availability-zone]]. Each search server holds its own copy of the index, and the database has a **places leader** for edits and [[read replicas|read-replica]] for card misses.',
      focus: ['leader', 'leader-replica'],
      flow: ['users-lb', 'lb-search', 'search-cache', '<search-cache', '<lb-search', '<users-lb'],
    },
    {
      caption:
        'A search server crashes. The load balancer’s [[health checks|health-check]] stop sending it searches within seconds, the others absorb its share, and a replacement loads the latest snapshot. Users notice nothing, as long as each zone keeps spare capacity.',
      flow: ['users-lb', 'lb-search', '<lb-search', '<users-lb'],
      notes: [{ target: 'lb', text: 'one server removed' }],
    },
    {
      caption:
        'The details cache goes down, and every card lookup reads the replicas: about 10,000 batched reads a second at peak (ballpark). If they struggle, searches return only the fields kept in memory (name, category, rating, distance), which is [[graceful degradation|graceful-degradation]]: plainer results, but results.',
      fail: ['cache'],
      flow: ['users-lb', 'lb-search', 'search-replica', '<search-replica', '<lb-search', '<users-lb'],
      notes: [{ target: 'replica', text: 'every card', tone: 'alert' }],
    },
    {
      caption:
        'The places leader dies. Searches carry on, because they read memory and replicas. Edits pause for the seconds it takes to promote a replica ([[failover|failover]]), and the change stream picks up from the new leader.',
      fail: ['leader'],
      flow: ['users-lb', 'lb-search', '<lb-search', '<users-lb'],
      notes: [{ target: 'replica', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        'The change stream stops. Searches keep working on an index that slowly goes stale, while edits wait safely in the database and flow in once the stream returns. Alert when the index falls more than a few minutes behind.',
      fail: ['stream'],
      flow: ['users-lb', 'lb-search', '<lb-search', '<users-lb'],
    },
  ],
};

const problem: Problem = {
  id: 'nearby-places',
  title: 'Nearby places',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design a “nearby places” service like Yelp: a user opens the app and sees the restaurants, cafés and shops close to where they stand, filtered by what they want. Business owners can add their place and edit its details.',
  concepts: ['back-of-the-envelope', 'indexes', 'geospatial-indexing', 'caching', 'replication', 'replication-lag', 'sharding'],
  hints: [
    'Start with the [[read/write ratio|read-write-ratio]]: how often do places change, compared with how often people search for them? Then ask why an ordinary index on latitude and longitude can’t quickly find everything within 1 km.',
    'Give every place one sortable value that keeps nearby places close together, the name of a map cell, and remember that a place just across a cell’s edge is still near. Then estimate the size of the whole index: does it fit in one machine’s memory?',
    'One shape that works: the places database is the [[source of truth|source-of-truth]]; every search server keeps the whole [[geospatial index|geospatial-index]] in memory, as [[geohash|geohash]] cells or a [[quadtree|quadtree]]; a search reads the cells its circle touches, keeps the places inside the circle and ranks them; details come from a cache; and edits reach every copy through a change stream within a minute or so.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many places are there, and how many searches and edits happen each day?',
      why: 'This sets the scale and the read/write ratio. Assume about 200 million places, 500 million searches and 1 million edits a day (ballpark): 500 searches for every edit, so the design is built around the search path, and edits can take a slower road.',
    },
    {
      q: 'Is a search for everything within a radius, or for the 20 closest places, and how big can the radius be?',
      why: 'A fixed radius, from 500 m to 20 km, maps to a set of cells about that size. The 20 closest, however far away, is a [[nearest-neighbor search|nearest-neighbor-search]] that widens until it has enough results; in the countryside the closest café may be 30 km away.',
    },
    {
      q: 'How quickly must a new or edited place show up in search?',
      why: 'If a minute or so is fine, edits can reach the index asynchronously and cards can be cached. If edits must show up instantly, every copy of the index has to change before the edit returns, which makes edits slow and fragile. Owners usually accept a short delay, as long as their own place page shows the change at once.',
    },
    {
      q: 'Do people filter by category, sort by rating, or search by name?',
      why: 'A category filter and a rating sort can live inside each index entry, so the index answers them alone. Free text such as “vegan ramen” needs a [[search engine|search-engine]] with an [[inverted index|inverted-index]] and a location filter, a much bigger system; assume categories only.',
    },
    {
      q: 'Where are the users, and how evenly are places spread?',
      why: 'Places crowd into cities: a square kilometer downtown can hold thousands while most of the map holds none. Uneven density favors cells that adapt to it, and a worldwide audience means serving searches from several regions.',
    },
    {
      q: 'Does the app search again every time the user pans or zooms the map?',
      why: 'If so, each user sends several searches a minute, which multiplies the load, and a query becomes everything inside a rectangle rather than a circle. The app can then reuse results for the cells it has already seen.',
    },
  ],
  requirements: {
    functional: [
      'Given a location and a radius from 500 m to 20 km, return up to 20 places at a time, sorted by distance or by a mix of rating and distance, with a way to fetch the next page.',
      'Filter results by category, such as cafés or pharmacies, and by whether a place is open now.',
      'Show a place’s page, looked up by its identifier (ID): name, address, hours, photos and rating.',
      'Business owners add a place or edit its details; changes appear in search within a few minutes.',
    ],
    nonFunctional: [
      'Fast searches: about 100 ms at the server for 99% of them (ballpark), since people search while walking.',
      'Highly available search, around 99.99% (a ballpark target). Results a minute or two out of date are fine; adding and editing places can tolerate a little more downtime.',
      'Correct distances: never show a place outside the radius, and never miss one inside it because it sits across a cell edge.',
      'Scale: about 200 million places and 10,000 searches a second at peak (ballpark), with roughly 500 searches for every edit.',
    ],
    outOfScope: [
      'Reviews, photo uploads, reservations and ads.',
      'Directions and travel times: distance here is a straight line.',
      'Free-text search over names and menus, beyond noting that it would add a search engine.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Daily users', value: '100 million (ballpark)' },
      { label: 'Searches per user per day', value: '5, counting each pan of the map or change of filter' },
      { label: 'Places worldwide', value: '200 million' },
      { label: 'New places and edits per day', value: 'about 1 million, so roughly 500 searches for every edit' },
      { label: 'Bytes per place', value: 'about 1 KB of details; about 100 bytes in the geo index (ID, coordinates, category, rating, short name)' },
      { label: 'Busiest hour compared with the daily average', value: '2×' },
      { label: 'In the calculator', value: 'a search counts as a read and an edit as a write; ignore the storage line, since edits overwrite rows rather than add them' },
    ],
    steps: [
      { label: 'Searches per second', math: '10⁸ users × 5 = 5 × 10⁸ a day; ÷ 10⁵ seconds a day', result: '≈ 5,000 a second, 10,000 at peak' },
      { label: 'Edits per second', math: '10⁶ a day ÷ 10⁵ seconds', result: '≈ 10 a second, 20 at peak' },
      { label: 'Place details', math: '2 × 10⁸ places × 1 KB', result: '≈ 200 GB: one database with read replicas' },
      { label: 'Geo index', math: '2 × 10⁸ places × 100 bytes', result: '≈ 20 GB: fits in one server’s memory' },
      { label: 'Work per search', math: 'a 1 km circle touches about a dozen cells; downtown they hold a few thousand places; the filters keep a few hundred', result: 'thousands of candidates, checked in memory in milliseconds' },
      { label: 'Outgoing bandwidth', math: '10,000 searches a second × 20 results × 200 bytes', result: '≈ 40 MB a second at peak: small' },
    ],
    calculator: { dau: 100_000_000, actionsPerUser: 5, readsPerWrite: 500, objectBytes: 1_000, peakFactor: 2, retentionYears: 1 },
  },
  api: [
    {
      signature: 'GET /v1/places/nearby?lat=1.2834&lon=103.8607&radius=1000&category=cafe&sort=distance&cursor=…  →  200 { places: [{ id, name, lat, lon, distanceM, rating }], nextCursor }',
      description:
        'The search, answered by any search server from memory. The radius is in meters, capped at 20 km, and the [[cursor|cursor-pagination]] marks where the last page stopped. Results may be a minute or so behind the latest edits.',
    },
    {
      signature: 'GET /v1/places/{id}  →  200 { id, name, address, hours, category, rating, photos }',
      description:
        'A place’s page, read by ID through the details cache. When owners view their own place, the request reads the database leader, so they always see their latest edit.',
    },
    {
      signature: 'POST /v1/places  { name, lat, lon, address, category, hours }  →  201 { id }',
      description:
        'Adds a place. It needs an owner’s token, and an [[idempotency key|idempotency-key]] header makes a retried request return the same place instead of creating a second one.',
    },
    {
      signature: 'PATCH /v1/places/{id}  { …changed fields }  →  200 { place }',
      description: 'Edits a place. A moved pin changes the place’s cell, and every search server moves it in its index within a minute or so (ballpark).',
    },
  ],
  dataModel: [
    {
      entity: 'Place',
      fields: ['place_id: 64-bit integer (primary key)', 'name, address, category', 'lat, lon: decimal degrees', 'geohash: 12 characters (indexed)', 'hours: weekly schedule', 'rating, review_count', 'owner_id, updated_at'],
      store: 'Relational database such as PostgreSQL: one leader and several read replicas',
      why: 'Edits are rare, and owners expect each one saved exactly as typed, which a relational database does well. About 200 GB (ballpark) fits on one leader, and replicas absorb card lookups. The geohash column answers simple area queries and gives the index builder a sort order.',
    },
    {
      entity: 'Geo index entry',
      fields: ['cell: quadtree leaf', 'place_id', 'lat, lon', 'category, rating', 'short_name'],
      store: 'In memory on every search server, loaded from a snapshot and kept current from the change stream',
      why: 'About 20 GB (ballpark) fits in one server’s memory, so each server keeps a full copy and answers without a network hop. Keeping category and rating in the entry lets a server filter and rank before it fetches any details.',
    },
    {
      entity: 'Place change',
      fields: ['place_id (stream key)', 'old_lat, old_lon, new_lat, new_lon', 'changed_fields', 'version'],
      store: 'Event stream such as Kafka, kept for a few days',
      why: 'Fed by [[change data capture|change-data-capture]], which reads committed changes from the database’s log. Keyed by place, so one place’s changes arrive in order, and the version lets a server skip a change it has already applied.',
    },
    {
      entity: 'Index snapshot',
      fields: ['built_at', 'stream_offset', 'file: the serialized index, about 20 GB'],
      store: 'Object storage, one snapshot an hour, the last few kept',
      why: 'A new server loads a snapshot in minutes instead of reading 200 million rows from the database, then replays the stream from the snapshot’s offset.',
    },
    {
      entity: 'Place card',
      fields: ['key: place_id', 'name, address, hours, photo_url, price, rating'],
      store: 'Shared cache such as Redis, filled on a miss, with a time to live (TTL) of an hour',
      why: 'Each popular place appears in thousands of searches for every edit, and the cache serves its card each time. An edit deletes the entry, so the next read fetches the new version.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Find the places near a point without scanning the whole table, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One app server and one database with a geohash column handle a city or a small country: each search is a dozen index range scans plus a distance check. At 10,000 searches a second it falls over, because that is over 100,000 range scans a second on one database. Fixed-size cells also read thousands of rows downtown and nothing in the countryside.',
    },
    {
      title: 'v2: It scales',
      solves: 'About 10,000 searches a second at peak (ballpark), very uneven density, and 500 reads for every write.',
      diagram: v2,
      explanation:
        'The key fact from the estimate is that the whole index fits in memory, so instead of splitting it, every search server keeps a full copy and the database sees only card misses. Caching whole results by the user’s coordinates would almost never hit, since two people a meter apart send different numbers; caching each place’s card does. The cost of all those copies is that each must learn about edits, which is the next stage.',
    },
    {
      title: 'v3: Edits reach every copy',
      solves: 'An owner moves a pin or changes hours. Every in-memory copy of the index must learn about it within minutes, and new servers must start without reading the whole database.',
      diagram: v3,
      explanation:
        'Search servers behave like followers of the database: they apply its changes in order, slightly behind. That delay is [[replication lag|replication-lag]] by another name, usually seconds and at most a minute or two (ballpark). Owners still see their own edits at once, because their place page reads the leader: [[read-your-writes|read-your-writes]] consistency for the one person who would notice.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead search server, cache, database leader or change stream must not stop people from finding places.',
      diagram: v4,
      explanation:
        'Every failure leaves search working, at worst a little stale or with plainer results: the copies of the index are independent, and edits wait safely in the database. A second region with its own search servers and replicas covers a regional outage, and since the whole world’s index is only about 20 GB, every region can hold all of it.',
    },
  ],
  deepDives: [
    {
      title: 'Geohash cells, a quadtree, or the database’s spatial index',
      problem:
        'An ordinary index sorts by one value, so it can’t find everything within 1 km of a point without reading a whole strip of the planet. You need cells with sortable names, and they must work downtown, where a cell holds thousands of places, and in the countryside, where most cells are empty.',
      options: {
        caption: 'Four ways to index places by location',
        rows: [
          {
            option: 'Geohash column in the database',
            goodAt: 'Simple: one string column with an ordinary [[B-tree|b-tree]] index, and a search is a dozen range scans. Edits are normal row updates.',
            badAt:
              'Every search costs the database a dozen scans, so 10,000 searches a second means over 100,000 scans a second. Fixed-size cells read thousands of rows downtown and waste scans on empty land.',
            pickWhen: 'Up to a few hundred searches a second, or as the column the in-memory index is built from.',
          },
          {
            option: 'Quadtree in memory',
            goodAt:
              'Cells adapt to density, small downtown and large over empty land, so each search reads hundreds of candidates rather than thousands. Finding the nearest places is a natural walk of the tree.',
            badAt: 'Custom code to build, update and save it, and each server needs memory for the whole tree and minutes to load it.',
            pickWhen: 'Density is very uneven and searches are served from memory: the usual case here.',
          },
          {
            option: 'Database spatial index, such as PostGIS',
            goodAt: 'Handles points and shapes, such as delivery zones and parks, with exact distance functions, using an [[R-tree|r-tree]] inside a database the team may already run.',
            badAt: 'The database still works on every search, and a spatial index is harder to shard than a plain key.',
            pickWhen: 'Moderate traffic, or a product that needs shapes as well as points.',
          },
          {
            option: 'Hexagon or sphere grids, such as H3 or S2',
            goodAt: 'Cells of nearly equal area worldwide with clean rings of neighbors; libraries do the math, and the cells are handy for counting things per area.',
            badAt: 'One more cell scheme to learn, and like geohashes, each level has one cell size, so dense cities still need a finer level.',
            pickWhen: 'You also aggregate by area, such as heat maps, or serve places near the poles.',
          },
        ],
      },
      recommendation:
        'Keep a geohash column in the places table, and serve searches from a quadtree in each search server’s memory that splits any cell holding more than about 100 places (ballpark). Start from cells about the size of the radius (geohashes of 6 characters for 1 km, 5 for 5 km and 4 for 20 km, ballpark), read every cell the circle touches, and always finish with an exact distance check. For a smaller product, say out loud that PostGIS alone would do, and why this one outgrew it.',
    },
    {
      title: 'Copy the index everywhere, or split it?',
      problem:
        'Ten thousand searches a second need many servers. Either every server holds the whole index, or each holds a slice and each search goes to the right slice. The estimate decides: the index is about 20 GB (ballpark).',
      options: {
        caption: 'Spreading about 10,000 searches a second (ballpark)',
        rows: [
          {
            option: 'Full copy on every search server',
            goodAt: 'Any server answers any search with no network hop; capacity grows by adding servers, and losing one costs only capacity.',
            badAt: 'Every server needs about 20 GB of memory and minutes to load it, and every edit is applied once per server.',
            pickWhen: 'The index fits comfortably in one server’s memory: the case here.',
          },
          {
            option: 'Shard by cell prefix',
            goodAt:
              'The index can grow without limit, and nearby places stay together, so most searches touch one shard. It is [[range partitioning|range-partitioning]] on the cell name.',
            badAt:
              'A dense city turns its shard into a [[hot spot|hot-spot]], searches near a border touch two shards, and moving ranges needs a [[directory|directory-partitioning]] of which shard holds what.',
            pickWhen: 'The index no longer fits in memory, or each region keeps only its own places.',
          },
          {
            option: 'Shard by a hash of the place ID',
            goodAt: 'Places and edits spread perfectly evenly.',
            badAt: 'Nearby places land on every shard, so each search must ask all of them, a [[scatter-gather|scatter-gather]] that waits for the slowest.',
            pickWhen: 'For the place-details store, never for location search.',
          },
          {
            option: 'Database index plus many read replicas',
            goodAt: 'No custom index code, and replicas add read capacity.',
            badAt: 'Each search still costs a dozen scans, so you need many replicas, each also holding the full 200 GB of details.',
            pickWhen: 'Moderate traffic, as in v1.',
          },
        ],
      },
      recommendation:
        'Copy the whole index to every search server while it fits, which it does with room to spare. When it stops fitting, shard by cell prefix with a directory, give dense cities more shards than empty regions, and keep two or three copies of each shard. Never shard location search by place ID.',
    },
    {
      title: 'Getting edits into the index',
      problem:
        'Every search server has its own copy of the index, built from the database. When an owner adds a place or moves a pin, every copy must learn about it, in order, without slowing searches or the database.',
      options: {
        caption: 'Ways to keep the copies fresh',
        rows: [
          {
            option: 'Rebuild every night',
            goodAt: 'Simplest, and each build is a clean, consistent copy.',
            badAt: 'Edits wait up to a day, so a café that moved sends people to its old address.',
            pickWhen: 'Places almost never change, or a day’s delay is acceptable.',
          },
          {
            option: 'Rebuild every few minutes and swap',
            goodAt: 'Fresh within minutes, with no code for applying single changes.',
            badAt: 'Rebuilding 200 million places to apply a few thousand edits wastes nearly all the work, and servers reload 20 GB over and over.',
            pickWhen: 'Small datasets, where a rebuild takes seconds.',
          },
          {
            option: 'Stream each change to every server',
            goodAt: 'Servers apply only what changed, within seconds, and a snapshot plus the stream lets a new server catch up quickly.',
            badAt: 'More moving parts, and for a few seconds two servers can disagree about where a place is.',
            pickWhen: 'The default at this scale.',
          },
          {
            option: 'Update every copy during the edit',
            goodAt: 'Search reflects an edit the moment it is saved.',
            badAt: 'An edit stalls whenever any server is slow or down, and a crash halfway leaves copies that disagree: a [[dual write|dual-write]].',
            pickWhen: 'Almost never; at most with a single shared index.',
          },
        ],
      },
      recommendation:
        'Stream changes with change data capture, keyed by place so each place’s edits stay in order, and let every server apply them; build hourly snapshots so new servers start fast. Say the freshness promise out loud: search lags edits by seconds, at most a minute or two (ballpark), and an owner’s own page reads the leader, so they never doubt that their edit was saved.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: about 100,000 searches a second at peak (ballpark).',
      impact: 'Search servers run short of processor time, mostly filtering candidates in dense downtown cells, and the details cache sees ten times the batched reads.',
      mitigation: 'Add search servers, since each holds a full copy, and add cache nodes. Lower the quadtree’s cell capacity in the densest cities so each search reads fewer candidates.',
    },
    {
      scenario: '100× in one place: a festival, and a crowd searches the same few blocks at once.',
      impact: 'The same cells are searched thousands of times a second, and the few places in them become [[hot keys|hot-key]] in the details cache.',
      mitigation:
        'Cache results per cell and category on each server for a few seconds, keep the hottest cards in each server’s own memory, and let the app reuse results while the user stays nearby.',
    },
    {
      scenario: 'The index outgrows memory: ten times more places, or much richer entries.',
      impact: 'Servers run out of memory loading the snapshot, and startup takes too long.',
      mitigation:
        'Shard by cell prefix with a directory of which ranges live where, give big cities several shards, and run two or three copies of each. A search near a shard border asks both shards and merges the answers.',
    },
    {
      scenario: 'A search server crashes, or a bad release takes several down.',
      impact: 'Fewer servers carry the load, and each replacement needs minutes to load a snapshot.',
      mitigation: 'Health checks remove dead servers within seconds. Keep spare capacity in every zone, and release new versions to a few servers at a time.',
    },
    {
      scenario: 'The details cache cluster dies.',
      impact:
        'Every card lookup goes to the read replicas, about 10,000 batched reads a second at peak (ballpark), with a [[cache stampede|cache-stampede]] on popular places the moment it happens.',
      mitigation:
        'Size the replicas to carry it for a while, coalesce concurrent misses for the same place, and if they still struggle, return results with only the fields kept in memory.',
    },
    {
      scenario: 'The places leader dies.',
      impact: 'Searches are unaffected. Owners can’t save edits for the seconds a failover takes.',
      mitigation: 'Promote a replica automatically. The places service retries with the same idempotency key, so no place is created twice.',
    },
    {
      scenario: 'The change stream, or the change data capture feeding it, stops.',
      impact: 'Searches keep working on a frozen index; new places and moved pins don’t appear until it returns.',
      mitigation:
        'Alert on [[consumer lag|consumer-lag]] within minutes. Edits wait safely in the database’s log and flow in when the stream recovers; if the stream’s data is lost, build a fresh snapshot from the database.',
    },
    {
      scenario: 'A whole region goes down.',
      impact: 'Users routed to that region can’t search.',
      mitigation:
        'Run search servers, caches and replicas in two or more regions, with [[GeoDNS|geodns]] sending users to the nearest healthy one. Each region holds the whole world’s index, since it is only about 20 GB.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Explains why an index on latitude and longitude can’t answer a radius search, and names geohashes or quadtrees as the fix.',
        'Handles cell edges by reading the neighboring cells and checking exact distances.',
        'Notices that searches far outnumber edits, and adds read replicas or a cache.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Estimates the index size, sees that it fits in memory, and copies it to every server instead of sharding it.',
        'Chooses cell sizes from the radius, and explains how a quadtree adapts to dense cities.',
        'Gets edits into the index asynchronously, and states how stale search may be.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Leads the deep dives without being asked: density, the 20 closest places, freshness, and what happens when the index outgrows memory.',
        'States trade-offs in one breath, such as “a full copy per server costs 20 GB of memory each and buys searches with no network hop.”',
        'Plans for operations: snapshots for fast startup, several regions, and alerts on search latency and index lag.',
      ],
    },
  ],
  followUps: [
    {
      q: 'A user stands a few meters from the edge of a cell. Do they miss the café across the street?',
      a: 'Not in my design. I never read only the user’s own cell: I read every cell the search circle touches, which includes the neighbors, and then filter by exact distance. Across some edges, two places a meter apart share no geohash prefix at all, so neighbors must be computed, never guessed from the prefix.',
    },
    {
      q: 'Your index no longer fits in one server’s memory. What now?',
      a: 'I shard it by cell prefix, so nearby places stay together and most searches touch one shard. A directory maps prefix ranges to shards, which lets a dense city take several shards while one shard covers a whole empty region. Each shard keeps two or three copies, and a search near a border asks both shards and merges.',
    },
    {
      q: 'An owner moved their pin, but search still shows the old spot. Why, and for how long?',
      a: 'Edits reach the index through change data capture and the change stream, so search lags the database by seconds, at most a minute or two (ballpark). The owner’s own page reads the leader, so they see the new pin right away. If the lag were longer, I’d check consumer lag on the stream and pull any stuck server out of the load balancer until it catches up.',
    },
    {
      q: 'How do you return the 20 closest places in the countryside, where the nearest one is 40 km away?',
      a: 'I widen the search: start with the cells around the user, and while there are fewer than 20 results, double the radius and read the next ring of larger cells, up to a cap such as 100 km. A quadtree can do it directly, visiting cells in order of their distance from the user and stopping once the 20th result is closer than any cell not yet visited.',
    },
    {
      q: 'Ten thousand people at a stadium search for food at the same moment. What happens?',
      a: 'They all hit the same few cells. The quadtree keeps those cells small, so each search stays cheap, and I cache results per cell and category on each server for a few seconds. I also keep the hottest cards in each server’s memory, so no single cache node takes the whole crowd.',
    },
    {
      q: 'How would you add free-text search, such as vegan ramen near me?',
      a: 'With a search engine such as Elasticsearch: an inverted index over names, categories and menus, where every document also carries its location, so one query filters by text and distance together. The same change stream feeds it, and the geo index stays in place for plain category searches, which are most of the traffic.',
    },
  ],
  rubric: [
    { item: 'Estimated searches, edits and the size of the index, and noticed that the index fits in memory', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Explained why an index on latitude and longitude fails, and indexed places with geohash cells or a quadtree', weight: 20, lessonId: 'geospatial-indexing' },
    { item: 'Read the neighboring cells and filtered by exact distance, with cell sizes chosen from the radius', weight: 10, lessonId: 'geospatial-indexing' },
    { item: 'Served the read-heavy search path from in-memory copies of the index, scaled by adding servers', weight: 15, lessonId: 'replication' },
    { item: 'Cached place cards, and avoided caching results by exact coordinates', weight: 10, lessonId: 'caching' },
    { item: 'Got edits into every copy asynchronously, stated the delay, and showed owners their own edits at once', weight: 15, lessonId: 'replication-lag' },
    { item: 'Knew when and how to shard the index by cell prefix, giving dense cities more shards', weight: 10, lessonId: 'sharding' },
    { item: 'Explained what users see when a search server, the cache, the leader or the change stream fails', weight: 5, lessonId: 'circuit-breakers' },
  ],
};

export default problem;
