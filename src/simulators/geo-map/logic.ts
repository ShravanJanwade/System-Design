/**
 * Geospatial map simulator: real geohash encoding (interleaved longitude and latitude bits,
 * written in base 32) and a real point quadtree that splits a cell into four quarters once
 * it holds more photos than its capacity. The map is a schematic view of central Singapore.
 */
import { createRng } from '@/lib/random';

/** The geohash alphabet: digits and letters, without a, i, l and o. */
export const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export type LatLon = { lat: number; lon: number };
export type Box = { latMin: number; latMax: number; lonMin: number; lonMax: number };
export type Point = LatLon & { id: number };

/**
 * The map: a 2 × 2 block of five-character geohash cells over central Singapore, about 9.8 km
 * on each side. Every cell edge at five characters or more lines up with the map's edges.
 */
export const MAP: Box = { latMin: 1.2744140625, latMax: 1.3623046875, lonMin: 103.798828125, lonMax: 103.88671875 };

export const EARTH_RADIUS_KM = 6371;
/** Kilometers per degree of latitude on a sphere of radius 6,371 km. */
export const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180;
/** "Photos near me" looks for photos within this distance of Maya. */
export const SEARCH_RADIUS_KM = 1;

export const MIN_PRECISION = 4;
export const MAX_PRECISION = 7;
export const DEFAULT_PRECISION = 6;
export const CAPACITY_STEPS = [1, 2, 4, 8, 16] as const;
export const DEFAULT_CAPACITY = 4;
/** The deepest a quadtree cell may split; at depth 10 a cell is about 10 m across. */
export const MAX_DEPTH = 10;
export const MAX_POINTS = 600;
export const ADD_COUNT = 20;
export const CROWD_SIZE = 40;

/* ------------------------------------------------------------------ */
/* Geohash                                                             */
/* ------------------------------------------------------------------ */

/** The textbook algorithm: halve longitude, then latitude, in turn; every five bits make one character. */
export function encodeGeohash(lat: number, lon: number, precision: number): string {
  let latLo = -90;
  let latHi = 90;
  let lonLo = -180;
  let lonHi = 180;
  let hash = '';
  let bits = 0;
  let value = 0;
  let lonTurn = true;
  while (hash.length < precision) {
    if (lonTurn) {
      const mid = (lonLo + lonHi) / 2;
      if (lon >= mid) {
        value = value * 2 + 1;
        lonLo = mid;
      } else {
        value *= 2;
        lonHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latLo = mid;
      } else {
        value *= 2;
        latHi = mid;
      }
    }
    lonTurn = !lonTurn;
    bits++;
    if (bits === 5) {
      hash += BASE32.charAt(value);
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** The rectangle a geohash names. */
export function decodeGeohash(hash: string): Box {
  let latLo = -90;
  let latHi = 90;
  let lonLo = -180;
  let lonHi = 180;
  let lonTurn = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error(`"${ch}" is not a geohash character`);
    for (let b = 4; b >= 0; b--) {
      const bit = (value >> b) & 1;
      if (lonTurn) {
        const mid = (lonLo + lonHi) / 2;
        if (bit) lonLo = mid;
        else lonHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid;
        else latHi = mid;
      }
      lonTurn = !lonTurn;
    }
  }
  return { latMin: latLo, latMax: latHi, lonMin: lonLo, lonMax: lonHi };
}

/** Longitude gets the first bit, so it gets the extra one when the total is odd. */
export function cellBits(precision: number): { lonBits: number; latBits: number } {
  const total = precision * 5;
  return { lonBits: Math.ceil(total / 2), latBits: Math.floor(total / 2) };
}

export function cellSizeDeg(precision: number): { lonDeg: number; latDeg: number } {
  const { lonBits, latBits } = cellBits(precision);
  return { lonDeg: 360 / 2 ** lonBits, latDeg: 180 / 2 ** latBits };
}

/** Column and row of the cell holding a point, counted from longitude −180 and latitude −90. */
export function cellIndex(lat: number, lon: number, precision: number): { ix: number; iy: number } {
  const { lonBits, latBits } = cellBits(precision);
  const { lonDeg, latDeg } = cellSizeDeg(precision);
  const ix = Math.min(2 ** lonBits - 1, Math.max(0, Math.floor((lon + 180) / lonDeg)));
  const iy = Math.min(2 ** latBits - 1, Math.max(0, Math.floor((lat + 90) / latDeg)));
  return { ix, iy };
}

/** Interleave the column and row bits (longitude first) and write them in base 32. */
export function geohashFromIndex(ix: number, iy: number, precision: number): string {
  const { lonBits, latBits } = cellBits(precision);
  let hash = '';
  let value = 0;
  let bits = 0;
  let lonUsed = 0;
  let latUsed = 0;
  for (let i = 0; i < precision * 5; i++) {
    let bit: number;
    if (i % 2 === 0) {
      bit = Math.floor(ix / 2 ** (lonBits - 1 - lonUsed)) % 2;
      lonUsed++;
    } else {
      bit = Math.floor(iy / 2 ** (latBits - 1 - latUsed)) % 2;
      latUsed++;
    }
    value = value * 2 + bit;
    bits++;
    if (bits === 5) {
      hash += BASE32.charAt(value);
      value = 0;
      bits = 0;
    }
  }
  return hash;
}

/** Column and row of a geohash cell: the inverse of geohashFromIndex. */
export function indexOfGeohash(hash: string): { ix: number; iy: number } {
  let ix = 0;
  let iy = 0;
  let lonTurn = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error(`"${ch}" is not a geohash character`);
    for (let b = 4; b >= 0; b--) {
      const bit = (value >> b) & 1;
      if (lonTurn) ix = ix * 2 + bit;
      else iy = iy * 2 + bit;
      lonTurn = !lonTurn;
    }
  }
  return { ix, iy };
}

export function cellBox(ix: number, iy: number, precision: number): Box {
  const { lonDeg, latDeg } = cellSizeDeg(precision);
  return { lonMin: -180 + ix * lonDeg, lonMax: -180 + (ix + 1) * lonDeg, latMin: -90 + iy * latDeg, latMax: -90 + (iy + 1) * latDeg };
}

export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const STEPS: Record<Direction, [number, number]> = {
  n: [0, 1],
  ne: [1, 1],
  e: [1, 0],
  se: [1, -1],
  s: [0, -1],
  sw: [-1, -1],
  w: [-1, 0],
  nw: [-1, 1],
};
export const DIRECTIONS = Object.keys(STEPS) as Direction[];

/** The same-sized cell next door. Longitude wraps around the date line; there is nothing past a pole. */
export function neighbor(hash: string, dir: Direction): string | null {
  const { lonBits, latBits } = cellBits(hash.length);
  const { ix, iy } = indexOfGeohash(hash);
  const [dx, dy] = STEPS[dir];
  const cols = 2 ** lonBits;
  const ny = iy + dy;
  if (ny < 0 || ny >= 2 ** latBits) return null;
  return geohashFromIndex((((ix + dx) % cols) + cols) % cols, ny, hash.length);
}

/** The eight cells around a cell, clockwise from north. */
export function neighbors(hash: string): string[] {
  return DIRECTIONS.map((d) => neighbor(hash, d)).filter((h): h is string => h !== null);
}

export function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/* ------------------------------------------------------------------ */
/* Distance                                                            */
/* ------------------------------------------------------------------ */

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Great-circle distance on a sphere: the haversine formula. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from a point to the nearest edge or corner of a box (zero inside it). */
export function boxDistanceKm(p: LatLon, box: Box): number {
  return haversineKm(p, { lat: clamp(p.lat, box.latMin, box.latMax), lon: clamp(p.lon, box.lonMin, box.lonMax) });
}

export function boxSizeKm(box: Box): { widthKm: number; heightKm: number } {
  const midLat = (box.latMin + box.latMax) / 2;
  return {
    widthKm: (box.lonMax - box.lonMin) * KM_PER_DEGREE * Math.cos(midLat * RAD),
    heightKm: (box.latMax - box.latMin) * KM_PER_DEGREE,
  };
}

/** 0.611 -> "611 m", 1.22 -> "1.2 km". */
export function formatKm(km: number): string {
  if (km >= 1) return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

export function formatCell(box: Box): string {
  const { widthKm, heightKm } = boxSizeKm(box);
  const w = formatKm(widthKm);
  const h = formatKm(heightKm);
  return w === h ? `${w} square` : `${w} × ${h}`;
}

export function within(p: LatLon, box: Box): boolean {
  return p.lat >= box.latMin && p.lat <= box.latMax && p.lon >= box.lonMin && p.lon <= box.lonMax;
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

/** The busy downtown area and a market that straddles the map's middle edge. */
export const DOWNTOWN: LatLon = { lat: 1.286, lon: 103.856 };
export const MARKET: LatLon = { lat: 1.303, lon: 103.844 };

/** Where each "Drop a crowd" lands, in turn. */
export const CROWDS: LatLon[] = [
  { lat: 1.348, lon: 103.85 },
  { lat: 1.3, lon: 103.815 },
  { lat: 1.331, lon: 103.871 },
  { lat: 1.281, lon: 103.826 },
];

export type SpotId = 'downtown' | 'edge' | 'quiet';
export const SPOT_ORDER: SpotId[] = ['downtown', 'edge', 'quiet'];
export const SPOTS: Record<SpotId, { label: string; at: LatLon }> = {
  downtown: { label: 'Downtown', at: { lat: 1.2875, lon: 103.8545 } },
  /** About 110 m west of the edge between two five-character cells. */
  edge: { label: 'On a cell edge', at: { lat: 1.301, lon: 103.8418 } },
  quiet: { label: 'In a quiet corner', at: { lat: 1.35, lon: 103.811 } },
};

function withIds(list: LatLon[], start: number): Point[] {
  return list.map((p, i) => ({ id: start + i, lat: p.lat, lon: p.lon }));
}

/** Photos spread evenly over the map. */
export function scatter(count: number, seed: number, start = 0): Point[] {
  const rng = createRng(seed);
  const out: LatLon[] = [];
  for (let i = 0; i < count; i++) out.push({ lat: rng.range(MAP.latMin, MAP.latMax), lon: rng.range(MAP.lonMin, MAP.lonMax) });
  return withIds(out, start);
}

/** Photos bunched around a spot: a normal spread, kept on the map. */
export function crowd(center: LatLon, count: number, spreadKm: number, seed: number, start = 0): Point[] {
  const rng = createRng(seed);
  const out: LatLon[] = [];
  const latScale = spreadKm / KM_PER_DEGREE;
  const lonScale = latScale / Math.cos(center.lat * RAD);
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const u1 = 1 - rng.next();
    const u2 = rng.next();
    const r = Math.sqrt(-2 * Math.log(u1));
    const p = { lat: center.lat + r * Math.sin(2 * Math.PI * u2) * latScale, lon: center.lon + r * Math.cos(2 * Math.PI * u2) * lonScale };
    if (within(p, MAP)) out.push(p);
  }
  return withIds(out, start);
}

/** The starting map: photos everywhere, a busy downtown and a market on a cell edge. */
export function initialPoints(): Point[] {
  const base = scatter(70, 11);
  const downtown = crowd(DOWNTOWN, 50, 0.3, 12, base.length);
  const market = crowd(MARKET, 30, 0.35, 13, base.length + downtown.length);
  return [...base, ...downtown, ...market];
}

export function addScattered(points: Point[]): Point[] {
  if (points.length >= MAX_POINTS) return points;
  const count = Math.min(ADD_COUNT, MAX_POINTS - points.length);
  return [...points, ...scatter(count, 1000 + points.length, points.length)];
}

/** Adds the crowd number `index` (0-based), cycling through CROWDS. */
export function addCrowd(points: Point[], index: number): Point[] {
  if (points.length >= MAX_POINTS) return points;
  const count = Math.min(CROWD_SIZE, MAX_POINTS - points.length);
  return [...points, ...crowd(CROWDS[index % CROWDS.length]!, count, 0.22, 2000 + index, points.length)];
}

/* ------------------------------------------------------------------ */
/* A nearby query on the geohash grid                                  */
/* ------------------------------------------------------------------ */

export type GeoCell = { hash: string; ix: number; iy: number; box: Box; own: boolean };

export type GeohashRun = {
  precision: number;
  center: LatLon;
  radiusKm: number;
  centerHash: string;
  cellBox: Box;
  /** Cells the search circle touches: Maya's own and the neighbors it crosses into. */
  cells: GeoCell[];
  /** Ids of photos read from those cells. */
  checked: number[];
  /** Ids of checked photos within the radius. */
  found: number[];
  /** Found photos that live in a neighboring cell, not in Maya's own. */
  foundInNeighbors: number[];
  /** Cells on the map that hold photos, with how many. */
  occupied: { hash: string; box: Box; count: number }[];
};

/**
 * Scan every cell, at this precision, that the search circle touches, then keep the photos
 * within the radius. With cells at least as big as the radius, that is Maya's cell and a few of
 * its eight neighbors.
 */
export function runGeohash(points: Point[], center: LatLon, precision: number, radiusKm = SEARCH_RADIUS_KM): GeohashRun {
  const own = cellIndex(center.lat, center.lon, precision);
  const dLat = radiusKm / KM_PER_DEGREE;
  const dLon = dLat / Math.cos(center.lat * RAD);
  const lo = cellIndex(center.lat - dLat, center.lon - dLon, precision);
  const hi = cellIndex(center.lat + dLat, center.lon + dLon, precision);
  const cells: GeoCell[] = [];
  for (let iy = lo.iy; iy <= hi.iy; iy++) {
    for (let ix = lo.ix; ix <= hi.ix; ix++) {
      const box = cellBox(ix, iy, precision);
      if (boxDistanceKm(center, box) <= radiusKm) {
        cells.push({ hash: geohashFromIndex(ix, iy, precision), ix, iy, box, own: ix === own.ix && iy === own.iy });
      }
    }
  }
  const scanned = new Set(cells.map((c) => `${c.ix}:${c.iy}`));
  const ownKey = `${own.ix}:${own.iy}`;
  const counts = new Map<string, { ix: number; iy: number; count: number }>();
  const checked: number[] = [];
  const found: number[] = [];
  const foundInNeighbors: number[] = [];
  for (const p of points) {
    const at = cellIndex(p.lat, p.lon, precision);
    const key = `${at.ix}:${at.iy}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { ix: at.ix, iy: at.iy, count: 1 });
    if (!scanned.has(key)) continue;
    checked.push(p.id);
    if (haversineKm(center, p) <= radiusKm) {
      found.push(p.id);
      if (key !== ownKey) foundInNeighbors.push(p.id);
    }
  }
  return {
    precision,
    center,
    radiusKm,
    centerHash: geohashFromIndex(own.ix, own.iy, precision),
    cellBox: cellBox(own.ix, own.iy, precision),
    cells,
    checked,
    found,
    foundInNeighbors,
    occupied: [...counts.values()].map((c) => ({ hash: geohashFromIndex(c.ix, c.iy, precision), box: cellBox(c.ix, c.iy, precision), count: c.count })),
  };
}

/** Longitudes and latitudes of the cell edges inside the map at one precision. */
export function gridLines(precision: number): { lons: number[]; lats: number[] } {
  const { lonDeg, latDeg } = cellSizeDeg(precision);
  const lons: number[] = [];
  const lats: number[] = [];
  const eps = 1e-9;
  for (let k = Math.floor((MAP.lonMin + 180) / lonDeg) + 1; -180 + k * lonDeg < MAP.lonMax - eps; k++) {
    const lon = -180 + k * lonDeg;
    if (lon > MAP.lonMin + eps) lons.push(lon);
  }
  for (let k = Math.floor((MAP.latMin + 90) / latDeg) + 1; -90 + k * latDeg < MAP.latMax - eps; k++) {
    const lat = -90 + k * latDeg;
    if (lat > MAP.latMin + eps) lats.push(lat);
  }
  return { lons, lats };
}

/* ------------------------------------------------------------------ */
/* Quadtree                                                            */
/* ------------------------------------------------------------------ */

export type QuadNode = {
  box: Box;
  depth: number;
  /** The path of quarters from the root (0 north-west, 1 north-east, 2 south-west, 3 south-east). */
  key: string;
  /** Point ids, for a leaf. */
  items: number[];
  children: QuadNode[] | null;
};

function quarter(node: QuadNode, p: LatLon): number {
  const midLat = (node.box.latMin + node.box.latMax) / 2;
  const midLon = (node.box.lonMin + node.box.lonMax) / 2;
  return (p.lat < midLat ? 2 : 0) + (p.lon >= midLon ? 1 : 0);
}

function split(node: QuadNode): void {
  const { latMin, latMax, lonMin, lonMax } = node.box;
  const midLat = (latMin + latMax) / 2;
  const midLon = (lonMin + lonMax) / 2;
  const boxes: Box[] = [
    { latMin: midLat, latMax, lonMin, lonMax: midLon },
    { latMin: midLat, latMax, lonMin: midLon, lonMax },
    { latMin, latMax: midLat, lonMin, lonMax: midLon },
    { latMin, latMax: midLat, lonMin: midLon, lonMax },
  ];
  node.children = boxes.map((box, i) => ({ box, depth: node.depth + 1, key: `${node.key}${i}`, items: [], children: null }));
}

function insert(root: QuadNode, id: number, byId: Map<number, Point>, capacity: number, maxDepth: number): void {
  const p = byId.get(id)!;
  let node = root;
  while (node.children) node = node.children[quarter(node, p)]!;
  node.items.push(id);
  if (node.items.length > capacity && node.depth < maxDepth) {
    const items = node.items;
    node.items = [];
    split(node);
    for (const j of items) insert(node, j, byId, capacity, maxDepth);
  }
}

/** A point quadtree: a cell splits into four quarters as soon as it holds more than `capacity` points. */
export function buildQuadtree(points: Point[], capacity: number, maxDepth = MAX_DEPTH, root: Box = MAP): QuadNode {
  const tree: QuadNode = { box: root, depth: 0, key: '', items: [], children: null };
  const byId = new Map(points.map((p) => [p.id, p]));
  for (const p of points) insert(tree, p.id, byId, capacity, maxDepth);
  return tree;
}

export function leaves(node: QuadNode): QuadNode[] {
  return node.children ? node.children.flatMap(leaves) : [node];
}

export function leafAt(node: QuadNode, p: LatLon): QuadNode {
  let n = node;
  while (n.children) n = n.children[quarter(n, p)]!;
  return n;
}

export type QuadRun = {
  capacity: number;
  center: LatLon;
  radiusKm: number;
  tree: QuadNode;
  leaves: QuadNode[];
  /** Leaves the search circle touches. */
  scanned: QuadNode[];
  /** Tree nodes the search looked at on its way down. */
  visited: number;
  checked: number[];
  found: number[];
  deepest: QuadNode;
  /** The most photos in any one leaf. */
  fullest: number;
};

/** Walk down from the root, skipping every quarter the search circle does not touch. */
export function runQuadtree(points: Point[], center: LatLon, capacity: number, radiusKm = SEARCH_RADIUS_KM): QuadRun {
  const tree = buildQuadtree(points, capacity);
  const all = leaves(tree);
  const scanned: QuadNode[] = [];
  let visited = 0;
  const walk = (n: QuadNode) => {
    visited++;
    if (boxDistanceKm(center, n.box) > radiusKm) return;
    if (n.children) n.children.forEach(walk);
    else scanned.push(n);
  };
  walk(tree);
  const byId = new Map(points.map((p) => [p.id, p]));
  const checked = scanned.flatMap((n) => n.items);
  const found = checked.filter((id) => haversineKm(center, byId.get(id)!) <= radiusKm);
  const deepest = all.reduce((a, b) => (b.depth > a.depth ? b : a), all[0]!);
  const fullest = all.reduce((m, n) => Math.max(m, n.items.length), 0);
  return { capacity, center, radiusKm, tree, leaves: all, scanned, visited, checked, found, deepest, fullest };
}

/** Every photo within the radius, found the slow way: checking them all. */
export function bruteForce(points: Point[], center: LatLon, radiusKm = SEARCH_RADIUS_KM): number[] {
  return points.filter((p) => haversineKm(center, p) <= radiusKm).map((p) => p.id);
}
