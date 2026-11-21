import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'caching-strategies',
  title: 'Caching strategies',
  summary: 'Five ways to wire a cache, three eviction policies, and the fixes for stampedes, cold starts and stale reads.',
  lessons: ['caching'],
  sections: [
    {
      title: 'Five patterns',
      blocks: [
        {
          kind: 'table',
          columns: ['Pattern', 'How it works', 'Pick it when'],
          rows: [
            [
              '[[Cache-aside|cache-aside]]',
              'Read the cache, then the database on a miss, and fill the cache. Writes delete the key; a [[time to live|ttl]] (TTL) cleans up the rest.',
              'Data is read far more than written. The default.',
            ],
            ['[[Read-through|read-through]]', 'The cache loads misses itself.', 'Your cache library offers loaders.'],
            ['[[Write-through|write-through]]', 'Writes update cache and database together.', 'Reads right after writes must be fresh.'],
            ['[[Write-back|write-back]]', 'Writes reach the database later, in batches. A crash loses them.', 'Heavy writes you can lose a few of, like view counts.'],
            ['[[Write-around|write-around]]', 'Writes skip the cache; reads fill it.', 'Written often, read rarely, like logs.'],
          ],
        },
      ],
    },
    {
      title: 'Eviction policies',
      blocks: [
        {
          kind: 'table',
          columns: ['Policy', 'Evicts', 'Works when'],
          rows: [
            ['[[LRU|lru]], least recently used', 'The entry unused longest', 'Recent use predicts the next. The default.'],
            ['[[LFU|lfu]], least frequently used', 'The entry used least', 'Popularity stays stable.'],
            ['[[FIFO|fifo]], first in, first out', 'The oldest entry', 'Simplicity beats hit ratio.'],
          ],
        },
      ],
    },
    {
      title: 'What a read costs',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'The app server’s own memory', value: '≈ 100 ns' },
            { label: 'A shared cache over the network', value: '≈ 0.5–1 ms' },
            { label: 'A database query that uses an index', value: '≈ 1–10 ms' },
            { label: 'A query that scans or joins many rows', value: '≈ 50 ms or more' },
            { label: 'Reads reaching the database at a 90% [[hit ratio|hit-ratio]]', value: '1 in 10' },
          ],
          caption: 'Ballpark, inside one data center.',
        },
      ],
    },
    {
      title: 'When caches go wrong',
      blocks: [
        {
          kind: 'table',
          columns: ['Problem', 'Fix'],
          rows: [
            ['[[Stampede|cache-stampede]]: a hot key expires and every request misses', 'One request rebuilds it while the rest wait; add [[jitter|jitter]] to TTLs.'],
            ['Cold start after a restart', 'Warm it up first, or shift traffic over gradually.'],
            ['[[Hot key|hot-key]] overloads one node', 'Copy it to several nodes, or keep it briefly in each app server.'],
            ['Stale reads', 'Delete on write and keep TTLs short; entries also expire whatever the policy. Read balances from the database.'],
          ],
        },
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Caches trade freshness for speed. Name the pattern, the TTL and the eviction policy, and what happens when the cache fails.',
        },
      ],
    },
  ],
};

export default sheet;
