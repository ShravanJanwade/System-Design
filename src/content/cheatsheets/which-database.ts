import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'which-database',
  title: 'Which database?',
  summary: 'Match each kind of data to a store by how it is read, written and related, starting from the relational default.',
  lessons: ['sql-vs-nosql', 'databases-101'],
  sections: [
    {
      title: 'Start from the access pattern',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Changes that must succeed or fail together', value: 'Relational' },
            { label: 'Many filters, sorts and joins, some not known yet', value: 'Relational' },
            { label: 'One small value, fetched by its key', value: 'Key-value' },
            { label: 'A growing list per key, read newest first', value: 'Wide-column' },
            { label: 'Whole records that vary in shape', value: 'Document' },
            { label: 'Connections several hops deep', value: 'Graph' },
          ],
          caption: 'When in doubt, a relational database queried with SQL (Structured Query Language) is rarely wrong.',
        },
      ],
    },
    {
      title: 'The five families',
      blocks: [
        {
          kind: 'table',
          columns: ['Family', 'Good at', 'Costs you'],
          rows: [
            ['Relational', 'Any question, with joins; transactions keep data correct', 'Writes go to one machine; splitting it is manual'],
            ['[[Key-value|key-value-store]]', 'Lookups by key in about a millisecond', 'Nothing but the key, and no joins'],
            ['[[Document|document-store]]', 'A whole record in one read, any shape', 'Shared data copied into many documents'],
            ['[[Wide-column|wide-column-store]]', 'Huge write volumes, sorted reads per partition', 'Fast only by [[partition key|partition-key]]: a table per question'],
            ['[[Graph|graph-database]]', 'Following connections hop by hop', 'Hard to split across machines'],
          ],
        },
      ],
    },
    {
      title: 'What fits, and names to know',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Money, orders, accounts', value: 'PostgreSQL' },
            { label: 'Sessions, carts, counters, caches', value: 'Redis, DynamoDB' },
            { label: 'Profiles, listings, settings', value: 'MongoDB' },
            { label: 'Feeds, messages, time series', value: 'Cassandra, Bigtable' },
            { label: 'Recommendations, fraud rings', value: 'Neo4j' },
          ],
        },
      ],
    },
    {
      title: 'Rules of thumb',
      blocks: [
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Name a store per kind of data and say why: “Sessions are single-key lookups on every request, so Redis; boosts need transactions, so PostgreSQL.”',
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: 'Choosing NoSQL because it “scales” without naming the access pattern, or a wide-column store without its partition key.',
        },
      ],
    },
  ],
};

export default sheet;
