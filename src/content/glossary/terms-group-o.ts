import type { RawTerm } from '../types';

/** New glossary terms from lesson group O (lessons 5.6 to 5.8). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'wall-clock-time',
    term: 'Wall-clock time',
    aka: ['time-of-day clock', 'system clock'],
    definition: 'A machine’s idea of the current date and time. Time sync keeps it close to true time, but corrections can make it jump, even backwards.',
    example: 'The Singapore server’s wall clock reads 12:00:00.300 when the true time is 12:00:00.000.',
  },
  {
    id: 'monotonic-clock',
    term: 'Monotonic clock',
    definition: 'A clock that only ever moves forward, used to measure how long something took. Its value means nothing as a date.',
    example: 'A request timeout is measured with the monotonic clock, so a time correction cannot make it negative.',
  },
  {
    id: 'leap-second',
    term: 'Leap second',
    definition: 'An extra second occasionally added to official time to keep it in step with the Earth’s rotation, which can make clocks repeat a second.',
    example: 'The leap second at the start of 2017 made some of Cloudflare’s DNS servers fail.',
  },
  {
    id: 'happens-before',
    term: 'Happens-before',
    aka: ['causal order'],
    definition: 'The relation between two events when the first could have influenced the second, such as a comment and the reply that answers it.',
    example: 'Maya’s comment happens before her friend’s reply, so every region must list it first.',
  },
  {
    id: 'concurrent-events',
    term: 'Concurrent events',
    definition: 'Two events where neither could have known about the other, so neither happened before the other, whatever the clocks say.',
    example: 'Maya and her friend rename their shared album at the same moment, in two regions.',
  },
  {
    id: 'majority',
    term: 'Majority',
    definition: 'More than half of a group, such as 3 of 5. Any two majorities of the same group share at least one member.',
    example: 'Five etcd nodes need 3 votes to elect a leader, so they survive 2 failures.',
  },
  {
    id: 'election-term',
    term: 'Election term',
    aka: ['term', 'epoch number'],
    definition: 'In Raft, a numbered period of leadership. Each election starts a new term, and at most one leader can win any term.',
    example: 'Node C wins term 5, so Node A, still in term 4, steps down when it hears of it.',
  },
  {
    id: 'election-timeout',
    term: 'Election timeout',
    definition: 'How long a Raft follower waits without hearing from the leader before starting an election. Each follower picks it at random.',
    example: 'etcd’s default election timeout is 1,000 ms, ten heartbeats long.',
  },
  {
    id: 'candidate',
    term: 'Candidate',
    definition: 'In Raft, a node that stopped hearing from the leader, started a new term and is asking the others for their votes.',
    example: 'Node C’s timer runs out first, so it becomes the candidate for term 5.',
  },
  {
    id: 'replicated-log',
    term: 'Replicated log',
    definition: 'An ordered list of changes that the leader copies to every node, so all of them apply the same changes in the same order.',
    example: 'Each change is an entry in the log, committed once a majority of nodes have stored it.',
  },
  {
    id: 'watch',
    term: 'Watch',
    definition: 'A request to a coordination service to be told when a key changes, such as the record naming the current leader.',
    example: 'App servers watch the key /db/photos-1/leader and switch databases when it changes.',
  },
  {
    id: 'paxos',
    term: 'Paxos',
    definition: 'An older consensus algorithm with the same guarantees as Raft, known for being hard to understand and to implement correctly.',
    example: 'Raft was designed as an easier-to-understand alternative to Paxos.',
  },
  {
    id: 'membership-list',
    term: 'Membership list',
    definition: 'Each node’s table of the other nodes in a cluster, with each one’s state and the latest heartbeat counter it has seen.',
    example: 'Cache node 4’s list shows that cache node 9’s counter stopped rising at 812.',
  },
  {
    id: 'gossip-round',
    term: 'Gossip round',
    definition: 'One tick of a gossip protocol, often about a second, in which each node contacts a few random peers and exchanges news.',
    example: 'News that a cache node is down reaches all 200 nodes in about eight rounds.',
  },
  {
    id: 'gossip-fanout',
    term: 'Gossip fanout',
    definition: 'How many random peers each node contacts per gossip round. A bigger fanout spreads news in fewer rounds but sends more messages.',
    example: 'With a fanout of 2, each cache node that knows tells two random nodes per round.',
  },
  {
    id: 'suspected-node',
    term: 'Suspected node',
    aka: ['suspicion'],
    definition: 'A node that missed its heartbeats and is under suspicion, but gets a grace period to prove it is alive before being declared dead.',
    example: 'A cache node paused for 8 seconds is suspected, then cleared when its next heartbeat arrives.',
  },
  {
    id: 'indirect-probe',
    term: 'Indirect probe',
    definition: 'Asking a few other nodes to check on a node that did not answer you, so one bad network link cannot get it declared dead.',
    example: 'Cache node 4 cannot reach node 23, so it asks nodes 61 and 130 to try.',
  },
  {
    id: 'phi-accrual-failure-detector',
    term: 'Phi accrual failure detector',
    definition: 'A failure detector that turns how late a heartbeat is, compared with that node’s usual rhythm, into a suspicion level instead of a fixed timeout.',
    example: 'Apache Cassandra uses a variant of it to decide which peers are down.',
  },
];
