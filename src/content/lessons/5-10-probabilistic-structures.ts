import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: a per-user Bloom filter in front of the seen log. */
const seenFilter: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'app', type: 'client', label: 'Maya’s app', x: 0, y: 0.5 },
    { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 0.5 },
    { id: 'filter', type: 'cache', label: 'Seen filter', sublabel: 'Bloom, ≈ 7 KB', x: 2, y: 0 },
    { id: 'log', type: 'nosqlDb', label: 'Seen log', sublabel: 'every view', x: 2, y: 1 },
  ],
  edges: [
    { id: 'app-feed', from: 'app', to: 'feed', kind: 'sync' },
    { id: 'feed-filter', from: 'feed', to: 'filter', kind: 'sync' },
    { id: 'feed-log', from: 'feed', to: 'log', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya opens her feed. The **feed service** gathers about 500 candidate photos (ballpark) and must drop the ones she has already seen.',
      flow: ['app-feed'],
    },
    {
      caption: 'It checks each one against Maya’s **seen filter** in memory. Most hit a 0 bit: definitely not seen, answered in about a microsecond (ballpark) with no disk read.',
      flow: [{ edge: 'feed-filter', tag: 'definitely not' }],
    },
    {
      caption:
        'Photos she has seen find all their bits set, so the filter says maybe and the feed drops them. So does about 1 unseen photo in 100, a false positive; Maya never misses five out of 500.',
      flow: [{ edge: 'feed-filter', tag: 'maybe' }],
      notes: [{ target: 'filter', text: '≈ 1% false positives', tone: 'plain' }],
    },
    {
      caption:
        'When Maya views a photo, the service sets that photo’s bits and appends the view to the **seen log**, the [[source of truth|source-of-truth]] the filter can be rebuilt from.',
      flow: ['app-feed', ['feed-filter', 'feed-log']],
    },
  ],
};

/** Unique viewers and trending hashtags, both counted in a few kilobytes. */
const counting: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'events', type: 'stream', label: 'Activity stream', x: 0, y: 0.5 },
    { id: 'worker', type: 'worker', label: 'Counter worker', x: 1, y: 0.5 },
    { id: 'hll', type: 'cache', label: 'Unique viewers', sublabel: 'HyperLogLog per photo', x: 2, y: 0 },
    { id: 'cms', type: 'cache', label: 'Hashtag counts', sublabel: 'Count-Min Sketch', x: 2, y: 1 },
    { id: 'app', type: 'client', label: 'Snapgram app', x: 3, y: 0.5 },
  ],
  edges: [
    { id: 'events-worker', from: 'events', to: 'worker', kind: 'async' },
    { id: 'worker-hll', from: 'worker', to: 'hll', kind: 'sync' },
    { id: 'worker-cms', from: 'worker', to: 'cms', kind: 'sync' },
    { id: 'app-hll', from: 'app', to: 'hll', kind: 'sync' },
    { id: 'app-cms', from: 'app', to: 'cms', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every view and new post goes onto the **activity stream**, an [[event stream|event-stream]] of tens of thousands of events per second at peak (ballpark), which the **counter worker** reads.',
      flow: ['events-worker'],
    },
    {
      caption:
        'For a view, the worker adds the viewer’s ID to that photo’s HyperLogLog with `PFADD`. For a post, it adds 1 for each hashtag to this hour’s Count-Min Sketch and updates the top 10 list.',
      flow: [['worker-hll', 'worker-cms']],
    },
    {
      caption: 'The app reads both: `PFCOUNT` returns a photo’s unique viewers, and the trending tab reads the top 10, each answered from a few kilobytes.',
      flow: [
        ['app-hll', 'app-cms'],
        ['<app-hll', '<app-cms'],
      ],
    },
  ],
};

const lesson: Lesson = {
  id: 'probabilistic-structures',
  module: 'm5',
  order: 10,
  title: 'Probabilistic data structures',
  idea: 'Probabilistic data structures answer membership, distinct-count and frequency questions about billions of items in a few kilobytes, by accepting a small error that you can predict and tune.',
  minutes: 15,
  prerequisites: ['caching', 'back-of-the-envelope'],
  outcomes: [
    'Explain how a Bloom filter answers “definitely not” or “maybe”, and size one for a target false-positive rate.',
    'Use HyperLogLog to count distinct items and a Count-Min Sketch to find the most frequent ones, and say what error each makes.',
    'Decide when an approximate answer is good enough, and pick the structure that fits the question.',
  ],
  analogy: {
    title: 'A bouncer with a fuzzy guest list',
    body: 'A bouncer at a huge party cannot memorize ten thousand names. Instead, he carries a card of numbered boxes, and for each guest the host has ticked three boxes picked from the name: one by its first letter, one by its last, one by its length.\n\nIf any of an arrival’s three boxes is blank, that person is definitely not on the list. If all three are ticked, they are probably a guest, though a stranger whose boxes other guests happened to tick can slip in. He never turns away a real guest, and the card fits in his pocket.',
  },
  whyItMatters:
    'Snapgram now has about 30 million daily users, and three new features hit the same wall: [[memory|main-memory]].\n\nThe feed should skip photos Maya has already scrolled past, but a month of history is about 6,000 photo identifiers (IDs) per user, or 180 billion user-and-photo pairs: about 3 terabytes (ballpark). Counting a popular photo’s 2 million distinct viewers means remembering every one of them, 16 MB for one number. And the trending tab wants the most used hashtags this hour, out of millions.\n\nNone of these has to be exact. Nobody minds if the feed skips 1 unseen photo in 100, or if a photo shows 2.01 million viewers instead of 2 million.',
  body: [
    { kind: 'heading', text: 'Trading accuracy for memory' },
    {
      kind: 'prose',
      md: 'An exact answer needs memory that grows with every item, because you must remember each item to know whether you have seen it. A [[probabilistic data structure|probabilistic-data-structure]] keeps a small, fixed-size summary instead, often called a [[sketch|sketch]], and accepts an error that you choose up front.',
    },
    { kind: 'heading', text: 'Bloom filters: definitely not, or maybe' },
    {
      kind: 'prose',
      md: 'A [[Bloom filter|bloom-filter]] answers one question: is this item in the set? It is a [[bit array|bit-array]] of m bits, all starting at 0, plus k [[hash functions|hash-function]], each turning an item into a position in the array.\n\n- **To add an item,** hash it k ways and set those k bits to 1.\n- **To check an item,** look at the same k bits. If any is 0, the item was ==definitely never added==, since adding it would have set that bit; if all are 1, it is maybe in the set.',
    },
    {
      kind: 'prose',
      md: 'It is only maybe because items share bits, and other items can happen to cover all k of a stranger’s positions: a [[false positive|false-positive]]. A [[false negative|false-negative]] cannot happen, because bits are only ever set, never cleared.',
    },
    {
      kind: 'diagram',
      title: 'A Bloom filter in front of the seen log',
      caption: 'Maya’s feed drops photos she has already seen. Step through the checks and a new view.',
      spec: seenFilter,
    },
    { kind: 'heading', text: 'Sizing a Bloom filter' },
    {
      kind: 'prose',
      md: 'With m bits, n items and k hash functions, the false-positive rate is about `(1 − e^(−kn/m))^k`, roughly the share of bits set to 1, raised to the power k. Two rules of thumb follow.\n\n- **Bits per item set the rate.** About 9.6 bits per item gives 1%, and each extra 4.8 or so cuts it tenfold.\n- **The best k is about 0.7 × bits per item:** 7 hash functions at 9.6 bits. Fewer check too few bits; more fill the array too fast.',
    },
    {
      kind: 'prose',
      md: 'A filter given more items than planned just gets worse: one sized for 1% that ends up with twice the items says maybe to about 16% of strangers. A plain Bloom filter also cannot delete an item, since its bits may belong to others. Databases built on [[log-structured merge trees|lsm-tree]] often keep one filter per [[SSTable|sstable]] file, to skip files that cannot hold a key.',
    },
    { kind: 'heading', text: 'HyperLogLog: counting distinct items' },
    {
      kind: 'prose',
      md: '[[HyperLogLog|hyperloglog]] estimates [[cardinality|cardinality]], the number of distinct items, without storing any of them. Hash each viewer ID to random-looking bits: half the hashes start with 0, a quarter with 00, and about one in a thousand with ten 0s. So if the longest run of leading zeros you have seen is 10, you have probably seen about a thousand viewers, and a repeat viewer changes nothing, because the same ID gives the same hash.',
    },
    {
      kind: 'prose',
      md: 'One run is a noisy guess, so HyperLogLog splits the hashes into thousands of buckets, keeps the longest run in each, and averages them. In [Redis’s implementation](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/), each counter takes at most 12 KB, with a [[standard error|standard-error]] of 0.81%, and counters merge, so hourly viewer counts combine into a daily one.',
    },
    { kind: 'heading', text: 'Count-Min Sketch: counts and top K' },
    {
      kind: 'prose',
      md: 'For trending hashtags you need how often, not just whether. A [[Count-Min Sketch|count-min-sketch]] is a small table of counters with a few rows, each with its own hash function: counting a hashtag adds 1 to the counter its hash picks in every row, and its estimate is the smallest of those counters.',
    },
    {
      kind: 'annotated',
      title: 'A Count-Min Sketch with 3 rows of 8 counters',
      caption: 'After 5 posts tagged #sunset, 3 tagged #beach and 1 tagged #coffee.',
      lines: [
        { code: 'row 1   0 0 6 0 0 3 0 0', note: '#sunset and #coffee share counter 2: 5 + 1 = 6.' },
        { code: 'row 2   0 3 0 0 1 0 5 0', note: 'No collisions in this row.' },
        { code: 'row 3   8 0 0 0 0 0 0 1', note: '#sunset and #beach share counter 0: 5 + 3 = 8.' },
        { code: '#sunset: min(6, 5, 8) = 5', note: 'Row 2 was clean, so the minimum is exact.' },
        { code: '#cats:   min(3, 3, 8) = 3', note: 'Never posted, yet estimated at 3: all its counters are shared.' },
      ],
    },
    {
      kind: 'prose',
      md: 'Collisions only add, so an estimate can be too high but never too low. For a [[top-K|top-k]] list such as the 10 hottest hashtags, keep a small list beside the sketch: after counting a hashtag, read its estimate, and if it beats the smallest entry, it takes that place. A fresh sketch every hour keeps “trending” about now.',
    },
    {
      kind: 'diagram',
      title: 'Counting views and hashtags',
      caption: 'One worker feeds both sketches from the activity stream.',
      spec: counting,
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'This lesson skips HyperLogLog’s corrections for very small and very large counts, counts that fade over time, and cousins such as counting Bloom filters and cuckoo filters, which can delete, and scalable Bloom filters, which grow.',
    },
  ],
  tryIt: [
    {
      kind: 'simulator',
      id: 'bloom-filter',
      preset: { bits: 128, hashes: 3, photos: 20 },
      intro:
        'Now build Maya’s filter yourself. It starts with 20 photos she has seen in a 128-bit array, with 3 hash functions. Add photos, check photos she has never seen, and change the size and the number of hash functions; the observed rate comes from checking 10,000 photos that were never added.',
    },
  ],
  tradeoffs: {
    caption: 'Exact data versus the three structures.',
    rows: [
      {
        option: 'Exact set or counter',
        goodAt: 'Exact; can list, delete and update items.',
        badAt: 'Memory grows with every item.',
        pickWhen: 'The data fits in memory, or the number must be exact, such as money.',
      },
      {
        option: 'Bloom filter',
        goodAt: 'Membership in about 10 bits per item at 1%; never misses an item it holds.',
        badAt: 'False positives; cannot delete or list; sized in advance.',
        pickWhen: 'A fast “definitely not” saves a costly lookup.',
      },
      {
        option: 'HyperLogLog',
        goodAt: 'Distinct counts into the billions in kilobytes; counters merge.',
        badAt: 'About 1% error; cannot say whether a given item was counted.',
        pickWhen: 'Unique viewers, visitors or searches.',
      },
      {
        option: 'Count-Min Sketch',
        goodAt: 'Frequencies and top-K lists in fixed memory.',
        badAt: 'Overcounts, worst for rare items; needs a side list for the top items.',
        pickWhen: 'Trending hashtags, heavy users or [[hot keys|hot-key]].',
      },
    ],
  },
  realWorld: {
    title: 'Bloom filters in Apache Cassandra',
    body: 'Apache Cassandra stores data on disk in files called SSTables, and a read may need several of them. Its documentation explains that Cassandra keeps a Bloom filter for each SSTable so it does not have to check every data file for the partition it wants: a filter that says no lets it skip that file.\n\nThe false-positive chance is a per-table setting, `bloom_filter_fp_chance`: 0.01 by default, or 0.1 with leveled compaction. A filter at 0.01 needs about three times the memory of one at 0.1, the documentation notes.',
    sourceUrl: 'https://cassandra.apache.org/doc/latest/cassandra/managing/operating/bloom_filters.html',
    sourceLabel: 'Apache Cassandra documentation, “Bloom filters”',
  },
  interview: {
    whenToMention:
      'When a design asks membership, unique-count or frequency questions about more items than fit in memory, such as hiding seen posts, unique visitors or trending topics. Raise it after your [[back-of-the-envelope|back-of-the-envelope]] estimate shows the exact version is too big, and say what error the product can live with.',
    sayItLikeThis: [
      'To hide seen photos, I’d keep a Bloom filter per user: about 10 bits per photo for 1% false positives, and a false positive only skips one photo.',
      'For unique viewers, a HyperLogLog in [[Redis|redis]] takes at most 12 KB per photo, with under 1% error.',
      'For trending hashtags, a Count-Min Sketch per hour plus a top 10 list: it may overcount a little, but never undercounts.',
    ],
    followUps: [
      {
        q: 'Can you delete from a Bloom filter?',
        a: 'Not from a plain one: its bits may also belong to other items, so clearing them creates false negatives. I’d use a counting Bloom filter or a cuckoo filter, or rebuild the filter regularly.',
      },
      {
        q: 'What if the filter gets more items than planned?',
        a: 'False positives climb fast: a filter sized for 1% that holds twice its planned items is at about 16%. I’d size for growth, rebuild it bigger, or use a scalable filter that adds a new one as it fills.',
      },
      {
        q: 'Why does a Count-Min Sketch overcount but never undercount?',
        a: 'Every count adds to one counter per row and nothing subtracts, so other items can push a shared counter up but never down. Each of an item’s counters is at least its true count, and the smallest is the best estimate.',
      },
    ],
    redFlags: [
      'Treating a Bloom filter’s maybe as a yes when a wrong yes is costly, such as rejecting a username without checking the database.',
      'Claiming a Bloom filter can miss an item it holds, or that you can simply delete from it.',
      'Counting unique viewers by storing every viewer ID per photo, without estimating the memory.',
    ],
  },
  mistakes: [
    '**Sizing for today.** A filter sized for a million items at 1% that ends up with five million says maybe to about 83% of strangers.',
    '**Deleting by clearing bits.** Other items may share those bits, so clearing them creates false negatives.',
    '**Piling on hash functions.** Past about 0.7 × bits per item, each extra hash fills the array faster and false positives rise.',
    '**Approximate where exact is required.** Balances, payments and anything a user can dispute need exact counts.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Maya’s Bloom filter says photo 42 is not in her seen set. What do you know?',
      options: [
        {
          text: 'She has definitely never seen it',
          correct: true,
          why: 'A 0 bit means the photo was never added, because adding it would have set every one of its bits.',
        },
        {
          text: 'She probably has not seen it, with a 1% chance that she has',
          correct: false,
          why: 'The error only goes the other way: a Bloom filter can wrongly say maybe, but never wrongly say no.',
        },
        { text: 'She has seen it', correct: false, why: 'A no from the filter is certain; only a maybe can be wrong.' },
        {
          text: 'Nothing, until you check the database',
          correct: false,
          why: 'Skipping that check is the whole point: a no needs no confirmation.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'Snapgram sizes each user’s seen filter for 6,000 photos at 1% false positives, which takes about 9.6 bits per photo. Roughly how many kilobytes is one user’s filter?',
      answer: 7.2,
      unit: 'KB',
      tolerance: 1.2,
      solution: [
        '6,000 photos × 9.6 bits = 57,600 bits.',
        '57,600 bits ÷ 8 = 7,200 bytes.',
        'That is about 7.2 KB, against 48 KB for 6,000 eight-byte IDs (identifiers).',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which questions can a HyperLogLog answer?',
      options: [
        {
          text: 'About how many different people viewed this photo today',
          correct: true,
          why: 'That is a distinct count, exactly what HyperLogLog estimates.',
        },
        {
          text: 'About how many different people viewed either of two photos',
          correct: true,
          why: 'Merging two counters gives the distinct count of both sets together.',
        },
        {
          text: 'Whether Maya viewed this photo',
          correct: false,
          why: 'It keeps no items, only a summary of their hashes, so it cannot answer for one viewer. That needs a set or a Bloom filter.',
        },
        {
          text: 'Which hashtag was used most this hour',
          correct: false,
          why: 'That is a frequency question, which needs a Count-Min Sketch or exact counters.',
        },
      ],
    },
    {
      kind: 'single',
      prompt: 'A Count-Min Sketch estimates that #sunset was used 1,040 times this hour. What can you say about the true count?',
      options: [
        { text: 'It is at most 1,040', correct: true, why: 'Collisions only add to counters, so the estimate can be high but never low.' },
        { text: 'It is at least 1,040', correct: false, why: 'That would mean the sketch undercounts, which it never does.' },
        {
          text: 'It is exactly 1,040',
          correct: false,
          why: 'Only if one of its counters had no collisions, and the sketch cannot tell you whether that happened.',
        },
        { text: 'It could be higher or lower', correct: false, why: 'The error goes only one way: up.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of checking an item in a Bloom filter in order.',
      items: [
        'Hash the item with each of the k hash functions',
        'Turn each hash into a position in the bit array',
        'Read the bit at each position',
        'If any bit is 0, answer definitely not',
        'If every bit is 1, answer maybe',
      ],
      why: 'Checking repeats the hashing used when adding, so an added item always finds its own bits set. Only the last answer can be wrong, when other items happened to set all k bits.',
    },
  ],
  takeaways: [
    'Probabilistic data structures trade a small, predictable error for tiny, fixed memory, which makes questions about billions of items cheap.',
    'A Bloom filter answers definitely not or maybe; about 9.6 bits per item and 7 hash functions give 1% false positives.',
    'HyperLogLog counts distinct items in kilobytes, and a Count-Min Sketch estimates frequencies for top-K lists, overcounting but never undercounting.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Where the numbers come from.** After n items, each bit is still 0 with probability about `e^(−kn/m)`, so a stranger finds all k of its bits set with probability about `(1 − e^(−kn/m))^k`. The best k is `(m ÷ n) × ln 2`, and then you need `−ln p ÷ (ln 2)²` bits per item: 9.6 for 1%, as [Redis’s Bloom filter guide](https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/) also lists.',
    },
    {
      kind: 'prose',
      md: '**Two hashes are enough.** Computing k separate hashes is slow, so many libraries compute two and derive the rest as h1 + i × h2. This trick, called double hashing, gives nearly the same false-positive rate.',
    },
    {
      kind: 'prose',
      md: '**Count-Min Sketch error.** With w counters per row and d rows, an estimate exceeds the true count by at most about 2.72 ÷ w of the total, with probability at least `1 − e^(−d)`. Five rows of 2,720 counters stay within 0.1% of the total about 99% of the time, in about 54 KB.',
    },
  ],
  flashcards: [
    {
      front: 'What can a Bloom filter tell you?',
      back: 'That an item is definitely not in the set, or maybe in it. It never misses an item it holds, but it can say maybe for one it does not.',
    },
    { front: 'How many bits per item does a Bloom filter need for 1% false positives?', back: 'About 9.6, with 7 hash functions. About 4.8 more bits per item cut the rate tenfold.' },
    {
      front: 'How do you choose the number of hash functions?',
      back: 'About (m ÷ n) × ln 2, roughly 0.7 times the bits per item. Fewer check too few bits; more fill the array too fast.',
    },
    { front: 'Why can you not delete from a plain Bloom filter?', back: 'Bits are shared between items, so clearing one item’s bits can erase another’s and create false negatives.' },
    { front: 'What does HyperLogLog estimate, and at what cost?', back: 'The number of distinct items, in fixed memory: Redis uses at most 12 KB per counter, with a 0.81% standard error.' },
    {
      front: 'Why does a Count-Min Sketch never undercount?',
      back: 'Counts only add, and collisions only push counters up, so each of an item’s counters is at least its true count; the smallest is the estimate.',
    },
    {
      front: 'How do you track the top K items with a Count-Min Sketch?',
      back: 'After counting each item, read its estimate, and keep a small list of the K items with the highest estimates.',
    },
  ],
  related: ['caching', 'back-of-the-envelope', 'indexes', 'rate-limiting', 'batch-vs-stream', 'feed-fanout'],
  glossaryTerms: [
    'main-memory',
    'probabilistic-data-structure',
    'sketch',
    'bloom-filter',
    'bit-array',
    'hash-function',
    'false-positive',
    'false-negative',
    'source-of-truth',
    'lsm-tree',
    'sstable',
    'hyperloglog',
    'cardinality',
    'standard-error',
    'count-min-sketch',
    'top-k',
    'event-stream',
    'hot-key',
    'back-of-the-envelope',
    'redis',
  ],
};

export default lesson;
