/**
 * The simulator's diagram: one post and one feed load under the selected strategy, with the
 * run's numbers in the captions and notes. Push and hybrid have fan-out workers and a feed
 * cache; pull has neither.
 */
import type { DiagramEdge, DiagramNode, DiagramSpec, DiagramStep } from '@/content/types';
import { formatCompact, formatInt, formatMs, formatPercent } from '@/lib/format';
import { MODEL, STRATEGY_LABEL, formatSeconds, type FanOutResult, type Strategy } from './logic';

const NODES: Record<string, DiagramNode> = {
  author: { id: 'author', type: 'client', label: 'Author', x: 0, y: 0 },
  post: { id: 'post', type: 'service', label: 'Post service', x: 1, y: 0 },
  fanout: { id: 'fanout', type: 'worker', label: 'Fan-out workers', x: 2, y: 0 },
  store: { id: 'store', type: 'nosqlDb', label: 'Posts', sublabel: 'a list per author', x: 1, y: 1 },
  cache: { id: 'cache', type: 'cache', label: 'Feed cache', sublabel: 'a list per reader', x: 2, y: 1 },
  reader: { id: 'reader', type: 'client', label: 'Reader', x: 0, y: 2 },
  feed: { id: 'feed', type: 'service', label: 'Feed service', x: 1, y: 2 },
};

const EDGES: Record<string, DiagramEdge> = {
  'author-post': { id: 'author-post', from: 'author', to: 'post', kind: 'sync' },
  'post-store': { id: 'post-store', from: 'post', to: 'store', kind: 'sync' },
  'post-fanout': { id: 'post-fanout', from: 'post', to: 'fanout', kind: 'async' },
  'fanout-cache': { id: 'fanout-cache', from: 'fanout', to: 'cache', kind: 'sync' },
  'reader-feed': { id: 'reader-feed', from: 'reader', to: 'feed', kind: 'sync' },
  'feed-cache': { id: 'feed-cache', from: 'feed', to: 'cache', kind: 'sync' },
  'feed-store': { id: 'feed-store', from: 'feed', to: 'store', kind: 'sync' },
};

const followersNote = (n: number) => `${formatCompact(n)} followers`;

function pushSteps(r: FanOutResult): DiagramStep[] {
  const s = r.byStrategy.push;
  const celeb = r.config.celebrity;
  return [
    {
      caption: celeb
        ? 'The celebrity posts. The **post service** saves the post once and hands it to the **fan-out workers** through a queue.'
        : `An account with ${formatInt(r.typicalFollowers)} followers, a typical number in this sample, posts. The **post service** saves the post once and hands it to the **fan-out workers**.`,
      flow: ['author-post', 'post-store', 'post-fanout'],
      notes: [{ target: 'author', text: followersNote(celeb ? MODEL.celebrityFollowers : r.typicalFollowers) }],
    },
    {
      caption: celeb
        ? `The workers append the post’s ID to the feed of every follower: ${formatInt(MODEL.celebrityFollowers)} writes. At about ${formatInt(
            MODEL.fanoutPerSecond,
          )} writes per second, the last follower sees it after about ${formatSeconds(MODEL.celebrityFollowers / MODEL.fanoutPerSecond)}.`
        : `The workers append the post’s ID to each follower’s feed: ${formatInt(s.writes.typical)} writes, done in moments. The biggest post in this sample, from an account with ${formatInt(
            s.writes.mostFollowers,
          )} followers, takes about ${formatSeconds(s.writes.mostSeconds)}.`,
      flow: ['fanout-cache'],
      notes: [{ target: 'cache', text: `${formatCompact(celeb ? MODEL.celebrityFollowers : s.writes.typical)} writes`, tone: celeb ? 'alert' : 'plain' }],
    },
    {
      caption: `Reading is cheap. The **feed service** reads one ready-made list from the **feed cache**, then fetches those posts: ${formatMs(
        s.reads.medianMs,
      )} at the median and ${formatMs(s.reads.p99Ms)} at the 99th percentile.`,
      flow: ['reader-feed', 'feed-cache', '<feed-cache', 'feed-store', '<feed-store', '<reader-feed'],
      notes: [{ target: 'feed', text: `1 list, ${formatMs(s.reads.medianMs)}` }],
    },
  ];
}

function pullSteps(r: FanOutResult): DiagramStep[] {
  const s = r.byStrategy.pull;
  return [
    {
      caption: `The author posts. The **post service** saves the post to the author’s own list, and that is all: no feed writes, whether the author has ${formatInt(
        r.typicalFollowers,
      )} followers or ${r.config.celebrity ? '30 million' : formatInt(r.biggestFollowers)}.`,
      flow: ['author-post', 'post-store'],
      notes: [{ target: 'store', text: '1 write' }],
    },
    {
      caption: `A reader opens the app. The **feed service** reads the recent posts of every account the reader follows: ${formatInt(
        r.typicalFollowing,
      )} lists for a typical reader and ${formatInt(r.heavyFollowing)} for the heaviest 1%.`,
      flow: ['reader-feed', 'feed-store'],
      notes: [{ target: 'store', text: `${formatInt(s.reads.medianLists)} lists` }],
    },
    {
      caption: `It merges the lists by time and returns the newest posts. Lookups go out in rounds of ${MODEL.parallelLookups}, each as slow as its slowest lookup: ${formatMs(
        s.reads.medianMs,
      )} at the median and ${formatMs(s.reads.p99Ms)} at the 99th percentile.`,
      flow: ['<feed-store', '<reader-feed'],
      notes: [{ target: 'feed', text: `p99 ${formatMs(s.reads.p99Ms)}`, tone: 'alert' }],
    },
  ];
}

function hybridSteps(r: FanOutResult): DiagramStep[] {
  const s = r.byStrategy.hybrid;
  const t = formatCompact(r.config.threshold);
  const celeb = r.config.celebrity;
  const pulled = Math.max(0, s.reads.medianLists - 1);
  const readStep: DiagramStep =
    pulled > 0 || celeb
      ? {
          caption: `A reader opens the app. The **feed service** reads the ready-made list from the **feed cache** and, at the same time, the recent posts of the big accounts the reader follows (${formatInt(
            pulled,
          )} for a typical reader), then merges them: ${formatMs(s.reads.medianMs)} at the median and ${formatMs(s.reads.p99Ms)} at the 99th percentile.`,
          flow: ['reader-feed', ['feed-cache', 'feed-store'], ['<feed-cache', '<feed-store'], '<reader-feed'],
          notes: [{ target: 'feed', text: `${formatInt(s.reads.medianLists)} lists` }],
        }
      : {
          caption: `A reader opens the app. A typical reader follows no account above the threshold, so the **feed service** reads one ready-made list, exactly as with push: ${formatMs(
            s.reads.medianMs,
          )} at the median.`,
          flow: ['reader-feed', 'feed-cache', '<feed-cache', '<reader-feed'],
          notes: [{ target: 'feed', text: '1 list' }],
        };
  return [
    {
      caption: `An ordinary account posts. It is below the ${t}-follower threshold, so its post is saved and pushed into each follower’s feed, as with push.`,
      flow: ['author-post', 'post-store', 'post-fanout', 'fanout-cache'],
      notes: [{ target: 'author', text: followersNote(r.typicalFollowers) }],
    },
    {
      caption: celeb
        ? 'The celebrity posts. With 30 million followers, far above the threshold, the post is saved once and never fanned out: no feed writes at all.'
        : `Accounts with ${t} followers or more are saved but never fanned out. In this distribution they receive ${formatPercent(r.pulledShare)} of all follows.`,
      flow: ['author-post', 'post-store'],
      notes: [
        { target: 'author', text: celeb ? followersNote(MODEL.celebrityFollowers) : `${t}+ followers` },
        { target: 'store', text: 'no fan-out', tone: 'signal' },
      ],
    },
    readStep,
  ];
}

function describe(r: FanOutResult, strategy: Strategy): string {
  const s = r.byStrategy[strategy];
  const parts: Record<Strategy, string> = {
    push: `With push, a post is saved, then fan-out workers append its ID to every follower's feed in a feed cache: ${formatInt(s.writes.typical)} writes for a typical post and ${formatInt(
      s.writes.most,
    )} for the biggest. A feed load reads one list.`,
    pull: `With pull, a post is saved once with no feed writes. A feed load reads the recent posts of every followed account, ${formatInt(s.reads.medianLists)} lists for a typical reader, and merges them.`,
    hybrid: `With hybrid, posts from accounts below ${formatInt(r.config.threshold)} followers are pushed into feeds and bigger accounts are only saved. A feed load reads the pushed list plus the big accounts' lists, ${formatInt(
      s.reads.medianLists,
    )} lists for a typical reader.`,
  };
  return `${parts[strategy]} Feed loads take ${formatMs(s.reads.medianMs)} at the median and ${formatMs(s.reads.p99Ms)} at the 99th percentile.`;
}

export function fanOutDiagram(r: FanOutResult, strategy: Strategy): DiagramSpec {
  const pull = strategy === 'pull';
  const nodeIds = pull ? ['author', 'post', 'store', 'reader', 'feed'] : Object.keys(NODES);
  const edgeIds = pull ? ['author-post', 'post-store', 'reader-feed', 'feed-store'] : Object.keys(EDGES);
  const steps = strategy === 'push' ? pushSteps(r) : pull ? pullSteps(r) : hybridSteps(r);
  return {
    grid: { cols: pull ? 2 : 3, rows: 3 },
    nodes: nodeIds.map((id) => NODES[id]!),
    edges: edgeIds.map((id) => EDGES[id]!),
    steps,
    description: `${STRATEGY_LABEL[strategy]} fan-out. ${describe(r, strategy)}`,
  };
}
