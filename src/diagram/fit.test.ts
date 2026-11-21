import { describe, expect, it } from 'vitest';
import type { DiagramSpec, SequenceSpec } from '@/content/types';
import { chooseLayout } from './fit';
import { layoutDiagram } from './layout';
import { PHONE_PANEL, phoneScale } from './phone';
import { sequenceFit } from './sequenceLayout';

const layouts = (spec: DiagramSpec) => ({ wide: layoutDiagram(spec, 'wide'), compact: layoutDiagram(spec, 'compact'), narrow: layoutDiagram(spec, 'narrow') });

/** A request path four stages long, with a cache and a database side by side at the end. */
const pipeline: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'client', type: 'client', label: 'Browser', x: 0, y: 1 },
    { id: 'lb', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 1 },
    { id: 'app', type: 'service', label: 'App server', x: 2, y: 1 },
    { id: 'cache', type: 'cache', label: 'Cache', x: 3, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', x: 3, y: 2 },
  ],
  edges: [
    { id: 'client-lb', from: 'client', to: 'lb', kind: 'sync' },
    { id: 'lb-app', from: 'lb', to: 'app', kind: 'sync' },
    { id: 'app-cache', from: 'app', to: 'cache', kind: 'sync' },
    { id: 'app-db', from: 'app', to: 'db', kind: 'sync' },
  ],
};

describe('chooseLayout', () => {
  it('keeps the wide layout on a roomy panel', () => {
    expect(chooseLayout(layouts(pipeline), 900).layout.mode).toBe('wide');
  });

  it('on a roomy panel too narrow for the wide layout, keeps the authored grid with compact cards', () => {
    const L = layouts(pipeline);
    const between = Math.floor(L.wide.width * 0.75);
    expect(between).toBeGreaterThanOrEqual(480);
    expect(chooseLayout(L, between).layout.mode).toBe('compact');
  });

  it('on a phone, picks the layout with the largest type', () => {
    const fit = chooseLayout(layouts(pipeline), PHONE_PANEL);
    expect(fit.layout.mode).toBe('narrow');
    expect(fit.scale).toBeGreaterThanOrEqual(0.85);
    expect(phoneScale(pipeline)).toBe(fit.scale);
  });

  it('narrow cards shrink to their text, but never below 80 px', () => {
    const narrow = layoutDiagram(pipeline, 'narrow');
    expect(narrow.nodes.cache!.w).toBe(80);
    expect(narrow.nodes.lb!.w).toBeLessThan(112);
  });
});

const actors = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, type: 'service' as const, label: `Service ${i + 1}` }));
const chat = (n: number): SequenceSpec => ({
  actors: actors(n),
  messages: actors(n)
    .slice(1)
    .map((a, i) => ({ from: `a${i}`, to: a.id, label: 'GET /feed', caption: 'A request.' })),
});

describe('sequenceFit', () => {
  it('uses columns when they read at 85% or more', () => {
    const two = sequenceFit(chat(2), PHONE_PANEL);
    expect(two.kind).toBe('columns');
    const three = sequenceFit(chat(3), PHONE_PANEL);
    expect(three.kind === 'columns' && three.scale).toBeGreaterThanOrEqual(0.85);
  });

  it('turns into a step list on a phone when five actors cannot fit', () => {
    expect(sequenceFit(chat(5), PHONE_PANEL).kind).toBe('list');
    expect(sequenceFit(chat(5), 700).kind).toBe('columns');
  });
});

describe('layout canvas', () => {
  it('grows to hold a route that runs around the outside of a narrow layout', () => {
    const spec: DiagramSpec = {
      grid: { cols: 3, rows: 1 },
      nodes: [
        { id: 'a', type: 'client', label: 'Phone', x: 0, y: 0 },
        { id: 'b', type: 'service', label: 'App server', x: 1, y: 0 },
        { id: 'c', type: 'sqlDb', label: 'Database', x: 2, y: 0 },
      ],
      edges: [
        { id: 'a-b', from: 'a', to: 'b', kind: 'sync' },
        { id: 'b-c', from: 'b', to: 'c', kind: 'sync' },
        { id: 'a-c', from: 'a', to: 'c', kind: 'async' },
      ],
      narrow: {
        grid: { cols: 1, rows: 3 },
        positions: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 }, c: { x: 0, y: 2 } },
        sides: { 'a-c': { fromSide: 'left', toSide: 'left' } },
      },
    };
    const layout = layoutDiagram(spec, 'narrow');
    for (const e of Object.values(layout.edges)) {
      for (const p of [...e.points, ...e.arrow]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(layout.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(layout.height);
      }
    }
  });
});
