import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Writes reach the database first; an indexer keeps the search index in step. Searches read the index. */
const indexing: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Maya’s phone', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 0 },
    { id: 'search', type: 'search', label: 'Search index', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'photos and captions', x: 1, y: 1 },
    { id: 'queue', type: 'queue', label: 'Change queue', x: 2, y: 1 },
    { id: 'indexer', type: 'worker', label: 'Indexer', x: 3, y: 1 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
    { id: 'app-queue', from: 'app', to: 'queue', kind: 'async' },
    { id: 'queue-indexer', from: 'queue', to: 'indexer', kind: 'async' },
    { id: 'indexer-search', from: 'indexer', to: 'search', kind: 'sync' },
    { id: 'app-search', from: 'app', to: 'search', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Maya posts a photo captioned “Beach sunset with Maya”. The **app server** saves it in the **database**, which stays the [[source of truth|source-of-truth]].',
      flow: ['phone-app', 'app-db', '<app-db', '<phone-app'],
    },
    {
      caption: 'The app also publishes a “caption saved” event to a **queue**, as in the previous lesson. Maya’s post doesn’t wait for indexing.',
      flow: ['app-queue'],
    },
    {
      caption: 'The **indexer** takes the event and tokenizes the caption: beach, sunset, maya. “With” is a stop word, so it is dropped.',
      flow: ['queue-indexer'],
      notes: [{ target: 'indexer', text: 'beach, sunset, maya', tone: 'signal' }],
    },
    {
      caption: 'It adds photo 3 to the posting lists for beach, sunset and maya in the **search index**. About a second after posting, the photo can be found.',
      flow: ['indexer-search'],
      notes: [{ target: 'search', text: 'photo 3 added', tone: 'plain' }],
    },
    {
      caption: 'Searches go to the search index, not the database. “sunset beach” is two lookups and a merge: a few milliseconds, however many captions exist.',
      flow: ['phone-app', 'app-search', '<app-search', '<phone-app'],
      notes: [{ target: 'search', text: '≈ 5 ms', tone: 'signal' }],
    },
  ],
};

/** One search: matches from the index, details from the database. */
const searchRequest: SequenceSpec = {
  actors: [
    { id: 'phone', type: 'client', label: 'Maya’s phone' },
    { id: 'app', type: 'service', label: 'App server' },
    { id: 'search', type: 'search', label: 'Search index' },
    { id: 'db', type: 'sqlDb', label: 'Database' },
  ],
  messages: [
    { from: 'phone', to: 'app', label: 'search “sunset beach”', kind: 'sync', caption: 'Maya searches for “sunset beach”.' },
    { from: 'app', to: 'search', label: 'photos with sunset and beach', kind: 'sync', caption: 'The app asks the search index for photos that contain both words.' },
    {
      from: 'search',
      to: 'app',
      label: 'photos 3, 41, 97',
      kind: 'reply',
      caption: 'The index intersects the two posting lists, ranks the matches and returns the best photo numbers. It never reads a caption.',
    },
    { from: 'app', to: 'db', label: 'get photos 3, 41, 97', kind: 'sync', caption: 'The app fetches just those photos from the database by their numbers: three quick lookups.' },
    {
      from: 'db',
      to: 'app',
      label: 'photo details',
      kind: 'reply',
      caption: 'The database returns the current details, so a photo deleted a moment ago can be left out.',
    },
    { from: 'app', to: 'phone', label: 'results', kind: 'reply', caption: 'Maya sees her results well within a second, ballpark.' },
  ],
};

const lesson: Lesson = {
  id: 'search-inverted-indexes',
  module: 'm3',
  order: 11,
  title: 'Search and inverted indexes',
  idea: 'To search text quickly, read every document once, when it is saved, and keep a map from each word to the documents that contain it, so a search becomes a few lookups instead of a scan.',
  minutes: 14,
  prerequisites: ['indexes'],
  outcomes: [
    "Explain why `LIKE '%term%'` gets slower as a table grows.",
    'Build an inverted index by hand: tokenize, drop stop words and record posting lists.',
    'Describe how a search engine ranks results and stays in sync with the database.',
  ],
  analogy: {
    title: 'The index of a cookbook',
    body: 'Looking for a recipe with leeks, you don’t read the cookbook from page one. You turn to the index at the back, find “leeks: pages 12, 87, 203” and go straight there. Someone built that index once, by going through every recipe and noting where each ingredient appears.\n\nWant leeks and potatoes? Look up both entries and keep the pages that appear in both lists. The index is built once and used by every reader, and it gets a new line whenever a recipe is added.',
  },
  whyItMatters:
    "Snapgram users want to search captions and hashtags: “sunset”, “#goldenhour”, “Maya’s birthday”. The first version is one line of [[Structured Query Language|sql]] (SQL): `SELECT * FROM photos WHERE caption LIKE '%sunset%'`. On the test database, with a few thousand photos, it answers instantly.\n\nIn production the photos table has hundreds of millions of rows. Each search now takes many seconds and keeps the database busy the whole time, so a few people searching at once slow down every other page. And the results aren’t even good: nothing says which match is best.",
  body: [
    {
      kind: 'prose',
      md: "Why so slow? A normal database [[index|index]], usually a [[B-tree|b-tree]], keeps values sorted, like names in a phone book. That helps when you know how a value starts, so `LIKE 'sunset%'` can use it. A pattern that starts with a wildcard could match anywhere in the text, so the database falls back to a [[full table scan|full-table-scan]]: it reads every [[row|row]] and checks every caption, character by character.",
    },
    {
      kind: 'numbers',
      caption: 'Ballpark numbers for one search. Real scans are often slower, because the database has other work to do at the same time.',
      items: [
        { label: 'Captions in the photos table', value: '≈ 300 million' },
        { label: 'Average caption', value: '≈ 100 bytes' },
        { label: 'Text one search must read', value: '≈ 30 GB' },
        { label: 'Time to read it, at about 1 GB/s', value: '≈ 30 s' },
        { label: 'One word looked up in an inverted index', value: '≈ 1–10 ms' },
      ],
    },
    { kind: 'heading', text: 'Build the index once' },
    {
      kind: 'prose',
      md: '[[Full-text search|full-text-search]] flips the work around. Instead of reading every caption at search time, you read each caption once, when it is saved, and record which words it contains. The result is an [[inverted index|inverted-index]]: a map from each word to the photos that contain it, like the index at the back of a book.\n\nBuilding it starts with [[tokenization|tokenization]]: lowercase the text, split it on spaces and punctuation, and drop [[stop words|stop-word]] such as “the” and “with”, which appear everywhere and help no search. Each remaining word, or token, gets an entry, and the photo’s number joins that word’s [[posting list|posting-list]], kept in sorted order.',
    },
    {
      kind: 'diagram',
      title: 'Indexing a caption, then searching it',
      caption: 'Writes go to the database first, and the index catches up a moment later. Use Play, or the arrow keys.',
      spec: indexing,
    },
    { kind: 'heading', text: 'Look up, then intersect' },
    {
      kind: 'prose',
      md: 'A search runs the query through the same tokenizer and looks up each word. For “sunset beach” that is two lookups, then an intersection: walk the two sorted lists side by side and keep the photos on both. No caption is read, so the cost depends on how many photos match, not on how many exist.',
    },
    {
      kind: 'sequence',
      title: 'One search, two systems',
      caption: 'The index finds the matches; the database supplies the details.',
      spec: searchRequest,
    },
    { kind: 'heading', text: 'Ranking the results' },
    {
      kind: 'prose',
      md: 'A popular word can match millions of photos, so the order matters as much as the matching. Search engines give each match a [[relevance score|relevance-score]]: higher when the query words appear often in that caption, and higher when those words are rare overall, because a rare word like “goldenhour” says more than a common one like “photo”. The classic formula is TF-IDF (term frequency–inverse document frequency); most engines now use a refined version called BM25, and add signals such as freshness and likes.',
    },
    { kind: 'heading', text: 'Where the index lives' },
    {
      kind: 'prose',
      md: 'You can build this inside the database: PostgreSQL, for example, offers a Generalized Inverted Index (GIN) for full-text search. At Snapgram’s size, teams usually run a separate [[search engine|search-engine]], such as Elasticsearch or OpenSearch, which spreads the index over many machines by [[sharding|sharding]] it. An indexer copies every change into it through a [[message queue|message-queue]], so search results trail the database by a second or two.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real search engines also handle [[stemming|stemming]], so “beaches” finds “beach”, along with synonyms, typos and exact phrases, which need each word’s position. They also compress posting lists and merge index files in the background.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'inverted-index',
      title: 'Build an inverted index',
      caption: 'Step through four Snapgram captions: tokenize each one, add it to the index, then run the search. Type your own search to see which lists get intersected.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to search captions, compared.',
    rows: [
      {
        option: "`LIKE '%term%'` in the database",
        goodAt: 'Nothing new to run, and always up to date.',
        badAt: 'Scans every row, so it slows as the table grows; no ranking and no sense of words.',
        pickWhen: 'Small tables, or admin tools that search rarely.',
      },
      {
        option: 'Full-text index in the database',
        goodAt: 'Real word search and basic ranking, inside the database you already run.',
        badAt: 'Slows down writes, and search load competes with everything else the database does.',
        pickWhen: 'Moderate data and traffic, and you want one system to operate.',
      },
      {
        option: 'Separate search engine',
        goodAt: 'Fast ranked search over billions of documents, with stemming, typo tolerance and many shards.',
        badAt: 'Another system to run, and results trail the database by a second or so.',
        pickWhen: 'Search is a core feature at large scale.',
      },
    ],
  },
  realWorld: {
    title: 'Why PostgreSQL says pattern matching isn’t search',
    body: 'PostgreSQL’s documentation on full text search explains why its pattern operators, such as `LIKE`, fall short. They have no linguistic support, so a search for “satisfy” misses “satisfies”. They provide no ranking, which makes them ineffective when thousands of documents match, and they tend to be slow because there is no index support, so they must process all documents for every search.\n\nIts answer is to preprocess documents ahead of time: parse them into tokens, normalize the tokens, for example by lowercasing and removing suffixes, and drop stop words that are too common to be useful. The result is saved in an index for rapid searching later.',
    sourceUrl: 'https://www.postgresql.org/docs/current/textsearch-intro.html',
    sourceLabel: 'PostgreSQL documentation, “Full Text Search: Introduction”',
  },
  interview: {
    whenToMention:
      'Whenever the product needs text search over captions, product names, messages or logs. Say that the database stays the source of truth, a search engine holds an inverted index fed by change events, and results can lag by a second or two.',
    sayItLikeThis: [
      "A `LIKE '%term%'` query can’t use a normal index, so it scans every row. For caption search I’d keep an inverted index in a search engine such as Elasticsearch.",
      'Writes go to the database first; a change event goes on a queue, and an indexer updates the search index, so search trails by a second or two, which is fine for captions.',
    ],
    followUps: [
      {
        q: 'How does a two-word search work inside the index?',
        a: 'Tokenize the query the same way as the documents, fetch each word’s posting list, and intersect the sorted lists by walking them side by side, starting with the shortest. Then score the matches and return the top few.',
      },
      {
        q: 'How do you keep the search index in sync with the database?',
        a: 'The database stays the source of truth. Every change is published as an event, through a queue or the database’s change log, and indexers apply it, with idempotent updates so replays are safe. A periodic rebuild repairs anything that slipped through.',
      },
      {
        q: 'How would you scale search to billions of captions?',
        a: 'Shard the index: split the documents across many machines, send each query to every shard, and merge their top results. Replicas of each shard add query capacity and survive machine failures.',
      },
    ],
    redFlags: [
      "Calling `LIKE '%term%'` on a huge table a search feature.",
      'Making the search engine the only copy of the data.',
      'Not saying how new and edited captions reach the index.',
    ],
  },
  mistakes: [
    '**Scanning with LIKE.** A leading wildcard can’t use a normal index, so every search reads every row.',
    '**Tokenizing documents and queries differently.** If captions are lowercased and queries aren’t, a search for “Sunset” finds nothing.',
    '**Treating the search index as the source of truth.** It is a copy that trails the database, and you should be able to rebuild it.',
    '**Ignoring ranking.** When thousands of captions match, returning them in random order is barely better than nothing.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: "Why can’t the database use a normal B-tree index for `LIKE '%sunset%'`?",
      options: [
        {
          text: 'The match could start anywhere, but a B-tree is sorted by how values begin',
          correct: true,
          why: 'A sorted index helps only when you know the first characters. With a leading wildcard, every row must be checked.',
        },
        { text: 'B-trees can’t store text', correct: false, why: "They store text fine, in sorted order, which is why `LIKE 'sunset%'` can use one." },
        { text: 'The pattern is too long', correct: false, why: 'Length isn’t the issue; the wildcard at the start is.' },
        { text: 'Indexes only work on numbers', correct: false, why: 'Indexes work on text, dates and numbers alike.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the steps of indexing one caption in order.',
      items: ['Lowercase the caption', 'Split it on spaces and punctuation', 'Drop the stop words', 'Add the photo to each remaining word’s posting list'],
      why: 'Lowercasing and splitting turn the text into words, stop words are removed, and only then does each word’s posting list get the photo.',
    },
    {
      kind: 'multi',
      prompt:
        'Photo 1 says “Sunset over the bay”, photo 2 “Morning coffee on the beach” and photo 3 “Beach sunset with Maya”. Which photos match a search for “sunset beach”, if every word must match?',
      options: [
        { text: 'Photo 1', correct: false, why: 'It contains sunset but not beach.' },
        { text: 'Photo 2', correct: false, why: 'It contains beach but not sunset.' },
        {
          text: 'Photo 3',
          correct: true,
          why: 'It is on both posting lists, sunset (1, 3) and beach (2, 3), so it survives the intersection.',
        },
      ],
    },
    {
      kind: 'numeric',
      prompt:
        "Snapgram has 300 million captions of about 100 bytes each, and a scan reads about 1 GB per second. Roughly how many seconds does one `LIKE '%sunset%'` search take?",
      answer: 30,
      unit: 'seconds',
      tolerance: 1.2,
      solution: [
        '300 million × 100 bytes = 30 billion bytes, about 30 GB.',
        '30 GB ÷ 1 GB per second = 30 seconds.',
        'The inverted index reads only the posting list for “sunset”, so it answers in milliseconds.',
      ],
    },
    {
      kind: 'single',
      prompt: 'Two captions both contain “sunset”. Which one usually ranks higher for a search on “sunset”?',
      options: [
        {
          text: 'A short caption that says “sunset” twice',
          correct: true,
          why: 'The word makes up more of that caption, which is the term-frequency half of relevance.',
        },
        {
          text: 'The caption that was indexed first',
          correct: false,
          why: 'Indexing order has nothing to do with relevance, though some engines add freshness as a separate signal.',
        },
        {
          text: 'A long caption that mentions “sunset” once among many other words',
          correct: false,
          why: 'Engines adjust for length, so one mention in a long caption counts for less.',
        },
        { text: 'The caption with the most stop words', correct: false, why: 'Stop words are dropped before scoring, so they can’t help a caption rank.' },
      ],
    },
    {
      kind: 'single',
      prompt: 'Maya edits a caption. When can searches find the new words?',
      options: [
        {
          text: 'A second or two later, once the indexer applies the change',
          correct: true,
          why: 'The edit goes to the database first, and the search index catches up through the queue.',
        },
        { text: 'Instantly, because every search reads the database', correct: false, why: 'Searches read the search index, which is a copy that trails the database.' },
        {
          text: 'Only after a nightly rebuild of the whole index',
          correct: false,
          why: 'Indexers apply changes continuously. Full rebuilds are for repairs, not everyday edits.',
        },
        { text: 'Never, because indexes can’t be updated', correct: false, why: 'Posting lists change all the time; adding a photo to them is the normal case.' },
      ],
    },
  ],
  takeaways: [
    "A pattern search like `LIKE '%term%'` has to scan every row, so it slows down as the table grows.",
    'An inverted index maps each word to a sorted list of documents, so a search is a few lookups and an intersection.',
    'Keep the database as the source of truth and feed a search engine through change events, accepting a second or two of lag.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Phrases need positions.** To match the exact phrase “sunset beach”, the index also stores where each word appears in each caption, then checks that “beach” comes right after “sunset”.',
    },
    {
      kind: 'prose',
      md: '**Fast merges.** Engines start with the shortest posting list and skip through the longer ones in big jumps instead of comparing every entry. They also compress lists by storing the gaps between sorted numbers, so more of them fit in memory.',
    },
    {
      kind: 'prose',
      md: '**Inside PostgreSQL.** Its Generalized Inverted Index is an inverted index, and the documentation warns that updating one tends to be slow, because inserting one row can add many keys, one for each word it contains.',
    },
  ],
  flashcards: [
    { front: "Why doesn’t `LIKE '%term%'` scale?", back: 'A leading wildcard can’t use a normal sorted index, so the database scans and checks every row.' },
    { front: 'What is an inverted index?', back: 'A map from each word to the sorted list of documents that contain it.' },
    { front: 'What does tokenization do?', back: 'It lowercases text, splits it on spaces and punctuation, and drops stop words, leaving the words to index.' },
    { front: 'How does a two-word search use the index?', back: 'It looks up both posting lists and intersects them, keeping the documents on both.' },
    { front: 'What makes a search result more relevant?', back: 'Query words that appear often in it but rarely across all documents; engines also add signals such as freshness.' },
    {
      front: 'How does a search index stay in sync with the database?',
      back: 'Every change is published as an event, and an indexer updates the index, usually a second or two behind.',
    },
  ],
  related: ['indexes', 'queues-and-streams', 'sharding', 'denormalization', 'cqrs-event-sourcing'],
  glossaryTerms: [
    'sql',
    'index',
    'b-tree',
    'full-table-scan',
    'row',
    'full-text-search',
    'inverted-index',
    'tokenization',
    'stop-word',
    'posting-list',
    'source-of-truth',
    'relevance-score',
    'search-engine',
    'sharding',
    'message-queue',
    'stemming',
  ],
};

export default lesson;
