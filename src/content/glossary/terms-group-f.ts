import type { RawTerm } from '../types';

/** New glossary terms from lesson group F. See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* 2.4 Vertical vs. horizontal scaling */
  {
    id: 'vertical-scaling',
    term: 'Vertical scaling',
    aka: ['scaling up', 'scale up'],
    definition: 'Handling more load by moving to a bigger machine, with more processor cores, more memory or faster disks.',
    example: 'Snapgram moves from an 8-core server to a 64-core one.',
  },
  {
    id: 'horizontal-scaling',
    term: 'Horizontal scaling',
    aka: ['scaling out', 'scale out'],
    definition: 'Handling more load by adding machines that share the work, instead of making one machine bigger.',
    example: 'Snapgram runs three app servers behind a load balancer instead of one large server.',
  },
  {
    id: 'autoscaling',
    term: 'Autoscaling',
    definition: 'Adding servers automatically when load rises and removing them when it falls, based on a measure such as processor use.',
    example: 'Snapgram runs 4 app servers overnight and 12 during the evening peak.',
  },
  {
    id: 'sharding',
    term: 'Sharding',
    aka: ['shard', 'shards'],
    definition: 'Splitting one large dataset across several databases, each holding part of the rows, so no single machine stores or serves everything.',
    example: 'Users 1 to 10 million live on one database, the next 10 million on another.',
  },

  /* 3.7 SQL vs. NoSQL */
  {
    id: 'sql',
    term: 'SQL',
    aka: ['Structured Query Language', 'relational database'],
    definition: 'Structured Query Language, used to read and change data in relational databases; also shorthand for those databases, which keep data in tables.',
    example: 'Snapgram’s accounts and photos live in PostgreSQL, a SQL database.',
  },
  {
    id: 'nosql',
    term: 'NoSQL',
    aka: ['not only SQL', 'non-relational database'],
    definition: 'A broad family of databases that do not use relational tables, including key-value, document, wide-column and graph stores.',
    example: 'Snapgram’s activity feed moves to a NoSQL wide-column store.',
  },
  {
    id: 'schema',
    term: 'Schema',
    definition: 'The declared structure of stored data: which tables or collections exist, which fields they have and what type each field holds.',
    example: 'Every row in Snapgram’s photos table has a user_id, a caption and a created_at time.',
  },
  {
    id: 'key-value-store',
    term: 'Key-value store',
    definition: 'A database that stores each value under a unique key and finds it only by that key, like a giant dictionary.',
    example: 'Redis maps session:7f3a9c to user 42.',
  },
  {
    id: 'document-store',
    term: 'Document store',
    aka: ['document database'],
    definition: 'A database of self-contained documents, usually JSON-like objects with nested fields, which it can query by the fields inside them.',
    example: 'Maya’s profile, settings and pinned photos stored as one document in MongoDB.',
  },
  {
    id: 'wide-column-store',
    term: 'Wide-column store',
    definition: 'A database that groups rows by a partition key, keeps them sorted inside each partition, and spreads partitions across many machines.',
    example: 'Snapgram’s activity feed in Cassandra: one partition per user, newest items first.',
  },
  {
    id: 'graph-database',
    term: 'Graph database',
    definition: 'A database that stores things as nodes and the relationships between them as edges, built for queries that follow connections.',
    example: 'Finding people Maya’s friends follow who also follow Ana.',
  },
  {
    id: 'partition-key',
    term: 'Partition key',
    definition: 'The part of a record’s key that decides which machine stores it. Records with the same partition key are stored together.',
    example: 'In Snapgram’s feed store, the partition key is the user ID.',
  },
  {
    id: 'denormalization',
    term: 'Denormalization',
    definition: 'Storing the same piece of data in more than one place, so reads need no joins, at the cost of more work on every write.',
    example: 'Copying Ana’s username into every comment she writes.',
  },
  {
    id: 'polyglot-persistence',
    term: 'Polyglot persistence',
    definition: 'Using different kinds of databases for different data in one system, each matched to how its data is read and written.',
    example: 'Snapgram keeps accounts in SQL, sessions in Redis and the activity feed in Cassandra.',
  },

  /* 3.8 Indexes */
  {
    id: 'index',
    term: 'Index',
    aka: ['database index'],
    definition: 'A sorted lookup structure the database keeps beside a table, so it can find matching rows without checking every row.',
    example: 'An index on user_id finds Maya’s photos among 50 million rows in a few page reads.',
  },
  {
    id: 'full-table-scan',
    term: 'Full table scan',
    aka: ['sequential scan', 'table scan'],
    definition: 'Answering a query by reading every row of a table and checking each one, because no index can narrow the search.',
    example: 'Without an index, finding Maya’s photos means checking all 50 million rows.',
  },
  {
    id: 'disk-page',
    term: 'Page',
    aka: ['disk page', 'database page'],
    definition: 'The fixed-size block, often 8 or 16 KB, that a database reads from and writes to disk as one unit.',
    example: 'One page of Snapgram’s photos table holds about 100 rows.',
  },
  {
    id: 'b-tree',
    term: 'B-tree',
    aka: ['B+ tree', 'B+tree'],
    definition: 'A shallow, sorted tree of pages, each pointing to hundreds of children, so any key is found in a few page reads.',
    example: 'Four levels of a B-tree cover Snapgram’s 50 million photos.',
  },
  {
    id: 'write-amplification',
    term: 'Write amplification',
    definition: 'When one logical write causes several physical writes, such as updating every index or rewriting data during compaction.',
    example: 'One new photo row also updates three indexes: four writes for one insert.',
  },
  {
    id: 'lsm-tree',
    term: 'LSM tree',
    aka: ['log-structured merge tree', 'log-structured merge-tree'],
    definition: 'A write-friendly storage design that collects writes in memory, flushes them to disk as sorted files and merges those files in the background.',
    example: 'Cassandra and RocksDB store data in LSM trees.',
  },
  {
    id: 'memtable',
    term: 'Memtable',
    definition: 'The sorted, in-memory buffer where an LSM tree collects new writes before flushing them to disk as one sorted file.',
    example: 'New likes land in the memtable first and reach disk a few seconds later.',
  },
  {
    id: 'sstable',
    term: 'SSTable',
    aka: ['sorted string table'],
    definition: 'An unchangeable file of keys and values sorted by key, written when an LSM tree flushes its memtable to disk.',
    example: 'A flush writes 64 MB of new likes as one sorted file.',
  },
  {
    id: 'compaction',
    term: 'Compaction',
    definition: 'Background work in an LSM tree that merges sorted files, keeps the newest version of each key and drops deleted ones.',
    example: 'Four small files of likes are merged into one larger file overnight.',
  },
  {
    id: 'composite-index',
    term: 'Composite index',
    aka: ['multi-column index', 'compound index'],
    definition: 'An index on several columns in a set order. It helps queries that filter on its first column, or on its first few.',
    example: 'An index on (user_id, created_at) serves “Maya’s newest photos”.',
  },
  {
    id: 'query-plan',
    term: 'Query plan',
    aka: ['execution plan', 'EXPLAIN'],
    definition: 'The steps a database chooses to run a query, such as which index to use or whether to scan the table.',
    example: 'EXPLAIN shows that Snapgram’s profile query now uses the photos_by_user index.',
  },

  /* 3.9 Block, file and object storage */
  {
    id: 'block-storage',
    term: 'Block storage',
    aka: ['block volume', 'disk volume'],
    definition: 'Storage that looks like a raw disk: numbered blocks that one server formats with a file system. Used for databases and operating systems.',
    example: 'The cloud volume that holds Snapgram’s database files.',
  },
  {
    id: 'file-storage',
    term: 'File storage',
    aka: ['shared file system', 'network file system', 'NAS'],
    definition: 'A shared file system on the network: folders and files that many servers can open at the same time.',
    example: 'Two Snapgram servers reading the same shared folder of settings files.',
  },
  {
    id: 'object-storage',
    term: 'Object storage',
    aka: ['blob storage', 'blob store', 'S3'],
    definition: 'Storage that keeps whole files as objects under keys in a flat namespace, read and written over the web. Cheap, durable and nearly unlimited.',
    example: 'Snapgram’s photos in a bucket, under keys like photos/42/9f3c.jpg.',
  },
  {
    id: 'metadata',
    term: 'Metadata',
    definition: 'Data about data: facts such as a file’s owner, size, type and creation time, kept separately from the file itself.',
    example: 'The photos table records who uploaded photos/42/9f3c.jpg, when, and how big it is.',
  },
  {
    id: 'bucket',
    term: 'Bucket',
    definition: 'A named container in object storage that holds objects, along with the rules for who may read or write them.',
    example: 'snapgram-photos, the private bucket that holds every uploaded photo.',
  },
  {
    id: 'pre-signed-url',
    term: 'Pre-signed URL',
    aka: ['presigned URL', 'signed URL'],
    definition: 'A link signed with the app’s secret key that lets whoever holds it upload or download one specific object until it expires.',
    example: 'Maya’s phone gets a link that permits uploading photos/42/9f3c.jpg for the next 15 minutes.',
  },
];
