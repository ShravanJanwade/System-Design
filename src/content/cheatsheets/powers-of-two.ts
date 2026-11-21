import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'powers-of-two',
  title: 'Powers of two and unit conversions',
  summary: 'Powers of two, byte prefixes, time units and bits against bytes, rounded the way estimates use them.',
  lessons: ['back-of-the-envelope', 'estimation-in-the-room', 'latency-numbers', 'latency-throughput-bandwidth'],
  sections: [
    {
      title: 'Powers of two',
      blocks: [
        {
          kind: 'table',
          columns: ['Power of two', 'About', 'Prefix', 'Unit'],
          rows: [
            ['2¹⁰', '10³, a thousand', 'Kilo', '1 KB, a kilobyte'],
            ['2²⁰', '10⁶, a million', 'Mega', '1 MB, a megabyte'],
            ['2³⁰', '10⁹, a billion', 'Giga', '1 GB, a gigabyte'],
            ['2⁴⁰', '10¹², a trillion', 'Tera', '1 TB, a terabyte'],
            ['2⁵⁰', '10¹⁵, a quadrillion', 'Peta', '1 PB, a petabyte'],
          ],
          caption: 'Ten doublings add about three zeros, off by 2% to 13%.',
        },
      ],
    },
    {
      title: 'Exact values worth knowing',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: '2⁸', value: '256', note: 'values in one byte' },
            { label: '2¹⁶', value: '65,536' },
            { label: '2³²', value: '≈ 4.3 billion', note: 'values in 32 bits' },
            { label: '2⁶⁴', value: '≈ 1.8 × 10¹⁹', note: 'values in 64 bits' },
          ],
        },
      ],
    },
    {
      title: 'Time',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: 'Seconds in a day', value: '86,400 ≈ 10⁵', note: 'rates come out about 14% low' },
            { label: 'Seconds in a year', value: '≈ 3 × 10⁷' },
            { label: 'A million a day', value: '≈ 10 a second' },
            { label: '1 ms', value: '1,000 µs = 10⁶ ns' },
          ],
        },
      ],
    },
    {
      title: 'Bits and bytes',
      blocks: [
        {
          kind: 'numbers',
          items: [
            { label: '1 byte', value: '8 bits' },
            { label: '1 gigabit per second (Gbps)', value: '1,000 Mbps', note: 'megabits per second' },
            { label: '1 GB a second', value: '≈ 8 Gbps' },
            { label: '1 Gbps', value: '≈ 125 MB a second' },
          ],
          caption: 'Storage is counted in bytes and network links in bits.',
        },
      ],
    },
    {
      title: 'Multiply in your head',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: '10⁷ × 50 = 5 × 10⁸', note: 'Multiply powers of ten by adding exponents.' },
            { code: '10⁸ a day ÷ 10⁵ s = 10³ a second', note: 'A daily count becomes a rate.' },
            { code: '10⁶ × 1 KB = 1 GB', note: 'A million small records.' },
            { code: '10⁶ × 1 MB = 1 TB', note: 'A million photos of 1 MB each.' },
            { code: '10⁹ × 1 KB = 1 TB', note: 'A billion small records.' },
          ],
        },
        {
          kind: 'callout',
          tone: 'mistake',
          md: 'Losing a factor of 8, bits and bytes, or of 1,000, kilobytes and megabytes. Write the units on every line.',
        },
      ],
    },
  ],
};

export default sheet;
