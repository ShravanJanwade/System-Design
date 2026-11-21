import type { RawTerm } from '../types';

/** New glossary terms from lesson group R (lessons 6.3 and 6.4). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'event-driven-architecture',
    term: 'Event-driven architecture',
    definition: 'A design in which services announce what happened as events and other services react to them, instead of calling each other directly.',
    example: 'Thumbnails, feed, notifications and search all react to Snapgram’s “photo uploaded” event.',
  },
  {
    id: 'command',
    term: 'Command',
    definition: 'A message asking one specific service to do something, such as “make thumbnails”. The sender expects it done, and the receiver may refuse it.',
    example: '“Charge $45 for order 1042” is a command to the payment service; “payment captured” is the event that follows.',
  },
  {
    id: 'correlation-id',
    term: 'Correlation ID',
    aka: ['correlation identifier', 'request ID'],
    definition: 'An identifier attached to a request at its start and copied into every message and log line it causes, so one flow can be followed.',
    example: 'Every event caused by Maya’s upload carries the same correlation ID, so one search finds them all.',
  },
  {
    id: 'event-store',
    term: 'Event store',
    definition: 'A database that keeps each entity’s events in order in an append-only stream, and lets you read a stream back or append to it.',
    example: 'Each Prints order has its own stream in the event store: placed, paid, printed, shipped.',
  },
  {
    id: 'audit-trail',
    term: 'Audit trail',
    aka: ['audit log'],
    definition: 'A complete, ordered record of what changed, when and why, kept so anyone can check later how data reached its current state.',
    example: 'Support reads the order’s events to see when the refund was requested and when it was issued.',
  },
  {
    id: 'write-model',
    term: 'Write model',
    aka: ['command model', 'command side'],
    definition: 'In command query responsibility segregation, the side that handles commands: it checks business rules against the current state and records the changes.',
    example: 'The Prints order service is the write model: it refuses a refund larger than the amount paid.',
  },
  {
    id: 'projection',
    term: 'Projection',
    aka: ['projector'],
    definition: 'Code that reads events in order and turns them into a read model. Replaying every event through it rebuilds the read model from scratch.',
    example: 'The order page projection turns “book shipped” into “On its way” on Maya’s order page.',
  },
  {
    id: 'compensating-event',
    term: 'Compensating event',
    aka: ['correcting event'],
    definition: 'A new event that cancels or corrects the effect of an earlier one. The earlier event stays in the log, so the history shows both.',
    example: '“Refund record voided” cancels a refund that was recorded twice; both refund events remain.',
  },
  {
    id: 'snapshot',
    term: 'Snapshot',
    definition: 'A saved copy of state at one moment, so you can restore or rebuild from there instead of starting from the very beginning.',
    example: 'A studio’s credit account saves a snapshot every 1,000 events, so loading it replays at most 999.',
  },
  {
    id: 'crud',
    term: 'Create, read, update and delete',
    aka: ['CRUD'],
    definition: 'The four basic operations on stored records. A CRUD design keeps only the current state of each record and overwrites it on every change.',
    example: 'Snapgram’s likes are plain CRUD: insert a row on like, delete it on unlike.',
  },
  {
    id: 'optimistic-concurrency',
    term: 'Optimistic concurrency control',
    aka: ['optimistic locking', 'expected version'],
    definition: 'Writing without locks, but rejecting a write if the data changed since the writer read it; the writer then reloads and tries again.',
    example: 'Two agents refund one order at once; the second append is rejected because the stream moved past version 7.',
  },
  {
    id: 'upcasting',
    term: 'Upcasting',
    aka: ['upcaster'],
    definition: 'Converting an old version of a stored event to the current shape while reading it, so stored events never change.',
    example: 'Old “order placed” events have no currency field, so an upcaster fills in dollars as they are read.',
  },
];
