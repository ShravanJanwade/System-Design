/**
 * CDN map: how far a request travels with and without a content delivery network.
 *
 * A user in one of a handful of real cities asks for a Snapgram photo. Without the CDN the
 * request goes to the origin in Oregon. With it, the request goes to the nearest edge, which
 * answers from its cache (a hit) or first fetches the photo from Oregon (a miss).
 *
 * Round-trip times are ballpark estimates from great-circle distance:
 * - light in optical fiber covers about 200 km per millisecond;
 * - real routes follow cables and pass through routers, so they run about 1.5 times longer
 *   than the great circle;
 * - the user's own connection to their internet provider adds about 10 ms.
 *
 * The map is schematic: an equirectangular grid of latitude and longitude lines, no coastlines.
 * Everything here is pure and deterministic, so the view and the tests share it.
 */
import { measureText } from '@/diagram/text';

export type LatLon = { lat: number; lon: number };
export type Place = LatLon & { id: string; name: string };
export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/* ------------------------------------------------------------------ */
/* Places                                                              */
/* ------------------------------------------------------------------ */

/** Snapgram's servers: a data center in Oregon. */
export const ORIGIN: Place = { id: 'oregon', name: 'Oregon', lat: 45.52, lon: -122.68 };

/** CDN edge locations, in real cities. */
export const EDGES: readonly Place[] = [
  { id: 'los-angeles', name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { id: 'new-york', name: 'New York', lat: 40.71, lon: -74.01 },
  { id: 'sao-paulo', name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { id: 'frankfurt', name: 'Frankfurt', lat: 50.11, lon: 8.68 },
  { id: 'johannesburg', name: 'Johannesburg', lat: -26.2, lon: 28.05 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { id: 'singapore', name: 'Singapore', lat: 1.35, lon: 103.82 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { id: 'sydney', name: 'Sydney', lat: -33.87, lon: 151.21 },
];

/** Cities the learner can pick for the user. Maya lives in Singapore. */
export const USER_CITIES: readonly Place[] = [
  { id: 'singapore', name: 'Singapore', lat: 1.35, lon: 103.82 },
  { id: 'jakarta', name: 'Jakarta', lat: -6.21, lon: 106.85 },
  { id: 'seoul', name: 'Seoul', lat: 37.57, lon: 126.98 },
  { id: 'auckland', name: 'Auckland', lat: -36.85, lon: 174.76 },
  { id: 'delhi', name: 'Delhi', lat: 28.61, lon: 77.21 },
  { id: 'nairobi', name: 'Nairobi', lat: -1.29, lon: 36.82 },
  { id: 'london', name: 'London', lat: 51.51, lon: -0.13 },
  { id: 'buenos-aires', name: 'Buenos Aires', lat: -34.6, lon: -58.38 },
  { id: 'chicago', name: 'Chicago', lat: 41.88, lon: -87.63 },
  { id: 'san-francisco', name: 'San Francisco', lat: 37.77, lon: -122.42 },
];

export const DEFAULT_CITY = 'singapore';

export function getCity(id: string): Place {
  return USER_CITIES.find((c) => c.id === id) ?? USER_CITIES[0]!;
}

/* ------------------------------------------------------------------ */
/* Distance and time                                                   */
/* ------------------------------------------------------------------ */

export const EARTH_RADIUS_KM = 6371;
/** Light in fiber: about two thirds of its speed in a vacuum. */
export const FIBER_KM_PER_MS = 200;
/** Real routes are longer than the great circle and pass through routers. */
export const ROUTE_FACTOR = 1.5;
/** The user's own connection (home line or Wi-Fi to the provider), per round trip. Mobile adds more. */
export const ACCESS_MS = 10;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometers (haversine formula). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ballpark round trip over `km` of great-circle distance: there and back at fiber speed,
 * stretched by the route factor. Legs that start at the user's device also pay for the
 * user's own connection; edge-to-origin legs run between data centers and do not.
 */
export function roundTripMs(km: number, fromUser = true): number {
  return (2 * km * ROUTE_FACTOR) / FIBER_KM_PER_MS + (fromUser ? ACCESS_MS : 0);
}

/** Round to a ballpark figure: whole milliseconds below 20, then steps of 5 ms. */
export function ballpark(ms: number): number {
  if (ms < 20) return Math.max(1, Math.round(ms));
  return Math.round(ms / 5) * 5;
}

/** Round a distance for display: to 10 km below 1,000 km, otherwise to 100 km. */
export function roundKm(km: number): number {
  return km < 1000 ? Math.round(km / 10) * 10 : Math.round(km / 100) * 100;
}

export function nearestEdge(from: LatLon, edges: readonly Place[] = EDGES): { edge: Place; km: number } {
  let best = edges[0]!;
  let bestKm = haversineKm(from, best);
  for (const e of edges.slice(1)) {
    const km = haversineKm(from, e);
    if (km < bestKm) {
      best = e;
      bestKm = km;
    }
  }
  return { edge: best, km: bestKm };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export type CacheState = 'hit' | 'miss';

export type Leg = { from: Place; to: Place; km: number; ms: number };

export type Route = {
  kind: 'origin' | 'edge-hit' | 'edge-miss';
  /** Outbound legs in travel order. The response comes back the same way. */
  legs: Leg[];
  /** One request and its response. */
  roundTripMs: number;
  /**
   * A first request on a new connection: the TCP and TLS 1.3 handshakes (one round trip each)
   * with the first hop, then the request itself. On a miss the edge reuses a connection
   * it keeps open to the origin, so only the request crosses to Oregon.
   */
  firstVisitMs: number;
};

function leg(from: Place, to: Place, fromUser: boolean): Leg {
  const km = haversineKm(from, to);
  return { from, to, km, ms: roundTripMs(km, fromUser) };
}

/** Straight to the origin in Oregon. */
export function directRoute(user: Place): Route {
  const l = leg(user, ORIGIN, true);
  return { kind: 'origin', legs: [l], roundTripMs: l.ms, firstVisitMs: 3 * l.ms };
}

/** To the nearest edge; on a miss the edge fetches the photo from the origin first. */
export function cdnRoute(user: Place, cache: CacheState): Route {
  const { edge } = nearestEdge(user);
  const first = leg(user, edge, true);
  if (cache === 'hit') return { kind: 'edge-hit', legs: [first], roundTripMs: first.ms, firstVisitMs: 3 * first.ms };
  const second = leg(edge, ORIGIN, false);
  const rtt = first.ms + second.ms;
  return { kind: 'edge-miss', legs: [first, second], roundTripMs: rtt, firstVisitMs: 2 * first.ms + rtt };
}

export type Comparison = {
  user: Place;
  edge: Place;
  edgeKm: number;
  originKm: number;
  direct: Route;
  cdn: Route;
  /** Positive when the CDN is faster for one round trip. */
  savedMs: number;
  /** Share of the direct round trip saved (negative when the CDN is slower). */
  savedShare: number;
};

export function compareRoutes(user: Place, cache: CacheState): Comparison {
  const { edge, km } = nearestEdge(user);
  const direct = directRoute(user);
  const cdn = cdnRoute(user, cache);
  const savedMs = direct.roundTripMs - cdn.roundTripMs;
  return {
    user,
    edge,
    edgeKm: km,
    originKm: direct.legs[0]!.km,
    direct,
    cdn,
    savedMs,
    savedShare: savedMs / direct.roundTripMs,
  };
}

/** The user city whose round trip shrinks the most with a cache hit at the edge. */
export function biggestHitSaving(): Comparison {
  return USER_CITIES.map((c) => compareRoutes(c, 'hit')).reduce((a, b) => (b.savedMs > a.savedMs ? b : a));
}

/* ------------------------------------------------------------------ */
/* Map projection                                                      */
/* ------------------------------------------------------------------ */

/**
 * The map is centered on the Pacific, with its left and right edges on 50°E. Every route in
 * this widget then stays on the map without wrapping around an edge.
 */
export const MAP_LEFT_LON = 50;
export const MAP_TOP_LAT = 75;
export const MAP_BOTTOM_LAT = -55;
/** Height divided by width, keeping one degree of latitude as tall as one degree of longitude is wide. */
export const MAP_ASPECT = (MAP_TOP_LAT - MAP_BOTTOM_LAT) / 360;

/** Degrees east of the map's left edge, 0 to 360. */
export function lonOffset(lon: number): number {
  return (((lon - MAP_LEFT_LON) % 360) + 360) % 360;
}

/** Equirectangular projection into a width × height box. */
export function project(p: LatLon, width: number, height: number): Pt {
  return {
    x: (lonOffset(p.lon) / 360) * width,
    y: ((MAP_TOP_LAT - p.lat) / (MAP_TOP_LAT - MAP_BOTTOM_LAT)) * height,
  };
}

/** Grid lines every 30 degrees, as longitudes and latitudes. */
export function graticule(): { meridians: number[]; parallels: number[] } {
  const meridians: number[] = [];
  for (let lon = -150; lon <= 180; lon += 30) meridians.push(lon);
  const parallels: number[] = [];
  for (let lat = 60; lat >= -30; lat -= 30) parallels.push(lat);
  return { meridians, parallels };
}

/** True when the shorter way around the globe between two longitudes crosses the map's edge. */
export function crossesMapEdge(a: LatLon, b: LatLon): boolean {
  return Math.abs(lonOffset(a.lon) - lonOffset(b.lon)) > 180;
}

/**
 * Control point of a gentle arc from a to b, bowed toward the top of the map like a flight path.
 * The bow shrinks when the arc would leave the top of the map.
 */
export function arcControl(a: Pt, b: Pt, top = 6): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: mx, y: my };
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  let bow = 0.32 * len;
  // The curve's peak sits half a bow from the chord's midpoint.
  const peakY = my + (ny * bow) / 2;
  if (ny < 0 && peakY < top) bow = Math.max(0, (2 * (top - my)) / ny);
  return { x: mx + nx * bow, y: my + ny * bow };
}

/** Point on a quadratic curve. */
export function quadPoint(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** The drawn path of a route: one arc per leg, with dense samples for moving a dot along it. */
export function routeGeometry(route: Route, width: number, height: number) {
  const arcs = route.legs.map((l) => {
    const a = project(l.from, width, height);
    const b = project(l.to, width, height);
    const c = arcControl(a, b);
    const samples: Pt[] = [];
    for (let i = 0; i <= 32; i++) samples.push(quadPoint(a, c, b, i / 32));
    return { a, b, c, d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, samples };
  });
  const outbound = arcs.flatMap((arc, i) => (i === 0 ? arc.samples : arc.samples.slice(1)));
  let length = 0;
  for (let i = 1; i < outbound.length; i++) length += Math.hypot(outbound[i]!.x - outbound[i - 1]!.x, outbound[i]!.y - outbound[i - 1]!.y);
  return { arcs, outbound, length };
}

/** Point at a distance along a sampled polyline. */
export function pointAlong(samples: Pt[], at: number): Pt {
  if (samples.length === 0) return { x: 0, y: 0 };
  let remaining = Math.max(0, at);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return samples[samples.length - 1]!;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const LABEL_FONT = 12;
export const LABEL_H = 16;
export const CHIP_H = 20;
/** Below this map width, labels drop their "Edge" and "Origin" prefixes. */
export const COMPACT_WIDTH = 480;

export function labelWidth(text: string): number {
  return Math.ceil(measureText(text, LABEL_FONT, 'semibold')) + 4;
}

export function chipWidth(text: string): number {
  return Math.ceil(measureText(text, LABEL_FONT, 'semibold')) + 16;
}

export type LabelRequest = {
  id: string;
  anchor: Pt;
  w: number;
  h: number;
  /** Optional labels are dropped rather than drawn over something else. */
  optional?: boolean;
};

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Spots around an anchor, nearest first: beside, above and below, at the corners, then a step further out. */
function candidates(r: LabelRequest): Box[] {
  const { x, y } = r.anchor;
  const { w, h } = r;
  const ring = (g: number, d: number): Box[] => [
    { x: x + g, y: y - h / 2, w, h },
    { x: x - g - w, y: y - h / 2, w, h },
    { x: x - w / 2, y: y - g - h, w, h },
    { x: x - w / 2, y: y + g, w, h },
    { x: x + d, y: y - d - h, w, h },
    { x: x + d, y: y + d, w, h },
    { x: x - d - w, y: y - d - h, w, h },
    { x: x - d - w, y: y + d, w, h },
  ];
  return [...ring(9, 6), ...ring(22, 16)];
}

/**
 * Greedy label placement: each label, in order, takes the first spot around its anchor that
 * stays inside the map and clear of markers and earlier labels. A required label with no clear
 * spot takes the least crowded one; an optional label is dropped.
 */
export function placeLabels(requests: LabelRequest[], obstacles: Box[], bounds: { w: number; h: number }): Record<string, Box | null> {
  const placed: Box[] = [];
  const out: Record<string, Box | null> = {};
  const margin = 2;
  for (const r of requests) {
    const inside = candidates(r).filter((b) => b.x >= margin && b.y >= margin && b.x + b.w <= bounds.w - margin && b.y + b.h <= bounds.h - margin);
    let best: Box | null = null;
    let bestScore = Infinity;
    for (const b of inside) {
      const score = [...placed, ...obstacles].reduce((s, o) => s + overlapArea(b, o), 0);
      if (score < bestScore) {
        best = b;
        bestScore = score;
      }
      if (score === 0) break;
    }
    if (!best || (r.optional && bestScore > 0)) {
      out[r.id] = null;
      continue;
    }
    out[r.id] = best;
    placed.push(best);
  }
  return out;
}

/** A square around a marker, for keeping labels off it. */
export function markerBox(p: Pt, radius = 7): Box {
  return { x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 };
}

export type MapScene = {
  width: number;
  height: number;
  comparison: Comparison;
  /** The route drawn as the request's path: to the edge with the CDN on, to Oregon with it off. */
  route: Route;
  user: Pt;
  edge: Pt;
  origin: Pt;
  labels: { id: 'user' | 'edge' | 'origin' | 'time'; text: string; box: Box; kind: 'label' | 'chip' }[];
};

/** Everything the view draws for one setting, at one size. */
export function buildScene(cityId: string, cdn: boolean, cache: CacheState, width: number): MapScene {
  const height = Math.round(width * MAP_ASPECT);
  const comparison = compareRoutes(getCity(cityId), cache);
  const route = cdn ? comparison.cdn : comparison.direct;
  const user = project(comparison.user, width, height);
  const edge = project(comparison.edge, width, height);
  const origin = project(ORIGIN, width, height);
  const geo = routeGeometry(route, width, height);
  // The time chip sits at the peak of the longest arc, or beside the user when the path is very short.
  const longest = geo.arcs.reduce((a, b) => (Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) > Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) ? b : a));
  const peak = quadPoint(longest.a, longest.c, longest.b, 0.5);
  const timeText = `${ballpark(route.roundTripMs)} ms round trip`;

  // Phones get bare city names; the marker shapes and the legend say which is which.
  const compact = width < COMPACT_WIDTH;
  const texts = {
    user: comparison.user.name,
    edge: compact ? comparison.edge.name : `Edge, ${comparison.edge.name}`,
    origin: compact ? 'Oregon' : 'Origin, Oregon',
  };
  const requests: LabelRequest[] = [
    { id: 'user', anchor: user, w: labelWidth(texts.user), h: LABEL_H },
    ...(cdn ? [{ id: 'edge', anchor: edge, w: labelWidth(texts.edge), h: LABEL_H }] : []),
    { id: 'origin', anchor: origin, w: labelWidth(texts.origin), h: LABEL_H },
    { id: 'time', anchor: geo.length > 40 ? peak : user, w: chipWidth(timeText), h: CHIP_H, optional: true },
  ];
  const obstacles = [markerBox(user), markerBox(origin), ...(cdn ? [markerBox(edge)] : [])];
  const boxes = placeLabels(requests, obstacles, { w: width, h: height });

  const labels: MapScene['labels'] = [];
  for (const id of ['user', 'edge', 'origin'] as const) {
    const box = boxes[id];
    if (box) labels.push({ id, text: texts[id], box, kind: 'label' });
  }
  if (boxes.time) labels.push({ id: 'time', text: timeText, box: boxes.time, kind: 'chip' });
  return { width, height, comparison, route, user, edge, origin, labels };
}

/** Plain-language description of the current setting, for screen readers and the caption. */
export function describeScene(c: Comparison, cdn: boolean, cache: CacheState): string {
  const direct = `${ballpark(c.direct.roundTripMs)} ms`;
  const origin = `${roundKm(c.originKm).toLocaleString('en-US')} km`;
  const sameCity = c.edgeKm < 50;
  const edgeWhere = sameCity ? `an edge in ${c.edge.name} itself` : `the ${c.edge.name} edge, about ${roundKm(c.edgeKm).toLocaleString('en-US')} km away`;
  const cdnTime = `${ballpark(c.cdn.roundTripMs)} ms`;
  if (!cdn) {
    return `A user in ${c.user.name} asks Oregon, about ${origin} away, for the photo: about ${direct} per round trip. With the CDN, the nearest copy would be at ${edgeWhere}.`;
  }
  if (cache === 'hit') {
    return `A user in ${c.user.name} is sent to ${edgeWhere}, which has the photo: about ${cdnTime} per round trip instead of ${direct} to Oregon.`;
  }
  return `A user in ${c.user.name} is sent to ${edgeWhere}, which does not have the photo yet, so it fetches it from Oregon first: about ${cdnTime} for this request, against ${direct} without the CDN. Later requests there are hits.`;
}
