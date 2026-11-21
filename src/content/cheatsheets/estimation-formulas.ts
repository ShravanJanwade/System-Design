import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'estimation-formulas',
  title: 'Estimation formulas',
  summary: 'The few multiplications behind traffic, storage, bandwidth, cache size and requests in flight, each with a worked example.',
  lessons: ['back-of-the-envelope', 'estimation-in-the-room', 'latency-throughput-bandwidth'],
  sections: [
    {
      title: 'Traffic',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'requests a day = daily users × actions each', note: '1 million daily active users × 100 actions = 10⁸.' },
            { code: 'per second ≈ requests a day ÷ 10⁵', note: '10⁸ ÷ 10⁵ = 1,000 requests a second on average.' },
            { code: 'peak = average × peak factor', note: 'A [[peak factor|peak-factor]] of 2 to 3 for a daily rhythm; 10 or more for launches.' },
            { code: 'writes ≈ requests ÷ reads per write', note: 'At 100 reads per write, 1,000 a second hold about 10 writes.' },
            { code: 'servers = peak ÷ one server’s capacity', note: '2,000 at peak ÷ 500 each = 4, so run 5 or 6 for [[headroom|headroom]].' },
          ],
        },
      ],
    },
    {
      title: 'Storage',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'a day = writes a day × object size', note: '1 million photos × 1 MB = 1 TB a day.' },
            { code: 'a year ≈ a day × 365', note: '1 TB a day is about 400 TB a year.' },
            { code: 'total = a year × years kept × copies', note: '400 TB × 5 years ≈ 2 petabytes, and about 3 copies on raw disk.' },
          ],
        },
      ],
    },
    {
      title: 'Bandwidth',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'in = writes per second × object size', note: '10 writes a second × 1 MB = 10 MB a second.' },
            { code: 'out = reads per second × object size', note: '1,000 reads a second × 1 MB = 1 GB a second, 2 GB at peak.' },
            { code: 'bits = bytes × 8', note: 'Links are rated in bits: 2 GB a second ≈ 16 gigabits a second.' },
            { code: 'transfer ≈ round trips × trip time + size ÷ bandwidth', note: 'Small messages pay for the trip, big ones for the push.' },
          ],
        },
      ],
    },
    {
      title: 'Cache and concurrency',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'cache ≈ 0.2 × reads a day × object size', note: 'The [[80/20 rule|pareto-principle]], an upper bound: 0.2 × 10⁸ × 1 KB = 20 GB.' },
            { code: 'in flight = arrivals per second × seconds each', note: '[[Little’s law|littles-law]]: 2,000 a second × 0.1 s = 200 at once.' },
            { code: 'bytes in flight = bandwidth × round trip', note: 'To keep a long link busy: 1 Gbps × 150 ms ≈ 19 MB.' },
          ],
        },
      ],
    },
    {
      title: 'Rounding',
      blocks: [
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Say each assumption out loud, keep one or two [[significant figures|significant-figure]], and end every number with the decision it informs.',
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: '[[False precision|false-precision]]: 1,157 requests a second is about 1,000 or 1,200, never 1,157.',
        },
      ],
    },
  ],
};

export default sheet;
