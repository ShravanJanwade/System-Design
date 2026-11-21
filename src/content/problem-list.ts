/**
 * The interview problem bank (blueprint section 7): titles, tiers and the concepts each exercises.
 * Small enough to load anywhere; the full problems live in src/content/problems/.
 */
export type ProblemSummary = {
  id: string;
  title: string;
  tier: 1 | 2 | 3;
  flagship: boolean;
  concepts: string;
  /** Tier 3 problems are 60-minute interviews; the rest are 45. */
  minutes: 45 | 60;
};

const bank: Omit<ProblemSummary, 'minutes'>[] = [
  { id: 'url-shortener', title: 'URL shortener', tier: 1, flagship: true, concepts: 'ID generation, base62 encoding, read-heavy caching, 301 vs. 302 redirects, async click analytics' },
  { id: 'pastebin', title: 'Pastebin', tier: 1, flagship: false, concepts: 'Object storage plus metadata, expiry, CDN' },
  { id: 'rate-limiter', title: 'Rate limiter', tier: 1, flagship: true, concepts: 'The four algorithms, shared counters, where to enforce, behavior when the limiter itself fails' },
  { id: 'unique-id-generator', title: 'Unique ID generator', tier: 1, flagship: false, concepts: 'Snowflake IDs, clock skew' },
  { id: 'notification-system', title: 'Notification system', tier: 1, flagship: false, concepts: 'Queues, retries, user preferences, push/email/SMS providers, deduplication' },
  { id: 'distributed-cache', title: 'Distributed cache', tier: 1, flagship: false, concepts: 'Consistent hashing, eviction, replication, hot keys' },
  { id: 'news-feed', title: 'News feed', tier: 2, flagship: true, concepts: 'Fan-out strategies, the celebrity problem, feed caching, ranking at a high level' },
  { id: 'chat-app', title: 'Chat app', tier: 2, flagship: true, concepts: 'WebSockets, presence, message ordering, delivery receipts, offline delivery, group chats' },
  { id: 'photo-sharing', title: 'Photo sharing', tier: 2, flagship: false, concepts: 'Upload pipeline, object storage, CDN, feed' },
  { id: 'video-streaming', title: 'Video streaming', tier: 2, flagship: true, concepts: 'Upload, transcoding pipeline, adaptive bitrate streaming, CDN' },
  { id: 'file-sync', title: 'File sync', tier: 2, flagship: false, concepts: 'Chunking, deduplication, metadata, sync conflicts, change notifications' },
  { id: 'search-autocomplete', title: 'Search autocomplete', tier: 2, flagship: false, concepts: 'Tries, precomputed top-K per prefix, caching' },
  { id: 'web-crawler', title: 'Web crawler', tier: 2, flagship: false, concepts: 'URL frontier, politeness, deduplication, distributed workers' },
  { id: 'nearby-places', title: 'Nearby places', tier: 2, flagship: false, concepts: 'Geohashes or quadtrees, read-heavy design' },
  { id: 'ride-sharing', title: 'Ride sharing', tier: 2, flagship: false, concepts: 'High-frequency location updates, matching, geospatial index, assignment consistency' },
  { id: 'ticket-booking', title: 'Ticket booking', tier: 2, flagship: true, concepts: 'Contention, seat holds with expiry, preventing double booking, virtual waiting room' },
  { id: 'leaderboard', title: 'Leaderboard', tier: 2, flagship: false, concepts: 'Sorted sets, sharding, approximate ranks' },
  { id: 'trending-topics', title: 'Trending topics (top-K)', tier: 2, flagship: false, concepts: 'Stream processing, windows, Count-Min Sketch' },
  { id: 'ad-click-aggregator', title: 'Ad click aggregator', tier: 2, flagship: false, concepts: 'Event ingestion, stream aggregation, deduplication, reconciliation' },
  { id: 'distributed-kv-store', title: 'Distributed key-value store', tier: 3, flagship: false, concepts: 'Partitioning, replication, quorums, conflict resolution, gossip' },
  { id: 'distributed-message-queue', title: 'Distributed message queue', tier: 3, flagship: false, concepts: 'Partitions, offsets, replication, retention' },
  { id: 'payment-system', title: 'Payment system', tier: 3, flagship: false, concepts: 'Idempotency, double-entry ledger, reconciliation, external payment providers' },
  { id: 'collaborative-editor', title: 'Collaborative document editor', tier: 3, flagship: false, concepts: 'OT or CRDTs, presence, version history' },
  { id: 'metrics-platform', title: 'Metrics and alerting platform', tier: 3, flagship: false, concepts: 'Time-series storage, downsampling, alert evaluation' },
  { id: 'job-scheduler', title: 'Distributed job scheduler', tier: 3, flagship: false, concepts: 'Leader election, at-least-once execution, idempotent jobs' },
  { id: 'search-engine', title: 'Search engine', tier: 3, flagship: false, concepts: 'Sharded inverted index, ranking, index freshness' },
];
export const problemList: ProblemSummary[] = bank.map((p) => ({ ...p, minutes: p.tier === 3 ? 60 : 45 }));

export function getProblem(id: string): ProblemSummary | undefined {
  return problemList.find((p) => p.id === id);
}
