import type { RawTerm } from '../types';

/** New glossary terms from lesson group M (lessons 5.1 to 5.3). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'distributed-system',
    term: 'Distributed system',
    definition: 'A system made of several computers that work together over a network, so that users see one service.',
    example: 'Snapgram is now dozens of services in two regions, talking to each other over the network.',
  },
  {
    id: 'fallacies-of-distributed-computing',
    term: 'Fallacies of distributed computing',
    definition: 'Eight false assumptions about networks, such as “the network is reliable” and “latency is zero”, that lead to fragile designs.',
    example: 'Assuming the thumbnail call always answers is the first fallacy.',
  },
  {
    id: 'retry-budget',
    term: 'Retry budget',
    definition: 'A cap on retries as a share of normal requests, such as 10%, so retries can never multiply the load on a struggling service.',
    example: 'Snapgram’s apps may add at most one retry for every ten requests.',
  },
  {
    id: 'metastable-failure',
    term: 'Metastable failure',
    definition: 'A failure that keeps itself going after its trigger is gone, usually because retries or wasted work keep the system overloaded.',
    example: 'The profile service stayed swamped by retries long after the slow query was fixed.',
  },
  {
    id: 'deadline-propagation',
    term: 'Deadline propagation',
    definition: 'Passing a request’s remaining time limit along to every service it calls, so none keeps working after the caller has given up.',
    example: 'The feed service tells the profile service it has 200 ms left.',
  },
  {
    id: 'side-effect',
    term: 'Side effect',
    definition: 'A change an operation makes beyond returning an answer, such as charging a card, sending an email or writing a row.',
    example: 'Reading a profile has no side effects; charging for a photo book does.',
  },
  {
    id: 'upsert',
    term: 'Upsert',
    definition: 'A database write that inserts a row if it does not exist and updates it if it does, so repeating it changes nothing more.',
    example: 'Saving draft 7f3a as an upsert leaves one draft, however often the app retries.',
  },
];
