import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'capacity-ballparks',
  title: 'Capacity ballparks',
  summary: 'Rough sizes for one server, one database, a network link and a busy app, for sanity checks rather than purchase orders.',
  lessons: ['latency-throughput-bandwidth', 'back-of-the-envelope', 'estimation-in-the-room', 'sharding', 'stateless-vs-stateful'],
  rough: true,
  sections: [
    {
      title: 'One machine',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'One app server', value: '≈ 500 requests a second', note: 'until you measure' },
            { label: 'One database, before you shard', value: 'several TB, or tens of thousands of writes a second' },
            { label: 'A lookup in an in-memory key-value store', value: '≈ 1 ms' },
          ],
          caption: 'Real capacity depends on hardware, data and the work per request.',
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: 'Numbers near a limit deserve a second look: data that almost fits in memory, or writes close to what one database can take.',
        },
      ],
    },
    {
      title: 'Network',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'A 1 gigabit per second (Gbps) link', value: '≈ 125 MB a second' },
            { label: 'A 3 MB photo through 10 Mbps', value: '≈ 2.4 s' },
            { label: 'A 300 MB video through 10 Mbps', value: '≈ 4 minutes' },
            { label: 'Data in flight to fill 1 Gbps over a 150 ms round trip', value: '≈ 19 MB' },
            { label: '100 petabytes through 10 Gbps', value: '≈ 2.5 years', note: 'a truck can win' },
          ],
          caption: 'In megabits (Mbps) and gigabits per second.',
        },
      ],
    },
    {
      title: 'Load and headroom',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Busiest hour against the average, daily rhythm', value: '2 to 3 times' },
            { label: 'Launches, holidays and viral moments', value: '10 times or more' },
            { label: 'Twitter’s record second in 2013, against its steady state', value: '≈ 25 times' },
            { label: 'Wait at a server that is 50% busy', value: '≈ the work itself' },
            { label: 'Wait at a server that is 90% busy', value: '≈ 9 times the work' },
          ],
          caption: 'Waits from the simplest textbook queueing model.',
        },
      ],
    },
    {
      title: 'An example app at 10 million daily users',
      blocks: [
        {
          kind: 'table',
          columns: ['Number', 'Ballpark', 'Decides'],
          rows: [
            ['Peak reads', '≈ 15,000 photo views a second', 'A cache in front of the database'],
            ['Storage a year', '≈ 700 TB of photos', 'Object storage'],
            ['Peak bandwidth out', '≈ 3 GB a second', 'A content delivery network'],
            ['Cache', '≈ 100 GB of photo details', 'Whether hot data fits in memory'],
          ],
          caption: 'Snapgram, the course’s example app, rounded hard on purpose.',
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: 'Trusting a result that says one server needs 20 TB of memory. An input or the design is wrong.',
        },
      ],
    },
  ],
};

export default sheet;
