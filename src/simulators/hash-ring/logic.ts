/**
 * Consistent hashing ring: cache nodes and keys share one ring of 2^32 positions, compared with
 * plain `hash % N`.
 *
 * Each server takes `vnodes` positions on the ring, at hash("cache-<id>#<n>"). A key hashes to a
 * position of its own and belongs to the first server position at or after it, walking clockwise
 * and wrapping past the top. `hash % N` instead picks servers[hash % N] from the sorted list.
 *
 * A change is one server joining or leaving. For both schemes it reports the share of 10,000 keys
 * whose owner changed, next to the share that had to move.
 */
import { hashString } from '@/lib/random';

export const RING_SIZE = 2 ** 32;
export const MIN_SERVERS = 2;
export const MAX_SERVERS = 8;
/** Choices for virtual nodes per server. */
export const VNODE_STEPS = [1, 2, 3, 5, 10, 20, 50, 100, 200];
export const DEFAULT_VNODES = 200;
export const KEY_COUNT = 10_000;

/** Keys the simulator follows by name. */
export const SAMPLE_KEYS = ['user:maya', 'photo:1045212', 'feed:maya', 'profile:celebrity', 'photo:7', 'likes:1045212'];

/** Final mixing step from MurmurHash3, so similar names still spread evenly. */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A key's or a server position's place on the ring, 0 to 2^32 - 1. */
export function keyHash(key: string): number {
  return mix32(hashString(key));
}

export function serverName(id: number): string {
  return `Cache ${id}`;
}

export type VNode = { pos: number; server: number; replica: number };

/** Every server's positions, sorted around the ring. */
export function buildRing(servers: readonly number[], vnodes: number): VNode[] {
  const ring: VNode[] = [];
  for (const server of servers) {
    for (let replica = 0; replica < vnodes; replica++) ring.push({ pos: keyHash(`cache-${server}#${replica}`), server, replica });
  }
  ring.sort((a, b) => a.pos - b.pos || a.server - b.server || a.replica - b.replica);
  return ring;
}

/** Index of the first position at or after `pos`, wrapping to the start of the ring. */
export function successorIndex(ring: readonly VNode[], pos: number): number {
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ring[mid]!.pos < pos) lo = mid + 1;
    else hi = mid;
  }
  return lo === ring.length ? 0 : lo;
}

/** The server that owns a ring position: the first one clockwise. */
export function ringOwner(ring: readonly VNode[], pos: number): number {
  return ring[successorIndex(ring, pos)]!.server;
}

/** `hash % N` over the servers in ascending order. */
export function moduloOwner(sortedServers: readonly number[], hash: number): number {
  return sortedServers[hash % sortedServers.length]!;
}

export type RingKey = { key: string; pos: number };

let keyCache: RingKey[] | null = null;

/** 10,000 cache keys: users, photos, feeds and profiles. */
export function makeKeys(): RingKey[] {
  if (keyCache) return keyCache;
  const kinds = ['photo', 'user', 'feed', 'profile'];
  keyCache = Array.from({ length: KEY_COUNT }, (_, i) => {
    const key = `${kinds[i % kinds.length]}:${100_000 + i}`;
    return { key, pos: keyHash(key) };
  });
  return keyCache;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type ServerLoad = {
  server: number;
  /** Keys it owns, out of 10,000. */
  keys: number;
  share: number;
  /** Share of the ring's length it owns. */
  arc: number;
};

export type Arc = { from: number; to: number };

export type RingChange = {
  kind: 'add' | 'remove';
  /** The server that joined or left. */
  server: number;
  before: number[];
  /** Share of keys whose owner changed on the ring. */
  ringMoved: number;
  /** Share of keys whose owner changed with `hash % N`. */
  moduloMoved: number;
  /** Share that had to move: the keys the new server owns now, or the keys the departed server held. */
  mustMove: number;
  /** Add: where the moved keys came from. Remove: where they went. Shares of the moved keys, biggest first. */
  flows: { server: number; share: number }[];
  /** Stretches of the ring whose owner changed: keys in (from, to], wrapping when from > to. */
  changedArcs: Arc[];
  /** Share of the ring's length that changed owner. */
  changedLength: number;
  /** Per key (in makeKeys order): 1 if it moved. */
  movedRing: Uint8Array;
  movedModulo: Uint8Array;
};

export type RingResult = {
  servers: number[];
  vnodes: number;
  ring: VNode[];
  loads: ServerLoad[];
  /** An even share: 1 / N. */
  fair: number;
  /** The busiest server's share divided by an even share. */
  peak: number;
  busiest: number;
  change: RingChange | null;
};

export type RingState = {
  servers: readonly number[];
  /** The servers before the last join or leave, or null. */
  previous: readonly number[] | null;
  vnodes: number;
};

const ascending = (list: readonly number[]) => [...list].sort((a, b) => a - b);

/** Where the ring's owner changed between two rings, as merged stretches of the ring. */
export function changedArcs(before: readonly VNode[], after: readonly VNode[]): { arcs: Arc[]; length: number } {
  const points = [...new Set([...before.map((v) => v.pos), ...after.map((v) => v.pos)])].sort((a, b) => a - b);
  const arcs: Arc[] = [];
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const to = points[i]!;
    const from = i === 0 ? points[points.length - 1]! : points[i - 1]!;
    if (ringOwner(before, to) === ringOwner(after, to)) continue;
    length += i === 0 ? RING_SIZE - from + to : to - from;
    const last = arcs[arcs.length - 1];
    if (last && last.to === from) last.to = to;
    else arcs.push({ from, to });
  }
  // Join a stretch that crosses the top of the ring with the one that starts there.
  if (arcs.length > 1 && arcs[arcs.length - 1]!.to === arcs[0]!.from) {
    arcs[0]!.from = arcs[arcs.length - 1]!.from;
    arcs.pop();
  }
  return { arcs, length: length / RING_SIZE };
}

export function runRing(state: RingState): RingResult {
  const servers = ascending(state.servers);
  const vnodes = Math.max(1, Math.round(state.vnodes));
  const ring = buildRing(servers, vnodes);
  const keys = makeKeys();

  const counts = new Map<number, number>(servers.map((s) => [s, 0]));
  const owners = new Int32Array(keys.length);
  keys.forEach((k, i) => {
    const owner = ringOwner(ring, k.pos);
    owners[i] = owner;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  });

  const arcs = new Map<number, number>(servers.map((s) => [s, 0]));
  ring.forEach((v, i) => {
    const prev = i === 0 ? ring[ring.length - 1]!.pos - RING_SIZE : ring[i - 1]!.pos;
    arcs.set(v.server, (arcs.get(v.server) ?? 0) + (v.pos - prev) / RING_SIZE);
  });

  const loads: ServerLoad[] = servers.map((server) => ({
    server,
    keys: counts.get(server) ?? 0,
    share: (counts.get(server) ?? 0) / keys.length,
    arc: arcs.get(server) ?? 0,
  }));
  const fair = 1 / servers.length;
  const busiest = loads.reduce((best, l) => (l.share > best.share ? l : best), loads[0]!);

  let change: RingChange | null = null;
  const previous = state.previous ? ascending(state.previous) : null;
  if (previous && previous.length >= 1 && previous.join() !== servers.join()) {
    const kind = servers.length > previous.length ? 'add' : 'remove';
    const server = kind === 'add' ? servers.find((s) => !previous.includes(s))! : previous.find((s) => !servers.includes(s))!;
    const beforeRing = buildRing(previous, vnodes);
    const movedRing = new Uint8Array(keys.length);
    const movedModulo = new Uint8Array(keys.length);
    const flow = new Map<number, number>();
    let ringMoved = 0;
    let moduloMoved = 0;
    let mustMove = 0;
    keys.forEach((k, i) => {
      const was = ringOwner(beforeRing, k.pos);
      const now = owners[i]!;
      if (was !== now) {
        movedRing[i] = 1;
        ringMoved++;
        const other = kind === 'add' ? was : now;
        flow.set(other, (flow.get(other) ?? 0) + 1);
      }
      if (kind === 'add' ? now === server : was === server) mustMove++;
      if (moduloOwner(previous, k.pos) !== moduloOwner(servers, k.pos)) {
        movedModulo[i] = 1;
        moduloMoved++;
      }
    });
    const { arcs: changed, length } = changedArcs(beforeRing, ring);
    change = {
      kind,
      server,
      before: previous,
      ringMoved: ringMoved / keys.length,
      moduloMoved: moduloMoved / keys.length,
      mustMove: mustMove / keys.length,
      flows: [...flow.entries()]
        .map(([s, count]) => ({ server: s, share: ringMoved ? count / ringMoved : 0 }))
        .sort((a, b) => b.share - a.share || a.server - b.server),
      changedArcs: changed,
      changedLength: length,
      movedRing,
      movedModulo,
    };
  }

  return { servers, vnodes, ring, loads, fair, peak: busiest.share / fair, busiest: busiest.server, change };
}

/** Owners of the named sample keys, before and after the last change, for both schemes. */
export function sampleOwners(r: RingResult): { key: string; ring: [number, number]; modulo: [number, number] }[] {
  const before = r.change ? r.change.before : r.servers;
  const beforeRing = r.change ? buildRing(before, r.vnodes) : r.ring;
  return SAMPLE_KEYS.map((key) => {
    const pos = keyHash(key);
    return {
      key,
      ring: [ringOwner(beforeRing, pos), ringOwner(r.ring, pos)],
      modulo: [moduloOwner(before, pos), moduloOwner(r.servers, pos)],
    };
  });
}

/** With `hash % N`, the share of keys that stay put going from n to m servers (servers added or removed at the end). */
export function moduloStayShare(n: number, m: number): number {
  const period = (n * m) / gcd(n, m);
  let stay = 0;
  for (let h = 0; h < period; h++) if (h % n === h % m) stay++;
  return stay / period;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The lowest server number not in use, for a joining server. */
export function nextServerId(servers: readonly number[]): number {
  for (let id = 1; ; id++) if (!servers.includes(id)) return id;
}
