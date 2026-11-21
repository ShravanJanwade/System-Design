/**
 * The architecture builder's data: components placed on a fixed grid and the connections between them.
 * Plain, serializable data, so it can be persisted and exported. Every operation is pure and returns a new design.
 */
import type { DiagramSpec, NodeType } from '@/content/types';

export type ConnectionKind = 'sync' | 'async' | 'replication';

export type BuilderNode = { id: string; type: NodeType; label: string; x: number; y: number };
export type BuilderEdge = { id: string; from: string; to: string; kind: ConnectionKind };
export type BuilderDesign = { nodes: BuilderNode[]; edges: BuilderEdge[] };

export const GRID_COLS = 6;
export const GRID_ROWS = 5;
export const MAX_LABEL = 32;

export const EMPTY_DESIGN: BuilderDesign = { nodes: [], edges: [] };

/** Palette order: grouped by category, so the type colors sit together. */
export const PALETTE: readonly NodeType[] = [
  'client',
  'dns',
  'cdn',
  'loadBalancer',
  'gateway',
  'service',
  'worker',
  'cache',
  'sqlDb',
  'nosqlDb',
  'search',
  'objectStore',
  'blockStore',
  'fileStore',
  'queue',
  'stream',
  'external',
];

/** The name a component gets when it is placed. */
export const DEFAULT_LABEL: Record<NodeType, string> = {
  client: 'Client',
  dns: 'DNS',
  cdn: 'CDN',
  loadBalancer: 'Load balancer',
  gateway: 'API gateway',
  service: 'App server',
  worker: 'Worker',
  cache: 'Cache',
  sqlDb: 'SQL database',
  nosqlDb: 'NoSQL database',
  search: 'Search index',
  objectStore: 'Object storage',
  blockStore: 'Block storage',
  fileStore: 'File storage',
  queue: 'Queue',
  stream: 'Event stream',
  external: 'External service',
};

export const KIND_LABEL: Record<ConnectionKind, string> = { sync: 'Sync', async: 'Async', replication: 'Replication' };
export const KIND_HELP: Record<ConnectionKind, string> = {
  sync: 'waits for a reply',
  async: 'sends and moves on',
  replication: 'copies data',
};
export const CONNECTION_KINDS: readonly ConnectionKind[] = ['sync', 'async', 'replication'];

const NODE_TYPES = new Set<string>(PALETTE);

export function inBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS;
}

export function nodeAt(design: BuilderDesign, x: number, y: number): BuilderNode | undefined {
  return design.nodes.find((n) => n.x === x && n.y === y);
}

export function getNode(design: BuilderDesign, id: string | null | undefined): BuilderNode | undefined {
  return id ? design.nodes.find((n) => n.id === id) : undefined;
}

/** The label to show: the learner's name, or the type's default when it is blank. */
export function displayLabel(node: BuilderNode): string {
  return node.label.trim() || DEFAULT_LABEL[node.type];
}

export function edgesOf(design: BuilderDesign, id: string): BuilderEdge[] {
  return design.edges.filter((e) => e.from === id || e.to === id);
}

function nextId(items: readonly { id: string }[], prefix: string): string {
  let max = 0;
  for (const it of items) {
    if (!it.id.startsWith(prefix)) continue;
    const n = Number(it.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** "App server", then "App server 2", "App server 3" for the same type. */
export function defaultLabel(design: BuilderDesign, type: NodeType): string {
  const base = DEFAULT_LABEL[type];
  const used = new Set(design.nodes.map((n) => displayLabel(n).toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const label = `${base} ${i}`;
    if (!used.has(label.toLowerCase())) return label;
  }
}

/** Place a new component on an empty cell. Returns the unchanged design and a null id when the cell is taken. */
export function placeNode(design: BuilderDesign, type: NodeType, x: number, y: number): { design: BuilderDesign; id: string | null } {
  if (!inBounds(x, y) || nodeAt(design, x, y)) return { design, id: null };
  const id = nextId(design.nodes, 'n');
  const node: BuilderNode = { id, type, label: defaultLabel(design, type), x, y };
  return { design: { ...design, nodes: [...design.nodes, node] }, id };
}

export function moveNode(design: BuilderDesign, id: string, x: number, y: number): BuilderDesign {
  const node = getNode(design, id);
  if (!node || !inBounds(x, y)) return design;
  const there = nodeAt(design, x, y);
  if (there && there.id !== id) return design;
  return { ...design, nodes: design.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) };
}

export function renameNode(design: BuilderDesign, id: string, label: string): BuilderDesign {
  const clean = label.replace(/\s+/g, ' ').slice(0, MAX_LABEL);
  return { ...design, nodes: design.nodes.map((n) => (n.id === id ? { ...n, label: clean } : n)) };
}

export function removeNode(design: BuilderDesign, id: string): BuilderDesign {
  return {
    nodes: design.nodes.filter((n) => n.id !== id),
    edges: design.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

/** Connect two components. A second connection in the same direction replaces the first one's kind. */
export function connect(design: BuilderDesign, from: string, to: string, kind: ConnectionKind): BuilderDesign {
  if (from === to || !getNode(design, from) || !getNode(design, to)) return design;
  const existing = design.edges.find((e) => e.from === from && e.to === to);
  if (existing) return setConnectionKind(design, existing.id, kind);
  const id = nextId(design.edges, 'e');
  return { ...design, edges: [...design.edges, { id, from, to, kind }] };
}

export function disconnect(design: BuilderDesign, edgeId: string): BuilderDesign {
  return { ...design, edges: design.edges.filter((e) => e.id !== edgeId) };
}

export function setConnectionKind(design: BuilderDesign, edgeId: string, kind: ConnectionKind): BuilderDesign {
  return { ...design, edges: design.edges.map((e) => (e.id === edgeId ? { ...e, kind } : e)) };
}

/** Flip a connection's direction. If the opposite connection already exists, the two merge. */
export function reverseConnection(design: BuilderDesign, edgeId: string): BuilderDesign {
  const edge = design.edges.find((e) => e.id === edgeId);
  if (!edge) return design;
  if (design.edges.some((e) => e.from === edge.to && e.to === edge.from)) return disconnect(design, edgeId);
  return { ...design, edges: design.edges.map((e) => (e.id === edgeId ? { ...e, from: e.to, to: e.from } : e)) };
}

/**
 * The design as a diagram spec, trimmed to the cells in use, so the shared diagram engine can draw it
 * exactly like every other diagram in the app. Null when the canvas is empty.
 */
export function toDiagramSpec(design: BuilderDesign): DiagramSpec | null {
  if (!design.nodes.length) return null;
  const xs = design.nodes.map((n) => n.x);
  const ys = design.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = Math.max(...ys) - minY + 1;
  const ids = new Set(design.nodes.map((n) => n.id));
  return {
    grid: { cols, rows },
    nodes: design.nodes.map((n) => {
      const label = displayLabel(n);
      const base = DEFAULT_LABEL[n.type];
      const sublabel = label.toLowerCase().includes(base.toLowerCase()) ? undefined : base;
      return { id: n.id, type: n.type, label, sublabel, x: n.x - minX, y: n.y - minY };
    }),
    edges: design.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
  };
}

/** A design read from storage or an import file: keeps only well-formed components and connections. */
export function sanitizeDesign(raw: unknown): BuilderDesign {
  if (!raw || typeof raw !== 'object') return EMPTY_DESIGN;
  const r = raw as { nodes?: unknown; edges?: unknown };
  const nodes: BuilderNode[] = [];
  const taken = new Set<string>();
  for (const n of Array.isArray(r.nodes) ? r.nodes : []) {
    if (!n || typeof n !== 'object') continue;
    const { id, type, label, x, y } = n as Record<string, unknown>;
    if (typeof id !== 'string' || typeof type !== 'string' || !NODE_TYPES.has(type)) continue;
    if (typeof x !== 'number' || typeof y !== 'number' || !inBounds(x, y)) continue;
    if (taken.has(`${x},${y}`) || nodes.some((m) => m.id === id)) continue;
    taken.add(`${x},${y}`);
    nodes.push({ id, type: type as NodeType, label: typeof label === 'string' ? label.slice(0, MAX_LABEL) : '', x, y });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: BuilderEdge[] = [];
  for (const e of Array.isArray(r.edges) ? r.edges : []) {
    if (!e || typeof e !== 'object') continue;
    const { id, from, to, kind } = e as Record<string, unknown>;
    if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string') continue;
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    if (kind !== 'sync' && kind !== 'async' && kind !== 'replication') continue;
    if (edges.some((x) => x.id === id || (x.from === from && x.to === to))) continue;
    edges.push({ id, from, to, kind });
  }
  return { nodes, edges };
}

/** Plain-text summary for screen readers and the session review. */
export function describeDesign(design: BuilderDesign): string {
  if (!design.nodes.length) return 'An empty canvas.';
  const byId = new Map(design.nodes.map((n) => [n.id, displayLabel(n)]));
  const parts = design.edges.map((e) => {
    const verb = e.kind === 'async' ? 'sends asynchronously to' : e.kind === 'replication' ? 'replicates to' : 'calls';
    return `${byId.get(e.from)} ${verb} ${byId.get(e.to)}`;
  });
  const names = design.nodes.map((n) => displayLabel(n)).join(', ');
  return `${design.nodes.length} component${design.nodes.length === 1 ? '' : 's'}: ${names}.${parts.length ? ` ${parts.join('. ')}.` : ' No connections yet.'}`;
}
