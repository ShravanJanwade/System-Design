import { describe, expect, it } from 'vitest';
import {
  ACCESS_MS,
  EDGES,
  ORIGIN,
  USER_CITIES,
  ballpark,
  biggestHitSaving,
  buildScene,
  cdnRoute,
  compareRoutes,
  crossesMapEdge,
  describeScene,
  directRoute,
  getCity,
  haversineKm,
  lonOffset,
  nearestEdge,
  placeLabels,
  project,
  roundTripMs,
  routeGeometry,
  type Box,
} from './logic';

const LONDON = { lat: 51.5074, lon: -0.1278 };
const NEW_YORK = { lat: 40.7128, lon: -74.006 };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('haversineKm', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(LONDON, LONDON)).toBe(0);
    expect(haversineKm(LONDON, NEW_YORK)).toBeCloseTo(haversineKm(NEW_YORK, LONDON), 6);
  });

  it('matches known great-circle distances', () => {
    // London to New York is about 5,570 km.
    expect(haversineKm(LONDON, NEW_YORK)).toBeGreaterThan(5520);
    expect(haversineKm(LONDON, NEW_YORK)).toBeLessThan(5620);
    // Half the Earth's circumference between antipodes.
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371, 0);
    // Singapore to Oregon, Maya's trip in lesson 1.1: about 13,000 km.
    expect(haversineKm(getCity('singapore'), ORIGIN)).toBeGreaterThan(12800);
    expect(haversineKm(getCity('singapore'), ORIGIN)).toBeLessThan(13300);
  });
});

describe('roundTripMs', () => {
  it('is twice the distance at fiber speed, stretched by the route factor, plus the user’s own connection', () => {
    expect(roundTripMs(0)).toBe(ACCESS_MS);
    expect(roundTripMs(1000)).toBeCloseTo(2 * 1000 * 1.5 / 200 + ACCESS_MS, 6);
    expect(roundTripMs(1000, false)).toBeCloseTo(15, 6);
  });

  it('grows with distance', () => {
    for (let km = 0; km < 20000; km += 500) expect(roundTripMs(km + 500)).toBeGreaterThan(roundTripMs(km));
  });

  it('puts Singapore to Oregon at about 200 ms, ballpark', () => {
    const ms = directRoute(getCity('singapore')).roundTripMs;
    expect(ms).toBeGreaterThan(180);
    expect(ms).toBeLessThan(230);
  });
});

describe('ballpark', () => {
  it('keeps small times whole and rounds the rest to 5 ms', () => {
    expect(ballpark(10)).toBe(10);
    expect(ballpark(18.4)).toBe(18);
    expect(ballpark(23.6)).toBe(25);
    expect(ballpark(206.4)).toBe(205);
    expect(ballpark(0.2)).toBe(1);
  });
});

describe('nearestEdge', () => {
  it('sends each city to the edge you would expect', () => {
    const expected: Record<string, string> = {
      singapore: 'singapore',
      jakarta: 'singapore',
      seoul: 'tokyo',
      auckland: 'sydney',
      delhi: 'mumbai',
      nairobi: 'johannesburg',
      london: 'frankfurt',
      'buenos-aires': 'sao-paulo',
      chicago: 'new-york',
      'san-francisco': 'los-angeles',
    };
    for (const c of USER_CITIES) expect(nearestEdge(c).edge.id).toBe(expected[c.id]);
  });

  it('always finds an edge closer than the origin', () => {
    for (const c of USER_CITIES) expect(nearestEdge(c).km).toBeLessThan(haversineKm(c, ORIGIN));
  });

  it('returns the edge itself for a user in an edge city', () => {
    expect(nearestEdge(getCity('singapore')).km).toBeLessThan(1);
  });
});

describe('routes', () => {
  it('a hit at the edge is faster than going to Oregon for every city', () => {
    for (const c of USER_CITIES) expect(cdnRoute(c, 'hit').roundTripMs).toBeLessThan(directRoute(c).roundTripMs);
  });

  it('a miss is never faster than going straight to Oregon (the edge is a detour)', () => {
    for (const c of USER_CITIES) expect(cdnRoute(c, 'miss').roundTripMs).toBeGreaterThanOrEqual(directRoute(c).roundTripMs - 1e-9);
  });

  it('a miss pays for both legs, and the edge-to-origin leg skips the user’s access time', () => {
    const c = getCity('london');
    const miss = cdnRoute(c, 'miss');
    expect(miss.legs.map((l) => l.to.id)).toEqual(['frankfurt', 'oregon']);
    expect(miss.roundTripMs).toBeCloseTo(roundTripMs(haversineKm(c, miss.legs[0]!.to)) + roundTripMs(haversineKm(miss.legs[0]!.to, ORIGIN), false), 6);
  });

  it('a first visit costs three round trips, and on a miss only the request goes on to Oregon', () => {
    const c = getCity('delhi');
    const direct = directRoute(c);
    const hit = cdnRoute(c, 'hit');
    const miss = cdnRoute(c, 'miss');
    expect(direct.firstVisitMs).toBeCloseTo(3 * direct.roundTripMs, 6);
    expect(hit.firstVisitMs).toBeCloseTo(3 * hit.roundTripMs, 6);
    expect(miss.firstVisitMs).toBeCloseTo(3 * miss.legs[0]!.ms + miss.legs[1]!.ms, 6);
    // For users far from Oregon, nearby handshakes make even a miss faster on a first visit.
    for (const city of USER_CITIES.filter((x) => haversineKm(x, ORIGIN) > 5000)) {
      expect(cdnRoute(city, 'miss').firstVisitMs).toBeLessThan(directRoute(city).firstVisitMs);
    }
  });
});

describe('what the challenges claim', () => {
  it('Maya in Singapore: a hit is about 20 times faster than Oregon', () => {
    const c = compareRoutes(getCity('singapore'), 'hit');
    expect(c.cdn.roundTripMs).toBeCloseTo(ACCESS_MS, 6);
    expect(c.direct.roundTripMs / c.cdn.roundTripMs).toBeGreaterThan(15);
    expect(c.direct.roundTripMs / c.cdn.roundTripMs).toBeLessThan(25);
  });

  it('Singapore gains the most from a hit', () => {
    expect(biggestHitSaving().user.id).toBe('singapore');
  });

  it('only San Francisco, next door to Oregon, saves less than 10 ms', () => {
    const small = USER_CITIES.filter((c) => compareRoutes(c, 'hit').savedMs < 10).map((c) => c.id);
    expect(small).toEqual(['san-francisco']);
  });

  it('Nairobi is served from Johannesburg, which beats Oregon on a hit and loses badly on a miss', () => {
    const hit = compareRoutes(getCity('nairobi'), 'hit');
    const miss = compareRoutes(getCity('nairobi'), 'miss');
    expect(hit.edge.id).toBe('johannesburg');
    expect(hit.edgeKm).toBeGreaterThan(2500);
    expect(hit.cdn.roundTripMs).toBeLessThan(hit.direct.roundTripMs / 3);
    expect(miss.cdn.roundTripMs - miss.direct.roundTripMs).toBeGreaterThan(50);
  });
});

describe('map', () => {
  it('keeps every place inside the map', () => {
    for (const p of [ORIGIN, ...EDGES, ...USER_CITIES]) {
      const { x, y } = project(p, 900, 325);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(900);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(325);
    }
  });

  it('puts Oregon near the middle, with Asia to its left and Europe to its right', () => {
    const w = 360;
    expect(project(ORIGIN, w, 130).x).toBeGreaterThan(150);
    expect(project(ORIGIN, w, 130).x).toBeLessThan(210);
    expect(project(getCity('singapore'), w, 130).x).toBeLessThan(project(ORIGIN, w, 130).x);
    expect(project(getCity('london'), w, 130).x).toBeGreaterThan(project(ORIGIN, w, 130).x);
  });

  it('draws every leg the short way round, without wrapping off the edge of the map', () => {
    const legs = USER_CITIES.flatMap((c) => [...cdnRoute(c, 'miss').legs, ...directRoute(c).legs]);
    for (const l of legs) {
      expect(crossesMapEdge(l.from, l.to)).toBe(false);
      // The straight line on the map spans the shorter of the two longitude gaps.
      const gap = Math.abs(lonOffset(l.from.lon) - lonOffset(l.to.lon));
      const raw = Math.abs(l.from.lon - l.to.lon) % 360;
      expect(gap).toBeCloseTo(Math.min(raw, 360 - raw), 6);
    }
  });

  it('keeps the drawn arcs inside the map', () => {
    for (const c of USER_CITIES) {
      for (const route of [directRoute(c), cdnRoute(c, 'miss')]) {
        for (const p of routeGeometry(route, 900, 325).outbound) {
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(325);
        }
      }
    }
  });
});

describe('labels', () => {
  it('place the user, edge and origin labels without overlaps at phone and desktop widths', () => {
    for (const width of [320, 480, 720, 900]) {
      for (const c of USER_CITIES) {
        for (const cdn of [false, true]) {
          for (const cache of ['hit', 'miss'] as const) {
            const scene = buildScene(c.id, cdn, cache, width);
            const boxes = scene.labels.map((l) => l.box);
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
              const b = boxes[i]!;
              expect(b.x).toBeGreaterThanOrEqual(0);
              expect(b.y).toBeGreaterThanOrEqual(0);
              expect(b.x + b.w).toBeLessThanOrEqual(scene.width);
              expect(b.y + b.h).toBeLessThanOrEqual(scene.height);
            }
            // The user and the origin are always labeled; so is the edge when the CDN is on.
            const ids = scene.labels.map((l) => l.id);
            expect(ids).toContain('user');
            expect(ids).toContain('origin');
            if (cdn) expect(ids).toContain('edge');
          }
        }
      }
    }
  });

  it('drops an optional label rather than drawing it over another', () => {
    const blocker: Box = { x: 0, y: 0, w: 200, h: 200 };
    const out = placeLabels([{ id: 'x', anchor: { x: 100, y: 100 }, w: 40, h: 16, optional: true }], [blocker], { w: 200, h: 200 });
    expect(out.x).toBeNull();
  });
});

describe('describeScene', () => {
  it('names the city, the edge and both times', () => {
    const c = compareRoutes(getCity('jakarta'), 'hit');
    const text = describeScene(c, true, 'hit');
    expect(text).toContain('Jakarta');
    expect(text).toContain('Singapore');
    expect(text).toContain(`${ballpark(c.cdn.roundTripMs)} ms`);
    expect(text).toContain(`${ballpark(c.direct.roundTripMs)} ms`);
  });
});
