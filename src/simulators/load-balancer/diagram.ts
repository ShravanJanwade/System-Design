/**
 * The simulator's diagram: users, the load balancer and the app servers, built from a run.
 * Without a failure it is a single view of where requests went. With a failure it becomes a
 * step-through of what happened: the failure, the health checks, the removal and the return.
 */
import type { DiagramNode, DiagramSpec, DiagramStep, FlowHop, FlowItem, StepNote } from '@/content/types';
import { formatInt, formatPercent } from '@/lib/format';
import { ALGORITHM_LABEL, serverName, type LbResult } from './logic';

export const appId = (i: number) => `app${i + 1}`;
export const appEdge = (i: number) => `lb-app${i + 1}`;

/** "27.5 s" or "20 s". */
export function formatSec(t: number): string {
  return `${Number.isInteger(t) ? t : t.toFixed(1)} s`;
}

function numberWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);
}

/** Requests per second each remaining server took on after the removal (measured, not assumed). */
function rateAfterRemoval(r: LbResult): number {
  const { removed, up } = r.timeline;
  if (removed === null) return 0;
  const end = up ?? r.config.durationSec;
  const live = r.servers.filter((s) => s.index !== r.killed);
  const inWindow = r.buckets.filter((b) => b.t >= removed && b.t < end);
  if (!inWindow.length || !live.length) return 0;
  const routed = inWindow.reduce((sum, b) => sum + live.reduce((s2, s) => s2 + b.routed[s.index]!, 0), 0);
  const seconds = (inWindow.length * r.config.bucketMs) / 1000;
  return routed / seconds / live.length;
}

function algorithmPhrase(r: LbResult): string {
  switch (r.config.algorithm) {
    case 'round-robin':
      return 'round robin hands requests to each server in turn';
    case 'weighted':
      return r.config.olderServer
        ? 'weighted round robin gives each full-size server two turns for every one the older server gets'
        : 'weighted round robin hands out turns by size; with equal servers that is plain round robin';
    case 'least-connections':
      return 'least connections sends each request to the server with the fewest open requests';
    case 'ip-hash':
      return 'IP hash sends each client to the server its IP address hashes to';
  }
}

export function lbDiagram(r: LbResult): DiagramSpec {
  const c = r.config;
  const n = r.servers.length;
  const mid = (n - 1) / 2;
  const busy = c.busyClient;

  const nodes: DiagramNode[] = [
    { id: 'users', type: 'client', label: 'Users', sublabel: `${formatInt(c.traffic)} requests/s`, x: busy ? mid - 0.5 : mid, y: 0 },
  ];
  if (busy) nodes.push({ id: 'busy', type: 'client', label: 'Busy client', sublabel: `one IP, ${formatPercent(c.busyShare)}`, x: mid + 0.5, y: 0 });
  nodes.push({ id: 'lb', type: 'loadBalancer', label: 'Load balancer', sublabel: ALGORITHM_LABEL[c.algorithm], x: mid, y: 1 });
  r.servers.forEach((s, i) => {
    nodes.push({
      id: appId(i),
      type: 'service',
      label: s.name,
      sublabel: `${s.older ? 'older, ' : ''}${formatPercent(s.share)} of requests`,
      x: i,
      y: 2,
    });
  });

  const edges: DiagramSpec['edges'] = [{ id: 'users-lb', from: 'users', to: 'lb', kind: 'sync' }];
  if (busy) edges.push({ id: 'busy-lb', from: 'busy', to: 'lb', kind: 'sync' });
  r.servers.forEach((_, i) => edges.push({ id: appEdge(i), from: 'lb', to: appId(i), kind: 'sync' }));

  const inbound: FlowItem = busy ? ['users-lb', 'busy-lb'] : 'users-lb';
  const fanOut = (skip = -1, failing = -1): FlowItem =>
    r.servers.flatMap((_, i): FlowHop[] => {
      if (i === skip) return [];
      if (i === failing) return [{ edge: appEdge(i), tag: 'no answer', tone: 'alert' }];
      return [appEdge(i)];
    });

  const steps: DiagramStep[] = r.killed >= 0 && r.timeline.down !== null ? failureSteps(r, inbound, fanOut) : [overviewStep(r, inbound, fanOut)];

  return { grid: { cols: n, rows: 3 }, nodes, edges, steps, description: describeRun(r) };
}

function overviewStep(r: LbResult, inbound: FlowItem, fanOut: () => FlowItem): DiagramStep {
  const notes: StepNote[] = [];
  r.servers.forEach((s, i) => {
    if (s.turnedAway > 0) notes.push({ target: appId(i), text: 'overloaded', tone: 'alert' });
    else if (i === r.busyServer) notes.push({ target: appId(i), text: 'busy client', tone: 'signal' });
  });
  return { caption: summarizeRun(r), flow: [inbound, fanOut()], notes };
}

function failureSteps(r: LbResult, inbound: FlowItem, fanOut: (skip?: number, failing?: number) => FlowItem): DiagramStep[] {
  const c = r.config;
  const k = r.killed;
  const dead = serverName(k);
  const n = r.servers.length;
  const { down, removed, up, readded } = r.timeline;
  const failed = r.servers[k]!.failed;
  const all = [...r.servers.map((_, i) => appId(i)), 'users', 'lb', ...(c.busyClient ? ['busy'] : [])];
  const steps: DiagramStep[] = [
    {
      caption: `Until ${formatSec(down!)}, ${algorithmPhrase(r)}. About ${formatInt(c.traffic)} requests per second reach ${numberWord(n)} servers.`,
      flow: [inbound, fanOut()],
    },
    {
      caption: `At ${formatSec(down!)}, ${dead} stops answering. The balancer does not know yet, so it keeps sending ${dead} about ${formatPercent(r.deadShare)} of requests. Each one hangs for ${formatInt(c.timeoutMs / 1000)} second and fails: ${formatInt(failed)} in all.`,
      flow: [inbound, fanOut(-1, k)],
      fail: [appId(k)],
    },
  ];
  if (removed !== null) {
    const rate = rateAfterRemoval(r);
    const moved =
      r.clientsMoved !== null && r.clientsOnRemoved !== null
        ? ` Because IP hash divides by the number of servers, ${formatPercent(r.clientsMoved)} of clients moved to a different server, though only ${formatPercent(r.clientsOnRemoved)} were on ${dead}.`
        : '';
    steps.push({
      caption: `At ${formatSec(removed)}, ${dead} fails its ${ordinal(c.unhealthyThreshold)} health check in a row (checks run every ${formatSec(c.checkIntervalSec)}), so the balancer takes it out of rotation. The other ${numberWord(n - 1)} servers now take about ${formatInt(rate)} requests per second each.${moved}`,
      flow: [inbound, fanOut(k)],
      fail: [appId(k)],
      notes: [{ target: appId(k), text: 'removed', tone: 'plain' }],
    });
  }
  if (up !== null) {
    steps.push({
      caption: `At ${formatSec(up)}, ${dead} is running again. The balancer still sends it nothing until it passes ${numberWord(c.healthyThreshold)} health checks in a row.`,
      flow: [inbound, fanOut(k)],
      focus: all.filter((id) => id !== appId(k)),
      notes: [{ target: appId(k), text: 'checking', tone: 'plain' }],
    });
  }
  if (readded !== null) {
    steps.push({
      caption: `At ${formatSec(readded)}, ${dead} passes its ${ordinal(c.healthyThreshold)} check in a row and rejoins the rotation. Requests spread across all ${numberWord(n)} servers again.`,
      flow: [inbound, fanOut()],
      notes: [{ target: appId(k), text: 'back', tone: 'signal' }],
    });
  }
  return steps;
}

function ordinal(n: number): string {
  return ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`;
}

/** One or two sentences on where the requests went and what hurt. */
export function summarizeRun(r: LbResult): string {
  const c = r.config;
  const overloaded = r.servers.filter((s) => s.turnedAway > 0);
  const lead = `${capitalize(algorithmPhrase(r))}.`;
  if (c.algorithm === 'ip-hash' && r.busyServer >= 0) {
    const s = r.servers[r.busyServer]!;
    return `${lead} Every request from the busy client lands on ${s.name}, which gets ${formatPercent(s.share)} of all requests${s.turnedAway > 0 ? ` and turns away ${formatInt(s.turnedAway)}` : ''}.`;
  }
  if (overloaded.length === 0) {
    return `${lead} No server ran out of room: every request found a free worker or a short queue.`;
  }
  if (overloaded.length === 1) {
    const s = overloaded[0]!;
    const why = s.older ? `${s.name} is the older server, so its share is more than it can finish` : `${s.name} fell behind`;
    return `${lead} ${why}: its queue filled up and it turned away ${formatInt(s.turnedAway)} requests.`;
  }
  const away = overloaded.reduce((sum, s) => sum + s.turnedAway, 0);
  return `${lead} ${overloaded.length} servers filled their queues and turned away ${formatInt(away)} requests in all.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plain-text description of the diagram for screen readers. */
function describeRun(r: LbResult): string {
  const c = r.config;
  const parts = r.servers.map(
    (s) =>
      `${s.name}${s.older ? ' (older)' : ''} received ${formatPercent(s.share)}${s.turnedAway ? ` and turned away ${formatInt(s.turnedAway)}` : ''}${s.failed ? `; ${formatInt(s.failed)} failed` : ''}`,
  );
  return `Users${c.busyClient ? ' and one busy client' : ''} send about ${formatInt(c.traffic)} requests per second to a load balancer using ${ALGORITHM_LABEL[c.algorithm].toLowerCase()}, which spreads them across ${r.servers.length} app servers. ${parts.join('. ')}.`;
}
