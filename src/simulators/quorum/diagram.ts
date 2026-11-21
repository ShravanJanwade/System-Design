/**
 * The explorer's diagram: the app, the coordinator and the replicas, built from one round.
 * Four steps: the versions before the write, the write reaching W replicas, the read asking R,
 * and the result, with the replicas in both groups (the overlap) highlighted.
 */
import type { DiagramEdge, DiagramNode, DiagramSpec, DiagramStep, FlowItem, StepNote } from '@/content/types';
import { listReplicas, replicaName, type QuorumResult } from './logic';

export const replicaId = (i: number) => `r${i + 1}`;
export const replicaEdge = (i: number) => `coord-r${i + 1}`;

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** "1 replica is up", "no replica is up", "2 replicas are up". */
function upText(live: number): string {
  if (live === 0) return 'no replica is up';
  return live === 1 ? 'only 1 replica is up' : `only ${live} replicas are up`;
}

const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** Edges from the coordinator to these replicas (or back from them), all moving at once. */
function fan(indexes: number[], back = false): FlowItem[] {
  if (indexes.length === 0) return [];
  return [indexes.map((i) => (back ? `<${replicaEdge(i)}` : replicaEdge(i)))];
}

export function quorumDiagram(res: QuorumResult): DiagramSpec {
  const { config: c, round: rd, math } = res;
  const n = c.n;
  const mid = (n - 1) / 2;
  const oldV = c.startVersion;
  const newV = rd.newVersion;
  const fail = c.failed.map(replicaId);
  const indexes = Array.from({ length: n }, (_, i) => i);

  const nodes: DiagramNode[] = [
    { id: 'app', type: 'client', label: 'Snapgram app', x: mid, y: 0 },
    { id: 'coord', type: 'service', label: 'Coordinator', sublabel: `N = ${n}, W = ${c.w}, R = ${c.r}`, x: mid, y: 1 },
    ...indexes.map((i): DiagramNode => ({ id: replicaId(i), type: 'nosqlDb', label: replicaName(i), x: i, y: 2 })),
  ];
  const edges: DiagramEdge[] = [
    { id: 'app-coord', from: 'app', to: 'coord', kind: 'sync' },
    ...indexes.map((i): DiagramEdge => ({ id: replicaEdge(i), from: 'coord', to: replicaId(i), kind: 'sync' })),
  ];

  const sumText = `R + W = ${c.r + c.w}`;
  const steps: DiagramStep[] = [];

  // 1. Before the write.
  const downText = c.failed.length
    ? ` ${listReplicas(c.failed)} ${plural(c.failed.length, 'is', 'are')} down, so ${plural(c.failed.length, 'it', 'they')} will miss the write and cannot answer reads.`
    : '';
  steps.push({
    caption: `Snapgram’s activity store keeps ${numberWord(n)} ${plural(n, 'copy', 'copies')} of this key, one on each replica, and every replica holds version ${oldV}.${downText}`,
    fail,
    notes: indexes.filter((i) => !rd.replicas[i]!.down).map((i): StepNote => ({ target: replicaId(i), text: `v${oldV}`, tone: 'plain' })),
  });

  // 2. The write.
  const behind = rd.replicas.filter((x) => x.behind).map((x) => x.index);
  if (rd.writeOk) {
    steps.push({
      caption: `The app writes version ${newV}. The coordinator sends it to every replica that is up and confirms the write as soon as W = ${c.w} ${plural(c.w, 'has', 'have')} stored it: ${listReplicas(rd.writeSet)}.${
        behind.length ? ` ${listReplicas(behind)} ${plural(behind.length, 'has', 'have')} not stored it yet.` : ''
      }`,
      fail,
      flow: ['app-coord', ...fan(rd.live), ...fan(rd.writeSet, true), '<app-coord'],
      notes: [
        ...rd.writeSet.map((i): StepNote => ({ target: replicaId(i), text: `v${newV}`, tone: 'signal' })),
        ...behind.map((i): StepNote => ({ target: replicaId(i), text: `v${oldV}, behind`, tone: 'plain' })),
      ],
    });
  } else {
    steps.push({
      caption: `The app writes version ${newV}, but ${upText(rd.live.length)} and W = ${c.w}. The coordinator cannot collect ${c.w} confirmations, so it refuses the write, and version ${oldV} stays the latest.`,
      fail,
      flow: [{ edge: 'app-coord', tag: 'refused', tone: 'alert' }],
    });
  }

  // 3. The read.
  const answers = (ids: number[], tone: (i: number) => StepNote['tone']): StepNote[] =>
    ids.map((i) => ({ target: replicaId(i), text: `answers v${rd.replicas[i]!.version}`, tone: tone(i) }));
  if (rd.readOk) {
    const who =
      c.readMode === 'worst' && rd.writeOk
        ? `In the worst case, the read reaches the replicas the write reached last: ${listReplicas(rd.readSet)}.`
        : `The coordinator takes the first R = ${c.r} ${plural(c.r, 'replica', 'replicas')} to answer: ${listReplicas(rd.readSet)}.`;
    steps.push({
      caption: `A moment later, Maya’s app reads the key. ${who}`,
      fail,
      flow: ['app-coord', ...fan(rd.readSet), ...fan(rd.readSet, true)],
      notes: answers(rd.readSet, (i) => (rd.replicas[i]!.version === rd.latest ? 'signal' : 'alert')),
    });
  } else {
    steps.push({
      caption: `A moment later, Maya’s app reads the key, but ${upText(rd.live.length)} and R = ${c.r}. The coordinator cannot collect ${c.r} answers, so the read fails.`,
      fail,
      flow: [{ edge: 'app-coord', tag: 'refused', tone: 'alert' }],
    });
  }

  // 4. The result.
  if (!rd.readOk) {
    steps.push({
      caption: `Reads need ${c.r} answers, but ${upText(rd.live.length)}. Reads survive at most N − R = ${math.readTolerates} failed ${plural(math.readTolerates, 'replica', 'replicas')}, and writes survive N − W = ${math.writeTolerates}.`,
      fail,
    });
  } else if (!rd.writeOk) {
    steps.push({
      caption: `The write was refused, so version ${oldV} is still the latest, and the read returns it. Writes need ${c.w} replicas up, while reads need only ${c.r}.`,
      fail,
      flow: ['<app-coord'],
    });
  } else if (rd.fresh) {
    const why = math.guaranteed
      ? `With ${sumText}, more than N = ${n}, every read overlaps every write like this.`
      : `This time the two groups overlapped by luck: with ${sumText}, not more than N = ${n}, they do not have to.`;
    const repair = rd.repaired.length
      ? ` The coordinator also sends version ${newV} to ${listReplicas(rd.repaired)}, which answered with the old one: read repair.`
      : '';
    steps.push({
      caption: `${listReplicas(rd.overlap)} ${plural(rd.overlap.length, 'is', 'are')} in both groups, so the read hears version ${newV}, and the coordinator returns the highest version it hears. ${why}${repair}`,
      fail,
      focus: ['app', 'coord', ...rd.overlap.map(replicaId)],
      flow: ['<app-coord', ...fan(rd.repaired)],
      notes: [
        ...rd.overlap.map((i): StepNote => ({ target: replicaId(i), text: 'in both', tone: 'signal' })),
        ...rd.repaired.map((i): StepNote => ({ target: replicaId(i), text: `repaired to v${newV}`, tone: 'plain' })),
      ],
    });
  } else {
    steps.push({
      caption: `No replica is in both groups. Every replica the read asked still holds version ${oldV}, so Maya gets a stale value. With ${sumText}, not more than N = ${n}, nothing forces the groups to overlap.`,
      fail,
      focus: ['app', 'coord', ...rd.readSet.map(replicaId)],
      flow: [{ edge: 'app-coord', reverse: true, tag: 'stale', tone: 'alert' }],
      notes: rd.readSet.map((i): StepNote => ({ target: replicaId(i), text: `v${oldV}`, tone: 'alert' })),
    });
  }

  return { grid: { cols: n, rows: 3 }, nodes, edges, steps, description: describeRound(res) };
}

/** Plain-text description of the round for screen readers. */
export function describeRound(res: QuorumResult): string {
  const { config: c, round: rd } = res;
  const parts = [`The Snapgram app writes and then reads one key through a coordinator. There are ${c.n} replicas, W = ${c.w} and R = ${c.r}.`];
  if (c.failed.length) parts.push(`${listReplicas(c.failed)} ${plural(c.failed.length, 'is', 'are')} down.`);
  parts.push(
    rd.writeOk
      ? `The write of version ${rd.newVersion} is confirmed by ${listReplicas(rd.writeSet)}.`
      : `The write is refused because fewer than ${c.w} replicas are up.`,
  );
  if (!rd.readOk) parts.push(`The read is refused because fewer than ${c.r} replicas are up.`);
  else {
    parts.push(`The read asks ${listReplicas(rd.readSet)} and returns version ${rd.returned}, ${rd.fresh ? 'the latest' : 'a stale value'}.`);
    if (rd.writeOk) parts.push(rd.overlap.length ? `${listReplicas(rd.overlap)} ${plural(rd.overlap.length, 'is', 'are')} in both groups.` : 'No replica is in both groups.');
  }
  return parts.join(' ');
}
