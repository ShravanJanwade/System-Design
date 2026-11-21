import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: a "photos near me" query from Maya's phone to the geo index and back. */
const nearbyQuery: DiagramSpec = {
  grid: { cols: 3, rows: 1 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', sublabel: 'Singapore', x: 0, y: 0 },
    { id: 'svc', type: 'service', label: 'Nearby service', x: 1, y: 0 },
    { id: 'idx', type: 'sqlDb', label: 'Geo index', sublabel: 'sorted by geohash', x: 2, y: 0 },
  ],
  edges: [
    { id: 'phone-svc', from: 'phone', to: 'svc', kind: 'sync', label: 'location' },
    { id: 'svc-idx', from: 'svc', to: 'idx', kind: 'sync', label: 'range scans' },
  ],
  steps: [
    {
      caption: 'Maya opens “Photos near me”. Her phone sends its location, latitude 1.2834 and longitude 103.8607, and asks for photos within 1 km.',
      flow: ['phone-svc'],
    },
    {
      caption:
        'The **nearby service** turns the location into a geohash, `w21z73`, and works out which cells the 1 km circle touches: her own cell and some of its eight neighbors.',
      focus: ['svc'],
      notes: [{ target: 'svc', text: 'w21z73 + neighbors' }],
    },
    {
      caption: 'For each of those cells, it asks the **geo index** for every photo whose geohash starts with the cell’s name. Each cell is one range scan of a sorted index.',
      flow: ['svc-idx'],
      notes: [{ target: 'idx', text: 'one scan per cell' }],
    },
    {
      caption: 'The index returns the candidates: every photo in those cells, including some just outside the circle.',
      flow: ['<svc-idx'],
    },
    {
      caption: 'The service measures the exact distance to each candidate, drops the ones more than 1 km away and sends Maya the rest, closest first.',
      flow: ['<phone-svc'],
      notes: [{ target: 'phone', text: 'closest first' }],
    },
  ],
};

/** The geo index split across shards by cell prefix, then a crowd makes one shard hot. */
const sharded: DiagramSpec = {
  grid: { cols: 2, rows: 3 },
  nodes: [
    { id: 'svc', type: 'service', label: 'Nearby service', x: 0, y: 1 },
    { id: 'sa', type: 'sqlDb', label: 'Shard A', sublabel: 'cells 0 to v', x: 1, y: 0 },
    { id: 'sb', type: 'sqlDb', label: 'Shard B', sublabel: 'cells w to z', x: 1, y: 1 },
    { id: 'sc', type: 'sqlDb', label: 'Shard C', sublabel: 'cells w21z', x: 1, y: 2 },
  ],
  edges: [
    { id: 'svc-sa', from: 'svc', to: 'sa', kind: 'sync' },
    { id: 'svc-sb', from: 'svc', to: 'sb', kind: 'sync' },
    { id: 'svc-sc', from: 'svc', to: 'sc', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Each shard holds a range of geohash prefixes. Nearby cells share a prefix, so Maya’s search usually goes to one shard.',
      focus: ['svc', 'sa', 'sb', 'svc-sa'],
      flow: ['svc-sb'],
    },
    {
      caption: 'A concert near Marina Bay: a crowd’s photos and searches all land on **Shard B**.',
      flow: ['svc-sb'],
      notes: [{ target: 'sb', text: 'hot spot', tone: 'alert' }],
    },
    {
      caption: 'Borrow the quadtree’s idea and split the busy range finer: cells starting `w21z` move to **Shard C**, and the load spreads out.',
      add: ['sc', 'svc-sc'],
      flow: [['svc-sb', 'svc-sc']],
      notes: [{ target: 'sc', text: 'split off', tone: 'signal' }],
    },
  ],
};

const lesson: Lesson = {
  id: 'geospatial-indexing',
  module: 'm6',
  order: 7,
  title: 'Geospatial indexing',
  idea: 'A geospatial index cuts the map into cells with sortable names, so a “photos near me” query reads a few cells instead of every row.',
  minutes: 15,
  prerequisites: ['indexes', 'sharding'],
  outcomes: [
    'Explain why ordinary indexes on latitude and longitude are slow for “photos within a kilometer of me”.',
    'Describe how geohashes and quadtrees divide the map, and why a nearby search must also read the neighboring cells.',
    'Choose between a fixed grid and a quadtree, and size the cells to the search radius and to how crowded the map is.',
  ],
  analogy: {
    title: 'Zooming into a map grid',
    body: 'Think of a paper city map with a grid printed on it, columns A to H and rows 1 to 8. The index at the back says the museum is in square C4, so you never scan the whole map. To find a café near you, you check your own square and the squares around it, because the closest café might sit just across a grid line.\n\nWhen one square is crammed with streets, the map book adds an inset page that zooms into it with a finer grid. The countryside never gets one. Geospatial indexes work the same way: named cells, finer cells where it is crowded, and a habit of checking the neighbors.',
  },
  whyItMatters:
    'Snapgram now has about 50 million daily users, and the team launches “Photos near me”: photos posted within a kilometer of where you stand. Every photo already stores the [[latitude and longitude|latitude-and-longitude]] where it was taken, and both columns have an [[index|index]].\n\nMaya tries the feature near Marina Bay in Singapore, and it takes seconds to load. The query asks for latitudes between two numbers and longitudes between two others, and the database reads a huge number of rows to return a few dozen. The more photos Snapgram stores, the slower it gets.',
  body: [
    { kind: 'heading', text: 'Why latitude and longitude are hard to search' },
    {
      kind: 'prose',
      md: 'To find photos near Maya, the app asks for every photo inside a [[bounding box|bounding-box]]: a rectangle about 2 km on each side, centered on her. That is a [[range query|range-query]] on two columns at once.',
    },
    {
      kind: 'code',
      code: 'SELECT id FROM photos\nWHERE lat BETWEEN 1.2744 AND 1.2924\n  AND lon BETWEEN 103.8517 AND 103.8697;',
      caption: 'Latitude and longitude, each between two bounds. It looks cheap.',
    },
    {
      kind: 'prose',
      md: 'An index is sorted by one value, so it answers a range on that value well: jump to the first match and read forward. The index on latitude finds every photo between 1.2744 and 1.2924, but that is a thin strip around the whole planet, through Singapore, Kenya and Brazil. The index on longitude finds a strip from pole to pole. Either way, the database reads every photo in a strip and throws nearly all of them away.',
    },
    {
      kind: 'prose',
      md: 'A [[composite index|composite-index]] on latitude, then longitude, barely helps: it is sorted by latitude first, so the database still walks the whole strip. Closeness in two directions does not fit in one sorted list, so each search reads a large slice of the table, almost a [[full table scan|full-table-scan]], to return a few dozen rows.',
    },
    {
      kind: 'prose',
      md: 'The fix is one value the database can sort that still keeps nearby places close together: the name of a map cell. An index built that way is a [[geospatial index|geospatial-index]].',
    },
    { kind: 'heading', text: 'Geohashes: names for map cells' },
    {
      kind: 'prose',
      md: 'A [[geohash|geohash]] names a rectangle on the map with a short string. To build one, split the world in half by longitude: west is 0 and east is 1. Then split your half by latitude, south 0 and north 1, and keep alternating, each bit halving the cell. Every five bits become one character from a 32-character alphabet of digits and letters.',
    },
    {
      kind: 'prose',
      md: 'Each extra character cuts the cell into 32 smaller ones, so a longer geohash names a smaller place inside the shorter one. Where Maya stands near Marina Bay is `w`, then `w21`, then `w21z7`, then `w21z73`: a cell about 1.2 km wide and 610 m tall. Places in the same cell share a prefix, so an ordinary [[B-tree|b-tree]] index on the geohash column finds a cell’s photos with one range scan: every value that starts with `w21z73`.',
    },
    {
      kind: 'table',
      columns: ['Characters', 'Cell size near the equator', 'About the size of'],
      rows: [
        ['4', '39 km × 20 km', 'A city'],
        ['5', '4.9 km × 4.9 km', 'A district'],
        ['6', '1.2 km × 610 m', 'A neighborhood'],
        ['7', '153 m × 153 m', 'A few blocks'],
        ['8', '38 m × 19 m', 'A building'],
      ],
      caption: 'Away from the equator, cells get narrower, because lines of longitude meet at the poles.',
    },
    { kind: 'heading', text: 'Read the neighbors too' },
    {
      kind: 'prose',
      md: 'Nearby places usually share a prefix, but not always. If Maya stands a few meters west of a cell edge, a photo a few meters east is in a different cell, and its geohash differs. Across one of the big edges, two places a meter apart can share no prefix at all: on the prime meridian in south-west France, the cells `ezzz` and `spbp` touch.',
    },
    {
      kind: 'prose',
      md: 'So a nearby search never reads only Maya’s cell. It reads every cell the search circle touches: her own and some of its eight neighbors, as long as the cells are at least as big as the radius. Then it measures the exact distance to each candidate with the [[haversine formula|haversine-formula]] and drops the ones outside the circle, because cells are rectangles and the search is a circle.',
    },
    {
      kind: 'diagram',
      title: 'A “photos near me” search',
      caption: 'Step through Maya’s search: from her location to cells, range scans and an exact distance check.',
      spec: nearbyQuery,
    },
    {
      kind: 'prose',
      md: 'Precision is a trade-off. Cells much bigger than the circle mean reading many photos only to throw them away; cells much smaller mean dozens or hundreds of range scans. For a 1 km search, 5 or 6 characters work well, while 7 would mean well over a hundred tiny cells.',
    },
    { kind: 'heading', text: 'Quadtrees: finer where it is crowded' },
    {
      kind: 'prose',
      md: 'A geohash grid is the same everywhere, but photos are not. A 6-character cell downtown might hold thousands of photos while one over the sea holds none, so some searches read far too much and others waste scans on empty cells.',
    },
    {
      kind: 'prose',
      md: 'A [[quadtree|quadtree]] adapts to the data. It starts as one square covering the whole map, with a capacity, say 100 photos. When a square goes over capacity, it splits into four equal quarters and hands each photo to its quarter, and any quarter that overflows splits again. Busy downtown ends up with small, deep cells, while the empty corners stay as big squares.',
    },
    {
      kind: 'prose',
      md: 'A nearby search walks down from the root and skips every quarter the circle does not touch, so it reads a handful of small cells downtown and one big cell in a quiet area. Each cell’s path of quarters, such as `3102`, works as a sortable name too, which lets a quadtree live in an ordinary database index, much like a geohash.',
    },
    { kind: 'heading', text: 'Scaling it' },
    {
      kind: 'prose',
      md: 'At Snapgram’s size, the geo index is split across machines. [[Sharding|sharding]] by cell prefix, a kind of [[range partitioning|range-partitioning]], keeps nearby cells together, but a crowd in a few cells can turn their shard into a [[hot spot|hot-spot]].',
    },
    {
      kind: 'diagram',
      title: 'Sharding the geo index by cell',
      caption: 'Cells keep searches on one shard, until a crowd makes that shard hot.',
      spec: sharded,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson treats the map as a flat grid and skips cells that narrow toward the poles, searches across the 180th meridian, shapes such as parks, and finding the nearest photos when you do not know how far to look. “Go deeper” names indexes built for these, such as R-trees and Uber’s H3.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'geo-map',
      preset: { mode: 'geohash', precision: 6, capacity: 4, spot: 'downtown' },
      intro:
        'Now cut the map yourself. Start with geohash cells and change the precision, then put Maya on a cell edge and see where her photos live. Switch to the quadtree, drop a crowd, and watch the cells under it split.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to answer “what is near me”.',
    rows: [
      {
        option: 'Geohash grid',
        goodAt: 'A plain string column with an ordinary B-tree index; easy to shard by prefix and to cache by cell.',
        badAt: 'One cell size everywhere, so crowded cells hold too much, and edges force extra neighbor scans.',
        pickWhen: 'You want a simple index in a database you already run, and one precision suits most searches.',
      },
      {
        option: 'Quadtree',
        goodAt: 'Cells adapt to density: small downtown, large over empty areas.',
        badAt: 'The tree changes shape as data arrives, which makes it harder to store and shard than a fixed grid.',
        pickWhen: 'Density varies wildly, such as cities next to sea, or the index lives in memory.',
      },
      {
        option: 'R-tree in a spatial database',
        goodAt: 'Indexes shapes as well as points, with exact distance and overlap queries built in.',
        badAt: 'Ties you to a database with spatial support, and is harder to shard by hand.',
        pickWhen: 'You store areas such as parks or delivery zones, and one database can hold the data.',
      },
    ],
  },
  realWorld: {
    title: 'Redis geo commands',
    body: '`GEOADD`, a command of the in-memory store Redis, saves a place with its longitude and latitude in a sorted set, where members are kept in order by a number called the score. The documentation explains that the score is a geohash: latitude and longitude bits interleaved into a 52-bit integer, so nearby places sit close together.\n\nTo search a box or a radius, Redis checks the area holding the center plus its eight neighbors, the “1+8 areas”, and discards members outside the shape. It measures distance with the haversine formula on a sphere, which the docs say can be off by up to 0.5%, and it cannot index places very near the poles.',
    sourceUrl: 'https://redis.io/docs/latest/commands/geoadd/',
    sourceLabel: 'Redis documentation, “GEOADD”',
  },
  interview: {
    whenToMention:
      'Whenever the prompt says “near me”: nearby friends, restaurants, drivers, stores or photos. Name the index before the interviewer asks how you will avoid scanning every row, and say how you will handle cell edges and crowded cities.',
    sayItLikeThis: [
      'I’ll store a geohash with each photo and index it. A 1 km search reads Maya’s cell and the neighbors the circle touches, then filters the candidates by exact distance.',
      'Density is uneven, so I’d shard by cell prefix and split hot regions finer, the way a quadtree does.',
    ],
    followUps: [
      {
        q: 'How would you return the 20 nearest photos, however far away they are?',
        a: 'That is a [[nearest-neighbor search|nearest-neighbor-search]] rather than a radius search. I’d start with a small radius, and if fewer than 20 photos come back, double it and search again. A quadtree can also do it directly, by opening cells in order of distance from Maya until it has 20 photos and no unopened cell could hold a closer one.',
      },
      {
        q: 'Drivers move and report their location every few seconds. Does your design still work?',
        a: 'Not as a database table whose index changes on every report. I’d keep live positions in memory, for example a [[Redis|redis]] geo set per city, updated on each report, and drop drivers who stop reporting. Only trips and occasional snapshots go to the main database.',
      },
      {
        q: 'What happens to your shards when a stadium fills up?',
        a: 'If shards are split by cell prefix, the stadium’s cells all land on one shard, a hot spot for writes and searches. I’d split that range into finer prefixes on separate shards, as a quadtree would, and cache popular cells for a few seconds. Sharding by photo id instead spreads the writes, but every search becomes a [[scatter-gather|scatter-gather]] across all shards.',
      },
    ],
    redFlags: [
      'Computing the distance to every photo in the table on each search.',
      'Searching only the user’s own geohash cell and missing photos just across the edge.',
      'Using one cell size for a dense city and an empty desert without noticing the hot spots.',
    ],
  },
  mistakes: [
    '**Forgetting the neighbors.** A photo 10 m away can sit in the next cell with a different geohash, so a prefix search on one cell misses it.',
    '**Skipping the exact distance check.** Cells are rectangles and the search is a circle, so the corners of the cells return photos that are too far away.',
    '**Cells far too small or far too large.** Tiny cells turn one search into hundreds of range scans; huge ones read far more photos than they keep.',
    '**Treating degrees as distances.** A degree of longitude is about 111 km at the equator but shrinks to nothing at the poles, so a box drawn in degrees is not a square in kilometers.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram has one index on latitude and another on longitude. Why is “photos within 1 km of Maya” still slow?',
      options: [
        {
          text: 'Each index narrows only one direction, so the database reads a whole strip of the planet and throws most of it away',
          correct: true,
          why: 'The latitude index finds every photo at Maya’s latitude around the world, and the longitude index a strip from pole to pole. Neither alone finds a small square.',
        },
        {
          text: 'Indexes cannot sort decimal numbers such as 1.2834',
          correct: false,
          why: 'Indexes sort decimals just fine. The problem is that one sorted order cannot capture closeness in two directions.',
        },
        {
          text: 'The haversine formula is too slow to run on each row',
          correct: false,
          why: 'The formula is a few multiplications and a square root. The cost is reading far too many rows in the first place.',
        },
        {
          text: 'It needs a composite index on both columns, which would make it fast',
          correct: false,
          why: 'A composite index still sorts by latitude first, so a range on latitude leaves the longitudes scattered across the whole strip.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A quadtree covers a square map 10 km on each side. A crowded cell downtown has been split 5 times. About how wide is it, in meters?',
      answer: 313,
      unit: 'm',
      tolerance: 1.1,
      solution: ['Each split halves the width of a cell.', 'After 5 splits, the width is 10 km ÷ 2⁵, which is 10 km ÷ 32.', '10,000 m ÷ 32 ≈ 313 m.'],
    },
    {
      kind: 'multi',
      prompt: 'Which statements about geohashes are true?',
      options: [
        { text: 'Adding a character makes the cell smaller', correct: true, why: 'Each character adds five bits, cutting the cell into 32 smaller ones.' },
        {
          text: 'Two photos whose geohashes share a long prefix are close together',
          correct: true,
          why: 'A shared prefix means they sit in the same cell, so they are no farther apart than that cell is wide.',
        },
        {
          text: 'Two photos close together always share a long prefix',
          correct: false,
          why: 'Not across a cell edge: photos a meter apart can sit in cells whose names differ early, which is why searches read the neighbors.',
        },
        {
          text: 'A geohash column needs a special spatial database',
          correct: false,
          why: 'It is an ordinary string, so any database with a B-tree index can range-scan it.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of a “photos near me” search in order.',
      items: [
        'Turn Maya’s location into a geohash at a suitable precision',
        'Work out which neighboring cells the search circle touches',
        'Range-scan the index for each of those cells',
        'Measure the exact distance to each candidate and drop the far ones',
        'Sort by distance and return the closest photos',
      ],
      why: 'The cells only narrow the search down to candidates. The exact distance check comes last, because cells are rectangles and the search is a circle.',
    },
    {
      kind: 'single',
      prompt: 'When does a quadtree beat a fixed geohash grid?',
      options: [
        {
          text: 'When points are spread very unevenly, like a dense city next to empty sea',
          correct: true,
          why: 'The quadtree splits only where points pile up, so every cell holds a manageable number.',
        },
        {
          text: 'When every area has about the same number of points',
          correct: false,
          why: 'Then a fixed grid is just as good, and simpler to store and shard.',
        },
        {
          text: 'When you want the index to be a plain string column',
          correct: false,
          why: 'That is the geohash’s strength. A quadtree’s cell paths can be strings too, but the tree changes shape as data arrives.',
        },
        {
          text: 'When the search is for one exact address rather than a nearby area',
          correct: false,
          why: 'An exact address is a plain lookup on a normal index; neither structure is needed.',
        },
      ],
    },
  ],
  takeaways: [
    'One sorted index cannot capture closeness in two directions, so “near me” searches need map cells with sortable names.',
    'A geohash names a cell by interleaving longitude and latitude bits, and a search reads the cells its circle touches, neighbors included, then checks exact distances.',
    'A quadtree splits cells only where points crowd together, the same idea that keeps a busy region from overloading one shard.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**The curve behind geohashes.** Interleaving bits orders cells along a Z-shaped path, a [[space-filling curve|space-filling-curve]]. In the simulator’s map of central Singapore, `w21z6` is south-west, `w21z7` south-east, `w21zd` north-west and `w21ze` north-east, so sorted order zigzags across the map. Most neighbors stay close in that order, but each jump of the zigzag puts some neighbors far apart, which is why searches still read every touching cell.',
    },
    {
      kind: 'prose',
      md: '**Hexagons.** As Uber’s [engineering post on H3](https://www.uber.com/blog/h3/) explains, its open-source index covers the Earth with hexagons at sixteen resolutions, each finer cell about one seventh the area of the coarser one. A hexagon has one distance from its center to every neighbor, where a square has two, which makes analysis across cells simpler. Uber uses it to measure supply and demand in each hexagon when setting prices.',
    },
    {
      kind: 'prose',
      md: '**Shapes, not just points.** Parks, delivery zones and city borders are areas. An [[R-tree|r-tree]] groups nearby shapes into nested bounding boxes, and spatial databases such as PostgreSQL with PostGIS use it to answer “which zone contains this point” and “which shapes overlap this one”.',
    },
    {
      kind: 'prose',
      md: '**Nearest neighbors in a tree.** To find the K closest points, a quadtree or an R-tree keeps a queue of cells ordered by their distance from the query point, opens the closest cell first, and stops once the K-th point it has found is closer than every unopened cell.',
    },
  ],
  flashcards: [
    {
      front: 'Why is a latitude and longitude search slow with ordinary indexes?',
      back: 'Each index sorts one value, so it finds a strip around the planet, and the database reads and discards most of it.',
    },
    {
      front: 'What is a geohash?',
      back: 'A short string naming a map cell, made by interleaving longitude and latitude bits and writing every five bits as one base-32 character.',
    },
    { front: 'Why does a nearby search read the neighboring cells?', back: 'A photo just across a cell edge has a different geohash, so reading only Maya’s cell would miss it.' },
    {
      front: 'How do you pick a geohash precision?',
      back: 'Make cells at least as big as the search radius so the circle touches only a few cells, but not so big that each read drags in far-away photos.',
    },
    {
      front: 'How does a quadtree adapt to crowded areas?',
      back: 'A cell splits into four quarters when it holds more points than its capacity, so crowded areas get small cells and empty areas stay large.',
    },
    { front: 'Why is an exact distance check still needed?', back: 'Cells are rectangles and the search is a circle, so the cells return some photos outside the radius.' },
    {
      front: 'What makes a shard of a geo index hot?',
      back: 'Sharding by cell prefix keeps a crowded area on one shard, so an event there sends most writes and searches to it.',
    },
  ],
  related: ['indexes', 'sharding', 'search-inverted-indexes', 'caching', 'sql-vs-nosql'],
  glossaryTerms: [
    'latitude-and-longitude',
    'index',
    'bounding-box',
    'range-query',
    'composite-index',
    'full-table-scan',
    'geospatial-index',
    'geohash',
    'b-tree',
    'haversine-formula',
    'quadtree',
    'sharding',
    'range-partitioning',
    'hot-spot',
    'nearest-neighbor-search',
    'redis',
    'scatter-gather',
    'space-filling-curve',
    'r-tree',
  ],
};

export default lesson;
