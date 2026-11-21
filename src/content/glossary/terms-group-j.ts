import type { RawTerm } from '../types';

/** New glossary terms from lesson group J (lessons 4.3 and 4.4). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* 4.3 Sharding */
  {
    id: 'range-partitioning',
    term: 'Range partitioning',
    aka: ['range sharding', 'range-based sharding'],
    definition: 'Splitting data so each shard holds one continuous range of keys, such as names A to F, keeping nearby keys together.',
    example: 'Users who signed up in 2024 on one shard, and those from 2025 on the next.',
  },
  {
    id: 'hash-partitioning',
    term: 'Hash partitioning',
    aka: ['hash sharding', 'hash-based sharding'],
    definition: 'Splitting data by a hash of each key, usually hash % N, so keys scatter evenly across shards but neighboring keys end up apart.',
    example: 'Snapgram puts each user on shard hash(user ID) % 4.',
  },
  {
    id: 'directory-partitioning',
    term: 'Directory-based partitioning',
    aka: ['directory sharding', 'lookup table sharding'],
    definition: 'Splitting data with a lookup table that records which shard holds each key or group, so data can be placed and moved freely.',
    example: 'A table saying that all of Singapore’s users live on shard 3.',
  },
  {
    id: 'hot-spot',
    term: 'Hot spot',
    aka: ['hot shard', 'hot partition'],
    definition: 'A shard or node that gets far more than its share of traffic or data, while the others sit partly idle.',
    example: 'The shard holding a celebrity’s photos in the hour after they post.',
  },
  {
    id: 'scatter-gather',
    term: 'Scatter-gather',
    aka: ['cross-shard query', 'fan-out query'],
    definition: 'Sending one query to every shard and merging the answers. Every shard does work, and the reply waits for the slowest one.',
    example: 'Finding all photos tagged #sunset across Snapgram’s four shards.',
  },
  {
    id: 'resharding',
    term: 'Resharding',
    aka: ['rebalancing', 'shard rebalancing'],
    definition: 'Changing how data is split across shards, such as going from four shards to eight, by copying data while the system keeps running.',
    example: 'Moving half of each Snapgram shard’s users to four new databases.',
  },
  {
    id: 'logical-shard',
    term: 'Logical shard',
    aka: ['virtual shard', 'logical shards'],
    definition: 'One of many small, fixed slices of the data. Several share one database, and each moves between machines as a whole.',
    example: 'Notion keeps 480 logical shards on 32 databases.',
  },

  /* 4.4 Consistent hashing */
  {
    id: 'modulo',
    term: 'Modulo',
    aka: ['mod', 'remainder', 'hash % N'],
    definition: 'The remainder after dividing one whole number by another: 14 mod 4 is 2. Most programming languages write it as %.',
    example: 'hash(key) % 4 picks one of four cache nodes.',
  },
  {
    id: 'hash-ring',
    term: 'Hash ring',
    aka: ['consistent hash ring'],
    definition: 'All possible hash values bent into a circle. Servers and keys get positions on it, and each key belongs to the next server clockwise.',
    example: 'A key at position 55 belongs to Cache C at position 60.',
  },
  {
    id: 'virtual-node',
    term: 'Virtual node',
    aka: ['vnode', 'vnodes', 'virtual nodes'],
    definition: 'One of many positions a single server takes on a hash ring, which evens out the load and spreads a failed server’s keys.',
    example: 'Each Snapgram cache node takes 200 positions on the ring.',
  },
];
