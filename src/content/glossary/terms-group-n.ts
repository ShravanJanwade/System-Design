import type { RawTerm } from '../types';

/** New glossary terms from lesson group N (lessons 5.4 and 5.5). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'cascading-failure',
    term: 'Cascading failure',
    definition: 'A failure that spreads: one slow or broken part makes its callers wait or fail, which in turn overloads their own callers.',
    example: 'A slow suggestions service ties up the feed service’s threads, and soon the whole home feed stops loading.',
  },
  {
    id: 'fail-fast',
    term: 'Fail fast',
    definition: 'Giving up on a request immediately when it cannot succeed, instead of waiting, so the caller can recover or use a fallback at once.',
    example: 'With the breaker open, the feed skips the suggestions call and answers in milliseconds.',
  },
  {
    id: 'fallback',
    term: 'Fallback',
    definition: 'What a caller returns when a dependency fails or is cut off, such as cached data, a default value or a simpler result.',
    example: 'When suggestions are unavailable, Snapgram shows a cached list of popular accounts.',
  },
  {
    id: 'half-open-state',
    term: 'Half-open state',
    aka: ['half-open'],
    definition: 'The circuit breaker state after a cool-down, in which one trial request goes through to test whether the dependency has recovered.',
    example: 'After 30 seconds, the breaker lets one call reach the suggestions service to see whether it answers.',
  },
  {
    id: 'bulkhead',
    term: 'Bulkhead',
    definition: 'A wall between resources, such as a separate pool of connections per dependency, so one failing part can use up only its own share.',
    example: 'Suggestions calls get 10 connections of their own, so a slow suggestions service cannot take the connections posts need.',
  },
  {
    id: 'connection-pool',
    term: 'Connection pool',
    definition: 'A set of open connections to a database or service that a program keeps ready and reuses, instead of opening one per call.',
    example: 'The feed service keeps 40 connections to the posts service and borrows one for each call.',
  },
  {
    id: 'thread-pool',
    term: 'Thread pool',
    definition: 'A fixed set of worker threads that run tasks taken from a queue. When every thread is busy, new tasks wait or are rejected.',
    example: 'Each feed request runs on one of the feed service’s 200 threads.',
  },
  {
    id: 'sliding-window',
    term: 'Sliding window',
    aka: ['rolling window', 'sliding window log', 'sliding window counter'],
    definition: 'Counting only the events in the most recent stretch, such as the last 60 seconds or the last 10 calls, measured back from now.',
    example: 'The gateway allows 100 calls in any 60 seconds, not 100 per calendar minute.',
  },
  {
    id: 'load-shedding',
    term: 'Load shedding',
    definition: 'Deliberately rejecting some requests when a service is overloaded, usually the least important first, so it can keep serving the rest.',
    example: 'During a spike, Snapgram drops view-count updates so uploads and feeds stay fast.',
  },
  {
    id: 'scraper',
    term: 'Scraper',
    aka: ['web scraper'],
    definition: 'A program that downloads pages or calls an API automatically, usually far faster than any person would.',
    example: 'A partner’s scraper requests every public Snapgram profile, thousands a second.',
  },
  {
    id: 'burst',
    term: 'Burst',
    aka: ['traffic burst'],
    definition: 'Many requests arriving within a very short time, well above the usual rate.',
    example: 'A partner’s script sends 50 requests in a tenth of a second, then nothing for ten seconds.',
  },
  {
    id: 'leaky-bucket',
    term: 'Leaky bucket',
    definition: 'A rate limiter that queues requests and lets them out at a fixed pace; when the queue is full, new requests are rejected.',
    example: 'Snapgram’s email sender drains its queue at a steady 100 emails a second, however fast they arrive.',
  },
  {
    id: 'fixed-window',
    term: 'Fixed window counter',
    aka: ['fixed window'],
    definition: 'A rate limiter that counts requests per calendar window, such as each minute, and starts again from zero when the next window begins.',
    example: 'A free-plan key may make 1,000 calls per hour, counted from the top of each hour.',
  },
  {
    id: 'denial-of-service',
    term: 'Denial-of-service attack',
    aka: ['DoS', 'DDoS', 'distributed denial-of-service attack'],
    definition: 'An attack that floods a service with traffic so real users cannot get through. A distributed one comes from many machines at once.',
    example: 'Thousands of hijacked machines send login requests to Snapgram as fast as they can.',
  },
  {
    id: 'atomic-operation',
    term: 'Atomic operation',
    definition: 'An operation that happens as one indivisible step, so no other operation can see it half done or slip in between its parts.',
    example: 'Redis adds one to a counter and returns the new value in one step, so two gateways cannot both read 99.',
  },
  {
    id: 'fail-open',
    term: 'Fail open',
    aka: ['fail closed'],
    definition: 'When a safety check cannot run, letting requests through rather than blocking them. Failing closed blocks them instead.',
    example: 'If Redis is unreachable, Snapgram’s gateway lets likes through rather than rejecting every user.',
  },
  {
    id: 'quota',
    term: 'Quota',
    definition: 'A fixed allowance of usage over a long period, such as 10,000 calls a day, often tied to a pricing plan.',
    example: 'A free partner key has a quota of 10,000 calls a day.',
  },
];
