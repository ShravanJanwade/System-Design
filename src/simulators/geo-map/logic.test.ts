import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/random';
import {
  CAPACITY_STEPS,
  CROWDS,
  MAP,
  MAX_DEPTH,
  MAX_POINTS,
  SPOTS,
  SPOT_ORDER,
  addCrowd,
  addScattered,
  boxSizeKm,
  bruteForce,
  buildQuadtree,
  cellIndex,
  cellSizeDeg,
  decodeGeohash,
  encodeGeohash,
  geohashFromIndex,
  gridLines,
  haversineKm,
  indexOfGeohash,
  initialPoints,
  leafAt,
  leaves,
  neighbor,
  neighbors,
  runGeohash,
  runQuadtree,
  within,
} from './logic';

const points = initialPoints();

describe('geohash encoding', () => {
  it('matches published examples of the standard algorithm', () => {
    expect(encodeGeohash(42.6, -5.6, 5)).toBe('ezs42');
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(37.8324, 112.5584, 9)).toBe('ww8p1r4t8');
  });

  it('decodes a geohash to the cell that holds the point', () => {
    const box = decodeGeohash('ezs42');
    expect((box.latMin + box.latMax) / 2).toBeCloseTo(42.605, 3);
    expect((box.lonMin + box.lonMax) / 2).toBeCloseTo(-5.603, 3);
    const rng = createRng(5);
    for (let i = 0; i < 300; i++) {
      const p = { lat: rng.range(-89, 89), lon: rng.range(-179, 179) };
      const precision = 1 + rng.int(9);
      const b = decodeGeohash(encodeGeohash(p.lat, p.lon, precision));
      expect(within(p, b)).toBe(true);
      const { lonDeg, latDeg } = cellSizeDeg(precision);
      expect(b.lonMax - b.lonMin).toBeCloseTo(lonDeg, 12);
      expect(b.latMax - b.latMin).toBeCloseTo(latDeg, 12);
    }
  });

  it('interleaving column and row bits gives the same string as halving the map', () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const p = { lat: rng.range(-89, 89), lon: rng.range(-179, 179) };
      const precision = 1 + rng.int(10);
      const { ix, iy } = cellIndex(p.lat, p.lon, precision);
      const hash = geohashFromIndex(ix, iy, precision);
      expect(hash).toBe(encodeGeohash(p.lat, p.lon, precision));
      expect(indexOfGeohash(hash)).toEqual({ ix, iy });
    }
  });

  it('a longer geohash names a smaller cell inside the shorter one', () => {
    const near = SPOTS.downtown.at;
    const six = encodeGeohash(near.lat, near.lon, 6);
    expect(encodeGeohash(near.lat, near.lon, 7).startsWith(six)).toBe(true);
    expect(encodeGeohash(1.2834, 103.8607, 6)).toBe('w21z73');
  });

  it('has the cell sizes the lesson quotes, near Singapore', () => {
    const size = (p: number) => boxSizeKm(decodeGeohash(encodeGeohash(1.2834, 103.8607, p)));
    expect(size(5).widthKm).toBeCloseTo(4.9, 1);
    expect(size(5).heightKm).toBeCloseTo(4.9, 1);
    expect(size(6).widthKm).toBeCloseTo(1.22, 2);
    expect(size(6).heightKm).toBeCloseTo(0.61, 2);
    expect(size(7).widthKm).toBeCloseTo(0.153, 3);
    expect(size(7).heightKm).toBeCloseTo(0.153, 3);
  });
});

describe('neighbors', () => {
  it('matches the standard neighbors of gbsuv', () => {
    expect(neighbor('gbsuv', 'n')).toBe('gbsvj');
    expect(neighbor('gbsuv', 'e')).toBe('gbsuy');
    expect(neighbor('gbsuv', 's')).toBe('gbsut');
    expect(neighbor('gbsuv', 'w')).toBe('gbsuu');
    expect(neighbors('gbsuv')).toHaveLength(8);
  });

  it('cells side by side across a big edge can share no prefix at all', () => {
    const east = neighbor('ezzz', 'e')!;
    expect(east).toBe('spbp');
    const a = decodeGeohash('ezzz');
    const b = decodeGeohash(east);
    expect(b.lonMin).toBeCloseTo(a.lonMax, 12);
    expect(b.latMin).toBeCloseTo(a.latMin, 12);
  });

  it('wraps around the date line and stops at the poles', () => {
    const west = encodeGeohash(10, -179.99, 4);
    const across = neighbor(west, 'w')!;
    expect(decodeGeohash(across).lonMax).toBeCloseTo(180, 9);
    expect(neighbor(encodeGeohash(89.99, 0, 3), 'n')).toBeNull();
  });
});

describe('the map', () => {
  it('is exactly four five-character cells', () => {
    const corners = [
      encodeGeohash(MAP.latMin + 1e-6, MAP.lonMin + 1e-6, 5),
      encodeGeohash(MAP.latMin + 1e-6, MAP.lonMax - 1e-6, 5),
      encodeGeohash(MAP.latMax - 1e-6, MAP.lonMin + 1e-6, 5),
      encodeGeohash(MAP.latMax - 1e-6, MAP.lonMax - 1e-6, 5),
    ];
    expect(corners).toEqual(['w21z6', 'w21z7', 'w21zd', 'w21ze']);
    expect(gridLines(4)).toEqual({ lons: [], lats: [] });
    expect(gridLines(5).lons).toHaveLength(1);
    expect(gridLines(6)).toMatchObject({ lons: { length: 7 }, lats: { length: 15 } });
  });

  it('starts with the same photos every time, all on the map', () => {
    expect(initialPoints()).toEqual(points);
    expect(points).toHaveLength(150);
    expect(points.every((p) => within(p, MAP))).toBe(true);
    expect(new Set(points.map((p) => p.id)).size).toBe(points.length);
  });

  it('adds photos and crowds, up to the cap', () => {
    expect(addScattered(points)).toHaveLength(170);
    const crowded = addCrowd(points, 0);
    expect(crowded).toHaveLength(190);
    const added = crowded.slice(points.length);
    const close = added.filter((p) => haversineKm(p, CROWDS[0]!) < 0.6).length;
    expect(close / added.length).toBeGreaterThan(0.8);
    let many = points;
    for (let i = 0; i < 40; i++) many = addCrowd(many, i);
    expect(many.length).toBe(MAX_POINTS);
  });
});

describe('a nearby query on the geohash grid', () => {
  it('finds exactly the photos within the radius, at every precision and spot', () => {
    for (const spot of SPOT_ORDER) {
      const truth = bruteForce(points, SPOTS[spot].at).sort((a, b) => a - b);
      for (let p = 4; p <= 7; p++) {
        const run = runGeohash(points, SPOTS[spot].at, p);
        expect([...run.found].sort((a, b) => a - b)).toEqual(truth);
        expect(run.cells.filter((c) => c.own)).toHaveLength(1);
        expect(run.cells.find((c) => c.own)!.hash).toBe(run.centerHash);
      }
    }
  });

  it('challenge 1: four characters check every photo; seven check few but scan many cells', () => {
    const at = SPOTS.downtown.at;
    const four = runGeohash(points, at, 4);
    const six = runGeohash(points, at, 6);
    const seven = runGeohash(points, at, 7);
    expect(four.cells).toHaveLength(1);
    expect(four.checked).toHaveLength(points.length);
    expect(seven.cells.length).toBeGreaterThan(100);
    expect(seven.checked.length).toBeLessThan(six.checked.length);
    expect(six.checked.length).toBeLessThan(four.checked.length);
    expect(six.cells.length).toBeLessThan(seven.cells.length);
  });

  it('challenge 2: on a cell edge, many photos found live in a neighbor with a different prefix', () => {
    for (let p = 5; p <= 7; p++) {
      const run = runGeohash(points, SPOTS.edge.at, p);
      expect(run.cells.length).toBeGreaterThan(1);
      expect(run.foundInNeighbors.length).toBeGreaterThan(0);
      for (const id of run.foundInNeighbors) {
        const photo = points.find((q) => q.id === id)!;
        expect(encodeGeohash(photo.lat, photo.lon, p).startsWith(run.centerHash)).toBe(false);
      }
    }
    const five = runGeohash(points, SPOTS.edge.at, 5);
    expect(five.cells.map((c) => c.hash)).toEqual(['w21z6', 'w21z7']);
    expect(five.foundInNeighbors.length).toBeGreaterThan(five.found.length / 2);
  });
});

describe('the quadtree', () => {
  it('holds every photo in exactly one leaf, and splits full cells', () => {
    for (const capacity of CAPACITY_STEPS) {
      const tree = buildQuadtree(points, capacity);
      const all = leaves(tree);
      const ids = all.flatMap((l) => l.items).sort((a, b) => a - b);
      expect(ids).toEqual(points.map((p) => p.id).sort((a, b) => a - b));
      for (const leaf of all) {
        if (leaf.depth < MAX_DEPTH) expect(leaf.items.length).toBeLessThanOrEqual(capacity);
        for (const id of leaf.items) expect(within(points.find((p) => p.id === id)!, leaf.box)).toBe(true);
      }
    }
  });

  it('finds exactly the photos within the radius', () => {
    for (const spot of SPOT_ORDER) {
      const truth = bruteForce(points, SPOTS[spot].at).sort((a, b) => a - b);
      for (const capacity of CAPACITY_STEPS) {
        const run = runQuadtree(points, SPOTS[spot].at, capacity);
        expect([...run.found].sort((a, b) => a - b)).toEqual(truth);
        expect(run.scanned.length).toBeLessThan(run.leaves.length);
      }
    }
  });

  it('challenge 3: a crowd makes small cells under it while a quiet corner stays big', () => {
    for (let i = 0; i < CROWDS.length; i++) {
      let crowded = points;
      for (let k = 0; k <= i; k++) crowded = addCrowd(crowded, k);
      const run = runQuadtree(crowded, SPOTS.downtown.at, 4);
      const under = leafAt(run.tree, CROWDS[i]!);
      const quiet = leafAt(run.tree, SPOTS.quiet.at);
      expect(under.depth).toBeGreaterThanOrEqual(quiet.depth + 3);
      expect(boxSizeKm(under.box).widthKm).toBeLessThan(boxSizeKm(quiet.box).widthKm / 8);
    }
  });

  it('challenge 4: capacity 1 visits more cells than 16, and checks no more photos', () => {
    for (const spot of SPOT_ORDER) {
      const one = runQuadtree(points, SPOTS[spot].at, 1);
      const sixteen = runQuadtree(points, SPOTS[spot].at, 16);
      expect(one.scanned.length).toBeGreaterThan(sixteen.scanned.length);
      expect(one.checked.length).toBeLessThanOrEqual(sixteen.checked.length);
      expect(one.found.length).toBe(sixteen.found.length);
    }
    const edgeOne = runQuadtree(points, SPOTS.edge.at, 1);
    const edgeSixteen = runQuadtree(points, SPOTS.edge.at, 16);
    expect(edgeSixteen.checked.length - edgeOne.checked.length).toBeGreaterThanOrEqual(10);
  });
});
