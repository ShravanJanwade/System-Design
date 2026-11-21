import type { RawTerm } from '../types';

/** New glossary terms from lesson group K (lessons 4.5 and 4.6). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'partition-tolerance',
    term: 'Partition tolerance',
    definition: 'A system’s ability to keep running when the network loses or delays messages between its machines.',
    example: 'Snapgram must keep working when the link between Oregon and Singapore fails.',
  },
  {
    id: 'crdt',
    term: 'Conflict-free replicated data type',
    aka: ['CRDT'],
    definition: 'A data type whose copies can change independently and always merge to the same result, in any order, without losing updates.',
    example: 'A like counter where each region counts its own likes and the merge adds them up.',
  },
  {
    id: 'pacelc',
    term: 'PACELC',
    aka: ['PACELC theorem'],
    definition: 'An extension of CAP: during a partition, choose availability or consistency; else, in normal running, choose lower latency or consistency.',
    example: 'Waiting for Oregon adds about 170 ms to every Singapore write: consistency paid for in latency.',
  },
  {
    id: 'consistency-model',
    term: 'Consistency model',
    definition: 'A promise about which values a read may return after writes, from strong (always the latest) to eventual (copies agree in the end).',
    example: 'Snapgram uses a stronger consistency model for boost credits than for like counts.',
  },
];
