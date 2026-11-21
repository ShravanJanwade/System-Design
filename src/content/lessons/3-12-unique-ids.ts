import type { DiagramSpec, Lesson, SequenceSpec } from '../types';

/** Two databases, two counters, one ID for two photos; then IDs made on the app servers instead. */
const collision: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'maya', type: 'client', label: 'Maya’s phone', x: 0, y: 0 },
    { id: 'app1', type: 'service', label: 'App server 7', x: 1, y: 0 },
    { id: 'db1', type: 'sqlDb', label: 'Database 1', sublabel: 'users A to M', x: 2, y: 0 },
    { id: 'leo', type: 'client', label: 'Leo’s phone', x: 0, y: 1 },
    { id: 'app2', type: 'service', label: 'App server 12', x: 1, y: 1 },
    { id: 'db3', type: 'sqlDb', label: 'Database 3', sublabel: 'users N to Z', x: 2, y: 1 },
  ],
  edges: [
    { id: 'maya-app1', from: 'maya', to: 'app1', kind: 'sync' },
    { id: 'app1-db1', from: 'app1', to: 'db1', kind: 'sync' },
    { id: 'leo-app2', from: 'leo', to: 'app2', kind: 'sync' },
    { id: 'app2-db3', from: 'app2', to: 'db3', kind: 'sync' },
  ],
  steps: [
    {
      caption: 'Maya’s photo is written to **database 1**, which gives it the next number from its own counter: 1,045,212.',
      flow: ['maya-app1', { edge: 'app1-db1', tag: 'id 1,045,212' }],
    },
    {
      caption: 'Moments later, Leo’s photo goes to **database 3**. Its counter knows nothing about database 1’s, so it also hands out 1,045,212.',
      flow: ['leo-app2', { edge: 'app2-db3', tag: 'id 1,045,212', tone: 'alert' }],
    },
    {
      caption: 'One ID now names two photos. A like, a link or a report that says “photo 1,045,212” can land on the wrong one.',
      focus: ['db1', 'db3'],
      notes: [
        { target: 'db1', text: 'photo 1,045,212', tone: 'alert' },
        { target: 'db3', text: 'photo 1,045,212', tone: 'alert' },
      ],
    },
    {
      caption:
        'The fix: each **app server** builds the ID itself before writing, from the current time, its own machine number and a counter. No database is asked.',
      focus: ['app1', 'app2'],
      notes: [
        { target: 'app1', text: 'machine 7', tone: 'signal' },
        { target: 'app2', text: 'machine 12', tone: 'signal' },
      ],
    },
    {
      caption: 'Even in the same millisecond the two IDs differ, because the machine numbers differ. And since the time comes first, sorting IDs sorts photos by age.',
      flow: [
        [
          { edge: 'app1-db1', tag: 'machine 7, seq 0' },
          { edge: 'app2-db3', tag: 'machine 12, seq 0' },
        ],
      ],
    },
  ],
};

/** The central-counter option: one ticket server hands out every ID. */
const ticketServer: SequenceSpec = {
  actors: [
    { id: 'a', type: 'service', label: 'App server A' },
    { id: 'ticket', type: 'sqlDb', label: 'Ticket server' },
    { id: 'b', type: 'service', label: 'App server B' },
    { id: 'db', type: 'sqlDb', label: 'Database 3' },
  ],
  messages: [
    { from: 'a', to: 'ticket', label: 'next ID?', kind: 'sync', caption: 'App server A asks the ticket server for the next number.' },
    { from: 'ticket', to: 'a', label: '1,045,213', kind: 'reply', caption: 'Its single counter answers. Every ID ever issued comes from here.' },
    { from: 'b', to: 'ticket', label: 'next ID?', kind: 'sync', caption: 'App server B asks at the same moment and waits its turn.' },
    { from: 'ticket', to: 'b', label: '1,045,214', kind: 'reply', caption: 'No collisions, because there is only one counter, but every insert now waits for a network round trip first.' },
    { from: 'a', to: 'db', label: 'insert photo 1,045,213', kind: 'sync', caption: 'Only now can the photo be saved. If the ticket server is down, nobody can create anything.' },
  ],
};

const lesson: Lesson = {
  id: 'unique-ids',
  module: 'm3',
  order: 12,
  title: 'Unique IDs at scale',
  idea: 'When data lives on many machines, every new record still needs a unique identifier (ID), and the best schemes let each machine make IDs on its own that never collide and still sort by time.',
  minutes: 13,
  prerequisites: ['databases-101', 'indexes'],
  outcomes: [
    'Explain why auto-increment IDs break once data is split across databases.',
    'Compare universally unique identifiers (UUIDs) and Snowflake-style IDs on size, sorting and coordination.',
    'Decode a Snowflake ID into its time, machine and sequence number.',
  ],
  analogy: {
    title: 'Deli tickets with a branch code',
    body: 'At a deli counter, you pull a numbered ticket from a single dispenser: 41, 42, 43. With one dispenser, numbers never repeat, and they show who came first.\n\nNow the deli opens ten branches, each with its own dispenser, and two customers in different branches can both hold ticket 42. The fix is to print the branch code on every ticket, next to the time and a counter. No two tickets anywhere are alike, and they still sort by when they were printed.',
  },
  whyItMatters:
    'Snapgram’s photo data no longer fits on one database, so it has been split across four, each holding a share of the users: a step called [[sharding|sharding]]. Each database still numbers new photos with [[auto-increment|auto-increment]]: 1, 2, 3 and so on. Within a week, two different photos are both called 1,045,212, one on database 1 and one on database 3.\n\nLinks break, a like lands on the wrong photo, and merging data for a report produces duplicates. Snapgram needs IDs that are unique across every database, can be made without a central bottleneck, and ideally still sort by time, so the newest photos come first.',
  body: [
    {
      kind: 'prose',
      md: 'On one database, an auto-increment [[primary key|primary-key]] is perfect. IDs are small, they never repeat, and they sort by creation time, so the newest photo always has the biggest number. The trouble starts with a second database: each counter knows only its own rows, so both happily hand out the same numbers.',
    },
    {
      kind: 'diagram',
      title: 'Two counters, one ID',
      caption: 'What auto-increment does after sharding, and the fix. Use Play, or the arrow keys.',
      spec: collision,
    },
    {
      kind: 'prose',
      md: 'There are three classic ways out. You can number the databases apart, giving one the odd numbers and the other the even ones, which works until you add a third. You can ask one central counter, a [[ticket server|ticket-server]], for every ID, which brings back a [[single point of failure|single-point-of-failure]]. Or you can let every machine make IDs on its own in a way that can’t collide, which is what UUIDs and Snowflake IDs do.',
    },
    {
      kind: 'sequence',
      title: 'A central counter',
      caption: 'Unique and in order, but every ID costs a round trip to one server.',
      spec: ticketServer,
    },
    { kind: 'heading', text: 'UUIDs' },
    {
      kind: 'prose',
      md: 'A [[UUID|uuid]] is 128 bits, usually written as 32 hexadecimal characters such as `f47ac10b-58cc-4372-a567-0e02b2c3d479`. The common version 4 fills 122 of those bits at random, so any machine can make one alone, and the chance of two ever matching is small enough to ignore. The costs: it is twice the size of a 64-bit number, and because it is random, new rows land all over a [[B-tree|b-tree]] [[index|index]] instead of at the end, which slows inserts on big tables.',
    },
    { kind: 'heading', text: 'Snowflake IDs' },
    {
      kind: 'prose',
      md: 'Twitter’s answer, the [[Snowflake ID|snowflake-id]], packs three fields into one 64-bit number. After an unused sign bit, 41 bits count milliseconds since a custom [[epoch|epoch]], 10 bits hold the machine’s number, and 12 bits are a sequence that counts IDs made in the same millisecond. Because the time comes first, a bigger ID means a newer record.',
    },
    {
      kind: 'numbers',
      caption: 'The arithmetic behind the layout: 2¹² = 4,096, 2¹⁰ = 1,024, and 2⁴¹ milliseconds is about 69.7 years.',
      items: [
        { label: 'Sequence, 12 bits', value: '4,096 IDs', note: 'per machine, per millisecond' },
        { label: 'Machine number, 10 bits', value: '1,024 machines' },
        { label: 'Timestamp, 41 bits of milliseconds', value: '≈ 69 years', note: 'from the chosen epoch' },
        { label: 'One machine at full speed', value: '≈ 4 million IDs/s' },
      ],
    },
    {
      kind: 'prose',
      md: 'If one machine needs more than 4,096 IDs in a single millisecond, it waits for the next millisecond. The real danger is the clock: if a machine’s clock jumps backwards, say when it is corrected, it could reuse a timestamp. And [[clock skew|clock-skew]] between machines means IDs from different machines are only roughly in time order, which is fine for a feed.',
    },
    { kind: 'heading', text: 'Why sortable IDs matter' },
    {
      kind: 'prose',
      md: 'IDs that sort by time make newest-first [[pagination|pagination]] easy (“the next 20 photos with IDs below this one”) and keep inserts at the end of the index, where they are cheap. That is why newer formats borrow Snowflake’s idea: UUID version 7 starts with a 48-bit millisecond timestamp and fills most of the rest at random, so it is unique without machine numbers and still sorts by time.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Many Snowflake implementations split the 10 machine bits into a data center number and a worker number, and every machine needs a reliable way to get its unique number, such as a configuration service. Some systems instead hand each server a block of numbers from a central counter, so it only asks once per thousand IDs.',
    },
  ],
  tryIt: [
    {
      kind: 'widget',
      id: 'snowflake-bits',
      title: 'Build and decode a Snowflake ID',
      caption: 'Generate IDs on a simulated clock and watch the bits fill in. Make several in one millisecond to see the sequence count up, then decode any ID back into its parts.',
    },
  ],
  tradeoffs: {
    caption: 'Three ways to number Snapgram’s photos.',
    rows: [
      {
        option: 'Auto-increment',
        goodAt: 'Small, readable and in perfect order, with no extra work.',
        badAt: 'Collides across databases, and reveals how many records you have.',
        pickWhen: 'One database is enough, now and for the foreseeable future.',
      },
      {
        option: 'Random UUID',
        goodAt: 'Any machine makes one alone, with no setup or coordination.',
        badAt: '128 bits, no time order, and random inserts scatter across indexes.',
        pickWhen: 'IDs are made in many places, even offline, and order doesn’t matter.',
      },
      {
        option: 'Snowflake ID',
        goodAt: 'Fits in 64 bits, unique across machines, and roughly sorted by time.',
        badAt: 'Every machine needs a unique number, and it depends on clocks not jumping back.',
        pickWhen: 'High volume across many servers, and newest-first order matters.',
      },
    ],
  },
  realWorld: {
    title: 'Twitter’s Snowflake',
    body: 'When Twitter moved from MySQL to Cassandra, it needed a new way to generate IDs, and in 2010 it released Snowflake, a network service for generating unique ID numbers at high scale. The original project page asks for at least 10,000 IDs per second per process and promises IDs that are roughly sorted, within about a second.\n\nThe format is the one in this lesson: 41 bits of milliseconds since a custom epoch, good for 69 years; a 10-bit machine number, for up to 1,024 machines; and a 12-bit sequence that rolls over every 4,096 IDs per machine. Because it depends on clocks, Snowflake refuses to generate IDs if the clock has moved backwards, until the time passes the last one it used.',
    sourceUrl: 'https://github.com/twitter-archive/snowflake/tree/snowflake-2010',
    sourceLabel: 'Twitter, Snowflake (2010 release), GitHub',
  },
  interview: {
    whenToMention:
      'When you shard a database, sketch a data model, or need IDs that sort by time for a feed or for paging. Name the scheme, say how machines get unique numbers, and say what happens if a clock jumps.',
    sayItLikeThis: [
      'Auto-increment won’t work once photos are sharded, so I’d use Snowflake-style IDs: a millisecond timestamp, a machine number and a sequence, all in 64 bits.',
      'Because the timestamp comes first, IDs sort by creation time, so the feed can page with “photos with IDs below this one”, and inserts stay at the end of the index.',
    ],
    followUps: [
      {
        q: 'Why not just use UUIDs?',
        a: 'They need no coordination, but they are 128 bits, and random ones don’t sort, so inserts scatter across the index and the feed needs a separate timestamp to order by. A time-ordered format, Snowflake or UUID version 7, avoids both problems.',
      },
      {
        q: 'What happens if a server’s clock jumps backwards?',
        a: 'It could reuse a timestamp and, with the same machine number, repeat an ID. Generators remember the last timestamp they used and refuse to issue IDs until the clock passes it. Clocks are kept in sync with the Network Time Protocol (NTP), set to adjust gradually rather than jump.',
      },
      {
        q: 'How do machines get unique machine numbers?',
        a: 'From configuration, or from a coordination service when each machine starts, for example by leasing a number from 0 to 1,023. Two machines with the same number could produce the same IDs, so that assignment has to be reliable.',
      },
    ],
    redFlags: [
      'Keeping auto-increment after sharding and hoping IDs don’t collide.',
      'Using random UUIDs as the key of a huge, insert-heavy table without mentioning the index cost.',
      'Assuming Snowflake IDs are in exact time order across machines.',
    ],
  },
  mistakes: [
    '**Keeping auto-increment after sharding.** Each database’s counter knows only itself, so IDs collide as soon as there are two.',
    '**Using random IDs where order matters.** Random UUIDs scatter inserts across the index and can’t sort a feed by time.',
    '**Ignoring the clock.** A clock that jumps backwards can repeat a timestamp, so the generator must notice and wait.',
    '**Exposing sequential IDs.** Public, counting-up IDs let anyone estimate how many photos you have, or walk through them one by one.',
  ],
  quiz: [
    {
      kind: 'single',
      prompt: 'Snapgram splits photos across four databases, each with its own auto-increment counter. What goes wrong?',
      options: [
        { text: 'Two databases can give different photos the same ID', correct: true, why: 'Each counter only knows its own rows, so they count through the same numbers.' },
        { text: 'The counters run out of numbers sooner', correct: false, why: 'A 64-bit counter lasts practically forever. The problem is duplicates, not running out.' },
        { text: 'IDs stop being whole numbers', correct: false, why: 'They are still whole numbers, just not unique across databases.' },
        { text: 'Inserts get slower on every database', correct: false, why: 'Each counter is as fast as before. The trouble is collisions, not speed.' },
      ],
    },
    {
      kind: 'numeric',
      prompt: 'A Snowflake ID (identifier) uses 12 bits for the sequence. At most, how many IDs can one machine make in one second?',
      answer: 4096000,
      unit: 'IDs',
      tolerance: 1.1,
      solution: [
        '12 bits give 2¹² = 4,096 sequence numbers per millisecond.',
        'A second has 1,000 milliseconds: 4,096 × 1,000 = 4,096,000.',
        'That is about 4 million IDs per second, per machine.',
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which of these are true of Snowflake-style IDs?',
      options: [
        { text: 'They fit in a 64-bit integer', correct: true, why: 'A sign bit plus 41 + 10 + 12 bits makes 64.' },
        {
          text: 'IDs from one machine keep increasing over time',
          correct: true,
          why: 'The timestamp leads, and within a millisecond the sequence counts up, as long as the clock doesn’t jump back.',
        },
        { text: 'Every ID needs a call to a central server', correct: false, why: 'Each machine builds IDs from its own clock, machine number and counter.' },
        { text: 'They are in exact time order across all machines', correct: false, why: 'Clocks differ slightly between machines, so the order is only approximate.' },
      ],
    },
    {
      kind: 'order',
      prompt: 'Put the fields of a Snowflake ID in order, from the leftmost bit to the rightmost.',
      items: ['Sign bit, always 0', 'Timestamp: 41 bits of milliseconds', 'Machine number: 10 bits', 'Sequence: 12 bits'],
      why: 'The timestamp sits right after the sign bit, so comparing IDs compares times first; the machine and sequence only break ties within a millisecond.',
    },
    {
      kind: 'single',
      prompt: 'Why do random UUIDs slow down inserts on a very large table?',
      options: [
        {
          text: 'Each new ID lands at a random spot in the index, touching pages all over it',
          correct: true,
          why: 'Time-ordered IDs append near the end of the index instead, so the pages being written stay few and in memory.',
        },
        { text: 'UUIDs take a long time to generate', correct: false, why: 'Making one takes a few random bytes. The cost is in the index.' },
        { text: 'Databases can’t index UUIDs', correct: false, why: 'They can, just less efficiently when the values are random.' },
        { text: 'UUIDs often collide, so inserts are retried', correct: false, why: 'Collisions are so unlikely that they can be ignored.' },
      ],
    },
  ],
  takeaways: [
    'Auto-increment is perfect on one database but collides as soon as data is split across several.',
    'UUIDs need no coordination but are large and, in their random form, unordered.',
    'Snowflake-style IDs pack time, machine and sequence into 64 bits, so machines make unique IDs alone and the IDs sort by time.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Odd and even counters.** Flickr kept its central counters but avoided a single point of failure by running two ticket servers, one handing out odd numbers and the other even ones, with requests spread between them.',
    },
    {
      kind: 'prose',
      md: '**Short IDs for people.** A 64-bit ID can be 19 digits long. Short links often rewrite it with letters as well as digits, which fits it in about 11 characters.',
    },
    {
      kind: 'prose',
      md: '**Why custom epochs.** Counting from 2025 instead of 1970 spends none of the 41 bits on years that already passed. Systems that store Unix time as seconds in a signed 32-bit number run out in January 2038, the same lesson at a smaller size.',
    },
  ],
  flashcards: [
    { front: 'Why does auto-increment break after sharding?', back: 'Each database counts on its own, so two databases hand out the same numbers to different records.' },
    { front: 'What is in a Snowflake ID?', back: 'A sign bit, 41 bits of milliseconds since a custom epoch, a 10-bit machine number and a 12-bit sequence.' },
    { front: 'How many IDs can one Snowflake machine make per millisecond?', back: '4,096, from the 12-bit sequence. After that it waits for the next millisecond.' },
    { front: 'How long does a 41-bit millisecond timestamp last?', back: 'About 69 years from its epoch.' },
    { front: 'What is the main cost of random UUIDs as keys?', back: 'They are 128 bits and unordered, so inserts scatter across the index and they can’t sort by time.' },
    { front: 'What must a Snowflake generator do if its clock goes backwards?', back: 'Refuse or wait until the clock passes the last timestamp it used, so it never repeats an ID.' },
  ],
  related: ['sharding', 'indexes', 'databases-101', 'time-and-ordering', 'consistent-hashing'],
  glossaryTerms: [
    'sharding',
    'auto-increment',
    'primary-key',
    'ticket-server',
    'single-point-of-failure',
    'uuid',
    'b-tree',
    'index',
    'snowflake-id',
    'epoch',
    'clock-skew',
    'pagination',
  ],
};

export default lesson;
