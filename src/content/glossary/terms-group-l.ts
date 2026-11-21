import type { RawTerm } from '../types';

/** New glossary terms from lesson group L (lessons 4.7 to 4.9). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* 4.7 Quorums */
  {
    id: 'replica',
    term: 'Replica',
    definition: 'One copy of a piece of data, kept on its own machine. In a leaderless store, every replica accepts reads and writes.',
    example: 'Every event in Snapgram’s activity store lives on three replicas.',
  },
  {
    id: 'replication-factor',
    term: 'Replication factor',
    definition: 'How many copies a store keeps of each piece of data, often written N. Three is a common choice.',
    example: 'The activity store has a replication factor of three, so N = 3.',
  },
  {
    id: 'coordinator',
    term: 'Coordinator',
    definition: 'The node or service that runs a request across several others: it sends them the work, collects their answers and decides the outcome.',
    example: 'The coordinator confirms Maya’s like once two of the three replicas have stored it.',
  },
  {
    id: 'read-repair',
    term: 'Read repair',
    definition: 'When a read finds a replica holding an old version, the coordinator sends that replica the newest version.',
    example: 'Replica 3 answered with version 6, so the coordinator sent it version 7.',
  },
  {
    id: 'sloppy-quorum',
    term: 'Sloppy quorum',
    definition: 'A quorum that counts stand-in nodes when some usual replicas are down, which keeps writes available but no longer guarantees overlap with reads.',
    example: 'With two replicas down, the activity store writes a new event to a stand-in node.',
  },
  {
    id: 'hinted-handoff',
    term: 'Hinted handoff',
    definition: 'A stand-in node holds writes meant for a replica that is down, then passes them on when that replica returns.',
    example: 'Replica 2 comes back after an hour and receives the likes it missed.',
  },
  {
    id: 'anti-entropy',
    term: 'Anti-entropy',
    definition: 'A background process that compares replicas and copies over any data one of them is missing, so they converge even if nobody reads it.',
    example: 'Every night, the activity store’s replicas compare their data and fill the gaps.',
  },
  {
    id: 'tunable-consistency',
    term: 'Tunable consistency',
    definition: 'Letting each request choose how many replicas must answer, trading freshness against speed and availability one request at a time.',
    example: 'Activity events wait for two of three replicas; view counts wait for one.',
  },

  /* 4.8 Transactions across services */
  {
    id: 'distributed-transaction',
    term: 'Distributed transaction',
    definition: 'A transaction that changes data in more than one database or service and must take effect in all of them or in none.',
    example: 'A print order that writes to both the order database and the payment database.',
  },
  {
    id: 'saga',
    term: 'Saga',
    definition: 'A long operation split into local transactions, one per service. If a step fails, compensating actions undo the steps already done.',
    example: 'The print order saga saves the order, charges the card, then sends the book to the print shop.',
  },
  {
    id: 'compensating-action',
    term: 'Compensating action',
    aka: ['compensating transaction'],
    definition: 'A step that undoes the effect of an earlier, already committed step of a saga, such as a refund for a charge.',
    example: 'When the print shop rejects the book, the payment service refunds Maya.',
  },
  {
    id: 'choreography',
    term: 'Choreography',
    definition: 'Coordinating a saga with no central controller: each service reacts to the events of the others and publishes events of its own.',
    example: 'The payment service charges the card as soon as it sees an “order placed” event.',
  },
  {
    id: 'orchestration',
    term: 'Orchestration',
    aka: ['orchestrator'],
    definition: 'Coordinating a saga from one place: an orchestrator tells each service which step to run next and records how far the saga has got.',
    example: 'The order service tells payments to charge, then tells the print shop to print.',
  },
  {
    id: 'transactional-outbox',
    term: 'Transactional outbox',
    aka: ['outbox pattern'],
    definition: 'Saving outgoing events to an outbox table in the same transaction as the data change, and publishing them from that table afterwards.',
    example: 'The new order and its “order placed” event commit together, so neither exists without the other.',
  },
  {
    id: 'dual-write',
    term: 'Dual write',
    definition: 'Updating two systems, such as a database and a message broker, in separate steps, so a crash between them leaves them disagreeing.',
    example: 'The order was saved, but the event announcing it was never sent.',
  },
  {
    id: 'change-data-capture',
    term: 'Change data capture',
    aka: ['CDC'],
    definition: 'Reading a database’s log of committed changes and publishing each change as an event that other systems can consume.',
    example: 'A relay reads the orders database’s log and publishes every new outbox row.',
  },

  /* 4.9 Denormalization and read models */
  {
    id: 'normalization',
    term: 'Normalization',
    definition: 'Designing tables so each fact is stored in exactly one place, and other tables refer to it by key instead of copying it.',
    example: 'Maya’s name lives only in the users table; her photos store just her user ID.',
  },
  {
    id: 'materialized-view',
    term: 'Materialized view',
    definition: 'A query result that the database stores like a table and refreshes when asked, so reads skip running the query again.',
    example: 'A view of the week’s top hashtags is rebuilt every ten minutes.',
  },
  {
    id: 'read-model',
    term: 'Read model',
    definition: 'A copy of data shaped for one screen or query, kept up to date from changes to the main data, usually a moment behind.',
    example: 'One document per user holds everything Snapgram’s profile page shows.',
  },
  {
    id: 'precomputation',
    term: 'Precomputation',
    aka: ['precompute'],
    definition: 'Working out a result ahead of time, when the data changes, so that reads fetch the answer instead of calculating it.',
    example: 'Follower counts are updated on every follow, not counted on every profile view.',
  },
  {
    id: 'derived-data',
    term: 'Derived data',
    definition: 'Data computed from other data, such as counts, indexes, caches and read models. If it is lost, it can be rebuilt from the source.',
    example: 'Maya’s stored follower count is derived from the rows in the follows table.',
  },
  {
    id: 'reconciliation',
    term: 'Reconciliation',
    definition: 'Comparing derived data, such as stored counts, with the source of truth and fixing any differences, usually in a scheduled job.',
    example: 'The nightly recount finds Maya’s follower count off by three and corrects it.',
  },
  {
    id: 'backfill',
    term: 'Backfill',
    definition: 'Filling a new column, table or read model with values computed from the data that already exists.',
    example: 'Before showing post counts, a job counts the existing posts of every user.',
  },
  {
    id: 'cqrs',
    term: 'Command query responsibility segregation',
    aka: ['CQRS'],
    definition: 'Keeping separate models for changing data and for reading it, with the read side updated from the changes made on the write side.',
    example: 'Follows are written to normalized tables, and profiles are read from one document per user.',
  },
];
