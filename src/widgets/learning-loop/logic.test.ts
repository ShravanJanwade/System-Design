import { describe, expect, it } from 'vitest';
import { STATIONS, arrowFraction, loopGeometry, nextIndex, pointOnLoop, prevIndex, type CardBox } from './logic';

const WIDTHS = [343, 420, 640, 768, 960];

function inside(p: { x: number; y: number }, c: CardBox): boolean {
  return p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h;
}

describe('stations', () => {
  it('runs learn, try, recall, apply in that order', () => {
    expect(STATIONS.map((s) => s.id)).toEqual(['learn', 'try', 'recall', 'apply']);
  });

  it('says what serves each step, why it matters and how to use it', () => {
    for (const s of STATIONS) {
      expect(s.serves.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(40);
      expect(s.tip.length).toBeGreaterThan(20);
    }
  });

  it('closes the loop: after apply comes learn, and before learn comes apply', () => {
    expect(nextIndex(3)).toBe(0);
    expect(prevIndex(0)).toBe(3);
    expect([0, 1, 2, 3].map((i) => nextIndex(i))).toEqual([1, 2, 3, 0]);
  });
});

describe('loopGeometry', () => {
  it('keeps every card inside the panel, with room between neighbors for an arrow', () => {
    for (const w of WIDTHS) {
      const g = loopGeometry(w);
      for (const c of g.cards) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(w);
        expect(c.y + c.h).toBeLessThanOrEqual(g.height);
      }
      const [a, b, c, d] = g.cards as [CardBox, CardBox, CardBox, CardBox];
      expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(40);
      expect(d.y - (a.y + a.h)).toBeGreaterThanOrEqual(40);
      expect(c.y).toBe(d.y);
      expect(b.x).toBe(c.x);
    }
  });

  it('places the stations clockwise: right, then down, then left, then up', () => {
    const [a, b, c, d] = loopGeometry(640).cards as [CardBox, CardBox, CardBox, CardBox];
    expect(b.cx).toBeGreaterThan(a.cx);
    expect(c.cy).toBeGreaterThan(b.cy);
    expect(d.cx).toBeLessThan(c.cx);
    expect(a.cy).toBeLessThan(d.cy);
  });

  it('puts each arrow in a gap, pointing along the loop', () => {
    for (const w of WIDTHS) {
      const g = loopGeometry(w);
      expect(g.arrows.map((a) => a.angle)).toEqual([0, 90, 180, 270]);
      for (const arrow of g.arrows) for (const c of g.cards) expect(inside(arrow, c)).toBe(false);
    }
  });

  it('measures the loop as the perimeter through the card centers', () => {
    const g = loopGeometry(768);
    const [a, b, c] = g.cards as [CardBox, CardBox, CardBox];
    expect(g.length).toBeCloseTo(2 * (b.cx - a.cx) + 2 * (c.cy - b.cy));
  });
});

describe('pointOnLoop', () => {
  const g = loopGeometry(640);
  const [a, b, c, d] = g.cards as [CardBox, CardBox, CardBox, CardBox];
  const dx = b.cx - a.cx;
  const dy = c.cy - b.cy;

  it('starts at the first station and reaches each next station in turn', () => {
    expect(pointOnLoop(g, 0)).toEqual({ x: a.cx, y: a.cy });
    const at = (dist: number) => pointOnLoop(g, dist / g.length);
    expect(at(dx).x).toBeCloseTo(b.cx);
    expect(at(dx + dy).y).toBeCloseTo(c.cy);
    expect(at(2 * dx + dy).x).toBeCloseTo(d.cx);
  });

  it('wraps around after a full lap', () => {
    const p = pointOnLoop(g, 1.25);
    const q = pointOnLoop(g, 0.25);
    expect(p.x).toBeCloseTo(q.x);
    expect(p.y).toBeCloseTo(q.y);
  });

  it('always stays on the rectangle through the card centers', () => {
    for (let i = 0; i < 100; i++) {
      const p = pointOnLoop(g, i / 100);
      const onTop = Math.abs(p.y - a.cy) < 1e-6;
      const onBottom = Math.abs(p.y - c.cy) < 1e-6;
      const onLeft = Math.abs(p.x - a.cx) < 1e-6;
      const onRight = Math.abs(p.x - b.cx) < 1e-6;
      expect(onTop || onBottom || onLeft || onRight).toBe(true);
    }
  });

  it('parks the reduced-motion dot on the arrow that leaves each station', () => {
    for (let i = 0; i < 4; i++) {
      const p = pointOnLoop(g, arrowFraction(g, i));
      expect(p.x).toBeCloseTo(g.arrows[i]!.x);
      expect(p.y).toBeCloseTo(g.arrows[i]!.y);
    }
  });
});
