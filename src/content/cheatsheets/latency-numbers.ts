import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'latency-numbers',
  title: 'Latency numbers',
  summary: 'What memory, disks and network round trips cost, from a nanosecond to an ocean crossing, and the habits that follow.',
  lessons: ['latency-numbers', 'latency-throughput-bandwidth'],
  sections: [
    {
      title: 'The ladder',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Read from the [[processor’s own cache|cpu-cache]]', value: '≈ 0.5 ns' },
            { label: '[[Main memory|main-memory]] reference', value: '≈ 100 ns' },
            { label: 'Random 4 KB read, [[solid-state drive|ssd]] (SSD)', value: '≈ 150 µs' },
            { label: 'Round trip within one data center', value: '≈ 0.5 ms' },
            { label: '[[Disk seek|disk-seek]] on a spinning disk', value: '≈ 10 ms' },
            { label: '[[Content delivery network|cdn]] (CDN) edge near the user', value: '≈ 10 ms' },
            { label: 'Sequential 1 MB read from disk', value: '≈ 20 ms' },
            { label: 'Round trip across continents', value: '≈ 150 ms' },
          ],
          caption: 'Ballpark, from the Jeff Dean and Peter Norvig table of about 2012.',
        },
      ],
    },
    {
      title: 'If 1 nanosecond lasted 1 second',
      blocks: [
        {
          kind: 'table',
          columns: ['Operation', 'Real time', 'Slowed down'],
          rows: [
            ['Processor’s own cache', '0.5 ns', 'Half a second'],
            ['Main memory', '100 ns', 'About 1.7 minutes'],
            ['SSD read', '150 µs', 'Almost 2 days'],
            ['Disk seek', '10 ms', 'Nearly 4 months'],
            ['Across continents', '150 ms', 'Almost 5 years'],
          ],
        },
      ],
    },
    {
      title: 'Units',
      blocks: [
        {
          kind: 'annotated',
          lines: [{ code: '1 s = 1,000 ms = 10⁶ µs = 10⁹ ns', note: 'Milliseconds, microseconds and nanoseconds: each is 1,000 times the next.' }],
        },
      ],
    },
    {
      title: 'Small or big?',
      blocks: [
        {
          kind: 'table',
          columns: ['Sending', 'Round trip to Oregon', 'Push through 10 Mbps'],
          rows: [
            ['A like, ≈ 1 KB', '≈ 150 ms', 'Under 1 ms'],
            ['A photo, ≈ 3 MB', '≈ 150 ms', '≈ 2.4 s'],
            ['A video, ≈ 300 MB', '≈ 150 ms', '≈ 4 minutes'],
          ],
          caption: 'From Singapore, in megabits per second (Mbps). Small requests wait on the trip, big ones on [[bandwidth|bandwidth]].',
        },
      ],
    },
    {
      title: 'Rules of thumb',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: '50 calls × 0.5 ms ≈ 25 ms', note: 'Fifty calls in one data center' },
            { code: '50 calls × 150 ms ≈ 7.5 s', note: 'The same calls across an ocean' },
            { code: '10 ms ÷ 0.5 ms = 20', note: 'A nearby cache beats a disk seek' },
            { code: '10 ms ÷ 100 ns = 100,000', note: 'One seek: 100,000 memory reads' },
          ],
        },
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Remove the slowest step first: the ocean, then the disk.',
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: 'Light in fiber covers about 200,000 km a second, so distance sets a floor no hardware can beat.',
        },
      ],
    },
  ],
};

export default sheet;
