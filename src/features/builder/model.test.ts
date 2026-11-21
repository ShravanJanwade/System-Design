import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '@/diagram/layout';
import {
  EMPTY_DESIGN,
  GRID_COLS,
  GRID_ROWS,
  connect,
  defaultLabel,
  describeDesign,
  displayLabel,
  moveNode,
  nodeAt,
  placeNode,
  removeNode,
  renameNode,
  reverseConnection,
  sanitizeDesign,
  toDiagramSpec,
  type BuilderDesign,
} from './model';

function build(): BuilderDesign {
  let d = EMPTY_DESIGN;
  d = placeNode(d, 'client', 0, 0).design;
  d = placeNode(d, 'service', 2, 1).design;
  d = placeNode(d, 'sqlDb', 3, 2).design;
  d = connect(d, 'n1', 'n2', 'sync');
  d = connect(d, 'n2', 'n3', 'sync');
  return d;
}

describe('placing components', () => {
  it('places a component on an empty cell with the type’s name and a fresh id', () => {
    const r = placeNode(EMPTY_DESIGN, 'loadBalancer', 1, 0);
    expect(r.id).toBe('n1');
    expect(r.design.nodes).toEqual([{ id: 'n1', type: 'loadBalancer', label: 'Load balancer', x: 1, y: 0 }]);
  });

  it('refuses a taken cell or a cell off the grid', () => {
    const d = build();
    expect(placeNode(d, 'cache', 0, 0)).toEqual({ design: d, id: null });
    expect(placeNode(d, 'cache', GRID_COLS, 0).id).toBeNull();
    expect(placeNode(d, 'cache', 0, GRID_ROWS).id).toBeNull();
    expect(placeNode(d, 'cache', -1, 0).id).toBeNull();
  });

  it('numbers repeated names so connections stay readable', () => {
    let d = placeNode(EMPTY_DESIGN, 'service', 0, 0).design;
    expect(defaultLabel(d, 'service')).toBe('App server 2');
    d = placeNode(d, 'service', 1, 0).design;
    expect(d.nodes.map((n) => n.label)).toEqual(['App server', 'App server 2']);
  });

  it('keeps ids unique after a deletion', () => {
    let d = build();
    d = removeNode(d, 'n2');
    const r = placeNode(d, 'cache', 5, 4);
    expect(r.id).toBe('n4');
  });
});

describe('editing', () => {
  it('moves a component to an empty cell only', () => {
    const d = build();
    expect(nodeAt(moveNode(d, 'n1', 5, 4), 5, 4)?.id).toBe('n1');
    expect(moveNode(d, 'n1', 2, 1)).toBe(d);
  });

  it('renames, capping the length, and shows the default name when blank', () => {
    const d = renameNode(build(), 'n3', 'Links   database');
    expect(d.nodes[2]!.label).toBe('Links database');
    expect(renameNode(d, 'n3', 'x'.repeat(80)).nodes[2]!.label).toHaveLength(32);
    const blank = renameNode(d, 'n3', '  ');
    expect(displayLabel(blank.nodes[2]!)).toBe('SQL database');
  });

  it('deletes a component with its connections', () => {
    const d = removeNode(build(), 'n2');
    expect(d.nodes.map((n) => n.id)).toEqual(['n1', 'n3']);
    expect(d.edges).toEqual([]);
  });
});

describe('connections', () => {
  it('connects two components and refuses a loop', () => {
    const d = build();
    expect(d.edges).toEqual([
      { id: 'e1', from: 'n1', to: 'n2', kind: 'sync' },
      { id: 'e2', from: 'n2', to: 'n3', kind: 'sync' },
    ]);
    expect(connect(d, 'n1', 'n1', 'sync')).toBe(d);
    expect(connect(d, 'n1', 'missing', 'sync')).toBe(d);
  });

  it('changes the kind instead of duplicating a connection', () => {
    const d = connect(build(), 'n1', 'n2', 'async');
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0]!.kind).toBe('async');
  });

  it('reverses a connection, merging with an existing opposite one', () => {
    const d = build();
    const flipped = reverseConnection(d, 'e1');
    expect(flipped.edges[0]).toMatchObject({ from: 'n2', to: 'n1' });
    const both = connect(d, 'n2', 'n1', 'async');
    expect(reverseConnection(both, 'e1').edges.map((e) => e.id)).toEqual(['e2', 'e3']);
  });
});

describe('toDiagramSpec', () => {
  it('is null for an empty canvas', () => {
    expect(toDiagramSpec(EMPTY_DESIGN)).toBeNull();
  });

  it('trims the grid to the cells in use and labels custom names with their type', () => {
    const d = renameNode(build(), 'n3', 'Postgres');
    const spec = toDiagramSpec(d)!;
    expect(spec.grid).toEqual({ cols: 4, rows: 3 });
    expect(spec.nodes.find((n) => n.id === 'n3')).toMatchObject({ label: 'Postgres', sublabel: 'SQL database', x: 3, y: 2 });
    expect(spec.nodes.find((n) => n.id === 'n2')).toMatchObject({ label: 'App server', sublabel: undefined });

    const shifted = toDiagramSpec(moveNode(moveNode(moveNode(d, 'n1', 2, 2), 'n2', 3, 3), 'n3', 4, 4))!;
    expect(shifted.grid).toEqual({ cols: 3, rows: 3 });
    expect(shifted.nodes.map((n) => [n.x, n.y])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it('lays out in all three modes of the shared diagram engine', () => {
    let d = build();
    d = placeNode(d, 'cache', 3, 0).design;
    d = placeNode(d, 'queue', 1, 3).design;
    d = connect(d, 'n2', 'n4', 'sync');
    d = connect(d, 'n2', 'n5', 'async');
    d = connect(d, 'n3', 'n4', 'replication');
    const spec = toDiagramSpec(d)!;
    for (const mode of ['wide', 'compact', 'narrow'] as const) {
      const layout = layoutDiagram(spec, mode);
      expect(Object.keys(layout.nodes)).toHaveLength(5);
      expect(Object.keys(layout.edges)).toHaveLength(5);
      expect(layout.width).toBeGreaterThan(0);
    }
  });
});

describe('sanitizeDesign', () => {
  it('keeps well-formed parts and drops the rest', () => {
    const raw = {
      nodes: [
        { id: 'n1', type: 'client', label: 'Phone', x: 0, y: 0 },
        { id: 'n2', type: 'teleporter', label: 'Nope', x: 1, y: 0 },
        { id: 'n3', type: 'cache', label: 'Same cell', x: 0, y: 0 },
        { id: 'n4', type: 'cache', x: 9, y: 0 },
        { id: 'n5', type: 'cache', x: 2, y: 1 },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n5', kind: 'sync' },
        { id: 'e2', from: 'n1', to: 'n2', kind: 'sync' },
        { id: 'e3', from: 'n1', to: 'n5', kind: 'async' },
        { id: 'e4', from: 'n5', to: 'n5', kind: 'sync' },
        { id: 'e5', from: 'n5', to: 'n1', kind: 'carrier pigeon' },
      ],
    };
    const d = sanitizeDesign(raw);
    expect(d.nodes.map((n) => n.id)).toEqual(['n1', 'n5']);
    expect(d.nodes[1]!.label).toBe('');
    expect(d.edges.map((e) => e.id)).toEqual(['e1']);
    expect(sanitizeDesign(null)).toEqual(EMPTY_DESIGN);
    expect(sanitizeDesign('junk')).toEqual(EMPTY_DESIGN);
  });
});

describe('describeDesign', () => {
  it('reads the design out in plain words', () => {
    expect(describeDesign(EMPTY_DESIGN)).toBe('An empty canvas.');
    expect(describeDesign(build())).toBe('3 components: Client, App server, SQL database. Client calls App server. App server calls SQL database.');
  });
});
