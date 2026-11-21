import type { RawTerm } from '../types';

/** New glossary terms from lesson group I (lessons 4.1 and 4.2). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'semi-synchronous-replication',
    term: 'Semi-synchronous replication',
    definition: 'Replication where one follower is synchronous and the rest are asynchronous, so every confirmed write is on two machines without waiting for all of them.',
    example: 'One follower of each Snapgram database confirms every write; the other catches up in the background.',
  },
  {
    id: 'sticky-reads',
    term: 'Sticky reads',
    aka: ['replica pinning'],
    definition: 'Sending all of one user’s reads to the same follower, so what they see only moves forward in time, never backwards.',
    example: 'Maya’s user name hashes to Follower 2, so every refresh she makes reads from it.',
  },
  {
    id: 'log-position',
    term: 'Log position',
    aka: ['log sequence number'],
    definition: 'The number of a change in the leader’s replication log. A follower that has applied position N has every change up to N.',
    example: 'Maya’s caption edit is change 50,312, so a follower may serve her profile only once it has applied that change.',
  },
];
