import type { CheatSheet } from '../types';

const sheet: CheatSheet = {
  id: 'rate-limiting',
  title: 'Rate-limiting algorithms',
  summary: 'Token bucket, leaky bucket, fixed and sliding windows, where to enforce them, and how to reject well.',
  lessons: ['rate-limiting', 'timeouts-retries-backoff'],
  sections: [
    {
      title: 'Four algorithms',
      blocks: [
        {
          kind: 'table',
          columns: ['Algorithm', 'How it works', 'Pick it when'],
          rows: [
            ['[[Token bucket|token-bucket]]', 'Holds up to B tokens, refilled at R a second; each request spends one.', 'Most per-user and per-key limits.'],
            ['[[Leaky bucket|leaky-bucket]]', 'A line drains at R a second; a full line rejects.', 'The service needs a steady pace.'],
            ['[[Fixed window|fixed-window]]', 'One counter per calendar minute.', 'Long windows, like daily quotas.'],
            ['[[Sliding window|sliding-window]]', 'Counts the last 60 seconds from now.', 'Accurate per-minute limits.'],
          ],
          caption: 'Token buckets allow a burst of B, then hold rate R; leaky buckets smooth bursts into a queue.',
        },
      ],
    },
    {
      title: 'The arithmetic',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: 'tokens = min(B, tokens + R × elapsed)', note: 'Refill, then spend one token or reject.' },
            { code: '100 at 0:59 + 100 at 1:00', note: 'Twice the limit in 2 s at a fixed window’s boundary.' },
            { code: '42 × 45 ÷ 60 + 18 = 49.5', note: 'Sliding window from two counters. Under a limit of 50, allow.' },
            { code: 'INCR key; EXPIRE key 60', note: 'Fixed window in Redis, counted in one atomic step.' },
          ],
        },
      ],
    },
    {
      title: 'Where to enforce',
      blocks: [
        {
          kind: 'table',
          columns: ['Layer', 'Limits by', 'Good for'],
          rows: [
            ['Client', 'Its own requests', 'Batching and slowing down; bugs ignore it.'],
            ['Edge', 'Internet Protocol (IP) address', 'Floods and [[denial-of-service|denial-of-service]] attacks, cheaply.'],
            ['Gateway', 'Application programming interface (API) key, or user', 'Per-client limits in shared Redis counters.'],
            ['Service', 'Expensive work', 'Uploads per hour, requests at once.'],
          ],
        },
      ],
    },
    {
      title: 'Rejecting well',
      blocks: [
        {
          kind: 'annotated',
          lines: [
            { code: '429 Too Many Requests', note: 'Reject at once, and say why.' },
            { code: 'Retry-After: 30', note: 'Say when to try again.' },
          ],
        },
        {
          kind: 'callout',
          tone: 'interview',
          md: 'Clients back off with jitter, so rejections never become a [[retry storm|retry-storm]]. If Redis is down, [[fail open|fail-open]] for ordinary limits and fail closed for login attempts.',
        },
      ],
    },
  ],
};

export default sheet;
