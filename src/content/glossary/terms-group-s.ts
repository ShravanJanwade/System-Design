import type { RawTerm } from '../types';

/** New glossary terms from lesson group S (lessons 6.5 and 6.6). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'mapreduce',
    term: 'MapReduce',
    definition: 'A batch model: map turns each record into key and value pairs, reduce combines the values sharing a key, across many machines.',
    example: 'Counting every hashtag in a year of Snapgram posts as (#sunset, 1) pairs, added up per tag.',
  },
  {
    id: 'shuffle',
    term: 'Shuffle',
    definition: 'The step between map and reduce that sends every key and value pair over the network to the machine responsible for its key.',
    example: 'All the #sunset pairs from a thousand map workers reach the same reduce worker.',
  },
  {
    id: 'tumbling-window',
    term: 'Tumbling window',
    definition: 'A stream window of fixed size that starts where the previous one ended, so windows never overlap and each event lands in exactly one.',
    example: 'Trending counts hashtags per five minutes: 18:00 to 18:05, then 18:05 to 18:10.',
  },
  {
    id: 'event-time',
    term: 'Event time',
    definition: 'When an event actually happened, such as the moment a phone posted a photo, as opposed to when a system processes it.',
    example: 'A post made at 18:14 has event time 18:14, even if it arrives at 18:17.',
  },
  {
    id: 'processing-time',
    term: 'Processing time',
    definition: 'When a system receives or processes an event, which can be seconds or hours after the event happened.',
    example: 'The subway post reached the stream processor at 18:16:54, almost three minutes after it was made.',
  },
  {
    id: 'watermark',
    term: 'Watermark',
    definition: 'A stream processor’s moving estimate that no more events older than a given time will arrive, used to decide when a window is complete.',
    example: 'At 18:16 the watermark passes 18:15, so the 18:10 to 18:15 window publishes its count.',
  },
  {
    id: 'late-event',
    term: 'Late event',
    aka: ['late data'],
    definition: 'An event that arrives after the stream processor has already published the result for its window.',
    example: 'A #sunset post from 18:14 that arrives at 18:16:54, after its window published at 18:16.',
  },
  {
    id: 'allowed-lateness',
    term: 'Allowed lateness',
    definition: 'How long a stream processor keeps a window after publishing its result, so late events can still update it; later events are dropped.',
    example: 'With five minutes of allowed lateness, the subway post raises the published count from 4 to 5.',
  },
  {
    id: 'lambda-architecture',
    term: 'Lambda architecture',
    definition: 'Running a stream for fast, approximate results and a batch job over the same events for exact results that replace them later.',
    example: 'Trending counts come from the stream; the nightly batch corrects them with every late post.',
  },
  {
    id: 'kappa-architecture',
    term: 'Kappa architecture',
    definition: 'Using one stream-processing pipeline for everything, and recomputing history by replaying the stored event log through it.',
    example: 'To fix a counting bug, Snapgram replays a month of post events through the corrected job.',
  },
  {
    id: 'news-feed',
    term: 'News feed',
    aka: ['home feed', 'feed', 'timeline', 'home timeline'],
    definition: 'A personal list of recent posts from the accounts a user follows, usually newest or most relevant first.',
    example: 'Maya’s Snapgram home feed shows new posts from the 300 accounts she follows.',
  },
  {
    id: 'social-graph',
    term: 'Social graph',
    aka: ['follow graph'],
    definition: 'The record of who follows whom, used to find an author’s followers or the accounts a reader follows.',
    example: 'Looking up Maya’s 300 followers before copying her post into their feeds.',
  },
  {
    id: 'fan-out-on-write',
    term: 'Fan-out on write',
    aka: ['push model', 'push'],
    definition: 'Building feeds ahead of time: each new post is copied into the feed of every follower, so reading a feed is one lookup.',
    example: 'Maya posts, and workers append her post to the feeds of her 300 followers.',
  },
  {
    id: 'fan-out-on-read',
    term: 'Fan-out on read',
    aka: ['pull model', 'pull'],
    definition: 'Building a feed when it is opened, by gathering recent posts from every followed account and merging them by time.',
    example: 'Opening the app makes 300 lookups, one per account Maya follows.',
  },
  {
    id: 'celebrity-problem',
    term: 'Celebrity problem',
    aka: ['hot user problem'],
    definition: 'The cost spike when an account with millions of followers posts, such as millions of feed writes under fan-out on write.',
    example: 'A pop star with 30 million followers posts, and 30 million feed writes follow.',
  },
  {
    id: 'hybrid-fan-out',
    term: 'Hybrid fan-out',
    definition: 'Pushing posts from ordinary accounts into followers’ feeds, while pulling posts from very large accounts at read time and merging them in.',
    example: 'Snapgram pushes Maya’s posts but merges the pop star’s posts in when each feed is opened.',
  },
];
