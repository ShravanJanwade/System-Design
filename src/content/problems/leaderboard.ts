import type { DiagramSpec, Problem } from '../types';

/** v1: one service and one database with an index on score. */
const v1: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'game', type: 'service', label: 'Game servers', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'Leaderboard service', x: 1, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Scores database', sublabel: 'index on score', x: 2, y: 0 },
    { id: 'players', type: 'client', label: 'Players', x: 0, y: 1 },
  ],
  edges: [
    { id: 'game-app', from: 'game', to: 'app', kind: 'sync' },
    { id: 'players-app', from: 'players', to: 'app', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'A match ends. Each game server sends every player’s points to the **leaderboard service**, which adds them to that player’s row in the **scores database**, where the score column is indexed.',
      flow: ['game-app', 'app-db', '<app-db', '<game-app'],
    },
    {
      caption: 'The top 100 is easy: the database walks the score index from the top and stops after 100 rows.',
      flow: ['players-app', 'app-db', '<app-db', { edge: 'players-app', reverse: true, tag: 'top 100' }],
    },
    {
      caption:
        'A player’s own rank is not. The database must count every player with a higher score, which for a player in 50 millionth place means 50 million index entries: seconds of work, and thousands of players ask every second.',
      flow: ['players-app', 'app-db'],
      notes: [{ target: 'db', text: 'counts 50 million rows', tone: 'alert' }],
    },
  ],
};

/** v2: results flow through a stream into a durable table and an in-memory sorted set. */
const v2: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'game', type: 'service', label: 'Game servers', x: 0, y: 0 },
    { id: 'stream', type: 'stream', label: 'Result events', sublabel: 'by player', x: 1, y: 0 },
    { id: 'updater', type: 'worker', label: 'Score updater', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Scores database', sublabel: 'source of truth', x: 3, y: 0 },
    { id: 'players', type: 'client', label: 'Players', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'Leaderboard service', x: 1, y: 1 },
    { id: 'zset', type: 'cache', label: 'Sorted set', sublabel: 'Redis, one per season', x: 2, y: 1 },
  ],
  edges: [
    { id: 'game-stream', from: 'game', to: 'stream', kind: 'async' },
    { id: 'stream-updater', from: 'stream', to: 'updater', kind: 'async' },
    { id: 'updater-db', from: 'updater', to: 'db', kind: 'sync' },
    { id: 'updater-zset', from: 'updater', to: 'zset', kind: 'sync', label: 'new total' },
    { id: 'players-app', from: 'players', to: 'app', kind: 'sync' },
    { id: 'app-zset', from: 'app', to: 'zset', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'When a match ends, each game server appends one result event per player to the **result events** stream and moves on: about 6,000 events a second at peak (ballpark). The stream is partitioned by player, so each player’s results stay in order.',
      flow: ['game-stream'],
      notes: [{ target: 'stream', text: '6,000/s at peak' }],
    },
    {
      caption:
        'The **score updater** saves each result and raises the player’s total in the **scores database**, in one transaction keyed by match and player, so a repeated result is ignored. Then it writes the new total into the **sorted set**.',
      flow: ['stream-updater', 'updater-db', '<updater-db', 'updater-zset'],
    },
    {
      caption:
        'The sorted set keeps players in score order inside a skip list, layers of linked lists that let a search jump far ahead, so finding a rank among 100 million players takes a few dozen steps: microseconds. The **leaderboard service** asks it for the top 100 and for the player’s rank.',
      flow: ['players-app', 'app-zset', '<app-zset', '<players-app'],
      notes: [{ target: 'zset', text: 'microseconds' }],
    },
    {
      caption:
        'The players just above and below are one more range read, ranks r − 5 to r + 5. The top 100 is the same for everyone, so each server caches it for two seconds, and thousands of views a second cost the sorted set a handful of reads.',
      flow: ['players-app', { edge: 'players-app', reverse: true, tag: 'top 100, cached' }],
    },
  ],
};

/** v3: players split across shards by hash; the service merges top lists and sums counts. */
const v3: DiagramSpec = {
  grid: { cols: 5, rows: 3 },
  nodes: [
    { id: 'players', type: 'client', label: 'Players', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'Leaderboard service', sublabel: 'merges shards', x: 1, y: 1 },
    { id: 's1', type: 'cache', label: 'Shard 1', sublabel: 'sorted set', x: 2, y: 0 },
    { id: 's2', type: 'cache', label: 'Shard 2', sublabel: 'sorted set', x: 2, y: 1 },
    { id: 's3', type: 'cache', label: 'Shard 3', sublabel: 'sorted set', x: 2, y: 2 },
    { id: 'updater', type: 'worker', label: 'Score updaters', sublabel: 'one per shard', x: 3, y: 1 },
    { id: 'stream', type: 'stream', label: 'Result events', x: 4, y: 1 },
  ],
  edges: [
    { id: 'players-app', from: 'players', to: 'app', kind: 'sync' },
    { id: 'app-s1', from: 'app', to: 's1', kind: 'sync' },
    { id: 'app-s2', from: 'app', to: 's2', kind: 'sync' },
    { id: 'app-s3', from: 'app', to: 's3', kind: 'sync' },
    { id: 'updater-s1', from: 'updater', to: 's1', kind: 'sync' },
    { id: 'updater-s2', from: 'updater', to: 's2', kind: 'sync' },
    { id: 'updater-s3', from: 'updater', to: 's3', kind: 'sync' },
    { id: 'stream-updater', from: 'stream', to: 'updater', kind: 'async' },
  ],
  // Phones: players over the service on the left, the stream over the updaters on the right, the shards stacked between.
  narrow: {
    grid: { cols: 3, rows: 3 },
    positions: {
      players: { x: 0, y: 0 },
      app: { x: 0, y: 1 },
      s1: { x: 1, y: 0 },
      s2: { x: 1, y: 1 },
      s3: { x: 1, y: 2 },
      stream: { x: 2, y: 0 },
      updater: { x: 2, y: 1 },
    },
  },
  steps: [
    {
      caption:
        'Suppose the game grows to a billion players, or 50,000 score changes a second (ballpark), and one sorted set no longer fits one node. Players are split across shards by a hash of their ID, each shard a sorted set of its own players, and the stream is partitioned the same way, so each shard has exactly one updater.',
      flow: ['stream-updater', { edge: 'updater-s2', tag: 'player 42' }],
    },
    {
      caption:
        'For the top 100, the **leaderboard service** asks every shard for its own top 100 and merges them, since the overall top 100 must be among those 300 players. The answer is cached for two seconds, so each shard sees one such request per server every two seconds.',
      flow: ['players-app', ['app-s1', 'app-s2', 'app-s3'], ['<app-s1', '<app-s2', '<app-s3'], { edge: 'players-app', reverse: true, tag: 'top 100' }],
    },
    {
      caption:
        'For an exact rank, the service asks every shard how many of its players score higher (`ZCOUNT`) and adds one to the sum. That is one fast query per shard, a [[scatter-gather|scatter-gather]] that waits for the slowest shard.',
      flow: ['players-app', ['app-s1', 'app-s2', 'app-s3'], ['<app-s1', '<app-s2', '<app-s3'], { edge: 'players-app', reverse: true, tag: 'rank' }],
    },
    {
      caption:
        'Far down the board, an exact rank isn’t worth a query to every shard. Each shard also keeps a [[histogram|histogram]], the number of its players in each band of scores; the service adds up the bands above the player and answers “top 41%” from a few kilobytes it refreshes every few seconds.',
      flow: ['players-app', { edge: 'players-app', reverse: true, tag: 'top 41%' }],
    },
  ],
};

/** v4: what each failure does to the board. One shard is drawn. */
const v4: DiagramSpec = {
  grid: { cols: 5, rows: 2 },
  nodes: [
    { id: 'players', type: 'client', label: 'Players', x: 0, y: 0 },
    { id: 'app', type: 'service', label: 'Leaderboard service', x: 1, y: 0 },
    { id: 'primary', type: 'cache', label: 'Shard primary', x: 2, y: 0 },
    { id: 'updater', type: 'worker', label: 'Score updater', x: 3, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Scores database', x: 4, y: 0 },
    { id: 'replica', type: 'cache', label: 'Shard replica', sublabel: 'another zone', x: 2, y: 1 },
    { id: 'stream', type: 'stream', label: 'Result events', x: 3, y: 1 },
    { id: 'game', type: 'service', label: 'Game servers', x: 4, y: 1 },
  ],
  edges: [
    { id: 'players-app', from: 'players', to: 'app', kind: 'sync' },
    { id: 'app-primary', from: 'app', to: 'primary', kind: 'sync' },
    { id: 'app-replica', from: 'app', to: 'replica', kind: 'sync' },
    { id: 'primary-replica', from: 'primary', to: 'replica', kind: 'replication' },
    { id: 'updater-primary', from: 'updater', to: 'primary', kind: 'sync' },
    { id: 'updater-db', from: 'updater', to: 'db', kind: 'sync' },
    { id: 'stream-updater', from: 'stream', to: 'updater', kind: 'async' },
    { id: 'game-stream', from: 'game', to: 'stream', kind: 'async' },
  ],
  steps: [
    {
      caption:
        'Each shard’s sorted set has a **shard primary** and a **shard replica** in another zone, and the service may read ranks from either. The **scores database** holds every total durably.',
      focus: ['primary', 'replica', 'primary-replica', 'db'],
      flow: ['players-app', 'app-primary', '<app-primary', '<players-app'],
    },
    {
      caption:
        'The shard primary dies, and its replica is promoted within seconds. Replication is asynchronous, so the last updates may be missing; the updater replays the stream from its saved [[offset|offset]], and because it writes totals instead of adding points, the replay is harmless.',
      fail: ['primary'],
      flow: ['players-app', 'app-replica', '<app-replica', '<players-app'],
      notes: [{ target: 'replica', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        'Both copies are lost, or a bug wrote wrong scores. The updater rebuilds the sorted set from the scores database: 100 million totals at a few hundred thousand a second take about five minutes (ballpark), while the service serves its cached top 100 and the last histograms it fetched.',
      flow: ['updater-db', '<updater-db', 'updater-primary'],
      notes: [{ target: 'db', text: 'every total' }],
    },
    {
      caption:
        'The result stream goes down. Game servers keep each result in a local buffer and retry with the same match identifier, so no points are lost or counted twice; the board simply lags until the stream returns.',
      fail: ['stream'],
      flow: ['players-app', 'app-primary', '<app-primary', '<players-app'],
      notes: [{ target: 'game', text: 'buffering results' }],
    },
  ],
};

const problem: Problem = {
  id: 'leaderboard',
  title: 'Leaderboard',
  tier: 2,
  flagship: false,
  minutes: 45,
  prompt:
    'Design the leaderboard for an online game. Players earn points in matches all season, and each one wants to see the top 100, their own rank, and the players just above and below them.',
  concepts: ['back-of-the-envelope', 'indexes', 'caching', 'sharding', 'probabilistic-structures', 'queues-and-streams', 'idempotency', 'replication'],
  hints: [
    'Start with two numbers: how many players are on one board, and how many scores change each second? Then ask what a player’s rank costs if you have to count everyone ahead of them.',
    'You need a structure that keeps players in score order and can say where one player sits, not just who is on top. Then ask what happens when a match result arrives twice, and when one machine can’t hold everyone.',
    'One shape that works: match results go into a stream; an updater applies each one once to a durable scores table, then writes the new total to an in-memory [[Redis|redis]] sorted set that answers the top 100, a player’s rank and their neighbors; the top 100 is cached for a second or two; and when one sorted set is not enough, players are split across shards, with approximate ranks far down the board.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many players are on one board, and how often do scores change?',
      why: 'This sets the memory and the write rate. Assume about 100 million players with a score this season and 200 million match results a day (ballpark): about 6,000 score changes a second at peak, which one in-memory sorted set can absorb, as long as you plan for the day it fails.',
    },
    {
      q: 'Is a player’s score the sum of all their matches, or their single best result?',
      why: 'A running total means adding points, which counts a result twice if it is applied twice. A best score means keeping the higher of two values, which is safe to repeat, so the answer decides how much care retries need.',
    },
    {
      q: 'Does every player need an exact rank, or is “top 5%” enough far down the board?',
      why: 'Exact ranks for 100 million players need every score in one sorted order, or a count from every shard. If players below the top few thousand see a percentile or a rounded rank, a small summary of how scores are spread answers them, which is far cheaper to split across machines.',
    },
    {
      q: 'How soon after a match must a player see their new rank?',
      why: 'Players look for it on the results screen, so within a few seconds. That rules out recomputing ranks in an hourly batch job, and favors updating an index on every result.',
    },
    {
      q: 'Is there one global board, or also boards per region, per week, or among friends?',
      why: 'Each extra board is another sorted set to update on every result. Friends boards are small enough to build when asked, and weekly boards need a new key each week and an expiry for the old ones.',
    },
    {
      q: 'How are ties ranked?',
      why: 'With whole-number points, thousands of players share a score. If ties go to whoever got there first, the time must become part of the sort key, which changes what you store.',
    },
  ],
  requirements: {
    functional: [
      'Record each match result and update the player’s season score within a few seconds.',
      'Show the top 100 players with their scores.',
      'Show a player’s own rank and score, and the five players just above and below them.',
      'Start each season with an empty board, and keep past seasons’ final standings readable.',
    ],
    nonFunctional: [
      'Fresh: a new score shows up in ranks within about 5 seconds (ballpark).',
      'Fast reads: about 50 ms at the server for 99% of leaderboard requests (ballpark).',
      'Correct totals: a result that is retried or delivered twice counts once, and no result is lost.',
      'Highly available: one failed machine must not wipe the board or stop matches from being scored.',
      'Scale: about 100 million players on the board, with 6,000 score changes and 6,000 rank reads a second at peak (ballpark).',
    ],
    outOfScope: [
      'Cheat detection: assume game servers report results, never the players’ own apps.',
      'Matchmaking and the game itself.',
      'Rewards and prizes at the end of a season.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Players with a score this season', value: '100 million (ballpark)' },
      { label: 'Daily active players', value: '20 million' },
      { label: 'Matches per active player per day', value: '10, each one score change' },
      { label: 'Leaderboard views per active player per day', value: 'about 10, counting the rank shown after each match' },
      { label: 'Bytes per sorted-set entry', value: 'about 100: the player identifier (ID), the score and the structure’s overhead' },
      { label: 'Busiest hour compared with the daily average', value: '3×, in the evenings and at the end of a season' },
      { label: 'In the calculator', value: 'a score change counts as a write and a leaderboard view as a read; the storage line is the history of match results, if you keep every one' },
    ],
    steps: [
      { label: 'Score changes per second', math: '2 × 10⁷ players × 10 matches = 2 × 10⁸ a day; ÷ 10⁵ seconds', result: '≈ 2,000 a second, 6,000 at peak' },
      { label: 'Rank reads per second', math: '2 × 10⁷ players × 10 views = 2 × 10⁸ a day; ÷ 10⁵ seconds', result: '≈ 2,000 a second, 6,000 at peak' },
      { label: 'Memory for one sorted set', math: '10⁸ players × 100 bytes', result: '≈ 10 GB: fits on one large cache node' },
      { label: 'One rank lookup', math: 'log₂(10⁸) ≈ 27, so a few dozen steps through a skip list', result: 'microseconds' },
      { label: 'One rank by counting rows instead', math: 'a player in 50 millionth place: 5 × 10⁷ index entries to count', result: 'seconds per request: unusable' },
      { label: 'Match history', math: '2 × 10⁸ results a day × 100 bytes', result: '≈ 20 GB a day' },
    ],
    calculator: { dau: 20_000_000, actionsPerUser: 20, readsPerWrite: 1, objectBytes: 100, peakFactor: 3, retentionYears: 1 },
  },
  api: [
    {
      signature: 'POST /v1/matches/{matchId}/results  { season, results: [{ playerId, points }] }  →  202 Accepted',
      description:
        'Called by game servers, never by players, when a match ends. The match’s identifier works as an [[idempotency key|idempotency-key]]: sending the same results twice changes nothing.',
    },
    {
      signature: 'GET /v1/leaderboards/{season}/top?limit=100  →  200 { entries: [{ rank, playerId, name, score }] }',
      description: 'The top of the board. It is the same for everyone, so each server caches it for a couple of seconds.',
    },
    {
      signature: 'GET /v1/leaderboards/{season}/players/{playerId}?around=5  →  200 { rank, approximate, percentile, score, above: […], below: […] }',
      description:
        'A player’s own rank and neighbors. Near the top the rank is exact; far down it may be approximate, and the response says so, so the app can show “top 41%”.',
    },
    {
      signature: 'GET /v1/leaderboards/{season}/friends/{playerId}  →  200 { entries: [{ rank, playerId, name, score }] }',
      description: 'A board of the player’s friends, built when asked: their scores come back in one batched read and are sorted on the spot.',
    },
  ],
  dataModel: [
    {
      entity: 'Result event',
      fields: ['match_id', 'player_id (stream key)', 'season', 'points', 'finished_at'],
      store: 'Event stream such as Kafka, partitioned by player, kept for 7 days',
      why: 'Game servers append and move on. The stream absorbs the burst when many matches end at once, keeps each player’s results in order on one partition, and lets the updater replay after a crash.',
    },
    {
      entity: 'Match result',
      fields: ['match_id + player_id (primary key)', 'season', 'points', 'finished_at'],
      store: 'Relational database, sharded by player',
      why: 'The durable record of every result. Its unique key turns a repeated result into a no-op, which is what makes retries safe.',
    },
    {
      entity: 'Player score',
      fields: ['player_id + season (primary key)', 'total_points', 'reached_at: when this total was reached', 'updated_at'],
      store: 'The same database and shard as the player’s match results',
      why: 'The [[source of truth|source-of-truth]] for each total. A new result inserts its row and raises the total in one transaction, and if the sorted set is ever lost, it is rebuilt from these rows.',
    },
    {
      entity: 'Leaderboard entry',
      fields: ['key: lb:{season}', 'member: player_id', 'score: points with the tie-breaker folded in'],
      store: 'Redis sorted set in memory, with a replica; split into shards when one is not enough',
      why: 'A sorted set keeps its members in score order, so it returns the top 100, a rank or a range of neighbors in microseconds. It is [[derived data|derived-data]]: fast to read, and rebuildable from the player scores.',
    },
    {
      entity: 'Score histogram',
      fields: ['key: hist:{season}', 'bucket: a band of scores, such as 1,200 to 1,209', 'players: count'],
      store: 'A Redis hash beside each shard’s sorted set',
      why: 'A few thousand counters describe how scores are spread. Adding up the buckets above a score gives an approximate rank in microseconds, and histograms from many shards simply add together.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Record scores and show the top 100 and a player’s rank, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'A database with an index on score works for a small game, and its top 100 stays cheap at any size. Rank is the problem: an ordinary index can find where a score sits, but not how many entries come before it without counting them. With 100 million players and thousands of rank requests a second, counting is hopeless.',
    },
    {
      title: 'v2: It scales',
      solves: 'Ranks in microseconds for 100 million players, about 6,000 score changes a second at peak (ballpark), and no double-counted results.',
      diagram: v2,
      explanation:
        'The database stays the source of truth, and the sorted set is a fast copy built from it, so losing the copy loses no points. About 10 GB (ballpark) fits on one node, which handles far more than 12,000 operations a second, so one sorted set and a replica carry this whole game. The next stage is for when they can’t.',
    },
    {
      title: 'v3: Bigger than one node',
      solves: 'A billion players, or tens of thousands of score changes a second: one sorted set no longer fits one node.',
      diagram: v3,
      explanation:
        'Writes now spread evenly, and each shard is small enough to copy and restore quickly. Reads pay instead: the top 100 and exact ranks ask every shard, which is cheap with a handful of shards and a short cache, while approximate ranks ask none. Splitting by score range would make a rank one query, but the shard with the top scores would take the hottest traffic, and its boundaries would drift all season.',
    },
    {
      title: 'v4: It survives failures',
      solves: 'A dead cache node, a lost shard or a stalled stream must not lose points or freeze the game.',
      diagram: v4,
      explanation:
        'Every failure costs freshness or precision, never points: the stream and the database hold every result durably, and the sorted sets are copies that can be rebuilt. While a shard recovers, players may see a rank a few seconds old, or an approximate one.',
    },
  ],
  deepDives: [
    {
      title: 'Where ranks come from',
      problem:
        'The top of a list is easy for almost any store. A player’s rank is hard: it is the number of players ahead of them, and with 100 million players it must come back in milliseconds, thousands of times a second, while scores keep changing.',
      options: {
        caption: 'Four ways to answer “what is my rank?”',
        rows: [
          {
            option: 'Database index on score',
            goodAt: 'Durable and familiar, and the top 100 is a short walk from the top of the index.',
            badAt: 'A rank means counting every higher score: tens of millions of index entries for a player in the middle.',
            pickWhen: 'Small games, or as the source of truth beside a faster index.',
          },
          {
            option: 'Redis sorted set',
            goodAt: 'Keeps members in score order with a skip list, so a rank, the top 100 or a range of neighbors each take microseconds, and a new score is one command.',
            badAt: 'Lives in memory, so it needs a replica and a way to rebuild, and one set is limited to one node.',
            pickWhen: 'The default, up to a few hundred million players per set.',
          },
          {
            option: 'A counting tree in your own service',
            goodAt: 'A balanced tree that records how many entries sit under each branch answers a rank in about log₂(n) steps, with full control over memory and ties.',
            badAt: 'You write, test and run a custom data store.',
            pickWhen: 'Very large boards, where a custom store pays for itself.',
          },
          {
            option: 'Ranks computed by a batch job',
            goodAt: 'Sort everyone every few minutes and store each player’s rank: trivial to read and to split.',
            badAt: 'Ranks are minutes old, and players expect their new rank right after a match.',
            pickWhen: 'Daily or end-of-season standings.',
          },
        ],
      },
      recommendation:
        'Use a sorted set as the ranking index and a database as the source of truth, and say why: the database is durable but slow at ranks, and the sorted set is fast at ranks but lives in memory. Feed both from the same stream, cache the top 100 for a second or two, and keep a batch job for the final standings of each season.',
    },
    {
      title: 'Splitting the board across shards',
      problem:
        'One sorted set of 100 million players is about 10 GB (ballpark) and fits on one node. At a billion players, or tens of thousands of score changes a second, it doesn’t, and splitting it changes how a rank is computed.',
      options: {
        caption: 'Ways to grow past one node',
        rows: [
          {
            option: 'One sorted set plus replicas',
            goodAt: 'Exact ranks in one query, and nothing to merge; replicas share the reads.',
            badAt: 'Bounded by one node’s memory, and every write lands on one machine.',
            pickWhen: 'Up to a few hundred million players, which covers most games.',
          },
          {
            option: 'Shards by a hash of the player',
            goodAt: 'Even memory and writes, and each shard is small to copy and restore.',
            badAt: 'The top 100 and exact ranks must ask every shard and merge the answers.',
            pickWhen: 'The board outgrows one node: the usual next step.',
          },
          {
            option: 'Shards by score range',
            goodAt: 'A rank is one query plus the known sizes of the higher shards, and the top 100 lives on one shard.',
            badAt: 'The top shard is the hottest, scores drift upward all season so ranges need rebalancing, and players move between shards as they climb.',
            pickWhen: 'Scores are stable and well understood in advance.',
          },
          {
            option: 'Many smaller boards',
            goodAt: 'Leagues or divisions of, say, 10,000 players each fit anywhere, and players often care more about their league anyway.',
            badAt: 'A product change: a global rank still needs one of the other options.',
            pickWhen: 'The product team agrees a league rank matters more than a global one.',
          },
        ],
      },
      recommendation:
        'Stay on one sorted set with a replica while it fits, which it does here. When it stops fitting, shard by a hash of the player ID, merge per-shard top lists for the top 100, sum per-shard counts for exact ranks near the top, and give everyone else an approximate rank. Mention leagues: often the best answer to a giant board is a product with smaller ones.',
    },
    {
      title: 'Exact or approximate ranks',
      problem:
        'Being 41,212,904th rather than 41,212,877th means nothing to a player, but working it out exactly costs a query to every shard on every view. Players near the top, on the other hand, care about every place.',
      options: {
        caption: 'How precise a rank must be',
        rows: [
          {
            option: 'Exact rank for everyone',
            goodAt: 'Simple to explain, and always right.',
            badAt: 'Every view queries every shard, and the cost grows with the number of shards.',
            pickWhen: 'One sorted set, where exact ranks are cheap anyway.',
          },
          {
            option: 'Histogram of scores',
            goodAt:
              'A few thousand bucket counters per shard give an approximate rank in microseconds, and histograms from many shards add up. The error is at most the number of players inside one bucket.',
            badAt: 'A crowded bucket at a popular score holds many players, so the rank there is a range.',
            pickWhen: 'Players below the top few thousand.',
          },
          {
            option: 'Quantile sketch',
            goodAt:
              'A [[sketch|sketch]] of a few kilobytes answers what share of players score below a value, with a small, known error, and sketches from shards merge.',
            badAt: 'One more structure to keep up to date, and it gives percentiles, not ranks.',
            pickWhen: 'The app shows “top 12%” rather than a number.',
          },
          {
            option: 'Rank snapshot every few minutes',
            goodAt: 'A batch job sorts everyone and stores each rank, so reading one is a key lookup.',
            badAt: 'Minutes old, and ranks jump between snapshots.',
            pickWhen: 'Profile pages far down the board.',
          },
        ],
      },
      recommendation:
        'Give exact ranks to the top 10,000 or so from a small extra sorted set that holds only the best scores, which the updater trims back to size. Give everyone below an approximate rank from per-shard histograms, with narrow buckets where players crowd. Show the approximation honestly, as “top 41%”: a [[probabilistic data structure|probabilistic-data-structure]] such as a quantile sketch does the same job if the app shows only percentiles.',
    },
    {
      title: 'Counting each result exactly once',
      problem:
        'Game servers retry when a request times out, and streams deliver [[at least once|at-least-once]], so the same match result will sometimes arrive twice. With a running total, applying it twice hands out free points, and nothing afterwards can tell.',
      options: {
        caption: 'Ways to apply a result',
        rows: [
          {
            option: 'Add the points on every event',
            goodAt: 'One command, `ZINCRBY`, and no other state.',
            badAt: 'A repeated event adds the points again.',
            pickWhen: 'Never for scores that matter.',
          },
          {
            option: 'Remember applied results in Redis',
            goodAt: 'Check a set of applied match and player pairs before adding, and skip repeats.',
            badAt: 'The check and the add must be one atomic step, such as a small Lua script, and the set of pairs grows all season.',
            pickWhen: 'Totals live only in Redis.',
          },
          {
            option: 'Insert and add in one database transaction',
            goodAt:
              'A unique key on match and player rejects a repeat, and the total rises only if the insert succeeds. The sorted set then receives the new total, which is safe to write twice.',
            badAt: 'A database write per result, about 6,000 a second at peak (ballpark), spread over shards.',
            pickWhen: 'The default: the database is the source of truth anyway.',
          },
          {
            option: 'Keep the best score, not a sum',
            goodAt: 'If the game ranks single best results, `ZADD` with the `GT` option keeps the higher of the old and new scores, and repeating it changes nothing.',
            badAt: 'Fits only games ranked by one best result.',
            pickWhen: 'High-score boards, such as arcade games.',
          },
        ],
      },
      recommendation:
        'Let the database decide: insert the result with a unique key on match and player, raise the total in the same transaction, and only then write the total to the sorted set. Writing a total is [[idempotent|idempotent]], so the updater can replay the stream after any crash without double-counting.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: 60,000 score changes and 60,000 reads a second at peak (ballpark).',
      impact: 'The node holding the sorted set nears its limit, mostly from reads, and the updater falls behind.',
      mitigation: 'Serve ranks from replicas, keep the top 100 cached, and run one updater per stream partition. If writes alone outgrow one node, shard by player.',
    },
    {
      scenario: 'The last hour of a season: everyone checks the top 100 at once.',
      impact: 'The same top-100 request arrives tens of thousands of times a second.',
      mitigation:
        'Each server answers from its two-second cache, so the sorted set sees one read per server every two seconds, and a content delivery network can hold the answer for a second or two in front of everything.',
    },
    {
      scenario: 'A shard’s primary dies.',
      impact: 'Reads move to the replica, which may be missing the last second or so of updates.',
      mitigation: 'Promote the replica and replay the stream from the updater’s saved offset; because the updater writes totals, the replay is harmless.',
    },
    {
      scenario: 'Both copies of a shard are lost, or a bug corrupts the scores.',
      impact: 'Ranks on that shard are missing or wrong until it is rebuilt.',
      mitigation: 'Rebuild from the scores database in minutes, serving cached top lists and approximate ranks meanwhile. The sorted set is derived data, so this is an outage of speed, not of points.',
    },
    {
      scenario: 'The result stream or the updater stops.',
      impact: 'Matches still finish, but ranks stop changing, so players see their old rank after a win.',
      mitigation: 'Game servers buffer and retry, an alert fires on [[consumer lag|consumer-lag]], and the updater catches up from its offset when it returns.',
    },
    {
      scenario: 'A new season starts at midnight while matches are still finishing.',
      impact: 'Results for both seasons arrive mixed, and a careless reset could wipe points players just earned.',
      mitigation:
        'Use a new key for each season, such as `lb:season-12`, and label each result with the season its match started in. Keep the old board read-only until its last results drain, then copy the final standings to the database.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Keeps the board in score order and shows the top 100 and a player’s rank.',
        'Notices that counting rows to find a rank is too slow.',
        'Stores scores somewhere durable, not only in memory.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Uses a sorted set for ranks and neighbors, sizes it from the estimate, and keeps a database as the source of truth.',
        'Makes score updates idempotent, so a retried result adds nothing.',
        'Caches the top 100, and breaks ties by who reached a score first.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Explains how to shard, what asking every shard costs for the top 100 and for a rank, and why splitting by score range is tempting but painful.',
        'Offers approximate ranks far down the board, and says what error players will see.',
        'Plans rebuilds, season changes and failover, and raises leagues as a product answer to a giant board.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The node holding the leaderboard just died. What happens?',
      a: 'Its replica is promoted within seconds, so reads carry on. Replication is asynchronous, so the replica may be missing the last second of updates, and the updater replays the stream from its saved offset; it writes totals, not additions, so the replay is harmless. If both copies were gone, I’d rebuild from the scores database in a few minutes.',
    },
    {
      q: 'Two players have the same score. Who ranks higher, and how do you store that?',
      a: 'Whoever reached the score first. A sorted set orders by one number, so I fold the time into it: points × 10⁸ plus the seconds left until the season ends, which gives the earlier player the bigger number. Redis scores are 64-bit floating-point numbers, exact for whole numbers up to about 9 × 10¹⁵, so this works while points stay below about 90 million.',
    },
    {
      q: 'A game server retried a match result three times. Did the player get triple points?',
      a: 'No. The updater inserts the result with a unique key on match and player and raises the total in the same transaction, so the second and third copies fail the insert and change nothing. The sorted set only ever receives totals, so writing one twice is harmless.',
    },
    {
      q: 'Product wants a friends leaderboard. How would you build it?',
      a: 'A player has a few hundred friends at most, so I don’t keep a sorted set per player. When the page opens, I fetch the friends’ scores in one batched read and sort them in the service, which takes microseconds. Keeping a board per player would mean updating thousands of sorted sets after every match.',
    },
    {
      q: 'How would you add daily and weekly boards beside the season?',
      a: 'Each period gets its own sorted set, such as `lb:week-47`, which the updater also writes for every result. Old period keys expire a few weeks after they close, once their final standings are copied to the database. That multiplies writes by the number of boards, which is fine for three, but not for hundreds.',
    },
    {
      q: 'A player in 48 millionth place wants their exact rank. Is it worth it?',
      a: 'Usually not: that far down, the number changes many times a minute and means little. I’d show “top 48%” from the histograms, and keep exact ranks for roughly the top 10,000, where every place matters. If the product insists, an exact rank is still one count per shard, so I’d offer it on the player’s own profile, not on every screen.',
    },
  ],
  rubric: [
    { item: 'Estimated players, score changes and reads per second, and the memory of one sorted set', weight: 15, lessonId: 'back-of-the-envelope' },
    { item: 'Explained why counting rows is too slow for a rank, and used a sorted set for ranks, the top 100 and neighbors', weight: 20, lessonId: 'indexes' },
    { item: 'Kept a durable source of truth and treated the sorted set as a rebuildable copy, fed by a stream', weight: 15, lessonId: 'queues-and-streams' },
    { item: 'Counted each match result once with idempotent updates, and broke ties fairly', weight: 10, lessonId: 'idempotency' },
    { item: 'Sharded by player when one node was not enough, and explained asking every shard for the top 100 and ranks', weight: 15, lessonId: 'sharding' },
    { item: 'Cached the top 100, which is the same for everyone', weight: 5, lessonId: 'caching' },
    { item: 'Offered approximate ranks far down the board, and said what error players see', weight: 10, lessonId: 'probabilistic-structures' },
    { item: 'Explained what happens when a shard, the stream or the updater fails', weight: 10, lessonId: 'replication' },
  ],
};

export default problem;
