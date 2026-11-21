import { describe, expect, it } from 'vitest';
import type { DiagramSpec } from '@/content/types';
import { layoutDiagram, lintLayout, orthogonalRoute, roundedPath, pointAt, simplify } from './layout';
import { measureText, wrapText } from './text';

const pipeline: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'client', type: 'client', label: 'Browser', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 1, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 2, y: 2 },
  ],
  edges: [
    { id: 'e1', from: 'client', to: 'app', kind: 'sync', label: 'HTTPS' },
    { id: 'e2', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'e3', from: 'app', to: 'db', kind: 'sync' },
  ],
};

describe('text measurement', () => {
  it('measures wider text as wider', () => {
    expect(measureText('Load balancer', 14, 'semibold')).toBeGreaterThan(measureText('Cache', 14, 'semibold'));
  });

  it('wraps long labels into lines that fit', () => {
    const lines = wrapText('Authoritative name server', 80, 14, 'semibold');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.filter((l) => l.includes(' '))) {
      expect(measureText(line, 14, 'semibold')).toBeLessThanOrEqual(80);
    }
  });
});

describe('orthogonalRoute', () => {
  it('draws a straight line between aligned facing sides', () => {
    expect(orthogonalRoute({ x: 0, y: 10 }, 'right', { x: 100, y: 10 }, 'left', 0)).toHaveLength(2);
  });

  it('draws a Z between offset facing sides', () => {
    const pts = orthogonalRoute({ x: 0, y: 0 }, 'right', { x: 100, y: 80 }, 'left', 0);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 80 },
    ]);
  });

  it('draws an L when leaving sideways and arriving from the top', () => {
    const pts = orthogonalRoute({ x: 0, y: 0 }, 'right', { x: 100, y: 80 }, 'top', 0);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ]);
  });

  it('every segment is horizontal or vertical', () => {
    const cases = [
      orthogonalRoute({ x: 0, y: 0 }, 'bottom', { x: 120, y: 200 }, 'top', 0),
      orthogonalRoute({ x: 0, y: 0 }, 'top', { x: 120, y: -30 }, 'top', 0),
      orthogonalRoute({ x: 200, y: 0 }, 'right', { x: 0, y: 90 }, 'left', 0),
      orthogonalRoute({ x: 0, y: 0 }, 'bottom', { x: -90, y: 100 }, 'right', 0),
    ];
    for (const pts of cases) {
      const s = simplify(pts);
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1]!;
        const b = s[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });
});

describe('roundedPath', () => {
  it('measures a straight path exactly and finds points along it', () => {
    const { length, samples } = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 8);
    expect(length).toBeCloseTo(100);
    expect(pointAt(samples, 25)).toEqual({ x: 25, y: 0 });
  });

  it('rounds corners, so the path is a little shorter than the polyline', () => {
    const { length } = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 8);
    expect(length).toBeLessThan(200);
    expect(length).toBeGreaterThan(195);
  });
});

describe('layoutDiagram', () => {
  it('places every node and routes every edge', () => {
    const layout = layoutDiagram(pipeline, 'wide');
    expect(Object.keys(layout.nodes)).toHaveLength(4);
    expect(Object.keys(layout.edges)).toHaveLength(3);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('keeps cards in a column centered on the same x', () => {
    const layout = layoutDiagram(pipeline, 'wide');
    expect(layout.nodes.cache!.cx).toBe(layout.nodes.db!.cx);
  });

  it('draws a straight edge between cards in the same row', () => {
    const layout = layoutDiagram(pipeline, 'wide');
    expect(layout.edges.e1!.points).toHaveLength(2);
  });

  it('widens a gap to fit an edge label', () => {
    const labelled = layoutDiagram(pipeline, 'wide');
    const plain = layoutDiagram({ ...pipeline, edges: pipeline.edges.map((e) => ({ ...e, label: undefined })) }, 'wide');
    const gap = (l: typeof labelled) => l.nodes.app!.x - (l.nodes.client!.x + l.nodes.client!.w);
    expect(gap(labelled)).toBeGreaterThanOrEqual(gap(plain));
    const chip = labelled.edges.e1!.labelBox!;
    expect(chip.x).toBeGreaterThan(labelled.nodes.client!.x + labelled.nodes.client!.w);
    expect(chip.x + chip.w).toBeLessThan(labelled.nodes.app!.x);
  });

  it('spreads two edges leaving the same side onto different ports', () => {
    const layout = layoutDiagram(pipeline, 'wide');
    expect(layout.edges.e2!.points[0]!.y).not.toBe(layout.edges.e3!.points[0]!.y);
  });

  it('passes the layout lint in every mode', () => {
    for (const mode of ['wide', 'compact', 'narrow'] as const) {
      expect(lintLayout(layoutDiagram(pipeline, mode))).toEqual([]);
    }
  });

  it('transposes the grid for the narrow layout', () => {
    const wide = layoutDiagram(pipeline, 'wide');
    const narrow = layoutDiagram(pipeline, 'narrow');
    expect(narrow.nodes.client!.cy).toBeLessThan(narrow.nodes.app!.cy);
    expect(wide.nodes.client!.cx).toBeLessThan(wide.nodes.app!.cx);
  });

  it('uses an explicit narrow layout when one is given', () => {
    const spec: DiagramSpec = {
      ...pipeline,
      narrow: {
        grid: { cols: 2, rows: 3 },
        positions: { client: { x: 0, y: 0 }, app: { x: 0, y: 1 }, cache: { x: 1, y: 2 }, db: { x: 0, y: 2 } },
      },
    };
    const narrow = layoutDiagram(spec, 'narrow');
    expect(narrow.nodes.db!.cx).toBe(narrow.nodes.app!.cx);
  });

  const blocked: DiagramSpec = {
    grid: { cols: 3, rows: 1 },
    nodes: [
      { id: 'a', type: 'client', label: 'A', x: 0, y: 0 },
      { id: 'b', type: 'service', label: 'B', x: 1, y: 0 },
      { id: 'c', type: 'sqlDb', label: 'C', x: 2, y: 0 },
    ],
    edges: [{ id: 'ac', from: 'a', to: 'c', kind: 'sync', fromSide: 'right', toSide: 'left' }],
  };

  it('lint reports an edge forced through a card', () => {
    expect(lintLayout(layoutDiagram(blocked, 'wide')).join(' ')).toContain('passes through node "b"');
  });

  it('auto-routing goes around a card in the way', () => {
    const free = { ...blocked, edges: [{ id: 'ac', from: 'a', to: 'c', kind: 'sync' as const }] };
    expect(lintLayout(layoutDiagram(free, 'wide'))).toEqual([]);
  });
});
