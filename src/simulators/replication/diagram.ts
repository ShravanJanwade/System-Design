/**
 * The simulator's diagram: Maya, the other users, the leader and its two followers, built from a run.
 * The steps tell the run's story in time order: the caption save, the reload, the new comment and
 * Maya's refreshes, then the failover when the leader fails.
 */
import type { DiagramNode, DiagramSpec, DiagramStep, FlowHop } from '@/content/types';
import { formatInt, formatMs } from '@/lib/format';
import { COPY_NAME, firstSeen, firstVanish, photoReads, reloadRead, type Copy, type Follower, type Read, type ReplicationResult, type Write } from './logic';

/** 1305 -> "1.3 s". */
export function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** 200 -> "200 ms", 1000 -> "1 s", 1840 -> "1.8 s". */
export function formatLag(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 100) / 10;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

export const readEdge = (copy: Copy) => `maya-${copy}`;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function answer(copy: Copy, tag: string, alert = false): FlowHop {
  return alert ? { edge: readEdge(copy), reverse: true, tag, tone: 'alert' } : { edge: readEdge(copy), reverse: true, tag };
}

/** "about 1 s later", or that it had not arrived when the leader failed. */
function applyPhrase(w: Write, f: Follower): string {
  const a = w.applied[f];
  if (a === null || w.committed === null) return `${COPY_NAME[f]} has not applied it when the leader fails`;
  return `${COPY_NAME[f]} applies it about ${formatLag(a - w.committed)} later`;
}

export function replicationDiagram(r: ReplicationResult): DiagramSpec {
  const c = r.config;
  const sync = c.mode === 'sync';
  const nodes: DiagramNode[] = [
    { id: 'f1', type: 'sqlDb', label: 'Follower 1', sublabel: `${sync ? 'sync, ' : ''}≈ ${formatLag(c.lagMs)} behind`, x: 1, y: 0 },
    { id: 'maya', type: 'client', label: 'Maya’s phone', x: 0, y: 1 },
    { id: 'leader', type: 'sqlDb', label: 'Leader', sublabel: 'takes every write', x: 1, y: 1 },
    { id: 'others', type: 'client', label: 'Other users', sublabel: `${formatInt(c.writesPerSec)} likes/s`, x: 2, y: 1 },
    { id: 'f2', type: 'sqlDb', label: 'Follower 2', sublabel: `≈ ${formatLag(c.lagMs * c.slowFactor)} behind`, x: 1, y: 2 },
  ];
  const edges: DiagramSpec['edges'] = [
    { id: 'maya-leader', from: 'maya', to: 'leader', kind: 'sync' },
    { id: 'others-leader', from: 'others', to: 'leader', kind: 'sync' },
    { id: 'leader-f1', from: 'leader', to: 'f1', kind: 'replication', label: sync ? 'sync' : 'async' },
    { id: 'leader-f2', from: 'leader', to: 'f2', kind: 'replication', label: 'async' },
    { id: 'maya-f1', from: 'maya', to: 'f1', kind: 'sync' },
    { id: 'maya-f2', from: 'maya', to: 'f2', kind: 'sync' },
  ];
  if (r.failover) edges.push({ id: `others-${r.failover.promoted}`, from: 'others', to: r.failover.promoted, kind: 'sync' });

  const timed: { t: number; step: DiagramStep }[] = [{ t: r.caption.at, step: saveStep(r) }];
  const reload = reloadRead(r);
  if (reload) timed.push({ t: reload.at, step: reloadStep(r, reload) });
  timed.push({ t: r.comment.at, step: commentStep(r) });
  timed.push(...refreshSteps(r));
  timed.sort((a, b) => a.t - b.t);
  const steps = [...timed.map((s) => s.step), ...failoverSteps(r)];

  // Phones: writers on top, the leader under them, its followers out to the sides below it, and Maya, who reads
  // from all three, at the bottom; replication arrows run down so their labels sit between rows.
  const narrow = {
    grid: { cols: 3, rows: 4 },
    positions: { others: { x: 1, y: 0 }, leader: { x: 1, y: 1 }, f1: { x: 0, y: 2 }, f2: { x: 2, y: 2 }, maya: { x: 1, y: 3 } },
    sides: {
      'leader-f1': { fromSide: 'bottom' as const, toSide: 'top' as const },
      'leader-f2': { fromSide: 'bottom' as const, toSide: 'top' as const },
      // After a failover the other users write to the promoted follower, passing outside the leader's labels.
      'others-f1': { fromSide: 'left' as const, toSide: 'top' as const },
      'others-f2': { fromSide: 'right' as const, toSide: 'top' as const },
    },
  };
  return { grid: { cols: 3, rows: 3 }, nodes, edges, steps, narrow, description: describeRun(r) };
}

function saveStep(r: ReplicationResult): DiagramStep {
  const w = r.caption;
  const took = w.confirmed === null ? '' : formatMs(w.confirmed - w.at);
  if (r.config.mode === 'async') {
    return {
      caption: `At ${formatSec(w.at)}, Maya saves a new caption. The **leader** commits it and confirms in ${took}. Copying it to the followers happens afterwards, in the background.`,
      flow: ['maya-leader', answer('leader', 'saved'), ['leader-f1', 'leader-f2']],
    };
  }
  return {
    caption: `At ${formatSec(w.at)}, Maya saves a new caption. The **leader** commits it, but confirms only once Follower 1 has applied it too: after ${took}. Follower 2 gets its copy in the background.`,
    flow: ['maya-leader', 'leader-f1', '<leader-f1', answer('leader', 'saved'), 'leader-f2'],
  };
}

function reloadStep(r: ReplicationResult, x: Read): DiagramStep {
  const at = `At ${formatSec(x.at)}, her app reloads her profile.`;
  if (x.route === 'leader') {
    return {
      caption: `${at} She changed it less than a minute ago, so the read goes to the **leader**, which always has her latest write: she sees the new caption.`,
      flow: [readEdge(x.copy), answer(x.copy, 'new caption')],
    };
  }
  const where = x.route === 'pinned' ? `${COPY_NAME[x.copy]}, the follower her reads are pinned to` : COPY_NAME[x.copy];
  if (x.verdict === 'own-edit-missing') {
    const applied = x.copy === 'leader' ? null : r.caption.applied[x.copy];
    const when = applied === null ? 'has not applied the change yet' : `applies the change only at ${formatSec(applied)}`;
    return {
      caption: `${at} The read goes to ${where}, which ${when}, so she sees her old caption. To Maya, her edit looks lost.`,
      flow: [readEdge(x.copy), answer(x.copy, 'old caption', true)],
    };
  }
  const syncNote = r.config.mode === 'sync' && x.copy === 'f1' ? 'is the synchronous follower, so it ' : '';
  return {
    caption: `${at} The read goes to ${where}, which ${syncNote}already has the change: she sees the new caption.`,
    flow: [readEdge(x.copy), answer(x.copy, 'new caption')],
  };
}

function commentStep(r: ReplicationResult): DiagramStep {
  const w = r.comment;
  return {
    caption: `At ${formatSec(w.at)}, someone comments on Sam’s beach photo, which Maya is looking at. The **leader** takes the write; ${applyPhrase(w, 'f1')}, and ${applyPhrase(w, 'f2')}.`,
    flow: ['others-leader', ['leader-f1', 'leader-f2']],
  };
}

function refreshSteps(r: ReplicationResult): { t: number; step: DiagramStep }[] {
  const photos = photoReads(r);
  const seen = firstSeen(r);
  const gone = firstVanish(r);
  if (!seen) {
    const lastRead = photos[photos.length - 1]!;
    const where = r.config.sticky ? `${COPY_NAME[r.pinned]}, the follower her reads are pinned to, has not` : 'neither follower has';
    return [
      {
        t: lastRead.at,
        step: {
          caption: `Maya refreshes the photo ${photos.length} times between ${formatSec(photos[0]!.at)} and ${formatSec(lastRead.at)}, but ${where} applied the comment yet, so she never sees it. Her view is stale, but it never runs backwards.`,
          flow: [readEdge(lastRead.copy), answer(lastRead.copy, 'no comment yet')],
        },
      },
    ];
  }
  const steps: { t: number; step: DiagramStep }[] = [];
  if (r.config.sticky) {
    steps.push({
      t: seen.at,
      step: {
        caption: `At ${formatSec(seen.at)}, Maya refreshes the photo and ${COPY_NAME[seen.copy]}, the follower her reads are pinned to, has the new comment. Every later refresh reads the same copy, which only moves forward, so the comment stays.`,
        flow: [readEdge(seen.copy), answer(seen.copy, 'comment')],
      },
    });
    return steps;
  }
  steps.push({
    t: seen.at,
    step: {
      caption: gone
        ? `At ${formatSec(seen.at)}, Maya refreshes the photo. ${COPY_NAME[seen.copy]} answers, and the new comment is there.`
        : `At ${formatSec(seen.at)}, Maya refreshes the photo. ${COPY_NAME[seen.copy]} answers, and the new comment is there. Both followers have it by her next refresh, so it stays.`,
      flow: [readEdge(seen.copy), answer(seen.copy, 'comment')],
    },
  });
  if (gone) {
    steps.push({
      t: gone.at,
      step: {
        caption: `At ${formatSec(gone.at)}, she refreshes again, and this time ${COPY_NAME[gone.copy]} answers. It is further behind and has not applied the comment, so the comment vanishes, as if time ran backwards.`,
        flow: [readEdge(gone.copy), answer(gone.copy, 'comment gone', true)],
      },
    });
  }
  return steps;
}

function failoverSteps(r: ReplicationResult): DiagramStep[] {
  const fo = r.failover;
  if (!fo) return [];
  const c = r.config;
  const name = COPY_NAME[fo.promoted];
  const promotedCaption =
    c.mode === 'async'
      ? `At ${formatSec(fo.promotedAt)}, ${name}, the most up-to-date copy, is promoted to leader and takes writes again. It was about ${formatLag(fo.behindMs)} behind when the leader died, so ${formatInt(fo.lost)} writes that users had been told were saved never reached it. They are lost.`
      : `At ${formatSec(fo.promotedAt)}, ${name} is promoted to leader and takes writes again. The leader confirmed a write only once ${name} had it, so no confirmed write is lost. The ${formatInt(fo.unconfirmed)} writes still waiting got an error instead of a confirmation, so their apps know to retry.`;
  return [
    {
      caption: `At ${formatSec(fo.at)}, the leader’s disk dies. Until a follower takes over, every write gets an error: ${formatInt(fo.failed)} of them in ${formatLag(c.failoverMs)}.`,
      fail: ['leader'],
      flow: [{ edge: 'others-leader', tag: 'error', tone: 'alert' }],
    },
    {
      caption: promotedCaption,
      fail: ['leader'],
      add: [`others-${fo.promoted}`],
      flow: [`others-${fo.promoted}`],
      notes: [{ target: fo.promoted, text: 'new leader', tone: 'signal' }],
    },
  ];
}

/** One or two sentences on what Maya saw. */
export function summarizeReads(r: ReplicationResult): string {
  const own = r.counts['own-edit-missing'];
  const back = r.counts['went-back'];
  if (own === 0 && back === 0) return 'Maya never saw her own edit missing, and nothing she had seen disappeared.';
  const parts: string[] = [];
  if (own) parts.push('her reload showed her old caption');
  if (back) parts.push(`the new comment vanished on ${back === 1 ? 'one refresh' : `${back} refreshes`}`);
  return `${capitalize(parts.join(', and '))}.`;
}

/** Plain-text description of the diagram for screen readers. */
function describeRun(r: ReplicationResult): string {
  const c = r.config;
  const routing = c.sticky
    ? `to ${COPY_NAME[r.pinned]}, the follower she is pinned to`
    : 'to the two followers in turn';
  const leaderRule = c.readFromLeader ? ', except reads of her own profile right after a change, which go to the leader' : '';
  const fo = r.failover;
  const failure = fo
    ? ` At ${formatSec(fo.at)} the leader fails, and ${COPY_NAME[fo.promoted]} is promoted at ${formatSec(fo.promotedAt)}; ${formatInt(fo.lost)} confirmed writes are lost.`
    : '';
  return `Maya’s phone and other users send writes to the leader, which copies each one to Follower 1 (about ${formatLag(c.lagMs)} behind${
    c.mode === 'sync' ? ', synchronous' : ''
  }) and Follower 2 (about ${formatLag(c.lagMs * c.slowFactor)} behind, asynchronous). Maya’s reads go ${routing}${leaderRule}. ${summarizeReads(r)}${failure}`;
}
