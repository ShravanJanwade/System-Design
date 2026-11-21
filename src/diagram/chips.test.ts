import { describe, expect, it } from 'vitest';
import type { DiagramSpec } from '@/content/types';
import { lintChips, lintDiagram, placeChips, type PlacedChip } from './chips';
import { layoutDiagram } from './layout';
import { stepView } from './steps';

const twoCards = (notes: NonNullable<DiagramSpec['steps']>[number]['notes'], fail?: string[]): DiagramSpec => ({
  grid: { cols: 2, rows: 1 },
  nodes: [
    { id: 'apps', type: 'client', label: '900 apps', sublabel: 'retry at once', x: 0, y: 0 },
    { id: 'service', type: 'service', label: 'Profile service', sublabel: '500 requests/s', x: 1, y: 0 },
  ],
  edges: [{ id: 'apps-service', from: 'apps', to: 'service', kind: 'sync', label: 'requests' }],
  steps: [{ caption: 'One step.', notes, fail }],
});

describe('placeChips', () => {
  it('moves a long note on a short edge off both cards and the arrowhead, in every layout', () => {
    expect(lintDiagram(twoCards([{ target: 'apps-service', text: 'peak 868/s after the fix', tone: 'alert' }], ['service']))).toEqual([]);
  });

  it('keeps a node row clear of the arrow entering the card from above when cards stack', () => {
    const spec = twoCards([{ target: 'service', text: 'recovered 12 s after the fix', tone: 'signal' }]);
    const layout = layoutDiagram(spec, 'narrow');
    const view = stepView(spec, 0);
    const chips = placeChips(layout, view, []);
    expect(chips).toHaveLength(1);
    expect(lintChips(layout, chips, view.visible)).toEqual([]);
  });

  it('puts a "Down" tag on a failed card and keeps the card’s notes off it', () => {
    const spec = twoCards([{ target: 'service', text: 'never recovers', tone: 'alert' }], ['service']);
    for (const mode of ['wide', 'compact', 'narrow'] as const) {
      const layout = layoutDiagram(spec, mode);
      const view = stepView(spec, 0);
      const chips = placeChips(layout, view, []);
      expect(chips.map((c) => c.text).sort()).toEqual(['Down', 'never recovers']);
      expect(lintChips(layout, chips, view.visible)).toEqual([]);
    }
  });
});

describe('lintChips', () => {
  it('reports chips that overlap each other or run off the diagram', () => {
    const spec = twoCards(undefined);
    const layout = layoutDiagram(spec, 'wide');
    const chip = (x: number, text: string): PlacedChip => ({ kind: 'edge', owner: 'apps-service', text, tone: 'plain', x, y: 2, w: 60, h: 20 });
    const problems = lintChips(layout, [chip(layout.width - 40, 'one'), chip(layout.width - 50, 'two')], stepView(spec, 0).visible);
    expect(problems).toContain('chips "one" and "two" overlap');
    expect(problems).toContain('chip "one" runs off the diagram');
  });
});
