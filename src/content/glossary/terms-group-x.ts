import type { RawTerm } from '../types';

/** New glossary terms from lesson group X (lessons 8.4 to 8.6). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'access-pattern',
    term: 'Access pattern',
    aka: ['query pattern'],
    definition: 'One way a system reads or writes its data: which records, found by which key, in what order and how often.',
    example: 'Read the 20 newest items in Maya’s feed by her user ID, thousands of times a second.',
  },
  {
    id: 'entity',
    term: 'Entity',
    aka: ['core entity'],
    definition: 'A kind of thing a system stores and refers to by its own identifier, such as a user, a photo or a follow.',
    example: 'Snapgram’s core entities are users, photos, follows and feeds.',
  },
  {
    id: 'over-engineering',
    term: 'Over-engineering',
    aka: ['overengineering'],
    definition: 'Adding components or complexity that no current requirement needs, which costs time and money and adds more parts that can break.',
    example: 'A search cluster on a whiteboard whose requirements never mention search.',
  },
  {
    id: 'read-path',
    term: 'Read path',
    definition: 'The chain of components a read request passes through, from the client to the data and back.',
    example: 'Snapgram’s feed read path: phone, load balancer, app server, feed store and database.',
  },
  {
    id: 'write-path',
    term: 'Write path',
    definition: 'The chain of components a write passes through, including the background work it triggers, until the change is stored everywhere it must be.',
    example: 'Posting a photo: object storage, an app server and the database, then a queue and feed workers.',
  },
  {
    id: 'failure-mode',
    term: 'Failure mode',
    definition: 'One specific way a component can fail, such as crashing, slowing down or returning stale data, and what that does to the system.',
    example: 'The feed cache dying is one failure mode; the feed store slowing down is another.',
  },
  {
    id: 'cache-warming',
    term: 'Cache warming',
    aka: ['cache warm-up', 'warming the cache'],
    definition: 'Filling a cache with soon-needed data before or while it takes traffic, so early reads hit instead of all reaching the database.',
    example: 'Before a new feed cache node takes traffic, it is loaded with the feeds of the most active readers.',
  },
];
